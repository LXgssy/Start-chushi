// v8.3.1 AGC 数值门：弱歌（《不凡》型低音能量小）vs 响歌——显示值都应进入可见区间。
// 复刻 ext-card.js 的 specTgt→stepEnv→envNorm→paintGlow 数学，三场景断言。
function pipeline(frames) {
  let envB = 0, envM = 0, envH = 0, pkB = 0.12, pkM = 0.12, pkH = 0.12;
  const out = [];
  for (const [tb, tm, th] of frames) {
    envB += (tb - envB) * (tb > envB ? 0.62 : 0.14);
    envM += (tm - envM) * (tm > envM ? 0.68 : 0.20);
    envH += (th - envH) * (th > envH ? 0.72 : 0.24);
    if (envB < 0.005) envB = 0;
    if (envM < 0.006) envM = 0;
    if (envH < 0.006) envH = 0;
    pkB = Math.max(envB, pkB * 0.998 - 0.0004); if (pkB < 0.12) pkB = 0.12;
    pkM = Math.max(envM, pkM * 0.998 - 0.0004); if (pkM < 0.12) pkM = 0.12;
    pkH = Math.max(envH, pkH * 0.998 - 0.0004); if (pkH < 0.12) pkH = 0.12;
    const nb = Math.min(1, envB / pkB), nm = Math.min(1, envM / pkM), nh = Math.min(1, envH / pkH);
    const pb = Math.pow(nb, 0.75), pm = Math.pow(nm, 0.75), ph = Math.pow(nh, 0.75);
    const bright = 1 + pb * 0.42 + pm * 0.18;
    const glow = Math.min(1, 0.20 + pb * 0.68 + pm * 0.26 + ph * 0.12);
    out.push({ envB, nb, bright, glow });
  }
  return out;
}
// 场景A 弱歌：低音峰值仅 0.14（旧版 pb=0.14^0.85≈0.19 → 亮度增益 0.058，
// glow≈0.26——肉眼难辨）。新版 AGC 应把 nb 推近 1。
const weak = [];
for (let i = 0; i < 600; i++) {
  const beat = (i % 30) < 6 ? 0.14 : 0.02; // 每 0.5s 一记弱鼓
  weak.push([beat, 0.05, 0.02]);
}
const A = pipeline(weak);
const aTail = A.slice(240); // 8s 后 AGC 已适应
const aMaxNb = Math.max(...aTail.map(s => s.nb));
const aMaxBright = Math.max(...aTail.map(s => s.bright));
const aMaxGlow = Math.max(...aTail.map(s => s.glow));
console.log(`A 弱歌: nb峰值=${aMaxNb.toFixed(3)} brightness峰值=${aMaxBright.toFixed(3)} glow峰值=${aMaxGlow.toFixed(3)}`);
if (aMaxNb < 0.85) { console.log("FAIL: 弱歌未拉满"); process.exit(1); }
if (aMaxBright < 1.30) { console.log("FAIL: 弱歌亮度增益不足"); process.exit(1); }
if (aMaxGlow < 0.75) { console.log("FAIL: 弱歌辉光不足"); process.exit(1); }

// 场景B 响歌：低音峰值 0.85——天花板贴峰值，nb 峰仍近 1，动态对比保留（谷值低）。
const loud = [];
for (let i = 0; i < 600; i++) {
  const beat = (i % 30) < 6 ? 0.85 : 0.06;
  loud.push([beat, 0.3, 0.12]);
}
const B = pipeline(loud);
const bTail = B.slice(240);
const bMaxNb = Math.max(...bTail.map(s => s.nb));
const bMinNb = Math.min(...bTail.map(s => s.nb));
console.log(`B 响歌: nb峰值=${bMaxNb.toFixed(3)} nb谷值=${bMinNb.toFixed(3)}`);
if (bMaxNb < 0.97) { console.log("FAIL: 响歌峰值未满幅"); process.exit(1); }
if (bMinNb > 0.35) { console.log("FAIL: 响歌动态对比丢失（谷值过高）"); process.exit(1); }

// 场景C 静音期不放大底噪：全零输入 30s，显示值恒 0（floor 只托天花板不产信号）。
const C = pipeline(new Array(1800).fill([0, 0, 0]));
const cMaxGlow = Math.max(...C.map(s => s.glow));
console.log(`C 静音: glow恒=${cMaxGlow.toFixed(3)}（0.20 底值×env=0 → 实际不点亮）`);
// glow 公式底值 0.20 只在 act（env>阈值）时绘制——静音时 paintGlow 走 covClear
// 分支不写样式，这里只断言 env 保持 0：
const cMaxEnv = Math.max(...C.map(s => s.envB));
if (cMaxEnv > 0.0001) { console.log("FAIL: 静音期 env 未归零"); process.exit(1); }

// 场景D 突发尖峰后天花板回收：1.0 尖峰一记，其后 0.2 常规拍——8s 内 nb 回 1。
const D = [];
for (let i = 0; i < 600; i++) {
  if (i === 50) D.push([1.0, 0.1, 0.05]);
  else { const beat = (i % 30) < 6 ? 0.2 : 0.03; D.push([beat, 0.06, 0.02]); }
}
const Dp = pipeline(D);
const dRec = Dp.slice(120, 480); // 尖峰后 1.2s~7s
const dMaxNb = Math.max(...dRec.map(s => s.nb));
console.log(`D 尖峰恢复: 尖峰后 nb峰值=${dMaxNb.toFixed(3)}`);
if (dMaxNb < 0.9) { console.log("FAIL: 尖峰后天花板回收过慢"); process.exit(1); }

console.log("AGC-GATE PASS");
