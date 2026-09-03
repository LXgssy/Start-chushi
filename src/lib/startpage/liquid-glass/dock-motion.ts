/* ============================================================
 * 「初始」底部标签栏动效（v1.5.0 · 玻璃游乐场移植版）
 * ============================================================
 * 出处与作者（法律与诚意声明，勿删）：
 *   动效物理忠实移植自 liquid-glass-webgl（「玻璃游乐场」）
 *     仓库：https://github.com/martin65536/liquid-glass-webgl （Apache-2.0）
 *     作者：martin65536
 *   其 renderer/methods-tabs.ts + methods-animation.ts +
 *   methods-render-glass-transform.ts 忠实移植自
 *   Kyant0/AndroidLiquidGlass（https://github.com/Kyant0/AndroidLiquidGlass，
 *   Apache-2.0，作者 Kyant0）的 LiquidBottomTabs.kt + DampedDragAnimation.kt。
 *
 * 物理体系（DampedDragAnimation.kt 移植律）：
 *   - 指示器滑动 fraction：临界阻尼 spring(1f, 1000f)，无过冲；
 *   - 按压 pressProgress：临界阻尼 spring(1f, 1000f)；
 *   - 指示器缩放 scaleX/scaleY：欠阻尼 spring(0.6f/0.7f, 250f)，回弹；
 *     按下目标 = 78/56 ≈ 1.393（TAB_PRESSED_SCALE）；
 *   - 速度 velocity：欠阻尼 spring(0.5f, 300f) 衰减向 targetVelocity；
 *     拖拽中 VelocityTracker1D 逐帧喂样；
 *   - 速度拉伸（divisor 10，非开关的 50）：
 *       scaleX /= 1 − clamp(velocity/10×0.75, ±0.2)
 *       scaleY ×= 1 − clamp(velocity/10×0.25, ±0.2)
 *   - panelOffset = 4dp × sign × EaseOut(|fraction|)，整行随手指微移；
 *   - 容器缩放 = lerp(1, 1 + 16dp/容器宽, pressProgress)；
 *   - 标签内容缩放 = lerp(1, 1.2, pressProgress)（围绕容器中心）；
 *   - 松手：四舍五入吸附最近 tab、动量丢弃（press() 重置追踪器律）、
 *     panelOffset 弹回 0；fraction 稳定后按压自动释放。
 * ============================================================ */

import {
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

/** 78/56 —— LiquidBottomTabs.kt 指示器按压放大比 */
const TAB_PRESSED_SCALE = 78 / 56;
/** 容器按压缩放增益：16dp / 容器宽 */
const CONTAINER_PRESS_DP = 16;
/** panelOffset 幅度：4dp × EaseOut */
const PANEL_OFFSET_DP = 4;

/** 指示器当前渲染状态（Dock 每帧读取应用 transform） */
export interface TabIndicatorFrame {
  /** 滑动进度（浮点 tab 序号，0..count-1） */
  fraction: number;
  /** 指示器缩放（已含速度拉伸） */
  scaleX: number;
  scaleY: number;
  /** 整行随拖微移 px */
  panelOffset: number;
  /** 按压进度 0..1（容器/内容缩放与白晕共用） */
  press: number;
}

/** 目标 slot 几何提供者：Dock 每帧量一次各按钮 rect（宽随内容可变） */
export interface SlotRect {
  x: number;
  w: number;
}

export class TabIndicatorMotion {
  private fraction = 0;
  private fractionVel = 0;
  private targetFraction = 0;
  private press = 0;
  private pressVel = 0;
  private targetPress = 0;
  private scaleX = 1;
  private scaleXVel = 0;
  private targetScaleX = 1;
  private scaleY = 1;
  private scaleYVel = 0;
  private targetScaleY = 1;
  private velocity = 0;
  private velocityVel = 0;
  private targetVelocity = 0;
  private panelOffset = 0;
  private targetPanelOffset = 0;
  private isDragging = false;
  private dragStartIndex = 0;
  private tracker = new VelocityTracker1D();
  private raf = 0;
  private lastT = 0;
  private count = 1;
  private slots: SlotRect[] = [];

  /** 变化回调（有动画帧时触发，Dock 据此写 DOM transform） */
  onUpdate: ((f: TabIndicatorFrame) => void) | null = null;
  /** 选中索引变化回调（拖拽吸附后同步 React 状态） */
  onSelect: ((index: number) => void) | null = null;

  /** 更新 slot 几何（Dock 布局变化时调用；x 为相对 dock 内容区起点） */
  setSlots(slots: SlotRect[], count: number) {
    this.slots = slots;
    this.count = Math.max(1, count);
  }

  /** 当前选中索引（取整吸附值） */
  get selected(): number {
    return Math.max(0, Math.min(this.count - 1, Math.round(this.targetFraction)));
  }

  /** 点按切换（无速度 → 不拉伸；触发一次按压脉冲） */
  select(index: number) {
    index = Math.max(0, Math.min(this.count - 1, index));
    if (this.isDragging) return;
    if (this.targetFraction === index && this.targetPress === 0) {
      /* 重复点按当前项也要有按压反馈 */
      this.pulse();
      return;
    }
    this.targetFraction = index;
    /* DampedDragAnimation.animateToValue 律：点按无速度，不拉伸 */
    this.trackVelocityAfterRelease(false);
    this.pulse();
  }

  private trackVelocityAfterRelease(on: boolean) {
    if (!on) {
      this.targetVelocity = 0;
      this.velocityVel = 0;
    }
  }

  /** 按压脉冲：按下 → 稳定后自动释放（methods-animation 自释放律） */
  private pulse() {
    this.targetPress = 1;
    this.targetScaleX = TAB_PRESSED_SCALE;
    this.targetScaleY = TAB_PRESSED_SCALE;
    this.tracker.resetTracking();
    this.velocity = 0;
    this.velocityVel = 0;
    this.start();
  }

  /* ---------- 按压保持（游乐场律：按住任意 tab，容器/内容/指示器同步胀） ---------- */
  private holdPress = false;

  /** 手指按住 tab（未拖动）：按压进度拉满，fraction 不动 */
  hold() {
    if (this.isDragging) return;
    this.holdPress = true;
    this.targetPress = 1;
    this.targetScaleX = TAB_PRESSED_SCALE;
    this.targetScaleY = TAB_PRESSED_SCALE;
    this.start();
  }

  /** 手指松开（未发生拖拽）：按压回落（拖拽路径由自释放接管） */
  unhold() {
    if (!this.holdPress) return;
    this.holdPress = false;
    if (this.isDragging) return;
    this.targetPress = 0;
    this.targetScaleX = 1;
    this.targetScaleY = 1;
    this.start();
  }

  /* ---------- 拖拽（methods-tabs.ts 移植） ---------- */

  beginDrag(startIndex: number, pointerX: number) {
    this.isDragging = true;
    this.holdPress = false;
    this.dragStartIndex = startIndex;
    this.targetFraction = startIndex;
    this.targetPress = 1;
    this.targetScaleX = TAB_PRESSED_SCALE;
    this.targetScaleY = TAB_PRESSED_SCALE;
    this.tracker.resetTracking();
    this.tracker.addPosition(performance.now(), startIndex);
    this.targetVelocity = 0;
    this.velocity = 0;
    this.velocityVel = 0;
    void pointerX;
    this.start();
  }

  drag(currentX: number, startX: number, tabWidth: number) {
    if (!this.isDragging) return;
    const delta = (currentX - startX) / Math.max(1, tabWidth);
    this.targetFraction = Math.max(
      0,
      Math.min(this.count - 1, this.dragStartIndex + delta)
    );
    /* panelOffset = 4dp × sign × EaseOut(|fraction|)（Compose EaseOut 二次） */
    const maxWidth = Math.max(1, tabWidth * this.count);
    const offsetFraction = Math.max(-1, Math.min(1, (currentX - startX) / maxWidth));
    const easeOut = 1 - Math.pow(1 - Math.abs(offsetFraction), 2);
    this.targetPanelOffset = PANEL_OFFSET_DP * Math.sign(offsetFraction) * easeOut;
    this.start();
  }

  endDrag(): number {
    if (!this.isDragging) return this.selected;
    this.isDragging = false;
    const final = Math.max(0, Math.min(this.count - 1, Math.round(this.targetFraction)));
    this.targetFraction = final;
    /* press() 重置追踪器律：拖拽动量在松手时丢弃（velocity 弹簧回落 0） */
    this.tracker.resetTracking();
    this.trackVelocityAfterRelease(false);
    this.targetVelocity = 0;
    this.targetPanelOffset = 0;
    /* 按压不在此释放——fraction 稳定后自释放（原实现同） */
    this.start();
    return final;
  }

  /** 强制复位（拖拽中断兜底：pointer capture 丢失/模式切换/卸载）。
   *  v1.5.0 实证：鼠标拖出 nav 外松手时 nav 收不到 pointerup，
   *  isDragging 永久卡 true → 自释放被阻断 → 指示器「概率不会变小」。 */
  cancel() {
    this.isDragging = false;
    this.holdPress = false;
    this.targetPress = 0;
    this.targetScaleX = 1;
    this.targetScaleY = 1;
    this.targetPanelOffset = 0;
    this.targetVelocity = 0;
    this.velocity = 0;
    this.velocityVel = 0;
    this.tracker.resetTracking();
    this.start();
  }

  /* ---------- 渲染循环（闭式弹簧逐帧推进） ---------- */

  private start() {
    if (this.raf) return;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.step);
  }

  private step = (t: number) => {
    this.raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (t - this.lastT) / 1000));
    this.lastT = t;
    let animating = false;

    /* fraction：临界阻尼 spring(1f, 1000f) */
    if (
      Math.abs(this.targetFraction - this.fraction) > SPRING_THRESHOLD ||
      Math.abs(this.fractionVel) > SPRING_THRESHOLD
    ) {
      const r = springStepCritical(this.fraction, this.fractionVel, this.targetFraction, dt, PRESS_OMEGA_N);
      this.fraction = r.current;
      this.fractionVel = r.velocity;
      animating = true;
    } else {
      this.fraction = this.targetFraction;
      this.fractionVel = 0;
    }

    /* press：临界阻尼 spring(1f, 1000f) + 稳定自释放（按住期间不释放） */
    if (
      this.targetPress === 1 &&
      !this.isDragging &&
      !this.holdPress &&
      Math.abs(this.targetFraction - this.fraction) < 0.08
    ) {
      this.targetPress = 0;
      this.targetScaleX = 1;
      this.targetScaleY = 1;
    }
    if (
      Math.abs(this.targetPress - this.press) > SPRING_THRESHOLD ||
      Math.abs(this.pressVel) > SPRING_THRESHOLD
    ) {
      const r = springStepCritical(this.press, this.pressVel, this.targetPress, dt, PRESS_OMEGA_N);
      this.press = r.current;
      this.pressVel = r.velocity;
      animating = true;
    } else {
      this.press = this.targetPress;
      this.pressVel = 0;
    }

    /* scaleX / scaleY：欠阻尼 spring(0.6f/0.7f, 250f) */
    if (
      Math.abs(this.targetScaleX - this.scaleX) > SPRING_THRESHOLD ||
      Math.abs(this.scaleXVel) > SPRING_THRESHOLD
    ) {
      const r = springStepUnderdamped(this.scaleX, this.scaleXVel, this.targetScaleX, dt, SCALE_X_OMEGA_N, SCALE_X_DAMPING);
      this.scaleX = r.current;
      this.scaleXVel = r.velocity;
      animating = true;
    } else {
      this.scaleX = this.targetScaleX;
      this.scaleXVel = 0;
    }
    if (
      Math.abs(this.targetScaleY - this.scaleY) > SPRING_THRESHOLD ||
      Math.abs(this.scaleYVel) > SPRING_THRESHOLD
    ) {
      const r = springStepUnderdamped(this.scaleY, this.scaleYVel, this.targetScaleY, dt, SCALE_Y_OMEGA_N, SCALE_Y_DAMPING);
      this.scaleY = r.current;
      this.scaleYVel = r.velocity;
      animating = true;
    } else {
      this.scaleY = this.targetScaleY;
      this.scaleYVel = 0;
    }

    /* velocity：拖拽中逐帧喂追踪器；弹簧向 targetVelocity 衰减 */
    if (this.isDragging) {
      this.tracker.addPosition(t, this.targetFraction);
      const v = this.tracker.calculateVelocity();
      this.targetVelocity = Math.max(-30, Math.min(30, v));
    }
    if (
      Math.abs(this.targetVelocity - this.velocity) > SPRING_THRESHOLD ||
      Math.abs(this.velocityVel) > SPRING_THRESHOLD
    ) {
      const r = springStepUnderdamped(this.velocity, this.velocityVel, this.targetVelocity, dt, VELOCITY_OMEGA_N, VELOCITY_DAMPING);
      this.velocity = r.current;
      this.velocityVel = r.velocity;
      animating = true;
    } else {
      this.velocity = this.targetVelocity;
      this.velocityVel = 0;
    }

    /* panelOffset：临界阻尼回 0 */
    if (Math.abs(this.targetPanelOffset - this.panelOffset) > 0.01) {
      const r = springStepCritical(this.panelOffset, 0, this.targetPanelOffset, dt, PRESS_OMEGA_N);
      this.panelOffset = r.current;
      animating = true;
    } else {
      this.panelOffset = this.targetPanelOffset;
    }

    if (animating && this.onUpdate) {
      this.emitFrame(true);
      this.raf = requestAnimationFrame(this.step);
    } else {
      /* 稳定：若吸附索引变化，通知 React */
      if (this.onSelect) {
        const sel = this.selected;
        if (sel !== this.lastNotified) {
          this.lastNotified = sel;
          this.onSelect(sel);
        }
      }
      this.emitFrame(false);
    }
  };

  /** 发射当前帧（stretch：速度拉伸 divisor 10，transform 律移植） */
  private emitFrame(animating: boolean) {
    if (!this.onUpdate) return;
    const vel = this.velocity / 10;
    const velX = Math.max(-0.2, Math.min(0.2, vel * 0.75));
    const velY = Math.max(-0.2, Math.min(0.2, vel * 0.25));
    this.onUpdate({
      fraction: this.fraction,
      scaleX: animating ? this.scaleX / (1 - velX) : this.scaleX,
      scaleY: animating ? this.scaleY * (1 - velY) : this.scaleY,
      panelOffset: this.panelOffset,
      press: Math.max(0, Math.min(1, this.press)),
    });
  }

  /** 立即发射一帧当前状态（无动画启动）：初始挂载/槽位几何重测时对齐胶囊
   *  位置——常显指示器若不初对齐，胶囊永远零宽不可见 */
  emitNow() {
    this.emitFrame(false);
  }

  private lastNotified = 0;

  /** 停止动画（卸载时调用） */
  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onUpdate = null;
    this.onSelect = null;
  }
}

/** 由浮动槽位几何 + 浮点槽位序号计算指示器 x/width（dock 槽宽不等宽的推广）。
 *  fraction 的整数部分 = 起始槽，小数部分向下一槽线性插值。 */
export function interpolateSlot(
  slots: SlotRect[],
  fraction: number
): { x: number; w: number } | null {
  if (!slots.length) return null;
  const i = Math.max(0, Math.min(slots.length - 1, Math.floor(fraction)));
  const j = Math.min(slots.length - 1, i + 1);
  const t = Math.max(0, Math.min(1, fraction - i));
  const a = slots[i];
  const b = slots[j];
  return { x: a.x + (b.x - a.x) * t, w: a.w + (b.w - a.w) * t };
}

/** LiquidButton 按压动效（v1.5.0 按钮 · 游乐场移植）。
 *  scale = 1 + (4/48)×p；平移 = maxOffset×tanh(0.05×d/maxOffset)；
 *  变换经回调应用到按钮 DOM；拖拽位移用弹簧回落（methods-animation dragX/Y 律）。 */
export class LiquidButtonPress {
  private p = 0;
  private pVel = 0;
  private targetP = 0;
  private dx = 0;
  private dxVel = 0;
  private targetDx = 0;
  private dy = 0;
  private dyVel = 0;
  private targetDy = 0;
  private startX = 0;
  private startY = 0;
  private raf = 0;
  private lastT = 0;
  private active = false;
  /** 回调：scale、translateX、translateY、按压进度 0..1 */
  onUpdate: ((v: { scale: number; tx: number; ty: number; press: number }) => void) | null =
    null;

  press(x: number, y: number) {
    this.startX = x;
    this.startY = y;
    this.targetDx = 0;
    this.targetDy = 0;
    this.dx = 0;
    this.dy = 0;
    this.dxVel = 0;
    this.dyVel = 0;
    this.targetP = 1;
    this.active = true;
    this.start();
  }

  move(x: number, y: number) {
    if (!this.active) return;
    this.targetDx = x - this.startX;
    this.targetDy = y - this.startY;
    this.start();
  }

  release() {
    if (!this.active) return;
    this.active = false;
    this.targetP = 0;
    this.targetDx = 0;
    this.targetDy = 0;
    this.start();
  }

  private start() {
    if (this.raf) return;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.step);
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onUpdate = null;
  }

  private step = (t: number) => {
    this.raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (t - this.lastT) / 1000));
    this.lastT = t;
    let animating = false;

    if (Math.abs(this.targetP - this.p) > SPRING_THRESHOLD || Math.abs(this.pVel) > SPRING_THRESHOLD) {
      const r = springStepCritical(this.p, this.pVel, this.targetP, dt, PRESS_OMEGA_N);
      this.p = r.current;
      this.pVel = r.velocity;
      animating = true;
    } else {
      this.p = this.targetP;
      this.pVel = 0;
    }
    if (Math.abs(this.targetDx - this.dx) > 0.01 || Math.abs(this.dxVel) > 0.01) {
      const r = springStepUnderdamped(this.dx, this.dxVel, this.targetDx, dt, VELOCITY_OMEGA_N, VELOCITY_DAMPING);
      this.dx = r.current;
      this.dxVel = r.velocity;
      animating = true;
    } else {
      this.dx = this.targetDx;
      this.dxVel = 0;
    }
    if (Math.abs(this.targetDy - this.dy) > 0.01 || Math.abs(this.dyVel) > 0.01) {
      const r = springStepUnderdamped(this.dy, this.dyVel, this.targetDy, dt, VELOCITY_OMEGA_N, VELOCITY_DAMPING);
      this.dy = r.current;
      this.dyVel = r.velocity;
      animating = true;
    } else {
      this.dy = this.targetDy;
      this.dyVel = 0;
    }

    if (animating || this.p > SPRING_THRESHOLD) {
      this.emit();
      this.raf = requestAnimationFrame(this.step);
    } else {
      this.emit();
    }
  };

  private emit() {
    if (!this.onUpdate) return;
    /* LiquidButton.kt layerBlock 移植：scale 1+4/48·p；
       平移 = maxOffset×tanh(0.05×d/maxOffset)，maxOffset 取按钮短边近似 36px */
    const scale = 1 + (4 / 48) * this.p;
    const maxOffset = 36;
    const tx = maxOffset * Math.tanh((0.05 * this.dx) / maxOffset);
    const ty = maxOffset * Math.tanh((0.05 * this.dy) / maxOffset);
    this.onUpdate({ scale, tx, ty, press: Math.max(0, Math.min(1, this.p)) });
  }
}

/* ============================================================
 * 全局按钮按压控制器（v1.6.0 · 玻璃模式专用）
 * ============================================================
 * 「移植覆盖所有按钮」律：液态玻璃启用时，全文档 button / a[href] /
 * [role=button] 一律获得 LiquidButton 按压动效（事件委托 + Weak 表，
 * 免逐组件接线，预设动态插入的 DOM 同样覆盖）；
 * 非玻璃模式 setEnabled(false) 完全静默（新动效只给玻璃用）。
 * 底栏 tab 按钮豁免（data-lg-tab）：它们走指示器组按压（1.2× 内容缩放，
 * LiquidBottomTabs 律），不再叠自身按钮缩放（v1.5.0 双重放大病根）。
 * ============================================================ */

const INTERACTIVE_SEL = "button, [role='button'], a[href], summary";

export class LiquidButtonGlobalController {
  private on = false;
  private presses = new Map<HTMLElement, LiquidButtonPress>();
  private pointerEl = new Map<number, HTMLElement>();

  private ensure(el: HTMLElement): LiquidButtonPress {
    let lp = this.presses.get(el);
    if (!lp) {
      lp = new LiquidButtonPress();
      lp.onUpdate = ({ scale, tx, ty, press }) => {
        if (!el.isConnected) return;
        if (scale <= 1.001 && Math.abs(tx) < 0.05 && Math.abs(ty) < 0.05 && press < 0.004) {
          /* 落定：清内联样式，交还 hover/入场动画（容差清零律——
            闭式弹簧末帧未必恰好 =1，逐帧等精确 1 会残留 data-lg-press） */
          el.style.removeProperty("transform");
          el.style.removeProperty("--press-p");
          el.removeAttribute("data-lg-press");
        } else {
          el.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale.toFixed(4)})`;
          el.style.setProperty("--press-p", press.toFixed(3));
          el.setAttribute("data-lg-press", "1");
        }
      };
      this.presses.set(el, lp);
    }
    return lp;
  }

  private glow(el: HTMLElement, e: PointerEvent) {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--press-x", `${(((e.clientX - r.left) / Math.max(1, r.width)) * 100).toFixed(1)}%`);
    el.style.setProperty("--press-y", `${(((e.clientY - r.top) / Math.max(1, r.height)) * 100).toFixed(1)}%`);
  }

  private down = (e: PointerEvent) => {
    if (!this.on || e.button !== 0) return;
    const target = e.target as Element | null;
    if (!target || typeof target.closest !== "function") return;
    const el = target.closest(INTERACTIVE_SEL) as HTMLElement | null;
    if (!el || el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return;
    if (el.isContentEditable) return;
    /* tab 按钮走指示器组按压；标记段（编辑模式磁贴）不叠按压 */
    if (el.closest("[data-lg-tab],[data-no-lg-press]")) return;
    const lp = this.ensure(el);
    this.pointerEl.set(e.pointerId, el);
    this.glow(el, e);
    lp.press(e.clientX, e.clientY);
  };

  private move = (e: PointerEvent) => {
    if (!this.on) return;
    const el = this.pointerEl.get(e.pointerId);
    if (!el) return;
    if (!(e.buttons & 1)) return;
    this.glow(el, e);
    this.presses.get(el)?.move(e.clientX, e.clientY);
  };

  private up = (e: PointerEvent) => {
    const el = this.pointerEl.get(e.pointerId);
    if (!el) return;
    this.pointerEl.delete(e.pointerId);
    const lp = this.presses.get(el);
    if (lp) {
      lp.release();
      if (!el.isConnected) {
        lp.dispose();
        this.presses.delete(el);
      }
    }
  };

  /** nav 级拖拽接管时取消进行中的按压（拖拽优先律） */
  cancelAll() {
    for (const lp of this.presses.values()) lp.release();
    this.pointerEl.clear();
  }

  /** 玻璃模式开关（非玻璃模式零监听零样式，新动效只给玻璃用） */
  setEnabled(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    if (on) {
      document.addEventListener("pointerdown", this.down, true);
      document.addEventListener("pointermove", this.move, true);
      document.addEventListener("pointerup", this.up, true);
      document.addEventListener("pointercancel", this.up, true);
    } else {
      document.removeEventListener("pointerdown", this.down, true);
      document.removeEventListener("pointermove", this.move, true);
      document.removeEventListener("pointerup", this.up, true);
      document.removeEventListener("pointercancel", this.up, true);
      this.cancelAll();
      /* 清退所有残留：内联 transform/白晕归零 */
      for (const [el, lp] of [...this.presses]) {
        lp.dispose();
        if (el.isConnected) {
          el.style.removeProperty("transform");
          el.style.removeProperty("--press-p");
          el.removeAttribute("data-lg-press");
        }
      }
      this.presses.clear();
    }
  }
}

/** 全局单例（page.tsx 按液态玻璃启停接线） */
export const liquidButtons = new LiquidButtonGlobalController();

