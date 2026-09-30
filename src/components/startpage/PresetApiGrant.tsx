"use client";

/* 预设 API 授权（v8.7.42 开放律）：预设声明的远端域 → 用户逐域确认 →
 * chrome.permissions.request 授予 optional_host_permissions 子集。
 * 设计律：
 * - 授权动作必须在新鲜用户手势内（授权视图的「授权并导入」按钮就是手势源）；
 * - contains 是异步真源查询：已授权域不重复弹窗（二次导入零打扰）；
 * - 拒绝 = 中止导入（api 声明存在而未授权的预设装了也没法用，宁缺毋滥）；
 * - 网页版无 permissions API → 收集器返回 null（跳过授权，沙箱直连受 CORS）。
 * 撤销：管理列表的地球按钮 → permissions.remove（宿主声明集仍在，
 * SW 端 contains 复核是硬门——撤销即刻生效，无需动预设数据）。 */

import { Globe, ShieldCheck } from "lucide-react";
import type { PresetApiDecl } from "@/lib/startpage/preset";

/* chrome.permissions 局部类型（nav.ts CsRuntime 同模式，不引 @types/chrome） */
type CsPerms = {
  runtime?: { id?: string };
  permissions?: {
    request(opts: { origins: string[] }, cb: (granted: boolean) => void): void;
    contains(opts: { origins: string[] }, cb: (granted: boolean) => void): void;
    remove(opts: { origins: string[] }, cb: (granted: boolean) => void): void;
  };
};

function perms(): CsPerms["permissions"] | null {
  try {
    const c = (globalThis as { chrome?: CsPerms }).chrome;
    return c?.runtime?.id && c.permissions ? c.permissions : null;
  } catch {
    return null;
  }
}

export interface GrantPending {
  /** host[:port]（预设声明原值） */
  host: string;
  /** match pattern（授权请求与撤销共用） */
  origin: string;
  /** 本地回环 http 明文 */
  insecure: boolean;
  /** 预设声明的用途说明 */
  name?: string;
}

/** api 声明 → 授权条目（纯派生，origin 与 SW/manifest optional 权限同构） */
export function buildGrantList(api: PresetApiDecl[]): GrantPending[] {
  return api.map((d) => ({
    host: d.host,
    origin: `${d.allowInsecure ? "http" : "https"}://${d.host}/*`,
    insecure: d.allowInsecure === true,
    name: d.name,
  }));
}

/**
 * 收集未授权域。null = 无需授权流程（无声明 / 网页版）；[] = 全部已授权（直接导入）。
 */
export async function collectPendingGrants(api: PresetApiDecl[] | undefined): Promise<GrantPending[] | null> {
  if (!api || api.length === 0) return null;
  const pm = perms();
  if (!pm) return null; // 网页版：跳过授权（沙箱直连降级）
  const items = buildGrantList(api);
  const checks = await Promise.all(
    items.map(
      (g) =>
        new Promise<boolean>((resolve) => {
          try {
            pm.contains({ origins: [g.origin] }, (ok) => resolve(ok === true));
          } catch {
            resolve(false);
          }
        })
    )
  );
  return items.filter((_, i) => !checks[i]);
}

/** 授权请求（必须由用户手势触发的调用链上发起）：全接受或全拒绝。 */
export function requestGrants(pending: GrantPending[]): Promise<boolean> {
  const pm = perms();
  if (!pm || pending.length === 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      pm.request({ origins: pending.map((g) => g.origin) }, (ok) => resolve(ok === true));
    } catch {
      resolve(false);
    }
  });
}

/** 撤销授权（管理列表入口）：即刻生效（SW contains 硬门），不动预设数据。 */
export function revokeGrants(origins: string[]): Promise<boolean> {
  const pm = perms();
  if (!pm || origins.length === 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      pm.remove({ origins }, (ok) => resolve(ok === true));
    } catch {
      resolve(false);
    }
  });
}

/** 授权确认视图：替换导入视图呈现（同卡片语言），确认按钮即手势源。 */
export function ApiGrantStep({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: GrantPending[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="p-4">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--ui-accent)]" strokeWidth={1.5} />
        <p className="text-xs font-light text-zinc-700 dark:text-zinc-200">该预设声明了网络 API — 导入前请确认授权</p>
      </div>
      <ul className="mb-2.5 space-y-1 rounded-xl bg-zinc-900/[0.04] p-3 dark:bg-white/[0.05]">
        {pending.map((g, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <Globe className="h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
            <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-200">{g.host}</span>
            {g.insecure && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-light text-amber-600 dark:text-amber-400">
                http 明文 · 本地
              </span>
            )}
            {g.name && <span className="truncate font-extralight text-zinc-400 dark:text-zinc-500">{g.name}</span>}
          </li>
        ))}
      </ul>
      <p className="mb-3 px-1 text-[11px] font-extralight leading-relaxed text-zinc-400 dark:text-zinc-500">
        授权经浏览器原生权限弹窗完成（域清单一次性确认）；可随时在浏览器扩展详情页或管理列表撤销。拒绝授权将中止导入。
        所有代理请求在扩展后台逐条复核授权状态，未授权域一律拒绝。
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-normal text-zinc-50 transition-all duration-200 hover:opacity-85 disabled:opacity-30 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {busy ? "等待授权…" : "授权并导入"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full px-3 py-1.5 text-xs font-light text-zinc-500 transition-colors duration-150 hover:bg-zinc-900/5 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
        >
          取消
        </button>
      </div>
    </div>
  );
}
