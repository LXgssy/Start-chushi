/* 同 video 连续两个 MediaRecorder 会话：第二个是否拿不到数据 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";
const ZIP = "/home/z/beta-wt/download/v8.7.151/ChuShi-NewTab-v8.7.151.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-r7e-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
rmSync("/tmp/ext-r7e-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-r7e-profile", {
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
  const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = async (tag, kill) => {
    const s = v.captureStream();
    const mr = new MediaRecorder(s, { mimeType: mime });
    const evts = [];
    mr.ondataavailable = (e) => evts.push(e.data.size);
    mr.start(1000);
    await sleep(2100);
    if (kill) window.__recStream.getTracks().forEach((t) => t.stop());
    else mr.stop();
    await sleep(800);
    return { tag, evts, state: mr.state };
  };
  const a = await run("first", false);
  const b = await run("second-kill-srcstream", true);
  return [a, b, { videoW: v.videoWidth, paused: v.paused, t: v.currentTime.toFixed(2) }];
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
