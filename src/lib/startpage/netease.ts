/* 「初始」网易云直链播放 API（v8.7.23 方案二数据层）— 宿主侧
 *
 * 架构律：预设 widget 跑在 sandbox="allow-scripts" 不透明源 iframe 里，无任何
 * 跨域能力 → 全部请求经 widgetApi 桥回宿主（扩展页），宿主加密直连 music.163.com
 * （host_permissions 的 https 星号通配已覆盖授权面，v8.3.1 注入兜底律，零增量）。
 *
 * 登录态 = 浏览器 cookie jar 的 MUSIC_U：fetch credentials:'include' 自动携带 +
 * 响应 Set-Cookie 自动回存（扫码登录 803 即入 jar），宿主不落盘任何凭证；
 * 若用户在浏览器里登录过网易云网页版，打开播放器即继承登录态。
 *
 * weapi 加密 = 公开算法事实的独立实现（双层 AES-128-CBC：固定钥 0CoJUm6Qyw8W8jud
 * + 随机 16 位钥，IV 0102030405060708；随机钥倒序后以固定 RSA 公钥无填充加密 →
 * 表单 params + encSecKey）。端点面与 FPSMasterTeam/Cadence（MIT）对齐并经
 * 实测收敛：cloudsearch 有反爬（50000005）改用老 search/get；v3/song/detail
 * 补封面；未登录每日推荐可用（免登录即可播）。
 *
 * 音频 = 宿主侧 <audio> 单例 + MediaSession：队列/播放模式逻辑在 widget，
 * 宿主只做哑播放器；MediaSession 让系统媒体会话出现本播放器 → 现有 SMTC 桥
 * /音乐面板/全局歌词读系统会话即天然互通。widget 点击经 user activation 向
 * 祖先链传播，宿主 audio.play() 合法（无 NotAllowedError）。
 */

/* ---------- weapi 加密 ---------- */

const PRESET_KEY = "0CoJUm6Qyw8W8jud";
const IV = "0102030405060708";
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const RSA_E = 0x10001n;
/* 固定 RSA 公钥（weapi 公开常量） */
const RSA_N = BigInt(
  "0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725" +
    "152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312" +
    "ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424" +
    "d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7"
);

const TE = new TextEncoder();

function b64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

async function aesCbc(text: string, key: string): Promise<string> {
  const ck = await crypto.subtle.importKey("raw", TE.encode(key), "AES-CBC", false, ["encrypt"]);
  const out = await crypto.subtle.encrypt({ name: "AES-CBC", iv: TE.encode(IV) }, ck, TE.encode(text));
  return b64(out);
}

/** 网易 RSA：明文倒序 → BigInteger → c = m^e mod n（无填充）→ 256 位 hex */
function rsaHex(text: string): string {
  const rev = TE.encode(text).slice().reverse();
  let hex = "";
  for (const b of rev) hex += b.toString(16).padStart(2, "0");
  return ((BigInt("0x" + hex) ** RSA_E) % RSA_N).toString(16).padStart(256, "0");
}

function randKey(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += B62[b % 62];
  return s;
}

/* ---------- 端点白名单（实测收敛面） ---------- */

export const NE_PATHS: ReadonlySet<string> = new Set([
  "/weapi/search/get", // 搜索（老端点；cloudsearch 有反爬 50000005）
  "/weapi/v3/song/detail", // 封面/专辑补全（老搜索响应无 picUrl）
  "/weapi/song/enhance/player/url/v1", // 播放直链
  "/weapi/song/lyric", // 歌词（lv/tv/yv=-1 拉 LRC+翻译+YRC 逐字）
  "/weapi/logout", // 退出登录（服务端 Set-Cookie 清 MUSIC_U，cookie jar 即登录态）
  "/weapi/w/nuser/account/get", // 登录态
  "/weapi/login/qrcode/unikey", // 扫码登录①
  "/weapi/login/qrcode/client/login", // 扫码登录②轮询
  "/weapi/v3/discovery/recommend/songs", // 每日推荐（未登录可用）
  "/weapi/user/playlist", // 我的歌单（登录）
  "/weapi/v6/playlist/detail", // 歌单曲目（登录）
]);

export async function neCall(path: string, params: Record<string, string>): Promise<unknown> {
  if (!NE_PATHS.has(path)) throw new Error("非白名单端点");
  const secKey = randKey();
  const first = await aesCbc(JSON.stringify(params ?? {}), PRESET_KEY);
  const body = new URLSearchParams({
    params: await aesCbc(first, secKey),
    encSecKey: rsaHex(secKey),
  });
  const r = await fetch("https://music.163.com" + path, {
    method: "POST",
    body,
    credentials: "include",
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

/* ---------- 宿主哑播放器（队列逻辑在 widget） ---------- */

export interface NeAudioMeta {
  id: string;
  name: string;
  artist: string;
  album: string;
  cover: string;
  trial: boolean;
}

export interface NeAudioState {
  id: string;
  name: string;
  artist: string;
  album: string;
  cover: string;
  trial: boolean;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  /** 单调递增：widget 据此去重一次性标志 */
  seq: number;
  /** 一次性：曲目自然播完（widget 推进队列） */
  ended: boolean;
  /** 一次性：系统媒体键指令（MediaSession 硬件键 → widget 队列操作） */
  sysCmd: "" | "next" | "prev";
}

const EMPTY_META: NeAudioMeta = { id: "", name: "", artist: "", album: "", cover: "", trial: false };

let audio: HTMLAudioElement | null = null;
let meta: NeAudioMeta = EMPTY_META;
let seq = 0;
let endedFlag = false;
let sysCmd: NeAudioState["sysCmd"] = "";
let msWired = false;

const listeners = new Set<(s: NeAudioState) => void>();

export function onNeAudio(cb: (s: NeAudioState) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function neAudioState(): NeAudioState {
  return {
    id: meta.id,
    name: meta.name,
    artist: meta.artist,
    album: meta.album,
    cover: meta.cover,
    trial: meta.trial,
    playing: audio ? !audio.paused && !audio.ended : false,
    position: audio ? audio.currentTime : 0,
    duration: audio && Number.isFinite(audio.duration) ? audio.duration : 0,
    volume: audio ? audio.volume : 1,
    seq,
    ended: endedFlag,
    sysCmd,
  };
}

function notify() {
  seq++;
  const s = neAudioState();
  for (const l of listeners) {
    try {
      l(s);
    } catch {
      /* 单个订阅者异常不断链 */
    }
  }
  /* 一次性标志随 seq 发出后即刻清位（下拍不再重复） */
  endedFlag = false;
  sysCmd = "";
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = "auto";
  /* 挂入 DOM：游离媒体元素有被 GC 中途回收的风险，且便于观测/测试 */
  a.setAttribute("data-ne-audio", "1");
  a.style.display = "none";
  try {
    document.body.appendChild(a);
  } catch {
    /* 无 body 的极端时机静默（音频仍可用） */
  }
  a.addEventListener("timeupdate", notify);
  a.addEventListener("loadedmetadata", notify);
  a.addEventListener("durationchange", notify);
  a.addEventListener("play", notify);
  a.addEventListener("pause", notify);
  a.addEventListener("volumechange", notify);
  a.addEventListener("ended", () => {
    endedFlag = true;
    notify();
  });
  a.addEventListener("error", notify);
  audio = a;
  return a;
}

function wireMediaSession(a: HTMLAudioElement) {
  if (msWired || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  msWired = true;
  const ms = navigator.mediaSession;
  try {
    ms.setActionHandler("play", () => {
      a.play().catch(() => {});
    });
    ms.setActionHandler("pause", () => a.pause());
    ms.setActionHandler("previoustrack", () => {
      sysCmd = "prev";
      notify();
    });
    ms.setActionHandler("nexttrack", () => {
      sysCmd = "next";
      notify();
    });
    ms.setActionHandler("seekto", (d) => {
      if (d.seekTime != null && a.src) a.currentTime = d.seekTime;
    });
  } catch {
    /* 老内核缺 handler 类型 */
  }
}

/* v8.7.24：队列指令注入——SW 反向控制回程（悬浮卡/全局浮窗命令）→ widget
   队列推进，与 MediaSession 硬件键 sysCmd 同通道同一次性语义（随 seq 发出
   后即刻清位）；队列逻辑在 widget，宿主保持哑播放器不越权 */
export function neAudioSys(cmd: "next" | "prev"): void {
  sysCmd = cmd;
  notify();
}

export type NeAudioAct = "load" | "meta" | "play" | "pause" | "toggle" | "seek" | "vol" | "stop";

export async function neAudioAct(
  act: NeAudioAct,
  o: { url?: string; meta?: Partial<NeAudioMeta>; position?: number; volume?: number } = {}
): Promise<NeAudioState> {
  const a = ensureAudio();
  wireMediaSession(a);
  switch (act) {
    case "load": {
      const m = o.meta ?? {};
      meta = {
        id: String(m.id ?? "").slice(0, 32),
        name: String(m.name ?? "").slice(0, 80),
        artist: String(m.artist ?? "").slice(0, 80),
        album: String(m.album ?? "").slice(0, 80),
        cover: String(m.cover ?? "").slice(0, 300),
        trial: m.trial === true,
      };
      endedFlag = false;
      sysCmd = "";
      a.src = String(o.url ?? "").slice(0, 600);
      a.load();
      await a.play(); /* user activation 已随 widget 点击传播到宿主 */
      if ("mediaSession" in navigator && meta.name) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: meta.name,
            artist: meta.artist,
            album: meta.album,
            artwork: meta.cover ? [{ src: meta.cover, sizes: "300x300", type: "image/jpeg" }] : [],
          });
        } catch {
          /* 老 MediaMetadata 缺 artwork 支持时静默 */
        }
      }
      break;
    }
    case "meta": {
      /* 只更新元数据/媒体会话（封面异步回填等），不动播放流 */
      const m = o.meta ?? {};
      if (m.id != null) meta.id = String(m.id).slice(0, 32);
      if (m.name != null) meta.name = String(m.name).slice(0, 80);
      if (m.artist != null) meta.artist = String(m.artist).slice(0, 80);
      if (m.album != null) meta.album = String(m.album).slice(0, 80);
      if (m.cover != null) meta.cover = String(m.cover).slice(0, 300);
      if (m.trial != null) meta.trial = m.trial === true;
      if ("mediaSession" in navigator && meta.name && msWired) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: meta.name,
            artist: meta.artist,
            album: meta.album,
            artwork: meta.cover ? [{ src: meta.cover, sizes: "300x300", type: "image/jpeg" }] : [],
          });
        } catch {
          /* 忽略 */
        }
      }
      break;
    }
    case "play":
      await a.play();
      break;
    case "pause":
      a.pause();
      break;
    case "toggle":
      if (a.paused) await a.play();
      else a.pause();
      break;
    case "seek":
      if (a.src && typeof o.position === "number" && Number.isFinite(o.position)) {
        a.currentTime = Math.max(0, Math.min(a.duration || 1e9, o.position));
      }
      break;
    case "vol":
      if (typeof o.volume === "number" && Number.isFinite(o.volume)) {
        a.volume = Math.max(0, Math.min(1, o.volume));
      }
      break;
    case "stop":
      a.pause();
      a.removeAttribute("src");
      meta = EMPTY_META;
      break;
    default:
      throw new Error("未知 audio act");
  }
  notify();
  return neAudioState();
}
