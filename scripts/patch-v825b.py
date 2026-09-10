#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.5 补丁第二段（A5 起续做；A1-A4 已由 patch-v825.py 落盘）"""
import pathlib, re, subprocess

ROOT = pathlib.Path('/tmp/my-project')
def patch(rel, old, new, count=1):
    p = ROOT / rel
    s = p.read_text(encoding='utf-8')
    if old not in s:
        raise SystemExit(f'PATCH FAIL: {rel} 找不到锚点:\n---\n{old[:200]}\n---')
    n = s.count(old)
    if n != count:
        raise SystemExit(f'PATCH FAIL: {rel} 锚点出现 {n} 次（期望 {count}）')
    p.write_text(s.replace(old, new), encoding='utf-8')
    print(f'  ok {rel}: {old.strip().splitlines()[0][:60]!r}...')

# ============ A5-A8. chushi_spectrum.c ============
SP = 'bridge/v8/native/chushi_spectrum.c'

patch(SP, """    int inited = 0;
    int consecDown = 0;     /* v8.2.4 设备失效风暴连败计数（成功 up 归零） */
    capTuneThreadPriority(); /* v8.2.5：BELOW_NORMAL 让核（撤 MMCSS Pro Audio） */""",
"""    int inited = 0;
    int consecDown = 0;     /* 设备失效风暴连败计数（v8.2.5：稳定 ≥60s 才归零） */
    DWORD stableSince = 0;  /* v8.2.5 本次 up 的稳定计时起点 */
    capTuneThreadPriority(); /* v8.2.5：BELOW_NORMAL 让核（撤 MMCSS Pro Audio） */""")

patch(SP, """    for (;;) { /* 设备级重初始化循环 */
        int haveCo = 0, haveEnum = 0, haveDev = 0, haveClient = 0, haveCap = 0;""",
"""    for (;;) { /* 设备级重初始化循环 */
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
        int haveCo = 0, haveEnum = 0, haveDev = 0, haveClient = 0, haveCap = 0;""")

patch(SP, """        logf_line("[cap] loopback up: %uHz %uch %s", g_rate, ch, fmtFloat ? "float" : "pcm16");
        inited = 1;
        consecDown = 0;
        snapCapState(1);""",
"""        logf_line("[cap] loopback up: %uHz %uch %s", g_rate, ch, fmtFloat ? "float" : "pcm16");
        inited = 1;
        stableSince = GetTickCount(); /* v8.2.5：稳定计时起点（≥60s 才算健康归零） */
        snapCapState(1);""")

patch(SP, """        if (inited) {
            inited = 0;
            snapCapState(0);
            logf_line("[cap] link down — reinit in %dms",
                      800 << (consecDown > 2 ? 2 : consecDown));
        }""",
"""        if (inited) {
            inited = 0;
            snapCapState(0);
            /* v8.2.5 退避真实化：稳定 ≥60s 的断开才算「健康」（连败归零）；
             * 60s 内的 up→down 循环 = 驱动拉闸风暴，连败累进退避（30s 封顶） */
            if (stableSince && GetTickCount() - stableSince >= 60000) consecDown = 0;
            stableSince = 0;
            logf_line("[cap] link down (storm=%d) — reinit in %lums",
                      consecDown + 1, (unsigned long)backoffMs(consecDown));
        }""")

patch(SP, """        /* v8.2.4 设备失效风暴退避升级：800ms → 1.6s → 3.2s → 5s 封顶
         * （成功 up 时 consecDown 已归零——每次重初始化都在折腾引擎 =
         * 日志里 13:59 段每 5s 一次 0x88890004 风暴的放大器） */
        {
            int ms = 800 << (consecDown > 2 ? 2 : consecDown);
            if (ms > 5000) ms = 5000;
            for (int s = 0; s < ms; s += 100) {""",
"""        /* v8.2.5 退避：backoffMs(consecDown)——800ms 到 30s 封顶，
         * 归零只在「稳定运行 ≥60s」时发生（见上 retry 分支） */
        {
            int ms = (int)backoffMs(consecDown);
            for (int s = 0; s < ms; s += 100) {""")

patch(SP, """            capPush(data, frames, fmtFloat, ch, flags);
            IAudioCaptureClient_ReleaseBuffer(cap, frames);
            lastPktAt = GetTickCount(); /* 有包：预热保险节流戳刷新 */
            fftRun();""",
"""            capPush(data, frames, fmtFloat, ch, flags);
            IAudioCaptureClient_ReleaseBuffer(cap, frames);
            lastPktAt = GetTickCount(); /* 有包：预热保险节流戳刷新 */
            /* v8.2.5 FFT 20Hz 节流：包流 ~100Hz，发布只需 20Hz（与 SW/面板
             * 轮询对齐）——每包只推采样环，50ms 一拍才 FFT+发布（CPU -80%） */
            {
                DWORD nowF = GetTickCount();
                static DWORD lastFftAt = 0;
                if (nowF - lastFftAt >= 50) { lastFftAt = nowF; fftRun(); }
            }""")

# ============ B. chushi_hub.c ============
HB = 'bridge/v8/native/chushi_hub.c'

patch(HB, ' * ChuShi Music Hub 8.2.3 ——（本版仅随助手 8.2.3 重编译',
""" * ChuShi Music Hub 8.2.5 —— v8.2.5（电流音根治·引擎零扰律，hub 侧两刀）：
 *   ① hub 中继线程 + 频谱 keeper 线程 SetThreadPriority(BELOW_NORMAL)——
 *     本 DLL 住在网易云进程内，线程默认优先级与网易云音频渲染线程同级，
 *     抢调度是进程内 glitch 源；降一级永远让核给音频。
 *   ② 版本随动 8.2.5（助手侧需求门/退避真实化/撤 MMCSS/FFT 20Hz，见
 *     chushi_spectrum.c 头注）。协议零变更。
 *
 * ChuShi Music Hub 8.2.3 ——（历史：本版仅随助手 8.2.3 重编译""")

patch(HB, '#define PLUGIN_VERSION "8.2.4"', '#define PLUGIN_VERSION "8.2.5"')

patch(HB, """static DWORD WINAPI spec_keeper_thread(LPVOID arg) {
    (void)arg;
    for (;;) {""",
"""static DWORD WINAPI spec_keeper_thread(LPVOID arg) {
    (void)arg;
    /* v8.2.5：网易云进程内让核给音频线程（电流音根治 hub 刀） */
    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
    for (;;) {""")

patch(HB, """    logf_line("[boot] ChuShi Music Hub v%s (winsock relay, zero WinRT)", PLUGIN_VERSION);

    static char req[REQ_MAX + 2];""",
"""    logf_line("[boot] ChuShi Music Hub v%s (winsock relay, zero WinRT)", PLUGIN_VERSION);
    /* v8.2.5：中继线程降一级优先级——hub 永不与网易云音频渲染线程抢调度 */
    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);

    static char req[REQ_MAX + 2];""")

# ============ C. ext-bg.js ============
BG = 'extension-src/ext-bg.js'

patch(BG, ' * 「初始」ext-bg v8.2.4 —— MV3 Service Worker：跨页面音乐卡状态中继',
""" * 「初始」ext-bg v8.2.5 —— MV3 Service Worker：跨页面音乐卡状态中继
 *
 * v8.2.5（电流音根治·引擎零扰律，SW 侧）：频谱轮询 33ms→50ms（30Hz→20Hz，
 *   与助手发布节奏对齐）——本机回环 HTTP 每秒请求数 -33%，发现退避节拍
 *   同步改 100 拍 ≈5s。律动顺滑度无感（助手侧本就 20Hz 快攻慢放包络）。""")

patch(BG, '/* 30Hz 频谱流：原始帧直发（包络在卡片侧做，与页面端同参数） */',
      '/* 20Hz 频谱流（v8.2.5 引擎零扰律）：原始帧直发（包络在卡片侧做，与页面端同参数） */')

patch(BG, 'let specBusy = false; /* v8.2.4 在飞守卫：助手失联时 33ms 定时器 × 450ms 超时会堆请求 */',
      'let specBusy = false; /* v8.2.4 在飞守卫：助手失联时 50ms 定时器 × 450ms 超时会堆请求 */')

patch(BG, """      await specTick();
    } finally {
      specBusy = false;
    }
  }, 33);""",
"""      await specTick();
    } finally {
      specBusy = false;
    }
  }, 50); /* v8.2.5：20Hz（原 33ms/30Hz）——请求数 -33%，与助手发布节奏对齐 */""")

patch(BG, '      if (++bootBeats >= 150) { bootBeats = 0; await discoverSpec(); }',
      '      if (++bootBeats >= 100) { bootBeats = 0; await discoverSpec(); } /* 100×50ms ≈ 5s */')

# ============ D. smtc.ts ============
SM = 'src/lib/startpage/smtc.ts'

patch(SM, 'const CLIENT_VER = "8.2.4";', 'const CLIENT_VER = "8.2.5";')

patch(SM, 'const SPEC_FRAME_MS = 33;       /* 30Hz */',
      'const SPEC_FRAME_MS = 50;       /* 20Hz（v8.2.5 引擎零扰律：与助手发布节奏对齐，请求 -33%） */')

patch(SM, 'const SPEC_BOOT_EVERY = 150;    /* 发现重试节拍（×33ms ≈ 5s） */',
      'const SPEC_BOOT_EVERY = 100;    /* 发现重试节拍（×50ms ≈ 5s） */')

patch(SM, '/*   - 30Hz 轮询只在：有订阅者 + 页面可见；数据端点连续 3 败 → 弃端口缓存； */',
      '/*   - 20Hz 轮询只在：有订阅者 + 页面可见；数据端点连续 3 败 → 弃端口缓存； */')

# ============ E. build-extension.py ============
BE = 'scripts/build-extension.py'
patch(BE, 'VERSION = "8.2.4"', 'VERSION = "8.2.5"')

print('\n== 自检 ==')
r = subprocess.run(['node', '--check', str(ROOT / BG)], capture_output=True, text=True)
if r.returncode != 0:
    raise SystemExit(f'ext-bg.js 语法门 FAIL:\n{r.stderr}')
print('  ext-bg.js 语法门过')

sp_txt = (ROOT / SP).read_text(encoding='utf-8')
for feat in ('demand gate', 'engine untouched', 'backoffMs', 'stableSince',
             'capTuneThreadPriority', 'THREAD_PRIORITY_BELOW_NORMAL', '8.2.5',
             'nowF - lastFftAt >= 50'):
    if feat not in sp_txt:
        raise SystemExit(f'spectrum 缺特征 {feat!r}')
if 'AvSetMmThreadCharacteristicsW' in sp_txt:
    raise SystemExit('MMCSS 残留未撤净')
print('  chushi_spectrum.c 特征门过（需求门/退避真实化/撤MMCSS/FFT节流）')

hb_txt = (ROOT / HB).read_text(encoding='utf-8')
for feat in ('8.2.5', 'THREAD_PRIORITY_BELOW_NORMAL'):
    if feat not in hb_txt:
        raise SystemExit(f'hub 缺特征 {feat!r}')
print('  chushi_hub.c 特征门过')

bg_txt = (ROOT / BG).read_text(encoding='utf-8')
if re.search(r'\},\s*33\)', bg_txt):
    raise SystemExit('ext-bg.js 仍残留 33ms 定时器')
print('  ext-bg.js 特征门过（50ms 轮询在位）')

sm_txt = (ROOT / SM).read_text(encoding='utf-8')
for feat in ('SPEC_FRAME_MS = 50', 'CLIENT_VER = "8.2.5"'):
    if feat not in sm_txt:
        raise SystemExit(f'smtc.ts 缺特征 {feat!r}')
print('  smtc.ts 特征门过')

be_txt = (ROOT / BE).read_text(encoding='utf-8')
if 'VERSION = "8.2.5"' not in be_txt:
    raise SystemExit('build-extension.py 版本未更新')
print('  build-extension.py 版本门过')

print('\nPATCH v8.2.5 ALL DONE')
