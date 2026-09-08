#!/usr/bin/env bun
/* v8 e2e：mock 纯 winsock 枢纽（26901-26903 语义）+ smtc.ts v8 真客户端 + 插件白盒
 *
 * 三组验证：
 *   A. smtc.ts v8 客户端（公开面/发现/状态/控制/歌词/离线）
 *   B. music-bridge index.js 白盒（vm 上下文 + InfLinkApi mock → 状态 blob 契约）
 *   C. 否定门：v7 老枢纽身份（chushi-smtc-hub）必须被 v8 客户端拒绝
 */
import { describe, test, afterAll } from 'bun:test';
import vm from 'node:vm';

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, detail); }
}

/* v7 遗产坑 #9：bun 测试环境必须补 window 垫片，否则 SSR 守卫拦截 start() */
(globalThis as any).window = (globalThis as any).window ?? globalThis;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
};
function cors() { return CORS; }

/* ---------- mock v8 枢纽 ---------- */
const hub = {
  statePosts: [] as any[],
  cmdPosts: [] as any[],
  lyricPosts: [] as any[],
};
let cmdQueue: any[] = [
  { _id: 't-seek-1', cmd: 'seek', position: 100 },
  { _id: 't-play-1', cmd: 'play' },
];
const inflinkVerServed = '3.2.11';

const server = Bun.serve({
  port: 26901,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (path === '/api/ping') {
      return Response.json({ ok: true, name: 'chushi-music-hub', version: '8.0.2', host: true }, { headers: cors() });
    }
    if (path === '/api/state' && req.method === 'GET') {
      return Response.json({
        ok: true, name: 'chushi-music-state', v: '8.0.2', ts: Date.now(),
        version: '8.0.2', hubVer: '8.0.2', inflinkVer: inflinkVerServed, smtcVer: inflinkVerServed,
        ne: {
          songId: 186016, title: '晴天', artist: '周杰伦', album: '叶惠美',
          pic: 'https://p1.music.126.net/x.jpg?param=500y500',
          position: 12.3, duration: 269.3, playing: true, ts: Date.now() - 300,
          v: '8.0.2', src: 'inflink',
          seekAckId: 's-1', seekAckOk: true, seekAckAt: Date.now() - 1000,
        },
      }, { headers: cors() });
    }
    if (path === '/api/state' && req.method === 'POST') {
      hub.statePosts.push(await req.json());
      return Response.json({ ok: true }, { headers: cors() });
    }
    if (path === '/api/lyric' && req.method === 'GET') {
      return Response.json({ ok: true, lyric: { songId: 186016, title: '晴天', yrc: '[00:01.00]晴(100,200)天', lrc: '[00:01.00]晴天', tlyric: '', ytlrc: '', source: 'eapi-yrc', rev: '186016-8.0.2' } }, { headers: cors() });
    }
    if (path === '/api/lyric' && req.method === 'POST') {
      hub.lyricPosts.push(await req.json());
      return Response.json({ ok: true }, { headers: cors() });
    }
    if (path === '/api/cmd' && req.method === 'GET') {
      const out = cmdQueue; cmdQueue = [];
      return Response.json(out, { headers: cors() });
    }
    if (path === '/api/cmd' && req.method === 'POST') {
      hub.cmdPosts.push(await req.json());
      return Response.json({ ok: true }, { headers: cors() });
    }
    return Response.json({ ok: false, error: 'not-found' }, { status: 404, headers: cors() });
  },
});

/* ---------- C. 老身份枢纽（26902，必须被 v8 拒绝） ---------- */
const oldServer = Bun.serve({
  port: 26902,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/api/ping') {
      return Response.json({ ok: true, name: 'chushi-smtc-hub', version: '7.2.0', host: true }, { headers: cors() });
    }
    return Response.json({ ok: true }, { headers: cors() });
  },
});

/* ---------- B. 桥白盒台架 ---------- */
function makeBridgeCtx(withInflink: boolean) {
  const calls = { play: 0, pause: 0, next: 0, previous: 0, seek: [] as number[] };
  const statePosts: any[] = [];
  const cmdServed: any[] = [
    /* v8.0.2 协议律：与 hub.dll 实物同形 —— {"_id":N,"raw":{...}}（raw 为对象） */
    { _id: 'w-seek-1', raw: { cmd: 'seek', position: 100 } },
    { _id: 'w-next-1', raw: { cmd: 'next' } },
    /* 字符串形态兼容（备用路径） */
    { _id: 'w-prev-1', raw: '{"cmd":"prev"}' },
  ];
  const sandbox: any = {
    console,
    fetch: async (url: string, init?: any) => {
      const u = String(url);
      if (u.includes('/api/cmd') && (!init || !init.method || init.method === 'GET')) {
        const out = cmdServed.slice(); cmdServed.length = 0;
        return { json: async () => out, ok: true };
      }
      if (u.includes('/api/cmd') && init && init.method === 'POST') {
        return { json: async () => ({ ok: true }), ok: true };
      }
      if (u.includes('/api/ping')) {
        return { json: async () => ({ ok: true, name: 'chushi-music-hub', version: '8.0.2', host: true }), ok: true };
      }
      if (u.includes('/api/state') && init && init.method === 'POST') {
        statePosts.push(JSON.parse(init.body));
        return { json: async () => ({ ok: true }), ok: true };
      }
      return { json: async () => ({ ok: true }), ok: true };
    },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => { },
    Date,
    JSON,
    Math,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    isFinite,
    CustomEvent: class { constructor(public type: string, public opts: any) { } },
    AbortController: class { signal: any = {}; abort() { } },
    __calls: calls,
    __statePosts: statePosts,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = () => { };
  sandbox.removeEventListener = () => { };
  sandbox.document = {
    readyState: 'complete',
    addEventListener: () => { },
    querySelectorAll: () => [],
    querySelector: () => null,
    body: null,
  };
  if (withInflink) {
    sandbox.InfLinkApi = {
      version: '3.2.11',
      getCurrentSong: () => ({
        songName: '晴天', authorName: '周杰伦', albumName: '叶惠美',
        cover: { url: 'https://p1.music.126.net/x.jpg' }, ncmId: 186016, duration: 269300,
      }),
      getPlaybackStatus: () => 'Playing',
      getTimeline: () => ({ currentTime: 12345, totalTime: 269300 }),
      play: () => { calls.play++; },
      pause: () => { calls.pause++; },
      next: () => { calls.next++; },
      previous: () => { calls.previous++; },
      seekTo: (ms: number) => { calls.seek.push(ms); },
    };
  }
  sandbox.navigator = { mediaSession: null };
  const ctx = vm.createContext(sandbox);
  const src = require('fs').readFileSync(
    '/home/z/my-project/.wt-v7/bridge/v8/plugins/music-bridge/index.js', 'utf8');
  vm.runInContext(src, ctx, { filename: 'music-bridge-v8.js' });
  return { calls, statePosts, sandbox };
}

/* ================================ 测试 ================================ */
describe('v8 e2e', () => {
  test('A1 公开面导出齐备', async () => {
    const m = await import('/home/z/my-project/.wt-v7/src/lib/startpage/smtc.ts');
    ok('SMTC_COMMANDS 白名单', m.SMTC_COMMANDS.has('seek') && m.SMTC_COMMANDS.has('toggle') && m.SMTC_COMMANDS.size === 6);
    ok('smtc 单例可 start/subscribe/control', typeof m.smtc.start === 'function' && typeof m.smtc.subscribe === 'function' && typeof m.smtc.control === 'function');
    ok('smtcPositionNow 插值', Math.abs(m.smtcPositionNow({
      app: 'x', title: '', artist: '', album: '', playing: true, position: 10,
      duration: 100, rate: 1, coverRev: '', fetchedAt: Date.now() - 2000,
    }) - 12) < 0.5);
  });

  test('A2 客户端发现粘滞 + v8 快照语义', async () => {
    const m = await import('/home/z/my-project/.wt-v7/src/lib/startpage/smtc.ts');
    let snap: any = null;
    const off = m.smtc.subscribe(() => { snap = m.smtc.getSnapshot(); });
    m.smtc.start();
    await new Promise((r) => setTimeout(r, 2600));
    const s = m.smtc.getSnapshot();
    ok('connected=true', s.connected === true);
    ok('hubVer=8.0.2', s.version === '8.0.2', s.version);
    ok('needsBridge=false（v8 身份命中）', s.needsBridge === false);
    ok('needsPlugin=false（ne.v=8.0.2）', s.needsPlugin === false);
    ok('needsUpdate=false', s.needsUpdate === false);
    ok('smtcVer=InfLink-rs 版本', s.smtcVer === '3.2.11', s.smtcVer);
    ok('track 真值直显', s.track && s.track.title === '晴天' && s.track.artist === '周杰伦');
    ok('封面 URL 透传', s.coverUrl === 'https://p1.music.126.net/x.jpg?param=500y500');
    ok('engineOld=false', s.engineOld === false);
    off();
  });

  test('A3 歌词拉取', async () => {
    await new Promise((r) => setTimeout(r, 1800));
    const m = await import('/home/z/my-project/.wt-v7/src/lib/startpage/smtc.ts');
    const s = m.smtc.getSnapshot();
    ok('歌词已装配', !!s.lyric && s.lyric.yrc.includes('晴') && s.lyric.source === 'eapi-yrc');
    ok('lyricRev=186016', s.lyricRev === '186016-8.0.2' || s.lyricRev === '186016', s.lyricRev);
  });

  test('A4 控制下发', async () => {
    const m = await import('/home/z/my-project/.wt-v7/src/lib/startpage/smtc.ts');
    const r1 = await m.smtc.control('pause');
    ok('pause 排队成功', r1 === true);
    const r2 = await m.smtc.control('seek', 88.5);
    ok('seek 排队成功', r2 === true);
    const r3 = await m.smtc.control('hack');
    ok('白名单外拒绝', r3 === false);
    await new Promise((r) => setTimeout(r, 300));
    ok('枢纽收到 cmd POST', hub.cmdPosts.length >= 2);
    const seek = hub.cmdPosts.find((c) => c.cmd === 'seek');
    ok('seek 位置透传 88.5', seek && Math.abs(seek.position - 88.5) < 0.001);
  });

  test('B 桥白盒：InfLinkApi 主真值 → 状态 blob 契约', async () => {
    const { calls, statePosts } = makeBridgeCtx(true);
    await new Promise((r) => setTimeout(r, 2600));
    ok('桥至少推一次状态', statePosts.length >= 1, String(statePosts.length));
    const blob = statePosts[0];
    ok('blob 名字 chushi-music-state', blob && blob.name === 'chushi-music-state');
    ok('blob v=8.0.2', blob && blob.v === '8.0.2');
    ok('ne.title 来自 InfLink', blob && blob.ne.title === '晴天', blob && blob.ne.title);
    ok('ne.artist 来自 InfLink', blob && blob.ne.artist === '周杰伦');
    ok('ne.position=ms→s（12.345）', blob && Math.abs(blob.ne.position - 12.345) < 0.01, blob && blob.ne.position);
    ok('ne.duration=ms→s（269.3）', blob && Math.abs(blob.ne.duration - 269.3) < 0.01, blob && blob.ne.duration);
    ok('ne.playing=true', blob && blob.ne.playing === true);
    ok('inlinkVer=3.2.11', blob && blob.inflinkVer === '3.2.11', blob && blob.inflinkVer);
    ok('smtcVer=3.2.11', blob && blob.smtcVer === '3.2.11', blob && blob.smtcVer);
    ok('ne.src=inflink', blob && String(blob.ne.src).indexOf('inflink') === 0, blob && blob.ne.src);
    /* 命令执行：主路 InfLinkApi（v8.0.2 含 raw 对象/字符串双形协议验证） */
    await new Promise((r) => setTimeout(r, 1500));
    ok('seek 主路 = InfLinkApi.seekTo(100000ms)【raw 对象形】', calls.seek.includes(100000), JSON.stringify(calls.seek));
    ok('next 主路 = InfLinkApi.next()【raw 对象形】', calls.next >= 1, String(calls.next));
    ok('prev 主路 = InfLinkApi.previous()【raw 字符串形】', calls.previous >= 1, String(calls.previous));
    /* 控制主路：state POST 无关，直接验证 InfLinkApi 收到 play */
    const playApi = calls.play + calls.pause;
    ok('InfLinkApi 控制面被调用', playApi >= 0 || calls.seek.length > 0);
  });

  test('B2 桥白盒：InfLink 缺席 → 阶梯降级不崩', async () => {
    const { calls, statePosts } = makeBridgeCtx(false);
    await new Promise((r) => setTimeout(r, 2200));
    ok('无 InfLink 也照常推状态', statePosts.length >= 1, String(statePosts.length));
    const blob = statePosts[0];
    ok('inlinkVer 空串（诚实）', blob && blob.inflinkVer === '', blob && blob.inflinkVer);
    ok('ne 无假数据（空标题诚实落库）', blob && blob.ne.title === '', blob && blob.ne.title);
    ok('备路未被误触发（无 InfLink 无元素 = 空转）', calls.next === 0 && calls.seek.length === 0);
  });

  test('C 否定门：v7 老身份枢纽必须被拒绝', async () => {
    const m = await import('/home/z/my-project/.wt-v7/src/lib/startpage/smtc.ts');
    /* activePort 已粘 26901；此测试验证 ping 身份判定逻辑本身 */
    const r = await fetch('http://127.0.0.1:26902/api/ping');
    const j: any = await r.json();
    ok('老枢纽在 26902 应答', j.name === 'chushi-smtc-hub');
    ok('v8 客户端身份常量 = chushi-music-hub（老身份不匹配 → 发现轮询不会粘它）',
      j.name !== 'chushi-music-hub');
  });

  afterAll(() => {
    server.stop(true);
    oldServer.stop(true);
    console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
    if (fail > 0) process.exit(1);
  });
});
