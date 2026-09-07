/* yrc field probe: which request shape returns word-level (yrc) content */
import crypto from "node:crypto";

const KEY = Buffer.from("e82ckenh8dichen8", "utf8");
function eapiParams(path, payload) {
  const json = JSON.stringify(payload);
  const d = crypto.createHash("md5").update("nobody" + path + "use" + json + "md5forencrypt", "utf8").digest("hex");
  const text = path + "-36cd479b6b5-" + json + "-36cd479b6b5-" + d;
  const c = crypto.createCipheriv("aes-128-ecb", KEY, Buffer.alloc(0));
  return Buffer.concat([c.update(text, "utf8"), c.final()]).toString("hex").toUpperCase();
}
async function probe(id, extra) {
  const payload = { id: String(id), cp: false, radio: false, cv: 4747474, kv: -1, tv: -1, lv: -1, rv: -1, st: 0, ...extra };
  const body = "params=" + eapiParams("/api/song/lyric/v1", payload);
  const r = await fetch("https://interface3.music.163.com/eapi/song/lyric/v1", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "os=pc; appver=2.10.13" },
    body,
  });
  const j = await r.json();
  const f = (k) => (j && j[k] && typeof j[k].lyric === "string" ? j[k].lyric : "");
  const yrc = f("yrc");
  const lrc = f("lrc");
  const bracketYrc = /\[\d+,\d+\]\(\d+,\d+,\d+\)/.test(yrc);
  const bracketLrc = /\[\d+,\d+\]\(\d+,\d+,\d+\)/.test(lrc);
  return {
    id, yrcB: yrc.length, lrcB: lrc.length, bracketYrc, bracketLrc,
    sample: (bracketYrc ? yrc : bracketLrc ? lrc : "").split("\n").find((l) => /\[\d+,\d+\]\(/.test(l))?.slice(0, 80) || "",
  };
}
const ids = [25906124, 5254866, 1901371647, 418602084, 347230, 316545, 5264842];
const variants = [{ yv: 1 }, { yv: -1 }, { yv: 0 }];
for (const id of ids) {
  for (const v of variants) {
    try {
      const r = await probe(id, v);
      console.log(JSON.stringify({ ...r, ...v }));
    } catch (e) {
      console.log(`id ${id} ${JSON.stringify(v)} ERR ${e.message}`);
    }
  }
}
