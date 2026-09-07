/* 「初始」音乐作用面（v4.0.0）—— 单真值直显引擎（v4 代，从零重写）
 *
 * v4 架构（用户指令：不许复用老代码 / 不依赖网易云自带 SMTC / 插件全英文）：
 *   [引擎 chushi-smtc-engine.ps1]（bridge/engine/，Windows PowerShell + WinRT）
 *     - 自有「满血」SMTC 会话（媒体键/悬浮窗卡片/可拖进度/锁屏），AUMID ChuShi.SmtcEngine
 *     - 绝不读取任何外部 SMTC 会话——网易云设置里的 SMTC 开关开或关都不影响
 *     - 本机 127.0.0.1:26801 暴露 HTTP（全部端点带 CORS）：
 *         GET  /api/state              → {ok,ver,mgr,ne?,smtc}
 *         GET  /api/lyric?songId=      → {ok,rev,lyric}
 *         POST /api/cmd                → {cmd,position?}（本模块唯一控制入口）
 *     - ne = 网易云API 插件 1Hz 推送的真值（songId/秒制 position/duration/playing/
 *       元数据/封面 https URL/seekAck），6s 断供即视为离线
 *   [ChuShi SMTC Manager 插件] 部署/监督引擎（SHA-256 读回校验 + 杀旧 + 退避）
 *   [ChuShi Music API 插件]   网易云内只读观察 + 元素级控制 + 全量歌词
 *
 * 本模块职责：轮询 /api/state，把 ne 原样转成面板曲目（一次性年龄补偿后交给
 * fetchedAt 插值）——零仲裁零守卫零混合。真值只有一个来源（插件），引擎只搬运，
 * 本模块只显示。任何"再加一层修正"都是 v2.x 三层互打复辟，禁止。
 *
 * 消费方（两通道同款 chushi.music / chushi.smtc API）：
 *   - 沙箱脚本通道：sandbox.ts 路由 → sandbox.js makeChushi()
 *   - 角落小部件通道：PresetWidgets.tsx 路由 → sandbox.js widgetShim()
 * 协议变更需同步 bridge/engine/ 与文档（PRESET_DEV.md、README）。
 */

export const SMTC_PORT = 26801;
const BASE = `http://127.0.0.1:${SMTC_PORT}`;
const POLL_MS = 1000;
const RETRY_MS = 2600;
const TIMEOUT_MS = 1500;
const ENGINE_NAME = "chushi-smtc-engine";
const ENGINE_VER_MIN = "4.0.0";
const PLUGIN_VER_MIN = "3.0.0";
const NE_STALE_MS = 6000;

/** 单条媒体会话快照（宿主对引擎 ne 真值的白名单产物） */
export interface SmtcTrack {
  /** 来源应用（v4 固定为网易云插件真值源） */
  app: string;
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  /** 引擎采样时刻的播放位置（秒，含年龄补偿） */
  position: number;
  /** 曲目总时长（秒；0 = 未知） */
  duration: number;
  /** 播放速率（插值用；≤0 视作 1） */
  rate: number;
  /** 兼容字段：v4 无二进制封面，恒空串 */
  coverRev: string;
  /** 宿主收到快照的时刻（插值基准） */
  fetchedAt: number;
}

export interface SmtcState {
  /** 本地 SMTC 引擎可达 */
  connected: boolean;
  /** 引擎版本（如 "4.0.0"） */
  version: string;
  /** 当前曲目（null = 引擎在线但无真值 / 未连接） */
  track: SmtcTrack | null;
  /** 兼容字段：v4 恒 null（封面直接用 coverUrl） */
  cover: string | null;
  /** 封面 https URL（网易云插件提供） */
  coverUrl: string | null;
  /** 当前曲目歌词（null = 无歌词源/未就绪） */
  lyric: SmtcLyric | null;
  /** 歌词版本（引擎生成，变化即重拉） */
  lyricRev: string;
  /** 网易云API 插件版本（ne.v 心跳；空串 = 插件不在场） */
  pluginVer: string;
  /** SMTC Manager 插件自报版本（引擎 /api/state.mgr 活体上报）；空串 = 未注册 */
  smtcVer: string;
  /** seek 结果提示（空串 = 无；「拖动未生效…」≈3.8s 后自动消失） */
  seekNote: string;
  /** 组件不齐（面板显示升级芯片）：needsPlugin || needsBridge */
  needsUpdate: boolean;
  /** 网易云API 插件缺失/版本过旧（装/更新 .plugin 即修） */
  needsPlugin: boolean;
  /** 引擎不可达（装 Manager 插件自动管理 或 手动启动引擎） */
  needsBridge: boolean;
}

/** 歌词载荷（引擎 /api/lyric 白名单产物；文本字段已截断） */
export interface SmtcLyric {
  songId: number;
  title: string;
  artist: string;
  /** 逐字歌词（yrc 原文；空 = 无逐字） */
  yrc: string;
  /** 逐字歌词翻译（ytlrc；空 = 无） */
  ytlrc: string;
  /** 行级歌词（lrc 原文） */
  lrc: string;
  /** 行级翻译（tlyric；空 = 无） */
  tlyric: string;
  /** 来源标记（eapi-yrc / eapi-klyric / eapi-lrc / channel-lrc / direct-lrc） */
  source: string;
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

/** 播放位置插值：快照 position + 本地流逝时间 × 速率（clamp 到时长内） */
export function smtcPositionNow(t: SmtcTrack | null, now = Date.now()): number {
  if (!t) return 0;
  const rate = t.rate > 0 ? t.rate : 1;
  const played = t.playing ? ((now - t.fetchedAt) / 1000) * rate : 0;
  const p = t.position + played;
  if (t.duration > 0) return Math.min(t.duration, Math.max(0, p));
  return Math.max(0, p);
}

/** 引擎 JSON ne 字段 → 白名单对象（网易云插件经引擎透传的真值） */
interface NeTruth {
  songId: number;
  title: string;
  artist: string;
  album: string;
  pic: string;
  /** 秒（插件采样时刻的精确位置） */
  position: number;
  /** 秒 */
  duration: number;
  playing: boolean;
  ts: number;
  v: string;
  seekAckId: string;
  seekAckOk: boolean;
  seekAckAt: number;
}

function normalizeNe(raw: unknown): NeTruth | null {
  if (typeof raw !== "object" || raw == null) return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
  const str = (v: unknown, max: number): string =>
    typeof v === "string" ? v.slice(0, max) : "";
  const title = str(o.title, 200);
  const hasPosition = typeof o.position === "number";
  if (!title && !hasPosition) return null;
  return {
    songId: num(o.songId),
    title,
    artist: str(o.artist, 200),
    album: str(o.album, 200),
    pic: typeof o.pic === "string" && /^https:\/\//.test(o.pic) ? o.pic.slice(0, 500) : "",
    position: num(o.position),
    duration: num(o.duration),
    playing: o.playing === true,
    ts: num(o.ts),
    v: str(o.v, 16),
    seekAckId: str(o.seekAckId, 40),
    seekAckOk: o.seekAckOk === true,
    seekAckAt: num(o.seekAckAt),
  };
}

/** 语义版本比较（仅 major.minor.patch 数字段） */
function verLt(a: string, b: string): boolean {
  const pa = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

/** 关键签名：变化才广播（position/fetchedAt 不参与——插值属消费方职责） */
function stateSig(s: {
  connected: boolean;
  version: string;
  smtcVer: string;
  track: SmtcTrack | null;
  lyricRev: string;
  pluginVer: string;
  seekNote: string;
  needsPlugin: boolean;
  needsBridge: boolean;
}): string {
  const t = s.track;
  const tpart = t
    ? [t.title, t.artist, t.album, t.playing ? 1 : 0, t.duration, t.coverUrl || ""].join("|")
    : "none";
  return [
    s.connected ? 1 : 0,
    s.version,
    s.smtcVer,
    tpart,
    s.lyricRev,
    s.pluginVer,
    s.seekNote,
    s.needsPlugin ? 1 : 0,
    s.needsBridge ? 1 : 0,
  ].join("|");
}

class SmtcClient {
  private state: SmtcState = {
    connected: false,
    version: "",
    smtcVer: "",
    track: null,
    cover: null,
    coverUrl: null,
    lyric: null,
    lyricRev: "",
    pluginVer: "",
    seekNote: "",
    needsUpdate: false,
    needsPlugin: false,
    needsBridge: false,
  };
  private subs = new Set<() => void>();
  private tickSubs = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private failStreak = 0;
  private lastSig = "";
  /** 已拉取的歌词 rev（同版不重拉） */
  private lyricRevDone = "";
  private lyricInflight = false;
  private lyricTries = 0;
  private lyricWanted = "";
  /** seek 结果提示（3.8s 自动消失） */
  private seekNote = "";
  private seekNoteAt = 0;

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

  /**
   * 每拍锚点订阅：轮询成功后必发（无论签名是否变化）。
   * 消费方转发轻量 tick {position,duration,playing,rate,fetchedAt} 给部件——
   * seek 后的新位置、插值漂移校正都靠它到达。 */
  onTick(cb: () => void): () => void {
    this.tickSubs.add(cb);
    return () => {
      this.tickSubs.delete(cb);
    };
  }
  private notifyTick(): void {
    for (const cb of this.tickSubs) {
      try {
        cb();
      } catch {
        /* 单消费方异常不影响其余 */
      }
    }
  }

  /** 媒体控制（cmd 须已在 SMTC_COMMANDS 白名单内；seek 附 position 秒）。
   *  控制流：宿主 → 引擎 /api/cmd → 队列 → 插件元素级执行 → 真值回推确认。
   *  成功后 80ms 内补一拍（按钮图标最迟零点几秒内翻转）。 */
  async control(cmd: string, position?: number): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const r = await fetch(`${BASE}/api/cmd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(position == null ? { cmd } : { cmd, position }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const j = (await r.json().catch(() => null)) as { ok?: boolean } | null;
      const ok = j?.ok === true;
      if (ok) {
        if (cmd === "seek" && typeof position === "number") {
          this.seekNote = "";
          this.state = { ...this.state, seekNote: "" };
        }
        this.schedule(80); // 立即补一拍，状态快速确认
      }
      return ok;
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
      if (!j || j.ok !== true || j.name !== ENGINE_NAME) {
        throw new Error("not-chushi-smtc-engine");
      }
      this.failStreak = 0;
      const ne = normalizeNe(j.ne);
      const ver = typeof j.version === "string" ? j.version.slice(0, 16) : "";
      const mgr = typeof j.mgr === "string" ? j.mgr.slice(0, 16) : "";
      /* ne 一次性年龄补偿：插件采样时刻 → 此刻；之后由 fetchedAt 插值接管 */
      let track: SmtcTrack | null = null;
      if (ne && ne.title) {
        const now = Date.now();
        const age = ne.ts > 0 ? Math.max(0, Math.min(NE_STALE_MS / 1000, (now - ne.ts) / 1000)) : 0;
        let posSec = ne.position + (ne.playing ? age : 0);
        if (ne.duration > 0 && posSec > ne.duration) posSec = ne.duration;
        track = {
          app: "NetEase Music",
          title: ne.title,
          artist: ne.artist,
          album: ne.album,
          playing: ne.playing,
          position: Math.max(0, posSec),
          duration: ne.duration,
          rate: 1,
          coverRev: "",
          fetchedAt: now,
        };
      }
      /* seekAck 诚实提示：插件实测未生效 → 醒目提示（3.8s 自动消失） */
      if (
        ne &&
        ne.seekAckId &&
        ne.seekAckAt > 0 &&
        Date.now() - ne.seekAckAt < 3200 &&
        ne.seekAckOk === false
      ) {
        this.seekNote = "拖动未生效：网易云未响应";
        this.seekNoteAt = Date.now();
      }
      if (this.seekNote && Date.now() - this.seekNoteAt > 3800) {
        this.seekNote = "";
      }
      const pluginVerNow = ne ? ne.v : "";
      const needsPluginNow = !pluginVerNow || verLt(pluginVerNow, PLUGIN_VER_MIN);
      const needsBridgeNow = false; // 引擎可达才走到这里；不可达在 catch 分支置位
      const needsUpdateNow = needsPluginNow || needsBridgeNow;
      const sig = stateSig({
        connected: true,
        version: ver,
        smtcVer: mgr,
        track,
        lyricRev: ne && ne.title ? `${ne.songId}` : "",
        pluginVer: pluginVerNow,
        seekNote: this.seekNote,
        needsPlugin: needsPluginNow,
        needsBridge: needsBridgeNow,
      });
      const prevLyric = this.state.lyric;
      this.state = {
        connected: true,
        version: ver,
        smtcVer: mgr,
        track,
        cover: null,
        coverUrl: ne && ne.pic ? ne.pic : null,
        lyric: prevLyric,
        lyricRev: ne ? `${ne.songId}` : "",
        pluginVer: pluginVerNow,
        seekNote: this.seekNote,
        needsUpdate: needsUpdateNow,
        needsPlugin: needsPluginNow,
        needsBridge: needsBridgeNow,
      };
      /* 歌词生命周期：songId 变化即重拉；无真值则清空 */
      const wanted = ne && ne.title ? `${ne.songId}` : "";
      if (wanted !== this.lyricRevDone) {
        this.lyricRevDone = wanted;
        this.lyricWanted = wanted;
        this.lyricTries = 0;
        if (wanted) {
          void this.fetchLyric(wanted, ne);
        } else if (prevLyric) {
          this.state = { ...this.state, lyric: null };
        }
      }
      if (sig !== this.lastSig) {
        this.lastSig = sig;
        this.notify();
      }
      this.notifyTick(); // 每拍轻量锚点（seek/漂移校正，与签名无关）
    } catch {
      this.failStreak++;
      // 连续 2 次失败才判定引擎离线（避免单次网络抖动把 UI 打成离线态）
      if (this.failStreak >= 2 && (this.state.connected || this.state.track)) {
        this.state = {
          ...this.state,
          connected: false,
          version: "",
          smtcVer: "",
          track: null,
          coverUrl: null,
          lyric: null,
          lyricRev: "",
          pluginVer: "",
          needsUpdate: true,
          needsPlugin: false,
          needsBridge: true,
        };
        this.lyricRevDone = "";
        this.lastSig = "";
        this.notify();
      }
      next = RETRY_MS;
    }
    this.schedule(next);
  };

  /** 拉取歌词（songId 变化时调用；latest-wins 链式重试，曲目已变则丢弃） */
  private async fetchLyric(songKey: string, ne: NeTruth): Promise<void> {
    this.lyricWanted = songKey;
    if (this.lyricInflight) return; // inflight 完成后会链到最新 wanted
    this.lyricInflight = true;
    try {
      const j = await this.fetchJson(
        `${BASE}/api/lyric?songId=${encodeURIComponent(songKey)}`,
      );
      if (!j || j.ok !== true) throw new Error("no-lyric");
      if (this.state.lyricRev !== songKey) return; // 曲目已变，丢弃
      const l = j.lyric as Record<string, unknown> | null;
      if (!l) throw new Error("bad-lyric");
      const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
      const num = (v: unknown): number =>
        typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
      const lyric: SmtcLyric = {
        songId: num(l.songId),
        title: str(l.title, 200),
        artist: str(l.artist, 200),
        yrc: str(l.yrc, 200000),
        ytlrc: str(l.ytlrc, 200000),
        lrc: str(l.lrc, 200000),
        tlyric: str(l.tlyric, 200000),
        source: str(l.source, 24),
      };
      if (!lyric.yrc && !lyric.lrc) throw new Error("empty-lyric");
      this.lyricTries = 0;
      this.state = { ...this.state, lyric };
      this.notify();
    } catch {
      this.lyricTries++;
      if (this.lyricTries <= 5) {
        setTimeout(() => {
          if (this.lyricWanted === songKey && this.state.lyricRev === songKey) {
            void this.fetchLyric(songKey, ne);
          }
        }, 1200 * this.lyricTries);
      }
    } finally {
      this.lyricInflight = false;
      const wanted = this.lyricWanted;
      if (wanted && wanted !== songKey) void this.fetchLyric(wanted, ne);
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
