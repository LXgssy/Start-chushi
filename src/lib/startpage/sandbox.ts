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
    }
  | { kind: "iconsOverride"; scriptKey: string; presetName: string; map: Record<string, string> }
  | { kind: "themeOverride"; scriptKey: string; presetName: string; groups: { light?: Record<string, string>; dark?: Record<string, string> } }
  | { kind: "cleanup"; scriptKey: string };

/** fx 视觉效果面（v1.1.3）：mount/unmount/subscribe 由 fxHost 执行，
 *  结果经 fxResult 回报沙箱；预设卸载/脚本冻结时挂载与订阅全部回收。
 *  宿主不实现任何具体视觉效果——全部引擎代码住在预设包里（fx.ts 头注）。
 *  设置面（v1.2.0）：settingsDefine/settingsGet 由桥校验与回执，
 *  schema 白名单与持久化工具见 preset-settings.ts。
 *  v1.3.0：fxBackdrop（背景事实数据+位图 transfer）/ fxCanvas（画布
 *  绘制权移交）；图标覆写与主题令牌覆写经事件转交页面（iconsOverride /
 *  themeOverride），回收经 cleanup 事件通知页面。 */
import { fxHost } from "./fx";
import { validateSettingSchema, type PresetSettingsSchema } from "./preset-settings";

const FX_OPS = new Set(["fxMount", "fxUnmount", "fxSubscribe", "fxUnsubscribe"]);

/** 图标覆写：值仅允许 https URL 或 data:image/*（img 渲染不执行 SVG 内脚本） */
const ICON_URL_RE = /^(https:\/\/\S{1,500}|data:image\/(png|jpeg|webp|gif|svg\+xml)[;,][\s\S]{1,102400})$/i;
const ICON_KEY_RE = /^[a-z][a-z0-9-]{0,31}$/i;
const ICON_SLOTS_MAX = 48;

/** 主题令牌白名单（与 globals.css :root/.dark 令牌集同步维护）+ 值格式护栏 */
const THEME_TOKENS = new Set([
  "--ui-accent", "--radius", "--background", "--foreground", "--card", "--card-foreground",
  "--popover", "--popover-foreground", "--primary", "--primary-foreground",
  "--secondary", "--secondary-foreground", "--muted", "--muted-foreground",
  "--accent", "--accent-foreground", "--destructive", "--border", "--input", "--ring",
  "--sidebar", "--sidebar-foreground", "--sidebar-primary", "--sidebar-primary-foreground",
  "--sidebar-accent", "--sidebar-accent-foreground", "--sidebar-border", "--sidebar-ring",
]);
const THEME_VALUE_RE = /^(#[0-9a-fA-F]{3,8}|[a-z()%,0-9 .\/]{1,80})$/i;

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

  private post(msg: Record<string, unknown>, transfer?: Transferable[]) {
    try {
      this.iframe?.contentWindow?.postMessage(msg, "*", transfer ?? []);
    } catch (e) {
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
        this.emit({ kind: "cleanup", scriptKey: k });
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
    this.emit({ kind: "cleanup", scriptKey: script.key });
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
      case "iconsOverride": {
        /* 图标覆写（v1.3.0）：槽位→图片 URL 白名单校验（整体拒绝），
         * 转交页面 FxIcon 渲染；空 map = 清除本脚本全部覆写 */
        const ik = s(m.scriptKey, 80);
        if (!ik || !this.scripts.some((x) => x.key === ik)) return;
        const raw = m.map && typeof m.map === "object" ? m.map : null;
        if (!raw) return;
        const map: Record<string, string> = {};
        let bad = false;
        for (const [k, v] of Object.entries(raw).slice(0, ICON_SLOTS_MAX * 2)) {
          if (
            typeof k === "string" &&
            typeof v === "string" &&
            ICON_KEY_RE.test(k) &&
            ICON_URL_RE.test(v) &&
            Object.keys(map).length < ICON_SLOTS_MAX
          ) {
            map[k] = v;
          } else if (k.length > 0) {
            bad = true;
          }
        }
        if (bad && Object.keys(map).length === 0) {
          this.emit({ kind: "error", message: `脚本「${this.current?.name ?? ik}」的图标覆写校验未通过（仅允许 https/data:image 值）` });
          return;
        }
        const presetName = this.scripts.find((x) => x.key === ik)?.presetName ?? "";
        this.emit({ kind: "iconsOverride", scriptKey: ik, presetName, map });
        break;
      }
      case "themeOverride": {
        /* 主题令牌覆写（v1.3.0）：亮/暗双域令牌白名单校验（整体拒绝）
         * 后转交页面应用（light 组 setProperty，dark 组注入 .dark 样式） */
        const tk = s(m.scriptKey, 80);
        if (!tk || !this.scripts.some((x) => x.key === tk)) return;
        const groupsRaw = m.groups && typeof m.groups === "object" ? m.groups : null;
        if (!groupsRaw) return;
        const groups: { light?: Record<string, string>; dark?: Record<string, string> } = {};
        let themeBad = false;
        for (const domain of ["light", "dark"] as const) {
          const g = groupsRaw[domain];
          if (!g || typeof g !== "object") continue;
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(g).slice(0, 64)) {
            if (typeof k === "string" && typeof v === "string" && THEME_TOKENS.has(k) && THEME_VALUE_RE.test(v) && v.length <= 80) {
              out[k] = v;
            } else {
              themeBad = true;
            }
          }
          if (Object.keys(out).length > 0) groups[domain] = out;
        }
        if (themeBad && Object.keys(groups).length === 0) {
          this.emit({ kind: "error", message: `脚本「${this.current?.name ?? tk}」的主题覆写校验未通过（令牌名或值不合法）` });
          return;
        }
        const presetName = this.scripts.find((x) => x.key === tk)?.presetName ?? "";
        this.emit({ kind: "themeOverride", scriptKey: tk, presetName, groups });
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
        } else if (op === "fxCanvas") {
          /* 占位画布创建（v1.3.0）：宿主建普通 canvas，位图由引擎经
           * fxFrame 持续供给（ImageBitmap 通道，跨内核可靠） */
          const cKey = s(m.scriptKey, 80);
          if (!cKey || !this.scripts.some((x) => x.key === cKey)) return;
          const fxId = s(m.fxId, 32);
          const seq = typeof m.seq === "number" ? m.seq : 0;
          const r = fxHost.attachCanvas(cKey, fxId);
          this.post({ type: "fxCanvas", scriptKey: cKey, fxId, seq, ok: r.ok, message: r.message ?? "" });
        } else if (op === "fxFrame") {
          /* 位图帧上屏（v1.3.0）：引擎本地自绘后交宿主 blit；bitmap 随消息 transfer */
          const fKey = s(m.scriptKey, 80);
          if (!fKey || !this.scripts.some((x) => x.key === fKey)) return;
          const fxId = s(m.fxId, 32);
          const seq = typeof m.seq === "number" ? m.seq : 0;
          const bmp = m.bitmap instanceof ImageBitmap ? m.bitmap : null;
          if (!bmp) {
            this.post({ type: "fxFrameResult", scriptKey: fKey, fxId, seq, ok: false, message: "缺 bitmap" });
            return;
          }
          const w = typeof m.w === "number" ? m.w : bmp.width;
          const h = typeof m.h === "number" ? m.h : bmp.height;
          const r = fxHost.frame(fKey, fxId, bmp, w, h);
          this.post({ type: "fxFrameResult", scriptKey: fKey, fxId, seq, ok: r.ok, message: r.message ?? "" });
        } else if (op === "fxBackdrop") {
          /* 背景事实数据（v1.3.0）：photo 位图随消息 transfer（宿主代取，
           * 沙箱零 CORS/零污染负担）；glow/flat 只给程序化描述 */
          const bKey = s(m.scriptKey, 80);
          if (!bKey || !this.scripts.some((x) => x.key === bKey)) return;
          const seq = typeof m.seq === "number" ? m.seq : 0;
          fxHost.backdrop().then((r) => {
            if (!this.scripts.some((x) => x.key === bKey)) return;
            const transfer: Transferable[] = r.bitmap ? [r.bitmap] : [];
            this.post(
              { type: "fxBackdrop", scriptKey: bKey, seq, ok: r.ok, message: r.message ?? "", desc: r.desc, bitmap: r.bitmap },
              transfer
            );
          });
        }
        break;
      }
    }
  }
}

/** 全局单例：页面与桥一一对应，避免多实例重复挂 iframe */
export const sandboxBridge = new SandboxBridge();
