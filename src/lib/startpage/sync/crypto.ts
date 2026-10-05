/* 「初始」云同步 — 端到端加密原语（WebCrypto，v8.7.49）
 *
 * 零知识存储边界（服务器被完全攻破也拿不到任何明文）：
 *   服务器只持有  salt、verifier=SHA-256(authKey)、AES-256-GCM 密文。
 *   password / masterKey / authKey / vaultKey 全程不出本机。
 *
 * 派生链（一次密码 → 三把钥匙，域分离防钥匙互换）：
 *   masterKey = PBKDF2-SHA256(password, salt, 310_000 迭代, 256bit)
 *   authKey   = HKDF-SHA256(masterKey, salt, info="chushi/auth/v1")   ← 只用于身份证明
 *   vaultKey  = HKDF-SHA256(masterKey, salt, info="chushi/vault/v1")  ← 只用于数据加密
 *
 * 证明方式：登录时客户端上传 authKey，服务器算 SHA-256 与 verifier 比对
 * （数据库里不存 authKey 本体）；数据加密用 AES-256-GCM（每次同步随机 IV）。
 * 传输层安全由服务器的 HTTPS 承担（热铁盒托管全站 https）。
 */

/** PBKDF2 迭代次数（OWASP 2023 对用户口令的建议量级） */
export const PBKDF2_ITER = 310_000;

const AUTH_INFO = new TextEncoder().encode("chushi/auth/v1");
const VAULT_INFO = new TextEncoder().encode("chushi/vault/v1");

/* ---------- base64 工具（ArrayBuffer 分段转换，避免 String.fromCharCode 爆栈） ---------- */

export function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

export function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

/* ---------- 基础原语 ---------- */

/** SHA-256 → hex（verifier 计算、用户名哈希） */
export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bufToHex(d);
}

/** 16 字节随机 salt（base64）——每账号一生一份 */
export function randomSaltB64(): string {
  return bufToB64(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

/** 12 字节随机 IV（base64）——每次加密新鲜生成 */
function randomIvB64(): string {
  return bufToB64(crypto.getRandomValues(new Uint8Array(12)).buffer);
}

/* ---------- 密钥派生 ---------- */

async function deriveMaster(password: string, saltB64: string): Promise<ArrayBuffer> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: b64ToBuf(saltB64), iterations: PBKDF2_ITER },
    material,
    256
  );
}

async function hkdf(master: ArrayBuffer, info: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info },
    key,
    256
  );
}

export interface KeyBundle {
  /** 身份证明钥匙（hex 上传给服务器做哈希比对；不落盘不持久化） */
  authHex: string;
  /** 数据加密钥匙（原始 32 字节；持久化只以 JWK 形态存 vaultKey，见 session.ts） */
  vaultRaw: ArrayBuffer;
}

/** 一次密码派生全部钥匙（注册/登录共用） */
export async function deriveBundle(password: string, saltB64: string): Promise<KeyBundle> {
  const master = await deriveMaster(password, saltB64);
  const [auth, vault] = await Promise.all([hkdf(master, AUTH_INFO), hkdf(master, VAULT_INFO)]);
  return { authHex: bufToHex(auth), vaultRaw: vault };
}

/** 服务器侧比对用的 verifier = SHA-256(authKey)（hex） */
export async function verifierOf(authHex: string): Promise<string> {
  const bytes = new Uint8Array(authHex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(authHex.slice(i * 2, i * 2 + 2), 16);
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return bufToHex(d);
}

/* ---------- 数据包加解密（AES-256-GCM） ---------- */

async function vaultKey(vaultRaw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", vaultRaw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** 加密任意可 JSON 化的同步数据包 → { blob(b64), iv(b64) } */
export async function encryptJson(
  vaultRaw: ArrayBuffer,
  obj: unknown
): Promise<{ blob: string; iv: string }> {
  const key = await vaultKey(vaultRaw);
  const iv = randomIvB64();
  const plain = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(iv)) },
    key,
    plain
  );
  return { blob: bufToB64(cipher), iv };
}

/** 解密同步数据包；密文被篡改/钥匙不对时抛错（GCM 认证标签兜底） */
export async function decryptJson<T>(vaultRaw: ArrayBuffer, blob: string, iv: string): Promise<T> {
  const key = await vaultKey(vaultRaw);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(iv)) },
    key,
    b64ToBuf(blob)
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** vaultKey 持久化形态（JWK）与本机恢复 */
export async function exportVaultJwk(vaultRaw: ArrayBuffer): Promise<JsonWebKey> {
  const key = await crypto.subtle.importKey("raw", vaultRaw, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
  return crypto.subtle.exportKey("jwk", key);
}

export async function importVaultJwk(jwk: JsonWebKey): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
  return crypto.subtle.exportKey("raw", key);
}
