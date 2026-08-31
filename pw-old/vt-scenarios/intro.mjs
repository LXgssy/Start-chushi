// 入场动画全景：introFlow —— commit 即冻结，intro-rise 序列从第 0 帧逐帧录制
// 时钟/日期/搜索/链接/dock 依次上浮，无光标（品牌镜头）
export const introFlow = true;
export const noCursor = true;
export const initScript = `
  try {
    localStorage.setItem("start:seen", "1");
    let s = {};
    try { s = JSON.parse(localStorage.getItem("start:settings") || "{}"); } catch {}
    localStorage.setItem("start:settings", JSON.stringify({ ...s, themeMode: "light", background: "glow" }));
    localStorage.removeItem("start:weather-last");
    localStorage.removeItem("start:links");
    localStorage.removeItem("start:todos");
    localStorage.removeItem("start:note");
  } catch {}
`;
export async function run(rec) {
  await rec.frame(196); // 3.27s 入场全景
  await rec.mark("intro-end");
}
