/* v5 eapi live gate: verify the eapi recipe against the real endpoint.
 * Recipe (live-verified 2026-09-07):
 *   POST https://interface3.music.163.com/eapi/song/lyric/v1
 *   body: params=<UPPERHEX(AES-128-ECB(e82ckenh8dichen8, text))>
 *   text: <encPath>-36cd479b6b5-<json>-36cd479b6b5-<md5hex("nobody"+encPath+"use"+json+"md5forencrypt")>
 *   encPath is "/api/song/lyric/v1" (encryption path differs from the URL).
 * Word-level (yrc) content may arrive in the yrc field OR inside lrc.lyric
 * (JSON-line yrc form) - both are accepted downstream.
 * Run: node scripts/test-eapi-v5.mjs  (requires network) */
import crypto from "node:crypto";

const EAPI_KEY = Buffer.from("e82ckenh8dichen8", "utf8");

function md5hex(t) {
  return crypto.createHash("md5").update(t, "utf8").digest("hex");
}
function eapiParams(path, payload) {
  const json = JSON.stringify(payload);
  const digest = md5hex("nobody" + path + "use" + json + "md5forencrypt");
  const text = path + "-36cd479b6b5-" + json + "-36cd479b6b5-" + digest;
  const cipher = crypto.createCipheriv("aes-128-ecb", EAPI_KEY, Buffer.alloc(0));
  return Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
    .toString("hex").toUpperCase();
}

function looksLikeYrc(t) {
  return /^\s*\{\s*"t"\s*:/.test(t || "") || /\[\d+,\d+\]\(\d+,\d+,\d+\)/.test(t || "");
}

async function fetchLyric(songId) {
  const encPath = "/api/song/lyric/v1";
  const payload = {
    id: String(songId), cp: false, radio: false, cv: 4747474,
    kv: -1, tv: -1, lv: -1, rv: -1, st: 0, yv: 1,
  };
  const body = "params=" + eapiParams(encPath, payload);
  const r = await fetch("https://interface3.music.163.com/eapi/song/lyric/v1", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": "os=pc; appver=2.10.13",
    },
    body,
  });
  return r.json();
}

const ids = [186016, 25906124, 5254866];
let pass = 0;
for (const id of ids) {
  try {
    const j = await fetchLyric(id);
    const f = (k) => (j && j[k] && typeof j[k].lyric === "string" ? j[k].lyric : "");
    const yrc = f("yrc");
    const lrc = f("lrc");
    const ytl = f("ytlrc");
    const tly = f("tlyric");
    const wordSrc = looksLikeYrc(yrc) ? yrc : looksLikeYrc(lrc) ? lrc : "";
    const timing = ((wordSrc || "").split("\n").find((l) => /\[\d+,\d+\]\(/.test(l)) || "").slice(0, 90);
    console.log(
      `id ${id}: yrcField=${yrc.length}B lrcField=${lrc.length}B wordForm=${wordSrc ? "YES" : "no"} ` +
      `trans=${Math.max(ytl.length, tly.length)}B | ${JSON.stringify(timing)}`,
    );
    if (wordSrc.length > 100) pass++;
  } catch (e) {
    console.log(`id ${id}: ERR ${e.message}`);
  }
}
if (pass >= 2) { console.log("EAPI LIVE GATE: PASS"); process.exit(0); }
console.log("EAPI LIVE GATE: FAIL");
process.exit(1);
