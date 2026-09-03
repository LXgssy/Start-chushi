# 「初始」预设开发文档

> 适用于预设系统 2.0 · 与页内文档（⌘K → 导入预设 → 开发者文档）内容同源。
> 预设 = 一段纯 JSON 声明（或 .cshz 压缩包），在「⌘K → 导入预设」中一键安装。

## 目录

1. [预设是什么](#01-预设是什么)
2. [最小可用预设](#02-最小可用预设)
3. [顶层字段与容量上限](#03-顶层字段与容量上限)
4. [action 白名单](#04-action-白名单commands-与-dock-通用)
5. [dock 按钮图标名](#05-dock-按钮图标名)
6. [settings 设置白名单](#06-settings-设置白名单)
7. [layout 布局覆写](#07-layout-布局覆写)
8. [fx 视觉效果接口（预设包自带引擎）](#08-fx-视觉效果接口预设包自带引擎)
9. [animations 自定义样式与元素钩子](#09-animations-自定义样式与元素钩子)
10. [scripts 沙箱脚本与 chushi API](#10-scripts-沙箱脚本与-chushi-api)
11. [pages 沙箱整页](#11-pages-沙箱整页)
12. [widgets 角落小部件](#12-widgets-角落小部件)
13. [.cshz 预设包（zip 格式）](#13-cshz-预设包zip-格式)
14. [调试与分发建议](#14-调试与分发建议)
15. [整页焕新能力评估（API 现状与路线）](#15-整页焕新能力评估api-现状与路线)

---

## 01 预设是什么

预设是一段**纯 JSON 声明**（或一个 .cshz 压缩包），使用者把它粘贴进「⌘K → 导入预设」即可一键改变起始页：新增指令面板命令、快捷磁贴、底部栏按钮、整套样式动画，甚至带脚本的沙箱页面与角落小部件。预设的哲学是「声明即一切」：安装即生效，删除预设即全部还原，没有任何隐藏的中间状态。

安全模型分三层：

1. **声明式部分零代码执行**——命令/磁贴/按钮只接受白名单 action（见 §04）；
2. **代码全部关进唯一源沙箱**——scripts/pages/widgets 跑在与主页面完全隔离的 iframe 里，拿不到页面数据、localStorage 与扩展 API，只能通过受控的 `chushi` API 产生副作用（见 §10–§12）；
3. **样式注入有净化**——CSS 会剥除 `@import` 与 `javascript:`（CSS 本身无法执行脚本）。

校验是**整体拒绝**制：任何一个字段不合法，整个预设都不导入，并在面板里列出全部错误（`字段路径：原因` 格式，如 `dock[1]：url 必须以 https:// 开头`）。这是为了杜绝「装了一半」的预设——半装状态最难排查。

## 02 最小可用预设

```json
{
  "chushi": 1,
  "name": "我的预设",
  "commands": [
    { "title": "打开 GitHub",
      "action": { "type": "open", "url": "https://github.com" } }
  ],
  "links": [],
  "dock": []
}
```

`chushi: 1` 是格式版本标记（必需，缺了会直接拒绝）；`name` 必填；`commands / links / dock` 至少写一项——九个内容字段（commands / links / dock / settings / scripts / animations / pages / widgets / layout）全空同样会被拒绝。

## 03 顶层字段与容量上限

| 字段 | 类型与上限 | 说明 |
| --- | --- | --- |
| `chushi` | 1 | 格式版本标记，必须为 1 |
| `name` | 字符串 ≤20 字 | 预设名称（必填），管理列表里展示 |
| `author` | 字符串 ≤20 字 | 作者署名（可选） |
| `description` | 字符串 ≤60 字 | 一句话描述（可选） |
| `commands` | 数组 ≤12 | 指令面板命令（见 §04） |
| `links` | 数组 ≤12 | 快捷磁贴（name ≤20 字 + https url） |
| `dock` | 数组 ≤3 | 底部栏按钮（见 §04–§05） |
| `settings` | 对象 | 设置白名单字段一次性合并（见 §06） |
| `scripts` | 数组 ≤3 | 沙箱脚本，单段 code ≤16000 字符（见 §10） |
| `animations` | 数组 ≤4 | CSS 注入，单段 ≤6000、合计 ≤12000 字符（见 §09） |
| `pages` | 数组 ≤3 | 沙箱整页，单页 html ≤24000 字符（见 §11） |
| `widgets` | 数组 ≤3 | 角落小部件，单块 html ≤12000 字符（见 §12） |
| `layout` | 对象 | 声明式布局覆写（见 §07） |

所有 `id` 字段统一规则：`^[A-Za-z0-9_-]{1,32}$`，且脚本 / 动画 / 页面 / 小部件**共享同一个 id 命名空间**，互不重名。磁贴 `links[].url` 必须以 `https://` 开头（杜绝 javascript:/data: 注入面）。

## 04 action 白名单（commands 与 dock 通用）

每条命令 / 底部栏按钮 = `title`（≤24 字）+ `action`。action 只接受以下 7 种类型，未知类型直接拒绝：

```json
{ "type": "open",   "url": "https://github.com" }
{ "type": "copy",   "text": "要复制的文本（≤200 字符）" }
{ "type": "search", "engine": "bing", "q": "关键词" }
{ "type": "panel",  "id": "todo" }
{ "type": "theme",  "mode": "dark" }
{ "type": "script", "id": "本预设 scripts 里定义的脚本 id" }
{ "type": "page",   "id": "本预设 pages 里定义的页面 id" }
```

| type | 字段 | 说明 |
| --- | --- | --- |
| `open` | `url` | 打开网址，必须 https:// |
| `copy` | `text` | 复制文本到剪贴板，≤200 字符 |
| `search` | `engine` + `q` | 用指定搜索引擎搜索；engine ∈ `google / bing / baidu / ddg`，q ≤100 字符 |
| `panel` | `id` | 打开内置面板；id ∈ `weather / todo / note / pomodoro / settings` |
| `theme` | `mode` | 切换主题，mode = light 或 dark |
| `script` | `id` | 触发本预设 scripts 里定义的脚本（引用完整性在导入期校验） |
| `page` | `id` | 全屏打开本预设 pages 里定义的沙箱页面 |

引用完整性：`script` / `page` action 的 id 必须能在本预设的 scripts / pages 里找到，找不到整包拒绝。运行时 id 会展开为 `预设实例id:脚本id` 复合键，多个预设互不串扰。

## 05 dock 按钮图标名

`dock[].icon` 从以下 20 个白名单图标名里选（lucide 图标，视觉与起始页一致）；省略或写未知名字会回退为首字母圆形图标：

> `bookmark` `book` `briefcase` `calendar` `camera` `cloud` `coffee` `compass` `game` `github` `globe` `heart` `home` `link` `mail` `music` `star` `terminal` `video` `zap`

## 06 settings 设置白名单

预设可携带一份「初始设置」，导入时**一次性合并**进用户设置（之后用户随时可改）。只接受以下字段，其余忽略：

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `themeMode` | `"light" \| "dark" \| "system"` | 主题模式 |
| `accent` | `#RRGGBB` | 强调色（6 位十六进制） |
| `background` | `"glow" \| "pure" \| "photo"` | 背景模式：辉光 / 纯净 / 壁纸 |
| `hour12` | boolean | 12 小时制 |
| `showSeconds` | boolean | 时钟显示秒 |
| `userName` | 字符串 ≤20 字 | 问候语称呼 |
| `iconStyle` | `"letter" \| "favicon"` | 磁贴图标风格 |
| `engineId` | `google / bing / baidu / ddg` | 默认搜索引擎 |
| `searchSuggest` | boolean | 搜索联想 |

## 07 layout 布局覆写

布局覆写**不写入用户设置**：装了即生效、删除预设即还原。数值全部自动夹紧到安全区间：

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `hideClock` | boolean | 隐藏时钟 |
| `hideSearch` | boolean | 隐藏搜索框 |
| `hideLinks` | boolean | 隐藏快捷磁贴 |
| `clockScale` | 0.5–2 | 时钟整体缩放 |
| `linksColumns` | 3–12 | 磁贴列数 |
| `verticalAlign` | `"center" \| "top"` | 主内容垂直对齐 |

## 08 fx 视觉效果接口（预设包自带引擎）与设置面

液态玻璃这类视觉效果**不由宿主内建**：宿主只提供一块受控的「作用面」（fx API），效果的**全部实现代码住在预设包的 scripts 里**——安装即生效、删除预设（或脚本被冻结）即整组回收。官方「液态玻璃预设」（`examples/液态玻璃预设.json`）就是照这套接口写出来的参考实现。

| API / 钩子 | 说明 |
| --- | --- |
| `chushi.fx.mount(id, html)` | 把纯视觉结构（`<style>` / `<svg>`）幂等挂进宿主隐藏容器 `#chushi-fx-root`；同 id 重复挂载为替换（贴图更新不闪断）。单次 ≤192KB |
| `chushi.fx.unmount(id)` | 摘除一个挂载 |
| `chushi.fx.onResize(cb)` | 订阅玻璃容器尺寸快照（cb 收 `[{fx, key, w, h, radius}]`），返回退订函数；折射贴图按它重生成 |
| `[data-fx="fxN"]` | 宿主给白名单玻璃容器（`.search-pill` / `.cl-dock` / `.cl-panel` / `.glass-card`）打的稳定标记，预设 CSS 用它触达真实元素 |
| `--fx-mx` / `--fx-my` | 指针在玻璃容器内移动时，宿主写在容器上的相对坐标（%），CSS 用 `var()` 做镜面高光 |

安全边界：mount 的 html 只接受 `<style>` / `<svg>` 顶层结构（禁 script、事件属性、foreignObject 与外链资源）；全屏幕布（⌘K / 对话框遮罩）永不打 data-fx 标记——幕布不是玻璃块。骨架示例：

```js
chushi.fx.onResize((items) => {
  for (const it of items) {
    // it = { fx, key, w, h, radius }：按 w/h 生成位移贴图与 <svg><filter>…
    chushi.fx.mount("g" + it.fx, svgHtml(it));
  }
});
// CSS 里：[data-fx="fx1"] { backdrop-filter: blur(3px) url(#g-fx1) saturate(180%) }
```

⚠ **材质即顺序**：backdrop-filter 引用 SVG 滤镜时，**blur 在前、url(#filter) 在后**（先霜化再折射，弯曲锐利）；写反了折射会被模糊糊掉。目前仅 Chromium 系支持 backdrop-filter: url()，其它内核自动保持磨砂现状。

⚠ **布局动画防闪（v1.2.0）**：玻璃元素在**布局尺寸连续变化**（dock 面板高度弹簧、窗口拖拽缩放）期间，SVG 位移滤镜会逐帧重栅格化且贴图尺寸滞后错帧，表现为闪动。律：尺寸变动期退化为纯 `blur/saturate`（标准滤镜函数无此病），稳定约 160ms 后再生成贴图换全链。官方引擎已内置该策略（快照签名变化即标记 busy，settle 定时器到期才建贴图）。

### 物理透镜贴图（v1.2.0 官方引擎的做法，对齐 Apple 边缘折射）

- **方向 = SDF 梯度（边缘外法线）**：长边中部的弯曲垂直于边缘，与真实透镜一致；不要指向几何中心（长边上会斜向歪折）。
- **外绕环绕（wrap）**：边缘环带向外取样——环带显示的是被压缩进来的**玻璃外世界**（纸镇/鱼缸效应），而不是把内部向中心抹平；为此滤镜域（`filterUnits="userSpaceOnUse"`）要外扩 pad（pad ≈ 最大位移 + 2），feImage 覆盖全域，pad 环上位移渐隐归零防硬边。
- **剖面 = smoothstep²(t)**：t 从玻璃深处 0 → 边缘 1，弯曲集中在边缘窄带（半短边的 20–30%），带内越靠边越陡；贴图可半分辨率生成（梯度场平滑，拉伸插值无损，编码成本 1/4）。
- **可选色散**：三通道分层位移（feColorMatrix 隔离 R/G/B 后各自 feDisplacementMap，再 arithmetic feComposite 合成），边缘出彩虹棱边。

### settings 设置面（v1.2.0）：把调节项贡献进设置面板

预设脚本可向宿主设置面板贡献自己的分区，用户改动**热生效**并持久化（删除预设即分区与持久化值一并回收）：

```js
chushi.settings.define({
  title: "液态玻璃",
  controls: [
    { type: "slider", key: "refPct", label: "折射强度", min: 0, max: 300, step: 5, def: 145, unit: "%" },
    { type: "toggle", key: "specular", label: "镜面高光", def: true },
  ],
});
const cfg = await chushi.settings.get();            // 启动期取初值（宿主按 schema 校验 LS 值并补默认）
chushi.settings.onChange((values) => { /* 整组热更新 */ });
```

| API | 说明 |
| --- | --- |
| `chushi.settings.define(schema)` | 声明设置分区：`title`（≤24 字）+ `controls`（1–12 个）；控件类型 `slider`（min/max/step/def/unit）/ `toggle` / `select`（options 2–6 项）；schema 整体白名单校验，不合法整组忽略 |
| `chushi.settings.get()` | Promise<values>：启动期同步取值；消息有序，define 先于 get 到达宿主，回执必然按本脚本 schema 合并 |
| `chushi.settings.onChange(cb)` | 用户改动时回调整组值，返回退订函数 |

同一分区同一控件键在整个 schema 内唯一；值类型由宿主按 schema 夹紧（越界/类型不符一律回默认），脚本拿到的值永远合法。官方液态玻璃预设的折射强度/边缘带宽/霜化/饱和/透亮/边缘色散/镜面高光七项即由此实现。

## 09 animations 自定义样式与元素钩子

CSS 直接注入起始页本体，可以写动画、调玻璃观感。注入前净化（剥除 `@import` 与 `javascript:`），CSS 无法执行脚本。请挂在下面这些**稳定元素钩子类**上：

| 钩子类 | 元素 |
| --- | --- |
| `.cl-clock` | 时钟（含问候语） |
| `.cl-search` | 搜索框区域 |
| `.cl-links` | 快捷磁贴区域 |
| `.cl-dock` | 底部栏 |
| `.cl-panel` | 弹出面板卡片，可配合 `[data-panel="weather"]` 等按面板区分 |
| `.cl-widgets` / `.cl-widget` | 角落小部件层 / 单块小部件 |
| `[data-fx="fxN"]` | 玻璃容器稳定标记（fx 预设的触达点，见 §08） |

⚠ **磨砂玻璃存活原则**：不要给玻璃元素的**祖先**加 `opacity < 1` 或 `filter`——那会让祖先成为 backdrop root，后代所有磨砂玻璃瞬间失效，动画结束才瞬跳恢复；也不要用 transform 包裹 fixed 定位的面板（会成为包含块导致跳位）。动画请落在玻璃元素自身或无玻璃后代的区块上。

```json
"animations": [
  {
    "id": "breathe",
    "name": "时钟呼吸",
    "css": "@keyframes cl-breathe { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } } .cl-clock { animation: cl-breathe 5s ease-in-out infinite }"
  }
]
```

## 10 scripts 沙箱脚本与 chushi API

脚本运行在唯一源沙箱 iframe 里：拿不到主文档、页面数据与扩展 API，只能用受控 `chushi` API。脚本以 async 函数体执行（**顶层 await 可用**）；启动 4 秒未完成会被看门狗自动冻结停用（删除并重新导入预设可恢复），防止死循环卡页。

```json
"scripts": [
  {
    "id": "hitokoto",
    "name": "每日一言",
    "code": "chushi.run = async () => { \n  const r = await chushi.fetchJSON('https://v1.hitokoto.cn/'); \n  chushi.notify({ title: r.hitokoto, description: '—— ' + r.from }); \n}; \nchushi.registerCommand({ id: 'quote', title: '来一句一言', run: () => chushi.run() });"
  }
]
```

| API | 说明 |
| --- | --- |
| `chushi.run()` | 脚本入口：把它赋值成函数，命令/按钮触发时执行 |
| `chushi.registerCommand({id, title, run})` | 向 ⌘K 指令面板注册命令（每脚本 ≤12 条）；命令与 action 的 script 触发统一走入口路由 |
| `chushi.notify({title, description})` | 发一条系统 toast（标题 ≤24 / 描述 ≤60 字） |
| `chushi.open(url)` | 打开 https:// 网址（当前标签页跳转） |
| `chushi.copy(text)` | 复制文本到剪贴板 |
| `chushi.fetchJSON(url, init?)` | 受限 fetch：仅 https，10 秒超时，返回解析好的 JSON |
| `chushi.fx.mount / unmount / onResize` | 视觉效果作用面：注入 style/svg、订阅玻璃容器尺寸（详见 §08） |
| `chushi.settings.define / get / onChange` | 设置面：向设置面板贡献调节项并接收热更新（详见 §08 settings 小节） |

## 11 pages 沙箱整页

`pages` 放完整 HTML 文档片段（含 `<style>` 与 `<script>`），通过 `{"type": "page", "id": "..."}` 全屏打开。与脚本同一套沙箱隔离，页面内可用极简 `window.chushi`：

| API | 说明 |
| --- | --- |
| `chushi.notify({title, description})` | 发 toast |
| `chushi.close()` | 关闭页面，回到起始页 |
| `chushi.open(url)` | 打开 https:// 网址 |

## 12 widgets 角落小部件

小部件是**常驻**页面角落的沙箱卡片（倒数日、快捷信息等），最多 3 块。文档片段自动获得宿主主题（`html[data-theme]`）与强调色（`var(--w-accent)`），深浅色跟随起始页；禅模式随内容一同雾化隐去。

```json
"widgets": [
  {
    "id": "countdown",
    "name": "倒数日",
    "corner": "top-left",
    "width": 216,
    "height": 88,
    "html": "<div id='app'></div><script>/* chushi.storage.get('target') 读取配置… */</script>"
  }
]
```

| 字段 / API | 说明 |
| --- | --- |
| `corner` | 停靠角：`top-left / top-right / bottom-left / bottom-right` |
| `width` | 卡片宽度 120–420 px（缺省 216） |
| `height` | 初始高度 40–320 px（缺省 88） |
| `chushi.resize(w, h)` | 小部件内调用，调整自身高度（宿主夹紧） |
| `chushi.storage.get(key)` | 读本部件持久化 KV（Promise），数据只存本机 localStorage |
| `chushi.storage.set(key, value)` | 写 KV（Promise），值 JSON 序列化后 ≤4000 字符 |
| `chushi.notify / open` | 与 pages 相同 |

官方示例「倒数日」预设（仓库 `examples/倒数日预设.json`）：点击卡片改事件与日期，配置经 storage 保存在本机——照抄它的结构最快上手。

## 13 .cshz 预设包（zip 格式）

JSON 太长或要带图片/字体资源时，把预设打成 zip 包（推荐扩展名 `.cshz`，也接受 .zip），在「导入文件」里选择：

```text
preset.cshz
├── manifest.json     必需 — 预设主体（与粘贴导入同一份 chushi:1 结构）
├── assets/           可选 — 资源目录
│   └── photo.jpg
└── README.md 等其余文件一律忽略
```

manifest 里的 `pages[].html` / `animations[].css` / `widgets[].html` 可以写 `asset:文件名` 引用资源，导入时替换为 data: URL 内联（安装后无需保留包）。例如 `background-image: url(asset:photo.jpg)`。

| 护栏 | 数值 |
| --- | --- |
| 解压后总大小 | ≤ 4MB |
| 压缩包条目数 | ≤ 64 |
| 单资源大小 | ≤ 512KB |
| 资源文件名 | 仅字母/数字/点/下划线/连字符，≤64 字符 |
| 资源类型 | 图片 / 音频 / 视频 / 字体（MIME 白名单） |

## 14 调试与分发建议

1. **先填入示例**：导入面板的「填入示例」会放一份覆盖命令/磁贴/动画/页面/脚本的完整预设，从它开始改最稳。
2. **读错误列表**：校验失败会列出每一条错误及其字段路径，从上往下修。
3. **小步验证**：每加一个字段就重新导入一次，整体拒绝制保证坏字段不会偷偷生效。
4. **分发**：短预设直接发 JSON 文本；带资源的发 .cshz 包——粘贴、本地文件选择与**拖拽到导入面板**（v1.2.0 起）三种方式导入行为完全一致。官方示例都在仓库 `examples/` 目录（倒数日预设.json / 液态玻璃预设.json）。
5. **尊重用户**：不要做全屏闪烁、高频 toast、抢焦点之类的体验；上限表（§03）就是产品对预设作者的约定——留在上限内，用户才敢安装第三方预设。

## 15 整页焕新能力评估（API 现状与路线）

「能不能靠预设系统把整个页面焕新一遍？」——按 v1.2.0 的作用面清单逐项盘点：

**已能焕新的维度**：

- **内容与功能**：命令/磁贴/栏按钮/角落小部件/沙箱整页（`commands/links/dock/widgets/pages`）——新增功能入口已经是全量的；
- **排版**：`layout` 布局覆写（隐藏区块/时钟缩放/磁贴列数/垂直对齐）+ `animations` CSS 注入可重排 `.cl-*` 元素钩子——常规排版改造已可声明完成；
- **色彩与材质**：`settings` 白名单（强调色/主题/背景模式）+ `animations` 重写玻璃底色/描边 + fx 作用面整套材质替换（液态玻璃就是实证）；
- **动画**：`animations` 注入 @keyframes 可覆盖/新增元素动画；玻璃容器的折射类效果走 fx 自带引擎；
- **设置面板扩展**：`chushi.settings` 让预设拥有自己的调节项——焕新方案自带可调参数。

**尚未覆盖、需要后续新增作用面的维度**（按性价比排序）：

1. **图标替换**：磁贴/dock 图标目前只有字母/站点图标与 20 个 lucide 白名单名，缺「预设自带图标资源」的作用面（可沿 .cshz assets + 图标白名单扩展）；
2. **主题令牌覆写**：圆角/字体/墨色等设计令牌（CSS 变量）尚无声明式覆写字段——现阶段可用 `animations` 写 `:root { --radius: … }` 变通，但缺校验与夹紧；
3. **动效语言替换**：面板开合/⌘K 弹簧等宿主动效参数未暴露给预设（可评估声明式 motion token 覆写）；
4. **时钟/问候语格式**：文案模板与格式未开放；
5. **新增面板**：dock 面板槽位固定五枚，预设只能开整页 overlay，不能往面板区注册新面板（评估面较大，优先级靠后）。

结论：**材质、内容、排版、动画四维已可整页焕新**（液态玻璃预设 + 倒数日预设分别是「换材质」与「加功能」的样板）；图标与主题令牌是下一批最值得补的作用面。
