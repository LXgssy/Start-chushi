#!/usr/bin/env node
/* 协议级测试：真实 hubsim（C 移植）× 真实协议序列
 * 1) 页面：OPTIONS 预检 + POST /api/cmd ×3（模拟用户点按钮）
 * 2) 桥：POST /api/poll {id} 认领 → GET /api/cmd?id=X 拉取
 * 3) 断言：桥必须收到 3 条 [{"_id":N,"raw":{...}}]
 * 4) 反向序：先 POST 命令、后认领（验证 legacy→lease 交接不吞命令）
 * 5) 多实例：第二实例（假 id）GET 必须被拦为 []
 */
const { spawn } = require('child_process');

const PORT = 26977;
let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

async function raw(method, path, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = { __parseFail: true, text: text.slice(0, 200) }; }
  return { status: res.status, json, text };
}

async function main() {
  const hub = spawn('/home/z/my-project/scripts/hubsim', [String(PORT)], { stdio: ['ignore', 'ignore', 'pipe'] });
  const hubLog = [];
  hub.stderr.on('data', (d) => hubLog.push(d.toString()));
  await new Promise((r) => setTimeout(r, 300));

  try {
    console.log('\n== T1 ping 身份 ==');
    const ping = await raw('GET', '/api/ping');
    ok(ping.json && ping.json.ok === true && ping.json.name === 'chushi-music-hub', 'ping 身份正确');
    ok(ping.json && ping.json.version === '8.0.8', '版本 8.0.8');

    console.log('\n== T2 页面 CORS 预检 ==');
    const pre = await raw('OPTIONS', '/api/cmd');
    ok(pre.status === 204, '预检 204');

    console.log('\n== T3 页面先 POST 3 条命令（legacy 模式：尚无人认领） ==');
    for (const cmd of ['toggle', 'next', 'prev']) {
      const r = await raw('POST', '/api/cmd', JSON.stringify({ cmd }));
      ok(r.json && r.json.ok === true, `POST ${cmd} ok:true`);
    }

    console.log('\n== T4 桥认领租约 ==');
    const ID = 'bmtswd3krakwki3';
    const claim = await raw('POST', '/api/poll', JSON.stringify({ id: ID }));
    ok(claim.json && claim.json.ok === true && claim.json.lease === true, '认领成功 lease:true');

    console.log('\n== T5 持有者拉取（关键断言：3 条命令必须全数交付） ==');
    const drain = await raw('GET', `/api/cmd?id=${ID}`);
    ok(Array.isArray(drain.json), '返回数组');
    ok(drain.json && drain.json.length === 3, `交付 3 条（实际 ${drain.json && drain.json.length}）`, drain.text && drain.text.slice(0, 120));
    if (Array.isArray(drain.json) && drain.json.length === 3) {
      ok(drain.json[0]._id != null && drain.json[0].raw && drain.json[0].raw.cmd === 'toggle', '首条 {"_id","raw":{cmd:toggle}} 双形正确');
      ok(drain.json[2].raw.cmd === 'prev', '末条 prev');
    }

    console.log('\n== T6 第二实例（假 id）必须被拦 ==');
    const thief = await raw('GET', '/api/cmd?id=fakeInstance');
    ok(Array.isArray(thief.json) && thief.json.length === 0, '假 id 得 []');

    console.log('\n== T7 无 id 的旧桥必须被拦 ==');
    const legacy = await raw('GET', '/api/cmd');
    ok(Array.isArray(legacy.json) && legacy.json.length === 0, '无 id 得 []');

    console.log('\n== T8 持有者再拉 → 空（队列已排干） ==');
    const again = await raw('GET', `/api/cmd?id=${ID}`);
    ok(Array.isArray(again.json) && again.json.length === 0, '二次拉取为 []');

    console.log('\n== T9 页面 POST → 桥 1s 内拉到（租约态时序） ==');
    const t0 = Date.now();
    await raw('POST', '/api/cmd', JSON.stringify({ cmd: 'seek', position: 42.5 }));
    await new Promise((r) => setTimeout(r, 1000));
    const d2 = await raw('GET', `/api/cmd?id=${ID}`);
    ok(Array.isArray(d2.json) && d2.json.length === 1 && d2.json[0].raw.cmd === 'seek', 'seek 命令 1s 后仍在队列并被交付',
       d2.text && d2.text.slice(0, 120));

    console.log('\n== T10 state 通道 ==');
    const sp = await raw('POST', '/api/state', JSON.stringify({ ok: true, ne: { title: 'x' } }));
    ok(sp.json && sp.json.ok === true, 'state POST ok');
    const sg = await raw('GET', '/api/state');
    ok(sg.json && sg.json.ok === true && sg.json.ne && sg.json.ne.title === 'x', 'state GET 原样返回');

    console.log('\n== T11 hublog 证据端点 ==');
    const hl = await raw('GET', '/api/hublog');
    ok(hl.json && hl.json.ok === true && Array.isArray(hl.json.log), 'hublog 可读');
    const logText = (hl.json.log || []).map((x) => x[1]).join(' | ');
    ok(logText.includes('[enqueue] len='), '入队收据在环', logText.slice(0, 150));
    ok(logText.includes('[drain]') && logText.includes('n=3'), '排空收据在环（n=3）', logText.slice(0, 150));
    ok(logText.includes('[poll] holder <-'), '租约收据在环');

    console.log(`\n${'='.repeat(50)}\n协议测试: ${passed} 通过, ${failed} 失败`);
    if (failed > 0) {
      console.log('\nhub 日志尾部：');
      console.log(hubLog.join('').split('\n').slice(-40).join('\n'));
    }
  } finally {
    hub.kill('SIGKILL');
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
