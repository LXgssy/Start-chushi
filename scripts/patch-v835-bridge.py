#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-v835-bridge.py —— v8.3.5 桥 music-bridge/index.js 修（问题①面板无反应）：
①Worker 心跳抗节流——beat/drainCmds 跑在网易云 CEF 页面 setInterval，
  网易云窗口最小化/后台时 Chromium 对隐藏页 DOM timer 强节流（可至 1/min）
  → 状态不推（面板卡旧歌「下一首播一半才显示」）、命令不拉（「控制没效果」），
  窗口回前台才恢复。Worker 的 timer 不受隐藏页节流——blob Worker 定时
  postMessage 唤醒主线程（message 是任务不是 timer）跑 beat/drainCmds；
  原 setInterval 保留兜底（busy 守卫幂等，双驱动无害）。
②seek 读回终局即拍——doSeek 读回校验 ok/false 终局立即补一拍 beat，
  真值提前 ~1s 到页面（配合护航窗 0.8s 收窗 = seek 后歌词快速对齐）。
③VER 8.3.1→8.3.5。"""
import io, sys

P = "/tmp/my-project/bridge/v8/plugins/music-bridge/index.js"
src = io.open(P, encoding="utf-8").read()
orig = src
n = 0

def rep(old, new, tag):
    global src, n
    if old not in src:
        print("MISS [%s]: %r..." % (tag, old[:70])); sys.exit(1)
    if src.count(old) != 1:
        print("AMBIG[%s]: %d hits" % (tag, src.count(old))); sys.exit(1)
    src = src.replace(old, new); n += 1
    print("ok  [%s]" % tag)

# ---- ③版本 ----
rep("var VER = '8.3.1';", "var VER = '8.3.5';", "ver")

# ---- ①Worker 心跳（start() 内，原 setInterval 保留兜底）----
rep(
"""  function start() {
    readTruth();
    beat().finally(function () { });
    setInterval(function () { beat(); }, BEAT_MS);
    /* v8.2.9 命令快排循环：200ms 专职排空（与状态推送 beat 完全解耦） */
    setInterval(function () { drainCmds(); }, DRAIN_MS);""",
"""  function start() {
    readTruth();
    beat().finally(function () { });
    setInterval(function () { beat(); }, BEAT_MS);
    /* v8.2.9 命令快排循环：200ms 专职排空（与状态推送 beat 完全解耦） */
    setInterval(function () { drainCmds(); }, DRAIN_MS);
    /* v8.3.5 后台抗节流心跳（「下一首歌已播一半才显示 + 控制没效果」根治）：
       上面两组 setInterval 跑在网易云 CEF 页面主线程——网易云窗口最小化/
       完全遮挡时 Chromium 对隐藏页 DOM timer 强节流（intensive throttling
       链式定时器可至 1/min）→ 桥停摆：状态不推（面板/浮窗卡旧歌）、
       命令不拉（控制无响应），窗口回前台才恢复（用户实测「下一首歌已播
       一半才显示」的分钟级延迟即此）。Worker 的 timer 不在隐藏页节流域——
       blob Worker 定时 postMessage 唤醒主线程（message 是任务不是 timer，
       不节流）跑 beat/drainCmds。原 setInterval 保留兜底：Worker 创建失败
       （CEF 禁用/安全策略）或被杀时退回旧行为；双驱动无害（beatBusy/
       drainBusy 幂等守卫，重复触发被挡）。onerror 自毁退回纯 interval。 */
    var hbWorker = null;
    try {
      var hbSrc = 'setInterval(function(){postMessage(1)},' + BEAT_MS + ');' +
                  'setInterval(function(){postMessage(2)},' + DRAIN_MS + ');';
      hbWorker = new Worker(URL.createObjectURL(
        new Blob([hbSrc], { type: 'text/javascript' })));
      hbWorker.onmessage = function (e) {
        if (e.data === 1) { try { beat().catch(function () { }); } catch (eB) { } }
        else if (e.data === 2) { try { drainCmds(); } catch (eD) { } }
      };
      hbWorker.onerror = function () {
        try { hbWorker.terminate(); } catch (eT) { }
        hbWorker = null;
        traceCmd('hb', 'worker-down:legacy-interval');
      };
    } catch (eHB) {
      hbWorker = null;
      traceCmd('hb', 'worker-no:legacy-interval');
    }""", "worker")

# ---- ②doSeek 读回终局即拍 ----
rep(
"""    function check() {
      tried++;
      var r = readPos();
      if (r >= 0 && Math.abs(r - pos) < 2.5) { seekAck.ok = true; seekAck.at = nowMs(); return; }
      if (tried < 3) { setTimeout(check, tried === 1 ? 580 : 1200); return; }
      if (r >= 0) { seekAck.ok = false; seekAck.at = nowMs(); }
      /* r<0：全程无读回源 → ok 保持 null（诚实未知） */
    }
    setTimeout(check, 420);""",
"""    function check() {
      tried++;
      var r = readPos();
      if (r >= 0 && Math.abs(r - pos) < 2.5) {
        seekAck.ok = true; seekAck.at = nowMs();
        /* v8.3.5 读回终局即拍：真值（跳转后位置）立即推 hub，不等 BEAT_MS
           1s 节拍——页面护航窗（0.8s 收窗）提前 ~1s 拿到真值，seek 后歌词
           快速对齐（「跳转后要校准」根治的桥侧一刀）。 */
        setTimeout(function () { try { beat().catch(function () { }); } catch (eS) { } }, 60);
        return;
      }
      if (tried < 3) { setTimeout(check, tried === 1 ? 580 : 1200); return; }
      if (r >= 0) {
        seekAck.ok = false; seekAck.at = nowMs();
        /* v8.3.5：失败终局同样即拍——页面尽早诚实回锚（护航窗过期前） */
        setTimeout(function () { try { beat().catch(function () { }); } catch (eS2) { } }, 60);
      }
      /* r<0：全程无读回源 → ok 保持 null（诚实未知） */
    }
    setTimeout(check, 420);""", "doseek")

io.open(P, "w", encoding="utf-8").write(src)
print("music-bridge/index.js: %d patches, %d -> %d bytes" % (n, len(orig), len(src)))
