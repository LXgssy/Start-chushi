/* ============================================================
 * 液态玻璃预设 v4（v1.6.0 · 玻璃游乐场设置移植版）
 * ============================================================
 * 出处与作者（法律与诚意声明，勿删）：
 *   玻璃参数体系与设置面板忠实移植自开源项目 liquid-glass-webgl
 *   （「玻璃游乐场」，浏览器版 iOS 液态玻璃）：
 *     仓库：https://github.com/martin65536/liquid-glass-webgl （Apache-2.0）
 *     作者：martin65536（Z.ai Agent 辅助开发）
 *   原型：Kyant0/AndroidLiquidGlass（Apache-2.0，作者 Kyant0）。
 *
 * 设置面板 = 玻璃游乐场 GlassPlaygroundContent 控制板的全量移植
 * （catalog/build-glass-playground.ts sliderDefs，除「圆角半径」外全部）：
 *   Blur radius          → 模糊半径   0–32 px（playground blurRadiusDp）
 *   Refraction height    → 折射高度   0–48 px（refractionHeightFrac×短边/2 同量级）
 *   Refraction amount    → 折射量     0–48 px（refractionAmountFrac×短边 同量级）
 *   Chromatic aberration → 色差       0–100%（chromaticAberration 0..1）
 * 另附「初始」应用特有的覆盖范围（core 四区 / full 全部玻璃面）。
 * 热调即生效（settings.onChange → chushi.glass.patch）。
 * ============================================================ */

chushi.settings.define({
  title: "液态玻璃",
  controls: [
    { type: "slider", key: "blur", label: "模糊半径", min: 0, max: 32, step: 1, def: 8, unit: "px" },
    { type: "slider", key: "refractionHeight", label: "折射高度", min: 0, max: 48, step: 1, def: 24, unit: "px" },
    { type: "slider", key: "refractionAmount", label: "折射量", min: 0, max: 48, step: 1, def: 24, unit: "px" },
    { type: "slider", key: "chromatic", label: "色差", min: 0, max: 100, step: 5, def: 0, unit: "%" },
    {
      type: "select",
      key: "coverage",
      label: "覆盖范围",
      def: "full",
      options: [
        { value: "full", label: "全部玻璃面" },
        { value: "core", label: "基础四区" },
      ],
    },
  ],
});

/* 游乐场滑杆值 → 引擎 cfg（色差 % → 0..1；饱和/亮度/高光取游乐场各页定值：
 * vibrancy 1.5、brightness 0 偏移、Highlight Default） */
function toCfg(v) {
  return {
    refractionHeight: v.refractionHeight,
    refractionAmount: v.refractionAmount,
    blur: v.blur,
    chromatic: (v.chromatic || 0) / 100,
    saturation: 150,
    brightness: 100,
    highlight: true,
    coverage: v.coverage,
  };
}

/* 启用：读持久化设置（宿主已按 schema 校验夹紧）映射后传入引擎 */
var v = await chushi.settings.get();
var first = await chushi.glass.enable(toCfg(v));
if (first && first.ok === false) {
  chushi.notify({ title: "液态玻璃", description: first.message || "引擎启用失败" });
}

/* 设置面板热调：游乐场语义即时 patch 引擎 */
chushi.settings.onChange(function (x) {
  chushi.glass.patch(toCfg(x));
});
