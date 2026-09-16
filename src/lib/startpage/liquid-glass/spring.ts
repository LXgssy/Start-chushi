/* ============================================================
 * 「初始」液态玻璃 —— 弹簧物理（v1.5.0 · 玻璃游乐场移植版）
 * ============================================================
 * 出处与作者（法律与诚意声明，勿删）：
 *   移植自 liquid-glass-webgl（「玻璃游乐场」）
 *     仓库：https://github.com/martin65536/liquid-glass-webgl （Apache-2.0）
 *     作者：martin65536
 *   其弹簧原型为 AndroidJetpack Compose 弹簧 specs， faithful 移植自
 *   Kyant0/AndroidLiquidGlass（https://github.com/Kyant0/AndroidLiquidGlass，
 *   Apache-2.0，作者 Kyant0）的 DampedDragAnimation.kt。
 *
 * 阻尼弹簧 ODE 闭式解：m·ẍ + c·ẋ + k·(x − target) = 0
 *   欠阻尼（ζ<1）：带回弹 —— 按压缩放、拖拽速度
 *   临界阻尼（ζ=1）：平滑无过冲 —— 指示器滑动、按压进度
 * ============================================================ */

/** 闭式欠阻尼弹簧单步（ζ 与 ωₙ 自定义） */
export function springStepUnderdamped(
  current: number,
  velocity: number,
  target: number,
  dt: number,
  omegaN: number,
  dampingRatio: number
): { current: number; velocity: number } {
  const x0 = current - target;
  const v0 = velocity;
  const omegaD = omegaN * Math.sqrt(1 - dampingRatio * dampingRatio);
  const decay = Math.exp(-dampingRatio * omegaN * dt);
  const cosWd = Math.cos(omegaD * dt);
  const sinWd = Math.sin(omegaD * dt);
  const offset =
    x0 * decay * cosWd +
    ((v0 + dampingRatio * omegaN * x0) / omegaD) * decay * sinWd;
  const b0 = (v0 + dampingRatio * omegaN * x0) / omegaD;
  const newVel =
    -dampingRatio * omegaN * offset +
    decay * (-x0 * omegaD * sinWd + b0 * omegaD * cosWd);
  return { current: target + offset, velocity: newVel };
}

/** 闭式临界阻尼弹簧单步（ζ=1，无过冲） */
export function springStepCritical(
  current: number,
  velocity: number,
  target: number,
  dt: number,
  omegaN: number
): { current: number; velocity: number } {
  const x0 = current - target;
  const v0 = velocity;
  const decay = Math.exp(-omegaN * dt);
  const offset = x0 * decay + (v0 + omegaN * x0) * dt * decay;
  const newVel =
    -omegaN * x0 * decay + (v0 + omegaN * x0) * (decay - omegaN * dt * decay);
  return { current: target + offset, velocity: newVel };
}

/* ---------- 弹簧常量（Kotlin spring(stiffness, damping) → ωₙ=√k） ---------- */

/** 按压进度/指示器滑动：spring(1f, 1000f) 临界阻尼（DampedDragAnimation.kt） */
export const PRESS_OMEGA_N = Math.sqrt(1000);

/** 底栏指示器缩放 X：spring(0.6f, 250f) 欠阻尼（回弹更明显） */
export const SCALE_X_OMEGA_N = Math.sqrt(250);
export const SCALE_X_DAMPING = 0.6;

/** 底栏指示器缩放 Y：spring(0.7f, 250f) 欠阻尼 */
export const SCALE_Y_OMEGA_N = Math.sqrt(250);
export const SCALE_Y_DAMPING = 0.7;

/** 拖拽速度：spring(0.5f, 300f) 欠阻尼 */
export const VELOCITY_OMEGA_N = Math.sqrt(300);
export const VELOCITY_DAMPING = 0.5;

/** 静止阈值：位移与速度都低于此判稳（<0.3% 量程，视觉不可感知） */
export const SPRING_THRESHOLD = 0.003;

/* ---------- 速度追踪器 ----------
 * 忠实移植 Compose androidx.compose.ui.input.pointer.util.VelocityTracker
 * （经游乐场 renderer/velocity-tracker.ts 转译）：环形缓冲 + 最近 100ms
 * 最小二乘直线拟合求斜率 —— 比两点差分平滑得多，无尖刺。 */
const MAX_SAMPLES = 20;

interface VSample {
  t: number;
  p: number;
}

export class VelocityTracker1D {
  private samples: VSample[] = [];

  resetTracking() {
    this.samples.length = 0;
  }

  addPosition(timeMillis: number, position: number) {
    this.samples.push({ t: timeMillis, p: position });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  /** 最近 windowMs 内样本的最小二乘拟合速度（单位/秒） */
  calculateVelocity(windowMs = 100): number {
    const samples = this.samples;
    if (samples.length < 2) return 0;
    const now = samples[samples.length - 1].t;
    const cutoff = now - windowMs;
    let n = 0;
    let sumT = 0;
    let sumP = 0;
    let sumTT = 0;
    let sumTP = 0;
    for (let i = samples.length - 1; i >= 0; i--) {
      const s = samples[i];
      if (s.t < cutoff) break;
      const tt = (s.t - now) / 1000;
      sumT += tt;
      sumP += s.p;
      sumTT += tt * tt;
      sumTP += tt * s.p;
      n++;
    }
    if (n < 2) return 0;
    const denom = n * sumTT - sumT * sumT;
    if (Math.abs(denom) < 1e-9) return 0;
    return (n * sumTP - sumT * sumP) / denom;
  }
}
