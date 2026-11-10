"use client";

/**
 * 「初始」快捷服务 · 双形态（v8.6.2）
 *
 * settings.linksForm 二选一（设置 → 链接 →「快捷服务样式」）：
 *
 * ① docked 常驻（v8.5.9 原样式回归）：磁贴墙一直铺在页面搜索区下方（56px 磨砂
 *   磁贴），无纱罩、无中键、无 portal；编辑入口 = 触屏长按磁贴 / 右键磁贴编辑
 *   单项 / 页面右键菜单「批量管理磁贴」（v1.7.1）。
 *
 * ② drawer 抽屉（v8.6.x 现状，默认）：页面任意空白处【中键单击】唤出全屏磁贴墙
 *   （portal 到 body，64px 磁贴）：
 *     · v8.6.2 纱罩重做——纯色遮罩 → 【整页高斯模糊】（backdrop blur 28px +
 *       轻染色渐变，深浅两套），磁贴浮在磨砂化的整页之上；
 *     · v8.6.2 磨砂存活——纱罩/容器动画不再携带 opacity（祖先 opacity<1 会成为
 *       backdrop root，开关抽屉瞬间磁贴磨砂消失，用户实测），入场退场只动
 *       transform，淡入淡出由纱罩自承载；搜索区不再雾化让位（.cl-drawer-fade
 *       退役），整页模糊本身就是「让位」，搜索栏磨砂从此恒定在线；
 *     · ESC / 点击纱罩空白 / 再按中键 关闭；Dock 抬升到纱罩之上保持可点
 *       （点击 Dock 先收抽屉再开面板）。
 *
 * 两形态共享：
 *   · 拖拽排序（dnd-kit 跟踪 + framer layout 弹簧让位 + 速度倾斜/光晕/厚影浮层）
 *   · v8.7.156 文件夹磁贴：StartEntry[]（链接｜文件夹 混存）——拖磁贴悬停
 *     文件夹 500ms 自动原位展开（iOS 同款），松手落进夹内；夹内可拖出/排序；
 *     右键菜单/⌘K 指令面板可新建文件夹；毛玻璃夹形磁贴；拖拽会话期背景冻结
 *     （useBgFreeze）+ 写合并（useStoredDeferred，掉帧根修双件套）
 *   · 批量管理（右键菜单 start:links-manage / 触屏长按磁贴；v8.6.3 移除抽屉内
 *     「批量管理」pill——独立按钮多余，用户指令删除）：
 *     整单元抖动动画（.jiggle，v8.6.2 强化 ±2° 交替反向 + 流畅模式豁免；
 *     v8.6.3 上移到「图标+名称」整单元包裹层，添加位同频）+ 角标删除
 *     + 短按磁贴进编辑器
 *   · 免梯子多源 favicon 回退（TileIcon）+ 壳 iframe 外链顶层打开（v8.4.8）
 *
 * 唤出守卫（仅抽屉）：中键落在交互元素（a/button/input/.cl-dock/[role=dialog] 等）、
 * 禅模式（html.zen）、hideLinks（disabled）时不响应；页面空白中键默认的
 * 自动滚动被 preventDefault 吞掉。
 */

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  usePresence,
  useReducedMotion,
  useSpring,
  type Variants,
} from "framer-motion";
import { Check, Folder, FolderMinus, FolderPlus, Pencil, X } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import type {
  FolderIconStyle,
  FolderOpenStyle,
  IconStyle,
  LinksForm,
  StartEntry,
  StartFolder,
  StartLink,
} from "@/lib/startpage/types";
import {
  dissolveFolder,
  isFolder,
  locateLink,
  patchFolder,
  putLinkIntoFolder,
  reorderWall,
  takeLinkOutOfFolder,
} from "@/lib/startpage/link-folders";
import { hostOf } from "@/lib/startpage/link-utils";
import { inExtIframe, openExternalUrl } from "@/lib/startpage/nav";
import { useBgFreeze } from "@/hooks/use-start";
import {
  clearIconSource,
  orderedIconSources,
  readIconSource,
  saveIconSource,
} from "@/lib/startpage/favicon";
import {
  selfdrawSvg,
  useSelfdrawIcon,
  hexHue,
} from "@/lib/startpage/selfdraw-icons";
import { useCustomIcons } from "@/lib/startpage/custom-icons-react";

/** 磁贴 layout 动画：弹簧驱动，增删/重排/退出编辑均平滑归位（近临界阻尼，快速就位零反弹） */
const LAYOUT_SPRING = { type: "spring" as const, stiffness: 420, damping: 41, mass: 0.9 };

/** 长按位移容差（px）：真机手指静置也有 1-3px 抖动，超出容差才算滚动意图 */
const LONG_PRESS_SLOP_PX = 10;

/** v8.7.106 顶缘羽化带上探距离（px）：遮罩从磁贴第一排上方移进「搜索区→磁贴区」
 *  空带（section mt-[clamp(2rem,8vh,4.5rem)] ≥32px），滚动磁贴在空带内渐渐
 *  隐去，静止磁贴不再被遮罩压住顶边（用户实测「现在的位置会挡住图标一部分」）。
 *  容器以 marginTop/paddingTop 对冲上探：静止时磁贴位置分毫不动。 */
const VEIL_LIFT = 32;

/** v8.7.109 下缘预留（px）：常驻滚动容器在内容底边之下多留的呼吸带（用户指令
 *  「下方遮罩层再下移一点，入场动画时图标只有一两行会被遮罩挡住一部分」）。
 *  磁贴只有一两行时容器高=内容高（贴死内容），入场 intro-tile-rise 从
 *  translateY(26px) 上浮——旧裁切线正落在最后一行底部，起步 26px 越界被裁；
 *  且入场变换瞬时把 scrollHeight 撑大 26px，令 fade.bottom 误判显影（无事件
 *  复测，入场结束后仍驻留）——两层观感合成「遮罩挡住图标」。预留 40px>26px
 *  后上浮全程落在容器内：不裁切、不误显影，下缘边界整体下移。多行滚动时
 *  maxHeight 封顶公式不变，裁切线仍=Dock 顶缘；预留只是滚动末端的余量。 */
const BOTTOM_RESERVE = 40;

/* ---------- v8.7.116 抽屉羽化遮罩锚层根修 + 上下缘外扩（用户指令「把抽屉
   页面快捷服务上方的遮罩再往上移一点，现在的挡住了一部分图标，下方的遮罩
   也下移一点」）----------
   根因（运行时实测 1280×720 / 40 磁贴）：抽屉两枚 FadeVeil 锚在视口尺寸的
   motion.div（fixed inset-0 链）而非滚动层——顶遮罩 top:-VEIL_LIFT(32) 探出
   视口（rect -32~-4），底遮罩 bottom:0 悬在 pb-24 空带（rect 692~720，滚动层
   底 624 之下 68px）——两枚遮罩自 v8.7.105 引入起从未糊到过磁贴（羽化恒失
   效），磁贴滑到滚动层边缘（36/624）即硬裁切，用户所见「遮罩挡住一部分图
   标」即此硬裁线。
   修法（仿常驻形态 v8.7.106/109 成熟对冲律）：滚动层外套 relative 锚定层
   （my-auto/max-h-full 语义随迁），滚动层以负 margin + 等值 padding 上下
   对冲外扩——静止磁贴位置分毫不动，裁切线顶上移/底下移，FadeVeil 改锚
   锚定层贴真实滚动边缘，羽化首次真正生效（磁贴滑到边缘渐隐而非硬切）。 */
/** 抽屉顶缘上探（px）：滚动层顶缘上移进搜索区空带（与常驻 VEIL_LIFT 同值
 *  同义；40 磁贴满滚时顶缘 36-32=4px，磁贴几乎贴视口顶才渐隐，「挡图标」
 *  解除）。 */
const DRAWER_VEIL_LIFT = 32;
/** 抽屉底缘下探（px）：滚动层底缘下移。滚动层底与 Dock 顶间隙恒 26px
 *  （滚动层底=vh-96，Dock 顶=vh-70），24 留 2px 余量——磁贴滑到 Dock 上沿
 *  才渐隐，不压 Dock。 */
const DRAWER_VEIL_DROP = 24;

export function emitEditLink(link: StartLink | null) {
  window.dispatchEvent(new CustomEvent("start:edit-link", { detail: link }));
}

/* 设计律（v8.7.34 用户定调）：磁贴颜色不开放用户自定义——色相由域名稳定派生
 * （同站恒同色、异站天然错开），饱和/明度锁在全局瓷釉/墨夜框架内，开箱即美；
 * 手动配色徒增设置面复杂度，且自选色易与主题/壁纸冲突。样式个性由「图标风格」
 * （字母磁贴/站点图标）承载，颜色一律系统派生、零配置。 */
/** 由域名生成稳定色相 */
function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/* ---------- 站点图标（免梯子多源回退，v8.4.0；v8.7.105 清晰源 + 8.7.44 居中样式回归）----------
 * 源链与尺寸策略见 favicon.ts 头注（v8.7.105 清晰源律：favicon.im 高清
 * 优先 / zhusl 16px 糊源退役 / Google s2 128 压轴）。
 * v8.7.108 双路竞速（用户实测「站点图标大陆网络加载不出来」）：串行 onError
 * 回退升级为「记忆源直达 + 源链两两并发竞速 + 4s 看门狗」——被墙源的 TCP
 * 挂起不再阻塞整条链，详见 TileIcon 内 effect 注释。显示样式回归 8.7.44：
 * 磨砂玻璃打底 + 色相渐变 + 站点图标 28/32px 居中（object-contain）——
 * v8.7.67 的「图标铺满 + 主色实底」形态退役（用户指令：改回 8.7.44 的
 * 磨砂打底居中样式）；v8.7.67 随铺满引入的主色提取（useFaviconDom）
 * 一并退役——底色恒为域名色相渐变，磁贴材质回到纯磨砂语言。
 * v8.6.1 移植：1px border 换 inset 环 + 独立合成层（translateZ）——
 * 悬浮放大时 1px 边框落在分数像素上渲染出黑边（线上 8.6.0 修复同源）。
 * v8.6.7 三层拆分：包裹层（transform）/霜层（backdrop-filter 恒定）/内容层
 * （模糊聚拢）——入场三通道互不相克，模糊覆盖与霜感在线两头都要；
 * intro 动画全部自承载或落在无玻璃后代的叶子上（v8.5.6 律）。 */
function TileIcon({
  link,
  iconStyle,
  intro = false,
  sm = false,
  bare = false,
  onIntroDone,
}: {
  link: StartLink;
  iconStyle: IconStyle;
  /** 入场三通道（包裹层 transform / 霜层凝聚 / 内容层模糊聚拢，见 globals.css） */
  intro?: boolean;
  /** 入场播完回调（最晚的 body/ring 通道 animationend 触发，重复触发幂等） */
  onIntroDone?: () => void;
  /** 常驻形态 56px（抽屉 64px） */
  sm?: boolean;
  /** v8.7.157 九宫格裸格形态：文件夹磁贴 2×2 缩微格内嵌——只渲染图标本体，
   *  无三层外壳/描边环（磨砂与描边由外层磁贴统一承载），解析链与常态
   *  完全同构（上传图标 > 自绘册 > favicon 竞速 > 首字母）。 */
  bare?: boolean;
}) {
  const host = hostOf(link.url);
  /* v8.7.108 图标双路竞速（用户实测「站点图标大陆网络加载不出来，有没有办法
     快一点」）：旧链逐源串行 onError 回退——某个源挂死（被墙站点直连挂起 /
     黑洞网络）要等浏览器 TCP 超时（十几秒级）才轮到下一源，观感即「加载不出
     来」。新策略：
       ① 记忆源（favicon-src2:）单路直达——命中过立即显示，零竞速开销；
       ② 未命中或失效 → 源链两两一组并发预载（Image 双路，先命中先赢并写
          记忆），一轮顶串行两步；
       ③ 任一轮两路都挂死（黑洞无 onerror）由 4s 看门狗强制推进下一轮——
          最坏情形从「无限挂起」收敛到「轮数×4s」。
     串行链的源顺序优先级、源记忆、全失败回落字母全部保留。 */
  const [fav, setFav] = useState<{ url: string | null; dead: boolean }>({
    url: null,
    dead: false,
  });

  useEffect(() => {
    if (!host) {
      setFav({ url: null, dead: false });
      return;
    }
    let dead = false;
    let settled = false;
    const all = orderedIconSources(host);
    const saved = readIconSource(host);
    /* 记忆源走上面的单路直达，竞速列表跳过它（失效时整条链兜底） */
    const rest = saved ? all.filter((u) => u !== saved) : all;
    const imgs: HTMLImageElement[] = [];
    const stop = () => {
      for (const im of imgs) {
        im.onload = null;
        im.onerror = null;
        if (im.src) im.src = "";
      }
    };
    let round = 0;
    let watchdog = 0;
    const win = (url: string) => {
      if (dead || settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      stop();
      saveIconSource(host, url);
      setFav({ url, dead: false });
    };
    const fail = () => {
      if (dead || settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      stop();
      setFav({ url: null, dead: true });
    };
    const start = () => {
      window.clearTimeout(watchdog);
      const pair = rest.slice(round, round + 2);
      let pending = pair.length;
      if (!pending) {
        fail();
        return;
      }
      /* 本轮看门狗：两路都挂死（黑洞超时无 onerror）4s 强制进下一轮 */
      watchdog = window.setTimeout(advance, 4000);
      for (const url of pair) {
        const im = new Image();
        imgs.push(im);
        im.referrerPolicy = "no-referrer";
        im.decoding = "async";
        im.onload = () => {
          pending -= 1;
          win(url);
        };
        im.onerror = () => {
          pending -= 1;
          if (pending <= 0) advance();
        };
        im.src = url;
      }
    };
    const advance = () => {
      if (dead || settled) return;
      window.clearTimeout(watchdog);
      stop();
      round += 2;
      if (round >= rest.length) {
        fail();
        return;
      }
      start();
    };
    setFav({ url: null, dead: false });
    /* v8.7.152 弱网卡加载根修：竞速链延至 window load 之后起跑。
       new Image() 创建的 img 即使不进 DOM 也 delay 所属文档的 load 事件
       （HTML 规范 delaying-the-load-event 律），弱网下悬挂的图标请求会把
       壳层「初始加载中」转圈拖到分钟级（探针实测 load 10s 不发——每磁贴
       记忆源 4s 看门狗 × 轮数成倍放大）。load 前磁贴保持渐变底+字母回退，
       load 后竞速/记忆源/看门狗语义原样。 */
    let offWait: (() => void) | null = null;
    const kick = () => {
      offWait = null;
      if (dead || settled) return;
      if (saved) {
        /* 记忆源单路直达：挂死同样 4s 看门狗，失效即从整条链竞速 */
        const im = new Image();
        imgs.push(im);
        im.referrerPolicy = "no-referrer";
        im.decoding = "async";
        im.onload = () => win(saved);
        im.onerror = () => start();
        im.src = saved;
        watchdog = window.setTimeout(() => {
          if (!settled) start();
        }, 4000);
      } else {
        start();
      }
    };
    if (document.readyState === "complete") {
      kick();
    } else {
      const on = () => {
        window.removeEventListener("load", on);
        kick();
      };
      window.addEventListener("load", on, { once: true });
      offWait = () => window.removeEventListener("load", on);
    }
    return () => {
      dead = true;
      settled = true;
      window.clearTimeout(watchdog);
      stop();
      offWait?.();
    };
  }, [host]);

  const hue = hueOf(host || link.name);
  const ch =
    [...(host || link.name)].find((c) => /[a-z0-9]/i.test(c))?.toUpperCase() ??
    link.name.slice(0, 1);
  /* v8.7.44 自绘图标：仅「自绘图标」风格启用解析。命中注册表 → 内联 SVG 磁贴面
     （全自绘 path，用户逐轮审阅认可的自绘册 v9，187 站）；未收录 host 或数据块
     未达（miss）→ 回落站点图标链；loading（数据拉取中）显示字母，不闪 favicon
     半帧。自绘册是增强而非依赖：fetch 失败永远只是降级，不阻塞磁贴。 */
  const sd = useSelfdrawIcon(host, iconStyle === "selfdraw");
  /* v8.7.105 自定义上传图标：用户在编辑弹窗为 host 显式上传的专属图标，
     优先级高于一切自动解析（自绘册 / favicon 链 / 字母）——显式资产压过
     自动猜测；与全局 iconStyle 无关（用户指定的就是这枚磁贴的图标）。 */
  const customIcons = useCustomIcons();
  const customIcon = host ? customIcons[host] : undefined;
  const showFavicon =
    (iconStyle === "favicon" || (iconStyle === "selfdraw" && sd.state === "miss")) &&
    !customIcon &&
    !!host &&
    !fav.dead &&
    !!fav.url;
  /* v8.7.127 自绘整体让位律：显式上传图标在场时，磁贴面整体退出自绘体系——
     不止内容层互斥（v8.7.105 起已保证），底色与描边环也同步让位。旧实现
     tile-body 底色与 effHue 在 sd.state==="hit" 时取自绘条目主色 dom，
     customIcon 只压住内容层——上传图标坐在自绘主色实底与自绘色相描边环上
     （用户实测「自绘图标和上传的自定义图标重叠」的可感知形态即此，与
     v8.7.105 注释「透明底直接坐落磨砂渐变面上」的设计意图相悖）。
     sd 仍保持解析（删除上传图标后零闪烁回自绘），仅在使用点让位。 */
  const sdActive = sd.state === "hit" && !customIcon;
  /* v8.7.105 主色提取退役（随 8.7.67 铺满律一起下线）：底色恒为域名色相
     渐变（8.7.44 形态）；自绘命中条目仍用条目主色（同色无缝，自绘体系
     不受本次回归影响；v8.7.127 起上传图标在场时整体让位，见 sdActive）。 */
  const effHue = sdActive ? (hexHue(sd.entry.dom) ?? hue) : hue;

  /* v8.7.157 九宫格裸格形态（bare）：早退分支在全部 hooks 之后，解析链
     与常态零差异；格子底白雾提对比，自绘命中改条目主色实底（同色无缝
     同 v8.7.127 让位律），画作满铺格子圆角由 overflow-hidden 统一裁切。 */
  if (bare) {
    return (
      <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[6px] bg-white/30 dark:bg-white/10">
        {customIcon ? (
          <img
            src={customIcon}
            alt=""
            draggable={false}
            className="h-3.5 w-3.5 object-contain"
          />
        ) : sdActive ? (
          <span
            aria-hidden
            className="absolute inset-0 block"
            style={{ background: sd.entry.dom }}
            dangerouslySetInnerHTML={{ __html: selfdrawSvg(sd.entry) }}
          />
        ) : showFavicon ? (
          <img
            key={fav.url ?? ""}
            src={fav.url ?? undefined}
            alt=""
            width={16}
            height={16}
            loading="lazy"
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => {
              /* 竞速胜出源在可见 img 上二段失效（罕见：网络闪断）——记忆
                 作废回落字母，下次挂载按整链重试 */
              if (host) clearIconSource(host);
              setFav((f) => ({ ...f, url: null, dead: true }));
            }}
            className="h-4 w-4 object-contain"
          />
        ) : (
          <span className="text-[11px] font-light tracking-wide text-zinc-600/85 dark:text-zinc-200/85">
            {ch}
          </span>
        )}
      </span>
    );
  }

  /* v8.6.7 三层拆分（入场三通道，见 globals.css intro-tile-*）：
   *   包裹层（link-intro-tile）只动 transform；霜层（link-intro-frost）承载
   *   backdrop-filter、0.18s 快速凝聚——本体永不被 filter/长透明期压掉，
   *   常驻形态无纱罩兜底也全程「带着磨砂入场」；内容层（link-intro-body）
   *   色相渐变+图标 0.95s 模糊聚拢——模糊覆盖整个磁贴面（v8.6.6 整块观感）。
   *   霜层与内容层是兄弟：内容层的 filter 动画压不到霜层的 backdrop-filter。
   *   translateZ(0)/backfaceVisibility 合成提示归位（v8.6.6 撤它只因与本体
   *   filter 动画相克；v8.6.7 本体不带 filter），黑边修复恢复。
   *   v8.6.25：投影整体退役（用户指令「删除快捷服务的图标底下的阴影」）——
   *   .tile-shadow 类、intro-tile-shadow 入场通道、cs-drawer-closing 投影淡出
   *   全部拆除，磁贴体积全权交还描边+高光+霜层着色（拖拽浮层的 thick shadow
   *   属于拖拽手感反馈，不在本律范围，保留）。 */
  return (
    <span
      aria-hidden
      className={
        "relative block tile-shell " +
        (sm ? "h-14 w-14 rounded-[18px] " : "h-16 w-16 rounded-[20px] ") +
        (intro ? "link-intro-tile" : "")
      }
      onAnimationEnd={(e) => {
        /* v8.6.21：入场播完（最晚结束的 body/ring 通道）即摘 intro 类。
           React 重排数组时会移动让位磁贴的 DOM 节点（insertBefore），CSS
           动画对「脱文档再插入」的节点必然重播——这就是「往左拖拽时让位
           到右边的图标误播入场动画」的根因；类摘除后重播无动画可放。 */
        if (e.animationName === "intro-tile-body" && onIntroDone) onIntroDone();
      }}
    >
      {/* 霜层：磨砂玻璃（v8.6.9 只留 backdrop-filter，描边拆到下面的独立通道）。
          v8.6.16 瓷釉重写：霜层铺变量着色（--tile-frost-bg，浅色白雾/深色暗雾）
          ——旧浅色只 blur 不着色，在浅底上 blur 后与背景无明度差，「磨砂玻璃」
          存在却看不见（用户定调浅色快捷图标没有磨砂玻璃效果）；着色后磁贴
          与画布立即分层，浅掠影等场景经 globals 同名变量通道调值，不再是另一条硬编码。
          v8.6.32 磨砂底层化：材质声明收编 globals.css .tile-frost 基线（用户指令
          「把磨砂写入底层，从底层代码改变图标材质」），内联样式退役——样式表常驻
          声明不随渲染路径波动；cs-lite 流畅系统经通配关停，双渲染系统共享基线。 */}
      <span
        aria-hidden
        className={
          "tile-frost absolute inset-0 rounded-[inherit] cl-fade-leaf " +
          (intro ? "link-intro-frost" : "")
        }
      >
        {/* v8.7.106 结构重组（描边位移根修）：描边环 + 内容层全部收进霜层
            子树——backdrop-filter 元素的自 subtree 共享同一渲染表面（同一
            栅格单元），hover 缩放的合成器动画里霜层边缘/描边/内容永远
            原子级同步，根除「沉降段描边相对霜层边缘位移」（v8.7.105 用户
            实测：流畅模式无磨砂即消失——分离表面重光栅时机不同步是根因）。
            子树内 filter 不构成霜层 backdrop-filter 的 backdrop root
            （backdrop root 只看祖先链），入场内容层模糊聚拢照常零毒。
            v8.6.16：环亮度/透明度/高光强度变量化（--tile-ring-l/a、--tile-hl-a）
            ——浅色走深墨环+亮白高光（瓷面反光），深色保持亮环+轻高光。 */}
        <span
          aria-hidden
          className={
            "tile-ring pointer-events-none absolute inset-0 rounded-[inherit] cl-fade-leaf " +
            (intro ? "link-intro-ring" : "")
          }
          style={{
            boxShadow:
              "inset 0 0 0 1px hsl(" + effHue + " 44% var(--tile-ring-l, 60%) / var(--tile-ring-a, 0.28)), inset 0 1px 0 rgba(255,255,255,var(--tile-hl-a, 0.18))",
          }}
        />
        {/* 内容层：色相渐变 + 图标（overflow 裁切、模糊聚拢覆盖面）。
            v8.6.16：渐变透明度/亮度变量化（--tile-grad-*）——浅色加深一档
            （旧 .22/.14 在瓷白画布上几乎不可见，磁贴沦为「淡彩纸片」），
            深色保持原宝石感。 */}
        <span
          className={
            "tile-body relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] cl-fade-leaf " +
            (intro ? "link-intro-body" : "")
          }
          style={{
            /* v8.7.105 底色回归 8.7.44：域名色相渐变恒定（v8.7.45/67 的主色
               实底随铺满律退役）；自绘命中条目保留条目主色实底（与画作
               同色无缝，属自绘体系不变）；v8.7.127 上传图标在场时整体让位
               回渐变（磨砂渐变面承载上传图标，sdActive 律） */
            background:
              sdActive
                ? sd.entry.dom
                : "linear-gradient(135deg, hsl(" +
                effHue +
                " 42% var(--tile-grad-l1, 62%) / var(--tile-grad-a1, 0.22)), hsl(" +
                ((effHue + 40) % 360) +
                " 46% var(--tile-grad-l2, 50%) / var(--tile-grad-a2, 0.14)))",
          }}
        >
          {customIcon ? (
            /* v8.7.105 自定义上传图标：128px 压缩 PNG，居中 object-contain
               （与 8.7.44 favicon 同款形态，透明底直接坐落磨砂渐变面上） */
            <img
              src={customIcon}
              alt=""
              draggable={false}
              className={sm ? "h-7 w-7 object-contain" : "h-8 w-8 object-contain"}
            />
          ) : sdActive ? (
            /* v8.7.46 自绘磁贴面：画作 vb 已收紧至实边界，svg 铺满磁贴（absolute
               inset-0 + slice），四角由磁贴自身 rounded-[inherit]+overflow-hidden
               统一裁切——磁贴圆角直接裁在画作上（v8.7.45 的 dom 晕环/第二套圆角
               退役）；底色走条目主色 dom（tile-body 处实底渲染，同色无缝）；
               v8.7.127 起上传图标在场时本分支让位（sdActive 律） */
            <span
              aria-hidden
              className="absolute inset-0 block"
              dangerouslySetInnerHTML={{ __html: selfdrawSvg(sd.entry) }}
            />
          ) : showFavicon ? (
            /* v8.7.105 回归 8.7.44 居中小图：磨砂玻璃打底 + 色相渐变 +
               图标 28/32px（object-contain，rounded-md 微圆角）居中——
               v8.7.67 的铺满形态退役（用户指令改回 8.7.44 样式）；
               配合 favicon.ts 清晰源律（128px 级源优先），居中小图
               在 2x DPR 下 1:1 或超采样，锐度不再受磁贴尺寸拖累 */
            <img
              key={fav.url ?? ""}
              src={fav.url ?? undefined}
              alt=""
              width={sm ? 28 : 32}
              height={sm ? 28 : 32}
              loading="lazy"
              decoding="async"
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => {
                /* 竞速胜出源在可见 img 上二段失效（罕见：网络闪断）——记忆
                   作废回落字母，下次挂载按整链重试 */
                if (host) clearIconSource(host);
                setFav((f) => ({ ...f, url: null, dead: true }));
              }}
              className={
                sm ? "h-7 w-7 rounded-md object-contain" : "h-8 w-8 rounded-md object-contain"
              }
            />
          ) : (
            <span className="tile-letter text-xl font-light tracking-wide text-zinc-100">
              {ch}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

/* ---------- v8.7.157 九宫格迷你预览磁贴（用户选型 1，替代毛玻璃夹形） ----------
 * 与链接磁贴共用同一套三层拆分外壳（tile-shell/霜层/描边环/内容层，
 * 入场三通道与磨砂存活律零例外），内容层从 lucide 夹形图标升级为
 * 缩微站点格墙（iOS 文件夹范式——夹形图标信息量为零，「一眼看到
 * 夹里有什么」才是文件夹；形态由 folderIconStyle 切换，v8.7.161）：
 *   · grid2（默认）：2×2 双排迷你格——1~4 站逐格画子站点图标（TileIcon bare
 *     形态，解析链同构）；>4 站前 3 格图标 + 第 4 格「+N」计数格（N=站数-3）；
 *   · grid3：3×3 三排微缩墙——1~8 站逐格 + 空位淡占位；>8 站前 8 格 +
 *     第 9 格「+N」（N=站数-8）；
 *   · 空夹：居中夹形图标占位（拖入站点即转九宫格）；
 *   · 色相/描边环仍由夹名 hueOf 稳定派生（同夹恒同色）；
 *   · 点击 = 原位展开 popover；编辑态 × = 拆夹散落（零丢失非破坏）；
 *   · data-cl-folder-grid：九宫格内容层稳定标记（verify/冒烟锚）。 */
function FolderTileVisual({
  folder,
  iconStyle,
  folderIconStyle = "grid2",
  intro = false,
  sm = false,
}: {
  folder: StartFolder;
  iconStyle: IconStyle;
  /** v8.7.161 图标形态（用户选型 A/B）：grid2 = 2×2 双排迷你格（默认，
   *  v8.7.157 现状）/ grid3 = 3×3 三排微缩墙（空位淡占位，>8 站第 9 格「+N」） */
  folderIconStyle?: FolderIconStyle;
  intro?: boolean;
  sm?: boolean;
}) {
  const hue = hueOf(folder.name);
  const n = folder.children.length;
  const grid3 = folderIconStyle === "grid3";
  /* 满格站点数（grid2: 4 = 2×2 / grid3: 9 = 3×3）；超满时最后一格让位给
     「+N」计数格（只画前 cap 格图标，iOS 同款收敛） */
  const full = grid3 ? 9 : 4;
  const cap = full - 1;
  const shown = n <= full ? folder.children.slice(0, full) : folder.children.slice(0, cap);
  const more = n - shown.length;
  return (
    <span
      aria-hidden
      className={
        "relative block tile-shell " +
        (sm ? "h-14 w-14 rounded-[18px] " : "h-16 w-16 rounded-[20px] ") +
        (intro ? "link-intro-tile" : "")
      }
    >
      <span
        aria-hidden
        className={
          "tile-frost absolute inset-0 rounded-[inherit] cl-fade-leaf " +
          (intro ? "link-intro-frost" : "")
        }
      >
        <span
          aria-hidden
          className={
            "tile-ring pointer-events-none absolute inset-0 rounded-[inherit] cl-fade-leaf " +
            (intro ? "link-intro-ring" : "")
          }
          style={{
            boxShadow:
              "inset 0 0 0 1px hsl(" + hue + " 44% var(--tile-ring-l, 60%) / var(--tile-ring-a, 0.28)), inset 0 1px 0 rgba(255,255,255,var(--tile-hl-a, 0.18))",
          }}
        />
        <span
          className={
            "tile-body relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] cl-fade-leaf " +
            (intro ? "link-intro-body" : "")
          }
          style={{
            background:
              "linear-gradient(135deg, hsl(" +
              hue +
              " 42% var(--tile-grad-l1, 62%) / var(--tile-grad-a1, 0.22)), hsl(" +
              ((hue + 40) % 360) +
              " 46% var(--tile-grad-l2, 50%) / var(--tile-grad-a2, 0.14)))",
          }}
        >
          {n === 0 ? (
            <Folder
              className={
                (sm ? "h-7 w-7" : "h-8 w-8") +
                " text-zinc-600/80 dark:text-zinc-200/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
              }
              strokeWidth={1.4}
            />
          ) : (
            <span
              data-cl-folder-grid="1"
              className={
                "grid h-full w-full " +
                (grid3 ? "grid-cols-3 gap-[2px] p-[7px]" : "grid-cols-2 gap-[3px] p-[9px]")
              }
            >
              {shown.map((c) => (
                <TileIcon key={c.id} link={c} iconStyle={iconStyle} bare />
              ))}
              {more > 0 && (
                <span className="flex items-center justify-center rounded-[6px] bg-white/30 text-[10px] font-light tracking-wide text-zinc-600/80 dark:bg-white/10 dark:text-zinc-200/85">
                  +{more}
                </span>
              )}
              {/* grid3 未满格补淡占位（微缩墙容量感）；grid2 保持 v8.7.157
                  现状不补位，老用户观感零变化 */}
              {grid3 &&
                more === 0 &&
                Array.from({ length: full - shown.length }, (_, i) => (
                  <span
                    key={"ph" + i}
                    className="rounded-[6px] bg-white/20 dark:bg-white/[0.04]"
                  />
                ))}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

/** 磁贴视觉（图标 + 名称）：正常磁贴与拖拽浮层共用，保证「拖起来的就是原来那个」。
 *  v8.6.2 抖动换位：.jiggle 挂在包裹层而非玻璃本体——玻璃与 .link-intro
 *  同元素时，后定义的 intro-rise 动画在级联上覆盖 .jiggle（同特异性后胜），
 *  抖动自 v8.5.6 intro 机制引入起就被静默杀死（用户实测「没有抖动」）；
 *  v8.6.3 再上移到「图标+名称」整单元包裹层——iOS/青柠编辑态抖的是整个
 *  单元，此前只有图标框摆、名称静置，观感即「名称没跟着图标一起动」。
 *  包裹层 transform 动画不形成 backdrop root，磨砂存活律无虞。 */
function TileVisual({
  entry,
  iconStyle,
  folderIconStyle = "grid2",
  jiggle = false,
  intro = false,
  sm = false,
}: {
  entry: StartEntry;
  iconStyle: IconStyle;
  /** v8.7.161 文件夹磁贴图标形态（透传 FolderTileVisual） */
  folderIconStyle?: FolderIconStyle;
  jiggle?: boolean;
  intro?: boolean;
  sm?: boolean;
}) {
  /* v8.6.21：入场播完即摘 intro 类（showIntro），根治拖拽让位重播入场；
     portal 重挂载（抽屉唤出）时新实例 introDone 复位，入场照常 */
  const [introDone, setIntroDone] = useState(false);
  const showIntro = intro && !introDone;
  return (
    <span
      className={"flex w-full flex-col items-center gap-2.5" + (jiggle ? " jiggle" : "")}
    >
      {/* v8.7.26 hover 纯放大律：纯 scale 1.07（位移分量退役，历史见 git）。
          v8.7.106 hover 通道换轨 framer→CSS transition：framer 的 JS/WAAPI
          缩放与霜层 backdrop-filter 逐帧重采样不同帧同步，沉降段描边/磨砂
          位移（用户实测，流畅模式无磨砂即消失）；CSS transform transition
          全程合成器驱动，缩放与磨砂重采样同帧落笔（ChuShi-NewTab v1.7.4
          同款方案无此问题）。Tailwind v4 hover: 变体默认 @media(hover:hover)，
          触屏不粘滞；will-change 同步退役（transition 期间浏览器自动提升）。 */}
      <span
        className={
          "block cursor-grab active:cursor-grabbing transition-transform duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
          (jiggle || sm ? "" : "hover:scale-[1.07]")
        }
      >
        {isFolder(entry) ? (
          <FolderTileVisual folder={entry} iconStyle={iconStyle} folderIconStyle={folderIconStyle} intro={showIntro} sm={sm} />
        ) : (
          <TileIcon
            link={entry}
            iconStyle={iconStyle}
            intro={showIntro}
            onIntroDone={() => setIntroDone(true)}
            sm={sm}
          />
        )}
      </span>
      <span
        className={
          "tile-label cl-fade-leaf w-full truncate text-center text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300" +
          (showIntro ? " link-intro" : "")
        }
      >
        {entry.name}
      </span>
    </span>
  );
}

/** 拖起后原位留下的空位：凹槽 + 中心点 + 名称占位，尺寸与磁贴一致（不发生重排） */
function TilePlaceholder({ sm = false }: { sm?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 41, mass: 0.9 }}
      className="flex w-20 flex-col items-center gap-2.5"
      aria-hidden
    >
      <span
        className={
          "relative flex items-center justify-center rounded-[20px] " +
          (sm ? "h-14 w-14 rounded-[18px]" : "h-16 w-16")
        }
        style={{
          background: "color-mix(in srgb, var(--ui-accent) 6%, transparent)",
          boxShadow:
            "inset 0 1px 3px rgba(0,0,0,.10), inset 0 0 0 1px color-mix(in srgb, var(--ui-accent) 16%, transparent)",
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "color-mix(in srgb, var(--ui-accent) 42%, transparent)" }}
        />
      </span>
      <span className="h-4 w-10 rounded-full bg-zinc-900/5 dark:bg-white/5" />
    </motion.div>
  );
}

/* ---------- v8.7.156 文件夹系统：droppable 区与原位展开 popover ---------- */

/** 墙面空白 droppable：夹内磁贴拖到墙面空白处即出夹回墙。
 *  只挂 droppable 不参与 sortable——closestCenter 在磁贴密集处命中的仍是
 *  磁贴自身，磁贴之间的空隙/容器边缘才轮到整墙区（出夹落点），语义清晰。 */
function WallZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: "cl-wall-zone" });
  return (
    <div ref={setNodeRef} className="w-full">
      {children}
    </div>
  );
}

/** 夹区空白 droppable（popover 网格内）：墙内磁贴拖到夹面板空隙即入夹追加。 */
function FolderZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: "cl-folder-zone" });
  return (
    <div ref={setNodeRef} className="w-full">
      {children}
    </div>
  );
}

/* ---------- v8.7.158 文件夹面板内容（三形态共享）----------
 *  头部：名称（点击改名）+ 拆散（children 依序回墙零丢失）+ 关闭；
 *  网格：children SortableContext（夹内排序）+ FolderZone（空白处入夹）+ 编辑态删除。
 *  popover（morph/modal）与 inline 原位内嵌卡完全同源——交互行为（改名落盘/
 *  拆散散落/夹内排序/拖入拖出）零差异，只有「怎么出现」不同。 */
function FolderPanelBody({
  folder,
  iconStyle,
  editing,
  onEnterEdit,
  onDelete,
  onRename,
  onDissolve,
  onClose,
  /** 内容区高度上限：modal 居中模态空间更大，morph/inline 默认 300px */
  maxH = "max-h-[300px]",
}: {
  folder: StartFolder;
  iconStyle: IconStyle;
  editing: boolean;
  onEnterEdit: () => void;
  onDelete: (id: string) => void;
  onRename: (name: string) => void;
  onDissolve: () => void;
  onClose: () => void;
  maxH?: string;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  const commitRename = () => {
    setRenaming(false);
    const name = draft.trim();
    if (name && name !== folder.name) onRename(name);
    else setDraft(folder.name);
  };

  return (
    <>
      {/* 头部：名称 / 改名 / 拆散 / 关闭 */}
      <div className="flex items-center gap-1.5 border-b border-zinc-900/5 px-3 py-2 dark:border-white/5">
          {renaming ? (
            <>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setDraft(folder.name);
                    setRenaming(false);
                  }
                }}
                maxLength={24}
                aria-label="文件夹名称"
                className="h-7 min-w-0 flex-1 rounded-md border border-zinc-900/10 bg-transparent px-2 text-sm font-light text-zinc-800 outline-none focus:ring-1 focus:ring-[var(--ui-accent)] dark:border-white/10 dark:text-zinc-100"
              />
              <button
                type="button"
                aria-label="确认名称"
                onMouseDown={(e) => e.preventDefault()}
                onClick={commitRename}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--ui-accent)] transition-colors hover:bg-zinc-900/5 dark:hover:bg-white/5"
              >
                <Check className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-sm font-light tracking-wide text-zinc-700 dark:text-zinc-200">
                {folder.name}
                <span className="ml-2 text-[10px] font-extralight text-zinc-400 dark:text-zinc-500">
                  {folder.children.length} 个站点
                </span>
              </span>
              <button
                type="button"
                aria-label="重命名文件夹"
                title="重命名"
                onClick={() => {
                  setDraft(folder.name);
                  setRenaming(true);
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-600 dark:hover:bg-white/5 dark:hover:text-zinc-300"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="拆散文件夹"
                title="拆散文件夹（站点散落回墙，不丢失）"
                onClick={onDissolve}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-600 dark:hover:bg-white/5 dark:hover:text-zinc-300"
              >
                <FolderMinus className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="关闭文件夹"
                onClick={onClose}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-600 dark:hover:bg-white/5 dark:hover:text-zinc-300"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </>
          )}
      </div>

      {/* 夹内网格：children 排序 + 空白处入夹 + 编辑态删除 */}
      <FolderZone>
        <div className={"slim-scroll " + maxH + " w-[336px] overflow-y-auto p-2"}>
          {folder.children.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs font-light tracking-wide text-zinc-400 dark:text-zinc-500">
              把磁贴拖进来收纳
            </p>
          ) : (
            <SortableContext
              items={folder.children.map((c) => c.id)}
              strategy={rectSortingStrategy}
            >
              <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-4">
                <AnimatePresence mode="popLayout">
                  {folder.children.map((c) => (
                    <Tile
                      key={c.id}
                      entry={c}
                      iconStyle={iconStyle}
                      sm
                      editing={editing}
                      onEnterEdit={onEnterEdit}
                      onDelete={onDelete}
                      onOpenFolder={onClose}
                      intro={false}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </SortableContext>
          )}
        </div>
      </FolderZone>
    </>
  );
}

/* ---------- v8.7.159/v8.7.160 morph 真形变卡片三态 variants（用户定稿口径）----------
 *  面板从磁贴矩形（.tile-shell 实测，不含下方名称标签）原地 rect 弹簧长到
 *  容器终态（width/height 100%——v8.7.160 容器已 inline 固定为量尺终态尺寸，
 *  卡片纯覆盖层）——x/y/width/height 全量 rect 动画，即「磁贴本体长大成白卡」，
 *  起终点像素级对齐磁贴，替代 v8.7.158 的 scale 0.22→1 白卡缩放；
 *  enter/gone 共用同一实测矩形（mrect）——绽放起点与收起终点同为磁贴本体。 */
type MorphRect = { x: number; y: number; w: number; h: number };
const FOLDER_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.9,
} as const;
function morphCardVariants(r: MorphRect | null): Variants {
  const x = r?.x ?? 0;
  const y = r?.y ?? 0;
  const w = r?.w ?? 64;
  const h = r?.h ?? 64;
  return {
    enter: { x, y, width: w, height: h, opacity: 1 },
    shown: {
      x: 0,
      y: 0,
      width: "100%",
      height: "100%",
      opacity: 1,
      transition: FOLDER_SPRING,
    },
    gone: {
      x,
      y,
      width: w,
      height: h,
      opacity: 1,
      transition: { duration: 0.24, ease: "easeIn" },
    },
  };
}
/* skin 层（磁贴本体观感）：enter 全显 → shown 160ms 延迟交叉淡出露出演成
 * 面板 → gone 淡回磁贴观感（delay 50ms）再随整卡缩回磁贴矩形；
 * 子 motion 组件不带 initial/animate，沿父卡片 variants 状态机自动跟随。
 * （内容层 v8.7.160 起与卡片分离、由 isPresent 驱动淡入淡出，不再走 variants） */
const FOLDER_SKIN_VARIANTS: Variants = {
  enter: { opacity: 1 },
  shown: { opacity: 0, transition: { delay: 0.16, duration: 0.2, ease: "easeOut" } },
  gone: { opacity: 1, transition: { delay: 0.05, duration: 0.15, ease: "easeOut" } },
};

/* ---------- v8.7.156/v8.7.158/v8.7.159 文件夹原位展开 popover（portal 到 body，锚定磁贴节点实时跟随）----------
 *  两形态（openStyle，inline 内嵌不走此组件，见 Tile 内 FolderInlineCard）：
 *   · morph 真形变（默认，v8.7.159 用户定稿口径 + v8.7.160 覆盖式定位）：
 *     白卡从磁贴矩形原地 rect 弹簧长大——磁贴本体长大成卡（x/y/width/height
 *     全量 rect 动画，起终点像素级对齐磁贴，非 scale 弹出），白卡中心与
 *     磁贴中心对齐（v8.7.160 用户口径「文件夹在磁贴上层打开」——完全覆盖
 *     磁贴本体向四周扩张，非 v8.7.159 的磁贴正下方开卡）；skin 层（data-cl-folder-
 *     morph-preview）升级磁贴本体观感（hueOf 渐变玻璃 + 与九宫格完全同源
 *     gap-[3px] p-[9px] 2×2 缩微格），随卡片一起放大，160ms 后与成品面板
 *     交叉淡入；收起反向：内容 100ms 淡出 → skin 淡回磁贴观感 → 整卡
 *     240ms easeIn 缩回磁贴矩形（v8.7.160 latch 渲染期补位后 exit 真实
 *     播出）；绽放期 growingRef 跟随闸（~520ms）防逐帧中间尺寸回灌 clamp
 *     抖动，exit 期由 usePresence 同闸；
 *   · modal 居中模态：整墙压暗虚化（data-cl-folder-modal 遮罩层，点遮罩即
 *     收起），白卡飞入屏幕中央放大，内容区上限抬到 min(420px, 58vh)，
 *     收起淡出还原整墙；
 *  定位：morph 白卡中心与磁贴中心对齐（覆盖磁贴，clamp 进视口）；modal
 *  实测居中 clamp。量尺态首帧：pos 未定时渲染自然尺寸静置份供
 *  measure 实测（同一时刻只挂一份 FolderPanelBody），pos 到位换真身卡片
 *  重挂（framer initial 从磁贴矩形起跳）。跟随：每次渲染后实测（拖拽
 *  让位/增删磁贴全跟随）+ 滚动/resize 兜底（绽放期闸内暂缓）；
 *  外点收起：点在面板内/磁贴本体不收；点在另一磁贴上不收（可能是下一轮
 *  拖拽/开另一夹）；modal 遮罩在面板外，点击由遮罩自身 pointerdown 收起。 */
function FolderPopover({
  folder,
  iconStyle,
  folderIconStyle = "grid2",
  editing,
  onEnterEdit,
  onDelete,
  onRename,
  onDissolve,
  onClose,
  anchorEl,
  openStyle,
}: {
  folder: StartFolder;
  iconStyle: IconStyle;
  editing: boolean;
  onEnterEdit: () => void;
  onDelete: (id: string) => void;
  onRename: (name: string) => void;
  onDissolve: () => void;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  /** v8.7.158 展开形态（主组件透传 settings.folderOpenStyle；inline 不达此处） */
  openStyle: Exclude<FolderOpenStyle, "inline">;
  /** v8.7.161 磁贴图标形态（透传 settings.folderIconStyle）：morph 皮层
   *  迷你格与磁贴本体同源跟随（grid2 2×2 / grid3 3×3） */
  folderIconStyle?: FolderIconStyle;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /* v8.7.160 exit 期闸 + 卸载报告：AnimatePresence 退出时 isPresent 变
     false——① measure 冻结（缩回中逐帧中间尺寸不回灌）；② 卡片 exit 播完
     的 onAnimationComplete 里调 safeToRemove（usePresence 消费者必须手动
     报告，否则 AnimatePresence 永远等待、卡片停在 gone 终态不卸载）。
     isPresent 用 ref 镜像供 useCallback 的 measure 读新鲜值。 */
  const [isPresent, safeToRemove] = usePresence();
  const isPresentRef = useRef(true);
  isPresentRef.current = isPresent;
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    below: boolean;
    /** v8.7.160 容器终态自然尺寸：容器 inline 固定，卡片 rect 动画纯在
     *  容器坐标系内进行——内容层零位移（卡片生长不挤压内容布局） */
    w: number;
    h: number;
  } | null>(null);
  /** v8.7.159 morph 真形变矩形：磁贴本体（.tile-shell）相对面板容器的
   *  偏移与尺寸——enter 起点与 gone 终点共用，起终点像素级对齐磁贴 */
  const [mrect, setMrect] = useState<MorphRect | null>(null);
  /** v8.7.159 绽放期跟随闸：磁贴 rect 弹簧长卡期间面板宽度逐帧处于中间值，
   *  此窗内 measure 的 clamp 回灌会让弹簧追着抖（逐帧中间尺寸回灌），
   *  一律短路；~520ms（spring 420/34/0.9 收敛尾）后恢复让位/滚动跟随 */
  const growingRef = useRef(false);
  const modal = openStyle === "modal";
  /* v8.7.159 skin 磁贴观感色相：与九宫格磁贴同源 hueOf(夹名)（同夹恒同色） */
  const hue = hueOf(folder.name);

  const measure = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!anchorEl || !anchorEl.isConnected) {
      onClose();
      return;
    }
    /* v8.7.159 绽放期跟随闸 + v8.7.160 exit 期闸（ref 镜像保证新鲜值）：
       真身卡片 rect 弹簧/缩回中短路，口径见 growingRef 注与 isPresentRef 注 */
    if (!isPresentRef.current || (!modal && growingRef.current)) return;
    const a0 = anchorEl.getBoundingClientRect();
    /* v8.7.159 morph 真形变起点：磁贴本体（.tile-shell，不含下方名称标签）
     * 实测——面板锚定的 data-entry-id 包裹层含标签，须下沉取本体 */
    const a =
      modal
        ? a0
        : (anchorEl.querySelector<HTMLElement>(".tile-shell")?.getBoundingClientRect() ?? a0);
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let left: number;
    let top: number;
    let below: boolean;
    if (modal) {
      /* 居中模态：几何中心 clamp 进视口（四周留 8px 边距） */
      left = Math.max(8, (window.innerWidth - pw) / 2);
      left = Math.min(left, window.innerWidth - pw - 8);
      top = Math.max(8, (window.innerHeight - ph) / 2);
      top = Math.min(top, window.innerHeight - ph - 8);
      below = false;
    } else {
      /* v8.7.160 morph 覆盖式展开（用户口径「文件夹在磁贴上层打开」）：
         白卡中心与磁贴中心对齐（clamp 进视口）——形变自磁贴矩形向四周
         均匀长大、完全盖住磁贴本体，即「磁贴在白卡下层被覆盖」；
         v8.7.159 的磁贴正下方开卡（below）废弃 */
      left = a.left + a.width / 2 - pw / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      top = a.top + a.height / 2 - ph / 2;
      top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
      below = false;
    }
    if (!modal) {
      /* v8.7.159 morph 真形变矩形：磁贴本体相对面板容器的偏移与尺寸
       * （enter 起点与 gone 终点），绽放期闸外实时跟随磁贴让位 */
      const mx = Math.round(a.left - left);
      const my = Math.round(a.top - top);
      const mw = Math.round(a.width);
      const mh = Math.round(a.height);
      setMrect((r) =>
        r && r.x === mx && r.y === my && r.w === mw && r.h === mh
          ? r
          : { x: mx, y: my, w: mw, h: mh }
      );
    }
    setPos((p) =>
      p &&
      p.left === Math.round(left) &&
      p.top === Math.round(top) &&
      p.below === below
        ? p
        : { left: Math.round(left), top: Math.round(top), below, w: pw, h: ph }
    );
  }, [anchorEl, onClose, modal]);

  /* v8.7.159 绽放期置位：pos 到位（静置量尺份 → 真身重挂）即开闸，spring
   * 收敛尾后恢复 measure 跟随；声明在 measure effect 之前——同轮 layout
   * effects 按声明序执行，保证真身首帧 measure 前已闸住 */
  const posReady = pos != null;
  useLayoutEffect(() => {
    if (!posReady || modal) return;
    growingRef.current = true;
    const t = setTimeout(() => {
      growingRef.current = false;
    }, 520);
    return () => clearTimeout(t);
  }, [posReady, modal]);

  /* 无依赖数组 = 每次渲染后重定位（父级重渲染即跟随拖拽让位） */
  useLayoutEffect(() => {
    measure();
  });
  useEffect(() => {
    const onMove = () => measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [measure]);

  /* 外点收起：面板内/磁贴本体不收；点在另一磁贴上不收（下一轮拖拽或开另一夹）。
     modal 遮罩是面板的兄弟层（不在 data-cl-folder-popover 标记内），点击不命中
     本守卫的早退分支，落到 onClose——与遮罩自身 onPointerDown 收起双保险同效 */
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || typeof t.closest !== "function") return;
      if (panelRef.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      if (t.closest("[data-cl-tile], [data-cl-folder-popover]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose, anchorEl]);

  return (
    <>
      {/* modal 遮罩：整墙压暗 + 高斯模糊（面板兄弟层，z 在卡下；点遮罩即收起；
          AnimatePresence exit 与卡片同窗淡出还原整墙） */}
      {modal && (
        <motion.div
          aria-hidden
          data-cl-folder-modal="1"
          className="fixed inset-0 z-[54] bg-zinc-950/45 backdrop-blur-[6px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16 } }}
          transition={{ duration: 0.2 }}
          onPointerDown={(e) => {
            if (e.button === 0) onClose();
          }}
        />
      )}
      <div
        ref={panelRef}
        data-cl-folder-popover="1"
        className="fixed z-[55]"
        style={{
          left: pos?.left ?? -9999,
          top: pos?.top ?? -9999,
          /* v8.7.160 容器 inline 固定为量尺终态尺寸：卡片 rect/scale 动画在
             容器坐标系内进行，内容层布局与动画解耦（夹内磁贴零位移） */
          width: pos?.w,
          height: pos?.h,
          visibility: pos ? undefined : "hidden",
        }}
      >
        {pos ? (
          <>
            <motion.div
              {...(modal
                ? {
                    initial: { opacity: 0, scale: 0.88, y: 16 },
                    animate: { opacity: 1, scale: 1, y: 0 },
                    exit: {
                      opacity: 0,
                      scale: 0.9,
                      y: 8,
                      transition: { duration: 0.18, ease: "easeIn" },
                    },
                    transition: FOLDER_SPRING,
                    style: { transformOrigin: "center center" },
                  }
                : {
                    /* v8.7.159 morph 真形变：从磁贴矩形（enter）rect 弹簧长到
                       容器终态（shown 100%），收起经 gone 反向缩回磁贴矩形——
                       起终点像素级对齐磁贴本体；v8.7.160 卡片纯覆盖层（内容
                       层已分离到容器坐标系），夹内磁贴不再随卡片生长位移 */
                    variants: morphCardVariants(mrect),
                    initial: "enter" as const,
                    animate: "shown" as const,
                    exit: "gone" as const,
                  })}
              onAnimationComplete={() => {
                /* v8.7.160 exit 播完手动报告 safeToRemove——usePresence 消费
                   者的卸载义务，缺失会让卡片停在 gone 终态永不卸载 */
                if (!isPresent) safeToRemove();
              }}
              className={
                "solid-card rounded-2xl shadow-2xl " +
                (modal ? "relative" : "absolute inset-0")
              }
            >
              {/* morph skin 层：磁贴本体观感（hueOf 渐变玻璃 + 白/墨玻璃底 +
                  与磁贴本体完全同源的缩微格墙/空夹夹形——网格随 folderIconStyle
                  同步：grid2 2×2 gap-[3px] p-[9px] / grid3 3×3 gap-[2px] p-[7px]），
                  格子随卡片 rect 放大一起拉伸；160ms 后交叉淡出露出演成面板；
                  pointer-events 恒关，绝不拦截交互 */}
              {openStyle === "morph" && (
                <motion.span
                  aria-hidden
                  data-cl-folder-morph-preview="1"
                  variants={FOLDER_SKIN_VARIANTS}
                  className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit]"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-[inherit]"
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(" +
                        hue +
                        " 42% var(--tile-grad-l1, 62%) / var(--tile-grad-a1, 0.22)), hsl(" +
                        ((hue + 40) % 360) +
                        " 46% var(--tile-grad-l2, 50%) / var(--tile-grad-a2, 0.14)))",
                    }}
                  />
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-[inherit] bg-white/30 dark:bg-zinc-900/70"
                  />
                  {folder.children.length === 0 ? (
                    <span className="relative flex h-full w-full items-center justify-center">
                      <Folder
                        className="h-10 w-10 text-zinc-600/70 dark:text-zinc-200/70"
                        strokeWidth={1.4}
                      />
                    </span>
                  ) : (
                    <span
                      className={
                        "relative grid h-full w-full " +
                        (folderIconStyle === "grid3"
                          ? "grid-cols-3 gap-[2px] p-[7px]"
                          : "grid-cols-2 gap-[3px] p-[9px]")
                      }
                    >
                      {folder.children.slice(0, folderIconStyle === "grid3" ? 8 : 3).map((c) => (
                        <TileIcon key={c.id} link={c} iconStyle={iconStyle} bare />
                      ))}
                      {folder.children.length > (folderIconStyle === "grid3" ? 8 : 3) ? (
                        <span className="flex items-center justify-center rounded-[6px] bg-white/30 text-[10px] font-light tracking-wide text-zinc-600/80 dark:bg-white/10 dark:text-zinc-200/85">
                          +{folder.children.length - (folderIconStyle === "grid3" ? 8 : 3)}
                        </span>
                      ) : folderIconStyle === "grid3" ? (
                        Array.from(
                          { length: 9 - Math.min(folder.children.length, 9) },
                          (_, i) => (
                            <span
                              key={"sph" + i}
                              className="rounded-[6px] bg-white/20 dark:bg-white/[0.04]"
                            />
                          ),
                        )
                      ) : (
                        <span className="rounded-[6px] bg-white/30 dark:bg-white/10" />
                      )}
                    </span>
                  )}
                </motion.span>
              )}
              {/* modal 内容层：随卡片 scale 入退场（居中模态语言，卡片包裹） */}
              {modal && (
                <div className="relative">
                  <FolderPanelBody
                    folder={folder}
                    iconStyle={iconStyle}
                    editing={editing}
                    onEnterEdit={onEnterEdit}
                    onDelete={onDelete}
                    onRename={onRename}
                    onDissolve={onDissolve}
                    onClose={onClose}
                    maxH="max-h-[min(420px,58vh)]"
                  />
                </div>
              )}
            </motion.div>
            {/* morph 内容层（v8.7.160 与卡片分离）：absolute 盖容器=终态坐标，
                打开即全尺寸在位（opacity 0→1 delay 150ms 交叉淡入 skin），
                夹内磁贴零位移；exit 由 isPresent 驱动 100ms 快速淡出露 skin */}
            {openStyle === "morph" && (
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: isPresent ? 1 : 0 }}
                transition={
                  isPresent
                    ? { delay: 0.15, duration: 0.24, ease: "easeOut" }
                    : { duration: 0.1, ease: "easeIn" }
                }
              >
                <FolderPanelBody
                  folder={folder}
                  iconStyle={iconStyle}
                  editing={editing}
                  onEnterEdit={onEnterEdit}
                  onDelete={onDelete}
                  onRename={onRename}
                  onDissolve={onDissolve}
                  onClose={onClose}
                  maxH="max-h-[300px]"
                />
              </motion.div>
            )}
          </>
        ) : (
          /* v8.7.159 量尺态首帧：pos 未定渲染自然尺寸静置份供 measure 实测
             （同一时刻只挂一份 FolderPanelBody），pos 到位换真身卡片重挂
             （framer initial 从磁贴矩形起跳，绽放零跳变） */
          <div aria-hidden className="w-[336px]">
            <FolderPanelBody
              folder={folder}
              iconStyle={iconStyle}
              editing={editing}
              onEnterEdit={onEnterEdit}
              onDelete={onDelete}
              onRename={onRename}
              onDissolve={onDissolve}
              onClose={onClose}
              maxH={modal ? "max-h-[min(420px,58vh)]" : "max-h-[300px]"}
            />
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- v8.7.158 inline 原位内嵌展开（Win11 式，用户选型 4）----------
 *  不走 portal：文件夹磁贴原地膨胀成大卡（FolderPanelBody 完全同源），邻居
 *  磁贴由外层 Tile 的 motion layout 弹簧自动让位；挂 data-cl-folder-inline
 *  稳定锚（verify/冒烟）+ data-cl-folder-popover 标记（编辑退出/中键呩出
 *  外点守卫三处自动兼容，外点守卫 v8.7.160 起自管于本组件）。入场轻绽放，
 *  尺寸/位置交外层 layout 弹簧；膨胀态外层 sortable 监听已摘（见 Tile）。
 *  v8.7.160 收起动画（用户反馈「关闭动画没做」）：收起走卡内 closing
 *  状态机——onClose 先播 180ms easeIn 收缩淡出（onAnimationComplete 后才
 *  真正翻转 inlineOpen 卸卡），外点空白守卫同走此路（守卫自管，点卡/
 *  磁贴不收，语义与 popover 外点对齐）；点另一磁贴/开另一夹的换夹路径
 *  仍由父层直接切换（旧卡瞬卸，属切换不属收起）。 */
function FolderInlineCard({
  folder,
  iconStyle,
  editing,
  onEnterEdit,
  onDelete,
  onRename,
  onDissolve,
  onClose,
}: {
  folder: StartFolder;
  iconStyle: IconStyle;
  editing: boolean;
  onEnterEdit: () => void;
  onDelete: (id: string) => void;
  onRename: (name: string) => void;
  onDissolve: () => void;
  onClose: () => void;
}) {
  /* v8.7.160 收起状态机：closing 期卡收缩淡出，播完回调真身 onClose */
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    setClosing((c) => (c ? c : true));
  }, []);
  /* 外点收起守卫（v8.7.160 自管，原主组件守卫迁入）：点膨胀卡/磁贴不收
     （可能是下一轮拖拽/开另一夹），空白处收起——走 closing 动画 */
  useEffect(() => {
    if (closing) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || typeof t.closest !== "function") return;
      if (t.closest("[data-cl-folder-inline]")) return;
      if (t.closest("[data-cl-tile]")) return;
      requestClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [closing, requestClose]);

  return (
    <motion.div
      data-cl-folder-inline="1"
      data-cl-folder-popover="1"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={closing ? { opacity: 0, scale: 0.92 } : { opacity: 1, scale: 1 }}
      transition={closing ? { duration: 0.18, ease: "easeIn" } : LAYOUT_SPRING}
      onAnimationComplete={() => {
        if (closing) onClose();
      }}
      style={{ pointerEvents: closing ? ("none" as const) : undefined }}
      className="solid-card w-[336px] max-w-[88vw] overflow-hidden rounded-2xl shadow-2xl"
    >
      <FolderPanelBody
        folder={folder}
        iconStyle={iconStyle}
        editing={editing}
        onEnterEdit={onEnterEdit}
        onDelete={onDelete}
        onRename={onRename}
        onDissolve={onDissolve}
        onClose={requestClose}
      />
    </motion.div>
  );
}

/** 羽化遮罩（v8.7.105）：磁贴区滚动的顶/底收边。
 *  载体是滚动容器的独立兄弟层：backdrop-filter 负责把滚到边界的磁贴糊化，
 *  渐变 mask 负责让糊化强度向远端衰减（羽化）——mask/backdrop root 只作用
 *  本层自己（无后代），磁贴自身的磨砂玻璃不受牵连（磨砂存活律零毒）。
 *  默认 opacity 0（不可滚或已到边），show 时 0.3s 显影。
 *  cs-lite 流畅模式：backdrop-filter 被通配关停，遮罩自然退化为无操作
 *  （磁贴硬裁切）——流畅系统本来就是降级渲染，符合契约。
 *  v8.7.109：常驻形态的 bottom 实例退役（用户指令「不要底部羽化遮罩，删掉
 *  这个」——磁贴少时容器贴内容高，遮罩正压最后一行）——仅抽屉形态继续
 *  使用（抽屉两枚遮罩 v8.7.116 起锚在滚动层外圈的 relative 锚定层上）。
 *  v8.7.116 drop（抽屉 bottom 专用）：遮罩随滚动层底缘对冲下探（bottom:
 *  -drop），贴真实裁切线——负值伸出锚定层底，糊下探带内的磁贴。 */
function FadeVeil({
  side,
  show,
  lift = 0,
  drop = 0,
}: {
  side: "top" | "bottom";
  show: boolean;
  /** v8.7.106 顶缘上探（px）：遮罩上移出磁贴第一排，悬进搜索区空带 */
  lift?: number;
  /** v8.7.116 底缘下探（px）：遮罩随滚动层底缘下移，贴真实裁切线 */
  drop?: number;
}) {
  return (
    <span
      aria-hidden
      className={
        "cl-fade-veil pointer-events-none absolute inset-x-0 z-10 h-7 " +
        (side === "top" ? "top-0 cl-fade-veil-top " : "bottom-0 cl-fade-veil-bottom ") +
        (show ? "cl-fade-veil-on" : "")
      }
      style={
        side === "top" && lift > 0
          ? { top: -lift }
          : side === "bottom" && drop > 0
            ? { bottom: -drop }
            : undefined
      }
    />
  );
}

interface TileProps {
  entry: StartEntry;
  iconStyle: IconStyle;
  editing: boolean;
  /** 常驻形态 56px */
  sm?: boolean;
  onEnterEdit: () => void;
  /** 链接 = 深度删除；文件夹 = 拆夹散落（QuickLinks 主组件内按类型分派） */
  onDelete: (id: string) => void;
  /** v8.7.156 文件夹点击 → 原位展开 popover */
  onOpenFolder: (id: string) => void;
  /** v8.7.158 inline 原位内嵌：本夹已膨胀为内嵌大卡（取代磁贴本体，
   *  外层 sortable 拖拽监听同步摘除——子磁贴拖拽不与外层抢指针） */
  inlineOpen?: boolean;
  /** v8.7.158 文件夹改名（inline 膨胀卡头部用；popover 走 portal props） */
  onRenameFolder?: (id: string, name: string) => void;
  /** v8.7.160 入场动画通道开关：墙面默认播（首屏升起），夹内面板禁
   *  （用户口径「打开文件夹不要播入场动画」——磁贴直接在位零位移） */
  intro?: boolean;
  /** v8.7.161 文件夹磁贴图标形态（grid2/grid3，透传 TileVisual→FolderTileVisual） */
  folderIconStyle?: FolderIconStyle;
}

/** memo 化：拖拽跨格只动数组顺序，未受影响磁贴的 props 恒等 → 跳过重渲染 */
const Tile = memo(function Tile({ entry, iconStyle, folderIconStyle = "grid2", editing, sm = false, onEnterEdit, onDelete, onOpenFolder, inlineOpen = false, onRenameFolder, intro = true }: TileProps) {
  /* dnd-kit 只用来「跟踪指针 + 判定落点」：重排走数组 splice，位置动画由
     framer layout 承载（两层各管一段，transform 不打架） */
  const { setNodeRef, listeners, isDragging } = useSortable({ id: entry.id });
  /* v8.7.158 inline 膨胀态摘拖拽监听：大卡不再被整卡拖走（收起后照常），
     夹内子磁贴的 useSortable 监听独占指针 */
  const sortableListeners = inlineOpen ? undefined : listeners;
  const folder = isFolder(entry);
  const link = folder ? null : (entry as StartLink);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 按下位置：位移容差判定基准 */
  const downXY = useRef<{ x: number; y: number } | null>(null);
  /** 本次手势是否为「长按进入编辑」（其后的 pointerup 不应再触发编辑器） */
  const justEntered = useRef(false);
  /** 长按计时期间置位，用于拦截随后的 click */
  const longPressed = useRef(false);

  function clearTimer() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  /* 触屏长按：进入专项编辑模式（带触感反馈） */
  function armLongPress(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || editing) return;
    justEntered.current = false;
    longPressed.current = false;
    downXY.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      longPressed.current = true;
      justEntered.current = true;
      try {
        navigator.vibrate?.(15);
      } catch {
        /* noop */
      }
      onEnterEdit();
    }, 420);
  }

  /* 静置微动不取消长按，位移超容差（滚动/拖动意图）才取消 */
  function guardMove(e: React.PointerEvent) {
    if (!timer.current || !downXY.current) return;
    const dx = e.clientX - downXY.current.x;
    const dy = e.clientY - downXY.current.y;
    if (dx * dx + dy * dy > LONG_PRESS_SLOP_PX * LONG_PRESS_SLOP_PX) {
      downXY.current = null;
      clearTimer();
    }
  }

  return (
    <motion.div
      ref={setNodeRef}
      layout
      data-entry-id={entry.id}
      /* v8.5.6 律：包裹层不承担入场（initial={false}）——祖先 opacity<1 会成为
         backdrop root 令磨砂失效；入场由玻璃本体与名称的 .link-intro 自承载 */
      initial={false}
      exit={{ opacity: 0, scale: 0.86, transition: { duration: 0.22 } }}
      transition={LAYOUT_SPRING}
      className="group relative select-none"
      {...sortableListeners}
    >
      {/* 拖拽期间磁贴「隐身」（透明 + 穿透），松手 160ms 淡入——浮层飞回落点即本体 */}
      <motion.div
        animate={{ opacity: isDragging ? 0 : 1 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        style={{ pointerEvents: isDragging ? ("none" as const) : undefined }}
      >
        {folder ? (
          inlineOpen ? (
            /* v8.7.158 inline 原位内嵌展开（Win11 式）：磁贴本体被膨胀大卡取代，
               外层 motion layout 弹簧带动邻居让位；收起走 onOpenFolder 翻转 */
            <FolderInlineCard
              folder={entry}
              iconStyle={iconStyle}
              editing={editing}
              onEnterEdit={onEnterEdit}
              onDelete={onDelete}
              onRename={(name) => onRenameFolder?.(entry.id, name)}
              onDissolve={() => onDelete(entry.id)}
              onClose={() => onOpenFolder(entry.id)}
            />
          ) : (
          /* v8.7.156 文件夹磁贴：无 href——点击 = 原位展开 popover；
             右键同开（不放系统菜单）；编辑态短按 = 重命名（popover 内改名） */
          <div
            role="button"
            tabIndex={0}
            data-cl-tile="1"
            onClick={(e) => {
              if (justEntered.current) {
                justEntered.current = false;
                return;
              }
              if (timer.current || longPressed.current) {
                longPressed.current = false;
                return;
              }
              onOpenFolder(entry.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenFolder(entry.id);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (timer.current || longPressed.current) return;
              onOpenFolder(entry.id);
            }}
            onPointerDown={armLongPress}
            onPointerUp={clearTimer}
            onPointerMove={guardMove}
            onPointerCancel={clearTimer}
            aria-label={"打开文件夹 " + entry.name}
            className="flex w-20 touch-pan-y cursor-pointer flex-col items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 accent-ring"
          >
            <TileVisual entry={entry} iconStyle={iconStyle} folderIconStyle={folderIconStyle} jiggle={editing} intro={intro} sm={sm} />
          </div>
          )
        ) : (
          <a
            href={link!.url}
            data-cl-tile="1"
            draggable={false}
            onDragStart={(e) => {
              /* 原生链接拖拽劫持：Chrome 原生 drag 阈值先于 dnd-kit 激活阈值，
                 dragstart 一出 pointer 流即被征用——磁贴「卡手」的真身 */
              e.preventDefault();
            }}
            onClick={(e) => {
              if (justEntered.current) {
                justEntered.current = false;
                e.preventDefault();
                return;
              }
              if (timer.current || longPressed.current || editing) {
                e.preventDefault();
                longPressed.current = false;
                if (editing) emitEditLink(link!); // 编辑态短按 = 编辑该快捷服务
                return;
              }
              // 非编辑态短按 = 正常打开链接。壳 iframe 内提升到顶层整页打开
              //（v8.4.8「拒绝连接」修复）；修饰键/中键不拦，维持原生新标签页。
              if (
                e.button === 0 &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey &&
                !e.altKey &&
                inExtIframe()
              ) {
                e.preventDefault();
                openExternalUrl(link!.url);
              }
            }}
            onContextMenu={(e) => {
              /* v8.6.0（线上并行版同款）：桌面右键不再弹系统菜单——直接进该
                 快捷服务的编辑界面；触屏长按只拦菜单（长按本身已进编辑态） */
              e.preventDefault();
              if (timer.current || longPressed.current) return;
              emitEditLink(link!);
            }}
            onPointerDown={armLongPress}
            onPointerUp={clearTimer}
            onPointerMove={guardMove}
            onPointerCancel={clearTimer}
            aria-label={editing ? "编辑 " + entry.name : entry.name}
            className="flex w-20 touch-pan-y flex-col items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 accent-ring"
          >
            <TileVisual entry={entry} iconStyle={iconStyle} folderIconStyle={folderIconStyle} jiggle={editing} intro={intro} sm={sm} />
          </a>
        )}
      </motion.div>

      {/* 凹槽垫层：拖拽期间盖在隐身磁贴的位置上，松手淡出（与磁贴淡入交叉） */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            key="slot"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            <TilePlaceholder sm={sm} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 编辑态：右上角删除键。非编辑态不再有悬浮铅笔角标——
          桌面右键即进编辑（v8.6.0）、触屏长按进编辑（v1.7.1）。
          v8.7.156：文件夹的 × = 拆夹散落（非破坏，children 回墙） */}
      {editing && (
        <button
          type="button"
          aria-label={(folder ? "拆散文件夹 " : "删除 ") + entry.name}
          title={folder ? "拆散文件夹（站点保留散落回墙）" : undefined}
          tabIndex={-1}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            onDelete(entry.id);
          }}
          className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90 text-white shadow-md transition-transform duration-200 hover:scale-110"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </motion.div>
  );
});

function QuickLinks({
  links,
  setLinks,
  iconStyle,
  columns,
  disabled = false,
  form = "drawer",
  ghost = false,
  dockOn = true,
  folderOpenStyle = "morph",
  folderIconStyle = "grid2",
}: {
  links: StartEntry[];
  setLinks: (updater: (prev: StartEntry[]) => StartEntry[]) => void;
  iconStyle: IconStyle;
  /** 预设 layout.linksColumns：限制每行磁贴数（磁贴 5rem + 间距 1rem + 内边距 2rem
   *  → max-width = 6N+1 rem）；未设时保持默认宽度 */
  columns?: number;
  /** layout.hideLinks：整体停用（中键/批量管理均不响应） */
  disabled?: boolean;
  /** v8.6.2 快捷服务样式：docked = 常驻（v8.5.9 原样式，内联网格）；
   *  drawer = 抽屉（默认，中键唤出全屏磁贴墙） */
  form?: LinksForm;
  /** v8.7.37 布局占位克隆（drawer 形态的隐形 docked 克隆）：只参与布局，
   *  交互监听（中键 / alt+v）一律不挂——否则与真身双监听 */
  ghost?: boolean;
  /** v8.7.108 Dock 栏在位标志（settings.showDock）：翻转触发磁贴区下边界
   *  复测——Dock 挂/卸不改变 rootRef 自身尺寸，rootRef 的 RO 感知不到 */
  dockOn?: boolean;
  /** v8.7.158 文件夹展开方式：morph = 磁贴形变绽放（默认，iOS 同款）/
   *  modal = 居中模态（背景压暗虚化）/ inline = 原位内嵌（磁贴膨胀成大卡）。
   *  三形态面板内容与拖拽链路同源，仅「怎么出现」不同 */
  folderOpenStyle?: FolderOpenStyle;
  /** v8.7.161 文件夹磁贴图标形态：grid2 = 双排迷你格（默认，现状 2×2）/
   *  grid3 = 三排微缩墙（3×3）；morph 皮层迷你格同步跟随本设置 */
  folderIconStyle?: FolderIconStyle;
}) {
  const drawer = form === "drawer";
  /* v8.7.105 磁贴数量不限律（用户指令：不要限制磁贴的数量）：
     v8.7.41 的 4 行上限（linksCap = 4×列数拦新增）退役——添加磁贴恒显示；
     常驻形态磁贴多时区域向下生长至 Dock 上方并内部滚动（见 docked 分支
     dockMaxH 测高），抽屉形态内部滚动（见 drawer 分支 my-auto 滚动层），
     页面本身永远不滚（html/body overflow:hidden 双保险不变）。 */
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  /* mount latch 声明置顶：cs-drawer 类同步 effect 依赖数组渲染期即求值，
     声明若留在下方 latch effect 旁会触发 TDZ（Cannot access before init） */
  const [mount, setMount] = useState(false);

  /* ---------- v8.7.156 文件夹原位展开（popover） ----------
     · openFolderId = 当前展开的文件夹；popover 每次渲染实测磁贴 rect 定位
       （拖拽让位/滚动/resize 全部跟随，不存死坐标）；
     · 拖拽悬停文件夹 500ms 自动展开（dwellTimer）；拖拽会话结束后 popover
       保持展开（连续拖多枚入夹），外点/Esc 收起。 */
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellFolderId = useRef<string | null>(null);
  const openFolder = links.find((e) => e.id === openFolderId && isFolder(e)) as StartFolder | undefined;

  /** 点击/右键文件夹磁贴：原位展开（再点同一夹 = 收起） */
  const openFolderPopover = useCallback((id: string) => {
    setOpenFolderId((cur) => (cur === id ? null : id));
  }, []);

  /* ---------- v8.7.158 三形态展开（folderOpenStyle: morph/modal/inline）----------
     · renameFolder：popover 与 inline 膨胀卡共用的改名动作（id 定位，
       与 v8.7.156 popover 直改同语义）；
     · 收起存续窗：popover 收起后把最后一个夹短保留 270ms，让 portal 内
       AnimatePresence 的 exit 播完（morph 缩回磁贴中心 / modal 淡出）
       再卸载——AnimatePresence 不能包 createPortal 外层（framer v12
       PORTAL 子元素 presence 注册失效律，同抽屉 latch 注释），故放
       portal 内部 + latch 控存续；
     · inline 外点收起：无 portal 守卫，挂主组件（点膨胀卡/另一磁贴
       不收，空白收起）。 */
  const renameFolder = useCallback(
    (id: string, name: string) => {
      setLinks((prev) => patchFolder(prev, id, (f) => ({ ...f, name })));
    },
    [setLinks],
  );
  const [exitFolder, setExitFolder] = useState<StartFolder | null>(null);
  const lastOpenRef = useRef<StartFolder | null>(null);
  /* v8.7.160 收起存续修正（三形态收起动画缺失根修）：openFolder 消失的同一轮
     渲染就同步补位 exitFolder（React 渲染期状态调整）——v8.7.159 用 effect
     后置 set，渲染先行一拍把 portal 条件打成 false（popFolder=null），
     AnimatePresence 连同还在场的卡片被整个卸载，exit 动画从未播出；
     同步补位后 portal 连续在场，child 切 null 时 exit 才真正接得住。
     latch 窗口（270ms）照旧由下方 effect 收尾清场。 */
  if (openFolder) {
    lastOpenRef.current = openFolder;
    if (exitFolder !== null) setExitFolder(null);
  } else if (lastOpenRef.current && exitFolder === null) {
    setExitFolder(lastOpenRef.current);
  }
  useEffect(() => {
    if (openFolder || !exitFolder) return;
    const t = setTimeout(() => {
      setExitFolder(null);
      /* v8.7.160 引用一并清：否则渲染期补位条件（lastOpenRef 非空且
         exitFolder 为 null）会把 exitFolder 复活，portal 壳 270ms 空转循环 */
      lastOpenRef.current = null;
    }, 270);
    return () => clearTimeout(t);
  }, [openFolder, exitFolder]);
  /** portal 渲染目标（收起存续窗共用）：exit 期的夹已离场但仍在播动画 */
  const popFolder = openFolder ?? exitFolder;

  /* 拖拽会话期背景冻结（v8.7.155 三闸门律复用）：activeId 非空 = 拖拽中——
     极光/壁纸 kenburns/视频暂停，毛玻璃磁贴的 backdrop 采样链全链静止，
     多开场景下拖拽让位的合成成本大幅下降（掉帧根修 GPU 侧） */
  useBgFreeze(activeId != null);

  /** 文件夹磁贴定位节点（popover 锚定用）：data-entry-id 由 Tile 挂在
   *  sortable 包裹层上，两形态（常驻/抽屉）磁贴都在 rootRef 子树内 */
  const folderAnchorEl = useCallback(
    (id: string) =>
      rootRef.current?.querySelector<HTMLElement>(
        `[data-entry-id="${CSS.escape(id)}"]`
      ) ?? null,
    []
  );

  /* ---------- v8.7.38 标签系统退役 ----------
     v8.7.36/37 的收藏书签区与滚轮翻页整体退役（用户指令：删掉标签系统，
     弹窗改「添加至快捷服务」直达磁贴）——start:bookmarks 数据面、
     bkmPage 翻页、滚轮监听、start:bookmarks-open 意图全部拆除；
     旧数据由 use-start-data 挂载期一次性清理。磁贴墙 rootRef 同步还原
     v8.7.35 内容宽（w-full 曾为书签页布局所加——它让磁贴行左右两侧空白
     落进 pointer-events-auto 的 rootRef，抽屉点空白退出的区域因此缩水；
     cl-links-fade 淡入包装层同期拆除——fill:both 驻留动画在合成器滞留
     渲染表面形成 backdrop root，后代 .tile-frost 磨砂全灭）。 */
  /* ---------- v8.7.37 alt+v 快捷键开关抽屉（仅抽屉形态真身）----------
     与中键同守卫（禅模式豁免 + 输入焦点豁免）。壳架构下焦点在顶层
     shell 文档时键盘事件进不来（与 ESC 同一架构限制）——中键/点击
     页面后 window.focus() 归位，alt+v 处理完同样归位，连续快捷键
     不断链。 */
  useEffect(() => {
    if (disabled || ghost) return;
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.code !== "KeyV") return;
      if (document.documentElement.classList.contains("zen")) return;
      const ae = document.activeElement as Element | null;
      if (
        ae &&
        typeof ae.closest === "function" &&
        ae.closest("input, textarea, select, [contenteditable=\"true\"]")
      )
        return;
      e.preventDefault();
      setOpen((o) => !o);
      window.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, drawer, ghost]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  /* 拖拽排序：6px 位移阈值起拖——阈值内仍是普通点击；触摸端长按 420ms 进编辑 */
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));

  /* 拖拽手感：横向速度倾斜（spring motion value 直写样式，不触发重渲染）+
     抬起态三件套（缩放/光晕/厚影），松手与浮层 300ms 飞回同频落地 */
  const reduceMotion = useReducedMotion();
  const tilt = useSpring(0, { stiffness: 240, damping: 26, mass: 0.5 });
  const liftScale = useSpring(1, { stiffness: 420, damping: 34, mass: 0.9 });
  const glowO = useSpring(0, { stiffness: 260, damping: 30 });
  const shadowO = useSpring(0, { stiffness: 260, damping: 30 });
  const dragSample = useRef<{ x: number; t: number } | null>(null);

  /* 批量管理入口（右键菜单）：抽屉 = 开抽屉直进编辑；常驻 = 原地进编辑 */
  useEffect(() => {
    if (disabled) return;
    const onManage = () => {
      if (drawer) {
        setOpen(true);
        setEditing(true);
      } else {
        setEditing(true);
      }
    };
    window.addEventListener("start:links-manage", onManage);
    return () => window.removeEventListener("start:links-manage", onManage);
  }, [disabled, drawer]);

  /* ---------- 中键唤出/关闭（仅抽屉形态） ----------
     mousedown button===1：页面空白处唤出/收起抽屉。守卫：交互元素（磁贴原生
     「新标签页打开」不动）、Dock、对话框/面板、禅模式、hideLinks；并吞掉
     空白处中键默认的自动滚动。
     preventDefault 会同时阻断 mousedown 的默认聚焦 —— 壳架构（app 在
     iframe 内）下焦点原本就在顶层 shell 文档上，键盘事件进不来；故唤出后
     主动 window.focus() 把键盘归位到 app（点击自带的 user activation 让
     这次跨框聚焦合法），否则 ESC 等快捷键在「未先左键点过页面」时全部失灵。 */
  useEffect(() => {
    if (disabled || !drawer) return;
    const onMiddle = (e: MouseEvent) => {
      if (e.button !== 1) return;
      if (document.documentElement.classList.contains("zen")) return;
      const t = e.target as Element | null;
      if (!t || typeof t.closest !== "function") return;
      if (
        t.closest(
          "a, button, input, textarea, select, [role='button'], [role='dialog'], [data-cl-tile], [data-cl-folder-popover], .cl-dock, .cl-dockwidget",
        )
      )
        return;
      e.preventDefault();
      setOpen((o) => !o);
      window.focus();
    };
    document.addEventListener("mousedown", onMiddle);
    return () => document.removeEventListener("mousedown", onMiddle);
  }, [disabled, drawer]);

  /* html.cs-drawer 同步（仅抽屉）：标记抽屉挂载态供 globals 使用。
     v8.6.26 起 Dock 不再抬升到纱罩之上（z-48 规则退役，用户指令：抽屉
     打开后 Dock 与搜索栏同层坐在磨砂之下）；退场窗内点击不被吞由纱罩
     包裹层 pointerEvents:none（open=false 即禁命中）承担，历史 z-48 抬升
     的唯一理由已不成立。 */
  useEffect(() => {
    const el = document.documentElement;
    if (mount && drawer) el.classList.add("cs-drawer");
    else el.classList.remove("cs-drawer");
    return () => el.classList.remove("cs-drawer");
  }, [mount, drawer]);

  /* 退场同步类（v8.6.3 起）：open=false 且 latch 未卸（520ms 退场窗）→
     html.cs-drawer-closing，磁贴叶（霜层/内容层/名称/添加位）经 .cl-fade-leaf
     与纱罩同频淡出（globals.css + 上方 WAAPI 并行动画）。类必须挂 <html>——
     常挂架构下组件树内改 className 虽可达，html 选择器仍是最直活 DOM 通道，
     且与流式模式通配降级同一挂载点。 */
  /* v8.6.7 打断并行动画：入场中途关闭（快速中键两下/ESC/点纱罩）时，
     运行中的 intro 动画会阻断 CSS transition 起步（CSS Transitions §3），
     important 声明也只得到瞬跳——用户实测「打断抽屉动画后不会执行关闭
     动画，动画直接消失」。改为全叶 WAAPI 冻结-淡出：读叶当前动画值 →
     el.animate 从当前值 300ms 淡出到 0（与染色/叶过渡 0.3s 同频同缓动，
     v8.7.4 ㊻ 对齐；fill: forwards 保持），Web Animations 层级高于普通
     声明且与纱罩并行。
     不设计算值阈值：EASE 长尾段 intro 最后 ~150ms 计算值就是 1.000 而动画
     仍在跑，阈值分路会让叶子滞留满透明度站满退场窗。也不动 intro 本体
     （无 inline animation:none）——快速重开 cancel 后 intro 从时间线当前
     位接着走/已播完保持稳态，与常挂架构的「晚开重播（latch 卸载后新挂）」
     语义互不打架。稳态退场（intro 已完）仍由 globals.css 的过渡规则兜底。 */
  /* v8.6.23 纱罩开关门控：rAF 置位保首次唤出也有凝聚入场
     （portal 首挂即 open，若直挂 data-veil=1 则首帧无过渡瞬跳；
     rAF 后下一帧置 1，CSS transition 从闭态值起插值） */
  const [veilOn, setVeilOn] = useState(false);
  useEffect(() => {
    if (!open) {
      setVeilOn(false);
      return;
    }
    const id = requestAnimationFrame(() => setVeilOn(true));
    return () => cancelAnimationFrame(id);
  }, [open]);
  const fadeAnimsRef = useRef<Array<Animation>>([]);
  useEffect(() => {
    const el = document.documentElement;
    if (mount && drawer && !open) {
      el.classList.add("cs-drawer-closing");
      const leaves = rootRef.current?.querySelectorAll<HTMLElement>(".cl-fade-leaf");
      leaves?.forEach((leaf) => {
        const o = parseFloat(getComputedStyle(leaf).opacity);
        if (!Number.isFinite(o)) return;
        const anim = leaf.animate([{ opacity: o }, { opacity: 0 }], {
          duration: 300,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        });
        fadeAnimsRef.current.push(anim);
      });
    } else {
      el.classList.remove("cs-drawer-closing");
      fadeAnimsRef.current.forEach((a) => {
        try {
          a.cancel();
        } catch {
          /* noop */
        }
      });
      fadeAnimsRef.current = [];
    }
    return () => el.classList.remove("cs-drawer-closing");
  }, [open, mount, drawer]);

  /* ESC：对话框层在场时让位（页面级 ESC 层联先处理它们）；编辑态先退编辑。
     壳架构下焦点可能留在顶层 shell 文档（中键 preventDefault 阻断聚焦、
     window.focus() 在部分时机被浏览器拒绝），键盘事件只达顶层 —— 故同源
     顶层（window.top ≠ window 时）挂同一份监听双保险。
     v8.6.2：常驻形态也要能 ESC 退编辑 → 注册条件 open || editing。 */
  useEffect(() => {
    if (!open && !editing && !openFolderId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[role='dialog']")) return;
      if (openFolderId) {
        /* v8.7.156 文件夹 popover 最先收起（层联最上层） */
        setOpenFolderId(null);
        return;
      }
      if (editing) {
        setEditing(false);
        return;
      }
      if (drawer) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const top = window.top;
    if (top && top !== window) top.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (top && top !== window) top.removeEventListener("keydown", onKey);
    };
  }, [open, editing, drawer, openFolderId]);

  /* 抽屉打开期间点 Dock：先收抽屉（capture 先于 Dock 自身逻辑），面板随后正常打开 */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t && typeof t.closest === "function" && t.closest(".cl-dock")) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  /* 编辑模式：点击磁贴区域外（纱罩/页面空白/Dock）退出（与移动端系统直觉一致） */
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || typeof t.closest !== "function") return;
      if (rootRef.current?.contains(t)) return;
      // 链接编辑对话框内点击不退出
      if (t.closest("[role='dialog']")) return;
      // v8.7.156 文件夹 popover（portal 到 body，不在 rootRef 内）不退出
      if (t.closest("[data-cl-folder-popover]")) return;
      setEditing(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [editing]);

  /* v8.7.156 拖拽浮层条目：顶层或文件夹内皆可命中（拖夹内磁贴浮层照常） */
  const activeEntry: StartEntry | null = (() => {
    if (!activeId) return null;
    const loc = locateLink(links, activeId);
    if (loc) return loc.folder ? loc.folder.children[loc.childIndex] : (links[loc.wallIndex] as StartLink);
    return links.find((e) => e.id === activeId) ?? null; // 拖的是文件夹
  })();

  function clearDwell() {
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
    dwellFolderId.current = null;
  }

  function handleDragStart(e: DragStartEvent) {
    dragSample.current = null;
    tilt.set(0);
    liftScale.jump(reduceMotion ? 1 : 0.92);
    liftScale.set(reduceMotion ? 1 : 1.07);
    glowO.jump(0);
    glowO.set(0.26);
    shadowO.jump(0);
    shadowO.set(1);
    setActiveId(String(e.active.id));
  }

  /* 横向速度 → 倾斜角（夹在 ±7°），停下回正 */
  function handleDragMove(e: DragMoveEvent) {
    const rect = e.active.rect.current.translated;
    if (!rect) return;
    const now = performance.now();
    const prev = dragSample.current;
    dragSample.current = { x: rect.left, t: now };
    if (!prev) return;
    const dt = Math.max(16, now - prev.t);
    const vx = ((rect.left - prev.x) / dt) * 1000;
    tilt.set(Math.max(-7, Math.min(7, vx * 0.012)));
  }

  /* ---------- v8.7.156 跨容器拖拽让位（墙 ⇄ 文件夹） ----------
     · 墙内磁贴互让 = 顶层 splice（原语义）；链接掠过文件夹 = 粘滞不排序；
     · 拖到夹内子磁贴/夹区 = 入夹（putLinkIntoFolder）；
     · 夹内子磁贴拖到墙上磁贴 = 出夹插位（takeLinkOutOfFolder）；
     · 悬停文件夹磁贴 500ms = dwell 自动展开该夹（iOS 同款）——展开后
       松手（指针仍在夹上）= 入夹；展开态夹磁贴 = 吸收落点；
     · 拖拽会话结束后 popover 保持展开，可连续拖多枚入夹。 */
  function handleDragOver(e: DragOverEvent) {
    const from = String(e.active.id);
    const to = e.over ? String(e.over.id) : null;
    if (!to || from === to) {
      clearDwell();
      return;
    }
    /* 拖的是否文件夹（拖拽会话中类型不变，闭包读当前 links 足够） */
    const isFolderActive = links.some((x) => x.id === from && isFolder(x));

    /* dwell 自动开夹：over = 墙上文件夹磁贴（且非已展开的那个）→ 500ms 展开 */
    const overWallEntry = links.find((x) => x.id === to);
    if (overWallEntry && isFolder(overWallEntry) && to !== openFolderId) {
      if (dwellFolderId.current !== to) {
        clearDwell();
        dwellFolderId.current = to;
        dwellTimer.current = setTimeout(() => {
          dwellTimer.current = null;
          dwellFolderId.current = null;
          setOpenFolderId(to);
        }, 500);
      }
    } else {
      clearDwell();
    }

    setLinks((prev) => {
      const fromLoc = locateLink(prev, from);

      if (to === "cl-wall-zone") {
        /* 墙面空白区：夹内磁贴出夹追加到墙尾；墙内磁贴无操作 */
        return fromLoc?.folder ? takeLinkOutOfFolder(prev, from)[0] : prev;
      }
      if (to === "cl-folder-zone") {
        /* 夹区空白：入当前展开夹（追加尾）；已在夹内则为自由落点不动 */
        if (openFolderId && (!fromLoc?.folder || fromLoc.folder.id !== openFolderId)) {
          return putLinkIntoFolder(prev, from, openFolderId)[0];
        }
        return prev;
      }

      const overEntry = prev.find((x) => x.id === to);
      if (overEntry && isFolder(overEntry)) {
        /* over = 墙上文件夹磁贴：
           - 拖的是另一夹内子磁贴 → 出夹进该夹（追加尾）；
           - 该夹 popover 已展开（dwell 刚自动开的/手动点的）→ 落点即入夹
             ——展开就是「打开盖子」，指针仍停在夹磁贴上松手 = 收进去；
           - 拖链接掠过 → 【粘滞】：不触发邻位排序（文件夹不被弹开、dwell
             不被 over 翻转重置——否则「追着夹子跑」，500ms 悬停永不开夹）。
             链接与文件夹的相对排序由夹旁链接磁贴的让位挪动承担；文件夹
             之间排序走「拖文件夹到另一文件夹」分支（下方 reorderWall）。 */
        if (fromLoc?.folder) {
          if (fromLoc.folder.id !== to) return putLinkIntoFolder(prev, from, to)[0];
          return prev;
        }
        if (to === openFolderId) return putLinkIntoFolder(prev, from, to)[0];
        if (isFolderActive) return reorderWall(prev, from, to);
        return prev;
      }

      const toLoc = locateLink(prev, to);
      if (!toLoc) return prev;

      if (fromLoc?.folder && toLoc.folder && fromLoc.folder.id === toLoc.folder.id) {
        /* 同夹内排序 */
        const fid = fromLoc.folder.id;
        return patchFolder(prev, fid, (f) => {
          const ci = f.children.findIndex((c) => c.id === from);
          const ti = f.children.findIndex((c) => c.id === to);
          if (ci < 0 || ti < 0 || ci === ti) return f;
          const children = [...f.children];
          const [moved] = children.splice(ci, 1);
          children.splice(ti, 0, moved);
          return { ...f, children };
        });
      }
      if (fromLoc?.folder && !toLoc.folder) {
        /* 夹内 → 墙上磁贴：出夹插到该磁贴位置 */
        return takeLinkOutOfFolder(prev, from, toLoc.wallIndex)[0];
      }
      if (!fromLoc?.folder && toLoc.folder) {
        /* 墙内 → 夹内子磁贴：入夹插到该子磁贴位置 */
        return putLinkIntoFolder(prev, from, toLoc.folder.id, toLoc.childIndex)[0];
      }
      /* 墙内互让（含文件夹磁贴参与排序） */
      return reorderWall(prev, from, to);
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    clearDwell();
    dragSample.current = null;
    tilt.set(0);
    liftScale.set(1);
    glowO.set(0);
    shadowO.set(0);
    /* v8.7.156 松手兜底：dwell 自动开夹后指针若未再移动（dragOver 不再
       触发），落点=已展开夹的磁贴本身——此刻松手应入夹而非排序。
       putLinkIntoFolder 幂等：dragOver 已吸收过的再次调用零变更。 */
    const overId = e.over ? String(e.over.id) : null;
    if (overId && overId === openFolderId) {
      const from = String(e.active.id);
      setLinks((prev) => {
        const loc = locateLink(prev, from);
        if (loc?.folder && loc.folder.id === overId) return prev; // 已在夹内
        return putLinkIntoFolder(prev, from, overId)[0];
      });
    }
    setActiveId(null);
  }

  const enterEdit = useCallback(() => setEditing(true), []);
  /* v8.7.156 删除分派：文件夹 × = 拆夹散落（非破坏）；链接 = 深度删除
     （顶层或在夹内都删得掉）；正展开的夹被拆 → 同步收起 popover */
  const removeEntry = useCallback(
    (id: string) => {
      setLinks((prev) => {
        const entry = prev.find((e) => e.id === id);
        if (entry && isFolder(entry)) return dissolveFolder(prev, id);
        const loc = locateLink(prev, id);
        if (loc?.folder) {
          return patchFolder(prev, loc.folder.id, (f) => ({
            ...f,
            children: f.children.filter((c) => c.id !== id),
          }));
        }
        return prev.filter((l) => l.id !== id);
      });
      setOpenFolderId((cur) => (cur === id ? null : cur));
    },
    [setLinks],
  );

  /* ---------- v8.7.105 磁贴区内部滚动（常驻/抽屉两形态）----------
     常驻：磁贴多时区域向下生长封顶内部滚动，页面本身纹丝不动；顶/底
     羽化遮罩（cl-fade-veil）在可滚且未到边时显影——磁贴滑近搜索框时被
     羽化模糊渐渐隐去，不会硬穿到搜索框底下（用户指令的遮罩层）。
     v8.7.106 两调（用户指令）：① 封顶判定改「接近浏览器底部」（下探
     预留 100→12px，Dock 预留退役）；② 顶部羽化带上探 32px 进搜索区
     空带（VEIL_LIFT，遮罩不再压住第一排图标）。
     羽化载体是独立兄弟层（backdrop-filter + 渐变 mask）：不碰磁贴自身
     的磨砂（backdrop root 只作用遮罩层自己，磁贴不是它的后代）。
     抽屉：justify-center 改 my-auto 滚动层——内容少时垂直居中观感不变，
     超过视口时区域内滚动且顶部可达（flex 溢出滚动的标准解法），同一套
     羽化遮罩。滚动条隐藏（cl-links-scroll），滚轮/触控板直滚。
     v8.7.109 两调（用户指令）：③ 常驻底部羽化遮罩退役（「不要底部羽化
     遮罩，删掉这个」）——底缘只剩硬裁切线；④ 滚动容器加 BOTTOM_RESERVE
     底部预留——磁贴一两行时容器贴内容高，入场 intro-tile-rise 从 +26px
     上浮，旧裁切线正落在最后一行上（起步位越界被裁 + 入场变换瞬时撑大
     scrollHeight 令 fade.bottom 误显影且无事件复测驻留不退=用户所见「入场
     动画时遮罩挡住一部分图标」）；预留 40px>26px 后上浮全程在容器内，
     下缘边界整体下移不再遮图标。
     v8.7.116 抽屉羽化锚层根修 + 上下缘外扩（用户指令「抽屉页面上方遮罩
     再往上移一点，现在的挡住了一部分图标，下方遮罩也下移一点」）：抽屉
     两枚 FadeVeil 原锚视口尺寸 motion.div——顶遮罩被 lift 探出视口、底遮罩
     悬在 pb 空带，运行时实测两枚 rect 均与滚动层零交集，羽化自 v8.7.105
     起恒失效（磁贴滑到边缘硬裁=「遮罩挡住图标」所见）。根修=滚动层外套
     relative 锚定层，滚动层负 margin+等值 padding 对冲外扩（顶 32/底 24，
     静止磁贴位置分毫不动），遮罩改锚锚定层贴真实边缘。详见
     DRAWER_VEIL_LIFT/DROP 注释。 */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });
  const measureFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setFade({
      top: el.scrollTop > 4,
      bottom: el.scrollTop < el.scrollHeight - el.clientHeight - 4,
    });
  }, []);
  useEffect(() => {
    if (ghost) return;
    const el = scrollRef.current;
    if (!el) return;
    measureFade();
    const ro = new ResizeObserver(measureFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ghost, measureFade, form]);

  const [dockMaxH, setDockMaxH] = useState<number | null>(null);
  useEffect(() => {
    if (form !== "docked" || ghost) return;
    const el = rootRef.current;
    if (!el) return;
    /* v8.7.108 下边界跟随 Dock 栏顶缘（用户指令「下方遮罩层放到 Dock 栏上面，
       位置跟随 Dock 上方，不管页面怎么变化」）：磁贴区裁切线=Dock 顶缘，
       底部羽化遮罩（bottom-0）随之恒贴 Dock 上沿并随其移动；磁贴不再滑进
       Dock 磨砂底下（v8.7.106 的近底 12px 下探退役）。Dock 不在位
       （showDock=false）回落视口底 12px。
       v8.7.109：滚动容器内加 BOTTOM_RESERVE 底部预留——maxHeight 封顶公式
       不变（裁切线仍=Dock 顶缘），预留只作用于容器内容高一侧（磁贴少时
       容器不再贴死内容底边）与滚动末端余量。
       Dock 顶缘读 offsetTop 而非 getBoundingClientRect：Dock 是 fixed 元素，
       offsetTop 返回布局盒位置，对 dock-intro 的 translateY 入场动画
       （transform 只动视觉盒，不进 offset*）天然免疫——首帧即终值，无需
       「动画落位后复测」链。测量时机：rootRef RO + window resize + Dock 元素
       自身 RO（内容增减改高度）+ dockOn 翻转 + load/字体就绪各一次（晚到
       布局位移补偿）。 */
    let dockRO: ResizeObserver | null = null;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const dock = document.querySelector<HTMLElement>(".cl-dock");
      const limit = dock ? dock.offsetTop : window.innerHeight - 12;
      const h = Math.round(Math.max(188, limit - rect.top));
      setDockMaxH((prev) => (prev === h ? prev : h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    const dockEl = document.querySelector(".cl-dock");
    if (dockEl) {
      dockRO = new ResizeObserver(measure);
      dockRO.observe(dockEl);
    }
    return () => {
      ro.disconnect();
      if (dockRO) dockRO.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
    };
  }, [form, ghost, dockOn]);

  /* portal 挂载 latch：开 → 立即挂载；关 → 留 780ms 窗口播完退场动画再卸载。
     v8.7.4 ㊻ 柔散重写后纱罩 blur 收拢拉长 + React 状态双跳渲染
     （open=false → veilOn effect → data-veil 翻转）起步延迟 ~1-2 帧吃窗，
     旧 520ms 会把柔散尾段截断在 blur≈4px（探针帧级实测）——620ms 给足
     过渡完整走完 + 收尾余量。
     v8.7.6 ㊽ 渐出细腻化后散场拉长到 0.40s——起步链实测 ~230ms + 400ms
     = 630ms 已越过 620ms（尾段截断重演），780ms 重新给足（余量 150ms
     覆盖帧距波动；0.42s visibility 翻转也在窗内）。
     （AnimatePresence 不能直接包 createPortal——framer v12 对 PORTAL 类型
     子元素的 presence 注册失效，首开整树不渲染；故把 AnimatePresence 放进
     portal 内部包纯 motion.div，外层用 latch 控制存续。） */
  useEffect(() => {
    if (open) {
      setMount(true);
      return;
    }
    if (!mount) return;
    const t = setTimeout(() => setMount(false), 780);
    return () => clearTimeout(t);
  }, [open, mount]);

  /* v8.7.158 inline 形态：唯一展开的夹（逐磁贴 bool 透传，memo 未受影响磁贴跳过重渲染） */
  const inlineOpenId = folderOpenStyle === "inline" ? openFolderId : null;

  /** 磁贴墙（两形态共用 JSX）：docked 56px / drawer 64px。
   *  cl-links-grid：nth-child(even) 反向抖动（globals.css，青柠同款交替摆）。
   *  v8.7.156：StartEntry 混存渲染（文件夹磁贴走 FolderTileVisual）；
   *  整墙包 cl-wall-zone droppable——夹内磁贴拖到墙面空白处即出夹回墙。 */
  const renderGrid = (sm: boolean) => (
    <div className="relative w-full">
      <WallZone>
        <div
          className="cl-links-grid mx-auto flex max-w-[680px] flex-wrap items-start justify-center gap-x-4 gap-y-6 px-4"
          style={columns ? { maxWidth: 6 * columns + 1 + "rem" } : undefined}
        >
          <SortableContext items={links.map((e) => e.id)} strategy={rectSortingStrategy}>
            <AnimatePresence mode="popLayout">
              {links.map((en) => (
                <Tile
                  key={en.id}
                  entry={en}
                  iconStyle={iconStyle}
                  folderIconStyle={folderIconStyle}
                  sm={sm}
                  editing={editing}
                  onEnterEdit={enterEdit}
                  onDelete={removeEntry}
                  onOpenFolder={openFolderPopover}
                  inlineOpen={inlineOpenId === en.id}
                  onRenameFolder={renameFolder}
                />
              ))}
            </AnimatePresence>
          </SortableContext>

          {/* 添加磁贴（v8.6.3：抖动上移整单元包裹层——+框与「添加」随磁贴同频
              摆动，修「新建按钮没跟着图标一起动」；data-cl-tile=add 让页面右键
              菜单让位，右键自身只吞默认菜单不弹任何菜单） */}
          {/* v8.6.4：不再用无延迟的 framer 弹簧 —— 与磁贴图标同一套自承载入场
              （.link-intro：同延迟、同缓动、同模糊），整排同拍升起。
              v8.7.105：数量上限删除，添加位恒显示 */}
          <motion.div layout initial={false} exit={{ opacity: 0 }} transition={LAYOUT_SPRING}>
            <button
              type="button"
              data-cl-tile="add"
              onClick={() => emitEditLink(null)}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="添加快捷链接"
              className="group flex w-20 flex-col items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 accent-ring"
            >
              <span className={"flex w-full flex-col items-center gap-2.5" + (editing ? " jiggle" : "")}>
                <span
                  className={
                    "link-intro cl-fade-leaf flex items-center justify-center border border-dashed transition-all duration-300 " +
                    (sm ? "h-14 w-14 rounded-[18px] text-xl " : "h-16 w-16 rounded-[20px] text-2xl ") +
                    (editing
                      ? "border-zinc-400/70 text-zinc-500 dark:border-zinc-500 dark:text-zinc-400"
                      : "border-zinc-300 text-zinc-400 group-hover:scale-105 group-hover:border-zinc-400/70 group-hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-600 dark:group-hover:border-zinc-500 dark:group-hover:text-zinc-300")
                  }
                >
                  +
                </span>
                <span
                  className={
                    "link-intro cl-fade-leaf text-center text-xs font-light tracking-wide transition-colors duration-300 " +
                    (editing
                      ? "text-zinc-500 dark:text-zinc-400"
                      : "text-transparent group-hover:text-zinc-500 dark:group-hover:text-zinc-400")
                  }
                >
                  添加
                </span>
              </span>
            </button>
          </motion.div>
        </div>
      </WallZone>
    </div>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragEnd}
    >
      {/* ---------- 形态一：常驻（v8.5.9 原样式）——内联网格，无纱罩无中键 ----------
          v8.7.105：滚动容器化——磁贴多时区域向下生长并内部滚动，顶/底羽化
          遮罩（FadeVeil）防磁贴滑出边界；磁贴少时容器高=内容高（≤188px）。
          v8.7.108：下边界=Dock 栏顶缘（dockMaxH 实测 .cl-dock rect.top），
          磁贴不再滑进 Dock 底下。
          v8.7.109：底部羽化遮罩退役+容器下缘 BOTTOM_RESERVE 预留（用户指令
          「不要底部羽化遮罩删掉；下方遮罩层再下移一点」）——封顶裁切线仍在
          Dock 顶缘，预留带让入场 26px 上浮全程可见（磁贴一两行时底缘不再
          遮/裁图标）。 */}
      {form === "docked" && (
        <div ref={rootRef} className="cl-links cl-links-docked relative flex w-full flex-col items-center">
          {/* v8.7.106 顶缘上探（用户指令「遮罩位置上调」）：滚动容器
              marginTop/paddingTop 对冲上探 VEIL_LIFT——静止时磁贴位置分毫
              不动，裁切线上移 32px 进「搜索区→磁贴区」空带，羽化遮罩随之
              悬在空带里：滚动中的磁贴在空带内渐渐隐去，不再糊在第一排
              图标上。maxHeight 同步 +VEIL_LIFT（底缘仍=近浏览器底部）。 */}
          <div
            ref={scrollRef}
            className="cl-links-scroll w-full overflow-y-auto overscroll-contain"
            style={
              dockMaxH
                ? { maxHeight: dockMaxH + VEIL_LIFT, marginTop: -VEIL_LIFT, paddingTop: VEIL_LIFT, paddingBottom: BOTTOM_RESERVE }
                : { marginTop: -VEIL_LIFT, paddingTop: VEIL_LIFT, paddingBottom: BOTTOM_RESERVE }
            }
            onScroll={measureFade}
          >
            {renderGrid(true)}
          </div>
          <FadeVeil side="top" show={fade.top} lift={VEIL_LIFT} />
          {/* v8.7.109 底部羽化遮罩退役（用户指令「不要底部羽化遮罩，删掉这个」）：
              磁贴一两行时容器贴内容高，bottom-0 遮罩正压最后一行底边；底缘改
              硬裁切，裁切线经 BOTTOM_RESERVE 下移给入场动画让位。抽屉形态
              两枚遮罩保留（锚在视口尺寸层上，无此问题）。 */}
        </div>
      )}

      {/* ---------- 形态二：抽屉（默认）——portal 全屏磁贴墙 ---------- */}
      {form === "drawer" && mount && portalReady
        ? createPortal(
            /* v8.6.4：去 AnimatePresence，改「常挂 + 按 open 重定向」——
                原实现在动画未播完时打断（快速中键两下、关一半又开）会把退场子树
                卸载重建，动画直接消失；常挂后打断只是重定向：新的并行动画从当前帧
                接着跑（纱罩淡入淡出与磁贴墙位移同频并行）。卸载仍由 mount latch 负责。 */
            <motion.div
              key="cl-drawer"
              className="fixed inset-0 z-[45]"
              style={{ pointerEvents: open ? undefined : "none" }}
            >
                  {/* 纱罩：整页高斯模糊 + 轻染色（v8.6.2 用户指令——不再纯色遮罩）。
                      v8.6.23 磨砂底层律：自身 opacity<1 与祖先同罪杀磨砂（v8.6.22
                      blur-selftest 实验实证，「自承载安全」旧律作废）——磨砂本体在
                      底层走 blur 值通道（CSS transition，data-veil 门控，1px↔20px
                      全程在线），染色渐变走 ::before opacity；模糊经 cs-lite 通配
                      自动降级为纯色纱。veilOn 经 rAF 置位：首次唤出（portal 首挂
                      即 open）也走闭态值→开态的凝聚入场，不瞬跳 */}
                  <div
                    aria-hidden
                    className="cl-drawer-veil absolute inset-0"
                    data-veil={veilOn ? "1" : "0"}
                    style={{ pointerEvents: open ? undefined : "none" }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      if (!editing) setOpen(false);
                    }}
                  />
                  {/* 磁贴墙容器：只动 transform（y/scale）——v8.5.6 磨砂存活律：
                      祖先 opacity<1 会成为 backdrop root 令磁贴磨砂在开关抽屉的
                      动画期间整体失效（v8.6.1 用户实测）；transform 不形成
                      backdrop root，入场/退场全程磨砂在线 */}
                  <motion.div
                    className="pointer-events-none flex h-full w-full flex-col items-center px-6 pb-24 pt-[clamp(1rem,5vh,2.5rem)]"
                    initial={{ y: 42, scale: 0.97 }}
                    animate={open ? { y: 0, scale: 1 } : { y: 42, scale: 0.97 }}
                    /* v8.7.44 进入速度与壁纸放大严格同步（用户指令）：spring →
                       0.4s cubic-bezier(0.5,0,0.3,1)，与 dv-open-kf（纱幕凝聚）/
                       wallpaper-layer（掠影开抽屉壁纸 scale 1→1.08）同时长同曲线
                       ——磁贴上浮、纱幕凝聚、壁纸放大三要素同拍起步同拍落座；
                       回缩（open=false）与壁纸回缩/散场 0.40s 同窗同拍 */
                    transition={{ duration: 0.4, ease: [0.5, 0, 0.3, 1] }}
                  >
                    {/* v8.7.105 抽屉滚动层：my-auto 技巧——内容少时垂直居中
                        （等效原 justify-center），磁贴超过视口时层内滚动且
                        顶部可达（flex 溢出滚动标准解法）；同一套羽化遮罩。
                        v8.7.116 锚层根修：my-auto/max-h-full 上移至外圈
                        relative 锚定层，滚动层以「负 margin + 等值 padding」
                        上下对冲外扩（DRAWER_VEIL_LIFT/DROP）——静止磁贴位置
                        分毫不动（居中按 margin box 计，负 margin 恰被等值
                        padding 抵消），裁切线顶上移 32px/底下移 24px，两枚
                        FadeVeil 改锚锚定层（top:-LIFT / bottom:-DROP）贴真实
                        滚动边缘——旧实现锚视口尺寸层，顶遮罩探出视口、底遮罩
                        悬在 pb 空带，羽化恒失效（磁贴边缘硬裁=用户所见
                        「遮罩挡住一部分图标」）。min-h-0 + flex-1：内容多时
                        滚动层吃满锚定层 margin box（flex 溢出滚动标准律）。 */}
                  <div className="relative my-auto flex max-h-full w-full flex-col">
                    <div
                      ref={scrollRef}
                      className="cl-links-scroll pointer-events-auto flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto overscroll-contain"
                      style={{
                        marginTop: -DRAWER_VEIL_LIFT,
                        paddingTop: DRAWER_VEIL_LIFT,
                        marginBottom: -DRAWER_VEIL_DROP,
                        paddingBottom: DRAWER_VEIL_DROP,
                      }}
                      onScroll={measureFade}
                    >
                      <div ref={rootRef} className="cl-links cl-links-drawer flex flex-col items-center">
                        {renderGrid(false)}
                      </div>
                    </div>
                    <FadeVeil side="top" show={fade.top} lift={DRAWER_VEIL_LIFT} />
                    <FadeVeil side="bottom" show={fade.bottom} drop={DRAWER_VEIL_DROP} />
                  </div>
                  </motion.div>
            </motion.div>,
            document.body,
          )
        : null}

      {/* 拖拽浮层：portal 到 body（两形态共用），z 抬到纱罩（z-45）之上保证拖动全程可见 */}
      {portalReady
        ? createPortal(
            <DragOverlay
              dropAnimation={{ duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}
              style={{ zIndex: 60 }}
            >
              {activeEntry ? (
                <motion.div
                  style={reduceMotion ? undefined : { rotate: tilt, scale: liftScale }}
                  className="pointer-events-none flex w-20 cursor-grabbing flex-col items-center gap-2.5 rounded-xl will-change-transform"
                >
                  <span className="relative block">
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute -inset-3 rounded-[26px] blur-lg"
                      style={{
                        background:
                          "radial-gradient(closest-side, var(--ui-accent), transparent 74%)",
                        opacity: glowO,
                      }}
                    />
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-[20px]"
                      style={{
                        boxShadow:
                          "0 2px 4px -2px rgba(0,0,0,.30), 0 18px 34px -14px rgba(0,0,0,.50), 0 8px 16px -10px rgba(0,0,0,.32)",
                        opacity: shadowO,
                      }}
                    />
                    <span className="relative block">
                      {/* v8.7.156：拖文件夹 = 夹形浮层（与磁贴同款外壳） */}
                      {isFolder(activeEntry) ? (
                        <FolderTileVisual folder={activeEntry} iconStyle={iconStyle} folderIconStyle={folderIconStyle} sm={form === "docked"} />
                      ) : (
                        <TileIcon link={activeEntry} iconStyle={iconStyle} sm={form === "docked"} />
                      )}
                    </span>
                  </span>
                  <span className="tile-label w-full truncate text-center text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
                    {activeEntry.name}
                  </span>
                </motion.div>
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}

      {/* ---------- v8.7.156/v8.7.158 文件夹原位展开 popover（portal，锚定磁贴节点） ----------
          morph 形变/modal 居中走 portal（从磁贴中心绽放 / 居中模态，见 FolderPopover）；
          inline 原位内嵌不走 portal——磁贴原地膨胀（Tile inline 分支 FolderInlineCard）。
          AnimatePresence 置于 portal 内部（framer v12 对 PORTAL 类型子元素的
          presence 注册失效律，见抽屉 latch 注释）；收起 exit（morph 缩回磁贴
          中心 / modal 淡出还原）由 popFolder 存续窗播出后再卸载 portal；
          磁贴让位/滚动/resize 实时跟随；外点/Esc 收起；拖拽会话中保持展开可连续入夹。 */}
      {portalReady && popFolder && !ghost && folderOpenStyle !== "inline"
        ? createPortal(
            <AnimatePresence>
              {openFolder ? (
                <FolderPopover
                  key={openFolder.id}
                  folder={openFolder}
                  iconStyle={iconStyle}
                  editing={editing}
                  onEnterEdit={enterEdit}
                  onDelete={removeEntry}
                  onRename={(name) => renameFolder(openFolder.id, name)}
                  onDissolve={() => {
                    setLinks((prev) => dissolveFolder(prev, openFolder.id));
                    setOpenFolderId(null);
                  }}
                  onClose={() => setOpenFolderId(null)}
                  anchorEl={folderAnchorEl(openFolder.id)}
                  openStyle={folderOpenStyle}
                  folderIconStyle={folderIconStyle}
                />
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </DndContext>
  );
}

export default memo(QuickLinks);
