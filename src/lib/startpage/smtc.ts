/* ============================================================================
 * 「初始」音乐面板数据客户端 v6.0.0（第六代，全新实现）
 *
 * 架构律（用户硬性指令的宿主侧表达）：
 *   1. 三插件纯插件架构——第六代起不再有任何外部引擎/后台进程：网易云窗口里
 *      的「ChuShi Music Bridge」插件自建本地数据枢纽（本文件唯一数据源），
 *      「ChuShi SMTC Manager」用 mediaSession 直接持有系统媒体会话，
 *      「ChuShi Lyric Source」按需提供完整逐字歌词。
 *   2. 单真值直显——枢纽 /api/state 里的 ne（桥从网易云读到的真值）是唯一
 *      数据源：一次年龄补偿后原样成曲目，本文件零仲裁、零守卫、零二次加工。
 *   3. 控制只下发——seek/播放控制 POST 给枢纽命令队列，由桥在网易云元素层
 *      单次执行；本文件不碰网易云任何内部状态。
 *   4. 诚实归因——枢纽不可达/版本过旧/桥插件过旧/拖动未生效，一律以状态字段
 *      如实上报，由面板芯片渲染，绝不静默假装成功。
 *
 * 端口发现：桥默认绑 26801；若端口被旧引擎僵尸占用会自动退到 26802。
 * 本文件按 26801 → 26802 顺序探测，粘住第一个应答 chushi-music-hub 的端口。
 *
 * 公开面（消费方 page.tsx / PresetWidgets / sandbox.ts / 预设脚本依赖，
 * 第六代保持字段级兼容，消费方零改动）：
 *   SMTC_PORT / SmtcTrack / SmtcState / SmtcLyric / SMTC_COMMANDS /
 *   smtcPositionNow / smtc（单例：start/onTick/subscribe/getSnapshot/control）
 * ==========================================================================*/

/** 桥枢纽主端口（bridge 插件端口被占时自动退到 FALLBACK_PORT） */
export const SMTC_PORT = 26801;
export const SMTC_FALLBACK_PORT = 26802;

const HUB_NAME = "chushi-music-hub";
const HUB_VER_MIN = "6.0.0";
const PLUGIN_VER_MIN = "6.0.0";
const POLL_MS = 1000;
const RETRY_MS = 2600;
const TIMEOUT_MS = 1500;
const TRUTH_STALE_SEC = 6;

/** 单条媒体快照（真值直显产物） */
export interface SmtcTrack {
  /** 来源应用（v6 恒为网易云桥插件真值源） */
  app: string;
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  /** 枢纽采样时刻的播放位置（秒，含年龄补偿） */
  position: number;
  /** 曲目总时长（秒；0 = 未知） */
  duration: number;
  /** 播放速率（插值用；≤0 视作 1） */
  rate: number;
  /** 兼容字段：v6 无二进制封面，恒空串 */
  coverRev: string;
  /** 宿主收到快照的时刻（插值基准） */
  fetchedAt: number;
}

/** 客户端对外状态（公开面，预设脚本经 chushi.music 消费） */
export interface SmtcState {
  connected: boolean;      // 本地桥枢纽可达且版本达标
  version: string;         // 桥枢纽自报版本
  track: SmtcTrack | null; // null = 未连接 / 无真值
  cover: string | null;    // 兼容字段：恒 null（封面走 coverUrl）
  coverUrl: string | null; // 封面 https URL（桥插件真值）
  lyric: SmtcLyric | null;
  lyricRev: string;        // 歌词版本（变化即重拉）
  pluginVer: string;       // 音乐桥插件版本（ne.v 心跳；空串 = 不在场）
  smtcVer: string;         // SMTC Manager 插件版本（状态总线心跳；空串 = 未注册）
  seekNote: string;        // seek 结果提示（自动消失）
  needsUpdate: boolean;    // needsPlugin || needsBridge
  needsPlugin: boolean;    // 音乐桥插件过旧/缺失
  needsBridge: boolean;    // 枢纽不可达或版本过旧
  engineOld: boolean;      // 枢纽在场但版本低于要求（兼容字段名，芯片区分文案）
}

/** 歌词载荷（桥缓存转发，歌词源插件产物） */
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
/* 内部工具（v6 全新命名与实现）                                            */
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

/** 枢纽透传的 ne 字段清洗（白名单 + 截断；无标题且无位置判无效） */
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

  /** 端口发现：粘住第一个应答枢纽身份的端口；失败时两端口都重探 */
  private activePort: number | null = null;

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
    const port = this.activePort ?? SMTC_PORT;
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/cmd`, {
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
      smtcVer: "",
      needsUpdate: true,
      needsBridge: true,
      engineOld: false,
    };
    this.lyricRevDone = "";
    this.lastSig = "";
    this.notify();
  }

  /** 端口发现：主端口优先，粘住；全失败时下一轮双端口重探 */
  private async discover(): Promise<{
    j: Record<string, unknown>;
    port: number;
  } | null> {
    const ports = this.activePort
      ? [this.activePort, this.activePort === SMTC_PORT ? SMTC_FALLBACK_PORT : SMTC_PORT]
      : [SMTC_PORT, SMTC_FALLBACK_PORT];
    for (const port of ports) {
      const j = await getJson(`http://127.0.0.1:${port}/api/state`);
      if (j && j.ok === true && j.name === HUB_NAME) {
        this.activePort = port;
        return { j, port };
      }
    }
    return null;
  }

  private async beat() {
    if (this.busy) return;
    this.busy = true;
    try {
      const found = await this.discover();
      if (!found) throw new Error("hub-not-chushi");
      const j = found.j;
      const version = clipStr(j.version, 16) || "0.0.0";
      const hubOld = semverLt(version, HUB_VER_MIN);
      const ne = cleanNe(j.ne);
      const smtcVer = clipStr(j.smtcVer, 16);

      /* 枢纽在场但过旧 → needsBridge（升级 .plugin 后重启网易云即解决） */
      const needsBridge = hubOld;
      const pluginVerNow = ne ? ne.v : "";
      const needsPlugin = !pluginVerNow || semverLt(pluginVerNow, PLUGIN_VER_MIN);

      /* 真值直显：一次性年龄补偿（桥采样时刻 → 此刻），fetchedAt 接管插值 */
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

      /* seekAck 诚实提示（桥读回校验失败的回执） */
      if (ne && ne.seekAckId && ne.seekAckAt > 0 && now - ne.seekAckAt < 3200 && !ne.seekAckOk) {
        this.seekNote = "拖动未生效：网易云未响应";
        this.seekNoteAt = now;
      }
      if (this.seekNote && now - this.seekNoteAt > 3800) this.seekNote = "";

      const sig = [
        version, hubOld, track ? track.title : "", track ? track.artist : "",
        track ? track.album : "", track ? track.playing : false,
        track ? track.duration : 0, coverUrl || "", this.seekNote,
        pluginVerNow, smtcVer, needsPlugin, needsBridge,
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
        smtcVer,
        seekNote: this.seekNote,
        needsUpdate: needsPlugin || needsBridge,
        needsPlugin,
        needsBridge,
        engineOld: hubOld,
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
      if (this.activePort !== null && this.failStreak >= 4) {
        this.activePort = null; /* 粘住的端口疑似死了，下轮双端口重探 */
      }
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
    const port = this.activePort ?? SMTC_PORT;
    const attempt = (): Promise<void> => {
      return getJson(`http://127.0.0.1:${port}/api/lyric?songId=${encodeURIComponent(this.lyricWanted)}`)
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
