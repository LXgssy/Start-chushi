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
8. [焕新四作用面：icons / tokens / motion / clock](#07b-焕新四作用面icons--tokens--motion--clock)
9. [fx 效果作用面与换材质 API（预设包自带引擎）](#08-fx-效果作用面与换材质-api预设包自带引擎)
10. [animations 自定义样式与元素钩子](#09-animations-自定义样式与元素钩子)
11. [scripts 沙箱脚本与 chushi API](#10-scripts-沙箱脚本与-chushi-api)
12. [pages 沙箱整页](#11-pages-沙箱整页)
13. [widgets 小部件（角落磁贴 / dock 面板）](#12-widgets-小部件角落磁贴--dock-面板)
14. [.cshz 预设包（zip 格式）](#13-cshz-预设包zip-格式)
15. [调试与分发建议](#14-调试与分发建议)
16. [作用面总览（整页焕新）](#15-作用面总览整页焕新)

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

`chushi: 1` 是格式版本标记（必需，缺了会直接拒绝）；`name` 必填；`commands / links / dock` 至少写一项——十三个内容字段（commands / links / dock / settings / scripts / animations / pages / widgets / layout / icons / tokens / motion / clock）全空同样会被拒绝。

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
| `widgets` | 数组 ≤3 | 小部件：角落磁贴 / dock 按钮+弹出面板（surface，见 §12），单块 html ≤12000 字符 |
| `layout` | 对象 | 声明式布局覆写（见 §07） |
| `icons` | 数组 ≤7 | tab 栏内建按钮图标替换（含音乐按钮，v1.7.5+），单条 icon ≤8192 字符（见 §07b） |
| `tokens` | 对象 | 主题令牌覆写（键白名单，值 ≤120 字符，见 §07b） |
| `motion` | 对象 | 动效语言：profile 档位 + speed 倍率（见 §07b） |
| `clock` | 对象 | 时钟格式覆写：小时制/秒（一次性合入用户设置）/日期行/问候模板（见 §07b） |

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
| `panel` | `id` | 打开内置面板；id ∈ `weather / todo / note / pomodoro / settings`（music 已于 v1.8.0 随插件路线退役） |
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

## 07b 焕新四作用面：icons / tokens / motion / clock（v1.7.0）

除 layout 外另有四个声明式作用面，与 layout 同律：**装了即生效、删除预设即还原**、数值自动夹紧、多预设同字段安装顺序后者胜。唯一例外：clock 的 hour12 / showSeconds 自 v1.7.1 起改为**安装时一次性合入用户设置**（见下表）。官方「焕新示例预设」（仓库 `examples/焕新示例预设.json`）一次覆盖全部八个维度，可直接当结构模板使用。

| 字段 | 结构 | 说明 |
| --- | --- | --- |
| `icons` | `[{ target, icon }]` | **图标替换**：target ∈ `weather / todo / note / pomodoro / settings / command`（tab 栏六个内建按钮）；icon 填内置图标名（与 §05 同一白名单）或 base64 `data:image/` URL（png/jpeg/webp/gif/svg+xml，≤8KB，`<img>` 静态渲染不执行脚本）。每按钮仅接受一条覆写 |
| `tokens` | `{ "--ui-accent": … }` | **主题令牌覆写**：键白名单 `--ui-accent`（强调色）/ `--pill-seg`（选框底色）/ `--pill-seg-ring`（选框描边）/ `--pill-line`（分隔线）；值 ≤120 字符，净空 `;{}<>` 字符 |
| `motion` | `{ profile?, speed? }` | **动效语言**：profile ∈ `standard`（标准）/ `playful`（Q 弹）/ `calm`（从容）/ `instant`（直给），作用于面板高度弹簧与 tab 选框滑移（**playful 档连选框切换也换 Q 弹滑移**，其余档位保持基线手感）；speed（0.5–2）为 CSS 入场/聚拢动画时长倍率——退场保持恒定以保证卸载计时一致 |
| `clock` | `{ hour12?, showSeconds?, showDate?, greeting? }` | **时钟格式**：hour12 / showSeconds 为**安装时一次性合入用户设置**（与 settings 字段同律：写入后随时可在设置面板调整，删除预设不回滚——v1.7.1 语义修正，原声明式覆写会让设置面板永远调不回）；showDate（「日期 · 农历 · 问候」行显隐）与 greeting（问候语模板，`{greet}` = 时段问候、`{name}` = 用户名，≤40 字符，空串 = 隐藏问候）为声明式覆写，删除预设即还原 |

tab 栏选框动效三段式（v1.7.1）：出现（开面板时）固定 Q 弹出场（scale 0.6 → 1 过冲回弹，非液态玻璃材质）；**按钮间切换滑移恢复基线标准弹簧手感**（仅 playful 档换 Q 弹滑移）；关闭面板时选框快速缩回淡出。reduceMotion 下出场不播放。

## 08 fx 效果作用面与换材质 API（预设包自带引擎）与设置面

视觉风格**不由宿主内建**：宿主只提供受控的「作用面」，材质的**全部实现代码住在预设包的 scripts 里**——安装即生效、删除预设（或脚本被冻结）即整组回收。亚克力、Mica、液态玻璃等任何风格都由预设经这套接口自行实现（官方「焕新示例预设」演示了 Fluent 亚克力材质）。两块作用面：`chushi.material`（换材质，推荐入口）与 `chushi.fx`（高阶贴图接口）。

| API / 钩子 | 说明 |
| --- | --- |
| `chushi.material.apply({ css, svg? })` | **换材质（v1.7.0，推荐入口）**：css 包 `<style>`、svg 直传，组包后走 fx 挂载（挂载 id 固定 `material`，重复 apply 幂等替换不闪断）；材质 CSS 直接用公开元素钩子即可，无需感知 data-fx 标记。配套 `chushi.material.reset()` 摘除 |
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

⚠ **布局动画防闪（v1.2.0）**：玻璃元素在**布局尺寸连续变化**（dock 面板高度弹簧、窗口拖拽缩放）期间，SVG 位移滤镜会逐帧重栅格化且贴图尺寸滞后错帧，表现为闪动。律：尺寸变动期退化为纯 `blur/saturate`（标准滤镜函数无此病），稳定约 160ms 后再生成贴图换全链。折射类材质都应内置该策略（快照签名变化即标记 busy，settle 定时器到期才建贴图）。

### 物理透镜贴图（折射类材质的参考做法，对齐 Apple 边缘折射）

- **方向 = SDF 梯度（边缘外法线）**：长边中部的弯曲垂直于边缘，与真实透镜一致；不要指向几何中心（长边上会斜向歪折）。
- **外绕环绕（wrap）**：边缘环带向外取样——环带显示的是被压缩进来的**玻璃外世界**（纸镇/鱼缸效应），而不是把内部向中心抹平；为此滤镜域（`filterUnits="userSpaceOnUse"`）要外扩 pad（pad ≈ 最大位移 + 2），feImage 覆盖全域，pad 环上位移渐隐归零防硬边。
- **剖面 = smoothstep²(t)**：t 从玻璃深处 0 → 边缘 1，弯曲集中在边缘窄带（半短边的 20–30%），带内越靠边越陡；贴图可半分辨率生成（梯度场平滑，拉伸插值无损，编码成本 1/4）。
- **可选色散**：三通道分层位移（feColorMatrix 隔离 R/G/B 后各自 feDisplacementMap，再 arithmetic feComposite 合成），边缘出彩虹棱边。

### settings 设置面（v1.2.0）：把调节项贡献进设置面板

预设脚本可向宿主设置面板贡献自己的分区，用户改动**热生效**并持久化（删除预设即分区与持久化值一并回收）：

```js
chushi.settings.define({
  title: "材质调校",
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

同一分区同一控件键在整个 schema 内唯一；值类型由宿主按 schema 夹紧（越界/类型不符一律回默认），脚本拿到的值永远合法。折射强度/边缘带宽/霜化/饱和等典型材质参数均可由此开放热调。

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
| `.cl-dockwidget` | dock 弹出面板卡片（v1.8.2，动画语言与内建面板同源） |
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
| `chushi.material.apply / reset` | 换材质（v1.7.0）：通用材质作用面，`apply({ css, svg? })` 一挂了事（详见 §08） |
| `chushi.fx.mount / unmount / onResize` | 效果作用面高阶接口：注入 style/svg、订阅玻璃容器尺寸（详见 §08） |
| `chushi.settings.define / get / onChange` | 设置面：向设置面板贡献调节项并接收热更新（详见 §08 settings 小节） |

## 11 pages 沙箱整页

`pages` 放完整 HTML 文档片段（含 `<style>` 与 `<script>`），通过 `{"type": "page", "id": "..."}` 全屏打开。与脚本同一套沙箱隔离，页面内可用极简 `window.chushi`：

| API | 说明 |
| --- | --- |
| `chushi.notify({title, description})` | 发 toast |
| `chushi.close()` | 关闭页面，回到起始页 |
| `chushi.open(url)` | 打开 https:// 网址 |

## 12 widgets 小部件（角落磁贴 / dock 面板）

小部件有两种表面（`surface`，v1.8.2）：**corner**（缺省）常驻页面角落的沙箱卡片（倒数日、快捷信息等）；**dock** 不出角落，而是在底部 tab 栏注册一个按钮（`icon` + `name`），点击在 dock 上方弹出同源沙箱面板——高度弹簧与内建面板同一动效语言，再点按钮 / 点击外部 / 部件内 `chushi.close()` 均可关闭。最多 3 块。文档片段自动获得宿主主题（`html[data-theme]`）与强调色（`var(--w-accent)`），深浅色跟随起始页；dock 面板形态下沙箱会置 `html[data-panel="1"]`（部件可据此切换布局，如音乐预设直开展开卡）；禅模式随内容一同雾化隐去。

```json
"widgets": [
  {
    "id": "countdown",
    "name": "倒数日",
    "surface": "corner",
    "corner": "top-left",
    "width": 216,
    "height": 88,
    "html": "<div id='app'></div><script>/* chushi.storage.get('target') 读取配置… */</script>"
  },
  {
    "id": "player",
    "name": "音乐",
    "surface": "dock",
    "icon": "music",
    "width": 340,
    "height": 92,
    "html": "<div id='p'></div><script>/* chushi.smtc.subscribe(render); chushi.close() 关面板 */</script>"
  }
]
```

| 字段 / API | 说明 |
| --- | --- |
| `surface` | 表面：`corner`（缺省，角落磁贴）/ `dock`（tab 栏按钮 + 弹出面板，v1.8.2） |
| `icon` | 仅 dock 表面：按钮图标，内置图标名（bookmark / music / star … 白名单）或 data:image base64 URL（≤8KB） |
| `corner` | 仅 corner 表面：停靠角 `top-left / top-right / bottom-left / bottom-right` |
| `width` | 卡片/面板宽度 120–420 px（缺省 216） |
| `height` | 初始高度 40–320 px（缺省 88；dock 表面即弹出面板初始高度，后续随 `chushi.resize` 弹簧跟随） |
| `chushi.resize(w, h)` | 小部件内调用，调整自身高度（宿主夹紧） |
| `chushi.close()` | 关闭本部件的 dock 弹出面板（仅 dock 表面有意义，v1.8.2） |
| `chushi.storage.get(key)` | 读本部件持久化 KV（Promise），数据只存本机 localStorage |
| `chushi.storage.set(key, value)` | 写 KV（Promise），值 JSON 序列化后 ≤4000 字符 |
| `chushi.notify / open` | 与 pages 相同 |
| `chushi.smtc.get()` | **媒体作用面（v1.8.0）**：读当前系统媒体会话快照（Promise），返回 `{connected, version, track, cover}`；track 为 `{app,title,artist,album,playing,position,duration,rate,coverRev,fetchedAt}`，cover 为封面 data URL 或 null |
| `chushi.smtc.control(cmd, position?)` | 媒体控制（Promise<boolean>）：cmd ∈ `play / pause / toggle / next / prev / seek`（seek 附 position 秒）；控制权由播放器决定 |
| `chushi.smtc.subscribe(cb)` | 订阅快照变化：签名变化才回调（position 不推，按 fetchedAt 插值）；订阅即回推当前值，返回退订函数 |

> SMTC 数据来自 Windows 系统媒体会话（经本机「初始SMTC桥」127.0.0.1:20754），
> 网易云音乐 / QQ 音乐 / Spotify / 浏览器视频等任何注册 SMTC 的播放器都会出现。
> 官方示例「初始 · SMTC 音乐」预设（`examples/初始SMTC音乐预设.cshz`，包形态含 assets/cover.svg 默认唱片，经 `parsePack` 导入）：
> **dock 表面**音乐按钮 + 弹出面板（dock 表面用例）+ ⌘K 命令，两通道 API 的完整用例。

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
4. **分发**：短预设直接发 JSON 文本；带资源的发 .cshz 包——粘贴、本地文件选择与**拖拽到导入面板**（v1.2.0 起）三种方式导入行为完全一致。官方示例在仓库 `examples/` 目录（焕新示例预设.json / 倒数日预设.json）。
5. **图形化开发工具**：导入预设面板的「开发工具」按钮提供官方单文件离线应用（表单式编辑声明式字段、实时 JSON 预览与完整性提示、内嵌使用说明），下载后双击即可在任意浏览器使用——无需手写 JSON、无需联网。
6. **尊重用户**：不要做全屏闪烁、高频 toast、抢焦点之类的体验；上限表（§03）就是产品对预设作者的约定——留在上限内，用户才敢安装第三方预设。

## 15 作用面总览（整页焕新）

预设系统当前提供以下作用面，八个维度组合即可完成整页焕新。全部作用面共用同一套产品约定：声明式白名单校验（不合法整体拒绝）、装了即生效、删除预设即还原、多预设同字段安装顺序后者胜。

| 维度 | 载体 | 能力 |
| --- | --- | --- |
| 内容 | `commands / links / dock / pages / widgets / scripts` | ⌘K 命令、主页磁贴、tab 栏按钮、沙箱自定义页、角落磁贴 / dock 面板、数据源脚本 |
| 排版 | `layout` | 区块显隐、时钟缩放、磁贴列数、垂直对齐 |
| 图标 | `icons` | tab 栏内建按钮的图标替换（六个，music 已退役） |
| 主题令牌 | `tokens` | 强调色与 tab 栏选框/分隔线四令牌覆写 |
| 动效语言 | `motion` | 弹簧档位（standard/playful/calm/instant）与入场动画倍率；playful 档含选框 Q 弹滑移切换 |
| 时钟格式 | `clock` | 小时制、秒数（一次性合入，面板可调）、日期行、问候语模板 |
| 动画 | `animations` | 自定义 CSS（净化后注入，公开元素钩子） |
| 材质 | `chushi.material / chushi.fx` | 任意材质换装——亚克力、Mica、液态玻璃等风格均由预设自行实现，宿主零内建 |

另有 `chushi.settings`（设置面）：预设向设置面板贡献自己的调节分区，让焕新方案自带可调参数。

官方示例位于仓库 `examples/` 目录：「焕新示例预设.json」一次覆盖八个维度（Fluent 亚克力材质、磁贴内容、排版、磁贴微动效、图标替换、主题令牌、Q 弹动效语言、12 小时时钟与问候模板），可作为焕新类预设的结构模板；「倒数日预设.json」演示沙箱小部件与持久化配置。图形化开发工具（导入预设面板「开发工具」按钮下载）无需手写 JSON 即可编辑全部声明式字段；进阶贴图材质与设置面开发参见 §08。
