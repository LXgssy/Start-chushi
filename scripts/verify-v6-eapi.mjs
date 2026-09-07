/* verify-v6-eapi.mjs — eapi 歌词协议端到端实测（公网可达性 + 协议正确性）
 * 用与插件C相同的协议常量在 Node 侧复算请求，POST 到网易云 eapi 端点，
 * 断言返回 yrc（逐字）或 lrc（行级）。这是歌词链路最真实的门。 */
import { createHash, createCipheriv } from "node:crypto";

const ENC_PATH = "/api/song/lyric/v1";
const SONG_IDS = [186016, 347230, 2034742057]; // 经典曲库三首（yrc 覆盖概率高）

function eapiParams(path, payload) {
  const json = JSON.stringify(payload);
  const digest = createHash("md5")
    .update("nobody" + path + "use" + json + "md5forencrypt", "utf8")
    .digest("hex");
  const text = `${path}-36cd479b6b5-${json}-36cd479b6b5-${digest}`;
  const cipher = createCipheriv("aes-128-ecb", Buffer.from("e82ckenh8dichen8", "utf8"), Buffer.alloc(0));
  return Buffer.concat([cipher.update(text, "utf8"), cipher.final()]).toString("hex").toUpperCase();
}

async function probe(songId) {
  const body = "params=" + eapiParams(ENC_PATH, {
    id: String(songId), cp: false, radio: false, cv: 4747474,
    kv: -1, tv: -1, lv: -1, rv: -1, st: 0, yv: 1,
  });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch("https://interface3.music.163.com/eapi/song/lyric/v1", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
    });
    const j = await r.json();
    const has = (x) => j && j[x] && j[x].lyric && String(j[x].lyric).length > 10;
    const src = has("yrc") ? "yrc" : has("klyric") ? "klyric" : has("lrc") ? "lrc" : "NONE";
    console.log(`song ${songId}: http=${r.status} source=${src} yrcLen=${has("yrc") ? j.yrc.lyric.length : 0} lrcLen=${has("lrc") ? j.lrc.lyric.length : 0}`);
    return src !== "NONE";
  } catch (e) {
    console.log(`song ${songId}: ERROR ${e.message}`);
    return false;
  } finally {
    clearTimeout(t);
  }
}

let ok = 0;
for (const id of SONG_IDS) {
  if (await probe(id)) ok++;
}
console.log(`eapi live probe: ${ok}/${SONG_IDS.length} returned lyric payload`);
if (ok === 0) {
  console.log("EAPI-LIVE-FAIL");
  process.exit(1);
}
console.log("EAPI-LIVE-OK");
