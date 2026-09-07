#!/usr/bin/env node
/* v7 验证第一轮：语法门 + 纯 JS 密码学向量门（Node crypto 为真值） */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = '/home/z/my-project/bridge/v7/plugins';
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail || ''}`); }
}

console.log('== G1 语法门 ==');
for (const dir of ['smtc-manager', 'music-bridge', 'lyric-source']) {
  const f = path.join(ROOT, dir, 'index.js');
  try { execSync(`node --check ${f}`, { stdio: 'pipe' }); check(`node --check ${dir}/index.js`, true); }
  catch (e) { check(`node --check ${dir}/index.js`, false, String(e.stderr).slice(0, 200)); }
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'manifest.json'), 'utf8'));
  check(`manifest ${dir} parse`, !!m.name);
}

console.log('== G2 插件C 纯JS密码学向量门 ==');
const lyricJs = fs.readFileSync(path.join(ROOT, 'lyric-source', 'index.js'), 'utf8');
/* 抽出 IIFE 内的密码学函数：附加导出垫片后在 vm 中执行 */
const sandbox = { window: { addEventListener() { } }, localStorage: { getItem: () => null, setItem: () => { } } };
vm.createContext(sandbox);
/* 垫片必须插入 IIFE 闭合之前才能捕获闭包内函数 */
const shim = "\n;window.__tools = { md5: md5, utf8Bytes: utf8Bytes, bytesToHex: bytesToHex, aesExpandKey: aesExpandKey, aesEncryptBlock: aesEncryptBlock, aesEcbEncryptBytes: aesEcbEncryptBytes, eapiEncrypt: eapiEncrypt };";
const lastClose = lyricJs.lastIndexOf('})();');
if (lastClose < 0) { console.log('  FAIL 未找到 IIFE 闭合'); process.exit(1); }
const injected = lyricJs.slice(0, lastClose) + shim + lyricJs.slice(lastClose);
vm.runInContext(injected, sandbox, { filename: 'lyric-source.index.js' });
const T = sandbox.window.__tools;
if (!T) { console.log('  FAIL 工具导出垫片未生效'); process.exit(1); }

/* MD5 RFC 1321 官方向量 */
const md5Vecs = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'], /* node/python 双实现交叉确认 */
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
  ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
];
for (const [msg, want] of md5Vecs) {
  const got = T.md5(T.utf8Bytes(msg));
  check(`md5(${JSON.stringify(msg.slice(0, 18))}...)`, got === want, `got=${got}`);
}
/* 中文 UTF-8 向量（Node crypto 真值） */
const zh = '初始音乐面板逐字歌词';
check('md5(中文)', T.md5(T.utf8Bytes(zh)) === crypto.createHash('md5').update(zh, 'utf8').digest('hex'));

/* AES-128-ECB：FIPS-197 C.1 附录向量 + Node 对照（PKCS7 由 Node 补齐） */
function nodeAesEcbFull(plainUtf8, key) {
  const c = crypto.createCipheriv('aes-128-ecb', Buffer.from(key, 'latin1'), null);
  c.setAutoPadding(true);
  return Buffer.concat([c.update(Buffer.from(plainUtf8, 'utf8')), c.final()]).toString('hex').toUpperCase();
}
function aesEcbNoPad(plainLatin1, key) {
  /* 单块无填充（FIPS 向量用） */
  const kb = []; for (let i = 0; i < key.length; i++) kb.push(key.charCodeAt(i) & 255);
  const w = T.aesExpandKey(kb); const blk = [];
  for (let i = 0; i < 16; i++) blk.push(plainLatin1.charCodeAt(i) & 255);
  return T.bytesToHex(T.aesEncryptBlock(blk, w)).toUpperCase();
}
const aesVecs = [
  /* FIPS-197 Appendix C.1：key 000102..0f, plain 00112233445566778899aabbccddeeff（作 latin1 传入） */
  ['\x00\x11\x22\x33\x44\x55\x66\x77\x88\x99\xaa\xbb\xcc\xdd\xee\xff', '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f', '69c4e0d86a7b0430d8cdb78070b4c55a'],
  /* FIPS-197 Appendix B：key 2b7e1516.., plain 3243f6a8..（作 latin1） */
  ['\x32\x43\xf6\xa8\x88\x5a\x30\x8d\x31\x31\x98\xa2\xe0\x37\x07\x34', '\x2b\x7e\x15\x16\x28\xae\xd2\xa6\xab\xf7\x15\x88\x09\xcf\x4f\x3c', '3925841d02dc09fbdc118597196a0b32'],
];
for (const [plain, key, want] of aesVecs) {
  const got = aesEcbNoPad(plain, key);
  check(`aes-ecb FIPS(${want.slice(0, 8)})`, got.toLowerCase() === want.toLowerCase(), `got=${got}`);
}
/* 中文长文本 + PKCS7，与 Node 对照 */
const zhLong = '逐字歌词需要完整的时间轴和翻译，初始 v7 纯 JS 实现。ChuShi Lyric Source 7.0.0';
check('aes-ecb pkcs7(中文长文) vs node',
  T.bytesToHex(T.aesEcbEncryptBytes(T.utf8Bytes(zhLong), (function(){ const kb=[]; for (const ch of 'e82ckenh8dichen8') kb.push(ch.charCodeAt(0)&255); return kb; })())).toUpperCase() === nodeAesEcbFull(zhLong, 'e82ckenh8dichen8'));

console.log('== G3 eapi 签名构造对照 ==');
/* 用同协议在 Node 侧复算 expected params hex */
(function () {
  const path = '/eapi/song/lyric/v1';
  const params = { id: 186016, cp: false, lv: 0, tv: 0, rv: 0, kv: 0, yv: 0, ytv: 0 };
  const text = `${path}?${JSON.stringify(params)}`;
  const msg = `nobody${path}use${text}md5forencrypt`;
  const digest = crypto.createHash('md5').update(msg, 'utf8').digest('hex');
  const data = `${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const c = crypto.createCipheriv('aes-128-ecb', Buffer.from('e82ckenh8dichen8', 'latin1'), null);
  c.setAutoPadding(true);
  const expected = Buffer.concat([c.update(Buffer.from(data, 'utf8')), c.final()]).toString('hex').toUpperCase();

  const got = T.eapiEncrypt('/eapi/song/lyric/v1', JSON.stringify(params));
  check('eapiEncrypt params == node复算', got === expected, `got=${got.slice(0, 24)}...`);
})();

console.log('== G4 静态纪律门 ==');
const bridgeJs = fs.readFileSync(path.join(ROOT, 'music-bridge', 'index.js'), 'utf8');
check('桥零 require(', !/\brequire\s*\(/.test(bridgeJs));
check('桥零 child_process', !bridgeJs.includes('child_process'));
check('桥 currentTime 写点唯一', (bridgeJs.match(/\.currentTime\s*=/g) || []).length === 1,
  `count=${(bridgeJs.match(/\.currentTime\s*=/g) || []).length}`);
check('桥零 store dispatch', !/\bdispatch\s*\(/.test(bridgeJs));
check('桥端口 = 26901 系列', bridgeJs.includes('26901') && bridgeJs.includes('26902') && bridgeJs.includes('26903'));
check('桥不使用 navigator.mediaSession', !bridgeJs.includes('mediaSession'));
const smtcJs = fs.readFileSync(path.join(ROOT, 'smtc-manager', 'index.js'), 'utf8');
check('SMTC JS 零控制语义', !smtcJs.includes('.play()') && !smtcJs.includes('.pause()'));
check('SMTC JS 零 mediaSession', !smtcJs.includes('mediaSession'));

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
