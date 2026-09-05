/* cb_server.c — 初始音乐桥独立版：仅回环 HTTP 服务
 *
 * 与 v1.7.5 bridge.dll 完全同契约（「初始」侧零改动）：
 *   GET  /api/ping     → {"ok":true,"name":"chushi-music-bridge",...}
 *   GET  /api/status   → 快照 JSON（无快照/过期 4s → 503）
 *   POST /api/control  → 校验后入队（cdp 线程消费），{"ok":true}
 *   GET  /api/debug    → 桥接诊断（排障「无反应」用）
 *   OPTIONS            → CORS 预检
 * 安全：仅绑 127.0.0.1、Origin 白名单、头 8KB/体 4KB/读超时 5s、
 *       控制体仅接受含 "action" 的 JSON 对象。
 */
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cb_server.h"

cb_state g_cb;

typedef struct cb_cmd {
    struct cb_cmd *next;
    char body[CB_BODY_MAX + 1];
    int len;
} cb_cmd;

void cb_state_init(cb_state *s) {
    memset(s, 0, sizeof(*s));
    InitializeCriticalSection(&s->lock);
}

void cb_state_free(cb_state *s) {
    EnterCriticalSection(&s->lock);
    free(s->snap);
    s->snap = NULL;
    free(s->diag_json);
    s->diag_json = NULL;
    struct cb_cmd *c = s->cmd_head;
    while (c) { struct cb_cmd *n = c->next; free(c); c = n; }
    s->cmd_head = s->cmd_tail = NULL;
    LeaveCriticalSection(&s->lock);
    DeleteCriticalSection(&s->lock);
}

/* ---------- 命令队列 ---------- */



int cb_cmd_push(const char *body, int len) {
    if (len <= 0 || len > CB_BODY_MAX) return 0;
    cb_cmd *c = (cb_cmd *)malloc(sizeof(cb_cmd));
    if (!c) return 0;
    memcpy(c->body, body, len);
    c->body[len] = 0;
    c->len = len;
    c->next = NULL;
    EnterCriticalSection(&g_cb.lock);
    if (g_cb.cmd_tail) g_cb.cmd_tail->next = c; else g_cb.cmd_head = c;
    g_cb.cmd_tail = c;
    LeaveCriticalSection(&g_cb.lock);
    return 1;
}

char *cb_cmd_pop(void) {
    EnterCriticalSection(&g_cb.lock);
    cb_cmd *c = g_cb.cmd_head;
    if (c) {
        g_cb.cmd_head = c->next;
        if (!g_cb.cmd_head) g_cb.cmd_tail = NULL;
    }
    LeaveCriticalSection(&g_cb.lock);
    if (!c) return NULL;
    char *out = (char *)malloc((size_t)c->len + 1);
    if (out) { memcpy(out, c->body, c->len); out[c->len] = 0; }
    free(c);
    return out;
}

/* ---------- 快照 ---------- */

void cb_snap_set(const char *snap_json) {
    size_t n = strlen(snap_json);
    if (n > CB_SNAP_MAX) n = CB_SNAP_MAX;
    char *copy = (char *)malloc(n + 1);
    if (!copy) return;
    memcpy(copy, snap_json, n);
    copy[n] = 0;
    EnterCriticalSection(&g_cb.lock);
    free(g_cb.snap);
    g_cb.snap = copy;
    g_cb.snap_tick = GetTickCount64();
    LeaveCriticalSection(&g_cb.lock);
}

char *cb_snap_get(void) {
    char *out = NULL;
    EnterCriticalSection(&g_cb.lock);
    if (g_cb.snap) {
        ULONGLONG age = GetTickCount64() - g_cb.snap_tick;
        if (age <= 4000) {
            out = (char *)malloc(strlen(g_cb.snap) + 1);
            if (out) strcpy(out, g_cb.snap);
        }
    }
    LeaveCriticalSection(&g_cb.lock);
    return out;
}

ULONGLONG cb_snap_age(void) {
    ULONGLONG r = 0xFFFFFFFF;
    EnterCriticalSection(&g_cb.lock);
    if (g_cb.snap) r = GetTickCount64() - g_cb.snap_tick;
    LeaveCriticalSection(&g_cb.lock);
    return r;
}

/* ---------- r5：快照回执诊断（外层 {ok,diag,error}） ---------- */

void cb_diag_set(int ok, const char *diag_json, const char *err) {
    char *copy = NULL;
    if (diag_json && diag_json[0]) {
        size_t n = strlen(diag_json);
        if (n > 400) n = 400;
        copy = (char *)malloc(n + 1);
        if (copy) { memcpy(copy, diag_json, n); copy[n] = 0; }
    }
    EnterCriticalSection(&g_cb.lock);
    free(g_cb.diag_json);
    g_cb.diag_json = copy;
    g_cb.snap_ok_flag = ok ? 1 : 0;
    strncpy_s(g_cb.snap_err, sizeof(g_cb.snap_err), err ? err : "", _TRUNCATE);
    LeaveCriticalSection(&g_cb.lock);
}

/* ---------- HTTP 基础（沿 bridge.c） ---------- */

typedef struct {
    char method[8];
    char path[128];
    char origin[256];
    int content_length;
} http_req;

static int starts_with(const char *s, const char *p) {
    return strncmp(s, p, strlen(p)) == 0;
}

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

static void respond(SOCKET s, int code, const char *reason, const char *ctype,
                    const char *body, size_t blen, const char *origin, int preflight) {
    char hdr[1152];
    char acao[300];
    acao[0] = 0;
    if (origin && origin_allowed(origin)) {
        sprintf_s(acao, sizeof(acao), "Access-Control-Allow-Origin: %s\r\n", origin);
    }
    if (preflight) {
        int hn = sprintf_s(hdr, sizeof(hdr),
            "HTTP/1.1 %d %s\r\n"
            "Content-Length: 0\r\n"
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type\r\n"
            "Access-Control-Allow-Private-Network: true\r\n"
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

static void parse_request(const char *buf, size_t n, http_req *req) {
    memset(req, 0, sizeof(*req));
    if (n > 4) {
        const char *sp = strchr(buf, ' ');
        if (sp && (size_t)(sp - buf) < sizeof(req->method)) {
            size_t ml = (size_t)(sp - buf);
            memcpy(req->method, buf, ml);
            req->method[ml] = 0;
            const char *p2 = strchr(sp + 1, ' ');
            size_t plen = p2 ? (size_t)(p2 - sp - 1) : 0;
            if (plen >= sizeof(req->path)) plen = sizeof(req->path) - 1;
            if (plen) { memcpy(req->path, sp + 1, plen); req->path[plen] = 0; }
        }
    }
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
            if (req->content_length > CB_BODY_MAX) req->content_length = CB_BODY_MAX;
        }
        line = eol + 1;
    }
}

#define RECV_BUF_MAX (8 * 1024)

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
        if (got >= 4) {
            for (size_t i = got - 4; ; i--) {
                if (buf[i] == '\r' && buf[i+1] == '\n' && buf[i+2] == '\r' && buf[i+3] == '\n') {
                    *hdr_len = i + 4;
                    *extra = got - *hdr_len;
                    return 1;
                }
                if (i == 0) break;
            }
        }
    }
    return 0;
}

/* 宽字符串 → JSON 字符串体（ASCII 化：非 ASCII 与控制字符转 \uXXXX） */
/* 定义见文末（头文件已声明） */

/* ---------- 路由 ---------- */

static void handle_ping(SOCKET s, const char *origin, int port) {
    char body[192];
    sprintf_s(body, sizeof(body),
              "{\"ok\":true,\"name\":\"%s\",\"version\":\"%s\",\"port\":%d}",
              CB_NAME, CB_VERSION, port);
    respond(s, 200, "OK", "application/json; charset=utf-8", body, strlen(body), origin, 0);
}

static void handle_status(SOCKET s, const char *origin) {
    char *snap = cb_snap_get();
    if (!snap) {
        const char *body = "{\"ok\":false,\"error\":\"no-state\"}";
        respond(s, 503, "Service Unavailable", "application/json; charset=utf-8",
                body, strlen(body), origin, 0);
        return;
    }
    respond(s, 200, "OK", "application/json; charset=utf-8", snap, strlen(snap), origin, 0);
    free(snap);
}

static void handle_control(SOCKET s, const char *origin, char *headbuf,
                           size_t hdr_len, size_t extra, http_req *req) {
    if (req->content_length <= 0) {
        const char *body = "{\"ok\":false,\"error\":\"empty-body\"}";
        respond(s, 400, "Bad Request", "application/json; charset=utf-8", body, strlen(body), origin, 0);
        return;
    }
    char body[CB_BODY_MAX + 1];
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
    if (body[0] != '{' || !strstr(body, "\"action\"")) {
        const char *rb = "{\"ok\":false,\"error\":\"bad-json\"}";
        respond(s, 400, "Bad Request", "application/json; charset=utf-8", rb, strlen(rb), origin, 0);
        return;
    }
    if (cb_cmd_push(body, (int)got)) {
        const char *rb = "{\"ok\":true}";
        respond(s, 200, "OK", "application/json; charset=utf-8", rb, strlen(rb), origin, 0);
    } else {
        const char *rb = "{\"ok\":false,\"error\":\"enqueue-failed\"}";
        respond(s, 500, "Internal Server Error", "application/json; charset=utf-8", rb, strlen(rb), origin, 0);
    }
}

/* ASCII 安全化（防 attachDetail 里的引号/控制字符/UTF-8 截断破坏 debug JSON） */
static void json_sanitize_ascii(const char *in, char *out, size_t cap);

static void handle_debug(SOCKET s, const char *origin, int port) {
    char body[2048];
    char ncmpath[300];
    cb_json_escape_w(g_cb.ncm_path, ncmpath, sizeof(ncmpath));
    ULONGLONG age = cb_snap_age();
    int b = InterlockedCompareExchange(&g_cb.bridge_installed, 0, 0);
    int c = InterlockedCompareExchange(&g_cb.cdp_ok, 0, 0);
    int nr = InterlockedCompareExchange(&g_cb.ncm_running, 0, 0);
    /* r5：真实 diag（页内回执）；从未收到时给出全 false 兜底段 */
    char diagbuf[512], diag_esc[640];
    int okflag = 0;
    char serr[96], serr_esc[160];
    {
        EnterCriticalSection(&g_cb.lock);
        if (g_cb.diag_json) {
            strncpy_s(diagbuf, sizeof(diagbuf), g_cb.diag_json, _TRUNCATE);
        } else diagbuf[0] = 0;
        okflag = g_cb.snap_ok_flag;
        memcpy(serr, g_cb.snap_err, sizeof(serr));
        LeaveCriticalSection(&g_cb.lock);
    }
    if (!diagbuf[0]) {
        strcpy_s(diagbuf, sizeof(diagbuf),
                 "{\"store\":false,\"cmder\":false,\"events\":false,\"media\":false}");
    }
    /* diag 段是页内 JSON.stringify 产物（合法 JSON）；非 ASCII/引号安全化后内嵌 */
    json_sanitize_ascii(diagbuf, diag_esc, sizeof(diag_esc));
    json_sanitize_ascii(serr, serr_esc, sizeof(serr_esc));
    /* attach 诊断：cdp_ok 时恒为 ok，否则展示最近失败状态 + 详情 */
    char ats[32], atd[192], ats_esc[72], atd_esc[384];
    cb_attach_get(ats, sizeof(ats), atd, sizeof(atd));
    if (c) { strcpy_s(ats, sizeof(ats), "ok"); atd[0] = 0; }
    json_sanitize_ascii(ats, ats_esc, sizeof(ats_esc));
    json_sanitize_ascii(atd, atd_esc, sizeof(atd_esc));
    sprintf_s(body, sizeof(body),
        "{\"ok\":true,\"version\":\"%s\",\"port\":%d,\"cdpPort\":%d,"
        "\"cdp\":%s,\"bridge\":%s,\"ncmRunning\":%s,\"ncmPid\":%lu,"
        "\"lastEvalAgoMs\":%llu,\"diag\":%s,\"snapOk\":%s,\"snapErr\":\"%s\","
        "\"attach\":\"%s\",\"attachDetail\":\"%s\","
        "\"ncmPath\":\"%s\"}",
        CB_VERSION, port, g_cb.cdp_port,
        c ? "true" : "false", b ? "true" : "false", nr ? "true" : "false",
        (unsigned long)g_cb.ncm_pid,
        (age == 0xFFFFFFFF) ? 0ULL : age,
        diag_esc,
        okflag ? "true" : "false",
        serr_esc,
        ats_esc, atd_esc, ncmpath);
    respond(s, 200, "OK", "application/json; charset=utf-8", body, strlen(body), origin, 0);
}

/* ---------- attach 诊断状态 ---------- */

static char g_attach_state[32] = "idle";
static char g_attach_detail[192] = "";

void cb_attach_set(const char *state, const char *detail) {
    EnterCriticalSection(&g_cb.lock);
    strncpy_s(g_attach_state, sizeof(g_attach_state), state ? state : "", _TRUNCATE);
    strncpy_s(g_attach_detail, sizeof(g_attach_detail), detail ? detail : "", _TRUNCATE);
    LeaveCriticalSection(&g_cb.lock);
}

void cb_attach_get(char *state, size_t scap, char *detail, size_t dcap) {
    EnterCriticalSection(&g_cb.lock);
    strncpy_s(state, scap, g_attach_state, _TRUNCATE);
    strncpy_s(detail, dcap, g_attach_detail, _TRUNCATE);
    LeaveCriticalSection(&g_cb.lock);
}

/* ASCII 安全化（防 attachDetail 里的引号/控制字符/UTF-8 截断破坏 debug JSON） */
static void json_sanitize_ascii(const char *in, char *out, size_t cap) {
    size_t oi = 0;
    for (size_t i = 0; in[i] && oi + 7 < cap; i++) {
        unsigned char c = (unsigned char)in[i];
        if (c == '"') { out[oi++] = '\\'; out[oi++] = '"'; }
        else if (c == '\\') { out[oi++] = '\\'; out[oi++] = '\\'; }
        else if (c < 0x20 || c > 0x7E) out[oi++] = ' ';
        else out[oi++] = (char)c;
    }
    out[oi] = 0;
}

/* 宽字符串 JSON 转义（非 ASCII → \uXXXX，代理对成对处理） */
void cb_json_escape_w(const wchar_t *w, char *out, size_t cap) {
    size_t oi = 0;
    for (size_t i = 0; w[i] && oi + 8 < cap; i++) {
        unsigned int c = (unsigned int)(unsigned short)w[i];
        if (c == '"') { out[oi++] = '\\'; out[oi++] = '"'; }
        else if (c == '\\') { out[oi++] = '\\'; out[oi++] = '\\'; }
        else if (c < 0x20 || c > 0x7E) {
            oi += sprintf_s(out + oi, cap - oi, "\\u%04x", c);
        } else out[oi++] = (char)c;
    }
    out[oi] = 0;
}

/* ---------- 服务器主循环 ---------- */

static volatile LONG g_server_port = 0;

int cb_server_port(void) { return InterlockedCompareExchange(&g_server_port, 0, 0); }

static DWORD WINAPI server_thread_inner(LPVOID arg) {
    int port = (int)(intptr_t)arg;
    SOCKET ls = INVALID_SOCKET;
    int bound = 0;
    for (int i = 0; i <= CB_PORT_SPAN; i++) {
        ls = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (ls == INVALID_SOCKET) break;
        BOOL reuse = TRUE;
        setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, (char *)&reuse, sizeof(reuse));
        struct sockaddr_in addr;
        memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_port = htons((unsigned short)(port + i));
        addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);   /* 仅回环 */
        if (bind(ls, (struct sockaddr *)&addr, sizeof(addr)) == 0 && listen(ls, 16) == 0) {
            port = port + i;
            bound = 1;
            break;
        }
        closesocket(ls);
    }
    if (!bound) { cb_log("HTTP 服务绑定失败（10754-10764 全占用）"); return 1; }
    InterlockedExchange(&g_server_port, port);
    {
        EnterCriticalSection(&g_cb.lock);
        g_cb.http_port = port;
        LeaveCriticalSection(&g_cb.lock);
    }
    char buf[128];
    sprintf_s(buf, sizeof(buf), "HTTP 服务就绪 127.0.0.1:%d", port);
    cb_log(buf);

    for (;;) {
        SOCKET c = accept(ls, NULL, NULL);
        if (c == INVALID_SOCKET) { Sleep(50); continue; }
        char *rbuf = (char *)malloc(RECV_BUF_MAX + 1);
        if (!rbuf) { closesocket(c); continue; }
        size_t hdr_len = 0, extra = 0;
        http_req req;
        if (!read_head(c, rbuf, RECV_BUF_MAX, &hdr_len, &extra)) {
            free(rbuf); closesocket(c); continue;
        }
        rbuf[hdr_len] = 0;
        parse_request(rbuf, hdr_len, &req);

        if (strcmp(req.method, "OPTIONS") == 0) {
            respond(c, 204, "No Content", "text/plain", NULL, 0, req.origin, 1);
        } else if (strcmp(req.path, "/api/ping") == 0 && strcmp(req.method, "GET") == 0) {
            handle_ping(c, req.origin, port);
        } else if (strcmp(req.path, "/api/status") == 0 && strcmp(req.method, "GET") == 0) {
            handle_status(c, req.origin);
        } else if (strcmp(req.path, "/api/control") == 0 && strcmp(req.method, "POST") == 0) {
            handle_control(c, req.origin, rbuf, hdr_len, extra, &req);
        } else if (strcmp(req.path, "/api/debug") == 0 && strcmp(req.method, "GET") == 0) {
            handle_debug(c, req.origin, port);
        } else {
            const char *body = "{\"ok\":false,\"error\":\"not-found\"}";
            respond(c, 404, "Not Found", "application/json; charset=utf-8", body, strlen(body), req.origin, 0);
        }
        shutdown(c, SD_BOTH);
        closesocket(c);
        free(rbuf);
    }
}

DWORD WINAPI cb_server_thread(LPVOID arg) {
    (void)arg;
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) { cb_log("WSAStartup 失败"); return 1; }
    server_thread_inner((LPVOID)(intptr_t)CB_DEFAULT_PORT);
    return 0;
}
