/*
 * ChuShi Music Bridge — 原生桥接 DLL（BetterNCMII / chromatic native_plugin）
 *
 * 职责：在网易云音乐客户端进程内启动一个「仅回环」的本地 HTTP 服务，
 *       把插件 JS 写入的播放状态快照暴露给「初始」起始页（网页版 / 扩展版），
 *       并把「初始」发来的播放控制命令以文件形式交还给插件 JS。
 *
 * 文件契约（datapath = BETTERNCM_PROFILE 环境变量，缺省 C:\betterncm）：
 *   <datapath>/chushi-music/state.json      ← 插件 JS 写入（原子：tmp + rename）
 *   <datapath>/chushi-music/cmd/cmd-*.json  ← 本 DLL 写入（原子：tmp + MoveFileEx）
 *   <datapath>/chushi-music/config.json     ← 可选 {"port":10754}，启动时读取
 *
 * HTTP 接口（绑定 127.0.0.1）：
 *   GET  /api/ping      → {"ok":true,"name":"chushi-music-bridge",...}
 *   GET  /api/status    → state.json 原文透传（无状态文件时 503）
 *   POST /api/control   → 请求体(≤4KB)写入 cmd-*.json 返回 {"ok":true}
 *   OPTIONS *           → CORS 预检
 *
 * 安全设计：
 *   - 仅绑定 127.0.0.1，端口 10754 起向后顺延最多 10 个
 *   - Origin 白名单（扩展族 / GitHub Pages 线上域 / localhost 族），
 *     不在名单内则不回 ACAO 头，浏览器拒绝读取（防任意网站窥探正在播放）
 *   - 无任何以请求参数构造的文件路径（全部路径来自 datapath 推导）
 *   - 请求头 ≤8KB、请求体 ≤4KB、读超时 5s
 *   - 命名互斥体保证多进程加载（主进程+渲染进程）时服务器单例
 *
 * 导出：BetterNCMPluginMain（BetterNCMII 约定，PluginManager 经 GetProcAddress 调用）
 * 编译：zig cc -target x86_64-windows-gnu -shared -O2 -o bridge.dll bridge.c -lws2_32
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#define BRIDGE_VERSION   "1.0.0"
#define DIR_NAME         L"chushi-music"
#define STATE_FILE       L"state.json"
#define STATE_TMP        L"state.tmp.json"
#define CMD_PREFIX       L"cmd-"
#define CMD_TMP_PREFIX   L"tmp-"
#define DEFAULT_PORT     10754
#define PORT_SPAN        10
#define RECV_BUF_MAX     (8 * 1024)
#define BODY_MAX         (4 * 1024)
#define STATE_MAX        (64 * 1024)

static HANDLE g_mutex = NULL;
static SOCKET g_listen = INVALID_SOCKET;
static HANDLE g_thread = NULL;
static volatile LONG g_running = 0;

static wchar_t g_state_path[MAX_PATH];
static wchar_t g_cmd_dir[MAX_PATH];

/* ---------- 日志 ---------- */

static void dbg(const char *msg) {
    OutputDebugStringA("[ChuShiMusicBridge] ");
    OutputDebugStringA(msg);
    OutputDebugStringA("\n");
}

/* ---------- 路径解析 ---------- */

/* datapath = BETTERNCM_PROFILE（宽字符环境变量），缺省 C:\betterncm。
 * 与 BetterNCMII dllmain.cpp 的取值逻辑严格一致（同进程读取同一环境）。 */
static int build_paths(void) {
    wchar_t dp[MAX_PATH];
    DWORD n = GetEnvironmentVariableW(L"BETTERNCM_PROFILE", dp, MAX_PATH);
    if (n == 0 || n >= MAX_PATH) {
        wcscpy_s(dp, MAX_PATH, L"C:\\betterncm");
    }
    while (n > 0 && dp[n - 1] == L'\\') { dp[--n] = 0; }   /* 规范化尾反斜杠 */

    int r = swprintf_s(g_state_path, MAX_PATH, L"%s\\%s\\%s", dp, DIR_NAME, STATE_FILE);
    if (r < 0) return 0;
    r = swprintf_s(g_cmd_dir, MAX_PATH, L"%s\\%s", dp, DIR_NAME);
    if (r < 0) return 0;

    /* 目录补建（best effort；JS 侧也会建） */
    wchar_t base[MAX_PATH];
    swprintf_s(base, MAX_PATH, L"%s\\%s", dp, DIR_NAME);
    CreateDirectoryW(base, NULL);
    CreateDirectoryW(g_cmd_dir, NULL);
    return 1;
}

/* ---------- 文件工具 ---------- */

/* 读整个文件（≤ cap 字节）。成功返回 malloc 缓冲（调用方 free），*out_len 为长度。 */
static unsigned char *read_file(const wchar_t *path, size_t cap, size_t *out_len) {
    HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                           NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return NULL;
    LARGE_INTEGER sz;
    unsigned char *buf = NULL;
    if (!GetFileSizeEx(h, &sz) || sz.QuadPart < 0 || (size_t)sz.QuadPart > cap) goto fail;
    buf = (unsigned char *)malloc((size_t)sz.QuadPart + 1);
    if (!buf) goto fail;
    DWORD got = 0;
    if (!ReadFile(h, buf, (DWORD)sz.QuadPart, &got, NULL)) { free(buf); buf = NULL; goto fail; }
    buf[got] = 0;
    *out_len = got;
fail:
    CloseHandle(h);
    return buf;
}

/* state.json 的 mtime（FILETIME 100ns 计数），失败返回 0（预留：服务端变更推送） */
__attribute__((unused))
static uint64_t state_mtime(void) {
    WIN32_FILE_ATTRIBUTE_DATA fa;
    if (!GetFileAttributesExW(g_state_path, GetFileExInfoStandard, &fa)) return 0;
    ULARGE_INTEGER u;
    u.HighPart = fa.ftLastWriteTime.dwHighDateTime;
    u.LowPart = fa.ftLastWriteTime.dwLowDateTime;
    return u.QuadPart;
}

/* 原子写命令文件：tmp-*.json 写入后 MoveFileExW(REPLACE_EXISTING) → cmd-*.json */
static int write_cmd_file(const char *body, size_t len) {
    static volatile LONG seq = 0;
    wchar_t tmp_path[MAX_PATH], final_path[MAX_PATH];
    long s = InterlockedIncrement(&seq);
    swprintf_s(final_path, MAX_PATH, L"%s\\%s%llu-%ld.json",
               g_cmd_dir, CMD_PREFIX, (unsigned long long)GetTickCount64(), s);
    swprintf_s(tmp_path, MAX_PATH, L"%s\\%s%llu-%ld.json",
               g_cmd_dir, CMD_TMP_PREFIX, (unsigned long long)GetTickCount64(), s);

    HANDLE h = CreateFileW(tmp_path, GENERIC_WRITE, 0, NULL,
                           CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return 0;
    DWORD wrote = 0;
    BOOL ok = WriteFile(h, body, (DWORD)len, &wrote, NULL);
    CloseHandle(h);
    if (!ok || wrote != len) { DeleteFileW(tmp_path); return 0; }
    if (!MoveFileExW(tmp_path, final_path, MOVEFILE_REPLACE_EXISTING)) {
        DeleteFileW(tmp_path);
        return 0;
    }
    return 1;
}

/* ---------- HTTP 工具 ---------- */

typedef struct {
    char method[8];
    char path[128];
    char origin[256];
    int content_length;
} http_req;

static int starts_with(const char *s, const char *p) {
    return strncmp(s, p, strlen(p)) == 0;
}

/* Origin 白名单：空(非浏览器) / 浏览器扩展族 / 线上域 / localhost 族。
 * 返回 1 = 可回 ACAO（回显 origin），0 = 不回（浏览器侧拒绝读取）。 */
static int origin_allowed(const char *o) {
    if (o[0] == 0) return 1;
    if (starts_with(o, "chrome-extension://")) return 1;
    if (starts_with(o, "moz-extension://")) return 1;
    if (starts_with(o, "safari-web-extension://")) return 1;
    if (strcmp(o, "https://lxgssy.github.io") == 0) return 1;
    if (strcmp(o, "http://lxgssy.github.io") == 0) return 1;
    if (starts_with(o, "http://localhost:")) return 1;
    if (starts_with(o, "https://localhost:")) return 1;
    if (starts_with(o, "http://127.0.0.1:")) return 1;
    if (starts_with(o, "https://127.0.0.1:")) return 1;
    return 0;
}

static void send_all(SOCKET s, const char *buf, int len) {
    int off = 0;
    while (off < len) {
        int n = send(s, buf + off, len - off, 0);
        if (n <= 0) return;
        off += n;
    }
}

/* 通用响应。body 可为 NULL；preflight=1 时按 OPTIONS 预检格式输出。 */
static void respond(SOCKET s, int code, const char *reason, const char *ctype,
                    const char *body, size_t blen, const char *origin, int preflight) {
    char hdr[1024];
    char acao[300];
    acao[0] = 0;
    if (origin && origin_allowed(origin)) {
        sprintf_s(acao, sizeof(acao),
                  "Access-Control-Allow-Origin: %s\r\n", origin);
    }
    if (preflight) {
        int hn = sprintf_s(hdr, sizeof(hdr),
            "HTTP/1.1 %d %s\r\n"
            "Content-Length: 0\r\n"
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type\r\n"
            "Access-Control-Max-Age: 600\r\n"
            "Connection: close\r\n"
            "%s\r\n", code, reason, acao);
        (void)ctype; (void)body; (void)blen;
        send_all(s, hdr, hn);
        return;
    }
    if (!body) blen = 0;
    int hn = sprintf_s(hdr, sizeof(hdr),
        "HTTP/1.1 %d %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %zu\r\n"
        "Cache-Control: no-store\r\n"
        "Connection: close\r\n"
        "%s\r\n", code, reason, ctype, blen, acao);
    send_all(s, hdr, hn);
    if (body && blen) send_all(s, body, (int)blen);
}

/* 从请求头缓冲中提取 Origin 与 Content-Length（不区分大小写） */
static void parse_request(const char *buf, size_t n, http_req *req) {
    memset(req, 0, sizeof(*req));
    /* 请求行：METHOD SP PATH SP VERSION */
    if (n > 4) {
        const char *sp = strchr(buf, ' ');
        if (sp && (size_t)(sp - buf) < sizeof(req->method)) {
            size_t ml = (size_t)(sp - buf);
            memcpy(req->method, buf, ml);
            req->method[ml] = 0;
            const char *p2 = strchr(sp + 1, ' ');
            size_t plen = p2 ? (size_t)(p2 - sp - 1) : 0;
            if (plen >= sizeof(req->path)) plen = sizeof(req->path) - 1;
            if (plen) {
                memcpy(req->path, sp + 1, plen);
                req->path[plen] = 0;
            }
        }
    }
    /* 逐行找头部 */
    const char *line = buf;
    const char *end = buf + n;
    while (line < end) {
        const char *eol = memchr(line, '\n', (size_t)(end - line));
        if (!eol) break;
        size_t ll = (size_t)(eol - line);
        if (ll > 8 && _strnicmp(line, "origin:", 7) == 0) {
            const char *v = line + 7;
            while (*v == ' ' || *v == '\t') v++;
            size_t vl = strlen(v);
            while (vl && (v[vl - 1] == '\r' || v[vl - 1] == ' ')) vl--;
            if (vl >= sizeof(req->origin)) vl = sizeof(req->origin) - 1;
            memcpy(req->origin, v, vl);
            req->origin[vl] = 0;
        } else if (ll > 16 && _strnicmp(line, "content-length:", 15) == 0) {
            req->content_length = atoi(line + 15);
            if (req->content_length < 0) req->content_length = 0;
            if (req->content_length > BODY_MAX) req->content_length = BODY_MAX;
        }
        line = eol + 1;
    }
}

/* 读到 CRLFCRLF 为止（select 超时 5s）。返回 1 = 完整头部在 buf，hdr_len/extra 已填 */
static int read_head(SOCKET s, char *buf, size_t cap, size_t *hdr_len, size_t *extra) {
    size_t got = 0;
    *extra = 0;
    while (got < cap) {
        fd_set r;
        FD_ZERO(&r);
        FD_SET(s, &r);
        struct timeval tv = { 5, 0 };
        int rc = select(0, &r, NULL, NULL, &tv);
        if (rc <= 0) return 0;
        int n = recv(s, buf + got, (int)(cap - got), 0);
        if (n <= 0) return 0;
        got += (size_t)n;
        /* 找 \r\n\r\n（避免依赖 memmem 的可移植性） */
        if (got >= 4) {
            for (size_t i = got - 4; ; i--) {
                if (buf[i] == '\r' && buf[i+1] == '\n' && buf[i+2] == '\r' && buf[i+3] == '\n') {
                    *hdr_len = i + 4;
                    *extra = got - *hdr_len;    /* 头部之后已到达的体数据 */
                    return 1;
                }
                if (i == 0) break;
            }
        }
    }
    return 0;
}

/* ---------- 路由 ---------- */

static void handle_ping(SOCKET s, const char *origin, int port) {
    char body[160];
    sprintf_s(body, sizeof(body),
              "{\"ok\":true,\"name\":\"chushi-music-bridge\",\"version\":\"%s\",\"port\":%d}",
              BRIDGE_VERSION, port);
    respond(s, 200, "OK", "application/json; charset=utf-8", body, strlen(body), origin, 0);
}

static void handle_status(SOCKET s, const char *origin) {
    size_t len = 0;
    unsigned char *buf = read_file(g_state_path, STATE_MAX, &len);
    if (!buf) {
        const char *body = "{\"ok\":false,\"error\":\"no-state\"}";
        respond(s, 503, "Service Unavailable", "application/json; charset=utf-8",
                body, strlen(body), origin, 0);
        return;
    }
    respond(s, 200, "OK", "application/json; charset=utf-8", (char *)buf, len, origin, 0);
    free(buf);
}

static void handle_control(SOCKET s, const char *origin, char *headbuf,
                           size_t hdr_len, size_t extra, http_req *req) {
    if (req->content_length <= 0) {
        const char *body = "{\"ok\":false,\"error\":\"empty-body\"}";
        respond(s, 400, "Bad Request", "application/json; charset=utf-8", body, strlen(body), origin, 0);
        return;
    }
    char body[BODY_MAX + 1];
    size_t got = extra;
    if (got > (size_t)req->content_length) got = (size_t)req->content_length;
    if (got) memcpy(body, headbuf + hdr_len, got);
    while (got < (size_t)req->content_length) {
        fd_set r;
        FD_ZERO(&r);
        FD_SET(s, &r);
        struct timeval tv = { 5, 0 };
        if (select(0, &r, NULL, NULL, &tv) <= 0) break;
        int n = recv(s, body + got, (int)((size_t)req->content_length - got), 0);
        if (n <= 0) break;
        got += (size_t)n;
    }
    body[got] = 0;
    /* 极简合法性：须为 JSON 对象且含 "action" */
    if (body[0] != '{' || !strstr(body, "\"action\"")) {
        const char *rb = "{\"ok\":false,\"error\":\"bad-json\"}";
        respond(s, 400, "Bad Request", "application/json; charset=utf-8", rb, strlen(rb), origin, 0);
        return;
    }
    if (write_cmd_file(body, got)) {
        const char *rb = "{\"ok\":true}";
        respond(s, 200, "OK", "application/json; charset=utf-8", rb, strlen(rb), origin, 0);
    } else {
        const char *rb = "{\"ok\":false,\"error\":\"cmd-write-failed\"}";
        respond(s, 500, "Internal Server Error", "application/json; charset=utf-8", rb, strlen(rb), origin, 0);
    }
}

/* ---------- 配置 ---------- */

static int read_configured_port(void) {
    wchar_t cfg[MAX_PATH];
    /* state.json 同目录下的 config.json */
    wchar_t dir[MAX_PATH];
    wcscpy_s(dir, MAX_PATH, g_state_path);
    wchar_t *slash = wcsrchr(dir, L'\\');
    if (!slash) return DEFAULT_PORT;
    *slash = 0;
    swprintf_s(cfg, MAX_PATH, L"%s\\config.json", dir);
    size_t len = 0;
    unsigned char *buf = read_file(cfg, 4096, &len);
    if (!buf) return DEFAULT_PORT;
    buf[len] = 0;
    const char *p = strstr((char *)buf, "\"port\"");
    int port = DEFAULT_PORT;
    if (p) {
        p = strchr(p + 6, ':');
        if (p) port = atoi(p + 1);
    }
    free(buf);
    if (port < 1024 || port > 65535) port = DEFAULT_PORT;
    return port;
}

/* 把实际端口写回 <datapath>/chushi-music/server.json（供排障） */
static void write_server_info(int port) {
    wchar_t path[MAX_PATH];
    wchar_t dir[MAX_PATH];
    wcscpy_s(dir, MAX_PATH, g_state_path);
    wchar_t *slash = wcsrchr(dir, L'\\');
    if (!slash) return;
    *slash = 0;
    swprintf_s(path, MAX_PATH, L"%s\\server.json", dir);
    char body[128];
    sprintf_s(body, sizeof(body), "{\"port\":%d,\"version\":\"%s\"}", port, BRIDGE_VERSION);
    HANDLE h = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return;
    DWORD wrote = 0;
    WriteFile(h, body, (DWORD)strlen(body), &wrote, NULL);
    CloseHandle(h);
}

/* ---------- 服务器主循环 ---------- */

static DWORD WINAPI server_thread(LPVOID arg) {
    (void)arg;
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) { dbg("WSAStartup failed"); return 1; }

    int port = read_configured_port();
    SOCKET ls = INVALID_SOCKET;
    int bound = 0;
    for (int i = 0; i <= PORT_SPAN; i++) {
        ls = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (ls == INVALID_SOCKET) break;
        BOOL reuse = TRUE;
        setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, (char *)&reuse, sizeof(reuse));
        struct sockaddr_in addr;
        memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_port = htons((unsigned short)(port + i));
        addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);   /* 仅回环 */
        if (bind(ls, (struct sockaddr *)&addr, sizeof(addr)) == 0 &&
            listen(ls, 8) == 0) {
            port = port + i;
            bound = 1;
            break;
        }
        closesocket(ls);
    }
    if (!bound) { dbg("bind failed"); WSACleanup(); return 1; }
    g_listen = ls;
    write_server_info(port);
    dbg("server listening");

    while (InterlockedCompareExchange(&g_running, 1, 1) == 1) {
        SOCKET c = accept(ls, NULL, NULL);
        if (c == INVALID_SOCKET) {
            Sleep(50);
            continue;
        }
        /* 收请求 */
        char *buf = (char *)malloc(RECV_BUF_MAX + 1);
        if (!buf) { closesocket(c); continue; }
        size_t hdr_len = 0, extra = 0;
        http_req req;
        if (!read_head(c, buf, RECV_BUF_MAX, &hdr_len, &extra)) {
            free(buf);
            closesocket(c);
            continue;
        }
        buf[hdr_len] = 0;
        parse_request(buf, hdr_len, &req);

        /* 仅放行 api 前缀与 OPTIONS，其余 404 */
        if (strcmp(req.method, "OPTIONS") == 0) {
            respond(c, 204, "No Content", "text/plain", NULL, 0, req.origin, 1);
        } else if (strcmp(req.path, "/api/ping") == 0 && strcmp(req.method, "GET") == 0) {
            handle_ping(c, req.origin, port);
        } else if (strcmp(req.path, "/api/status") == 0 && strcmp(req.method, "GET") == 0) {
            handle_status(c, req.origin);
        } else if (strcmp(req.path, "/api/control") == 0 && strcmp(req.method, "POST") == 0) {
            handle_control(c, req.origin, buf, hdr_len, extra, &req);
        } else {
            const char *body = "{\"ok\":false,\"error\":\"not-found\"}";
            respond(c, 404, "Not Found", "application/json; charset=utf-8", body, strlen(body), req.origin, 0);
        }
        /* Connection: close —— 响应完即关（轮询协议，无长连接） */
        shutdown(c, SD_BOTH);
        closesocket(c);
        free(buf);
    }

    closesocket(ls);
    g_listen = INVALID_SOCKET;
    WSACleanup();
    dbg("server stopped");
    return 0;
}

/* ---------- BetterNCMII 插件入口 ---------- */

/* PluginManager::loadNative 约定：
 *   hDll = LoadLibrary(<runtime_path>/<manifest.native_plugin>)
 *   fn   = GetProcAddress(hDll, "BetterNCMPluginMain")
 *   fn(pluginAPI)   —— pluginAPI 指针我们不需要（不用 addNativeAPI），
 *                      只按 Win64 ABI 接收指针即可，结构体布局无关。
 * 主进程与渲染进程都会加载本 DLL：用命名互斥体保证服务器单例。 */
#ifdef __cplusplus
extern "C"
#endif
__declspec(dllexport)
char *__cdecl BetterNCMPluginMain(void *pluginAPI) {
    (void)pluginAPI;

    g_mutex = CreateMutexW(NULL, TRUE, L"Local\\ChuShiMusicBridgeServer");
    if (!g_mutex) return NULL;
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        dbg("another process already serves; skip");
        return NULL;
    }

    if (!build_paths()) { dbg("build_paths failed"); return NULL; }

    InterlockedExchange(&g_running, 1);
    g_thread = CreateThread(NULL, 0, server_thread, NULL, 0, NULL);
    if (!g_thread) {
        InterlockedExchange(&g_running, 0);
        dbg("CreateThread failed");
    }
    return NULL;
}

BOOL WINAPI DllMain(HINSTANCE hinst, DWORD reason, LPVOID reserved) {
    (void)hinst; (void)reserved;
    if (reason == DLL_PROCESS_DETACH) {
        InterlockedExchange(&g_running, 0);
        if (g_listen != INVALID_SOCKET) {
            closesocket(g_listen);   /* 唤醒 accept，线程自行退出（不等待，防 loader lock） */
        }
        if (g_mutex) ReleaseMutex(g_mutex);
    }
    return TRUE;
}
