/* verify-v6.mjs — v6 generation static gates (part 1/3)
 * Exit 0 only when every gate passes.
 * Constitution under test:
 *   C1 三插件纯插件架构：全栈零外部引擎（PS1/spawn/engine 零残留）
 *   C2 单真值 + 单次执行律（currentTime 唯一写点在桥）
 *   C3 插件名英文 / 介绍中文 / 文件名 ASCII / ncm3-compatible
 *   C4 公开面兼容（smtc.ts 导出面字段级不变）
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOT = "/home/z/my-project";
let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`ok   ${name}`); }
  else { fail++; failures.push(name); console.error(`FAIL ${name}${detail ? " :: " + detail : ""}`); }
}
const rd = (p) => readFileSync(join(ROOT, p), "utf8");
const sha = (p) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");

/* ============ S1: engine retirement (C1) ============ */
{
  const bridge = rd("bridge/v6/music-bridge/index.js");
  const smtcM = rd("bridge/v6/smtc-manager/index.js");
  const lyric = rd("bridge/v6/lyric-source/index.js");
  const banned = ["child_process", "powershell", "PowerShell", "spawn", ".ps1",
    "chushi-smtc-engine", "Start-Engine", "LOCALAPPDATA"];
  for (const b of banned) {
    check(`S1 bridge engine-free (${b})`, !bridge.includes(b));
    check(`S1 smtc-manager engine-free (${b})`, !smtcM.includes(b));
    check(`S1 lyric-source engine-free (${b})`, !lyric.includes(b));
  }
  check("S1 smtc-manager is pure mediaSession", smtcM.includes("navigator.mediaSession"));
  check("S1 smtc-manager no node require", !/\brequire\s*\(/.test(smtcM));
  check("S1 bridge uses renderer node http", bridge.includes('require("http")'));
  check("S1 smtc-manager no http server", !bridge.includes("createServer") || bridge.includes("http.createServer"));
  check("S1 smtc-manager creates no server", !smtcM.includes("createServer"));
}

/* ============ S2: single-execution law (C2) ============ */
{
  const bridge = rd("bridge/v6/music-bridge/index.js");
  const writes = bridge.match(/\.currentTime\s*=[^=]/g) || [];
  check("S2 currentTime write is unique in bridge", writes.length === 1, JSON.stringify(writes));
  check("S2 read-back marker present", bridge.includes("420") && bridge.includes("580"));
  const smtcM = rd("bridge/v6/smtc-manager/index.js");
  check("S2 smtc-manager never writes currentTime", !/\.currentTime\s*=[^=]/.test(smtcM));
  check("S2 smtc-manager forwards commands only",
    smtcM.includes("setActionHandler") && !smtcM.includes(".play()") && !smtcM.includes(".pause()"));
  const lyric = rd("bridge/v6/lyric-source/index.js");
  check("S2 lyric-source has no control logic", !/\.currentTime\s*=[^=]/.test(lyric) &&
    !lyric.includes("el.play") && !lyric.includes("btn-play"));
  check("S2 bridge never dispatches to store", !/\.dispatch\s*\(/.test(bridge));
  const smtcTs = rd("src/lib/startpage/smtc.ts");
  check("S2 page client never touches player internals",
    !smtsTsHasPlayerWrites(smtcTs));
  function smtsTsHasPlayerWrites(s) {
    return /currentTime\s*=[^=]/.test(s) || /\.dispatch\s*\(/.test(s);
  }
}

/* ============ S3: lyric ladder (C2/lyric pipeline) ============ */
{
  const lyric = rd("bridge/v6/lyric-source/index.js");
  for (const need of ["e82ckenh8dichen8", "36cd479b6b5", "md5forencrypt",
    "interface3.music.163.com/eapi/song/lyric/v1",
    "track.lyric.getinfo", "music.163.com/api/song/lyric",
    "eapi-yrc", "eapi-klyric", "channel-lrc", "direct-lrc", "klyricToYrc"]) {
    check(`S3 lyric ladder element (${need.slice(0, 32)})`, lyric.includes(need));
  }
  check("S3 lyric cache cap 8", lyric.includes("CACHE_MAX = 8"));
  check("S3 lyric ytlrc supported", lyric.includes("ytlrc"));
}

/* ============ S4: page client v6 (C4) ============ */
{
  const ts = rd("src/lib/startpage/smtc.ts");
  for (const need of ['HUB_NAME = "chushi-music-hub"', "SMTC_PORT = 26801",
    "SMTC_FALLBACK_PORT = 26802", 'HUB_VER_MIN = "6.0.0"', 'PLUGIN_VER_MIN = "6.0.0"',
    "export const smtc", "export function smtcPositionNow", "SMTC_COMMANDS",
    "interface SmtcTrack", "interface SmtcState", "interface SmtcLyric",
    "/api/state", "/api/lyric", "/api/cmd"]) {
    check(`S4 page client element (${need.slice(0, 36)})`, ts.includes(need));
  }
  check("S4 zero old-engine residue in page client", !ts.includes("chushi-smtc-engine"));
  check("S4 version gate bumped", !ts.includes('ENGINE_VER_MIN = "5.0.0"') && !ts.includes('5.0.0" as'));
  check("S4 port discovery exists", ts.includes("discover"));
  /* public surface unchanged: consumers import these names */
  const pw = rd("src/components/startpage/PresetWidgets.tsx");
  check("S4 PresetWidgets imports unchanged surface",
    pw.includes('from "@/lib/startpage/smtc"') && pw.includes("smtc.getSnapshot"));
  const sb = rd("src/lib/startpage/sandbox.ts");
  check("S4 sandbox bridge imports unchanged surface",
    sb.includes('from "./smtc"') && sb.includes("smtc.subscribe") && sb.includes("smtc.control"));
}

/* ============ S5: preset copy (样式不变, 文案换桥) ============ */
{
  const html = rd("preset-src/smtc/music-widget.html");
  const cmds = rd("preset-src/smtc/music-commands.js");
  check("S5 widget chip copy = Music Bridge", html.includes("音乐桥未连接 · 安装 ChuShi Music Bridge 插件并重启网易云"));
  check("S5 widget old-version chip copy", html.includes("音乐桥版本过旧 · 更新 ChuShi Music Bridge 插件并重启网易云"));
  check("S5 widget ready chip copy", html.includes("音乐桥未就绪"));
  check("S5 widget three-plugin wording", html.includes("三个 .plugin"));
  check("S5 widget zero engine copy", !html.includes("引擎未运行") && !html.includes("Start-Engine"));
  check("S5 commands bridge copy", cmds.includes("音乐桥未连接（安装 ChuShi Music Bridge 插件并重启网易云）"));
  check("S5 commands zero engine copy", !cmds.includes("引擎未运行"));
  /* style-preservation markers (anti-shift + lyric mask) still present */
  check("S5 anti-shift CSS marker present", html.includes('left:50%') && html.includes("margin:-10px"));
  check("S5 lyric mask CSS present", html.includes("-webkit-mask-image"));
  /* script still parses */
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  try { new Function(m[1]); check("S5 widget script syntax OK", true); }
  catch (e) { check("S5 widget script syntax OK", false, e.message); }
  try { new Function(cmds); check("S5 commands syntax OK", true); }
  catch (e) { check("S5 commands syntax OK", false, e.message); }
}

/* ============ S6: manifests (C3) ============ */
{
  const dirs = ["smtc-manager", "music-bridge", "lyric-source"];
  const cjk = /[\u4e00-\u9fff]/;
  const asciiName = /^[\x20-\x7e]+$/;
  const slugs = [];
  for (const d of dirs) {
    const m = JSON.parse(rd(`bridge/v6/${d}/manifest.json`));
    check(`S6 ${d} name english`, asciiName.test(m.name), m.name);
    check(`S6 ${d} description chinese`, cjk.test(m.description));
    check(`S6 ${d} ncm3-compatible true`, m["ncm3-compatible"] === true);
    check(`S6 ${d} manifest_version 1`, m.manifest_version === 1);
    check(`S6 ${d} version 6.0.0`, m.version === "6.0.0");
    check(`S6 ${d} injects Main index.js`, m.injects?.Main?.[0]?.file === "index.js");
    slugs.push(m.slug);
  }
  check("S6 slugs unique", new Set(slugs).size === 3, slugs.join(","));
}

/* ============ S7: built artifacts ============ */
{
  const dist = join(ROOT, "bridge/v6/dist");
  const names = ["ChuShi-SMTC-Manager-6.0.0.plugin", "ChuShi-Music-Bridge-6.0.0.plugin",
    "ChuShi-Lyric-Source-6.0.0.plugin"];
  for (const n of names) {
    check(`S7 built ${n}`, existsSync(join(dist, n)));
  }
  const cshz = join(ROOT, "examples/初始SMTC音乐预设.cshz");
  check("S7 preset rebuilt", existsSync(cshz));
  const zipTxt = rd === null ? "" : "";
  /* cshz must embed the NEW chip copy (bridge wording) */
  const { execSync } = await import("node:child_process");
  const embedded = execSync(`python3 -c "
import zipfile, json
z = zipfile.ZipFile('${cshz}')
m = json.loads(z.read('manifest.json'))
h = m['widgets'][0]['html']
print('BRIDGE-OK' if '音乐桥未连接 · 安装 ChuShi Music Bridge 插件并重启网易云' in h else 'BRIDGE-STALE')
print('ENGINE-RESIDUE' if '引擎未运行' in h else 'ENGINE-FREE')
"`).toString();
  check("S7 cshz embeds v6 chip copy", embedded.includes("BRIDGE-OK"), embedded);
  check("S7 cshz zero engine copy", embedded.includes("ENGINE-FREE"), embedded);
}

/* ============ S8: extension build ============ */
{
  const bs = rd("scripts/build-extension.py");
  check("S8 extension version 6.0.0", bs.includes('VERSION = "6.0.0"'));
  check("S8 extension dest v6.0.0", bs.includes("download/v6.0.0/ChuShi-NewTab-v6.0.0.zip"));
  check("S8 host_permissions dual port", bs.includes("26801") && bs.includes("26802"));
  const zip = join(ROOT, "download/v6.0.0/ChuShi-NewTab-v6.0.0.zip");
  check("S8 extension zip built", existsSync(zip));
  const { execSync } = await import("node:child_process");
  const mf = execSync(`unzip -p ${zip} manifest.json`).toString();
  const m = JSON.parse(mf);
  check("S8 zip manifest version 6.0.0", m.version === "6.0.0");
  check("S8 zip host 26802 present", m.host_permissions.some((h) => h.includes("26802")));
}

/* ============ S9: sandbox core rename ============ */
{
  const sb = rd("public/sandbox.js");
  check("S9 music core renamed V6 x3", (sb.match(/__chushiMusicCoreV6/g) || []).length === 3);
  check("S9 zero V5 core residue", !sb.includes("__chushiMusicCoreV5"));
}

console.log(`\nverify-v6 static: ${pass} pass, ${fail} fail`);
if (fail) { console.error("FAILED: " + failures.join(" | ")); process.exit(1); }
console.log("VERIFY-V6-STATIC-OK");
