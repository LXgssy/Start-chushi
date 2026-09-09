#!/usr/bin/env node
/* ============================================================================
 * v8.1.3 核心引擎单测：恒源钉守（两秒闪烁根治）
 *
 * 历史 bug（真机录屏 2026-09-09 18:28，用户：「歌词还是有问题」）：
 *   桥推送停滞（stateAge 11.5s）→ 页面把陈旧真值 +6s 封顶后每拍喂恒定
 *   位置 → v8.1.0 回退熔断「拒 1 拍→第 2 拍硬锚」循环成 1:06↔1:08 两秒
 *   闪烁（录屏 4fps 取证：词扫色亮度 2.0s 周期锯齿，肉眼即「歌词冻住」）。
 * 本测试驱动真实 __chushiMusicCoreV6 断言：
 *   恒源钉守零闪烁 / 恢复跟随 / age 锯齿源稳定 / 暂停恢复不闪 /
 *   拖动护航不受钉守干扰 / 慢爬源有界滞后 / 双源交替回归不劣化。
 * ==========================================================================*/
const { readFileSync } = require('fs');
const vm = require('vm');

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

function freshCore() {
  const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
  clock += 1000;
  return r;
}
function feed(r, track) {
  r.feed({
    connected: true, track,
    cover: null, coverUrl: '', lyric: null, lyricRev: 'r1',
    pluginVer: '8.1.3', smtcVer: '3.2.11', seekNote: '',
    cmdLast: null, needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
  });
}
const TRACK = (position, playing) => ({
  app: 'NetEase Music', songId: 29966565, title: 'Love Me Like You Do', artist: 'Ellie Goulding',
  album: 'L', playing, position, duration: 250, rate: 1, coverRev: '', fetchedAt: clock,
});

async function main() {
  /* ---- N1 恒源钉守：桥停滞（位置恒 66.2+fetchedAt 新鲜）30 拍零闪烁 ---- */
  {
    const r = freshCore();
    feed(r, TRACK(66.2, true));
    let drops = 0, lastP = 66.2;
    const sample = [];
    for (let k = 1; k <= 30; k++) {
      clock += 1000;
      r.tick({ position: 66.2, playing: true, fetchedAt: clock });
      for (let f = 0; f < 4; f++) {
        clock += 250;
        const p = r.now().position;
        if (k > 3 && p < lastP - 0.5) drops++; /* 首 3 拍允许钉守收敛，稳态零回跳 */
        lastP = p; sample.push(p);
      }
    }
    const tail = sample.slice(-40);
    const tailSpan = Math.max(...tail) - Math.min(...tail);
    ok(drops === 0, 'N1 恒定源稳态零回跳>0.5s（不再 2s 闪烁）', `drops=${drops}`);
    ok(tailSpan < 0.2, 'N1 稳态显示纹波 <0.2s（时间秒数不再翻动）', `span=${tailSpan.toFixed(2)}`);
    ok(lastP >= 66.2 && lastP <= 67.0, 'N1 稳态值落在 [66.2, 66.2+0.8] 钉守带', String(lastP.toFixed(2)));
  }

  /* ---- N2 停滞恢复：上游 +5s 前进，1 拍内跟随 ---- */
  {
    const r = freshCore();
    feed(r, TRACK(66.2, true));
    for (let k = 0; k < 10; k++) { clock += 1000; r.tick({ position: 66.2, playing: true, fetchedAt: clock }); }
    clock += 1000;
    r.tick({ position: 71.8, playing: true, fetchedAt: clock }); /* 桥恢复：真值前进 5s+ */
    const p = r.now().position;
    clock += 1000;
    r.tick({ position: 72.8, playing: true, fetchedAt: clock });
    const p2 = r.now().position;
    ok(p > 71.3, 'N2 恢复拍 1 拍内跟随前进真值', String(p.toFixed(2)));
    ok(p2 > 72.3, 'N2 恢复后正常推进', String(p2.toFixed(2)));
  }

  /* ---- N3 age 锯齿源（桥活着但真值冻结：X 在 66.4..67.4 往复）稳态 ---- */
  {
    const r = freshCore();
    feed(r, TRACK(66.4, true));
    let drops = 0, lastP = 66.4;
    const secs = new Set();
    for (let k = 1; k <= 24; k++) {
      clock += 1000;
      const v = k % 2 === 0 ? 66.4 : 67.4; /* 页面拍 vs 桥拍相对相位锯齿 */
      r.tick({ position: v, playing: true, fetchedAt: clock });
      const p = r.now().position;
      if (k > 4 && p < lastP - 0.5) drops++; /* 首 4 拍允许钉守收敛 */
      lastP = p;
      if (k > 4) secs.add(Math.floor(p));
    }
    ok(drops === 0, 'N3 age 锯齿源稳态零回跳>0.5s', `drops=${drops}`);
    ok(secs.size <= 2, 'N3 稳态秒数翻动 ≤1 次（时间文本基本稳定）', [...secs].join(','));
  }

  /* ---- N4 停滞中暂停→恢复：显示不闪、恢复后继续钉守 ---- */
  {
    const r = freshCore();
    feed(r, TRACK(66.2, true));
    for (let k = 0; k < 6; k++) { clock += 1000; r.tick({ position: 66.2, playing: true, fetchedAt: clock }); }
    clock += 1000;
    r.tick({ position: 66.2, playing: false, fetchedAt: clock }); /* 用户暂停 */
    const pausedP = r.now().position;
    clock += 4000;
    const heldP = r.now().position;
    clock += 1000;
    r.tick({ position: 66.2, playing: true, fetchedAt: clock }); /* 恢复，桥仍停滞 */
    const resumeP = r.now().position;
    let drops = 0, lastP = resumeP;
    for (let k = 0; k < 8; k++) {
      clock += 1000;
      r.tick({ position: 66.2, playing: true, fetchedAt: clock });
      for (let f = 0; f < 2; f++) {
        clock += 500;
        const p = r.now().position;
        if (k > 2 && p < lastP - 0.5) drops++; /* 恢复后首 3 拍允许重新收敛 */
        lastP = p;
      }
    }
    ok(Math.abs(pausedP - heldP) < 0.01, 'N4 暂停显示冻结不动', `${pausedP.toFixed(2)}→${heldP.toFixed(2)}`);
    ok(drops === 0, 'N4 恢复后继续钉守零闪烁', `drops=${drops}`);
  }

  /* ---- N5 停滞中拖动：护航窗正常工作，钉守不干扰 ---- */
  {
    const r = freshCore();
    feed(r, TRACK(66.2, true));
    for (let k = 0; k < 6; k++) { clock += 1000; r.tick({ position: 66.2, playing: true, fetchedAt: clock }); }
    clock += 1000;
    const seekOk = await r.seek(180);
    ok(seekOk === true, 'N5 拖动命令成功');
    clock += 200;
    const after = r.now().position;
    ok(Math.abs(after - 180) < 1.5, 'N5 拖动后乐观重锚到目标', String(after.toFixed(2)));
    clock += 1000;
    r.tick({ position: 66.2, playing: true, fetchedAt: clock }); /* 桥停滞：旧轨迹陈旧拍 */
    const held = r.now().position;
    ok(Math.abs(held - 180) < 3, 'N5 护航窗内陈旧拍被忽略（目标轨迹继续）', String(held.toFixed(2)));
  }

  /* ---- N6 慢爬源（+0.05/拍）：有界滞后跟随、零回跳 ---- */
  {
    const r = freshCore();
    feed(r, TRACK(66.2, true));
    let drops = 0, lastP = 66.2;
    for (let k = 1; k <= 20; k++) {
      clock += 1000;
      r.tick({ position: 66.2 + k * 0.05, playing: true, fetchedAt: clock });
      const p = r.now().position;
      if (p < lastP - 0.5) drops++;
      lastP = p;
    }
    ok(drops === 0, 'N6 慢爬源零回跳>0.5s', `drops=${drops}`);
    ok(lastP < 66.2 + 20 * 0.05 + 1.0, 'N6 慢爬源滞后有界（≤1s）', String(lastP.toFixed(2)));
  }

  /* ---- N7 双源交替回归（v8.1.0 T1 同款）：钉守不误伤熔断语义 ---- */
  {
    const r = freshCore();
    feed(r, TRACK(66.2, true));
    let jumps = 0, last = 66.2;
    for (let k = 0; k < 12; k++) {
      clock += 1000;
      const beat = k % 2 === 0 ? Math.max(66, 66.2 + k - 1.0) : 66.2 + k - 0.1;
      r.tick({ position: beat, playing: true, fetchedAt: clock });
      const p = r.now().position;
      if (p < last - 0.5) jumps++;
      last = p;
    }
    ok(jumps === 0, 'N7 双源交替 12 拍零回跳（v8.1.0 语义保持）', `jumps=${jumps}`);
    ok(last > 66.2 + 8, 'N7 双源交替位置持续推进', String(last.toFixed(1)));
  }

  /* ---- N8 真回退跟随回归（v8.1.0 T2 同款）：第 2 拍诚实放行 ---- */
  {
    const r = freshCore();
    feed(r, TRACK(100, true));
    clock += 1000;
    r.tick({ position: 99.0, playing: true, fetchedAt: clock });
    const p1 = r.now().position;
    clock += 1000;
    r.tick({ position: 99.2, playing: true, fetchedAt: clock });
    const p2 = r.now().position;
    ok(p1 > 100.5, 'N8 第 1 拍回退拒收', String(p1.toFixed(1)));
    ok(Math.abs(p2 - 99.2) < 1.2, 'N8 值在变的连续回退第 2 拍诚实跟随', String(p2.toFixed(2)));
  }

  console.log('\n========================================================');
  console.log(`v8.1.3 恒源钉守单测: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
