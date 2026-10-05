/* 「初始」云同步 — 服务器 API 客户端（v8.7.49）
 *
 * 协议（全部 JSON；服务器端实现不开源，见私有工作仓 sync-server）：
 *   GET  ping                       → { ok, name, v }
 *   GET  kdf?u=                     → { salt }                      404=账号不存在
 *   POST register {u,salt,v}        → { ok }                        409=用户名已占用
 *   POST login    {u,a}             → { sid, updatedAt }            401=用户名或密码错误
 *   POST pull     {u,sid}           → { blob, iv, updatedAt }       404=云端还没有数据
 *   POST push     {u,sid,blob,iv,base} → { updatedAt }              409=云端比 base 新
 *   POST logout   {u,sid}           → { ok }
 *
 * 路由模型（热铁盒网页托管）：云函数即文件——单文件 api.node.js 以 URL
 * 路径直接访问，操作名走 op 参数（GET 查询串 / POST body 字段）分发，
 * 不依赖任何路径重写规则。
 *
 * 服务器要求 CORS 全放行（扩展页面 origin 为 chrome-extension://…，
 * 服务器返回 Access-Control-Allow-Origin: * 即可直接 fetch，无需扩展申请
 * 任何宿主权限——密文数据公开放行无害，这正是端到端加密的意义）。
 */

export class SyncApiError extends Error {
  status: number;
  /** 服务器错误响应体（409 冲突时携带 { updatedAt } 云端当前版本时间） */
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const TIMEOUT_MS = 15_000;

interface ApiOptions {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}

/** 云函数端点：单文件 api.node.js，操作名经 op 参数分发（热铁盒路由模型） */
export const SYNC_ENDPOINT = "/api.node.js";

async function call<T>(server: string, path: string, opts: ApiOptions = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(server + path, {
      method: opts.method ?? "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch {
    clearTimeout(timer);
    throw new SyncApiError(0, "无法连接同步服务器，请检查网络与服务器地址");
  }
  clearTimeout(timer);

  let j: unknown = null;
  try {
    j = await res.json();
  } catch {
    /* 非 JSON 响应体 */
  }

  if (!res.ok) {
    const rec = (j ?? {}) as { error?: string };
    throw new SyncApiError(res.status, rec.error || `服务器错误（HTTP ${res.status}）`, j);
  }
  return (j ?? {}) as T;
}

/** 存活探测（登录前测试服务器可达 + 是否「初始」同步服务） */
export function apiPing(server: string): Promise<{ ok: boolean; name?: string; v?: number }> {
  return call(server, SYNC_ENDPOINT + "?op=ping");
}

/** 取 KDF salt（登录第一步） */
export function apiKdf(server: string, u: string): Promise<{ salt: string }> {
  return call(server, `${SYNC_ENDPOINT}?op=kdf&u=${encodeURIComponent(u)}`);
}

export function apiRegister(
  server: string,
  body: { u: string; salt: string; v: string }
): Promise<{ ok: boolean }> {
  return call(server, SYNC_ENDPOINT, { method: "POST", body: { op: "register", ...body } });
}

export function apiLogin(
  server: string,
  body: { u: string; a: string }
): Promise<{ sid: string; updatedAt: number }> {
  return call(server, SYNC_ENDPOINT, { method: "POST", body: { op: "login", ...body } });
}

export function apiPull(
  server: string,
  body: { u: string; sid: string }
): Promise<{ blob: string; iv: string; updatedAt: number }> {
  return call(server, SYNC_ENDPOINT, { method: "POST", body: { op: "pull", ...body } });
}

export function apiPush(
  server: string,
  body: { u: string; sid: string; blob: string; iv: string; base: number }
): Promise<{ updatedAt: number }> {
  return call(server, SYNC_ENDPOINT, { method: "POST", body: { op: "push", ...body } });
}

export function apiLogout(server: string, body: { u: string; sid: string }): Promise<{ ok: boolean }> {
  return call(server, SYNC_ENDPOINT, { method: "POST", body: { op: "logout", ...body } }).catch(() => ({ ok: false }));
}
