/* ============================================================
 * 「初始」fx 视觉效果面（v1.3.0）— 通用受控执行器
 *
 * 定位（架构律 v1.3.0 修订）：液态玻璃引擎已**内建于宿主**
 * （liquid-glass.ts，经 chushi.glass 调用，实时 rAF 渲染）；本模块保留
 * 为预设的「通用 fx 作用面」——预设自带的自定义 style/svg 视觉仍经
 * 此通道挂载，与内建引擎互不干扰：
 *
 *   1. fx-root 注入点：预设经 chushi.fx.mount(id, html) 把 <style>/<svg>
 *      幂等挂进 document.body 下的隐藏容器 #chushi-fx-root；删除预设即
 *      整组摘除。HTML 白名单校验（只允许 style/svg 结构，禁 script、
 *      事件属性、foreignObject、外链资源），与预设系统声明式白名单
 *      同律——宿主不执行预设携带的任何代码。
 *   2. 玻璃容器白名单标记：扫描玻璃容器选择器打 data-fx="fxN"（幂等），
 *      预设 CSS 经 [data-fx="fxN"] 触达宿主玻璃元素。选择器清单是产品
 *      契约（与 README「自定义动画与面板样式」元素钩子表同步维护）。
 *   3. resize 桥：ResizeObserver 跟踪白名单元素（w/h/圆角/视口坐标/
 *      语义键），变化即推送订阅中的沙箱脚本（折射引擎按元素几何重生成）。
 *   4. 指针变量桥：指针在玻璃容器内移动时把相对坐标写为容器上的
 *      --fx-mx / --fx-my（百分比字符串，rAF 节流）——预设 CSS 用
 *      var(--fx-mx) 做镜面高光，无需任何 JS 回调。
 *
 * v1.3.0 新增作用面（WebGL 液态玻璃需要的三块事实数据）：
 *   5. attachCanvas + pushFrame：宿主在 [data-fx] 元素内 prepend 一块透明
 *      画布（z-index:-1，位于元素背景之下、内容之下）作为「位图占位」；
 *      预设引擎在沙箱本地自绘（WebGL/2D 均可），经 pushFrame 把绘制好的
 *      ImageBitmap 交给宿主 blit 到占位画布——宿主只搬运像素，不做任何
 *      视觉计算。引擎怎么画完全由预设决定；ImageBitmap 结构化克隆在各
 *      内核可靠（OffscreenCanvas 直转移在 Chromium 下多发后不可靠，已废垒）。
 *   6. backdrop：把当前页面背景的「事实数据」交给预设引擎——
 *      photo 模式返回壁纸 ImageBitmap（宿主代取，结构化克隆转移，
 *      沙箱零污染零 CORS 负担）+ 压暗层参数；glow/flat 模式返回
 *      底色与光斑的程序化描述。绘制仍由预设引擎完成，宿主只陈述事实。
 *   7. 位置跟踪：canvas 存续期间 rAF 循环监测元素视口位置（transform
 *      动画 ResizeObserver 不触发），变化即推 fxPositions——折射采样
 *      坐标据此与壁纸逐帧对齐（⌘K 面板弹簧开合期不漂移）。
 *
 * 安全边界：
 *   - 白名单元素之外宿主一概不碰；全屏幕布（⌘K/链接对话框遮罩）永不
 *     打标（幕布不是玻璃块——v1.1.0 实证：全屏贴图边缘位移会拉丝擦除背景）；
 *   - mount 的 html 不含可执行向量（见校验函数）；≤192KB/挂载；
 *   - canvas 绘制权一经移交宿主不再触碰位面；ImageBitmap 由宿主自
 *     用户已可见的背景生成，转移不扩大任何泄露面；
 *   - 预设删除 / 沙箱冻结 / 页面卸载时该预设的挂载、canvas、订阅全部回收。
 * ============================================================ */

/** 玻璃容器白名单：语义键 → 选择器（key 随 resize 推送给预设做语义映射，
 *  data-fx 标记才是预设 CSS 的触达手段；新增玻璃容器必须同步此处与 README） */
const FX_TARGETS: { key: string; sel: string }[] = [
  { key: "search", sel: ".search-pill" },
  { key: "dock", sel: ".cl-dock" },
  { key: "panel", sel: ".cl-panel" },
  { key: "card", sel: ".glass-card" },
  { key: "chip", sel: ".glass-chip" },
];
const FX_SELECTOR = FX_TARGETS.map((t) => t.sel).join(", ");

/** 单挂载体积与总量护栏 */
const MOUNT_MAX = 192 * 1024;
const TOTAL_MAX = 512 * 1024;

/** 壁纸压暗层参数（产品契约：与 globals.css .photo-scrim 同步维护）：
 *  [停点, 透明度] 纵向渐变 + 整体平底 */
const PHOTO_SCRIM: { stops: [number, number][]; flat: number } = {
  stops: [
    [0, 0.34],
    [0.3, 0.12],
    [0.6, 0.12],
    [1, 0.48],
  ],
  flat: 0.18,
};

/** 辉光光斑几何（产品契约：与 globals.css .aurora-a/b/c/d 同步维护，
 *  取 drift 动画中位帧的近似视口相对坐标；引擎据此程序化重建光斑） */
const GLOW_BLOBS: { x: number; y: number; r: number; light: string; dark: string }[] = [
  { x: 0.08, y: 0.02, r: 0.3, light: "rgba(52,211,153,.35)", dark: "rgba(16,185,129,.25)" },
  { x: 0.92, y: 0.26, r: 0.24, light: "rgba(240,171,252,.30)", dark: "rgba(232,121,249,.20)" },
  { x: 0.4, y: 0.9, r: 0.2, light: "rgba(253,230,138,.40)", dark: "rgba(252,211,77,.15)" },
  { x: 0.84, y: 0.92, r: 0.16, light: "rgba(153,246,228,.30)", dark: "rgba(45,212,191,.15)" },
];

/** 底色（产品契约：与 AuroraBackground 底色层同步维护） */
const BASE_LIGHT = "#f6f5f2";
const BASE_DARK = "#0a0a0e";

/** 背景事实描述（宿主 → 沙箱；photo 的位图随消息单独 transfer） */
export interface FxBackdropDesc {
  kind: "photo" | "glow" | "flat";
  dark: boolean;
  base: string;
  /** 视口尺寸（css px）：引擎 cover 裁剪与折射世界坐标对齐用 */
  vw: number;
  vh: number;
  /** photo：压暗层参数 */
  scrim?: { stops: [number, number][]; flat: number };
  /** glow：光斑描述（坐标/半径为视口相对值） */
  blobs?: { x: number; y: number; r: number; color: string }[];
}

interface MountEntry {
  scriptKey: string;
  fxId: string;
  el: HTMLElement;
}

interface CanvasEntry {
  canvas: HTMLCanvasElement;
  el: HTMLElement;
}

class FxHost {
  private root: HTMLElement | null = null;
  private mounts = new Map<string, MountEntry>(); // `${scriptKey}:${fxId}` → entry
  private canvases = new Map<string, CanvasEntry>(); // `${scriptKey}:${fxId}` → entry
  private subscribed = new Set<string>(); // scriptKey → 收 resize/positions 推送
  private ro: ResizeObserver | null = null;
  private mo: MutationObserver | null = null;
  private uid = 0;
  private rafPending = 0;
  private trackRaf = 0;
  private started = false;
  /** 位置跟踪上次值（fxId → 视口坐标） */
  private lastPos = new Map<string, { x: number; y: number }>();
  /** 宿主 → 沙箱推送（bridge 注入；参数为消息对象） */
  private post: ((msg: Record<string, unknown>) => void) | null = null;

  start(post: (msg: Record<string, unknown>) => void) {
    if (this.started) return;
    if (typeof document === "undefined") return;
    this.post = post;
    this.started = true;

    this.root = document.getElementById("chushi-fx-root");
    if (!this.root) {
      this.root = document.createElement("div");
      this.root.id = "chushi-fx-root";
      this.root.setAttribute("aria-hidden", "true");
      this.root.style.cssText =
        "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none";
      document.body.appendChild(this.root);
    }

    this.ro = new ResizeObserver(() => this.schedulePush());
    this.mo = new MutationObserver(() => this.scheduleScan());
    this.mo.observe(document.body, { childList: true, subtree: true });

    /* 指针变量桥：document 级委托，命中白名单标记元素才写 CSS 变量 */
    document.addEventListener("pointermove", this.onPointer, { passive: true });

    this.scan();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.mounts.forEach((m) => m.el.remove());
    this.mounts.clear();
    this.canvases.forEach((c) => c.canvas.remove());
    this.canvases.clear();
    this.lastPos.clear();
    this.subscribed.clear();
    this.ro?.disconnect();
    this.ro = null;
    this.mo?.disconnect();
    this.mo = null;
    document.removeEventListener("pointermove", this.onPointer);
    if (this.rafPending) {
      cancelAnimationFrame(this.rafPending);
      this.rafPending = 0;
    }
    if (this.trackRaf) {
      cancelAnimationFrame(this.trackRaf);
      this.trackRaf = 0;
    }
    /* 无脚本可存活时（全部删除/冻结/沙箱关停）把 data-fx 标记一并擦净：
       预设 CSS 已整组回收，残留的惰性标记会污染「删除即还原」的语义 */
    document.querySelectorAll<HTMLElement>("[data-fx]").forEach((el) => {
      delete el.dataset.fx;
      el.style.removeProperty("--fx-mx");
      el.style.removeProperty("--fx-my");
    });
    this.root?.remove();
    this.root = null;
    this.post = null;
  }

  /* ---------- 预设脚本经 bridge 调入 ---------- */

  /** op: "mount" | "unmount" | "subscribe" | "unsubscribe" */
  apply(scriptKey: string, op: string, fxId: string, html?: string): { ok: boolean; message?: string } {
    if (!this.started) return { ok: false, message: "fx 未就绪" };
    switch (op) {
      case "mount": {
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(fxId)) return { ok: false, message: "fx id 不合法" };
        if (typeof html !== "string" || !html) return { ok: false, message: "fx mount 缺少 html" };
        if (html.length > MOUNT_MAX) return { ok: false, message: "fx mount 超出体积上限" };
        let total = 0;
        this.mounts.forEach((m) => {
          if (m.scriptKey === scriptKey) total += m.el.innerHTML.length;
        });
        if (total + html.length > TOTAL_MAX) return { ok: false, message: "fx 挂载总量超限" };
        const node = this.sanitize(html);
        if (!node) return { ok: false, message: "fx html 校验未通过（仅允许 style/svg 结构）" };
        const key = `${scriptKey}:${fxId}`;
        const old = this.mounts.get(key);
        if (old) {
          /* 幂等替换：同 id 覆盖（贴图更新走这里，不闪断样式） */
          old.el.replaceChildren(node);
        } else {
          const wrap = document.createElement("div");
          wrap.setAttribute("data-fx-mount", fxId);
          wrap.appendChild(node);
          this.root!.appendChild(wrap);
          this.mounts.set(key, { scriptKey, fxId, el: wrap });
        }
        return { ok: true };
      }
      case "unmount": {
        const key = `${scriptKey}:${fxId}`;
        const old = this.mounts.get(key);
        if (old) {
          old.el.remove();
          this.mounts.delete(key);
        }
        return { ok: true };
      }
      case "subscribe": {
        this.subscribed.add(scriptKey);
        this.scan();
        this.push(); /* 订阅即推全量快照，预设启动即可拿到初始元素 */
        return { ok: true };
      }
      case "unsubscribe": {
        this.subscribed.delete(scriptKey);
        return { ok: true };
      }
      default:
        return { ok: false, message: "未知 fx 操作" };
    }
  }

  /**
   * 在 [data-fx=fxId] 元素内创建透明占位画布（位图由预设引擎经
   * pushFrame 持续供给）。画布位于元素背景/内容之下（z-index:-1），
   * 元素 position 为 static 时补 relative 保证定位正确。
   */
  attachCanvas(scriptKey: string, fxId: string): { ok: boolean; message?: string } {
    if (!this.started) return { ok: false, message: "fx 未就绪" };
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(fxId)) return { ok: false, message: "fx id 不合法" };
    const el = document.querySelector<HTMLElement>(`[data-fx="${CSS.escape(fxId)}"]`);
    if (!el || !el.isConnected) return { ok: false, message: "fx 元素不存在（快照过期）" };
    const key = `${scriptKey}:${fxId}`;
    const old = this.canvases.get(key);
    if (old) {
      old.canvas.remove();
      this.canvases.delete(key);
    }
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const canvas = document.createElement("canvas");
    canvas.className = "chushi-fx-canvas";
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;border-radius:inherit;z-index:-1";
    el.prepend(canvas);
    this.canvases.set(key, { canvas, el });
    const r = el.getBoundingClientRect();
    this.lastPos.set(fxId, { x: r.left, y: r.top });
    this.ensureTracking();
    return { ok: true };
  }

  /**
   * 位图帧上屏：把预设引擎画好的 ImageBitmap blit 到占位画布。
   * 宿主只搬运像素（缩放到画布位面尺寸），不做任何视觉计算；
   * 位图消费后立即关闭回收。
   */
  frame(scriptKey: string, fxId: string, bitmap: ImageBitmap, w: number, h: number): { ok: boolean; message?: string } {
    const key = `${scriptKey}:${fxId}`;
    const c = this.canvases.get(key);
    if (!c || !c.canvas.isConnected) return { ok: false, message: "画布不存在" };
    const bw = Math.max(1, Math.round(w));
    const bh = Math.max(1, Math.round(h));
    if (c.canvas.width !== bw || c.canvas.height !== bh) {
      c.canvas.width = bw;
      c.canvas.height = bh;
    }
    const ctx = c.canvas.getContext("2d");
    if (!ctx) return { ok: false, message: "画布 2d 上下文不可用" };
    ctx.clearRect(0, 0, bw, bh);
    ctx.drawImage(bitmap, 0, 0, bw, bh);
    bitmap.close();
    return { ok: true };
  }

  /** 摘除脚本在某元素上的画布（元素消失 / 引擎降级 / 回收） */
  detachCanvas(scriptKey: string, fxId: string) {
    const key = `${scriptKey}:${fxId}`;
    const c = this.canvases.get(key);
    if (c) {
      c.canvas.remove();
      this.canvases.delete(key);
    }
    if (fxId) this.lastPos.delete(fxId);
  }

  /**
   * 背景事实数据：photo 模式宿主代取壁纸（fetch → blob → ImageBitmap，
   * 失败回落同源 img 直取；仍失败视为非 photo）；glow/flat 返回程序化
   * 描述。绘制全部由预设引擎完成，宿主只陈述事实。
   */
  async backdrop(): Promise<{ ok: boolean; message?: string; desc: FxBackdropDesc; bitmap?: ImageBitmap }> {
    const dark = document.documentElement.classList.contains("dark");
    const img = document.querySelector<HTMLImageElement>("img[data-wallpaper]");
    if (img && img.isConnected && img.currentSrc) {
      try {
        const r = await fetch(img.currentSrc, { mode: "cors", cache: "force-cache" });
        if (r.ok) {
          const blob = await r.blob();
          const bitmap = await createImageBitmap(blob);
          return { ok: true, desc: { kind: "photo", dark, base: dark ? BASE_DARK : BASE_LIGHT, vw: window.innerWidth, vh: window.innerHeight, scrim: PHOTO_SCRIM }, bitmap };
        }
      } catch {
        /* CORS/网络失败 → 同源 img 直取 */
      }
      try {
        const bitmap = await createImageBitmap(img);
        return { ok: true, desc: { kind: "photo", dark, base: dark ? BASE_DARK : BASE_LIGHT, vw: window.innerWidth, vh: window.innerHeight, scrim: PHOTO_SCRIM }, bitmap };
      } catch {
        /* 跨域无 CORS：视作无壁纸，降级底色 */
      }
    }
    const glow = document.querySelector(".aurora-blob");
    if (glow) {
      return {
        ok: true,
        desc: {
          kind: "glow",
          dark,
          base: dark ? BASE_DARK : BASE_LIGHT,
          vw: window.innerWidth,
          vh: window.innerHeight,
          blobs: GLOW_BLOBS.map((b) => ({
            x: b.x,
            y: b.y,
            r: b.r,
            color: dark ? b.dark : b.light,
          })),
        },
      };
    }
    return { ok: true, desc: { kind: "flat", dark, base: dark ? BASE_DARK : BASE_LIGHT, vw: window.innerWidth, vh: window.innerHeight } };
  }

  /** 该预设的挂载与订阅全部回收（预设删除 / 脚本冻结 / 沙箱重建） */
  cleanup(scriptKey: string) {
    for (const [key, m] of [...this.mounts]) {
      if (m.scriptKey === scriptKey) {
        m.el.remove();
        this.mounts.delete(key);
      }
    }
    for (const [key, c] of [...this.canvases]) {
      if (key.startsWith(`${scriptKey}:`)) {
        c.canvas.remove();
        this.canvases.delete(key);
      }
    }
    this.subscribed.delete(scriptKey);
    this.stopTrackingIfIdle();
  }

  /** 沙箱 iframe 重建（脚本列表变化）时由 bridge 调：重打标记并重推快照 */
  onSandboxReboot() {
    if (!this.started) return;
    this.subscribed.clear();
    this.scan();
    this.push();
  }

  /* ---------- 内部 ---------- */

  /** DOMParser 白名单校验：只允许 <style> 或 <svg> 顶层结构；
   *  黑名单：script / foreignObject / iframe / object / embed / image 外链、
   *  on* 事件属性、javascript: 伪协议。返回首个顶层节点或 null。 */
  private sanitize(html: string): Node | null {
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(html, "text/html");
    } catch {
      return null;
    }
    /* ⚠ 独立 <style> 会被 text/html 解析器放进 <head>（svg 进 body），
     * 顶层节点必须 head+body 一起收集，否则纯样式挂载恒被拒 */
    const tops = [...doc.head.childNodes, ...doc.body.childNodes].filter(
      (n): n is Element => n.nodeType === 1
    );
    if (tops.length === 0) return null;
    if (!tops.every((el) => el.tagName === "STYLE" || el.tagName === "svg")) return null;
    const ok = tops.every((el) => this.walk(el));
    if (!ok) return null;
    /* 用导入节点（沙箱文档 → 主文档），脚本内容已在 walk 中拒绝 */
    return document.importNode(tops.length === 1 ? tops[0] : this.frag(tops), true);
  }

  private frag(els: Element[]): DocumentFragment {
    const f = document.createDocumentFragment();
    els.forEach((el) => f.appendChild(el));
    return f;
  }

  private walk(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (["script", "foreignobject", "iframe", "object", "embed", "base", "link", "meta"].includes(tag)) return false;
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) return false;
      const v = attr.value.trim().toLowerCase();
      if ((name === "href" || name.endsWith(":href") || name === "src") && /^(https?:)?\/\//.test(v)) return false;
      if (v.startsWith("javascript:")) return false;
    }
    for (const child of [...el.children]) {
      if (!this.walk(child)) return false;
    }
    return true;
  }

  /** 扫描白名单玻璃容器：打 data-fx 标记 + 挂 ResizeObserver（幂等） */
  private scan() {
    if (!this.ro) return;
    const seen = new Set<Element>();
    document.querySelectorAll<HTMLElement>(FX_SELECTOR).forEach((el) => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return; /* 隐藏中：待展示后 MO/RO 触发再标 */
      /* 全屏幕布永不打标（幕布不是玻璃块） */
      if (r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2) return;
      seen.add(el);
      if (!el.dataset.fx) {
        this.uid += 1;
        el.dataset.fx = `fx${this.uid}`;
      }
      this.ro!.observe(el);
    });
    /* 清理断连元素的标记（浮层卸载后 fxN 回收复用，避免标记无限增长） */
    document.querySelectorAll<HTMLElement>("[data-fx]").forEach((el) => {
      if (!seen.has(el)) {
        delete el.dataset.fx;
      }
    });
    /* 断连元素上的画布条目一并回收（⌘K 关闭即整棵子树卸载） */
    for (const [key, c] of [...this.canvases]) {
      if (!c.el.isConnected) {
        this.canvases.delete(key);
        this.lastPos.delete(key.split(":")[1] ?? "");
      }
    }
    this.push();
  }

  private scheduleScan() {
    if (this.rafPending) return;
    this.rafPending = requestAnimationFrame(() => {
      this.rafPending = 0;
      this.scan();
    });
  }

  private schedulePush() {
    this.push();
  }

  /** 推送白名单元素快照给全部订阅脚本（含视口坐标：折射采样定位用） */
  private push() {
    if (!this.post || this.subscribed.size === 0) return;
    const items: {
      fx: string; key: string; w: number; h: number; radius: number; x: number; y: number;
      /** 该元素上引擎画布是否仍在（React remount 会连带销毁宿主 prepend 的 canvas：
       *  引擎据此发现状态与 DOM 失同步并重建画布） */
      cv: boolean;
    }[] = [];
    document.querySelectorAll<HTMLElement>("[data-fx]").forEach((el) => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const r = el.getBoundingClientRect();
      const radiusRaw = parseFloat(getComputedStyle(el).borderRadius) || 0;
      const key =
        FX_TARGETS.find((t) => el.matches(t.sel))?.key ?? "card";
      items.push({
        fx: el.dataset.fx!,
        key,
        w,
        h,
        radius: Math.round(Math.min(radiusRaw, w / 2, h / 2)),
        x: Math.round(r.left),
        y: Math.round(r.top),
        cv: !!el.querySelector(":scope > canvas.chushi-fx-canvas"),
      });
    });
    for (const scriptKey of this.subscribed) {
      this.post({ type: "fxResize", scriptKey, items });
    }
  }

  /* ---------- 位置跟踪（transform 动画期 RO 不触发，rAF 兜底） ---------- */

  private ensureTracking() {
    if (!this.trackRaf && this.started && this.canvases.size > 0) {
      this.trackRaf = requestAnimationFrame(this.trackLoop);
    }
  }

  private stopTrackingIfIdle() {
    if (this.trackRaf && this.canvases.size === 0) {
      cancelAnimationFrame(this.trackRaf);
      this.trackRaf = 0;
    }
  }

  /** 每帧监测挂载画布的元素视口位置，变化即推送（⌘K 弹簧/拖拽期逐帧对齐） */
  private trackLoop = () => {
    this.trackRaf = 0;
    if (!this.started || this.canvases.size === 0) return;
    const moved: { fx: string; x: number; y: number }[] = [];
    for (const [key, c] of this.canvases) {
      if (!c.el.isConnected) continue;
      const fxId = key.split(":")[1] ?? "";
      const r = c.el.getBoundingClientRect();
      const prev = this.lastPos.get(fxId);
      if (!prev || Math.abs(prev.x - r.left) > 0.4 || Math.abs(prev.y - r.top) > 0.4) {
        this.lastPos.set(fxId, { x: r.left, y: r.top });
        moved.push({ fx: fxId, x: Math.round(r.left), y: Math.round(r.top) });
      }
    }
    if (moved.length > 0 && this.post && this.subscribed.size > 0) {
      for (const scriptKey of this.subscribed) {
        this.post({ type: "fxPositions", scriptKey, items: moved });
      }
    }
    this.trackRaf = requestAnimationFrame(this.trackLoop);
  };

  /** 指针变量桥：相对坐标（%）写入容器 CSS 变量 --fx-mx / --fx-my */
  private onPointer = (e: PointerEvent) => {
    let node = e.target as Element | null;
    while (node && node !== document.body && !(node instanceof HTMLElement && node.dataset.fx)) {
      node = node.parentElement;
    }
    if (!node || !(node instanceof HTMLElement) || !node.dataset.fx) return;
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) return;
    node.style.setProperty("--fx-mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(2)}%`);
    node.style.setProperty("--fx-my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(2)}%`);
  };
}

/** 全局单例 */
export const fxHost = new FxHost();
