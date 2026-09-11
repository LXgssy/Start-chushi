/* ============================================================================
 * ChuShi Spectrum Helper 8.2.9 —— 独立进程 WASAPI loopback 采集 + FFT → HTTP
 *
 * v8.2.9 频段细化（用户指令「提高fft采样点数，提升到128」）：输出频段
 *   16→128（50Hz~16kHz 对数分布，~40Hz 节拍不变，帧体 ~0.9KB 环回无感）。
 *   低音轴同步重定义：旧 bass=前3段加权是 16 段语义；128 段下改为
 *   0..3/4..7/8..15 段（50~96Hz）分区带权——底鼓拳感与 16 段时代等价。
 *   消费端（ext-card/smtc.ts/music-widget）按 bands.length 自适应新旧两代。
 *
 * v8.2.5 电流音根治·引擎零扰律（用户 v8.2.4 实测电音依旧 + 「关扩展/移桥即消」
 *   对照实验 + spectrum-log 实锤后的四根刀）：
 *   ① 需求门挡在引擎门口——设备级循环在 CoInitialize 之前先看消费者需求，
 *      无需求长眠（300ms 节拍）绝不 Initialize/Start loopback；link down 的
 *      retry 归途同门。日志实锤：served=0（零消费者）时仍每 5s 一次
 *      0x88890004 → reinit——loopback 客户端的 attach/detach 本身就是引擎
 *      折腾，驱动对「无活跃流端点」的节能拉闸 × 本程序唤醒 = 扬声器上下电
 *      pop 循环（电音本音）。零消费者 = 引擎零 loopback 客户端 = 彻底安静。
 *   ② 退避真实化——consecDown 归零时机从「up 瞬间」挪到「稳定运行 ≥60s」：
 *      旧版「up 即归零」让「up→几秒→down」的拉闸风暴永远从 800ms 档重来；
 *      现退避 800ms→1.6→3.2→5→10→20→30s 封顶，风暴自然衰减。
 *   ③ 撤 MMCSS "Pro Audio"（v8.2.4 误方）——采集线程提权到引擎同档做 FFT
 *      反而与 audiodg 抢调度；改 THREAD_PRIORITY_BELOW_NORMAL 让核。
 *   ④ FFT 40Hz 节流（v8.2.8 延迟反馈：原 50ms 节流+50ms 轮询相位错开
 *      ≈ 75-150ms 端到端，用户感知律动滞后歌曲）——每包只推采样环，
 *      25ms 一拍 FFT+发布；FFT 2048 单次 ~0.1ms，40Hz 增量 CPU 可忽略。
 * （v8.2.4 保留：按需采集 paused 态 / 优雅退出 / 零包预热保险 / 幅域归一。）
 *
 * v8.2.4 实机反馈三连修（电流音 + 律动不动 + 稳定性，附 spectrum-log 实锤）：
 *   ① 律动死真凶根治（[dsp] bass=1.000 恒钉实锤）——频段能量直接拿 bin
 *      幅度开 dB，FFT 增益（Hann 相干增益 0.5 → 满幅正弦峰 bin ≈ N/4）没
 *      折回幅域：音乐里任何幅度 >0.0005 的频段全部饱和到 1.0 → 辉光恒亮
 *      不跳 = 「没有律动」。现律：bin 幅度 RMS / (N/4) 折回幅域再开 dB
 *      （-60dB..0dB → 0..1），满幅 ≈0.95、常觃音乐 0.3~0.8 随拍起伏；
 *   ② 电流音根治两刀：
 *      a) 按需采集——无 /api/spectrum 消费 >10s → IAudioClient_Stop（引擎
 *         摘除采集管道，零音频栈参与）；需求回来（<3s 新鲜）→ Start 恢复。
 *         「关网页后电流音消失」的用户观察反过来印证：噪声窗 = 采集窗；
 *      b) 优雅退出——空闲自退不再裸杀进程：退出旗标贯通采集循环（含打盹/
 *         退避等待），Stop→Release→CoUninitialize 全走完才 ExitProcess，
 *         杜绝「每 80s 强杀一次活跃 loopback 客户端」的驱动级抖动；
 *   ③ 稳定性：采集线程挂 MMCSS "Pro Audio"（共享模式下与音频引擎抢调度
 *      是爆音经典源）；设备失效风暴退避升级（800ms→1.6s→3.2s→5s 封顶，
 *      成功 up 归零）；「初始化于静默期永不产包」驱动 bug 保险——有消费者
 *      在场且 >15s 零包 → 主动重初始化（有节流）。
 * （v8.2.3 三律保留：>600ms 无非静音包发布零快照 / IMMNotificationClient
 *   默认设备跟踪 / [dsp] 10s 健康心跳 + 首消费者留痕。）
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
 *   GET /api/spectrum  {"ok":true,"ver","bass","bands":[128],"t":epochMs}
 *                      bands = 128 个对数频段（50Hz~16kHz，v8.2.9）归一能量 0..1；
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

#define SPEC_VERSION "8.2.9"
#define SPEC_NAME_S "chushi-spectrum"
#define SPEC_MUTEX_NAMEW L"ChuShi-Spectrum-Singleton"

#define PORT_A 26911
#define PORT_B 26912
#define PORT_C 26913

#define FFT_N 2048                 /* FFT 点数（需 2 的幂） */
#define BANDS 128                  /* 输出频段数（v8.2.9：16→128 细腻律动） */
#define F_LO 50.0                  /* 最低频段起点 Hz */
#define F_HI 16000.0               /* 最高频段终点 Hz */
#define DB_FLOOR 66.0              /* 归一化动态窗（-66dB..0dB → 0..1） */
#define RING_N (FFT_N * 8)         /* 采样环（单声道 float） */
#define IDLE_EXIT_MS 60000         /* 数据请求沉默自退 */
#define ATTACK 0.55f               /* C 侧平滑：快攻 */
#define RELEASE 0.22f              /* C 侧平滑：慢放 */
#define DB_FLOOR_V824 60.0         /* v8.2.4 幅域动态窗（-60dB..0dB → 0..1） */
#define CAP_IDLE_STOP_MS 10000     /* 无消费者 → 引擎摘除采集管道（电流音刀一） */
#define CAP_RESUME_FRESH_MS 3000   /* 需求新鲜窗：恢复采集 */
#define CAP_NOPKT_REINIT_MS 15000  /* 有消费者却零包 → 驱动预热 bug 保险重初始化 */

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
/* 日志（v8.2.2 用户指定：一律 %LOCALAPPDATA%\ChuShi\spectrum-log.txt。
 *   v8.2.1 的「exe 同目录优先回退链」作废——插件目录常不可写，回退链
 *   只会让用户到处找；固定用户目录一处，永远找得到）                    */
/* ------------------------------------------------------------------ */
static CRITICAL_SECTION g_logCs;
static wchar_t g_logPath[MAX_PATH + 48] = {0};
static int     g_logMode = -1;   /* -1 未定 / 1=LOCALAPPDATA / 2=无处可写 */

/* 试写探测：打开成功即算该位置可写（句柄即关） */
static int logProbe(const wchar_t* path) {
    HANDLE f = CreateFileW(path, FILE_APPEND_DATA, FILE_SHARE_READ, NULL,
                           OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f == INVALID_HANDLE_VALUE) return 0;
    CloseHandle(f);
    return 1;
}

static void logPathResolveLocked(void) {
    /* %LOCALAPPDATA%\ChuShi\（环境变量直取，免 shell32 依赖） */
    wchar_t local[MAX_PATH + 2] = {0};
    DWORD ln = GetEnvironmentVariableW(L"LOCALAPPDATA", local, MAX_PATH);
    if (ln > 0 && ln < MAX_PATH) {
        wchar_t dir[MAX_PATH + 16];
        _snwprintf(dir, ARRAYSIZE(dir), L"%s\\ChuShi", local);
        dir[ARRAYSIZE(dir) - 1] = 0;
        CreateDirectoryW(dir, NULL); /* 已存在则静默 */
        _snwprintf(g_logPath, ARRAYSIZE(g_logPath), L"%s\\spectrum-log.txt", dir);
        g_logPath[ARRAYSIZE(g_logPath) - 1] = 0;
        if (logProbe(g_logPath)) { g_logMode = 1; return; }
    }
    g_logMode = 2; /* 无处可写：日志静默禁用（采集/HTTP 主路不受影响） */
}

static const char* logModeText(void) {
    if (g_logMode == 1) return "local-appdata";
    return "disabled";
}

static void logf_line(const char* fmt, ...) {
    EnterCriticalSection(&g_logCs);
    if (g_logMode < 0) logPathResolveLocked();
    if (g_logMode == 2) { LeaveCriticalSection(&g_logCs); return; }

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

    /* 超 512KB 重建 */
    WIN32_FILE_ATTRIBUTE_DATA fa;
    if (GetFileAttributesExW(g_logPath, GetFileExInfoStandard, &fa)) {
        LONGLONG sz = ((LONGLONG)fa.nFileSizeHigh << 32) | fa.nFileSizeLow;
        if (sz > 512 * 1024) DeleteFileW(g_logPath);
    }
    HANDLE f = CreateFileW(g_logPath, FILE_APPEND_DATA, FILE_SHARE_READ, NULL,
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

/* v8.2.3 诊断计数（单写多读；racy 读仅供健康日志） */
static volatile LONG g_pktCount = 0;      /* 收到的非空包总数 */
static volatile LONG g_lastAudioTick = 0; /* 最近非静音包 tick */
static volatile LONG g_devChangeTick = 0; /* 设备变更 tick（0=无） */
static float g_lvl = 0.0f;                /* 环响度 EMA（仅采集线程写） */

/* ---- v8.2.4 需求面 + 优雅退出（必须先于采集线程声明） ----
 * g_lastDataReqTick / g_specServed 从 HTTP 段上移：采集线程的按需采集
 * （capDemandAge）依赖需求新鲜度；g_exitFlag/g_capGone 服务优雅退出。 */
static volatile LONG g_lastDataReqTick = 0; /* 最近 /api/spectrum tick（HTTP 线程写） */
static volatile LONG g_specServed = 0;      /* /api/spectrum 累计响应数 */
static volatile LONG g_firstSpecLogged = 0; /* 首客户端留痕门 */
static volatile LONG g_exitFlag = 0;        /* 1 = main 已决定退出，采集线程收摊 */
static HANDLE g_capGone = NULL;             /* 采集线程收摊完成事件 */

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
    /* v8.2.4 频段能量（bin 幅度 RMS → 折回幅域 → dB → 归一）+ 快攻慢放。
     * 律动死真凶：旧版直接拿 bin 幅度开 dB——FFT 增益（Hann 相干增益 0.5、
     * N=2048）把满幅正弦顶到 bin 幅度 ~512（+54dB），常觃音乐全频段饱和
     * 到 1.0（[dsp] bass=1.000 恒钉实锤）→ 辉光恒亮不跳。现把 bin 幅度
     * RMS 除以 N/4 折回幅域（满幅正弦 ≈ 1.0），动态窗 -60dB..0dB，
     * 常觃音乐落 0.3~0.8 随拍起伏。 */
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
            double amp = rms / ((double)FFT_N * 0.25); /* Hann 相干增益 0.5 → 峰 bin ≈ N/4 */
            double db = 20.0 * log10(amp + 1e-7);
            v = (float)((db + DB_FLOOR_V824) / DB_FLOOR_V824);
            if (v < 0.0f) v = 0.0f;
            if (v > 1.0f) v = 1.0f;
        }
        float prev = g_bandV[b];
        g_bandV[b] = v > prev ? (v * ATTACK + prev * (1.0f - ATTACK))
                              : (v * RELEASE + prev * (1.0f - RELEASE));
        out[b] = g_bandV[b];
    }
    /* bass = 低频分区带权（v8.2.9 128 段语义）：
     *   0..3 段（50~60Hz）×0.45 + 4..7 段（60~72Hz）×0.35 + 8..15 段（72~96Hz）×0.20
     * 底鼓能量集中在 50-100Hz；权重集中低段=鼓点拳感与 16 段时代等价，
     * 又比旧「前3段」宽一倍覆盖。分均值（非逐段）防单 bin 噪声闪跳。 */
    float bass = 0.0f;
    {
        float b03 = 0, b47 = 0, b815 = 0;
        for (int bi = 0; bi < 4 && bi < BANDS; bi++) b03 += out[bi];
        for (int bi = 4; bi < 8 && bi < BANDS; bi++) b47 += out[bi];
        for (int bi = 8; bi < 16 && bi < BANDS; bi++) b815 += out[bi];
        b03 /= 4.0f; b47 /= 4.0f; b815 /= 8.0f;
        bass = b03 * 0.45f + b47 * 0.35f + b815 * 0.20f;
    }
    snapPublish(out, bass);
}

/* ------------------------------------------------------------------ */
/* v8.2.3 默认设备/设备态通知（手写 COM 对象，零 uuid.lib；v7 GUID 律）     */
/*   MTA 回调落在线程池线程——处理器只置 volatile 标记，零锁零分配。        */
/* ------------------------------------------------------------------ */
static const IID kIID_IUnknown =
    {0x00000000, 0x0000, 0x0000, {0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};
static const IID kIID_IMMNotificationClient =
    {0x7991EEC9, 0x7E89, 0x4D85, {0x83, 0x90, 0x6D, 0x2D, 0x37, 0x4E, 0x1A, 0x6F}};

typedef struct SpecNotify {
    IMMNotificationClientVtbl* vtbl;
    LONG ref;
} SpecNotify;

static HRESULT STDMETHODCALLTYPE specNotify_QI(IMMNotificationClient* self, REFIID riid, void** out) {
    if (!out) return E_POINTER;
    *out = NULL;
    if (memcmp(riid, &kIID_IUnknown, sizeof(IID)) == 0 ||
        memcmp(riid, &kIID_IMMNotificationClient, sizeof(IID)) == 0) {
        *out = self;
        self->lpVtbl->AddRef(self);
        return S_OK;
    }
    return E_NOINTERFACE;
}
static ULONG STDMETHODCALLTYPE specNotify_AddRef(IMMNotificationClient* self)   { (void)self; return 1; }
static ULONG STDMETHODCALLTYPE specNotify_Release(IMMNotificationClient* self)  { (void)self; return 1; }
static HRESULT STDMETHODCALLTYPE specNotify_OnDevStateChanged(IMMNotificationClient* self, LPCWSTR id, DWORD st) {
    (void)self; (void)id; (void)st;
    InterlockedExchange(&g_devChangeTick, (LONG)GetTickCount());
    return S_OK;
}
static HRESULT STDMETHODCALLTYPE specNotify_OnDevAdded(IMMNotificationClient* self, LPCWSTR id) {
    (void)self; (void)id; return S_OK;
}
static HRESULT STDMETHODCALLTYPE specNotify_OnDevRemoved(IMMNotificationClient* self, LPCWSTR id) {
    (void)self; (void)id; return S_OK;
}
static HRESULT STDMETHODCALLTYPE specNotify_OnDefaultChanged(IMMNotificationClient* self, EDataFlow flow, ERole role, LPCWSTR id) {
    (void)self; (void)role; (void)id;
    if (flow == eRender) InterlockedExchange(&g_devChangeTick, (LONG)GetTickCount());
    return S_OK;
}
static HRESULT STDMETHODCALLTYPE specNotify_OnPropChanged(IMMNotificationClient* self, LPCWSTR id, const PROPERTYKEY key) {
    (void)self; (void)id; (void)key; return S_OK;
}

static IMMNotificationClientVtbl g_specNotifyVtbl = {
    specNotify_QI,
    specNotify_AddRef,
    specNotify_Release,
    specNotify_OnDevStateChanged,
    specNotify_OnDevAdded,
    specNotify_OnDevRemoved,
    specNotify_OnDefaultChanged,
    specNotify_OnPropChanged,
};
static SpecNotify g_specNotify = { &g_specNotifyVtbl, 1 };

/* ------------------------------------------------------------------ */
/* 采集线程（COM 全部关在本进程本线程；设备失效自动重初始化）                */
/* ------------------------------------------------------------------ */
static void capPush(const BYTE* data, UINT32 frames, int fmtFloat, int ch, DWORD flags) {
    if (!data || frames == 0 || ch <= 0) return;
    InterlockedIncrement(&g_pktCount);
    /* 非静音包 = 设备活着有声音：刷新活味儿时钟 + 粗响度（每 16 帧采样一点，
       CPU 可忽略；SILENT 包不算活味儿——停播就该是停播） */
    if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT)) {
        InterlockedExchange(&g_lastAudioTick, (LONG)GetTickCount());
        size_t stride = (size_t)ch * (fmtFloat ? sizeof(float) : sizeof(short));
        if (stride > 0) {
            float lvl = 0.0f;
            int n = 0;
            for (UINT32 f = 0; f < frames; f += 16) {
                const BYTE* p = data + (size_t)f * stride;
                float v = fmtFloat ? *(const float*)p
                                   : (float)(*(const short*)p) / 32768.0f;
                lvl += v < 0 ? -v : v;
                n++;
            }
            if (n > 0) {
                lvl /= (float)n * 8.0f;
                g_lvl += (lvl - g_lvl) * 0.25f;
            }
        }
    }
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

/* v8.2.5 撤 MMCSS（v8.2.4 误方）："Pro Audio" 把本线程提到与音频引擎同档，
 * 高优先级线程做 FFT/轮询反而与 audiodg 抢核（低核数机器放大 glitch）。
 * 改 BELOW_NORMAL：采集是旁路消费者，永远让核给引擎/网易云。 */
static void capTuneThreadPriority(void) {
    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
}

/* 消费者需求新鲜度：最近一次 /api/spectrum 距今 ms（tick=0 视为刚启动期=新鲜，
 * 防「cap 线程先于 main 置需求戳启动」竞态误判为无消费） */
static DWORD capDemandAge(DWORD now) {
    DWORD last = (DWORD)InterlockedCompareExchange(&g_lastDataReqTick, 0, 0);
    if (last == 0) return 0;
    return now - last;
}

/* v8.2.5 退避链：800ms → 1.6 → 3.2 → 5 → 10 → 20 → 30s 封顶。
 * 对「up→几秒→down」的驱动拉闸风暴必须真实衰减（v8.2.4 的 5s 封顶
 * 配「up 即归零」等于没有退避——风暴每 5s 折腾一次引擎）。 */
static DWORD backoffMs(int n) {
    DWORD ms = 800u << (n > 5 ? 5 : n);
    if (ms > 30000u) ms = 30000u;
    return ms;
}

static DWORD WINAPI cap_thread(LPVOID arg) {
    (void)arg;
    int inited = 0;
    int consecDown = 0;     /* 设备失效风暴连败计数（v8.2.5：稳定 ≥60s 才归零） */
    DWORD stableSince = 0;  /* v8.2.5 本次 up 的稳定计时起点 */
    capTuneThreadPriority(); /* v8.2.5：BELOW_NORMAL 让核（撤 MMCSS Pro Audio） */
    for (;;) { /* 设备级重初始化循环 */
        /* v8.2.5 需求门（电流音根治核心刀）：零消费者绝不触碰音频引擎——
         * 连 COM 都不初始化。长眠等需求（300ms 节拍），退出旗标可打断
         * （goto retry 的清理全带守卫，此刻资源变量均为零值，安全）。
         * link down 的 retry 归途回到循环顶即同门——「拉闸→唤醒→拉闸」
         * 的 pop 循环在结构上断根。 */
        while (capDemandAge(GetTickCount()) > CAP_IDLE_STOP_MS) {
            if (InterlockedCompareExchange(&g_exitFlag, 0, 0)) {
                logf_line("[cap] demand gate: no consumer, engine untouched — exiting");
                goto retry;
            }
            Sleep(300);
        }
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
        /* v8.2.3 设备变更通知（每次 reinit 重新挂回，同一静态对象幂等） */
        IMMDeviceEnumerator_RegisterEndpointNotificationCallback(
            enumDev, (IMMNotificationClient*)&g_specNotify);
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
        stableSince = GetTickCount(); /* v8.2.5：稳定计时起点（≥60s 才算健康归零） */
        snapCapState(1);
        DWORD lastPktAt = GetTickCount(); /* 零包保险节流戳 */
        int paused = 0;                   /* v8.2.4 按需采集打盹态 */

        /* 采集主循环 */
        for (;;) {
            if (InterlockedCompareExchange(&g_exitFlag, 0, 0)) goto retry;
            DWORD nowc = GetTickCount();
            /* v8.2.3：默认设备/设备态变更 → 冷却 2s 后重初始化到新设备 */
            DWORD devCh = (DWORD)InterlockedCompareExchange(&g_devChangeTick, 0, 0);
            if (devCh != 0 && nowc - devCh > 2000) {
                InterlockedExchange(&g_devChangeTick, 0);
                logf_line("[cap] default device changed — reinit");
                goto retry;
            }
            /* v8.2.4 按需采集（电流音刀一）：无消费者 >10s → Stop——引擎摘除
             * 采集管道，音频栈零参与；需求回来（<3s 新鲜）→ Start 恢复。
             * 没人看频谱时还在采 = 纯噪声窗（用户实测：关网页电流音消失）。 */
            if (!paused && capDemandAge(nowc) > CAP_IDLE_STOP_MS) {
                IAudioClient_Stop(client);
                paused = 1;
                snapCapState(0);
                logf_line("[cap] no consumer %us — loopback paused (engine detached)",
                          CAP_IDLE_STOP_MS / 1000);
            }
            if (paused) {
                for (;;) {
                    if (InterlockedCompareExchange(&g_exitFlag, 0, 0)) goto retry;
                    Sleep(200);
                    if (capDemandAge(GetTickCount()) < CAP_RESUME_FRESH_MS) break;
                }
                HRESULT h3 = IAudioClient_Start(client);
                if (FAILED(h3)) { logf_line("[cap] resume Start 0x%08lX", (unsigned long)h3); goto retry; }
                paused = 0;
                lastPktAt = GetTickCount();
                snapCapState(1);
                logf_line("[cap] consumer back — loopback resumed");
                continue;
            }
            UINT32 packet = 0;
            HRESULT h2 = IAudioCaptureClient_GetNextPacketSize(cap, &packet);
            if (FAILED(h2)) { logf_line("[cap] GetNextPacketSize 0x%08lX", (unsigned long)h2); goto retry; }
            if (packet == 0) {
                /* v8.2.4 零包保险：消费者在场（需求新鲜）却 >15s 零包 =
                 * 「loopback 初始化于静默期，开声后永不产包」的驱动 bug——
                 * 主动重初始化（lastPktAt 即节流戳，15s 至多一次） */
                if (capDemandAge(GetTickCount()) < CAP_RESUME_FRESH_MS &&
                    GetTickCount() - lastPktAt > CAP_NOPKT_REINIT_MS) {
                    logf_line("[cap] no packets %us with consumer — warmup reinit",
                              CAP_NOPKT_REINIT_MS / 1000);
                    lastPktAt = GetTickCount();
                    goto retry;
                }
                /* v8.2.3 无包两分支：
                   · >600ms 无非静音包 = 渲染设备无活跃流（换设备/停播）——
                     直接发布零快照（v8.2.2 在此对冻结环重跑 FFT = 把停机瞬间
                     的频谱永久复读，辉光恒亮不跳的根因）；
                   · 短间隙（正常帧间）——保时间戳新鲜跑 FFT。 */
                static long idleTicks = 0;
                DWORD nowc2 = GetTickCount();
                DWORD lastA = (DWORD)InterlockedCompareExchange(&g_lastAudioTick, 0, 0);
                if (nowc - lastA > 600) {
                    if ((++idleTicks & 0xF) == 0) {
                        float z[BANDS] = {0};
                        snapPublish(z, 0.0f);
                    }
                } else if ((++idleTicks & 0x7) == 0) {
                    fftRun();
                }
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
            lastPktAt = GetTickCount(); /* 有包：预热保险节流戳刷新 */
            /* v8.2.8 FFT 40Hz 节流（v8.2.5 曾 20Hz）：用户反馈律动滞后——
             * 帧龄上限 50→25ms；FFT 2048 单次 ~0.1ms，40Hz 增量可忽略。
             * SW/面板轮询同步 33ms（30Hz），端到端均值 ~130→~90ms */
            {
                DWORD nowF = GetTickCount();
                static DWORD lastFftAt = 0;
                if (nowF - lastFftAt >= 25) { lastFftAt = nowF; fftRun(); }
            }
        }

retry:
        if (inited) {
            inited = 0;
            snapCapState(0);
            /* v8.2.5 退避真实化：稳定 ≥60s 的断开才算「健康」（连败归零）；
             * 60s 内的 up→down 循环 = 驱动拉闸风暴，连败累进退避（30s 封顶） */
            if (stableSince && GetTickCount() - stableSince >= 60000) consecDown = 0;
            stableSince = 0;
            logf_line("[cap] link down (storm=%d) — reinit in %lums",
                      consecDown + 1, (unsigned long)backoffMs(consecDown));
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
        /* v8.2.4 优雅退出（电流音刀二）：loopback 必须 Stop+Release 干净、
         * COM 必须卸干净再退——裸杀活跃音频客户端留驱动烂摊子 */
        if (InterlockedCompareExchange(&g_exitFlag, 0, 0)) {
            logf_line("[exit] graceful teardown complete — loopback stopped & released");
            if (g_capGone) SetEvent(g_capGone);
            ExitProcess(0);
        }
        /* v8.2.5 退避：backoffMs(consecDown)——800ms 到 30s 封顶，
         * 归零只在「稳定运行 ≥60s」时发生（见上 retry 分支） */
        {
            int ms = (int)backoffMs(consecDown);
            for (int s = 0; s < ms; s += 100) {
                if (InterlockedCompareExchange(&g_exitFlag, 0, 0)) break;
                Sleep(100);
            }
        }
        consecDown++;
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* HTTP（hub 同款骨架：环回 only + 空连接快关 + CORS + PNA 头）             */
/* ------------------------------------------------------------------ */
/* （g_lastDataReqTick / g_specServed / g_firstSpecLogged / 退出面已上移到
 *  采集线程之前——v8.2.4 按需采集与优雅退出依赖） */

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
        InterlockedIncrement(&g_specServed);
        if (InterlockedCompareExchange(&g_firstSpecLogged, 1, 0) == 0) {
            logf_line("[http] first /api/spectrum client served (data face alive)");
        }
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
    /* v8.2.2 启动即留痕：日志先行于一切可早退分支——互斥体占用、WSA 失败、
       端口全忙都留得住痕（此前「进程根本没跑」无从取证） */
    InitializeCriticalSection(&g_logCs);
    InitializeCriticalSection(&g_snapCs);
    EnterCriticalSection(&g_logCs);
    if (g_logMode < 0) logPathResolveLocked();
    LeaveCriticalSection(&g_logCs);
    logf_line("[boot] process starting v%s (pid=%lu, parent-aware boot)",
              SPEC_VERSION, (unsigned long)GetCurrentProcessId());
    logf_line("[boot] log file (%s): %ls",
              logModeText(), g_logMode == 2 ? L"<unavailable>" : g_logPath);

    fftInit();

    /* v8.2.4 优雅退出事件 + 需求戳先置（cap 线程启动早于 HTTP 监听，
     * tick=0 由 capDemandAge 的「视为新鲜」兜底，这里再双保险） */
    g_capGone = CreateEventW(NULL, TRUE, FALSE, NULL);
    InterlockedExchange(&g_lastDataReqTick, (LONG)GetTickCount());

    /* 单例：同机重复双开（残留实例）直接退出——boot 端点会探测收养 */
    HANDLE mx = CreateMutexW(NULL, TRUE, SPEC_MUTEX_NAMEW);
    if (!mx) {
        logf_line("[boot] mutex create failed %lu — exit", (unsigned long)GetLastError());
        return 0;
    }
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        logf_line("[boot] another instance holds the mutex — exit (adopt path)");
        CloseHandle(mx);
        return 0;
    }

    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        logf_line("[boot] WSAStartup failed %lu — exit", (unsigned long)WSAGetLastError());
        return 0;
    }

    HANDLE capTh = CreateThread(NULL, 0, cap_thread, NULL, 0, NULL);
    if (capTh) CloseHandle(capTh);

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
            /* v8.2.3 健康心跳（每 10s 一行）：pkts 不涨 = 采集面无声（设备/
               输出错位）；pkts 涨 bass 0 = DSP 面；served=0 = 消费面没来。 */
            static int hb = 0;
            if (++hb >= 10) {
                hb = 0;
                float bb;
                EnterCriticalSection(&g_snapCs);
                bb = g_bass;
                LeaveCriticalSection(&g_snapCs);
                logf_line("[dsp] pkts=%lu lvl=%.4f bass=%.3f cap=%d served=%lu port=%d",
                          (unsigned long)InterlockedCompareExchange(&g_pktCount, 0, 0),
                          g_lvl, bb, g_capOk ? 1 : 0,
                          (unsigned long)InterlockedCompareExchange(&g_specServed, 0, 0),
                          port);
            }
            DWORD last = (DWORD)InterlockedCompareExchange(&g_lastDataReqTick, 0, 0);
            if (now - last > IDLE_EXIT_MS) {
                logf_line("[idle] no spectrum request for %us — self exit", IDLE_EXIT_MS / 1000);
                /* v8.2.4 优雅退出：置旗标 → 采集线程 Stop/Release/CoUninit
                 * 收摊 → 等离场事件（最多 3s，卡死兜底同旧行为） */
                InterlockedExchange(&g_exitFlag, 1);
                if (g_capGone) WaitForSingleObject(g_capGone, 3000);
                logf_line("[exit] process exit (clean)");
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
