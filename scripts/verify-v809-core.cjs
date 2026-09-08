#!/usr/bin/env node
/* ============================================================================
 * v8.0.9 核心引擎单测：seek 护航窗（回弹/歌词乱跳根治）+ yrc 优先律
 *
 * 历史 bug：拖动成功后 1~3 拍内桥真值仍是拖动前旧位置，旧版 |Δ|≥0.35s
 * 就硬锚回旧值 → 进度条回弹几秒、歌词跟着乱跳。
 * 本测试用可控行时钟 + 真实 __chushiMusicCoreV6（public/sandbox.js 切片）
 * 驱动：护航窗内陈旧拍必须被忽略、真值到目标提前收窗、过期诚实回锚、
 * 播放态翻转一律放行（暂停/播放校准管线不变——fadeMs 仍照算）。
 * ==========================================================================*/
const { readFileSync } = require('fs');
const vm = require('vm');
const assert = require('assert');

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

/* 提取 __chushiMusicCoreV6（括号计数） */
const src = readFileSync('/home/z/my-project/public/sandbox.js', 'utf8');
const start = src.indexOf('function __chushiMusicCoreV6(hooks)');
let depth = 0, end = -1;
for (let k = src.indexOf('{', start); k < src.length; k++) {
  if (src[k] === '{') depth++;
  else if (src[k] === '}') { depth--; if (!depth) { end = k + 1; break; } }
}
assert(start >= 0 && end > start, 'core function extracted');

/* 可控时钟沙箱 */
let clock = 1_000_000;
const sandbox = {
  console, Math, isFinite, String, Number, Boolean, Array, Object, JSON, Promise,
  Date: { now: () => clock },
  setTimeout: (fn) => { queue.push(fn); return 0; }, clearTimeout: () => {},
};
const queue = [];
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox);

/* YRC 样例（真实格式） */
const YRC = [
  '{"t":0,"c":[{"tx":"作词: A"}]}',
  '[100000,4200](100000,800,0)故(100800,800,0)事(101600,2600,0)里',
  '[120000,4000](120000,1000,0)第(121000,3000,0)二行',
].join('\n');
const LRC = '[00:05.00]回退行一\n[00:10.00]回退行二';

function makeCore() {
  const ctl = [];
  const core = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox, {});
  // hooks 需在沙箱内可见：改用全局注入
  return { core, ctl };
}

vm.runInContext('var __ctl = []; var hooks = { control: function (cmd, pos) { __ctl.push([cmd, pos]); return Promise.resolve(true); }, requestSubscribe: function () {} };', sandbox);

function feed(core, track, lyric) {
  core.feed({
    connected: true, track,
    cover: null, coverUrl: '', lyric: lyric || null, lyricRev: 'r1',
    pluginVer: '8.0.9', smtcVer: '3.2.11', seekNote: '',
    cmdLast: null, needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
  });
}
const TRACK = (position, playing, title) => ({
  app: 'NetEase Music', songId: 1, title: title || 'S1', artist: 'A', album: 'L',
  playing, position, duration: 300, rate: 1, coverRev: '', fetchedAt: clock,
});

async function main() {
  /* ---- T1 yrc 优先律 ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true), { songId: 1, yrc: YRC, ytlrc: '', lrc: LRC, tlyric: '', source: 'eapi-yrc' });
    const ly = r.lyrics();
    ok(ly && ly.mode === 1 && ly.lines.length === 2, 'T1 yrc 优先：行数与模式', JSON.stringify(ly && ly.lines.length));
    ok(ly.lines[0].t === '故事里', 'T1 行文本来自 yrc（非 lrc）', ly.lines[0].t);
    ok(ly.lines[0].w && ly.lines[0].w.length === 3 && ly.lines[0].w[0].s === 100000, 'T1 真逐字词时间轴');

    /* ---- T2 lrc 回退伪逐字 ---- */
    const r2 = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r2, TRACK(6, true), { songId: 1, yrc: '', ytlrc: '', lrc: LRC, tlyric: '', source: 'channel-lrc' });
    const ly2 = r2.lyrics();
    ok(ly2 && ly2.mode === 1 && ly2.lines.length === 2 && ly2.lines[0].w && ly2.lines[0].w.length >= 4,
      'T2 无 yrc → lrc 伪逐字（unitize）');
  }

  /* ---- T3 护航窗：陈旧拍忽略 + 真值确认收窗 ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true));
    ok(Math.abs(r.now().position - 100) < 0.2, 'T3 前置：位置 100');
    const okSeek = await r.seek(200);
    ok(okSeek === true, 'T3 seek 已受理');
    ok(Math.abs(r.now().position - 200) < 0.3, 'T3 乐观重锚到 200', String(r.now().position));

    clock += 1000;
    r.tick({ position: 101, playing: true, fetchedAt: clock }); /* 陈旧拍（拖动前位置+1s） */
    const afterStale = r.now().position;
    ok(afterStale > 199 && afterStale < 202, 'T3 陈旧拍被忽略：位置仍在 200 轨迹', String(afterStale));

    clock += 1000;
    r.tick({ position: 200.2, playing: true, fetchedAt: clock }); /* 真值到达 */
    ok(Math.abs(r.now().position - 200.2) < 1.2, 'T3 真值确认：跟随真值', String(r.now().position));

    clock += 1000;
    r.tick({ position: 201.2, playing: true, fetchedAt: clock });
    ok(Math.abs(r.now().position - 201.2) < 0.6, 'T3 收窗后正常 slew 跟随', String(r.now().position));
  }

  /* ---- T4 护航窗过期：诚实回锚 ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true));
    await r.seek(200);
    for (let i = 0; i < 3; i++) { clock += 1000; r.tick({ position: 100 + i, playing: true, fetchedAt: clock }); }
    ok(r.now().position > 199.5, 'T4 4.5s 内持续忽略陈旧拍', String(r.now().position));
    clock += 2000; /* 累计 >4.5s */
    r.tick({ position: 105, playing: true, fetchedAt: clock });
    ok(Math.abs(r.now().position - 105) < 0.5, 'T4 窗过期诚实回锚到真值', String(r.now().position));
  }

  /* ---- T5 播放态翻转放行 + 暂停校准管线不变 ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true), { songId: 1, yrc: YRC, ytlrc: '', lrc: '', tlyric: '', source: 'eapi-yrc' });
    await r.seek(121); /* 第二行逐字进行中 */
    clock += 500;
    r.tick({ position: 100.5, playing: false, fetchedAt: clock }); /* 暂停 + 陈旧位置 */
    const n = r.now();
    ok(n.playing === false, 'T5 翻转放行：暂停立即生效');
    ok(Math.abs(n.position - 100.5) < 0.3, 'T5 暂停时诚实取真值位置', String(n.position));
    ok(n.fadeMs >= 120 && n.fadeMs <= 420, 'T5 暂停淡入淡出照算（校准管线不变）', String(n.fadeMs));
  }

  /* ---- T6 护航窗内 feed 陈旧快照保位 ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true));
    await r.seek(200);
    clock += 300;
    feed(r, TRACK(102, true)); /* seekNote 清空触发的同曲快照：位置仍在旧轨迹 */
    const p = r.now().position;
    ok(p > 199.5 && p < 201.5, 'T6 同曲陈旧快照保位不回弹', String(p));
    feed(r, TRACK(200.5, true)); /* 真值收敛快照 */
    ok(Math.abs(r.now().position - 200.5) < 0.5, 'T6 真值快照正常锚定', String(r.now().position));
  }

  /* ---- T7 换歌弃窗 ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true));
    await r.seek(200);
    feed(r, TRACK(5, true, 'S2')); /* 切歌 */
    ok(Math.abs(r.now().position - 5) < 0.3, 'T7 换歌立即弃窗锚定新曲', String(r.now().position));
  }

  /* ---- T8 seek 后歌词对位（乱跳根治的可视面） ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true), { songId: 1, yrc: YRC, ytlrc: '', lrc: '', tlyric: '', source: 'eapi-yrc' });
    await r.seek(121.5);
    const n = r.now();
    ok(n.lineIndex === 1, 'T8 seek 后行对位到目标行', String(n.lineIndex));
    ok(n.wordProgress >= 0 && n.wordProgress <= 1, 'T8 词进度有界');
    clock += 1200;
    r.tick({ position: 122.7, playing: true, fetchedAt: clock });
    ok(r.now().lineIndex === 1, 'T8 护航窗内歌词稳定不回跳', String(r.now().lineIndex));
  }

  console.log(`\n${'='.repeat(56)}\n核心护航窗单测: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
