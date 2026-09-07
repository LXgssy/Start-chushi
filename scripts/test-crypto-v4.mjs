/* test-crypto-v4.mjs -- validate the plugin's fresh eapi crypto stack
 * (md5Hex + AES-128-ECB) against Node's built-in crypto and FIPS-197 vectors.
 * Extracts the crypto section from bridge/ncm-plugin/index.js and evals it. */
import { readFileSync as rf0 } from "node:fs";
import { createHash, createCipheriv } from "node:crypto";
const readFileSync = rf0;

const src = readFileSync("/home/z/my-project/bridge/ncm-plugin/index.js", "utf8");

function section(startMark, endMark) {
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark, a);
  if (a < 0 || b < 0) throw new Error(`section not found: ${startMark}`);
  return src.slice(a, b);
}

const code =
  section("/* ---- MD5 (RFC 1321) over bytes -> lowercase hex ---- */", "  const EAPI_KEY") +
  section("  const EAPI_KEY", "  /* ---- klyric");
const factory = new Function((code.replace(/^  /gm, "") + "\nreturn {md5Hex, AES, utf8Bytes, hexUpper, eapiParams};"));
const { md5Hex, AES, utf8Bytes, hexUpper, eapiParams } = factory();
if (typeof md5Hex !== "function" || typeof AES?.ecbEncrypt !== "function" || typeof eapiParams !== "function") {
  console.error("FAIL: crypto functions not extracted");
  process.exit(1);
}

let fails = 0;
const eq = (name, a, b) => {
  const ok = String(a).toLowerCase() === String(b).toLowerCase();
  if (!ok) { fails++; console.error(`FAIL ${name}: got ${a} want ${b}`); }
  else console.log(`ok   ${name}`);
};

// MD5 RFC 1321 vectors
eq("md5('')", md5Hex(utf8Bytes("")), "d41d8cd98f00b204e9800998ecf8427e");
eq("md5('abc')", md5Hex(utf8Bytes("abc")), "900150983cd24fb0d6963f7d28e17f72");
eq("md5('The quick brown fox jumps over the lazy dog')",
  md5Hex(utf8Bytes("The quick brown fox jumps over the lazy dog")),
  createHash("md5").update("The quick brown fox jumps over the lazy dog").digest("hex"));

// AES-128-ECB FIPS-197 Appendix C.1 vector
const key = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
const pt = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
eq("aes-ecb fips197", hexUpper(AES.ecbEncrypt(key, pt)).slice(0, 32), "69C4E0D86A7B0430D8CDB78070B4C55A");

// Multi-block vs Node aes-128-ecb (no padding, exact 32-byte input)
const key2 = utf8Bytes("e82ckenh8dichen8");
const plain = utf8Bytes("/api/song/lyric/v1-36cd479b6b5-1234567890abcdef0");
if (plain.length % 16 !== 0) throw new Error("test input must be 16-byte aligned");
const mine = hexUpper(AES.ecbEncrypt(key2, plain)); // adds PKCS#7 block
const n = createCipheriv("aes-128-ecb", Buffer.from(key2), null);
n.setAutoPadding(false);
const ref = n.update(Buffer.from(plain)).toString("hex").toUpperCase() + n.final().toString("hex").toUpperCase();
eq("aes-ecb multi-block vs node", mine.slice(0, ref.length), ref);

// eapiParams structural check: params must be pure uppercase hex, non-empty
const p = eapiParams("/api/song/lyric/v1", { id: "12345", yv: 1 });
if (!/^[0-9A-F]+$/.test(p) || p.length < 64) { fails++; console.error("FAIL eapiParams shape"); }
else console.log(`ok   eapiParams shape (${p.length} hex chars)`);

// ascii-only audit of both plugin files + engine
import { readFileSync as rf } from "node:fs";
for (const f of [
  "/home/z/my-project/bridge/ncm-plugin/index.js",
  "/home/z/my-project/bridge/smtc-plugin/index.js",
  "/home/z/my-project/bridge/engine/chushi-smtc-engine.ps1",
]) {
  const txt = rf(f, "utf8");
  const bad = [...txt].filter((ch) => ch.charCodeAt(0) > 127);
  if (bad.length) { fails++; console.error(`FAIL ascii ${f}: ${bad.length} non-ascii chars, e.g. ${bad.slice(0, 5).map((c) => c.charCodeAt(0))}`); }
  else console.log(`ok   ascii-only ${f.split("/").pop()}`);
}

console.log(fails === 0 ? "ALL CRYPTO TESTS PASSED" : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
