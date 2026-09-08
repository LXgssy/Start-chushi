#!/usr/bin/env node
/* ============================================================================
 * v8.0.9 歌词源 eapi 信封等价门（yrc 缺席根因的防回归门）
 *
 * 历史 bug：插件 eapiEncrypt 多了 '?' 且加密路径带 /eapi 前缀 → 服务端
 * 404/空响应 → eapi 层从未生效 → yrc 永远缺席 → 逐字永远走 lrc 伪降级。
 * 本门禁：①插件 eapiEncrypt 与 node crypto 规范实现逐字节一致；
 *         ②解密载荷结构 = /api 路径 + 无 '?' + 三段 -36cd479b6b5- 包裹；
 *         ③摘要 = md5(nobody{path}use{json}md5forencrypt)。
 * ==========================================================================*/
const crypto = require('crypto');
const { readFileSync } = require('fs');
const vm = require('vm');

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

/* 规范实现（与 probe-yrc-v809b 实测通过 yrc=6391 的形态一致） */
function canonicalEncrypt(encryptPath, paramsJson) {
  const KEY = Buffer.from('e82ckenh8dichen8', 'utf8');
  const d = crypto.createHash('md5')
    .update('nobody' + encryptPath + 'use' + paramsJson + 'md5forencrypt', 'utf8').digest('hex');
  const text = encryptPath + '-36cd479b6b5-' + paramsJson + '-36cd479b6b5-' + d;
  const c = crypto.createCipheriv('aes-128-ecb', KEY, Buffer.alloc(0));
  return Buffer.concat([c.update(text, 'utf8'), c.final()]).toString('hex').toUpperCase();
}

function main() {
  const src = readFileSync('/home/z/my-project/bridge/v8/plugins/lyric-source/index.js', 'utf8');

  // 1) 静态门：源码里不得再有 '?' 信封与 /eapi 加密路径直传
  ok(!/path \+ '\?' \+ paramsJson/.test(src), '静态：信封不再拼接问号');
  ok(/eapiEncrypt\(encPath, paramsJson\)/.test(src), '静态：加密使用去前缀 encPath');
  ok(/path\.replace\(\^\\\/eapi/.test(src) || /path\.replace\(/.test(src), '静态：加密路径去 /eapi 前缀');

  // 2) 从插件源码整段切片（md5 → eapiEncrypt，含全部表声明）→ vm 沙箱执行
  function fnEnd(name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return -1;
    let depth = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}') { depth--; if (!depth) return k + 1; }
    }
    return -1;
  }
  const start = src.indexOf('function md5(');
  const end = fnEnd('eapiEncrypt');
  ok(start >= 0 && end > start, '切片 md5→eapiEncrypt 区域', `${start}/${end}`);

  const sandbox = { console, Array, Math, String, Number, parseInt };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end) + '\nthis.__enc = eapiEncrypt;', sandbox);
  const pluginEncrypt = sandbox.__enc;

  const paramsJson = JSON.stringify({ id: 316545, cp: false, lv: 0, tv: 0, rv: 0, kv: 0, yv: 0, ytv: 0 });
  const pluginPayload = pluginEncrypt('/api/song/lyric/v1', paramsJson);
  const canonPayload = canonicalEncrypt('/api/song/lyric/v1', paramsJson);
  ok(pluginPayload === canonPayload, '加密结果与规范实现逐字节一致');

  // 3) 解密回读：结构断言
  const KEY = Buffer.from('e82ckenh8dichen8', 'utf8');
  const dc = crypto.createDecipheriv('aes-128-ecb', KEY, Buffer.alloc(0));
  const plain = Buffer.concat([dc.update(Buffer.from(pluginPayload, 'hex')), dc.final()]).toString('utf8');
  ok(!plain.includes('?'), '载荷不含问号');
  ok(plain.startsWith('/api/song/lyric/v1-36cd479b6b5-'), '载荷以 /api 路径开头（去 /eapi 前缀）');
  const parts = plain.split('-36cd479b6b5-');
  ok(parts.length === 3 && parts[1] === paramsJson, '载荷三段结构 + 参数原文一致');
  const expectDigest = crypto.createHash('md5')
    .update('nobody' + '/api/song/lyric/v1' + 'use' + paramsJson + 'md5forencrypt', 'utf8').digest('hex');
  ok(parts[2] === expectDigest, '摘要 = md5(nobody{path}use{json}md5forencrypt)');

  // 4) 缓存键升代门
  ok(src.includes('__chushi_lyric_cache_v8__'), '缓存键已升代 v8（防 lrc-only 旧缓存遮蔽 yrc）');
  ok(src.includes("VER = '7.3.0'"), '歌词源版本 7.3.0');

  console.log(`\n${'='.repeat(56)}\n歌词源信封门: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main();
