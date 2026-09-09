#!/usr/bin/env node
/* ============================================================================
 * v8.1.0 核心引擎单测：回退熔断（锯齿根治）+ 护航窗 grace 豁免 + feed 保位
 *
 * 历史 bug（真机录屏 2026-09-09）：歌曲正常播放但歌词乱跳——
 *   ① 桥端 InfLink 时间线（SMTC 滞后 ~1s）与元素真值双源交替，页面每拍
 *     |Δ|≥0.35 硬锚 → 显示 1:05↔1:06 秒级锯齿，歌词行边界反复横跳；
 *   ② seek 后中间态快照弃窗回锚 → 时间 2:02 歌词却显示拖前段落。
 * 本测试驱动真实 __chushiMusicCoreV6（public/sandbox.js 切片）断言：
 *   熔断拦截双源交替回跳 / 连续回退诚实放行 / 收窗 grace 不误拦 /
 *   feed 中间态保位 / 判歌容错 / 窗内翻转放行（暂停优先，校准不变）。
 * ==========================================================================*/
const { readFileSync } = require('fs');
const vm = require('vm');
const assert = require('assert');

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

const src = readFileSync('/home/z/my-project/public/sandbox.js', 'utf8');
const start = src.indexOf('function __chushiMusicCoreV6(hooks)');
let depth = 0, end = -1;
for (let k = src.indexOf('{', start); k < src.length; k++) {
  if (src[k] === '{') depth++;
  else if (src[k] === '}') { depth--; if (!depth) { end = k + 1; break; } }
}
assert(start >= 0 && end > start, 'core function extracted');

let clock = 2_000_000;
const sandbox = {
  console, Math, isFinite, String, Number, Boolean, Array, Object, JSON, Promise,
  Date: { now: () => clock },
  setTimeout: (fn) => { queue.push(fn); return 0; }, clearTimeout: () => {},
};
const queue = [];
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox);
vm.runInContext('var hooks = { control: function () { return Promise.resolve(true); }, requestSubscribe: function () {} };', sandbox);

function feed(core, track, lyric) {
  core.feed({
    connected: true, track,
    cover: null, coverUrl: '', lyric: lyric || null, lyricRev: 'r1',
    pluginVer: '8.1.0', smtcVer: '3.2.11', seekNote: '',
    cmdLast: null, needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
  });
}
const TRACK = (position, playing, title) => ({
  app: 'NetEase Music', songId: 1, title: title || 'S1', artist: 'A', album: 'L',
  playing, position, duration: 600, rate: 1, coverRev: '', fetchedAt: clock,
});

async function main() {
  /* ---- T1 双源交替锯齿：熔断拦截（显示位置绝不回跳） ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(66.2, true));
    /* 上游双源：A 滞后 1s、B 真值，逐拍交替（真机锯齿形态） */
    let minPos = 999, last = 66.2, jumps = 0;
    for (let k = 0; k < 12; k++) {
      clock += 1000;
      const beat = k % 2 === 0 ? 66.2 + k - 1.0 : 66.2 + k - 0.1; /* A / B 交替 */
      r.tick({ position: Math.max(66, beat), playing: true, fetchedAt: clock });
      const p = r.now().position;
      if (p < last - 0.5) jumps++; /* 显示回跳 >0.5s 记一次 */
      last = p;
      minPos = Math.min(minPos, p);
    }
    ok(jumps === 0, 'T1 双源交替 12 拍显示零回跳（熔断生效）', `jumps=${jumps}`);
    ok(last > 66.2 + 8, 'T1 位置持续推进不冻结', String(last.toFixed(1)));
  }

  /* ---- T2 连续 2 拍回退：第 2 拍诚实放行（真回退跟随） ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true));
    clock += 1000;
    r.tick({ position: 99.0, playing: true, fetchedAt: clock }); /* 稳态回退 ~2s：第 1 拍拒收 */
    const p1 = r.now().position;
    ok(p1 > 100.5, 'T2 第 1 拍回退拒收（仍 101 轨迹）', String(p1.toFixed(1)));
    clock += 1000;
    r.tick({ position: 99.2, playing: true, fetchedAt: clock }); /* 第 2 拍：放行 */
    const p2 = r.now().position;
    ok(Math.abs(p2 - 99.2) < 1.1, 'T2 连续回退第 2 拍诚实跟随', String(p2.toFixed(1)));
  }

  /* ---- T3 护航窗收窗 grace：真值跟随不被熔断误拦 ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true));
    await r.seek(200);
    clock += 1000;
    r.tick({ position: 101, playing: true, fetchedAt: clock }); /* 陈旧拍忽略 */
    clock += 1000;
    r.tick({ position: 200.2, playing: true, fetchedAt: clock }); /* 真值到达（回跳 1.8s） */
    ok(Math.abs(r.now().position - 200.2) < 1.2, 'T3 收窗真值 1 拍内跟随（grace 豁免）',
      String(r.now().position.toFixed(1)));
  }

  /* ---- T4 feed 中间态快照保位（时间 2:02 歌词不跳回拖前段） ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true));
    await r.seek(200);
    clock += 800;
    feed(r, TRACK(90, true)); /* NCM seek 应用中的中间态：既不在旧轨迹也不在目标 */
    const p = r.now().position;
    ok(p > 199, 'T4 中间态快照保位不回锚 90', String(p.toFixed(1)));
    clock += 1000;
    feed(r, TRACK(200.4, true)); /* 真值收敛 */
    ok(Math.abs(r.now().position - 200.4) < 0.5, 'T4 真值快照正常锚定', String(r.now().position.toFixed(1)));
  }

  /* ---- T5 判歌容错：标题修饰差异不弃窗 ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true, '呆呆一呆呆 feat.洛天依'));
    await r.seek(200);
    clock += 500;
    feed(r, TRACK(102, true, '呆呆一呆呆 feat.洛天依 (Live)')); /* 修饰差异 + 陈旧位置 */
    const p = r.now().position;
    ok(p > 199, 'T5 标题修饰差异不判换歌（保位）', String(p.toFixed(1)));
  }

  /* ---- T6 窗内翻转放行：暂停优先 + 诚实取真值（校准管线不变） ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true));
    await r.seek(121);
    clock += 500;
    r.tick({ position: 100.5, playing: false, fetchedAt: clock }); /* 窗内暂停 + 陈旧位置 */
    const n = r.now();
    ok(n.playing === false, 'T6 翻转放行：暂停立即生效');
    ok(Math.abs(n.position - 100.5) < 0.3, 'T6 暂停时诚实取真值位置', String(n.position.toFixed(1)));
    ok(n.fadeMs >= 120 && n.fadeMs <= 420, 'T6 暂停淡入淡出照算', String(n.fadeMs));
  }

  /* ---- T7 暂停→恢复后稳态锯齿仍被熔断（grace 只豁免 6s） ---- */
  {
    const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
    feed(r, TRACK(100, true));
    clock += 1000;
    r.tick({ position: 100.4, playing: false, fetchedAt: clock }); /* 暂停（翻转放行+grace） */
    clock += 2000;
    r.tick({ position: 100.4, playing: true, fetchedAt: clock });  /* 恢复（翻转放行+grace） */
    /* 恢复后正常跟随 7 拍（posNow 与真值同步推进，grace 逐渐过期） */
    for (let k = 1; k <= 7; k++) {
      clock += 1000;
      r.tick({ position: 100.4 + k + 0.1, playing: true, fetchedAt: clock });
    }
    const base = r.now().position; /* ≈107.5 */
    clock += 1000;
    r.tick({ position: 100.4 + 7 - 0.9, playing: true, fetchedAt: clock }); /* 回退 ~1.9s */
    const p1 = r.now().position;
    ok(p1 > base + 0.5, 'T7 grace 过期后回退拍拒收', `base=${base.toFixed(1)} p1=${p1.toFixed(1)}`);
  }

  console.log(`\n${'='.repeat(56)}\nv8.1.0 熔断/保位/容错单测: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
