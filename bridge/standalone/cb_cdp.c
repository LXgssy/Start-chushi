/* cb_cdp.c — CEF 调试协议客户端
 *
 * 通道结构：exe ──ws──> CEF 浏览进程 DevTools 端点 ──> 主页面 JS 世界
 * 实现要点：
 *   - /json/list 发现：普通 HTTP GET，Connection: close 读到 EOF
 *   - WebSocket：RFC6455 最小子集——客户端帧必须掩码、服务端帧不掩码、
 *     分片（opcode 0）聚合、ping→pong、close→断开
 *   - Runtime.evaluate returnByValue，结果恒为字符串（页内桥 JSON.stringify 产物）
 *   - 反转义覆盖 \" \\ \/ \b \f \n \r \t \uXXXX（含代理对→UTF-8）
 */
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cb_cdp.h"
#include "cb_server.h"

static int send_all_local(SOCKET s, const char *buf, int len);

/* ---------- 基础 socket 工具 ---------- */

static SOCKET tcp_connect_host(const char *ip, int port) {
    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) return INVALID_SOCKET;
    struct sockaddr_in a;
    memset(&a, 0, sizeof(a));
    a.sin_family = AF_INET;
    a.sin_port = htons((unsigned short)port);
    if (InetPtonA(AF_INET, ip, &a.sin_addr) != 1) { closesocket(s); return INVALID_SOCKET; }
    if (connect(s, (struct sockaddr *)&a, sizeof(a)) != 0) { closesocket(s); return INVALID_SOCKET; }
    return s;
}

/* 读满 n 字节，deadline_ms 总时限；返回 1=完成 */
static int recv_all(SOCKET s, char *buf, size_t n, DWORD deadline_ms) {
    size_t got = 0;
    ULONGLONG end = GetTickCount64() + deadline_ms;
    while (got < n) {
        ULONGLONG left = end - GetTickCount64();
        if ((ULONGLONG)(LONG_PTR)left > (ULONGLONG)0x7FFFFFFF) left = 0;
        if (left == 0) return 0;
        fd_set r;
        FD_ZERO(&r);
        FD_SET(s, &r);
        struct timeval tv;
        tv.tv_sec = (long)(left / 1000);
        tv.tv_usec = (long)((left % 1000) * 1000);
        if (select(0, &r, NULL, NULL, &tv) <= 0) return 0;
        int k = recv(s, buf + got, (int)(n - got), 0);
        if (k <= 0) return 0;
        got += (size_t)k;
    }
    return 1;
}

/* 读到 EOF 或 cap-1 字节（/json/list 用）；返回字节数 */
static int recv_until_eof(SOCKET s, char *buf, size_t cap, DWORD deadline_ms) {
    size_t got = 0;
    ULONGLONG end = GetTickCount64() + deadline_ms;
    while (got + 1 < cap) {
        ULONGLONG left = end > GetTickCount64() ? end - GetTickCount64() : 0;
        if (left == 0) break;
        fd_set r;
        FD_ZERO(&r);
        FD_SET(s, &r);
        struct timeval tv;
        tv.tv_sec = (long)(left / 1000);
        tv.tv_usec = (long)((left % 1000) * 1000);
        if (select(0, &r, NULL, NULL, &tv) <= 0) break;
        int k = recv(s, buf + got, (int)(cap - 1 - got), 0);
        if (k <= 0) break;
        got += (size_t)k;
    }
    buf[got] = 0;
    return (int)got;
}

/* ---------- /json/list 发现 ---------- */

int cdp_list_targets(int port, char wsurls[][256], int max) {
    SOCKET s = tcp_connect_host("127.0.0.1", port);
    if (s == INVALID_SOCKET) return 0;
    char req[128];
    sprintf_s(req, sizeof(req),
              "GET /json/list HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nConnection: close\r\n\r\n", port);
    send_all_local(s, req, (int)strlen(req));
    static char body[256 * 1024];
    int n = recv_until_eof(s, body, sizeof(body), 8000);
    closesocket(s);
    if (n <= 0) return 0;
    char *hdr_end = strstr(body, "\r\n\r\n");
    if (!hdr_end) return 0;
    char *json = hdr_end + 4;
    if (!strstr(json, "\"page\"")) return 0;

    int found = 0;
    const char *p = json;
    while (found < max && (p = strstr(p, "webSocketDebuggerUrl")) != NULL) {
        const char *colon = strchr(p, ':');
        if (!colon) break;
        const char *q1 = strchr(colon + 1, '"');
        if (!q1) break;
        q1++;
        const char *q2 = strchr(q1, '"');
        if (!q2) break;
        size_t len = (size_t)(q2 - q1);
        if (len > 0 && len < 256) {
            memcpy(wsurls[found], q1, len);
            wsurls[found][len] = 0;
            found++;
        }
        p = q2 + 1;
    }
    return found;
}

static int send_all_local(SOCKET s, const char *buf, int len) {
    int off = 0;
    while (off < len) {
        int n = send(s, buf + off, len - off, 0);
        if (n <= 0) return 0;
        off += n;
    }
    return 1;
}

/* ---------- base64（握手 key 用，16B→24B） ---------- */

static const char B64T[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static void b64_16(const unsigned char in[16], char out[25]) {
    int o = 0;
    for (int i = 0; i < 16; i += 3) {
        unsigned v = (unsigned)in[i] << 16 | (unsigned)(i + 1 < 16 ? in[i + 1] : 0) << 8
                   | (unsigned)(i + 2 < 16 ? in[i + 2] : 0);
        out[o++] = B64T[(v >> 18) & 63];
        out[o++] = B64T[(v >> 12) & 63];
        out[o++] = (i + 1 < 16) ? B64T[(v >> 6) & 63] : '=';
        out[o++] = (i + 2 < 16) ? B64T[v & 63] : '=';
    }
    out[24] = 0;
}

/* ---------- WebSocket ---------- */

static int ws_send_frame(SOCKET s, int opcode, const char *payload, size_t len) {
    unsigned char hdr[14];
    size_t hl = 0;
    hdr[hl++] = (unsigned char)(0x80 | opcode);
    unsigned char mask[4];
    for (int i = 0; i < 4; i++) mask[i] = (unsigned char)(GetTickCount64() >> (i * 5)) ^ (unsigned char)GetCurrentProcessId();
    if (len < 126) {
        hdr[hl++] = (unsigned char)(0x80 | len);
    } else if (len < 65536) {
        hdr[hl++] = (unsigned char)(0x80 | 126);
        hdr[hl++] = (unsigned char)(len >> 8);
        hdr[hl++] = (unsigned char)(len & 0xFF);
    } else {
        hdr[hl++] = (unsigned char)(0x80 | 127);
        for (int i = 7; i >= 0; i--) hdr[hl++] = (unsigned char)(((unsigned long long)len >> (i * 8)) & 0xFF);
    }
    memcpy(hdr + hl, mask, 4);
    hl += 4;
    if (!send_all_local(s, (const char *)hdr, (int)hl)) return 0;
    char *masked = (char *)malloc(len ? len : 1);
    if (!masked) return 0;
    for (size_t i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
    int ok = send_all_local(s, masked, (int)len);
    free(masked);
    return ok;
}

typedef struct {
    char *buf;
    size_t len, cap;
    int done_opcode;
} ws_msg;

static void ws_msg_init(ws_msg *m) {
    m->cap = 64 * 1024;
    m->buf = (char *)malloc(m->cap);
    m->len = 0;
    m->done_opcode = -1;
    if (m->buf) m->buf[0] = 0;
}
static void ws_msg_free(ws_msg *m) { free(m->buf); m->buf = NULL; }
static void ws_msg_append(ws_msg *m, const char *data, size_t n) {
    if (!m->buf) return;
    if (m->len + n + 1 > m->cap) {
        while (m->len + n + 1 > m->cap && m->cap < (8u << 20)) m->cap *= 2;
        char *nb = (char *)realloc(m->buf, m->cap);
        if (!nb) { free(m->buf); m->buf = NULL; return; }
        m->buf = nb;
    }
    memcpy(m->buf + m->len, data, n);
    m->len += n;
    m->buf[m->len] = 0;
}

/* 读一帧；返回 1=文本/继续帧（数据在 out），0=连接失败，2=ping 已回 pong 需续读，
 * 3=close。deadline_ms 为总时限。 */
static int ws_read_frame(SOCKET s, ws_msg *m, DWORD deadline_ms) {
    unsigned char h2[2];
    if (!recv_all(s, (char *)h2, 2, deadline_ms)) return 0;
    int fin = (h2[0] & 0x80) != 0;
    int opcode = h2[0] & 0x0F;
    int masked = (h2[1] & 0x80) != 0;
    unsigned long long len = h2[1] & 0x7F;
    if (len == 126) {
        unsigned char ext[2];
        if (!recv_all(s, (char *)ext, 2, deadline_ms)) return 0;
        len = (unsigned long long)ext[0] << 8 | ext[1];
    } else if (len == 127) {
        unsigned char ext[8];
        if (!recv_all(s, (char *)ext, 8, deadline_ms)) return 0;
        len = 0;
        for (int i = 0; i < 8; i++) len = (len << 8) | ext[i];
    }
    unsigned char mask[4] = { 0, 0, 0, 0 };
    if (masked && !recv_all(s, (char *)mask, 4, deadline_ms)) return 0;
    if (len > (8u << 20)) return 0;

    char stackbuf[8192];
    size_t got = 0;
    while (got < len) {
        size_t want = len - got;
        if (want > sizeof(stackbuf)) want = sizeof(stackbuf);
        if (!recv_all(s, stackbuf, want, deadline_ms)) return 0;
        if (masked) for (size_t i = 0; i < want; i++) stackbuf[i] ^= mask[(got + i) & 3];
        ws_msg_append(m, stackbuf, want);
        got += want;
    }

    if (opcode == 0x9) {          /* ping → pong */
        ws_send_frame(s, 0xA, m->buf ? m->buf : "", m->len);
        m->len = 0; if (m->buf) m->buf[0] = 0;
        return 2;
    }
    if (opcode == 0x8) return 3;  /* close */
    if (opcode == 0x1 || opcode == 0x2 || opcode == 0x0) {
        if (fin) { m->done_opcode = opcode; return 1; }
        return 4;                  /* 分片未完（数据已聚合，继续读） */
    }
    return 5;                      /* 忽略其它帧 */
}

SOCKET ws_connect(const char *wsurl) {
    /* ws://127.0.0.1:PORT/devtools/page/XXXX */
    if (strncmp(wsurl, "ws://", 5) != 0) return INVALID_SOCKET;
    const char *hostport = wsurl + 5;
    const char *slash = strchr(hostport, '/');
    if (!slash) return INVALID_SOCKET;
    char hp[64];
    size_t hpl = (size_t)(slash - hostport);
    if (hpl >= sizeof(hp)) return INVALID_SOCKET;
    memcpy(hp, hostport, hpl);
    hp[hpl] = 0;
    char *colon = strchr(hp, ':');
    int port = colon ? atoi(colon + 1) : 80;

    SOCKET s = tcp_connect_host("127.0.0.1", port);
    if (s == INVALID_SOCKET) return INVALID_SOCKET;

    unsigned char key[16];
    for (int i = 0; i < 16; i++) key[i] = (unsigned char)(GetTickCount64() >> (i % 8)) ^ (unsigned char)rand();
    char kb[25];
    b64_16(key, kb);
    char req[512];
    int rn = sprintf_s(req, sizeof(req),
        "GET %s HTTP/1.1\r\n"
        "Host: 127.0.0.1:%d\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Key: %s\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n", slash, port, kb);
    if (!send_all_local(s, req, rn)) { closesocket(s); return INVALID_SOCKET; }

    /* 读响应头至 \r\n\r\n（101 响应无体） */
    char resp[2048];
    size_t got = 0;
    ULONGLONG end = GetTickCount64() + 8000;
    while (got + 1 < sizeof(resp)) {
        ULONGLONG left = end > GetTickCount64() ? end - GetTickCount64() : 0;
        if (left == 0) break;
        fd_set r;
        FD_ZERO(&r);
        FD_SET(s, &r);
        struct timeval tv;
        tv.tv_sec = (long)(left / 1000);
        tv.tv_usec = (long)((left % 1000) * 1000);
        if (select(0, &r, NULL, NULL, &tv) <= 0) break;
        int k = recv(s, resp + got, 1, 0);   /* 逐字节防吞分隔符（头部很短，性能无谓） */
        if (k <= 0) break;
        got += (size_t)k;
        if (got >= 4 && !memcmp(resp + got - 4, "\r\n\r\n", 4)) break;
    }
    resp[got] = 0;
    if (!strstr(resp, " 101")) { closesocket(s); return INVALID_SOCKET; }
    return s;
}

void ws_shutdown(SOCKET s) {
    if (s != INVALID_SOCKET) {
        shutdown(s, SD_BOTH);
        closesocket(s);
    }
}

/* ---------- 转义 ---------- */

void js_escape_string(const char *in, char *out, size_t cap) {
    size_t oi = 0;
    for (size_t i = 0; in[i] && oi + 8 < cap; i++) {
        unsigned char c = (unsigned char)in[i];
        if (c == '"') { out[oi++] = '\\'; out[oi++] = '"'; }
        else if (c == '\\') { out[oi++] = '\\'; out[oi++] = '\\'; }
        else if (c < 0x20 || c > 0x7E) {
            oi += sprintf_s(out + oi, cap - oi, "\\u%04x", c);
        } else out[oi++] = (char)c;
    }
    out[oi] = 0;
}

void json_escape_string(const char *in, char *out, size_t cap) {
    js_escape_string(in, out, cap);   /* JSON 字符串转义是 JS 字符串转义的子集（\/ 可不转） */
}

/* 从 JSON 文本中取 "key":"..." 的字符串值（首个命中），反转义到 out。
 * 供提取 CDP result.value（值为「页内桥 JSON 文本」的字符串化）。 */
static int json_str_value(const char *json, const char *key, char *out, size_t cap) {
    char pat[64];
    sprintf_s(pat, sizeof(pat), "\"%s\":", key);
    const char *p = strstr(json, pat);
    if (!p) return 0;
    p += strlen(pat);
    while (*p == ' ' || *p == '\t') p++;
    if (*p != '"') return 0;
    p++;
    size_t oi = 0;
    while (*p && *p != '"' && oi + 8 < cap) {
        if (*p == '\\') {
            p++;
            switch (*p) {
            case '"': out[oi++] = '"'; p++; break;
            case '\\': out[oi++] = '\\'; p++; break;
            case '/': out[oi++] = '/'; p++; break;
            case 'b': out[oi++] = '\b'; p++; break;
            case 'f': out[oi++] = '\f'; p++; break;
            case 'n': out[oi++] = '\n'; p++; break;
            case 'r': out[oi++] = '\r'; p++; break;
            case 't': out[oi++] = '\t'; p++; break;
            case 'u': {
                unsigned int cp = 0;
                for (int i = 1; i <= 4 && p[i]; i++) {
                    char c = p[i];
                    cp <<= 4;
                    if (c >= '0' && c <= '9') cp |= (unsigned)(c - '0');
                    else if (c >= 'a' && c <= 'f') cp |= (unsigned)(c - 'a' + 10);
                    else if (c >= 'A' && c <= 'F') cp |= (unsigned)(c - 'A' + 10);
                }
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
                /* UTF-8 编码 */
                if (cp < 0x80) out[oi++] = (char)cp;
                else if (cp < 0x800) {
                    out[oi++] = (char)(0xC0 | (cp >> 6));
                    out[oi++] = (char)(0x80 | (cp & 0x3F));
                } else if (cp < 0x10000) {
                    out[oi++] = (char)(0xE0 | (cp >> 12));
                    out[oi++] = (char)(0x80 | ((cp >> 6) & 0x3F));
                    out[oi++] = (char)(0x80 | (cp & 0x3F));
                } else {
                    out[oi++] = (char)(0xF0 | (cp >> 18));
                    out[oi++] = (char)(0x80 | ((cp >> 12) & 0x3F));
                    out[oi++] = (char)(0x80 | ((cp >> 6) & 0x3F));
                    out[oi++] = (char)(0x80 | (cp & 0x3F));
                }
                break;
            }
            default: out[oi++] = *p ? *p : ' '; if (*p) p++; break;
            }
        } else out[oi++] = *p++;
    }
    out[oi] = 0;
    return 1;
}

/* ---------- Runtime.evaluate ---------- */

static volatile LONG g_eval_seq = 0;

int ws_eval(SOCKET s, const char *expression, char *out, size_t out_cap) {
    out[0] = 0;
    char *esc = (char *)malloc(strlen(expression) * 6 + 16);
    if (!esc) return 0;
    json_escape_string(expression, esc, strlen(expression) * 6 + 16);
    long id = InterlockedIncrement(&g_eval_seq);
    char req[64];
    int rn = sprintf_s(req, sizeof(req),
        "{\"id\":%ld,\"method\":\"Runtime.evaluate\",\"params\":{\"expression\":\"", id);
    (void)rn;
    size_t total = strlen(esc) + 160;
    char *frame = (char *)malloc(total);
    if (!frame) { free(esc); return 0; }
    sprintf_s(frame, total,
        "{\"id\":%ld,\"method\":\"Runtime.evaluate\",\"params\":{\"expression\":\"%s\","
        "\"returnByValue\":true,\"userGesture\":true}}}",
        id, esc);
    free(esc);

    if (!ws_send_frame(s, 0x1, frame, strlen(frame))) { free(frame); return 0; }
    free(frame);

    /* 读到 id 匹配的响应（跳过事件帧/ping/close） */
    ULONGLONG end = GetTickCount64() + 10000;
    char idpat[32];
    sprintf_s(idpat, sizeof(idpat), "\"id\":%ld,", id);
    for (;;) {
        ULONGLONG left = end > GetTickCount64() ? end - GetTickCount64() : 0;
        if (left == 0) return 0;
        ws_msg m;
        ws_msg_init(&m);
        if (!m.buf) return 0;
        int r = ws_read_frame(s, &m, left);
        if (r == 2 || r == 4 || r == 5) { ws_msg_free(&m); continue; }   /* ping/分片/忽略 */
        if (r != 1) { ws_msg_free(&m); return 0; }                       /* close/断开 */
        int match = m.buf && strstr(m.buf, idpat) != NULL;
        if (match && strstr(m.buf, "\"error\"")) {
            /* CDP 报错（页面可能在跳转） */
            ws_msg_free(&m);
            return 0;
        }
        if (match) {
            int ok = json_str_value(m.buf, "value", out, out_cap);
            ws_msg_free(&m);
            return ok;
        }
        ws_msg_free(&m);
        /* 事件帧继续等 */
    }
}
