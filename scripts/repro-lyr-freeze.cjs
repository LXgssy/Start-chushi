#!/usr/bin/env node
/* ============================================================================
 * 复现：用户录屏 2026-09-09 18:28「歌词还是有问题」——部件时间冻在 1:06、
 * 词扫色以 ~1/20 实速爬行、无锯齿回跳。
 *
 * 场景 A（桥冻结）：桥真值停更（NCM 页面节流/桥半死），页面每拍
 *   track.position = ne.position + min(6, neAge) = 恒定 66.2，fetchedAt 新鲜。
 *   模拟 smtc.ts 每拍经 sandbox.ts → 部件 __music.tick() 的 1Hz 锚点流。
 * 场景 B（桥慢爬）：ne.ts 恒定落后 11.5s → age 钉在 6s 上限，但 ne.position
 *   以 1/20 实速爬（InfLink 慢时间线）→ tick.position 慢爬。
 * 观察引擎 now().position 的行为：推进？冻结？锯齿？爬行？
 * ==========================================================================*/
const { readFileSync } = require('fs');
const vm = require('vm');

const src = readFileSync('/home/z/my-project/public/sandbox.js', 'utf8');
const start = src.indexOf('function __chushiMusicCoreV6(hooks)');
let depth = 0, end = -1;
for (let k = src.indexOf('{', start); k < src.length; k++) {
  if (src[k] === '{') depth++;
  else if (src[k] === '}') { depth--; if (!depth) { end = k + 1; break; } }
}

let clock = 2_000_000;
const queue = [];
const sandbox = {
  console, Math, isFinite, String, Number, Boolean, Array, Object, JSON, Promise,
  Date: { now: () => clock },
  setTimeout: (fn) => { queue.push(fn); return 0; }, clearTimeout: () => {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox);
vm.runInContext('var hooks = { control: function () { return Promise.resolve(true); }, requestSubscribe: function () {} };', sandbox);

function feed(core, track) {
  core.feed({
    connected: true, track,
    cover: null, coverUrl: '', lyric: null, lyricRev: 'r1',
    pluginVer: '8.1.0', smtcVer: '3.2.11', seekNote: '',
    cmdLast: null, needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
  });
}
const TRACK = (position, playing) => ({
  app: 'NetEase Music', songId: 29966565, title: 'Love Me Like You Do', artist: 'Ellie Goulding',
  album: 'L', playing, position, duration: 250, rate: 1, coverRev: '', fetchedAt: clock,
});

function run(tag, tickPosFn, beats, sampleEveryMs) {
  const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
  clock += 1000;
  feed(r, TRACK(tickPosFn(0), true));
  const rows = [];
  let drops = 0, lastP = tickPosFn(0), minP = 999, maxP = -1;
  for (let k = 1; k <= beats; k++) {
    clock += 1000;
    r.tick({ position: tickPosFn(k), playing: true, fetchedAt: clock });
    /* 采样帧间轨迹：每拍内再取 4 个渲染帧 */
    for (let f = 0; f < 4; f++) {
      clock += sampleEveryMs;
      const p = r.now().position;
      if (p < lastP - 0.4) drops++;
      minP = Math.min(minP, p); maxP = Math.max(maxP, p);
      rows.push(p); lastP = p;
    }
  }
  const span = maxP - minP;
  const net = rows[rows.length - 1] - rows[0];
  console.log(`\n[${tag}]`);
  console.log(`  起点 ${rows[0].toFixed(2)}s → 终点 ${rows[rows.length - 1].toFixed(2)}s（净推进 ${net.toFixed(2)}s / ${beats}s）`);
  console.log(`  min ${minP.toFixed(2)} / max ${maxP.toFixed(2)} / 幅度 ${span.toFixed(2)}s / 回跳次数 ${drops}`);
  console.log(`  轨迹(每拍1采样): ${rows.filter((_, i) => i % 4 === 0).slice(0, 15).map(x => x.toFixed(1)).join(' → ')}`);
  return { net, span, drops };
}

/* 场景 A：桥冻结（tick.position 恒 66.2，fetchedAt 新鲜——smstc.ts 陈旧补偿封顶 6s 后恒定） */
run('A 桥冻结: tick.position 恒 66.2 + fetchedAt 新鲜', () => 66.2, 30, 250);

/* 场景 B：桥慢爬（ne.position 1/20 实速 → tick.position 每拍 +0.05） */
run('B 桥慢爬: tick.position 每拍 +0.05 (1/20 实速)', (k) => 66.2 + k * 0.05, 30, 250);

/* 场景 C：桥完全停止喂（tick 不再来——页面拍死/链路断），引擎自由插值 */
{
  const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
  clock += 1000;
  feed(r, TRACK(66.2, true));
  clock += 1000;
  const p0 = r.now().position;
  clock += 6000;
  const p1 = r.now().position;
  console.log(`\n[C 桥停喂: 引擎自由插值] 断喂 6s 后 ${p0.toFixed(2)} → ${p1.toFixed(2)}（应 +6 自由推进）`);
}

/* 场景 D：录屏同款——tick.position 恒定 + playing 翻转一拍（用户点过 toggle） */
{
  const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
  clock += 1000;
  feed(r, TRACK(66.2, true));
  for (let k = 1; k <= 10; k++) {
    clock += 1000;
    r.tick({ position: 66.2, playing: true, fetchedAt: clock });
  }
  clock += 1000;
  r.tick({ position: 66.2, playing: false, fetchedAt: clock }); /* 用户暂停 */
  const pausedAt = r.now().position;
  clock += 5000;
  const pausedHold = r.now().position;
  clock += 1000;
  r.tick({ position: 66.2, playing: true, fetchedAt: clock }); /* 恢复播放，桥仍冻结 */
  const resumeP = r.now().position;
  clock += 4000;
  const afterP = r.now().position;
  console.log(`\n[D 暂停→恢复 + 桥冻结] 暂停显示 ${pausedAt.toFixed(2)}（保持 ${pausedHold.toFixed(2)}）→ 恢复 ${resumeP.toFixed(2)} → 4s 后 ${afterP.toFixed(2)}`);
}
