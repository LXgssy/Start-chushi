// smoke-v87165.mjs — v8.7.165 真扩展冒烟
// 门V 视频壁纸常播（fix③ 根修：拖拽会话 cs-bg-frozen 从视频闸退役）
//     V1 静态冻结类模拟：挂 html.cs-bg-frozen 700ms 视频 currentTime 持续前进
//     V2 真拖拽会话期间视频照播（用户口径「抽屉页面里拖拽磁贴图标时视频壁纸暂停」）
// 门X 拖叠建夹退役（用户定案「删掉把A磁贴放在B磁贴上就创建文件夹的操作」）：
//     X1 拖 A 悬停 B 900ms（>500ms 原 merge-dwell 阈值）→ 零新文件夹
//     X2 松手 → A/B 实时让位换序（v8.7.162 手感恢复）
// 门Q 迷你格方形律回归根修（fix① 长方形）：grid2 两站夹 / grid3 两三站夹 / 满夹计数格 全部 aspect 方
// 门F 免开层入夹继承（fix④ 保留）：快速拖链接落夹磁贴 → 直接入夹 + 全程零 popover
// 门D dwell 自动开夹继承：拖链接悬停夹磁贴 800ms → popover 打开 → 松手入夹
// 门I pageerror === 0
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/Start-chushi/download/v8.7.165/ChuShi-NewTab-v8.7.165.zip";
const STAGE = "/tmp/ext-smoke-v87165";
const PROFILE = "/tmp/ext-profile-v87165";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const VID = "/tmp/wall-test.mp4";

let pass = 0;
const bad = [];
const T = (name, cond) => {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { bad.push(name); console.log(`  [FAIL] ${name}`); }
};

// ffmpeg 生成 4s 测试视频（红蓝摆动，方便目检 + 确定性时长）
execSync(`ffmpeg -y -loglevel error -f lavfi -i "testsrc2=size=320x180:rate=25:duration=4" -pix_fmt yuv420p -c:v libx264 -preset ultrafast ${VID}`);
const B64 = fs.readFileSync(VID).toString("base64");

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: [
    "--no-sandbox",
    `--disable-extensions-except=${STAGE}`,
    `--load-extension=${STAGE}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
console.log("extension id:", extId);

const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1200);

// ---------- 种入：视频壁纸 IDB + 链接墙 + 三种夹 ----------
const mk = (n, pfx, nm) => Array.from({ length: n }, (_, i) => ({ id: pfx + (i + 1), name: nm + (i + 1), url: `https://${pfx}${i + 1}.example.com` }));
const LINKS = JSON.stringify([
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
  { id: "t2", name: "乙站", url: "https://t2.example.com" },
  { id: "t3", name: "丙站", url: "https://t3.example.com" },
  { id: "fd0", name: "空夹", folder: true, children: [] },
  { id: "fd3", name: "三站夹", folder: true, children: mk(3, "a", "站") },
  { id: "fd10", name: "满夹", folder: true, children: mk(10, "b", "满") },
]);

await page.evaluate(async ([b64, links]) => {
  localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "favicon", linksForm: "docked", photoId: "custom", wallpaperUrl: "", background: "photo" }));
  localStorage.setItem("start:links", links);
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const blob = new Blob([u8], { type: "video/mp4" });
  await new Promise((res, rej) => {
    const req = indexedDB.open("start-db", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(blob, "custom-wallpaper");
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = rej;
    };
    req.onerror = rej;
  });
}, [B64, LINKS]);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2500);

// ---------- 门V1：视频播放中 + 挂冻结类照播（fix③ 核心） ----------
{
  const playing = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { paused: v.paused, t: v.currentTime, kind: v.tagName } : null;
  });
  T("V1a 视频壁纸在位且播放中", !!playing && !playing.paused && playing.t > 0);
  const t0 = playing?.t ?? 0;
  await page.evaluate(() => document.documentElement.classList.add("cs-bg-frozen"));
  await page.waitForTimeout(900);
  const t1 = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v ? v.currentTime : -1;
  });
  T(`V1b 挂 cs-bg-frozen（拖拽会话冻结态）700ms 视频 currentTime 前进（${t0.toFixed(2)}→${t1.toFixed(2)}）`, t1 - t0 > 0.4);
  await page.evaluate(() => document.documentElement.classList.remove("cs-bg-frozen"));
  await page.waitForTimeout(200);
}

// ---------- 真拖辅助（dnd-kit pointer 序列） ----------
async function dragTile(fromId, toId, hoverMs = 0) {
  const a = await page.locator(`[data-entry-id="${fromId}"]`).boundingBox();
  const b = await page.locator(`[data-entry-id="${toId}"]`).boundingBox();
  if (!a || !b) return false;
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(ax + ((bx - ax) * i) / 10, ay + ((by - ay) * i) / 10);
    await page.waitForTimeout(28);
  }
  if (hoverMs) await page.waitForTimeout(hoverMs);
  await page.mouse.up();
  await page.waitForTimeout(500);
  return true;
}
const readLinks = () => page.evaluate(() => JSON.parse(localStorage.getItem("start:links") ?? "[]"));
const flushWrite = () => page.waitForTimeout(700); // useStoredDeferred 写合并落盘

// ---------- 门V2：真拖拽会话期间视频照播 ----------
{
  // seek 到 0.3s（远离 4s loop 回绕点），拖拽 900ms 后期望 ≈1.2s±0.5；若拖拽暂停视频则停在 0.3±0.1
  const seeked = await page.evaluate(() => {
    const v = document.querySelector("video");
    if (!v) return false;
    v.currentTime = 0.3;
    return true;
  });
  const t0 = await page.evaluate(() => document.querySelector("video")?.currentTime ?? -1);
  const ok = await dragTile("t3", "t2", 900);
  const after = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { t: v.currentTime, paused: v.paused } : null;
  });
  T("V2a 真拖拽会话建立（拖拽执行成功）", ok);
  T(
    `V2b 拖拽悬停 900ms 期间视频持续播放（seek ${t0.toFixed(2)}→${after?.t.toFixed(2)}，暂停则停在 0.3）`,
    seeked && !!after && !after.paused && after.t > 0.8 && after.t < 3.4
  );
  await flushWrite();
}

// ---------- 门X：拖叠建夹退役 ----------
{
  await page.evaluate((links) => localStorage.setItem("start:links", links), LINKS); // 重种防 V2 拖拽污染顺序
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2200);
  const before = await readLinks();
  const nBefore = before.length;
  const foldersBefore = before.filter((e) => e.folder).length;
  // 拖 t1 悬停 t2 900ms（原 merge-dwell 500ms 阈值已过 1.8 倍）
  await dragTile("t1", "t2", 900);
  await flushWrite();
  const after = await readLinks();
  const foldersAfter = after.filter((e) => e.folder).length;
  T("X1a 悬停 900ms 零新文件夹（拖叠建夹退役）", foldersAfter === foldersBefore);
  T("X1b 墙长度不变（A 未被吸收）", after.length === nBefore);
  const i1 = after.findIndex((e) => e.id === "t1");
  const i2 = after.findIndex((e) => e.id === "t2");
  T("X2a 松手 A/B 实时让位换序（t1 已到 t2 原位）", i1 === 1 && i2 === 0);
  const noMergeFolder = after.every((e) => !e.folder || (e.name !== "新建文件夹" || e.id === "fd0" || e.id === "fd3" || e.id === "fd10"));
  T("X2b 无「新建文件夹」产物", noMergeFolder);
}

// ---------- 门Q：迷你格方形律（grid2 默认） ----------
{
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2200);
  const g2 = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("[data-cl-folder-grid]").forEach((grid) => {
      const cells = [...grid.children].map((el) => {
        const b = el.getBoundingClientRect();
        return Math.abs(b.width - b.height);
      });
      out.push(...cells);
    });
    return out;
  });
  T("Q1 grid2 全部夹（含满夹计数格）格子方形（|w-h|≤0.6）", g2.length >= 7 && g2.every((d) => d <= 0.6));
  // 切 grid3
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("start:settings"));
    s.folderIconStyle = "grid3";
    localStorage.setItem("start:settings", JSON.stringify(s));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2200);
  const g3 = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("[data-cl-folder-grid]").forEach((grid) => {
      [...grid.children].forEach((el) => {
        const b = el.getBoundingClientRect();
        out.push(Math.abs(b.width - b.height));
      });
    });
    return out;
  });
  T("Q2 grid3 全部夹（两站/三站/满夹计数格）格子方形", g3.length >= 12 && g3.every((d) => d <= 0.6));
  // 切回 grid2 供后续门
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("start:settings"));
    s.folderIconStyle = "grid2";
    localStorage.setItem("start:settings", JSON.stringify(s));
  });
}

// ---------- 门F：免开层入夹（快速拖链接落夹磁贴） ----------
{
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2200);
  const ok = await dragTile("t2", "fd0", 0); // 快速松手（<500ms dwell 阈值）
  await flushWrite();
  const links = await readLinks();
  const fd0 = links.find((e) => e.id === "fd0");
  T("F1a 快速拖拽落夹磁贴直接入夹（免开层）", ok && !!fd0 && fd0.children.some((c) => c.id === "t2"));
  T("F1b 墙长度减一（t2 被吸收）", links.filter((e) => !e.folder).length === 2);
}

// ---------- 门D：dwell 500ms 自动开夹 + 松手入夹 ----------
{
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2200);
  const a = await page.locator('[data-entry-id="t3"]').boundingBox();
  const b = await page.locator('[data-entry-id="fd0"]').boundingBox();
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(ax + ((bx - ax) * i) / 10, ay + ((by - ay) * i) / 10);
    await page.waitForTimeout(28);
  }
  await page.waitForTimeout(820); // dwell 500ms 到点开夹
  const popoverOpen = await page.evaluate(() => !!document.querySelector("[data-cl-folder-popover]"));
  T("D1 悬停夹磁贴 800ms popover 自动展开（dwell 接力）", popoverOpen);
  await page.mouse.up();
  await page.waitForTimeout(600);
  await flushWrite();
  const links = await readLinks();
  const fd0 = links.find((e) => e.id === "fd0");
  T("D2 展开态松手入夹", !!fd0 && fd0.children.some((c) => c.id === "t3"));
}

// ---------- 门I ----------
T("I1 pageerror === 0", errors.length === 0);
if (errors.length) console.log("  pageerrors:", errors.slice(0, 3));

await browser.close();
console.log(`\nSMOKE: ${pass} PASS / ${bad.length} FAIL ${bad.length ? "— " + bad.join(" | ") : "ALL PASS"}`);
process.exit(bad.length ? 1 : 0);
