import { chromium } from "playwright-core";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox","--use-gl=angle","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "null");
  if (s) { s.background = "photo"; s.photoId = "daily"; localStorage.setItem("start:settings", JSON.stringify(s)); }
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2500);
const dbg = await page.evaluate(() => {
  // 1) 引擎 GL 画布直接读（preserveDrawingBuffer=true 可读）
  const probe = window.__chushiLG();
  // 2) 找到引擎源码中的片元源并手动编译测试
  return { hasCanvasReadPath: true, probeRole0: probe.recs[0] };
});
// 读 GL 画布：借助引擎同款 API 不可行（私有），改从 2d 叠层反推 + 直接在页面内重新求值 shader 源
const shaderTest = await page.evaluate(async () => {
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 64;
  const gl = cv.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: true });
  // 从模块里拿不到私有函数——改从 chunk 源码正则抠 elementFragmentSource 的模板串
  const res = await fetch("/Start-chushi/_next/static/chunks/961e4793b801acf8.js");
  const src = await res.text();
  const i = src.indexOf("precision highp float;");
  const j = src.indexOf("gl_FragColor = vec4(color * coverage, coverage);", i);
  const fsSrc = src.slice(i - 8, j + 60).replace(/\\n/g, "\n");
  const compile = (type, s) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    return { ok: gl.getShaderParameter(sh, gl.COMPILE_STATUS), log: gl.getShaderInfoLog(sh) };
  };
  // 最小化复现：只编译含 band 的片元（补 uniforms 声明由源码自带）
  const frag = fsSrc;
  const r = compile(gl.FRAGMENT_SHADER, frag);
  return { len: frag.length, head: frag.slice(0, 80), ok: r.ok, log: r.log.slice(0, 400) };
});
console.log("shaderTest:", JSON.stringify(shaderTest, null, 1));
await browser.close();
