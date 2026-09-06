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
  };
}

/** 曲目与网易云插件状态是否指同一首歌（标题双向包含即认；SMTC 标题常带修饰） */
function trackMatchesNe(t: SmtcTrack, ne: NeState): boolean {
  const a = t.title.trim().toLowerCase();
  const b = ne.title.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
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

class SmtcClient {
  private state: SmtcState = {
    connected: false,
    version: "",
    track: null,
    cover: null,
    coverUrl: null,
    lyric: null,
    lyricRev: "",
  };
  private subs = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private failStreak = 0;
  private lastSig = "0||none|";
  /** 已成功取到封面的 coverRev（同版不重拉） */
  private coverRevDone = "";
  private coverTries = 0;
  /** 已拉取的歌词 rev（同版不重拉）；拉取中标记防并发 */
  private lyricRevDone = "";
  private lyricInflight = false;
  private lyricTries = 0;
  /** v2.0.1 旧桥伪影守卫状态：上一拍 reported-expected 偏移（delta 一致性记忆） */
  private lastDelta = 0;
  /** v2.0.1 本端发起的 seek（成功后 4s 内信自己这条线，防旧桥旧基準拽回） */
  private seekHold: { pos: number; at: number } | null = null;

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
      /* v2.0.1 旧桥伪影守卫（桥 v1.4.0 已在源头修好，本段让旧桥也全对）：
       * 暂停冻结/恢复续接/持续偏移保持/本端 seek 保持——见 harmonize 内注释 */
      if (track && prev) this.harmonize(track, prev);
      else {
        this.lastDelta = 0;
      }
      /* 锚点保持（v2.0.0）：SMTC 的 Position 只在播放器主动上报时刷新——网易云实测
       * 整首歌期间 raw position 钉死（桥 v1.3.0 已在源头做时钟补偿；对旧桥在宿主
       * 侧兜底）：若曲目/播放态/速率/位置全部未变，则保留上一拍锚点（position+
       * fetchedAt），本地插值得以持续前进；任一变化（seek/切歌/暂停）才重锚。 */
      if (
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
      const ne = normalizeNe(j.ne);
      this.apply({ connected: true, version: typeof j.version === "string" ? j.version.slice(0, 16) : "", track }, ne);
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

  /**
   * 应用新快照 + 网易云增强合并（v1.9.0）。
   * 合并策略：歌词源可达且曲目匹配时——duration/position 缺失（0）用插件值兑底；
   * SMTC 封面缺失时把插件 picUrl 写入 coverUrl；二者均有则保持 SMTC（会话权威）。
   */
  private apply(
    next: { connected: boolean; version: string; track: SmtcTrack | null },
    ne: NeState | null,
  ): void {
    const t = next.track;
    let neUsable = false;
    if (t && ne && trackMatchesNe(t, ne)) {
      neUsable = true;
      // 插值钟兑底：SMTC 时间轴缺失（0）时用插件帧级进度（曲目已匹配才动）
      if (t.duration <= 0 && ne.durationMs > 0) t.duration = ne.durationMs / 1000;
      if (t.position <= 0 && ne.positionMs > 0) t.position = ne.positionMs / 1000;
    }
    const lyricRevNow = neUsable && ne!.lyricRev ? ne!.lyricRev : "";
    const prevCover = this.state.cover;
    const prevLyric = this.state.lyric;
    const coverRevNow = next.track?.coverRev ?? "";
    const sig = stateSig({
      connected: next.connected,
      version: next.version,
      track: next.track,
      lyricRev: lyricRevNow,
    });
    this.state = {
      ...next,
      cover: prevCover,
      coverUrl: neUsable && ne!.pic ? ne!.pic : null,
      lyric: prevLyric,
      lyricRev: lyricRevNow,
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
    // 歌词生命周期：rev 变化即重拉；无源（插件离线/曲目不匹配）则清空
    if (lyricRevNow !== this.lyricRevDone) {
      this.lyricRevDone = lyricRevNow;
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

  /** 拉取歌词（rev 变化时调用；失败限次重试，曲目已变则丢弃） */
  private async fetchLyric(rev: string): Promise<void> {
    if (this.lyricInflight) return;
    this.lyricInflight = true;
    try {
      const j = await this.fetchJson(`${BASE}/api/lyric?v=${encodeURIComponent(rev)}`);
      if (!j || j.ok !== true) throw new Error("no-lyric");
      if (this.state.lyricRev !== rev) return; // 曲目已变，丢弃
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
      if (this.lyricTries <= 3) {
        setTimeout(() => {
          if (this.state.lyricRev === rev && this.state.lyric == null) void this.fetchLyric(rev);
        }, 1500 * this.lyricTries);
      }
    } finally {
      this.lyricInflight = false;
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
