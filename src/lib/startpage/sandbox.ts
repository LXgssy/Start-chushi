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
  | { kind: "frozen"; key: string; name: string }
  | {
      kind: "settingsSchema";
      scriptKey: string;
      presetName: string;
      schema: PresetSettingsSchema;
    };

/** fx 视觉效果面（v1.1.3）：mount/unmount/subscribe 由 fxHost 执行，
 *  结果经 fxResult 回报沙箱；预设卸载/脚本冻结时挂载与订阅全部回收。
 *  宿主不实现任何具体视觉效果——全部引擎代码住在预设包里（fx.ts 头注）。
 *  设置面（v1.2.0）：settingsDefine/settingsGet 由桥校验与回执，
 *  schema 白名单与持久化工具见 preset-settings.ts。
 *  换材质（v1.7.0）：沙箱侧 chushi.material.apply/reset 是 fx.mount/unmount
 *  的语义薄糖（固定挂载 id "material"），无新增消息类型。 */
import { fxHost } from "./fx";
import { validateSettingSchema, type PresetSettingsSchema } from "./preset-settings";

const FX_OPS = new Set(["fxMount", "fxUnmount", "fxSubscribe", "fxUnsubscribe"]);

/** 消息层 op 名 → fxHost 裸 op 名（fxHost.apply 的 switch 用 mount/unmount/…） */
const FX_OP_MAP: Record<string, string> = {
  fxMount: "mount",
  fxUnmount: "unmount",
  fxSubscribe: "subscribe",
  fxUnsubscribe: "unsubscribe",
};

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
  return `${base}/sandbox.html?v=115`;
}

/** 沙箱页面模式地址（自定义页 overlay 用）：mode=page 下运行时仅充当页面宿主 */
export function sandboxPageSrc(): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH as string | undefined) ?? "";
  return `${base}/sandbox.html?mode=page&v=115`;
}

/** 沙箱小部件模式地址（角落小部件用）：mode=widget 下运行时仅充当部件宿主 */
export function sandboxWidgetSrc(): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH as string | undefined) ?? "";
  return `${base}/sandbox.html?mode=widget&v=115`;
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

  /** 脚本声明的设置面 schema（scriptKey → schema）：settingsGet 回执时供
   *  页面按 schema 校验持久化值；teardown/删除/冻结时随键回收 */
  private settingsSchemas = new Map<string, PresetSettingsSchema>();
  /** 页面注入：读某脚本设置值（页面对象负责 localStorage 与 schema 校验/补默认） */
  settingsProvider:
    | ((scriptKey: string, schema: PresetSettingsSchema | null) => Record<string, number | boolean | string>)
    | null = null;

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

  /** 设置面板变更推送：整组 values 下发给对应脚本（onChange 回调） */
  pushSettingsValues(scriptKey: string, values: Record<string, number | boolean | string>) {
    if (!this.scripts.some((x) => x.key === scriptKey)) return;
    this.post({ type: "settingsPush", scriptKey, values });
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

  /** fxHost 的沙箱推送出口（resize 快照等 host → sandbox 消息） */
  private fxPost = (msg: Record<string, unknown>) => {
    this.post(msg);
  };

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
    fxHost.stop();
    this.settingsSchemas.clear();
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
    const prevKeys = new Set(this.scripts.map((x) => x.key));
    this.teardown();
    this.scripts = scripts;
    /* 不在新脚本列表里的预设：挂载与订阅立即回收（删除预设即还原视觉） */
    for (const k of prevKeys) {
      if (!scripts.some((x) => x.key === k)) {
        fxHost.cleanup(k);
        this.settingsSchemas.delete(k);
      }
    }
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
    fxHost.start(this.fxPost);

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
    fxHost.cleanup(script.key);
    this.settingsSchemas.delete(script.key);
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
      case "settingsDefine": {
        /* 设置面 schema 白名单校验（整体拒绝）：合法则登记并转页面渲染 */
        const key = s(m.scriptKey, 80);
        if (!key || !this.scripts.some((x) => x.key === key)) return;
        const schema = validateSettingSchema(m.schema);
        if (!schema) {
          this.emit({ kind: "error", message: `脚本「${this.current?.name ?? key}」的设置面 schema 校验未通过（已忽略）` });
          return;
        }
        this.settingsSchemas.set(key, schema);
        const presetName = this.scripts.find((x) => x.key === key)?.presetName ?? "";
        this.emit({ kind: "settingsSchema", scriptKey: key, presetName, schema });
        break;
      }
      case "settingsGet": {
        /* 回执持久化值：schema 已随 settingsDefine 登记（消息有序，必然先到） */
        const gk = s(m.scriptKey, 80);
        if (!gk) return;
        const schema = this.settingsSchemas.get(gk) ?? null;
        const values = this.settingsProvider
          ? this.settingsProvider(gk, schema)
          : {};
        this.post({ type: "settingsValues", scriptKey: gk, values });
        break;
      }
      default: {
        if (FX_OPS.has(op)) {
          /* fx 调用可能在 boot 期（脚本顶层）或回调期（onResize）发生：
           * scriptKey 由沙箱闭包携带，宿主校验其确属已注册脚本 */
          const key = s(m.scriptKey, 80);
          if (!key || !this.scripts.some((x) => x.key === key)) return;
          const r = fxHost.apply(key, FX_OP_MAP[op] ?? op, s(m.fxId, 32), typeof m.html === "string" ? m.html : undefined);
          this.post({ type: "fxResult", scriptKey: key, fxId: s(m.fxId, 32), ok: r.ok, message: r.message ?? "" });
        }
        break;
      }
    }
  }
}

/** 全局单例：页面与桥一一对应，避免多实例重复挂 iframe */
export const sandboxBridge = new SandboxBridge();
