// test-eapi-crypto.mjs — 从插件源码提取加密块，跑 MD5/AES 标准测试向量
import { readFileSync } from "node:fs";

const src = readFileSync("/home/z/my-project/bridge/lyric-plugin/index.js", "utf8");
const m = src.match(/\/\*__EAPI_CRYPTO_START__\*\/([\s\S]*?)\/\*__EAPI_CRYPTO_END__\*\//);
if (!m) { console.error("FAIL: crypto block not found"); process.exit(1); }
const block = m[1]
  .replace(/^\s*\/\/.*$/gm, "")          // 去行注释
  .replace(/\/\*[\s\S]*?\*\//g, "")      // 去块注释
  .trim();
const mod = new Function(`${block};
return { utf8Bytes, bytesToHexUpper, md5Bytes, AES, eapiParams };`)();

let fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  if (!ok) { fail++; console.error(`FAIL ${name}\n  got : ${got}\n  want: ${want}`); }
  else console.log(`ok   ${name}`);
};

// MD5 RFC 1321 标准向量
eq("md5('')", mod.md5Bytes(mod.utf8Bytes("")), "d41d8cd98f00b204e9800998ecf8427e");
eq("md5('a')", mod.md5Bytes(mod.utf8Bytes("a")), "0cc175b9c0f1b6a831c399e269772661");
eq("md5('abc')", mod.md5Bytes(mod.utf8Bytes("abc")), "900150983cd24fb0d6963f7d28e17f72");
eq("md5('message digest')", mod.md5Bytes(mod.utf8Bytes("message digest")), "f96b697d7cb7938d525a2f31aaf161d0");
eq("md5('abcdefghijklmnopqrstuvwxyz')", mod.md5Bytes(mod.utf8Bytes("abcdefghijklmnopqrstuvwxyz")), "c3fcd3d76192e4007dfb496cca67e13b");
eq("md5('12345678901234567890123456789012345678901234567890123456789012345678901234567890')",
  mod.md5Bytes(mod.utf8Bytes("12345678901234567890123456789012345678901234567890123456789012345678901234567890")),
  "57edf4a22be3c955ac49da2e2107b67a");
// UTF-8 中文向量（python3 hashlib 对拍值）
eq("md5('初始')", mod.md5Bytes(mod.utf8Bytes("初始")), "57ec8f1eeadaaeb2bd05728d70f96b4f");

// AES-128 ECB — FIPS-197 附录 C.1 向量（PKCS#7 填充后为 2 块，对比首块 32 hex）
{
  const key = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
  const pt = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
  eq("aes128-ecb FIPS-197 C.1", mod.bytesToHexUpper(mod.AES.ecbEncrypt(pt, key)).slice(0, 32), "69C4E0D86A7B0430D8CDB78070B4C55A");
}
// 第二向量：key=2b7e1516..（SP 800-38A F.1.1 ECB-AES128）
{
  const key = new Uint8Array([0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c]);
  const pt = new Uint8Array([0x6b, 0xc1, 0xbe, 0xe2, 0x2e, 0x40, 0x9f, 0x96, 0xe9, 0x3d, 0x7e, 0x11, 0x73, 0x93, 0x17, 0x2a]);
  eq("aes128-ecb SP800-38A F.1.1 blk1", mod.bytesToHexUpper(mod.AES.ecbEncrypt(pt, key)).slice(0, 32), "3AD77BB40D7A3660A89ECAF32466EF97");
}
// 长消息（3 块）一致性
{
  const key = new Uint8Array(16).fill(0x42);
  const pt = new Uint8Array(48);
  for (let i = 0; i < 48; i++) pt[i] = i;
  const out = mod.AES.ecbEncrypt(pt, key);
  console.log("ok   aes 3-block len:", out.length === 64 ? "64 (48+PKCS#7)" : `BAD ${out.length}`);
  if (out.length !== 64) fail++;
}
// eapiParams 形状：64 倍数长度大写 hex
{
  const p = mod.eapiParams("/api/song/lyric/v1", { id: "123", yv: 1 });
  const isHex = /^[0-9A-F]+$/.test(p);
  console.log(isHex && p.length % 16 === 0 ? "ok" : "FAIL", "eapiParams hex shape, len:", p.length);
  if (!isHex || p.length % 16 !== 0) fail++;
}

console.log(fail === 0 ? "\nALL CRYPTO VECTORS PASS" : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
