import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

/* verify-v31.mjs — v3.1.0 满血版 SMTC 重写回归
 * （桥自带满血媒体会话 + 插件侧控制执行器 + 逐字歌词防漂移渲染层）
 *
 * 层次：
 *   PSX 真 PowerShell 7 解析器语法门（桥 ps1 全文 ParseFile，零语法错误）
 *   ST  静态断言：桥 3.0.0 满血 SMTC（MediaPlayer 手动驱动/时间线/事件队列/
 *       自会话过滤/控制门修复）+ 插件A 2.1.0 内嵌桥 3.0.0 + 插件B 2.2.0
 *       控制执行器/末级重写/身份捕获 + 宿主 3.1.0 阈值 + sandbox slew/fadeMs
 *       + 部件淡入淡出消费（样式零改动）
 *   PB  插件B vm 白盒：role=ncm 心跳 / 真值快照 / 物理自愈 / store 兑底 /
 *       PB6 控制执行器（play/pause 元素优先 + next/prev 页脚点击）/ PB7 toggle
 *   PA  插件A vm 白盒：桥 3.0.0 在场退让注册 / 冷启动部署拉起
 *   e2e playwright（out/ 产物 + mock 桥 3.0.0 + smtcOwn 字段前向兼容）：
 *       单主反转根治 / 虚拟曲目推进 / 版本芯片五态 / pageerror=0
 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};
const PNG1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

/* ---------- PSX 真 PowerShell 语法门 ---------- */
{
  try {
    const out = execFileSync(
      "/home/z/my-project/.pkgtmp/pwsh/pwsh",
      ["-NoProfile", "-Command",
        `$errs=$null;$t=$null;` +
        `[System.Management.Automation.Language.Parser]::ParseFile('/home/z/my-project/bridge/smtc/chushi-bridge.ps1',[ref]$t,[ref]$errs)|Out-Null;` +
        `if($errs -and $errs.Count-gt 0){$errs|ForEach-Object{Write-Host('ERR L'+$_.Extent.StartLineNumber+': '+$_.Message)}}else{Write-Host 'SYNTAX OK'}`],
      { encoding: "utf8", timeout: 60000 }
    );
    check("PSX 桥 ps1 真 PowerShell 解析器语法门", out.includes("SYNTAX OK"), out.trim().split("\n")[0]);
  } catch (e) {
    check("PSX 桥 ps1 真 PowerShell 解析器语法门", false, String(e).slice(0, 120));
  }
}

/* ---------- ST 静态断言 ---------- */
{
  const ps1 = readFileSync("/home/z/my-project/bridge/smtc/chushi-bridge.ps1", "utf8");
  check("ST1 桥 v3.0.0 + register + NeOwner 仲裁在位",
    ps1.includes("$BRIDGE_VERSION = '3.0.0'") && ps1.includes("/api/plugin/register") &&
    ps1.includes("$script:NeOwner") && ps1.includes("role -eq 'ncm'"));
  check("ST2 桥纯传输化：ne-anchoring 已删除（不再 $posSec = $neSec）",
    !ps1.includes("$posSec = $neSec") && !ps1.includes("plugin truth anchoring"),
    "三层互打的桥层已移除");
  check("ST3 桥 /api/state 暴露 plugins 注册表 + smtcOwn 诊断",
    ps1.includes("SmtcPluginVer") && ps1.includes("-le 90") && ps1.includes("smtcOwnPub"));
  check("ST4 桥保留 needLyric 自愈 + 时长钳制",
    ps1.includes("needLyric") && ps1.includes("posSec -gt $script:State.Duration"));
  check("ST19 满血 SMTC：MediaPlayer 手动驱动（官方 manual-control 模式全要素）",
    ps1.includes("Windows.Media.Playback.MediaPlayer") &&
    ps1.includes("$player.CommandManager.IsEnabled = $false") &&
    ps1.includes("$ctrl.IsPlaybackPositionEnabled = $true") &&
    ps1.includes("UpdateTimelineProperties") &&
    ps1.includes("MinSeekTime") && ps1.includes("MaxSeekTime") &&
    ps1.includes("MediaPlaybackStatus]::Playing") &&
    ps1.includes("MediaPlaybackType]::Music"),
    "网易云自带残疾 SMTC 不再承担任何角色");
  check("ST19b 满血 SMTC 事件回路：ButtonPressed/PositionChangeRequested → 同步队列 → 主循环出栈",
    ps1.includes("-EventName 'ButtonPressed'") &&
    ps1.includes("-EventName 'PlaybackPositionChangeRequested'") &&
    ps1.includes("$script:SmtcQueue") && ps1.includes("Pop-SmtcEvents") &&
    ps1.includes("RequestedPlaybackPosition"),
    "媒体键/悬浮窗按钮/拖动 seek 全部回灌网易云");
  check("ST19c 静音内存 WAV（无临时文件/中文路径安全）+ 显式 AUMID 自过滤",
    ps1.includes("InMemoryRandomAccessStream") && ps1.includes("DataWriter") &&
    ps1.includes("ChuShi.SmtcBridge") && ps1.includes("Test-OwnSmtcSession") &&
    ps1.includes("'chushi|powershell|pwsh'"));
  check("ST20 控制门修复：命令队列化 + 无会话转发插件 + seek 标题门废除",
    ps1.includes("Enqueue-NeCmd") && ps1.includes("$script:NeCmdQueue") &&
    ps1.includes("via = 'plugin'") && ps1.includes("Tick-SmtcOwn") &&
    ps1.includes("Update-SmtcOwn $st"),
    "虚拟曲目场景面板按钮/拖动不再死路");

  const pa = readFileSync("/home/z/my-project/bridge/smtc-plugin/index.js", "utf8");
  check("ST5 插件A 2.1.0 职责单一：有全套桥管理，绝不推网易云状态，内嵌桥 3.0.0",
    pa.includes('PLUGIN_VERSION = "2.1.0"') && pa.includes('EMBEDDED_BRIDGE_VERSION = "3.0.0"') &&
    pa.includes("superviseBridge") && pa.includes("killStaleBridge") &&
    pa.includes("/api/plugin/register") && pa.includes("bridgeBlocked") &&
    !pa.includes("/api/plugin/state"));
  check("ST6 插件A 直启 powershell 优先 + 读回校验（WSH 弹窗/部署损坏双防线）",
    pa.includes("powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File") &&
    pa.includes("readFileText") && pa.includes("读回校验失败，本轮不拉起"));
  check("ST7 插件A 杀旧双路径（cmd netstat taskkill → powershell Get-NetTCPConnection）",
    pa.includes("netstat.exe -aon") && pa.includes("taskkill /F /T /PID") &&
    pa.includes("Get-NetTCPConnection"));

  const pb = readFileSync("/home/z/my-project/bridge/ncm-plugin/index.js", "utf8");
  check("ST8 插件B 2.2.0 职责单一：role=ncm 心跳，零桥管理代码",
    pb.includes('PLUGIN_VERSION = "2.2.0"') && pb.includes('role: "ncm"') &&
    !pb.includes("EMBEDDED_BRIDGE") && !pb.includes("deployBridge") &&
    !pb.includes("spawnBridge") && !pb.includes("superviseBridge") &&
    !pb.includes("killStaleBridge"));
  check("ST9 插件B 真值熔断四件套保留（身份锁/倒退熔断/零值熔断/channel 健康闸）",
    pb.includes("elLockStreak >= 2") && pb.includes("lastReportedPosMs - 2500") &&
    pb.includes("posMs < 800 && lastProgressMs > 3000") &&
    pb.includes("chushi-channel-seek-disabled"));
  check("ST10 插件B 旧插件冲突检测（配置面板提醒卸载旧「初始歌词源」）",
    pb.includes("__chushiLyricSourceActive") && pb.includes("卸载旧版"));
  check("ST22 插件B 控制执行器（play/pause 元素优先+可见按钮兑底；next/prev 页脚）",
    pb.includes("ctrlPlayPause") && pb.includes("ctrlNextPrev") &&
    pb.includes("clickVisibleBtn") && pb.includes('"#btn-next"') &&
    pb.includes("el.play()") && pb.includes("el.pause()"));
  check("ST22b 插件B seek 末级重写 1600ms + 身份捕获（直写生效元素立即上锁）",
    pb.includes("rewriteDone") && pb.includes("elapsed >= 1600") &&
    pb.includes("seek 身份捕获") && pb.includes("elLockStreak = 2"));
  check("ST22c 插件B 全量歌词链在位（eapi yrc → klyric → channel → plain + 缓存补推）",
    pb.includes("api/song/lyric/v1") && pb.includes("klyricToYrcText") &&
    pb.includes("track.lyric.getinfo") && pb.includes("rePushLyric") &&
    pb.includes("needLyric"));

  const smtc = readFileSync("/home/z/my-project/src/lib/startpage/smtc.ts", "utf8");
  check("ST11 宿主单主仲裁：judgeNcmOwns + app 身份权威 + 一次性年龄补偿",
    smtc.includes("private judgeNcmOwns") && smtc.includes('t.app === "NetEase Music"') &&
    smtc.includes("(now - ne.ts) / 1000") && smtc.includes("t.fetchedAt = now"));
  check("ST12 宿主零值守卫已删除（单主律：宿主不猜插件真值）",
    !smtc.includes("neZeroStreak") && !smtc.includes("trustZero"));
  check("ST23 宿主 v3.1.0 阈值（API 插件 ≥2.2.0 / 桥 ≥3.0.0 满血会话）",
    smtc.includes('verLt(pluginVerNow, "2.2.0")') &&
    smtc.includes('verLt(next.version, "3.0.0")') && smtc.includes("smtcVer"));
  check("ST14 宿主 harmonize 仅 SMTC-only（ncmOwns 反向门控）",
    smtc.includes("!ncmOwns) this.harmonize") && smtc.includes("!ncmOwns &&\n        track"));

  const sbox = readFileSync("/home/z/my-project/public/sandbox.js", "utf8");
  check("ST24 sandbox 音乐核心：slew 微抖吸收（≤0.35s 不重锚）+ fadeMs 按词时间轴计算",
    sbox.includes("LY_SLEW_SEC = 0.35") && sbox.includes("calcFadeMs") &&
    sbox.includes("st.fadeMs = calcFadeMs(posNow())") &&
    sbox.includes("fadeMs: st.fadeMs || 0") &&
    sbox.includes("Math.max(120, Math.min(420,"),
    "逐字歌词防累积漂移（用户指令渲染层落地）");
  check("ST24b sandbox 解析/对齐/快照核心未破坏（yrc/lrc/attachTr/align/posNow）",
    sbox.includes("function parseYrc") && sbox.includes("function parseLrc") &&
    sbox.includes("function attachTr") && sbox.includes("function align") &&
    sbox.includes("function posNow"));

  const whtml = readFileSync("/home/z/my-project/preset-src/smtc/music-widget.html", "utf8");
  check("ST15 部件防位移双保险保留（双SVG同圆心交叉淡切 + lyHold 高度迟滞）",
    whtml.includes(".bt.mi svg{position:absolute;left:50%;top:50%") &&
    whtml.includes(".off{opacity:0;transform:scale(.55)}") && whtml.includes("lyHold"));
  check("ST16 部件 v4 双插件文案（迁移/缺件/旧桥杀不死/手动桥页脚）",
    whtml.includes("双插件迁移") && whtml.includes("未装「初始网易云API」") &&
    whtml.includes("旧桥进程未被自动替换") && whtml.includes("手动桥") &&
    whtml.includes("初始SMTC桥」+「初始网易云API"));
  check("ST25 部件淡入淡出消费 fadeMs（内联 opacity 过渡，CSS 布局零改动）",
    whtml.includes("lyPrevOn") && whtml.includes("n.fadeMs||260") &&
    whtml.includes('lyInr.style.opacity=on2?"1":"0.38"') &&
    whtml.includes("transform .55s var(--ez), opacity "),
    "暂停淡出收敛在本词边界内，恢复淡入");

  const pkg = JSON.parse(readFileSync("/home/z/my-project/package.json", "utf8"));
  check("ST26 宿主版本 3.1.0", pkg.version === "3.1.0", pkg.version);
}

/* ---------- vm 白盒公共设施 ---------- */
let fakeNow = Date.now();
function makeVmSandbox(globals) {
  return Object.assign({
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    AbortController,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    alert: () => {},
    localStorage: {
      _m: new Map(),
      getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
      setItem(k, v) { this._m.set(k, String(v)); },
      removeItem(k) { this._m.delete(k); },
    },
    fetch: async () => { throw new Error("no-network"); },
    Date: { now: () => fakeNow },
  }, globals);
}
function runPlugin(src, sandbox) {
  const context = vm.createContext(sandbox);
  vm.runInContext(src, context, { timeout: 8000 });
  return context;
}

const src_smtc_plugin = readFileSync("/home/z/my-project/bridge/smtc-plugin/index.js", "utf8");
const akeEl = (o) => [{ currentTime: o.t, paused: o.paused !== false, duration: o.dur, isConnected: true }];

/* ---------- PB 插件B vm 白盒 ---------- */
{
  const src = readFileSync("/home/z/my-project/bridge/ncm-plugin/index.js", "utf8");
  const heartbeats = [];
  const execCalls = [];
  const regCalls = {};
  let domEls = [];
  const fire = (name, ...args) => {
    const cbs = regCalls[name] || [];
    for (const cb of cbs) cb(...args);
  };
  const sandbox = makeVmSandbox({
    window: {
      __chushiNcmApiActive: false,
      legacyNativeCmder: {
        appendRegisterCall: (name, _ch, cb) => { (regCalls[name] ||= []).push(cb); },
      },
      betterncm: {
        app: { exec: async (c) => { execCalls.push(c); return true; }, getDataPath: async () => "C:\\mock" },
        fs: {
          mkdir: async () => {}, readFileText: async () => null, writeFileText: async () => {},
        },
        ncm: {},
      },
      document: {
        querySelectorAll: () => domEls,
        createElement: () => ({ style: {}, classList: { toggle() {}, add() {} }, appendChild() {}, innerText: "" }),
      },
      channel: undefined,
    },
    plugin: {
      getConfig: (_k, d) => d,
      setConfig: () => {},
      onConfig: (_fn) => {},
    },
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.includes("/api/plugin/state")) {
        heartbeats.push(JSON.parse(opts?.body || "{}"));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: false, json: async () => ({}) };
    },
    document: undefined,
  });
  sandbox.document = sandbox.window.document;
  runPlugin(src, sandbox);

  await new Promise((r) => setTimeout(r, 300));
  fire("PlayState", "1", "1", 1);
  fire("PlayProgress", "1", 125.4);
  domEls = akeEl({ t: 125.4, paused: false, dur: 269 });
  await new Promise((r) => setTimeout(r, 1200));

  check("PB1 心跳携带 role=ncm + v=2.2.0（桥 owner 仲裁依赖）",
    heartbeats.some((h) => h.role === "ncm" && h.v === "2.2.0"),
    heartbeats.length ? `${heartbeats.length} 拍` : "无心跳");
  const hb = heartbeats[heartbeats.length - 1];
  check("PB2 真值快照随心跳上报（原生事件主源 positionMs≈125400）",
    hb && Math.abs(hb.positionMs - 125400) < 2500 && hb.playing === true,
    hb ? `pos=${hb.positionMs} playing=${hb.playing}` : "无心跳");
  check("PB3 零桥管理调用（exec 一次都不触发——职责单一律）", execCalls.length === 0,
    `execCalls=${execCalls.length}`);
}

/* ---------- PB4/PB5 v3.0.1 回归 + PB6/PB7 v2.2.0 控制执行器白盒 ---------- */
{
  const src = readFileSync("/home/z/my-project/bridge/ncm-plugin/index.js", "utf8");

  /* PB4 物理自愈 */
  {
    const heartbeats = [];
    const regCalls = {};
    let domEls = [];
    const fire = (name, ...args) => {
      const cbs = regCalls[name] || [];
      for (const cb of cbs) cb(...args);
    };
    const sandbox = makeVmSandbox({
      window: {
        __chushiNcmApiActive: false,
        legacyNativeCmder: {
          appendRegisterCall: (name, _ch, cb) => { (regCalls[name] ||= []).push(cb); },
        },
        betterncm: {
          app: { exec: async () => true, getDataPath: async () => "C:\\mock" },
          fs: { mkdir: async () => {}, readFileText: async () => null, writeFileText: async () => {} },
          ncm: {},
        },
        document: {
          querySelectorAll: () => domEls,
          createElement: () => ({ style: {}, classList: { toggle() {}, add() {} }, appendChild() {}, innerText: "" }),
        },
        channel: undefined,
      },
      plugin: { getConfig: (_k, d) => d, setConfig: () => {}, onConfig: (_fn) => {} },
      fetch: async (url, opts) => {
        const u = String(url);
        if (u.includes("/api/plugin/state")) {
          heartbeats.push(JSON.parse(opts?.body || "{}"));
          return { ok: true, json: async () => ({ ok: true }) };
        }
        return { ok: false, json: async () => ({}) };
      },
    });
    sandbox.document = sandbox.window.document;
    runPlugin(src, sandbox);
    await new Promise((r) => setTimeout(r, 300));
    fire("PlayState", "1", "1", 2);
    fire("PlayProgress", "1", 125.4);
    domEls = akeEl({ t: 125.4, paused: true, dur: 269 });
    await new Promise((r) => setTimeout(r, 1200));
    fire("PlayState", "1", "1", 2);
    fire("PlayProgress", "1", 125.6);
    domEls = akeEl({ t: 125.6, paused: true, dur: 269 });
    await new Promise((r) => setTimeout(r, 1200));
    const first = heartbeats[heartbeats.length - 1];
    fire("PlayState", "1", "1", 2);
    fire("PlayProgress", "1", 127.2);
    domEls = akeEl({ t: 127.2, paused: true, dur: 269 });
    await new Promise((r) => setTimeout(r, 1200));
    const healed = heartbeats[heartbeats.length - 1];
    check("PB4 物理自愈：推进<800ms 不误判，推进>800ms/拍而事件报暂停 → playing=true",
      first && healed && first.playing === false && healed.playing === true,
      `拍1(推进0.2s) playing=${first && first.playing} → 拍2(推进1.6s) playing=${healed && healed.playing} pos=${healed && healed.positionMs}`);
  }

  /* PB5 store 次级真值 */
  {
    const heartbeats = [];
    const mockStore = {
      _subs: [],
      getState() {
        return {
          playing: {
            paused: true, position: 120, resourceTrackId: 111,
            resourceName: "晴天", resourceArtists: [{ name: "周杰伦" }],
            curTrack: { duration: 269300 },
          },
        };
      },
      subscribe(fn) { this._subs.push(fn); },
    };
    const sandbox = makeVmSandbox({
      window: {
        __chushiNcmApiActive: false,
        legacyNativeCmder: { appendRegisterCall: () => {} },
        betterncm: {
          app: { exec: async () => true, getDataPath: async () => "C:\\mock" },
          fs: { mkdir: async () => {}, readFileText: async () => null, writeFileText: async () => {} },
          ncm: {},
        },
        document: {
          querySelectorAll: () => [{ currentTime: 999, paused: true, duration: 3, isConnected: true }],
          createElement: () => ({ style: {}, classList: { toggle() {}, add() {} }, appendChild() {}, innerText: "" }),
        },
        channel: undefined,
        webpackJsonp: {
          0: [],
          push(arr) {
            const map = arr[1];
            for (const k in map) {
              const req = function () {};
              req.c = { dva1: { exports: { a: { getStore: () => ({}), inited: true, app: { _store: mockStore } } } } };
              map[k]({}, {}, req);
            }
          },
        },
      },
      plugin: { getConfig: (_k, d) => d, setConfig: () => {}, onConfig: (_fn) => {} },
      fetch: async (url, opts) => {
        const u = String(url);
        if (u.includes("/api/plugin/state")) {
          heartbeats.push(JSON.parse(opts?.body || "{}"));
          return { ok: true, json: async () => ({ ok: true }) };
        }
        return { ok: false, json: async () => ({}) };
      },
    });
    sandbox.document = sandbox.window.document;
    runPlugin(src, sandbox);
    await new Promise((r) => setTimeout(r, 1500));
    const hb = heartbeats[heartbeats.length - 1];
    check("PB5 store 次级真值：原生死+元素不可信 → positionMs≈120000（不冻死 0）",
      hb && Math.abs(hb.positionMs - 120000) < 2500,
      hb ? `pos=${hb.positionMs} songId=${hb.song && hb.song.id}` : "无心跳");
  }

  /* PB6/PB7 控制执行器：桥命令 play/pause/toggle/next/prev 的页内执行路径 */
  {
    const heartbeats = [];
    const regCalls = {};
    const elAct = [];
    let cmdQueue = []; // 每次插件命令轮询发一条（先 play→pause→toggle→next→prev）
    let domEls = [];
    const fire = (name, ...args) => {
      const cbs = regCalls[name] || [];
      for (const cb of cbs) cb(...args);
    };
    const mkEl = () => ({
      currentTime: 125.4, paused: true, duration: 269, isConnected: true,
      offsetParent: {},
      play() { this.paused = false; elAct.push("play"); },
      pause() { this.paused = true; elAct.push("pause"); },
      click() { elAct.push("click:" + (this._tag || "?")); },
    });
    const sandbox = makeVmSandbox({
      window: {
        __chushiNcmApiActive: false,
        legacyNativeCmder: {
          appendRegisterCall: (name, _ch, cb) => { (regCalls[name] ||= []).push(cb); },
        },
        betterncm: {
          app: { exec: async () => true, getDataPath: async () => "C:\\mock" },
          fs: { mkdir: async () => {}, readFileText: async () => null, writeFileText: async () => {} },
          ncm: {},
        },
        document: {
          querySelectorAll: () => domEls,
          createElement: () => ({ style: {}, classList: { toggle() {}, add() {} }, appendChild() {}, innerText: "" }),
        },
        channel: undefined,
      },
      plugin: { getConfig: (_k, d) => d, setConfig: () => {}, onConfig: (_fn) => {} },
      fetch: async (url, opts) => {
        const u = String(url);
        if (u.includes("/api/plugin/state")) {
          heartbeats.push(JSON.parse(opts?.body || "{}"));
          return { ok: true, json: async () => ({ ok: true }) };
        }
        if (u.includes("/api/plugin/cmd")) {
          const cmd = cmdQueue.length ? cmdQueue.shift() : null;
          return { ok: true, json: async () => (cmd ? { ok: true, cmd } : { ok: true }) };
        }
        return { ok: false, json: async () => ({}) };
      },
      document: undefined,
    });
    sandbox.document = sandbox.window.document;
    const el = mkEl();
    domEls = [el];
    runPlugin(src, sandbox);
    await new Promise((r) => setTimeout(r, 300));
    fire("PlayState", "1", "1", 2); // 暂停态（元素 paused=true 一致）
    fire("PlayProgress", "1", 125.4);
    cmdQueue = ["play", "pause", "toggle", "next", "prev"];
    await new Promise((r) => setTimeout(r, 2600)); // 300ms 轮询×5 条命令
    const plays = elAct.filter((a) => a === "play").length;
    const pauses = elAct.filter((a) => a === "pause").length;
    const clicks = elAct.filter((a) => a.startsWith("click")).length;
    check("PB6 控制执行器：play/pause 走元素（play/pause 各≥1），next/prev 走页脚点击（≥2）",
      plays >= 1 && pauses >= 1 && clicks >= 2,
      `elAct=${JSON.stringify(elAct)}`);
    check("PB7 toggle 方向正确（暂停态收到 toggle → 执行 play）",
      plays >= 2 || (plays >= 1 && elAct.indexOf("play") < elAct.indexOf("pause")),
      `elAct=${JSON.stringify(elAct)}`);
    const hbC = heartbeats[heartbeats.length - 1];
    check("PB7b 控制执行不破坏真值上报（心跳仍在，positionMs 正常）",
      hbC && Math.abs(hbC.positionMs - 125400) < 2500,
      hbC ? `pos=${hbC.positionMs}` : "无心跳");
  }
}

/* ---------- PA 插件A vm 白盒 ---------- */
function makePaEnv(pingVer) {
  const registrations = [];
  const execCalls = [];
  const fsStore = new Map();
  const sandbox = makeVmSandbox({
    window: {
      __chushiSmtcBridgePluginActive: false,
      betterncm: {
        app: {
          exec: async (c) => { execCalls.push(c); return true; },
          getDataPath: async () => "C:\\mock",
        },
        fs: {
          mkdir: async () => {},
          readFileText: async (rel) => fsStore.get(rel) ?? null,
          writeFileText: async (rel, content) => { fsStore.set(rel, content); },
        },
      },
    },
    plugin: { getConfig: (_k, d) => d, setConfig: () => {}, onConfig: (_fn) => {} },
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.includes("/api/ping")) {
        if (!pingVer) throw new Error("unreachable");
        return { ok: true, json: async () => ({ ok: true, name: "chushi-smtc-bridge", version: pingVer }) };
      }
      if (u.includes("/api/plugin/register")) {
        registrations.push(JSON.parse(opts?.body || "{}"));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: false, json: async () => ({}) };
    },
    document: {
      createElement: () => ({ style: {}, classList: { toggle() {}, add() {} }, appendChild() {}, innerText: "" }),
    },
  });
  return { registrations, execCalls, fsStore, sandbox };
}

/* 场景1：桥在场且为新版（3.0.0）→ 只注册，绝不杀旧/拉起/部署（版本仲裁退让） */
{
  const env = makePaEnv("3.0.0");
  runPlugin(src_smtc_plugin, env.sandbox);
  await new Promise((r) => setTimeout(r, 3000));
  check("PA1 桥在场即注册（role=smtc v=2.1.0 活体上报）",
    env.registrations.some((r) => r.role === "smtc" && r.v === "2.1.0"),
    `${env.registrations.length} 次注册`);
  check("PA2 新桥在场零进程操作（不杀旧不拉起不部署）", env.execCalls.length === 0,
    `execCalls=${env.execCalls.length}`);
  check("PA3 注册载荷含 role=smtc（宿主 plugins.smtc 来源）",
    env.registrations.every((r) => r.role === "smtc"), "");
}
/* 场景2：桥不可达（冷启动）→ 部署写盘 + 直启 powershell 拉起 */
{
  const env = makePaEnv("");
  runPlugin(src_smtc_plugin, env.sandbox);
  await new Promise((r) => setTimeout(r, 3200));
  check("PA4 冷启动：部署写盘（ps1+vbs 落盘）",
    env.fsStore.has("chushi-bridge/chushi-bridge.ps1") &&
    env.fsStore.has("chushi-bridge/chushi-bridge-launch.vbs"));
  check("PA5 冷启动：直启 powershell -File 拉起（不经 wscript 零 WSH 弹窗）",
    env.execCalls.some((c) => c.includes("-File") && c.includes("chushi-bridge.ps1")));
}

/* ---------- e2e：mock 桥 3.0.0 + out/ 产物 ---------- */
const DUR = 269.3;
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "3.0.0-mock", track: null, ne: null, plugins: null };
let mockTruth = null;         // { pos, playing, t0 }
let mockSeekAck = null;
let neLyricRev = "";
let smtcPluginVer = "2.1.0";  // plugins.smtc（管理插件活体注册）
let controlLog = [];

function defaultNe() {
  const now = Date.now();
  const pos = mockTruth.pos + (mockTruth.playing ? (now - mockTruth.t0) / 1000 : 0);
  return {
    songId: 123456, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "",
    positionMs: Math.max(0, Math.round(pos * 1000)),
    durationMs: Math.round(DUR * 1000),
    playing: mockTruth.playing,
    lyricRev: neLyricRev,
    ts: now - 60, v: "2.2.0",
    seekAckId: mockSeekAck ? mockSeekAck.id : "",
    seekAckOk: mockSeekAck ? mockSeekAck.ok === true : false,
    seekAckPos: mockSeekAck ? mockSeekAck.pos : 0,
    seekAckAt: mockSeekAck ? mockSeekAck.at : 0,
  };
}

const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (u.pathname === "/api/ping") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: "chushi-smtc-bridge", version: "3.0.0-mock" }));
    return;
  }
  if (u.pathname === "/api/state") {
    const out = { ...mockState };
    if (mockTruth) out.ne = defaultNe();
    if (smtcPluginVer) out.plugins = { smtc: smtcPluginVer };
    // v3.1.0 桥新增 smtcOwn 诊断字段（宿主必须前向兼容不炸）
    out.smtcOwn = { ready: true, live: !!mockTruth, playing: !!(mockTruth && mockTruth.playing), position: 0, duration: 0 };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
    return;
  }
  if (u.pathname === "/api/cover") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PNG1PX);
    return;
  }
  if (u.pathname === "/api/lyric") {
    res.writeHead(200, { "content-type": "application/json" });
    if (neLyricRev) {
      res.end(JSON.stringify({
        ok: true, rev: neLyricRev,
        lyric: {
          songId: 123456, title: "晴天", artist: "周杰伦",
          yrc: "", lrc: "[00:01.00]故事的小黄花\n[00:05.00]从出生那年就飘着\n[00:09.00]童年的荡秋千",
          tlyric: "", ytlrc: "", source: "mock-lrc",
        },
      }));
    } else {
      res.end(JSON.stringify({ ok: false, reason: "no-lyric" }));
    }
    return;
  }
  if (u.pathname === "/api/control" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let cmd = "", position = null;
      try { const j = JSON.parse(body || "{}"); cmd = String(j.cmd || ""); position = j.position; } catch (e) {}
      controlLog.push({ cmd, position, at: Date.now() });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  res.writeHead(404); res.end("nf");
});
await new Promise((r) => mock.listen(20754, r));

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try {
    const body = readFileSync(f);
    const ext = f.slice(f.lastIndexOf("."));
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(4635, r));

const browser = await chromium.launch();
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx2.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  try {
    localStorage.clear();
    localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
  } catch (e) {}
});
await page.goto("http://localhost:4635/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

const dockMusicBtn = page.locator(".cl-dock button[aria-label='音乐']");
const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
const apTxt = () => wFrame().locator("#ap").textContent();
const t1Txt = () => wFrame().locator("#t1").textContent();
const barW = () => wFrame().locator("#bar").evaluate((el) => parseFloat(el.style.width) || 0);
const playIconOff = () => wFrame().locator("#yI").evaluate((el) => el.classList.contains("off"));
const updTxt = () => wFrame().locator("#updTxt").textContent();
const updOn = () => wFrame().locator("#updChip").evaluate((el) => el.classList.contains("on"));

/* E 导入预设 */
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2600);
check("E1 .cshz 导入无错误", (await page.locator("text=/错误|必须|缺失|不支持/").count()) === 0);
check("E2 dock 音乐按钮出现", (await dockMusicBtn.count()) === 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* N1 NCM 单主：SMTC 元数据带修饰且 playing 冻结为 false（模拟旧版反转源头），
   ne 真值 playing=true → 面板必须显示 ne 元数据 + 播放态（反转根治实证） */
mockState = {
  ...mockState,
  track: {
    app: "NetEase Music", title: "晴天 (Live)【超清】", artist: "周杰伦/蔡依林", album: "",
    playing: false, position: 7, duration: DUR, rate: 1, coverRev: "rev-a",
  },
};
mockTruth = { pos: 88.4, playing: true, t0: Date.now() };
await dockMusicBtn.click();
await page.waitForTimeout(2600);
check("N1 单主元数据：面板显示 ne 歌名（SMTC 修饰名被真值覆盖）",
  (await t1Txt()) === "晴天", await t1Txt());
const bw1 = await barW();
check("N2 单主进度：进度条按 ne 真值（≈88.4s→33%）而非 SMTC 冻结 7s",
  Math.abs(bw1 - (88.4 / DUR) * 100) < 6, `bar=${bw1.toFixed(1)}%`);
check("N3 单主播放态：面板为播放中（SMTC 说暂停、ne 说播放 → ne 赢）",
  (await playIconOff()) === true);
check("N4 页脚双版本：API v2.2.0 + 管理 v2.1.0（注册表活体）",
  (await apTxt()).includes("API v2.2.0") && (await apTxt()).includes("管理 v2.1.0"),
  await apTxt());

/* N5 芯片熄灭：全新组件（桥 3.0.0 + 管理插件 2.1.0 + API 插件 2.2.0）→ 升级芯片不亮 */
check("N5 全新组件升级芯片熄灭（版本误报根治）", (await updOn()) === false);

/* N6 SMTC 管理插件缺席（手动桥）：页脚标注手动桥，芯片仍熄灭 */
smtcPluginVer = null;
await page.waitForTimeout(2400);
check("N6 手动桥页脚如实标注（不喊升级）",
  (await apTxt()).includes("手动桥") && (await updOn()) === false, await apTxt());
smtcPluginVer = "2.1.0";

/* N7 版本芯片：管理插件注册但桥版本旧 = 旧桥杀不死实锤 → 手动指引
   （v3.1.0 语义：桥 <3.0.0 = 缺满血会话，插件A 会自动升级；杀不死才亮此芯片） */
mockState = { ...mockState, version: "2.0.0-mock" };
await page.waitForTimeout(2400);
check("N7a 旧桥杀不死实锤：给手动指引而非「更新插件」",
  (await updOn()) === true && (await updTxt()).includes("旧桥进程未被自动替换"),
  await updTxt());
mockState = { ...mockState, version: "3.0.0-mock" };
await page.waitForTimeout(2400);

/* N7b API 插件 2.1.0（缺 v2.2.0 控制执行器）→ 组件待更新芯片 */
mockState = { ...mockState, ne: null };
mockTruth = null;
await page.waitForTimeout(2400);
mockTruth = { pos: 30, playing: true, t0: Date.now() };
let neV2 = "2.1.0";
const savedDefaultNe = defaultNe;
defaultNe = function () {
  const n = savedDefaultNe();
  n.v = neV2;
  return n;
};
await page.waitForTimeout(2600);
check("N7b API 插件 2.1.0 → 组件待更新芯片（v3.1.0 新阈值 2.2.0 生效）",
  (await updOn()) === true && (await updTxt()).includes("组件待更新"), await updTxt());
defaultNe = savedDefaultNe;
neV2 = "2.2.0";
await page.waitForTimeout(2400);

/* N8 缺插件 → 安装指引；旧一体化 → 迁移文案 */
mockState = { ...mockState, ne: null };
mockTruth = null;
await page.waitForTimeout(2400);
check("N8a 插件消失后升级芯片亮起", (await updOn()) === true);
check("N8b 缺件文案指向安装网易云API",
  (await updTxt()).includes("未装「初始网易云API」"), await updTxt());

mockTruth = null;
mockState = {
  ...mockState,
  ne: {
    songId: 123456, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "",
    positionMs: 30000, durationMs: Math.round(DUR * 1000), playing: false,
    lyricRev: "", ts: Date.now() - 100, v: "1.5.1",
    seekAckId: "", seekAckOk: false, seekAckPos: 0, seekAckAt: 0,
  },
};
await page.waitForTimeout(2400);
check("N8c 旧一体化 1.5.1 → 双插件迁移文案（卸旧装新，操作真实可行）",
  (await updTxt()).includes("双插件迁移"), await updTxt());

/* N9 SMTC-only：ne 消失、SMTC 会话非网易云（Spotify）→ 显示 SMTC 元数据 */
mockState = {
  ...mockState, ne: null,
  track: {
    app: "Spotify", title: "Fake Love", artist: "Taylor Swift", album: "reputation",
    playing: true, position: 42, duration: 222, rate: 1, coverRev: "rev-b",
  },
};
mockTruth = null;
await page.waitForTimeout(2400);
check("N9 SMTC-only 兜底：显示 Spotify 曲目（NCM 不在场不抢面板）",
  (await t1Txt()) === "Fake Love" && (await apTxt()).includes("Spotify"),
  `${await t1Txt()} / ${await apTxt()}`);

/* N10 v3.0.1 虚拟曲目回归：桥 HasSession=false 但 ne 心跳有效播放 → 真值独占 */
mockState = { ...mockState, track: null, ne: null };
mockTruth = { pos: 60, playing: true, t0: Date.now() };
await page.waitForTimeout(2600);
check("N10 虚拟曲目：桥无 SMTC 会话时 ne 真值独占面板",
  (await t1Txt()) === "晴天" && (await apTxt()).includes("NetEase Music"),
  `${await t1Txt()} / ${await apTxt()}`);
const bwA = await barW();
await page.waitForTimeout(2200);
const bwB = await barW();
check("N10b 虚拟曲目进度推进（bar 前进 ≥0.5%；slew 平滑不拦真值推进）",
  bwB > bwA + 0.5, `${bwA.toFixed(1)}%→${bwB.toFixed(1)}%`);
mockTruth = null;

check("X1 pageerror = 0", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
mock.close();
server.close();

const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\n=== verify-v31: ${pass}/${results.length} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
