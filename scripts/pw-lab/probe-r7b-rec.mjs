/* R7 深挖：自建 MediaRecorder 观察 captureStream 轨道生命周期 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";
const ZIP = "/home/z/beta-wt/download/v8.7.151/ChuShi-NewTab-v8.7.151.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-r7b-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
rmSync("/tmp/ext-r7b-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-r7b-profile", {
  headless: true, channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  viewport: { width: 1280, height: 800 },
});
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page = await browser.newPage();
await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("#chushi-sniffer-host", { state: "attached", timeout: 15000 });
await page.evaluate(() => {
  const c = document.createElement("canvas"); c.width = 320; c.height = 180;
  const g = c.getContext("2d");
  const draw = () => { g.fillStyle = `hsl(${(performance.now()/12)%360} 80% 55%)`; g.fillRect(0,0,320,180); requestAnimationFrame(draw); };
  draw();
  const v = document.createElement("video"); v.id = "rec-video"; v.muted = true; v.autoplay = true;
  const stream = c.captureStream(30); v.srcObject = stream; document.body.appendChild(v); v.play();
  window.__recStream = stream;
});
await page.waitForFunction(() => { const v = document.getElementById("rec-video"); return !!v && v.videoWidth > 0 && !v.paused; }, null, { timeout: 10000 });
const r = await page.evaluate(async () => {
  const v = document.getElementById("rec-video");
  const s3 = v.captureStream();
  const mime = ["video/webm;codecs=vp9", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  const mr = new MediaRecorder(s3, { mimeType: mime });
  const evts = [];
  mr.ondataavailable = (e) => evts.push({ at: Math.round(performance.now()), da: e.data.size });
  mr.onstop = () => evts.push({ at: Math.round(performance.now()), stop: true });
  const onended = [];
  s3.getTracks().forEach((t) => { t.onended = () => onended.push(Math.round(performance.now())); });
  mr.start(1000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2100);
  const before = s3.getTracks().map((t) => t.readyState);
  window.__recStream.getTracks().forEach((t) => t.stop());
  await sleep(1500);
  return {
    mime, before, after: s3.getTracks().map((t) => t.readyState),
    videoState: [v.readyState, v.paused, v.currentTime.toFixed(2)],
    onended, evts, mrState: mr.state,
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
