// v1.3.0 扩展冒烟：--load-extension 真浏览器加载 → 新标签页渲染 → 导入液态玻璃 → 内建引擎生效
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const STAGE = "/tmp/ext-smoke-v13";
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q /home/z/my-project/download/v1.3.0/ChuShi-NewTab-v1.3.0.zip`);

const userData = "/tmp/ext-profile-v13";
fs.rmSync(userData, { recursive: true, force: true });
const browser = await chromium.launchPersistentContext(userData, {
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 800 },
});
let extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
console.log("extension id:", extId);
const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1800);
const rendered = await page.evaluate(() => ({
  clock: !!document.querySelector(".cl-clock"),
  dock: !!document.querySelector(".cl-dock"),
  title: document.title,
}));
console.log("新标签页渲染:", JSON.stringify(rendered));

// 导入液态玻璃预设（⌘K → 导入 → 粘贴）
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2600);
const engine = await page.evaluate(() => {
  const pill = document.querySelector(".search-pill[data-lg]");
  const f = [...document.querySelectorAll("#chushi-lg-root filter")].find((x) => x.querySelector("feDisplacementMap"));
  const cs = pill ? getComputedStyle(pill) : null;
  return {
    bf: cs ? cs.backdropFilter.replace(/"/g, "").slice(0, 56) : "(none)",
    border: cs ? cs.borderTopWidth : "",
    filters: document.querySelectorAll("#chushi-lg-root filter").length,
    marked: document.querySelectorAll("[data-lg]").length,
    mapOk: !!(f && (f.querySelector("feImage")?.getAttribute("href") || "").startsWith("data:image/png")),
  };
});
console.log("扩展内引擎:", JSON.stringify(engine));
const pass =
  rendered.clock &&
  rendered.dock &&
  engine.bf.includes("url(#lg-") &&
  parseFloat(engine.border) >= 4 &&
  engine.filters > 0 &&
  engine.mapOk &&
  engine.marked >= 2 &&
  errors.length === 0;
console.log(pass ? "✓ 扩展冒烟通过（内建引擎实时渲染 + 真环绕外扩）" : `✗ 冒烟失败 errors=${JSON.stringify(errors)}`);
await page.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/v13-ext.png" });
await browser.close();
process.exit(pass ? 0 : 1);
