#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.21 探针增门：TL47 四源静态门（桥音频心跳/抽屉双击守卫/更新日志复位修复/dl 玻璃拉伸）"""
import io

P = "/tmp/beta-wt/scripts/probe-beta.mjs"
src = io.open(P, encoding="utf-8").read()

OLD = """  /* ---------- T10 pageerror ---------- */"""
NEW = """  /* ---------- TL47 v8.7.21 四源静态门 ----------
     ①桥 8.4.0 音频线程心跳（用户：网易云最小化一段时间后无法控制——
       Worker timer 在新版 Chromium 同样被隐藏窗节流，音频线程不在节流域）：
       ScriptProcessor onaudioprocess 硬件回调驱动 + hbDispatch 分发口 +
       visibilitychange 即刻对拍 + 55Hz·0.003 样本（听感零/静音启发式之上）；
       VER 8.3.5 退役、manifest 同步 8.4.0。
     ②抽屉磁贴墙双击守卫（用户：抽屉页面双击会进禅）：
       use-start-zen onDblClick 排除链加 html.cs-drawer 归属面。
     ③更新日志复位修复（用户：打开更新日志内容复位）：滚动区
       overscroll-contain（越界不再链穿背后面板）+ chgLastScrollTop
       重开回位（阅读位置保持）。
     ④dl 玻璃拉伸律（用户：玻璃随歌词长度拉伸/收缩+切行模糊过渡）：
       .dl width/left 双过渡同曲线 + .drag 拖动豁免 + dlswap 关键帧 +
       dlMeasure(Range 自然宽) + 首用真居中；旧 dlRecenter 退役。 */
  {
    const bridgeSrc47 = readFileSync(new URL("../bridge/v8/plugins/music-bridge/index.js", import.meta.url), "utf8");
    const bridgeMan47 = readFileSync(new URL("../bridge/v8/plugins/music-bridge/manifest.json", import.meta.url), "utf8");
    const zenSrc47 = readFileSync(new URL("../src/app/startpage/use-start-zen.ts", import.meta.url), "utf8");
    const chgSrc47 = readFileSync(new URL("../src/components/startpage/ChangelogDialog.tsx", import.meta.url), "utf8");
    const cardSrc47 = readFileSync(new URL("../extension-src/ext-card.js", import.meta.url), "utf8");
    const t47 = {
      hbAudio: /createScriptProcessor\\(4096, 1, 1\\)/.test(bridgeSrc47) && /onaudioprocess/.test(bridgeSrc47) && /function hbDispatch\\(k\\)/.test(bridgeSrc47) && /hbDispatch\\(1\\); hbDispatch\\(2\\)/.test(bridgeSrc47) && /0.003 \\* Math.sin/.test(bridgeSrc47) && /setInterval\\(hbPoke, 15000\\)/.test(bridgeSrc47),
      hbVer: /var VER = '8.4.0';/.test(bridgeSrc47) && !/var VER = '8.3.5';/.test(bridgeSrc47) && /"version": "8.4.0"/.test(bridgeMan47),
      zenDrawer: /document\\.documentElement\\.classList\\.contains\\("cs-drawer"\\)/.test(zenSrc47),
      chgFix: /overscroll-contain/.test(chgSrc47) && /chgLastScrollTop/.test(chgSrc47) && /el\\.scrollTop = chgLastScrollTop/.test(chgSrc47),
      dlStretch: /transition:opacity \\.3s ease,width \\.45s cubic-bezier\\(\\.22,1,\\.36,1\\),/.test(cardSrc47) && /left \\.45s cubic-bezier\\(\\.22,1,\\.36,1\\)\\}/.test(cardSrc47) && /\\.dl\\.drag\\{transition:opacity \\.3s ease\\}/.test(cardSrc47) && /@keyframes dlswap\\{0%\\{opacity:0;filter:blur\\(7px\\)\\}100%\\{opacity:1;filter:blur\\(0\\)\\}\\}/.test(cardSrc47) && /\\.dl1\\.lin,\\.dl2\\.lin\\{animation:dlswap \\.42s ease\\}/.test(cardSrc47) && /function dlMeasure\\(\\)/.test(cardSrc47) && /selectNodeContents\\(el\\)/.test(cardSrc47) && /dlPill\\.style\\.width = nw \\+ "px"/.test(cardSrc47) && /dlSwapFx\\(\\);/.test(cardSrc47),
      dlOldGone47: !/var nw = dlPill\\.offsetWidth \\|\\| 0;/.test(cardSrc47) && !/\\(w - 460\\) \\/ 2/.test(cardSrc47),
    };
    gate("TL47 桥音频心跳+抽屉守卫+更新日志复位修复+dl 玻璃拉伸静态门（v8.7.21）",
      t47.hbAudio && t47.hbVer && t47.zenDrawer && t47.chgFix && t47.dlStretch && t47.dlOldGone47,
      JSON.stringify(t47));
  }

  /* ---------- T10 pageerror ---------- */"""

assert src.count(OLD) == 1
src = src.replace(OLD, NEW)
io.open(P, "w", encoding="utf-8").write(src)
print("probe-beta.mjs TL47 gate added")
