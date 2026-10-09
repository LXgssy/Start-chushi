/* ============================================================================
 * 「初始」ext-bg v8.3.1 —— MV3 Service Worker：跨页面音乐卡状态中继
 *
 * v8.7.65 悬浮卡武装门（cardArmed，用户实测：未装 SMTC 预设但网易云装了
 *   初始桥 → 网页音乐浮窗凭空出现）：hub 数据面（探测/真值/命令/频谱助手）
 *   是「初始 · SMTC 音乐」预设的家族功能——预设未在装时 SW 不与 hub 通话。
 *   武装位由「初始」页面侧镜像（chrome.storage.local.cardArmed，缺省
 *   false = 未武装诚实降级）；onChanged 热跟随，卸载预设当拍退散。
 *   ne 数据面（内置播放器）不受此门。
 * v8.3.1 注入兜底（用户实机：快捷服务进入网页浮窗不显示）：manifest 注入
 *   在某些环境偶发缺席（干净 Chromium 三路径实测全过 = 环境性缺针）——
 *   卡片首连后 tabs 全量清扫 + tabs.onUpdated complete 逐个补针
 *   （chrome.scripting.executeScript，隔离世界幂等守卫防双挂载）。
 *   manifest 同步 +scripting 权限 + http/https host_permissions。
 * v8.3.0 数据面休眠退役（用户指令「不要休眠音乐面板」——切歌后面板留在
 *   上一首）：visCount 门整体拆除。旧版「全部卡片 hidden → state 轮询
 *   整体停」依赖 vis 消息时序，存在漏拍窗口：停摆期内的切歌真值永远
 *   丢失，恢复可见后若无新拍驱动就一直停留在上一首。现在只要还有卡片
 *   Port 在册就持续 1Hz 拉真值广播；可见性只继续管频谱订阅（specWanted
 *   门照旧——那是渲染律动需求，不是真值需求）。成本核算：1Hz 回环 GET
 *   + 广播 ≈ 每秒两个微任务量级，无感；SW 因每秒 postMessage 保活不再
 *   休眠——这是本律的代价与目的（真值永不断流）。
 * v8.2.9 频段细化透传：/api/spectrum 的 bands 上限 16→128（v8.2.9 native
 *   FFT 频段细化数据面；旧 native 16 段帧原样透传，消费端自适应）。
 *   包体 ~0.9KB/帧 @30Hz ≈ 27KB/s 环回，无感。
 * v8.2.6 性能特供（「5070 卡成屎」根治·SW 需求门律）：
 *   ① spec 广播精准化——broadcastSpec 只发 __spec 订阅卡（旧版全量扇出
 *      给所有 cards，N 标签 = 20msg/s × N 的 renderer 唤醒风暴）；
 *      state 保留全发（1s × N 便宜且所有浮窗都需要）。
 *   ② paused 空转帧翻转门——旧版 !playing 时每 50ms 发一条 on:false
 *      （纯浪费 20msg/s）；现只在 on→off 翻转时发一条熄辉光。
 *   ③ {type:"vis"} 卡片可见性上报——v8.3.0 退役（数据面休眠拆除，见顶部）；
 *      v8.2.6 旧律（visCount===0 时 state 轮询整体停）已删。
 * v8.2.5（电流音根治·引擎零扰律，SW 侧）：频谱轮询 33ms→50ms（30Hz→20Hz）。
 * v8.2.8 用户反馈「高光律动和歌曲有一点延迟」：轮询 50→33ms 回到 30Hz
 *   （native FFT 同步 50→25ms=40Hz；本机回环 GET 开销微秒级，30/s 无感），
 *   端到端帧龄上限 50→~58ms、均值 ~33→~16ms；seek 后 500/1200ms 补拉真值
 *   （网易云执行 seek 需数百 ms，命令后立即一拍常是旧值——歌词/进度尽快
 *   对上，卡片护航窗过滤陈旧拍）。
 *
 * 想法一（悬浮音乐卡置顶所有网页）的数据面。架构律：
 *   1. 播放永远在网易云——本 SW 只做「hub 真值 → 卡片」中继与「卡片 → hub」
 *      命令代理，零仲裁零加工（与页面端 smtc.ts 同宪法）。
 *   2. 内容脚本不直连 127.0.0.1（Chrome 私网访问策略必拦）——一切经本 SW。
 *   3. 诚实降级：hub 不在场 → 不广播状态（卡片自然隐没），绝不伪造。
 *   4. 惰性律：有卡片在线才轮询真值（1s）；有卡片要频谱且播放中才轮询
 *      助手（30Hz）；零卡片零轮询（SW 可睡，卡片 onDisconnect/重连自愈）。
 *   5. 频谱助手发现与 smtc.ts 同语义：先探测 26911-3 身份，不在则打 hub
 *      /api/spectrum-boot 惰性拉起（companion: chushi-spectrum.exe）。
 * 消息面（runtime Port，name="chushi-card"）：
 *   SW→卡：{type:"state",track,at} / {type:"spec",on,bass,bands,t}
 *          / {type:"cmdOk",id,ok} / {type:"lyric",key,ok,lyric}
 *   卡→SW：{type:"cmd",cmd,position,id} / {type:"spec",on} / {type:"ping"}
 *          / {type:"openPanel"} / {type:"lyric",songId,title,key}
 * ==========================================================================*/

"use strict";

/* storage.session 默认不对内容脚本开放——卡片「按站隐藏（会话级）」需要
   显式放行（SW 启动即设，幂等）。 */
try {
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
} catch (e) { /* 旧内核无此 API：卡片会退化为本次内存态 */ }

/* ------------------------------------------------------------------ */
/* v8.3.1 内容脚本注入兜底（用户实机：从「初始」快捷服务进入网页浮窗     */
/*   不显示——manifest 注入在某些环境（Edge 启动加速/NTP 同签导航窗口）   */
/*   偶发缺席；干净 Chromium 三路径实测全过 = 环境性缺针）。兜底律：      */
/*   ① 卡片 Port 首连后全量清扫一遍已开的 http/https 标签；              */
/*   ② tabs.onUpdated complete 再逐个补针。                              */
/*   executeScript 默认隔离世界 = manifest 注入同世界，ext-card.js 顶部   */
/*   __chushiCardMounted 幂等守卫天然防双挂载；豁免权：music 场景才动    */
/*   （state 在场或已有卡片在线），无曲场景零打扰；同标签 15s 节流。      */
/* ------------------------------------------------------------------ */
const injRecent = new Map();   /* tabId -> ts */
let injSwept = false;
async function ensureCardInjected(tabId, url) {
  if (!state && cards.size === 0) return;      /* 无曲场景：零打扰 */
  if (!/^https?:/i.test(url || "")) return;    /* 特权页/扩展页：诚实边界 */
  const now = Date.now();
  if (now - (injRecent.get(tabId) || 0) < 15000) return;
  injRecent.set(tabId, now);
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["ext-card.js"] });
  } catch { /* 页面瞬态/卸载中：静默 */ }
}
async function sweepInjectAll() {
  if (injSwept) return;
  injSwept = true;
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const t of tabs) void ensureCardInjected(t.id, t.url);
  } catch { /* tabs API 瞬态：下一连接再扫 */ }
}
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info && info.status === "complete") void ensureCardInjected(tabId, tab && tab.url);
});

const HUB_PORTS = [26901, 26902, 26903];
const SPEC_PORTS = [26911, 26912, 26913];
const HUB_NAME = "chushi-music-hub";
const SPEC_NAME = "chushi-spectrum";
const CMD_SET = new Set(["play", "pause", "toggle", "next", "prev", "seek"]);

let hubPort = null;      /* 粘住的 hub 端口 */
let specPort = null;     /* 粘住的频谱助手端口 */
let specFails = 0;
let bootBeats = 0;
let state = null;        /* 最近真值（清洗后 track） */
let stateAt = 0;
let playing = false;
let stateTimer = null;
let specTimer = null;
let specSentOn = null; /* v8.2.6：paused 空转帧翻转门（null=未发过） */

const cards = new Set();

/* v8.7.65 悬浮卡武装门（cardArmed，页面侧镜像见 use-start-presets）：
   hub 数据面（探测/真值/命令/频谱助手）是「初始 · SMTC 音乐」预设的
   家族功能——预设未在装时 SW 不与 hub 通话（桥在装≠浮窗该显，用户实测：
   未装 SMTC 预设、网易云装了初始桥 → 网页音乐浮窗凭空出现）。
   缺省 false = 未武装诚实降级（与「hub 不在场不广播」同宪法，SW 启动即
   读真值）；onChanged 热跟随：升 true 立即补拉一拍真值+频谱循环（卡片
   已在线场合免等下拍），降 false 立即弃真值并广播空帧（卡侧 has=false
   自然隐没，卸载预设当拍退散）。
   ne 数据面（内置播放器 v8.7.24）不受此门——由播放器预设自身在装+放歌
   驱动；歌词代理照旧（ne 缓存未命中时同曲 hub 兜底仍可用，无真值则无
   请求入口）。 */
var cardArmed = false;
try {
  chrome.storage.local.get("cardArmed", function (o) {
    cardArmed = !!(o && o.cardArmed);
  });
} catch (e) { cardArmed = false; }
try {
  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area !== "local" || !ch.cardArmed) return;
    var next = !!ch.cardArmed.newValue;
    if (next === cardArmed) return;
    cardArmed = next;
    if (next) {
      if (cards.size > 0) {
        void pollState();
        if (specWanted() > 0) ensureSpecLoop();
      }
    } else {
      state = null;
      stateAt = 0;
      if (specTimer) { clearInterval(specTimer); specTimer = null; specPort = null; }
      if (cards.size > 0) void pollState(); /* 立即广播 ne-or-null：卡侧退散不等下拍 */
    }
  });
} catch (e) { /* noop */ }

async function getJson(url, timeout) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout || 1200);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return await r.json();
  } catch {
    return null;
  }
}

async function ping(port, name) {
  const j = await getJson(`http://127.0.0.1:${port}/api/ping`, 900);
  return !!(j && j.ok === true && j.name === name);
}

async function discoverHub() {
  for (const p of HUB_PORTS) {
    if (await ping(p, HUB_NAME)) { hubPort = p; return true; }
  }
  hubPort = null;
  return false;
}

async function discoverSpec() {
  for (const p of SPEC_PORTS) {
    if (await ping(p, SPEC_NAME)) { specPort = p; specFails = 0; return true; }
  }
  /* 不在：hub 惰性拉起（boot 只保证在场；端口靠下轮探测确认） */
  if (hubPort) await getJson(`http://127.0.0.1:${hubPort}/api/spectrum-boot`, 1200);
  return false;
}

/* /api/state → 卡片轨（与页面端 cleanNe 同义的最小清洗）
   v8.2.2 锯齿根治：fetchedAt 必须是桥采样时刻（ne.ts）——旧版写 SW 收包时刻，
   采样→收包间的主力时钟年龄被吞掉，卡片每秒锚定一次就向后锯齿一次，
   逐字歌词在行界来回跥（乱跳根因）。与页面端 smtc.ts 年龄补偿同律。 */
function cleanTrack(j) {
  const ne = j && j.ne;
  if (!ne || typeof ne !== "object") return null;
  const title = String(ne.title || "").slice(0, 200);
  const position = Number(ne.position);
  const pos = Number.isFinite(position) && position > 0 ? position : 0;
  if (!title && !(pos > 0)) return null;
  const pic = String(ne.pic || "");
  const ts = Number(ne.ts);
  const now = Date.now();
  return {
    songId: Number(ne.songId) || 0,
    title,
    artist: String(ne.artist || "").slice(0, 200),
    album: String(ne.album || "").slice(0, 200),
    playing: ne.playing === true,
    position: pos,
    duration: Number(ne.duration) || 0,
    rate: 1,
    pic: /^https:\/\//.test(pic) ? pic.slice(0, 500) : "",
    fetchedAt: ts > 0 && ts <= now + 2000 ? ts : now,
  };
}

/* v8.7.24：广播真值 = ne/hub 仲裁赢家（ne 优先窗见 neWins）；无赢家发 null
   （卡侧 has=false 自然隐没——hub 缺席且 ne 失新时不再留幽灵锚点） */
async function pollState() {
  /* v8.7.65 武装门：未装 SMTC 预设不探测 hub、不拉真值——广播只剩 ne 真
     值或空帧（卡侧 has=false 隐没），桥在装也不再上浮窗 */
  if (cardArmed && (hubPort || (await discoverHub()))) {
    const j = await getJson(`http://127.0.0.1:${hubPort}/api/state`, 1500);
    if (j) { state = cleanTrack(j); stateAt = Date.now(); }
    else hubPort = null;
  }
  const t = neWins() ? neTrack : state;
  playing = !!(t && t.playing);
  broadcast({ type: "state", track: t, at: t === neTrack ? neTrackAt : stateAt });
}

function broadcast(msg) {
  for (const port of cards) {
    try { port.postMessage(msg); } catch { /* 死端口断开事件里清理 */ }
  }
}
/* v8.2.6：频谱帧只发订阅卡——非订阅（hidden/未开辉光）标签零唤醒 */
function broadcastSpec(msg) {
  for (const port of cards) {
    if (!port.__spec) continue;
    try { port.postMessage(msg); } catch { /* 死端口断开事件里清理 */ }
  }
}

/* v8.3.0：state 轮询常开律（数据面休眠退役）——只要还有卡片 Port 在册
   就 1Hz 拉真值广播。旧 visCount 门（全 hidden 即停）拆除：停摆期内切歌
   = 面板/浮窗留在上一首且无自愈路径（用户实测复现的真病）。
   成本：1Hz 回环 GET + 广播，无感；每秒 postMessage 同时保活 SW。 */
function ensureStateLoop() {
  if (stateTimer || cards.size === 0) return;
  void pollState();
  stateTimer = setInterval(() => { void pollState(); }, 1000);
}
function stopStateLoop() {
  if (stateTimer && cards.size === 0) { clearInterval(stateTimer); stateTimer = null; }
}

/* 20Hz 频谱流（v8.2.5 引擎零扰律）：原始帧直发（包络在卡片侧做，与页面端同参数） */
function specWanted() {
  let n = 0;
  for (const p of cards) if (p.__spec) n++;
  return n;
}
let specBusy = false; /* v8.2.4 在飞守卫：助手失联时 50ms 定时器 × 450ms 超时会堆请求 */
function ensureSpecLoop() {
  /* v8.7.65 武装门：频谱助手（chushi-spectrum，hub 家族）未装预设不拉起
     ——ne 频谱走 neSpecFrame 消息面不经此循环，不受影响 */
  if (!cardArmed || specTimer || specWanted() === 0) return;
  void discoverSpec();
  specTimer = setInterval(async () => {
    if (specBusy || specWanted() === 0) return;
    specBusy = true;
    try {
      await specTick();
    } finally {
      specBusy = false;
    }
  }, 33); /* v8.2.8：30Hz（v8.2.5 曾降 20Hz 减压）——用户反馈律动滞后，
             回环 GET 微秒级开销 30/s 无感，native FFT 已同步 40Hz */
}
async function specTick() {
    {
    if (specWanted() === 0) return;
    if (!playing) {
      /* v8.2.6 翻转门：paused 期不再每拍发 on:false（20msg/s 纯浪费），
         只在 on→off 边沿发一条熄辉光 */
      if (specSentOn !== false) {
        specSentOn = false;
        /* v8.7.40 ne 源锁:ne 频谱活跃窗内桥熄灯帧让路（不覆盖 ne on:true 帧
           ——ne 播放中,桌面桥未跑/暂停时的 on:false 边沿会把悬浮卡辉光误熄） */
        if (Date.now() - neSpecAt >= 800) {
          broadcastSpec({ type: "spec", on: false, bass: 0, bands: [], t: Date.now() });
        }
      }
      return;
    }
    if (!specPort) {
      /* v8.2.4 发现退避 1s → ~5s（对齐面板 SPEC_BOOT_EVERY；hub 侧 boot
         已瞬时化，减压意义在减少无用端口探测流量） */
      if (++bootBeats >= 90) { bootBeats = 0; await discoverSpec(); } /* 90×33ms ≈ 3s */
      return;
    }
    const j = await getJson(`http://127.0.0.1:${specPort}/api/spectrum`, 450);
    if (!j || j.ok !== true) {
      if (++specFails >= 3) { specPort = null; specFails = 0; }
      return;
    }
    specFails = 0;
    const cap = j.cap === true || j.cap === 1;
    /* v8.7.40 ne 源锁:ne 频谱活跃窗（800ms）内桥链仅 on:true 真值帧可夺回
       （桌面客户端真在前台播）,on:false/失联衰减帧不覆盖 ne 帧——双链同屏
       只剩一个主导源,悬浮卡辉光不闪断 */
    if (Date.now() - neSpecAt < 800 && !cap) return;
    specSentOn = cap;
    broadcastSpec({
      type: "spec",
      on: cap,
      bass: cap ? (Number(j.bass) || 0) : 0,
      bands: Array.isArray(j.bands) ? j.bands.slice(0, 128) : [],
      t: Date.now(),
    });
    }
}
function stopSpecLoop() {
  if (specTimer && specWanted() === 0) { clearInterval(specTimer); specTimer = null; specPort = null; }
}

async function sendCmd(cmd, position) {
  if (!CMD_SET.has(cmd)) return false;
  /* v8.7.65 武装门：未装 SMTC 预设不代理 hub 命令（浮窗显示的是 ne 真值
     时误控桌面网易云 = 错靶控制，命令面与真值面同门同开同关） */
  if (!cardArmed) return false;
  if (!hubPort && !(await discoverHub())) return false;
  const body = { cmd };
  if (cmd === "seek" && typeof position === "number" && Number.isFinite(position)) {
    body.position = Math.max(0, Math.min(86400, position));
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`http://127.0.0.1:${hubPort}/api/cmd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const j = await r.json();
    return !!(j && j.ok === true);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* v8.7.24 内置网易云播放器真值面（ne 数据面）
   播放器预设跑在「初始」新标签页（扩展页），宿主 <audio> + MediaSession 的
   真值经页面侧 PresetWidgets 推上来（runtime 消息，发送方=本扩展页面自身）：
     {type:"neFrame", track:{songId,title,artist,album,playing,position,
                             duration,pic,rate,fetchedAt}}
     {type:"neLyricPush", lyric:{songId,yrc,ytlrc,lrc,tlyric,source,rev}}
   广播仲裁（ne 优先窗）：ne 帧新鲜（播放中 3s / 暂停 10min 保持）且
   （ne 播放中 或 hub 未在播放）→ ne 真值胜出广播；否则 hub 真值照旧——
   内置播放器一开声，所有网页的悬浮卡/全局歌词浮层立即换源；暂停回退外部
   网易云（hub），两端都停则停在最近的内置曲目（诚实显示）。发布方仲裁：
   播放中的发布帧不被暂停帧抢走（同标签自更例外），双开初始页不打架。
   歌词面：卡片 {type:"lyric"} 请求优先命中 ne 歌词缓存（与 hub /api/lyric
   同载荷形状 {songId,yrc,ytlrc,lrc,tlyric,source,rev}，卡侧 ChuShiLyric.parse
   零改动复用），未命中走 hub 照旧；缓存 LRU 4 首 + storage.session 落盘
   （SW 重启存活）。
   命令回程：ne 活跃期卡片 cmd 路由回发布帧的标签页（tabs.sendMessage
   {type:"neCmd"}，页面侧 PresetWidgets 落到宿主 audio/队列 sysCmd 通道），
   失败回退 hub /api/cmd 照旧。 */
let neTrack = null;
let neTrackAt = 0;
let neTabId = null;
let neSpecAt = 0; /* v8.7.40 ne 频谱源锁时间戳（最近 neSpecFrame 到达时刻） */
const NE_LYRIC_CAP = 4;
let neLyrics = new Map();
let neSessLoaded = false;
let neSessLast = 0;

function neFresh() {
  if (!neTrack) return false;
  const win = neTrack.playing ? 3000 : 600000;
  return Date.now() - neTrackAt < win;
}
function neWins() {
  return neFresh() && (neTrack.playing || !(state && state.playing));
}
function cleanNeTrack(t) {
  if (!t || typeof t !== "object") return null;
  const title = String(t.title || "").slice(0, 200);
  const position = Number(t.position);
  const pos = Number.isFinite(position) && position > 0 ? position : 0;
  if (!title && !(pos > 0)) return null;
  const pic = String(t.pic || "");
  const ts = Number(t.fetchedAt);
  const now = Date.now();
  return {
    songId: Number(t.songId) || 0,
    title,
    artist: String(t.artist || "").slice(0, 200),
    album: String(t.album || "").slice(0, 200),
    playing: t.playing === true,
    position: pos,
    duration: Number(t.duration) || 0,
    rate: Number(t.rate) > 0 ? Number(t.rate) : 1,
    pic: /^https:\/\//.test(pic) ? pic.slice(0, 500) : "",
    fetchedAt: ts > 0 && ts <= now + 2000 ? ts : now,
  };
}
/* storage.session 节流落盘（SW 重启存活；4s 窗合并真值流写放大） */
function neSessSave(force) {
  const now = Date.now();
  if (!force && now - neSessLast < 4000) return;
  neSessLast = now;
  try {
    chrome.storage.session.set({
      neTrack, neTrackAt, neTabId,
      neLyrics: Array.from(neLyrics.entries()),
    }, () => void chrome.runtime.lastError);
  } catch (e) { /* 旧内核无 session API：内存态即可 */ }
}
function neSessLoad() {
  if (neSessLoaded) return;
  neSessLoaded = true;
  try {
    chrome.storage.session.get(["neTrack", "neTrackAt", "neTabId", "neLyrics"], (o) => {
      try {
        if (o && o.neTrack && typeof o.neTrack === "object") {
          if (!(neTrack && neFresh())) { neTrack = o.neTrack; neTrackAt = Number(o.neTrackAt) || 0; }
        }
        if (o && neTabId == null && o.neTabId != null) neTabId = o.neTabId;
        if (o && Array.isArray(o.neLyrics) && neLyrics.size === 0) {
          neLyrics = new Map(o.neLyrics.filter((e) => Array.isArray(e) && e.length === 2));
        }
      } catch (e) { /* 损坏条目：按无缓存处理 */ }
    });
  } catch (e) { /* noop */ }
}
function neLyricPut(ly) {
  const id = String((ly && ly.songId) || "");
  if (!/^\d+$/.test(id)) return;
  neLyrics.delete(id);
  neLyrics.set(id, ly);
  while (neLyrics.size > NE_LYRIC_CAP) {
    const first = neLyrics.keys().next().value;
    neLyrics.delete(first);
  }
  neSessSave(true);
}
async function sendNeCmd(cmd, position) {
  if (!CMD_SET.has(cmd) || neTabId == null) return false;
  try {
    const r = await chrome.tabs.sendMessage(neTabId, { type: "neCmd", cmd, position });
    return !!(r && r.ok === true);
  } catch (e) { return false; }
}
chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
  /* 发送方校验：只信本扩展自身的页面（初始新标签页），网页/内容脚本一律不认 */
  if (!m || typeof m !== "object") return;
  const fromPage = sender && sender.id === chrome.runtime.id &&
    typeof sender.url === "string" && sender.url.startsWith("chrome-extension://");
  if (!fromPage) return;
  if (m.type === "neFrame") {
    neSessLoad();
    const t = cleanNeTrack(m.track);
    if (t) {
      /* 发布方仲裁：播放中的发布帧不被暂停帧抢走（同标签自更例外） */
      const curPlaying = neTrack && neFresh() && neTrack.playing;
      const sameTab = sender.tab && typeof sender.tab.id === "number" && sender.tab.id === neTabId;
      if (t.playing || !curPlaying || sameTab) {
        const identChanged = !neTrack || neTrack.songId !== t.songId ||
          neTrack.title !== t.title || neTrack.playing !== t.playing;
        neTrack = t;
        neTrackAt = Date.now();
        if (sender.tab && typeof sender.tab.id === "number") neTabId = sender.tab.id;
        if (neWins()) {
          playing = !!neTrack.playing;
          broadcast({ type: "state", track: neTrack, at: neTrackAt });
        }
        neSessSave(identChanged);
      }
    } else {
      /* v8.7.35 空帧=发布方撤真值（播放器预设移除→悬浮卡退散）：只认当前
         发布方/无主场合，防双开页另一侧的移除误清活跃真值（播放帧 4Hz
         自愈虽快仍是闪烁，守卫根除）；neTabId 留置——命令路由由 neWins()
         门控，真值已撤即回退 hub，无残留路径。 */
      const sid = sender.tab && typeof sender.tab.id === "number" ? sender.tab.id : null;
      if (neTabId == null || sid == null || sid === neTabId) {
        neTrack = null; neTrackAt = 0;
        neSessSave(true);
      }
    }
    return; /* 单向真值流：不占 sendResponse 通道 */
  }
  if (m.type === "neLyricPush") {
    neSessLoad();
    if (m.lyric && typeof m.lyric === "object") neLyricPut(m.lyric);
    return;
  }
  if (m.type === "neSpecFrame") {
    /* v8.7.40 悬浮卡律动桥（宿主页面直发）:ne WebAudio 频谱帧按既有 spec
       协议扇出 __spec 订阅卡——ext-card 消费端零改动（形状同构）。
       帧仲裁见 specTick ne 源锁（桥链让路）;此处恒转发（on:false 边沿帧
       需要透传给卡熄辉光,发送侧已有边沿门,静默期零帧）。 */
    neSpecAt = Date.now();
    broadcastSpec({
      type: "spec",
      on: m.on === true,
      bass: Number(m.bass) || 0,
      bands: Array.isArray(m.bands) ? m.bands.slice(0, 128) : [],
      t: Date.now(),
    });
    return;
  }
  if (m.type === "csProxyFetch") {
    /* v8.7.42 预设 API 代理（开放律）：沙箱声明域经用户导入授权（chrome.permissions
       request 逐域授予，optional_host_permissions）→ SW 复核 contains 后代理 fetch。
       SW 持 host_permissions 即绕 CORS；授权真源在浏览器 permissions——不落盘不缓存。 */
    const url = typeof m.url === "string" ? m.url.slice(0, 2048) : "";
    const method = (typeof m.method === "string" ? m.method : "GET").toUpperCase().slice(0, 12);
    const base64 = m.base64 === true;
    const reply = (r) => { try { sendResponse(r); } catch { /* 页面已走 */ } };
    let u;
    try { u = new URL(url); } catch { reply({ ok: false, error: "url 无效" }); return; }
    const isHttps = u.protocol === "https:";
    const isLoop = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname);
    const isLoopHttp = u.protocol === "http:" && isLoop;
    if (!isHttps && !isLoopHttp) { reply({ ok: false, error: "仅允许 https 与本地回环 http" }); return; }
    const origin = u.origin + "/*";
    chrome.permissions.contains({ origins: [origin] }, (granted) => {
      if (!granted) { reply({ ok: false, error: `域 ${u.host} 未授权（导入预设时未确认或已撤销）` }); return; }
      const headers = {};
      if (m.headers && typeof m.headers === "object") {
        let n = 0;
        for (const [k, v] of Object.entries(m.headers)) {
          if (n >= 16) break;
          if (typeof v === "string" && /^[!#-'*+.0-9A-Za-z^_`|~-]{1,64}$/.test(k)) { headers[k] = v.slice(0, 2048); n += 1; }
        }
      }
      const init = { method: ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"].includes(method) ? method : "GET", headers };
      if (typeof m.body === "string" && m.body && !["GET", "HEAD"].includes(init.method)) init.body = m.body.slice(0, 4000000);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      fetch(url, { ...init, signal: ctrl.signal })
        .then(async (r) => {
          clearTimeout(timer);
          if (base64) {
            const buf = await r.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let bin = "";
            for (let i = 0; i < bytes.length; i += 0x8000) {
              bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            }
            reply({ ok: true, status: r.status, bodyBase64: btoa(bin) });
          } else {
            reply({ ok: true, status: r.status, bodyText: (await r.text()).slice(0, 8000000) });
          }
        })
        .catch((e) => {
          clearTimeout(timer);
          reply({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
        });
    });
    return true; /* 异步 sendResponse */
  }
  /* 未知类型：静默（不 return true，不占用响应通道） */
});
neSessLoad();

chrome.runtime.onConnect.addListener((port) => {
  if (!port || port.name !== "chushi-card") return;
  cards.add(port);
  if (state) {
    try { port.postMessage({ type: "state", track: state, at: stateAt }); } catch { /* 首帧随下一拍 */ }
  }
  ensureStateLoop();
  if (port.__spec) ensureSpecLoop();
  void sweepInjectAll(); /* v8.3.1 注入兜底：SW 生命周期内首连清扫一遍 */

  port.onMessage.addListener(async (m) => {
    if (!m || typeof m !== "object") return;
    switch (m.type) {
      case "ping":
        break; /* 保活：本事件本身已重置 SW 空闲计时 */
      case "cmd": {
        /* v8.7.24：ne 活跃期命令回程发布帧标签页（宿主 audio/队列 sysCmd），
           失败回退 hub /api/cmd 照旧 */
        let ok = false;
        if (neWins()) ok = await sendNeCmd(m.cmd, m.position);
        if (!ok) ok = await sendCmd(m.cmd, m.position);
        try { port.postMessage({ type: "cmdOk", id: m.id, ok }); } catch { /* 卡已走 */ }
        void pollState(); /* 命令后立即拉真值（乐观反馈快一拍） */
        if (m.cmd === "seek") {
          /* v8.2.8 seek 补拉：网易云执行 seek 需数百 ms——立即一拍常仍是
             旧位置。500/1200ms 两拍补拉让歌词/进度尽快对上；早到的陈旧拍
             由卡片护航窗（seekGuard 4.5s）拒收，不产生回弹。 */
          setTimeout(() => { if (cards.has(port)) void pollState(); }, 500);
          setTimeout(() => { if (cards.has(port)) void pollState(); }, 1200);
        }
        break;
      }
      case "spec": {
        const want = m.on === true;
        if (want && !port.__spec) { port.__spec = true; ensureSpecLoop(); }
        else if (!want && port.__spec) { port.__spec = false; stopSpecLoop(); }
        break;
      }
      /* v8.3.0：vis 上报分支退役——state 轮询不再依赖可见性
         （数据面休眠拆除，见文件头）。保留 default 吞掉旧消息防止报错。 */
      case "lyric": {
        /* 完全体歌词代理：hub /api/lyric?songId=（单槽缓存，归属校验在
           卡侧做——SW 零仲裁律）。歌词体可达 200KB，超时放宽 4s。 */
        const songId = String(m.songId || "");
        if (!/^\d+$/.test(songId) || songId === "0") {
          try { port.postMessage({ type: "lyric", key: m.key, ok: false }); } catch { /* 卡已走 */ }
          break;
        }
        /* v8.7.24：ne 歌词缓存优先（内置播放器推送的原始体，同 hub 载荷形状；
           卡侧 ChuShiLyric.parse 零改动复用），未命中走 hub 照旧 */
        const neLy = neLyrics.get(songId);
        if (neLy) {
          try { port.postMessage({ type: "lyric", key: m.key, ok: true, lyric: neLy }); } catch { /* 卡已走 */ }
          break;
        }
        if (!hubPort && !(await discoverHub())) {
          try { port.postMessage({ type: "lyric", key: m.key, ok: false }); } catch { /* 卡已走 */ }
          break;
        }
        const j = await getJson(
          `http://127.0.0.1:${hubPort}/api/lyric?songId=${encodeURIComponent(songId)}`, 4000);
        const ly = j && j.ok === true && j.lyric && typeof j.lyric === "object" ? j.lyric : null;
        try {
          port.postMessage({ type: "lyric", key: m.key, ok: !!ly, lyric: ly });
        } catch { /* 卡已走 */ }
        break;
      }
      /* v8.2.2：openPanel 转发已拆——浮窗任何位置点击都不跳转「初始」
         （用户明确不要），SW 不再承载开面板逻辑 */
      default:
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    cards.delete(port);
    stopStateLoop();
    stopSpecLoop();
  });
});

/* ============================================================================
 * v8.4.5 云端静默更新器——「加载完成后直接缓存在本地」的数据面
 *
 * 用户指令链：壳架构反转为本地直载（shell-bridge.js 路由）后，云端更新的
 * 职责收进后台：
 *   1) 定期比对云端 version.json（镜像列表 SNAP_MIRRORS；缺文件/断网/
 *      版本不更新 → 静默 no-op，新标签页流程零感知）；
 *   2) 发现【严格更新】版本 → 后台并发下载文件集（限 4 路，尺寸校验，
 *      v8.4.7 起字节原样入库——载荷 HTML 自带改写免疫态，见 2.7 段说明）
 *      → IndexedDB（库 chushi-snap）；
 *   3) 全部落库成功 → 原子提交 meta（meta 是开关，半途失败永不提交，
 *      壳侧永远只见完整版本）→ 清理旧版本文件；
 *   4) 下一个新标签页起，壳把 iframe 指向 /cs-snap/index.html，子路径
 *      SW（cs-snap/sw.js）从 IDB 服务快照——「新开标签页时直接就加载
 *      最新的版本」。
 * 触发面：onInstalled / onStartup / alarms 6h / storage.local 写 csSnapCheck
 * （探针与未来「立即检查」入口共用的手动触发通道）。
 * IDB 约定与 sw.js / shell-bridge.js 三份同构（勿单点改动）。
 * ==========================================================================*/

const SNAP_MIRRORS = ["https://lxgssy.github.io/Start-chushi"];
const SNAP_CONCURRENCY = 4;
const SNAP_ALARM = "chushi-snap-check";
const SNAP_PERIOD_MIN = 360; /* 6h——云端迭代频度远低于此，代价可忽略 */
const SNAP_DB = "chushi-snap";
let snapChecking = false;

/* v8.4.8：手动检查的过程回写（storage.local.csSnapStatus）——UI「检查更新」
   按钮的结果反馈通道（checking/downloading/updated/latest/error）；自动
   检查（6h/启动/装机）保持静默，不打扰面板。旧壳读此键零依赖，仅新增。 */
function snapStatus(st) {
  try {
    chrome.storage.local.set({ csSnapStatus: Object.assign({ at: Date.now() }, st) }, () => void chrome.runtime.lastError);
  } catch (_) { /* noop */ }
}

/* 防重置律：MV3 SW 每次唤醒都跑顶层代码——alarms.create 无条件调用会把
   计时器归零（经典永不触发 bug），必须先 get 再 create。 */
chrome.alarms.get(SNAP_ALARM, (a) => {
  if (!a) chrome.alarms.create(SNAP_ALARM, { periodInMinutes: SNAP_PERIOD_MIN, delayInMinutes: 2 });
});
chrome.alarms.onAlarm.addListener((a) => { if (a && a.name === SNAP_ALARM) void snapCheck(); });
chrome.runtime.onInstalled.addListener(() => { setTimeout(() => void snapCheck(), 5000); });
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== "local" || !ch || !ch.csSnapCheck) return;
  /* v8.4.8：{ manual: true } = UI「检查更新」按钮触发 → snapCheck 全程
     回写 csSnapStatus；旧值（探针写的时间戳等）保持静默，行为不变。 */
  const nv = ch.csSnapCheck.newValue;
  const manual = !!(nv && typeof nv === "object" && nv.manual === true);
  void snapCheck(manual);
});

function snapCmpVer(a, b) {
  const pa = String(a || "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function snapOpenDb() {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(SNAP_DB, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
function snapKvGet(db, key) {
  return new Promise((resolve, reject) => {
    const rq = db.transaction("kv", "readonly").objectStore("kv").get(key);
    rq.onsuccess = () => resolve(rq.result || null);
    rq.onerror = () => reject(rq.error);
  });
}
function snapFilesPut(db, v, path, buf) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(buf, v + "::" + path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function snapMetaPut(db, meta) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(meta, "meta");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function snapPruneVersions(db, keepV) {
  return new Promise((resolve) => {
    const tx = db.transaction("files", "readwrite");
    const st = tx.objectStore("files");
    const rq = st.openCursor();
    rq.onsuccess = () => {
      const cur = rq.result;
      if (!cur) return;
      const k = String(cur.key || "");
      if (!k.startsWith(keepV + "::")) st.delete(cur.key);
      cur.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/* v8.4.7：HTML 文本改写已退役。事故根因：Turbopack 运行时块内硬编码分块键
   前缀 t="/next/"（构建期 basePath），注册键=脚本标签 src 属性剥 "/next/"，
   加载键=编译期相对路径——前缀改写让两者失配 → 引导分块永不 resolve →
   快照静默卡加载。改用「属性空格前置 =」免疫态（build-extension.py 2.7 段，
   src ="/next/…" 合法 HTML 且绕过一切属性改写），载荷按原样字节入库。 */

async function snapCheck(manual) {
  if (snapChecking) return;
  snapChecking = true;
  let db = null;
  let gotManifest = false; /* 至少一个镜像吐出合法 version.json（区分断网与已最新） */
  let outcome = ""; /* "" | "updated" | "download-error" */
  let lastV = null;
  let floorVer = ""; /* 本地地板 = max(内嵌版, 快照 meta)，供 finally 回写（try 内 const 不可见） */
  try {
    if (manual) snapStatus({ state: "checking" });
    db = await snapOpenDb();
    const meta = await snapKvGet(db, "meta");
    const bundleVer = chrome.runtime.getManifest().version;
    const floor = meta && meta.v && snapCmpVer(meta.v, bundleVer) > 0 ? meta.v : bundleVer;
    floorVer = floor;
    for (const mirror of SNAP_MIRRORS) {
      let manifest = null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch(mirror + "/version.json", { cache: "no-store", signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) manifest = await r.json();
      } catch { /* 断网/被墙：静默 */ }
      if (!manifest || !manifest.v || !Array.isArray(manifest.files) || !manifest.files.length) continue;
      gotManifest = true;
      if (snapCmpVer(manifest.v, floor) <= 0) continue; /* 严格更新才动（永不降级） */
      const v = String(manifest.v);
      lastV = v;
      const files = manifest.files.filter((f) => f && typeof f.p === "string" && /^[\w./-]+$/.test(f.p));
      if (!files.length) continue;
      /* 并发下载（限 4 路）+ 尺寸校验；手动检查逐文件回写进度 */
      let cursor = 0, failed = false, done = 0;
      const total = files.length;
      async function worker() {
        while (!failed) {
          const i = cursor++;
          if (i >= files.length) return;
          const f = files[i];
          try {
            const r = await fetch(mirror + "/" + f.p, { cache: "no-store" });
            if (!r.ok) throw new Error("HTTP " + r.status);
            let buf = await r.arrayBuffer();
            if (Number.isFinite(f.s) && f.s > 0 && buf.byteLength !== f.s) {
              throw new Error("size " + f.p + " " + buf.byteLength + "!=" + f.s);
            }
            await snapFilesPut(db, v, f.p, buf);
            done += 1;
            if (manual) snapStatus({ state: "downloading", v, done, total });
          } catch { failed = true; }
        }
      }
      await Promise.all(Array.from({ length: Math.min(SNAP_CONCURRENCY, files.length) }, worker));
      if (failed) { outcome = "download-error"; continue; } /* 半途失败：不提交 meta，壳侧零感知；下轮再试 */
      await snapMetaPut(db, { v, files: files.map((f) => ({ p: f.p, s: f.s || 0 })), at: Date.now() });
      await snapPruneVersions(db, v);
      outcome = "updated";
      break; /* 本次检查只吃一个镜像 */
    }
  } catch {
    outcome = outcome || "download-error"; /* IDB 不可用等异常：按失败上报 */
  } finally {
    if (manual) {
      if (outcome === "updated") snapStatus({ state: "updated", v: lastV });
      else if (outcome === "download-error") snapStatus({ state: "error", err: "download", v: lastV });
      else if (gotManifest) snapStatus({ state: "latest", v: floorVer || lastV || "" });
      else snapStatus({ state: "error", err: "network" });
    }
    try { if (db) db.close(); } catch { /* noop */ }
    snapChecking = false;
  }
}

/* ============================================================================
 * v8.7.52 资源嗅探模块（开关：chrome.storage.local.snifferOn，popup 写入）
 * ----------------------------------------------------------------------------
 * 架构律：
 *   1. 监听器必须 SW 顶层注册（MV3 事件律——SW 休眠唤醒后要能继续收事件）；
 *      内部以内存门 sniffOn 判定开关，off 时回调即刻 return（微开销）。
 *   2. 唤醒成本控制：webRequest filter 只放行 media/image/object/
 *      xmlhttprequest/other 五类资源类型——html/css/js/script/style 等
 *      高频请求在浏览器层就被过滤，不唤醒 SW；XHR 里 JSON/HTML 响应
 *      classify 后 99% 丢弃，真正入库的只有可下载媒体与文档。
 *   3. 数据面：每标签页一份（FIFO 上限 50，URL 去重），内存 Map 为准，
 *      chrome.storage.session 持久（key sniffer:tab:<id>）——SW 随时可能
 *      被杀，复活后首次访问惰性重建；绝不 storage.session.clear()（音乐卡
 *      「按站隐藏」等其它 session 数据共存，只按前缀清理自己的键）。
 *   4. 提示面：新资源 → per-tab badge 计数（强调紫底）+ tabs.sendMessage
 *      推 sniffer-float.js 浮球（float 不在时 sendMessage 报错即静默）。
 *   5. 下载经 SW 代理：content script 无 downloads API，浮球发
 *      sniffer-download → chrome.downloads.download（filename 已清洗）。
 *   6. 关闭：清已知 tab 的 badge + 广播 sniffer-off + 按前缀清 session；
 *      tabs.onRemoved 即时回收该 tab 的内存/持久两份数据。
 * ==========================================================================*/

var sniffOn = undefined;              /* undefined = 尚未初始化（SW 刚醒） */
var sniffTabs = new Map();            /* tabId -> { order:[url], byUrl:Map } */
var SNIFF_MAX = 50;
var SNIFF_KEY_PREFIX = "sniffer:tab:";

/* v8.7.55 徽章配色跟随强调色：cardAcc（页面镜像）为底，YIQ 亮度自适应
   文字对比色（浅强调色配墨字、深强调色配白字）；onChanged 热跟随。 */
var BADGE_ACC = "#8b5cf6";
function badgeContrast(hex) {
  try {
    var m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#ffffff";
    var v = parseInt(m[1], 16);
    var yiq = ((v >> 16) & 255) * 299 + ((v >> 8) & 255) * 587 + (v & 255) * 114;
    return yiq >= 150000 ? "#1c1c22" : "#ffffff";
  } catch (e) {
    return "#ffffff";
  }
}
function applyBadgeAcc(hex) {
  try {
    if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) BADGE_ACC = hex;
    chrome.action.setBadgeBackgroundColor({ color: BADGE_ACC });
    chrome.action.setBadgeTextColor({ color: badgeContrast(BADGE_ACC) });
  } catch (e) { /* noop */ }
}
applyBadgeAcc("#8b5cf6");
try {
  chrome.storage.local.get("cardAcc", function (o) {
    if (o && o.cardAcc) applyBadgeAcc(o.cardAcc);
  });
  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area === "local" && ch.cardAcc) applyBadgeAcc(ch.cardAcc.newValue);
  });
} catch (e) { /* noop */ }

(function sniffInit() {
  try {
    chrome.storage.local.get("snifferOn", function (o) {
      sniffOn = !!(o && o.snifferOn);
      if (sniffOn) sniffWarmTabs();
    });
  } catch (e) { sniffOn = false; }
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes.snifferOn) return;
      var next = !!changes.snifferOn.newValue;
      if (next === sniffOn) return;
      sniffOn = next;
      if (next) {
        sniffWarmTabs();
        sniffAnnounceOn();   /* v8.7.58：已开页面补针+热显示（修复「开启后浮窗不显示」） */
      }
      else sniffTearDown();
    });
  } catch (e) { /* noop */ }
  try {
    chrome.tabs.onRemoved.addListener(function (tabId) {
      sniffTabs.delete(tabId);
      try { chrome.storage.session.remove(SNIFF_KEY_PREFIX + tabId); } catch (e) { /* noop */ }
    });
  } catch (e) { /* noop */ }
})();

function sniffWarmTabs(cb) {
  /* SW 复活后重建：把 session 里存活的 tab 数据拉回内存；v8.7.58 可选回调
     （ask 异步应答分支等 warm 完成再回复，避免竞态空列表） */
  var done = function () { if (cb) { try { cb(); } catch (e) { /* noop */ } } };
  try {
    chrome.storage.session.get(null, function (all) {
      if (all) {
        Object.keys(all).forEach(function (k) {
          if (!k.startsWith(SNIFF_KEY_PREFIX)) return;
          var tabId = Number(k.slice(SNIFF_KEY_PREFIX.length));
          var v = all[k];
          if (Number.isInteger(tabId) && Array.isArray(v) && v.length && !sniffTabs.has(tabId)) {
            var entry = { order: [], byUrl: new Map() };
            v.forEach(function (it) {
              entry.order.push(it.url);
              entry.byUrl.set(it.url, it);
            });
            sniffTabs.set(tabId, entry);
          }
        });
      }
      done();
    });
  } catch (e) { done(); }
}

/* v8.7.58 开启广播：开关打开时向所有已存标签页补针+推送开启态。
   v8.7.55 前 manifest 注入仅在页面加载时 boot 一次（ask → on:false → 自毁），
   开关后开已开页面零通知 → 「开启后浮窗不显示」（用户实测缺陷）。
   补针幂等：sniffer-float.js 顶层 __chushiSnifferMounted 守卫，同世界
   重复注入直接 return，广播由存活实例处理。 */
function sniffAnnounceOn() {
  try {
    chrome.tabs.query({}, function (tabs) {
      (tabs || []).forEach(function (t) {
        if (!t.id || !/^https?:/i.test(t.url || "")) return;  /* 特权页/本地：不可注入 */
        var flat = function () {
          return sniffTabs.has(t.id)
            ? sniffTabs.get(t.id).order.map(function (u) { return sniffTabs.get(t.id).byUrl.get(u); })
            : [];
        };
        var push = function () {
          try {
            chrome.tabs.sendMessage(t.id, { type: "sniffer-state", on: true, items: flat() }, function () { void chrome.runtime.lastError; });
          } catch (e) { /* noop */ }
        };
        try {
          /* 补针：扩展安装/更新前已开的页面无 content script；已注入页由
             顶层守卫幂等跳过，随后广播照常送达存活实例 */
          chrome.scripting.executeScript(
            { target: { tabId: t.id }, files: ["sniffer-float.js"] },
            function () { void chrome.runtime.lastError; push(); }
          );
        } catch (e) { push(); }
      });
    });
  } catch (e) { /* noop */ }
}

function sniffPersist(tabId, entry) {
  try {
    var flat = entry.order.map(function (u) { return entry.byUrl.get(u); });
    chrome.storage.session.set(
      SNIFF_KEY_PREFIX + tabId,
      JSON.parse(JSON.stringify(flat))
    );
  } catch (e) { /* quota/序列化失败：内存态保底 */ }
}

function sniffTearDown() {
  sniffTabs.forEach(function (_entry, tabId) {
    try { chrome.action.setBadgeText({ tabId: tabId, text: "" }); } catch (e) { /* noop */ }
    try { chrome.tabs.sendMessage(tabId, { type: "sniffer-off" }, function () { void chrome.runtime.lastError; }); } catch (e) { /* noop */ }
  });
  sniffTabs.clear();
  try {
    chrome.storage.session.get(null, function (all) {
      if (!all) return;
      var keys = Object.keys(all).filter(function (k) { return k.startsWith(SNIFF_KEY_PREFIX); });
      keys.forEach(function (k) {
        try { chrome.storage.session.remove(k); } catch (e) { /* noop */ }
      });
    });
  } catch (e) { /* noop */ }
}

/* 资源分类：返回类型 key 或 null（不入库）。扩展名兜底与 MIME 互证——
   有些服务器给视频流 application/octet-stream，只有扩展名能救。 */
var SNIFF_EXT = {
  video: ["mp4", "webm", "mkv", "flv", "mov", "avi", "m4s", "ts", "mpg", "mpeg", "3gp"],
  audio: ["mp3", "m4a", "flac", "wav", "ogg", "aac", "opus", "wma"],
  archive: ["zip", "rar", "7z", "tar", "gz", "iso", "bz2", "xz"],
  doc: ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "epub", "apk", "dmg", "exe", "msi", "csv"],
};
function sniffClassify(mime, url) {
  mime = (mime || "").toLowerCase();
  var m = (url.split("?")[0].split("#")[0]).match(/\.([a-z0-9]{2,5})$/i);
  var ext = m ? m[1].toLowerCase() : "";
  if (ext === "m3u8" || mime.indexOf("mpegurl") >= 0) return "stream";
  if (mime.indexOf("video/") === 0 || SNIFF_EXT.video.indexOf(ext) >= 0) return "video";
  if (mime.indexOf("audio/") === 0 || mime.indexOf("application/ogg") === 0 || SNIFF_EXT.audio.indexOf(ext) >= 0) return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (SNIFF_EXT.archive.indexOf(ext) >= 0 || mime.indexOf("zip") >= 0 || mime.indexOf("compressed") >= 0) return "archive";
  if (SNIFF_EXT.doc.indexOf(ext) >= 0 || mime.indexOf("officedocument") >= 0 || mime.indexOf("msword") >= 0 || mime.indexOf("spreadsheet") >= 0 || mime.indexOf("presentation") >= 0) return "doc";
  if (mime.indexOf("image/") === 0) return "image"; /* 回调里另查大小：只收大图 */
  return null;
}

/* 文件名：content-disposition 优先（filename* 解码 filename），否则 URL 段 */
function sniffFilename(headers, url) {
  var cd = null;
  for (var i = 0; i < (headers || []).length; i++) {
    if ((headers[i].name || "").toLowerCase() === "content-disposition") cd = headers[i].value;
  }
  if (cd) {
    var mStar = cd.match(/filename\*=(?:UTF-8''|utf-8'')([^;]+)/);
    if (mStar) { try { return decodeURIComponent(mStar[1].replace(/["']/g, "")); } catch (e) { /* fallthrough */ } }
    var mPlain = cd.match(/filename="?([^";]+)"?/);
    if (mPlain) return mPlain[1];
  }
  try {
    var u = new URL(url);
    var seg = u.pathname.split("/").filter(Boolean).pop();
    if (seg) return decodeURIComponent(seg);
    return u.hostname;
  } catch (e) {
    return "资源文件";
  }
}

function sniffBadge(tabId, n) {
  try {
    chrome.action.setBadgeText({ tabId: tabId, text: n > 0 ? String(n) : "" });
  } catch (e) { /* noop */ }
}

try {
  chrome.webRequest.onCompleted.addListener(function (details) {
    if (!sniffOn) return;                                  /* 开关门 */
    if (!/^https?:/i.test(details.url || "")) return;      /* 特权页/本地 */
    var headers = details.responseHeaders || [];
    var mime = "", size = -1;
    for (var i = 0; i < headers.length; i++) {
      var nm = (headers[i].name || "").toLowerCase();
      if (nm === "content-type") mime = headers[i].value || "";
      else if (nm === "content-length") size = Number(headers[i].value) || -1;
    }
    var type = sniffClassify(mime, details.url);
    if (!type) return;
    if (type === "image" && !(size >= 100 * 1024)) return; /* 大图律：<100KB 不入库 */
    var tabId = details.tabId;
    if (tabId < 0) return;                                 /* 非标签页请求（SW fetch 等） */
    var entry = sniffTabs.get(tabId);
    if (!entry) {
      entry = { order: [], byUrl: new Map() };
      sniffTabs.set(tabId, entry);
    }
    if (entry.byUrl.has(details.url)) return;              /* 去重：同 URL 只记一次 */
    var item = {
      url: details.url,
      type: type,
      ext: (details.url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i) || ["", ""])[1].toLowerCase(),
      name: sniffFilename(headers, details.url),
      size: size,
      host: (new URL(details.url).hostname || "").replace(/^www\./, ""),
      at: Date.now(),
    };
    entry.order.push(item.url);
    entry.byUrl.set(item.url, item);
    while (entry.order.length > SNIFF_MAX) {               /* FIFO：老资源让位 */
      var oldUrl = entry.order.shift();
      entry.byUrl.delete(oldUrl);
    }
    sniffPersist(tabId, entry);
    sniffBadge(tabId, entry.order.length);
    try {
      var flat = entry.order.map(function (u) { return entry.byUrl.get(u); });
      chrome.tabs.sendMessage(tabId, { type: "sniffer-new", items: flat }, function () {
        void chrome.runtime.lastError;                     /* 浮球未注入：静默 */
      });
    } catch (e) { /* noop */ }
  }, { urls: ["http://*/*", "https://*/*"], types: ["media", "image", "object", "xmlhttprequest", "other"] }, ["responseHeaders"]);
} catch (e) { /* webRequest 不可用（权限缺失）：嗅探静默不可用 */ }

/* 浮球消息面：ask 拉状态 / clear 清本页 / download 代理下载 */
try {
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "sniffer-ask") {
      var tabId = sender.tab && sender.tab.id;
      /* v8.7.58 冷启动竞态修复：SW 刚醒时 sniffOn=undefined，storage 初始化
         是异步的——旧代码同步应答 on:false → 浮窗自毁且 boot 只跑一次，
         之后永不显示。改为：未初始化时等 storage 读到 + warm 完成再异步应答。 */
      var respond = function () {
        var items = Number.isInteger(tabId) && sniffTabs.has(tabId)
          ? sniffTabs.get(tabId).order.map(function (u) { return sniffTabs.get(tabId).byUrl.get(u); })
          : [];
        try { sendResponse({ type: "sniffer-state", on: !!sniffOn, items: items }); } catch (e) { /* noop */ }
      };
      if (sniffOn === undefined) {
        try {
          chrome.storage.local.get("snifferOn", function (o) {
            sniffOn = !!(o && o.snifferOn);
            if (sniffOn) sniffWarmTabs(respond);
            else respond();
          });
        } catch (e) { sniffOn = false; respond(); }
        return true; /* 异步应答（通道保持开放） */
      }
      respond();
      return; /* 同步应答 */
    }
    if (msg.type === "sniffer-clear") {
      var tabId2 = sender.tab && sender.tab.id;
      if (Number.isInteger(tabId2)) {
        sniffTabs.delete(tabId2);
        try { chrome.storage.session.remove(SNIFF_KEY_PREFIX + tabId2); } catch (e) { /* noop */ }
        sniffBadge(tabId2, 0);
      }
      return;
    }
    if (msg.type === "sniffer-download") {
      var url = typeof msg.url === "string" && /^https?:/i.test(msg.url) ? msg.url : "";
      if (!url) { sendResponse({ ok: false }); return; }
      var name = String(msg.filename || "资源文件")
        .replace(/[\\/:*?"<>|]/g, "_")     /* Windows 非法字符清洗 */
        .replace(/^\.+/, "")               /* 防隐藏/路径穿越 */
        .slice(0, 120) || "资源文件";
      try {
        chrome.downloads.download(
          { url: url, filename: name, saveAs: false },
          function (id) { void chrome.runtime.lastError; sendResponse({ ok: typeof id === "number" }); }
        );
      } catch (e) {
        sendResponse({ ok: false });
      }
      return true; /* 异步应答 */
    }
  });
} catch (e) { /* noop */ }
