#!/usr/bin/env node
/* ============================================================================
 * e2e-whitebox：真实桥 index.js × 真实 C hub（hubsim）× InfLinkApi spy
 * 历史 bug（v8.0.0~v8.0.7 排空 JSON 缺收尾 '}'）在本测试下必红：
 *   桥 jget 解析畸形 JSON 抛 → 静默 null → execCommand 永不执行 → 断言全灭。
 * 这是 mock 假绿免疫测试——hub 是逐行移植的实物 C 逻辑，桥是发布原文件。
 * ==========================================================================*/
const { spawn } = require('child_process');
const { readFileSync } = require('fs');
const vm = require('vm');
const assert = require('assert');

const PORT = 26901; /* 桥只认 26901-26903，测试 hub 必须绑主端口 */
const BRIDGE_SRC = '/home/z/my-project/bridge/v8/plugins/music-bridge/index.js';

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ---- 1) 启动真实 C hub（POSIX 移植版） ----
  const hub = spawn('/home/z/my-project/scripts/hubsim', [String(PORT)], { stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(300);

  // ---- 2) InfLinkApi spy ----
  const calls = { play: 0, pause: 0, next: 0, previous: 0, seekTo: [] };
  const inflink = {
    version: '3.2.11',
    getPlaybackStatus: () => 'Paused',
    getTimeline: () => ({ currentTime: 12000, totalTime: 200000 }),
    getCurrentSong: () => ({
      ncmId: 22831721, songName: 'Jealousy (Extended Version)', authorName: 'Alice',
      albumName: 'Album', cover: { url: 'https://p1.music.126.net/x.jpg' }, duration: 200000,
    }),
    play: () => { calls.play++; },
    pause: () => { calls.pause++; },
    next: () => { calls.next++; },
    previous: () => { calls.previous++; },
    seekTo: (ms) => { calls.seekTo.push(ms); },
  };

  // ---- 3) 沙箱加载真实桥 JS ----
  const src = readFileSync(BRIDGE_SRC, 'utf8');
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
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      querySelectorAll: () => [],
      body: null,
    },
    navigator: {},
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};
  sandbox.window.InfLinkApi = inflink;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'bridge-index.js' });

  const bridgeDebug = () => sandbox.window.__chushiMusicBridge.debug();
  const api = (method, path, body) => fetch(`http://127.0.0.1:${PORT}${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

  try {
    // ---- 4) 桥自启（1500ms 延迟 → 压缩为即时；等待首拍 + 自证投递） ----
    await sleep(2500);
    const d0 = bridgeDebug();
    /* v8.2.2：桥 JS 自 8.1.3 起未改（版本沿律：hub/助手变更不 bump 桥 JS
       自报版本）——断言放宽为 ≥8.0.8 的已知自报值集合 */
    ok(d0 && ['8.0.8', '8.1.3'].includes(d0.ver), '桥已注入且版本已知（8.0.8 时代钉子放宽）', JSON.stringify(d0 && d0.ver));
    ok(d0.hubPort === PORT, '桥已发现 hub（粘住测试端口）', String(d0.hubPort));
    ok(d0.lease === 'holder' || d0.lease === 'legacy', '桥已持有租约/legacy', d0.lease);
    ok(d0.inflink && d0.inflink.present === true && d0.inflink.ver === '3.2.11', 'InfLinkApi 探针命中', JSON.stringify(d0.inflink));

    // ---- 5) 页面视角：投 3 条控制命令 ----
    await api('POST', '/api/cmd', { cmd: 'toggle' });
    await api('POST', '/api/cmd', { cmd: 'next' });
    await api('POST', '/api/cmd', { cmd: 'seek', position: 30 });
    await sleep(3500); // 等 2-3 拍排空 + 延时验证链

    const d = bridgeDebug();
    const traceText = d.cmdTrace.map((t) => `${t.k}:${t.d}`).join(' | ');
    console.log('  [trace]', traceText.slice(0, 300));

    ok(d.cmdTrace.some((t) => t.k === 'cmd' && t.d.startsWith('toggle#')), 'toggle 命令到达桥（trace cmd#）');
    ok(d.cmdTrace.some((t) => t.k === 'cmd' && t.d.startsWith('next#')), 'next 命令到达桥');
    ok(d.cmdTrace.some((t) => t.k === 'cmd' && t.d.startsWith('seek#')), 'seek 命令到达桥');
    ok(d.cmdTrace.some((t) => t.k === 'selftest'), '回路自证闭环（selftest 轨迹）', traceText);
    ok(d.selftest && d.selftest.ok === true, 'selftest.ok=true（回路健康）', JSON.stringify(d.selftest));
    ok(d.poll && d.poll.drains >= 3 && d.poll.delivered >= 3, '轮询计数有交付', JSON.stringify(d.poll));

    // ---- 6) InfLinkApi spy 断言（控制真实生效） ----
    ok(calls.play >= 1, 'InfLinkApi.play() 被调用（toggle 主路）', `play=${calls.play}`);
    ok(calls.next >= 1, 'InfLinkApi.next() 被调用（next 主路）', `next=${calls.next}`);
    ok(calls.seekTo.length >= 1 && calls.seekTo[0] === 30000, 'InfLinkApi.seekTo(30000) 被调用（毫秒制）', JSON.stringify(calls.seekTo));

    // ---- 7) 回执：cmdLast 随 state 透出 ----
    const state = await api('GET', '/api/state');
    ok(state && state.cmd && state.cmd.last && state.cmd.last.id > 0, 'cmdLast 回执随 state 透出', JSON.stringify(state && state.cmd && state.cmd.last));
    ok(state && state.cmd && Array.isArray(state.cmd.trace) && state.cmd.trace.length >= 3, 'state.cmd.trace 20 条环形透传');
    ok(state && state.selftest && state.selftest.ok === true, 'state.selftest 透传');
    ok(state && state.poll && state.poll.drains >= 3, 'state.poll 透传');

    // ---- 8) hublog 证据链 ----
    const hl = await api('GET', '/api/hublog');
    const logText = (hl.log || []).map((x) => x[1]).join(' | ');
    ok(logText.includes('[enqueue] len=') && logText.includes('[drain]'), 'hublog：入队+排空收据齐全', logText.slice(0, 200));
    ok(/\[drain\].*n=[1-9]/.test(logText), 'hublog：排空非空交付记录', logText.slice(0, 200));

    console.log(`\n${'='.repeat(56)}\n端到端（真实桥×真实hub）: ${passed} 通过, ${failed} 失败`);
  } finally {
    for (const t of timers) { clearTimeout(t); clearInterval(t); }
    hub.kill('SIGKILL');
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
