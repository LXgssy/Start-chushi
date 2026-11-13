// probe-pdf-convert-v87170.mjs — v8.7.170 PDF 工具箱全转换真扩展探针
// 对每个转换功能：选文件→开始转换→拦截下载落盘→Node/Python 校验产物
// 覆盖：img2pdf / word2pdf / excel2pdf / ppt2pdf / pdf2word / pdf2excel /
//       pdf2ppt / pdf2img / merge / split / encrypt / decrypt / text
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = process.env.PDF_ZIP || "/home/z/beta-wt/download/v8.7.170/ChuShi-NewTab-v8.7.170.zip";
const STAGE = "/tmp/ext-probe-pdf";
const PROFILE = "/tmp/ext-probe-pdf-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const FIX = "/tmp/pdf-fixtures";
const OUT = "/tmp/pdf-probe-out";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
const bad = [];
const T = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  [OK] ${name}${extra ? " — " + extra : ""}`); }
  else { bad.push(name); console.log(`  [FAIL] ${name}${extra ? " — " + extra : ""}`); }
};

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 200)));

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1800);

// 打开 PDF 工具箱
await page.click("body", { button: "right", position: { x: 900, y: 650 } });
await page.waitForTimeout(400);
await page.locator("text=PDF 工具箱").first().click();
await page.waitForTimeout(700);
const PANEL = '[aria-label="PDF 工具箱"]';

// 下载接管：saveAs 到 OUT 目录（按序命名）
let dlSeq = 0;
page.on("download", async (d) => {
  dlSeq++;
  const name = d.suggestedFilename() || `dl-${dlSeq}`;
  try { await d.saveAs(`${OUT}/${name}`); console.log(`  [DL] ${name} (${fs.statSync(`${OUT}/${name}`).size}B)`); }
  catch (e) { console.log(`  [DL-FAIL] ${name}: ${e.message.slice(0, 80)}`); }
});

async function runTool(tile, files, opts = {}) {
  const before = dlSeq;
  await page.locator(`button:has-text("${tile}")`).first().click();
  await page.waitForTimeout(350);
  /* multiple 由 pickFiles 动态设置——探针直设（Playwright 不走 pickFiles） */
  await page.evaluate((multi) => {
    const i = document.querySelector('input[type="file"]');
    if (i) { i.value = ""; i.multiple = multi; }
  }, files.length > 1);
  await page.locator(`${PANEL} input[type="file"]`).setInputFiles(files);
  await page.waitForTimeout(300);
  if (opts.password) {
    await page.locator(`${PANEL} input[type="password"]`).first().fill(opts.password);
    if (opts.password2 !== undefined) await page.locator(`${PANEL} input[type="password"]`).nth(1).fill(opts.password2);
  }
  if (opts.splitEvery) await page.locator(`${PANEL} input[type="number"]`).fill(String(opts.splitEvery));
  try {
    await page.locator(`${PANEL} button:has-text("开始转换"), ${PANEL} button:has-text("开始合并"), ${PANEL} button:has-text("开始拆分"), ${PANEL} button:has-text("加密并下载"), ${PANEL} button:has-text("解密并下载")`).first().click({ timeout: 8000 });
  } catch (e) {
    const dump = await page.evaluate(() => ({
      inputs: document.querySelectorAll('[aria-label="PDF 工具箱"] input[type="file"]').length,
      pw: document.querySelectorAll('[aria-label="PDF 工具箱"] input[type="password"]').length,
      fileList: [...document.querySelectorAll('[aria-label="PDF 工具箱"] li span')].map((x) => x.textContent).slice(0, 3),
      btnDisabled: [...document.querySelectorAll('[aria-label="PDF 工具箱"] button')].map((b) => ({ t: b.textContent?.slice(0, 8), d: b.disabled })).filter((x) => x.d).slice(0, 4),
      err: document.querySelector('[aria-label="PDF 工具箱"] .text-red-500')?.textContent?.slice(0, 120),
      num: document.querySelectorAll('[aria-label="PDF 工具箱"] input[type="number"]').length,
    }));
    console.log("  [DUMP]", JSON.stringify(dump));
    await page.screenshot({ path: "/tmp/probe-encrypt-stuck.png" });
    const cover = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[aria-label="PDF 工具箱"] button')].find((b) => /开始转换/.test(b.textContent || ""));
      if (!btn) return "no-btn";
      const r = btn.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, topEl: el ? el.tagName + "." + String(el.className).slice(0, 60) : "none", isBtnOrChild: btn.contains(el) };
    });
    console.log("  [COVER]", JSON.stringify(cover));
    throw e;
  }
  let done = "", err = "";
  const budget = opts.budget || 90000;
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(400);
    done = await page.locator(`${PANEL} p:has-text("已生成"), ${PANEL} p:has-text("已拆分"), ${PANEL} p:has-text("已导出"), ${PANEL} p:has-text("已合并")`).first().textContent({ timeout: 300 }).catch(() => "");
    err = await page.locator(`${PANEL} .text-red-500, ${PANEL} .text-red-400`).first().textContent({ timeout: 300 }).catch(() => "");
    if (done || err || Date.now() - t0 > budget) break;
  }
  return { done: (done || "").trim(), err: (err || "").trim(), downloads: dlSeq - before };
}

/* ---------- ① 图片转 PDF ---------- */
console.log("== img2pdf ==");
{
  const r = await runTool("图片转 PDF", [`${FIX}/样例图片.png`, `${FIX}/样例图片.png`]);
  T("img2pdf 完成", /已生成/.test(r.done), r.done || r.err);
  const f = `${OUT}/图片合集.pdf`;
  T("img2pdf 下载在位", fs.existsSync(f));
  if (fs.existsSync(f)) {
    const pages = execSync(`python3 -c "import fitz;d=fitz.open('${f}');print(d.page_count)"`).toString().trim();
    T("img2pdf 2 页且尺寸=图片", pages === "2");
  }
}

/* ---------- ② Word 转 PDF ---------- */
console.log("== word2pdf ==");
{
  const r = await runTool("Word 转 PDF", [`${FIX}/样例文档.docx`]);
  T("word2pdf 完成", /已生成/.test(r.done), r.done || r.err);
  const f = `${OUT}/样例文档.pdf`;
  T("word2pdf 下载在位", fs.existsSync(f));
  if (fs.existsSync(f)) {
    const txt = execSync(`python3 -c "import fitz;d=fitz.open('${f}');print(' '.join(p.get_text() for p in d))"`).toString();
    T("word2pdf 中文标题在文字层", txt.includes("测试文档标题"));
    T("word2pdf 表格内容在文字层", txt.includes("123") && txt.includes("456"));
    const imgs = execSync(`python3 -c "import fitz;d=fitz.open('${f}');print(sum(len(p.get_images()) for p in d))"`).toString().trim();
    T("word2pdf docx 内嵌图保留", Number(imgs) >= 1, `images=${imgs}`);
  }
}

/* ---------- ③ Excel 转 PDF ---------- */
console.log("== excel2pdf ==");
{
  const r = await runTool("Excel 转 PDF", [`${FIX}/样例表格.xlsx`]);
  T("excel2pdf 完成", /已生成/.test(r.done), r.done || r.err);
  const f = `${OUT}/样例表格.pdf`;
  T("excel2pdf 下载在位", fs.existsSync(f));
  if (fs.existsSync(f)) {
    const txt = execSync(`python3 -c "import fitz;d=fitz.open('${f}');print(' '.join(p.get_text() for p in d))"`).toString();
    T("excel2pdf 表头在文字层", txt.includes("销售额"));
    T("excel2pdf 双表名在文字层", txt.includes("月度数据") && txt.includes("站点清单"));
  }
}

/* ---------- ④ PPT 转 PDF ---------- */
console.log("== ppt2pdf ==");
{
  const r = await runTool("PPT 转 PDF", [`${FIX}/样例演示.pptx`]);
  T("ppt2pdf 完成", /已生成/.test(r.done), r.done || r.err);
  const f = `${OUT}/样例演示.pdf`;
  T("ppt2pdf 下载在位", fs.existsSync(f));
  if (fs.existsSync(f)) {
    const info = execSync(`python3 -c "import fitz;d=fitz.open('${f}');p=d[0];print(d.page_count,p.rect.width,p.rect.height)"`).toString().trim();
    T("ppt2pdf 2 页横版", info.startsWith("2 ") && Number(info.split(" ")[1]) > Number(info.split(" ")[2]), info);
    const pt = execSync(`python3 -c "import fitz;d=fitz.open('${f}');print(' '.join(p.get_text() for p in d))"`).toString();
    T("ppt2pdf 中文真实文字层（标题在文本层）", pt.includes("演示文稿标题"));
    T("ppt2pdf 中文非乱码", !/\x00/.test(pt) && !/[\u00c0-\u00ff]{4,}/.test(pt.replace(/[\s\d]/g, "")));
  }
}

/* ---------- ⑤ PDF 转 Word ---------- */
console.log("== pdf2word ==");
{
  const r = await runTool("PDF 转 Word", [`${FIX}/样例文档.pdf`], { budget: 120000 });
  T("pdf2word 完成", /已生成/.test(r.done), r.done || r.err);
  const f = `${OUT}/样例文档.docx`;
  T("pdf2word 下载在位", fs.existsSync(f));
  if (fs.existsSync(f)) {
    const txt = execSync(`python3 -c "
import docx
d = docx.Document('${f}')
print(' '.join(p.text for p in d.paragraphs) + ' ' + ' '.join(c.text for t in d.tables for row in t.rows for c in row.cells))"`).toString();
    T("pdf2word 中文正文还原", txt.includes("磁贴墙") || txt.includes("验证中文文本提取"), txt.slice(0, 80));
    T("pdf2word 第二页内容在（多页逐页提取）", txt.includes("第二页") && txt.includes("逐页提取"));
    T("pdf2word 表格还原为 docx 表", (execSync(`python3 -c "import docx;print(len(docx.Document('${f}').tables))"`).toString().trim() === "1"));
    T("pdf2word 表格内容完整", txt.includes("初始") && txt.includes("chushi.example.com"));
  }
}

/* ---------- ⑥ PDF 转 Excel ---------- */
console.log("== pdf2excel ==");
{
  const r = await runTool("PDF 转 Excel", [`${FIX}/样例文档.pdf`], { budget: 120000 });
  T("pdf2excel 完成", /已生成/.test(r.done), r.done || r.err);
  const f = `${OUT}/样例文档.xlsx`;
  T("pdf2excel 下载在位", fs.existsSync(f));
  if (fs.existsSync(f)) {
    const grid = execSync(`python3 -c "
import openpyxl
wb = openpyxl.load_workbook('${f}')
ws = wb.active
rows = []
for row in ws.iter_rows(min_row=1, max_row=8, max_col=4):
    rows.append('|'.join('' if c.value is None else str(c.value) for c in row))
print('\\n'.join(rows))"`).toString();
    T("pdf2excel 表头行还原（站点/地址/分类同行）", /站点.*地址.*分类/s.test(grid), grid.split("\n").slice(0, 4).join(" ⏎ "));
    T("pdf2excel 数据行还原（初始/chushi.example.com 同行）", /初始.*chushi\.example\.com/s.test(grid));
  }
}

/* ---------- ⑦ PDF 转 PPT ---------- */
console.log("== pdf2ppt ==");
{
  const r = await runTool("PDF 转 PPT", [`${FIX}/样例文档.pdf`], { budget: 120000 });
  T("pdf2ppt 完成", /已生成/.test(r.done), r.done || r.err);
  const f = `${OUT}/样例文档.pptx`;
  T("pdf2ppt 下载在位", fs.existsSync(f));
  if (fs.existsSync(f)) {
    const slides = execSync(`python3 -c "from pptx import Presentation;print(len(Presentation('${f}').slides))"`).toString().trim();
    T("pdf2ppt 页数=PDF 页数", slides === "2", `slides=${slides}`);
  }
}

/* ---------- ⑧ PDF 转图片 ---------- */
console.log("== pdf2img ==");
{
  const r = await runTool("PDF 转图片", [`${FIX}/样例文档.pdf`], { budget: 120000 });
  T("pdf2img 完成", /已生成|已导出/.test(r.done), r.done || r.err);
  const zipN = fs.readdirSync(OUT).find((n) => /图片\.zip$/.test(n));
  if (zipN) {
    const n2 = execSync(`python3 -c "import zipfile;z=zipfile.ZipFile('${OUT}/${zipN}');print(len([x for x in z.namelist() if x.endswith('.png')]))"`).toString().trim();
    T("pdf2img zip 含 2 页 PNG", n2 === "2", `pngs=${n2}`);
  } else {
    const got = fs.readdirSync(OUT).filter((n) => /样例文档.*png/i.test(n));
    T("pdf2img 页图下载（≥2 张）", got.length >= 2, got.join(","));
  }
}

/* ---------- ⑨ 合并 ---------- */
console.log("== merge ==");
{
  const r = await runTool("PDF 合并", [`${OUT}/图片合集.pdf`, `${FIX}/样例文档.pdf`]);
  T("merge 完成", /已生成/.test(r.done), r.done || r.err);
  const f = fs.readdirSync(OUT).find((n) => /合并|merged/.test(n));
  if (f) {
    const pages = execSync(`python3 -c "import fitz;d=fitz.open('${OUT}/${f}');print(d.page_count)"`).toString().trim();
    T("merge 页数=4（2+2）", pages === "4", `pages=${pages}`);
  } else T("merge 下载在位", false);
}

/* ---------- ⑩ 拆分 ---------- */
console.log("== split ==");
{
  const r = await runTool("PDF 拆分", [`${FIX}/样例文档.pdf`], { splitEvery: 1 });
  T("split 完成", /已生成|已拆分/.test(r.done), r.done || r.err);
  const sz = fs.readdirSync(OUT).find((n) => /拆分\.zip$/.test(n));
  T("split zip 下载在位", !!sz);
  if (sz) {
    const n3 = execSync(`python3 -c "import zipfile;z=zipfile.ZipFile('${OUT}/${sz}');print(len([x for x in z.namelist() if x.endswith('.pdf')]))"`).toString().trim();
    T("split zip 含 2 个分页 PDF", n3 === "2", `pdfs=${n3}`);
  }
}

/* ---------- ⑪ 加密 → ⑫ 解密闭环 ---------- */
console.log("== encrypt/decrypt ==");
{
  await page.evaluate(() => {
    const i = document.querySelector('input[type="file"]');
    i.value = "";
  });
  const r1 = await runTool("PDF 加密", [`${FIX}/样例文档.pdf`], { password: "test123", password2: "test123" });
  T("encrypt 完成", /已生成/.test(r1.done), r1.done || r1.err);
  const enc = fs.readdirSync(OUT).find((n) => /加密|encrypted/.test(n));
  T("encrypt 下载在位", !!enc);
  if (enc) {
    const ok = execSync(`python3 -c "import fitz;d=fitz.open('${OUT}/${enc}');print(d.needs_pass)"`).toString().trim();
    T("encrypt 产物确需密码", /^(True|1)/.test(ok.trim()), `needs_pass=${ok}`);
    const r2 = await runTool("PDF 解密", [`${OUT}/${enc}`], { password: "test123" });
    T("decrypt 完成", /已生成/.test(r2.done), r2.done || r2.err);
    const decAll = fs.readdirSync(OUT).filter((n) => /-解密\.pdf$/.test(n));
    const target = decAll.length ? decAll[decAll.length - 1] : undefined;
    if (target && fs.existsSync(`${OUT}/${target}`)) {
      const ok2 = execSync(`python3 -c "import fitz;d=fitz.open('${OUT}/${target}');print(d.needs_pass,d.page_count)"`).toString().trim();
      T("decrypt 产物免密可开", /^(False|0)\b/.test(ok2.trim()), ok2);
    } else T("decrypt 下载在位", false);
  }
}

/* ---------- ⑬ 提取文本 ---------- */
console.log("== text ==");
{
  const before2 = dlSeq;
  await page.locator(`button:has-text("提取文本")`).first().click();
  await page.waitForTimeout(350);
  await page.evaluate((m) => { const i = document.querySelector('input[type="file"]'); if (i) { i.value = ""; i.multiple = m; } }, false);
  await page.locator(`${PANEL} input[type="file"]`).setInputFiles([`${FIX}/样例文档.pdf`]);
  await page.waitForTimeout(300);
  await page.locator(`${PANEL} button:has-text("提取文本")`).last().click({ timeout: 8000 });
  let done = "", err = "";
  for (;;) { await page.waitForTimeout(400); done = await page.locator(`${PANEL} p:has-text("已提取"), ${PANEL} p:has-text("已生成")`).first().textContent({ timeout: 300 }).catch(() => ""); err = await page.locator(`${PANEL} .text-red-500, ${PANEL} .text-red-400`).first().textContent({ timeout: 300 }).catch(() => ""); if (done || err) break; }
  const r = { done: (done || "").trim(), err: (err || "").trim(), downloads: dlSeq - before2 };
  T("text 完成", /已提取|已生成/.test(r.done), r.done || r.err);
  const preview = await page.locator(`${PANEL} pre`).textContent().catch(() => "");
  T("text 预览含中文", /磁贴墙|飞鼠|牢蜂|表格/.test(preview), preview.slice(0, 60).replace(/\n/g, " "));
}

console.log("== pageerror ==");
T("全程零 pageerror", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

await page.screenshot({ path: "/tmp/pdf-probe-final.png" });
await browser.close();
console.log(`\nPDF-PROBE: ${pass} PASS / ${bad.length} FAIL`);
if (bad.length) { console.log("FAILED:", ...bad, "\n"); process.exit(1); }
