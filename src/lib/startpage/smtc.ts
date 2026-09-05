/* 「初始」SMTC 媒体作用面（v1.8.0）—— 系统媒体会话客户端
 *
 * 对端：初始 SMTC 桥（bridge/smtc/，Windows PowerShell + WinRT 零依赖脚本，
 * 双击启动，可选开机自启）。桥在本机 127.0.0.1:20754 暴露 HTTP：
 *   GET  /api/state              → {ok,name,version,track?}（轻量 JSON，
 *                                   track.position 为桥采样时刻快照）
 *   GET  /api/cover?v=<coverRev> → 图片二进制（桥按 coverRev 内存缓存）
 *   POST /api/control            → {cmd: play|pause|toggle|next|prev|seek,
 *                                   position?} → {ok}
 * 本模块 = 宿主内唯一消费方：1s 轮询 + 本地时钟插值出平滑进度；关键签名
 * （连接态/桥版本/标题/歌手/专辑/播放态/来源/时长/封面版本）变化才广播，
 * position 不广播（消费方自行插值，见 smtcPositionNow）。
 *
 * SMTC 是 Windows 系统级媒体会话（System Media Transport Controls）——
 * 网易云/QQ 音乐/Spotify/浏览器视频等任何注册 SMTC 的播放器都会出现；
 * 桥按「网易云优先 → 正在播放的会话 → 第一个会话」选择当前曲。
 *
 * 消费方（两通道同款 chushi.smtc API）：
 *   - 沙箱脚本通道：sandbox.ts 路由 → sandbox.js makeChushi().smtc
 *   - 角落小部件通道：PresetWidgets.tsx 路由 → sandbox.js widgetShim().smtc
 * 端口/协议变更需同步 bridge/smtc/ 与文档（PRESET_DEV.md §12、README）。
 */

export const SMTC_PORT = 20754;
const BASE = `http://127.0.0.1:${SMTC_PORT}`;
const POLL_MS = 1000;
const RETRY_MS = 2600;
const TIMEOUT_MS = 1500;

/** 单条媒体会话快照（宿主对桥 JSON 的白名单归一化产物） */
export interface SmtcTrack {
  /** 来源应用（桥从 AUMID 提取的显示名，如 "CloudMusic"） */
  app: string;
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  /** 桥采样时刻的播放位置（秒） */
  position: number;
  /** 曲目总时长（秒；0 = 会话未提供） */
  duration: number;
  /** 播放速率（插值用；≤0 视作 1） */
  rate: number;
  /** 封面版本（桥按封面内容哈希生成；空串 = 无封面） */
  coverRev: string;
  /** 宿主收到快照的时刻（插值基准） */
  fetchedAt: number;
}

export interface SmtcState {
  /** 本地 SMTC 桥可达 */
  connected: boolean;
  /** 桥版本（如 "1.0.0"） */
  version: string;
  /** 当前媒体会话（null = 桥在线但系统无会话 / 未连接） */
  track: SmtcTrack | null;
  /** 封面 data URL（按 coverRev 缓存；null = 无/未就绪/拉取失败） */
  cover: string | null;
}

/** 控制命令白名单（sandbox/widget 两通道共用同一校验） */
export const SMTC_COMMANDS: ReadonlySet<string> = new Set([
  "play",
  "pause",
  "toggle",
  "next",
  "prev",
  "seek",
]);

/** 播放位置插值：桥快照 position + 本地流逝时间 × 速率（clamp 到时长内） */
export function smtcPositionNow(t: SmtcTrack | null, now = Date.now()): number {
  if (!t) return 0;
  const rate = t.rate > 0 ? t.rate : 1;
  const played = t.playing ? ((now - t.fetchedAt) / 1000) * rate : 0;
  const p = t.position + played;
  if (t.duration > 0) return Math.min(t.duration, Math.max(0, p));
  return Math.max(0, p);
}

/** 桥 JSON track → SmtcTrack（字段白名单 + 数值夹紧；非法输入返回 null） */
function normalizeTrack(raw: unknown): SmtcTrack | null {
  if (typeof raw !== "object" || raw == null) return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
  const str = (v: unknown): string => (typeof v === "string" ? v.slice(0, 200) : "");
  const title = str(o.title);
  // 无标题也无歌手的会话没有展示价值，视作无效
  if (!title && !str(o.artist)) return null;
  return {
    app: str(o.app) || "媒体应用",
    title,
    artist: str(o.artist),
    album: str(o.album),
    playing: o.playing === true,
    position: num(o.position),
    duration: num(o.duration),
    rate: typeof o.rate === "number" && Number.isFinite(o.rate) ? o.rate : 1,
    coverRev: str(o.coverRev).slice(0, 64),
    fetchedAt: Date.now(),
  };
}

/** 关键签名：变化才广播（position/fetchedAt 不参与——插值属消费方职责） */
function stateSig(s: { connected: boolean; version: string; track: SmtcTrack | null }): string {
  const t = s.track;
  const tpart = t
    ? [t.app, t.title, t.artist, t.album, t.playing ? 1 : 0, t.duration, t.coverRev].join("|")
    : "none";
  return `${s.connected ? 1 : 0}|${s.version}|${tpart}`;
}

class SmtcClient {
  private state: SmtcState = { connected: false, version: "", track: null, cover: null };
  private subs = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private failStreak = 0;
  private lastSig = "0||none";
  /** 已成功取到封面的 coverRev（同版不重拉） */
  private coverRevDone = "";
  private coverTries = 0;

  getSnapshot(): SmtcState {
    return this.state;
  }

  /** 启动轮询（幂等；页面挂载后调用一次即可） */
  start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.schedule(60); // 首拍稍错开挂载帧
  }

  /** 订阅状态变化：订阅即回调一次（消费方拿当前值），返回退订函数 */
  subscribe(cb: () => void): () => void {
    this.subs.add(cb);
    try {
      cb();
    } catch {
      /* 消费方渲染异常不影响轮询 */
    }
    return () => {
      this.subs.delete(cb);
    };
  }

  /** 媒体控制（cmd 须已在 SMTC_COMMANDS 白名单内；seek 附 position 秒） */
  async control(cmd: string, position?: number): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const r = await fetch(`${BASE}/api/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(position == null ? { cmd } : { cmd, position }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const j = (await r.json().catch(() => null)) as { ok?: boolean } | null;
      return j?.ok === true;
    } catch {
      return false;
    }
  }

  /* ---------- 内部 ---------- */

  private schedule(ms: number): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = setTimeout(this.tick, ms);
  }

  private tick = async (): Promise<void> => {
    let next = POLL_MS;
    try {
      const j = await this.fetchJson(`${BASE}/api/state`);
      if (!j || j.ok !== true || j.name !== "chushi-smtc-bridge") {
        throw new Error("not-chushi-smtc-bridge");
      }
      this.failStreak = 0;
      this.apply({
        connected: true,
        version: typeof j.version === "string" ? j.version.slice(0, 16) : "",
        track: normalizeTrack(j.track),
      });
    } catch {
      this.failStreak++;
      // 连续 2 次失败才判定桥离线（避免单次网络抖动把 UI 打成离线态）
      if (this.failStreak >= 2 && (this.state.connected || this.state.track)) {
        this.apply({ connected: false, version: "", track: null });
      }
      next = RETRY_MS;
    }
    this.schedule(next);
  };

  private apply(next: { connected: boolean; version: string; track: SmtcTrack | null }): void {
    const sig = stateSig(next);
    const prevCover = this.state.cover;
    const coverRevNow = next.track?.coverRev ?? "";
    this.state = { ...next, cover: prevCover };
    // 封面失效场景：曲变（coverRev 换了）/ 会话消失 / 会话无封面
    if (!coverRevNow) {
      if (prevCover) {
        this.state = { ...this.state, cover: null };
        this.coverRevDone = "";
        this.coverTries = 0;
      }
    } else if (coverRevNow !== this.coverRevDone) {
      this.state = { ...this.state, cover: null };
      this.coverTries = 0;
      void this.fetchCover(coverRevNow);
    }
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.notify();
    } else if (prevCover !== this.state.cover) {
      // 封面异步到位也广播（签名未变）
      this.notify();
    }
  }

  private async fetchCover(rev: string): Promise<void> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${BASE}/api/cover?v=${encodeURIComponent(rev)}`, {
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error ?? new Error("read-error"));
        fr.readAsDataURL(blob);
      });
      this.coverRevDone = rev;
      this.coverTries = 0;
      if (this.state.track?.coverRev === rev) {
        this.state = { ...this.state, cover: url };
        this.notify();
      }
    } catch {
      this.coverTries++;
      if (this.coverTries <= 3) {
        const revNow = this.state.track?.coverRev ?? "";
        if (revNow === rev) {
          setTimeout(() => {
            if (this.state.track?.coverRev === rev) void this.fetchCover(rev);
          }, 1200 * this.coverTries);
        }
      }
    }
  }

  private fetchJson(url: string): Promise<Record<string, unknown> | null> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return fetch(url, { signal: ctrl.signal })
      .then((r) => r.json())
      .catch(() => null)
      .finally(() => clearTimeout(t)) as Promise<Record<string, unknown> | null>;
  }

  private notify(): void {
    for (const cb of this.subs) {
      try {
        cb();
      } catch {
        /* 单消费方异常不影响其余 */
      }
    }
  }
}

/** 全局单例：页面 / 沙箱桥 / 小部件层共用同一份轮询与缓存 */
export const smtc = new SmtcClient();
