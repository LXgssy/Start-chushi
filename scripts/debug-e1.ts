#!/usr/bin/env bun
/* E1 插桩调试：抓全部请求与状态变迁 */
const stateReqs: string[] = [];
const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (input: any, init?: any) => {
  const u = typeof input === 'string' ? input : String(input.url ?? input);
  try {
    const r = await realFetch(input, init);
    stateReqs.push(`${new URL(u).pathname} -> ${r.status}`);
    return r;
  } catch (e) {
    stateReqs.push(`${new URL(u).pathname} -> THREW ${String(e).slice(0, 60)}`);
    throw e;
  }
};

const server = Bun.serve({
  port: 26901,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/api/ping') return Response.json({ ok: true, name: 'chushi-smtc-hub', version: '7.0.0', pid: 1, host: true, port: 26901 });
    if (url.pathname === '/api/state') return Response.json({ ok: true, v: '7.0.0', ts: Date.now(), hubVer: '7.0.0', ne: { songId: 1, title: 't', artist: 'a', album: '', pic: '', position: 1, duration: 10, playing: true, ts: Date.now(), v: '7.0.0', src: 'x', seekAckId: '', seekAckOk: true, seekAckAt: 0 }, smtcVer: '7.0.0', smtc: { ready: true } });
    if (url.pathname === '/api/lyric') return Response.json({ ok: true, lyric: { songId: 1, yrc: 'x', lrc: '' } });
    if (url.pathname === '/api/cmd') return Response.json([]);
    if (url.pathname === '/api/smtc/events') return Response.json([]);
    return Response.json({ ok: true });
  },
});

(globalThis as any).window = globalThis;
const { smtc, smtcPositionNow } = await import('/home/z/my-project/src/lib/startpage/smtc.ts');

let log: any[] = [];
smtc.subscribe(() => log.push({ t: Date.now(), s: JSON.stringify(smtc.getSnapshot()).slice(0, 90) }));
smtc.start();
await new Promise((r) => setTimeout(r, 4200));
console.log('requests:', JSON.stringify(stateReqs, null, 1));
console.log('notify log:', JSON.stringify(log, null, 1));
console.log('final:', JSON.stringify(smtc.getSnapshot()).slice(0, 140));
server.stop(true);
setTimeout(() => process.exit(0), 120);
