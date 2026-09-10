/* ============================================================================
 * 「初始」音乐面板数据客户端 v8.1.0（第十代，InfLink-rs 适配版）
 *
 * v8.1.0 歌词乱跳/面板闪断双根治（用户实机录屏：歌曲正常播放但歌词
 *   1:05↔1:06 秒级锯齿、面板每 ~4.5s 整体消失成「系统媒体待接入」再恢复）：
 *   ① state-stale 重探不再 throw 进 failStreak——冻结桥场景
 *     「重探→超时→goOffline→恢复」循环让面板周期性整体切空态（录屏
 *     6.5s/11s 两闪实锤）；现重探只换端口、本拍数据照常上屏（connected
 *     恒 true），只有 discover/轮询真不可达才走 3 连败 offline。
 *   ② PLUGIN_VER_MIN 8.0.9→8.1.0（配套桥 v8.1.0 位置单源化：InfLink
 *     时间线与元素真值双源交替是锯齿上游根源，旧桥必须升级）。
 *
 * v8.0.9 拖动假失败根治（用户实机：「拖动成功了却提示拖动不成功」）：
 *   桥 v8.0.9 seek 读回校验升级为三态诚实上报（InfLink 时间线第一读回源 +
 *   三拍耐心；无读回源=未知≠失败，ne.seekAckKnown=false）。本版配套：
 *   ①PLUGIN_VER_MIN 8.0.8→8.0.9（旧桥必须升级）；
 *   ②cleanNe 透传 seekAckKnown（旧桥缺字段视为已验证，维持旧行为）；
 *   ③「拖动未生效」芯片仅在 known=true 且 ok=false（验证过的真失败）时亮。
 *   配套核心引擎 seek 护航窗（sandbox.js v8.0.9）：拖动后真值收敛窗内
 *   忽略旧轨迹陈旧拍——进度条回弹与歌词乱跳同根治；暂停/播放校准不变。
 *
 * v8.0.8 排空 JSON 根因修复配套 + 链路自证透传（hubsim 协议级复现实锢）：
 *   控制失效真正根因 = hub dataDrainCmds 漏写收尾 '}'（v8.0.0~v8.0.7 八代
 *   皆然），桥 r.json() 必抛 → 命令随排空灰飞烟灭；mock e2e 永远测不出。
 *   桥/hub 8.0.8 已修；本版配套：
 *   ①PLUGIN_VER_MIN 8.0.7→8.0.8（旧桥必须升级，面板芯片如实提示）；
 *   ②stateAge 新鲜度透传（桥状态 ts 与本机时差）——「看到的状态是不是
 *     活的」从猜测变成数字；持续陈旧（>8s×4 拍）自动全端口重探；
 *   ③桥侧自证（selftest）与轮询计数（poll）透传进诊断口——命令回路
 *     是否闭合、桥在拉但永远空，一眼定层；
 *   ④GET /api/hublog 证据端点接入诊断口（环形请求日志尾部），页面 POST
 *     是否入队、桥是否排空、租约归谁，一屏取证；
 *   ⑤postTrace 增加 recv 标记——POST ok 但 6s 内无桥侧 'cmd' 轨迹的命令
 *     标 no-recv（链路断层的页面侧直接证据）。
 *
 * v8.0.7 轮询租约 + 桥侧轨迹透传（用户实机 cmdTrace 取证）：
 *   PLUGIN_VER_MIN 8.0.6→8.0.7 —— 实机证据：页面 POST /api/cmd 全部 ok、
 *   桥状态通道活、但 cmdLast 回执从未出现且控制全灭 → /api/cmd 排空式
 *   先到先得，网易云残留进程/多进程注入的第二桥实例把命令随机分走，
 *   新桥永远空手。桥 8.0.7 + hub 8.0.7 引入轮询租约（粘性持有者唯一
 *   排空权，非持有者被 hub 拦为 []）；本版透传桥侧执行轨迹（cmd.trace
 *   20 条环形）与实例身份（who）/租约态（lease）进诊断口，用户在浏览器
 *   一条命令即可看到桥内部每一步，诊断盲区永久消灭。旧桥必须升级。
 *
 * v8.0.5 原生媒体键兜底版（插件层独有变更，本文件仅版本门提升）：
 *   PLUGIN_VER_MIN 8.0.4→8.0.5 —— 旧桥插件（渲染层四路全灭的 NCM 上无法
 *   控歌）必须升级到 8.0.5（含 hub.dll 8.0.5 原生媒体键端点）才能通过
 *   版本门，面板「组件待更新」芯片会如实提示；页面侧诊断口与控制链路不变。
 *
 * v8.0.4 歌词滞留根治 + 控制可观测（用户实机取证）：
 *   ①歌词拉取强校验——hub /api/lyric 是单槽缓存，切歌瞬间页面拉到的必然是
 *     上一首歌词；旧版不校验响应 songId 照单全收且把新曲目标记为已拉取
 *     （「切歌后歌词一直滞留上一首」的头号根因）。现在响应 songId 必须
 *     等于请求 songId 才接受；track 透出 songId 供渲染层二次拦截；
 *   ②桥命令回执透出（state.cmd）——用户在浏览器里测试拿不到桥诊断口，
 *     面板/页面端可直读「命令是否被桥执行、四路降级走到哪一级」；
 *   ③页面侧 window.__chushiMusicBridge 诊断口（不覆盖桥侧同名口）——
 *     用户在「初始」页控制台执行同一条命令即可拿到 hub/控制 POST 轨迹。
 *
 * v8.0.1 容错调优：配合枢纽空连接快关（hub 侧最坏阻塞 3s→0.5s），
 *   采样超时 1400→2200ms、重探节流 2400→1500ms、掉线判定 2→3 连败——
 *   消除偶发抖动被读成「一会连上一会断开」。
 *
 * 架构律（v8 宪法）：
 *   1. 数据面唯一——网易云「ChuShi Music Bridge 8」插件 1Hz 推送的真值快照
 *      经纯 winsock 枢纽（music-bridge 内置 hub.dll 的 HTTP 中继）原样透传；
 *      本文件零仲裁、零守卫、零二次加工，只做一次性的采样年龄补偿。
 *   2. 系统卡片归 InfLink-rs——Windows 媒体卡片（元数据/封面/时间线/媒体键）
 *      完全由第三方 InfLink-rs 插件持有；本文件不参与 SMTC，快照里的
 *      smtcVer 字段 v8 语义 = InfLink-rs 版本（空串 = 未装/未启用）。
 *   3. 控制只下发——seek/播放控制 POST 枢纽命令队列，由桥在网易云内
 *      执行（主路 InfLinkApi，备路元素/按钮）；本文件不碰网易云任何内部状态。
 *   4. 诚实归因——枢纽不可达/版本过旧/桥插件过旧，一律以状态字段如实上报，
 *      由面板芯片渲染，绝不静默假装成功。
 *
 * 端口发现：hub.dll 绑 26901（占用时退 26902/26903）；
 * 本文件按 26901 → 26902 → 26903 顺序探测，粘住第一个应答枢纽身份的端口。
 *
 * 公开面（消费方 page.tsx / PresetWidgets / sandbox.ts / 预设脚本依赖，
 * 字段级兼容，消费方零改动）：
 *   SMTC_PORT / SmtcTrack / SmtcState / SmtcLyric / SMTC_COMMANDS /
 *   smtcPositionNow / smtc（单例：start/onTick/subscribe/getSnapshot/control）
 * ==========================================================================*/

/** 枢纽主端口（被占用时 hub.dll 自动退到备选端口） */
export const SMTC_PORT = 26901;
export const SMTC_FALLBACK_PORT = 26902;
/** v8 备选端口全集（按序探测） */
export const SMTC_PORTS: readonly number[] = [26901, 26902, 26903];

const HUB_NAME = "chushi-music-hub";
const HUB_VER_MIN = "8.0.0";
const PLUGIN_VER_MIN = "8.1.0";
const CLIENT_VER = "8.2.4";
const POLL_MS = 1000;
const RETRY_MS = 1500;
const TIMEOUT_MS = 2200;
const TRUTH_STALE_SEC = 6;
/** v8.0.8 桥状态新鲜度：超过此值（秒）视为冻结嫌疑，连续 staleStreakMax 拍重探 */
const STATE_STALE_MS = 8000;
const STATE_STALE_STREAK_MAX = 4;
/** v8.0.8 控制回执窗口：POST ok 后等桥侧 'cmd' 轨迹的最长时间（ms） */
const RECV_WAIT_MS = 6000;

/** 单条媒体快照（真值直显产物） */
export interface SmtcTrack {
  /** 来源应用（v8 恒为网易云桥插件真值源） */
  app: string;
  /** 网易云曲目 id（0 = 真值源未提供；歌词归属校验用） */
  songId: number;
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
  /** 兼容字段：v8 无二进制封面，恒空串 */
  coverRev: string;
  /** 宿主收到快照的时刻（插值基准） */
  fetchedAt: number;
}

/** 桥命令回执（v8.0.4：桥执行轨迹经 /api/state 透出，控制可观测） */
export interface SmtcCmdLast {
  /** 命令 _id（hub 队列号） */
  id: number;
  type: string;
  /** 桥验证结果：true=真值翻转确认 / false=四路全败 / null=未知 */
  ok: boolean | null;
  /** 走到哪一路（link/redux/element/button/skip/…） */
  path: string;
  at: number;
}

/** 桥侧执行轨迹条目（v8.0.7：state.cmd.trace 环形 20 条透传） */
export interface SmtcCmdTraceEntry {
  /** 桥侧时刻（ms） */
  at: number;
  /** 种类：cmd/recv/ok/skip/fb/link/redux/element/reset/… */
  k: string;
  /** 详情：toggle#12 / play-called / no-store:playing/resume / … */
  d: string;
}

/** 客户端对外状态（公开面，预设脚本经 chushi.music 消费） */
export interface SmtcState {
  connected: boolean;      // 枢纽可达且版本达标
  version: string;         // 枢纽自报版本
  track: SmtcTrack | null; // null = 未连接 / 无真值
  cover: string | null;    // 兼容字段：恒 null（封面走 coverUrl）
  coverUrl: string | null; // 封面 https URL（桥插件真值）
  lyric: SmtcLyric | null;
  lyricRev: string;        // 歌词版本（变化即重拉）
  pluginVer: string;       // 音乐桥插件版本（ne.v 心跳；空串 = 不在场）
  smtcVer: string;         // InfLink-rs 版本（桥真值心跳；空串 = 未装/未启用）
  cmdLast: SmtcCmdLast | null; // 桥最近一次控制命令回执（v8.0.4）
  cmdTrace: SmtcCmdTraceEntry[]; // 桥侧执行轨迹（v8.0.7，环形 20 条）
  who: string;             // 桥实例身份（v8.0.7 租约持有者标识）
  lease: string;           // 租约态：holder/standby/legacy（v8.0.7）
  /** v8.0.8 桥状态年龄（秒）：本机时刻 - 桥状态 ts；持续 >8s = 冻结嫌疑 */
  stateAge: number;
  /** v8.0.8 桥侧回路自证：ok=false = 命令回路断裂（已自动重探） */
  selftest: { ok: boolean; failStreak: number; at: number; note: string } | null;
  /** v8.0.8 桥轮询计数：桥在拉但永远空（emptyStreak 增长 + delivered 恒 0）= 队列断层 */
  poll: { drains: number; delivered: number; emptyStreak: number; lastCount: number; lastGetAt: number; lastNullAt: number } | null;
  /** v8.0.8 hub 请求日志尾部（/api/hublog 环形收据，诊断口取证用） */
  hubLog: string[];
  seekNote: string;        // seek 结果提示（自动消失）
  needsUpdate: boolean;    // needsPlugin || needsBridge
  needsPlugin: boolean;    // 音乐桥插件过旧/缺失
  needsBridge: boolean;    // 枢纽不可达或版本过旧
  engineOld: boolean;      // 枢纽在场但版本低于要求（兼容字段名，芯片区分文案）
}

/** 歌词载荷（枢纽缓存转发，歌词源插件产物） */
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
/* 内部工具                                                                */
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
    /* v8.0.9 三态诚实律：旧桥无此字段（undefined）→ 视为已验证（维持旧
       判定行为）；新桥 ok=null（无读回源）→ known=false → 不亮失败芯片 */
    seekAckKnown: o.seekAckKnown !== false,
    seekAckAt: clipNum(o.seekAckAt),
  };
}

/** 桥命令回执清洗（v8.0.4：state.cmd.last 白名单）；v8.0.7 附带 trace/who/lease */
function cleanCmd(raw: unknown): { last: SmtcCmdLast | null; trace: SmtcCmdTraceEntry[] } {
  const empty = { last: null as SmtcCmdLast | null, trace: [] as SmtcCmdTraceEntry[] };
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;
  const last = o.last;
  let outLast: SmtcCmdLast | null = null;
  if (last && typeof last === "object") {
    const l = last as Record<string, unknown>;
    if (clipNum(l.at) > 0) {
      outLast = {
        id: clipNum(l.id),
        type: clipStr(l.type, 16),
        ok: typeof l.ok === "boolean" ? l.ok : null,
        path: clipStr(l.path, 16),
        at: clipNum(l.at),
      };
    }
  }
  const trace: SmtcCmdTraceEntry[] = [];
  if (Array.isArray(o.trace)) {
    for (const it of o.trace.slice(-20)) {
      if (!it || typeof it !== "object") continue;
      const e = it as Record<string, unknown>;
      if (!(clipNum(e.at) > 0)) continue;
      trace.push({ at: clipNum(e.at), k: clipStr(e.k, 12), d: clipStr(e.d, 80) });
    }
  }
  return { last: outLast, trace };
}

/** v8.0.8 桥侧回路自证清洗 */
function cleanSelftest(raw: unknown): SmtcState["selftest"] {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (clipNum(o.at) <= 0 && o.ok !== true) return null;
  return {
    ok: o.ok === true,
    failStreak: clipNum(o.failStreak),
    at: clipNum(o.at),
    note: clipStr(o.note, 24),
  };
}

/** v8.0.8 桥轮询计数清洗 */
function cleanPoll(raw: unknown): SmtcState["poll"] {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    drains: clipNum(o.drains),
    delivered: clipNum(o.delivered),
    emptyStreak: clipNum(o.emptyStreak),
    lastCount: clipNum(o.lastCount),
    lastGetAt: clipNum(o.lastGetAt),
    lastNullAt: clipNum(o.lastNullAt),
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

  /** 端口发现：粘住第一个应答枢纽身份的端口；失败时全端口重探 */
  private activePort: number | null = null;

  /** 歌词拉取状态：wanted 曲目键 / 进行中标记 / 重试计数 */
  private lyricWanted = "";
  private lyricBusy = false;
  private lyricTries = 0;
  private lyricRevDone = "";

  private seekNote = "";
  private seekNoteAt = 0;

  /** v8.0.4 控制可观测：页面端命令 POST 轨迹（诊断口消费）；v8.0.8 附 recv 标记 */
  private ctlLog: Array<{ at: number; cmd: string; ok: boolean; port: number; recv?: boolean }> = [];
  /** v8.0.8 桥状态陈旧连续拍数（冻结嫌疑 → 全端口重探） */
  private staleStreak = 0;
  /** v8.0.8 节拍计数（hublog 降频拉取） */
  private beats = 0;
  /** v8.0.8 hub 日志尾部环形（诊断口透传） */
  private hubLogBuf: string[] = [];

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
    cmdLast: null,
    cmdTrace: [],
    who: "",
    lease: "",
    stateAge: -1,
    selftest: null,
    poll: null,
    hubLog: [],
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

  /** 控制下发（白名单外拒绝；HTTP ok 即视为排队成功）
   *  v8.0.4：POST 结果记入 ctlLog（页面侧诊断口 cmdTrace 消费） */
  async control(cmd: string, position?: number): Promise<boolean> {
    if (!SMTC_COMMANDS.has(cmd)) return false;
    const body: Record<string, unknown> = { cmd };
    if (cmd === "seek" && typeof position === "number" && Number.isFinite(position)) {
      body.position = Math.max(0, Math.min(86400, position));
    }
    const port = this.activePort ?? SMTC_PORT;
    let ok = false;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(`http://127.0.0.1:${port}/api/cmd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const j = (await r.json()) as Record<string, unknown>;
      ok = j?.ok === true;
      if (ok && cmd === "seek") {
        this.seekNote = "";
        this.schedule(80);
      }
    } catch {
      ok = false;
    }
    this.ctlLog.push({ at: Date.now(), cmd, ok, port, recv: ok ? false : undefined });
    if (this.ctlLog.length > 12) this.ctlLog.shift();
    return ok;
  }

  /** 启动轮询（幂等；SSR 守卫）；v8.0.4 页面侧诊断口挂载（不覆盖桥侧同名口） */
  start() {
    if (typeof window === "undefined") return;
    const w = window as unknown as Record<string, unknown>;
    if (!w.__chushiMusicBridge) {
      const client = this;
      w.__chushiMusicBridge = {
        side: "page",
        ver: CLIENT_VER,
        debug() {
          const s = client.getSnapshot();
          return {
            side: "page" as const,
            ver: CLIENT_VER,
            note: "页面侧诊断口（桥侧口在网易云主页面；side 字段区分）。" +
              "cmdTrace=桥侧执行轨迹（桥收到命令后走到哪一路）/ " +
              "postTrace=页面侧控制 POST 轨迹（recv:false=POST ok 但桥 6s 内未收到=no-recv 断层证据）/ " +
              "who+lease=桥实例身份与租约态 / stateAge=桥状态年龄秒（>8=冻结嫌疑）/ " +
              "selftest=命令回路自证 / poll=桥轮询计数 / hubLog=枢纽请求日志尾部",
            hub: { port: client.activePort, connected: s.connected, version: s.version },
            pluginVer: s.pluginVer,
            smtcVer: s.smtcVer,
            songId: s.track ? s.track.songId : 0,
            title: s.track ? s.track.title : "",
            cmdLast: s.cmdLast,
            cmdTrace: s.cmdTrace.slice(-20),
            postTrace: client.ctlLog.slice(),
            who: s.who,
            lease: s.lease,
            stateAge: s.stateAge,
            selftest: s.selftest,
            poll: s.poll,
            hubLog: s.hubLog.slice(),
            lyricReady: !!(s.lyric && (s.lyric.yrc || s.lyric.lrc)),
            lyricSongId: s.lyric ? s.lyric.songId : 0,
            lyricSource: s.lyric ? s.lyric.source : "",
          };
        },
      };
    }
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
      cmdLast: null,
      cmdTrace: [],
      who: "",
      lease: "",
      stateAge: -1,
      selftest: null,
      poll: null,
      hubLog: [],
      needsUpdate: true,
      needsBridge: true,
      engineOld: false,
    };
    this.lyricRevDone = "";
    this.lastSig = "";
    this.notify();
  }

  /**
   * v8 端口发现：hub 以 /api/ping 自报身份（name=chushi-music-hub），
   * 三端口顺序探测，粘住第一个命中者；全部失败时下一轮从头重探。
   */
  private async discover(): Promise<number | null> {
    const ports = this.activePort
      ? [this.activePort, ...SMTC_PORTS.filter((p) => p !== this.activePort)]
      : [...SMTC_PORTS];
    for (const port of ports) {
      const j = await getJson(`http://127.0.0.1:${port}/api/ping`);
      if (j && j.ok === true && j.name === HUB_NAME) {
        this.activePort = port;
        return port;
      }
    }
    return null;
  }

  private async beat() {
    if (this.busy) return;
    this.busy = true;
    try {
      const port = this.activePort ? (await Promise.resolve(this.activePort)) : (await this.discover());
      if (!port) throw new Error("hub-not-chushi");
      const j = await getJson(`http://127.0.0.1:${port}/api/state`);
      if (!j) throw new Error("state-empty");
      const version = clipStr(j.version, 16) || "0.0.0";
      const ne = cleanNe(j.ne);
      const cmd = cleanCmd(j.cmd);
      const cmdLast = cmd.last;
      const cmdTrace = cmd.trace;
      const who = clipStr(j.who, 48);
      const lease = clipStr(j.lease, 12);
      /* v8.0.8 桥状态新鲜度/自证/轮询计数：链路断层一眼定层 */
      const stateTs = clipNum(j.ts);
      const now0 = Date.now();
      const stateAge = stateTs > 0 ? Math.max(0, (now0 - stateTs) / 1000) : -1;
      const selftest = cleanSelftest(j.selftest);
      const poll = cleanPoll(j.poll);

      /* v8.0.8 持续陈旧（>8s×4 拍）= 粘住的端口背后是冻结桥/僵尸 hub
         → 全端口重探。v8.1.0 防闪断律：重探只换端口、不再 throw——
         旧实现 throw 进 failStreak，冻结桥场景「重探→超时→goOffline→
         恢复」循环让面板周期性整体切空态（真机录屏 6.5s/11s 两闪实锤）；
         现在本拍数据照常上屏（connected 恒 true），下一拍从头 discover，
         只有 discover/轮询真失败（hub 不可达）才走 3 连败 offline。 */
      if (stateTs > 0 && now0 - stateTs > STATE_STALE_MS) {
        this.staleStreak++;
        if (this.staleStreak >= STATE_STALE_STREAK_MAX && this.activePort !== null) {
          this.staleStreak = 0;
          this.activePort = null; /* 下一拍 discover() 从头顺序重探 */
        }
      } else {
        this.staleStreak = 0;
      }

      /* v8.0.8 no-recv 标记：POST ok 但 RECV_WAIT_MS 内无桥侧 'cmd' 轨迹 */
      for (const e of this.ctlLog) {
        if (e.recv === true || e.ok !== true) continue;
        const got = cmdTrace.some((t) => t.k === "cmd" && t.d.startsWith(e.cmd + "#") && t.at >= e.at);
        if (got) e.recv = true;
        else if (now0 - e.at > RECV_WAIT_MS) e.recv = false;
      }

      /* v8.0.8 hub 日志尾部：每 3 拍拉一次（证据端点，降频） */
      this.beats++;
      if (this.beats % 3 === 0) {
        const hl = await getJson(`http://127.0.0.1:${port}/api/hublog`);
        if (hl && hl.ok === true && Array.isArray(hl.log)) {
          const lines: string[] = [];
          for (const it of (hl.log as unknown[]).slice(-12)) {
            if (Array.isArray(it) && it.length >= 2) lines.push(`${String(it[1])}`);
          }
          if (lines.length) this.hubLogBuf = lines;
        }
      }

      /* v8 语义：smtcVer = InfLink-rs 版本（桥心跳携带；空 = 未装/未启用） */
      const smtcVer = clipStr(j.inflinkVer, 16) || clipStr(j.smtcVer, 16);

      /* 枢纽本体版本由 /api/ping 提供（discover 阶段缓存），快照里也可能带 */
      const hubVer = clipStr(j.hubVer, 16) || clipStr(j.version, 16) || version;
      const hubOld = semverLt(hubVer, HUB_VER_MIN);
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
          songId: ne.songId,
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

      /* seekAck 诚实提示（桥读回校验失败的回执；v8.0.9 三态：无读回源的
         未知结果不算失败——拖动假失败芯片根治） */
      if (ne && ne.seekAckId && ne.seekAckAt > 0 && now - ne.seekAckAt < 3200 &&
          !ne.seekAckOk && ne.seekAckKnown) {
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
        version: hubVer,
        track,
        cover: null,
        coverUrl,
        lyric: this.state.lyric,
        lyricRev: this.state.lyricRev,
        pluginVer: pluginVerNow,
        smtcVer,
        cmdLast: cmdLast ?? this.state.cmdLast,
        cmdTrace: cmdTrace.length ? cmdTrace : this.state.cmdTrace,
        who: who || this.state.who,
        lease: lease || this.state.lease,
        stateAge,
        selftest,
        poll,
        hubLog: this.hubLogBuf.slice(),
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
      this.schedule(POLL_MS);
    } catch {
      this.failStreak++;
      if (this.activePort !== null && this.failStreak >= 6) {
        this.activePort = null; /* 粘住的端口疑似死了，下轮全端口重探 */
      }
      if (this.failStreak >= 3) this.goOffline();
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
          /* v8.0.4 歌词归属强校验：hub /api/lyric 是单槽缓存，切歌窗口内
             返回的必然是上一首歌词——songId 不符一律视为未就绪，继续重试。
             （旧版照单全收并把新曲目标记已拉取 = 歌词永远滞留上一首的头号
             根因；桥侧已同步推 pending 占位清槽，此处是最终防线） */
          const wantId = Number(this.lyricWanted) || 0;
          const gotId = clipNum(ly?.songId);
          const ownerOk = !wantId || !gotId || gotId === wantId;
          if (j?.ok === true && ly && ownerOk && (yrc || lrc)) {
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
  /** v8.2.0 频谱助手惰性拉起（hub /api/spectrum-boot：助手不在且未被拉起时
   *  由 hub 侧 CreateProcess；boot 只保证「在场」，数据面在助手端口。 */
  async bootSpectrum(): Promise<boolean> {
    const port = this.activePort;
    if (!port || !this.state.connected) return false;
    const j = await getJson(`http://127.0.0.1:${port}/api/spectrum-boot`);
    return !!(j && j.ok === true);
  }
}

/** 全局单例（页面/沙箱桥/部件层共用） */
export const smtc = new SmtcClient();

/* ---------------------------------------------------------------------- */
/* v8.2.0 频谱管线（律动高光数据面）                                        */
/*   独立助手进程 chushi-spectrum.exe（WASAPI loopback + FFT，26911-3）：  */
/*   - 发现：直接探测 26911-3 身份（chushi-spectrum）；不在且已连 hub 时    */
/*     每 ~5s 打一次 /api/spectrum-boot 惰性拉起，冷启动 ≤5s 自愈；        */
/*   - 30Hz 轮询只在：有订阅者 + 页面可见；数据端点连续 3 败 → 弃端口缓存；*/
/*   - 包络：快攻慢放（攻 .55 / 放 .14 per 帧），暂停/失联自然衰减到 0；   */
/*   - 旧 hub（无助手）如实 on:false —— 高光保持静态，零降级噪声。         */
/* 公开面：smtcSpectrum.subscribe(cb) / smtcSpectrum.last                  */
/* ---------------------------------------------------------------------- */

export const SPECTRUM_PORTS: readonly number[] = [26911, 26912, 26913];
const SPEC_NAME = "chushi-spectrum";
const SPEC_FRAME_MS = 33;       /* 30Hz */
const SPEC_FAILS_MAX = 3;
const SPEC_BOOT_EVERY = 150;    /* 发现重试节拍（×33ms ≈ 5s） */
const SPEC_ATTACK = 0.55;       /* 包络：快攻（跟拍） */
const SPEC_RELEASE = 0.14;      /* 包络：慢放（不闪） */

export interface SmtcSpectrum {
  on: boolean;        // 助手在场且采集链路 ok（cap=1）
  bass: number;       // 0..1 已包络（低三段加权，鼓点驱动源）
  bands: number[];    // 16 段 0..1 已包络；on=false 时为衰减尾
  t: number;          // 帧到达时刻（Date.now()）
}

type SpecCb = (sp: SmtcSpectrum) => void;

class SpectrumClient {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private port: number | null = null;
  private fails = 0;
  private bootBeats = 0;
  private envBass = 0;
  private envBands: number[] = new Array(16).fill(0);
  private subs: SpecCb[] = [];

  /** 最近一帧（一次性消费用；on=false = 无助手/暂停衰减中） */
  last: SmtcSpectrum = { on: false, bass: 0, bands: [], t: 0 };

  subscribe(cb: SpecCb): () => void {
    if (typeof cb !== "function") return () => undefined;
    this.subs.push(cb);
    try { cb(this.last); } catch { /* 单订阅方异常互不干扰 */ }
    this.start();
    return () => {
      const i = this.subs.indexOf(cb);
      if (i >= 0) this.subs.splice(i, 1);
      if (this.subs.length === 0) this.stop();
    };
  }

  private start() {
    if (this.timer || typeof window === "undefined") return;
    void this.discover();
    this.timer = setInterval(() => { void this.tick(); }, SPEC_FRAME_MS);
  }

  private stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.port = null;
    this.bootBeats = 0;
  }

  private async discover() {
    for (const p of SPECTRUM_PORTS) {
      const j = await getJson(`http://127.0.0.1:${p}/api/ping`);
      if (j && j.ok === true && j.name === SPEC_NAME) {
        this.port = p;
        this.fails = 0;
        return;
      }
    }
    await smtc.bootSpectrum(); /* 不在 → hub 惰性拉起；端口靠下轮探测确认 */
  }

  private decay() {
    this.envBass *= 0.9;
    if (this.envBass < 0.005) this.envBass = 0;
    for (let i = 0; i < 16; i++) this.envBands[i] *= 0.9;
    this.last = { on: false, bass: this.envBass, bands: this.envBands.slice(), t: Date.now() };
    this.publish();
  }

  private publish() {
    for (const cb of this.subs) {
      try { cb(this.last); } catch { /* 互不干扰 */ }
    }
  }

  private async tick() {
    if (this.busy || this.subs.length === 0) return;
    this.busy = true;
    try {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (this.port === null) {
        this.decay();
        if (++this.bootBeats >= SPEC_BOOT_EVERY) {
          this.bootBeats = 0;
          void this.discover();
        }
        return;
      }
      const j = await getJson(`http://127.0.0.1:${this.port}/api/spectrum`);
      if (!j || j.ok !== true) {
        if (++this.fails >= SPEC_FAILS_MAX) { this.port = null; this.fails = 0; }
        this.decay();
        return;
      }
      this.fails = 0;
      const cap = j.cap === true || j.cap === 1;
      const playing = !!(smtc.getSnapshot().track && smtc.getSnapshot().track!.playing);
      const tgtBass = cap && playing ? clipNum(j.bass) : 0;
      const raw = Array.isArray(j.bands) ? (j.bands as unknown[]) : [];
      this.envBass += (tgtBass - this.envBass) * (tgtBass > this.envBass ? SPEC_ATTACK : SPEC_RELEASE);
      for (let i = 0; i < 16; i++) {
        const tv = cap && playing ? clipNum(raw[i]) : 0;
        this.envBands[i] += (tv - this.envBands[i]) * (tv > this.envBands[i] ? SPEC_ATTACK : SPEC_RELEASE);
      }
      this.last = { on: cap, bass: this.envBass, bands: this.envBands.slice(), t: Date.now() };
      this.publish();
    } finally {
      this.busy = false;
    }
  }
}

/** 频谱单例（面板沙箱/部件帧订阅；SW 不用本面，ext-bg 自带同语义实现） */
export const smtcSpectrum = new SpectrumClient();
