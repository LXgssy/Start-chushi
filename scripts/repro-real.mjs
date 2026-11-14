// repro-real.mjs — 真实世界样本全链复现（状态轮询 + 容错）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = process.env.REG_ZIP || "/home/z/beta-wt/download/v8.7.173/ChuShi-NewTab-v8.7.173.zip";
const STAGE = "/tmp/ext-real";
const PROFILE = "/tmp/ext-real-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const SAMPLES = "/tmp/pdf-samples-real";
const OUT = "/tmp/pdf-out-real";

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

async function openToolbox() {
  await page.mouse.click(640, 320, { button: "right" });
  await page.waitForTimeout(600);
  await page.getByText("PDF 工具箱").first().click();
  await page.waitForTimeout(900);
}
async function toolboxOpen() {
  return page.evaluate(() => document.body.innerText.includes("全程本地处理"));
}

await openToolbox();
console.log("toolbox open:", await toolboxOpen());

const input = page.locator('input[type="file"]');

async function readStatus() {
  return page.evaluate(() => {
    /* 运行按钮在 busy 时的文本即实时状态（Loader2 旋转图标同按钮） */
    const busyBtn = [...document.querySelectorAll("button")].find((b) => b.querySelector(".animate-spin"));
    if (busyBtn) return "BUSY:" + (busyBtn.textContent || "").trim().slice(0, 60);
    const t = document.body.innerText;
    for (const key of ["已生成", "质量过低", "未在该", "没有可提取"]) {
      const idx = t.indexOf(key);
      if (idx >= 0) return t.slice(idx, idx + 70).split("\n")[0];
    }
    return "";
  });
}

async function runTool(toolName, filePath, expectBtn = "开始转换") {
  try {
    await page.locator("button", { hasText: toolName }).first().click({ timeout: 8000 });
    await page.waitForTimeout(600);
    /* 注册校验+重试：tool 切换后 React 重建 input，setInputFiles 可能落在
       已卸载的旧元素上（重会话后主线程忙、重渲染延迟）→ change 丢失 */
    let registered = false;
    for (let attempt = 0; attempt < 3 && !registered; attempt++) {
      /* 真实用户路径：点「选择文件」→ filechooser 事件（CDP 直设 input 在
         重 WASM 会话后事件派发失效——真实对话框路径无此问题） */
      try {
        const chooserPromise = page.waitForEvent("filechooser", { timeout: 5000 });
        await page.locator('[role="button"]', { hasText: "点击选择" }).first().click();
        const chooser = await chooserPromise;
        await chooser.setFiles(filePath);
      } catch (e2) {
        await input.setInputFiles(filePath);
      }
      await page.waitForTimeout(700);
      registered = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("开始转换"));
        return btn ? !btn.disabled : false;
      });
      if (!registered) {
        const probe = await page.evaluate(() => {
          const inputs = [...document.querySelectorAll('input[type="file"]')];
          return JSON.stringify({
            count: inputs.length,
            files0: inputs[0] ? inputs[0].files.length : -1,
            hidden: inputs[0] ? inputs[0].offsetParent === null : null,
            connected: inputs[0] ? inputs[0].isConnected : null,
            rejected: document.body.innerText.includes("不支持的文件类型"),
            errText: (document.body.innerText.match(/不支持的文件类型[^\n]{0,60}/) || [""])[0],
          });
        });
        console.log(`    [${toolName}] probe: ${probe}`);
      }
    }
    const dlPromise = page.waitForEvent("download", { timeout: 170000 });
    try {
      await page.locator("button", { hasText: expectBtn }).first().click({ timeout: 6000 });
    } catch {
      /* 可能已 busy */
    }
    let dl = null;
    for (let t = 0; t < 16; t++) {
      const got = await Promise.race([
        dlPromise.then((d) => (d && typeof d === "object" ? d : null)).catch(() => null),
        new Promise((r) => setTimeout(() => r("tick"), 10000)),
      ]);
      if (got && got !== "tick") { dl = got; break; }
      if (got === "tick") {
        if (t === 0) {
          const st0 = await page.evaluate(() => {
            const pressed = [...document.querySelectorAll("button[aria-pressed=\"true\"]")].map((b) => (b.textContent || "").trim().slice(0, 12));
            const lists = [...document.querySelectorAll("li, [class*=file]")].map((e) => (e.textContent || "").trim()).filter((x) => x.includes(".pdf") || x.includes(".docx") || x.includes(".xlsx"));
            const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("开始转换"));
            return JSON.stringify({ pressed, files: lists.slice(0, 3), runBtn: btn ? (btn.disabled ? "disabled" : "enabled") : "missing" });
          });
          console.log(`    [${toolName} state] ${st0}`);
        }
        const st = await readStatus();
        console.log(`    [${toolName} t=${(t + 1) * 10}s] ${st}`);
        if (st.includes("已生成") || st.includes("质量过低") || st.includes("未在该") || st.includes("没有可提取")) break;
      }
    }
    if (!dl) throw new Error("NO_DOWNLOAD");
    const dest = `${OUT}/${toolName}-${filePath.split("/").pop()}.out`;
    await dl.saveAs(dest);
    await page.waitForTimeout(400);
    const msg = (await readStatus()) || "(无提示)";
    console.log(`[${toolName}] ${filePath.split("/").pop()} → OK | ${msg.slice(0, 62)}`);
    return { ok: true, dest, msg };
  } catch (e) {
    const diag = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        modal: t.includes("全程本地处理"),
        convDisabled: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "开始转换" && b.disabled),
      };
    });
    console.log(`[${toolName}] ${filePath.split("/").pop()} → FAIL | ${e.message.split("\n")[0].slice(0, 40)} | modal=${diag.modal} convDisabled=${diag.convDisabled}`);
    if (!(await toolboxOpen())) await openToolbox();
    return { ok: false };
  }
}

const SCAN_ONLY = process.env.SCAN_ONLY === "1";
const r = {};
if (!SCAN_ONLY) {
  r.wps2pdf = await runTool("Word 转 PDF", `${SAMPLES}/wps.docx`);
  r.merged2pdf = await runTool("Excel 转 PDF", `${SAMPLES}/merged.xlsx`);
  r.grouped2pdf = await runTool("PPT 转 PDF", `${SAMPLES}/grouped.pptx`);
}
r.scan2word = await runTool("PDF 转 Word", `${SAMPLES}/scanned.pdf`);
r.scan2excel = await runTool("PDF 转 Excel", `${SAMPLES}/scanned.pdf`);
if (!SCAN_ONLY) {
  r.invoice2excel = await runTool("PDF 转 Excel", `${SAMPLES}/invoice.pdf`);
  r.invoice2word = await runTool("PDF 转 Word", `${SAMPLES}/invoice.pdf`);
}

fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(r, null, 1));
console.log("pageerrors:", errors.length, errors.slice(0, 3));
await browser.close();
