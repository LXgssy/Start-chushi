/* ============================================================================
 * spectrumsim.c — chushi_spectrum.c 的 POSIX 测试替身（协议 1:1，合成频谱）
 *
 * 目的：Linux e2e 里扮演 chushi-spectrum.exe 的 HTTP 面（WASAPI 在 Linux
 * 不存在），以确定性合成频谱驱动扩展端消费链路（面板高光律动 / 悬浮卡
 * 律动 / SW 频谱流）的真实 HTTP 轮询——mock 假绿第二课：只 mock 协议、
 * 不 mock 时序（合成数据带真实时间函数，断言可测「随时间变化」）。
 *
 * 用法：gcc -O2 -o spectrumsim spectrumsim.c && ./spectrumsim [port]
 *       默认端口 26911；合成律：500ms 周期低频脉冲（≈120BPM 底鼓）+
 *       高频段细纹波；bass 0..1，bands 16 段 0..1。
 * ============================================================================
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>
#include <time.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>

#define SPEC_VERSION "8.2.0"
#define SPEC_NAME_S "chushi-spectrum"
#define BANDS 16

/* e2e 计数器（/api/stats 读） */
static unsigned long g_cntPing = 0;
static unsigned long g_cntSpec = 0;

static long long epochMs(void) {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static long long monoMs(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static void sendAll(int s, const char* buf, int len) {
    int off = 0;
    while (off < len) {
        int n = (int)send(s, buf + off, (size_t)(len - off), 0);
        if (n <= 0) return;
        off += n;
    }
}

static void respondJson(int s, int code, const char* body) {
    char head[512];
    const char* codeText = code == 200 ? "200 OK" : "404 Not Found";
    int hn = snprintf(head, sizeof(head),
        "HTTP/1.1 %s\r\n"
        "Content-Type: application/json; charset=utf-8\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "Access-Control-Allow-Private-Network: true\r\n"
        "Access-Control-Max-Age: 86400\r\n"
        "\r\n",
        codeText, strlen(body));
    if (hn < 0) return;
    sendAll(s, head, hn);
    sendAll(s, body, (int)strlen(body));
}

static double clamp01(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* 合成频谱：≈120BPM 底鼓（500ms 周期，指数衰减包络）+ 各段正弦纹波 */
static void synthSpectrum(float* bands, float* bass) {
    long long t = monoMs();
    double phase = (double)(t % 500) / 500.0;
    double kick = exp(-phase * 6.0);                       /* 500ms 周期脉冲 */
    double swing = 0.5 + 0.5 * sin((double)t / 4200.0);    /* 慢波动（乐句感） */
    for (int i = 0; i < BANDS; i++) {
        double v = kick * exp(-(double)i / 3.0) * (0.55 + 0.35 * swing)
                 + 0.10 * (0.5 + 0.5 * sin((double)t / 900.0 + (double)i * 1.7));
        bands[i] = (float)clamp01(v);
    }
    *bass = (float)clamp01(kick * (0.6 + 0.3 * swing) * 0.92);
}

static void handleRequest(int s, const char* req) {
    char method[8] = {0};
    char path[256] = {0};
    if (sscanf(req, "%7s %255s", method, path) != 2) return;

    if (strcasecmp(method, "GET") == 0 && strncmp(path, "/api/ping", 9) == 0) {
        char body[160];
        g_cntPing++;
        int n = snprintf(body, sizeof(body),
            "{\"ok\":true,\"name\":\"%s\",\"version\":\"%s\",\"cap\":1}",
            SPEC_NAME_S, SPEC_VERSION);
        if (n < 0) n = 0;
        respondJson(s, 200, body);
        return;
    }

    if (strcasecmp(method, "GET") == 0 && strncmp(path, "/api/spectrum", 13) == 0) {
        g_cntSpec++;
        float bands[BANDS];
        float bass;
        synthSpectrum(bands, &bass);
        char body[64 + BANDS * 10];
        int n = snprintf(body, sizeof(body),
            "{\"ok\":true,\"ver\":\"%s\",\"cap\":1,\"bass\":%.3f,\"bands\":[",
            SPEC_VERSION, bass);
        if (n < 0) n = 0;
        for (int i = 0; i < BANDS && n < (int)sizeof(body) - 16; i++) {
            int m = snprintf(body + n, sizeof(body) - (size_t)n, "%s%.3f", i ? "," : "", bands[i]);
            if (m < 0) break;
            n += m;
        }
        int m2 = snprintf(body + n, sizeof(body) - (size_t)n, "],\"t\":%lld}", epochMs());
        if (m2 > 0) n += m2;
        respondJson(s, 200, body);
        return;
    }

    if (strcasecmp(method, "GET") == 0 && strncmp(path, "/api/stats", 10) == 0) {
        char body[128];
        int n = snprintf(body, sizeof(body),
            "{\"ok\":true,\"ping\":%lu,\"spec\":%lu}", g_cntPing, g_cntSpec);
        if (n < 0) n = 0;
        respondJson(s, 200, body);
        return;
    }

    respondJson(s, 404, "{\"ok\":false,\"error\":\"not-found\"}");
}

int main(int argc, char** argv) {
    int port = 26911;
    if (argc > 1) port = atoi(argv[1]);
    if (port <= 0 || port > 65535) port = 26911;

    int ls = socket(AF_INET, SOCK_STREAM, 0);
    if (ls < 0) { perror("socket"); return 1; }
    int reuse = 1;
    setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons((uint16_t)port);
    if (bind(ls, (struct sockaddr*)&addr, sizeof(addr)) != 0) { perror("bind"); return 1; }
    if (listen(ls, 16) != 0) { perror("listen"); return 1; }
    fprintf(stderr, "[spectrumsim] listening on %d (synthetic 120BPM)\n", port);

    for (;;) {
        int cs = accept(ls, NULL, NULL);
        if (cs < 0) continue;
        int nd = 1;
        setsockopt(cs, IPPROTO_TCP, TCP_NODELAY, &nd, sizeof(nd));
        struct timeval tv = { 0, 500 * 1000 };
        setsockopt(cs, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
        char buf[4096];
        size_t got = 0;
        while (got < sizeof(buf) - 1) {
            ssize_t n = recv(cs, buf + got, sizeof(buf) - 1 - got, 0);
            if (n <= 0) break;
            got += (size_t)n;
            buf[got] = 0;
            if (strstr(buf, "\r\n\r\n")) {
                /* 无体 GET 即完整 */
                if (strncmp(buf, "GET", 3) == 0 && !strstr(buf, "Content-Length")) break;
            }
        }
        if (got > 0) handleRequest(cs, buf);
        close(cs);
    }
    return 0;
}
