/* syntax-gate-v5: parse every JS artifact touched by the v5 rewrite.
 * Catches SyntaxError-class corruption that string-grep static tests miss
 * (the hFor() `Hode]` class of bug — dead widget script shipped silently).
 * Gates:
 *  G1 node --check equivalent via new Function() on plugin/sandbox/commands sources
 *  G2 extract <script> blocks from music-widget.html and parse each
 *  G3 verify-v5 section scripts parse
 * Run: node scripts/syntax-gate-v5.mjs  (exit 0 = all parse) */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
function parseJs(name, src) {
  try { new Function(src); return true; }
  catch (e) { console.log(`    -> ${e}`); return false; }
}

const jsFiles = [
  "bridge/ncm-plugin/index.js",
  "bridge/smtc-plugin/index.js",
  "public/sandbox.js",
  "preset-src/smtc/music-commands.js",
  "scripts/v5/sectionA.js",
  "scripts/v5/sectionB.js",
  "scripts/v5/sectionC.js",
  "scripts/v5/sectionD.js",
  "scripts/v5/sectionE.js",
  "scripts/v5/sectionF.js",
];
console.log("G1 file-level parse");
for (const f of jsFiles) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { ok(f, false, "missing"); continue; }
  ok(f, parseJs(f, fs.readFileSync(p, "utf8")));
}

console.log("G2 music-widget.html inline scripts");
const html = fs.readFileSync(path.join(ROOT, "preset-src/smtc/music-widget.html"), "utf8");
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ok("widget has >=1 inline script", blocks.length >= 1, `found ${blocks.length}`);
blocks.forEach((b, i) => ok(`widget inline script #${i + 1} (${b.length}B)`, parseJs(`block#${i}`, b)));

console.log("G3 built .plugin artifacts contain parseable index.js");
const plugins = [
  "bridge/ncm-plugin/ChuShi-Music-API-5.0.0.plugin",
  "bridge/smtc-plugin/ChuShi-SMTC-Manager-5.0.0.plugin",
];
/* minimal zip reader: locate index.js entry (stored or deflate via zlib) */
import zlib from "node:zlib";
function readZipEntry(buf, wantName) {
  const sig = 0x04034b50;
  let off = 0;
  while (off + 30 <= buf.length) {
    if (buf.readUInt32LE(off) !== sig) { off++; continue; }
    const method = buf.readUInt16LE(off + 8);
    let csize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.slice(off + 30, off + 30 + nameLen).toString("utf8");
    const dataStart = off + 30 + nameLen + extraLen;
    if (name === wantName) {
      const raw = buf.slice(dataStart, dataStart + csize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    off = dataStart + csize;
  }
  return null;
}
for (const f of plugins) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { ok(f, false, "missing"); continue; }
  const entry = readZipEntry(fs.readFileSync(p), "index.js");
  if (!entry) { ok(f + " index.js", false, "entry not found in zip"); continue; }
  ok(f + " index.js", parseJs(f, entry.toString("utf8")));
}

console.log(`\nsyntax-gate-v5: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
