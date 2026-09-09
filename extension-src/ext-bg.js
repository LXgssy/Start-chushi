/* ============================================================================
 * 「初始」ext-bg v8.2.0 —— MV3 Service Worker：跨页面音乐卡状态中继
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

/* /api/state → 卡片轨（与页面端 cleanNe 同义的最小清洗） */
function cleanTrack(j) {
  const ne = j && j.ne;
  if (!ne || typeof ne !== "object") return null;
  const title = String(ne.title || "").slice(0, 200);
  const position = Number(ne.position);
  const pos = Number.isFinite(position) && position > 0 ? position : 0;
  if (!title && !(pos > 0)) return null;
  const pic = String(ne.pic || "");
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
    fetchedAt: Date.now(),
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

function ensureStateLoop() {
  if (stateTimer || cards.size === 0) return;
  void pollState();
  stateTimer = setInterval(() => { void pollState(); }, 1000);
}
function stopStateLoop() {
  if (stateTimer && cards.size === 0) { clearInterval(stateTimer); stateTimer = null; }
}

/* 30Hz 频谱流：原始帧直发（包络在卡片侧做，与页面端同参数） */
function specWanted() {
  let n = 0;
  for (const p of cards) if (p.__spec) n++;
  return n;
}
function ensureSpecLoop() {
  if (specTimer || specWanted() === 0) return;
  void discoverSpec();
  specTimer = setInterval(async () => {
    if (specWanted() === 0) return;
    if (!playing) {
      broadcast({ type: "spec", on: false, bass: 0, bands: [], t: Date.now() });
      return;
    }
    if (!specPort) {
      if (++bootBeats >= 30) { bootBeats = 0; await discoverSpec(); }
      return;
    }
    const j = await getJson(`http://127.0.0.1:${specPort}/api/spectrum`, 450);
    if (!j || j.ok !== true) {
      if (++specFails >= 3) { specPort = null; specFails = 0; }
      return;
    }
    specFails = 0;
    const cap = j.cap === true || j.cap === 1;
    broadcast({
      type: "spec",
      on: cap,
      bass: cap ? (Number(j.bass) || 0) : 0,
      bands: Array.isArray(j.bands) ? j.bands.slice(0, 16) : [],
      t: Date.now(),
    });
  }, 33);
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

  port.onMessage.addListener(async (m) => {
    if (!m || typeof m !== "object") return;
    switch (m.type) {
      case "ping":
        break; /* 保活：本事件本身已重置 SW 空闲计时 */
      case "cmd": {
        const ok = await sendCmd(m.cmd, m.position);
        try { port.postMessage({ type: "cmdOk", id: m.id, ok }); } catch { /* 卡已走 */ }
        void pollState(); /* 命令后立即拉真值（乐观反馈快一拍） */
        break;
      }
      case "spec": {
        const want = m.on === true;
        if (want && !port.__spec) { port.__spec = true; ensureSpecLoop(); }
        else if (!want && port.__spec) { port.__spec = false; stopSpecLoop(); }
        break;
      }
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
      case "openPanel": {
        try {
          const url = chrome.runtime.getURL("index.html");
          const tabs = await chrome.tabs.query({ url: url + "*" });
          if (tabs && tabs.length) {
            await chrome.tabs.update(tabs[0].id, { active: true });
            if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
          } else {
            await chrome.tabs.create({ url });
          }
        } catch { /* 特权窗口等场景静默 */ }
        break;
      }
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
