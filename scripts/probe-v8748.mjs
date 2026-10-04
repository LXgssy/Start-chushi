// v8.7.48 小组件行探针：iTab 式组件卡（日历/天气/待办/倒数日）
// 门清单：
//   T1  四卡默认渲染（日历/天气/待办/倒数日）
//   T2  日历卡今日高亮 + 农历注记
//   T3  天气卡未定位态 + 点击直达天气面板
//   T4  待办卡未完成计数 + 条目文本 + 点击直达待办面板
//   T5  倒数日·每日循环（HH:MM:SS 跳动 + 跨日回绕）
//   T6  倒数日·天数模式（N 天）
//   T7  倒数日卡片内联编辑保存（标题+目标持久化）
//   T8  设置面板开关热跟随（关掉待办卡→卡消失）
//   T9  禅模式 zen-gone（html.zen 时行 visibility hidden）
//   T10 旧数据迁移（无 widgets 键 → 默认四卡）+ pageerror=0
import { chromium } from "playwright-core";

const BASE = process.env.PROBE_BASE || "http://localhost:3111";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function gate(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
}

const browser = await chromium.launch({
  channel: "chromium", headless: true,
  args: ["--no-sandbox", "--no-first-run"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const cardSel = 'section[aria-label="小组件"] > div > *';

async function loadWith(seed) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem("start:seen", "1");
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
  }, seed);
  await page.goto(BASE, { waitUntil: "load" });
  await sleep(1400); // 入场动画走完
}

/* ---------- T1/T2/T3/T4：默认种子 ---------- */
const today = new Date();
const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00`;
const tPlus10 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10);
const todos = [
  { id: "a", text: "写周报", done: false, createdAt: 1 },
  { id: "b", text: "回复邮件", done: false, createdAt: 2 },
  { id: "c", text: "已完成的任务", done: true, createdAt: 3 },
];
await loadWith({
  "start:todos": todos,
  "start:settings": {},
  "start:place": {},
});

// T1 四卡
const cards = await page.$$eval(cardSel, (els) =>
  els.map((el) => ({
    head: el.querySelector("span")?.textContent ?? "",
    clickable: el.tagName === "BUTTON",
  }))
);
gate("T1 四卡默认渲染", cards.length === 4, JSON.stringify(cards.map((c) => c.head)));
gate("T1b 可点卡语义", cards.filter((c) => c.clickable).length === 3, `clickable=${cards.filter((c) => c.clickable).length}`);

// T2 日历：今日高亮 + 农历
const cal = await page.evaluate(() => {
  const sec = document.querySelector('section[aria-label="小组件"]');
  const first = sec?.querySelector(":scope > div > *");
  if (!first) return null;
  const cur = first.querySelector('[aria-current="date"]');
  const now = new Date();
  return {
    today: cur?.textContent ?? "",
    todayOk: cur?.textContent === String(now.getDate()),
    monthLabel: first.querySelector("span")?.textContent ?? "",
    note: first.querySelectorAll("span")[1]?.textContent ?? "",
    headText: first.textContent ?? "",
  };
});
gate("T2a 今日高亮", !!cal && cal.todayOk, `today=${cal?.today}`);
gate("T2b 农历注记", !!cal && /[正一二三四五六七八九十冬]+月(初|十|廿|三十)/.test(cal.note), `note=${cal?.note}`);

// T3 天气卡未定位态 + 点击开面板
const wBtn = page.locator('button[aria-label="设置天气城市"]');
gate("T3a 未定位引导", (await wBtn.count()) === 1);
await wBtn.click();
await sleep(900);
const panelOpen = await page.evaluate(() => !!document.querySelector(".cl-panel"));
gate("T3b 直达天气面板", panelOpen);
await page.keyboard.press("Escape");
await sleep(600);

// T4 待办卡计数 + 直达
const todoCard = await page.evaluate(() => {
  const sec = document.querySelector('section[aria-label="小组件"]');
  const cards2 = [...(sec?.querySelectorAll(":scope > div > *") ?? [])];
  const c = cards2.find((el) => el.querySelector("span")?.textContent === "待办");
  return { note: c?.textContent ?? "", hasA: c?.textContent.includes("写周报") ?? false, hasB: c?.textContent.includes("2 项") ?? false };
});
gate("T4a 未完成计数", todoCard.hasB, todoCard.note.slice(0, 24));
gate("T4b 条目文本", todoCard.hasA);
await page.locator('button[aria-label="查看待办清单"]').click();
await sleep(900);
const todoPanel = await page.evaluate(() => !!document.querySelector(".cl-panel"));
gate("T4c 直达待办面板", todoPanel);
await page.keyboard.press("Escape");
await sleep(600);

/* ---------- T5/T6：倒数日双语义 ---------- */
// T5 每日循环：明晚 23:30（跨日回绕必然 <24h；用今日已过时刻验证明天回绕）
const t5 = "2020-01-01T08:30"; // 每日 08:30，历史日期→必回绕到明天
await loadWith({ "start:todos": [], "start:settings": { countdownTarget: t5, countdownTitle: "下班" } });
const daily = await page.evaluate(() => {
  const sec = document.querySelector('section[aria-label="小组件"]');
  const cards2 = [...(sec?.querySelectorAll(":scope > div > *") ?? [])];
  const c = cards2.find((el) => el.querySelector("span")?.textContent === "下班");
  const num = c?.querySelector(".tabular-nums")?.textContent ?? "";
  return { num, note: c?.textContent ?? "" };
});
gate("T5a 每日 HH:MM:SS", /^\d{2}:\d{2}:\d{2}$/.test(daily.num), `num=${daily.num}`);
gate("T5b 每日注记", daily.note.includes("每日") && daily.note.includes("08:30"));
await sleep(1600); // 跨秒再采样（同秒读数恒等是探针缺陷非产品缺陷）
const daily2 = await page.evaluate(() => {
  const sec = document.querySelector('section[aria-label="小组件"]');
  const cards2 = [...(sec?.querySelectorAll(":scope > div > *") ?? [])];
  const c = cards2.find((el) => el.querySelector("span")?.textContent === "下班");
  return c?.querySelector(".tabular-nums")?.textContent ?? "";
});
gate("T5c 秒级跳动", daily.num !== daily2, `${daily.num}→${daily2}`);

// T6 天数模式：+10 天零点
await loadWith({
  "start:settings": { countdownTarget: isoLocal(tPlus10), countdownTitle: "生日" },
});
const days = await page.evaluate(() => {
  const sec = document.querySelector('section[aria-label="小组件"]');
  const cards2 = [...(sec?.querySelectorAll(":scope > div > *") ?? [])];
  const c = cards2.find((el) => el.querySelector("span")?.textContent === "生日");
  return { num: c?.querySelector(".tabular-nums")?.textContent ?? "", note: c?.textContent ?? "" };
});
gate("T6a 天数=10", /10/.test(days.num) && days.note.includes("倒数"), `num=${days.num}`);

/* ---------- T7：内联编辑保存 ---------- */
await loadWith({ "start:settings": {} });
await page.locator('button[aria-label*="编辑倒数日"]').click();
await sleep(400);
await page.fill('input[aria-label="倒数日名称"]', "生日");
await page.fill('input[aria-label="目标日期与时间"]', isoLocal(tPlus10).slice(0, 10) + "T09:00");
await page.click('button:has-text("保存")');
await sleep(600);
const afterSave = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  const sec = document.querySelector('section[aria-label="小组件"]');
  const cards2 = [...(sec?.querySelectorAll(":scope > div > *") ?? [])];
  const c = cards2.find((el) => el.querySelector("span")?.textContent === "生日");
  return { title: s.countdownTitle, target: s.countdownTarget, cardOk: !!c };
});
gate(
  "T7 内联编辑持久化",
  afterSave.title === "生日" && /T09:00$/.test(afterSave.target) && afterSave.cardOk,
  JSON.stringify(afterSave).slice(0, 80)
);

/* ---------- T8：设置面板开关热跟随 ---------- */
await loadWith({ "start:todos": todos });
await page.locator('nav [aria-label="设置"], [aria-label="设置"]').first().click();
await sleep(1000);
const sw = page.locator('button[role="switch"][aria-label="待办卡"]');
gate("T8a 设置面开关在场", (await sw.count()) === 1);
await sw.click(); // 关掉待办卡
await sleep(900);
const heads8 = await page.$$eval(cardSel, (els) => els.map((el) => el.querySelector("span")?.textContent));
gate("T8b 关卡即消失", heads8.length === 3 && !heads8.includes("待办"), JSON.stringify(heads8));
const lsWidgets = await page.evaluate(() => JSON.parse(localStorage.getItem("start:settings") || "{}").widgets);
gate(
  "T8c 持久化为规范序",
  JSON.stringify(lsWidgets) === JSON.stringify(["calendar", "weather", "countdown"]),
  JSON.stringify(lsWidgets)
);

/* ---------- T9：禅模式 zen-gone ---------- */
const zen = await page.evaluate(() => {
  document.documentElement.classList.add("zen");
  return new Promise((res) => {
    // visibility 过渡延迟 0.65s（雾化散场全程可见、末帧隐没）——采样点须在末帧后
    setTimeout(() => {
      const sec = document.querySelector('section[aria-label="小组件"]');
      const v = sec ? getComputedStyle(sec).visibility : "";
      document.documentElement.classList.remove("zen");
      res(v);
    }, 900);
  });
});
gate("T9 禅退场 hidden", zen === "hidden", `visibility=${zen}`);

/* ---------- T10：旧数据迁移 ---------- */
await loadWith({ "start:settings": { themeMode: "light" } }); // 无 widgets 键
const heads10 = await page.$$eval(cardSel, (els) => els.map((el) => el.querySelector("span")?.textContent));
gate("T10 旧数据默认四卡", heads10.length === 4, JSON.stringify(heads10));

/* ---------- 汇总 ---------- */
const fails = results.filter((r) => !r.ok);
console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`);
if (errors.length) console.log("pageerror:", JSON.stringify(errors, null, 2));
gate("T0 pageerror=0", errors.length === 0, `${errors.length} 个`);
if (fails.length || errors.length) process.exit(1);
await browser.close();
process.exit(0);
