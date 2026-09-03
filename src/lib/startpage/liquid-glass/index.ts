/* ============================================================
 * 「初始」液态玻璃模块（v1.5.0 · 玻璃游乐场移植版）
 * ============================================================
 * 移植自 liquid-glass-webgl（https://github.com/martin65536/liquid-glass-webgl，
 * 作者 martin65536，Apache-2.0），原型 Kyant0/AndroidLiquidGlass
 * （https://github.com/Kyant0/AndroidLiquidGlass，作者 Kyant0，Apache-2.0）。
 * 详见各文件头声明。
 * ============================================================ */

export { liquidGlass, sanitizeGlassEnable, sanitizeGlassPatch } from "./engine";
export type { GlassConfig, GlassPatch } from "./engine";
export {
  springStepCritical,
  springStepUnderdamped,
  VelocityTracker1D,
  PRESS_OMEGA_N,
  SCALE_X_OMEGA_N,
  SCALE_X_DAMPING,
  SCALE_Y_OMEGA_N,
  SCALE_Y_DAMPING,
  VELOCITY_OMEGA_N,
  VELOCITY_DAMPING,
  SPRING_THRESHOLD,
} from "./spring";
