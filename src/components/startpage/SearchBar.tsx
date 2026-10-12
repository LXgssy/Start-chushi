"use client";

/* 「初始」— 搜索栏（beta 重写架构）
 *
 * 结构律：布局锚点恒占静息尺寸（h-14）；表单脱流绝对定位、自锚点向下生长
 * ——建议下拉就是搜索栏本体的延伸（同一块玻璃面），展开时直接覆盖在快捷
 * 服务上方，页面布局零位移。
 *
 * 动效分工：
 *  · 高度展开 = framer height 动画（显式公式 58+n×40 而非 auto——聚焦态表单
 *    自带 scale(1.015)，framer 对 auto 的一次性测量会被变换污染）；
 *  · 列表浮现 = 常驻 DOM + data-open CSS 过渡（v8.7.2 ㊸：AnimatePresence
 *    条件重挂 + framer WAAPI opacity 空窗是「出现闪动一拍」的根因，
 *    panel-fade 教训同族——常驻结构 + visibility 离散插值免疫）；
 *  · 行级联入场 = v8.7.3 展开动画打磨：showDrop false→true 边沿【渲染期】
 *    挂 .sug-cascade（与首帧行同 commit，零空窗），SUG_CASCADE_MS 后摘除——
 *    逐行 opacity+y+blur 升起聚拢（globals.css sug-row-in-kf）；窗口内结果
 *    替换（真实网络二次 fetch 落地）新行同样级联，弹出中「第一行复位」的
 *    换装硬切同步消除；窗口后换装零动画零噪音；
 *  · 行级联退场 = v8.7.4 ㊺：收起同帧挂 .sug-cascade-out（showDrop
 *    true→false 边沿渲染期派生，与 data-open 移除同 commit）——建议字样
 *    逐行下沉模糊散场（globals.css sug-row-out-kf，入场同参反向），
 *    SUG_OUT_MS 后摘除（容器已 hidden，无回闪）；收起不再只有容器 opacity
 *    硬淡出；
 *  · 高亮持久 = v8.7.3：fetch 回调不再 setActive(-1)——悬停/键选高亮跨
 *    重取保留（旧实现二次 fetch 落地即清高亮 = 「第一行复位」第二根因；
 *    鼠标不动无新 mouseenter，高亮清后不会自愈），越界索引自然失活、
 *    位移键位自校正，与桌面 omnibox 行为同构；
 *  · 玻璃壳体入场 = CSS pill-shell-in（globals.css，祖先 opacity/filter 禁律）。
 *
 * 联想源：百度 sugrec JSONP（免 CORS、免密钥、国内可达）；扩展环境（MV3 CSP
 * 禁跨域脚本注入）改 fetch 直取。词表只作「输入联想」，回车仍用当前所选引擎
 * 检索，与引擎语义解耦。3s 超时/出错静默降级为无建议，不阻塞输入。
 */

import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, Search } from "lucide-react";
import {
  WEB_ENGINES,
  SITE_ENGINES,
  getEngine,
  looksLikeUrl,
  toUrl,
} from "@/lib/startpage/engines";
import { openExternalUrl } from "@/lib/startpage/nav";
import type { Settings } from "@/lib/startpage/types";

const EASE = [0.22, 1, 0.36, 1] as const;
/** 建议行高恒定 40px；下拉总高 = 58 + 行数×SUG_ROW_H（58 = 内容 56 + 上下 1px
 *  边框，border-box）。收起 56 时输入行在 54px 内容盒中上下各溢 1px 空白带，
 *  无可见裁切 */
const SUG_ROW_H = 40;
const SUG_MAX = 10;
/** 级联窗口：展开首帧行逐行入场（末行延迟 9×24ms + 0.26s ≈ 476ms）+ 覆盖
 *  窗口内结果替换（防抖 180ms + 网络往返典型 <500ms 落在窗内） */
const SUG_CASCADE_MS = 520;
/** 退场窗（v8.7.4 ㊺）：收起行级联散场（末行延迟 5×14ms + 0.22s ≈ 290ms）
 *  + 容器 visibility hidden（0.3s）后摘类的安全余量。摘类时容器已不可见，
 *  行回稳态无闪现；窗内重开由渲染期边沿即刻清类并重播入场 */
const SUG_OUT_MS = 340;
/** 行清空延迟（v8.7.4 ㊺）：收起主路径（失焦/清词）行保留 SUG_CLEAR_MS 供
 *  退场级联播完再卸载（立即 setSugs([]) = 行同帧卸载，退场动画无行可播）。
 *  比 SUG_OUT_MS 长 120ms：摘类（340）先行，清行（460）后行——轮询/门面
 *  无同帧竞态。Esc 与 fetch 空结果仍是 setSugs([]) 立即硬清（无退场语义） */
const SUG_CLEAR_MS = 460;
/** 联想防抖 */
const SUG_DEBOUNCE_MS = 180;
/** 联想请求超时 */
const SUG_TIMEOUT_MS = 3000;

/* ============================================================================
 * v8.7.79 上浮/下沉动画（终局方案：双向通道拆分——transform 老通道回归
 * 保观感 + 描边 overlay 布局隔离根治位移）
 * 聚焦「四周均匀生长 1.5%」、取消选中回落，曲线/时长与旧版完全同参
 * （0.5s cubic-bezier(0.22,1,0.36,1)）。
 *
 * 用户终局裁定（v8.7.78 实测反馈）：「能不能在使用老代码的同时把描边位移
 * 的问题修复，现在的效果跟以前完全没法比」——布局通道（v8.7.77 zoom /
 * v8.7.78 四值 calc）虽然几何等价，但每帧真实重排+全量重栅格化+磨砂逐帧
 * 重取样的开销在真机上直接踩扔帧率/顺滑度，观感与 v8.7.65–67 的 transform
 * 合成器通道完全无法相比。观感必须回到老通道，位移必须在老通道上根治。
 *
 * 根因终局论证（在 v8.7.77 定案「transform 合成层动画使 backdrop-filter
 * 玻璃子层栅格相位与布局几何脱节」之上再深一层——可分离性）：
 *   历轮用户取证（视频 l2wfvu0080j / l2ud8ayyd71 + 流畅模式对照）抱怨的
 *   始终只有「描边」位移（1px 高对比细线半像素跳变极其显眼），磨砂内容
 *   平滑跟踪从未被抱怨——说明受害面可以与磨砂本体分离。而描边（常驻
 *   border + 聚焦 ring）v8.7.68 起全部画在 glass（backdrop-filter 层）
 *   上：backdrop-filter 效果在栅格阶段应用，其重栅格化与祖先 transform
 *   合成矩阵耦合（分数 DPR 下相位脱节不受控）——描边像素恰好在唯一的
 *   相位抽奖载体上，这是 v8.7.68–78 九轮补丁（环同层化/栅格钉死/玻璃
 *   摘插/整树摘插/双退役/描边移层/真 border/zoom/calc）全部失败的共性：
 *   描边始终没离开过玻璃层/transform 子树。
 *   纯矢量绘制层（无 backdrop-filter）的栅格化永远发生在自身 1:1 布局
 *   坐标系；祖先 transform 只在合成阶段整体变换显示、不改变层内纹理
 *   相位；动画收尾矩阵归 1 = 显示恢复层纹理原样 = 布局几何精确——零
 *   跳变是物理保证，不再赌任何「下一次重栅格化落对相位」。
 *
 * v8.7.79 拆分：
 *   ① transform 通道回归（观感保真）：rAF 逐帧写内层 .search-float 的
 *      transform = scale(1+0.015p)——v8.7.65–67 老代码同款合成器插值。
 *      载体放 float（form 内 relative 流内盒）而非 form 本身：描边 ring
 *      层是 form 直子层（float 兄弟），transform 必须写在 float 才能让
 *      ring 留在 transform 子树之外（写在 form 上则 ring 被双重缩放）。
 *      磨砂重取样由每帧 transform 样式提交的主帧照常承载（新律⑬，与
 *      v8.7.65 同机制同节拍）。
 *   ② 描边布局通道（位移根治）：新独立层 .search-ring（form 直子层、
 *      absolute inset-0、pointer-events-none），承接全部描边（常驻 border
 *      + 聚焦 ring-1 box-shadow，自 glass 层迁出）；rAF 同进度写中心对称
 *      四值：left/top = -(0.75×p)%，width/height = calc(100%+(1.5×p)%)，
 *      与 transform scale(1+0.015p) 几何逐位等价（inset-0 拉伸盒上
 *      over-constrained 时 right/bottom 被规范忽略，四值恒中心对称）。
 *      同一 rAF 回调内双写（transform 先、四值后）= 同一次样式提交同
 *      一帧，双通道几何同步无隙。
 *   ③ glass 层回归 v8.7.67 纯净态：只余磨砂+底色（border 随描边退役，
 *      outline 0.02px paint-bounds 保险保留）；收尾无摘插/无脉冲/无
 *      outline 写——不制造任何额外重栅格化诱因。glass 自身的栅格相位
 *      在 transform 通道下仍可能亚像素抽奖，但受害面只剩磨砂纹理
 *      （低对比模糊，不可辨），用户可见的描边位移物理性消失。
 * 驻留态：transform=scale(1.015) 常驻 + ring 常量 calc（纯 CSS 自适应：
 *   建议展开 framer 改 form 高时 height:calc(100%+1.5%) 随每次布局自动
 *   跟随，零 JS）；静息 = 双通道 inline 全移。floatScaleRef 跨次聚焦
 *   续接语义不变（存进度 p∈[0,1]）。quick blur 分支（from≈to）同笔落
 *   终态保持双通道一致。
 * ==========================================================================*/
const FLOAT_PCT = 1.5;
const FLOAT_HALF = 0.75;
const FLOAT_MS = 500;

/** CSS cubic-bezier(x1,y1,x2,y2) 同义解算（牛顿迭代 + 二分兜底）——旧版
 *  transition 缓动曲线在 rAF 通道的等价实现 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return sampleY(t);
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-7) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      t = (lo + hi) / 2;
      if (sampleX(t) < x) lo = t;
      else hi = t;
    }
    return sampleY(t);
  };
}
const floatEase = cubicBezier(0.22, 1, 0.36, 1);

/** v8.7.96 描边环生长改走 transform（对齐 ChuShi-NewTab v1.7.4 的成熟做法）：
 *  v1.7.4 里磨砂/描边/内容同在一个元素上，聚焦生长 = 一条 CSS 过渡的
 *  scale(1.015)，没有任何 rAF 逐帧改布局，故不存在「描边收尾外扩」。
 *  本函数此前逐帧写 left/top/width/height（触发布局），而 ring 上还挂着
 *  box-shadow 0.5s 过渡——每帧布局失效使那圈描边的绘制被拖到动画之后才落定，
 *  即用户所见的「上浮播完后描边整圈往外扩」。
 *  改为写 transform: scale(1 + 0.015p)：合成器操作，不改布局、无逐帧重绘；
 *  几何与 float 通道（同为以 form 盒中心对称的 scale）逐位一致；p=0 清 inline
 *  回 inset-0 基线。 */
function applyFloatProgress(el: HTMLDivElement | null, p: number) {
  if (!el) return;
  if (p <= 0) {
    el.style.transform = "";
    return;
  }
  el.style.transform = "scale(" + (1 + (FLOAT_PCT / 100) * p).toFixed(5) + ")";
}

/** v8.7.79 上浮 transform 通道落笔（v8.7.65 老代码通道原样回归）：p=0 移除
 *  inline（回级联基态），p∈(0,1] 写 scale(1+0.015p)（合成器插值，观感与
 *  v8.7.65–67 完全一致）。 */
function applyFloatScale(el: HTMLDivElement | null, p: number) {
  if (!el) return;
  if (p <= 0) {
    el.style.transform = "";
    return;
  }
  el.style.transform = `scale(${(1 + (FLOAT_PCT / 100) * p).toFixed(5)})`;
}

/** v8.7.81 磨砂底板裁剪通道（v8.7.80 布局通道的抖动/复位根修）：底板几何
 *  恒定（CSS 静态 = 聚焦态尺寸，永不写 layout/transform），生长由 clip-path
 *  承载——纯绘制通道、逐帧单调、终帧物理落在静息几何，不存在「等合成器追赶」
 *  的中间相位；也不产生 v8.7.80 布局通道那样的每帧重排 + 磨砂全量重渲染开销。
 *  p=0 移除 inline（回 CSS 静息 inset），p>0 居中对称裁开。 */
function applyGlassClip(el: HTMLDivElement | null, p: number) {
  if (!el) return;
  if (p <= 0) {
    el.style.clipPath = "";
    return;
  }
  const rest = FLOAT_HALF / (1 + FLOAT_PCT / 100);   // 静息裁边（底板坐标系 %）
  el.style.clipPath = `inset(${(rest * (1 - p)).toFixed(4)}% round 28px)`;
}

/** 百度 sugrec 联想源（扩展环境 fetch 直取 / 网页版 JSONP） */
function fetchSuggest(q: string, cb: (list: string[]) => void) {
  if (location.protocol === "chrome-extension:") {
    const timer = window.setTimeout(() => cb([]), SUG_TIMEOUT_MS);
    fetch(`https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(q)}&cb=cb`)
      .then((r) => r.text())
      .then((t) => {
        window.clearTimeout(timer);
        try {
          const m = t.match(/\(([\s\S]*)\)\s*;?\s*$/);
          const parsed = m ? JSON.parse(m[1]) : null;
          const g = Array.isArray(parsed?.g) ? parsed.g : [];
          cb(g.map((x) => String(x?.q ?? "")).filter(Boolean));
        } catch {
          cb([]);
        }
      })
      .catch(() => {
        window.clearTimeout(timer);
        cb([]);
      });
    return;
  }
  const name = `__chushi_sug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const w = window as unknown as Record<string, unknown>;
  const script = document.createElement("script");
  let settled = false;
  const done = (list: string[]) => {
    if (settled) return;
    settled = true;
    w[name] = undefined;
    script.remove();
    window.clearTimeout(timer);
    cb(list);
  };
  const timer = window.setTimeout(() => done([]), SUG_TIMEOUT_MS);
  w[name] = (data: { g?: Array<{ q?: string }> }) => {
    const g = Array.isArray(data?.g) ? data.g : [];
    done(g.map((x) => String(x?.q ?? "")).filter(Boolean));
  };
  script.src = `https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(q)}&cb=${name}`;
  script.onerror = () => done([]);
  document.head.appendChild(script);
}

/* ============================================================================
 * v8.7.60 直搜站点品牌简标（用户：「直搜选项左边都有一个点，改成站点图标」）
 * 色点退役；改品牌色圆角方块底 + 白色标识形。内联 SVG 零网络零异步——
 * 选择器小弹窗不适配 favicon 多源回退的加载闪烁与失败回落；形标取各站
 * 公认符号的极简摹写：B站=TV、GitHub=octocat、知乎=知、抖音=音符。
 * 底色沿用 engines.ts 的 color 字段（品牌色语义不变，只是从点变底）。
 * ==========================================================================*/
const SITE_GLYPHS: Record<string, ReactNode> = {
  bilibili: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3.2 10.4 6M16 3.2 13.6 6" />
      <rect x="4" y="6" width="16" height="12.2" rx="3" />
      <path d="M9.3 12.4h.01M14.7 12.4h.01" strokeWidth="2.7" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  ),
  zhihu: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <text
        x="12"
        y="17.6"
        textAnchor="middle"
        fontSize="14"
        fontWeight="600"
        fontFamily="-apple-system,'PingFang SC','Microsoft YaHei UI',sans-serif"
      >
        知
      </text>
    </svg>
  ),
  douyin: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {/* v8.7.61 音符居中：路径实绘 bbox x∈[7.3,21.4] y∈[3,19.5]，质心
          (14.35,11.25) 偏右上——translate(-2.35,0.75) 归中到 (12,12) */}
      <path
        transform="translate(-2.35 0.75)"
        d="M17.6 3c.4 2.1 1.7 3.4 3.8 3.6v2.7c-1.4 0-2.7-.4-3.8-1.2v6c0 3.3-2.3 5.4-5.3 5.4-2.9 0-5-2.1-5-4.9 0-3 2.5-5.1 5.8-4.8v2.8c-1.7-.3-3.1.6-3.1 2 0 1.3 1 2.2 2.4 2.2 1.5 0 2.5-1 2.5-2.7V3h2.7z"
      />
    </svg>
  ),
};

function SiteGlyph({ id, color }: { id: string; color?: string }) {
  return (
    <span
      aria-hidden
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] text-white"
      style={{ background: color ?? "#71717a" }}
    >
      <span className="flex h-3 w-3 items-center justify-center [&>svg]:h-full [&>svg]:w-full">
        {SITE_GLYPHS[id]}
      </span>
    </span>
  );
}

function SearchHint({ query, above }: { query: string; above: boolean }) {
  return (
    <div
      className={`pointer-events-none flex h-4 justify-center ${above ? "mb-3" : "mt-3"}`}
    >
      <AnimatePresence>
        {query.trim() && (
          <motion.p
            initial={{ opacity: 0, y: above ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: above ? 4 : -4 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="search-hint text-[11px] font-light tracking-wider text-zinc-400 dark:text-zinc-500"
          >
            ↩ 直接前往{looksLikeUrl(query) ? "该网址" : ""}
            　·　Alt + ↩ 新标签页打开
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function SearchBar({
  settings,
  onPatchSettings,
}: {
  settings: Settings;
  onPatchSettings: (patch: Partial<Settings>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  /* v8.7.79 transform 载体层 ref（glass/clip 的父盒）：上浮 scale 插值
     落点（v8.7.65 老通道回归，机制见文件头 v8.7.79 注释块）；
     floatScaleRef 跨次聚焦续接（快速切换从当前生长进度起步，不回跳）。
     v8.7.77 的 pillRef 随 zoom 通道退役（form 不再被直接驱动，缩放落在
     内层载体，v8.7.79 双通道拆分后仍落在 float）。 */
  const floatRef = useRef<HTMLDivElement>(null);
  /* v8.7.79 描边环独立层 ref（form 直子层、transform 子树外；机制见
     文件头 v8.7.79 注释块）——四值插值落点，与 floatScaleRef 同源同进度 */
  const ringRef = useRef<HTMLDivElement>(null);
  /* 玻璃底板 ref：v8.7.77 起不再对玻璃做摘插/伴随写，ref 仅保留结构位
     （背景层语义标记）；内容裁剪层同。 */
  const glassRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const floatScaleRef = useRef(1);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [sugs, setSugs] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const engine = getEngine(settings.engineId);
  const suggestOn = settings.searchSuggest;

  /* 页面级快捷键通过事件请求聚焦搜索框；可携带欲直输的首字符
     （v8.7.55→v8.7.60 曾有的聚焦壁纸联动已整体退役：v8.7.61 用户裁定
     「把选中搜索框后壁纸放大/缩小的效果删了」，html.search-float 随之撤销） */
  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent).detail as { char?: string } | undefined;
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const ch = detail?.char;
      if (ch) {
        const next = input.value + ch;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(input, next);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.setSelectionRange(next.length, next.length);
      } else {
        input.select();
      }
    };
    window.addEventListener("start:focus-search", onFocus);
    return () => window.removeEventListener("start:focus-search", onFocus);
  }, []);

  /* 联想获取：开关开启 + 聚焦 + 非空非 URL 词 → 防抖后请求；
     关闭/失焦/清空即收起；URL 形态输入无需联想。
     v8.7.4 ㊺ 收起分支改延迟清空：行保留 SUG_CLEAR_MS 让级联退场真实
     播完（blur 同帧行仍在 → cascade-out 挂上即有行可动画），重开/继续
     打字走 cleanup 取消清空 = 行直接复用换装零卸载；清空落地时容器已
     hidden 240ms，行卸载零可见。Esc/fetch 空结果两条硬清路径不经此门 */
  useEffect(() => {
    const q = query.trim();
    if (!suggestOn || !focused || !q || looksLikeUrl(q)) {
      const c = window.setTimeout(() => {
        setSugs([]);
        setActive(-1);
      }, SUG_CLEAR_MS);
      return () => window.clearTimeout(c);
    }
    let alive = true;
    const t = window.setTimeout(() => {
      fetchSuggest(q, (list) => {
        /* v8.7.3 高亮持久：不再 setActive(-1)——二次 fetch 落地即清高亮 =
           「第一行复位」根因（鼠标不动无新 mouseenter，清后不自愈）；
           越界索引自然失活（i===active 无匹配），↑↓ 取模自校正 */
        if (alive) setSugs(list.slice(0, SUG_MAX));
      });
    }, SUG_DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [query, focused, suggestOn]);

  /* v8.7.79 上浮/下沉动画主通道（双向通道拆分，机制详见文件头 v8.7.79
     注释块）：transform 通道（float，v8.7.65 老代码原样回归保观感）+
     描边布局通道（ring 独立层四值插值根治位移），同一 rAF 同进度双写。
     聚焦期间投影（form）/描边环（ring 层）淡入淡出仍走 box-shadow 纯
     绘制通道（className 切换 + CSS transition），与本动画并行互不干扰。
     v8.7.65–v8.7.78 的九轮补丁与 zoom/calc 通道全部退役，机制考古见
     git 历史 v8.7.68–78 提交说明。 */
  useEffect(() => {
    const float = floatRef.current;
    if (!float) return;
    const ring = ringRef.current;
      const glass = glassRef.current;   // v8.7.80 磨砂底板走同一布局通道
    const from = floatScaleRef.current;
    const to = focused ? 1 : 0;
    if (Math.abs(to - from) < 0.0005) {
      floatScaleRef.current = to;
      /* quick 分支：终态同笔落定（聚焦驻留 = scale(1.015)+常量 calc；
         静息 = 双通道 inline 全移——与动画收尾终态完全同形） */
      applyFloatScale(float, to);
      applyFloatProgress(ring, to);
      applyGlassClip(glass, to);
      return;
    }
    let raf = 0;
    let settled = false;
    const t0 = performance.now();
    const settle = () => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(bail);
      /* 终态落定：静息双通道 inline 全移（float transform 归级联基态、
         ring 回 inset-0 布局基线）；聚焦驻留 transform=scale(1.015) +
         ring 常量 calc（% 值随 form 高度变化纯 CSS 自适应）。无摘插/
         无脉冲/无 outline 写——收尾不制造任何额外重栅格化诱因。 */
      floatScaleRef.current = to;
      applyFloatScale(float, to);
      applyFloatProgress(ring, to);
      applyGlassClip(glass, to);
    };
    /* 双保险收尾：①p≥0.999 早收（ease 尾段剩余几何差 <0.01px，视觉零差，
       不为最后 0.1% 等一帧）；②超时兜底（掉帧/帧调度停滞下收尾不悬挂，
       兜底写终值与逐帧路径同形，中途静止无视觉差） */
    const bail = window.setTimeout(settle, FLOAT_MS + 100);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / FLOAT_MS);
      if (p >= 0.999) {
        settle();
        return;
      }
      const cur = from + (to - from) * floatEase(p);
      floatScaleRef.current = cur;
      /* 双通道同帧同进度写入：同一 rAF 回调内 transform 先、四值后，
         同一次样式提交同一次主帧——两通道几何逐位同步（公式等价性见
         文件头注释）。磨砂重取样由每帧 transform 样式提交的主帧照常
         承载（v8.7.65 新律⑬原机制原节拍）。 */
      applyFloatScale(float, cur);
      applyFloatProgress(ring, cur);
        applyGlassClip(glass, cur);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(bail);
    };
  }, [focused]);

  function navigate(url: string, newTab: boolean) {
    /* 扩展壳 iframe 内提升到顶层框架（拒绝连接修复）；网页版行为不变 */
    openExternalUrl(url, newTab);
  }

  function submit(newTab: boolean, word?: string) {
    const q = (word ?? query).trim();
    if (!q) return;
    if (looksLikeUrl(q)) navigate(toUrl(q), newTab);
    else navigate(engine.search(q), newTab);
  }

  const showDrop = suggestOn && focused && sugs.length > 0;

  /* 级联窗口（v8.7.3 入场 / v8.7.4 ㊺ 退场）：showDrop 边沿在【渲染期】挂类
     （官方「渲染期间调整 state」模式，PanelStage 相位机同款）——类与首帧行
     / 末帧行同 commit 提交，CSS 动画从边沿帧起播零空窗（effect 里挂会晚
     一帧 = 行先裸态跳变，正是要消灭的那一拍）。开：挂 .sug-cascade（逐行
     升起聚拢）、清 .sug-cascade-out；关：挂 .sug-cascade-out（逐行下沉
     模糊散场，globals.css sug-row-out-kf，与 data-open 移除同帧——退场
     动画与容器淡出并行起播）、清 .sug-cascade。计时摘除走 effect（渲染期
     不能起定时器）。 */
  const [cascade, setCascade] = useState(false);
  const [cascadeOut, setCascadeOut] = useState(false);
  const [prevShow, setPrevShow] = useState(showDrop);
  if (prevShow !== showDrop) {
    setPrevShow(showDrop);
    if (showDrop) {
      setCascade(true);
      setCascadeOut(false);
    } else {
      if (cascade) setCascade(false);
      setCascadeOut(true);
    }
  }
  useEffect(() => {
    if (!cascade) return;
    const t = window.setTimeout(() => setCascade(false), SUG_CASCADE_MS);
    return () => window.clearTimeout(t);
  }, [cascade]);
  useEffect(() => {
    if (!cascadeOut) return;
    const t = window.setTimeout(() => setCascadeOut(false), SUG_OUT_MS);
    return () => window.clearTimeout(t);
  }, [cascadeOut]);

  return (
    <div className="cl-search relative w-[min(92vw,580px)]">
      {/* 操作提示：建议开启时置于搜索框上方（与下拉展开方向对称） */}
      {suggestOn && <SearchHint query={query} above />}

      <div className="relative h-14">
        <motion.form
          role="search"
          initial={false}
          animate={{ height: showDrop ? 58 + sugs.length * SUG_ROW_H : 56 }}
          transition={{ duration: 0.32, ease: EASE }}
          onSubmit={(e) => {
            e.preventDefault();
            submit(false, active >= 0 ? sugs[active] : undefined);
          }}
          onKeyDown={(e) => {
            /* Alt/⌘/Ctrl + Enter → 新标签页打开（SubmitEvent 不携带修饰键） */
            if (e.key === "Enter" && (e.altKey || e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit(true, active >= 0 ? sugs[active] : undefined);
              return;
            }
            /* 建议键位：↑↓ 循环高亮，Esc 收起 */
            if (e.key === "ArrowDown" && showDrop) {
              e.preventDefault();
              setActive((a) => (a + 1) % sugs.length);
            } else if (e.key === "ArrowUp" && showDrop) {
              e.preventDefault();
              setActive((a) => (a - 1 + sugs.length) % sugs.length);
            } else if (e.key === "Escape" && showDrop) {
              setSugs([]);
              setActive(-1);
            }
          }}
          /* v8.7.79：上浮 scale 落内层 .search-float（rAF 逐帧 transform，
             v8.7.65 老通道回归保观感），描边环落 .search-ring 独立层
             （四值布局插值，位移根治）——双向通道拆分机制见文件头
             v8.7.79 注释块与各自层位注释；聚焦态几何变更 = transform
             样式提交（每帧主帧，磨砂重取样照常）；top 位移通道退役
             （v8.7.64 方案观感不符旧版，用户裁定）；v8.7.77 form zoom
             通道（拉伸盒横向被吞+原点左上）与 v8.7.78 四值 calc 通道
             （布局级每帧全量重栅格化，真机观感大幅退化）随拆分退役。
             v8.7.63：聚焦/取消选中的投影 + 框外描边环走 box-shadow 纯
             绘制通道（大模糊投影 + ring 同拍淡入淡出），描边形态与
             v8.7.54 完全一致不动。
             v8.7.62：取消选中后下边描边不均匀根修——裁剪职责下放到内容
             裁剪层（输入行+建议列表包裹层），底板描边脱离 clip 边界，
             四边同参渲染。
             v8.7.61：底板跟随根修——backdrop-filter 不再与变换同元素
             （Chrome 对同元素磨砂取样区不随缩放重算 → 上浮后底板脱框、
             描边读感位移的根因），玻璃底板拆独立子层（本结构至今沿用）。 */
          className={`search-pill group absolute inset-x-0 top-0 z-30 flex flex-col rounded-[28px] ${
            focused
              ? "shadow-[0_10px_50px_-8px_rgba(0,0,0,0.25)]"
              : ""
          }`}
        >
          {/* v8.7.80 玻璃底板迁出 transform 子树（磨砂层禁钉死律·终版）：
              用户隔离实验已定案「动画 transform × 磨砂层」的组合是位移根因
              （开流畅模式关停全部 backdrop-filter 后位移消失）。v8.7.79 只把
              描边 ring 搬出 transform 子树，磨砂底板仍在 .search-float 内 →
              磨砂面本身仍走合成器通道，重渲染被推迟，肉眼可见的依旧是同一条
              「卡在左上」的边。
              本版把磨砂底板一并交给 applyFloatProgress（与 ring 同一函数、同一
              -- 中心对称四值 left/top=-(0.75p)% + width/height=calc(100%+1.5p)%），
              DOM 上从 .search-float 内移到 form 直子层（先于 float → 绘制层级
              不变）：磨砂层从此不在任何被 transform 的子树内，几何由布局确定，
              不存在「等待合成器追赶」的中间相位；内容仍走 transform 老通道
              （观感与 v8.7.65–67 一致），描边仍走独立 ring 层。三者在同一 rAF
              回调内同帧写入，磨砂边与描边边逐位重合。 */}
          {/* 玻璃底板：磨砂/底色在这层（.glass-pill 变体规则全部命中子层），
              pointer-events 穿透、随表单整体移动（高度动画跟随）。
              v8.7.79 描边退役出玻璃层：常驻 border 与聚焦 ring 全部迁到
              .search-ring 独立层（描边像素必须离开 backdrop-filter 相位
              抽奖载体与 transform 子树，机制见文件头 v8.7.79 注释块），
              本层回归 v8.7.67 纯净态（只余磨砂+底色，border 由 globals.css
              限定搜索框实例退役）；v8.7.68 引入的 0.02px 亚像素透明
              outline paint-bounds 保险保留（恒定基线零扰动）。
              v8.7.68 描边环下沉到本层的历史（已随 v8.7.79 迁出）：环原画
              在 form（缩放载体）的 box-shadow 上，非整数 DPR 真机下沉结束
              的重栅格化里 ring 与 glass border 各自 snap 导致跳变，当时以
              「同层同次栅格化」对冲——实测未能根治（环与 border 仍在相位
              抽奖载体上，历轮取证描边依旧位移）。 */}
          <div
            ref={glassRef}
            aria-hidden
            className="glass-pill backdrop-blur-2xl backdrop-saturate-150 pointer-events-none absolute inset-0 rounded-[28px]"
            style={{ outline: "0.02px solid transparent" }}
          />
          {/* v8.7.79 transform 载体层：glass/clip 的父盒，聚焦上浮的 scale
              插值打在本层（v8.7.65 老通道原样回归，机制见文件头 v8.7.79
              注释块——描边 ring 层是本层的兄弟，transform 写在本层才能让
              ring 留在 transform 子树之外）。relative 流内盒（无 absolute
              拉伸约束——v8.7.77 zoom 写在拉伸盒上横向被吞、原点左上角的
              观感教训），h-full/w-full 为静息基线；shrink-0 必须——flex-col
              主轴上生长后的高（form 高×1.015）会被默认 flex-shrink:1 压回
              容器高，纵向生长静默失效（e2e G2 hR=1.0 实锤）。transform
              不改布局，本层占位与 form 内布局零扰动（观感与 v8.7.65–67
              完全同构：合成器插值、每帧主帧承载磨砂重取样）。 */}
          <div ref={floatRef} className="search-float relative flex h-full w-full shrink-0 flex-col">
          {/* v8.7.62 内容裁剪层：裁剪职责自 form 下放（form 撤 overflow-hidden
              ——否则底板描边压在裁剪线上被抗锯齿吃半像素，下边发虚不匀）；
              h-full+min-h-0 跟随表单高度动画收缩，rounded-[28px] 承担
              建议行底部圆角裁剪（与原 form 裁剪同参同位） */}
          <div ref={clipRef} className="relative h-full min-h-0 overflow-hidden rounded-[28px]">
          {/* 输入行：恒居顶部、高度锁定；建议列表在其下，由表单 height 动画整体
              揭示。transition 只含默认属性表（不含 height）——禅雾化与聚焦缩放/
              阴影照常，且不与 framer 逐帧内联 height 打架 */}
          <div className="relative flex h-14 shrink-0 items-center gap-2 px-3">
            {/* 引擎选择
                v8.7.66 弹窗位移根修（用户：「搜索框浮起状态点引擎切换，弹窗会位移」）：
                旧链 = mousedown 点 Trigger → 输入框 blur → 浮起态塌陷（rAF scale
                1.015→1 动画 0.5s）→ Radix 在动画中途测量锚点矩形开弹窗 → 表单
                继续回落、锚点随缩放漂移数 px → 弹窗停在被测位置与扳机错位。
                修复 = 焦点保持三件套：①Trigger onMouseDown preventDefault
                （浏览器不转移焦点，输入框全程持焦，浮起态稳如磐石）；
                ②Content onOpenAutoFocus/onCloseAutoFocus preventDefault
                （Radix 开/关都不夺焦/还焦扳机）；③选项 onMouseDown
                preventDefault（选引擎同样不 blur）。锚点几何全程静止，
                弹窗物理上无位移可发生 */}
            <Popover.Root>
              <Popover.Trigger
                aria-label="切换搜索引擎"
                onMouseDown={(e) => e.preventDefault()}
                className="search-trigger flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-normal tracking-wide text-zinc-500 transition-colors duration-300 hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                <span>{engine.name}</span>
                <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={1.5} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  sideOffset={10}
                  align="start"
                  /* v8.7.66 焦点保持（位移根修配套）：开/关弹窗都不动焦点
                     ——开时不夺焦（防输入框 blur 塌浮起态），关时不还焦扳机 */
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  onCloseAutoFocus={(e) => e.preventDefault()}
                  /* v8.7.60 材质统一（用户：「弹窗面板材质没有统一成磨砂玻璃」）：
                     原白底 85% 太实，模糊层几乎不可见；改与 .glass-card
                     （设置/便签等全 app 面板基准材质）同参：62% 底 +
                     blur(20px) saturate(1.5)，深色 60% 底同源 */
                  className="z-50 w-44 overflow-hidden rounded-xl border border-[rgba(24,22,36,0.09)] bg-white/[0.62] shadow-xl backdrop-blur-[20px] backdrop-saturate-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-[rgba(255,255,255,0.08)] dark:bg-[#16161b]/60"
                >
                  <div className="p-1.5">
                    {/* v8.7.55 引擎选择器分组：搜索引擎 / 站内直搜（四站并入，
                       退役原建议下拉底部直达行）。v8.7.60：直搜项名字前
                       站点色点升级为品牌简标，选中态改选框框住 */}
                    <p className="px-3 pb-1 pt-1.5 text-[10px] font-extralight tracking-widest text-zinc-400 dark:text-zinc-500">
                      搜索引擎
                    </p>
                    {WEB_ENGINES.map((e) => (
                      <Popover.Close
                        key={e.id}
                        onClick={() => onPatchSettings({ engineId: e.id })}
                        onMouseDown={(ev) => ev.preventDefault()}
                        /* v8.7.60 选中态（用户裁定）：对勾退役，改选框框住整行
                           （ring 内沿 1.5px，box-shadow 通道不挤布局）；
                           v8.7.61：框色跟强调色 var(--ui-accent)（用户裁定），
                           transition 显式含 box-shadow 让框的出现/消失顺滑；
                           v8.7.66：选框内填灰底（用户裁定「选中的引擎框里
                           填充灰色」），亮/暗同参两列表一致 */
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-600 transition-[background-color,box-shadow] duration-150 hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/10 ${
                          e.id === settings.engineId
                            ? "bg-zinc-200/70 ring-[1.5px] ring-inset ring-[color:var(--ui-accent)] dark:bg-white/10"
                            : ""
                        }`}
                      >
                        <span className="font-light">{e.name}</span>
                      </Popover.Close>
                    ))}
                    <p className="px-3 pb-1 pt-2.5 text-[10px] font-extralight tracking-widest text-zinc-400 dark:text-zinc-500">
                      站内直搜
                    </p>
                    {SITE_ENGINES.map((e) => (
                      <Popover.Close
                        key={e.id}
                        onClick={() => onPatchSettings({ engineId: e.id })}
                        onMouseDown={(ev) => ev.preventDefault()}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-600 transition-[background-color,box-shadow] duration-150 hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/10 ${
                          e.id === settings.engineId
                            ? "bg-zinc-200/70 ring-[1.5px] ring-inset ring-[color:var(--ui-accent)] dark:bg-white/10"
                            : ""
                        }`}
                      >
                        {/* v8.7.60：色点退役（用户裁定），改站点品牌简标
                            v8.7.61：选框颜色跟强调色（用户裁定） */}
                        <span className="flex items-center gap-2 font-light">
                          <SiteGlyph id={e.id} color={e.color} />
                          {e.name}
                        </span>
                      </Popover.Close>
                    ))}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            <span aria-hidden className="h-5 w-px shrink-0 bg-zinc-900/10 dark:bg-white/10" />

            {/* 输入区域 */}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={engine.hint}
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="搜索或输入网址"
              aria-expanded={showDrop}
              aria-controls={showDrop ? "search-sug-list" : undefined}
              role="combobox"
              className="search-input h-full min-w-0 flex-1 bg-transparent text-[15px] font-light text-zinc-900 outline-none placeholder:text-zinc-400/90 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />

            {/* 提交按钮 */}
            <button
              type="submit"
              aria-label="开始搜索"
              tabIndex={query.trim() ? 0 : -1}
              className={`search-submit flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                query.trim()
                  ? "bg-zinc-900 text-zinc-50 opacity-100 hover:opacity-80 dark:bg-zinc-100 dark:text-zinc-900"
                  : "-mr-1 opacity-0"
              }`}
            >
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          {/* 建议列表：搜索栏向下拉长的部分。常驻 DOM（v8.7.2 ㊸结构免疫律）：
              显隐走 data-open CSS 过渡（opacity+visibility，globals.css
              .search-sug-list）——无 AnimatePresence 条件重挂、无 framer WAAPI
              opacity，「出现闪动一拍」从结构上不存在；展开首帧行级联入场由
              .sug-cascade 窗口标记承载（v8.7.3，渲染期边沿派生见上）；
              高度揭示统一由表单 height 动画承载，列表自身无 margin 参与，
              收起零残留。首行上缘 hairline 兼作输入行与建议区的分隔线 */}
          <div
            id="search-sug-list"
            role="listbox"
            aria-label="搜索建议"
            aria-hidden={!showDrop}
            data-open={showDrop ? "true" : undefined}
            onMouseLeave={() => setActive(-1)}
            className={`search-sug-list relative${cascade ? " sug-cascade" : ""}${
              cascadeOut ? " sug-cascade-out" : ""
            }`}
          >
            {sugs.map((s, i) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={i === active}
                data-active={i === active ? "true" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(false, s)}
                onMouseEnter={() => setActive(i)}
                style={{ height: SUG_ROW_H, "--sug-i": i } as CSSProperties}
                className={`search-sug-row flex w-full items-center gap-3 px-4 text-left text-[13px] font-light transition-colors duration-150 ${
                  i === 0
                    ? "border-t border-zinc-900/[0.07] dark:border-white/[0.07]"
                    : ""
                } ${
                  i === active
                    ? "bg-zinc-900/5 text-zinc-900 dark:bg-white/10 dark:text-zinc-50"
                    : "text-zinc-700 dark:text-zinc-200"
                }`}
              >
                <Search className="h-3.5 w-3.5 shrink-0 opacity-40" strokeWidth={1.5} />
                <span className="truncate">{s}</span>
              </button>
            ))}
          </div>
          </div>
          {/* /v8.7.62 内容裁剪层 */}
          </div>
          {/* /v8.7.79 transform 载体层（描边 ring 层为下者的兄弟，留在
              transform 子树之外） */}
          {/* v8.7.79 描边环独立层：form 直子层、float 兄弟——刻意留在
              transform 子树之外。纯矢量描边层（无 backdrop-filter）的
              栅格化永远发生在自身 1:1 布局坐标系，祖先 transform 只在
              合成阶段整体变换显示、不改层内纹理相位，收尾矩阵归 1 =
              显示恢复层纹理原样 = 布局几何精确，描边位移物理性消失
              （机制见文件头 v8.7.79 注释块）。常驻 border + 聚焦 ring-1
              （自 glass 迁入，globals.css 四态同参）；rAF 同进度四值插值
              打在本层（applyFloatProgress，与 float 的 transform 同帧同
              笔同步）；动画期/驻留期 inline 覆盖 inset-0 基线，
              over-constrained 下 right/bottom 被规范忽略、四值恒中心
              对称。DOM 在 float 之后 = 描边绘制在磨砂之上；
              pointer-events-none 保持交互穿透（与 glass 同语义）。 */}
          <div
            ref={ringRef}
            aria-hidden
            className={`search-ring pointer-events-none absolute inset-0 rounded-[28px] ${
              focused
                ? "ring-1 ring-zinc-900/15 dark:ring-white/25"
                : ""
            }`}
          />
        </motion.form>
      </div>

      {/* 操作提示：建议关闭时保持原版形态（位于搜索框下方） */}
      {!suggestOn && <SearchHint query={query} above={false} />}
    </div>
  );
}

export default memo(SearchBar);
