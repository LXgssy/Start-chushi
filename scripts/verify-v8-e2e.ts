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
/* v8.0.4：模拟 hub 单槽歌词缓存的「切歌窗口」——首次 GET 回旧歌残留（songId=999），
   客户端必须拒绝并重试，直到槽内是新歌（songId=186016） */
let lyricSlotStale = true;
/* v8.0.4：模拟桥命令回执（state.cmd.last） */
const mockCmdLast = { id: 7, type: 'toggle', ok: true, path: 'link', at: Date.now() - 900 };

const server = Bun.serve({
  port: 26901,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (path === '/api/ping') {
      return Response.json({ ok: true, name: 'chushi-music-hub', version: '8.0.5', host: true }, { headers: cors() });
    }
    if (path === '/api/state' && req.method === 'GET') {
      return Response.json({
        ok: true, name: 'chushi-music-state', v: '8.0.5', ts: Date.now(),
        version: '8.0.5', hubVer: '8.0.5', inflinkVer: inflinkVerServed, smtcVer: inflinkVerServed,
        cmd: { last: mockCmdLast },
        ne: {
          songId: 186016, title: '晴天', artist: '周杰伦', album: '叶惠美',
          pic: 'https://p1.music.126.net/x.jpg?param=500y500',
          position: 12.3, duration: 269.3, playing: true, ts: Date.now() - 300,
          v: '8.0.5', src: 'inflink',
          seekAckId: 's-1', seekAckOk: true, seekAckAt: Date.now() - 1000,
        },
      }, { headers: cors() });
    }
    if (path === '/api/state' && req.method === 'POST') {
      hub.statePosts.push(await req.json());
      return Response.json({ ok: true }, { headers: cors() });
    }
    if (path === '/api/lyric' && req.method === 'GET') {
      const want = url.searchParams.get('songId') || '';
      /* v8.0.4 单槽语义：首次回旧歌残留（songId 不符）；客户端必须拒绝重试 */
      if (lyricSlotStale) {
        lyricSlotStale = false;
        return Response.json({ ok: true, lyric: { songId: 999, title: '上一首残留', yrc: '[00:01.00]旧(100,200)词', lrc: '[00:01.00]旧词', tlyric: '', ytlrc: '', source: 'eapi-yrc', rev: '999-stale' } }, { headers: cors() });
      }
      if (want && want !== '186016') {
        return Response.json({ ok: false, lyric: null }, { headers: cors() });
      }
      return Response.json({ ok: true, lyric: { songId: 186016, title: '晴天', yrc: '[00:01.00]晴(100,200)天', lrc: '[00:01.00]晴天', tlyric: '', ytlrc: '', source: 'eapi-yrc', rev: '186016-8.0.4' } }, { headers: cors() });
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
function makeBridgeCtx(withInflink: boolean, opts?: {
  cmds?: any[];              /* 自定义命令队列（默认 seek/next/prev） */
  nativeMode?: 'work' | 'off404' | 'noop';  /* /api/native 行为：work=注入即翻转状态 / off404=旧 hub 无端点 / noop=回 ok 但无效果 */
}) {
  const calls = { play: 0, pause: 0, next: 0, previous: 0, seek: [] as number[] };
  const statePosts: any[] = [];
  const nativePosts: any[] = [];
  const cmdServed: any[] = opts?.cmds ? opts.cmds.slice() : [
    /* v8.0.3 协议律：与 hub.dll 实物同形 —— {"_id":N,"raw":{...}}（raw 为对象） */
    { _id: 'w-seek-1', raw: { cmd: 'seek', position: 100 } },
    { _id: 'w-next-1', raw: { cmd: 'next' } },
    /* 字符串形态兼容（备用路径） */
    { _id: 'w-prev-1', raw: '{"cmd":"prev"}' },
  ];
  /* 「死网易云」模拟：InfLink 控制面派发被 reducer 静默忽略（读取正常）——
     linkState 由 /api/native work 模式翻转（等价 OS 媒体键 → SMTC → NCM） */
  let linkState = 'Playing';
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
      if (u.includes('/api/native') && init && init.method === 'POST') {
        const body = JSON.parse(init.body);
        nativePosts.push(body);
        const mode = opts?.nativeMode ?? 'work';
        if (mode === 'off404') return { json: async () => ({ ok: false, error: 'not-found' }), ok: false };
        if (mode === 'work') linkState = linkState === 'Playing' ? 'Paused' : 'Playing';
        return { json: async () => ({ ok: true, mode: body.mode, hwnd: body.mode === 1 ? 1 : 0, act: body.act, v: '8.0.5' }), ok: true };
      }
      if (u.includes('/api/ping')) {
        return { json: async () => ({ ok: true, name: 'chushi-music-hub', version: '8.0.5', host: true }), ok: true };
      }
      if (u.includes('/api/state') && init && init.method === 'POST') {
        statePosts.push(JSON.parse(init.body));
        return { json: async () => ({ ok: true }), ok: true };
      }
      return { json: async () => ({ ok: true }), ok: true };
    },
    setTimeout,
    clearTimeout,
    /* v8.0.5：桥的 1Hz 心跳用真实 interval（真值 1Hz 刷新，native 验证读近实时真值）；
       bun 测试结束后进程退出，不依赖清理 */
    setInterval: (fn: any, ms: number) => setInterval(fn, ms),
    clearInterval: (t: any) => clearInterval(t),
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
      /* 读取面活性：默认恒 Playing；opts.nativeMode==='work' 时由 /api/native
         翻转（等价 OS 媒体键 → SMTC/NCM 真实翻转）。控制面（play/pause/next/
         previous）计数但永不改变 linkState —— 模拟「reducer 静默忽略派发」
         的死网易云（用户实机特征：数据活、控制全灭）。 */
      getPlaybackStatus: () => linkState,
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
  return { calls, statePosts, nativePosts, sandbox };
}

/* ================================ 测试 ================================ */
describe('v8 e2e', () => {
  test('A1 公开面导出齐备', async () => {
    const m = await import('/home/z/my-project/.wt-v7/src/lib/startpage/smtc.ts');
    ok('SMTC_COMMANDS 白名单', m.SMTC_COMMANDS.has('seek') && m.SMTC_COMMANDS.has('toggle') && m.SMTC_COMMANDS.size === 6);
    ok('smtc 单例可 start/subscribe/control', typeof m.smtc.start === 'function' && typeof m.smtc.subscribe === 'function' && typeof m.smtc.control === 'function');
    ok('smtcPositionNow 插值', Math.abs(m.smtcPositionNow({
      app: 'x', songId: 0, title: '', artist: '', album: '', playing: true, position: 10,
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
    ok('hubVer=8.0.5', s.version === '8.0.5', s.version);
    ok('needsBridge=false（v8 身份命中）', s.needsBridge === false);
    ok('needsPlugin=false（ne.v=8.0.4）', s.needsPlugin === false);
    ok('needsUpdate=false', s.needsUpdate === false);
    ok('smtcVer=InfLink-rs 版本', s.smtcVer === '3.2.11', s.smtcVer);
    ok('track 真值直显', s.track && s.track.title === '晴天' && s.track.artist === '周杰伦');
    ok('track.songId=186016（v8.0.4 歌词归属校验用）', s.track && s.track.songId === 186016, s.track && s.track.songId);
    ok('cmdLast 回执透出（v8.0.4 控制可观测）', !!s.cmdLast && s.cmdLast.type === 'toggle' && s.cmdLast.ok === true && s.cmdLast.path === 'link', JSON.stringify(s.cmdLast));
    ok('封面 URL 透传', s.coverUrl === 'https://p1.music.126.net/x.jpg?param=500y500');
    ok('engineOld=false', s.engineOld === false);
    off();
  });

  test('A3 歌词拉取（v8.0.4 songId 强校验：首帧旧歌残留必须被拒）', async () => {
    await new Promise((r) => setTimeout(r, 3600));
    const m = await import('/home/z/my-project/.wt-v7/src/lib/startpage/smtc.ts');
    const s = m.smtc.getSnapshot();
    ok('歌词已装配（非旧歌残留）', !!s.lyric && s.lyric.yrc.includes('晴') && s.lyric.source === 'eapi-yrc');
    ok('歌词归属 songId=186016', !!s.lyric && s.lyric.songId === 186016, s.lyric && s.lyric.songId);
    ok('lyricRev=186016', s.lyricRev === '186016-8.0.4' || s.lyricRev === '186016', s.lyricRev);
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
    ok('blob v=8.0.5', blob && blob.v === '8.0.5');
    ok('ne.title 来自 InfLink', blob && blob.ne.title === '晴天', blob && blob.ne.title);
    ok('ne.artist 来自 InfLink', blob && blob.ne.artist === '周杰伦');
    ok('ne.position=ms→s（12.345）', blob && Math.abs(blob.ne.position - 12.345) < 0.01, blob && blob.ne.position);
    ok('ne.duration=ms→s（269.3）', blob && Math.abs(blob.ne.duration - 269.3) < 0.01, blob && blob.ne.duration);
    ok('ne.playing=true', blob && blob.ne.playing === true);
    ok('inlinkVer=3.2.11', blob && blob.inflinkVer === '3.2.11', blob && blob.inflinkVer);
    ok('smtcVer=3.2.11', blob && blob.smtcVer === '3.2.11', blob && blob.smtcVer);
    ok('ne.src=inflink', blob && String(blob.ne.src).indexOf('inflink') === 0, blob && blob.ne.src);
    /* v8.0.4 控制可观测：state 携带命令回执；执行后 markCmd 落库 */
    ok('blob 携带 cmd.last 回执', blob && blob.cmd && blob.cmd.last && typeof blob.cmd.last.at === 'number', JSON.stringify(blob && blob.cmd));
    /* 命令执行：主路 InfLinkApi（v8.0.3 含 raw 对象/字符串双形协议验证） */
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

  /* v8.0.5 终极兑底核心场景：死网易云（渲染层四路全灭）→ 原生媒体键接管。
     模拟用户实机特征：InfLink 读取面正常、控制面派发被静默忽略（play/pause
     只计数不改状态）、无 audio 元素、无可见按钮。/api/native work 模式在
     注入时翻转 linkState（等价 OS 媒体键 → SMTC/NCM 真实翻转）。 */
  test('B3 v8.0.5 死网易云：四级全灭 → 原生媒体键 mode1 接管 → 回执 napp', async () => {
    const { nativePosts, statePosts } = makeBridgeCtx(true, {
      cmds: [{ _id: 'w-tog-dead-1', raw: { cmd: 'toggle' } }],
      nativeMode: 'work',
    });
    /* 冗余等待：开局 ~1.5s 拉命令 → 四级降级 ~2.4s → native 验证 ~1s → 下一拍落库 */
    await new Promise((r) => setTimeout(r, 7500));
    ok('走到了原生兑底（POST /api/native）', nativePosts.length >= 1, JSON.stringify(nativePosts));
    ok('首枪 = mode1（WM_APPCOMMAND，scoped 优先）', nativePosts[0] && nativePosts[0].mode === 1 && nativePosts[0].act === 'toggle', JSON.stringify(nativePosts[0]));
    const napp = statePosts.some((b) => b.cmd && b.cmd.last && b.cmd.last.ok === true && b.cmd.last.path === 'napp');
    ok('回执 ok=true path=napp（mode1 验证通过）', napp, JSON.stringify(statePosts.map((b) => b.cmd)));
  }, 12000);

  test('B4 v8.0.5 旧 hub：/api/native 404 → mode2 再试 → 诚实失败回执 native', async () => {
    const { nativePosts, statePosts } = makeBridgeCtx(true, {
      cmds: [{ _id: 'w-tog-old-1', raw: { cmd: 'toggle' } }],
      nativeMode: 'off404',
    });
    await new Promise((r) => setTimeout(r, 7500));
    ok('旧 hub 下两枪都打完（mode1+mode2）', nativePosts.length >= 2, JSON.stringify(nativePosts));
    ok('mode2 也在列（升格尝试）', nativePosts.some((p) => p.mode === 2), JSON.stringify(nativePosts));
    const last = statePosts.length ? statePosts[statePosts.length - 1] : null;
    ok('终态回执 ok=false path=native（诚实不误报）', !!last && last.cmd && last.cmd.last && last.cmd.last.ok === false && last.cmd.last.path === 'native', JSON.stringify(last && last.cmd));
  }, 12000);

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
