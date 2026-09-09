#!/usr/bin/env node
/* verify-v821-lyric.mjs —— 悬浮卡完全体歌词引擎单测（ext-lyric.js 纯函数）
 * 与 sandbox.js/部件同语义的守门断言：解析/伪逐字估算/二分对齐/间奏 lastLine
 * （回退残留防线真相源）/翻译吸附/暂停淡出时长。*/
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("/home/z/my-project/extension-src/ext-lyric.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
}

/* ---------- 1) yrc 逐字行解析 ---------- */
console.log("[1] parseWordText (yrc)");
{
  const yrc =
    '{"t":0}\n' +
    "[1000,4000](1000,500,0)你(1500,500,0)好(2000,3000,0)世界\n" +
    "[6000,2000](6000,2000,0)再见\n";
  const lines = L.parseWordText(yrc);
  ok(lines.length === 2, "两行（JSON 版权头行跳过）");
  ok(lines[0].s === 1000 && lines[0].e === 5000, "行起点/终点");
  ok(lines[0].w.length === 3, "三词");
  ok(lines[0].w[2].t === "世界" && lines[0].w[2].s === 2000 && lines[0].w[2].d === 3000, "末词时间轴");
  ok(lines[0].t === "你好世界", "行文本=词连接");
}

/* ---------- 2) lrc 行级解析 ---------- */
console.log("[2] parseLineText (lrc)");
{
  const lrc =
    "[00:01.00]第一行\n" +
    "[00:05.00][00:25.00]重复行\n" +
    "[00:10.50]第二行\n";
  const lines = L.parseLineText(lrc);
  ok(lines.length === 4, "多时间戳展开（1+2+1）");
  ok(lines[0].s === 1000 && lines[0].e === 5000, "lrc 行 e=下一行 s（行距律）");
  ok(lines[2].s === 10500 && lines[2].e === 25000, "秒.5 → 10500ms");
  ok(lines[3].e === 25000 + 8000, "末行 e=s+8000");
  const dedup = L.parseLineText("[00:01.00]同\n[00:01.00]同\n");
  ok(dedup.length === 1, "同刻同文去重");
}

/* ---------- 3) 伪逐字估算（v8.1.4 律） ---------- */
console.log("[3] unitizeLine 伪逐字时长估算");
{
  const lines = L.parseLineText("[00:01.00]一二三四五六七八九十\n[00:20.00]下一句\n");
  L.unitizeLine(lines[0]);
  ok(Array.isArray(lines[0].w) && lines[0].w.length === 10, "CJK 逐字切分");
  const last = lines[0].w[lines[0].w.length - 1];
  const sungDur = last.s + last.d - lines[0].s;
  ok(Math.abs(sungDur - 10 * 260) <= 30, `演唱时长≈10字×260ms（实测 ${sungDur}ms，不铺满 19s 行距）`);
  ok(sungDur < (lines[0].e - lines[0].s), "估时 < 行距（句尾不挂满间奏）");
  ok(last.s + last.d <= lines[0].e, "估时 ≤ 行距上限");
  const lat = L.parseLineText("[00:01.00]hello world\n[00:20.00]x\n");
  L.unitizeLine(lat[0]);
  ok(lat[0].w.some(w => w.t === "hello") && lat[0].w.some(w => w.t === " "), "拉丁词整词 + 空格单元");
  ok(Math.abs(lat[0].w[lat[0].w.length - 1].s + lat[0].w[lat[0].w.length - 1].d - (lat[0].s + 1352)) <= 30, "估时=权重×130（10.4×130=1352，高于下限不触发）");
}

/* ---------- 4) 翻译吸附 ---------- */
console.log("[4] joinTranslation");
{
  const lines = L.parseWordText("[1000,3000](1000,3000,0)你好\n[5000,2000](5000,2000,0)世界\n");
  L.joinTranslation(lines, "[00:01.00]hello\n[00:05.20]world\n", 800);
  ok(lines[0].tr === "hello", "行 1 吸附 800ms 窗内翻译");
  ok(lines[1].tr === "world", "行 2 吸附 200ms 偏移翻译");
}

/* ---------- 5) parse 入口 ---------- */
console.log("[5] parse（yrc 优先 / lrc 兜底 / 空安全）");
{
  ok(L.parse(null) === null, "null → null");
  ok(L.parse({}) === null, "空对象 → null");
  const pY = L.parse({ yrc: "[1000,1000](1000,1000,0)词\n", lrc: "[00:01.00]词\n" });
  ok(pY && pY.src === "yrc" && pY.mode === 1, "yrc 在场恒逐字");
  const pL = L.parse({ yrc: "", lrc: "[00:01.00]词\n" });
  ok(pL && pL.src === "lrc" && pL.mode === 1, "纯 lrc → lrc 源（浮窗渲染为逐行）");
}

/* ---------- 6) align 对齐 ---------- */
console.log("[6] align（二分/间奏 lastLine/词进度）");
{
  const p = L.parse({
    yrc:
      "[1000,2000](1000,1000,0)ab(2000,1000,0)cd\n" +
      "[5000,2000](5000,2000,0)ef\n" +
      "[15000,2000](15000,2000,0)gh\n",
  });
  const lines = p.lines;
  let a = L.align(p, 300);
  ok(a.lineIndex === 0 && a.wordIndex === -1, "前奏首行预备律（未唱定位首行）");
  a = L.align(p, 1500);
  ok(a.lineIndex === 0 && a.wordIndex === 0 && Math.abs(a.wordProgress - 0.5) < 0.01, "词 1 半程扫光");
  a = L.align(p, 2500);
  ok(a.lineIndex === 0 && a.wordIndex === 1 && a.wordProgress > 0.4, "词 2 推进");
  a = L.align(p, 8000);
  ok(a.lineIndex === -1 && a.lastLine === 1, "间奏（5s 行 e=7000+200 < 8000）→ lastLine=1（已唱界）");
  a = L.align(p, 7100);
  ok(a.lineIndex === 1, "行内 7000 ≤ e+200 容差仍算在行");
  a = L.align(p, 14999);
  ok(a.lineIndex === -1 && a.lastLine === 1, "长间奏持续携带 lastLine（回退防残留真相源）");
  a = L.align(p, 15500);
  ok(a.lineIndex === 2 && a.wordIndex === 0, "间奏后第三行正常定位");
  const lp = L.align(p, 1800);
  ok(lp.lineIndex === 0 && Math.abs(lp.lineProgress - 0.4) < 0.01, "行进度 0.4");
}

/* ---------- 7) fadeMs 暂停淡出 ---------- */
console.log("[7] fadeMs（按当前词剩余时长）");
{
  const p = L.parse({ yrc: "[1000,2000](1000,2000,0)词\n" });
  ok(L.fadeMs(p, 1500) === 420, "词中段暂停 → 剩余 1500ms 铺到上限钳 420");
  ok(L.fadeMs(p, 2800) === 200, "词尾 200ms");
  ok(L.fadeMs(null, 0) === 260, "无解析 → 260 兜底");
}

/* ---------- 8) 回退场景（v8.1.4 残留根治的引擎侧语义） ---------- */
console.log("[8] 回退/重扫语义");
{
  const p = L.parse({
    yrc:
      "[1000,2000](1000,1000,0)一(2000,1000,0)二\n" +
      "[4000,2000](4000,1000,0)三(5000,1000,0)四\n",
  });
  const fwd = L.align(p, 2500);
  ok(fwd.lineIndex === 0 && fwd.wordIndex === 1, "回退前：行 1 词 2");
  const back = L.align(p, 1200);
  ok(back.lineIndex === 0 && back.wordIndex === 0 && back.wordProgress < 0.3, "回退后：行内回退重扫（渲染层据此撤销 done）");
  const inter = L.align(p, 3600);
  ok(inter.lineIndex === -1 || inter.wordIndex <= 1, "行间窄缝（e+200 容差内）不出间奏误判");
}

console.log(`\nverify-v821-lyric: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
