/* ============================================================
 * 「初始」液态玻璃引擎（v1.5.0 · 玻璃游乐场移植版 · 宿主内建）
 * ============================================================
 * 出处与作者（法律与诚意声明，勿删）：
 *   光学模型、参数体系与动效物理移植自开源项目 liquid-glass-webgl
 *   （「玻璃游乐场」，浏览器版 iOS 液态玻璃）：
 *     仓库：https://github.com/martin65536/liquid-glass-webgl
 *     作者：martin65536（Z.ai Agent 辅助开发）
 *     许可：Apache License 2.0
 *   原型：Kyant0/AndroidLiquidGlass
 *     仓库：https://github.com/Kyant0/AndroidLiquidGlass
 *     作者：Kyant0
 *     许可：Apache License 2.0
 *
 * 架构（v1.5.0 定稿，替代 v1.4.0 SVG 位移贴图引擎）：
 *   - 引擎内建于宿主可见文档（rAF 实时渲染律，v1.4.0 起不变）；
 *   - 渲染后端换成游乐场的 WebGL 光学管线：circleMap 圆弧透镜剖面
 *     × SDF 梯度 × 负量内采样（凸透镜放大）× 7 通道色散 × 16-tap
 *     高斯霜化 × colorControls × 预乘 alpha；
 *   - **单 GL 上下文**：引擎持有唯一隐藏 WebGL 画布（浏览器上下文
 *     数量上限免疫），逐元素把视口渲染进该画布，经 createImageBitmap
 *     **串行队列**（v1.3.0 实证律：并发快照会读 Resize 后的画布）搬运到
 *     每元素 2d 叠层画布（z-index:-1，DOM 内容天然在上）；
 *   - 背景 = 真实壁纸逐帧采样：img[data-wallpaper] 纹理 + kenburns
 *     逆变换（computed transform 逆解）+ photo-scrim 压暗层——玻璃永远
 *     折射「此刻壁纸实际显示的那块世界」，漂移/换装全程跟随；
 *   - 覆盖注册表沿 v1.4.0（core 四区 + full 含天气芯片），全屏幕布豁免；
 *   - 非 photo 模式 / WebGL 不可用 → CSS 磨砂降级（data-lg-fb）。
 *
 * 参数体系 = 玻璃游乐场（build-glass-playground.ts）：
 *   refractionHeight / refractionAmount / blur / chromaticAberration /
 *   saturation —— 预设包经 chushi.glass.enable/patch 传入并在设置面板
 *   热调（游乐场五滑杆）；角色默认值逐项对照游乐场各页参数（见 ROLES）。
 * ============================================================ */

import {
  elementFragmentSource,
  rimHighlightFragmentSource,
  vertexSource,
} from "./shader";

/** 引擎配置（chushi.glass.enable/patch 白名单字段 · 游乐场语义） */
export interface GlassConfig {
  /** 折射带高 px（0–48，游乐场 refractionHeightFrac×短边/2 语义取绝对 px） */
  refractionHeight: number;
  /** 折射量 px（0–48，引擎内部取负 = 凸透镜放大，游乐场/Kyant 默认 24） */
  refractionAmount: number;
  /** 霜化模糊半径 px（0–32，游乐场 blurRadiusDp） */
  blur: number;
  /** 色散强度 0–1（游乐场 chromaticAberration；>0 即开 7 通道 ROYGBV） */
  chromatic: number;
  /** 饱和度 %（100–260，游乐场 vibrancy 1.5 = 150%） */
  saturation: number;
  /** 透亮 %（85–115，0 偏移，游乐场 brightness） */
  brightness: number;
  /** 边缘高光（游乐场 HighlightModifier 描边） */
  highlight: boolean;
  /** 覆盖范围：core = 基础四区；full = 全部玻璃面（含天气芯片） */
  coverage: "core" | "full";
}

export type GlassPatch = Partial<GlassConfig>;

const GLASS_DEFAULTS: GlassConfig = {
  refractionHeight: 24,
  refractionAmount: 24,
  blur: 8,
  chromatic: 0,
  saturation: 150,
  brightness: 100,
  highlight: true,
  coverage: "full",
};

/** 玻璃角色（逐项对照游乐场页面参数；cfg 全局覆盖 height/amount/blur/chromatic/saturation） */
interface RoleSpec {
  /** 角色内默认（cfg 未覆盖前） */
  height: number;
  amount: number;
  blur: number;
  sat: number;
  /** 表面色（浅/深主题）；a=0 → 无表面（show wallpaper 纯折射） */
  surfaceLight: [number, number, number, number];
  surfaceDark: [number, number, number, number];
  /** 高光模式：0=Default（方向白光）2=Plain（均匀描边，游乐场面板/广场） */
  highlightMode: 0 | 1 | 2;
  highlightAlpha: number;
  /** 深度效应（折射叠加向心分量，游乐场 depthEffect） */
  depth: boolean;
  /** 强制色散（底栏指示器在游乐场 chromaticAberration: true） */
  forceChromatic?: boolean;
}

/* 游乐场参数对照：
 *   dock 容器 ← LiquidBottomTabs 容器 Row：lens(24,−24) blur 8 vibrancy surface(tabsContainer) highlight .5 depth
 *   dock 指示器 ← LiquidBottomTabs 指示器：lens(10,−14) blur 0 无表面 highlight .5 CA:true
 *   search/按钮 ← LiquidButton（GLASS_PARAMS）：lens(12,−24) blur 2 vibrancy surface(buttonSurface) highlight .5
 *   panel/card ← GlassPlayground 控制板：lens(16,−32) blur 4 vibrancy surface(tabsContainer) highlight Plain .38
 *   chip ← 次要玻璃面：lens(12,−24) blur 2 无表面 highlight .4 */
const ROLES: Record<string, RoleSpec> = {
  dock: {
    height: 24,
    amount: 24,
    blur: 8,
    sat: 1.5,
    surfaceLight: [0.98, 0.98, 0.98, 0.4],
    surfaceDark: [0.071, 0.071, 0.094, 0.4],
    highlightMode: 0,
    highlightAlpha: 0.5,
    depth: true,
  },
  "dock-indicator": {
    height: 10,
    amount: 14,
    blur: 0,
    sat: 1,
    surfaceLight: [0, 0, 0, 0],
    surfaceDark: [0, 0, 0, 0],
    highlightMode: 0,
    highlightAlpha: 0.5,
    depth: false,
    forceChromatic: true,
  },
  search: {
    height: 12,
    amount: 24,
    blur: 2,
    sat: 1.5,
    surfaceLight: [1, 1, 1, 0.3],
    surfaceDark: [0.071, 0.071, 0.094, 0.3],
    highlightMode: 0,
    highlightAlpha: 0.5,
    depth: false,
  },
  panel: {
    height: 16,
    amount: 32,
    blur: 4,
    sat: 1.5,
    surfaceLight: [0.98, 0.98, 0.98, 0.4],
    surfaceDark: [0.071, 0.071, 0.094, 0.4],
    highlightMode: 2,
    highlightAlpha: 0.38,
    depth: false,
  },
  card: {
    height: 16,
    amount: 32,
    blur: 4,
    sat: 1.5,
    surfaceLight: [0.98, 0.98, 0.98, 0.4],
    surfaceDark: [0.071, 0.071, 0.094, 0.4],
    highlightMode: 2,
    highlightAlpha: 0.38,
    depth: false,
  },
  chip: {
    height: 12,
    amount: 24,
    blur: 2,
    sat: 1.5,
    surfaceLight: [0, 0, 0, 0],
    surfaceDark: [0, 0, 0, 0],
    highlightMode: 0,
    highlightAlpha: 0.4,
    depth: false,
  },
};

/** 玻璃容器注册表（语义键 → 选择器）。core 四区是产品契约（与 README
 *  「元素钩子表」同步维护）；full 额外覆盖次要玻璃面。 */
const CORE_TARGETS: { key: string; sel: string }[] = [
  { key: "search", sel: ".search-pill" },
  { key: "dock", sel: ".cl-dock" },
  { key: "dock-indicator", sel: ".cl-dock-indicator" },
  { key: "panel", sel: ".cl-panel" },
  { key: "card", sel: ".glass-card" },
];
const FULL_EXTRA: { key: string; sel: string }[] = [{ key: "chip", sel: ".glass-chip" }];

const MAX_LENSED = 24; /* 同屏透镜上限（性能护栏） */
const DPR_CAP = 1.5; /* 叠层画布像素密度上限 */
const GL_DIM_MAX = 2200; /* GL 画布单边上限 px */
const MOTION_MIN_MS = 33; /* 几何变动期重绘最小间隔（≈30fps，折射全程在线） */
const DRIFT_MS = 300; /* 几何稳定期 kenburns 跟随重绘周期 */
/** photo-scrim 压暗层常量（与 globals.css .photo-scrim 同步维护） */
const SCRIM_FLAT = 0.18;
const SCRIM_TOP = 0.34;
const SCRIM_BOTTOM = 0.48;

interface OverlayRec {
  el: HTMLElement;
  role: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sig: string;
  lastDraw: number;
  w: number;
  h: number;
  radius: number;
  scale: [number, number];
  offset: [number, number];
}

/** 沙箱桥传入前对 enable 配置整组校验夹紧（非法字段回默认值） */
export function sanitizeGlassEnable(raw: unknown): GlassConfig {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    refractionHeight: num(p.refractionHeight, GLASS_DEFAULTS.refractionHeight, 0, 48),
    refractionAmount: num(p.refractionAmount, GLASS_DEFAULTS.refractionAmount, 0, 48),
    blur: num(p.blur, GLASS_DEFAULTS.blur, 0, 32),
    chromatic: num(p.chromatic, GLASS_DEFAULTS.chromatic, 0, 1),
    saturation: num(p.saturation, GLASS_DEFAULTS.saturation, 100, 260),
    brightness: num(p.brightness, GLASS_DEFAULTS.brightness, 85, 115),
    highlight: p.highlight !== false,
    coverage: p.coverage === "core" ? "core" : "full",
  };
}

/** patch 只取合法字段（非法/缺失字段不触碰现值） */
export function sanitizeGlassPatch(raw: unknown): GlassPatch {
  if (!raw || typeof raw !== "object") return {};
  const p = raw as Record<string, unknown>;
  const out: GlassPatch = {};
  const num = (v: unknown, min: number, max: number): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
  };
  const rh = num(p.refractionHeight, 0, 48);
  if (rh !== undefined) out.refractionHeight = rh;
  const ra = num(p.refractionAmount, 0, 48);
  if (ra !== undefined) out.refractionAmount = ra;
  const b = num(p.blur, 0, 32);
  if (b !== undefined) out.blur = b;
  const c = num(p.chromatic, 0, 1);
  if (c !== undefined) out.chromatic = c;
  const s = num(p.saturation, 100, 260);
  if (s !== undefined) out.saturation = s;
  const br = num(p.brightness, 85, 115);
  if (br !== undefined) out.brightness = br;
  if (typeof p.highlight === "boolean") out.highlight = p.highlight;
  if (p.coverage === "core" || p.coverage === "full") out.coverage = p.coverage;
  return out;
}

/* ---------- GL 程序封装 ---------- */
interface GLProgram {
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

function buildProgram(gl: WebGLRenderingContext, vs: string, fs: string): GLProgram | null {
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("[lg] shader compile:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const v = compile(gl.VERTEX_SHADER, vs);
  const f = compile(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("[lg] program link:", gl.getProgramInfoLog(prog));
    return null;
  }
  return { prog, u: {} };
}

function uni(p: GLProgram, gl: WebGLRenderingContext, name: string) {
  if (!(name in p.u)) p.u[name] = gl.getUniformLocation(p.prog, name);
  return p.u[name];
}

class LiquidGlassEngine {
  private owner: string | null = null;
  private cfg: GlassConfig = { ...GLASS_DEFAULTS };
  private cfgSig = "";
  private recs = new Map<HTMLElement, OverlayRec>();
  private root: HTMLElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private started = false;
  private raf = 0;

  /* GL */
  private glCanvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private elemProg: GLProgram | null = null;
  private rimProg: GLProgram | null = null;
  private quadBuf: WebGLBuffer | null = null;
  private wpTex: WebGLTexture | null = null;
  private wpW = 0;
  private wpH = 0;
  private wpSrc = "";

  /* 壁纸追踪 */
  private wpImg: HTMLImageElement | null = null;
  private wpScale: [number, number] = [1, 1];
  private wpTranslate: [number, number] = [0, 0];

  /* 串行位图队列（v1.3.0 实证律：快照严格串行） */
  private queue: OverlayRec[] = [];
  private queued = new Set<OverlayRec>();
  private pumping = false;

  /* ---------- 模式订阅（React 侧 lgOn 门控源：新动效只给玻璃用） ---------- */

  private listeners = new Set<() => void>();

  /** 订阅启用状态变化（useSyncExternalStore 用） */
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  /** 液态玻璃是否处于启用态（引擎已 start 且未回收） */
  isOn = (): boolean => this.started;

  private notify() {
    for (const l of [...this.listeners]) l();
  }

  /* ---------- 预设经桥调入 ---------- */

  enable(scriptKey: string, cfg: GlassConfig): { ok: boolean; message?: string } {
    if (this.owner && this.owner !== scriptKey) {
      return { ok: false, message: "液态玻璃已被其他预设启用" };
    }
    const wasOff = !this.started;
    this.owner = scriptKey;
    this.cfg = cfg;
    this.start();
    if (wasOff) this.notify();
    return { ok: true };
  }

  patch(scriptKey: string, partial: GlassPatch): { ok: boolean; message?: string } {
    if (this.owner !== scriptKey) return { ok: false, message: "液态玻璃未由该预设启用" };
    this.cfg = { ...this.cfg, ...partial };
    /* 签名刷新律：observe() 的重绘调度以 cfgSig 为签名分量，
       漏刷 = 设置面板热调不重绘（v1.5.0 验证实录） */
    this.cfgSig = JSON.stringify(this.cfg);
    /* 材质 CSS 携带 cfg（CSS 磨砂体参数/覆盖范围）——热调即刷 */
    this.refreshMaterialCss();
    return { ok: true };
  }

  disable(scriptKey: string) {
    if (this.owner !== scriptKey) return;
    this.teardown();
  }

  /** 沙箱冻结/预设删除：持有者被移除即整体回收 */
  release(scriptKey: string) {
    if (this.owner !== scriptKey) return;
    this.teardown();
  }

  /** 桥关停/页面卸载：无条件回收 */
  stopAll() {
    this.teardown();
  }

  /* ---------- 生命周期 ---------- */

  private start() {
    if (this.started || typeof document === "undefined") return;
    this.started = true;
    this.cfgSig = JSON.stringify(this.cfg);

    this.root = document.createElement("div");
    this.root.id = "chushi-lg-root";
    this.root.setAttribute("aria-hidden", "true");
    this.root.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none";
    this.styleEl = document.createElement("style");
    this.root.appendChild(this.styleEl);
    document.body.appendChild(this.root);
    this.refreshMaterialCss();

    this.initGL();
    this.trackWallpaper();
    /* 调试探针（验证脚本用）：返回引擎内部状态快照 */
    (window as unknown as Record<string, unknown>).__chushiLG = () => ({
      cfg: { ...this.cfg },
      owner: this.owner,
      recs: [...this.recs.values()].map((r) => ({
        role: r.role,
        w: Math.round(r.w),
        h: Math.round(r.h),
        lastDraw: Math.round(r.lastDraw),
        sig: r.sig.slice(0, 60),
      })),
      queued: this.queue.length,
      pumping: this.pumping,
      gl: Boolean(this.gl),
      wpTex: Boolean(this.wpTex),
      wpDbg: this.wpDbg,
      wpW: this.wpW,
      wpH: this.wpH,
      now: Math.round(performance.now()),
    });
    this.raf = requestAnimationFrame(this.tick);
  }

  private teardown() {
    if (!this.started) return;
    this.started = false;
    this.owner = null;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.queue = [];
    this.queued.clear();
    this.pumping = false;
    document.querySelectorAll<HTMLElement>("[data-lg]").forEach((el) => {
      delete el.dataset.lg;
      delete el.dataset.lgRole;
      delete el.dataset.lgFb;
      /* 叠层画布随引擎回收（预设删除 = 视觉完全还原） */
      el.querySelectorAll(":scope > .lg-ov").forEach((c) => c.remove());
    });
    this.recs.clear();
    (window as unknown as Record<string, unknown>).__chushiLG = null;
    this.gl = null;
    this.glCanvas = null;
    this.elemProg = null;
    this.rimProg = null;
    this.wpTex = null;
    this.wpImg = null;
    this.wpSrc = "";
    this.root?.remove();
    this.root = null;
    this.styleEl = null;
    /* 通知 React：玻璃已关（非玻璃模式恢复原动效） */
    this.notify();
  }

  /** 材质 CSS（v1.6.0 · 边缘带混合合成模型）：
   *  WebGL 模式 = CSS backdrop-filter 磨砂体（真实背景：壁纸 + DOM 组件）
   *  + 叠层画布只画边缘折射带（shader band 掩膜）；逐角色表面色按游乐场
   *  各页 surfaceColor 覆盖（tabsContainer 0.4 / buttonSurface 0.3 / 透明）；
   *  降级模式 = 同参数 CSS 磨砂链，DOM 自带背景保留。
   *  cfg 热调经 :root 变量即时生效（patch → refreshMaterialCss）。 */
  private refreshMaterialCss() {
    if (!this.styleEl) return;
    const blur = Math.max(this.cfg.blur, 0);
    const sat = this.cfg.saturation / 100;
    this.styleEl.textContent = [
      /* 磨砂体参数（WebGL/降级共用；降级时 DOM 自带背景在磨砂层之下保留） */
      `:root{--lg-blur:${blur}px;--lg-sat:${sat}}`,
      /* 玻璃体：真实背景磨砂（组件在玻璃后可见可点 —— v1.6.0 主修复）。
         降级模式（data-lg-fb）同样生效，只是无折射带画布 */
      "[data-lg]{backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-sat))!important;-webkit-backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-sat))!important}",
      /* 叠层画布：元素内最底层，折射带边缘在磨砂体之上 */
      "[data-lg]>.lg-ov{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}",
      /* 逐角色表面色（游乐场各页 surfaceColor；组件背景/边框保留） */
      '[data-lg-role="dock"],[data-lg-role="panel"],[data-lg-role="card"]{background:rgba(250,250,250,0.4)!important}',
      'html.dark [data-lg-role="dock"],html.dark [data-lg-role="panel"],html.dark [data-lg-role="card"]{background:rgba(18,18,24,0.4)!important}',
      '[data-lg-role="search"]{background:rgba(255,255,255,0.3)!important}',
      'html.dark [data-lg-role="search"]{background:rgba(18,18,24,0.3)!important}',
      /* 指示器/次要芯片 = 游乐场透明表面（纯折射，见 wallpaper） */
      '[data-lg-role="dock-indicator"],[data-lg-role="chip"]{background:transparent!important}',
      /* 底栏指示器按压层（游乐场 LiquidBottomTabs 指示器：
        rest 暗罩 0.1×(1-p)、内影 8dp×p、外影 Shadow.Default×p、边缘高光×p；
        --press-p 由 TabIndicatorMotion 逐帧写入） */
      ".cl-dock-indicator .cl-ind-dim{position:absolute;inset:0;border-radius:inherit;background:var(--ind-dim,rgba(0,0,0,0.1));opacity:calc(1 - var(--press-p,0));box-shadow:0 10px 28px rgb(0 0 0/calc(var(--press-p,0)*0.12))}",
      '.dark .cl-dock-indicator .cl-ind-dim,html.photo-mode .cl-dock-indicator .cl-ind-dim{--ind-dim:rgba(255,255,255,0.12)}',
      ".cl-dock-indicator .cl-ind-rim{position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px rgb(255 255 255/calc(var(--press-p,0)*0.55)),inset 0 calc(8px*var(--press-p,0)) calc(8px*var(--press-p,0)) rgb(0 0 0/calc(var(--press-p,0)*0.3))}",
    ].join("");
  }

  /* ---------- GL 初始化 ---------- */

  private initGL() {
    try {
      const cv = document.createElement("canvas");
      cv.width = 2;
      cv.height = 2;
      const gl = (cv.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true, // 位图快照读取律（v1.3.0 实证）
        powerPreference: "low-power",
      }) ?? cv.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      if (!gl) return;
      const elem = buildProgram(gl, vertexSource, elementFragmentSource());
      const rim = buildProgram(gl, vertexSource, rimHighlightFragmentSource);
      if (!elem || !rim) return;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );
      this.glCanvas = cv;
      this.gl = gl;
      this.elemProg = elem;
      this.rimProg = rim;
      this.quadBuf = buf;
    } catch {
      /* WebGL 不可用 → CSS 降级 */
    }
  }

  /** 壁纸追踪：img[data-wallpaper] 纹理上传 + src 变更监听 */
  private trackWallpaper() {
    const img = document.querySelector<HTMLImageElement>("img[data-wallpaper]");
    this.wpImg = img;
    this.wpSrc = "";
    if (!img) return;
    if (img.complete && img.naturalWidth) this.uploadWallpaper(img);
    img.addEventListener("load", () => this.uploadWallpaper(img));
    const mo = new MutationObserver(() => {
      /* 换装：等新 src 的 load 事件触发纹理重传 */
      this.wpSrc = "";
    });
    mo.observe(img, { attributes: true, attributeFilter: ["src"] });
  }

  private uploadWallpaper(img: HTMLImageElement) {
    const src = img.currentSrc || img.src;
    if (!src || src === this.wpSrc || !this.gl) return;
    if (!img.complete || !img.naturalWidth) return;
    try {
      const gl = this.gl;
      if (!this.wpTex) this.wpTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.wpTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      this.finishUpload(gl, src, img.naturalWidth, img.naturalHeight);
    } catch {
      /* 跨域污染（SecurityError）：删空纹理（空纹理采样恒黑，宁可先回 CSS 磨砂），
         改走 crossOrigin="anonymous" 的 Image 重载链路（壁纸 CDN 多带 ACAO:*，
         且命中浏览器缓存秒回；blob:/data:/同源图不会走到这里） */
      if (this.wpTex && this.gl) this.gl.deleteTexture(this.wpTex);
      this.wpTex = null;
      this.wpSrc = "";
      this.loadWallpaperViaCors(src);
    }
  }

  private finishUpload(gl: WebGLRenderingContext, src: string, w: number, h: number) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.wpW = w;
    this.wpH = h;
    this.wpSrc = src;
  }

  /** 跨域壁纸的 CORS 取图链路：crossOrigin="anonymous" 的 Image 重载
   *  （不走 fetch：SW cache-first 场景下 fetch 语义不可靠，实测挂起；
   *  crossOrigin Image 命中浏览器缓存，CDN 带 ACAO:* 即干净可上纹理） */
  private wpDbg = "";
  private wpPending: { src: string; img: HTMLImageElement } | null = null;

  private loadWallpaperViaCors(src: string) {
    if (this.wpPending?.src === src) return; /* 同源已在途（tick 每帧会重试） */
    this.wpDbg = "cors-img:" + src.slice(-40);
    const img = new Image();
    img.crossOrigin = "anonymous";
    this.wpPending = { src, img };
    img.onload = () => {
      if (this.wpPending?.img === img) this.wpPending = null;
      const gl = this.gl;
      if (!gl || !this.started || (this.wpImg && (this.wpImg.currentSrc || this.wpImg.src) !== src)) {
        this.wpDbg = "stale";
        return;
      }
      try {
        /* 换新纹理对象（避免继承失败纹理的任何残留状态） */
        if (this.wpTex) gl.deleteTexture(this.wpTex);
        this.wpTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.wpTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        this.finishUpload(gl, src, img.naturalWidth, img.naturalHeight);
        this.wpDbg = "ok:" + img.naturalWidth;
      } catch (e) {
        this.wpDbg = "tex-err:" + String(e).slice(0, 60);
        this.wpTex = null;
      }
    };
    img.onerror = () => {
      if (this.wpPending?.img === img) this.wpPending = null;
      this.wpDbg = "img-err";
      this.wpTex = null;
    };
    img.src = src;
  }

  /** kenburns 逆解：computed transform matrix → scale/translate */
  private readKenburns() {
    const img = this.wpImg;
    if (!img) return;
    const m = getComputedStyle(img).transform;
    if (!m || m === "none") {
      this.wpScale = [1, 1];
      this.wpTranslate = [0, 0];
      return;
    }
    const nums = m.match(/matrix\(([^)]+)\)/);
    if (!nums) return;
    const v = nums[1].split(",").map(Number);
    if (v.length < 6 || v.some((n) => !Number.isFinite(n))) return;
    const [a, b, c, d, e, f] = v;
    const sx = Math.hypot(a, b) || 1;
    const sy = Math.hypot(c, d) || 1;
    this.wpScale = [sx, sy];
    this.wpTranslate = [e, f];
  }

  /* ---------- 渲染循环 ---------- */

  private tick = () => {
    this.raf = 0;
    if (!this.started) return;
    const now = performance.now();
    const dark = document.documentElement.classList.contains("dark");
    const webglOk = Boolean(this.gl && this.wpTex);

    this.readKenburns();
    /* 壁纸自适应：背景模式切到 photo / 壁纸晚挂载时重查（每 ~1s 一次的开销可忽略） */
    if (!this.wpImg || !this.wpImg.isConnected) {
      const img = document.querySelector<HTMLImageElement>("img[data-wallpaper]");
      if (img && img !== this.wpImg) {
        this.wpImg = img;
        this.wpSrc = "";
        img.addEventListener("load", () => this.uploadWallpaper(img));
      }
    }
    if (this.gl && this.wpImg) this.uploadWallpaper(this.wpImg);

    const targets =
      this.cfg.coverage === "core" ? CORE_TARGETS : [...CORE_TARGETS, ...FULL_EXTRA];
    const sel = targets.map((t) => t.sel).join(", ");
    const seen = new Set<Element>();
    let count = 0;
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      if (count >= MAX_LENSED) return;
      const r = el.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      if (w <= 1 || h <= 1) return;
      /* 全屏幕布永不打标（幕布不是玻璃块） */
      if (w >= window.innerWidth - 2 && h >= window.innerHeight - 2) return;
      /* 嵌套玻璃面豁免：玻璃元素内部的 .glass-chip 等小面背景不是壁纸
         （是外层玻璃的表面色），采壁纸会穿帮——保持其自身 CSS 不打标。
         ⚠ 例外：底栏玻璃指示器（.cl-dock-indicator）是 nav 的子元素但
         背景是壁纸（独立折射胶囊，LiquidBottomTabs 律），不可被豁免误杀 */
      const key = targets.find((t) => el.matches(t.sel))?.key ?? "card";
      if (key !== "dock-indicator" && el.parentElement?.closest?.("[data-lg]")) return;
      seen.add(el);
      count += 1;
      this.observe(el, key, r, now, webglOk);
    });
    /* 回收已消失元素（浮层卸载后叠层/标记一并清理） */
    for (const [el, rec] of [...this.recs]) {
      if (!seen.has(el)) {
        rec.canvas.remove();
        this.queued.delete(rec);
        this.recs.delete(el);
      }
    }
    this.raf = requestAnimationFrame(this.tick);
    void dark;
  };

  /** 逐元素几何追踪 + 重绘调度（实时渲染核心：rAF 逐帧 getBoundingClientRect） */
  private observe(
    el: HTMLElement,
    key: string,
    r: DOMRect,
    now: number,
    webglOk: boolean
  ) {
    let rec = this.recs.get(el);
    if (!rec) {
      const canvas = document.createElement("canvas");
      canvas.className = "lg-ov";
      el.dataset.lg = "1";
      el.insertBefore(canvas, el.firstChild);
      rec = {
        el,
        role: key,
        canvas,
        ctx: canvas.getContext("2d") as CanvasRenderingContext2D,
        sig: "",
        lastDraw: 0,
        w: 0,
        h: 0,
        radius: 0,
        scale: [1, 1],
        offset: [r.left, r.top],
      };
      this.recs.set(el, rec);
    }
    rec.role = key;
    el.dataset.lgRole = key;

    if (!webglOk) {
      /* CSS 降级路径：只打标记（磨砂体参数由 :root 变量驱动，
         无折射带画布；DOM 自带背景保留） */
      if (el.dataset.lgFb !== "1") el.dataset.lgFb = "1";
      return;
    }
    if (el.dataset.lgFb) delete el.dataset.lgFb;

    /* 基线 = 布局盒（offsetWidth/Height 不受 transform 影响）；
       视觉 = getBoundingClientRect（含按压/速度拉伸变换）——
       layerScale = 视觉/基线，形状在基线空间计算、输出被缩放（graphicsLayer 律） */
    const layoutW = el.offsetWidth || r.width;
    const layoutH = el.offsetHeight || r.height;
    const sx = layoutW > 0 ? r.width / layoutW : 1;
    const sy = layoutH > 0 ? r.height / layoutH : 1;

    /* 圆角（半短边夹紧）——仅几何变化时读计算样式 */
    const sigGeo = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (rec.sig.split("|")[0] !== sigGeo) {
      const raw = getComputedStyle(el).borderRadius;
      let radius = raw.endsWith("%")
        ? (Math.min(layoutW, layoutH) / 2) * (parseFloat(raw) / 100)
        : parseFloat(raw) || 0;
      if (!Number.isFinite(radius)) radius = 0;
      radius = Math.min(radius, layoutW / 2, layoutH / 2);
      rec.radius = Math.round(radius * 10) / 10;
    }
    rec.w = r.width;
    rec.h = r.height;
    rec.scale = [sx, sy];
    rec.offset = [r.left, r.top];

    const sig = `${sigGeo}|${rec.radius}|${this.cfgSig}|${Math.round(sx * 100)}x${Math.round(sy * 100)}`;
    const moved = sig !== rec.sig;
    if (moved) {
      rec.sig = sig;
      /* 变动期 30fps 节流（折射全程在线，永不下线）；稳定期 kenburns 慢跟随 */
      if (now - rec.lastDraw >= MOTION_MIN_MS) this.enqueue(rec);
    } else if (now - rec.lastDraw >= DRIFT_MS) {
      this.enqueue(rec);
    }
  }

  /* ---------- 串行位图队列 ---------- */

  private enqueue(rec: OverlayRec) {
    if (this.queued.has(rec)) return;
    this.queued.add(rec);
    this.queue.push(rec);
    void this.pump();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const rec = this.queue.shift();
        if (!rec) break;
        this.queued.delete(rec);
        if (!this.started || !this.recs.has(rec.el) || !this.gl || !this.glCanvas) continue;
        this.renderElement(rec);
        const bmp = await createImageBitmap(this.glCanvas);
        if (!this.started || !this.recs.has(rec.el)) {
          bmp.close();
          continue;
        }
        rec.lastDraw = performance.now();
        const cv = rec.canvas;
        const pw = Math.max(1, Math.round(rec.w * this.dpr()));
        const ph = Math.max(1, Math.round(rec.h * this.dpr()));
        if (cv.width !== pw || cv.height !== ph) {
          cv.width = pw;
          cv.height = ph;
        }
        rec.ctx.clearRect(0, 0, cv.width, cv.height);
        rec.ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
        bmp.close();
      }
    } catch {
      /* 位图链路失败：保留旧帧，下轮 sig 重试 */
    } finally {
      this.pumping = false;
    }
  }

  private dpr(): number {
    return Math.min(window.devicePixelRatio || 1, DPR_CAP);
  }

  /** 把单个元素渲染进共享 GL 画布（视口 = 元素视觉尺寸） */
  private renderElement(rec: OverlayRec) {
    const gl = this.gl;
    const cv = this.glCanvas;
    const prog = this.elemProg;
    if (!gl || !cv || !prog || !this.wpTex) return;
    const dpr = this.dpr();
    const cw = Math.min(GL_DIM_MAX, Math.max(1, Math.round(rec.w * dpr)));
    const ch = Math.min(GL_DIM_MAX, Math.max(1, Math.round(rec.h * dpr)));
    if (cv.width !== cw || cv.height !== ch) {
      cv.width = cw;
      cv.height = ch;
    }
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);

    const role = ROLES[rec.role] ?? ROLES.card;
    const cfg = this.cfg;
    const surface = (document.documentElement.classList.contains("dark")
      ? role.surfaceDark
      : role.surfaceLight);
    const height = cfg.refractionHeight;
    const amount = -cfg.refractionAmount; /* 负量内采样 = 凸透镜放大（游乐场 −24dp 律） */
    const blur = cfg.blur;
    const chromatic = role.forceChromatic ? Math.max(0.5, cfg.chromatic) : cfg.chromatic;

    gl.useProgram(prog.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    const loc = gl.getAttribLocation(prog.prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.wpTex);
    gl.uniform1i(uni(prog, gl, "uWallpaper"), 0);
    gl.uniform2f(uni(prog, gl, "uScreenSize"), window.innerWidth, window.innerHeight);
    gl.uniform2f(uni(prog, gl, "uWallpaperSize"), this.wpW || 1, this.wpH || 1);
    gl.uniform2f(uni(prog, gl, "uWpScale"), this.wpScale[0], this.wpScale[1]);
    gl.uniform2f(uni(prog, gl, "uWpTranslate"), this.wpTranslate[0], this.wpTranslate[1]);
    gl.uniform2f(uni(prog, gl, "uScreenCenter"), window.innerWidth / 2, window.innerHeight / 2);
    gl.uniform2f(uni(prog, gl, "uElementSize"), rec.w, rec.h);
    gl.uniform2f(uni(prog, gl, "uElementOffset"), rec.offset[0], rec.offset[1]);
    gl.uniform2f(uni(prog, gl, "uLayerScale"), rec.scale[0], rec.scale[1]);
    gl.uniform1f(uni(prog, gl, "uDpr"), dpr);
    gl.uniform1f(uni(prog, gl, "uCornerRadius"), rec.radius);
    gl.uniform1f(uni(prog, gl, "uRefractionHeight"), height);
    gl.uniform1f(uni(prog, gl, "uRefractionAmount"), amount);
    gl.uniform1f(uni(prog, gl, "uDepthEffect"), role.depth ? 1 : 0);
    gl.uniform1f(uni(prog, gl, "uChromatic"), chromatic > 0.001 ? Math.min(1, chromatic) : 0);
    gl.uniform1f(uni(prog, gl, "uBlurRadius"), blur);
    gl.uniform1f(uni(prog, gl, "uSaturation"), cfg.saturation / 100);
    gl.uniform1f(uni(prog, gl, "uBrightness"), (cfg.brightness - 100) / 100);
    gl.uniform1f(uni(prog, gl, "uContrast"), 1);
    gl.uniform4f(
      uni(prog, gl, "uTintColor"),
      0,
      0,
      0,
      0
    );
    gl.uniform4f(uni(prog, gl, "uSurfaceColor"), surface[0], surface[1], surface[2], surface[3]);
    gl.uniform1f(uni(prog, gl, "uScrimFlat"), SCRIM_FLAT);
    gl.uniform1f(uni(prog, gl, "uScrimTop"), SCRIM_TOP);
    gl.uniform1f(uni(prog, gl, "uScrimBottom"), SCRIM_BOTTOM);
    gl.uniform1f(uni(prog, gl, "uEnterAlpha"), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /* 边缘高光 pass（Plus 加法混合，游乐场 HighlightModifier 独立图层律） */
    if (this.cfg.highlight && role.highlightAlpha > 0.001 && this.rimProg) {
      const rp = this.rimProg;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(rp.prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      const rloc = gl.getAttribLocation(rp.prog, "aPos");
      gl.enableVertexAttribArray(rloc);
      gl.vertexAttribPointer(rloc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(uni(rp, gl, "uElementSize"), rec.w, rec.h);
      gl.uniform2f(uni(rp, gl, "uLayerScale"), rec.scale[0], rec.scale[1]);
      gl.uniform1f(uni(rp, gl, "uDpr"), dpr);
      gl.uniform1f(uni(rp, gl, "uCornerRadius"), rec.radius);
      gl.uniform3f(uni(rp, gl, "uHighlightColor"), 1, 1, 1);
      gl.uniform1f(uni(rp, gl, "uHighlightAngle"), (45 * Math.PI) / 180);
      gl.uniform1f(uni(rp, gl, "uHighlightFalloff"), 1);
      gl.uniform1f(uni(rp, gl, "uHighlightAlpha"), role.highlightAlpha);
      gl.uniform1f(uni(rp, gl, "uHighlightMode"), role.highlightMode);
      gl.uniform1f(uni(rp, gl, "uHighlightWidth"), Math.max(1, dpr * 0.5) * 2);
      gl.uniform1f(uni(rp, gl, "uHighlightBlur"), Math.max(0.25, dpr * 0.25));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
    }
  }
}

/** 全局单例 */
export const liquidGlass = new LiquidGlassEngine();
