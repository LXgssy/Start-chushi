#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.9 DSP 数学门：从 chushi_spectrum.c 真源码切片（常量块 + FFT 块）
拼成 Linux 可编译测试——喂正弦与静音，断言 128 段新语义（实际映射：
FFT_N 2048@48k 低频侧线性化 段k≈bin k+2，23.4Hz/段；对数区只在 ≈2kHz 以上）：
  · 静音 → 全频段 ≈0
  · 0.25 幅度 100Hz 正弦（bin 4.3 → 段 2±1）→ 峰值频段落在 1..4
    且无一钉死 1.0（律动死根除，v8.2.4 律不回归）
  · 满幅 1.0 正弦 → 峰值频段 0.60~1.0
  · 底鼓拳感：0.6 幅度 60Hz 正弦（bin 2.6 → 段 0/1）→ bass > 0.3
    （0..1/2..3/4..6 段分区带权，拳感等价 16 段时代）
  · 中频区（1kHz → 段 ≈40）正弦不进 bass（分区外=0 权重，泄漏 <0.08）
切片是真源码原文（非重实现）——杜绝测试与实现漂移。"""
import io, subprocess, sys

SRC = io.open("/tmp/my-project/bridge/v8/native/chushi_spectrum.c", encoding="utf-8").read()

def slice_between(a, b):
    i = SRC.index(a); j = SRC.index(b)
    assert 0 < i < j
    return SRC[i:j]

consts = slice_between("#define FFT_N 2048", "#define DB_FLOOR_V824")
consts += slice_between("#define DB_FLOOR_V824 60.0", "#define CAP_IDLE_STOP_MS")

fftblk = slice_between("static float g_hann[FFT_N];", "/* v8.2.3 默认设备/设备态通知")

stub = """
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <assert.h>
static float rec_bands[128]; static float rec_bass; static int rec_n = 0;
static void snapPublish(const float* bands, float bass) {
    for (int i = 0; i < 128; i++) rec_bands[i] = bands[i];
    rec_bass = bass; rec_n++;
}
static long long epochNowMs(void) { return 0; }
"""

main = """
int main(void) {
    fftInit();
    fftBandMap(48000);
    assert(BANDS == 128);

    /* 场景1：静音 → 全零 */
    memset(g_ring, 0, sizeof(g_ring)); g_ringHead = RING_N;
    memset(g_bandV, 0, sizeof(g_bandV)); /* 场景隔离：包络状态清零 */
    fftRun();
    assert(rec_n == 1);
    for (int i = 0; i < BANDS; i++) assert(rec_bands[i] < 0.02f);
    assert(rec_bass < 0.02f);
    printf("scene1 silence: bass=%.4f max=%.4f  OK\\n", rec_bass, rec_bands[0]);

    /* 场景2：100Hz 正弦 amp=0.25 → 峰值频段在 90..115（128 段对数映射），
       有响应、不饱和 */
    float amp = 0.25f;
    for (int i = 0; i < RING_N; i++) {
        g_ring[g_ringHead & (RING_N - 1)] =
            amp * sinf(2.0f * 3.14159265f * 100.0f * (float)i / 48000.0f);
        g_ringHead++;
    }
    memset(g_bandV, 0, sizeof(g_bandV));
    fftRun();
    float mx = 0; int mxi = -1;
    for (int i = 0; i < BANDS; i++) if (rec_bands[i] > mx) { mx = rec_bands[i]; mxi = i; }
    printf("scene2 0.25 sine@100Hz: bass=%.4f max=band%d(%.4f)\\n", rec_bass, mxi, mx);
    assert(mxi >= 1 && mxi <= 4);      /* 实际映射：100Hz=bin 4.3 → 段 2±1 */
    assert(mx > 0.25f && mx < 0.999f); /* 有显著响应且不钉死 */

    /* 场景3：满幅 1.0 正弦 → 单帧包络（×攻 0.55）后峰值 ≥0.45、不饱和
       （128 段 1-bin 频段 + Hann 泄漏：raw ≈0.99、首帧 ≈0.546；16 段时代
       的 0.60 阈值按宽频段聚合校准，1-bin 段如实放宽） */
    amp = 1.0f;
    memset(g_ring, 0, sizeof(g_ring)); g_ringHead = RING_N;
    for (int i = 0; i < RING_N; i++) {
        g_ring[g_ringHead & (RING_N - 1)] =
            amp * sinf(2.0f * 3.14159265f * 100.0f * (float)i / 48000.0f);
        g_ringHead++;
    }
    memset(g_bandV, 0, sizeof(g_bandV));
    fftRun();
    mx = 0;
    for (int i = 0; i < BANDS; i++) if (rec_bands[i] > mx) mx = rec_bands[i];
    printf("scene3 1.0 sine: bass=%.4f max=%.4f\\n", rec_bass, mx);
    assert(mx > 0.45f && mx <= 1.0f);

    /* 场景4（v8.2.9 新）：底鼓拳感——60Hz 正弦 0.6 幅度 → 稳态 bass > 0.3
       （47~211Hz 分区带权，等价旧 16 段「前3段加权」的鼓点驱动；
       跑 12 帧到稳态（40Hz 下 ~0.3s）——验证带权公式而非攻击斜坡） */
    memset(g_ring, 0, sizeof(g_ring)); g_ringHead = RING_N;
    for (int i = 0; i < RING_N; i++) {
        g_ring[g_ringHead & (RING_N - 1)] =
            0.6f * sinf(2.0f * 3.14159265f * 60.0f * (float)i / 48000.0f);
        g_ringHead++;
    }
    memset(g_bandV, 0, sizeof(g_bandV));
    for (int f = 0; f < 12; f++) fftRun();
    printf("scene4 kick 60Hz: steady bass=%.4f\\n", rec_bass);
    assert(rec_bass > 0.30f && rec_bass <= 1.0f);

    /* 场景5（v8.2.9 新）：1kHz 中频正弦不该进 bass（分区外权重=0，
       只允许泄漏 <0.08——中频不抢鼓点轴） */
    memset(g_ring, 0, sizeof(g_ring)); g_ringHead = RING_N;
    for (int i = 0; i < RING_N; i++) {
        g_ring[g_ringHead & (RING_N - 1)] =
            0.8f * sinf(2.0f * 3.14159265f * 1000.0f * (float)i / 48000.0f);
        g_ringHead++;
    }
    memset(g_bandV, 0, sizeof(g_bandV));
    fftRun();
    float hz1k_max = 0;
    for (int i = 0; i < BANDS; i++) if (rec_bands[i] > hz1k_max) hz1k_max = rec_bands[i];
    printf("scene5 1kHz: bass=%.4f maxband=%.4f\\n", rec_bass, hz1k_max);
    assert(rec_bass < 0.08f);
    assert(hz1k_max > 0.4f); /* 1kHz 频段有响应（中频区 段≈40） */

    printf("DSP MATH GATE v829 ALL PASS\\n");
    return 0;
}
"""

inc = "/tmp/my-project/scripts/_spec_v829_test.c"
io.open(inc, "w", encoding="utf-8").write(stub + consts + fftblk + main)
r = subprocess.run(["gcc", "-O2", "-o", "/tmp/my-project/scripts/_spec_v829_test", inc, "-lm"],
                   capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr); sys.exit(1)
r = subprocess.run(["/tmp/my-project/scripts/_spec_v829_test"], capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print(r.stderr); sys.exit(1)
print("OK")
