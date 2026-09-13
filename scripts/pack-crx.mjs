#!/usr/bin/env node
/**
 * pack-crx.mjs —— 把扩展 zip 打成 Chrome/Edge 可自动更新的 CRX3 包。
 *
 * 用法:
 *   node scripts/pack-crx.mjs <in.zip> <private-key.pem> <out.crx> [--verify]
 *
 * 说明：
 *   · 纯 Node（node:crypto），零第三方依赖，可在 GitHub Actions 里直接跑；
 *   · 用同一把 RSA 私钥反复签名 → 扩展 ID 恒定 → 浏览器才认「这是同一个扩展的新版」；
 *   · 私钥绝不能进仓库：CI 走 GitHub Secret（CRX_PRIVATE_KEY），本地自行保管。
 *
 * CRX3 结构（Chromium crx_file.proto）：
 *   "Cr24" | u32le(3) | u32le(header_len) | CrxFileHeader | zip
 *   CrxFileHeader {
 *     repeated AsymmetricKeyProof sha256_with_rsa = 2;   // { bytes public_key=1; bytes signature=2; }
 *     optional bytes signed_header_data = 10000;          // SignedData{ bytes crx_id = 1; }
 *   }
 *   签名数据 = "CRX3 SignedData\0" + u32le(len(signed_header_data)) + signed_header_data + zip
 *   crx_id   = sha256(public_key_der) 前 16 字节
 */
import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";

function varint(n) {
  const out = [];
  while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n);
  return Buffer.from(out);
}
function fBytes(fieldNo, buf) {           // protobuf: 长度分隔字段
  return Buffer.concat([varint((fieldNo << 3) | 2), varint(buf.length), buf]);
}
function u32le(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

export function extensionId(publicKeyDer) {
  const h = crypto.createHash("sha256").update(publicKeyDer).digest().subarray(0, 16);
  return [...h].flatMap((b) => [b >> 4, b & 15]).map((n) => String.fromCharCode(97 + n)).join("");
}

export function packCrx(zipPath, keyPath, outPath) {
  const zip = readFileSync(zipPath);
  const privateKey = crypto.createPrivateKey(readFileSync(keyPath));
  const publicKey = crypto.createPublicKey(privateKey);
  const spki = publicKey.export({ type: "spki", format: "der" });

  const signedHeaderData = fBytes(1, crypto.createHash("sha256").update(spki).digest().subarray(0, 16));
  const signed = Buffer.concat([
    Buffer.from("CRX3 SignedData\u0000", "binary"),  // 16B: "CRX3 SignedData" + NUL
    u32le(signedHeaderData.length),
    signedHeaderData,
    zip,
  ]);
  const signature = crypto.sign("sha256", signed, privateKey); // RSASSA-PKCS1-v1_5 + SHA-256

  const proof = Buffer.concat([fBytes(1, spki), fBytes(2, signature)]);
  const header = Buffer.concat([fBytes(2, proof), fBytes(10000, signedHeaderData)]);
  const crx = Buffer.concat([Buffer.from("Cr24", "binary"), u32le(3), u32le(header.length), header, zip]);
  writeFileSync(outPath, crx);
  return { crx, signature, spki, header, signedHeaderData, zip };
}

export function verifyCrx(crxPath) {
  const crx = readFileSync(crxPath);
  if (crx.subarray(0, 4).toString("binary") !== "Cr24") throw new Error("magic 不是 Cr24");
  const ver = crx.readUInt32LE(4);
  const hlen = crx.readUInt32LE(8);
  const header = crx.subarray(12, 12 + hlen);
  const zip = crx.subarray(12 + hlen);
  // 极简 protobuf 解析：抓 sha256_with_rsa(2) 里的 public_key(1)/signature(2) 与 signed_header_data(10000)
  let off = 0, spki = null, sig = null, shd = null;
  const rd = () => { let n = 0, s = 0, b; do { b = header[off++]; n |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return n >>> 0; };
  while (off < header.length) {
    const tag = rd(), field = tag >>> 3, wire = tag & 7;
    if (wire !== 2) throw new Error("非长度分隔字段");
    const len = rd();
    const val = header.subarray(off, off + len); off += len;
    if (field === 2) {                       // AsymmetricKeyProof
      let o = 0;
      const rd2 = () => { let n = 0, s = 0, b; do { b = val[o++]; n |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return n >>> 0; };
      while (o < val.length) {
        const t2 = rd2(), f2 = t2 >>> 3, w2 = t2 & 7;
        if (w2 !== 2) throw new Error("proof 非长度分隔");
        const l2 = rd2(), v2 = val.subarray(o, o + l2); o += l2;
        if (f2 === 1) spki = v2; else if (f2 === 2) sig = v2;
      }
    } else if (field === 10000) shd = val;
  }
  if (!spki || !sig || !shd) throw new Error("header 缺字段");
  const signed = Buffer.concat([Buffer.from("CRX3 SignedData\u0000", "binary"), u32le(shd.length), shd, zip]);
  const ok = crypto.verify("sha256", signed, crypto.createPublicKey({ key: spki, type: "spki", format: "der" }), sig);
  return { ok, version: ver, headerLen: hlen, crxId: extensionId(spki), zipBytes: zip.length, sigBytes: sig.length };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\\\/g, "/").endsWith("pack-crx.mjs");
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === "--id") {                     // 只算扩展 ID：node pack-crx.mjs --id <public.pem>
    const spki = crypto.createPublicKey(readFileSync(args[1])).export({ type: "spki", format: "der" });
    console.log(extensionId(spki));
    process.exit(0);
  }
  const [zip, key, out] = args;
  if (!zip || !key || !out) { console.error("用法: node pack-crx.mjs <in.zip> <key.pem> <out.crx> | --id <public.pem>"); process.exit(2); }
  const r = packCrx(zip, key, out);
  console.log("wrote", out, "| extension id", extensionId(r.spki), "| zip", r.zip.length, "B");
  const v = verifyCrx(out);
  console.log("verify:", JSON.stringify(v));
  if (!v.ok) process.exit(1);
}
