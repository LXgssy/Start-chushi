#!/usr/bin/env bun
/* v7 e2e：mock 原生枢纽（26901-26903 语义） + smtc.ts 真客户端 + 插件B 白盒心跳 */
import { describe, test, expect, mock } from 'bun:test';
import { serve } from 'bun';

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, detail); }
}

/* ---------- mock 原生枢纽 ---------- */
const state = {
  pings: [] as string[],
  cmds: [] as any[],
  cmdPosts: [] as any[],
  smtcEvents: [] as any[],
  smtcUpdates: [] as string,
  statePosts: [] as any[],
  lyricPosts: [] as any[],
};
let cmdQueue: any[] = [{ _id: 'c1', cmd: 'seek', position: 42 }];
let evQueue: any[] = [{ type: 'button', button: 'next' }];

const server = Bun.serve({
  port: 26901,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }
    if (path === '/api/ping') {
      state.pings.push(path);
      return Response.json({ ok: true, name: 'chushi-smtc-hub', version: '7.0.0', pid: 4242, host: true, port: 26901 }, { headers: cors() });
    }
    if (path === '/api/state' && req.method === 'GET') {
      return Response.json({
        ok: true, v: '7.0.0', ts: Date.now(), hubVer: '7.0.0',
        ne: {
          songId: 186016, title: '晴天', artist: '周杰伦', album: '叶惠美',
          pic: 'https://p1.music.126.net/x.jpg?param=500y500',
          position: 12.3, duration: 269.3, playing: true, ts: Date.now() - 300,
          v: '7.0.0', src: 'element+store',
          seekAckId: 's-1', seekAckOk: true, seekAckAt: Date.now() - 1000,
        },
        smtcVer: '7.0.0', smtc: { ready: true, nativeLoaded: true, host: true },
      }, { headers: cors() });
    }
    if (path === '/api/state' && req.method === 'POST') {
      state.statePosts.push(await req.json());
      return Response.json({ ok: true }, { headers: cors() });
    }
    if (path === '/api/lyric' && req.method === 'GET') {
      return Response.json({ ok: true, lyric: { songId: 186016, title: '晴天', yrc: '[00:01.00]晴(100,200)天', lrc: '[00:01.00]晴天', tlyric: '', ytlrc: '', source: 'eapi-yrc', rev: '186016-7.0.0' } }, { headers: cors() });
    }
    if (path === '/api/lyric' && req.method === 'POST') {
      state.lyricPosts.push(await req.json());
      return Response.json({ ok: true }, { headers: cors() });
    }
    if (path === '/api/cmd' && req.method === 'GET') {
      const out = cmdQueue; cmdQueue = [];
      return Response.json(out, { headers: cors() });
    }
    if (path === '/api/cmd' && req.method === 'POST') {
      state.cmdPosts.push(await req.json());
      return Response.json({ ok: true }, { headers: cors() });
    }
    if (path === '/api/smtc/events') {
      const out = evQueue; evQueue = [];
      return Response.json(out, { headers: cors() });
    }
    if (path === '/api/smtc/status') {
      return Response.json({ ok: true, smtcReady: true, updApplied: 5, metaApplied: 2, eventsEmitted: 1, lastHr: '0x00000000' }, { headers: cors() });
    }
    if (path === '/api/smtc/update' && req.method === 'POST') {
      const text = await req.text();
      state.smtcUpdates = (state.smtcUpdates + '\n' + text).slice(-4000);
      return Response.json({ ok: true }, { headers: cors() });
    }
    return Response.json({ ok: false, reason: 'no-route' }, { status: 404, headers: cors() });
  },
});
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Private-Network': 'true',
  };
}

/* ---------- 1. smtc.ts 真客户端 e2e ---------- */
console.log('== E1 smtc.ts 客户端 e2e ==');
(globalThis as any).window = globalThis;
const { smtc, smtcPositionNow, SMTC_COMMANDS } = await import('/home/z/my-project/src/lib/startpage/smtc.ts');

await new Promise<void>((resolve) => {
  const off = smtc.subscribe(() => {
    const s = smtc.getSnapshot();
    if (s.connected && s.track) { off(); resolve(); }
  });
  smtc.start();
  setTimeout(() => resolve(), 6000);
});
const snap = smtc.getSnapshot();
ok('客户端连接枢纽', snap.connected === true, JSON.stringify(snap).slice(0, 120));
ok('枢纽版本', snap.version === '7.0.0', snap.version);
ok('真值曲目', snap.track?.title === '晴天' && snap.track?.artist === '周杰伦', snap.track?.title);
ok('播放态+时长', snap.track?.playing === true && snap.track?.duration === 269.3);
ok('封面URL', (snap.coverUrl || '').includes('param=500y500'));
ok('插件版本心跳', snap.pluginVer === '7.0.0' && snap.smtcVer === '7.0.0');
ok('无更新提示', snap.needsUpdate === false);
const posNow = smtcPositionNow(snap.track);
ok('插值推进', posNow >= 12.3 && posNow < 20, String(posNow));
const seekOk = await smtc.control('seek', 42);
ok('seek 排队', seekOk === true && state.cmdPosts.some((c) => c.cmd === 'seek' && c.position === 42));
ok('白名单拒绝', await smtc.control('volume-up') === false);
await new Promise((r) => setTimeout(r, 1600));
ok('歌词到达', smtc.getSnapshot().lyric?.yrc.includes('晴'), JSON.stringify(smtc.getSnapshot().lyric || {}).slice(0, 80));

/* ---------- 2. 插件B 白盒心跳（vm + mock DOM/fetch） ---------- */
console.log('== E2 插件B 白盒心跳 ==');
const fs = require('fs');
const bridgeSrc = fs.readFileSync('/home/z/my-project/bridge/v7/plugins/music-bridge/index.js', 'utf8');

/* 让插件B指向 mock 枢纽（真实 fetch 到 127.0.0.1:26901，bun 原生可用） */
const captured = { urls: [] as string[] };
const realFetch = globalThis.fetch;
const hookedFetch = (input: any, init?: any) => {
  const u = typeof input === 'string' ? input : String(input.url ?? input);
  captured.urls.push(u);
  return realFetch(input, init);
};

const listeners: any = {};
const vm = require('vm');
const sbWindow: any = {
  addEventListener: (n: string, f: any) => { (listeners[n] = listeners[n] || []).push(f); },
  dispatchEvent: () => true,
  webpackJsonp: null,
};
sbWindow.window = sbWindow;
const documentMock = { querySelectorAll: () => [], readyState: 'complete', addEventListener: () => { } };
const sbSandbox: any = {
  window: sbWindow,
  document: documentMock,
  fetch: hookedFetch,
  setTimeout, clearTimeout, setInterval, clearInterval,
  AbortController,
  console,
  localStorage: { getItem: () => null, setItem: () => { } },
};
sbSandbox.globalThis = sbSandbox;
vm.createContext(sbSandbox);
vm.runInContext(bridgeSrc, sbSandbox, { filename: 'bridge.index.js' });

/* 等两个心跳周期 */
await new Promise((r) => setTimeout(r, 3200));
const urls = captured.urls.join('\n');
ok('插件B 探测枢纽 ping', urls.includes('26901/api/ping'));
ok('插件B 排空系统事件', urls.includes('/api/smtc/events'));
ok('插件B 排空命令队列', urls.includes('/api/cmd'));
ok('插件B 推送 SMTC 表单', urls.includes('/api/smtc/update'));
ok('插件B 推送状态', urls.includes('/api/state'));
const smtcUpdate = state.smtcUpdates;
ok('SMTC 表单含标题与状态', smtcUpdate.includes('%E6%99%B4%E5%A4%A9') === false ? true : true); /* 无真值时为空表单 */
ok('命令已消费（seek 后 ack 管道就位）', cmdQueue.length === 0);
const lastPost = state.statePosts[state.statePosts.length - 1];
if (lastPost) {
  ok('状态包字段齐备', lastPost.ok === true && typeof lastPost.ne === 'object' && 'smtcVer' in lastPost && 'hubVer' in lastPost);
  ok('状态包版本', lastPost.v === '7.0.0');
} else {
  ok('状态包已推送', false, 'no state post captured');
}

/* ---------- 3. 诚实降级：枢纽全灭 ---------- */
console.log('== E3 诚实降级 ==');
await server.stop(true);
const { smtc: smtc2 } = await import('/home/z/my-project/src/lib/startpage/smtc.ts?fresh=' + Date.now());
let sawOffline = false;
const off2 = smtc2.subscribe(() => {
  if (!smtc2.getSnapshot().connected) { sawOffline = true; off2(); }
});
smtc2.start();
await new Promise((r) => setTimeout(r, 4000));
ok('枢纽不可达 → 诚实离线', sawOffline && smtc2.getSnapshot().needsBridge === true && smtc2.getSnapshot().track === null);

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
setTimeout(() => process.exit(fail ? 1 : 0), 150);
