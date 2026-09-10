#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.6 性能特供补丁——「5070 卡成屎」根治（浮窗/SW 侧）。

背景（用户实机 09-10 日志三方互证）：
  ① spectrum-log：v8.2.2/v8.2.3 死亡循环（71 启动/69 自杀/3h）——v8.2.5 桥已根治，
     用户尚未安装（本补丁不动桥，桥 8.2.5 沿用）。
  ② ext-card.js：rAF 主循环无条件永转（requestAnimationFrame(loop) 无守卫）——
     每个开着网页的前台标签 60fps 永动 + SW 每 50ms spec 广播全量扇出（cards 全发）
     = N 标签 × 20msg/s 的 renderer 唤醒风暴。
  ③ ext-bg.js：spec 广播不分订阅者全量发；paused 态每 50ms 一条 on:false 空转帧；
     state 1s 轮询在全部卡片 hidden 时照跑。

四刀（本轮）：
  A. ext-card.js rAF 休眠改造：needFrame() 判定「还有活干」才续帧；hidden 立睡、
     无曲目睡、mini/cover 静态走针降 200ms 节拍、辉光衰减尾归零后才睡。
  B. ext-card.js visibilitychange 联动：hidden → spec off + vis off + sleepNow；
     visible → spec on + vis on + wake——后台标签从频谱链路整体撤离，
     SW specWanted 归零 → 助手零消费者 → v8.2.5 需求门让引擎长眠。
  C. ext-bg.js：broadcastSpec 只发 __spec 订阅卡（state 保留全发）；paused 空转帧
     改状态翻转门（20msg/s → 0）；{type:"vis"} 可见性门控 state 轮询
     （visCount===0 时 SW state 轮询停——浏览器整体后台 = 全链静默）。
  D. 版本 8.2.6（build-extension.py VERSION + smtc.ts CLIENT_VER）+ 特征门补。

⚠ 桥（chushi-spectrum.exe / hub.dll）本轮零改动——8.2.5 交付继续有效。
"""
import pathlib
import sys

ROOT = pathlib.Path("/tmp/my-project")
CARD = ROOT / "extension-src" / "ext-card.js"
BG = ROOT / "extension-src" / "ext-bg.js"
SMTC = ROOT / "src" / "lib" / "startpage" / "smtc.ts"
BUILD = ROOT / "scripts" / "build-extension.py"


def patch(path, subs):
    raw = path.read_text(encoding="utf-8")
    out = raw
    for i, (old, new) in enumerate(subs):
        if old not in out:
            sys.exit(f"FAIL [{path.name}] 补丁段 #{i} 锚点未命中:\n---\n{old[:300]}\n---")
        if out.count(old) != 1:
            sys.exit(f"FAIL [{path.name}] 补丁段 #{i} 锚点不唯一 (count={out.count(old)}):\n---\n{old[:200]}\n---")
        out = out.replace(old, new, 1)
    path.write_text(out, encoding="utf-8")
    print(f"OK {path.name}: {len(subs)} 段")


# ============================================================ ext-card.js
CARD_SUBS = [
    # ---- 头注释版本段 ----
    (
        " * 「初始」ext-card v8.2.4 —— 内容脚本：悬浮音乐卡（置顶所有网页，三态）\n"
        " *\n"
        " * v8.2.3 实机反馈四连修：",
        " * 「初始」ext-card v8.2.6 —— 内容脚本：悬浮音乐卡（置顶所有网页，三态）\n"
        " *\n"
        " * v8.2.6 性能特供（「5070 卡成屎」根治·渲染休眠律）：\n"
        " *   ① rAF 主循环休眠改造——旧版 requestAnimationFrame(loop) 无条件永转，\n"
        " *      每个开着网页的前台标签 60fps 永动（Chrome 只暂停后台标签 rAF，\n"
        " *      前台标签哪怕浮窗无曲目也全帧跑）。现 needFrame() 判定「还有活干」\n"
        " *      才续帧：hidden 立睡 / 无曲目睡 / mini·cover 纯走针降 200ms 定时\n"
        " *      节拍（字符串每秒才变一次）/ 辉光衰减尾归零后才睡。\n"
        " *   ② visibilitychange 联动——标签切后台：spec off + vis off + sleepNow；\n"
        " *      切回：spec on + vis on + wake。后台标签整体撤离频谱链路，\n"
        " *      SW specWanted 归零 → 助手零消费者 → v8.2.5 需求门让引擎长眠。\n"
        " *   ③ connect() 频谱订阅按可见性初值（hidden 标签不订阅）。\n"
        " * v8.2.3 实机反馈四连修：",
    ),
    # ---- connect()：spec 订阅按可见性 + vis 上报 ----
    (
        "    /* 订阅频谱（卡片辉光律动） */\n"
        "    try { port.postMessage({ type: \"spec\", on: true }); } catch (e) { /* 同上 */ }\n"
        "  }",
        "    /* v8.2.6 订阅按可见性初值：hidden 标签不订阅频谱也不报可见\n"
        "       （visCount=0 → SW state 轮询停；specWanted=0 → 引擎零参与）。\n"
        "       可见性变化由 visibilitychange 处理器统一翻转。 */\n"
        "    var vis = document.visibilityState === \"visible\";\n"
        "    try {\n"
        "      port.postMessage({ type: \"spec\", on: vis });\n"
        "      port.postMessage({ type: \"vis\", on: vis });\n"
        "    } catch (e) { /* 断线事件接管 */ }\n"
        "  }",
    ),
    # ---- setMode 唤醒（态切换后走针/渲染接管） ----
    (
        "  function setMode(m) {\n"
        "    if (!SURFS[m] || m === mode) return;\n"
        "    mode = m; lastTcur = \"\"; /* 强制下一帧重写 tcur/mtm——防态切换残留旧串 */\n"
        "    savePos(); applyMode();\n"
        "  }",
        "  function setMode(m) {\n"
        "    if (!SURFS[m] || m === mode) return;\n"
        "    mode = m; lastTcur = \"\"; /* 强制下一帧重写 tcur/mtm——防态切换残留旧串 */\n"
        "    savePos(); applyMode();\n"
        "    wake(); /* v8.2.6 态切换接管：循环若在睡（如 cover 静置）按新态需求重估 */\n"
        "  }",
    ),
    # ---- onUp 唤醒（拖动结束保险） ----
    (
        "  function onUp() {\n"
        "    if (drag.on && drag.moved) {\n"
        "      savePos();\n"
        "      if (drag.surf === coverEl) coverClickBlock = Date.now(); /* 拖后拦截误触 click */\n"
        "    }\n"
        "    drag.on = 0;\n"
        "  }",
        "  function onUp() {\n"
        "    if (drag.on && drag.moved) {\n"
        "      savePos();\n"
        "      if (drag.surf === coverEl) coverClickBlock = Date.now(); /* 拖后拦截误触 click */\n"
        "    }\n"
        "    drag.on = 0;\n"
        "    wake(); /* v8.2.6 拖动结束保险（进度/走针接续） */\n"
        "  }",
    ),
    # ---- onMsg 唤醒点 ----
    (
        "      ingestTrack(nt);\n"
        "      renderStatic();\n"
        "      host.style.display = \"block\";\n"
        "      applyVis();\n"
        "      lyricTick(); /* 切歌检测（want 变化时内部自重建） */\n"
        "    } else if (m.type === \"spec\") {\n"
        "      lastSpec = { on: m.on === true, bass: Number(m.bass) || 0, t: Date.now() };\n"
        "    } else if (m.type === \"cmdOk\" && m.id) {",
        "      ingestTrack(nt);\n"
        "      renderStatic();\n"
        "      host.style.display = \"block\";\n"
        "      applyVis();\n"
        "      lyricTick(); /* 切歌检测（want 变化时内部自重建） */\n"
        "      wake(); /* v8.2.6 真值到达：循环若在睡（无曲目期）此处唤醒 */\n"
        "    } else if (m.type === \"spec\") {\n"
        "      lastSpec = { on: m.on === true, bass: Number(m.bass) || 0, t: Date.now() };\n"
        "      if (lastSpec.on) wake(); /* v8.2.6 频谱活动帧：辉光包络需要帧 */\n"
        "    } else if (m.type === \"cmdOk\" && m.id) {",
    ),
    # ---- rAF 主循环：休眠四件套 ----
    (
        "  /* ---------- rAF 主循环：进度插值 + 完全体歌词帧 + 辉光律动 ---------- */\n"
        "  var lastFillW = \"\";\n"
        "  var lastTcur = \"\", lastTdur = \"\";\n"
        "  function loop() {\n"
        "    if (track) {\n"
        "      var dur = track.duration || 0;\n"
        "      var pr = dur > 0 ? Math.min(1, posNow() / dur) : 0;\n"
        "      var w = (pr * 100).toFixed(2) + \"%\";\n"
        "      if (w !== lastFillW) {\n"
        "        lastFillW = w;\n"
        "        fill.style.width = w;\n"
        "        ffill.style.width = w;\n"
        "      }\n"
        "      if (mode === \"full\") {\n"
        "        /* 写值防抖：fmt 每秒才变一次，字符串比对代替每帧 textContent 写 */\n"
        "        var tc = fmt(posNow());\n"
        "        if (tc !== lastTcur) { lastTcur = tc; tcur.textContent = tc; mtm.textContent = tc; }\n"
        "        var td = dur > 0 ? fmt(dur) : \"--:--\";\n"
        "        if (td !== lastTdur) { lastTdur = td; tdur.textContent = td; }\n"
        "        lyricFrame();\n"
        "      } else if (mode === \"mini\") {\n"
        "        /* v8.2.3b 顶带时间在 mini 也走针（空带填充修复的本体——不然带左\n"
        "           时间永远冻结在 0:00，空带照旧） */\n"
        "        var tc = fmt(posNow());\n"
        "        if (tc !== lastTcur) { lastTcur = tc; mtm.textContent = tc; }\n"
        "      }\n"
        "    }\n"
        "    var tgt = lastSpec.on && effPlaying() ? lastSpec.bass : 0;\n"
        "    envBass += (tgt - envBass) * (tgt > envBass ? 0.55 : 0.14);\n"
        "    if (envBass < 0.005) envBass = 0;\n"
        "    var gOp = envBass > 0.012 ? (0.2 + envBass * 0.3).toFixed(3) : \"0\";\n"
        "    if (glow.style.opacity !== gOp) { glow.style.opacity = gOp; glow2.style.opacity = gOp; }\n"
        "    /* 播放态图标真值回收（乐观窗口到期后与真值对齐） */\n"
        "    if (optAt && Date.now() - optAt >= 2500) { optAt = 0; applyVis(); }\n"
        "    requestAnimationFrame(loop);\n"
        "  }\n"
        "\n"
        "  /* ---------- 启动 ---------- */\n"
        "  loadHide(function () {\n"
        "    if (siteHidden) return; /* 本站隐藏：不挂载 UI（SW 连接也省了） */\n"
        "    loadPos();\n"
        "    connect();\n"
        "    applyPos();\n"
        "    applyMode();\n"
        "    requestAnimationFrame(loop);\n"
        "  });",
        "  /* ---------- rAF 主循环：进度插值 + 完全体歌词帧 + 辉光律动 ----------\n"
        "     v8.2.6 休眠改造（5070 卡顿根治①）：循环不再无条件永转——\n"
        "     needFrame() 判定「还有活干」才续帧：\n"
        "     · 页面 hidden（切后台/最小化）→ 立睡（visibilitychange 唤醒）；\n"
        "     · 无曲目 → 睡（state 消息唤醒）；\n"
        "     · 频谱活动（spec.on && playing）→ rAF 60fps（辉光包络要顺滑）；\n"
        "     · 完全体 → rAF（逐字扫光逐帧）；\n"
        "     · mini 走针 / cover 静置 → 200ms 定时节拍（1s 变一次的字符串够用）；\n"
        "     · 辉光衰减尾（envBass>0.012）→ 续帧到归零再睡（辉光不冻半透明）。\n"
        "     后台标签同时撤频谱订阅（②）——三件联动把「N 标签 × 60fps rAF +\n"
        "     N × 20msg/s spec 扇出」的 renderer 唤醒风暴整体清零。 */\n"
        "  var lastFillW = \"\";\n"
        "  var lastTcur = \"\", lastTdur = \"\";\n"
        "  var rafId = 0, tickTimer = 0;\n"
        "  function loopBody() {\n"
        "    if (track) {\n"
        "      var dur = track.duration || 0;\n"
        "      var pr = dur > 0 ? Math.min(1, posNow() / dur) : 0;\n"
        "      var w = (pr * 100).toFixed(2) + \"%\";\n"
        "      if (w !== lastFillW) {\n"
        "        lastFillW = w;\n"
        "        fill.style.width = w;\n"
        "        ffill.style.width = w;\n"
        "      }\n"
        "      if (mode === \"full\") {\n"
        "        /* 写值防抖：fmt 每秒才变一次，字符串比对代替每帧 textContent 写 */\n"
        "        var tc = fmt(posNow());\n"
        "        if (tc !== lastTcur) { lastTcur = tc; tcur.textContent = tc; mtm.textContent = tc; }\n"
        "        var td = dur > 0 ? fmt(dur) : \"--:--\";\n"
        "        if (td !== lastTdur) { lastTdur = td; tdur.textContent = td; }\n"
        "        lyricFrame();\n"
        "      } else if (mode === \"mini\") {\n"
        "        /* v8.2.3b 顶带时间在 mini 也走针（空带填充修复的本体——不然带左\n"
        "           时间永远冻结在 0:00，空带照旧） */\n"
        "        var tc = fmt(posNow());\n"
        "        if (tc !== lastTcur) { lastTcur = tc; mtm.textContent = tc; }\n"
        "      }\n"
        "    }\n"
        "    var tgt = lastSpec.on && effPlaying() ? lastSpec.bass : 0;\n"
        "    envBass += (tgt - envBass) * (tgt > envBass ? 0.55 : 0.14);\n"
        "    if (envBass < 0.005) envBass = 0;\n"
        "    var gOp = envBass > 0.012 ? (0.2 + envBass * 0.3).toFixed(3) : \"0\";\n"
        "    if (glow.style.opacity !== gOp) { glow.style.opacity = gOp; glow2.style.opacity = gOp; }\n"
        "    /* 播放态图标真值回收（乐观窗口到期后与真值对齐） */\n"
        "    if (optAt && Date.now() - optAt >= 2500) { optAt = 0; applyVis(); }\n"
        "  }\n"
        "  function needFrame() {\n"
        "    if (document.visibilityState !== \"visible\") return false;\n"
        "    if (lastSpec.on && effPlaying()) return true;   /* 辉光律动中 */\n"
        "    if (envBass > 0.012) return true;               /* 辉光衰减尾 */\n"
        "    if (!track) return false;\n"
        "    if (mode === \"full\") return true;               /* 歌词逐字 + 走针 */\n"
        "    if (mode === \"mini\") return !!track.playing || !!optAt; /* 走针/乐观窗 */\n"
        "    return !!optAt;                                 /* cover：仅乐观窗 */\n"
        "  }\n"
        "  function schedule() {\n"
        "    /* 完全体逐字/辉光活动/衰减尾 → rAF（60fps 顺滑）；纯走针 → 200ms 节拍 */\n"
        "    if (mode === \"full\" || (lastSpec.on && effPlaying()) || envBass > 0.012) {\n"
        "      rafId = requestAnimationFrame(frame);\n"
        "    } else {\n"
        "      tickTimer = setTimeout(tick, 200);\n"
        "    }\n"
        "  }\n"
        "  function frame() { rafId = 0; loopBody(); if (needFrame()) schedule(); }\n"
        "  function tick() { tickTimer = 0; loopBody(); if (needFrame()) schedule(); }\n"
        "  function sleepNow() {\n"
        "    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }\n"
        "    if (tickTimer) { clearTimeout(tickTimer); tickTimer = 0; }\n"
        "  }\n"
        "  function wake() {\n"
        "    if (siteHidden) return;\n"
        "    if (document.visibilityState !== \"visible\") return;\n"
        "    if (rafId || tickTimer) return; /* 已醒：下一拍自会按 needFrame 重估 */\n"
        "    if (needFrame()) schedule();\n"
        "  }\n"
        "  /* v8.2.6 ②：可见性翻转 = 频谱订阅 + SW state 需求 + 渲染循环 三联开关 */\n"
        "  document.addEventListener(\"visibilitychange\", function () {\n"
        "    var vis = document.visibilityState === \"visible\";\n"
        "    try {\n"
        "      if (port) {\n"
        "        port.postMessage({ type: \"spec\", on: vis });\n"
        "        port.postMessage({ type: \"vis\", on: vis });\n"
        "      }\n"
        "    } catch (e) { /* 断线事件接管 */ }\n"
        "    if (vis) wake(); else sleepNow();\n"
        "  });\n"
        "\n"
        "  /* ---------- 启动 ---------- */\n"
        "  loadHide(function () {\n"
        "    if (siteHidden) return; /* 本站隐藏：不挂载 UI（SW 连接也省了） */\n"
        "    loadPos();\n"
        "    connect();\n"
        "    applyPos();\n"
        "    applyMode();\n"
        "    wake(); /* v8.2.6：按需唤醒（无曲目/hidden 时循环保持睡眠） */\n"
        "  });",
    ),
]

# ============================================================ ext-bg.js
BG_SUBS = [
    # ---- 头注释 ----
    (
        " * 「初始」ext-bg v8.2.5 —— MV3 Service Worker：跨页面音乐卡状态中继\n"
        " *\n"
        " * v8.2.5（电流音根治·引擎零扰律，SW 侧）：频谱轮询 33ms→50ms（30Hz→20Hz，",
        " * 「初始」ext-bg v8.2.6 —— MV3 Service Worker：跨页面音乐卡状态中继\n"
        " *\n"
        " * v8.2.6 性能特供（「5070 卡成屎」根治·SW 需求门律）：\n"
        " *   ① spec 广播精准化——broadcastSpec 只发 __spec 订阅卡（旧版全量扇出\n"
        " *      给所有 cards，N 标签 = 20msg/s × N 的 renderer 唤醒风暴）；\n"
        " *      state 保留全发（1s × N 便宜且所有浮窗都需要）。\n"
        " *   ② paused 空转帧翻转门——旧版 !playing 时每 50ms 发一条 on:false\n"
        " *      （纯浪费 20msg/s）；现只在 on→off 翻转时发一条熄辉光。\n"
        " *   ③ {type:\"vis\"} 卡片可见性上报——visCount===0 时 state 轮询整体停\n"
        " *      （浏览器后台/全 hidden = SW 全链静默，hub 零请求）；恢复可见\n"
        " *      立即 pollState 一拍。与卡片侧 visibilitychange 三联开关同律。\n"
        " * v8.2.5（电流音根治·引擎零扰律，SW 侧）：频谱轮询 33ms→50ms（30Hz→20Hz，",
    ),
    # ---- 状态变量 ----
    (
        "let stateTimer = null;\n"
        "let specTimer = null;\n"
        "\n"
        "const cards = new Set();",
        "let stateTimer = null;\n"
        "let specTimer = null;\n"
        "let visCount = 0;      /* v8.2.6：可见卡片数（vis 消息维护）——0 时 state 轮询停 */\n"
        "let specSentOn = null; /* v8.2.6：paused 空转帧翻转门（null=未发过） */\n"
        "\n"
        "const cards = new Set();",
    ),
    # ---- broadcastSpec ----
    (
        "function broadcast(msg) {\n"
        "  for (const port of cards) {\n"
        "    try { port.postMessage(msg); } catch { /* 死端口断开事件里清理 */ }\n"
        "  }\n"
        "}",
        "function broadcast(msg) {\n"
        "  for (const port of cards) {\n"
        "    try { port.postMessage(msg); } catch { /* 死端口断开事件里清理 */ }\n"
        "  }\n"
        "}\n"
        "/* v8.2.6：频谱帧只发订阅卡——非订阅（hidden/未开辉光）标签零唤醒 */\n"
        "function broadcastSpec(msg) {\n"
        "  for (const port of cards) {\n"
        "    if (!port.__spec) continue;\n"
        "    try { port.postMessage(msg); } catch { /* 死端口断开事件里清理 */ }\n"
        "  }\n"
        "}",
    ),
    # ---- ensureStateLoop / stopStateLoop 可见性门 ----
    (
        "function ensureStateLoop() {\n"
        "  if (stateTimer || cards.size === 0) return;\n"
        "  void pollState();\n"
        "  stateTimer = setInterval(() => { void pollState(); }, 1000);\n"
        "}\n"
        "function stopStateLoop() {\n"
        "  if (stateTimer && cards.size === 0) { clearInterval(stateTimer); stateTimer = null; }\n"
        "}",
        "/* v8.2.6：state 轮询的 visCount 门——全部卡片 hidden（浏览器后台）时\n"
        "   整体停摆，恢复可见由 vis on 立即拉一拍真值。SW 侧零定时器 = 可睡。 */\n"
        "function ensureStateLoop() {\n"
        "  if (stateTimer || visCount === 0) return;\n"
        "  void pollState();\n"
        "  stateTimer = setInterval(() => { void pollState(); }, 1000);\n"
        "}\n"
        "function stopStateLoop() {\n"
        "  if (stateTimer && visCount === 0) { clearInterval(stateTimer); stateTimer = null; }\n"
        "}",
    ),
    # ---- specTick：paused 翻转门 + broadcastSpec ----
    (
        "    if (specWanted() === 0) return;\n"
        "    if (!playing) {\n"
        "      broadcast({ type: \"spec\", on: false, bass: 0, bands: [], t: Date.now() });\n"
        "      return;\n"
        "    }",
        "    if (specWanted() === 0) return;\n"
        "    if (!playing) {\n"
        "      /* v8.2.6 翻转门：paused 期不再每拍发 on:false（20msg/s 纯浪费），\n"
        "         只在 on→off 边沿发一条熄辉光 */\n"
        "      if (specSentOn !== false) {\n"
        "        specSentOn = false;\n"
        "        broadcastSpec({ type: \"spec\", on: false, bass: 0, bands: [], t: Date.now() });\n"
        "      }\n"
        "      return;\n"
        "    }",
    ),
    (
        "    specFails = 0;\n"
        "    const cap = j.cap === true || j.cap === 1;\n"
        "    broadcast({\n"
        "      type: \"spec\",\n"
        "      on: cap,\n"
        "      bass: cap ? (Number(j.bass) || 0) : 0,\n"
        "      bands: Array.isArray(j.bands) ? j.bands.slice(0, 16) : [],\n"
        "      t: Date.now(),\n"
        "    });",
        "    specFails = 0;\n"
        "    const cap = j.cap === true || j.cap === 1;\n"
        "    specSentOn = cap;\n"
        "    broadcastSpec({\n"
        "      type: \"spec\",\n"
        "      on: cap,\n"
        "      bass: cap ? (Number(j.bass) || 0) : 0,\n"
        "      bands: Array.isArray(j.bands) ? j.bands.slice(0, 16) : [],\n"
        "      t: Date.now(),\n"
        "    });",
    ),
    # ---- onMessage：case "vis" 新增 ----
    (
        "      case \"spec\": {\n"
        "        const want = m.on === true;\n"
        "        if (want && !port.__spec) { port.__spec = true; ensureSpecLoop(); }\n"
        "        else if (!want && port.__spec) { port.__spec = false; stopSpecLoop(); }\n"
        "        break;\n"
        "      }",
        "      case \"spec\": {\n"
        "        const want = m.on === true;\n"
        "        if (want && !port.__spec) { port.__spec = true; ensureSpecLoop(); }\n"
        "        else if (!want && port.__spec) { port.__spec = false; stopSpecLoop(); }\n"
        "        break;\n"
        "      }\n"
        "      /* v8.2.6：卡片可见性上报（visibilitychange 三联开关的 SW 侧）——\n"
        "         visCount===0（全后台）时 state 轮询整体停，恢复立即拉真值 */\n"
        "      case \"vis\": {\n"
        "        const on = m.on === true;\n"
        "        if (on && !port.__vis) {\n"
        "          port.__vis = true; visCount++;\n"
        "          ensureStateLoop();\n"
        "        } else if (!on && port.__vis) {\n"
        "          port.__vis = false;\n"
        "          visCount = Math.max(0, visCount - 1);\n"
        "          stopStateLoop();\n"
        "        }\n"
        "        break;\n"
        "      }",
    ),
    # ---- onDisconnect：visCount 回收 ----
    (
        "  port.onDisconnect.addListener(() => {\n"
        "    cards.delete(port);\n"
        "    stopStateLoop();\n"
        "    stopSpecLoop();\n"
        "  });",
        "  port.onDisconnect.addListener(() => {\n"
        "    cards.delete(port);\n"
        "    if (port.__vis) { port.__vis = false; visCount = Math.max(0, visCount - 1); } /* v8.2.6 */\n"
        "    stopStateLoop();\n"
        "    stopSpecLoop();\n"
        "  });",
    ),
]

# ============================================================ 版本 + 特征门
SMTC_SUBS = [
    ('const CLIENT_VER = "8.2.5";', 'const CLIENT_VER = "8.2.6";'),
]
BUILD_SUBS = [
    ('VERSION = "8.2.5"', 'VERSION = "8.2.6"'),
    # 特征门补：v8.2.6 休眠律在位断言
    (
        'for feat in ("chushi-spectrum", "spectrum-boot", "chushi-card", \'case "lyric":\',\n'
        "             \"fetchedAt\"):  # v8.2.2：ne.ts 采样时刻透传（乱跳根治数据面）\n"
        "    if feat not in _bg_js:\n"
        '        sys.exit(f"ext-bg.js 缺特征 {feat} —— SW 歌词代理面缺失")',
        'for feat in ("chushi-spectrum", "spectrum-boot", "chushi-card", \'case "lyric":\',\n'
        "             \"fetchedAt\",  # v8.2.2：ne.ts 采样时刻透传（乱跳根治数据面）\n"
        '             "broadcastSpec", "visCount", "case \\"vis\\":"):  # v8.2.6：SW 需求门律\n'
        "    if feat not in _bg_js:\n"
        '        sys.exit(f"ext-bg.js 缺特征 {feat} —— SW 歌词代理面缺失")',
    ),
    (
        '             "seekGuard", "backStreak"):                       # seek 护航/回退熔断',
        '             "seekGuard", "backStreak",                       # seek 护航/回退熔断\n'
        '             "needFrame", "sleepNow", "visibilitychange"):    # v8.2.6 渲染休眠律',
    ),
]

if __name__ == "__main__":
    patch(CARD, CARD_SUBS)
    patch(BG, BG_SUBS)
    patch(SMTC, SMTC_SUBS)
    patch(BUILD, BUILD_SUBS)
    print("ALL PATCHES APPLIED — v8.2.6")
