// 最小复现：连续 postMessage transfer 多个 OffscreenCanvas/ImageBitmap 到沙箱 iframe，看第 N 个是否丢失
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const logs = [];
page.on("console", (m) => logs.push(m.text().slice(0, 120)));

await page.goto("http://localhost:3000/sandbox.html", { waitUntil: "load" });
// 直接在沙箱页顶层注入测试监听（沙箱页自身 = 待测环境）
const r = await page.evaluate(async () => {
  const out = [];
  const received = [];
  window.addEventListener("message", (e) => {
    if (e.data && e.data.__t) received.push(e.data.__t);
  });
  // 模拟宿主发 5 条：OffscreenCanvas transfer
  for (let i = 0; i < 5; i++) {
    const c = document.createElement("canvas");
    c.width = 100; c.height = 80;
    const off = c.transferControlToOffscreen();
    parent.postMessage({ __t: "off" + i }, "*", [off]);
    out.push("sent off" + i);
  }
  // ImageBitmap transfer ×5
  for (let i = 0; i < 5; i++) {
    const c = document.createElement("canvas");
    c.width = 100; c.height = 80;
    const bmp = await createImageBitmap(c);
    parent.postMessage({ __t: "bmp" + i }, "*", [bmp]);
    out.push("sent bmp" + i);
  }
  await new Promise((res) => setTimeout(res, 500));
  return { sent: out, receivedFromChild: received };
});
console.log("sent:", r.sent.length, "从子窗口收到:", JSON.stringify(r.receivedFromChild));

// 反向：从宿主页面视角，向沙箱 iframe 发 transfer
const page2 = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page2.goto("http://localhost:3000/", { waitUntil: "networkidle" });
const r2 = await page2.evaluate(async () => {
  // 建一个真实沙箱 iframe（与应用同构）
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.src = "/sandbox.html";
  frame.style.cssText = "display:none";
  document.body.appendChild(frame);
  await new Promise((res) => {
    const h = (e) => { if (e.data === "__ready") { window.removeEventListener("message", h); res(); } };
    window.addEventListener("message", h);
    frame.onload = () => frame.contentWindow.postMessage({ __inject: 1 }, "*");
  });
  // 向沙箱注入收集器
  frame.contentWindow.postMessage({ __collect: 1 }, "*");
  await new Promise((res) => setTimeout(res, 100));
  const got = [];
  window.addEventListener("message", (e) => {
    if (e.data && e.data.__r) got.push(e.data.__r);
  });
  // 宿主 → 沙箱：5 条 OffscreenCanvas transfer + 5 条 ImageBitmap
  for (let i = 0; i < 5; i++) {
    const c = document.createElement("canvas");
    c.width = 60; c.height = 40;
    const off = c.transferControlToOffscreen();
    frame.contentWindow.postMessage({ __t: "off" + i }, "*", [off]);
  }
  for (let i = 0; i < 5; i++) {
    const c = document.createElement("canvas");
    c.width = 60; c.height = 40;
    const bmp = await createImageBitmap(c);
    frame.contentWindow.postMessage({ __t: "bmp" + i }, "*", [bmp]);
  }
  await new Promise((res) => setTimeout(res, 800));
  return got;
});
console.log("宿主→沙箱 收到:", JSON.stringify(r2));
await browser.close();
