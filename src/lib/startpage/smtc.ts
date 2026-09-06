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
 * （连接态/桥版本/标题/歌手/专辑/播放态/来源/时长/封面版本/歌词版本）变化才广播
 * 完整快照；position 不进签名（避免带歌词大载荷的整包每秒重发）——但每拍另发
 * 轻量锚点（onTick：position/duration/playing/rate/fetchedAt），消费方据此校正
 * 插值基准：否则 seek 后新位置永远不会到达部件（签名未变），进度条拖完弹回——
 * v1.8.x 真机「进度条完全是坏的」的根因，v1.9.0 以 tick 锚点修复。
 *
 * 网易云增强（v1.9.0）：桥 /api/state 附带 ne 字段（「初始歌词源」BetterNCM 插件
 * 经桥中转的精确状态）；歌词源可达且曲目匹配时：
 *   - duration/position 为 0 或缺失时用插件值兑底（SMTC 时间轴缺失场景）；
 *   - cover 无 SMTC 封面时用插件 picUrl 兑底（coverUrl）；
 *   - lyricRev 变化时拉 /api/lyric（yrc 逐字/lrc/tlyric），随快照广播。
 * SMTC 仍是会话与控制权威；插件只增强数据，不改变控制链路。
 *
 * v2.2.0（真机第 7 轮反馈：暂停恢复仍累积漂移 / 面板能拖但网易云本体不动）：
 *   ① 插件真值绝对锚定 —— 插件心跳新鲜（ts ≤3s）且曲目匹配时，进度/时长/播放态
 *      一律以插件真值为锚（插件在客户端内直读 el.currentTime，帧级真值）：
 *      暂停/恢复/微 seek 全部在 1s 内绝对重锚，误差不可能累积；
 *      时序守卫链（harmonize）只在 SMTC-only（无插件/非网易云）时启用。
 *   ② seek 诚实验证 —— 拖动提交后 2.5s 内对比插件真值：跟上→确认；未跟上→
 *      进度条诚实弹回真值 + seekNote 提示「拖动未生效」（绝不假装已跳转，
 *      真机「面板能拖但本体不动」的观感根因就是旧版 4s 假信任窗）；
 *      插件 v1.2.0 的 seekAck（内部 dispatch API 执行结果）提供更快确认。
 *   ③ 暴露 pluginVer（插件版本）+ seekNote —— 面板页脚可诊断插件在场与版本，
 *      多组件版本漂移一眼可见。
 *
 * v2.3.1（真机第 8 轮反馈：进度/歌词/时间冻死 0:00、播放态概率反转、WSH 弹窗）：
 *   ① 零值两击守卫 —— 插件深位置后突报 ≈0 的样本延迟一拍再采纳（连续两拍或
 *      本端刚 seek 到开头才信），播放态不在可疑零拍上翻转：单拍垃圾零样本
 *      再也冻不住面板/掀不翻播放态（配合插件 v1.4.0 真值熔断双保险）。
 *   ② needsUpdate 阈值升至桥 1.7.1 / 插件 1.4.0。
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
  /** 封面备用 https URL（网易云插件提供，cover 为空时消费方使用） */
  coverUrl: string | null;
  /** 当前曲目歌词（v1.9.0；null = 无歌词源/未就绪） */
  lyric: SmtcLyric | null;
  /** 歌词版本（桥生成，变化即重拉） */
  lyricRev: string;
  /** 网易云歌词源插件版本（v2.2.0；空串 = 插件心跳不在场） */
  pluginVer: string;
  /** seek 结果提示（v2.2.0；空串 = 无；「拖动未生效…」≈3.8s 后自动消失） */
  seekNote: string;
  /** v2.3.1 组件过旧：桥 <1.7.1 或插件 <1.4.0 或插件不在场（面板显示升级芯片） */
  needsUpdate: boolean;
}

/** 歌词载荷（桥 /api/lyric 白名单产物；文本字段已截断） */
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
  /** 来源标记（eapi-yrc / eapi-klyric / eapi-lrc / channel-lrc / plain-lrc） */
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

/** 桥 JSON ne 字段 → 白名单对象（歌词源插件经桥中转的网易云精确状态） */
interface NeState {
  songId: number;
  title: string;
  artist: string;
  album: string;
  pic: string;
  positionMs: number;
  durationMs: number;
  playing: boolean;
  /** 桥侧歌词版本（非空 = 桥有当前曲歌词可拉） */
  lyricRev: string;
  /** 插件采样时刻（插件 Date.now()，同机时钟；v1.2.0 起携带，缺失 = 旧插件） */
  ts: number;
  /** 插件版本（v1.2.0 起携带；空 = 旧插件） */
  v: string;
  /** 最近一次 seek 执行结果（插件 v1.2.0 API 阶梯实测校验产物；桥 v1.6.0 透传） */
  seekAckId: string;
  seekAckOk: boolean;
  seekAckPos: number;
  seekAckAt: number;
}
function normalizeNe(raw: unknown): NeState | null {
  if (typeof raw !== "object" || raw == null) return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
  const title = typeof o.title === "string" ? o.title.slice(0, 200) : "";
  if (!title) return null;
  return {
    songId: num(o.songId),
    title,
    artist: typeof o.artist === "string" ? o.artist.slice(0, 200) : "",
    album: typeof o.album === "string" ? o.album.slice(0, 200) : "",
    pic: typeof o.pic === "string" && /^https:\/\//.test(o.pic) ? o.pic.slice(0, 500) : "",
    positionMs: num(o.positionMs),
    durationMs: num(o.durationMs),
    playing: o.playing === true,
    lyricRev: typeof o.lyricRev === "string" ? o.lyricRev.slice(0, 64) : "",
    ts: num(o.ts),
    v: typeof o.v === "string" ? o.v.slice(0, 16) : "",
    seekAckId: typeof o.seekAckId === "string" ? o.seekAckId.slice(0, 40) : "",
    seekAckOk: o.seekAckOk === true,
    seekAckPos: num(o.seekAckPos),
    seekAckAt: num(o.seekAckAt),
  };
}

/** 标题归一化：去空白/常见全半角标点——SMTC 与插件源标题修饰差异的容错 */
function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-_·・()（）\[\]【】「」『』,，。、!！?？~～'\"＂]+/g, "");
}

/** 曲目与网易云插件状态是否指同一首歌（标题双向包含即认；SMTC 标题常带修饰）。
 *  v2.1.0：归一化后再比一轮（全半角标点/空格差异）；仍不中且双方时长已知且
 *  贴合（±2s）时接受歌手首段重合——SMTC 标题被本地化/加后缀时的概率性不匹配
 *  正是「切歌后歌词概率加载不出」的隐性分支。 */
function trackMatchesNe(t: SmtcTrack, ne: NeState): boolean {
  const a = t.title.trim().toLowerCase();
  const b = ne.title.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const a2 = normTitle(a);
  const b2 = normTitle(b);
  if (a2 && b2 && (a2.includes(b2) || b2.includes(a2))) return true;
  const dGap = t.duration > 0 && ne.durationMs > 0 ? Math.abs(t.duration - ne.durationMs / 1000) : 999;
  const arA = t.artist.split(/[/,、]/)[0].trim().toLowerCase();
  const arB = ne.artist.split(/[/,、]/)[0].trim().toLowerCase();
  if (
    dGap <= 2 &&
    arA && arB &&
    (arA === arB || arA.includes(arB) || arB.includes(arA))
  )
    return true;
  return false;
}

/** 关键签名：变化才广播（position/fetchedAt 不参与——插值属消费方职责） */
function stateSig(s: {
  connected: boolean;
  version: string;
  track: SmtcTrack | null;
  lyricRev: string;
}): string {
  const t = s.track;
  const tpart = t
    ? [t.app, t.title, t.artist, t.album, t.playing ? 1 : 0, t.duration, t.coverRev].join("|")
    : "none";
  return `${s.connected ? 1 : 0}|${s.version}|${tpart}|${s.lyricRev}`;
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

class SmtcClient {
  private state: SmtcState = {
    connected: false,
    version: "",
    track: null,
    cover: null,
    coverUrl: null,
    lyric: null,
    lyricRev: "",
    pluginVer: "",
    seekNote: "",
    needsUpdate: false,
  };
  private subs = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private failStreak = 0;
  private lastSig = "0||none|";
  /** 已成功取到封面的 coverRev（同版不重拉） */
  private coverRevDone = "";
  private coverTries = 0;
  /** 已拉取的歌词 rev（同版不重拉）；拉取中标记 + latest-wins 链（v2.1.0） */
  private lyricRevDone = "";
  private lyricInflight = false;
  private lyricTries = 0;
  /** 最新期望的歌词 rev：inflight 期间变化，完成后由 finally 链式补拉
   *  （v2.1.0 根治：切歌瞬间旧拉取仍 inflight → 新 rev 拉取被静默跳过且永不重试
   *   —— 真机「自动切歌后歌词概率加载不出来」的主因） */
  private lyricWanted = "";
  /** v2.0.1 旧桥伪影守卫状态：上一拍 reported-expected 偏移（delta 一致性记忆） */
  private lastDelta = 0;
  /** v2.0.1 本端发起的 seek（成功后信自己这条线直到验证落定——v2.2.0 起由
   *  插件真值/seekAck 快速确认，2.5s 未跟上即诚实弹回，不再盲目信任 4s） */
  private seekHold: { pos: number; at: number } | null = null;
  /** v2.2.0 seek 结果提示（3.8s 自动消失） */
  private seekNote = "";
  private seekNoteAt = 0;
  /** v2.3.1 零值两击守卫：插件深位置后突报 ≈0 的样本须延迟一拍再采纳
   *  （真机插件 v1.3.0 曾因错误媒体元素持续报 paused+0，配合绝对锚定把
   *  面板钉死 0:00 / 播放态概率反转；插件侧已真值熔断，这里是宿主兑底） */
  private neZeroStreak = 0;
  private neLastPosSec = -1;
  private neSongKey = "";

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
   * 每拍锚点订阅（v1.9.0）：轮询成功后必发（无论签名是否变化）。
   * 消费方转发轻量 tick {position,duration,playing,rate,fetchedAt} 给部件——
   * seek 后的新位置、插值漂移校正都靠它到达（完整快照只在签名变化时发）。 */
  onTick(cb: () => void): () => void {
    this.tickSubs.add(cb);
    return () => {
      this.tickSubs.delete(cb);
    };
  }
  private tickSubs = new Set<() => void>();
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
   *  v2.0.1：成功后 80ms 内补一拍（按钮图标/播放态最迟零点几秒内翻转，
   *  不再等下一轮询——真机「暂停/播放按钮反应太慢」的主因）；seek 成功记
   *  seekHold（4s 内信自己这条线，旧桥不重锚也不把乐观位置拽回） */
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
      const ok = j?.ok === true;
      if (ok) {
        if (cmd === "seek" && typeof position === "number") {
          this.seekHold = { pos: Math.max(0, position), at: Date.now() };
          /* 新 seek 发起：清上一条未生效提示（验证结果以本次为准） */
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
      if (!j || j.ok !== true || j.name !== "chushi-smtc-bridge") {
        throw new Error("not-chushi-smtc-bridge");
      }
      this.failStreak = 0;
      const prev = this.state.track;
      const track = normalizeTrack(j.track);
      /* v2.2.0：先判插件真值是否在场——真值每拍绝对重锚，时序伪影不可能累积，
       * 守卫链（harmonize/锚点保持）只对 SMTC-only（无插件/非网易云）启用 */
      const ne = normalizeNe(j.ne);
      const neLive = !!(track && ne && trackMatchesNe(track, ne));
      /* v2.0.1 旧桥伪影守卫（SMTC-only）：暂停冻结/恢复续接/持续偏移保持/本端 seek 保持 */
      if (track && prev && !neLive) this.harmonize(track, prev);
      else if (!track || !prev) {
        this.lastDelta = 0;
      }
      /* 锚点保持（v2.0.0，SMTC-only）：SMTC 的 Position 只在播放器主动上报时刷新——网易云实测
       * 整首歌期间 raw position 钉死（桥 v1.3.0 已在源头做时钟补偿；对旧桥在宿主
       * 侧兜底）：若曲目/播放态/速率/位置全部未变，则保留上一拍锚点（position+
       * fetchedAt），本地插值得以持续前进；任一变化（seek/切歌/暂停）才重锚。 */
      if (
        !neLive &&
        track &&
        prev &&
        track.title === prev.title &&
        track.app === prev.app &&
        track.playing === prev.playing &&
        track.rate === prev.rate &&
        Math.abs(track.position - prev.position) < 0.001
      ) {
        track.position = prev.position;
        track.fetchedAt = prev.fetchedAt;
      }
      /* v2.2.0 seekNote 过期清理（3.8s） */
      if (this.seekNote && Date.now() - this.seekNoteAt > 3800) {
        this.seekNote = "";
        this.state = { ...this.state, seekNote: "" };
        this.notify();
      }
      this.apply({ connected: true, version: typeof j.version === "string" ? j.version.slice(0, 16) : "", track }, ne);
      /* v2.2.0 seek 诚实验证：真值/seekAck 跟上→确认；未跟上→弹回+提示 */
      if (this.seekHold) this.verifySeek(neLive, ne);
      this.notifyTick(); // 每拍轻量锚点（seek/漂移校正，与签名无关）
    } catch {
      this.failStreak++;
      // 连续 2 次失败才判定桥离线（避免单次网络抖动把 UI 打成离线态）
      if (this.failStreak >= 2 && (this.state.connected || this.state.track)) {
        this.apply({ connected: false, version: "", track: null }, null);
      }
      next = RETRY_MS;
    }
    this.schedule(next);
  };

  /** v2.0.1 旧桥伪影守卫：同曲目前提下，抵御四类已知时序伪影，
   *  让 v1.2.x–v1.3.x 旧桥（暂停归零/恢复从头/seek 不重锚）也能表现正确：
   *  a) 本端 seek 保持：4s 内信 seek 目标这条线（旧桥不重锚时拖动不被拽回）；
   *  b) 暂停冻结：playing 翻 false 时 reported 大幅回退 → 冻结在本端插值处
   *     （合法暂停永远不会让进度倒退）；
   *  c) 恢复续接：playing 翻 true 且 reported≈0 而本端进度 >5s → 旧桥从 0 重数，
   *     续接冻结值；
   *  d) 持续偏移保持：reported 与本端时钟持续同偏移（旧桥整段旧基準）→ 保本端。
   *  真实时间线变化（外部 seek/切歌后首个拍）delta 突跳 → 放行接受。 */
  private harmonize(track: SmtcTrack, prev: SmtcTrack): void {
    const sameTrack = track.title === prev.title && track.app === prev.app;
    if (!sameTrack) {
      this.lastDelta = 0;
      this.seekHold = null;
      return;
    }
    const now = Date.now();
    const expected = smtcPositionNow(prev, now); // 本端时钟的当前进度
    const rdelta = track.position - expected; // reported 相对本端时钟的偏移
    /* a) 本端 seek 保持 */
    if (this.seekHold) {
      if (now - this.seekHold.at >= 4000) {
        this.seekHold = null;
      } else {
        const rate = track.rate > 0 ? track.rate : 1;
        const exp2 = this.seekHold.pos + (track.playing ? ((now - this.seekHold.at) / 1000) * rate : 0);
        if (Math.abs(track.position - exp2) > 2.5) {
          track.position = exp2;
          track.fetchedAt = now;
          this.lastDelta = rdelta;
          return;
        }
        this.seekHold = null; // reported 已跟上 seek 线，守卫退役
      }
    }
    /* b) 暂停冻结 */
    if (prev.playing && !track.playing) {
      if (track.position < expected - 3) {
        track.position = expected;
        track.fetchedAt = now;
      }
      this.lastDelta = rdelta;
      return;
    }
    /* c) 恢复续接 */
    if (!prev.playing && track.playing) {
      if (track.position < 2 && expected > 5) {
        track.position = expected;
        track.fetchedAt = now;
        this.lastDelta = rdelta;
        return;
      }
      this.lastDelta = 0;
      return;
    }
    /* d) 持续偏移保持 */
    if (Math.abs(rdelta) > 3 && Math.abs(rdelta - this.lastDelta) <= 1.5) {
      track.position = expected;
      track.fetchedAt = now;
      return; // lastDelta 不动（持续同偏移才算伪影）
    }
    this.lastDelta = rdelta;
  }

  /** v2.2.0 seek 诚实验证（真机「面板能拖但本体不动」的根治点：
   *  旧版盲目信任本端 seek 线 4s，插件直写未生效时进度条假跳再回跳，
   *  且 harmonize (d) 可能无限期钉住假线）。真值路径：插件心跳新鲜时对比
   *  el.currentTime 真值与 seek 线——跟上（≤2.5s）→确认；未跟上→弹回+提示；
   *  seekAck 快路径：插件 v1.2.0 实测校验结果直答（比宿主更权威、更快）；
   *  SMTC-only（无插件）：保留原 4s 信任窗（harmonize (a) 内消费）。 */
  private verifySeek(neLive: boolean, ne: NeState | null): void {
    const hold = this.seekHold;
    if (!hold) return;
    const now = Date.now();
    if (!neLive || !ne) {
      if (now - hold.at >= 4000) this.seekHold = null; // 旧桥/无插件：原信任窗
      return;
    }
    const t = this.state.track;
    const rate = t && t.rate > 0 ? t.rate : 1;
    const playing = t ? t.playing : true;
    const line = hold.pos + (playing ? ((now - hold.at) / 1000) * rate : 0);
    /* seekAck 快路径（插件双级实测校验直答） */
    if (
      ne.seekAckId &&
      ne.seekAckAt > 0 &&
      now - ne.seekAckAt < 3200 &&
      ne.seekAckAt >= hold.at - 600
    ) {
      if (ne.seekAckOk) {
        this.seekHold = null;
        return;
      }
      this.seekHold = null;
      this.setSeekNote(now);
      return;
    }
    /* 真值路径：插件心跳新鲜度补偿后的当前位置 */
    const age = ne.ts > 0 ? Math.max(0, Math.min(3, (now - ne.ts) / 1000)) : 0;
    const truth = ne.positionMs / 1000 + (ne.playing ? age * rate : 0);
    if (Math.abs(truth - line) <= 2.5) {
      this.seekHold = null; // 真值已跟上 seek 线
      return;
    }
    if (now - hold.at >= 2500) {
      /* 真值未跟上 → 下一拍 apply 已用真值锚定，进度条诚实弹回 */
      this.seekHold = null;
      this.setSeekNote(now);
    }
  }

  private setSeekNote(now: number): void {
    this.seekNote = "拖动未生效：播放器未响应";
    this.seekNoteAt = now;
    this.state = { ...this.state, seekNote: this.seekNote };
    this.notify();
  }

  /**
   * 应用新快照 + 网易云增强合并（v1.9.0 兑底合并 / v2.2.0 真值绝对锚定）。
   * 合并策略：歌词源可达且曲目匹配时——
   *   插件心跳新鲜（ts ≤3s，缺 ts 的旧插件视作新鲜）：进度/时长/播放态一律以
   *   插件真值为锚（el.currentTime 帧级真值，暂停/恢复/微 seek 1s 内绝对重锚）；
   *   心跳过期：退回 v1.9.0 兑底语义（SMTC 值缺失时才用插件值）；
   * SMTC 封面缺失时把插件 picUrl 写入 coverUrl（不变）。
   */
  private apply(
    next: { connected: boolean; version: string; track: SmtcTrack | null },
    ne: NeState | null,
  ): void {
    const t = next.track;
    let neUsable = false;
    if (t && ne && trackMatchesNe(t, ne)) {
      neUsable = true;
      const neFresh = ne.ts > 0 ? Math.abs(Date.now() - ne.ts) <= 3000 : true;
      if (neFresh) {
        /* v2.2.0 插件真值绝对锚定：插件在客户端内直读播放器（帧级真值），
         * 每秒心跳把锚点重锚到真值——暂停/恢复/微 seek 的插值漂移不可能累积。
         * v2.3.1 零值两击守卫：深位置后突报 ≈0 的首拍不采纳（延迟一拍），
         * 连续两拍或本端刚 seek 到开头才信——单拍垃圾零样本再也冻不住面板；
         * 播放态同样不在可疑零拍上翻转（状态反转观感的宿主侧根因）。 */
        if (ne.durationMs > 0) t.duration = ne.durationMs / 1000;
        const songKey = `${t.title}|${t.artist}`;
        if (songKey !== this.neSongKey) {
          this.neSongKey = songKey;
          this.neZeroStreak = 0;
          this.neLastPosSec = -1;
        }
        const posSec = ne.positionMs / 1000;
        const zeroDrop = posSec < 0.8 && this.neLastPosSec > 3;
        if (zeroDrop) this.neZeroStreak++; else this.neZeroStreak = 0;
        const seekToStart =
          !!this.seekHold && this.seekHold.pos <= 3 && Date.now() - this.seekHold.at < 4000;
        const trustZero = !zeroDrop || this.neZeroStreak >= 2 || seekToStart;
        if (posSec > 0 || trustZero) t.position = posSec;
        if (!zeroDrop || trustZero) t.playing = ne.playing;
        this.neLastPosSec = posSec;
      } else {
        /* 心跳过期：退回 v1.9.0 兑底语义（SMTC 值缺失时才用插件值） */
        if (t.duration <= 0 && ne.durationMs > 0) t.duration = ne.durationMs / 1000;
        if (t.position <= 0 && ne.positionMs > 0) t.position = ne.positionMs / 1000;
      }
    }
    const lyricRevNow = neUsable && ne!.lyricRev ? ne!.lyricRev : "";
    const prevCover = this.state.cover;
    const prevLyric = this.state.lyric;
    const coverRevNow = next.track?.coverRev ?? "";
    /* v2.3.0：pluginVer 不要求曲目匹配（插件在场即报——标题失配时页脚仍可诊断）；
     * seekNote/needsUpdate 变化也进签名（提示出现/消失都要广播）。
     * needsUpdate：桥 <1.7.1（一体化桥由插件部署）或插件 <1.4.0（真值熔断/
     * 部署读回校验/拉起退避）或插件不在场 —— 面板直接给「升级插件」芯片，
     * 版本漂移从症状可见。 */
    const pluginVerNow = ne ? ne.v : "";
    const seekNoteNow = this.seekNote;
    const needsUpdateNow =
      (next.connected && (!pluginVerNow || verLt(pluginVerNow, "1.4.0") || verLt(next.version, "1.7.1")));
    const sig =
      stateSig({
        connected: next.connected,
        version: next.version,
        track: next.track,
        lyricRev: lyricRevNow,
      }) + `|${pluginVerNow}|${seekNoteNow}|${needsUpdateNow ? 1 : 0}`;
    this.state = {
      ...next,
      cover: prevCover,
      coverUrl: neUsable && ne!.pic ? ne!.pic : null,
      lyric: prevLyric,
      lyricRev: lyricRevNow,
      pluginVer: pluginVerNow,
      seekNote: seekNoteNow,
      needsUpdate: needsUpdateNow,
    };
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
    // 歌词生命周期：rev 变化即重拉；无源（插件离线/曲目不匹配）则清空。
    // v2.1.0：同步维护 lyricWanted（重试/链式补拉的最新期望）
    if (lyricRevNow !== this.lyricRevDone) {
      this.lyricRevDone = lyricRevNow;
      this.lyricWanted = lyricRevNow;
      this.lyricTries = 0;
      if (lyricRevNow) {
        void this.fetchLyric(lyricRevNow);
      } else if (prevLyric) {
        this.state = { ...this.state, lyric: null };
      }
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

  /** 拉取歌词（rev 变化时调用；latest-wins 链式重试，曲目已变则丢弃）。
   *  v2.1.0：① inflight 期间 wanted 变化不再被静默跳过（finally 链式补拉）；
   *  ② 校验桥返回 rev——桥还是旧歌歌词时作失败重试，等待新词到位
   *  （旧桥无 rev 字段时跳过校验保持兼容）。 */
  private async fetchLyric(rev: string): Promise<void> {
    this.lyricWanted = rev;
    if (this.lyricInflight) return; // inflight 完成后会链到最新 wanted
    this.lyricInflight = true;
    try {
      const j = await this.fetchJson(`${BASE}/api/lyric?v=${encodeURIComponent(rev)}`);
      if (!j || j.ok !== true) throw new Error("no-lyric");
      if (this.state.lyricRev !== rev) return; // 曲目已变，丢弃（finally 链到最新）
      const jrev = typeof j.rev === "string" ? j.rev.slice(0, 64) : "";
      if (jrev && jrev !== rev) throw new Error("stale-lyric"); // 桥还是旧歌歌词，重试等新词
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
          /* v2.1.0：不再要求 state.lyric == null——切歌快照常保留上一曲歌词
             （rev 直变无清空步骤），旧条件会让「桥回旧词」的重试被永久抑制
             （真机「切歌后歌词概率加载不出来」的宿主侧最后一块拼图）；
             wanted/lyricRev 双守卫已足够：更新 rev 出现即由生命周期块接管 */
          if (this.lyricWanted === rev && this.state.lyricRev === rev) {
            void this.fetchLyric(rev);
          }
        }, 1200 * this.lyricTries);
      }
    } finally {
      this.lyricInflight = false;
      // latest-wins：inflight 期间期望 rev 又变了 → 立刻拉最新（旧桥静默跳过缺陷的根治点）
      const wanted = this.lyricWanted;
      if (wanted && wanted !== rev) void this.fetchLyric(wanted);
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
