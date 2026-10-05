/* 「初始」云同步 — 同步引擎（v8.7.49）
 *
 * 职责：把本机起始页全部内容（布局/便签/待办/预设/设置）以端到端加密
 * 形态与用户自配的同步服务器对齐。三层动作：
 *
 *   启动对齐（startWatch 内）——登录态下拉取云端：云端更新 → 解密应用
 *   并整页刷新（与 resetAll「写回+reload」同律，保证所有 useStored 域
 *   一致重读）；本地更新 → 推送本地。
 *
 *   变更监听——轮询比对六键指纹（localStorage 无同页变更事件，跨文档
 *   写入走 storage 事件但轮询天然覆盖全部来源）；指纹变化 debounce 后
 *   自动推送（会话 auto 开启时）。
 *
 *   冲突策略（多设备最后对齐者赢）——push 携带 base=本端已知云端版本；
 *   服务器发现云端版本比 base 新时拒绝（409）。客户端裁决：云端版本比
 *   本端上次对齐时间新 → 说明别的设备更新过 → 拉取云端应用（云赢）；
 *   否则以最新 base 重推（本地赢）。
 *
 * 同步范围（keys.ts 的 localStorage 键位）：
 *   start:settings / start:links / start:todos / start:note
 *   start:presets / start:preset-settings
 * 刻意不同步：start:place（定位缓存，设备各自重新定位）、
 *   start:sandbox-frozen / start:ui-intent / start:seen（本机 UI 态）、
 *   IndexedDB 自定义壁纸（大文件；wallpaperUrl 模式随 settings 自然同步）。
 */

import {
  decryptJson,
  deriveBundle,
  encryptJson,
  exportVaultJwk,
  randomSaltB64,
  sha256Hex,
  verifierOf,
} from "./crypto";
import {
  apiKdf,
  apiLogin,
  apiLogout,
  apiPull,
  apiPush,
  apiRegister,
  SyncApiError,
} from "./api";
import {
  clearSyncSession,
  loadSyncSession,
  saveSyncSession,
  vaultKeyOf,
  type SyncSession,
} from "./session";

/** 参与同步的 localStorage 键（与 keys.ts 的键名契约对齐） */
export const SYNC_DATA_KEYS = [
  "start:settings",
  "start:links",
  "start:todos",
  "start:note",
  "start:presets",
  "start:preset-settings",
] as const;

/** 数据包上限（预设整包官方上限 8MB，密文 base64 膨胀 ~4/3 后留裕量） */
export const VAULT_MAX = 12 * 1024 * 1024;

const POLL_MS = 1500;
const PUSH_DEBOUNCE_MS = 3000;

/* ---------- 指纹（变更检测） ---------- */

let fpCache = "";

/** FNV-1a 32bit：全键原文拼接哈希——等长改值也能捕捉 */
function fingerprint(): string {
  let h = 0x811c9dc5;
  for (const k of SYNC_DATA_KEYS) {
    let raw = "";
    try {
      raw = window.localStorage.getItem(k) ?? "";
    } catch {
      /* noop */
    }
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7e; // 键分隔符（防跨键拼接歧义）
  }
  return (h >>> 0).toString(16);
}

/* ---------- 数据包 ---------- */

interface VaultPayload {
  v: 1;
  at: number;
  device: string;
  data: { [key: string]: unknown };
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const m = ua.match(/\(([^)]+)\)/);
  const plat = m ? m[1].split(";")[0].trim() : "";
  return plat || "未知设备";
}

function collectPayload(): VaultPayload {
  const data: { [key: string]: unknown } = {};
  for (const k of SYNC_DATA_KEYS) {
    try {
      const raw = window.localStorage.getItem(k);
      data[k] = raw == null ? null : JSON.parse(raw);
    } catch {
      data[k] = null;
    }
  }
  return { v: 1, at: Date.now(), device: deviceName(), data };
}

/** 云端包应用：写回六键 + 派发 storage 事件（settings/links 域同页热跟随）+ reload */
function applyPayload(p: VaultPayload): void {
  for (const k of SYNC_DATA_KEYS) {
    const v = p.data[k];
    try {
      if (v == null) {
        window.localStorage.removeItem(k);
      } else {
        window.localStorage.setItem(k, JSON.stringify(v));
      }
      // settings/links 有 storage 事件监听（同页手动派发可热跟随）；其余键靠 reload 统一重读
      window.dispatchEvent(new StorageEvent("storage", { key: k, newValue: JSON.stringify(v) }));
    } catch {
      /* 隐私模式静默 */
    }
  }
}

function shapeOk(p: VaultPayload | null | undefined): p is VaultPayload {
  return (
    !!p &&
    typeof p === "object" &&
    (p as VaultPayload).v === 1 &&
    typeof (p as VaultPayload).data === "object" &&
    (p as VaultPayload).data != null
  );
}

/* ---------- 账号生命周期（设置面板调用） ---------- */

export interface AccountInput {
  server: string;
  user: string;
  password: string;
}

function userHash(user: string): Promise<string> {
  return sha256Hex(user.trim().toLowerCase());
}

/** 注册新账号并自动登录 + 首次推送 */
export async function registerAccount(
  input: AccountInput
): Promise<{ session: SyncSession; appliedCloud: boolean }> {
  const u = await userHash(input.user);
  const salt = randomSaltB64();
  const keys = await deriveBundle(input.password, salt);
  const v = await verifierOf(keys.authHex);
  await apiRegister(input.server, { u, salt, v });
  const session = await loginFlow(input.server, input.user, u, keys, salt);
  return { session, appliedCloud: false };
}

/** 登录：拉取云端并对齐（云端更新 → 应用并 reload；本地更新 → 推送） */
export async function loginAccount(
  input: AccountInput
): Promise<{ session: SyncSession; appliedCloud: boolean }> {
  const u = await userHash(input.user);
  let salt: string;
  try {
    salt = (await apiKdf(input.server, u)).salt;
  } catch (e) {
    if (e instanceof SyncApiError && e.status === 404) {
      throw new SyncApiError(404, "账号不存在，请先注册");
    }
    throw e;
  }
  const keys = await deriveBundle(input.password, salt);
  const session = await loginFlow(input.server, input.user, u, keys, salt);
  // 登录即对齐一次：云新 → 应用（内部 reload）；本地新 → 推送
  const r = await alignOnStart(session);
  return { session: r.session, appliedCloud: r.appliedCloud };
}

/** login 内核：authKey 上行换 sid，vaultKey JWK 入会话 */
async function loginFlow(
  server: string,
  user: string,
  u: string,
  keys: { authHex: string; vaultRaw: ArrayBuffer },
  salt: string
): Promise<SyncSession> {
  const { sid, updatedAt } = await apiLogin(server, { u, a: keys.authHex });
  const vaultJwk = await exportVaultJwk(keys.vaultRaw);
  const session: SyncSession = {
    server,
    user: user.trim(),
    u,
    salt,
    vaultJwk,
    sid,
    updatedAt,
    lastSyncAt: Date.now(),
    auto: true,
  };
  saveSyncSession(session);
  return session;
}

export async function logoutAccount(): Promise<void> {
  const s = loadSyncSession();
  if (s) await apiLogout(s.server, { u: s.u, sid: s.sid });
  clearSyncSession();
}

/* ---------- 推送 / 拉取 ---------- */

export interface SyncResult {
  ok: boolean;
  appliedCloud: boolean;
  message: string;
}

/** 推送本机数据（冲突自动裁决，见文件头） */
export async function pushNow(base?: SyncSession): Promise<SyncResult> {
  const s = base ?? loadSyncSession();
  if (!s) return { ok: false, appliedCloud: false, message: "尚未登录" };
  const payload = collectPayload();
  const vaultRaw = await vaultKeyOf(s);
  const { blob, iv } = await encryptJson(vaultRaw, payload);
  if (blob.length > VAULT_MAX) {
    return { ok: false, appliedCloud: false, message: "数据超过云端上限，请精简预设后重试" };
  }
  try {
    const r = await apiPush(s.server, { u: s.u, sid: s.sid, blob, iv, base: s.updatedAt });
    const next = { ...s, updatedAt: r.updatedAt, lastSyncAt: Date.now() };
    saveSyncSession(next);
    return { ok: true, appliedCloud: false, message: "已推送到云端" };
  } catch (e) {
    if (e instanceof SyncApiError && e.status === 409) {
      // 云端比本端已知 base 新 → 别的设备写过。裁决「最后写赢」：本端数据包
      // 的时间戳比云端版本新 → 以云端版本为 base 重推（本地赢）；否则拉取
      // 云端应用（云赢）。
      const body = e.body as { updatedAt?: number } | null;
      const cloudAt = typeof body?.updatedAt === "number" ? body.updatedAt : 0;
      if (payload.at > cloudAt) {
        return pushNow({ ...s, updatedAt: cloudAt });
      }
      return pullNow(s);
    }
    if (e instanceof SyncApiError && e.status === 401) {
      clearSyncSession();
      return { ok: false, appliedCloud: false, message: "登录已过期，请重新登录" };
    }
    return {
      ok: false,
      appliedCloud: false,
      message: e instanceof Error ? e.message : "推送失败",
    };
  }
}

/** 拉取云端：云新 → 解密应用 + reload；本端已是最新 → 原样返回 */
export async function pullNow(base?: SyncSession): Promise<SyncResult> {
  const s = base ?? loadSyncSession();
  if (!s) return { ok: false, appliedCloud: false, message: "尚未登录" };
  try {
    const r = await apiPull(s.server, { u: s.u, sid: s.sid });
    if (r.updatedAt <= s.updatedAt && s.updatedAt > 0) {
      const next = { ...s, lastSyncAt: Date.now() };
      saveSyncSession(next);
      return { ok: true, appliedCloud: false, message: "本机已是最新" };
    }
    const vaultRaw = await vaultKeyOf(s);
    const payload = await decryptJson<VaultPayload>(vaultRaw, r.blob, r.iv);
    if (!shapeOk(payload)) {
      return { ok: false, appliedCloud: false, message: "云端数据包版本不识别" };
    }
    const next = { ...s, updatedAt: r.updatedAt, lastSyncAt: Date.now() };
    saveSyncSession(next);
    applyPayload(payload);
    window.location.reload();
    return { ok: true, appliedCloud: true, message: "已恢复云端数据" };
  } catch (e) {
    if (e instanceof SyncApiError && e.status === 404) {
      // 云端还没有数据（新账号/被清空）→ 本机内容补推上去
      return pushNow(s);
    }
    if (e instanceof SyncApiError && e.status === 401) {
      clearSyncSession();
      return { ok: false, appliedCloud: false, message: "登录已过期，请重新登录" };
    }
    return {
      ok: false,
      appliedCloud: false,
      message: e instanceof Error ? e.message : "拉取失败",
    };
  }
}

/* ---------- 启动对齐与监听 ---------- */

let watchStarted = false;

async function alignOnStart(s: SyncSession): Promise<{ session: SyncSession; appliedCloud: boolean }> {
  try {
    const r = await apiPull(s.server, { u: s.u, sid: s.sid });
    if (r.updatedAt > s.updatedAt) {
      const vaultRaw = await vaultKeyOf(s);
      const payload = await decryptJson<VaultPayload>(vaultRaw, r.blob, r.iv);
      if (!shapeOk(payload)) return { session: s, appliedCloud: false };
      const next = { ...s, updatedAt: r.updatedAt, lastSyncAt: Date.now() };
      saveSyncSession(next);
      applyPayload(payload);
      window.location.reload();
      return { session: next, appliedCloud: true };
    }
    const touch = { ...s, lastSyncAt: Date.now() };
    saveSyncSession(touch);
    return { session: touch, appliedCloud: false };
  } catch (e) {
    // 云端还没有数据（新账号/被清空）→ 把本机内容补推上去；其余（网络失败等）静默
    if (e instanceof SyncApiError && e.status === 404) {
      void pushNow(s);
    }
    return { session: s, appliedCloud: false };
  }
}

/**
 * 启动同步引擎（页面挂载期调用一次）：登录态先对齐，随后轮询指纹
 * 变化 → debounce 推送。非登录态只监听，登录后由 UI 触发首轮对齐。
 */
export function startWatch(): void {
  if (watchStarted || typeof window === "undefined") return;
  watchStarted = true;

  const s0 = loadSyncSession();
  if (s0) {
    void alignOnStart(s0);
  }

  fpCache = fingerprint();

  let pushTimer: number | undefined;
  const schedulePush = () => {
    if (pushTimer != null) window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => {
      const s = loadSyncSession();
      if (!s?.auto) return;
      void pushNow(s);
    }, PUSH_DEBOUNCE_MS);
  };

  window.setInterval(() => {
    const s = loadSyncSession();
    if (!s?.auto) {
      fpCache = fingerprint();
      return;
    }
    const fp = fingerprint();
    if (fp !== fpCache) {
      fpCache = fp;
      schedulePush();
    }
  }, POLL_MS);

  // 跨文档写入（popup 直写等）虽然被轮询覆盖，这里即时捕捉减少等待
  window.addEventListener("storage", (e) => {
    if (e.key && (SYNC_DATA_KEYS as readonly string[]).includes(e.key)) {
      fpCache = fingerprint();
      const s = loadSyncSession();
      if (s?.auto) schedulePush();
    }
  });
}

/** 登录/注册成功后由 UI 调用：让指纹基线对齐当前状态，避免登录瞬间误判变更 */
export function rebaseFingerprint(): void {
  fpCache = fingerprint();
}
