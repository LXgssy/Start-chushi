/* 「初始」× 网易云音乐 本地桥接客户端
 *
 * 对端：初始音乐桥·独立版（ChuShiBridge.exe，CEF 调试协议方案，不依赖 BetterNCM 框架）
 *       旧对端：BetterNCMII 插件 + bridge.dll（v1.7.5 路线，协议完全兼容）
 *   GET  /api/ping     → {"ok":true,"name":"chushi-music-bridge","version":...}
 *   GET  /api/status   → MusicSnapshot（对端无快照时 503）
 *   POST /api/control  → {"action":"play"|"pause"|"toggle"|"next"|"prev"
 *                         |"seek","positionMs":ms} | {"action":"volume","volume":0-1}
 *                         | {"action":"mute"}
 * 轮询协议（1s 拉快照 + 本地时钟插值），不用长连接——
 * EventSource/fetch 流在 https→localhost 场景下受 LNA/混合内容策略影响面更大，
 * 短请求重试语义最简单可靠。 */

export interface MusicSong {
  id: number | string;
  name: string;
  artists: string[];
  album?: string;
  /** 封面直链（插件侧已升 https + 500y500 裁切参数；可能为空） */
  cover?: string;
  durationMs: number;
  local?: boolean;
}

export interface MusicSnapshot {
  v: number;
  ts: number;
  client: string;
  song: MusicSong | null;
  playing: boolean;
  positionMs: number;
  volume: number | null;
  mode?: string;
}

export type MusicStatus = "idle" | "connecting" | "connected" | "error";

/** /api/debug 诊断（bridge.dll 1.1.0+ 提供；独立版字段形状不同，容忍缺失） */
export interface MusicBridgeDiag {
  v?: string;
  ts?: number;
  installedAt?: number;
  storeReady?: boolean;
  eventsHooked?: boolean;
  getPlayingSong?: boolean;
  media?: boolean;
  href?: string;
}

export interface MusicBridgeDebug {
  ok?: boolean;
  version?: string;
  native?: string;
  port?: number;
  stateFile?: boolean;
  stateAgeMs?: number;
  diag?: MusicBridgeDiag;
}

/** 连接失败原因分类（面板按此给指引文案） */
export type MusicFailReason =
  | "refused" // 连不上（服务没起来：NCM 没开/插件未装）
  | "blocked" // 请求被浏览器安全策略拦截（混合内容 / 本地网络权限）
  | "bad" // 服务在但返回异常
  | "unknown";

export const DEFAULT_MUSIC_URL = "http://127.0.0.1:10754";

/** 端口自动发现候选（按序探测）。
 *  背景：插件设置页可改「服务端口」（写 config.json，重启网易云生效），
 *  改完面板不知道就会敲旧端口 → 永远连不上。探测目标必须过
 *  /api/ping 的 name=chushi-music-bridge 精确校验，不会误认别的本地服务。 */
export const MUSIC_PORT_CANDIDATES = [10754, 8008] as const;

export function candidateMusicUrls(): string[] {
  return MUSIC_PORT_CANDIDATES.map((p) => `http://127.0.0.1:${p}`);
}

/** 规范化用户输入的桥接地址：补协议、去尾斜杠、限 http(s) */
export function normalizeMusicUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return DEFAULT_MUSIC_URL;
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return DEFAULT_MUSIC_URL;
    /* ⚠ 不能回写 parsed.pathname（赋 "" 会被 URL 语义重置回 "/"，产生 //api/ 双斜杠） */
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${path}`;
  } catch {
    return DEFAULT_MUSIC_URL;
  }
}

interface PendingControl {
  action: string;
  positionMs?: number;
  volume?: number;
}

export class MusicBridgeClient {
  private url = DEFAULT_MUSIC_URL;
  private timer: ReturnType<typeof setInterval> | null = null;
  private failStreak = 0;
  private started = false;
  /** 最新快照（面板渲染源；ts 用于本地插值） */
  private snap: MusicSnapshot | null = null;

  constructor(
    private opts: {
      onSnapshot: (s: MusicSnapshot | null) => void;
      onStatus: (status: MusicStatus, reason?: MusicFailReason) => void;
      /** 自动发现命中了与请求不同的地址时回调（面板据此持久化，v1.7.8） */
      onAdopted?: (url: string) => void;
    }
  ) {}

  get currentUrl(): string {
    return this.url;
  }

  /** 最新快照 */
  getSnapshot(): MusicSnapshot | null {
    return this.snap;
  }

  /** 本地插值后的当前进度（ms）：播放中按快照 ts 外推，封顶曲长 */
  getPositionMs(): number {
    const s = this.snap;
    if (!s) return 0;
    const drift = s.playing ? Math.max(0, Date.now() - s.ts) : 0;
    let pos = s.positionMs + drift;
    if (s.song && s.song.durationMs > 0 && pos > s.song.durationMs) pos = s.song.durationMs;
    return pos;
  }

  async connect(url: string) {
    this.url = normalizeMusicUrl(url);
    this.started = true;
    this.failStreak = 0;
    this.opts.onStatus("connecting");
    let ok = await this.probeUrl(this.url);
    if (!ok) {
      /* 请求的地址不通 → 按候选端口自动扫描（用户改过插件端口时自救） */
      ok = await this.scanCandidates();
    }
    if (ok) {
      this.startPolling();
    } else {
      this.opts.onStatus("error", this.lastReason);
    }
  }

  /** 依序探测候选端口；命中即换址并通知面板记住（v1.7.8） */
  private async scanCandidates(): Promise<boolean> {
    for (const c of candidateMusicUrls()) {
      const u = normalizeMusicUrl(c);
      if (u === this.url) continue; // 刚失败过的地址不重复敲
      const ok = await this.probeUrl(u);
      if (ok) {
        this.url = u;
        this.opts.onAdopted?.(u);
        return true;
      }
    }
    return false;
  }

  disconnect() {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.snap = null;
    this.opts.onSnapshot(null);
    this.opts.onStatus("idle");
  }

  private lastReason: MusicFailReason = "unknown";

  /** 探测指定地址：区分「服务没起」与「被浏览器拦截」 */
  private async probeUrl(url: string): Promise<boolean> {
    this.lastReason = "unknown";
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(`${url}/api/ping`, { signal: ctl.signal, mode: "cors" });
      clearTimeout(t);
      if (!r.ok) {
        this.lastReason = "bad";
        return false;
      }
      const j = await r.json();
      if (!j || j.ok !== true || j.name !== "chushi-music-bridge") {
        this.lastReason = "bad";
        return false;
      }
      return true;
    } catch (e) {
      /* fetch 失败：TypeError 多为网络层（连接拒绝）或策略拦截。
         混合内容/LNA 拦截与连接拒绝在 JS 侧不可靠区分，给面板双提示。 */
      this.lastReason =
        e instanceof DOMException && e.name === "AbortError" ? "refused" : classifyFetchError();
      return false;
    }

    function classifyFetchError(): MusicFailReason {
      /* 保守归类：按「服务未启动」给主文案，拦截类给副提示 */
      return "refused";
    }
  }

  private startPolling() {
    if (this.timer) clearInterval(this.timer);
    this.opts.onStatus("connected");
    void this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), 1000);
  }

  private async pollOnce() {
    try {
      const r = await fetch(`${this.url}/api/status`, { mode: "cors" });
      if (!r.ok) {
        /* 503 = 服务在、状态文件还没写（NCM 刚启动未播放）→ 空态而非错误 */
        if (r.status === 503) {
          this.failStreak = 0;
          const empty: MusicSnapshot = {
            v: 1,
            ts: Date.now(),
            client: "netease-music",
            song: null,
            playing: false,
            positionMs: 0,
            volume: null,
          };
          this.snap = empty;
          this.opts.onSnapshot(empty);
          return;
        }
        throw new Error(`status ${r.status}`);
      }
      const j = (await r.json()) as MusicSnapshot;
      if (!j || typeof j !== "object" || !("playing" in j)) throw new Error("bad snapshot");
      this.failStreak = 0;
      this.snap = j;
      this.opts.onSnapshot(j);
    } catch {
      this.failStreak += 1;
      if (this.failStreak >= 3) {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        this.opts.onStatus("error", "refused");
        /* 保持低频探测，服务恢复自动重连 */
        setTimeout(() => {
          if (!this.started) return;
          void (async () => {
            let ok = await this.probeUrl(this.url);
            if (!ok) ok = await this.scanCandidates(); // 服务换了端口也能跟过去
            if (ok) this.startPolling();
            else this.opts.onStatus("error", this.lastReason);
          })();
        }, 5000);
      }
    }
  }

  /** 发送控制命令（乐观调用；快照回流驱动 UI 校正） */
  async control(a: PendingControl) {
    try {
      await fetch(`${this.url}/api/control`, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
    } catch {
      /* 失败静默：下一次轮询会反映真实状态 */
    }
  }

  /** 拉取诊断（/api/debug；旧版桥或连接中断时返回 null） */
  async debug(): Promise<MusicBridgeDebug | null> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(`${this.url}/api/debug`, { signal: ctl.signal, mode: "cors" });
      clearTimeout(t);
      if (!r.ok) return null;
      const j = (await r.json()) as MusicBridgeDebug;
      return j && typeof j === "object" ? j : null;
    } catch {
      return null;
    }
  }
}

/* ---------- 工具 ---------- */

export function fmtTime(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
