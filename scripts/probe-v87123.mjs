// v8.7.123 运行时终验探针——用户指令三项：
// ① 历史壁纸无法切换回之前更换过的本地壁纸（file 类单一槽被覆盖，恢复的
//    恒是最新那张）→ 入史归档 whfile:<id>，恢复按条目精确取；
// ② 云端同步没有同步历史壁纸 → 历史迁入 settings.wallHistory（六键随行），
//    chrome.storage.sync 旧通道一次性迁移；
// ③ 便签/待办常驻磁贴钉位云同步 → settings.pinTile，旧 localStorage 键
//    start:pintile-todo/note 一次性迁移，拖拽提交/resize clamp/越界 display-only。
// 门组：A 上传归档+上云形状 / B 历史回切精确对账 / C 直链往返恢复 /
// D 云端恢复读路径（start:settings 直写→重载→渲染）/ E 旧通道迁移 /
// F 钉位迁移+越界 clamp / G 拖拽提交+resize clamp / H 回归。
import { chromium } from "playwright-core";
import crypto from "crypto";
import zlib from "zlib";
import { execSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";

const ZIP = "/home/z/beta-wt/download/v8.7.123/ChuShi-NewTab-v8.7.123.zip";
const ROOT = "/tmp/ext-v87123";
const SHOTS = "/tmp/probe-v87123-shots";
const PROFILE = "/tmp/ext-v87123-profile";
rmSync(ROOT, { recursive: true, force: true });
rmSync(SHOTS, { recursive: true, force: true });
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`unzip -oq "${ZIP}" -d "${ROOT}"`);

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 两张不同尺寸 PNG（字节级不同→归档对账可辨）
function makePng(w, h, rgb) {
  // 手写最小 PNG（无压缩 zlib stored 块）
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w; x++) raw.push(rgb[0], rgb[1], rgb[2]);
  }
  const idat = zlib.deflateSync(Buffer.from(raw));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc);
    return Buffer.concat([len, body, crcB]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG_A = makePng(120, 90, [200, 30, 30]);
const PNG_B = makePng(260, 200, [30, 30, 220]);
writeFileSync("/tmp/probe-wall-a.png", PNG_A);
writeFileSync("/tmp/probe-wall-b.png", PNG_B);

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
console.log("stage: chromium 启动 EXT_ID=" + EXT_ID.slice(0, 8));

let ok = 0; const bad = [];
function gate(name, cond, detail = "") {
  if (cond) { ok++; console.log(`  [OK] ${name}${detail ? " | " + detail : ""}`); }
  else { bad.push(name + (detail ? " | " + detail : "")); console.log(`  [FAIL] ${name}${detail ? " | " + detail : ""}`); }
}
const pageErrors = [];
const page = await browser.newPage();
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.setViewportSize({ width: 1280, height: 720 });

const openSettings = async () => {
  await page.click('[aria-label="设置"]');
  await sleep(700);
};
const closePanel = async () => {
  await page.keyboard.press("Escape");
  await sleep(500);
};
const reload = async () => { await page.reload(); await page.waitForTimeout(1200); };
const resetEnv = async () => {
  await page.evaluate(() => {
    localStorage.clear();
    try { chrome.storage.sync.clear(() => {}); } catch {}
  });
  await page.evaluate(() => new Promise((r) => {
    const d = indexedDB.deleteDatabase("start-db");
    d.onsuccess = d.onerror = d.onblocked = () => r();
  }));
  await sleep(300);
  await reload();
};
// IndexedDB 键值读取（size/type 身份对账）
const idbInfo = (key) => page.evaluate((k) => new Promise((res) => {
  const rq = indexedDB.open("start-db", 1);
  rq.onsuccess = () => {
    const db = rq.result;
    try {
      const tx = db.transaction("kv", "readonly");
      const g = tx.objectStore("kv").get(k);
      g.onsuccess = () => {
        db.close();
        res(g.result ? { size: g.result.size ?? null, type: g.result.type ?? null } : null);
      };
      g.onerror = () => { db.close(); res(null); };
    } catch { db.close(); res(null); }
  };
  rq.onerror = () => res(null);
}), key);
const lsJson = (k) => page.evaluate((key) => {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}, k);
const syncGetAll = () => page.evaluate(() => new Promise((res) => {
  try { chrome.storage.sync.get(null, (o) => res(o ?? {})); } catch { res({}); }
}));

await page.goto(EXT_URL("index.html"));
await page.waitForTimeout(1500);

/* ---------------- A. 上传归档 + 上云形状 ---------------- */
console.log("—— A. 本机上传入史：归档槽 + settings.wallHistory ——");
await resetEnv();
/* 壁纸区只在 background=photo 时渲染（辉光/纯净模式无壁纸源选择） */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") ?? "{}");
  s.background = "photo";
  localStorage.setItem("start:settings", JSON.stringify(s));
});
await reload();
await openSettings();
const fileInput = 'input[type="file"][accept="image/*,video/*"]';
await page.setInputFiles(fileInput, "/tmp/probe-wall-a.png");
await sleep(800);
await page.setInputFiles(fileInput, "/tmp/probe-wall-b.png");
await sleep(800);
const sA = await lsJson("start:settings");
const whA = sA?.wallHistory ?? [];
gate("A1 上传两次后 settings.wallHistory 入云形状（2 条）", whA.length === 2, JSON.stringify(whA.map((x) => x.id)));
gate("A2 最新在前（B 头部）", whA[0]?.kind === "file" && String(whA[0]?.id ?? "").startsWith("probe-wall-b"), whA[0]?.id);
gate("A3 file 条目带缩略 dataURL（随 settings 上云）", typeof whA[0]?.thumb === "string" && whA[0].thumb.startsWith("data:image/jpeg"), `len=${(whA[0]?.thumb ?? "").length}`);
const archA = await idbInfo("whfile:probe-wall-a.png:" + PNG_A.length);
const archB = await idbInfo("whfile:probe-wall-b.png:" + PNG_B.length);
gate("A4 壁纸 A 归档槽在位 whfile:<id>", !!archA, JSON.stringify(archA));
gate("A5 壁纸 B 归档槽在位 whfile:<id>", !!archB, JSON.stringify(archB));
gate("A6 两归档内容可辨（尺寸不同）", !!archA && !!archB && archA.size !== archB.size, `A=${archA?.size} B=${archB?.size}`);
const custNow = await idbInfo("custom-wallpaper");
gate("A7 主槽当前=B（旧病场景还原）", !!custNow && archB && custNow.size === archB.size, JSON.stringify(custNow));
await page.screenshot({ path: SHOTS + "/a-settings-history.png" });

/* ---------------- B. 历史回切精确对账 ---------------- */
console.log("—— B. 点历史 A：按条目精确回切（旧病修复主门） ——");
await page.click('button[aria-label="probe-wall-a.png"]');
await sleep(900);
const custAfterA = await idbInfo("custom-wallpaper");
gate("B1 主槽已换成 A 的归档（不再冒充最新）", !!custAfterA && archA && custAfterA.size === archA.size, `size=${custAfterA?.size} vs A=${archA?.size}`);
const sB = await lsJson("start:settings");
gate("B2 photoId=custom + 直链清空 + rev 自增", sB?.photoId === "custom" && sB?.wallpaperUrl === "" && (sB?.wallpaperRev ?? 0) >= 1, `rev=${sB?.wallpaperRev}`);
gate("B3 历史列表未因恢复而变（仍 2 条 B 头）", (sB?.wallHistory ?? []).length === 2 && String(sB.wallHistory[0].id).startsWith("probe-wall-b"));
gate("B4 恢复无报错提示", !(await page.evaluate(() => document.body.innerText.includes("不在本机"))));
await page.screenshot({ path: SHOTS + "/b-restore-a.png" });

/* ---------------- C. 直链往返：主槽被清后归档仍可恢复 ---------------- */
console.log("—— C. 切直链清主槽 → 点历史 A 仍恢复（changelog 要点④） ——");
await page.fill('input[placeholder*="或粘贴图片"]', "https://example.com/probe-wall.png");
await page.press('input[placeholder*="或粘贴图片"]', "Enter");
await sleep(800);
const custAfterUrl = await idbInfo("custom-wallpaper");
gate("C1 直链生效主槽被清（互斥律）", custAfterUrl === null, JSON.stringify(custAfterUrl));
const sC = await lsJson("start:settings");
gate("C2 wallHistory 含 url 条目（3 条）", (sC?.wallHistory ?? []).length === 3, JSON.stringify(sC?.wallHistory?.map((x) => x.kind)));
await page.click('button[aria-label="probe-wall-a.png"]');
await sleep(900);
const custBackA = await idbInfo("custom-wallpaper");
gate("C3 直链往返后 A 仍精确恢复（旧版本此处恒失效）", !!custBackA && archA && custBackA.size === archA.size, `size=${custBackA?.size}`);
const sD = await lsJson("start:settings");
gate("C4 恢复后 wallpaperUrl 清空", sD?.wallpaperUrl === "" && sD?.photoId === "custom");
await closePanel();

/* ---------------- D. 云端恢复读路径（start:settings 直写 → 重载 → 渲染） ---------------- */
console.log("—— D. 云同步恢复读路径：wallHistory 随 settings 回来即渲染 ——");
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") ?? "{}");
  s.wallHistory = [
    { id: "mist-lake", kind: "gallery", photoId: "mist-lake", name: "图库·雾湖", ts: Date.now() - 1000 },
    { id: "https://example.com/x.png", kind: "url", url: "https://example.com/x.png", name: "example.com", ts: Date.now() - 2000 },
  ];
  localStorage.setItem("start:settings", JSON.stringify(s));
});
await reload();
await openSettings();
const thumbs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button[title="图库·雾湖"], button[title="example.com"]')).length);
gate("D1 云端恢复的 2 条历史渲染为缩略（gallery+url）", thumbs === 2, `count=${thumbs}`);
gate("D2 历史区标题在位", await page.evaluate(() => document.body.innerText.includes("最近使用")));
await page.screenshot({ path: SHOTS + "/d-cloud-restore.png" });

/* ---------------- E. 旧通道一次性迁移（chrome.storage.sync → settings） ---------------- */
console.log("—— E. chrome.storage.sync 旧历史迁移 ——");
await closePanel();
await page.evaluate(() => new Promise((res) => {
  const items = {
    whIndex: ["wh-old-1", "wh-old-2"],
    "wh:wh-old-1": { id: "wh-old-1", kind: "url", url: "https://old.example/1.png", name: "old1", ts: 111 },
    "wh:wh-old-2": { id: "wh-old-2", kind: "gallery", photoId: "aurora", name: "old2", ts: 222 },
  };
  chrome.storage.sync.set(items, res);
}));
await reload();
await openSettings();
const sE = await lsJson("start:settings");
const legacy = (sE?.wallHistory ?? []).filter((x) => String(x.id).startsWith("wh-old"));
const curWh = (sE?.wallHistory ?? []).filter((x) => x.id === "mist-lake" || x.id === "https://example.com/x.png");
gate("E1 旧 sync 历史 2 条并入 settings.wallHistory（恒合并）", legacy.length === 2, JSON.stringify(legacy.map((x) => x.id)));
gate("E1b 本机现有条目不被迁移冲掉（合并保留 2 条）", curWh.length === 2, JSON.stringify(sE?.wallHistory?.map((x) => x.id)));
gate("E1c 合并后 4 条且按 ts 新→旧（本机在前）", (sE?.wallHistory ?? []).length === 4 && String((sE?.wallHistory ?? [])[0]?.id) === "mist-lake", JSON.stringify((sE?.wallHistory ?? []).map((x) => x.id)));
const syncNow = await syncGetAll();
gate("E2 旧 sync 键已清空（防双源漂移）", Object.keys(syncNow).length === 0, JSON.stringify(Object.keys(syncNow)));
gate("E3 迁移条目渲染在历史区", await page.evaluate(() =>
  Array.from(document.querySelectorAll('button[title="old1"]')).length === 1));
await page.screenshot({ path: SHOTS + "/e-legacy-migrated.png" });
await closePanel();

/* ---------------- F. 钉位迁移 + 越界 display-only clamp ---------------- */
console.log("—— F. 便签/待办磁贴钉位：旧键迁移 + settings.pinTile ——");
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") ?? "{}");
  s.todoTile = true;
  s.noteTile = true;
  delete s.pinTile;
  localStorage.setItem("start:settings", JSON.stringify(s));
  localStorage.setItem("start:pintile-todo", JSON.stringify({ x: 30, y: 500 }));
  localStorage.setItem("start:pintile-note", JSON.stringify({ x: 1400, y: 120 }));
});
await reload();
const sF = await lsJson("start:settings");
gate("F1 旧钉位迁入 settings.pinTile（todo 30,500）", sF?.pinTile?.todo?.x === 30 && sF?.pinTile?.todo?.y === 500, JSON.stringify(sF?.pinTile));
gate("F2 旧钉位迁入 settings.pinTile（note 1400,120 原样保存）", sF?.pinTile?.note?.x === 1400 && sF?.pinTile?.note?.y === 120);
gate("F3 旧 localStorage 键已清（防双源漂移）", await page.evaluate(() =>
  localStorage.getItem("start:pintile-todo") === null && localStorage.getItem("start:pintile-note") === null));
const todoPos = await page.evaluate(() => {
  const el = document.querySelector('button[aria-label="打开待办面板"]')?.closest(".fixed");
  return el ? { left: el.style.left, top: el.style.top, w: el.offsetWidth, h: el.offsetHeight } : null;
});
gate("F4 待办磁贴按钉位渲染（left:30px top:500px）", todoPos?.left === "30px" && todoPos?.top === "500px", JSON.stringify(todoPos));
const notePos = await page.evaluate(() => {
  const el = document.querySelector('button[aria-label="打开便签面板"]')?.closest(".fixed");
  return el ? { left: el.style.left, top: el.style.top } : null;
});
const clampX = 1280 - (todoPos?.w ?? 224) - 8;
gate("F5 跨设备越界钉位 display-only clamp（note 1400→≤" + clampX + "）", notePos && parseInt(notePos.left) <= clampX && parseInt(notePos.left) > 800, JSON.stringify(notePos));
const sF2 = await lsJson("start:settings");
gate("F6 clamp 不回写 settings（防多设备打点）", sF2?.pinTile?.note?.x === 1400, `still=${sF2?.pinTile?.note?.x}`);
await page.screenshot({ path: SHOTS + "/f-pintiles.png" });

/* ---------------- G. 拖拽提交 + resize clamp ---------------- */
console.log("—— G. 拖拽落点提交 settings.pinTile + resize clamp ——");
const tb = await page.locator('button[aria-label="打开待办面板"]').boundingBox();
if (tb) {
  // 拖拽层中心：磁贴头部（按钮顶部 20px 内），位移 (+70,-60) → (100,440) 附近空白带
  const sx = tb.x + tb.width / 2, sy = tb.y + 12;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(sx + (70 * i) / 8, sy - (60 * i) / 8);
  await page.mouse.up();
  await sleep(700);
}
const sG = await lsJson("start:settings");
const gTodo = sG?.pinTile?.todo;
gate("G1 拖拽合法落点提交 settings.pinTile.todo", gTodo && Math.abs(gTodo.x - 100) <= 3 && Math.abs(gTodo.y - 440) <= 3, JSON.stringify(gTodo));
const afterDrag = await page.evaluate(() => {
  const el = document.querySelector('button[aria-label="打开待办面板"]')?.closest(".fixed");
  return el ? { left: el.style.left, top: el.style.top } : null;
});
gate("G2 磁贴按新钉位渲染", afterDrag?.left === gTodo?.x + "px" && afterDrag?.top === gTodo?.y + "px", JSON.stringify(afterDrag));
await page.setViewportSize({ width: 800, height: 500 });
await sleep(800);
const sG2 = await lsJson("start:settings");
const maxY = 500 - (todoPos?.h ?? 120) - 8;
gate("G3 resize clamp 回视口并提交（y≤" + maxY + "）", sG2?.pinTile?.todo && sG2.pinTile.todo.y <= maxY + 1, JSON.stringify(sG2?.pinTile?.todo));
gate("G3b 双磁贴同批 clamp 互不覆盖（note 也 clamp 且 todo 保持）", sG2?.pinTile?.note && sG2.pinTile.note.x <= 568 + 1 && sG2.pinTile.todo.y <= maxY + 1, JSON.stringify(sG2?.pinTile?.note));
await page.setViewportSize({ width: 1280, height: 720 });
await sleep(600);
await page.screenshot({ path: SHOTS + "/g-drag-resize.png" });

/* ---------------- H. 回归 ---------------- */
console.log("—— H. 回归：抽屉 / 设置面板 / pageerror ——");
await page.mouse.click(120, 450, { button: "middle" });
await sleep(900);
const veil = await page.evaluate(() => {
  const t = document.querySelector(".cl-fade-veil-top");
  const sc = t?.parentElement?.querySelector(".cl-links-scroll");
  return { veil: !!t, scroll: !!sc };
});
gate("H1 抽屉+羽化遮罩结构在位（v8.7.121 回归）", veil.veil && veil.scroll, JSON.stringify(veil));
await page.keyboard.press("Escape");
await sleep(500);
gate("H2 全程零 pageerror", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

console.log();
console.log(`PASS ${ok}  FAIL ${bad.length}`);
for (const b of bad) console.log("  [BAD]", b);
await browser.close();
process.exit(0);
