// audit-icons-v87154.mjs — 自绘注册表全量锐度审计：188 条按真实磁贴管线渲染
// 两张整册图：1×(64px 磁贴原大) 与 4×(256px)，DPR2 截图 → 目检锯齿/断裂/空带
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/home/z/my-project/download/icon-audit-v87154";
fs.mkdirSync(OUT, { recursive: true });
const reg = JSON.parse(fs.readFileSync("/home/z/beta-wt/public/selfdraw-icons.json", "utf8"));
const keys = Object.keys(reg).sort();
console.log("entries:", keys.length);

function tileSvg(k) {
  const [vb, body] = reg[k];
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb +
    '" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">' + body + "</svg>"
  );
}

const cell = (k, size, radius) => `
<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
  <div style="width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden;flex:none">
    ${tileSvg(k)}
  </div>
  <div style="font:10px monospace;color:#555;text-align:center;max-width:${size + 40}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${k}</div>
</div>`;

const page1x = keys.map((k) => cell(k, 64, 20)).join("");
const page4x = keys.map((k) => cell(k, 256, 80)).join("");

const html = (inner, cols) => `<!doctype html><meta charset="utf8"><body style="margin:16px;background:#f3f4f6">
<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:14px">${inner}</div></body>`;

fs.writeFileSync(`${OUT}/audit-1x.html`, html(page1x, 16));
fs.writeFileSync(`${OUT}/audit-4x.html`, html(page4x, 7));

const browser = await chromium.launch({
  executablePath: "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
async function shot(file, png, waitMs) {
  const p = await browser.newPage({ viewport: { width: 1560, height: 1200 }, deviceScaleFactor: 2 });
  await p.goto("file://" + file, { waitUntil: "load" });
  await p.waitForTimeout(waitMs);
  await p.screenshot({ path: png, fullPage: true });
  await p.close();
  console.log("shot:", png);
}
await shot(`${OUT}/audit-1x.html`, `${OUT}/audit-1x.png`, 1200);
await shot(`${OUT}/audit-4x.html`, `${OUT}/audit-4x.png`, 1200);
await browser.close();
console.log("AUDIT SHEETS DONE");
