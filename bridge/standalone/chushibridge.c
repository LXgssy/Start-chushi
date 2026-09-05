/*
 * ChuShiBridge.exe — 初始音乐桥 · 独立版（专为「初始」起始页打造的网易云桥接器）
 *
 * 定位：BetterNCM/chromatic 已停更于网易云（作者弃坑，chromatic 2.0 无二进制发布），
 *       本程序以「CEF 调试端口」替代「CEF 内部 hook」，不随网易云版本升级而失效：
 *         1) 以 --remote-debugging-port 启动网易云（或经 msimg32 装载器保证端口常开）
 *         2) 经 CDP 附加主页面，注入页内桥（window.__chushiBridge）
 *         3) 以 800ms 轮询快照 / 消费控制命令
 *         4) 在 127.0.0.1:10754 暴露与 v1.7.5 插件版完全同契约的 HTTP API
 *
 * 用法：
 *   ChuShiBridge.exe                     前台运行（找不到网易云进程时自动拉起）
 *   --cdp N        指定 CEF 调试端口（默认 18754）
 *   --ncm 路径     指定 cloudmusic.exe 路径
 *   --no-launch    不代启网易云（只附加）
 *   --kill-ncm     启动时先重启网易云（安装器首跑用，保证带参启动）
 * 编译：llvm-mingw x86_64-w64-mingw32-gcc（见 scripts/build-chushibridge.py）
 */
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <winreg.h>
#include <tlhelp32.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <time.h>

#include "cb_server.h"
#include "cb_cdp.h"
#include "cdp_js.h"

#define DEFAULT_CDP_PORT 18754
#define POLL_MS          800
#define EV_FRAME_MAX     3

/* ---------- 日志 ---------- */

static CRITICAL_SECTION g_log_lock;
static wchar_t g_log_path[MAX_PATH];

static void log_write(const char *line) {
    EnterCriticalSection(&g_log_lock);
    HANDLE h = CreateFileW(g_log_path, FILE_APPEND_DATA, FILE_SHARE_READ, NULL,
                           OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h != INVALID_HANDLE_VALUE) {
        LARGE_INTEGER sz;
        if (GetFileSizeEx(h, &sz) && sz.QuadPart > 256 * 1024) {
            CloseHandle(h);
            h = CreateFileW(g_log_path, GENERIC_WRITE, FILE_SHARE_READ, NULL,
                            CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        }
        if (h != INVALID_HANDLE_VALUE) {
            SetFilePointer(h, 0, NULL, FILE_END);
            SYSTEMTIME st;
            GetLocalTime(&st);
            char pre[64];
            int pn = sprintf_s(pre, sizeof(pre), "[%04u-%02u-%02u %02u:%02u:%02u] ",
                               st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);
            DWORD w = 0;
            WriteFile(h, pre, (DWORD)pn, &w, NULL);
            WriteFile(h, line, (DWORD)strlen(line), &w, NULL);
            WriteFile(h, "\r\n", 2, &w, NULL);
            CloseHandle(h);
        }
    }
    LeaveCriticalSection(&g_log_lock);
    printf("%s\n", line);
    fflush(stdout);
}

void cb_log(const char *line) { log_write(line); }

void cb_logf(const char *fmt, ...) {
    char buf[1024];
    va_list ap;
    va_start(ap, fmt);
    vsprintf_s(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    log_write(buf);
}

/* ---------- 配置 ---------- */

typedef struct {
    int cdp_port;
    int launch;          /* 是否代启网易云 */
    int kill_ncm;        /* 启动时先重启网易云 */
    wchar_t ncm_path[MAX_PATH];
} cfg;

static int json_int(const char *json, const char *key, int defv) {
    char pat[40];
    sprintf_s(pat, sizeof(pat), "\"%s\"", key);
    const char *p = strstr(json, pat);
    if (!p) return defv;
    p = strchr(p + strlen(pat), ':');
    if (!p) return defv;
    int v = atoi(p + 1);
    return v > 0 ? v : defv;
}

static void json_wstr(const char *json, const char *key, wchar_t *out, size_t cap) {
    out[0] = 0;
    char pat[40];
    sprintf_s(pat, sizeof(pat), "\"%s\"", key);
    const char *p = strstr(json, pat);
    if (!p) return;
    p = strchr(p + strlen(pat), '"');
    if (!p) return;
    p++;
    /* 先解码成 UTF-8 字节流（支持 \\ \/ \" 与 \uXXXX 含代理对），再转宽字符。
     * PowerShell 5.1 的 ConvertTo-Json 会把中文路径写成 \uXXXX 转义。 */
    char raw[MAX_PATH * 4];
    size_t ri = 0;
    while (*p && *p != '"' && ri + 8 < sizeof(raw)) {
        if (*p == '\\' && p[1]) {
            p++;
            if (*p == 'u') {
                unsigned int cp = 0;
                int hexok = 0;
                for (int i = 1; i <= 4 && p[i]; i++) {
                    char c = p[i];
                    if (c >= '0' && c <= '9') { cp = cp << 4 | (unsigned)(c - '0'); hexok = 1; }
                    else if (c >= 'a' && c <= 'f') { cp = cp << 4 | (unsigned)(c - 'a' + 10); hexok = 1; }
                    else if (c >= 'A' && c <= 'F') { cp = cp << 4 | (unsigned)(c - 'A' + 10); hexok = 1; }
                    else break;
                }
                if (!hexok) { raw[ri++] = *p ? *p++ : 'u'; continue; }
                p += 5;
                /* 代理对 */
                if (cp >= 0xD800 && cp <= 0xDBFF && p[0] == '\\' && p[1] == 'u') {
                    unsigned int lo = 0;
                    int ok = 1;
                    for (int i = 2; i <= 5 && p[i]; i++) {
                        char c = p[i]; lo <<= 4;
                        if (c >= '0' && c <= '9') lo |= (unsigned)(c - '0');
                        else if (c >= 'a' && c <= 'f') lo |= (unsigned)(c - 'a' + 10);
                        else if (c >= 'A' && c <= 'F') lo |= (unsigned)(c - 'A' + 10);
                        else ok = 0;
                    }
                    if (ok && lo >= 0xDC00 && lo <= 0xDFFF) {
                        cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                        p += 6;
                    }
                }
                if (cp < 0x80) raw[ri++] = (char)cp;
                else if (cp < 0x800) {
                    raw[ri++] = (char)(0xC0 | (cp >> 6));
                    raw[ri++] = (char)(0x80 | (cp & 0x3F));
                } else if (cp < 0x10000) {
                    raw[ri++] = (char)(0xE0 | (cp >> 12));
                    raw[ri++] = (char)(0x80 | ((cp >> 6) & 0x3F));
                    raw[ri++] = (char)(0x80 | (cp & 0x3F));
                } else {
                    raw[ri++] = (char)(0xF0 | (cp >> 18));
                    raw[ri++] = (char)(0x80 | ((cp >> 12) & 0x3F));
                    raw[ri++] = (char)(0x80 | ((cp >> 6) & 0x3F));
                    raw[ri++] = (char)(0x80 | (cp & 0x3F));
                }
            } else raw[ri++] = *p++;
        } else raw[ri++] = *p++;
    }
    raw[ri] = 0;
    MultiByteToWideChar(CP_UTF8, 0, raw, -1, out, (int)cap);
}

static void load_config(cfg *c) {
    c->cdp_port = DEFAULT_CDP_PORT;
    c->launch = 1;
    c->kill_ncm = 0;
    c->ncm_path[0] = 0;
    wchar_t dir[MAX_PATH];
    if (!GetEnvironmentVariableW(L"LOCALAPPDATA", dir, MAX_PATH)) return;
    wchar_t path[MAX_PATH];
    swprintf_s(path, MAX_PATH, L"%s\\ChuShiBridge", dir);
    CreateDirectoryW(path, NULL);
    swprintf_s(g_log_path, MAX_PATH, L"%s\\bridge.log", path);
    swprintf_s(path, MAX_PATH, L"%s\\ChuShiBridge\\config.json", dir);
    HANDLE h = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    if (h == INVALID_HANDLE_VALUE) return;
    char buf[4096];
    DWORD got = 0;
    ReadFile(h, buf, sizeof(buf) - 1, &got, NULL);
    CloseHandle(h);
    buf[got] = 0;
    c->cdp_port = json_int(buf, "cdp", DEFAULT_CDP_PORT);
    json_wstr(buf, "ncmPath", c->ncm_path, MAX_PATH);
}

/* ---------- NCM 定位 ---------- */

static int file_exists_w(const wchar_t *p) {
    DWORD a = GetFileAttributesW(p);
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

/* 枚举运行中的 cloudmusic.exe：返回 1=在跑（pid/路径输出） */
static int find_ncm_process(DWORD *pid, wchar_t *exe, size_t exe_cap) {
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return 0;
    PROCESSENTRY32W pe;
    pe.dwSize = sizeof(pe);
    int found = 0;
    DWORD best = 0xFFFFFFFF;
    if (Process32FirstW(snap, &pe)) {
        do {
            if (_wcsicmp(pe.szExeFile, L"cloudmusic.exe") == 0) {
                if (pe.th32ProcessID < best) best = pe.th32ProcessID; /* 最早创建=浏览器进程 */
                found = 1;
            }
        } while (Process32NextW(snap, &pe));
    }
    CloseHandle(snap);
    if (!found) return 0;
    if (pid) *pid = best;
    if (exe && exe_cap) {
        exe[0] = 0;
        /* 查询完整路径 */
        HANDLE p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, best);
        if (p) {
            DWORD sz = (DWORD)(exe_cap * sizeof(wchar_t));
            QueryFullProcessImageNameW(p, 0, exe, &sz);
            CloseHandle(p);
        }
    }
    return 1;
}

static int locate_ncm(cfg *c) {
    /* 1) 显式参数/配置 */
    if (c->ncm_path[0] && file_exists_w(c->ncm_path)) return 1;
    /* 2) 运行中进程 */
    wchar_t exe[MAX_PATH];
    if (find_ncm_process(NULL, exe, MAX_PATH) && exe[0]) {
        wcscpy_s(c->ncm_path, MAX_PATH, exe);
        return 1;
    }
    /* 3) 注册表 */
    const struct { HKEY root; const char *key; } regs[] = {
        { HKEY_CURRENT_USER, "Software\\NetEase\\CloudMusic" },
        { HKEY_LOCAL_MACHINE, "SOFTWARE\\NetEase\\CloudMusic" },
        { HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\NetEase\\CloudMusic" },
    };
    for (size_t i = 0; i < sizeof(regs) / sizeof(regs[0]); i++) {
        HKEY k;
        if (RegOpenKeyExA(regs[i].root, regs[i].key, 0, KEY_READ, &k) == ERROR_SUCCESS) {
            char dir[MAX_PATH];
            DWORD sz = sizeof(dir);
            DWORD type = 0;
            if (RegGetValueA(k, NULL, "InstallDir", RRF_RT_REG_SZ, &type, dir, &sz) == ERROR_SUCCESS) {
                wchar_t wdir[MAX_PATH];
                MultiByteToWideChar(CP_UTF8, 0, dir, -1, wdir, MAX_PATH);
                wchar_t cand[MAX_PATH];
                swprintf_s(cand, MAX_PATH, L"%s\\cloudmusic.exe", wdir);
                if (file_exists_w(cand)) { wcscpy_s(c->ncm_path, MAX_PATH, cand); RegCloseKey(k); return 1; }
                swprintf_s(cand, MAX_PATH, L"%s\\bin\\cloudmusic.exe", wdir);
                if (file_exists_w(cand)) { wcscpy_s(c->ncm_path, MAX_PATH, cand); RegCloseKey(k); return 1; }
            }
            RegCloseKey(k);
        }
    }
    /* 4) 常见路径 */
    wchar_t pf[MAX_PATH], pfa[MAX_PATH], lad[MAX_PATH];
    wchar_t cands[6][MAX_PATH];
    int n = 0;
    if (GetEnvironmentVariableW(L"ProgramFiles", pf, MAX_PATH))
        swprintf_s(cands[n++], MAX_PATH, L"%s\\Netease\\CloudMusic\\cloudmusic.exe", pf);
    if (GetEnvironmentVariableW(L"ProgramFiles(x86)", pfa, MAX_PATH))
        swprintf_s(cands[n++], MAX_PATH, L"%s\\Netease\\CloudMusic\\cloudmusic.exe", pfa);
    if (GetEnvironmentVariableW(L"LOCALAPPDATA", lad, MAX_PATH))
        swprintf_s(cands[n++], MAX_PATH, L"%s\\Netease\\CloudMusic\\cloudmusic.exe", lad);
    for (int i = 0; i < n; i++) {
        if (file_exists_w(cands[i])) { wcscpy_s(c->ncm_path, MAX_PATH, cands[i]); return 1; }
    }
    return 0;
}

/* ---------- 进程操作 ---------- */

static void kill_ncm(void) {
    cb_log("重启网易云音乐…（先尝试正常退出）");
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    ZeroMemory(&pi, sizeof(pi));
    wchar_t cmdline[128];
    wcscpy_s(cmdline, 128, L"cmd /c taskkill /IM cloudmusic.exe");
    if (CreateProcessW(NULL, cmdline, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, 8000);
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
    }
    for (int i = 0; i < 8 && find_ncm_process(NULL, NULL, 0); i++) Sleep(500);
    if (find_ncm_process(NULL, NULL, 0)) {
        cb_log("正常退出超时，强制结束");
        wcscpy_s(cmdline, 128, L"cmd /c taskkill /F /IM cloudmusic.exe");
        ZeroMemory(&si, sizeof(si));
        si.cb = sizeof(si);
        if (CreateProcessW(NULL, cmdline, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
            WaitForSingleObject(pi.hProcess, 8000);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
        }
        for (int i = 0; i < 6 && find_ncm_process(NULL, NULL, 0); i++) Sleep(500);
    }
}

static int launch_ncm(const cfg *c) {
    if (!c->ncm_path[0]) {
        if (!locate_ncm((cfg *)c)) {
            cb_log("未找到网易云音乐安装位置（可在 config.json 里写 ncmPath）");
            return 0;
        }
    }
    wchar_t args[MAX_PATH * 2];
    swprintf_s(args, MAX_PATH * 2,
               L"\"%s\" --remote-debugging-port=%d --remote-allow-origins=* --chushi-bridge",
               c->ncm_path, c->cdp_port);
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    ZeroMemory(&pi, sizeof(pi));
    if (!CreateProcessW(c->ncm_path, args, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
        char msg[256];
        sprintf_s(msg, sizeof(msg), "启动网易云失败（错误码 %lu）", GetLastError());
        cb_log(msg);
        return 0;
    }
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    char msg[400];
    char np[300];
    cb_json_escape_w(c->ncm_path, np, sizeof(np));
    sprintf_s(msg, sizeof(msg), "已启动网易云（带调试端口 %d）：%s", c->cdp_port, np);
    cb_log(msg);
    return 1;
}

/* ---------- server.json 供排障 ---------- */

static void write_server_info(int http_port, int cdp_port) {
    wchar_t dir[MAX_PATH], path[MAX_PATH];
    if (!GetEnvironmentVariableW(L"LOCALAPPDATA", dir, MAX_PATH)) return;
    swprintf_s(dir, MAX_PATH, L"%s\\ChuShiBridge", dir);
    CreateDirectoryW(dir, NULL);
    swprintf_s(path, MAX_PATH, L"%s\\server.json", dir);
    char body[192];
    sprintf_s(body, sizeof(body),
              "{\"port\":%d,\"cdpPort\":%d,\"version\":\"%s\"}",
              http_port, cdp_port, CB_VERSION);
    HANDLE h = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return;
    DWORD w = 0;
    WriteFile(h, body, (DWORD)strlen(body), &w, NULL);
    CloseHandle(h);
}

/* ---------- CDP 附加与轮询线程 ---------- */

static volatile LONG g_running = 1;

static BOOL WINAPI ctrl_handler(DWORD type) {
    (void)type;
    InterlockedExchange(&g_running, 0);
    return TRUE;
}

/* attach 失败细分上报：状态实时写入 /api/debug；
 * 日志打点按签名节流（同一原因 5 分钟内不重复刷屏） */
static void attach_fail_log(const char *state, const char *detail) {
    cb_attach_set(state, detail);
    static char last_sig[256] = "";
    static ULONGLONG last_tick = 0;
    char sig[256];
    sprintf_s(sig, sizeof(sig), "%s|%s", state, detail ? detail : "");
    ULONGLONG now = GetTickCount64();
    if (strcmp(sig, last_sig) == 0 && now - last_tick < 300000) return;
    strncpy_s(last_sig, sizeof(last_sig), sig, _TRUNCATE);
    last_tick = now;
    cb_logf("[attach] %s：%s", state, detail && detail[0] ? detail : "无详情");
}

#define PROBE_OK          1
#define PROBE_EVAL_FAIL   0
#define PROBE_MISS        (-1)

static int probe_target(SOCKET ws, char *desc, size_t cap) {
    char out[1024];
    static const char PROBE[] =
        "(function(){try{return JSON.stringify({cmder:(typeof window.legacyNativeCmder!==\"undefined\"),"
        "wp:(typeof window.webpackJsonp!==\"undefined\"),"
        "wc:(function(){for(var k in window){if(k.indexOf(\"webpackChunk\")===0)return true}return false})(),"
        "b:!!window.__chushiBridge,url:String(location.href).slice(0,120)})}catch(e){return \"{}\"}})()";
    if (!ws_eval(ws, PROBE, out, sizeof(out))) return PROBE_EVAL_FAIL;
    /* 三路判据任一命中即认是网易云页面（r2 只认 cmder，新版网易云
     * 若已移除 legacyNativeCmder 则永远 attach 不上——r3 放宽）：
     * cmder=原生桥 / wp=webpackJsonp(webpack4) / wc=webpackChunk*(webpack5)
     * / url 含 orpheus（网易云页面 scheme 兜底） */
    int is_ncm = strstr(out, "\"cmder\":true") != NULL
              || strstr(out, "\"wp\":true") != NULL
              || strstr(out, "\"wc\":true") != NULL
              || strstr(out, "orpheus:") != NULL
              || strstr(out, "music.163.com") != NULL;
    if (!is_ncm) return PROBE_MISS;
    /* 网易云页面命中；url 取出供日志 */
    if (desc && cap) {
        char url[160];
        const char *p = strstr(out, "\"url\":\"");
        if (p) {
            p += 7;
            size_t i = 0;
            while (p[i] && p[i] != '"' && i + 1 < sizeof(url)) { url[i] = p[i]; i++; }
            url[i] = 0;
            sprintf_s(desc, cap, "%s", url);
        } else desc[0] = 0;
    }
    return PROBE_OK;
}

typedef struct {
    int port_hit;
    char wsurl[256];
} target_pick;

static int discover_and_attach(const cfg *c, target_pick *tp) {
    int ports[2] = { c->cdp_port, DEFAULT_CDP_PORT };
    char wsurls[8][256];
    for (int pi = 0; pi < 2; pi++) {
        for (int off = 0; off <= 5; off++) {
            int port = ports[pi] + off;
            int n = cdp_list_targets(port, wsurls, 8);
            if (n <= 0) continue;
            EnterCriticalSection(&g_cb.lock);
            g_cb.cdp_port = port;
            LeaveCriticalSection(&g_cb.lock);
            char out[1024];
            for (int i = 0; i < n; i++) {
                SOCKET ws = ws_connect(wsurls[i]);
                if (ws == INVALID_SOCKET) {
                    attach_fail_log("ws-fail", cdp_last_error());
                    continue;
                }
                char desc[160];
                int pr = probe_target(ws, desc, sizeof(desc));
                if (pr == PROBE_EVAL_FAIL) {
                    ws_shutdown(ws);
                    attach_fail_log("probe-eval-fail", cdp_last_error());
                    continue;
                }
                if (pr == PROBE_MISS) {
                    ws_shutdown(ws);
                    attach_fail_log("probe-miss", "cmder/wp/webpackChunk/orpheus 判据均未命中（非网易云页面？）");
                    continue;
                }
                /* 注入页内桥 */
                if (!ws_eval(ws, BRIDGE_INSTALL_JS, out, sizeof(out))) {
                    ws_shutdown(ws);
                    attach_fail_log("install-fail", cdp_last_error());
                    continue;
                }
                if (!strstr(out, "chushi-bridge-installed")) {
                    ws_shutdown(ws);
                    char rd[192];
                    sprintf_s(rd, sizeof(rd), "注入回执异常：%.150s", out);
                    attach_fail_log("install-fail", rd);
                    continue;
                }
                char snap[CB_SNAP_MAX];
                if (!ws_eval(ws, "window.__chushiBridge.snapshot()", snap, sizeof(snap))) {
                    ws_shutdown(ws);
                    attach_fail_log("snap-fail", cdp_last_error());
                    continue;
                }
                if (!strstr(snap, "\"ok\":true") && !strstr(snap, "\"ok\":false")) {
                    ws_shutdown(ws);
                    char rd[192];
                    sprintf_s(rd, sizeof(rd), "快照回执异常：%.150s", snap);
                    attach_fail_log("snap-fail", rd);
                    continue;
                }
                /* 快照无论 ok 与否（no-source 也算页面正确），桥已可用 */
                InterlockedExchange(&g_cb.cdp_ok, 1);
                InterlockedExchange(&g_cb.bridge_installed, 1);
                cb_attach_set("ok", "");
                if (strstr(snap, "\"ok\":true")) {
                    const char *sp = strstr(snap, "\"snap\":{");
                    if (sp) {
                        /* 提取 snap 对象（括号配对） */
                        int depth = 0;
                        const char *q = sp + 8;
                        const char *end = q;
                        for (; *end; end++) {
                            if (*end == '{') depth++;
                            else if (*end == '}') { depth--; if (depth == 0) { end++; break; } }
                        }
                        if (depth == 0 && end - sp < CB_SNAP_MAX) {
                            char obj[CB_SNAP_MAX];
                            memcpy(obj, sp + 8, (size_t)(end - (sp + 8)));
                            obj[end - (sp + 8)] = 0;
                            cb_snap_set(obj);
                        }
                    }
                }
                cb_logf("已附加网易云页面（cdp %d）：%s", port, desc[0] ? desc : "(主界面)");
                tp->port_hit = port;
                strncpy_s(tp->wsurl, 256, wsurls[i], _TRUNCATE);
                return 1;
            }
        }
    }
    return 0;
}

static DWORD WINAPI cdp_thread(LPVOID arg) {
    cfg *c = (cfg *)arg;
    int first_boot = 1;

    /* --kill-ncm：先杀再 launch（安装器第 0 步已停则空操作）。
     * r2 版在 launch 之后的循环里才 kill——会把刚代启的带参实例误杀。 */
    if (c->kill_ncm) {
        c->kill_ncm = 0;
        kill_ncm();
        Sleep(500);
    }

    for (;;) {
        if (!InterlockedCompareExchange(&g_running, 1, 1)) break;

        /* ① NCM 进程状态 */
        wchar_t exe[MAX_PATH];
        DWORD pid = 0;
        int running = find_ncm_process(&pid, exe, MAX_PATH);
        EnterCriticalSection(&g_cb.lock);
        g_cb.ncm_running = running;
        if (running) {
            g_cb.ncm_pid = pid;
            if (exe[0]) wcscpy_s(g_cb.ncm_path, MAX_PATH, exe);
        }
        LeaveCriticalSection(&g_cb.lock);

        if (!running) {
            InterlockedExchange(&g_cb.cdp_ok, 0);
            InterlockedExchange(&g_cb.bridge_installed, 0);
            if (c->launch && first_boot) {
                if (launch_ncm(c)) {
                    first_boot = 0;
                    Sleep(4000);
                } else {
                    Sleep(10000);
                }
            } else {
                if (first_boot) {
                    cb_log("网易云未运行，等待其启动（或由 msimg32 装载器/手动启动）…");
                    first_boot = 0;
                }
                Sleep(3000);
            }
            continue;
        }

        if (c->kill_ncm) {   /* 理论不可达（开头已消费）；保底防误杀 */
            c->kill_ncm = 0;
            Sleep(1000);
            continue;
        }

        /* ② 发现并附加 */
        target_pick tp = { 0 };
        if (!discover_and_attach(c, &tp)) {
            if (first_boot && c->launch) {
                /* 进程在跑但没端口：多半是老进程（不带参启动的） */
                cb_log("网易云在运行但调试端口未开 —— 需要重启网易云（用本程序的快捷方式，或已装 msimg32 装载器则自动生效）");
                first_boot = 0;
            }
            Sleep(3000);
            continue;
        }
        first_boot = 0;

        /* ③ 附加后循环：命令消费 + 快照轮询 */
        SOCKET ws = ws_connect(tp.wsurl);
        int eval_fail = 0;
        while (ws != INVALID_SOCKET && InterlockedCompareExchange(&g_running, 1, 1)) {
            /* 进程还活着？ */
            if (!find_ncm_process(NULL, NULL, 0)) {
                cb_log("网易云已退出，桥接挂起等待");
                break;
            }
            /* 命令 */
            for (;;) {
                char *cmd = cb_cmd_pop();
                if (!cmd) break;
                char esc[CB_BODY_MAX * 6 + 16];
                js_escape_string(cmd, esc, sizeof(esc));
                char expr[CB_BODY_MAX * 6 + 128];
                sprintf_s(expr, sizeof(expr), "window.__chushiBridge.controlText(\"%s\")", esc);
                char out[512];
                if (ws_eval(ws, expr, out, sizeof(out))) {
                    if (strstr(out, "\"ok\":false")) cb_logf("命令执行失败：%s", out);
                } else {
                    cb_log("命令求值失败（连接断开？）");
                    free(cmd);
                    eval_fail = EV_FRAME_MAX;
                    break;
                }
                free(cmd);
            }
            if (eval_fail >= EV_FRAME_MAX) break;
            /* 快照 */
            char snap[CB_SNAP_MAX];
            if (ws_eval(ws, "window.__chushiBridge.snapshot()", snap, sizeof(snap))) {
                eval_fail = 0;
                if (strstr(snap, "\"ok\":true")) {
                    const char *sp = strstr(snap, "\"snap\":{");
                    if (sp) {
                        int depth = 0;
                        const char *q = sp + 8;
                        const char *end = q;
                        for (; *end; end++) {
                            if (*end == '{') depth++;
                            else if (*end == '}') { depth--; if (depth == 0) { end++; break; } }
                        }
                        if (depth == 0 && end - sp < CB_SNAP_MAX) {
                            char obj[CB_SNAP_MAX];
                            memcpy(obj, sp + 8, (size_t)(end - (sp + 8)));
                            obj[end - (sp + 8)] = 0;
                            cb_snap_set(obj);
                        }
                    }
                } else {
                    /* no-source：页面可能在加载中，静默重试 */
                }
                Sleep(POLL_MS);
            } else {
                eval_fail++;
                if (eval_fail >= EV_FRAME_MAX) {
                    attach_fail_log("poll-fail", cdp_last_error());
                    cb_log("CDP 求值连续失败，重新发现目标…");
                    break;
                }
                Sleep(500);
            }
        }
        if (ws != INVALID_SOCKET) ws_shutdown(ws);
        InterlockedExchange(&g_cb.cdp_ok, 0);
        InterlockedExchange(&g_cb.bridge_installed, 0);
        Sleep(2000);
    }
    return 0;
}

/* ---------- main ---------- */

int main(void) {
    SetConsoleOutputCP(65001);
    SetConsoleCP(65001);
    InitializeCriticalSection(&g_log_lock);

    cb_state_init(&g_cb);
    g_cb.cdp_port = DEFAULT_CDP_PORT;

    cfg c;
    load_config(&c);

    /* 参数覆盖（宽字符解析，支持含中文/空格的 --ncm 路径） */
    {
        int wargc = 0;
        LPWSTR *wargv = CommandLineToArgvW(GetCommandLineW(), &wargc);
        if (wargv) {
            for (int i = 1; i < wargc; i++) {
                if (!wcscmp(wargv[i], L"--cdp") && i + 1 < wargc) {
                    c.cdp_port = (int)wcstol(wargv[++i], NULL, 10);
                } else if (!wcscmp(wargv[i], L"--ncm") && i + 1 < wargc) {
                    wcsncpy_s(c.ncm_path, MAX_PATH, wargv[++i], _TRUNCATE);
                } else if (!wcscmp(wargv[i], L"--no-launch")) {
                    c.launch = 0;
                } else if (!wcscmp(wargv[i], L"--kill-ncm")) {
                    c.kill_ncm = 1;
                } else if (!wcscmp(wargv[i], L"--help") || !wcscmp(wargv[i], L"/?")) {
                    printf("ChuShiBridge %s — 初始音乐桥独立版\n用法: ChuShiBridge.exe [--cdp N] [--ncm 路径] [--no-launch] [--kill-ncm]\n", CB_VERSION);
                    LocalFree(wargv);
                    return 0;
                }
            }
            LocalFree(wargv);
        }
    }
    g_cb.cdp_port = c.cdp_port;

    /* 单实例 */
    HANDLE mutex = CreateMutexW(NULL, TRUE, L"Local\\ChuShiBridgeExe");
    (void)mutex;
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        printf("ChuShiBridge 已在运行（本程序常驻托盘外，请检查任务栏/任务管理器）。\n");
        return 0;
    }

    /* Winsock */
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        printf("WSAStartup 失败\n");
        return 1;
    }

    SetConsoleCtrlHandler(ctrl_handler, TRUE);

    printf("==============================================\n");
    printf("  初始音乐桥 · 独立版 v%s\n", CB_VERSION);
    printf("  为「初始」起始页提供网易云正在播放能力\n");
    printf("  本窗口请保持开启（关闭窗口 = 停止桥接）\n");
    printf("==============================================\n");
    cb_logf("ChuShiBridge v%s 启动（cdp=%d launch=%d kill=%d）",
            CB_VERSION, c.cdp_port, c.launch, c.kill_ncm);

    /* NCM 定位（提前做，写进共享状态供 /api/debug） */
    if (locate_ncm(&c)) {
        EnterCriticalSection(&g_cb.lock);
        wcscpy_s(g_cb.ncm_path, MAX_PATH, c.ncm_path);
        LeaveCriticalSection(&g_cb.lock);
    } else if (c.launch) {
        cb_log("警告：未能定位网易云，将无法代启（仍可附加已开的实例）");
    }

    HANDLE th1 = CreateThread(NULL, 0, cb_server_thread, NULL, 0, NULL);
    HANDLE th2 = CreateThread(NULL, 0, cdp_thread, &c, 0, NULL);
    (void)th1; (void)th2;

    /* 服务信息落盘（等 http 端口定下来） */
    for (int i = 0; i < 20; i++) {
        if (cb_server_port()) break;
        Sleep(200);
    }
    write_server_info(cb_server_port(), g_cb.cdp_port);

    while (InterlockedCompareExchange(&g_running, 1, 1)) Sleep(500);
    cb_log("退出");
    cb_state_free(&g_cb);
    WSACleanup();
    return 0;
}
