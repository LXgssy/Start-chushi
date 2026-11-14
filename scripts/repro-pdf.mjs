// repro-pdf.mjs — v8.7.173 转换链路错误复现（真扩展 UI + 中文样本 + 输出解析）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = process.env.REG_ZIP || "/home/z/beta-wt/download/v8.7.173/ChuShi-NewTab-v8.7.173.zip";
const STAGE = "/tmp/ext-repro";
const PROFILE = "/tmp/ext-repro-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const SAMPLES = "/tmp/pdf-samples";
const OUT = "/tmp/pdf-out";

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 150)));

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1800);

// 开 PDF 工具箱：页面右键菜单
await page.mouse.click(640, 320, { button: "right" });
await page.waitForTimeout(600);
await page.getByText("PDF 工具箱").first().click();
await page.waitForTimeout(900);
console.log("toolbox open:", await page.evaluate(() => document.body.innerText.includes("全程本地处理")));

const input = page.locator('input[type="file"]');

async function runTool(toolName, filePath, expectBtn = "开始转换") {
  await page.locator("button", { hasText: toolName }).first().click();
  await page.waitForTimeout(300);
  await input.setInputFiles(filePath);
  await page.waitForTimeout(400);
  const dlPromise = page.waitForEvent("download", { timeout: 120000 });
  await page.locator("button", { hasText: expectBtn }).first().click();
  const dl = await dlPromise;
  const dest = `${OUT}/${toolName}-${filePath.split("/").pop()}.out`;
  await dl.saveAs(dest);
  await page.waitForTimeout(500);
  const done = await page.evaluate(() => {
    const t = document.body.innerText;
    const ok = t.match(/已生成[^\n]*/)?.[0] || "";
    const err = t.match(/(失败|错误)[^\n]*/)?.[0] || "";
    return { ok, err };
  });
  console.log(`[${toolName}] ${filePath.split("/").pop()} → saved ${dest.split("/").pop()} | ${done.ok || done.err}`);
  return dest;
}

// 六条链
const outs = {};
outs.word2pdf = await runTool("Word 转 PDF", `${SAMPLES}/sample.docx`);
outs.excel2pdf = await runTool("Excel 转 PDF", `${SAMPLES}/sample.xlsx`);
outs.ppt2pdf = await runTool("PPT 转 PDF", `${SAMPLES}/sample.pptx`);
outs.pdf2word = await runTool("PDF 转 Word", `${SAMPLES}/text-doc.pdf`);
outs.pdf2excel = await runTool("PDF 转 Excel", `${SAMPLES}/table-doc.pdf`);
outs.pdf2ppt = await runTool("PDF 转 PPT", `${SAMPLES}/text-doc.pdf`);
outs.pdf2wordTable = await runTool("PDF 转 Word", `${SAMPLES}/table-doc.pdf`);
outs.pdf2wordComplex = await runTool("PDF 转 Word", `${SAMPLES}/complex-table.pdf`);
outs.word2pdfComplex = await runTool("Word 转 PDF", `${SAMPLES}/complex.docx`);

fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify(outs, null, 1));
console.log("pageerrors:", errors.length, errors.slice(0, 3));
await browser.close();
