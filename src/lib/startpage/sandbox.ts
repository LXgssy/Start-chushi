/* 「初始」沙箱 JS 高阶模式 — 宿主侧桥
 *
 * 管理唯一源沙箱 iframe 的完整生命周期：按需创建、逐脚本启动握手、
 * 死循环看门狗、消息路由与白名单复核、调用排队。
 *
 * 安全模型：
 * - iframe 携 sandbox="allow-scripts"（网页版 → 不透明唯一源，读不到主文档/
 *   localStorage/Cookie；扩展版 → manifest sandbox 页，无任何扩展 API）；
 * - 脚本副作用全部经 postMessage 回宿主，宿主复核白名单（open 仅 https、
 *   长度上限、命令数上限）后通过 onEvent 交页面执行；
 * - 宿主不代理网络请求，脚本自行 fetch（受目标站 CORS 约束）；
 * - 逐脚本启动握手 + 4s 看门狗：顶层死循环脚本被标记 frozen 并从启动列
 *   表剔除（ realm 已卡死，销毁 iframe 重建）；父页面持久化冻结标记，
 *   删除预设即恢复。
 */

export interface SandboxScript {
  /** 复合键 `${presetId}:${scriptId}`，桥内唯一 */
  key: string;
  /** 来源预设名（⌘K 命令标注用） */
  presetName: string;
  /** 脚本名（冻结提示用） */
  name: string;
  code: string;
}

export interface SandboxCommandInfo {
  scriptKey: string;
  presetName: string;
  /** 脚本内命令 id（运行时复合键 = `${scriptKey}:${id}`） */
  id: string;
  title: string;
}

export type SandboxEvent =
  | { kind: "commands"; scriptKey: string; commands: SandboxCommandInfo[] }
  | { kind: "notify"; title: string; description?: string }
  | { kind: "open"; url: string }
  | { kind: "copy"; text: string }
  | { kind: "error"; message: string }
  | { kind: "frozen"; key: string; name: string };

const HELLO_TIMEOUT = 8000;
const BOOT_WATCHDOG = 4000;
const CMD_PER_SCRIPT = 12;

const caps = {
  title: 24,
  desc: 60,
  url: 500,
  copy: 200,
};

/** 沙箱页地址：扩展构建无 basePath（扩展根即站点根），Pages 构建带 /Start-chushi 前缀；
 *  ?v= 供部署后冲掉 SW cache-first 旧缓存 */
function sandboxSrc(): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH as string | undefined) ?? "";
  return `${base}/sandbox.html?v=110`;
}

/** 沙箱页面模式地址（自定义页 overlay 用）：mode=page 下运行时仅充当页面宿主 */
export function sandboxPageSrc(): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH as string | undefined) ?? "";
  return `${base}/sandbox.html?mode=page&v=110`;
}

/** 沙箱小部件模式地址（角落小部件用）：mode=widget 下运行时仅充当部件宿主 */
export function sandboxWidgetSrc(): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH as string | undefined) ?? "";
  return `${base}/sandbox.html?mode=widget&v=110`;
}

type Msg = { type?: unknown } & Record<string, unknown>;

const s = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

class SandboxBridge {
  private iframe: HTMLIFrameElement | null = null;
  /** 当前 effective 脚本列表（与 iframe 内注册态保持一致） */
  private scripts: SandboxScript[] = [];
  private signature = "";
  /** 全部脚本 boot 完成后为 true；此前 invoke 一律入队 */
  private booted = false;
  private pendingInvokes: string[] = [];
  /** 待 boot 队列（本轮启动序列剩余部分） */
  private queue: SandboxScript[] = [];
  private current: SandboxScript | null = null;
  private collected: SandboxCommandInfo[] = [];
  private helloTimer: number | null = null;
  private watchdog: number | null = null;
  private listenAttached = false;

  /** 页面注入的事件出口（toast/命令合并/执行副作用）；置 null 即停 */
  onEvent: ((e: SandboxEvent) => void) | null = null;

  /** 同步脚本列表（签名不变则幂等空转；变化则整体重建沙箱） */
  sync(scripts: SandboxScript[]) {
    const sig = JSON.stringify(scripts.map((x) => [x.key, x.code]));
    if (sig === this.signature) return;
    this.signature = sig;
    this.reboot(scripts);
  }

  /** 页面卸载时彻底关停 */
  shutdown() {
    this.teardown();
    this.signature = "";
    if (this.listenAttached) {
      window.removeEventListener("message", this.onMessage);
      this.listenAttached = false;
    }
  }

  /**
   * 触发一个命令（复合键 `${scriptKey}:${cmdId}`）或脚本入口（`${scriptKey}`）。
   * 返回 false 表示沙箱未在运行（无脚本/全部冻结/初始化失败），调用方可提示；
   * 沙箱启动中则入队，就绪后自动补发。
   */
  invoke(id: string): boolean {
    if (!this.iframe) return false;
    if (!this.booted) {
      if (!this.pendingInvokes.includes(id)) this.pendingInvokes.push(id);
      return true;
    }
    this.post({ type: "invoke", id });
    return true;
  }

  /* ---------- 内部 ---------- */

  private emit(e: SandboxEvent) {
    try {
      this.onEvent?.(e);
    } catch {
      /* 页面回调异常不影响桥 */
    }
  }

  private post(msg: Record<string, unknown>) {
    try {
      this.iframe?.contentWindow?.postMessage(msg, "*");
    } catch {
      /* noop */
    }
  }

  private teardown() {
    if (this.helloTimer != null) {
      clearTimeout(this.helloTimer);
      this.helloTimer = null;
    }
    if (this.watchdog != null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    this.booted = false;
    this.queue = [];
    this.current = null;
    this.collected = [];
    this.pendingInvokes = [];
  }

  private reboot(scripts: SandboxScript[]) {
    this.teardown();
    this.scripts = scripts;
    if (typeof window === "undefined" || scripts.length === 0) return;
    if (!this.listenAttached) {
      window.addEventListener("message", this.onMessage);
      this.listenAttached = true;
    }
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("title", "初始沙箱");
    iframe.style.cssText = "display:none;width:0;height:0;border:0";
    iframe.src = sandboxSrc();
    this.iframe = iframe;
    document.body.appendChild(iframe);

    this.queue = [...scripts];
    this.helloTimer = window.setTimeout(() => {
      this.helloTimer = null;
      if (!this.iframe) return;
      this.emit({ kind: "error", message: "沙箱初始化失败，脚本功能本轮未启动" });
      this.teardown();
    }, HELLO_TIMEOUT);
  }

  private onMessage = (e: MessageEvent) => {
    /* 只信当前 iframe 的消息（重建后旧 iframe 的迟到消息自动失效） */
    if (!this.iframe || e.source !== this.iframe.contentWindow) return;
    const m = e.data as Msg | null;
    if (!m || typeof m !== "object" || typeof m.type !== "string") return;

    switch (m.type) {
      case "hello":
        if (this.helloTimer != null) {
          clearTimeout(this.helloTimer);
          this.helloTimer = null;
        }
        this.bootNext();
        break;
      case "ready":
        this.onScriptDone(s(m.scriptKey, 80));
        break;
      case "bootError":
        this.emit({
          kind: "error",
          message: `脚本「${this.current?.name ?? s(m.scriptKey, 80)}」启动失败：${s(m.message, 80)}`,
        });
        this.onScriptDone(s(m.scriptKey, 80));
        break;
      case "api":
        this.onApi(m);
        break;
      case "invokeResult": {
        const ok = m.ok === true;
        if (!ok) {
          this.emit({ kind: "error", message: s(m.message, 100) || "脚本执行失败" });
        }
        break;
      }
      case "runtimeError":
        this.emit({ kind: "error", message: s(m.message, 100) || "脚本运行出错" });
        break;
      default:
        break;
    }
  };

  private bootNext() {
    const next = this.queue.shift();
    if (!next) {
      this.booted = true;
      this.flushPending();
      return;
    }
    this.current = next;
    this.collected = [];
    this.post({ type: "boot", scriptKey: next.key, code: next.code });
    if (this.watchdog != null) clearTimeout(this.watchdog);
    this.watchdog = window.setTimeout(() => this.onWatchdog(next), BOOT_WATCHDOG);
  }

  private onScriptDone(scriptKey: string) {
    if (!this.current || this.current.key !== scriptKey) return;
    if (this.watchdog != null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    if (this.collected.length > 0) {
      this.emit({ kind: "commands", scriptKey, commands: [...this.collected] });
    } else {
      /* 无命令也要清空该脚本旧条目（脚本更新后可能不再注册） */
      this.emit({ kind: "commands", scriptKey, commands: [] });
    }
    this.current = null;
    this.collected = [];
    this.bootNext();
  }

  /** 启动看门狗触发：脚本顶层死循环卡死 realm → 标记冻结、剔除、重建沙箱继续剩余脚本 */
  private onWatchdog(script: SandboxScript) {
    this.watchdog = null;
    this.emit({ kind: "frozen", key: script.key, name: script.name });
    const rest = this.scripts.filter((x) => x.key !== script.key);
    this.signature = JSON.stringify(rest.map((x) => [x.key, x.code]));
    this.reboot(rest);
  }

  private flushPending() {
    if (this.pendingInvokes.length === 0) return;
    const ids = this.pendingInvokes;
    this.pendingInvokes = [];
    for (const id of ids) this.post({ type: "invoke", id });
  }

  /** api 消息：白名单复核后转发页面执行（cmd 记入当前脚本命令集，随 ready 一次性提交） */
  private onApi(m: Msg) {
    const op = typeof m.op === "string" ? m.op : "";
    switch (op) {
      case "cmd": {
        if (!this.current) return;
        if (this.collected.length >= CMD_PER_SCRIPT) return; // 沙箱侧同限，双保险
        const id = s(m.id, 32);
        const title = s(m.title, caps.title);
        if (!id || !title) return;
        this.collected.push({
          scriptKey: this.current.key,
          presetName: this.current.presetName,
          id,
          title,
        });
        break;
      }
      case "notify": {
        const title = s(m.title, caps.title);
        if (!title) return;
        this.emit({ kind: "notify", title, description: s(m.description, caps.desc) || undefined });
        break;
      }
      case "open": {
        const url = s(m.url, caps.url);
        if (!/^https:\/\//i.test(url)) return; // 与声明式 action 同规：仅 https
        try {
          new URL(url);
        } catch {
          return;
        }
        this.emit({ kind: "open", url });
        break;
      }
      case "copy": {
        const text = s(m.text, caps.copy);
        if (!text) return;
        this.emit({ kind: "copy", text });
        break;
      }
      default:
        break;
    }
  }
}

/** 全局单例：页面与桥一一对应，避免多实例重复挂 iframe */
export const sandboxBridge = new SandboxBridge();
