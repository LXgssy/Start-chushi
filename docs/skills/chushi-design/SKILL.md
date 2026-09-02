---
name: chushi-design
description: 「初始」(Start-chushi) 起始页的设计理念与动效工程铁律。当继续开发本项目的任何 UI、面板、动效、玻璃视觉、预设系统或交互时必须遵循。触发词：初始、ChuShi、新标签页、面板动画、玻璃、磨砂、预设、dock、指令面板、禅模式。
---

# 「初始」ChuShi · 设计理念与工程铁律

一个把「开始新标签页」变成仪式感的浏览器起始页。本 skill 固化它的设计哲学与踩过坑之后
沉淀下来的硬性规则——任何对本项目的改动都必须先读这一页。

## 一、产品哲学：克制优先

1. **一屏只放高频动作**：时钟、搜索、常用链接、天气、待办、便签、番茄钟。不堆信息，
   每个功能都要打磨到「足够优雅」才配出现在画布上。
2. **数据全部留在本机**：localStorage / IndexedDB，无账号、无上传、无追踪。任何新功能
   不得引入远程数据回流（天气等只读公开 API 除外，且必须可 mock、可离线降级）。
3. **声明式扩展，不开放任意代码面**：用户能力靠预设（JSON 白名单动作）；脚本/页面/小部件
   一律跑在 sandbox 唯一源里（拿不到页面数据与扩展 API），安装前净化，上限限额。
4. **尊重系统**：明暗主题跟随系统可手切；`prefers-reduced-motion` 下所有动画有对称的
   静态降级（入场不播、退场立即隐藏）。

## 二、视觉语言：磨砂玻璃体系

- 玻璃三层次：`.glass-pill`（dock 栏）/ `.glass-card`（面板与对话框）/ `.glass-chip`
  （内部片段）。浅深双色 + 掠影模式强制深玻璃三态，靠 CSS 变量（`--pill-seg` 等）适配，
  组件内不写死颜色。
- 强调色只有一枚：`var(--ui-accent)`，衍生色一律 `color-mix(in oklab, …)` 派生
  （`.accent-bg/-text/-badge/-bar/-ring`），禁止散落硬编码色值。
- 墨色文字体系：zinc 系刻度（400/500/800），字重从 extralight 到 normal，
  细字重 + 宽 tracking 是本项目的「声音」。

### ⚠ 磨砂玻璃存活原则（最高优先级铁律）

祖先元素 `opacity<1` 或 `filter≠none` 会成为 backdrop root，令后代 backdrop-filter
采样不到壁纸——磨砂整体失效，动画结束后才瞬跳恢复。因此：

- 动画只允许落在：① 无玻璃后代的区块；② 玻璃元素**自身**（自身 opacity/filter 不构成
  自身 backdrop root，霜感随动画渐凝/渐散）。
- 新增任何包裹层/过场动画前，先问：这层会不会在某些时刻带 opacity<1 或 filter，
  且内部有玻璃？内容模糊动画（见下）结束后必须让 filter 还原 none（keyframes 自然
  结束即还原，禁止用 forwards 钉住 filter）。

## 三、动效语言：三层分工 + 形变架构（v1.0.9 定稿）

| 层 | 词汇 | 实现 |
|----|------|------|
| 面板骨架（卡片/遮罩） | 拉伸：`panel-rise/panel-sink`、高度 px 弹簧 0 展开/折回；遮罩 `veil-in/veil-out` 磨砂模糊 | CSS 关键帧 + 高度 px 弹簧形变；卡片不带 backdrop-filter（玻璃×动画=闪烁戒律），磨砂只活在遮罩上 |
| 面板内容（子元素整体） | 模糊：`content-focus`（聚拢）/ `content-defocus`（散场）/ `view-exit`（互切钉位散场） | 纯 CSS 关键帧，blur 9–10px，与 intro-rise、禅雾同源；关闭经 `.panel-sink/.dialog-sink/.palette-out` 级联散场 |
| 指令面板 ⌘K（仅此一处） | Q 弹：弹簧 ζ≈0.46 开（y/scale 自顶部展开）、30% 微胀再收的 `palette-out` 关；高度盒 initial=false 不参与开合 | framer 弹簧只驱动 y/scale，opacity 仍走 CSS；视图自带 .content-focus，关闭经 .palette-out 级联散场 |

- **面板互切 = 「单动作形变」**：旧内容模糊散场（.view-exit 钉位）+ 高度 px 弹簧到新内容高度 + 新内容模糊聚拢（.content-focus），三者重叠为一个连续动作。禁止先关后开的两次动画；禁止 framer layout（transform scale 会把内容压扁，读作两次动画）。
- **指令面板内嵌预设系统（morph 架构）**：⌘K 是双视图单卡片——指令列表 ⇄ PresetPanel，选「导入/管理预设」不关面板，原地形变过去（use-morph-height 测高 hook 与 dock PanelStage 共用，含零高毒化防护与武装延迟）。新浮层要「长」进这张卡片时，优先做成内嵌视图而不是新对话框。
- 测高用 ResizeObserver→contentH；首开禁止挂载帧二次渲染（会让 v12 投影重测打断入场），测高推迟武装（dock 0.5s / ⌘K 0.26s）；contentH 重置只能放 `onExitComplete`。
- 入场视图不要写 `initial={false}`（首次挂载也要模糊聚拢）；内嵌视图的内部 tab 区才用 `initial={false}` 避免双重模糊。

### ⚠ CSS-first 铁律（framer-motion v12 WAAPI 律，血泪实证）

framer v12 对 opacity 走 WAAPI 加速：**入场**有空窗闪黑；**退场**会被中途取消并回跳
内联值（视觉=没有关闭动画，甚至永久滞留 DOM）。因此：

1. opacity 的进出场一律 CSS 关键帧承载（`.panel-rise/.card-in/.veil-in` 进，
   `.panel-sink/.dialog-sink/.palette-out/.veil-out/.view-exit` 出）；framer 只保留
   y/scale 弹簧与计时职责。
2. 退场卸载时机由 `PresenceClass`（src/components/startpage/PresenceClass.tsx）接管：
   exitClass 追加 CSS 退场类 + `usePresence` 的 safeToRemove 定时器
   （duration×1000+150ms）确定性卸载，绝不依赖 WAAPI finish 事件。
   **exit 严禁携带任何可见属性**（含 `opacity:0, duration:0`——仍会建 WAAPI 动画，
   压跳之间就是真机「一直闪」）：只允许 `x:0` 哑动画提供可完成的退出信号。
3. **声明顺序律**：同一元素退场帧会同时持有入场类与退场类（同特异性后者胜）——
   显影类必须声明在退场类之前（globals.css 内有 ⚠ 注释标记，改布局前先看）。
   级联触发（如 `.panel-sink .content-focus`）靠特异性 (0,2,0) 胜 (0,1,0)。
   **线上事故实证（v1.0.8）**：`.veil-in` 被声明到 `.veil-out` 之后，关闭帧退场被淡入覆盖，
   用户感知=「遮罩没有关闭动画」。动动画类顺序前必须重读 globals.css 的 ⚠ 注释。
4. AnimatePresence 退出途中禁止渲染期 setState。
5. 性能：逐帧 reflow 用 `contain: layout` 圈在高度盒内；动画优先 transform/opacity，
   filter 动画仅限面板内容尺寸；固定动画时长 0.16–0.34s，入场慢出场快。
6. **卡片不带 backdrop-filter**：玻璃卡底色 92% 不透明，磨砂本就不可见；
   backdrop×动画的组合既掉帧又闪烁——磨砂只允许出现在遮罩层（这正是用户要的
   「模糊背景」），卡片视觉靠 glass-card 变量体系。

## 四、交互细节底线

- 焦点：浮层卸载时**有条件归还**焦点——仅当焦点仍在浮层内（或已无焦点）才归还
  到打开前的元素；归还后命中 `:focus-visible` 立即 blur（ESC/⌘K 属键盘事件，程序化
  focus 会被启发式判定为键盘聚焦，令 tab 栏按钮出现蓝框，v1.0.8 实证）。
  无条件归还的变体：会抢走后续视图（如链接编辑器）已接管的焦点，令其键盘全失效。
  全局 ESC 链必须覆盖所有浮层（palette → 编辑器 → dock 面板 → 禅模式例外），
  新增浮层必须挂进 page.tsx 全局 Escape 分支与 `locked` 打字屏蔽。
- 点击遮罩关闭用 `e.target === e.currentTarget` 判定；aria：浮层 role=dialog +
  aria-modal + 中文 aria-label；dock 按钮 aria-label 随数据态变化时测试用宽松选择器。
- dock 数字显示用 `digit-slot`（overflow:hidden + leading-none）构造性居中，
  别用字体度量魔法数。

## 五、工程铁律

- **E2E 金标准**：`scripts/verify-preset.sh`（20 断言）与 pw-lab 探针必须全绿才算完成。
  headless 下动画断言用**状态差/类名/计算样式**，绝不采样帧序列（rAF 节流失真）。
- 版本节奏：动一次用户可见行为 = bump `scripts/extension-manifest.json` 版本 →
  `build-extension.sh` → 三仓同步（公开仓 github-sync / Pages deploy-pages /
  工作库 workspace-archive）→ Release 资产。README/PRIVACY 随功能同步。
- 主题键以**构建产物 grep** 为准（勿信源码速读）；localStorage 键形状变更必须兼容
  useStored 的无校验直读。
- 沙箱扩展面：MV3 eval 需要 manifest `sandbox.pages` + CSP 双声明；对外 API 只走
  受控消息中继（notify/open/storage/resize），每加一种能力都要过白名单与限额。

## 六、改动自检清单

1. 新动画是否避开了磨砂玻璃存活原则？结束后 filter 是否还原？
2. opacity 是否全走 CSS 关键帧？退场是否经 PresenceClass 确定性卸载？
3. 类声明顺序是否满足「显影在前、退场在后」？级联选择器特异性是否够？
4. 内容过场是否用了统一的模糊词汇（而不是又发明一种淡入淡出）？
5. 全局 ESC / 打字屏蔽 / 焦点回落是否覆盖新浮层？
6. reduced-motion 降级是否对称？
7. verify-preset + 新探针是否全绿？版本号、README、三仓是否同步？
