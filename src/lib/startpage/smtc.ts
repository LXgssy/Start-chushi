/* 「初始」SMTC 媒体作用面（v3.0.1）—— 单主仲裁媒体引擎
 *
 * v3.0.0 双插件架构（根治多层真值互打的结构性冲突）：
 *   [本模块] 唯一仲裁层：NCM API 插件在场 → 网易云真值独占（进度/时长/播放态/
 *            元数据全部取自插件心跳，一次性年龄补偿，零混合零守卫）；
 *            否则 SMTC-only（harmonize 守卫链只服务这条路径）。
 *   [PS1 桥 v2.0.0] 纯传输：SMTC 会话 + ne 中转 + 插件注册表，不再修正任何真值
 *   [初始SMTC桥 插件] 桥进程生命周期唯一管理者（部署/杀旧/拉起/监督/注册上报）
 *   [初始网易云API 插件] 网易云真值唯一生产者（原生事件+锁定元素+seek 阶梯）
 * 旧版三层各自修正（插件 buildSnapshot → 桥 ne-anchoring → 宿主 harmonize/零值
 * 守卫/绝对锚定）互相打架，是状态反转/0.5x 爬行/冻死 0:00 的结构性根源——v3.0.0
 * 每数据单主：插件产真值，桥只传输，宿主只仲裁（在场判定+单次补偿）；harmonize/
 * 零值守卫只在 SMTC-only 兜底路径存在。网易云会话身份用桥 app 字段判定
 * （AUMID 归一为 "NetEase Music"，比标题模糊匹配可靠），标题匹配只作旧桥兜底。
 *
 * 对端：初始 SMTC 桥（bridge/smtc/，Windows PowerShell + WinRT 零依赖脚本，
 * 由「初始SMTC桥」插件自动部署/拉起/监督，也可双击 启动SMTC桥.bat 手动启动）。
 * 桥在本机 127.0.0.1:20754 暴露 HTTP：
 *   GET  /api/state              → {ok,name,version,track?,ne?,plugins?}
 *                                   （plugins.smtc = 管理插件自报版本，活体注册）
 *   GET  /api/cover?v=<coverRev> → 图片二进制（桥按 coverRev 内存缓存）
 *   POST /api/control            → {cmd: play|pause|toggle|next|prev|seek,
 *                                   position?} → {ok}（seek 转发网易云插件队列）
 *   GET  /api/lyric?v=<rev>      → 歌词载荷（网易云插件经桥中转）
 * 本模块 = 宿主内唯一消费方：1s 轮询 + 本地时钟插值出平滑进度；关键签名
 * （连接态/桥版本/管理插件版本/标题/歌手/专辑/播放态/来源/时长/封面版本/歌词版本）
 * 变化才广播完整快照；position 不进签名——每拍另发轻量锚点（onTick）供消费方
 * 校正插值基准（v1.9.0 tick 锚点律，seek 后新位置必达）。
 *
 * SMTC 是 Windows 系统级媒体会话（System Media Transport Controls）——
 * 网易云/QQ 音乐/Spotify/浏览器视频等任何注册 SMTC 的播放器都会出现；
 * 桥按「网易云优先 → 正在播放的会话 → 第一个会话」选择当前曲。
 *
 * 消费方（两通道同款 chushi.music / chushi.smtc API）：
 *   - 沙箱脚本通道：sandbox.ts 路由 → sandbox.js makeChushi()
 *   - 角落小部件通道：PresetWidgets.tsx 路由 → sandbox.js widgetShim()
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
  /** 网易云 API 插件版本（v3.0.0 语义：初始网易云API 插件；空串 = 心跳不在场） */
  pluginVer: string;
  /** v3.0.0：初始SMTC桥（管理插件）自报版本，桥 /api/state.plugins.smtc 活体注册；
   *  空串 = 管理插件未装/未注册（手动桥）或旧桥（无注册表） */
  smtcVer: string;
  /** seek 结果提示（v2.2.0；空串 = 无；「拖动未生效…」≈3.8s 后自动消失） */
  seekNote: string;
  /** v3.0.0 组件不齐（面板显示升级芯片）：needsPlugin || needsBridge */
  needsUpdate: boolean;
  /** v3.0.0 诚实归因：网易云API 插件缺失/损坏旧版/旧一体化待迁移
   *  （芯片文案由部件分叉：缺失→装新插件；<1.4.0→更新；1.4.0–1.5.1 旧一体化→迁移双插件） */
  needsPlugin: boolean;
  /** v3.0.0 诚实归因：桥不可达（装「初始SMTC桥」插件自动管理 或 手动 启动桥.bat）
   *  或「管理插件已注册但桥版本旧」= 旧桥进程杀不死（策略拦截）→ 手动指引 */
  needsBridge: boolean;
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

/** v3.0.0：桥 /api/state.plugins 注册表（管理插件活体自报） */
interface BridgePlugins {
  smtc: string;
}
function normalizePlugins(raw: unknown): BridgePlugins | null {
  if (typeof raw !== "object" || raw == null) return null;
  const o = raw as Record<string, unknown>;
  const smtc = typeof o.smtc === "string" ? o.smtc.slice(0, 16) : "";
  if (!smtc) return null;
  return { smtc };
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
  smtcVer: string;
  track: SmtcTrack | null;
  lyricRev: string;
}): string {
  const t = s.track;
  const tpart = t
    ? [t.app, t.title, t.artist, t.album, t.playing ? 1 : 0, t.duration, t.coverRev].join("|")
    : "none";
  return `${s.connected ? 1 : 0}|${s.version}|${s.smtcVer}|${tpart}|${s.lyricRev}`;
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
  /** v2.3.3 SMTC-only 诚实 seek：reported 连续未跟上 seek 线的拍数（≥2 → 放弃信任窗） */
  private smtcSeekMiss = 0;
  /* v3.0.0：ne 零值两击守卫已删除——单主律下插件真值零修正直纳
   * （插件自身已有零值/倒退/身份锁全套熔断，宿主再叠守卫就是旧版三层互打复辟） */

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
          this.smtcSeekMiss = 0;
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
      const ne = normalizeNe(j.ne);
      const plugins = normalizePlugins(j.plugins);
      /* v3.0.0 单主仲裁（唯一判定点）：网易云API 插件心跳在场 → 网易云真值独占；
       * 否则 SMTC-only（harmonize/锚点保持只服务这条路径）。
       * 会话身份优先用桥 app 字段（AUMID 归一 "NetEase Music"，权威）；
       * 标题匹配只作旧桥 app 名不可靠时的兜底。 */
      const ncmOwns = this.judgeNcmOwns(track, ne);
      if (track && prev && !ncmOwns) this.harmonize(track, prev);
      else if (!track || !prev) {
        this.lastDelta = 0;
      }
      /* 锚点保持（v2.0.0，SMTC-only 专属）：SMTC 的 Position 只在播放器主动上报时
       * 刷新（桥已在源头做时钟补偿；此处兜底旧桥）：若曲目/播放态/速率/位置全部
       * 未变，则保留上一拍锚点，本地插值得以持续前进；任一变化才重锚。 */
      if (
        !ncmOwns &&
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
      this.apply(
        {
          connected: true,
          version: typeof j.version === "string" ? j.version.slice(0, 16) : "",
          track,
        },
        ne,
        plugins,
        ncmOwns,
      );
      /* v2.2.0 seek 诚实验证：真值/seekAck 跟上→确认；未跟上→弹回+提示 */
      if (this.seekHold) this.verifySeek(ncmOwns, ne);
      this.notifyTick(); // 每拍轻量锚点（seek/漂移校正，与签名无关）
    } catch {
      this.failStreak++;
      // 连续 2 次失败才判定桥离线（避免单次网络抖动把 UI 打成离线态）
      if (this.failStreak >= 2 && (this.state.connected || this.state.track)) {
        this.apply({ connected: false, version: "", track: null }, null, null, false);
      }
      next = RETRY_MS;
    }
    this.schedule(next);
  };

  /** v3.0.0 单主判定（唯一仲裁点）：网易云API 插件心跳是否独占本次快照。
   *  在场 = 心跳新鲜（ts ≤3s，缺 ts 的旧插件视作新鲜）且有歌名。
   *  身份：桥选中网易云会话（app==="NetEase Music"，AUMID 归一，权威）→ 独占；
   *  app 名不可靠（旧桥）时退化到标题匹配；NCM 正在播放时无条件独占
   *  （用户听到的是网易云——修「面板显示其它应用/暂停态而网易云在响」的反转）。
   *  v3.0.1：桥无会话（track=null）时 ne 新鲜即独占——网易云开着（心跳新鲜）
   *  是比「桥抓没抓到 SMTC 会话」更硬的事实；apply 端以 ne 构造虚拟曲目
   *  （旧版此处 return ne.playing 而 apply 只认 t 非空 → 真值被判独占却无人
   *  消费 → 回退 SMTC-only → 网易云 SMTC position 冻结 → 进度/时间/逐字歌词
   *  全冻结的四症状形态）。 */
  private judgeNcmOwns(t: SmtcTrack | null, ne: NeState | null): boolean {
    if (!ne || !ne.title) return false;
    const fresh = ne.ts > 0 ? Math.abs(Date.now() - ne.ts) <= 3000 : true;
    if (!fresh) return false;
    if (!t) return true;
    if (t.app === "NetEase Music") return true;
    return trackMatchesNe(t, ne) || ne.playing;
  }

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
      this.smtcSeekMiss = 0;
      return;
    }
    const now = Date.now();
    const expected = smtcPositionNow(prev, now); // 本端时钟的当前进度
    const rdelta = track.position - expected; // reported 相对本端时钟的偏移
    /* a) 本端 seek 保持（v2.3.3：诚实判定——reported 连续 ≥2 拍未跟上 seek 线
       即视为播放器未响应：停止覆盖 reported、退出信任窗、提示「拖动未生效」
       （旧版 4s 内无条件钉住假线，SMTC 真没跳时进度条假跳 4s 才被放行回跳且无提示
       =「面板能拖但实际没动」的 SMTC-only 侧根因） */
    if (this.seekHold) {
      const rate = track.rate > 0 ? track.rate : 1;
      const exp2 = this.seekHold.pos + (track.playing ? ((now - this.seekHold.at) / 1000) * rate : 0);
      if (now - this.seekHold.at >= 4000 || Math.abs(track.position - exp2) <= 2.5) {
        this.seekHold = null; // 跟上 seek 线 / 信任窗到期：守卫退役
        this.smtcSeekMiss = 0;
      } else if (Math.abs(track.position - exp2) > 2.5) {
        this.smtcSeekMiss++;
        if (this.smtcSeekMiss >= 2) {
          this.seekHold = null; // 播放器未响应：放行真实位置（apply 已按 reported 锚定）
          this.smtcSeekMiss = 0;
          this.lastDelta = 0; // 防 (d) 持续偏移守卫把假线重新钉回
          this.setSeekNote(now); // 诚实提示「拖动未生效」
        } else {
          track.position = exp2; // 首拍仍钉乐观线（给播放器一拍反应时间）
          track.fetchedAt = now;
          this.lastDelta = rdelta;
          return;
        }
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
      /* SMTC-only：诚实判定由 harmonize(a) 接管（连续 2 拍未跟上 → 弹回+提示），
         这里只兜底信任窗到期 */
      if (now - hold.at >= 4000) { this.seekHold = null; this.smtcSeekMiss = 0; }
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
   * 应用新快照（v3.0.0 单主合并——每数据单主，零混合）。
   * ncmOwns=true（tick 已判定）：进度/时长/播放态/元数据全部取自插件心跳，
   *   仅做一次性年龄补偿（插件采样时刻 → 此刻，之后由 fetchedAt 插值接管）；
   *   无任何守卫/降级/零值猜测——插件真值原样即唯一事实。
   * ncmOwns=false：SMTC-only 路径，track 保持 harmonize 后的值原样生效。
   * 封面：SMTC 封面缺失时插件 picUrl 写入 coverUrl（两条路径一致）。
   */
  private apply(
    next: { connected: boolean; version: string; track: SmtcTrack | null },
    ne: NeState | null,
    plugins: BridgePlugins | null,
    ncmOwns: boolean,
  ): void {
    const now = Date.now();
    let neUsable = false;
    if (ncmOwns && ne) {
      neUsable = true;
      /* v3.0.1 虚拟曲目兜底：桥未抓到网易云 SMTC 会话（HasSession=false，
       * 真机常见——网易云新版 SMTC 注册/会话抢占）时以插件B 真值构造面板
       * 曲目，绝不因 SMTC 会话缺失而弃用有效真值（旧版此处整块跳过 →
       * 面板回退 SMTC-only → 网易云 SMTC position 冻结 → 进度/时间/逐字
       * 歌词全冻结 + 播放态漂移的四症状形态）。 */
      const t: SmtcTrack = next.track ?? {
        app: "NetEase Music",
        title: "",
        artist: "",
        album: "",
        playing: false,
        position: 0,
        duration: 0,
        rate: 1,
        coverRev: "",
        fetchedAt: now,
      };
      /* 网易云真值独占：元数据/时长/位置/播放态全部来自插件（单源，零混合） */
      t.title = ne.title;
      t.artist = ne.artist;
      if (ne.album) t.album = ne.album;
      if (ne.durationMs > 0) t.duration = ne.durationMs / 1000;
      const rate = t.rate > 0 ? t.rate : 1;
      const age = Math.max(0, Math.min(3, ne.ts > 0 ? (now - ne.ts) / 1000 : 0));
      let posSec = ne.positionMs / 1000 + (ne.playing ? age * rate : 0);
      if (t.duration > 0 && posSec > t.duration) posSec = t.duration;
      t.position = Math.max(0, posSec);
      t.fetchedAt = now;
      t.playing = ne.playing;
      t.app = "NetEase Music"; /* 虚拟/旧桥 app 名统一归一 */
      next.track = t;
    }
    const lyricRevNow = neUsable && ne!.lyricRev ? ne!.lyricRev : "";
    const prevCover = this.state.cover;
    const prevLyric = this.state.lyric;
    const coverRevNow = next.track?.coverRev ?? "";
    /* pluginVer 不要求曲目匹配（插件在场即报）；smtcVer = 管理插件活体注册；
     * seekNote/needsUpdate 变化也进签名（提示出现/消失都要广播）。 */
    const pluginVerNow = ne ? ne.v : "";
    const smtcVerNow = plugins ? plugins.smtc : "";
    const seekNoteNow = this.seekNote;
    /* v3.0.0 诚实归因（每个标志都有一一对应的可行操作，绝不空喊）：
     * needsPlugin：网易云API 插件缺失（装新插件即有逐字歌词/精确进度/seek）；
     *   版本 <1.4.0（损坏旧版，更新修复）；1.4.0–1.5.1 旧一体化（仍工作但属
     *   旧架构，芯片给迁移双插件指引）。
     * needsBridge：桥不可达（装「初始SMTC桥」自动管理 或 手动 启动桥.bat）；
     *   或「管理插件已注册但桥版本旧」= 旧桥进程杀不死（策略拦截实锤）→
     *   给手动指引，绝不喊无效的「更新 .plugin」（v2.3.2 教训延续）。 */
    const needsPluginNow =
      next.connected &&
      (!pluginVerNow || verLt(pluginVerNow, "1.4.0") || verLt(pluginVerNow, "2.0.0"));
    const needsBridgeNow =
      !next.connected || (!!smtcVerNow && verLt(next.version, "2.0.0"));
    const needsUpdateNow = needsPluginNow || needsBridgeNow;
    const sig =
      stateSig({
        connected: next.connected,
        version: next.version,
        smtcVer: smtcVerNow,
        track: next.track,
        lyricRev: lyricRevNow,
      }) + `|${pluginVerNow}|${smtcVerNow}|${seekNoteNow}|${needsPluginNow ? 1 : 0}|${needsBridgeNow ? 1 : 0}`;
    this.state = {
      ...next,
      cover: prevCover,
      coverUrl: neUsable && ne!.pic ? ne!.pic : null,
      lyric: prevLyric,
      lyricRev: lyricRevNow,
      pluginVer: pluginVerNow,
      smtcVer: smtcVerNow,
      seekNote: seekNoteNow,
      needsUpdate: needsUpdateNow,
      needsPlugin: needsPluginNow,
      needsBridge: needsBridgeNow,
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
