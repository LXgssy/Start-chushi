/* ============================================================================
 * ChuShi Music Hub 8.0.2 —— 纯 winsock HTTP 中继（v8 全新实现）
 *
 * v8 架构律（本代宪法）：
 *   1. 零 WinRT / 零 COM / 零 SMTC——系统媒体卡片完全由 InfLink-rs（第三方
 *      Rust 插件）持有；本 DLL 与 WinRT 永久绝缘（构建门断言导入表无
 *      combase/ole32/winrt，仅 ws2_32 + kernel32 等系统基础库）。v7.0.x 四代
 *      崩溃的根因（RoInitialize/TimelineProperties ABI/COM 委托/raise 路径）
 *      在本载体上结构性不存在。
 *   2. 职责唯一——本 DLL 只做一件事：把网易云渲染进程（音乐桥 JS）与
 *      「初始」页面（浏览器/扩展）连起来。四个端点，状态最新者胜。
 *        GET  /api/ping       身份（name=chushi-music-hub）
 *        GET/POST /api/state  播放真值快照（桥 1Hz 推，页面 1Hz 拉）
 *        GET/POST /api/cmd    页面→桥 控制命令队列（POST 入队带 _id，GET 排空）
 *        GET/POST /api/lyric  歌词缓存（歌词源插件产物经桥中继）
 *   3. 零阻塞——BetterNCMPluginMain 内只做选举 + CreateThread 后立即返回，
 *      绝无任何等待/忙等（宿主加载律）。
 *   4. 进程纪律——仅 Main 进程（ptype=0x1）当枢纽宿主（命名互斥体选举，
 *      持锁至进程退出）；Renderer/GPU/Utility 全静默。
 *   5. 诚实落盘——hub-log.txt 记录 boot/elect/listen/自愈全链，超 1.5MB 重建；
 *      接受循环整体 SEH，异常自愈（关套接字→重建→继续监听）。
 *   6. 双架构律——主架 hub.dll 必须 x86（用户主流网易云 2.x 为 32 位进程，
 *      x64 DLL 塞入 32 位进程 = ERROR_BAD_EXE_FORMAT，BetterNCM 报
 *      "dll doesn't exists or is not adapted to this arch"）；x64 变体
 *      命名必须是 hub.dll.x64.dll（BetterNCM v2 加载序列：先试 manifest
 *      native_plugin，失败后追加 ".x64.dll" 后缀重试，与 InfLink-rs
 *      backend.dll/backend.dll.x64.dll 同约定）。
 * ==========================================================================*/
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PLUGIN_VERSION "8.0.3"
#define HUB_NAME_S "chushi-music-hub"
#define HUB_MUTEX_NAMEW L"ChuShi-Music-Hub-8-Singleton"

#define PORT_PRIMARY 26901
#define PORT_B 26902
#define PORT_C 26903

#define REQ_MAX (256 * 1024)      /* 请求头+体上限 */
#define STATE_MAX (1024 * 1024)   /* /api/state 体上限 */
#define LYRIC_MAX (1024 * 1024)   /* /api/lyric 体上限 */
#define CMD_QUEUE_MAX 32          /* 命令队列深度（满则丢最旧） */
#define CMD_MAX (8 * 1024)        /* 单条命令上限 */

#define LOG_MAX (1536 * 1024)     /* 日志重建阈值 */

/* ------------------------------------------------------------------ */
/* 日志（DLL 同目录 hub-log.txt）                                        */
/* ------------------------------------------------------------------ */
static HANDLE g_logMutex = NULL;
static volatile LONG g_logSize = 0;

static void hub_logRotate(const wchar_t* logPath) {
    /* 超 LOG_MAX 时重建（先删旧） */
    WIN32_FILE_ATTRIBUTE_DATA fa;
    if (!GetFileAttributesExW(logPath, GetFileExInfoStandard, &fa)) return;
    LONGLONG sz = ((LONGLONG)fa.nFileSizeHigh << 32) | fa.nFileSizeLow;
    if (sz > LOG_MAX) DeleteFileW(logPath);
}

static void logf_line(const char* fmt, ...) {
    HMODULE hSelf = NULL;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                            GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                            (LPCWSTR)&logf_line, &hSelf)) return;
    wchar_t dllPath[MAX_PATH + 2] = {0};
    if (!GetModuleFileNameW(hSelf, dllPath, MAX_PATH)) return;
    wchar_t* slash = wcsrchr(dllPath, L'\\');
    if (!slash) return;
    *slash = 0;
    wchar_t logPath[MAX_PATH + 24];
    _snwprintf(logPath, ARRAYSIZE(logPath), L"%s\\hub-log.txt", dllPath);
    logPath[ARRAYSIZE(logPath) - 1] = 0;

    char line[1024];
    SYSTEMTIME st;
    GetLocalTime(&st);
    int n = _snprintf(line, sizeof(line) - 2,
        "[%04u-%02u-%02u %02u:%02u:%02u.%03u] ",
        st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond,
        st.wMilliseconds);
    if (n < 0) n = 0;
    va_list args;
    va_start(args, fmt);
    int m = _vsnprintf(line + n, sizeof(line) - n - 2, fmt, args);
    va_end(args);
    if (m < 0) m = 0;
    n += m;
    if (n > (int)sizeof(line) - 2) n = (int)sizeof(line) - 2;
    line[n++] = '\n';
    line[n] = 0;

    WaitForSingleObject(g_logMutex, 200);
    hub_logRotate(logPath);
    HANDLE f = CreateFileW(logPath, FILE_APPEND_DATA, FILE_SHARE_READ, NULL,
                           OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f != INVALID_HANDLE_VALUE) {
        DWORD written = 0;
        WriteFile(f, line, (DWORD)n, &written, NULL);
        g_logSize += (LONG)n;
        CloseHandle(f);
    }
    ReleaseMutex(g_logMutex);
}

/* ------------------------------------------------------------------ */
/* 共享数据（互斥体保护；页面/桥两端的中继仓库）                           */
/* ------------------------------------------------------------------ */
static HANDLE g_dataMutex = NULL;

static char  g_state[STATE_MAX + 1];
static DWORD g_stateLen = 0;

static char  g_lyric[LYRIC_MAX + 1];
static DWORD g_lyricLen = 0;

typedef struct {
    char  body[CMD_MAX];
    DWORD len;
    DWORD id;
} CmdItem;

static CmdItem g_cmdQueue[CMD_QUEUE_MAX];
static int     g_cmdHead = 0;   /* 队首（下一个出队） */
static int     g_cmdCount = 0;  /* 队列长度 */
static DWORD   g_cmdNextId = 1;

static void dataStoreState(const char* body, DWORD len) {
    if (!body || len == 0) return;
    if (len > STATE_MAX) len = STATE_MAX;
    WaitForSingleObject(g_dataMutex, 1000);
    memcpy(g_state, body, len);
    g_state[len] = 0;
    g_stateLen = len;
    ReleaseMutex(g_dataMutex);
}

static DWORD dataReadState(char* out, DWORD cap) {
    DWORD n = 0;
    WaitForSingleObject(g_dataMutex, 1000);
    if (g_stateLen > 0 && g_stateLen <= cap) {
        memcpy(out, g_state, g_stateLen);
        n = g_stateLen;
    }
    ReleaseMutex(g_dataMutex);
    return n;
}

static void dataStoreLyric(const char* body, DWORD len) {
    if (!body || len == 0) return;
    if (len > LYRIC_MAX) len = LYRIC_MAX;
    WaitForSingleObject(g_dataMutex, 1000);
    memcpy(g_lyric, body, len);
    g_lyric[len] = 0;
    g_lyricLen = len;
    ReleaseMutex(g_dataMutex);
}

static DWORD dataReadLyric(char* out, DWORD cap) {
    DWORD n = 0;
    WaitForSingleObject(g_dataMutex, 1000);
    if (g_lyricLen > 0 && g_lyricLen <= cap) {
        memcpy(out, g_lyric, g_lyricLen);
        n = g_lyricLen;
    }
    ReleaseMutex(g_dataMutex);
    return n;
}

static void dataEnqueueCmd(const char* body, DWORD len) {
    if (!body || len == 0) return;
    if (len > CMD_MAX) len = CMD_MAX;
    WaitForSingleObject(g_dataMutex, 1000);
    if (g_cmdCount >= CMD_QUEUE_MAX) {
        /* 满则丢最旧 */
        g_cmdHead = (g_cmdHead + 1) % CMD_QUEUE_MAX;
        g_cmdCount--;
    }
    int slot = (g_cmdHead + g_cmdCount) % CMD_QUEUE_MAX;
    memcpy(g_cmdQueue[slot].body, body, len);
    g_cmdQueue[slot].body[len] = 0;
    g_cmdQueue[slot].len = len;
    g_cmdQueue[slot].id = g_cmdNextId++;
    g_cmdCount++;
    ReleaseMutex(g_dataMutex);
}

/* 排空：拼成 JSON 数组（每项 {"_id":N,"raw":<原体>}） */
static DWORD dataDrainCmds(char* out, DWORD cap) {
    DWORD used = 0;
    out[0] = '[';
    used = 1;
    WaitForSingleObject(g_dataMutex, 1000);
    int drained = g_cmdCount;
    for (int i = 0; i < drained; i++) {
        int idx = (g_cmdHead + i) % CMD_QUEUE_MAX;
        /* {"_id":4294967295,"raw": } */
        char head[40];
        int hn = _snprintf(head, sizeof(head), "%s{\"_id\":%lu,\"raw\":",
                           i ? "," : "", (unsigned long)g_cmdQueue[idx].id);
        if (hn < 0) hn = 0;
        DWORD need = (DWORD)hn + g_cmdQueue[idx].len + 1;
        if (used + need + 1 > cap) { drained = i; break; } /* 容量守卫 */
        memcpy(out + used, head, (DWORD)hn);
        used += (DWORD)hn;
        memcpy(out + used, g_cmdQueue[idx].body, g_cmdQueue[idx].len);
        used += g_cmdQueue[idx].len;
    }
    g_cmdHead = (g_cmdHead + drained) % CMD_QUEUE_MAX;
    g_cmdCount -= drained;
    ReleaseMutex(g_dataMutex);
    out[used++] = ']';
    out[used] = 0;
    return used;
}

/* ------------------------------------------------------------------ */
/* HTTP 响应小工具                                                       */
/* ------------------------------------------------------------------ */
static const char* CORS_HEADERS =
    "Access-Control-Allow-Origin: *\r\n"
    "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
    "Access-Control-Allow-Headers: Content-Type\r\n"
    "Access-Control-Allow-Private-Network: true\r\n"
    "Access-Control-Max-Age: 86400\r\n";

static void sendAll(SOCKET s, const char* buf, int len) {
    int off = 0;
    while (off < len) {
        int n = send(s, buf + off, len - off, 0);
        if (n <= 0) return;
        off += n;
    }
}

static void respondJson(SOCKET s, int code, const char* body, DWORD bodyLen) {
    char head[512];
    const char* codeText = (code == 200) ? "200 OK"
                         : (code == 204) ? "204 No Content"
                         : (code == 404) ? "404 Not Found" : "400 Bad Request";
    int hn = _snprintf(head, sizeof(head),
        "HTTP/1.1 %s\r\n"
        "Content-Type: application/json; charset=utf-8\r\n"
        "Content-Length: %lu\r\n"
        "Connection: close\r\n"
        "%s"
        "\r\n",
        codeText, (unsigned long)bodyLen, CORS_HEADERS);
    if (hn < 0) return;
    sendAll(s, head, hn);
    if (bodyLen > 0 && code != 204) sendAll(s, body, (int)bodyLen);
}

static void respondPreflight(SOCKET s) {
    char head[512];
    int hn = _snprintf(head, sizeof(head),
        "HTTP/1.1 204 No Content\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "Access-Control-Allow-Private-Network: true\r\n"
        "Access-Control-Max-Age: 86400\r\n"
        "Connection: close\r\n"
        "\r\n");
    if (hn < 0) return;
    sendAll(s, head, hn);
}

/* ------------------------------------------------------------------ */
/* 请求处理                                                              */
/* ------------------------------------------------------------------ */
static void handleRequest(SOCKET s, const char* req, DWORD reqLen) {
    /* 请求行：METHOD SP PATH SP HTTP/1.x */
    char method[8] = {0};
    char path[256] = {0};
    if (sscanf(req, "%7s %255s", method, path) != 2) return;

    /* 体定位（Content-Length 头后置体已由读取阶段拼接） */
    const char* body = strstr(req, "\r\n\r\n");
    DWORD bodyLen = 0;
    if (body) {
        body += 4;
        bodyLen = reqLen - (DWORD)(body - req);
    }

    logf_line("[http] %s %s (%lu)", method, path, (unsigned long)bodyLen);

    if (_stricmp(method, "OPTIONS") == 0) {
        respondPreflight(s);
        return;
    }

    if (_stricmp(method, "GET") == 0 && strncmp(path, "/api/ping", 9) == 0) {
        char body2[160];
        int n = _snprintf(body2, sizeof(body2),
            "{\"ok\":true,\"name\":\"%s\",\"version\":\"%s\",\"host\":true}",
            HUB_NAME_S, PLUGIN_VERSION);
        if (n < 0) n = 0;
        respondJson(s, 200, body2, (DWORD)n);
        return;
    }

    if (_stricmp(method, "GET") == 0 && strncmp(path, "/api/state", 10) == 0) {
        static char out[STATE_MAX + 2];
        DWORD n = dataReadState(out, STATE_MAX);
        if (n == 0) n = (DWORD)_snprintf(out, STATE_MAX, "{\"ok\":false,\"name\":\"%s\",\"version\":\"%s\",\"ne\":null}", HUB_NAME_S, PLUGIN_VERSION);
        respondJson(s, 200, out, n);
        return;
    }

    if (_stricmp(method, "POST") == 0 && strncmp(path, "/api/state", 10) == 0) {
        dataStoreState(body, bodyLen);
        const char* ok = "{\"ok\":true}";
        respondJson(s, 200, ok, 11);
        return;
    }

    if (_stricmp(method, "GET") == 0 && strncmp(path, "/api/cmd", 8) == 0) {
        static char out[CMD_QUEUE_MAX * CMD_MAX + 256];
        DWORD n = dataDrainCmds(out, sizeof(out) - 2);
        respondJson(s, 200, out, n);
        return;
    }

    if (_stricmp(method, "POST") == 0 && strncmp(path, "/api/cmd", 8) == 0) {
        dataEnqueueCmd(body, bodyLen);
        const char* ok = "{\"ok\":true}";
        respondJson(s, 200, ok, 11);
        return;
    }

    if (_stricmp(method, "GET") == 0 && strncmp(path, "/api/lyric", 10) == 0) {
        static char out[LYRIC_MAX + 2];
        DWORD n = dataReadLyric(out, LYRIC_MAX);
        if (n == 0) n = (DWORD)_snprintf(out, LYRIC_MAX, "{\"ok\":false,\"lyric\":null}");
        respondJson(s, 200, out, n);
        return;
    }

    if (_stricmp(method, "POST") == 0 && strncmp(path, "/api/lyric", 10) == 0) {
        dataStoreLyric(body, bodyLen);
        const char* ok = "{\"ok\":true}";
        respondJson(s, 200, ok, 11);
        return;
    }

    {
        const char* nf = "{\"ok\":false,\"error\":\"not-found\"}";
        respondJson(s, 404, nf, 31);
    }
}

/* 读一个完整请求（头 + 体；Content-Length 决定体长）；返回读取字节数 */
static DWORD readRequest(SOCKET s, char* buf, DWORD cap) {
    DWORD got = 0;
    while (got < cap) {
        int n = recv(s, buf + got, (int)(cap - got), 0);
        if (n <= 0) break;
        got += (DWORD)n;
        buf[got] = 0;
        /* 头是否完整 */
        char* sep = strstr(buf, "\r\n\r\n");
        if (!sep) {
            if (got >= cap) break;
            continue;
        }
        /* Content-Length */
        const char* cl = strstr(buf, "Content-Length:");
        if (!cl || cl > sep) cl = strstr(buf, "content-length:");
        DWORD need = 0;
        if (cl && cl < sep) {
            need = (DWORD)strtoul(cl + 15, NULL, 10);
        }
        DWORD have = got - (DWORD)(sep + 4 - buf);
        if (have >= need) return got; /* 完整 */
        /* 继续收体 */
    }
    return got;
}

/* ------------------------------------------------------------------ */
/* 监听循环（带自愈的 SEH 包裹）                                          */
/* ------------------------------------------------------------------ */
static SOCKET createListener(int port) {
    SOCKET ls = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (ls == INVALID_SOCKET) return INVALID_SOCKET;
    BOOL reuse = TRUE;
    setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, (const char*)&reuse, sizeof(reuse));
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons((u_short)port);
    if (bind(ls, (struct sockaddr*)&addr, sizeof(addr)) != 0) {
        closesocket(ls);
        return INVALID_SOCKET;
    }
    if (listen(ls, 16) != 0) {
        closesocket(ls);
        return INVALID_SOCKET;
    }
    return ls;
}

/* ------------------------------------------------------------------ */
/* 单连接服务（v8.0.1 防阻塞三律）                                        */
/*   1. recv 超时 3000→500ms：请求都是环回小包，500ms 已富余；              */
/*   2. accept 后 select 探 400ms，无数据立即关——浏览器预连接池/竞态      */
/*      败者连接会 connect 后不发数据，串行接受循环曾被它卡 3s，           */
/*      页面 1.4s 超时 ×2 连败即误判「掉线」（间歇断连根因）；             */
/*   3. TCP_NODELAY：响应立刻推平，杜绝 Nagle×延迟 ACK 叠加延迟。          */
/* ------------------------------------------------------------------ */
static void hub_conn_serve(SOCKET ls, char* req) {
    SOCKET cs;
    /* 接受路径整体 SEH：任何 AV 自愈（关套接字→继续） */
    __try {
        cs = accept(ls, NULL, NULL);
        if (cs == INVALID_SOCKET) {
            Sleep(50);
            return;
        }
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        logf_line("[seh] accept AV 0x%08X — self-heal", (unsigned)GetExceptionCode());
        Sleep(200);
        return;
    }

    __try {
        /* 空连接快关：400ms 内无首字节即视为预连接/探测，直接释放 */
        fd_set rs;
        struct timeval tv;
        FD_ZERO(&rs);
        FD_SET(cs, &rs);
        tv.tv_sec = 0;
        tv.tv_usec = 400 * 1000;
        int ready = select((int)cs + 1, &rs, NULL, NULL, &tv);
        if (ready <= 0) {
            logf_line("[http] idle conn dropped (preconnect guard)");
            closesocket(cs);
            return;
        }

        BOOL nd = TRUE;
        setsockopt(cs, IPPROTO_TCP, TCP_NODELAY, (const char*)&nd, sizeof(nd));
        DWORD timeoutMs = 500;
        setsockopt(cs, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeoutMs, sizeof(timeoutMs));
        setsockopt(cs, SOL_SOCKET, SO_SNDTIMEO, (const char*)&timeoutMs, sizeof(timeoutMs));

        DWORD n = readRequest(cs, req, REQ_MAX);
        if (n > 0) {
            req[n] = 0;
            handleRequest(cs, req, n);
        }
        closesocket(cs);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        logf_line("[seh] connection path AV 0x%08X — self-heal", (unsigned)GetExceptionCode());
        __try { closesocket(cs); } __except (EXCEPTION_EXECUTE_HANDLER) { }
        Sleep(100);
    }
}

static DWORD WINAPI hub_thread(LPVOID arg) {
    (void)arg;
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        logf_line("[boot] WSAStartup failed");
        return 0;
    }
    logf_line("[boot] ChuShi Music Hub v%s (winsock relay, zero WinRT)", PLUGIN_VERSION);

    static char req[REQ_MAX + 2];
    SOCKET ls = INVALID_SOCKET;
    int port = 0;
    for (;;) {
        int ports[3] = { PORT_PRIMARY, PORT_B, PORT_C };
        for (int i = 0; i < 3; i++) {
            ls = createListener(ports[i]);
            if (ls != INVALID_SOCKET) { port = ports[i]; break; }
        }
        if (ls != INVALID_SOCKET) break;
        logf_line("[boot] all ports busy, retry in 3s");
        Sleep(3000);
    }
    logf_line("[http] listening on %d (loopback only)", port);

    for (;;) {
        hub_conn_serve(ls, req);
    }
    /* 不可达 */
    return 0;
}

/* ------------------------------------------------------------------ */
/* BetterNCM 原生插件入口（零阻塞）                                       */
/* ------------------------------------------------------------------ */
void WINAPI BetterNCMPluginMain(void* apiPtr) {
    (void)apiPtr;
    void** api = (void**)apiPtr;

    if (!g_logMutex) g_logMutex = CreateMutexW(NULL, FALSE, NULL);
    if (!g_dataMutex) g_dataMutex = CreateMutexW(NULL, FALSE, NULL);
    if (!g_logMutex || !g_dataMutex) return;

    LONG ptype = 0;
    if (api) ptype = (LONG)(intptr_t)api[2];

    /* GPU/Utility 等进程全静默（Main=0x1 Renderer=0x10） */
    if (ptype != 0x1 && ptype != 0x10) return;

    /* 仅 Main 进程竞选枢纽宿主（互斥体持锁至进程退出） */
    if (ptype != 0x1) return;
    HANDLE mx = CreateMutexW(NULL, TRUE, HUB_MUTEX_NAMEW);
    if (!mx) {
        logf_line("[boot] CreateMutex failed %lu", (unsigned long)GetLastError());
        return;
    }
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        CloseHandle(mx);
        logf_line("[boot] another hub already active, standby");
        return;
    }

    logf_line("[boot] elected as hub host — relay thread starting");
    HANDLE th = CreateThread(NULL, 0, hub_thread, NULL, 0, NULL);
    if (th) CloseHandle(th);
    /* 立即返回，零阻塞（宿主加载律） */
    /* mx 故意不关闭：持锁至进程退出 */
}
