"use client";

/* 预设开发文档（v1.1.1）— 从「导入预设」视图打开的全屏文档 overlay。
 * 面向预设作者：详细说明预设 JSON 的全部字段、白名单 action、沙箱 API、
 * .cshz 预设包结构与安全模型。内容与 preset.ts / pack.ts / sandbox.js
 * 的实际实现严格同步（字段、上限、缺省值均以此为准）。
 *
 * 结构与动效：全屏轻雾化遮罩（与 ⌘K / 链接对话框幕布同材质）+ 大 glass-card
 * 滚动阅读卡；入场 .veil-in/.card-in，退场 .veil-out/.dialog-sink（CSS 承载）。
 * ⚠ Esc 走 window 捕获阶段拦截：文档开着时按 Esc 只关文档，
 *   不得穿透到 ⌘K 全局链把指令面板一起关掉（v1.1.1 律）。
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
import { ArrowLeft, X } from "lucide-react";

/* ---------- 排版辅助（紧凑文档字号，与 ⌘K 面板字号语言一致） ---------- */

function Sec({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section
      className="mt-7 first:mt-1"
      id={`docs-${n}`}
      /* --di 驱动子元素模糊过场的级联延迟（globals.css docs-anim 区） */
      style={{ ["--di" as string]: parseInt(n, 10) || 0 } as React.CSSProperties}
    >
      <h3 className="flex items-baseline gap-2 text-[13px] font-normal text-zinc-800 dark:text-zinc-100">
        <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">{n}</span>
        {title}
      </h3>
      <div className="mt-2 space-y-2.5">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-light leading-relaxed text-zinc-500 dark:text-zinc-400">{children}</p>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="slim-scroll overflow-x-auto rounded-xl border border-zinc-900/[0.06] bg-zinc-900/[0.035] p-3 font-mono text-[11px] leading-relaxed text-zinc-700 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-zinc-300">
      {children}
    </pre>
  );
}

function T({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="slim-scroll overflow-x-auto rounded-xl border border-zinc-900/[0.06] dark:border-white/[0.06]">
      <table className="w-full border-collapse text-left text-[11px] font-light">
        <thead>
          <tr className="border-b border-zinc-900/[0.06] dark:border-white/[0.06]">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-normal text-zinc-400 dark:text-zinc-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-zinc-900/[0.04] last:border-0 dark:border-white/[0.04]">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-1.5 align-top text-zinc-600 dark:text-zinc-300">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function K({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-zinc-900/10 bg-zinc-900/[0.04] px-1 py-0.5 font-mono text-[10px] text-zinc-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300">
      {children}
    </code>
  );
}

const MIN_PRESET = `{
  "chushi": 1,
  "name": "我的预设",
  "commands": [
    { "title": "打开 GitHub",
      "action": { "type": "open", "url": "https://github.com" } }
  ],
  "links": [],
  "dock": []
}`;

const FULL_ACTION_DEMO = `{
  "type": "open",   "url": "https://github.com",
  "type": "copy",   "text": "要复制的文本（≤200 字符）",
  "type": "search", "engine": "bing", "q": "关键词",
  "type": "panel",  "id": "todo",
  "type": "theme",  "mode": "dark",
  "type": "script", "id": "本预设 scripts 里定义的脚本 id",
  "type": "page",   "id": "本预设 pages 里定义的页面 id"
}`;

const SCRIPT_DEMO = `"scripts": [
  {
    "id": "hitokoto",
    "name": "每日一言",
    "code": "chushi.run = async () => { \\
      const r = await chushi.fetchJSON('https://v1.hitokoto.cn/'); \\
      chushi.notify({ title: r.hitokoto, description: '—— ' + r.from }); \\
    }; \\
    chushi.registerCommand({ id: 'quote', title: '来一句一言', run: () => chushi.run() });"
  }
]`;

const WIDGET_DEMO = `"widgets": [
  {
    "id": "countdown",
    "name": "倒数日",
    "corner": "top-left",
    "width": 200, "height": 96,
    "html": "<style>body{margin:0;font-family:system-ui}</style>\\
      <div style='padding:12px'>距离 2027 元旦还有 \\
      <b id='d'>-</b> 天</div>\\
      <script>chushi.storage.get('target').then(v => { /* ... */ });</script>"
  }
]`;

export default function PresetDocs({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  /* portal 挂载点：v1.1.1 时本文档嵌在 ⌘K 卡片 DOM 里——⌘K 卡是带
   * will-change:transform + overflow-hidden 的 motion 盒，fixed inset-0 被
   * 当成该盒的包含块且被裁剪，文档大面积被遮挡（用户实测）。portal 到
   * body 后彻底逃出形变舞台的堆叠/裁剪上下文，同时也是右键菜单
   * 「开发者文档」入口（⌘K 关闭时）的挂载形态。
   * 惰性初始化（非 effect + setState，react-hooks 律）：SSR 渲染期
   * document 不存在 → null（组件渲染空）；客户端首渲染即拿到 body。
   * open=false 时 portal 内无任何 DOM 节点，水合零差异。 */
  const [host] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.body
  );

  /* Esc 捕获拦截：文档开着时 Esc 只关文档，不穿透 ⌘K 全局链 */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!host) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <PresenceClass
          key="preset-docs-overlay"
          exitClass="veil-out"
          duration={0.22}
          className="veil-in fixed inset-0 z-[60] flex items-center justify-center bg-white/10 px-4 backdrop-blur-md backdrop-saturate-150 dark:bg-black/10"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="预设开发文档"
        >
          <PresenceClass
            exitClass="dialog-sink"
            duration={0.2}
            className="card-in glass-card slim-scroll flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl"
          >
            {/* 顶栏：返回上一级（回导入预设 / 主页面）+ 关闭 */}
            <div className="flex items-center gap-2 border-b border-zinc-900/5 px-5 py-3 dark:border-white/5">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-light text-zinc-500 transition-colors duration-150 hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                返回上一级
              </button>
              <p className="text-sm font-light tracking-wide text-zinc-800 dark:text-zinc-100">
                预设开发文档
              </p>
              <p className="hidden text-[10px] font-extralight tracking-wider text-zinc-400 dark:text-zinc-500 sm:inline">
                适用于预设系统 2.0
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭文档"
                className="ml-auto rounded-full p-1.5 text-zinc-400 opacity-70 transition-all duration-200 hover:bg-zinc-900/5 hover:opacity-100 dark:text-zinc-500 dark:hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>

            {/* 正文：docs-anim 承载子元素（§01–§14 分区）的开/关模糊级联过场
                （globals.css 内容模糊语言区）；顶栏不参与，保持常锐 */}
            <div className="slim-scroll docs-anim overflow-y-auto px-5 py-4">
              <Sec n="01" title="预设是什么">
                <P>
                  预设是一段<b>纯 JSON 声明</b>（或一个 .cshz 压缩包），使用者把它粘贴进
                  「⌘K → 导入预设」即可一键改变起始页：新增指令面板命令、快捷磁贴、底部栏按钮、
                  整套样式动画，甚至带脚本的沙箱页面与角落小部件。预设的哲学是
                  「声明即一切」：安装即生效，删除预设即全部还原，没有任何隐藏的中间状态。
                </P>
                <P>
                  安全模型分三层：①<b>声明式部分零代码执行</b>——命令/磁贴/按钮只接受白名单
                  action（见 §04）；②<b>代码全部关进唯一源沙箱</b>——scripts/pages/widgets
                  跑在与主页面完全隔离的 iframe 里，拿不到页面数据、localStorage 与扩展 API，
                  只能通过受控的 <K>chushi</K> API 产生副作用（见 §10–§12）；③<b>样式注入有净化</b>——
                  CSS 会剥除 <K>@import</K> 与 <K>javascript:</K>（CSS 本身无法执行脚本）。
                </P>
                <P>
                  校验是<b>整体拒绝</b>制：任何一个字段不合法，整个预设都不导入，并在面板里列出
                  全部错误（<K>字段路径：原因</K> 格式，如 <K>dock[1]：url 必须以 https:// 开头</K>）。
                  这是为了杜绝「装了一半」的预设——半装状态最难排查。
                </P>
              </Sec>

              <Sec n="02" title="最小可用预设">
                <P>下面是一份合法的最小预设：一段 JSON，复制给朋友即可分享。</P>
                <Code>{MIN_PRESET}</Code>
                <P>
                  <K>chushi: 1</K> 是格式版本标记（必需，缺了会直接拒绝）；<K>name</K> 必填；
                  <K>commands / links / dock</K> 至少写一项——九个内容字段
                  （commands / links / dock / settings / scripts / animations / pages / widgets /
                  layout）全空同样会被拒绝。
                </P>
              </Sec>

              <Sec n="03" title="顶层字段与容量上限">
                <T
                  head={["字段", "类型与上限", "说明"]}
                  rows={[
                    [<K>chushi</K>, "1", "格式版本标记，必须为 1"],
                    [<K>name</K>, "字符串 ≤20 字", "预设名称（必填），管理列表里展示"],
                    [<K>author</K>, "字符串 ≤20 字", "作者署名（可选）"],
                    [<K>description</K>, "字符串 ≤60 字", "一句话描述（可选）"],
                    [<K>commands</K>, "数组 ≤12", "指令面板命令（见 §04）"],
                    [<K>links</K>, "数组 ≤12", "快捷磁贴（name ≤20 字 + https url）"],
                    [<K>dock</K>, "数组 ≤3", "底部栏按钮（见 §04–§05）"],
                    [<K>settings</K>, "对象", "设置白名单字段一次性合并（见 §06）"],
                    [<K>scripts</K>, "数组 ≤3", "沙箱脚本，单段 code ≤16000 字符（见 §10）"],
                    [<K>animations</K>, "数组 ≤4", "CSS 注入，单段 ≤6000、合计 ≤12000 字符（见 §09）"],
                    [<K>pages</K>, "数组 ≤3", "沙箱整页，单页 html ≤24000 字符（见 §11）"],
                    [<K>widgets</K>, "数组 ≤3", "角落小部件，单块 html ≤12000 字符（见 §12）"],
                    [<K>layout</K>, "对象", "声明式布局覆写（见 §07）"],
                  ]}
                />
                <P>
                  所有 <K>id</K> 字段统一规则：<K>^[A-Za-z0-9_-]&#123;1,32&#125;$</K>，且脚本 / 动画 / 页面 /
                  小部件<b>共享同一个 id 命名空间</b>，互不重名。磁贴 <K>links[].url</K> 必须以
                  <K>https://</K> 开头（杜绝 javascript:/data: 注入面）。
                </P>
              </Sec>

              <Sec n="04" title="action 白名单（commands 与 dock 通用）">
                <P>
                  每条命令 / 底部栏按钮 = <K>title</K>（≤24 字）+ <K>action</K>。action 只接受以下
                  7 种类型，未知类型直接拒绝：
                </P>
                <Code>{FULL_ACTION_DEMO}</Code>
                <T
                  head={["type", "字段", "说明"]}
                  rows={[
                    [<K>open</K>, <K>url</K>, "打开网址，必须 https://"],
                    [<K>copy</K>, <K>text</K>, "复制文本到剪贴板，≤200 字符"],
                    [
                      <K>search</K>,
                      <><K>engine</K> + <K>q</K></>,
                      <>
                        用指定搜索引擎搜索；engine ∈ <K>google / bing / baidu / ddg</K>，q ≤100 字符
                      </>,
                    ],
                    [
                      <K>panel</K>,
                      <K>id</K>,
                      <>
                        打开内置面板；id ∈ <K>weather / todo / note / pomodoro / settings</K>
                      </>,
                    ],
                    [<K>theme</K>, <K>mode</K>, "切换主题，mode = light 或 dark"],
                    [<K>script</K>, <K>id</K>, "触发本预设 scripts 里定义的脚本（引用完整性在导入期校验）"],
                    [<K>page</K>, <K>id</K>, "全屏打开本预设 pages 里定义的沙箱页面"],
                  ]}
                />
                <P>
                  引用完整性：<K>script</K> / <K>page</K> action 的 id 必须能在本预设的
                  scripts / pages 里找到，找不到整包拒绝。运行时 id 会展开为
                  <K>预设实例id:脚本id</K> 复合键，多个预设互不串扰。
                </P>
              </Sec>

              <Sec n="05" title="dock 按钮图标名">
                <P>
                  <K>dock[].icon</K> 从以下 20 个白名单图标名里选（lucide 图标，视觉与起始页一致）；
                  省略或写未知名字会回退为首字母圆形图标：
                </P>
                <P>
                  <K>bookmark</K> <K>book</K> <K>briefcase</K> <K>calendar</K> <K>camera</K>{" "}
                  <K>cloud</K> <K>coffee</K> <K>compass</K> <K>game</K> <K>github</K> <K>globe</K>{" "}
                  <K>heart</K> <K>home</K> <K>link</K> <K>mail</K> <K>music</K> <K>star</K>{" "}
                  <K>terminal</K> <K>video</K> <K>zap</K>
                </P>
              </Sec>

              <Sec n="06" title="settings 设置白名单">
                <P>
                  预设可携带一份「初始设置」，导入时<b>一次性合并</b>进用户设置（之后用户随时可改）。
                  只接受以下字段，其余忽略：
                </P>
                <T
                  head={["字段", "取值", "说明"]}
                  rows={[
                    [<K>themeMode</K>, <>"light" | "dark" | "system"</>, "主题模式"],
                    [<K>accent</K>, <K>#RRGGBB</K>, "强调色（6 位十六进制）"],
                    [<K>background</K>, <>"glow" | "pure" | "photo"</>, "背景模式：辉光 / 纯净 / 壁纸"],
                    [<K>hour12</K>, "boolean", "12 小时制"],
                    [<K>showSeconds</K>, "boolean", "时钟显示秒"],
                    [<K>userName</K>, "字符串 ≤20 字", "问候语称呼"],
                    [<K>iconStyle</K>, <>"letter" | "favicon"</>, "磁贴图标风格"],
                    [<K>engineId</K>, <K>google / bing / baidu / ddg</K>, "默认搜索引擎"],
                    [<K>searchSuggest</K>, "boolean", "搜索联想"],
                  ]}
                />
              </Sec>

              <Sec n="07" title="layout 布局覆写">
                <P>
                  布局覆写<b>不写入用户设置</b>：装了即生效、删除预设即还原。数值全部自动夹紧到安全区间：
                </P>
                <T
                  head={["字段", "取值", "说明"]}
                  rows={[
                    [<K>hideClock</K>, "boolean", "隐藏时钟"],
                    [<K>hideSearch</K>, "boolean", "隐藏搜索框"],
                    [<K>hideLinks</K>, "boolean", "隐藏快捷磁贴"],
                    [<K>clockScale</K>, "0.5–2", "时钟整体缩放"],
                    [<K>linksColumns</K>, "3–12", "磁贴列数"],
                    [<K>verticalAlign</K>, <>"center" | "top"</>, "主内容垂直对齐"],
                  ]}
                />
              </Sec>

              <Sec n="08" title="fx 视觉效果接口（预设包自带引擎）">
                <P>
                  液态玻璃这类视觉效果<b>不由宿主内建</b>：宿主只提供一块受控的「作用面」（fx API），
                  效果的<b>全部实现代码住在预设包的 scripts 里</b>——安装即生效、删除预设（或脚本被冻结）
                  即整组回收。官方「液态玻璃预设」就是照这套接口写出来的，把它当参考实现最直接。
                </P>
                <T
                  head={["API / 钩子", "说明"]}
                  rows={[
                    [
                      <K>chushi.fx.mount(id, html)</K>,
                      <>把纯视觉结构（&lt;style&gt; / &lt;svg&gt;）幂等挂进宿主隐藏容器 #chushi-fx-root；
                      同 id 重复挂载为替换（贴图更新不闪断）。单次 ≤192KB</>,
                    ],
                    [<K>chushi.fx.unmount(id)</K>, "摘除一个挂载"],
                    [
                      <K>chushi.fx.onResize(cb)</K>,
                      "订阅玻璃容器尺寸快照（cb 收 [{fx, key, w, h, radius}]），返回退订函数；折射贴图按它重生成",
                    ],
                    [
                      <K>[data-fx=&quot;fxN&quot;]</K>,
                      <>宿主给白名单玻璃容器（.search-pill / .cl-dock / .cl-panel / .glass-card）打的稳定标记，
                      预设 CSS 用它触达真实元素</>,
                    ],
                    [
                      <K>--fx-mx / --fx-my</K>,
                      "指针在玻璃容器内移动时，宿主写在容器上的相对坐标（%），CSS 用 var() 做镜面高光",
                    ],
                  ]}
                />
                <P>
                  安全校界：mount 的 html 只接受 &lt;style&gt; / &lt;svg&gt; 顶层结构（禁 script、
                  事件属性、foreignObject 与外链资源）；全屏幕布（⌘K / 对话框遮罩）永不打 data-fx
                  标记——幕布不是玻璃块。骨架示例：
                </P>
                <Code>{`chushi.fx.onResize((items) => {
  for (const it of items) {
    // it = { fx, key, w, h, radius }：按 w/h 生成位移贴图与 <svg><filter>…
    chushi.fx.mount("g" + it.fx, svgHtml(it));
  }
});
// CSS 里：[data-fx="fx1"] { backdrop-filter: blur(3px) url(#g-fx1) saturate(180%) }`}</Code>
                <P>
                  ⚠ <b>材质即顺序</b>：backdrop-filter 引用 SVG 滤镜时，<b>blur 在前、url(#filter) 在后</b>
                  （先霜化再折射，弯曲锐利）；写反了折射会被模糊糊掉。目前仅 Chromium 系支持
                  backdrop-filter: url()，其它内核自动保持磨砂现状。
                </P>
                <P>
                  ⚠ <b>布局动画防闪（v1.2.0）</b>：玻璃元素在布局尺寸连续变化（面板高度弹簧、窗口拖拽）期间，
                  SVG 位移滤镜逐帧重栅格化且贴图错帧 = 闪动。律：尺寸变动期退化为纯 blur/saturate，
                  稳定约 160ms 后再生成贴图换全链（官方引擎已内置）。
                </P>
                <P>
                  <b>物理透镜贴图（对齐 Apple 边缘折射）</b>：方向取 SDF 梯度（边缘外法线），不要指向几何中心；
                  边缘环带向外取样，显示被压缩进来的<b>玻璃外世界</b>（纸镇/鱼缸效应）——滤镜域需外扩 pad；
                  剖面用 smoothstep² 集中在边缘窄带。v1.2.0 起官方引擎即按此实现。
                </P>
                <P>
                  <b>settings 设置面（v1.2.0）：把调节项贡献进设置面板</b>。声明后宿主渲染出分区，
                  用户改动热生效并持久化（删除预设即连分区带值一并回收）：
                </P>
                <Code>{`chushi.settings.define({
  title: "液态玻璃",
  controls: [
    { type: "slider", key: "refPct", label: "折射强度",
      min: 0, max: 300, step: 5, def: 145, unit: "%" },
    { type: "toggle", key: "specular", label: "镜面高光", def: true },
  ],
});
const cfg = await chushi.settings.get(); // 启动期取初值（宿主按 schema 校验并补默认）
chushi.settings.onChange((values) => { /* 整组热更新 */ });`}</Code>
                <T
                  head={["API", "说明"]}
                  rows={[
                    [
                      <K key="sd">chushi.settings.define(schema)</K>,
                      "声明设置分区：title（≤24 字）+ controls（1–12 个）；控件类型 slider（min/max/step/def/unit）/ toggle / select（options 2–6 项）；schema 整体白名单校验，不合法整组忽略",
                    ],
                    [<K key="sg">chushi.settings.get()</K>, "Promise<values>：启动期取值；消息有序，define 先于 get 到达宿主，回执必然按本脚本 schema 合并"],
                    [<K key="sc">chushi.settings.onChange(cb)</K>, "用户改动时回调整组值，返回退订函数"],
                  ]}
                />
                <P>
                  同一分区控件键唯一；值类型由宿主按 schema 夹紧（越界/类型不符回默认），脚本拿到的值永远合法。
                  官方液态玻璃预设的折射强度/边缘带宽/霜化/饱和/透亮/色散/镜面高光七项即由此实现。
                </P>
              </Sec>

              <Sec n="09" title="animations 自定义样式与元素钩子">
                <P>
                  CSS 直接注入起始页本体，可以写动画、调玻璃观感。注入前净化（剥除
                  <K>@import</K> 与 <K>javascript:</K>），CSS 无法执行脚本。请挂在下面这些
                  <b>稳定元素钩子类</b>上：
                </P>
                <T
                  head={["钩子类", "元素"]}
                  rows={[
                    [<K>.cl-clock</K>, "时钟（含问候语）"],
                    [<K>.cl-search</K>, "搜索框区域"],
                    [<K>.cl-links</K>, "快捷磁贴区域"],
                    [<K>.cl-dock</K>, "底部栏"],
                    [
                      <K>.cl-panel</K>,
                      <>
                        弹出面板卡片，可配合 <K>[data-panel=&quot;weather&quot;]</K> 等按面板区分
                      </>,
                    ],
                    [<><K>.cl-widgets</K> / <K>.cl-widget</K></>, "角落小部件层 / 单块小部件"],
                    [<K>[data-fx=&quot;fxN&quot;]</K>, "玻璃容器稳定标记（fx 预设的触达点，见 §08）"],
                  ]}
                />
                <P>
                  ⚠ <b>磨砂玻璃存活原则</b>：不要给玻璃元素的<b>祖先</b>加
                  <K>opacity &lt; 1</K> 或 <K>filter</K>——那会让祖先成为 backdrop root，
                  后代所有磨砂玻璃瞬间失效，动画结束才瞬跳恢复；也不要用 transform
                  包裹 fixed 定位的面板（会成为包含块导致跳位）。动画请落在玻璃元素自身或无玻璃后代的区块上。
                </P>
                <Code>{`"animations": [
  {
    "id": "breathe",
    "name": "时钟呼吸",
    "css": "@keyframes cl-breathe { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } } .cl-clock { animation: cl-breathe 5s ease-in-out infinite }"
  }
]`}</Code>
              </Sec>

              <Sec n="10" title="scripts 沙箱脚本与 chushi API">
                <P>
                  脚本运行在唯一源沙箱 iframe 里：拿不到主文档、页面数据与扩展 API，只能用受控
                  <K>chushi</K> API。脚本以 async 函数体执行（<b>顶层 await 可用</b>）；启动 4 秒未完成会被
                  看门狗自动冻结停用（删除并重新导入预设可恢复），防止死循环卡页。
                </P>
                <Code>{SCRIPT_DEMO}</Code>
                <T
                  head={["API", "说明"]}
                  rows={[
                    [<K>chushi.run()</K>, "脚本入口：把它赋值成函数，命令/按钮触发时执行"],
                    [
                      <>
                        <K>chushi.registerCommand(&#123;id, title, run&#125;)</K>
                      </>,
                      "向 ⌘K 指令面板注册命令（每脚本 ≤12 条）；命令与 action 的 script 触发统一走入口路由",
                    ],
                    [<K>chushi.notify(&#123;title, description&#125;)</K>, "发一条系统 toast（标题 ≤24 / 描述 ≤60 字）"],
                    [<K>chushi.open(url)</K>, "打开 https:// 网址（当前标签页跳转）"],
                    [<K>chushi.copy(text)</K>, "复制文本到剪贴板"],
                    [<K>chushi.fetchJSON(url, init?)</K>, "受限 fetch：仅 https，10 秒超时，返回解析好的 JSON"],
                    [
                      <K>chushi.fx.mount / unmount / onResize</K>,
                      "视觉效果作用面：注入 style/svg、订阅玻璃容器尺寸（详见 §08）",
                    ],
                    [
                      <>
                        <K>chushi.settings.define / get / onChange</K>
                      </>,
                      "设置面：向设置面板贡献调节项（slider/toggle/select）并接收热更新（详见 §08 settings 小节）",
                    ],
                  ]}
                />
              </Sec>

              <Sec n="11" title="pages 沙箱整页">
                <P>
                  <K>pages</K> 放完整 HTML 文档片段（含 &lt;style&gt; 与 &lt;script&gt;），通过
                  <K>&#123;&quot;type&quot;: &quot;page&quot;, &quot;id&quot;: &quot;...&quot;&#125;</K>{" "}
                  全屏打开。与脚本同一套沙箱隔离，页面内可用极简 <K>window.chushi</K>：
                </P>
                <T
                  head={["API", "说明"]}
                  rows={[
                    [<K>chushi.notify(&#123;title, description&#125;)</K>, "发 toast"],
                    [<K>chushi.close()</K>, "关闭页面，回到起始页"],
                    [<K>chushi.open(url)</K>, "打开 https:// 网址"],
                  ]}
                />
              </Sec>

              <Sec n="12" title="widgets 角落小部件">
                <P>
                  小部件是<b>常驻</b>页面角落的沙箱卡片（倒数日、快捷信息等），最多 3 块。文档片段自动获得
                  宿主主题（<K>html[data-theme]</K>）与强调色（<K>var(--w-accent)</K>），深浅色跟随起始页；
                  禅模式随内容一同雾化隐去。
                </P>
                <Code>{WIDGET_DEMO}</Code>
                <T
                  head={["字段 / API", "说明"]}
                  rows={[
                    [<K>corner</K>, <>停靠角：<K>top-left / top-right / bottom-left / bottom-right</K></>],
                    [<K>width</K>, "卡片宽度 120–420 px（缺省 216）"],
                    [<K>height</K>, "初始高度 40–320 px（缺省 88）"],
                    [<K>chushi.resize(w, h)</K>, "小部件内调用，调整自身高度（宿主夹紧）"],
                    [
                      <K>chushi.storage.get(key)</K>,
                      "读本部件持久化 KV（Promise），数据只存本机 localStorage",
                    ],
                    [
                      <K>chushi.storage.set(key, value)</K>,
                      "写 KV（Promise），值 JSON 序列化后 ≤4000 字符",
                    ],
                    [<K>chushi.notify / open</K>, "与 pages 相同"],
                  ]}
                />
                <P>
                  官方示例「倒数日」预设（仓库 <K>examples/倒数日预设.json</K>）：点击卡片改事件与日期，
                  配置经 storage 保存在本机——照抄它的结构最快上手。
                </P>
              </Sec>

              <Sec n="13" title=".cshz 预设包（zip 格式）">
                <P>
                  JSON 太长或要带图片/字体资源时，把预设打成 zip 包（推荐扩展名 <K>.cshz</K>，
                  也接受 .zip），在「导入文件」里选择：
                </P>
                <Code>{`preset.cshz
├── manifest.json     必需 — 预设主体（与粘贴导入同一份 chushi:1 结构）
├── assets/           可选 — 资源目录
│   └── photo.jpg
└── README.md 等其余文件一律忽略`}</Code>
                <P>
                  manifest 里的 <K>pages[].html</K> / <K>animations[].css</K> / <K>widgets[].html</K>{" "}
                  可以写 <K>asset:文件名</K> 引用资源，导入时替换为 data: URL 内联（安装后无需保留包）。
                  例如 <K>background-image: url(asset:photo.jpg)</K>。
                </P>
                <T
                  head={["护栏", "数值"]}
                  rows={[
                    ["解压后总大小", "≤ 4MB"],
                    ["压缩包条目数", "≤ 64"],
                    ["单资源大小", "≤ 512KB"],
                    ["资源文件名", "仅字母/数字/点/下划线/连字符，≤64 字符"],
                    ["资源类型", "图片 / 音频 / 视频 / 字体（MIME 白名单）"],
                  ]}
                />
              </Sec>

              <Sec n="14" title="调试与分发建议">
                <P>
                  ① <b>先填入示例</b>：导入面板的「填入示例」会放一份覆盖命令/磁贴/动画/页面/脚本的完整预设，
                  从它开始改最稳。② <b>读错误列表</b>：校验失败会列出每一条错误及其字段路径，从上往下修。
                  ③ <b>小步验证</b>：每加一个字段就重新导入一次，整体拒绝制保证坏字段不会偷偷生效。
                  ④ <b>分发</b>：短预设直接发 JSON 文本；带资源的发 .cshz 包——粘贴、本地文件选择与
                  <b>拖拽到导入面板</b>（v1.2.0 起）三种方式导入行为完全一致。官方示例都在仓库
                  <K>examples/</K> 目录（倒数日预设.json / 液态玻璃预设.json）。
                </P>
                <P>
                  ⑤ <b>尊重用户</b>：不要做全屏闪烁、高频 toast、抢焦点之类的体验；上限表（§03）就是产品
                  对预设作者的约定——留在上限内，用户才敢安装第三方预设。
                </P>
              </Sec>

              <Sec n="15" title="整页焕新能力评估（API 现状与路线）">
                <P>
                  「能不能靠预设系统把整个页面焕新一遍？」按 v1.2.0 的作用面清单盘点——
                  <b>已能焕新</b>：①内容与功能（命令/磁贴/栏按钮/小部件/沙箱整页）；②排版（layout 覆写 +
                  animations 重排 .cl-* 钩子）；③色彩与材质（settings 白名单 + animations 重写玻璃底色 +
                  fx 整套材质替换，液态玻璃即实证）；④动画（animations 注入 @keyframes；折射类走 fx 自带引擎）；
                  ⑤设置面板扩展（chushi.settings 让焕新方案自带可调参数）。
                </P>
                <P>
                  <b>尚未覆盖、待后续新增作用面</b>（按性价比排序）：①图标替换（预设自带图标资源）；②主题令牌覆写
                  （圆角/字体/墨色等 CSS 变量的声明式覆写，现阶段可经 animations 写 :root 变通）；③动效语言替换
                  （面板开合/⌘K 弹簧参数）；④时钟/问候语文案模板；⑤面板区新槽位（现只能开整页 overlay）。
                </P>
                <P>
                  结论：<b>材质、内容、排版、动画四维已可整页焕新</b>——液态玻璃预设与倒数日预设分别是
                  「换材质」与「加功能」的样板；图标与主题令牌是下一批最值得补的作用面。
                </P>
              </Sec>

              <div className="h-2" />
            </div>
          </PresenceClass>
        </PresenceClass>
      )}
    </AnimatePresence>,
    host
  );
}
