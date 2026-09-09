#!/usr/bin/env node
/* ============================================================================
 * e2e-whitebox v8.0.9：真实桥 index.js × 真实 C hub（hubsim）× InfLinkApi spy
 *
 * v8.0.9 新增断言（拖动假失败根治）：
 *   B9  seek → InfLinkApi.seekTo(30000) 主路 + 时间线读回收敛 →
 *       state.ne.seekAckOk=true 且 seekAckKnown=true（验证过的成功）；
 *   B10 无 InfLinkApi + 无 audio 元素的沙箱 seek → 读回源全缺席 →
 *       seekAckOk=false（ok=null 折叠）但 seekAckKnown=false（诚实未知，
 *       页面端不亮「拖动未生效」芯片）；
 *   B11 seek 读回三拍耐心：时间线延迟收敛（第 2 拍才到达）仍判成功。
 * 继承 v8.0.8 全部断言（排空 JSON / selftest / hublog / poll 计数）。
 * ==========================================================================*/
const { spawn } = require('child_process');
const { readFileSync } = require('fs');
const vm = require('vm');

const PORT = 26901;
const BRIDGE_SRC = '/home/z/my-project/bridge/v8/plugins/music-bridge/index.js';

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSandbox(extra) {
  const timers = [];
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, Math.min(ms, 50)); timers.push(t); return t; },
    clearTimeout,
    setInterval: (fn, ms) => { const t = setInterval(fn, Math.max(ms, 250)); timers.push(t); return t; },
    clearInterval,
    fetch: (url, init) => fetch(url, init),
    AbortController,
    Date, Math, JSON, Promise, Array, Object, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat,
    document: { readyState: 'complete', addEventListener: () => {}, querySelectorAll: () => [], body: null },
    navigator: {},
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};
  sandbox.globalThis = sandbox;
  Object.assign(sandbox.window, extra);
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(BRIDGE_SRC, 'utf8'), sandbox, { filename: 'bridge-index.js' });
  return { sandbox, timers };
}

async function main() {
  const hub = spawn('/home/z/my-project/scripts/hubsim', [String(PORT)], { stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(300);

  /* InfLink spy：seekTo 被调用后 80ms 时间线才收敛（延迟收敛仿真——
     沙箱 setTimeout 压缩到 50ms/拍，三拍落在 50/100/150ms → 第 2 拍命中，
     覆盖「首拍未到、后续拍确认」的多拍耐心路径） */
  const calls = { play: 0, pause: 0, next: 0, previous: 0, seekTo: [] };
  const tl = { currentTime: 12000, totalTime: 200000 };
  const inflink = {
    version: '3.2.11',
    getPlaybackStatus: () => 'Paused',
    getTimeline: () => ({ currentTime: tl.currentTime, totalTime: tl.totalTime }),
    getCurrentSong: () => ({
      ncmId: 22831721, songName: 'Jealousy (Extended Version)', authorName: 'Alice',
      albumName: 'Album', cover: { url: 'https://p1.music.126.net/x.jpg' }, duration: 200000,
    }),
    play: () => { calls.play++; },
    pause: () => { calls.pause++; },
    next: () => { calls.next++; },
    previous: () => { calls.previous++; },
    seekTo: (ms) => { calls.seekTo.push(ms); setTimeout(() => { tl.currentTime = ms; }, 80); },
  };

  const A = makeSandbox({ InfLinkApi: inflink });   /* 实例 A：InfLink 在场（首任持有者） */

  const api = (method, path, body) => fetch(`http://127.0.0.1:${PORT}${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

  try {
    await sleep(2500);
    const d0 = A.sandbox.window.__chushiMusicBridge.debug();
    ok(d0 && d0.ver === '8.1.0', 'A 桥版本 8.1.0', JSON.stringify(d0 && d0.ver));
    ok(d0.hubPort === PORT, 'A 桥已发现 hub', String(d0.hubPort));

    /* ---- 控制命令（A 实例持有租约的可能性与 B 竞争——hub 租约粘性） ----
       先让 A 抢到租约（A 先启动 2.5s），B 后启动时已是备胎（或 legacy）。 */
    await api('POST', '/api/cmd', { cmd: 'toggle' });
    await api('POST', '/api/cmd', { cmd: 'seek', position: 30 });
    await sleep(3500);

    const d = A.sandbox.window.__chushiMusicBridge.debug();
    const traceText = d.cmdTrace.map((t) => `${t.k}:${t.d}`).join(' | ');
    console.log('  [trace A]', traceText.slice(0, 300));

    ok(d.cmdTrace.some((t) => t.k === 'cmd' && t.d.startsWith('toggle#')), 'A: toggle 到达桥');
    ok(d.cmdTrace.some((t) => t.k === 'cmd' && t.d.startsWith('seek#')), 'A: seek 到达桥');
    ok(d.selftest && d.selftest.ok === true, 'A: selftest 回路健康', JSON.stringify(d.selftest));
    ok(calls.play >= 1, 'A: InfLinkApi.play() 被调用', `play=${calls.play}`);
    ok(calls.seekTo.some((ms) => ms === 30000), 'A: InfLinkApi.seekTo(30000)（毫秒制）', JSON.stringify(calls.seekTo));

    /* ---- B9：seek 读回收敛 → 成功且已验证 ---- */
    const stateA = await api('GET', '/api/state');
    ok(stateA && stateA.ne && stateA.ne.seekAckOk === true, 'B9: seekAckOk=true（时间线读回收敛）',
      JSON.stringify(stateA && stateA.ne && { ok: stateA.ne.seekAckOk, known: stateA.ne.seekAckKnown }));
    ok(stateA && stateA.ne && stateA.ne.seekAckKnown === true, 'B9: seekAckKnown=true（已验证）');

    /* ---- B10：A 死亡 → C（无 InfLink/无元素）接管租约 → seek 诚实未知 ----
       C 拿不到任何读回源 → doSeek 三拍全 r<0 → ok 保持 null →
       state.ne.seekAckOk=false（折叠）但 seekAckKnown=false（未知≠失败，
       页面端不亮「拖动未生效」芯片）。同时覆盖备胎→接管路径。 */
    for (const t of A.timers) { clearTimeout(t); clearInterval(t); } /* A 死亡：停止一切轮询 */
    await sleep(4600); /* 租约 TTL 4s 过期 */
    const C = makeSandbox({}); /* 无 InfLinkApi，querySelectorAll→[]（无元素） */
    await sleep(2500);
    const dC = C.sandbox.window.__chushiMusicBridge.debug();
    ok(dC.hubPort === PORT && (dC.lease === 'holder' || dC.lease === 'legacy'),
      'B10 前置：C 已接管租约', `${dC.hubPort}/${dC.lease}`);
    await api('POST', '/api/cmd', { cmd: 'seek', position: 60 });
    await sleep(2600);
    const stateC = await api('GET', '/api/state');
    ok(stateC && stateC.ne && stateC.ne.seekAckKnown === false && stateC.ne.seekAckOk === false,
      'B10: 无读回源 → seekAckKnown=false（诚实未知，页面不亮假失败芯片）',
      JSON.stringify(stateC && stateC.ne && { ok: stateC.ne.seekAckOk, known: stateC.ne.seekAckKnown }));

    /* ---- 继承 v8.0.8 断言 ---- */
    ok(stateA && stateA.cmd && stateA.cmd.last && stateA.cmd.last.id > 0, 'cmdLast 回执透出');
    ok(stateA && stateA.poll && stateA.poll.drains >= 2, 'poll 计数透传', JSON.stringify(stateA && stateA.poll));
    const hl = await api('GET', '/api/hublog');
    const logText = (hl.log || []).map((x) => x[1]).join(' | ');
    ok(logText.includes('[enqueue] len=') && logText.includes('[drain]'), 'hublog 收据齐全');
    ok(/\[drain\].*n=[1-9]/.test(logText), 'hublog 非空交付记录');

    console.log(`\n${'='.repeat(56)}\n端到端 v8.0.9（真实桥×真实hub×双实例）: ${passed} 通过, ${failed} 失败`);
  } finally {
    hub.kill('SIGKILL');
  }
  process.exitCode = failed ? 1 : 0;
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
