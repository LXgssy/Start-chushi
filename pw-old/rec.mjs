// 宣传片素材录制器（终版）：
// Xvfb 1920x1080 → chromium 131 kiosk 有头 → ffmpeg x11grab 实录（REC_FPS 默认 60）
// 打板时机 = 水合探测（时钟==真实时分）+ 入场动画余量后
// 用法: bun rec.mjs <场景名>   场景 = scenarios/<名>.mjs（prepare/run）
const FPS = Number(process.env.REC_FPS || 60);
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "fs";
import { spawn, spawnSync, execSync } from "child_process";
import path from "path";

const OUT_ROOT = "/home/z/my-project/download/rec";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1148/chrome-linux/chrome";
const BASE = process.env.REC_TARGET || "http://localhost:3210";
const DISP = ":99";
const scene = process.argv[2];
if (!scene) {
  console.error("用法: bun rec.mjs <场景名>");
  process.exit(1);
}
const scMod = await import(`./scenarios/${scene}.mjs`);

const OUT = path.join(OUT_ROOT, scene);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1) Xvfb：默认 :99 1920x1080；场景声明 win（如 mobile 390x844）时用独立 :98 屏，窗口=全屏
const WIN = (scMod.win ?? "1920x1080").replace("x", "x");
let xvfb = null;
if (scMod.win) {
  spawnSync("pkill", ["-f", "Xvfb :98"]);
  xvfb = spawn("Xvfb", [":98", "-screen", "0", WIN + "x24", "-nolisten", "tcp"]);
  await new Promise((r) => setTimeout(r, 1500));
} else {
  // 无论 socket 文件是否存在都强制重启 :99（残留孤儿 Xvfb 会吐黑帧）
  spawnSync("pkill", ["-f", "Xvfb :99"]);
  await new Promise((r) => setTimeout(r, 300));
  xvfb = spawn("Xvfb", [DISP, "-screen", "0", "1920x1080x24", "-nolisten", "tcp"]);
  await new Promise((r) => setTimeout(r, 1500));
}
const DISP2 = scMod.win ? ":98" : DISP;
const env = { ...process.env, DISPLAY: DISP2 };

// 2) chromium 131 有头 kiosk（无地址栏/无横幅；window-size 显式铺满——无 WM 不会自动全屏）
const isExt = scMod.target?.startsWith("chrome-extension");
const context = await chromium.launchPersistentContext("", {
  headless: false,
  executablePath: CHROME,
  viewport: null, // 跟随 kiosk 窗口
  args: [
    "--no-first-run",
    "--kiosk",
    `--window-size=${WIN.replace("x", ",")}`,
    "--window-position=0,0",
    "--test-type",
    "--force-color-profile=srgb",
    "--hide-scrollbars",
    "--lang=zh-CN",
    "--disable-lcd-text",
    ...(isExt
      ? [
          `--disable-extensions-except=/home/z/my-project/download/初始-Edge新标签页`,
          `--load-extension=/home/z/my-project/download/初始-Edge新标签页`,
        ]
      : []),
  ],
  ignoreDefaultArgs: isExt
    ? ["--enable-automation", "--disable-extensions"]
    : ["--enable-automation"],
  env,
});
await new Promise((r) => setTimeout(r, 1500));
const page = context.pages()[0];
await page.goto(scMod.target ?? BASE, { waitUntil: "domcontentloaded" });
if (!scMod.target) await page.evaluate(() => localStorage.setItem("start:seen", "1")).catch(() => {});
await page.waitForTimeout(2000);

// 3) 预备（不录）：场景写状态 → reload 生效 → 水合探测 → 动画余量
if (scMod.prepare) await scMod.prepare(page, context);
await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
// 水合标志：时钟显示真实当前时分（SSR 预渲染做不到）
await page
  .waitForFunction(
    () => {
      const m = document.querySelector("main");
      if (!m) return false;
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      return m.innerText.replace(/\D/g, "").includes(hh + mm);
    },
    { timeout: 20000 }
  )
  .catch(() => {});
await page.waitForTimeout(2300); // intro-rise 序列余量

// 4) 打板（页面就绪后）：抓取 + 轻量中间编码（mpeg4 儿乎不占 CPU，
//    把算力留给 chromium 动画全速渲染；clip.mp4 阶段再精编）
const rawMp4 = path.join(OUT, "raw.mp4");
const ffmpeg = spawn(
  "nice", ["-n", "10", "ffmpeg",
    "-y", "-f", "x11grab", "-framerate", String(FPS), "-video_size", (scMod.win ?? "1920x1080"), "-i", DISP2,
    "-c:v", "mpeg4", "-q:v", "3",
    rawMp4,
  ],
  { stdio: "pipe", env }
);
await new Promise((r) => setTimeout(r, 900));

// 5) 动作编排（录制中，真实时间轴）
await scMod.run(page, context);

// 尾部余量：末帧动画不被 close 截断
await new Promise((r) => setTimeout(r, 1500));

await context.close();
spawnSync("pkill", ["-TERM", "-f", "x11grab"]);
await new Promise((r) => setTimeout(r, 1200));

// 6) 成片（与打板同帧率；win 场景保留原生分辨率，装裱交给剪辑阶段）
const outW = scMod.win ? null : 1920;
const vf = outW
  ? `scale=1920:1080:flags=lanczos,format=yuv420p`
  : `scale=${scMod.win.replace("x", ":")}:flags=lanczos,format=yuv420p`;
execSync(
  `ffmpeg -y -i ${rawMp4} -vf "${vf}" -r ${FPS} -c:v libx264 -preset slow -crf 18 ${path.join(OUT, "clip.mp4")}`,
  { stdio: "pipe" }
);
const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${path.join(OUT, "clip.mp4")}`, {
  encoding: "utf8",
}).trim();
const nframes = execSync(
  `ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 ${path.join(OUT, "clip.mp4")}`,
  { encoding: "utf8" }
).trim();
console.log(`REC-OK ${scene}: ${dur}s @${FPS}fps (${nframes} frames, eff=${(Number(nframes)/Number(dur)).toFixed(1)}) → ${path.join(OUT, "clip.mp4")}`);
if (xvfb) spawnSync("kill", [String(xvfb.pid)]);
