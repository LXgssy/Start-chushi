"use client";

/* 「初始」— 设置面板「账号与同步」分区（v8.7.49）
 *
 * 云同步入口 UI：登录/注册（端到端加密账号体系）→ 登录态展示同步状态
 * 与手动动作（推送/拉取/自动同步开关/退出）。加密与协议实现在
 * lib/startpage/sync/*（零知识存储：服务器只存 salt + verifier + 密文）。
 *
 * 服务器由用户自配（热铁盒网页托管部署自己的同步服务，部署包见私有
 * 工作仓），开源仓库不内置任何服务器地址。
 */

import { useEffect, useState } from "react";
import {
  loginAccount,
  logoutAccount,
  pushNow,
  pullNow,
  rebaseFingerprint,
  registerAccount,
} from "@/lib/startpage/sync/engine";
import { SyncApiError } from "@/lib/startpage/sync/api";
import {
  loadSyncSession,
  normalizeServer,
  saveSyncSession,
  type SyncSession,
} from "@/lib/startpage/sync/session";

const INPUT_CLS =
  "h-8 min-w-0 flex-1 rounded-full border border-zinc-900/10 bg-white/40 px-3 text-[11px] font-light text-zinc-700 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900/25 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-white/20";
const BTN_CLS =
  "rounded-full border border-zinc-900/10 px-3.5 py-1.5 text-[11px] font-light tracking-wide text-zinc-600 transition-colors duration-300 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10";

function fmtAt(ms: number): string {
  if (!ms) return "从未同步";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SyncSection() {
  const [session, setSession] = useState<SyncSession | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [server, setServer] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSyncSession();
    setSession(s);
    if (s) setServer(s.server);
  }, []);

  const refresh = () => {
    const s = loadSyncSession();
    setSession(s);
    rebaseFingerprint();
  };

  const submit = async (which: "login" | "register") => {
    setMsg(null);
    const srv = normalizeServer(server);
    if (!srv) {
      setMsg("服务器地址需以 https:// 开头");
      return;
    }
    const uname = user.trim();
    if (uname.length < 2 || uname.length > 32) {
      setMsg("用户名需 2–32 个字符");
      return;
    }
    if (password.length < 6) {
      setMsg("密码至少 6 位（它同时是加密钥匙的根，找回无门，请记牢）");
      return;
    }
    setBusy(true);
    try {
      const input = { server: srv, user: uname, password };
      const r =
        which === "register"
          ? await registerAccount(input)
          : await loginAccount(input);
      refresh();
      setSession(loadSyncSession());
      setPassword("");
      setMsg(
        which === "register"
          ? "注册成功，本机数据已加密上传"
          : r.appliedCloud
            ? "登录成功，已恢复云端数据"
            : "登录成功，云同步已开启"
      );
    } catch (e) {
      setMsg(e instanceof SyncApiError ? e.message : "操作失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const act = async (kind: "push" | "pull" | "logout") => {
    setMsg(null);
    setBusy(true);
    try {
      if (kind === "logout") {
        await logoutAccount();
        setMsg(null);
        refresh();
        return;
      }
      const r = kind === "push" ? await pushNow() : await pullNow();
      setMsg(r.message);
      if (r.ok) refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleAuto = () => {
    if (!session) return;
    const next = { ...session, auto: !session.auto };
    saveSyncSession(next);
    setSession(next);
  };

  return (
    <section>
      <h3 className="mb-1 text-[11px] font-normal uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
        账号与同步
      </h3>

      {!session ? (
        <div className="space-y-2 pb-2 pt-1">
          <div className="flex items-center gap-2">
            <input
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="同步服务器地址（自己部署的同步服务）"
              className={INPUT_CLS}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="用户名"
              className={INPUT_CLS}
              spellCheck={false}
              autoComplete="off"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void submit(mode);
              }}
              placeholder="密码"
              type="password"
              className={INPUT_CLS}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => void submit("login")} className={BTN_CLS}>
              登录
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit("register")}
              className={BTN_CLS}
            >
              注册新账号
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 pb-2 pt-1">
          <div className="flex items-center justify-between gap-4 py-1">
            <span className="text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
              {session.user}
              <span className="ml-2 text-[10px] font-extralight text-zinc-400 dark:text-zinc-500">
                {new URL(session.server).host}
              </span>
            </span>
            <span className="text-[10px] font-extralight tracking-wide text-zinc-400 dark:text-zinc-500">
              云端 {fmtAt(session.updatedAt)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => void act("push")} className={BTN_CLS}>
              立即上传
            </button>
            <button type="button" disabled={busy} onClick={() => void act("pull")} className={BTN_CLS}>
              从云端恢复
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("logout")}
              className="rounded-full border border-zinc-900/10 px-3.5 py-1.5 text-[11px] font-light tracking-wide text-zinc-600 transition-colors duration-300 hover:bg-red-400/10 hover:text-red-500 dark:border-white/10 dark:text-zinc-300 dark:hover:text-red-400"
            >
              退出登录
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 py-1">
            <span className="text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
              自动同步（内容变更后自动上传）
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={session.auto}
              aria-label="自动同步"
              onClick={toggleAuto}
              className={`relative h-[22px] w-[38px] shrink-0 rounded-full border outline-none transition-colors duration-300 ${
                session.auto
                  ? "border-transparent"
                  : "border-zinc-900/15 bg-zinc-900/[0.05] dark:border-white/15 dark:bg-white/[0.08]"
              }`}
              style={session.auto ? { background: "var(--ui-accent, #8b5cf6)" } : undefined}
            >
              <span
                className="absolute left-[3px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-300 dark:bg-zinc-100"
                style={{ transform: session.auto ? "translateX(16px) translateY(-50%)" : "translateY(-50%)" }}
              />
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] font-extralight leading-relaxed tracking-wide text-zinc-400 dark:text-zinc-500">
        {msg
          ? msg
          : "布局、便签、待办、预设等将以端到端加密（AES-256-GCM）同步：密码不上传，服务器只见密文。"}
      </p>
    </section>
  );
}
