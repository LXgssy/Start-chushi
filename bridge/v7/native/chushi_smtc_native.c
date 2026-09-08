/* =========================================================================
 * ChuShi SMTC Manager — native BetterNCM plugin (v7.1.0) 监督者
 * -------------------------------------------------------------------------
 * v7.1.0 架构律：WinRT 绝不进宿主进程（网易云）。
 *   v7.0.x 四代崩溃根因收束于一点：SMTC/WinRT 跑在网易云进程内，环境被
 *   本体 SMTC 会话与其它插件污染（v7.0.2 ABI 全对仍崩于系统 QI 路径）。
 *   本版本 DLL 零 WinRT、零 SMTC：职责只剩——
 *     1. Host 选举（每机一个监督者，互斥体同 v7）
 *     2. 从内嵌 blob 释放独立 broker 进程 exe（ChuShiSMTCBroker.exe）
 *        到 %LOCALAPPDATA%\ChuShiSmtc\，CreateProcess 拉起
 *     3. 看护：等待退出 → 预算内重启（滚动 10 分钟 ≤5 次），防崩溃循环
 *     4. 旧版本 broker 在跑 → 经 /api/ping 识别版本，异版发 shutdown 再拉新
 *     5. 渲染进程诊断 API（ChuShi.Smtc.info）——返回 broker 状态 +
 *        经枢纽缓存的 smtcReady（纯 winsock，全超时保护）
 *   broker 进程（chushi_smtc_broker.c 编译产物）承载全部 WinRT/SMTC/HTTP
 *   枢纽；它崩溃只死自己（无 WER 弹窗），监督者预算内拉起，宿主永不受累。
 * ========================================================================== */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <shlobj.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdarg.h>

#pragma comment(lib, "user32")
#pragma comment(lib, "kernel32")
#pragma comment(lib, "ws2_32")
#pragma comment(lib, "shell32")

#include "chushi_broker_blob.h" /* 内嵌 broker exe（构建期生成） */

#define PLUGIN_VERSION "7.1.0"
#define BROKER_VER     "7.1.0"
#define MUTEX_NAMEW    L"ChuShi.Smtc.v7.Host"     /* 监督者选举（同 v7，升级平滑） */
#define BROKER_EXE_W   L"ChuShiSMTCBroker.exe"
#define HUB_PORTS      { 26901, 26902, 26903 }

typedef long LONG_;
#define SUCCEEDED_(hr) (((HRESULT)(hr)) >= 0)

/* ------------------------------------------------------------------ */
/* 日志（DLL 同目录 native-log.txt）                                      */
/* ------------------------------------------------------------------ */

static HMODULE g_hSelf = NULL;

static void logf_line(const char* fmt, ...) {
    wchar_t path[MAX_PATH];
    if (!g_hSelf) return;
    if (!GetModuleFileNameW(g_hSelf, path, MAX_PATH)) return;
    wchar_t* cut = wcsrchr(path, L'\\');
    if (!cut) return;
    wcscpy(cut + 1, L"native-log.txt");
    WIN32_FIND_DATAW fd;
    HANDLE fh = FindFirstFileW(path, &fd);
    if (fh != INVALID_HANDLE_VALUE) {
        FindClose(fh);
        if (fd.nFileSizeHigh == 0 && fd.nFileSizeLow > 1536 * 1024)
            DeleteFileW(path);
    }
    FILE* f = _wfopen(path, L"ab");
    if (!f) return;
    SYSTEMTIME st;
    GetLocalTime(&st);
    fprintf(f, "[%02u-%02u %02u:%02u:%02u.%03u][pid %lu] ",
        st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond, st.wMilliseconds,
        (unsigned long)GetCurrentProcessId());
    va_list ap;
    va_start(ap, fmt);
    vfprintf(f, fmt, ap);
    va_end(ap);
    fputc('\n', f);
    fclose(f);
}

/* ------------------------------------------------------------------ */
/* 状态                                                                  */
/* ------------------------------------------------------------------ */

static volatile LONG_ g_processType = 0;
static volatile LONG_ g_brokerPid   = 0;
static volatile LONG_ g_brokerUp    = 0;   /* 0=无 1=本监督者拉起 2=收养现有 */
static volatile LONG_ g_spawnCount  = 0;
static volatile LONG_ g_adopted     = 0;

/* ------------------------------------------------------------------ */
/* 迷你 HTTP 客户端（诊断用；全超时，失败即返回 0）                         */
/* ------------------------------------------------------------------ */

static int http_get_json(const char* path, char* out, int outMax, int timeoutMs) {
    int ports[3] = HUB_PORTS;
    WSADATA wsa;
    int found = 0;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 0;
    for (int i = 0; i < 3 && !found; i++) {
        SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (s == INVALID_SOCKET) break;
        DWORD tv = (DWORD)timeoutMs;
        setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char*)&tv, sizeof(tv));
        setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char*)&tv, sizeof(tv));
        struct sockaddr_in addr; memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        addr.sin_port = htons((unsigned short)ports[i]);
        if (connect(s, (struct sockaddr*)&addr, sizeof(addr)) == 0) {
            char req[256];
            int rn = snprintf(req, sizeof(req),
                "GET %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n", path);
            if (rn > 0 && send(s, req, rn, 0) == rn) {
                int got = 0;
                for (;;) {
                    int n = recv(s, out + got, outMax - 1 - got, 0);
                    if (n <= 0) break;
                    got += n;
                    if (got >= outMax - 1) break;
                }
                out[got] = 0;
                char* body = strstr(out, "\r\n\r\n");
                if (body) {
                    body += 4;
                    if (got > 0) found = 1;
                }
            }
        }
        closesocket(s);
    }
    WSACleanup();
    return found;
}

/* 缓存的 smtcReady（5 秒），供诊断 API 诚实上报 */
static SRWLOCK g_stLock = SRWLOCK_INIT;
static volatile LONG_ g_stCachedReady = 0;
static volatile LONG_ g_stCachedAt = 0;

static int hub_smtc_ready_cached(void) {
    long now = (long)GetTickCount();
    long at = InterlockedExchangeAdd(&g_stCachedAt, 0);
    if (at && now - at < 5000) return (int)InterlockedExchangeAdd(&g_stCachedReady, 0);
    char buf[1024];
    int ready = 0;
    if (http_get_json("/api/smtc/status", buf, sizeof(buf), 400)) {
        if (strstr(buf, "\"smtcReady\":true")) ready = 1;
    }
    AcquireSRWLockExclusive(&g_stLock);
    InterlockedExchange(&g_stCachedReady, (LONG_)ready);
    InterlockedExchange(&g_stCachedAt, (LONG_)now);
    ReleaseSRWLockExclusive(&g_stLock);
    return ready;
}

/* ------------------------------------------------------------------ */
/* broker exe 释放                                                        */
/* ------------------------------------------------------------------ */

static int write_file_w(const wchar_t* path, const unsigned char* data, unsigned int len) {
    HANDLE h = CreateFileW(path, GENERIC_WRITE, FILE_SHARE_READ, NULL,
                           CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return 0;
    DWORD written = 0;
    int ok = WriteFile(h, data, len, &written, NULL) && written == len;
    CloseHandle(h);
    return ok;
}

/* 返回：0=失败 1=写成功 path 2=已有同版本文件（跳过覆写） */
static int ensure_broker_exe(wchar_t* pathOut, int pathOutChars) {
    wchar_t dir[MAX_PATH + 64];
    wchar_t tPath[MAX_PATH + 64];
    /* 优先 %LOCALAPPDATA%\ChuShiSmtc\ */
    if (SUCCEEDED_(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, dir))) {
        int dlen = (int)wcslen(dir);
        _snwprintf(dir + dlen, (int)(sizeof(dir) / sizeof(wchar_t)) - dlen - 1,
                   L"\\ChuShiSmtc");
        dir[sizeof(dir) / sizeof(wchar_t) - 1] = 0;
        CreateDirectoryW(dir, NULL);
        _snwprintf(tPath, (int)(sizeof(tPath) / sizeof(wchar_t)) - 1,
                   L"%s\\%s", dir, BROKER_EXE_W);
        tPath[sizeof(tPath) / sizeof(wchar_t) - 1] = 0;
        /* 同尺寸即视为已释放（重启路径）；异常差异才覆写 */
        {
            HANDLE h = CreateFileW(tPath, GENERIC_READ, FILE_SHARE_READ, NULL,
                                   OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
            if (h != INVALID_HANDLE_VALUE) {
                DWORD hi = 0, size = GetFileSize(h, &hi);
                CloseHandle(h);
                if (hi == 0 && size == (DWORD)g_brokerBlobLen) {
                    _snwprintf(pathOut, pathOutChars - 1, L"%s", tPath);
                    pathOut[pathOutChars - 1] = 0;
                    return 2;
                }
            }
        }
        if (write_file_w(tPath, g_brokerBlob, g_brokerBlobLen)) {
            _snwprintf(pathOut, pathOutChars - 1, L"%s", tPath);
            pathOut[pathOutChars - 1] = 0;
            return 1;
        }
        DeleteFileW(tPath);
        if (write_file_w(tPath, g_brokerBlob, g_brokerBlobLen)) {
            _snwprintf(pathOut, pathOutChars - 1, L"%s", tPath);
            pathOut[pathOutChars - 1] = 0;
            return 1;
        }
    }
    /* 回退：DLL 同目录 */
    if (g_hSelf && GetModuleFileNameW(g_hSelf, dir, MAX_PATH)) {
        wchar_t* cut = wcsrchr(dir, L'\\');
        if (cut) {
            _snwprintf(cut + 1, (int)(MAX_PATH - (cut - dir) - 1), L"%s", BROKER_EXE_W);
            if (write_file_w(dir, g_brokerBlob, g_brokerBlobLen)) {
                _snwprintf(pathOut, pathOutChars - 1, L"%s", dir);
                pathOut[pathOutChars - 1] = 0;
                return 1;
            }
        }
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* broker 生命周期                                                        */
/* ------------------------------------------------------------------ */

static int ping_broker(char* verOut, int verMax, int* portOut) {
    int ports[3] = HUB_PORTS;
    for (int i = 0; i < 3; i++) {
        WSADATA wsa;
        if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 0;
        SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (s != INVALID_SOCKET) {
            DWORD tv = 350;
            setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char*)&tv, sizeof(tv));
            setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char*)&tv, sizeof(tv));
            struct sockaddr_in addr; memset(&addr, 0, sizeof(addr));
            addr.sin_family = AF_INET;
            addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
            addr.sin_port = htons((unsigned short)ports[i]);
            if (connect(s, (struct sockaddr*)&addr, sizeof(addr)) == 0) {
                const char* req = "GET /api/ping HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
                if (send(s, req, (int)strlen(req), 0) > 0) {
                    char buf[1024];
                    int got = 0;
                    for (;;) {
                        int n = recv(s, buf + got, (int)sizeof(buf) - 1 - got, 0);
                        if (n <= 0) break;
                        got += n;
                        if (got >= (int)sizeof(buf) - 1) break;
                    }
                    buf[got] = 0;
                    closesocket(s);
                    WSACleanup();
                    if (strstr(buf, "\"name\":\"chushi-smtc-hub\"")) {
                        char* v = strstr(buf, "\"version\":\"");
                        if (v && verOut) {
                            v += 11;
                            int k = 0;
                            while (v[k] && v[k] != '"' && k < verMax - 1) { verOut[k] = v[k]; k++; }
                            verOut[k] = 0;
                        }
                        if (portOut) *portOut = ports[i];
                        return 1;
                    }
                    continue; /* 已读但非本枢纽，下一个端口 */
                }
            }
            closesocket(s);
        }
        WSACleanup();
    }
    return 0;
}

static void shutdown_running_broker(int port) {
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return;
    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s != INVALID_SOCKET) {
        DWORD tv = 600;
        setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char*)&tv, sizeof(tv));
        setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char*)&tv, sizeof(tv));
        struct sockaddr_in addr; memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        addr.sin_port = htons((unsigned short)port);
        if (connect(s, (struct sockaddr*)&addr, sizeof(addr)) == 0) {
            const char* req = "POST /api/broker/shutdown HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            send(s, req, (int)strlen(req), 0);
            char buf[256];
            for (;;) {
                int n = recv(s, buf, (int)sizeof(buf), 0);
                if (n <= 0) break;
            }
        }
        closesocket(s);
    }
    WSACleanup();
}

static wchar_t g_brokerPath[MAX_PATH];

static int spawn_broker(void) {
    wchar_t cmdLine[MAX_PATH + 96];
    wchar_t logPath[MAX_PATH];
    PROCESS_INFORMATION pi;
    STARTUPINFOW si;
    DWORD selfPid = GetCurrentProcessId();
    int n;

    if (!g_brokerPath[0]) return 0;
    /* 日志与 DLL 同目录（报障时 native-log + broker-log 一并取走） */
    if (g_hSelf && GetModuleFileNameW(g_hSelf, logPath, MAX_PATH)) {
        wchar_t* cut = wcsrchr(logPath, L'\\');
        if (cut) wcscpy(cut + 1, L"broker-log.txt");
    } else logPath[0] = 0;

    n = _snwprintf(cmdLine, sizeof(cmdLine) / sizeof(wchar_t) - 1,
        L"\"%s\" --parent %lu --log \"%s\"", g_brokerPath,
        (unsigned long)selfPid, logPath);
    if (n <= 0) return 0;
    cmdLine[n] = 0;

    memset(&si, 0, sizeof(si));
    si.cb = sizeof(si);
    if (!CreateProcessW(NULL, cmdLine, NULL, NULL, FALSE,
                        CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB,
                        NULL, NULL, &si, &pi)) {
        /* 无 BREAKAWAY 权限则普通拉起 */
        memset(&si, 0, sizeof(si));
        si.cb = sizeof(si);
        if (!CreateProcessW(NULL, cmdLine, NULL, NULL, FALSE,
                            CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
            logf_line("[sup] CreateProcess failed %lu", (unsigned long)GetLastError());
            return 0;
        }
    }
    CloseHandle(pi.hThread);
    InterlockedIncrement(&g_spawnCount);
    InterlockedExchange(&g_brokerPid, (LONG_)pi.dwProcessId);
    InterlockedExchange(&g_brokerUp, 1);
    logf_line("[sup] broker spawned pid=%lu (spawn #%lu)",
              (unsigned long)pi.dwProcessId, (unsigned long)g_spawnCount);
    /* 句柄交还监视循环 */
    {
        HANDLE h = pi.hProcess;
        DWORD code = 0;
        DWORD startTick = GetTickCount();
        WaitForSingleObject(h, INFINITE);
        GetExitCodeProcess(h, &code);
        CloseHandle(h);
        InterlockedExchange(&g_brokerUp, 0);
        logf_line("[sup] broker exited code=%lu after %lus",
                  (unsigned long)code, (unsigned long)((GetTickCount() - startTick) / 1000));
        (void)h;
    }
    return 1;
}

#define RESTART_WINDOW_MS 600000  /* 滚动 10 分钟 */
#define RESTART_MAX       5

static DWORD WINAPI supervisor_thread(LPVOID param) {
    (void)param;
    char ver[32];
    int port = 0;
    DWORD restartTicks[RESTART_MAX];
    int ri = 0;

    /* 1) 现有 broker？ */
    if (ping_broker(ver, sizeof(ver), &port)) {
        if (strcmp(ver, BROKER_VER) == 0) {
            InterlockedExchange(&g_brokerUp, 2);
            InterlockedExchange(&g_adopted, 1);
            logf_line("[sup] adopted running broker v%s (port %d)", ver, port);
            /* 收养模式：只做健康轮询；连续 3 次失联则退出收养进入拉起 */
            int misses = 0;
            for (;;) {
                Sleep(10000);
                if (ping_broker(NULL, 0, NULL)) { misses = 0; InterlockedExchange(&g_brokerUp, 2); }
                else if (++misses >= 3) {
                    logf_line("[sup] adopted broker lost (3 misses)");
                    InterlockedExchange(&g_brokerUp, 0);
                    break;
                }
            }
        } else {
            logf_line("[sup] stale broker v%s running (want %s) — shutdown & respawn", ver, BROKER_VER);
            shutdown_running_broker(port);
            Sleep(1500);
        }
    }

    /* 2) 释放 exe */
    int wr = ensure_broker_exe(g_brokerPath, MAX_PATH);
    if (!wr) { logf_line("[sup] broker exe extract failed — give up"); return 1; }
    logf_line("[sup] broker exe ready (%s) at %S",
              wr == 2 ? "cached" : "extracted", g_brokerPath);

    /* 3) 拉起 + 看护（预算内重启） */
    for (;;) {
        if (!spawn_broker()) { Sleep(8000); continue; }
        /* 预算记账 */
        DWORD now = GetTickCount();
        DWORD windowStart = now - RESTART_WINDOW_MS;
        int inWindow = 0;
        for (int k = 0; k < RESTART_MAX; k++)
            if (restartTicks[k] && restartTicks[k] > windowStart) inWindow++;
        if (inWindow >= RESTART_MAX) {
            logf_line("[sup] restart budget exhausted (%d in %us) — stop, 释放互斥体",
                      inWindow, RESTART_WINDOW_MS / 1000);
            return 2;
        }
        restartTicks[ri] = now;
        ri = (ri + 1) % RESTART_MAX;
        /* 指数退避（1s→2s→4s→8s 封顶），broker 稳定运行 30s 以上则清零 */
        DWORD backoff = 1000 << (inWindow > 2 ? 3 : inWindow);
        /* 若 broker 实际跑了较久才退（>30s），视为偶发，退避归 1s */
        if (inWindow == 0) backoff = 1000;
        Sleep(backoff);
        /* 期间若别的监督者已拉起 broker 就不必再抢 */
        if (ping_broker(ver, sizeof(ver), &port)) {
            InterlockedExchange(&g_brokerUp, 2);
            logf_line("[sup] broker v%s already up after exit — adopt", ver);
            Sleep(4000);
        }
    }
}

/* ------------------------------------------------------------------ */
/* 诊断 API（渲染进程；契约与 v7.0.x 兼容：ok/host/smtcReady）             */
/* ------------------------------------------------------------------ */

static char g_infoBuf[512];
static char* native_info(void** args) {
    (void)args;
    LONG_ up = InterlockedExchangeAdd(&g_brokerUp, 0);
    char ready[8];
    /* http_get_json 复用 out buf，注意别打进 g_infoBuf */
    int readyV = hub_smtc_ready_cached();
    strncpy(ready, readyV ? "true" : "false", sizeof(ready) - 1);
    ready[sizeof(ready) - 1] = 0;
    snprintf(g_infoBuf, sizeof(g_infoBuf),
        "{\"ok\":true,\"plugin\":\"ChuShi SMTC Manager\",\"version\":\"%s\","
        "\"processType\":%ld,\"host\":%s,\"smtcReady\":%s,"
        "\"broker\":{\"running\":%s,\"pid\":%lu,\"spawns\":%lu,\"adopted\":%s}}",
        PLUGIN_VERSION, (long)g_processType,
        up ? "true" : "false", ready,
        up ? "true" : "false",
        (unsigned long)InterlockedExchangeAdd(&g_brokerPid, 0),
        (unsigned long)InterlockedExchangeAdd(&g_spawnCount, 0),
        InterlockedExchangeAdd(&g_adopted, 0) ? "true" : "false");
    return g_infoBuf;
}

/* ------------------------------------------------------------------ */
/* BetterNCM 原生插件入口                                                 */
/* ------------------------------------------------------------------ */

void WINAPI BetterNCMPluginMain(void* apiPtr) {
    void** api = (void**)apiPtr;

    GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                       GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                       (LPCWSTR)&BetterNCMPluginMain, &g_hSelf);

    if (!api) return;
    typedef int (*AddNativeAPIFn)(int* args, int argsNum, const char* identifier, char* (*fn)(void**));
    AddNativeAPIFn addNativeAPI = (AddNativeAPIFn)api[0];
    LONG_ ptype = (LONG_)(intptr_t)api[2];
    InterlockedExchange(&g_processType, ptype);

    logf_line("[boot] ChuShi SMTC Manager native v%s (supervisor) loaded (ptype=0x%lX)",
        PLUGIN_VERSION, (unsigned long)ptype);

    /* GPU/Utility 进程完全静默（Main=0x1 Renderer=0x10） */
    if (ptype != 0x1 && ptype != 0x10) return;

    if (addNativeAPI) {
        static int argTypes[1] = { 3 /* String */ };
        addNativeAPI(argTypes, 1, "ChuShi.Smtc.info", native_info);
    }

    /* Host 选举（仅 Main 进程当监督者；渲染进程只保留诊断 API） */
    if (ptype != 0x1) return;
    HANDLE mx = CreateMutexW(NULL, TRUE, MUTEX_NAMEW);
    if (!mx) { logf_line("[boot] CreateMutex failed %lu", (unsigned long)GetLastError()); return; }
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        CloseHandle(mx);
        logf_line("[boot] another supervisor already active, standby");
        return;
    }
    logf_line("[boot] elected as supervisor — broker lifecycle thread starting");
    HANDLE th = CreateThread(NULL, 0, supervisor_thread, NULL, 0, NULL);
    if (th) CloseHandle(th);
    /* mx 故意不关闭：持锁至进程退出 */
}
