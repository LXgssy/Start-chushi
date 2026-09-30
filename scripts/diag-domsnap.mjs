// 诊断：DOMSnapshot.captureSnapshot 返回结构实探（closed shadow 穿透 + attributes 布局）
import { chromium } from "playwright-core";
import http from "http";

const ROOT = "/tmp/ext-beta";
const h = (await import("crypto")).createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end("<!DOCTYPE html><html><body><h1>diag</h1></body></html>");
});
srv.listen(26902, "127.0.0.1");

const ctx = await chromium.launchPersistentContext("/tmp/v8711-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
const page = await ctx.newPage();
console.log("step1: goto mock page");
await page.goto("http://127.0.0.1:26902/", { waitUntil: "load", timeout: 15000 });
console.log("step2: newCDPSession");
const client = await page.context().newCDPSession(page);
console.log("step3: captureSnapshot begin", Date.now());
const snap = await Promise.race([
  client.send("DOMSnapshot.captureSnapshot", { computedStyles: [] }),
  new Promise((_, rej) => setTimeout(() => rej(new Error("captureSnapshot timeout 20s")), 20000)),
]);
console.log("step4: captureSnapshot done", Date.now());
const doc = snap.documents[0];
console.log("doc keys:", Object.keys(doc));
const n = doc.nodes;
console.log("nodes keys:", Object.keys(n));
console.log("nodeName.len:", n.nodeName.length, "attributes.len:", n.attributes.length, "parentIndex.len:", n.parentIndex.length);
console.log("attributes[0..30]:", JSON.stringify(n.attributes.slice(0, 30)));
console.log("attributes[-5..]:", JSON.stringify(n.attributes.slice(-5)));
console.log("strings[0..20]:", JSON.stringify((snap.strings || []).slice(0, 20)));
const s = snap.strings;
// 若 attributes 与 nodeName 平行且每节点值为单一起始索引，则验证：
if (n.attributes.length === n.nodeName.length) {
  console.log("LAYOUT-A: attributes[i] = per-node start index into a flat list?");
  // 检查是否存在更长的并列数组
} else {
  console.log("LAYOUT-B: attributes = flat concatenated list (len != node count)");
}
await ctx.close();
srv.close();
process.exit(0);
