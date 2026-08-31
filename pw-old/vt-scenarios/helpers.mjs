// 共享助手：设置写入 / 天气三接口 mock（保证 100% 可重复）
export async function patchSettings(page, patch) {
  await page.evaluate((p) => {
    let s = {};
    try {
      s = JSON.parse(localStorage.getItem("start:settings") || "{}");
    } catch {}
    localStorage.setItem("start:settings", JSON.stringify({ ...s, ...p }));
  }, patch);
}

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
  await page.route("**/api.open-meteo.com/**", (route) => {
    const url = route.request().url();
    const t = url.includes("31.23") ? cityTemp : temp;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(forecast(t)) });
  });
  await page.route("**/geocoding-api.open-meteo.com/**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(GEO) })
  );
  await page.route("**/api.bigdatacloud.net/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ city: "北京市" }),
    })
  );
}

/** 扩展构建产物天气优先走 CMA，mock 环境直接断流让其秒回退 Open-Meteo */
export async function abortCMA(page) {
  await page.route((u) => String(u).includes("cma"), (route) => route.abort());
}
