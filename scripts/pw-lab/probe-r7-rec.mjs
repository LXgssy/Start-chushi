/* R7 独立探针：canvas 流视频 + 探针录制三查
 * ① 视频活跃度（currentTime 前进/不暂停）② dataavailable 是否在走（间接：
 *    stop() 用户路径的 size）③ track-ended 自动路径的 size */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.151/ChuShi-NewTab-v8.7.151.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-r7-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
rmSync("/tmp/ext-r7-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-r7-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  viewport: { width: 1280, height: 800 },
});
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const errors = [];
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("#chushi-sniffer-host", { state: "attached", timeout: 15000 });

await page.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 180;
  const g = c.getContext("2d");
  const draw = () => {
    g.fillStyle = `hsl(${(performance.now() / 12) % 360} 80% 55%)`;
    g.fillRect(0, 0, 320, 180);
    g.fillStyle = "#fff";
    g.fillRect((performance.now() / 8) % 320, 60, 30, 60);
    requestAnimationFrame(draw);
  };
  draw();
  const v = document.createElement("video");
  v.id = "rec-video";
  v.muted = true;
  v.autoplay = true;
  const stream = c.captureStream(30);
  v.srcObject = stream;
  document.body.appendChild(v);
  v.play();
  window.__recStream = stream;
  window.__recVideo = v;
});
await page.waitForFunction(() => {
  const v = document.getElementById("rec-video");
  return !!v && v.videoWidth > 0 && !v.paused;
}, null, { timeout: 10000 });

/* ① 活跃度 2s 采样 */
const act = await page.evaluate(() => new Promise((res) => {
  const t0 = performance.now();
  const c0 = document.getElementById("rec-video").currentTime;
  const px0 = (() => { const g = document.createElement("canvas"); g.width = 1; g.height = 1; g.getContext("2d").drawImage(document.getElementById("rec-video"), 0, 0, 1, 1); return g.getContext("2d").getImageData(0, 0, 1, 1).data.join(","); })();
  setTimeout(() => {
    const v = document.getElementById("rec-video");
    const g = document.createElement("canvas"); g.width = 1; g.height = 1;
    g.getContext("2d").drawImage(v, 0, 0, 1, 1);
    const px1 = g.getContext("2d").getImageData(0, 0, 1, 1).data.join(",");
    res({ dt: v.currentTime - c0, paused: v.paused, pxChanged: px0 !== px1 });
  }, 2000);
}));
console.log("① 活跃度:", JSON.stringify(act));

/* ② 用户路径 stop：size 应 >0 */
const s1 = await page.evaluate(async () => {
  const st = window.__chushiRec.start(0);
  if (!st.ok) return { fail: "start", st };
  await new Promise((r) => setTimeout(r, 2100));
  return await window.__chushiRec.stop();
});
console.log("② 用户路径 stop:", JSON.stringify({ ok: s1.ok, size: s1.size, secs: s1.seconds, err: s1.error }));

/* ③ track-ended 自动路径：再开录 → 2.1s → 杀流 → 迟到 stop */
const s2 = await page.evaluate(async () => {
  const st = window.__chushiRec.start(0);
  if (!st.ok) return { fail: "start", st };
  await new Promise((r) => setTimeout(r, 2100));
  window.__recStream.getTracks().forEach((t) => t.stop());
  await new Promise((r) => setTimeout(r, 1200));
  return await window.__chushiRec.stop().catch((e) => ({ err: String(e) }));
});
console.log("③ 自动路径 stop:", JSON.stringify(s2));

console.log("pageerror:", errors.length ? errors : 0);
await browser.close();
