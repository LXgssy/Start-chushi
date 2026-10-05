/* 「初始」云同步 — 会话域（v8.7.49）
 *
 * 登录后在本机 localStorage 持久化「免密续传」所需的最小材料：
 *   server / user / u（用户名哈希）/ salt / vaultJwk / sid / updatedAt / auto。
 * 刻意不持久化 password 与 authKey——密码只存在于一次派生的内存瞬间；
 * 持久化 vaultJwk 是为了重启后无需重输密码即可解密云端包（免密续传）。
 *
 * 键位说明：start:sync 刻意不登记进 keys.ts 的 KEYS 表——「恢复默认」
 * 语义是重置起始页内容，不应顺带登出账号；账号生命周期独立于数据。
 */

import { importVaultJwk } from "./crypto";

/** localStorage 键（账号域，恢复默认不清除） */
export const SYNC_KEY = "start:sync";

export interface SyncSession {
  /** 同步服务器根地址（https://…，用户在设置面板配置） */
  server: string;
  /** 明文用户名（仅本机展示用，服务器只见其哈希） */
  user: string;
  /** hex(SHA-256(user.toLowerCase())) —— 服务器主键 */
  u: string;
  /** 注册时生成的 salt（b64） */
  salt: string;
  /** vaultKey JWK（本机持久化，免密解密云端包） */
  vaultJwk: JsonWebKey;
  /** 服务器会话令牌 */
  sid: string;
  /** 本端最后已知的云端版本时间戳（ms） */
  updatedAt: number;
  /** 上次与云端对齐完成的时间戳（ms） */
  lastSyncAt: number;
  /** 自动同步开关（默认开） */
  auto: boolean;
}

export function loadSyncSession(): SyncSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SYNC_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as SyncSession;
    if (typeof j.server !== "string" || typeof j.u !== "string" || !j.vaultJwk) return null;
    return j;
  } catch {
    return null;
  }
}

export function saveSyncSession(s: SyncSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNC_KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式静默 */
  }
}

export function clearSyncSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SYNC_KEY);
  } catch {
    /* noop */
  }
}

/** 会话内派生 vaultKey 原始材料（每次同步用） */
export async function vaultKeyOf(s: SyncSession): Promise<ArrayBuffer> {
  return importVaultJwk(s.vaultJwk);
}

/** 规范化服务器地址：去尾斜杠、强制 http(s) 协议 */
export function normalizeServer(input: string): string | null {
  const s = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const url = new URL(s);
    if (!url.host) return null;
    return s;
  } catch {
    return null;
  }
}
