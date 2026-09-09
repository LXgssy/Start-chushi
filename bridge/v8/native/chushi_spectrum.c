/* ============================================================================
 * ChuShi Spectrum Helper 8.2.0 —— 独立进程 WASAPI loopback 采集 + FFT → HTTP
 *
 * 为什么是独立进程（架构律，v8.2.0 新宪条）：
 *   hub v8 宪法 = hub.dll 零 COM/零 WinRT（导入表门断言仅 ws2_32+kernel32，
 *   v7.0.x 四代崩溃根因全是进程内 COM）。频谱采集（WASAPI loopback）绕不开
 *   COM —— 于是把 COM 关进本独立进程：hub.dll 只做 CreateProcess + Job
 *   Object 拉起/监护（纯 kernel32，宪法不破），本进程崩溃/卡死波及不到
 *   网易云。生命周期四保险：
 *     ① Job Object KILL_ON_JOB_CLOSE——hub 所在进程（网易云）退出即杀；
 *     ② 空闲自退——/api/spectrum 数据请求沉默 60s 自杀（没人听就不算）；
 *     ③ hub 重启（同进程重载 DLL）→ boot 端点先探测端口，孤儿直接收养；
 *     ④ 设备失效（拔耳机/切默认设备）→ 采集线程 800ms 退避重初始化。
 *
 * 端点（仅 127.0.0.1，26911 被占退 26912/26913）：
 *   GET /api/ping      身份（name=chushi-spectrum）
 *   GET /api/spectrum  {"ok":true,"ver","bass","bands":[16],"t":epochMs}
 *                      bands = 16 个对数频段（50Hz~16kHz）归一能量 0..1；
 *                      bass = 低三段加权（鼓点感驱动源），C 侧已带快攻慢放。
 * 采集：默认渲染设备 loopback（系统混音，任何应用放歌都有效）；
 *       共享模式 float/int16 自适应下混单声道；FFT 2048 + Hann 窗。
 * ============================================================================*/
#define WIN32_LEAN_AND_MEAN
#define COBJMACROS
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <mmreg.h>
#include <stdarg.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define SPEC_VERSION "8.2.0"
#define SPEC_NAME_S "chushi-spectrum"
#define SPEC_MUTEX_NAMEW L"ChuShi-Spectrum-Singleton"

#define PORT_A 26911
#define PORT_B 26912
#define PORT_C 26913

#define FFT_N 2048                 /* FFT 点数（需 2 的幂） */
#define BANDS 16                   /* 输出频段数 */
#define F_LO 50.0                  /* 最低频段起点 Hz */
#define F_HI 16000.0               /* 最高频段终点 Hz */
#define DB_FLOOR 66.0              /* 归一化动态窗（-66dB..0dB → 0..1） */
#define RING_N (FFT_N * 8)         /* 采样环（单声道 float） */
#define IDLE_EXIT_MS 60000         /* 数据请求沉默自退 */
#define ATTACK 0.55f               /* C 侧平滑：快攻 */
#define RELEASE 0.22f              /* C 侧平滑：慢放 */

/* ---- 手写 GUID（不依赖 uuid.lib；v7 律：GUID 逐字节，花括号防嵌套初始化坑） */
static const CLSID kCLSID_MMDeviceEnumerator =
    {0xBCDE0395, 0xE52F, 0x467C, {0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E}};
static const IID kIID_IMMDeviceEnumerator =
    {0xA95664D2, 0x9614, 0x4F35, {0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6}};
static const IID kIID_IAudioClient =
    {0x1CB9AD4C, 0xDBFA, 0x4C32, {0xB1, 0x78, 0xC2, 0xF5, 0x68, 0xA7, 0x03, 0xB2}};
static const IID kIID_IAudioCaptureClient =
    {0xC8ADBD64, 0xE71E, 0x48A0, {0xA4, 0xDE, 0x18, 0x5C, 0x39, 0x5C, 0xD3, 0x17}};
/* WAVE_FORMAT_EXTENSIBLE 的 IEEE_FLOAT 子格式 */
static const GUID kSUBTYPE_IEEE_FLOAT =
    {0x00000003, 0x0000, 0x0010, {0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71}};

/* ------------------------------------------------------------------ */
/* 日志（exe 同目录 spectrum-log.txt，环形重建）                          */
/* ------------------------------------------------------------------ */
static CRITICAL_SECTION g_logCs;

static void logf_line(const char* fmt, ...) {
    wchar_t exePath[MAX_PATH + 2] = {0};
    if (!GetModuleFileNameW(NULL, exePath, MAX_PATH)) return;
    wchar_t* slash = wcsrchr(exePath, L'\\');
    if (!slash) return;
    *slash = 0;
    wchar_t logPath[MAX_PATH + 32];
    _snwprintf(logPath, ARRAYSIZE(logPath), L"%s\\spectrum-log.txt", exePath);
    logPath[ARRAYSIZE(logPath) - 1] = 0;

    char line[512];
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

    EnterCriticalSection(&g_logCs);
    /* 超 512KB 重建 */
    WIN32_FILE_ATTRIBUTE_DATA fa;
    if (GetFileAttributesExW(logPath, GetFileExInfoStandard, &fa)) {
        LONGLONG sz = ((LONGLONG)fa.nFileSizeHigh << 32) | fa.nFileSizeLow;
        if (sz > 512 * 1024) DeleteFileW(logPath);
    }
    HANDLE f = CreateFileW(logPath, FILE_APPEND_DATA, FILE_SHARE_READ, NULL,
                           OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f != INVALID_HANDLE_VALUE) {
        DWORD written = 0;
        WriteFile(f, line, (DWORD)n, &written, NULL);
        CloseHandle(f);
    }
    LeaveCriticalSection(&g_logCs);
}

/* ------------------------------------------------------------------ */
/* 频谱快照（采集线程写 / HTTP 线程读）                                    */
/* ------------------------------------------------------------------ */
static CRITICAL_SECTION g_snapCs;
static float g_bands[BANDS];       /* 0..1，已平滑 */
static float g_bass = 0.0f;        /* 低三段加权 0..1，已平滑 */
static LONGLONG g_epochMs = 0;     /* 最近一帧 UTC 毫秒（新鲜度自证） */
static int g_capOk = 0;            /* 采集链路在场（0=设备初始化失败） */
static int g_rate = 48000;

static LONGLONG epochNowMs(void) {
    FILETIME ft;
    GetSystemTimeAsFileTime(&ft);
    ULARGE_INTEGER u;
    u.HighPart = ft.dwHighDateTime;
    u.LowPart = ft.dwLowDateTime;
    /* 1601-01-01 → 1970-01-01 的 100ns 数 */
    return (LONGLONG)((u.QuadPart - 116444736000000000ULL) / 10000ULL);
}

static void snapPublish(const float* bands, float bass) {
    EnterCriticalSection(&g_snapCs);
    for (int i = 0; i < BANDS; i++) g_bands[i] = bands[i];
    g_bass = bass;
    g_epochMs = epochNowMs();
    LeaveCriticalSection(&g_snapCs);
}

static void snapCapState(int ok) {
    EnterCriticalSection(&g_snapCs);
    g_capOk = ok;
    if (!ok) {
        for (int i = 0; i < BANDS; i++) g_bands[i] = 0.0f;
        g_bass = 0.0f;
    }
    LeaveCriticalSection(&g_snapCs);
}

/* ------------------------------------------------------------------ */
/* FFT（迭代基-2，实输入塞复数通道；2048 点 @~100Hz 调用，CPU 可忽略）      */
/* ------------------------------------------------------------------ */
static float g_hann[FFT_N];
static float g_ring[RING_N];
/* 仅采集线程写、仅采集线程读（fftRun 同线程）——普通变量，零原子开销 */
static long g_ringHead = 0;
static float g_re[FFT_N], g_im[FFT_N];
static int g_rev[FFT_N];
static int g_bandLo[BANDS + 1];        /* 频段→bin 边界 */
static float g_bandV[BANDS];

static void fftInit(void) {
    for (int i = 0; i < FFT_N; i++) {
        g_hann[i] = 0.5f * (1.0f - cosf(2.0f * 3.14159265f * (float)i / (float)(FFT_N - 1)));
        int r = 0, x = i;
        for (int b = 0; b < 11; b++) { r = (r << 1) | (x & 1); x >>= 1; } /* FFT_N=2048=2^11 */
        g_rev[i] = r;
    }
    memset(g_bandV, 0, sizeof(g_bandV));
}

static void fftBandMap(int sampleRate) {
    for (int i = 0; i <= BANDS; i++) {
        double f = F_LO * pow(F_HI / F_LO, (double)i / (double)BANDS);
        if (f > sampleRate * 0.5) f = sampleRate * 0.5;
        int bin = (int)(f * (double)FFT_N / (double)sampleRate);
        if (bin < 1) bin = 1;
        g_bandLo[i] = bin;
    }
    /* 保证单调（高频段可能被 Nyquist 压扁） */
    for (int i = 1; i <= BANDS; i++)
        if (g_bandLo[i] <= g_bandLo[i - 1]) g_bandLo[i] = g_bandLo[i - 1] + 1;
}

static void fftRun(void) {
    /* 取最近 FFT_N 帧加窗 */
    long head = g_ringHead;
    for (int i = 0; i < FFT_N; i++) {
        long idx = (head - FFT_N + i) & (RING_N - 1);
        g_re[i] = g_ring[idx] * g_hann[i];
        g_im[i] = 0.0f;
    }
    /* 位反转重排 */
    for (int i = 0; i < FFT_N; i++) {
        int j = g_rev[i];
        if (j > i) {
            float tr = g_re[i], ti = g_im[i];
            g_re[i] = g_re[j]; g_im[i] = g_im[j];
            g_re[j] = tr; g_im[j] = ti;
        }
    }
    /* 蝶形 */
    for (int len = 2; len <= FFT_N; len <<= 1) {
        float ang = -2.0f * 3.14159265f / (float)len;
        float wr = cosf(ang), wi = sinf(ang);
        for (int i = 0; i < FFT_N; i += len) {
            float cr = 1.0f, ci = 0.0f;
            for (int k = 0; k < len / 2; k++) {
                int a = i + k, b = i + k + len / 2;
                float vr = g_re[b] * cr - g_im[b] * ci;
                float vi = g_re[b] * ci + g_im[b] * cr;
                g_re[b] = g_re[a] - vr; g_im[b] = g_im[a] - vi;
                g_re[a] += vr; g_im[a] += vi;
                float ncr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = ncr;
            }
        }
    }
    /* 频段能量（幅平方均值 → rms → dB → 归一）+ 快攻慢放 */
    float out[BANDS];
    for (int b = 0; b < BANDS; b++) {
        int lo = g_bandLo[b], hi = g_bandLo[b + 1];
        if (hi > FFT_N / 2) hi = FFT_N / 2;
        double sum = 0.0;
        int cnt = 0;
        for (int i = lo; i < hi; i++) {
            double mag2 = (double)g_re[i] * g_re[i] + (double)g_im[i] * g_im[i];
            sum += mag2;
            cnt++;
        }
        float v = 0.0f;
        if (cnt > 0) {
            double rms = sqrt(sum / (double)cnt);
            double db = 20.0 * log10(rms + 1e-9);
            v = (float)((db + DB_FLOOR) / DB_FLOOR);
            if (v < 0.0f) v = 0.0f;
            if (v > 1.0f) v = 1.0f;
        }
        float prev = g_bandV[b];
        g_bandV[b] = v > prev ? (v * ATTACK + prev * (1.0f - ATTACK))
                              : (v * RELEASE + prev * (1.0f - RELEASE));
        out[b] = g_bandV[b];
    }
    /* bass = 低三段加权（0 段最重——底鼓在 50-150Hz） */
    float bass = out[0] * 0.5f + out[1] * 0.3f + out[2] * 0.2f;
    snapPublish(out, bass);
}

/* ------------------------------------------------------------------ */
/* 采集线程（COM 全部关在本进程本线程；设备失效自动重初始化）                */
/* ------------------------------------------------------------------ */
static void capPush(const BYTE* data, UINT32 frames, int fmtFloat, int ch, DWORD flags) {
    if (!data || frames == 0 || ch <= 0) return;
    /* AUDCLNT_BUFFERFLAGS_SILENT：整段静音，推零 */
    for (UINT32 f = 0; f < frames; f++) {
        float acc = 0.0f;
        if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
            acc = 0.0f;
        } else if (fmtFloat) {
            const float* src = (const float*)data;
            for (int c = 0; c < ch; c++) acc += src[(size_t)f * ch + c];
            acc /= (float)ch;
        } else {
            const short* src = (const short*)data;
            for (int c = 0; c < ch; c++) acc += (float)src[(size_t)f * ch + c] / 32768.0f;
            acc /= (float)ch;
        }
        long slot = g_ringHead++;
        g_ring[slot & (RING_N - 1)] = acc;
    }
}

static DWORD WINAPI cap_thread(LPVOID arg) {
    (void)arg;
    int inited = 0;
    for (;;) { /* 设备级重初始化循环 */
        int haveCo = 0, haveEnum = 0, haveDev = 0, haveClient = 0, haveCap = 0;
        IMMDeviceEnumerator* enumDev = NULL;
        IMMDevice* dev = NULL;
        IAudioClient* client = NULL;
        IAudioCaptureClient* cap = NULL;
        WAVEFORMATEX* wfx = NULL;
        int fmtFloat = 0, ch = 2;

        CoInitializeEx(NULL, COINIT_MULTITHREADED);
        haveCo = 1;

        HRESULT hr = CoCreateInstance(&kCLSID_MMDeviceEnumerator, NULL, CLSCTX_ALL,
                                      &kIID_IMMDeviceEnumerator, (void**)&enumDev);
        if (FAILED(hr) || !enumDev) { logf_line("[cap] CoCreateInstance 0x%08lX", (unsigned long)hr); goto retry; }
        haveEnum = 1;
        hr = IMMDeviceEnumerator_GetDefaultAudioEndpoint(enumDev, eRender, eMultimedia, &dev);
        if (FAILED(hr) || !dev) { logf_line("[cap] GetDefaultAudioEndpoint 0x%08lX", (unsigned long)hr); goto retry; }
        haveDev = 1;
        hr = IMMDevice_Activate(dev, &kIID_IAudioClient, CLSCTX_ALL, NULL, (void**)&client);
        if (FAILED(hr) || !client) { logf_line("[cap] Activate 0x%08lX", (unsigned long)hr); goto retry; }
        haveClient = 1;
        hr = IAudioClient_GetMixFormat(client, &wfx);
        if (FAILED(hr) || !wfx) { logf_line("[cap] GetMixFormat 0x%08lX", (unsigned long)hr); goto retry; }

        ch = wfx->nChannels;
        if (wfx->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) fmtFloat = 1;
        else if (wfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
            WAVEFORMATEXTENSIBLE* wx = (WAVEFORMATEXTENSIBLE*)wfx;
            if (memcmp(&wx->SubFormat, &kSUBTYPE_IEEE_FLOAT, sizeof(GUID)) == 0) fmtFloat = 1;
        } else if (wfx->wFormatTag != WAVE_FORMAT_PCM) {
            logf_line("[cap] unsupported fmt tag %u", wfx->wFormatTag);
            goto retry;
        }
        g_rate = wfx->nSamplesPerSec;
        fftBandMap(g_rate);

        /* 1s 缓冲 loopback；bufferDuration 0 = 用默认 */
        hr = IAudioClient_Initialize(client, AUDCLNT_SHAREMODE_SHARED,
                                     AUDCLNT_STREAMFLAGS_LOOPBACK,
                                     10000000 /*1s*/, 0, wfx, NULL);
        if (FAILED(hr)) { logf_line("[cap] Initialize 0x%08lX", (unsigned long)hr); goto retry; }
        hr = IAudioClient_GetService(client, &kIID_IAudioCaptureClient, (void**)&cap);
        if (FAILED(hr) || !cap) { logf_line("[cap] GetService 0x%08lX", (unsigned long)hr); goto retry; }
        haveCap = 1;
        hr = IAudioClient_Start(client);
        if (FAILED(hr)) { logf_line("[cap] Start 0x%08lX", (unsigned long)hr); goto retry; }

        logf_line("[cap] loopback up: %uHz %uch %s", g_rate, ch, fmtFloat ? "float" : "pcm16");
        inited = 1;
        snapCapState(1);

        /* 采集主循环 */
        for (;;) {
            UINT32 packet = 0;
            HRESULT h2 = IAudioCaptureClient_GetNextPacketSize(cap, &packet);
            if (FAILED(h2)) { logf_line("[cap] GetNextPacketSize 0x%08lX", (unsigned long)h2); goto retry; }
            if (packet == 0) {
                /* 无包：节流 + 周期性 DSP（保快照时间戳新鲜，静音归零靠平滑释放） */
                static long idleTicks = 0;
                if ((++idleTicks & 0x7) == 0) fftRun();
                Sleep(6);
                continue;
            }
            BYTE* data = NULL;
            UINT32 frames = 0;
            DWORD flags = 0;
            h2 = IAudioCaptureClient_GetBuffer(cap, &data, &frames, &flags, NULL, NULL);
            if (FAILED(h2)) { logf_line("[cap] GetBuffer 0x%08lX", (unsigned long)h2); goto retry; }
            capPush(data, frames, fmtFloat, ch, flags);
            IAudioCaptureClient_ReleaseBuffer(cap, frames);
            fftRun();
        }

retry:
        if (inited) {
            inited = 0;
            snapCapState(0);
            logf_line("[cap] link down — reinit in 800ms");
        }
        /* 首次失败：snapCapState(0) 已如实反映（面板/卡片据此降级静态高光） */
        if (haveCap && cap) IAudioCaptureClient_Release(cap);
        if (haveClient && client) {
            IAudioClient_Stop(client);
            IAudioClient_Release(client);
        }
        if (wfx) CoTaskMemFree(wfx);
        if (haveDev && dev) IMMDevice_Release(dev);
        if (haveEnum && enumDev) IMMDeviceEnumerator_Release(enumDev);
        if (haveCo) CoUninitialize();
        Sleep(800);
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* HTTP（hub 同款骨架：环回 only + 空连接快关 + CORS + PNA 头）             */
/* ------------------------------------------------------------------ */
static volatile LONG g_lastDataReqTick = 0;

static const char* CORS_HEADERS =
    "Access-Control-Allow-Origin: *\r\n"
    "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
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

static void respondJson(SOCKET s, int code, const char* body, int bodyLen) {
    char head[512];
    const char* codeText = (code == 200) ? "200 OK" : "404 Not Found";
    int hn = _snprintf(head, sizeof(head),
        "HTTP/1.1 %s\r\n"
        "Content-Type: application/json; charset=utf-8\r\n"
        "Content-Length: %d\r\n"
        "Connection: close\r\n"
        "%s"
        "\r\n",
        codeText, bodyLen, CORS_HEADERS);
    if (hn < 0) return;
    sendAll(s, head, hn);
    if (bodyLen > 0) sendAll(s, body, bodyLen);
}

static DWORD readRequest(SOCKET s, char* buf, DWORD cap) {
    DWORD got = 0;
    while (got < cap) {
        int n = recv(s, buf + got, (int)(cap - got), 0);
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
        if (cl && cl < sep) need = (DWORD)strtoul(cl + 15, NULL, 10);
        DWORD have = got - (DWORD)(sep + 4 - buf);
        if (have >= need) return got;
    }
    return got;
}

static void handleRequest(SOCKET s, const char* req) {
    char method[8] = {0};
    char path[256] = {0};
    if (sscanf(req, "%7s %255s", method, path) != 2) return;

    if (_stricmp(method, "GET") == 0 && strncmp(path, "/api/ping", 9) == 0) {
        char body[160];
        int n = _snprintf(body, sizeof(body),
            "{\"ok\":true,\"name\":\"%s\",\"version\":\"%s\",\"cap\":%d}",
            SPEC_NAME_S, SPEC_VERSION, g_capOk ? 1 : 0);
        if (n < 0) n = 0;
        respondJson(s, 200, body, n);
        return;
    }

    if (_stricmp(method, "GET") == 0 && strncmp(path, "/api/spectrum", 13) == 0) {
        InterlockedExchange(&g_lastDataReqTick, (LONG)GetTickCount());
        char body[64 + BANDS * 10];
        float bands[BANDS];
        float bass;
        LONGLONG ep;
        int capOk;
        EnterCriticalSection(&g_snapCs);
        for (int i = 0; i < BANDS; i++) bands[i] = g_bands[i];
        bass = g_bass;
        ep = g_epochMs;
        capOk = g_capOk;
        LeaveCriticalSection(&g_snapCs);
        int n = _snprintf(body, sizeof(body), "{\"ok\":true,\"ver\":\"%s\",\"cap\":%d,\"bass\":%.3f,\"bands\":[",
                          SPEC_VERSION, capOk ? 1 : 0, bass);
        if (n < 0) n = 0;
        for (int i = 0; i < BANDS && n < (int)sizeof(body) - 16; i++) {
            int m = _snprintf(body + n, sizeof(body) - (size_t)n, "%s%.3f", i ? "," : "", bands[i]);
            if (m < 0) break;
            n += m;
        }
        int m2 = _snprintf(body + n, sizeof(body) - (size_t)n, "],\"t\":%lld}", (long long)ep);
        if (m2 > 0) n += m2;
        respondJson(s, 200, body, n);
        return;
    }

    {
        const char* nf = "{\"ok\":false,\"error\":\"not-found\"}";
        respondJson(s, 404, nf, 31);
    }
}

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

int main(void) {
    InitializeCriticalSection(&g_logCs);
    InitializeCriticalSection(&g_snapCs);
    fftInit();

    /* 单例：同机重复双开（残留实例）直接退出——boot 端点会探测收养 */
    HANDLE mx = CreateMutexW(NULL, TRUE, SPEC_MUTEX_NAMEW);
    if (!mx) return 0;
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        CloseHandle(mx);
        return 0;
    }

    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 0;

    HANDLE capTh = CreateThread(NULL, 0, cap_thread, NULL, 0, NULL);
    if (capTh) CloseHandle(capTh);
    logf_line("[boot] ChuShi Spectrum Helper v%s (WASAPI loopback, own process)", SPEC_VERSION);

    SOCKET ls = INVALID_SOCKET;
    int port = 0;
    int ports[3] = { PORT_A, PORT_B, PORT_C };
    for (int i = 0; i < 3; i++) {
        ls = createListener(ports[i]);
        if (ls != INVALID_SOCKET) { port = ports[i]; break; }
    }
    if (ls == INVALID_SOCKET) {
        logf_line("[boot] all spectrum ports busy — exit (single-instance law)");
        return 0;
    }
    logf_line("[http] listening on %d (loopback only)", port);
    InterlockedExchange(&g_lastDataReqTick, (LONG)GetTickCount());

    static char req[8192];
    for (;;) {
        /* accept 带 1s select 超时：空闲自退检查点 */
        fd_set rs;
        struct timeval tv;
        FD_ZERO(&rs);
        FD_SET(ls, &rs);
        tv.tv_sec = 1;
        tv.tv_usec = 0;
        int ready = select((int)ls + 1, &rs, NULL, NULL, &tv);
        if (ready <= 0) {
            DWORD now = GetTickCount();
            DWORD last = (DWORD)InterlockedCompareExchange(&g_lastDataReqTick, 0, 0);
            if (now - last > IDLE_EXIT_MS) {
                logf_line("[idle] no spectrum request for %us — self exit", IDLE_EXIT_MS / 1000);
                return 0;
            }
            continue;
        }
        SOCKET cs = accept(ls, NULL, NULL);
        if (cs == INVALID_SOCKET) { Sleep(20); continue; }
        /* 空连接快关 400ms（hub 同款防预连接卡死） */
        fd_set rs2;
        struct timeval tv2;
        FD_ZERO(&rs2);
        FD_SET(cs, &rs2);
        tv2.tv_sec = 0;
        tv2.tv_usec = 400 * 1000;
        int ready2 = select((int)cs + 1, &rs2, NULL, NULL, &tv2);
        if (ready2 <= 0) { closesocket(cs); continue; }
        BOOL nd = TRUE;
        setsockopt(cs, IPPROTO_TCP, TCP_NODELAY, (const char*)&nd, sizeof(nd));
        DWORD timeoutMs = 500;
        setsockopt(cs, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeoutMs, sizeof(timeoutMs));
        setsockopt(cs, SOL_SOCKET, SO_SNDTIMEO, (const char*)&timeoutMs, sizeof(timeoutMs));
        DWORD n = readRequest(cs, req, 8190);
        if (n > 0) {
            req[n] = 0;
            handleRequest(cs, req);
        }
        closesocket(cs);
    }
    return 0;
}
