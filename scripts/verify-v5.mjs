/* verify-v5 part 1: static gates + PSX syntax gate + music core unit tests.
 * Run: node scripts/verify-v5.mjs   (exit 0 = all green) */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
let pass = 0, failCount = 0;
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { failCount++; console.log(`  FAIL ${name} ${detail}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const pkg = JSON.parse(read("package.json"));
const engine = read("bridge/engine/chushi-smtc-engine.ps1");
const mgrJs = read("bridge/smtc-plugin/index.js");
const apiJs = read("bridge/ncm-plugin/index.js");
const sandboxJs = read("public/sandbox.js");
const smtcTs = read("src/lib/startpage/smtc.ts");
const presetWidgets = read("src/components/startpage/PresetWidgets.tsx");
const sandboxTs = read("src/lib/startpage/sandbox.ts");
const widgetHtml = read("preset-src/smtc/music-widget.html");
const cshzPath = path.join(ROOT, "examples/初始SMTC音乐预设.cshz");

/* ================= S1: version chain ================= */
console.log("S1 version chain");
ok("S1.1 package.json 5.0.0", pkg.version === "5.0.0", pkg.version);
ok("S1.2 manager PLUGIN_VERSION", mgrJs.includes('PLUGIN_VERSION = "5.0.0"'));
ok("S1.3 api PLUGIN_VERSION", apiJs.includes('PLUGIN_VERSION = "5.0.0"'));
ok("S1.4 engine version", engine.includes('$EngineVersion = "5.0.0"'));
ok("S1.5 host plugin gate", smtcTs.includes('PLUGIN_VER_MIN = "5.0.0"'));
ok("S1.6 host engine gate", smtcTs.includes('ENGINE_VER_MIN = "5.0.0"'));
ok("S1.7 host consumes engine gate", /engineOld\s*=\s*semverLt\(version,\s*ENGINE_VER_MIN\)/.test(smtcTs.replace(/\s+/g, " ")));

/* ================= S2: engine own-session law ================= */
console.log("S2 engine");
const engBans = ["GlobalSystemMediaTransportControls", "GetSessions", "TryPlayAsync",
  "TryPauseAsync", "TryChangePlaybackPosition", "GetForCurrentView", "GetForWindow"];
for (const b of engBans) ok(`S2 ban ${b}`, !engine.includes(b));
const engNeeds = ["MediaPlayer", "CommandManager.IsEnabled = $false", "IsPlaybackPositionEnabled = $true",
  "MinSeekTime", "MaxSeekTime", "UpdateTimelineProperties", "Register-ObjectEvent",
  "InMemoryRandomAccessStream", "HttpListener", "ChuShi.SmtcEngine", "/api/ping",
  "/api/state", "/api/ne", "/api/lyric", "/api/cmd", "/api/mgr",
  "Access-Control-Allow-Origin", "PlaybackPositionChangeRequested", "ButtonPressed",
  "engine.log", "Mutex", "SetCurrentProcessExplicitAppUserModelID"];
for (const n of engNeeds) ok(`S2 need ${n}`, engine.includes(n));
ok("S2 stale watchdog", engine.includes("$TruthStaleMs = 6000"));
ok("S2 port", engine.includes("param([int]$Port = 26801)"));

/* ================= S3: manager law ================= */
console.log("S3 manager");
ok("S3.1 guard v5", mgrJs.includes("window.__chushiSmtcManagerV5"));
ok("S3.2 spawn powershell", mgrJs.includes('"powershell.exe"'));
ok("S3.3 kill only powershell", mgrJs.includes('img.indexOf("powershell")'));
ok("S3.4 sha read-back", mgrJs.includes("read-back-sha") && mgrJs.includes("sha256Hex"));
ok("S3.5 backoff ladder", mgrJs.includes("Math.min(state.backoffMs * 2, 160000)"));
ok("S3.6 heartbeat", mgrJs.includes('"/api/mgr"') && mgrJs.includes("10000"));
ok("S3.7 version upgrade kill", /String\(j\.ver\) !== ENGINE_VER_REQUIRED/.test(mgrJs));
ok("S3.8 legacy port cleanup", mgrJs.includes("20754"));

/* ================= S4: music api read-only law ================= */
console.log("S4 music api");
const apiBans = ["dispatch(", "setPlayingPosition", "HTMLMediaElement.prototype",
  "prototype.currentTime", "GlobalSystemMediaTransportControls", "__chushiMusicApiV4"];
for (const b of apiBans) ok(`S4 ban ${b}`, !apiJs.includes(b));
const writePoints = (apiJs.match(/\.currentTime\s*=(?![=>])/g) || []).length;
ok("S4.1 single currentTime write", writePoints === 1, `found ${writePoints}`);
const apiNeeds = ["window.__chushiMusicApiV5", "legacyNativeCmder", "appendRegisterCall",
  "PlayState", "PlayProgress", "e82ckenh8dichen8", "36cd479b6b5", "md5forencrypt",
  "/api/song/lyric/v1", "eapi/song/lyric/v1", "track.lyric.getinfo",
  "music.163.com/api/song/lyric", "seekAckId", "seekAckOk", "seekAckAt",
  "offsetParent", "klyricToYrc", "resourceTrackId", "curTrack"];
for (const n of apiNeeds) ok(`S4 need ${n}`, apiJs.includes(n));
ok("S4.2 seek readback 420ms", apiJs.includes("420") && apiJs.includes("0.9"));
ok("S4.3 event freshness window", apiJs.includes("EV_PLAY_FRESH") && apiJs.includes("EV_POS_FRESH"));

/* ================= S5: host smtc.ts fresh client ================= */
console.log("S5 host client");
ok("S5.1 public exports", ["export const smtc", "export function smtcPositionNow",
  "export const SMTC_COMMANDS", "export interface SmtcTrack", "export interface SmtcState",
  "export interface SmtcLyric"].every((x) => smtcTs.includes(x)));
const hostBans = ["normalizeNe", "stateSig", "function fetchJson", "judgeNcmOwns",
  "harmonize", "seekHold", "lastDelta", "trackMatchesNe"];
for (const b of hostBans) ok(`S5 ban ${b}`, !smtcTs.includes(b));
ok("S5.2 single-truth direct display", smtcTs.includes('app: "NetEase Music"'));
ok("S5.3 age compensation", smtcTs.includes("TRUTH_STALE_SEC"));
ok("S5.4 seek note window", smtcTs.includes("拖动未生效：网易云未响应") && smtcTs.includes("3800"));
ok("S5.5 engineOld field", smtcTs.includes("engineOld"));
ok("S5.6 offline 2-streak", smtcTs.includes("failStreak >= 2"));
ok("S5.7 whitelist cmds", smtcTs.includes('"play", "pause", "toggle", "next", "prev", "seek"'));

/* ================= S6: sandbox.js music core ================= */
console.log("S6 sandbox core");
const sbBans = ["__chushiMusicCore(", "smtcControlReq", "pendingSmtc", "smtcTargets",
  "musicTargets", "LY_SLEW_SEC", "calcFadeMs"];
for (const b of sbBans) ok(`S6 ban ${b}`, !sandboxJs.includes(b));
const sbNeeds = ["__chushiMusicCoreV5", "mediaControlRequest", "musicCores",
  "__chushiMusicCoreV5.toString()", "feed: feed, tick: tick, now: now, snapshot: snapshot",
  "play: simple(\"play\")", "chushi.music"];
for (const n of sbNeeds) ok(`S6 need ${n}`, sandboxJs.includes(n));
ok("S6 slew 0.35", sandboxJs.includes("SLEW_SEC = 0.35"));
ok("S6 word-clip contract kept", sandboxJs.includes("Function.toString()"));

/* ================= S7: host glue fresh ================= */
console.log("S7 host glue");
ok("S7.1 PresetWidgets fresh fn", presetWidgets.includes("pushSmtcSnapshot"));
ok("S7.2 wire widgetSmtc", presetWidgets.includes("widgetSmtc") && presetWidgets.includes("widgetSmtcTick") && presetWidgets.includes("widgetSmtcResult"));
ok("S7.3 sandbox.ts fresh fn", sandboxTs.includes("pushSnapshots") && sandboxTs.includes("pushAnchors"));
ok("S7.4 wire smtcPush", sandboxTs.includes("smtcPush") && sandboxTs.includes("smtcTick"));

/* ================= S8: widget html ================= */
console.log("S8 widget");
ok("S8.1 anti-shift stacked icons", widgetHtml.includes(".cs-bmain svg{position:absolute;left:50%;top:50%") &&
  widgetHtml.includes("margin:-10px 0 0 -10px"));
ok("S8.2 word sweep clip", widgetHtml.includes("clip-path:inset(-8% calc(100% - var(--p,0%)) -8% 0)"));
ok("S8.3 lyric mask", widgetHtml.includes("-webkit-mask-image"));
ok("S8.4 fresh classes only", !widgetHtml.includes('class="bt') && !widgetHtml.includes("lyline"));
ok("S8.5 chip texts", widgetHtml.includes("引擎版本过旧") && widgetHtml.includes("引擎未运行") &&
  widgetHtml.includes("未装 ChuShi Music API 插件"));
ok("S8.6 no external urls", !/https?:\/\//.test(widgetHtml));
ok("S8.7 heights", widgetHtml.includes("{ fl: 248, em: 92 }") && widgetHtml.includes("LY_H = 124"));
ok("S8.8 music api only", widgetHtml.includes("chushi.music.now") && widgetHtml.includes("mus.subscribe"));

/* ================= S9: extension build port fix ================= */
console.log("S9 extension manifest source");
const extBuilder = read("scripts/build-extension.py");
ok("S9.1 host_permissions 26801", extBuilder.includes("http://127.0.0.1:26801/*"));
ok("S9.2 no stale 20754", !extBuilder.includes("20754"));

/* ================= S10: cshz package ================= */
console.log("S10 preset package");
{
  const { execSync } = await import("node:child_process");
  const listing = execSync(`unzip -l "${cshzPath}"`, { encoding: "utf8" });
  ok("S10.1 entries", listing.includes("manifest.json") && listing.includes("assets/cover.svg"));
  const man = JSON.parse(execSync(`unzip -p "${cshzPath}" manifest.json`, { encoding: "utf8" }));
  ok("S10.2 widget id", man.widgets?.[0]?.id === "music" && man.widgets?.[0]?.surface === "dock");
  const html = man.widgets?.[0]?.html || "";
  ok("S10.3 embedded html is v5", html.includes("cs-bmain") && html.includes("chushi.music"));
  ok("S10.4 no external url", !/https?:\/\//.test(html));
  ok("S10.5 commands fresh", (man.scripts?.[0]?.code || "").includes("musicApi"));
}

/* ================= PSX: real PowerShell syntax gate ================= */
console.log("PSX engine syntax (pwsh 7 parser)");
{
  const pwsh = path.join(ROOT, ".pkgtmp/pwsh/pwsh");
  try {
    const out = execFileSync(pwsh, ["-NoProfile", "-Command",
      `$tok=$null;$err=$null;` +
      `[System.Management.Automation.Language.Parser]::ParseFile('${path.join(ROOT, "bridge/engine/chushi-smtc-engine.ps1")}',[ref]$tok,[ref]$err)|Out-Null;` +
      `if($err.Count){$err|ForEach-Object{"ERR L$($_.Extent.StartLineNumber): $($_.Message)"};exit 1}else{"SYNTAX OK"}`,
    ], { encoding: "utf8" });
    ok("PSX SYNTAX OK", out.includes("SYNTAX OK"), out.trim());
  } catch (e) {
    ok("PSX SYNTAX OK", false, String(e.stdout || e.message).slice(0, 300));
  }
}

/* ================= M: music core unit tests ================= */
console.log("M music core units");
function extractCore(src) {
  const start = src.indexOf("function __chushiMusicCoreV5(hooks)");
  if (start < 0) throw new Error("core function not found");
  let depth = 0, i = src.indexOf("{", start);
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error("core function end not found");
}
{
  const fnText = extractCore(sandboxJs);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`var __coreFn = ${fnText};`, ctx);
  const mk = (controlImpl) => {
    ctx.__hooks = { control: controlImpl || (async () => true), requestSubscribe() { } };
    return vm.runInContext("__coreFn(__hooks)", ctx);
  };

  // M1 feed -> whitelist snapshot
  const core = mk();
  let subSnap = null;
  core.subscribe((s) => { subSnap = s; });
  core.feed({
    connected: true,
    track: { app: "NetEase Music", title: "晴天", artist: "周杰伦", album: "叶惠美", playing: true, position: 10, duration: 269.3, rate: 1, fetchedAt: Date.now() },
    coverUrl: "https://p1.example/x.jpg",
    lyricRev: "186016-eapi-yrc-123",
    pluginVer: "5.0.0", smtcVer: "5.0.0",
    needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
  });
  ok("M1 feed whitelist", subSnap && subSnap.title === "晴天" && subSnap.playing === true &&
    subSnap.coverUrl === "https://p1.example/x.jpg" && subSnap.pluginVer === "5.0.0" &&
    subSnap.engineOld === false);

  // M2 interpolation (no per-frame accumulation: now() = anchor + elapsed)
  const n1 = core.now();
  ok("M2 interpolation", Math.abs(n1.position - 10) < 1.5 && n1.playing === true && n1.duration > 269);

  // M3 slew: small delta absorbed, big jump re-anchors
  core.tick({ position: 10.1, playing: true, fetchedAt: Date.now() });
  const n2 = core.now();
  ok("M3a slew absorbs small delta", n2.position < 11.5, `pos=${n2.position.toFixed(2)}`);
  core.tick({ position: 30, playing: true, fetchedAt: Date.now() });
  const n3 = core.now();
  ok("M3b big jump re-anchors", Math.abs(n3.position - 30) < 1.5, `pos=${n3.position.toFixed(2)}`);

  // M4 yrc parse: JSON credit lines skipped, bracket lines parsed, translation attach
  const core2 = mk();
  core2.feed({
    connected: true,
    track: { app: "NetEase Music", title: "t", artist: "a", album: "", playing: true, position: 0, duration: 30, rate: 1, fetchedAt: Date.now() },
    lyricRev: "k1",
    lyric: {
      songId: 1, title: "t", artist: "a",
      yrc: '{"t":0,"c":[{"tx":"作词: X"}]}\n[10000,3000](10000,1500,0)你(11500,1500,0)好\n[14000,2000](14000,2000,0)世(16000,2000,0)界',
      ytlrc: "[00:09.80]Hello there\n[00:14.00]World",
      lrc: "", tlyric: "", source: "eapi-yrc",
    },
  });
  const ly = core2.lyrics();
  ok("M4a word mode", ly && ly.mode === 1 && ly.lines.length === 2, ly && `lines=${ly.lines.length}`);
  ok("M4b words parsed", ly && ly.lines[0].w.length === 2 && ly.lines[0].w[0].t === "你");
  ok("M4c translation attach", ly && ly.lines[0].tr === "Hello there");

  // M5 pause fade: remaining word time drives fadeMs (120..420 clamp)
  const seen = [];
  const core3 = mk();
  core3.feed({
    connected: true,
    track: { app: "N", title: "t", artist: "", album: "", playing: true, position: 10.8, duration: 30, rate: 1, fetchedAt: Date.now() },
    lyricRev: "k2",
    lyric: { songId: 1, title: "", artist: "", yrc: "[10000,2000](10000,1000,0)你(11000,1000,0)好", ytlrc: "", lrc: "", tlyric: "", source: "eapi-yrc" },
  });
  core3.subscribe((s) => seen.push(s));
  core3.tick({ position: 11.2, playing: false, fetchedAt: Date.now() }); // pause while 好 (11000-12000) active, ~800ms left
  const n5 = core3.now();
  ok("M5a paused", n5.playing === false && n5.fadeMs >= 120 && n5.fadeMs <= 420, `fadeMs=${n5.fadeMs}`);
  ok("M5b fade = word remaining clamp", n5.fadeMs >= 400 || (n5.fadeMs <= 420 && n5.fadeMs >= 380), `fadeMs=${n5.fadeMs}`);

  // M6 lrc fallback + dedup
  const core4 = mk();
  core4.feed({
    connected: true,
    track: { app: "N", title: "t", artist: "", album: "", playing: false, position: 0, duration: 100, rate: 1, fetchedAt: Date.now() },
    lyricRev: "k3",
    lyric: { songId: 2, title: "", artist: "", yrc: "", ytlrc: "", lrc: "[00:01.00]一\n[00:01.00]一\n[00:05.00]二", tlyric: "", source: "eapi-lrc" },
  });
  const ly4 = core4.lyrics();
  ok("M6 lrc mode + dedup", ly4 && ly4.mode === 2 && ly4.lines.length === 2, ly4 && `lines=${ly4.lines.length}`);

  // M7 seek optimistic re-anchor
  let seekCmd = null;
  const core5 = mk(async (cmd, pos) => { seekCmd = [cmd, pos]; return true; });
  core5.feed({
    connected: true,
    track: { app: "N", title: "t", artist: "", album: "", playing: true, position: 5, duration: 100, rate: 1, fetchedAt: Date.now() },
  });
  const seekOk = await core5.seek(42);
  const n7 = core5.now();
  ok("M7 seek re-anchor", seekOk === true && seekCmd[0] === "seek" && seekCmd[1] === 42 &&
    Math.abs(n7.position - 42) < 0.5, `pos=${n7.position.toFixed(2)}`);

  // M8 engineOld passthrough
  const core6 = mk();
  let s8 = null;
  core6.subscribe((x) => { s8 = x; });
  core6.feed({ connected: true, track: { app: "N", title: "t", artist: "", album: "", playing: false, position: 0, duration: 0, rate: 1, fetchedAt: Date.now() }, needsBridge: true, engineOld: true });
  ok("M8 engineOld flag", s8 && s8.engineOld === true && s8.needsBridge === true);
}

console.log(`\nverify-v5[1]: ${pass} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
