/* ============================================================
 * 「初始」液态玻璃引擎（v1.3.0 · 宿主内建 · 实时渲染）
 * ============================================================
 * 定位（架构律 v1.3.0 修订）：液态玻璃引擎**内建于宿主**——引擎在宿主
 * 可见文档中跑 rAF 渲染循环，逐帧追踪玻璃几何并实时重建位移贴图；
 * 预设包只经 chushi.glass.enable/patch/disable **调用**引擎并经
 * chushi.settings 向设置面板贡献调节项。此前（v1.1.3–v1.2.0）引擎住在
 * 沙箱脚本里：display:none 的沙箱文档禁 rAF、60ms 合帧、busy/settle
 * 退化纯模糊——布局动画期间玻璃冻结成磨砂，用户感知即「不实时渲染」。
 * 宿主内建后以上全部消失：rAF 全速、几何逐帧追踪、折射永不下线。
 *
 * 物理模型（对齐 Apple 液态玻璃边缘透镜）：
 *   ① 方向 = SDF 梯度（边缘外法线），长边弯曲垂直于边缘；
 *   ② 剖面 = smoothstep²(t)，弯曲集中在边缘窄带；
 *   ③ **真环绕折射（v1.3.0 新物理）**：backdrop-filter 的输入被裁剪在
 *      元素 border-box 内——v1.2.0 的滤镜域外扩拿到的只是边缘像素拉伸
 *      （假环绕）。本版对 search/dock/panel/card 四类玻璃改用「边框
 *      外扩法」：border: var(--lg-pad) solid transparent + 负 margin +
 *      宽度补偿，border-box 外扩 pad 而内容盒/绝对定位子元素（锚定
 *      padding-box）纹丝不动——backdrop 取样域随之扩到玻璃足迹之外，
 *      边缘环带折进来的是**玻璃外的真实世界**（环绕/纸镇效应），
 *      pad 环位移渐隐防硬边；overflow 裁剪在 padding-box = 原玻璃
 *      边界，子元素溢出视觉不变。
 *   ④ 链序律（材质即顺序）：blur 在前、url(#disp) 在后、saturate 收尾
 *      ——先霜化再折射，弯曲保持锐利。
 *
 * 实时性（v1.3.0）：
 *   - rAF 逐帧 getBoundingClientRect（transform/spring/transition 全覆盖）；
 *   - 几何变化期：贴图以 1/4 分辨率 30fps 重建（折射全程在线，永退化为
 *     纯模糊）；几何稳定 ~160ms 后换半分辨率精贴图；
 *   - 贴图经 Image 预解码后原子换 href——旧贴图保持显示直到新贴图就绪，
 *     无空窗帧（v1.2.0 的闪动根因已随架构消失）。
 *
 * 安全边界：引擎只读玻璃容器几何、写自身 CSS 变量与 SVG 滤镜；不触碰
 *   预设脚本代码；全屏幕布永不打标；沙箱冻结/预设删除/桥关停即整体回收。
 * ============================================================ */

/** 引擎配置（chushi.glass.enable/patch 白名单字段） */
export interface GlassConfig {
  /** 折射强度 %（0–300）：边缘位移上限 = 折射 × 边缘带宽 */
  refraction: number;
  /** 边缘带宽 %（8–60，半短边占比） */
  band: number;
  /** 霜化模糊 px（0–12，链序律第一位） */
  frost: number;
  /** 饱和度 %（100–260） */
  saturation: number;
  /** 透亮 %（80–140，玻璃体亮度微提） */
  brightness: number;
  /** 边缘色散：三通道分层位移（彩虹棱边） */
  dispersion: boolean;
  /** 镜面高光：边缘内影 + 指针追光 */
  specular: boolean;
  /** 覆盖范围：core = 基础四区；full = 全部玻璃面（含天气玻璃芯片） */
  coverage: "core" | "full";
}

export type GlassPatch = Partial<GlassConfig>;

const GLASS_DEFAULTS: GlassConfig = {
  refraction: 145,
  band: 26,
  frost: 3,
  saturation: 180,
  brightness: 100,
  dispersion: false,
  specular: true,
  coverage: "full",
};

/** 玻璃容器注册表（语义键 → 选择器）。core 四区是产品契约（与 README
 *  「元素钩子表」同步维护）；full 额外覆盖次要玻璃面。 */
const CORE_TARGETS: { key: string; sel: string }[] = [
  { key: "search", sel: ".search-pill" },
  { key: "dock", sel: ".cl-dock" },
  { key: "panel", sel: ".cl-panel" },
  { key: "card", sel: ".glass-card" },
];
const FULL_EXTRA: { key: string; sel: string }[] = [{ key: "chip", sel: ".glass-chip" }];

/** 真环绕折射（边框外扩法）适用的语义键——其余键折射不外扩（小元素
 *  外扩环会与邻接元素互相渗透，如天气芯片成排） */
const EXPAND_KEYS = new Set(["search", "dock", "panel", "card"]);

const MAX_LENSED = 24; /* 同屏透镜上限（性能护栏） */
const PAD_MAX = 14; /* 外扩环上限 px */
const STABLE_MS = 160; /* 几何稳定判定：换精贴图 */
const MOTION_MIN_MS = 34; /* 变动期贴图重建最小间隔（≈30fps） */

interface LensRec {
  id: string;
  key: string;
  w: number;
  h: number;
  radius: number;
  pad: number;
  sig: string; /* 当前几何签名 */
  builtSig: string; /* 滤镜当前呈现的签名 */
  rebuilding: boolean;
  lastBuild: number;
  stableAt: number;
  filter: SVGFilterElement | null;
  feImage: SVGFEImageElement | null;
  disp: SVGFEDisplacementMapElement[];
  structSig: string; /* 滤镜结构签名（色散开合） */
  vars: Record<string, string>; /* 已写入的 CSS 变量缓存 */
}

/** 沙箱桥传入前对 enable 配置整组校验夹紧（非法字段回默认值） */
export function sanitizeGlassEnable(raw: unknown): GlassConfig {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    refraction: num(p.refraction, GLASS_DEFAULTS.refraction, 0, 300),
    band: num(p.band, GLASS_DEFAULTS.band, 8, 60),
    frost: num(p.frost, GLASS_DEFAULTS.frost, 0, 12),
    saturation: num(p.saturation, GLASS_DEFAULTS.saturation, 100, 260),
    brightness: num(p.brightness, GLASS_DEFAULTS.brightness, 80, 140),
    dispersion: p.dispersion === true,
    specular: p.specular !== false,
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
  const r = num(p.refraction, 0, 300);
  if (r !== undefined) out.refraction = r;
  const b = num(p.band, 8, 60);
  if (b !== undefined) out.band = b;
  const f = num(p.frost, 0, 12);
  if (f !== undefined) out.frost = f;
  const sa = num(p.saturation, 100, 260);
  if (sa !== undefined) out.saturation = sa;
  const br = num(p.brightness, 80, 140);
  if (br !== undefined) out.brightness = br;
  if (typeof p.dispersion === "boolean") out.dispersion = p.dispersion;
  if (typeof p.specular === "boolean") out.specular = p.specular;
  if (p.coverage === "core" || p.coverage === "full") out.coverage = p.coverage;
  return out;
}

class LiquidGlassEngine {
  private owner: string | null = null;
  private cfg: GlassConfig = { ...GLASS_DEFAULTS };
  private recs = new Map<HTMLElement, LensRec>();
  private root: HTMLElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private defs: SVGSVGElement | null = null;
  private uid = 0;
  private raf = 0;
  private started = false;
  private materialSig = "";
  private cfgSig = "";

  /* ---------- 预设经桥调入 ---------- */

  enable(scriptKey: string, cfg: GlassConfig): { ok: boolean; message?: string } {
    if (this.owner && this.owner !== scriptKey) {
      return { ok: false, message: "液态玻璃已被其他预设启用" };
    }
    this.owner = scriptKey;
    this.cfg = cfg;
    this.start();
    return { ok: true };
  }

  patch(scriptKey: string, partial: GlassPatch): { ok: boolean; message?: string } {
    if (this.owner !== scriptKey) return { ok: false, message: "液态玻璃未由该预设启用" };
    this.cfg = { ...this.cfg, ...partial };
    this.cfgSig = JSON.stringify(this.cfg);
    this.refreshMaterial();
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
    this.defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.defs.setAttribute("width", "0");
    this.defs.setAttribute("height", "0");
    this.defs.style.setProperty("position", "absolute");
    this.root.appendChild(this.defs);
    document.body.appendChild(this.root);
    this.refreshMaterial();

    document.addEventListener("pointermove", this.onPointer, { passive: true });
    this.raf = requestAnimationFrame(this.tick);
  }

  private teardown() {
    if (!this.started) return;
    this.started = false;
    this.owner = null;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    document.removeEventListener("pointermove", this.onPointer);
    document.querySelectorAll<HTMLElement>("[data-lg]").forEach((el) => {
      this.clearVars(el);
      delete el.dataset.lg;
      delete el.dataset.lgKey;
    });
    this.recs.clear();
    this.root?.remove();
    this.root = null;
    this.styleEl = null;
    this.defs = null;
  }

  private refreshMaterial() {
    if (!this.styleEl) return;
    const sig = JSON.stringify(this.cfg);
    if (sig === this.materialSig) return;
    this.materialSig = sig;
    this.styleEl.textContent = this.materialCss();
  }

  private clearVars(el: HTMLElement) {
    const names = [
      "--lg-bf",
      "--lg-pad",
      "--lg-radius",
      "--lg-ww",
      "--lg-ow",
      "--lg-mx",
      "--lg-my",
    ];
    for (const n of names) el.style.removeProperty(n);
  }

  /* ---------- 渲染循环（宿主可见文档：rAF 全速） ---------- */

  private tick = () => {
    this.raf = 0;
    if (!this.started) return;
    const now = Date.now();
    const sel = (this.cfg.coverage === "core" ? CORE_TARGETS : [...CORE_TARGETS, ...FULL_EXTRA])
      .map((t) => t.sel)
      .join(", ");
    const seen = new Set<Element>();
    let count = 0;
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      if (count >= MAX_LENSED) return;
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w <= 0 || h <= 0) return;
      /* 全屏幕布永不打标（幕布不是玻璃块） */
      if (w >= window.innerWidth - 2 && h >= window.innerHeight - 2) return;
      seen.add(el);
      count += 1;
      this.lens(el, w, h, now);
    });
    /* 回收已消失元素（浮层卸载后滤镜/标记/变量一并清理） */
    for (const [el, rec] of [...this.recs]) {
      if (!seen.has(el)) {
        rec.filter?.remove();
        this.clearVars(el);
        delete el.dataset.lg;
        delete el.dataset.lgKey;
        this.recs.delete(el);
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private lens(el: HTMLElement, wRaw: number, h: number, now: number) {
    if (!this.defs) return;
    let rec = this.recs.get(el);
    const origW = rec ? wRaw - rec.pad * 2 : wRaw;
    const key =
      (this.cfg.coverage === "core" ? CORE_TARGETS : [...CORE_TARGETS, ...FULL_EXTRA]).find(
        (t) => el.matches(t.sel)
      )?.key ?? "card";
    if (!rec) {
      rec = {
        id: `L${++this.uid}`,
        key,
        w: origW,
        h,
        radius: 0,
        pad: 0,
        sig: "",
        builtSig: "",
        rebuilding: false,
        lastBuild: 0,
        stableAt: now,
        filter: null,
        feImage: null,
        disp: [],
        structSig: "",
        vars: {},
      };
      this.recs.set(el, rec);
      el.dataset.lg = rec.id;
      el.dataset.lgKey = key;
      /* 原始 max-width 补偿基准（外扩前读取；none 不写，CSS var 缺省 9999px） */
      const mw = getComputedStyle(el).maxWidth;
      if (mw !== "none" && mw.endsWith("px")) {
        rec.vars["--lg-ow"] = mw;
        el.style.setProperty("--lg-ow", mw);
      }
    }
    rec.key = key;
    el.dataset.lgKey = key;

    /* 圆角（半短边夹紧；百分比按半短边换算）——仅几何变化时读计算样式 */
    const sig0 = `${origW}|${h}`;
    if (rec.sig.split("|").slice(0, 2).join("|") !== sig0) {
      const raw = getComputedStyle(el).borderRadius;
      let radius = raw.endsWith("%")
        ? (Math.min(origW, h) / 2) * (parseFloat(raw) / 100)
        : parseFloat(raw) || 0;
      radius = Math.min(radius, origW / 2, h / 2);
      rec.radius = Math.round(radius * 10) / 10;
    }
    rec.w = origW;
    rec.h = h;

    /* pad：边缘位移上限外扩 +2 渐隐，夹 4..PAD_MAX；真环绕键才外扩 */
    const bandPx = Math.max(2, (Math.min(origW, h) / 2) * (this.cfg.band / 100));
    const maxDisp = (this.cfg.refraction / 100) * bandPx;
    const pad = EXPAND_KEYS.has(key) && maxDisp >= 0.5 ? Math.min(PAD_MAX, Math.max(4, Math.ceil(maxDisp) + 2)) : 0;
    rec.pad = pad;

    const sig = `${origW}|${h}|${rec.radius}|${this.cfgSig}|${pad}`;
    const changed = rec.sig !== sig;
    if (changed) {
      rec.sig = sig;
      rec.stableAt = now;
    }

    /* CSS 变量：折射链 / 外扩几何 / （真环绕键）宽度补偿 */
    const chainParts = [`blur(${this.cfg.frost}px)`];
    if (maxDisp >= 0.5) chainParts.push(`url(#lg-${rec.id})`);
    chainParts.push(`saturate(${this.cfg.saturation}%)`);
    if (this.cfg.brightness !== 100) chainParts.push(`brightness(${this.cfg.brightness}%)`);
    this.setVar(el, rec, "--lg-bf", chainParts.join(" "));
    this.setVar(el, rec, "--lg-pad", `${pad}px`);
    this.setVar(el, rec, "--lg-radius", `${rec.radius}px`);
    if (EXPAND_KEYS.has(key) && key !== "search") {
      this.setVar(el, rec, "--lg-ww", `${origW}px`);
    }

    /* 贴图重建：稳定期精贴图，变动期 1/4 分辨率 30fps（折射永在线） */
    if (rec.sig !== rec.builtSig && !rec.rebuilding) {
      const stable = now - rec.stableAt > STABLE_MS;
      const quality = stable ? 2 : now - rec.lastBuild >= MOTION_MIN_MS ? 1 : 0;
      if (quality > 0) this.rebuild(el, rec, quality);
    }
  }

  private setVar(el: HTMLElement, rec: LensRec, name: string, val: string) {
    if (rec.vars[name] === val) return;
    rec.vars[name] = val;
    el.style.setProperty(name, val);
  }

  /** 位移贴图：物理透镜（SDF 梯度方向 + 外绕边缘带 + pad 渐隐环）。
   *  quality 2 = 半分辨率精贴图；1 = 1/4 分辨率（变动期，梯度场平滑视觉无损） */
  private buildMap(w: number, h: number, radius: number, pad: number, quality: number) {
    const band = Math.max(2, (Math.min(w, h) / 2) * (this.cfg.band / 100));
    const maxDisp = (this.cfg.refraction / 100) * band;
    if (maxDisp < 0.5) return null;
    const W = w + pad * 2;
    const H = h + pad * 2;
    const div = quality >= 2 ? 2 : 4;
    const mw = Math.max(1, Math.ceil(W / div));
    const mh = Math.max(1, Math.ceil(H / div));
    const canvas = document.createElement("canvas");
    canvas.width = mw;
    canvas.height = mh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(mw, mh);
    const data = img.data;
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.min(radius, hw, hh);
    const fade0 = pad * 0.55;
    const fadeLen = Math.max(1, pad - fade0);
    const scale = maxDisp * 2;
    const sx = W / mw;
    const sy = H / mh;

    const sdf = (px: number, py: number) => {
      const qx = Math.abs(px) - hw + r;
      const qy = Math.abs(py) - hh + r;
      return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
    };

    let i = 0;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++, i += 4) {
        const px = (x + 0.5) * sx - pad - hw;
        const py = (y + 0.5) * sy - pad - hh;
        const d = sdf(px, py);
        /* t：玻璃深处 0 → 边缘 1（域外夹 1，由渐隐环接管） */
        let t = d / band + 1;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const s = t * t * (3 - 2 * t);
        let m = s * s; /* smoothstep²：弯曲集中边缘窄带、越靠边越陡 */
        if (d > fade0) {
          let f = 1 - (d - fade0) / fadeLen;
          if (f < 0) f = 0;
          m *= f;
        }
        /* 方向 = SDF 梯度（向外法线）：边缘向外取样 = 玻璃外世界压缩环绕 */
        const gx = sdf(px + 1, py) - sdf(px - 1, py);
        const gy = sdf(px, py + 1) - sdf(px, py - 1);
        const gl = Math.hypot(gx, gy) || 1;
        data[i] = Math.min(Math.max(((gx / gl) * m * maxDisp) / scale + 0.5, 0), 1) * 255;
        data[i + 1] = Math.min(Math.max(((gy / gl) * m * maxDisp) / scale + 0.5, 0), 1) * 255;
        data[i + 2] = 128;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { url: canvas.toDataURL(), scale, pad };
  }

  /** 贴图重建 → Image 预解码 → 原子换 href（旧贴图保持显示，无空窗帧） */
  private rebuild(el: HTMLElement, rec: LensRec, quality: number) {
    if (!this.defs) return;
    rec.rebuilding = true;
    rec.lastBuild = Date.now();
    const { w, h, radius, pad, id } = rec;
    const sig = rec.sig;
    const structSig = this.cfg.dispersion ? "d" : "s";
    const map = this.buildMap(w, h, radius, pad, quality);
    const swap = () => {
      rec.rebuilding = false;
      if (!this.started || !this.defs || !this.recs.has(el)) return;
      if (rec.sig !== sig) return; /* 期间几何又变了：下轮重建 */
      /* 滤镜结构（色散开合）变化时整体重建 filter 节点 */
      if (!rec.filter || rec.structSig !== structSig) {
        rec.filter?.remove();
        const f = document.createElementNS("http://www.w3.org/2000/svg", "filter");
        f.setAttribute("id", `lg-${id}`);
        f.setAttribute("filterUnits", "userSpaceOnUse");
        f.setAttribute("color-interpolation-filters", "sRGB");
        if (structSig === "d") {
          /* 三通道分层位移：边缘出彩虹棱边（滤镜开销 ×3） */
          const rows = [
            "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
            "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
            "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
          ];
          const img = document.createElementNS("http://www.w3.org/2000/svg", "feImage");
          img.setAttribute("result", "map");
          img.setAttribute("preserveAspectRatio", "none");
          f.appendChild(img);
          rec.feImage = img;
          rec.disp = [];
          for (let c = 0; c < 3; c++) {
            const cm = document.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
            cm.setAttribute("in", "SourceGraphic");
            cm.setAttribute("type", "matrix");
            cm.setAttribute("values", rows[c]);
            cm.setAttribute("result", `ch${c}`);
            f.appendChild(cm);
            const dm = document.createElementNS("http://www.w3.org/2000/svg", "feDisplacementMap");
            dm.setAttribute("in", `ch${c}`);
            dm.setAttribute("in2", "map");
            dm.setAttribute("xChannelSelector", "R");
            dm.setAttribute("yChannelSelector", "G");
            f.appendChild(dm);
            rec.disp.push(dm);
          }
          for (let k = 0; k < 2; k++) {
            const comp = document.createElementNS("http://www.w3.org/2000/svg", "feComposite");
            comp.setAttribute("operator", "arithmetic");
            comp.setAttribute("k2", "1");
            comp.setAttribute("k3", "1");
            f.appendChild(comp);
          }
        } else {
          const img = document.createElementNS("http://www.w3.org/2000/svg", "feImage");
          img.setAttribute("result", "map");
          img.setAttribute("preserveAspectRatio", "none");
          f.appendChild(img);
          rec.feImage = img;
          const dm = document.createElementNS("http://www.w3.org/2000/svg", "feDisplacementMap");
          dm.setAttribute("in", "SourceGraphic");
          dm.setAttribute("in2", "map");
          dm.setAttribute("xChannelSelector", "R");
          dm.setAttribute("yChannelSelector", "G");
          f.appendChild(dm);
          rec.disp = [dm];
        }
        this.defs.appendChild(f);
        rec.filter = f;
        rec.structSig = structSig;
      }
      if (!map) {
        /* 折射为 0：摘贴图（链已在 --lg-bf 去 url） */
        rec.filter.remove();
        rec.filter = null;
        rec.feImage = null;
        rec.disp = [];
        rec.structSig = "";
        rec.builtSig = sig;
        return;
      }
      const f = rec.filter;
      const rw = w + pad * 2;
      const rh = h + pad * 2;
      f.setAttribute("x", `${-pad}`);
      f.setAttribute("y", `${-pad}`);
      f.setAttribute("width", `${rw}`);
      f.setAttribute("height", `${rh}`);
      const img = rec.feImage;
      if (img) {
        img.setAttribute("x", `${-pad}`);
        img.setAttribute("y", `${-pad}`);
        img.setAttribute("width", `${rw}`);
        img.setAttribute("height", `${rh}`);
        img.setAttribute("href", map.url);
      }
      const sMul = [1, 1.14, 1.28];
      rec.disp.forEach((dm, idx) => {
        dm.setAttribute("scale", (map.scale * (structSig === "d" ? sMul[idx] : 1)).toFixed(2));
      });
      rec.builtSig = sig;
    };
    if (!map) {
      swap();
      return;
    }
    const probe = new Image();
    probe.onload = swap;
    probe.onerror = () => {
      rec.rebuilding = false;
    };
    probe.src = map.url;
  }

  /* ---------- 材质 CSS（底色调透 + 边框外扩 + 镜面追光） ---------- */

  private materialCss(): string {
    const c = this.cfg;
    const css = [
      /* 折射链：var 注入，避免逐帧重写选择器 */
      "[data-lg]{backdrop-filter:var(--lg-bf,blur(3px))!important;-webkit-backdrop-filter:var(--lg-bf,blur(3px))!important}",
      /* 底色调透：磨砂下的高不透明度会洗掉折射 */
      "[data-lg].glass-card{background:rgb(252 251 248/.4)}",
      "html.dark [data-lg].glass-card{background:rgb(22 22 27/.48)}",
      "[data-lg].glass-pill{background:rgb(255 255 255/.24)}",
      "html.dark [data-lg].glass-pill{background:rgb(255 255 255/.04)}",
    ];
    if (c.specular) {
      css.push(
        "[data-lg]::before{content:\"\";position:absolute;inset:var(--lg-pad,0px);border-radius:var(--lg-radius,16px);pointer-events:none;z-index:2;" +
          "box-shadow:inset 0 0 0 1px rgb(255 255 255/.32),inset 1.8px 3px 0 -2px rgb(255 255 255/.8)," +
          "inset -2px -2px 0 -2px rgb(255 255 255/.8),inset -3px -9px 1px -6px rgb(255 255 255/.5)," +
          "inset 3px 9px 1px -6px rgb(255 255 255/.32),inset 0 -1px 5px 0 rgb(0 0 0/.1)}",
        "html.dark [data-lg]::before{box-shadow:inset 0 0 0 1px rgb(255 255 255/.14)," +
          "inset 1.8px 3px 0 -2px rgb(255 255 255/.42),inset -2px -2px 0 -2px rgb(255 255 255/.42)," +
          "inset -3px -9px 1px -6px rgb(255 255 255/.22),inset 3px 9px 1px -6px rgb(255 255 255/.14)," +
          "inset 0 -1px 5px 0 rgb(0 0 0/.28)}",
        "[data-lg]::after{content:\"\";position:absolute;inset:var(--lg-pad,0px);border-radius:var(--lg-radius,16px);pointer-events:none;z-index:2;" +
          "opacity:0;transition:opacity .35s;background:radial-gradient(220px circle at var(--lg-mx,50%) var(--lg-my,50%)," +
          "rgb(255 255 255/.24),transparent 65%)}",
        "[data-lg]:hover::after{opacity:1}"
      );
    }
    /* 真环绕折射：边框外扩法。border 透明环 + 负 margin 回拉布局；
     * 背景裁到 padding-box（原玻璃域）；overflow 裁剪同域；圆角外移 pad。 */
    const expandSel = [...EXPAND_KEYS]
      .map((k) => (k === "search" ? "[data-lg].search-pill" : k === "dock" ? "[data-lg].cl-dock" : k === "panel" ? "[data-lg].cl-panel" : "[data-lg].glass-card"))
      .join(",");
    css.push(
      `${expandSel}{border:var(--lg-pad,0px) solid transparent!important;` +
        `margin:calc(-1*var(--lg-pad,0px))!important;` +
        `border-radius:calc(var(--lg-radius,16px) + var(--lg-pad,0px))!important;` +
        `background-clip:padding-box!important}`
    );
    /* 宽度补偿（border-box 因 border 外扩 2×pad；search 走 inset 定位自动补偿） */
    css.push(
      "[data-lg].cl-dock,[data-lg].cl-panel,[data-lg].glass-card{" +
        "width:calc(var(--lg-ww,0px) + 2*var(--lg-pad,0px))!important;" +
        "max-width:calc(var(--lg-ow,9999px) + 2*var(--lg-pad,0px))!important}"
    );
    /* 阴影补偿：Tailwind 阴影自 border-box 量取，外扩后回拉 spread 防影环变胖 */
    css.push(
      "[data-lg].cl-dock{box-shadow:0 10px 15px calc(-3px - var(--lg-pad,0px)) rgb(0 0 0/.1),0 4px 6px calc(-4px - var(--lg-pad,0px)) rgb(0 0 0/.1)!important}",
      "[data-lg].glass-card{box-shadow:0 25px 50px calc(-12px - var(--lg-pad,0px)) rgb(0 0 0/.25)!important}"
    );
    return css.join("");
  }

  /* ---------- 指针变量桥：镜面追光（%相对坐标写容器变量） ---------- */

  private onPointer = (e: PointerEvent) => {
    const target = e.target as Element | null;
    const node = target?.closest?.("[data-lg]");
    if (!node || !(node instanceof HTMLElement)) return;
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) return;
    node.style.setProperty("--lg-mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(2)}%`);
    node.style.setProperty("--lg-my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(2)}%`);
  };
}

/** 全局单例 */
export const liquidGlass = new LiquidGlassEngine();
