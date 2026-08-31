// 共享助手：设置读写 / 天气 mock / JS 直点
export async function patchSettings(page, patch) {
  await page.evaluate((p) => {
    let s = {};
    try {
      s = JSON.parse(localStorage.getItem("start:settings") || "{}");
    } catch {}
    localStorage.setItem("start:settings", JSON.stringify({ ...s, ...p }));
  }, patch);
}

/** JS 直点（绕过 playwright 鼠标校验——kiosk 下 hit-target 检查不稳定）
 *  text 传入时按 textContent 精确匹配（如 Segmented 的「深色」） */
export async function jsclick(page, selector, text) {
  return page.evaluate(
    ({ sel, txt }) => {
      let el = null;
      if (txt != null) {
        el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === txt);
      } else {
        el = document.querySelector(sel);
      }
      if (el) el.click();
      return !!el;
    },
    { sel: selector, txt: text ?? null }
  );
}

/** 天气双接口 mock（沙箱 Open-Meteo 常年 429/超时，mock 保证 100% 可重复） */
export async function mockWeather(page, temp = 26, cityTemp = 24) {
  const GEO = {
    results: [
      { name: "上海", admin1: "上海市", country: "中国", latitude: 31.23, longitude: 121.47 },
      { name: "上海", admin1: "浙江省", country: "中国", latitude: 30.0, longitude: 120.5 },
      { name: "上海", admin1: "云南省", country: "中国", latitude: 25.0, longitude: 100.2 },
      { name: "青岛", admin1: "山东省", country: "中国", latitude: 36.07, longitude: 120.38 },
      { name: "三亚", admin1: "海南省", country: "中国", latitude: 18.25, longitude: 109.5 },
    ],
  };
  const forecast = (t) => {
    const nowH = new Date().getHours();
    return {
      current: { temperature_2m: t, relative_humidity_2m: 62, weather_code: 2, wind_speed_10m: 8.2 },
      hourly: {
        time: Array.from({ length: 24 }, (_, i) => {
          const d = new Date();
          d.setHours(nowH + i, 0, 0, 0);
          return d.toISOString().slice(0, 13) + ":00";
        }),
        temperature_2m: Array.from({ length: 24 }, (_, i) => t - Math.round(3 * Math.sin(i / 2.2))),
        weather_code: Array.from({ length: 24 }, (_, i) => (i < 8 ? 2 : i < 14 ? 3 : 2)),
      },
      daily: {
        temperature_2m_max: [t + 5, t + 4],
        temperature_2m_min: [t - 4, t - 3],
      },
    };
  };
  // 按经纬度区分两次 forecast（默认北京 26° → 选上海后 24°）
  await page.route("**/api.open-meteo.com/**", (route) => {
    const url = route.request().url();
    const t = url.includes("31.23") ? cityTemp : temp;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(forecast(t)) });
  });
  await page.route("**/geocoding-api.open-meteo.com/**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(GEO) })
  );
  await page.route("**/api.bigdatacloud.net/**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ city: "北京市" }) })
  );
}

/** 输入框聚焦后逐字输入（focus 替代 click——kiosk 下鼠标校验不稳定）
 *  仅建议用于 ASCII：CJK 走 pressSequentially 在 chromium 131 kiosk 下
 *  节奏不可控（逐字 input 事件延迟可达秒级），CJK 请用 setCJK */
export async function typeInto(page, selector, text, delay = 150) {
  const inp = page.locator(selector);
  await inp.focus();
  await inp.pressSequentially(text, { delay });
}

/** CJK/整串确定输入：原生 value setter + input 事件（React 受控组件标准绕法），
 *  整串一次落框，时长确定；真实 IME 打字本就是整段上屏，视觉无违和 */
export async function setCJK(page, selector, text) {
  return page.evaluate(
    ({ sel, txt }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(el, txt);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    },
    { sel: selector, txt: text }
  );
}

/** dock 第 i 个按钮（0=天气 1=待办 2=便签 3=番茄钟 4=⌘K 5=设置） */
export async function dockClick(page, i) {
  return page.evaluate((idx) => {
    const b = document.querySelectorAll("nav[aria-label='快捷操作'] button")[idx];
    if (b) b.click();
    return !!b;
  }, i);
}
