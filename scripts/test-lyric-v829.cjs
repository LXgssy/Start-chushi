/* v8.2.9 歌词引擎行为单测：行级时钟分离（逐行 0ms / 逐字 -100ms）+ v8.2.8 全回归 */
const ChuShiLyric = require("/tmp/my-project/extension-src/ext-lyric.js");

let fails = 0;
function eq(name, got, want, tol) {
  const okv = typeof want === "number" ? Math.abs(got - want) <= (tol || 1e-6) : got === want;
  if (!okv) { console.log(`  FAIL ${name}: got ${got}, want ${want}`); fails++; }
  else console.log(`  ok   ${name} = ${got}`);
}

// ---- 构造 yrc：三行，行 2 末词拖尾覆盖行内伴奏 ----
const yrc = [
  "[1000,3000](1000,1500,0)你(2500,1500,0)好",
  "[5000,9000](5000,1500,0)世(6500,7500,0)界~",
  "[20000,3000](20000,3000,0)再见",
].join("\n");

const parsed = ChuShiLyric.parse({ yrc, ytlrc: "", lrc: "" });
eq("parsed src", parsed.src, "yrc");
eq("parsed lines", parsed.lines.length, 3);

// ---- ① v8.2.9 行级时钟：行界在逐行模式不被 -100ms 拖累 ----
// 行2 起点 5000：逐行模式 ms=5000 即应定位行2；逐字模式 4900 落行1-行2 间奏。
let a = ChuShiLyric.align(parsed, 5000, true);
eq("line-clock: line2 at 5000 (line mode)", a.lineIndex, 1);
a = ChuShiLyric.align(parsed, 5050, false);
eq("word-clock: still interlude at 5050 (4990<5000)", a.lineIndex, -1);
eq("word-clock: lastLine=0", a.lastLine, 0);
a = ChuShiLyric.align(parsed, 5150, false);
eq("word-clock: line2 at 5150 (5050>=5000)", a.lineIndex, 1);

// ---- ② 行尾同理：行1 e=4000，间奏阈值 e+200=4200 ----
//   逐行模式 ms=4250 应间奏（原始时基）；逐字模式 4250-100=4150 仍在行内。
a = ChuShiLyric.align(parsed, 4250, true);
eq("line-clock: interlude at 4250", a.lineIndex, -1);
eq("line-clock: lastLine=0", a.lastLine, 0);
a = ChuShiLyric.align(parsed, 4250, false);
eq("word-clock: still in line1 at 4250", a.lineIndex, 0);

// ---- ③ 逐字延迟补偿保持（v8.2.8 律不回归）：ms=2000 词1 补偿后 p≈0.60 ----
a = ChuShiLyric.align(parsed, 2000, false);
eq("lag: line1 active", a.lineIndex, 0);
eq("lag: word1 progress ~0.60", a.wordProgress, 0.60, 0.01);

// ---- ④ 末词硬终点保持（v8.2.8 律不回归，两种时钟都应挂住）----
a = ChuShiLyric.align(parsed, 10000, false);
eq("tailfix: word mode pinned", a.wordProgress, 1);
a = ChuShiLyric.align(parsed, 10000, true);
eq("tailfix: line mode pinned too", a.lineIndex, 1);
eq("tailfix: line mode word idx", a.wordIndex, 1);
eq("tailfix: line mode progress pinned", a.wordProgress, 1);

// ---- ⑤ 单词行不触发 + lrc 伪逐字回归 ----
a = ChuShiLyric.align(parsed, 21500);
eq("singleword: untouched", a.wordProgress, 0.5, 0.05);

const lrc = "[00:01.00]你好世界\n[00:20.00]第二行";
const pl = ChuShiLyric.parse({ lrc, yrc: "" });
eq("lrc src", pl.src, "lrc");
eq("lrc words unitized", pl.lines[0].w.length, 4);
let sum = 0;
for (const w of pl.lines[0].w) sum += w.d;
eq("lrc pseudo-dur <= span and >= 1200", sum <= 19000 && sum >= 1200 ? 1 : 0, 1);

const f = ChuShiLyric.fadeMs(parsed, 2000);
eq("fadeMs sane", f >= 120 && f <= 420 ? 1 : 0, 1);

console.log(fails === 0 ? "\nlyric-engine-v829: ALL PASS" : `\nlyric-engine-v829: ${fails} FAILS`);
process.exit(fails === 0 ? 0 : 1);
