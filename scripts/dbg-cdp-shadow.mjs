// CDP 穿透 closed Shadow DOM 可行性探针——找 .fw/.meta 节点 + computed style
import { chromium } from "playwright-core";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";

const ROOT = "/tmp/ext-stage";
const pageDir = mkdtempSync(join(tmpdir(), "cardpage-"));
writeFileSync(join(pageDir, "index.html"),
  "<!doctype html><html><head><title>CardTestPage</title></head><body style='background:#1a1c20'><h1 style='color:#666'>t</h1></body></html>");
const http = spawn("python3", ["-m", "http.server", "26993", "--bind", "127.0.0.1"],
  { cwd: pageDir, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("exit", () => { try { http.kill("SIGKILL"); } catch { } });

const profileDir = mkdtempSync(join(tmpdir(), "ext-cdp-probe-"));
const browser = await chromium.launchPersistentContext(profileDir, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
await page.goto("http://127.0.0.1:26993/index.html", { waitUntil: "load" });
await sleep(3500);

const cdp = await page.context().newCDPSession(page);
await cdp.send("DOM.enable");
await cdp.send("CSS.enable");
const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });

function walk(node, path, out) {
  if (!node) return;
  const nid = node.nodeName || "";
  const cls = (node.attributes && node.attributes.length) ? attrClass(node.attributes) : "";
  const id = (node.attributes && node.attributes.length) ? attrId(node.attributes) : "";
  if (cls.includes("fw") || cls.includes("meta") || cls.includes("glow") || id === "chushi-card-host") {
    out.push({ path: path + ">" + nid + (id ? "#" + id : "") + (cls ? "." + cls.split(" ")[0] : ""), nodeId: node.nodeId });
  }
  for (const c of node.children || []) walk(c, path + ">" + nid, out);
  for (const c of node.shadowRoots || []) walk(c, path + ">" + nid + "/shadow", out);
  for (const c of node.contentDocuments || []) walk(c, path + ">" + nid + "/doc", out);
}
function attrClass(attrs) { for (let i = 0; i < attrs.length; i += 2) if (attrs[i] === "class") return attrs[i + 1]; return ""; }
function attrId(attrs) { for (let i = 0; i < attrs.length; i += 2) if (attrs[i] === "id") return attrs[i + 1]; return ""; }

const out = [];
walk(root, "", out);
console.log("hits:", out.length);
for (const h of out.slice(0, 12)) {
  const cs = await cdp.send("CSS.getComputedStyleForNode", { nodeId: h.nodeId });
  const map = {};
  for (const e of cs.computedStyle) map[e.name] = e.value;
  console.log(h.path, "| display:", map.display, "| z-index:", map.zIndex, "| position:", map.position);
}
await browser.close();
