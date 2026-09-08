/* 用规范 eapi 信封（无问号）重测：加密路径前缀与参数形态对 yrc 的影响 */
import crypto from "node:crypto";

const KEY = Buffer.from("e82ckenh8dichen8", "utf8");
function eapiParams(encryptPath, payload) {
  const json = JSON.stringify(payload);
  const d = crypto.createHash("md5").update("nobody" + encryptPath + "use" + json + "md5forencrypt", "utf8").digest("hex");
  const text = encryptPath + "-36cd479b6b5-" + json + "-36cd479b6b5-" + d;
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
      try { j = JSON.parse(txt); } catch { console.log(`${tag} [${host}] HTTP ${r.status} non-JSON`); continue; }
      const f = (k) => (j && j[k] && typeof j[k].lyric === "string" ? j[k].lyric : "");
      console.log(`${tag} [${host}] code=${j.code} yrcB=${f("yrc").length} lrcB=${f("lrc").length} ytlrcB=${f("ytlrc").length}`);
      return;
    } catch (e) { /* next host */ }
  }
  console.log(`${tag} ALL HOSTS FAILED`);
}

const ID = 316545; // 已实测有 yrc 的曲
// A2: 规范信封 + 加密路径 /api + 插件现行参数（yv:0 无 cv）
await probe("A2 canon+/api+plugin-params", "/eapi/song/lyric/v1", "/api/song/lyric/v1",
  { id: ID, cp: false, lv: 0, tv: 0, rv: 0, kv: 0, yv: 0, ytv: 0 });
// B2: 规范信封 + 加密路径 /eapi（插件选的加密路径）+ 插件参数
await probe("B2 canon+/eapi+plugin-params", "/eapi/song/lyric/v1", "/eapi/song/lyric/v1",
  { id: ID, cp: false, lv: 0, tv: 0, rv: 0, kv: 0, yv: 0, ytv: 0 });
// C2: 规范信封 + /api + 探测脚本参数（基线，已知可行）
await probe("C2 canon+/api+probe-params", "/eapi/song/lyric/v1", "/api/song/lyric/v1",
  { id: String(ID), cp: false, radio: false, cv: 4747474, kv: -1, tv: -1, lv: -1, rv: -1, st: 0 });
// D2: 规范信封 + /api + 探测参数但 yv:0（隔离 yv 与 cv 的影响）
await probe("D2 probe-params-yv0", "/eapi/song/lyric/v1", "/api/song/lyric/v1",
  { id: String(ID), cp: false, radio: false, cv: 4747474, kv: -1, tv: -1, lv: -1, rv: -1, st: 0, yv: 0, ytv: 0 });
