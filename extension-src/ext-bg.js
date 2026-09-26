/* ============================================================================
 * 「初始」ext-bg v8.3.1 —— MV3 Service Worker：跨页面音乐卡状态中继
 *
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
  if (hubPort || (await discoverHub())) {
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
  if (specTimer || specWanted() === 0) return;
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
        broadcastSpec({ type: "spec", on: false, bass: 0, bands: [], t: Date.now() });
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
chrome.runtime.onMessage.addListener((m, sender) => {
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
      neTrack = null; neTrackAt = 0;
      neSessSave(true);
    }
    return; /* 单向真值流：不占 sendResponse 通道 */
  }
  if (m.type === "neLyricPush") {
    neSessLoad();
    if (m.lyric && typeof m.lyric === "object") neLyricPut(m.lyric);
    return;
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
