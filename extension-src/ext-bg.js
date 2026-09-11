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

async function pollState() {
  if (!hubPort && !(await discoverHub())) return;
  const j = await getJson(`http://127.0.0.1:${hubPort}/api/state`, 1500);
  if (!j) { hubPort = null; return; }
  state = cleanTrack(j);
  stateAt = Date.now();
  playing = !!(state && state.playing);
  broadcast({ type: "state", track: state, at: stateAt });
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
        const ok = await sendCmd(m.cmd, m.position);
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
