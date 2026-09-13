#!/usr/bin/env node
/**
 * make-update-key.mjs —— 一次性生成更新签名密钥（RSA-2048）。
 *
 * 用法:
 *   node scripts/make-update-key.mjs <private-key-out.pem> <public-key-out.pem>
 *
 * 产物用途：
 *   · 私钥 <private-key-out.pem>：只放本机 + GitHub Secret "CRX_PRIVATE_KEY"，
 *     绝不提交进仓库。丢了私钥 = 老用户永远收不到更新（扩展 ID 会变），务必备份。
 *   · 公钥 <public-key-out.pem>：提交进仓库（updates/extension-key.pub.pem），
 *     build-extension.py 会把它写进 manifest 的 "key"，让「解压加载」和「.crx 安装」
 *     两种装法的扩展 ID 完全一致（老用户数据不丢）。
 * 同时打印扩展 ID——update.xml 的 appid 就是它。
 */
import { generateKeyPairSync, createHash, createPublicKey } from "node:crypto";
import { writeFileSync, readFileSync } from "node:fs";

const [, , priv, pub] = process.argv;
if (!priv || !pub) { console.error("用法: node make-update-key.mjs <private.pem> <public.pem>"); process.exit(2); }

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
writeFileSync(priv, privateKey);
writeFileSync(pub, publicKey);

const spki = createPublicKey(readFileSync(pub)).export({ type: "spki", format: "der" });
const id = createHash("sha256").update(spki).digest().subarray(0, 16);
const extId = [...id].flatMap((b) => [b >> 4, b & 15]).map((n) => String.fromCharCode(97 + n)).join("");
console.log("private key ->", priv, "(勿提交，存 GitHub Secret CRX_PRIVATE_KEY)");
console.log("public  key ->", pub, "(提交到仓库)");
console.log("extension id:", extId);
