/* 复测 lyric-source 插件现行 eapi 形态 vs 修正形态：定位 yrc 缺席根因 */
import crypto from "node:crypto";

const KEY = Buffer.from("e82ckenh8dichen8", "utf8");
function eapiParams(encryptPath, payload) {
  const json = JSON.stringify(payload);
  const d = crypto.createHash("md5").update("nobody" + encryptPath + "use" + encryptPath + "?" + json + "md5forencrypt", "utf8").digest("hex");
  const text = encryptPath + "-36cd479b6b5-" + encryptPath + "?" + json + "-36cd479b6b5-" + d;
  const c = crypto.createCipheriv("aes-128-ecb", KEY, Buffer.alloc(0));
  return Buffer.concat([c.update(text, "utf8"), c.final()]).toString("hex").toUpperCase();
}
async function probe(tag, urlPath, encryptPath, payload) {
  const body = "params=" + eapiParams(encryptPath, payload);
  for (const host of ["https://interface3.music.163.com", "https://music.163.com"]) {
    try {
      const r = await fetch(host + urlPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          os: "pc", appver: "2.10.13", version: "2.10.13",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Cookie: "os=pc; appver=2.10.13",
        },
        body,
      });
      const txt = await r.text();
      let j;
      try { j = JSON.parse(txt); } catch { console.log(`${tag} [${host}] HTTP ${r.status} non-JSON: ${txt.slice(0, 100)}`); continue; }
      const f = (k) => (j && j[k] && typeof j[k].lyric === "string" ? j[k].lyric : "");
      console.log(`${tag} [${host}] code=${j.code} yrcB=${f("yrc").length} lrcB=${f("lrc").length} klyric=${f("klyric").length ? "Y" : "-"}`);
      return;
    } catch (e) { /* next host */ }
  }
  console.log(`${tag} ALL HOSTS FAILED`);
}

const ID = 186016; // 晴天（有 yrc 的经典曲）
// A: 插件现行形态——加密路径带 /eapi 前缀 + yv:0 无 cv
await probe("A plugin-current", "/eapi/song/lyric/v1", "/eapi/song/lyric/v1",
  { id: ID, cp: false, lv: 0, tv: 0, rv: 0, kv: 0, yv: 0, ytv: 0 });
// B: 加密路径 /api（官方约定）+ 插件参数
await probe("B /api-encrypt", "/eapi/song/lyric/v1", "/api/song/lyric/v1",
  { id: ID, cp: false, lv: 0, tv: 0, rv: 0, kv: 0, yv: 0, ytv: 0 });
// C: 探测脚本同款（已验证有 yrc）
await probe("C probe-shape", "/eapi/song/lyric/v1", "/api/song/lyric/v1",
  { id: String(ID), cp: false, radio: false, cv: 4747474, kv: -1, tv: -1, lv: -1, rv: -1, st: 0 });
// D: /api 路径 + 全 -1 + 无 cv
await probe("D api-nocv-1", "/eapi/song/lyric/v1", "/api/song/lyric/v1",
  { id: ID, cp: false, lv: -1, tv: -1, rv: -1, kv: -1, yv: -1, ytv: -1 });
