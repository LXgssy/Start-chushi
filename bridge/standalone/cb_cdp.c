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
#include <stdarg.h>

#include "cb_cdp.h"
#include "cb_server.h"

static int send_all_local(SOCKET s, const char *buf, int len);

/* ---------- 最近失败原因（排障） ---------- */

static char g_last_err[256] = "";

static void cdp_set_err(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(g_last_err, sizeof(g_last_err), fmt, ap);
    g_last_err[sizeof(g_last_err) - 1] = 0;
    va_end(ap);
}

const char *cdp_last_error(void) { return g_last_err; }

/* 在 [json, p) 范围内找最后一次出现的 "key":"..." 值（同一 target 对象内
 * url/type 字段位于 webSocketDebuggerUrl 之前，故向前搜最后一个命中）。 */
static const char *last_str_before(const char *json, const char *p,
                                   const char *key, char *out, size_t cap)
{
    char pat[24];
    snprintf(pat, sizeof(pat), "\"%s\":\"", key);
    const char *hit = NULL;
    for (const char *q = json; q && q < p; ) {
        const char *r = strstr(q, pat);
        if (!r || r >= p) break;
        hit = r + strlen(pat);
        q = hit;
    }
    if (!hit) { out[0] = 0; return NULL; }
    size_t i = 0;
    for (; hit[i] && hit[i] != '"' && i + 1 < cap; i++) out[i] = hit[i];
    out[i] = 0;
    return out;
}

/* target 的 type/url 提取：先向前搜；url 找不到时向后搜最近一段
 * （实测 CloudMusic CEF 的 /json/list 字段顺序非标准，url 可能在
 * webSocketDebuggerUrl 之后）。 */
static void target_desc_at(const char *json, const char *p,
                           char *out_type, size_t tcap, char *out_url, size_t ucap)
{
    last_str_before(json, p, "type", out_type, tcap);
    last_str_before(json, p, "url", out_url, ucap);
    if (!out_url[0]) {
        const char *e = strstr(p, "\"url\":\"");
        if (e) {
            e += 7;
            size_t i = 0;
            for (; e[i] && e[i] != '"' && i + 1 < ucap; i++) out_url[i] = e[i];
            out_url[i] = 0;
        }
    }
}

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

/* 通用 /json HTTP GET（/json/list 与 /json/version 共用），body 以 0 结尾，返回字节数 */
static int cdp_http_body(int port, const char *path, char *buf, size_t cap, DWORD deadline_ms)
{
    SOCKET s = tcp_connect_host("127.0.0.1", port);
    if (s == INVALID_SOCKET) return 0;
    char req[160];
    snprintf(req, sizeof(req),
             "GET %s HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nConnection: close\r\n\r\n",
             path, port);
    if (!send_all_local(s, req, (int)strlen(req))) { closesocket(s); return 0; }
    int n = recv_until_eof(s, buf, cap, deadline_ms);
    closesocket(s);
    if (n <= 0) return 0;
    char *hdr_end = strstr(buf, "\r\n\r\n");
    if (!hdr_end) return 0;
    memmove(buf, hdr_end + 4, strlen(hdr_end + 4) + 1);
    return (int)strlen(buf);
}

int cdp_list_targets(int port, char wsurls[][256], int max) {
    static char body[256 * 1024];
    int n = cdp_http_body(port, "/json/list", body, sizeof(body), 8000);
    if (n <= 0) return 0;
    char *json = body;
    if (!strstr(json, "\"page\"")) return 0;

    int found = 0;
    const char *p = json;
    char desc[512];
    size_t doff = 0;
    desc[0] = 0;
    while (found < max && (p = strstr(p, "webSocketDebuggerUrl")) != NULL) {
        /* 同步提取该 target 的 type/url 供日志（前后双搜，兼容非标准字段顺序） */
        char ttype[32], turl[192];
        target_desc_at(json, p, ttype, sizeof(ttype), turl, sizeof(turl));
        if (doff < sizeof(desc) - 220 && doff)
            desc[doff++] = ';';
        if (doff < sizeof(desc) - 220)
            doff += (size_t)snprintf(desc + doff, sizeof(desc) - doff, "%s|%s",
                                     ttype[0] ? ttype : "page", turl);
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
    if (found > 0) {
        /* 节流日志：仅目标清单变化时打（避免 3s 轮询刷屏） */
        static int    last_n = -1;
        static int    last_port = -1;
        static char   last_desc[512];
        if (found != last_n || port != last_port || strcmp(desc, last_desc) != 0) {
            cb_logf("CDP 目标清单（cdp %d，%d 个）：%s", port, found, desc);
            last_n = found; last_port = port;
            strncpy(last_desc, desc, sizeof(last_desc) - 1);
            last_desc[sizeof(last_desc) - 1] = 0;
        }
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
    if (strncmp(wsurl, "ws://", 5) != 0) {
        cdp_set_err("ws-url-bad");
        return INVALID_SOCKET;
    }
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
    if (!strstr(resp, " 101")) {
        /* 记录状态行（403=Origin 校验被拒 / 404=target 已销毁等） */
        char line[80];
        size_t li = 0;
        const char *st = strstr(resp, "HTTP/1.");
        if (st) {
            while (st[li] && st[li] != '\r' && li + 1 < sizeof(line)) { line[li] = st[li]; li++; }
        }
        line[li] = 0;
        cdp_set_err("ws-handshake: %s", li ? line : "no-http-status");
        closesocket(s);
        return INVALID_SOCKET;
    }
    cdp_set_err("");
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

/* 读一条完整消息（跨 continuation 帧聚合在同一缓冲，修复分片丢失 bug）。
 * ping 自动回 pong 后续读；close 帧解析状态码/原因进 cdp_last_error；
 * 断开返回 0；完整消息返回 1。 */
static int ws_read_message(SOCKET s, ws_msg *m, DWORD deadline_ms)
{
    ULONGLONG end = GetTickCount64() + deadline_ms;
    m->len = 0;
    if (m->buf) m->buf[0] = 0;
    m->done_opcode = -1;
    for (;;) {
        ULONGLONG left = end > GetTickCount64() ? end - GetTickCount64() : 0;
        if (left == 0) { cdp_set_err("read-timeout"); return 0; }
        int r = ws_read_frame(s, m, (DWORD)left);
        if (r == 1) return 1;   /* fin 帧：数据已全部聚合在 m */
        if (r == 4) continue;   /* 分片未完：缓冲保留，继续读 */
        if (r == 2 || r == 5) { /* ping/忽略帧：清临时数据继续 */
            m->len = 0;
            if (m->buf) m->buf[0] = 0;
            continue;
        }
        if (r == 3) {
            /* close 帧负载 = 2 字节大端状态码 + 可选原因——CEF 端拒绝的直接证据
             * （1002 协议错 / 1000 正常关 / 1001 去 / 1011 内部错…） */
            unsigned code = 0;
            char reason[96] = { 0 };
            if (m->len >= 2) {
                code = ((unsigned char)m->buf[0] << 8) | (unsigned char)m->buf[1];
                size_t rl = m->len - 2;
                if (rl > sizeof(reason) - 1) rl = sizeof(reason) - 1;
                for (size_t k = 0; k < rl; k++) {
                    unsigned char cc = (unsigned char)m->buf[2 + k];
                    reason[k] = (cc >= 0x20 && cc <= 0x7E) ? (char)cc : ' ';
                }
                reason[rl] = 0;
            }
            cdp_set_err("ws-close(%u%s%s)", code, reason[0] ? ": " : "", reason);
            return 0;
        }
        return 0;               /* TCP 断开（无 close 帧） */
    }
}

/* ---------- Runtime.evaluate 与通用 CDP 命令 ---------- */

static volatile LONG g_eval_seq = 0;

/* 发送一条 CDP 命令并等到 id 匹配的响应帧（事件帧自动跳过、close 帧解析、
 * 分片聚合）。m 由调用方 init/free，响应帧全文在 m->buf。返回 1=成功。 */
static int cdp_command(SOCKET ws, const char *method, const char *params_json,
                       const char *session, ws_msg *m, DWORD timeout_ms)
{
    long id = InterlockedIncrement(&g_eval_seq);
    size_t plen = params_json ? strlen(params_json) : 2;
    size_t slen = session ? strlen(session) : 0;
    size_t total = strlen(method) + plen + slen + 96;
    char *frame = (char *)malloc(total);
    if (!frame) { cdp_set_err("cmd-oom"); return 0; }
    if (session)
        sprintf_s(frame, total,
                  "{\"id\":%ld,\"method\":\"%s\",\"params\":%s,\"sessionId\":\"%s\"}",
                  id, method, params_json ? params_json : "{}", session);
    else
        sprintf_s(frame, total,
                  "{\"id\":%ld,\"method\":\"%s\",\"params\":%s}",
                  id, method, params_json ? params_json : "{}");
    int sent = ws_send_frame(ws, 0x1, frame, strlen(frame));
    free(frame);
    if (!sent) { cdp_set_err("cmd-send-failed"); return 0; }

    char idpat[32];
    sprintf_s(idpat, sizeof(idpat), "\"id\":%ld,", id);
    ULONGLONG end = GetTickCount64() + timeout_ms;
    for (;;) {
        ULONGLONG left = end > GetTickCount64() ? end - GetTickCount64() : 0;
        if (left == 0) { cdp_set_err("cmd-timeout(%lums)", (unsigned long)timeout_ms); return 0; }
        m->len = 0;
        if (m->buf) m->buf[0] = 0;
        int r = ws_read_message(ws, m, (DWORD)left);
        if (r != 1 || !m->buf) return 0;   /* close/断开：err 已由 read_message 填写 */
        if (!strstr(m->buf, idpat)) continue;   /* 事件帧，继续等 */
        if (strstr(m->buf, "\"error\"")) {
            char emsg[160];
            if (json_str_value(m->buf, "message", emsg, sizeof(emsg)) && emsg[0])
                cdp_set_err("cdp-error: %.110s", emsg);
            else
                cdp_set_err("cdp-error(frame %.140s)", m->buf);
            return 0;
        }
        cdp_set_err("");
        return 1;
    }
}

/* 会话版 evaluate：flatten 通道带 sessionId，页端点 session=NULL */
int ws_eval_ex(SOCKET ws, const char *session, const char *expression, char *out, size_t out_cap)
{
    out[0] = 0;
    char *esc = (char *)malloc(strlen(expression) * 6 + 16);
    if (!esc) { cdp_set_err("eval-oom"); return 0; }
    json_escape_string(expression, esc, strlen(expression) * 6 + 16);
    size_t total = strlen(esc) + 96;
    char *params = (char *)malloc(total);
    if (!params) { free(esc); cdp_set_err("eval-oom"); return 0; }
    sprintf_s(params, total,
              "{\"expression\":\"%s\",\"returnByValue\":true,\"userGesture\":true}",
              esc);
    free(esc);

    ws_msg m;
    ws_msg_init(&m);
    int ok = 0;
    if (m.buf && cdp_command(ws, "Runtime.evaluate", params, session, &m, 10000)) {
        if (json_str_value(m.buf, "value", out, out_cap)) ok = 1;
        else cdp_set_err("eval-no-value: %.170s", m.buf);
    }
    ws_msg_free(&m);
    free(params);
    return ok;
}

int ws_eval(SOCKET s, const char *expression, char *out, size_t out_cap)
{
    return ws_eval_ex(s, NULL, expression, out, out_cap);
}

/* ---------- r4：browser flatten 会话通道 ---------- */

/* GET /json/version → browser 端点 wsurl */
static int cdp_browser_wsurl(int port, char *out, size_t cap)
{
    static char body[16 * 1024];
    int n = cdp_http_body(port, "/json/version", body, sizeof(body), 5000);
    if (n <= 0) return 0;
    const char *w = strstr(body, "\"webSocketDebuggerUrl\":\"");
    if (!w) return 0;
    w += 24;
    const char *e = strchr(w, '"');
    if (!e || (size_t)(e - w) < 10 || (size_t)(e - w) >= cap) return 0;
    memcpy(out, w, (size_t)(e - w));
    out[e - w] = 0;
    return 1;
}

/* 端口活性（/json/version 可达即活；某些 CEF 的 /json/list 可能受限） */
int cdp_port_alive(int port)
{
    static char b[1024];
    return cdp_http_body(port, "/json/version", b, sizeof(b), 3000) > 0;
}

/* 从 Target.getTargets 响应里挑 page targetId（url 含 needle；needle 空串=任意 page）。
 * targetInfo 内 targetId 在前、type/url 随后，以下一个 "targetId" 或数组尾为界。 */
static int pick_page_target(const char *json, const char *needle,
                            char *tid, size_t tid_cap, char *url_out, size_t ucap)
{
    if (url_out && ucap) url_out[0] = 0;
    const char *p = json;
    while ((p = strstr(p, "\"targetId\":\"")) != NULL) {
        p += 12;
        const char *e = strchr(p, '"');
        if (!e) break;
        size_t idlen = (size_t)(e - p);
        const char *next = strstr(e, "\"targetId\":\"");
        const char *scope_end = next ? next : e + strlen(e);
        size_t seg = (size_t)(scope_end - p);
        char segbuf[1024];
        if (seg >= sizeof(segbuf)) seg = sizeof(segbuf) - 1;
        memcpy(segbuf, p, seg);
        segbuf[seg] = 0;
        if (idlen >= 8 && idlen < tid_cap
            && strstr(segbuf, "\"type\":\"page\"")
            && (!needle || !needle[0] || strstr(segbuf, needle))) {
            memcpy(tid, p, idlen);
            tid[idlen] = 0;
            if (url_out && ucap) {
                const char *u = strstr(segbuf, "\"url\":\"");
                if (u) {
                    u += 7;
                    size_t i = 0;
                    for (; u[i] && u[i] != '"' && i + 1 < ucap; i++) url_out[i] = u[i];
                    url_out[i] = 0;
                }
            }
            return 1;
        }
        p = e;
    }
    return 0;
}

/* 页面判定探针：三路判据任一命中即认网易云。
 * 返回 1=命中（desc=location.href）；0=eval 失败；-1=非网易云页。 */
int cdp_probe_page(cdp_chan *ch, char *desc, size_t dcap)
{
    static const char PROBE[] =
        "(function(){try{return JSON.stringify({cmder:(typeof window.legacyNativeCmder!==\"undefined\"),"
        "wp:(typeof window.webpackJsonp!==\"undefined\"),"
        "wc:(function(){for(var k in window){if(k.indexOf(\"webpackChunk\")===0)return true}return false})(),"
        "b:!!window.__chushiBridge,url:String(location.href).slice(0,120)})}catch(e){return \"{}\"}})()";
    char out[1024];
    if (!cdp_eval(ch, PROBE, out, sizeof(out))) return 0;
    int is_ncm = strstr(out, "\"cmder\":true") != NULL
              || strstr(out, "\"wp\":true") != NULL
              || strstr(out, "\"wc\":true") != NULL
              || strstr(out, "orpheus:") != NULL
              || strstr(out, "music.163.com") != NULL;
    if (!is_ncm) return CDP_PROBE_MISS;
    if (desc && dcap) {
        char url[160];
        const char *p = strstr(out, "\"url\":\"");
        if (p) {
            p += 7;
            size_t i = 0;
            while (p[i] && p[i] != '"' && i + 1 < sizeof(url)) { url[i] = p[i]; i++; }
            url[i] = 0;
            sprintf_s(desc, dcap, "%s", url);
        } else desc[0] = 0;
    }
    return 1;
}

int cdp_open_target(int port, cdp_chan *ch, char *desc, size_t dcap)
{
    ch->ws = INVALID_SOCKET;
    ch->session_id[0] = 0;
    ch->flatten = 0;
    if (desc && dcap) desc[0] = 0;

    /* ---------- ① browser flatten 模式（r4 主路：页端点被 CloudMusic CEF
     * 握手后立即 close，browser 端点 + Target.attachToTarget 是网易云生态
     * 适配器的标准路径） ---------- */
    char bws[256];
    if (cdp_browser_wsurl(port, bws, sizeof(bws))) {
        SOCKET ws = ws_connect(bws);
        if (ws != INVALID_SOCKET) {
            static char tj[32 * 1024];   /* getTargets 响应（cdp 线程独占） */
            ws_msg m;
            ws_msg_init(&m);
            int done = 0;
            if (m.buf && cdp_command(ws, "Target.getTargets", "{}", NULL, &m, 6000)) {
                strncpy_s(tj, sizeof(tj), m.buf, _TRUNCATE);
                static const char *needles[3] = { "orpheus", "music.163.com", "" };
                for (int ni = 0; ni < 3 && !done; ni++) {
                    char tid[64], turl[192];
                    if (!pick_page_target(tj, needles[ni], tid, sizeof(tid), turl, sizeof(turl)))
                        continue;
                    char ap[128];
                    sprintf_s(ap, sizeof(ap), "{\"targetId\":\"%s\",\"flatten\":true}", tid);
                    if (!cdp_command(ws, "Target.attachToTarget", ap, NULL, &m, 6000))
                        continue;
                    char sid[64];
                    if (!json_str_value(m.buf, "sessionId", sid, sizeof(sid)) || !sid[0])
                        continue;
                    ch->ws = ws;
                    strcpy_s(ch->session_id, sizeof(ch->session_id), sid);
                    ch->flatten = 1;
                    int pr = cdp_probe_page(ch, desc, dcap);
                    if (pr == 1) { done = 1; break; }
                    /* 非网易云页/eval 失败：弃会话，试下一 needle */
                    ch->ws = INVALID_SOCKET;
                    ch->flatten = 0;
                    ch->session_id[0] = 0;
                }
            }
            ws_msg_free(&m);
            if (done) {
                cdp_set_err("");
                return 1;
            }
            ws_shutdown(ws);
            /* flatten 通路失败但页端点可能可用——继续回退 */
        }
    }

    /* ---------- ② page 端点回退 ---------- */
    {
        char wsurls[8][256];
        int n = cdp_list_targets(port, wsurls, 8);
        for (int i = 0; i < n; i++) {
            SOCKET ws = ws_connect(wsurls[i]);
            if (ws == INVALID_SOCKET) continue;
            ch->ws = ws;
            ch->flatten = 0;
            ch->session_id[0] = 0;
            int pr = cdp_probe_page(ch, desc, dcap);
            if (pr == 1) { cdp_set_err(""); return 1; }
            ch->ws = INVALID_SOCKET;
            ws_shutdown(ws);
        }
    }
    return 0;
}

int cdp_eval(cdp_chan *ch, const char *expression, char *out, size_t out_cap)
{
    return ws_eval_ex(ch->ws, ch->flatten ? ch->session_id : NULL, expression, out, out_cap);
}

void cdp_close(cdp_chan *ch)
{
    if (ch->ws != INVALID_SOCKET) {
        ws_shutdown(ch->ws);
        ch->ws = INVALID_SOCKET;
    }
    ch->session_id[0] = 0;
    ch->flatten = 0;
}
