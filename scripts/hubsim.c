/* ============================================================================
 * hubsim.c — chushi_hub.c 的 POSIX 逐行移植（协议逻辑 1:1，仅换 socket 层）
 * 目的：在 Linux 上以【真实 C 解析/队列/租约代码】复现「页面 POST → 桥 GET」
 * 全链路，验证 v8.0.7 hub 是否真的会把命令交给持有者桥。
 * 移植范围：readRequest / handleRequest / pollClaim / queryIdMatches /
 *           extractBodyId / dataEnqueueCmd / dataDrainCmds / 响应工具。
 * 编译：gcc -O2 -o hubsim hubsim.c
 * ==========================================================================*/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdint.h>
#include <unistd.h>
#include <time.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <pthread.h>

#define PLUGIN_VERSION "8.0.8"
#define HUB_NAME_S "chushi-music-hub"
#define REQ_MAX (256 * 1024)
#define STATE_MAX (1024 * 1024)
#define LYRIC_MAX (1024 * 1024)
#define CMD_QUEUE_MAX 32
#define CMD_MAX (8 * 1024)
#define POLL_ID_MAX 40
#define POLL_LEASE_MS 4000

typedef uint32_t DWORD;
typedef int BOOL;
#define TRUE 1
#define FALSE 0

static DWORD tickNow(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (DWORD)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

/* ---- 共享数据 ---- */
static pthread_mutex_t g_dataMutex = PTHREAD_MUTEX_INITIALIZER;

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
static int     g_cmdHead = 0;
static int     g_cmdCount = 0;
static DWORD   g_cmdNextId = 1;

static char   g_pollId[POLL_ID_MAX + 1] = {0};
static DWORD  g_pollExpires = 0;
static int    g_pollSeen = 0;

static int leaseActive(DWORD now) {
    return (g_pollSeen && (int32_t)(now - g_pollExpires) < 0);
}

static void dataStoreState(const char* body, DWORD len) {
    if (!body || len == 0) return;
    if (len > STATE_MAX) len = STATE_MAX;
    pthread_mutex_lock(&g_dataMutex);
    memcpy(g_state, body, len);
    g_state[len] = 0;
    g_stateLen = len;
    pthread_mutex_unlock(&g_dataMutex);
}

static DWORD dataReadState(char* out, DWORD cap) {
    DWORD n = 0;
    pthread_mutex_lock(&g_dataMutex);
    if (g_stateLen > 0 && g_stateLen <= cap) {
        memcpy(out, g_state, g_stateLen);
        n = g_stateLen;
    }
    pthread_mutex_unlock(&g_dataMutex);
    return n;
}

static void dataStoreLyric(const char* body, DWORD len) {
    if (!body || len == 0) return;
    if (len > LYRIC_MAX) len = LYRIC_MAX;
    pthread_mutex_lock(&g_dataMutex);
    memcpy(g_lyric, body, len);
    g_lyric[len] = 0;
    g_lyricLen = len;
    pthread_mutex_unlock(&g_dataMutex);
}

static DWORD dataReadLyric(char* out, DWORD cap) {
    DWORD n = 0;
    pthread_mutex_lock(&g_dataMutex);
    if (g_lyricLen > 0 && g_lyricLen <= cap) {
        memcpy(out, g_lyric, g_lyricLen);
        n = g_lyricLen;
    }
    pthread_mutex_unlock(&g_dataMutex);
    return n;
}

static void dataEnqueueCmd(const char* body, DWORD len) {
    if (!body || len == 0) return;
    if (len > CMD_MAX) len = CMD_MAX;
    pthread_mutex_lock(&g_dataMutex);
    if (g_cmdCount >= CMD_QUEUE_MAX) {
        g_cmdHead = (g_cmdHead + 1) % CMD_QUEUE_MAX;
        g_cmdCount--;
    }
    int slot = (g_cmdHead + g_cmdCount) % CMD_QUEUE_MAX;
    memcpy(g_cmdQueue[slot].body, body, len);
    g_cmdQueue[slot].body[len] = 0;
    g_cmdQueue[slot].len = len;
    g_cmdQueue[slot].id = g_cmdNextId++;
    g_cmdCount++;
    pthread_mutex_unlock(&g_dataMutex);
}

static DWORD g_drainLastN = 0;
static DWORD dataDrainCmds(char* out, DWORD cap) {
    DWORD used = 0;
    out[0] = '[';
    used = 1;
    pthread_mutex_lock(&g_dataMutex);
    int drained = g_cmdCount;
    for (int i = 0; i < drained; i++) {
        int idx = (g_cmdHead + i) % CMD_QUEUE_MAX;
        char head[40];
        int hn = snprintf(head, sizeof(head), "%s{\"_id\":%lu,\"raw\":",
                          i ? "," : "", (unsigned long)g_cmdQueue[idx].id);
        if (hn < 0) hn = 0;
        DWORD need = (DWORD)hn + g_cmdQueue[idx].len + 1;
        if (used + need + 1 > cap) { drained = i; break; }
        memcpy(out + used, head, (DWORD)hn);
        used += (DWORD)hn;
        memcpy(out + used, g_cmdQueue[idx].body, g_cmdQueue[idx].len);
        used += g_cmdQueue[idx].len;
        out[used++] = '}'; /* v8.0.8 生死一字 */
    }
    g_cmdHead = (g_cmdHead + drained) % CMD_QUEUE_MAX;
    g_cmdCount -= drained;
    g_drainLastN = (DWORD)drained;
    pthread_mutex_unlock(&g_dataMutex);
    out[used++] = ']';
    out[used] = 0;
    return used;
}

/* ---- v8.0.8 请求日志环形（与实物 1:1） ---- */
#define HUBLOG_MAX 48
static char     g_hubLog[HUBLOG_MAX][128];
static DWORD    g_hubLogTick[HUBLOG_MAX];
static int      g_hubLogHead = 0;
static int      g_hubLogCount = 0;
static DWORD    g_hubLogSeq = 0;

static void hubLogAdd(const char* fmt, ...) {
    char line[128];
    va_list args;
    va_start(args, fmt);
    int n = vsnprintf(line, sizeof(line) - 1, fmt, args);
    va_end(args);
    if (n < 0) n = 0;
    if (n > (int)sizeof(line) - 1) n = (int)sizeof(line) - 1;
    for (int k = 0; k < n; k++) { if (line[k] == '"') line[k] = '\''; if ((unsigned char)line[k] < 0x20) line[k] = ' '; }
    pthread_mutex_lock(&g_dataMutex);
    int slot = g_hubLogHead;
    memcpy(g_hubLog[slot], line, (size_t)n + 1);
    g_hubLog[slot][sizeof(g_hubLog[0]) - 1] = 0;
    g_hubLogTick[slot] = tickNow();
    g_hubLogHead = (g_hubLogHead + 1) % HUBLOG_MAX;
    if (g_hubLogCount < HUBLOG_MAX) g_hubLogCount++;
    g_hubLogSeq++;
    pthread_mutex_unlock(&g_dataMutex);
}

/* ---- v8.0.7 租约 ---- */
static void extractBodyId(const char* body, DWORD bodyLen, char* out, int cap) {
    int n = 0;
    out[0] = 0;
    if (!body || bodyLen < 4) return;
    const char* key = strstr(body, "\"id\"");
    if (!key) return;
    const char* p = strchr(key + 4, ':');
    if (!p) return;
    p = strchr(p + 1, '"');
    if (!p) return;
    p++;
    while (*p && *p != '"' && n < cap - 1) {
        char c = *p;
        if (c != '\\' && c >= 0x20 && c <= 0x7e) out[n++] = c;
        p++;
    }
    out[n] = 0;
}

static int queryIdMatches(const char* path, const char* expect) {
    const char* q = strstr(path, "id=");
    if (!q || !expect[0]) return 0;
    q += 3;
    int n = 0;
    while (q[n] && q[n] != '&' && q[n] != ' ') n++;
    if (n == 0) return 0;
    return (n == (int)strlen(expect) && strncmp(q, expect, n) == 0);
}

static int pollClaim(const char* body, DWORD bodyLen, char* resp, int respCap) {
    char id[POLL_ID_MAX + 1];
    extractBodyId(body, bodyLen, id, sizeof(id));
    if (!id[0]) {
        snprintf(resp, respCap, "{\"ok\":false,\"error\":\"no-id\"}");
        return 0;
    }
    DWORD now = tickNow();
    int granted = 0;
    int logKind = 0;
    pthread_mutex_lock(&g_dataMutex);
    if (!g_pollSeen || strncmp(id, g_pollId, POLL_ID_MAX) == 0 || !leaseActive(now)) {
        if (!g_pollSeen || strncmp(id, g_pollId, POLL_ID_MAX) != 0) {
            fprintf(stderr, "[poll] holder <- %s%s\n", id,
                    g_pollSeen ? " (takeover)" : " (first)");
            logKind = g_pollSeen ? 2 : 1;
        }
        snprintf(g_pollId, sizeof(g_pollId), "%s", id);
        g_pollExpires = now + POLL_LEASE_MS;
        g_pollSeen = 1;
        granted = 1;
    }
    pthread_mutex_unlock(&g_dataMutex);
    if (logKind == 1) hubLogAdd("[poll] holder <- %s (first)", id);
    else if (logKind == 2) hubLogAdd("[poll] holder <- %s (takeover)", id);
    snprintf(resp, respCap, "{\"ok\":true,\"lease\":%s,\"ver\":\"%s\"}",
             granted ? "true" : "false", PLUGIN_VERSION);
    return granted;
}

/* ---- 响应工具（原样） ---- */
static void sendAll(int s, const char* buf, int len) {
    int off = 0;
    while (off < len) {
        int n = (int)send(s, buf + off, (size_t)(len - off), 0);
        if (n <= 0) return;
        off += n;
    }
}

static void respondJson(int s, int code, const char* body, DWORD bodyLen) {
    char head[512];
    const char* codeText = (code == 200) ? "200 OK"
                         : (code == 204) ? "204 No Content"
                         : (code == 404) ? "404 Not Found" : "400 Bad Request";
    const char* CORS_HEADERS =
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "Access-Control-Allow-Private-Network: true\r\n"
        "Access-Control-Max-Age: 86400\r\n";
    int hn = snprintf(head, sizeof(head),
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

static void respondPreflight(int s) {
    char head[512];
    int hn = snprintf(head, sizeof(head),
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

/* ---- 请求处理（与实物 1:1） ---- */
static void handleRequest(int s, const char* req, DWORD reqLen) {
    char method[8] = {0};
    char path[256] = {0};
    if (sscanf(req, "%7s %255s", method, path) != 2) return;

    const char* body = strstr(req, "\r\n\r\n");
    DWORD bodyLen = 0;
    if (body) {
        body += 4;
        bodyLen = reqLen - (DWORD)(body - req);
    }

    fprintf(stderr, "[http] %s %s (%lu)\n", method, path, (unsigned long)bodyLen);

    if (!(strncasecmp(path, "/api/hublog", 11) == 0)) {
        hubLogAdd("#%lu %s %s (%lu)", (unsigned long)(g_hubLogSeq + 1),
                  method, path, (unsigned long)bodyLen);
    }

    if (strcasecmp(method, "GET") == 0 && strncmp(path, "/api/hublog", 11) == 0) {
        static char out[16 + HUBLOG_MAX * 160 + 128];
        int n = snprintf(out, sizeof(out), "{\"ok\":true,\"ver\":\"%s\",\"seq\":%lu,\"queue\":%d,\"pollId\":\"%s\",\"log\":[",
                         PLUGIN_VERSION, (unsigned long)g_hubLogSeq,
                         g_cmdCount, g_pollId);
        if (n < 0) n = 0;
        pthread_mutex_lock(&g_dataMutex);
        for (int i = 0; i < g_hubLogCount && n < (int)sizeof(out) - 200; i++) {
            int idx = (g_hubLogHead - g_hubLogCount + i + HUBLOG_MAX * 2) % HUBLOG_MAX;
            int m = snprintf(out + n, sizeof(out) - (size_t)n, "%s[\"%lu\",\"%s\"]",
                             i ? "," : "", (unsigned long)g_hubLogTick[idx], g_hubLog[idx]);
            if (m < 0) continue;
            n += m;
        }
        pthread_mutex_unlock(&g_dataMutex);
        int m2 = snprintf(out + n, sizeof(out) - (size_t)n, "]}");
        if (m2 > 0) n += m2;
        respondJson(s, 200, out, (DWORD)n);
        return;
    }

    if (strcasecmp(method, "OPTIONS") == 0) {
        respondPreflight(s);
        return;
    }

    if (strcasecmp(method, "GET") == 0 && strncmp(path, "/api/ping", 9) == 0) {
        char body2[160];
        int n = snprintf(body2, sizeof(body2),
            "{\"ok\":true,\"name\":\"%s\",\"version\":\"%s\",\"host\":true}",
            HUB_NAME_S, PLUGIN_VERSION);
        if (n < 0) n = 0;
        respondJson(s, 200, body2, (DWORD)n);
        return;
    }

    if (strcasecmp(method, "GET") == 0 && strncmp(path, "/api/state", 10) == 0) {
        static char out[STATE_MAX + 2];
        DWORD n = dataReadState(out, STATE_MAX);
        if (n == 0) n = (DWORD)snprintf(out, STATE_MAX, "{\"ok\":false,\"name\":\"%s\",\"version\":\"%s\",\"ne\":null}", HUB_NAME_S, PLUGIN_VERSION);
        respondJson(s, 200, out, n);
        return;
    }

    if (strcasecmp(method, "POST") == 0 && strncmp(path, "/api/state", 10) == 0) {
        dataStoreState(body, bodyLen);
        const char* ok = "{\"ok\":true}";
        respondJson(s, 200, ok, 11);
        return;
    }

    if (strcasecmp(method, "POST") == 0 && strncmp(path, "/api/poll", 9) == 0) {
        char resp[128];
        pollClaim(body, bodyLen, resp, sizeof(resp));
        respondJson(s, 200, resp, (DWORD)strlen(resp));
        return;
    }

    if (strcasecmp(method, "GET") == 0 && strncmp(path, "/api/cmd", 8) == 0) {
        static char out[CMD_QUEUE_MAX * CMD_MAX + 256];
        DWORD now = tickNow();
        pthread_mutex_lock(&g_dataMutex);
        int gated = (g_pollSeen && !queryIdMatches(path, g_pollId));
        pthread_mutex_unlock(&g_dataMutex);
        if (gated) {
            fprintf(stderr, "[gate] GET /api/cmd GATED (path=%s pollId=%s)\n", path, g_pollId);
            hubLogAdd("[gate] %s -> []", path);
            respondJson(s, 200, "[]", 2);
            return;
        }
        DWORD n = dataDrainCmds(out, sizeof(out) - 2);
        fprintf(stderr, "[drain] %s -> %.*s\n", path, (int)(n > 120 ? 120 : n), out);
        hubLogAdd("[drain] %s n=%lu json=%.*s", path, (unsigned long)g_drainLastN,
                  (int)(n > 80 ? 80 : n), out);
        respondJson(s, 200, out, n);
        return;
    }

    if (strcasecmp(method, "POST") == 0 && strncmp(path, "/api/cmd", 8) == 0) {
        fprintf(stderr, "[enqueue] POST /api/cmd len=%lu body=%.*s\n",
                (unsigned long)bodyLen, (int)(bodyLen > 60 ? 60 : bodyLen), bodyLen ? body : "");
        hubLogAdd("[enqueue] len=%lu body=%.*s", (unsigned long)bodyLen,
                  (int)(bodyLen > 60 ? 60 : bodyLen), bodyLen ? body : "");
        dataEnqueueCmd(body, bodyLen);
        const char* ok = "{\"ok\":true}";
        respondJson(s, 200, ok, 11);
        return;
    }

    if (strcasecmp(method, "GET") == 0 && strncmp(path, "/api/lyric", 10) == 0) {
        static char out[LYRIC_MAX + 2];
        DWORD n = dataReadLyric(out, LYRIC_MAX);
        if (n == 0) n = (DWORD)snprintf(out, LYRIC_MAX, "{\"ok\":false,\"lyric\":null}");
        respondJson(s, 200, out, n);
        return;
    }

    if (strcasecmp(method, "POST") == 0 && strncmp(path, "/api/lyric", 10) == 0) {
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

/* ---- 读请求（与实物 1:1，recv 换 POSIX） ---- */
static DWORD readRequest(int s, char* buf, DWORD cap) {
    DWORD got = 0;
    while (got < cap) {
        ssize_t n = recv(s, buf + got, cap - got, 0);
        if (n <= 0) break;
        got += (DWORD)n;
        buf[got] = 0;
        char* sep = strstr(buf, "\r\n\r\n");
        if (!sep) {
            if (got >= cap) break;
            continue;
        }
        const char* cl = strstr(buf, "Content-Length:");
        if (!cl || cl > sep) cl = strstr(buf, "content-length:");
        DWORD need = 0;
        if (cl && cl < sep) {
            need = (DWORD)strtoul(cl + 15, NULL, 10);
        }
        DWORD have = got - (DWORD)(sep + 4 - buf);
        if (have >= need) return got;
    }
    return got;
}

#define TV_400MS 400000
int main(int argc, char** argv) {
    int port = (argc > 1) ? atoi(argv[1]) : 26901;
    int ls = socket(AF_INET, SOCK_STREAM, 0);
    int reuse = 1;
    setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons((uint16_t)port);
    if (bind(ls, (struct sockaddr*)&addr, sizeof(addr)) != 0) {
        perror("bind");
        return 1;
    }
    if (listen(ls, 16) != 0) {
        perror("listen");
        return 1;
    }
    fprintf(stderr, "[boot] hubsim listening on %d\n", port);

    static char req[REQ_MAX + 2];
    for (;;) {
        int cs = accept(ls, NULL, NULL);
        if (cs < 0) { usleep(50000); continue; }
        /* 400ms 空连接快关（与实物一致） */
        fd_set rs;
        struct timeval tv;
        FD_ZERO(&rs);
        FD_SET(cs, &rs);
        tv.tv_sec = 0;
        tv.tv_usec = TV_400MS;
        int ready = select(cs + 1, &rs, NULL, NULL, &tv);
        if (ready <= 0) {
            fprintf(stderr, "[http] idle conn dropped (preconnect guard)\n");
            close(cs);
            continue;
        }
        int nd = 1;
        setsockopt(cs, IPPROTO_TCP, TCP_NODELAY, &nd, sizeof(nd));
        struct timeval rcv = {0, 500 * 1000};
        setsockopt(cs, SOL_SOCKET, SO_RCVTIMEO, &rcv, sizeof(rcv));
        struct timeval snd = {0, 500 * 1000};
        setsockopt(cs, SOL_SOCKET, SO_SNDTIMEO, &snd, sizeof(snd));

        DWORD n = readRequest(cs, req, REQ_MAX);
        if (n > 0) {
            req[n] = 0;
            handleRequest(cs, req, n);
        }
        close(cs);
    }
    return 0;
}
