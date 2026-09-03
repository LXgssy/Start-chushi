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
 *      事件属性、foreignObject、外部资源引用），与预设系统声明式白名单
 *      同律——宿主不执行预设携带的任何代码。
 *   2. 玻璃容器白名单标记：扫描玻璃容器选择器打 data-fx="fxN"（幂等），
 *      预设 CSS 经 [data-fx="fxN"] 触达宿主玻璃元素。选择器清单是产品
 *      契约（与 README「自定义动画与面板样式」元素钩子表同步维护）。
 *   3. resize 桥：ResizeObserver 跟踪白名单元素（w/h/圆角/语义键），
 *      变化即推送订阅中的沙箱脚本（液态玻璃贴图按元素尺寸重生成）。
 *   4. 指针变量桥：指针在玻璃容器内移动时把相对坐标写为容器上的
 *      --fx-mx / --fx-my（百分比字符串，rAF 节流）——预设 CSS 用
 *      var(--fx-mx) 做镜面高光，无需任何 JS 回调。
 *
 * 安全边界：
 *   - 白名单元素之外宿主一概不碰；全屏幕布（⌘K/链接对话框遮罩）永不
 *     打标（幕布不是玻璃块——v1.1.0 实证：全屏贴图边缘位移会拉丝擦除背景）；
 *   - mount 的 html 不含可执行向量（见校验函数）；≤192KB/挂载；
 *   - 预设删除 / 沙箱冻结 / 页面卸载时该预设的挂载与订阅全部回收。
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

interface MountEntry {
  scriptKey: string;
  fxId: string;
  el: HTMLElement;
}

class FxHost {
  private root: HTMLElement | null = null;
  private mounts = new Map<string, MountEntry>(); // `${scriptKey}:${fxId}` → entry
  private subscribed = new Set<string>(); // scriptKey → 收 resize 推送
  private ro: ResizeObserver | null = null;
  private mo: MutationObserver | null = null;
  private uid = 0;
  private rafPending = 0;
  private started = false;
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

  /** 该预设的挂载与订阅全部回收（预设删除 / 脚本冻结 / 沙箱重建） */
  cleanup(scriptKey: string) {
    for (const [key, m] of [...this.mounts]) {
      if (m.scriptKey === scriptKey) {
        m.el.remove();
        this.mounts.delete(key);
      }
    }
    this.subscribed.delete(scriptKey);
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

  /** 推送白名单元素快照给全部订阅脚本 */
  private push() {
    if (!this.post || this.subscribed.size === 0) return;
    const items: { fx: string; key: string; w: number; h: number; radius: number }[] = [];
    document.querySelectorAll<HTMLElement>("[data-fx]").forEach((el) => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const radiusRaw = parseFloat(getComputedStyle(el).borderRadius) || 0;
      const key =
        FX_TARGETS.find((t) => el.matches(t.sel))?.key ?? "card";
      items.push({
        fx: el.dataset.fx!,
        key,
        w,
        h,
        radius: Math.round(Math.min(radiusRaw, w / 2, h / 2)),
      });
    });
    for (const scriptKey of this.subscribed) {
      this.post({ type: "fxResize", scriptKey, items });
    }
  }

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
