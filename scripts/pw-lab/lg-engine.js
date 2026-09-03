/* ============================================================
 * 液态玻璃预设 v3 —— 调用「初始」宿主内建实时引擎（v1.3.0）
 * ============================================================
 * 架构（v1.3.0 定稿）：引擎代码内建于宿主（rAF 实时渲染、真环绕折射、
 * 几何逐帧追踪），本预设只做两件事：
 *   ① 经 chushi.settings.define 向设置面板贡献调节项（八项，热调即生效）；
 *   ② 经 chushi.glass.enable/patch 调用引擎（配置逐字段白名单夹紧）。
 * 引擎物理：SDF 梯度方向 × smoothstep² 边缘窄带 × 边框外扩真环绕折射
 * （backdrop 取样域扩到玻璃足迹之外，边缘环带折进玻璃外的真实世界），
 * 链序律 blur→url(#disp)→saturate 由引擎内置。
 * ============================================================ */

chushi.settings.define({
  title: "液态玻璃",
  controls: [
    { type: "slider", key: "refraction", label: "折射强度", min: 0, max: 300, step: 5, def: 145, unit: "%" },
    { type: "slider", key: "band", label: "边缘带宽", min: 8, max: 60, step: 1, def: 26, unit: "%" },
    { type: "slider", key: "frost", label: "霜化模糊", min: 0, max: 12, step: 1, def: 3, unit: "px" },
    { type: "slider", key: "saturation", label: "饱和度", min: 100, max: 260, step: 5, def: 180, unit: "%" },
    { type: "slider", key: "brightness", label: "透亮", min: 80, max: 140, step: 1, def: 100, unit: "%" },
    { type: "toggle", key: "dispersion", label: "边缘色散", def: false },
    { type: "toggle", key: "specular", label: "镜面高光", def: true },
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

/* 启用：读持久化设置（宿主已按 schema 校验夹紧）整组传入引擎 */
var v = await chushi.settings.get();
var first = await chushi.glass.enable(v);
if (first && first.ok === false) {
  chushi.notify({ title: "液态玻璃", description: first.message || "引擎启用失败" });
}

/* 设置面板热调：整组值直接 patch 引擎（引擎侧逐字段夹紧） */
chushi.settings.onChange(function (x) {
  chushi.glass.patch(x);
});
