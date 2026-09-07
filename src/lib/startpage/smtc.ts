/* ============================================================================
 * 「初始」本地媒体数据面客户端 v5.0.0（第五代，全新实现）
 *
 * 架构律（用户三条硬性指令的宿主侧表达）：
 *   1. 单真值直显——引擎 /api/state 里的 ne（插件B从网易云读到的真值）是唯一
 *      数据源：一次年龄补偿后原样成曲目，本文件零仲裁、零守卫、零二次加工。
 *   2. 控制只下发——seek/播放控制 POST 给引擎命令队列，由插件B在网易云元素层
 *      单次执行；宿主不碰网易云任何内部状态。
 *   3. 诚实归因——引擎不可达/引擎过旧/插件缺失/版本过旧/拖动未生效，一律以
 *      状态字段如实上报，由面板芯片渲染，绝不静默假装成功。
 *
 * 公开面（消费方 page.tsx / PresetWidgets / sandbox.ts / 预设脚本依赖）：
 *   SMTC_PORT / SmtcTrack / SmtcState / SmtcLyric / SMTC_COMMANDS /
 *   smtcPositionNow / smtc（单例：start/onTick/subscribe/getSnapshot/control）
 * ==========================================================================*/

/** 引擎固定回环端口（插件A/插件B/宿主三方一致，改端口须三处同步） */
export const SMTC_PORT = 26801;

const BASE = `http://127.0.0.1:${SMTC_PORT}`;
const POLL_MS = 1000;
const RETRY_MS = 2600;
const TIMEOUT_MS = 1500;
const ENGINE_NAME = "chushi-smtc-engine";
const ENGINE_VER_MIN = "5.0.0";
const PLUGIN_VER_MIN = "5.0.0";
const TRUTH_STALE_SEC = 6;

/** 单条媒体快照（真值直显产物） */
export interface SmtcTrack {
  /** 来源应用（v5 恒为网易云插件真值源） */
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
  /** 兼容字段：v5 无二进制封面，恒空串 */
  coverRev: string;
  /** 宿主收到快照的时刻（插值基准） */
  fetchedAt: number;
}

/** 客户端对外状态（公开面，预设脚本经 chushi.music 消费） */
export interface SmtcState {
  connected: boolean;      // 本地引擎可达且版本达标
  version: string;         // 引擎自报版本
  track: SmtcTrack | null; // null = 未连接 / 无真值
  cover: string | null;    // 兼容字段：恒 null（封面走 coverUrl）
  coverUrl: string | null; // 封面 https URL（插件真值）
  lyric: SmtcLyric | null;
  lyricRev: string;        // 歌词版本（变化即重拉）
  pluginVer: string;       // 网易云API插件版本（ne.v 心跳；空串 = 不在场）
  smtcVer: string;         // SMTC Manager 插件版本（mgr 心跳；空串 = 未注册）
  seekNote: string;        // seek 结果提示（自动消失）
  needsUpdate: boolean;    // needsPlugin || needsBridge
  needsPlugin: boolean;    // 网易云API插件缺失/过旧
  needsBridge: boolean;    // 引擎不可达或引擎过旧
  engineOld: boolean;      // 引擎在场但版本低于要求（芯片区分文案）
}

/** 歌词载荷（引擎缓存转发，插件B产物） */
export interface SmtcLyric {
  songId: number;
  title: string;
  artist: string;
  /** 逐字歌词原文（括号时间轴 + JSON 版权头行；空 = 无逐字） */
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

/** 控制命令白名单 */
export const SMTC_COMMANDS: ReadonlySet<string> = new Set([
  "play", "pause", "toggle", "next", "prev", "seek",
]);

/** 消费方插值：快照锚点 + 本地时钟推算此刻位置（不写回快照） */
export function smtcPositionNow(t: SmtcTrack | null, now = Date.now()): number {
  if (!t) return 0;
  const rate = t.rate > 0 ? t.rate : 1;
  const played = t.playing ? ((now - t.fetchedAt) / 1000) * rate : 0;
  const p = t.position + played;
  if (t.duration > 0) return Math.min(t.duration, Math.max(0, p));
  return Math.max(0, p);
}

/* ---------------------------------------------------------------------- */
/* 内部工具（v5 全新命名与实现）                                            */
/* ---------------------------------------------------------------------- */

function semverLt(a: string, b: string): boolean {
  const pa = String(a).split(".");
  const pb = String(b).split(".");
  for (let i = 0; i < 3; i++) {
    const na = parseInt(pa[i] ?? "0", 10) || 0;
    const nb = parseInt(pb[i] ?? "0", 10) || 0;
    if (na !== nb) return na < nb;
  }
  return false;
}

function clipStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function clipNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
}

/** 引擎透传的 ne 字段清洗（白名单 + 截断；无标题且无位置判无效） */
function cleanNe(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = clipStr(o.title, 200);
  const position = clipNum(o.position);
  if (!title && !(position > 0)) return null;
  const pic = /^https:\/\//.test(clipStr(o.pic, 500)) ? clipStr(o.pic, 500) : "";
  return {
    songId: clipNum(o.songId),
    title,
    artist: clipStr(o.artist, 200),
    album: clipStr(o.album, 200),
    pic,
    position,
    duration: clipNum(o.duration),
    playing: o.playing === true,
    ts: clipNum(o.ts),
    v: clipStr(o.v, 16),
    seekAckId: clipStr(o.seekAckId, 40),
    seekAckOk: o.seekAckOk === true,
    seekAckAt: clipNum(o.seekAckAt),
  };
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------- */
/* 客户端                                                                  */
/* ---------------------------------------------------------------------- */

type Cb = () => void;

class SmtcClient {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;

  private failStreak = 0;
  private lastSig = "";

  /** 歌词拉取状态：wanted 曲目键 / 进行中标记 / 重试计数 */
  private lyricWanted = "";
  private lyricBusy = false;
  private lyricTries = 0;
  private lyricRevDone = "";

  private seekNote = "";
  private seekNoteAt = 0;

  private cbs: Cb[] = [];
  private tickCbs: Cb[] = [];

  private state: SmtcState = {
    connected: false,
    version: "",
    track: null,
    cover: null,
    coverUrl: null,
    lyric: null,
    lyricRev: "",
    pluginVer: "",
    smtcVer: "",
    seekNote: "",
    needsUpdate: true,
    needsPlugin: false,
    needsBridge: true,
    engineOld: false,
  };

  /** 完整状态只读出口（公开面） */
  getSnapshot(): SmtcState {
    return this.state;
  }

  /** 订阅状态变化（签名变化才回调；订阅即推一次） */
  subscribe(cb: Cb): () => void {
    if (typeof cb !== "function") return () => { };
    this.cbs.push(cb);
    try { cb(); } catch { /* 单订阅方异常互不干扰 */ }
    return () => {
      const i = this.cbs.indexOf(cb);
      if (i >= 0) this.cbs.splice(i, 1);
    };
  }

  /** 每拍回调（轮询成功即发，无论签名变化——插值漂移校正靠它） */
  onTick(cb: Cb): () => void {
    if (typeof cb !== "function") return () => { };
    this.tickCbs.push(cb);
    return () => {
      const i = this.tickCbs.indexOf(cb);
      if (i >= 0) this.tickCbs.splice(i, 1);
    };
  }

  /** 控制下发（白名单外拒绝；HTTP ok 即视为排队成功） */
  async control(cmd: string, position?: number): Promise<boolean> {
    if (!SMTC_COMMANDS.has(cmd)) return false;
    const body: Record<string, unknown> = { cmd };
    if (cmd === "seek" && typeof position === "number" && Number.isFinite(position)) {
      body.position = Math.max(0, Math.min(86400, position));
    }
    try {
      const r = await fetch(`${BASE}/api/cmd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as Record<string, unknown>;
      const ok = j?.ok === true;
      if (ok && cmd === "seek") {
        this.seekNote = "";
        this.schedule(80);
      }
      return ok;
    } catch {
      return false;
    }
  }

  /** 启动轮询（幂等；SSR 守卫） */
  start() {
    if (typeof window === "undefined") return;
    if (this.timer || this.busy) return;
    this.schedule(60);
  }

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.beat();
    }, delay);
  }

  private notify() {
    for (const cb of this.cbs) {
      try { cb(); } catch { /* 互不干扰 */ }
    }
  }

  private tick() {
    for (const cb of this.tickCbs) {
      try { cb(); } catch { /* 互不干扰 */ }
    }
  }

  private goOffline() {
    this.state = {
      ...this.state,
      connected: false,
      track: null,
      cover: null,
      coverUrl: null,
      lyric: null,
      lyricRev: "",
      pluginVer: "",
      needsUpdate: true,
      needsBridge: true,
      engineOld: false,
    };
    this.lyricRevDone = "";
    this.lastSig = "";
    this.notify();
  }

  private async beat() {
    if (this.busy) return;
    this.busy = true;
    try {
      const j = await getJson(`${BASE}/api/state`);
      if (!j || j.ok !== true || j.name !== ENGINE_NAME) throw new Error("engine-not-chushi");
      const version = clipStr(j.version, 16) || "0.0.0";
      const engineOld = semverLt(version, ENGINE_VER_MIN);
      const ne = cleanNe(j.ne);
      const mgr = clipStr(j.mgr, 16);

      /* 引擎在场但过旧 → needsBridge（插件A会在 15s 内自动升级引擎） */
      const needsBridge = engineOld;
      const pluginVerNow = ne ? ne.v : "";
      const needsPlugin = !pluginVerNow || semverLt(pluginVerNow, PLUGIN_VER_MIN);

      /* 真值直显：一次性年龄补偿（插件采样时刻 → 此刻），fetchedAt 接管插值 */
      const now = Date.now();
      let track: SmtcTrack | null = null;
      let coverUrl: string | null = null;
      if (ne) {
        const age = ne.ts > 0
          ? Math.max(0, Math.min(TRUTH_STALE_SEC, (now - ne.ts) / 1000))
          : 0;
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
        coverUrl = ne.pic || null;
      }

      /* seekAck 诚实提示（插件B读回校验失败的回执） */
      if (ne && ne.seekAckId && ne.seekAckAt > 0 && now - ne.seekAckAt < 3200 && !ne.seekAckOk) {
        this.seekNote = "拖动未生效：网易云未响应";
        this.seekNoteAt = now;
      }
      if (this.seekNote && now - this.seekNoteAt > 3800) this.seekNote = "";

      const sig = [
        version, engineOld, track ? track.title : "", track ? track.artist : "",
        track ? track.album : "", track ? track.playing : false,
        track ? track.duration : 0, coverUrl || "", this.seekNote,
        pluginVerNow, mgr, needsPlugin, needsBridge,
      ].join("|");

      this.state = {
        connected: true,
        version,
        track,
        cover: null,
        coverUrl,
        lyric: this.state.lyric,
        lyricRev: this.state.lyricRev,
        pluginVer: pluginVerNow,
        smtcVer: mgr,
        seekNote: this.seekNote,
        needsUpdate: needsPlugin || needsBridge,
        needsPlugin,
        needsBridge,
        engineOld,
      };

      if (sig !== this.lastSig) {
        this.lastSig = sig;
        this.notify();
      }
      this.tick();

      this.pullLyric(ne);
      this.schedule(ne ? POLL_MS : POLL_MS);
    } catch {
      this.failStreak++;
      if (this.failStreak >= 2) this.goOffline();
      this.schedule(RETRY_MS);
    } finally {
      this.busy = false;
    }
  }

  /* 歌词：按曲目键拉取（latest-wins + 有限重试），成功后签名广播 */
  private pullLyric(ne: ReturnType<typeof cleanNe>) {
    const wanted = ne && ne.title ? `${ne.songId}` : "";
    if (wanted !== this.lyricWanted) {
      this.lyricWanted = wanted;
      this.lyricTries = 0;
      this.lyricRevDone = wanted ? "" : wanted;
      if (!wanted) {
        if (this.state.lyric) {
          this.state = { ...this.state, lyric: null, lyricRev: "" };
          this.notify();
        }
        return;
      }
    }
    if (!wanted || this.lyricBusy) return;
    if (this.lyricRevDone === wanted) return;
    this.lyricBusy = true;
    const attempt = (): Promise<void> => {
      return getJson(`${BASE}/api/lyric?songId=${encodeURIComponent(this.lyricWanted)}`)
        .then((j) => {
          this.lyricBusy = false;
          if (this.lyricWanted !== wanted) return; /* 曲目已切走 */
          const ly = j && j.lyric && typeof j.lyric === "object"
            ? (j.lyric as Record<string, unknown>) : null;
          const yrc = clipStr(ly?.yrc, 200000);
          const lrc = clipStr(ly?.lrc, 200000);
          if (j?.ok === true && ly && (yrc || lrc)) {
            this.lyricTries = 0;
            this.lyricRevDone = wanted;
            const lyric: SmtcLyric = {
              songId: clipNum(ly?.songId),
              title: clipStr(ly?.title, 200),
              artist: clipStr(ly?.artist, 200),
              yrc,
              ytlrc: clipStr(ly?.ytlrc, 200000),
              lrc,
              tlyric: clipStr(ly?.tlyric, 200000),
              source: clipStr(ly?.source, 24),
            };
            this.state = { ...this.state, lyric, lyricRev: clipStr(ly?.rev, 80) || wanted };
            this.lastSig = "";
            this.notify();
          } else {
            this.lyricTries++;
            if (this.lyricTries <= 5) {
              setTimeout(() => {
                if (this.lyricWanted === wanted) {
                  this.lyricBusy = true;
                  attempt().finally(() => { this.lyricBusy = false; });
                }
              }, 1200 * this.lyricTries);
            }
          }
        })
        .catch(() => { this.lyricBusy = false; });
    };
    attempt();
  }
}

/** 全局单例（页面/沙箱桥/部件层共用） */
export const smtc = new SmtcClient();
