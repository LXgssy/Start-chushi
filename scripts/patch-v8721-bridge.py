#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.21 / 桥 8.4.0：音频线程心跳 + 回前台即刻对拍（最小化休眠终局根治）"""
import sys, io

P = "/tmp/beta-wt/bridge/v8/plugins/music-bridge/index.js"
M = "/tmp/beta-wt/bridge/v8/plugins/music-bridge/manifest.json"

src = io.open(P, encoding="utf-8").read()
n = 0

def rep(old, new, tag):
    global src, n
    c = src.count(old)
    assert c == 1, f"[{tag}] expect 1 got {c}: {old[:60]!r}"
    src = src.replace(old, new)
    n += 1
    print(f"  ok {tag}")

# R1 版本串
rep("var VER = '8.3.5';", "var VER = '8.4.0';", "R1 VER")

# R2 文件头 v8.4.0 说明（插在架构律之前）
rep(" * v8 架构律（本代宪法）：",
""" *   v8.4.0（用户实机：网易云最小化一段时间后「初始」无法控制音乐播放等
 *   操作——v8.3.5 Worker 心跳在实机仍被节流：Chromium 新版把隐藏页/遮挡窗
 *   的专属 worker timer 纳入同档可见性节流，最小化 ≥5min intensive 档同样
 *   钳至 1/min，Worker 与页面 timer 一起熄火 = 桥停摆复现）：
 *   ①音频线程心跳——AudioContext + ScriptProcessor（CEF 老内核兼容，零
 *     模块加载）onaudioprocess 按硬件音频回调持续触发（页面隐藏照常），
 *     到拍点 postMessage 唤醒主线程跑 beat/drainCmds——message 是任务不是
 *     timer，任何节流档都不命中；样本写 55Hz·0.003 振幅正弦（≈-50dB 亚声
 *     频，听感为零；高于静音启发式阈值，兼得「页面出声=timer 豁免」加成，
 *     主线程/Worker timer 一并解钳）。
 *   ②回前台即刻对拍——visibilitychange visible 瞬间先补一轮 beat+drain，
 *     窗口恢复零等待；AudioContext suspended 时由 visibilitychange /
 *     pointerdown / 15s 兜底间隔反复 resume（autoplay 政策护栏）。
 *   ③三层驱动互为兜底：音频线程 → Worker → 页面 interval，共用 hbDispatch
 *     分发口，beatBusy/drainBusy 幂等挡重入；WebAudio 不可用静默降级。
 *
 * v8 架构律（本代宪法）：""", "R2 header")

# R3 Worker onmessage 收敛到 hbDispatch
rep("""      hbWorker.onmessage = function (e) {
        if (e.data === 1) { try { beat().catch(function () { }); } catch (eB) { } }
        else if (e.data === 2) { try { drainCmds(); } catch (eD) { } }
      };""",
"""      hbWorker.onmessage = function (e) { hbDispatch(e.data); };""", "R3 worker dispatch")

# R4 hbDispatch + 音频线程心跳驱动（插在 Worker catch 块与歌词重试之间）
rep("""    } catch (eHB) {
      hbWorker = null;
      traceCmd('hb', 'worker-no:legacy-interval');
    }
    /* 歌词请求超时重试（v8.0.7：备胎待命时不重试——歌词写入权也归持有者） */""",
"""    } catch (eHB) {
      hbWorker = null;
      traceCmd('hb', 'worker-no:legacy-interval');
    }
    /* v8.4.0 心跳分发共用口：Worker/音频线程双驱动同参（1=beat 2=drain） */
    function hbDispatch(k) {
      if (k === 1) { try { beat().catch(function () { }); } catch (eB) { } }
      else if (k === 2) { try { drainCmds(); } catch (eD) { } }
    }
    /* v8.4.0 音频线程心跳（「最小化一段时间后无法控制」终局根治）：
       音频渲染线程不在页面可见性节流域——ScriptProcessor onaudioprocess
       按硬件音频回调持续触发（隐藏/遮挡照常），到拍点 postMessage 唤醒
       主线程（任务非 timer）跑 beat/drainCmds。拍点按 ctx.currentTime 计。
       autoplay 护栏：suspended 由 visibilitychange/pointerdown/15s 兜底
       反复 resume；创建失败静默降级 Worker/interval（三层兜底，幂等挡重入） */
    try {
      var hbAC = window.AudioContext || window.webkitAudioContext;
      if (hbAC) {
        var hbCtx = new hbAC();
        var hbNode = hbCtx.createScriptProcessor(4096, 1, 1);
        var hbGain = hbCtx.createGain();
        hbGain.gain.value = 1; /* 振幅在样本里已钳 0.003，链上不再衰 */
        var hbPhase = 0, hbLastBeat = -1, hbLastDrain = -1;
        hbNode.onaudioprocess = function (ev) {
          try {
            var out = ev.outputBuffer.getChannelData(0);
            var sr = hbCtx.sampleRate || 48000;
            for (var si = 0; si < out.length; si++) {
              hbPhase = (hbPhase + 1) % sr; /* 55 整周期/秒：回绕相位连续 */
              out[si] = 0.003 * Math.sin(6.2832 * 55 * hbPhase / sr);
            }
            var t = hbCtx.currentTime;
            if (hbLastDrain < 0 || t - hbLastDrain >= DRAIN_MS / 1000) { hbLastDrain = t; hbDispatch(2); }
            if (hbLastBeat < 0 || t - hbLastBeat >= BEAT_MS / 1000) { hbLastBeat = t; hbDispatch(1); }
          } catch (eAP) { /* 音频回调内绝不外抛 */ }
        };
        hbNode.connect(hbGain);
        hbGain.connect(hbCtx.destination);
        var hbPoke = function () {
          try { if (hbCtx.state === 'suspended') { var pr = hbCtx.resume(); if (pr && pr.catch) pr.catch(function () { }); } } catch (eR) { }
        };
        hbPoke();
        document.addEventListener('visibilitychange', function () {
          hbPoke();
          /* 回前台即刻对拍：窗口恢复瞬间先补一轮状态+命令，零等待 */
          if (document.visibilityState === 'visible') { hbDispatch(1); hbDispatch(2); }
        });
        document.addEventListener('pointerdown', hbPoke, true);
        setInterval(hbPoke, 15000);
        traceCmd('hb', 'audio-drive:' + hbCtx.state);
      }
    } catch (eAD) {
      traceCmd('hb', 'audio-no:legacy-worker');
    }
    /* 歌词请求超时重试（v8.0.7：备胎待命时不重试——歌词写入权也归持有者） */""", "R4 audio heartbeat")

io.open(P, "w", encoding="utf-8").write(src)
print(f"bridge index.js patched: {n} replacements")

man = io.open(M, encoding="utf-8").read()
assert man.count('"version": "8.3.5"') == 1
man = man.replace('"version": "8.3.5"', '"version": "8.4.0"')
io.open(M, "w", encoding="utf-8").write(man)
print("manifest.json: version -> 8.4.0")
