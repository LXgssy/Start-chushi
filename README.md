# 初始 · ChuShi 起始页

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![React](https://img.shields.io/badge/React-19-61dafb) ![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8) ![Motion](https://img.shields.io/badge/framer--motion-12-e74c8b) ![License](https://img.shields.io/badge/Code_License-MIT-green) ![Images](https://img.shields.io/badge/Images-Unsplash_License-lightgrey)

> 一个把「开始新标签页」变成仪式感的浏览器起始页：时钟、搜索、快捷服务、天气、待办、笔记、番茄钟与壁纸图库，全部装进一方极简而克制的画布。

**在线体验**：<https://lxgssy.github.io/Start-chushi/>（GitHub Pages 静态部署，所有数据仅存本地浏览器）

![预览 · 深](docs/preview-dark.png)

## 这是什么

「初始」是一个纯前端浏览器起始页。它不追求信息堆叠，而是把最高频的几个动作——搜索、打开常用网站、看时间、专注计时——打磨到足够优雅：磨砂玻璃的层次、随动画渐凝渐散的雾化过渡、按壁纸明暗自适应的墨色提示词，以及一个可以完全放空的禅模式。

![预览 · 浅](docs/preview-light.png)

## 功能特性

- **时钟**：大字极简时钟，附农历与日期
- **搜索**：多引擎切换（搜索引擎在设置中自定义），支持命令面板快速跳转
- **快捷服务**：Dock 栏与快捷链接卡片，长按可编辑、拖拽排序，favicon 运行时加载
- **天气**：天气面板与栏内天气字标（可配置位置）
- **效率套件**：待办清单、速记笔记、番茄钟（正/倒计时、自动阶段轮转、提示音、Dock 徽标）
- **壁纸系统**：
  - 「辉光」动态光斑背景与「纯净」纯色背景
  - 「掠影」官方图库（Unsplash 精选摄影，含国风十帧本地化高清图）
  - 每日一图按日期自动轮换
  - 自定义壁纸（IndexedDB 本地存储，不上传）
- **禅模式**：一键进入只留时钟与呼吸番茄钟的极简视野；进出有雾化散场/聚拢过渡；退出提示词按背景明暗自动切换墨色；番茄钟计时中会以同色系迷你时钟行浮现，停止计时不打扰
- **预设**：声明式 JSON 预设，可给指令面板注册新命令、给底部栏加自定义按钮、批量导入磁贴，甚至**向设置面板贡献自己的调节项**（v1.2.0 设置面作用面，滑杆/开关/分段选择，改动热生效）；进阶玩法还可在预设里携带**沙箱 JS 脚本**（唯一源隔离，拿不到页面数据），写自己的数据源与通知机器人；**液态玻璃**引擎内建于宿主，物理模型与参数体系移植自「玻璃游乐场」liquid-glass-webgl（v1.5.0，WebGL 光学管线实时渲染，折射全程在线、游乐场同款滑杆热调、覆盖范围可调），预设经 `chushi.glass` 一句调用；底部标签栏与按钮动效同源移植（阻尼拖拽物理）；自定义视觉仍可走 fx 受控作用面；支持粘贴、本地文件与**拖拽文件导入**；一段 JSON 复制给朋友，导入即用
- **明暗主题**：跟随系统，也可手动切换
- **动效**：入场、悬浮、进出禅模式全部使用同一套克制的动画语言，并尊重 `prefers-reduced-motion`；面板骨架拉伸形变、面板内容统一「模糊聚拢 / 模糊散场」过场，指令面板（⌘K）则有专属的 Q 弹开合

## Edge 插件版（新标签页）

同一份代码，以 Chrome MV3 / Edge Add-ons 扩展形态交付：安装后**直接替换浏览器新标签页**，无需打开网址。扩展是完整的本地静态包——时钟、搜索、快捷链接、待办、便签、番茄钟、壁纸图库（含国风十帧）全部随扩展离线分发，**断网也能完整使用**（仅天气、搜索联想、在线壁纸需要网络）。仅支持**桌面版** Edge / Chrome——手机与平板浏览器不允许扩展替换新标签页，移动端请使用下方网页版并「添加到主屏幕」。

### 安装

**方式一 · Edge 商店（已上架）**

在 Microsoft Edge 加载项商店一键安装：**[初始 ChuShi - 新标签页](https://microsoftedge.microsoft.com/addons/detail/bpkdpmdeahplgpcgjakaonlheldagcgf)**（或在商店内搜索「初始」）。首次开启新标签页时浏览器会提示「新的标签页已由此扩展接管」，确认即可。

**方式二 · 开发者模式加载（立即可用）**

1. 从 [GitHub Releases](https://github.com/LXgssy/Start-chushi/releases) 下载最新 `ChuShi-NewTab-v*.zip` 并解压（或直接拖入第 3 步的页面）
2. 打开 `edge://extensions`，开启左下角「**开发人员模式**」
3. 点击「**加载解压缩的扩展**」，选择解压后的文件夹
4. 打开一个新标签页，「初始」即刻呈现

> Chrome / 其他 Chromium 内核浏览器（Chrome、Brave、Opera 等）同样适用，在 `chrome://extensions` 中按相同步骤操作。

### 权限说明

扩展遵循最小权限原则，逐项用途如下（详见 [PRIVACY.md](./PRIVACY.md)）：

| 权限 | 用途 |
|---|---|
| 新标签页覆盖 | 以「初始」替换默认新标签页 |
| `geolocation` | 仅在你主动点击天气「定位」时获取坐标，只用于匹配就近气象站查询天气（扩展版走中国气象局，网页版走 Open-Meteo） |
| `weather.cma.cn` | 中国气象局官方天气（扩展版优先源，请求只含 5 位站号、不含坐标） |
| `api.open-meteo.com` 等 | 天气兜底源 / 城市搜索 / 逆地理编码 |
| `www.baidu.com` | 搜索框输入联想词（仅联想，回车仍用你所选引擎搜索） |
| `images.unsplash.com` | 掠影壁纸在线图库 |

所有偏好、链接、待办、笔记、壁纸依旧只存本地（localStorage / IndexedDB），**无任何上报与追踪**。

## 指令面板（⌘K）

指令面板是「初始」的键盘入口：搜索、面板、操作、预设命令、链接全部汇在一个弹层里。

> v1.0.8 起，在面板里选择「导入预设 / 管理预设」不再弹出独立对话框：指令面板会原地高度形变（缩小）为预设系统面板，关闭时对称折回；dock 面板的开 / 关 / 切换也统一为同一套高度形变语言（打开从底部栏展开、关闭对称折回）。
>
> v1.0.9 起，浮层背景统一回归磨砂模糊（不再使用黑色遮罩，含关闭动画）；面板内容的开 / 关 / 互切过场统一为「模糊聚拢 / 模糊散场」；指令面板（⌘K）独享 Q 弹开合（其它面板维持高度形变）。
>
> v1.1.1 起，幕布模糊收敛为轻雾化（12px）：⌘K 打开时主页面组件在雾中依然可辨（不再被厚重模糊「藏起来」）；预设视图顶部新增「返回指令面板」按钮，「导入预设」视图新增「开发者文档」入口（内含完整的预设包 / 预设制作指南）。
>
> v1.1.2 起，液态玻璃材质重调：玻璃底色调透 + 缺省模糊降至 3px + 缺省折射提至 0.75，且模糊在先、折射在后——边缘透镜弯曲透过玻璃体清晰可辨（不再被不透明底色洗掉）；开发者文档改为全屏 portal 直挂 body（⌘K 形变舞台不再遮挡内容）并新增「返回上一级」按钮，同时文档全文同步至仓库 `docs/PRESET_DEV.md`。
>
> v1.1.3 起，架构纠偏：液态玻璃不再内建在宿主里——宿主只提供 fx 受控作用面（`chushi.fx.mount / onResize`、`[data-fx]` 标记、`--fx-mx/--fx-my` 指针变量），折射引擎的全部代码（位移贴图、SVG 滤镜、材质高光）都住在官方「液态玻璃」预设包的脚本里，删除预设即整组回收；同一批修复 ⌘K 两个交互隐患：① toast 通知竖带在显示期间拦截 ⌘K 遮罩点击（「删预设返回后点空白关不掉」的实证根因）；② cmdk 选中高光在指针离开面板后常驻（改为三态门控：指针在面板内/方向键导航才显示）。
>
> v1.2.0 起，液态玻璃对齐 Apple 物理透镜观感并开放热调：折射重写为「SDF 梯度方向 + 外绕边缘窄带 + 滤镜域外扩」；新增 **chushi.settings 设置面作用面**（预设向设置面板贡献调节项，液态玻璃七参数可热调并持久化）；根治面板开合动画期闪动；导入预设支持拖拽文件；右键菜单与开发者文档分区开/关增加级联模糊过场。
>
> v1.3.0 起，液态玻璃升级为 **WebGL 物理透镜**并对齐 Apple 观感（折射模型忠实移植 [martin65536/liquid-glass-webgl](https://github.com/martin65536/liquid-glass-webgl) ← Kyant0/AndroidLiquidGlass，Apache-2.0）：圆弧透镜剖面 + SDF 梯度方向 + 向内采样（凸透镜放大）、可选七通道色散与边缘高光；同批新增两个「整页焕新」作用面：**图标替换**（`chushi.icons.override`，Dock/搜索等槽位换图）与**主题令牌覆写**（`chushi.theme.override`，亮/暗双域 28 项令牌白名单），删除预设即整组还原。
>
> v1.4.0 起，应「光靠预设包效果还是不行」的反馈，液态玻璃引擎**收编内建于宿主**：引擎在可见文档中以 rAF 逐帧追踪玻璃几何——**布局/弹簧/变换动画期间位移贴图实时重建（变动期 1/4 分辨率 30fps、稳定后半分辨率精贴图）、折射全程在线不冻结**（v1.3.0 的沙箱画布方案受隐藏文档 rAF 冻结与消息桥往返所限，动画期仍会退化）；物理保持 Apple/Kyant 修正律（**SDF 梯度 × 负量内采样** 凸透镜折射，经 SVG `feDisplacementMap` 负 scale 实现）；**覆盖范围扩容**：新增天气玻璃芯片（full 模式）并新增「覆盖范围」设置项（全部玻璃面 / 基础四区）；预设包改经 `chushi.glass.enable / patch / disable` 一句调用，官方预设瘦身到 1.8KB、设置项八项。`attachCanvas / pushFrame / getBackdrop / onPositions` 位图通道作用面保留，供自绘类预设继续使用。

> v1.5.0 起，应「换用液态玻璃仓库实现」的指令，旧 SVG 位移贴图引擎整体移除，光学管线与动效物理全面移植自开源项目「玻璃游乐场」 [martin65536/liquid-glass-webgl](https://github.com/martin65536/liquid-glass-webgl)（**作者 martin65536**，Apache-2.0；其原型为 [Kyant0/AndroidLiquidGlass](https://github.com/Kyant0/AndroidLiquidGlass)，**作者 Kyant0**，Apache-2.0；移植时保留了两个项目头部的作者与出处声明）：
> - **WebGL 光学管线**：circleMap 圆弧透镜剖面 × 圆角矩形 SDF 梯度 × 负量内采样（凸透镜放大）× 7 通道 ROYGBV 色散 × Vogel 金角螺旋 16-tap 高斯霜化 × colorControls × 独立边缘高光 pass（Plus 加法混合），预乘 alpha 输出无黑边；背景 = 真实壁纸逐帧采样（kenburns 漂移逆解跟随）+ 压暗遮罩；全引擎共享单 GL 上下文、位图串行队列上屏；跨域壁纸走 crossOrigin 链路、不可用时自动降级 CSS 磨砂；
> - **玻璃面板与设置换成游乐场同款**：折射高度/折射量/模糊/色散/饱和度五滑杆（游乐场 Glass Playground 参数语义）+ 边缘高光开关 + 覆盖范围，设置面板热调即生效；各玻璃面角色默认值逐项对照游乐场各页参数；
> - **底部标签栏动效换成游乐场同款**：活动指示器改为独立滑动玻璃胶囊（`.cl-dock-indicator`，引擎单独折射），滑动/按压/速度拉伸物理忠实移植 LiquidBottomTabs + DampedDragAnimation（临界阻尼滑动 spring(1,1000)、欠阻尼按压缩放 spring(0.6/0.7,250) 到 78/56、速度拉伸除数 10、panelOffset 4dp EaseOut、容器/内容按压缩放）；支持按住拖拽滑选；
> - **按钮动效换成游乐场同款**：dock 按钮按压 = LiquidButton 律（scale 1+4/48×p 临界阻尼 + tanh 拖拽平移 + 追光白晕 Plus 混合）。

> v1.6.0 起，针对实测截图反馈的五个问题整体重构（仍以 liquid-glass-webgl 为唯一来源，作者 martin65536 / 原型 Kyant0，代码内署名不变）：
> - **玻璃设置 = 玻璃游乐场设置面板全量移植**：模糊半径（0–32px）/ 折射高度（0–48px）/ 折射量（0–48px）/ 色差（0–100%）四滑杆——即游乐场 Glass Playground 除「圆角半径」外的全部控件 + 应用特有的覆盖范围；v1.5.0 发布包误带旧八项参数的问题一并纠正；
> - **「玻璃只渲染背景不渲染组件」根治**：circleMap 剖面本就边缘集中（内部位移≈0），叠层画布改为**只画边缘折射带**（SDF 距离归一掩膜，在带内界位移自然归零处与 CSS 磨砂体交接，壁纸天文对齐无鬼影），玻璃体内部让位给 CSS backdrop-filter 磨砂——**玻璃身后的 DOM 组件（搜索条、磁贴、面板）从此可见可点**；表面色逐角色按游乐场取值（tabsContainer 0.4 / buttonSurface 0.3 / 指示器与芯片全透明）；
> - **拖拽物理补完 + 卡死根治**：长按拖拽时指示器胶囊同步放大（78/56 + 速度拉伸）且**常显**（游乐场「选中项恒有胶囊」律，面板未开也有胶囊，不再「只有图标变大而边框不变」）；「拖拽松手概率不回弹」根因 = 鼠标拖出 nav 外松手收不到 pointerup → `isDragging` 永久卡死，修复 = 拖拽启动时刻 `setPointerCapture`（⚠ 不能挂在 pointerdown：capture 会把 click 重定目标到 nav，玻璃模式下 dock 全部点击失效——实测实录）；按住任意 tab 时容器/内容/指示器同步胀（DampedDragAnimation hold 律）；
> - **按钮按压双重放大纠正**：tab 按钮豁免自身 LiquidButton 缩放（data-lg-tab），组按压 1.2× 内容缩放独占；动作按钮（⌘K/预设等）改由**全局按压控制器**接管（事件委托，覆盖全文档所有按钮，预设动态 DOM 同样生效）；
> - **「这套动效只给液态玻璃用」门控**：新增引擎订阅（`liquidGlass.subscribe`）驱动的 `lgOn` 状态——玻璃开启时底栏指示器/拖拽/按压物理与全局按钮按压全套生效；玻璃关闭（未装/删除液态玻璃预设）自动恢复**原版 framer layoutId 活动药丸 + 纯 hover 过渡**，零新动效残留；
> - 修复高光 pass 在 Plus 加法混合下输出常数 alpha=1、把带掩膜后的玻璃内部整体顶回不透明黑的渲染缺陷（v1.5.0 因内部本就实心而未暴露）。

## 右键菜单

在页面任意空白处右键，弹出的不是浏览器默认菜单，而是「初始」专属快捷菜单：指令面板 / 添加链接 / 明暗切换 / 禅模式 / 设置 / 开发者文档 / 导出备份，常用的动作都在指尖最近处。

- 菜单是一块小玻璃卡片，随液态玻璃预设一同折射，视觉与全站同源；
- 菜单从鼠标点「长出来」：以指针为原点回弹放大（Q 弹过冲），靠近屏幕右 / 下缘时自动翻转、原点跟随翻转方向；
- 右键输入框、文字选区时保留浏览器原生菜单（复制 / 翻译 / 拼写检查是系统级能力）；
- `Esc`、外点、点击菜单项即关闭（向原点缩回淡出）。

## 预设开发者文档

⌘K →「导入预设」→「开发者文档」，或在页面空白处右键选「开发者文档」：面向预设作者的完整指南，覆盖预设 JSON 全部字段、白名单 action、沙箱脚本 API、角落小部件、`.cshz` 预设包结构与安全模型、调试与分发建议——字段与上限均与实现严格同步，照着写即可发布自己的预设。

文档顶部提供「返回上一级」按钮（回到导入预设 / 主页面），全文另同步在仓库 [`docs/PRESET_DEV.md`](docs/PRESET_DEV.md)，可直接在 GitHub 阅读。

### 操作须知

| 操作 | 方式 |
|---|---|
| 打开 | `⌘ K`（macOS）/ `Ctrl K`（Windows/Linux）；或底部 Dock 栏最右侧的「指令面板」按钮 |
| 关闭 | 再按一次 `⌘K` / `Ctrl K`，或 `Esc`（逐级关闭：自定义页面 → 面板 → 侧栏），或点击遮罩 |
| 选择 | `↑` `↓` 移动，`回车` 执行；也支持鼠标直接点击 |
| 过滤 | 直接输入关键词即可模糊匹配；清空后显示全部分组 |

> 提示：在页面空白处**直接打字**会聚焦底部搜索框（而非指令面板）；`/` 键仅聚焦不输入。两者用途不同——搜索框适合「搜出去」，指令面板适合「在本页做事」。

### 面板里有什么

自上而下分组（只显示有内容的分组）：

| 分组 | 何时出现 | 内容 |
|---|---|---|
| 用「…」搜索 | 输入框有内容时 | 全部搜索引擎一键直搜；输入形似网址时还会出现「打开网址」 |
| 打开 | 恒常 | 待办清单 / 便签 / 天气 / 设置面板 |
| 操作 | 恒常 | 切换明暗主题、添加快捷链接、导入 / 管理预设、导出数据备份 |
| 预设命令 | 安装了预设时 | 预设注册的命令（含沙箱脚本注册的），右侧标注来源预设名 |
| 链接 | 有快捷链接时 | 全部磁贴直达（显示域名） |

预设命令与磁贴随预设安装 / 删除即时生效——**装了即出现，删了即消失**，无隐藏状态。

## 预设（自定义你的起始页）

「初始」支持通过 ⌘K 指令面板 →「导入预设」粘贴一段 JSON 来扩展起始页。**声明式部分**（命令 / 磁贴 / 按钮 / 设置）不执行任何代码，所有能力走白名单动作；**进阶部分**（`scripts` 沙箱脚本）运行在唯一源隔离沙箱中（见下文）。两者都可以放心安装别人分享的预设。

### 能做什么

| 预设字段 | 效果 |
|---|---|
| `commands` | 往 ⌘K 指令面板注册新命令（≤12 条） |
| `dock` | 给底部栏加自定义按钮（≤3 个） |
| `links` | 批量导入快捷链接磁贴（≤12 个，按网址去重） |
| `settings` | 建议的外观设置（强调色 / 主题模式 / 背景模式 / 12 小时制 / 显示秒 / 搜索引擎 / 图标样式 / 搜索联想 / 称呼） |
| `scripts` | 沙箱 JS 脚本（≤3 个，每个 ≤16000 字符，v1.0.5 起） |
| `animations` | 自定义 CSS 动画与面板样式（≤4 段，注入前净化，v1.0.6 起） |
| `pages` | 整页自定义页面：完整 HTML 跑在沙箱里（≤3 页，v1.0.6 起） |
| `widgets` | 常驻页面角落的沙箱小部件：倒数日、快捷信息等（≤3 个，v1.0.7 起） |
| `layout` | 声明式布局覆写：隐藏区块 / 时钟缩放 / 磁贴列数（v1.0.6 起，删除预设即还原） |

### 动作白名单（`action`）

| type | 参数 | 效果 |
|---|---|---|
| `open` | `url`（仅 https） | 打开网址 |
| `search` | `engine`（google/bing/baidu/ddg）、`q` | 用指定引擎搜索 |
| `panel` | `id`（weather/todo/note/pomodoro/settings） | 打开内置面板 |
| `theme` | `mode`（light/dark） | 切换主题 |
| `copy` | `text`（≤200 字） | 复制文本到剪贴板 |
| `script` | `id`（本预设内 `scripts[].id`） | 触发脚本入口 `chushi.run`（v1.0.5 起） |
| `page` | `id`（本预设内 `pages[].id`） | 全屏打开自定义沙箱页面（v1.0.6 起） |

### 示例

在「导入预设」对话框点「填入示例」可直接试玩（含沙箱脚本命令、自定义动画与一个专注页）：

```json
{
  "chushi": 1,
  "name": "开发者工具箱",
  "author": "初始",
  "description": "示例预设：命令、磁贴、tab 栏按钮与沙箱脚本",
  "commands": [
    { "title": "打开 GitHub", "action": { "type": "open", "url": "https://github.com" } },
    { "title": "搜索 MDN", "action": { "type": "search", "engine": "bing", "q": "MDN web docs" } },
    { "title": "打开待办", "action": { "type": "panel", "id": "todo" } },
    { "title": "每日一言", "action": { "type": "script", "id": "hitokoto" } }
  ],
  "links": [
    { "name": "MDN", "url": "https://developer.mozilla.org" }
  ],
  "dock": [
    { "title": "GitHub", "icon": "github", "action": { "type": "open", "url": "https://github.com" } }
  ]
}
```

字段写错会被逐条指出（例如 url 不以 `https://` 开头、`script` 引用了不存在的脚本 id），整包拒绝导入，不会装一半。已安装的预设可在「管理预设」中移除，移除后命令与按钮一并消失。

### 沙箱 JS（高阶模式，v1.0.5 起）

想让预设「活」起来——接自己的 API、定时提醒、抓取数据再通知——可以在预设里写 `scripts` 字段。脚本运行在一个**唯一源沙箱**中：

- **网页版**：脚本在 `sandbox="allow-scripts"` 的 iframe 里执行，处于不透明源，**读不到主文档、localStorage、Cookie**；
- **扩展版**：脚本在 manifest `sandbox` 声明的沙箱页里执行，**没有任何扩展 API**（`chrome.*` 不可用），与网页版共用同一份运行时，行为一致；
- 脚本唯一的能力来源是受控 API `chushi`，所有越界副作用都会被宿主复核白名单后才执行。

#### `chushi` API

| API | 说明 |
|---|---|
| `chushi.registerCommand({ id, title, run })` | 往 ⌘K 指令面板注册命令；id 仅限字母 / 数字 / `_` / `-`（≤32 字符），每脚本 ≤12 条 |
| `chushi.run = fn` | 定义脚本入口：预设 `commands` / `dock` 里 `{"type":"script","id":"<脚本id>"}` 触发它 |
| `chushi.notify({ title, description })` | 弹出通知（title ≤24 字、description ≤60 字） |
| `chushi.open(url)` | 打开 https 网址（宿主复核，与声明式 action 同规） |
| `chushi.copy(text)` | 复制文本（≤200 字） |
| `chushi.fetchJSON(url)` | `fetch` + JSON 解析 + 10 秒超时；受目标站点 CORS 约束 |

示例：给 ⌘K 加一条「每日一言」命令，并在底部栏放一个按钮：

```json
{
  "chushi": 1,
  "name": "每日一言",
  "commands": [
    { "title": "来一句每日一言", "action": { "type": "script", "id": "hitokoto" } }
  ],
  "dock": [
    { "title": "一言", "icon": "heart", "action": { "type": "script", "id": "hitokoto" } }
  ],
  "scripts": [
    {
      "id": "hitokoto",
      "name": "每日一言",
      "code": "chushi.run = async () => { const r = await chushi.fetchJSON('https://v1.hitokoto.cn/'); chushi.notify({ title: r.hitokoto, description: '—— ' + (r.from || '佚名') }); };"
    }
  ]
}
```

#### 能力边界与限制

- **拿不到**：页面 DOM、localStorage、Cookie、扩展 API、用户数据——沙箱里只有你的代码和 `chushi`；
- **网络**：`fetch` / `chushi.fetchJSON` 由沙箱直接发起，受目标站点 CORS 约束（自建 API 记得允许跨域）；
- **不能操作起始页界面**：脚本无法改 DOM——这是有意设计：受控 API 是唯一通道，起始页改版不会弄坏你写好的预设；
- **顶层 `await` 可用**：脚本以 async 函数体执行；
- **死循环保护**：启动 4 秒内未完成的脚本会被看门狗自动冻结停用（删除并重新导入预设即可恢复）；
- **容量**：每预设 ≤3 个脚本，每个 ≤8000 字符，每脚本 ≤12 条命令。

### 自定义动画与面板样式（`animations`，v1.0.6 起）

预设可以携带 CSS，注入起始页本身——写新动画、调面板观感都行。CSS 无法执行脚本，最坏情况只是弄乱自己页面的视觉，因此这里没有沙箱，只有净化（`@import` 与 `javascript:` 会被剔除）与容量上限。

起始页为预设暴露了一组**稳定的元素钩子类**，写 CSS 时挂在这几个类上即可：

| 钩子类 | 元素 |
|---|---|
| `.cl-clock` | 时钟（含问候语） |
| `.cl-search` | 搜索框区域 |
| `.cl-links` | 快捷磁贴区域 |
| `.cl-dock` | 底部栏 |
| `.cl-panel` | 弹出面板卡片（配合 `[data-panel="weather"]` 等按面板区分） |
| `[data-fx="fxN"]` | 玻璃容器稳定标记（液态玻璃等 fx 预设的触达点，v1.1.3 起） |

```json
{
  "chushi": 1,
  "name": "时钟呼吸",
  "commands": [], "links": [], "dock": [],
  "animations": [
    {
      "id": "breathe",
      "name": "时钟呼吸",
      "css": "@keyframes cl-breathe { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } } .cl-clock { animation: cl-breathe 5s ease-in-out infinite }"
    }
  ]
}
```

容量：每预设 ≤4 段，单段 ≤6000 字符，合计 ≤12000 字符。安装顺序即优先级，移除预设即整体消失。

### 自定义页面（`pages`，v1.0.6 起）

`pages` 字段可以往预设里放**整页 HTML**（含 `<style>` 与 `<script>`），通过命令 / 底部栏按钮的 `{"type":"page","id":"..."}` 全屏打开。页面运行在沙箱 iframe 中（与 `scripts` 同一套隔离模型），只能通过极简的 `window.chushi` 与宿主对话：

| API | 说明 |
|---|---|
| `chushi.notify({ title, description })` | 弹出通知 |
| `chushi.close()` | 关闭页面回到起始页 |
| `chushi.open(url)` | 打开 https 网址（宿主复核） |

```json
{
  "chushi": 1,
  "name": "专注页",
  "commands": [{ "title": "打开专注页", "action": { "type": "page", "id": "focus" } }],
  "links": [], "dock": [],
  "pages": [
    {
      "id": "focus",
      "name": "专注页",
      "html": "<style>html,body{margin:0;height:100%;display:grid;place-items:center;background:rgba(8,8,12,.82);color:#e4e4e7;font-family:system-ui}h1{font-weight:200;letter-spacing:.12em}</style><h1>深呼吸</h1><button onclick=\"chushi.close()\">返回</button>"
    }
  ]
}
```

- 页面内**拿不到**主文档、localStorage、Cookie 与扩展 API；`Esc` 或右上角 × 也能随时退出；
- 单页 HTML ≤24000 字符，每预设 ≤3 页。

### 布局覆写（`layout`，v1.0.6 起）

声明式调整起始页布局，**装了即生效、删除预设即还原**（不写入你的设置）：

| 字段 | 取值 | 效果 |
|---|---|---|
| `hideClock` / `hideSearch` / `hideLinks` | `true` / `false` | 隐藏时钟 / 搜索框 / 快捷磁贴 |
| `clockScale` | 0.5–2 | 时钟整体缩放 |
| `linksColumns` | 3–12 | 磁贴每行列数上限 |
| `verticalAlign` | `"center"` / `"top"` | 主内容垂直对齐 |

多个预设都带 `layout` 时按安装顺序后者胜。`settings` 字段（v1.0.6 起白名单扩充）同理：导入时一次性合并，之后你随时可以在设置面板改回。

### 角落小部件（`widgets`，v1.0.7 起）

`widgets` 字段让预设常驻一块小卡片在页面四角——倒数日、快捷信息、打卡提示都可以。它与 `pages` 同一套沙箱隔离（唯一源宿主 → 不透明源 iframe），拿不到页面数据与扩展 API，删除预设即整块消失：

```json
"widgets": [
  {
    "id": "countdown",
    "name": "倒数日",
    "corner": "top-left",
    "width": 200,
    "height": 96,
    "html": "<style>…</style><div>…</div><script>…</script>"
  }
]
```

| 字段 | 取值 | 说明 |
|---|---|---|
| `corner` | `top-left` / `top-right` / `bottom-left` / `bottom-right` | 停靠角，缺省左上 |
| `width` | 120–420 | 卡片宽度 px，缺省 216 |
| `height` | 40–320 | 初始高度 px，缺省 88，可用 `chushi.resize` 跟随内容 |
| `html` | ≤12000 字符 | 文档片段，与 `pages` 同规则 |

部件内的 `window.chushi`（比页面版多了存储与自适应）：

| API | 说明 |
|---|---|
| `chushi.storage.get(key)` / `set(key, value)` | 读写本部件的持久化键值（宿主保存在浏览器本地，≤4000 字符/值，数据不离开设备） |
| `chushi.resize(width, height)` | 调整卡片尺寸（高度夹紧 40–320） |
| `chushi.notify({title, description})` | 弹系统通知条（与脚本同规） |
| `chushi.open(url)` | 打开 https 网址（白名单复核） |

部件文档会自动拿到宿主的**主题**（`html[data-theme="dark"|"light"]`）与**强调色**（`var(--w-accent)`），深浅色跟随起始页；CSS 钩子 `.cl-widgets`（层）与 `.cl-widget`（单块）可供 `animations` 进一步定制；禅模式部件与页面内容一同雾化隐去。官方示例「倒数日」预设（`examples/倒数日预设.json`）：点击卡片可改事件与日期，配置保存在本机。

### 液态玻璃引擎（chushi.glass，v1.5.0 游乐场移植版）、fx 作用面、设置面与焕新作用面

液态玻璃引擎自 v1.4.0 起**内建于宿主**，自 v1.5.0 起渲染后端换成 **WebGL 光学管线**，物理模型与参数体系移植自「玻璃游乐场」[martin65536/liquid-glass-webgl](https://github.com/martin65536/liquid-glass-webgl)（**作者 martin65536**，Apache-2.0；原型 [Kyant0/AndroidLiquidGlass](https://github.com/Kyant0/AndroidLiquidGlass)，**作者 Kyant0**，Apache-2.0；源码头部保留作者与出处声明）。引擎在可见文档中以 rAF 逐帧追踪玻璃几何，实时渲染 WebGL 透镜折射（动画期 30fps 节流、折射全程在线）；每个玻璃元素叠一层引擎画布（z-index:-1，DOM 内容天然在上），全引擎共享单一 GL 上下文、位图串行队列上屏；背景 = 真实壁纸逐帧采样（kenburns 漂移逆解跟随）+ 压暗遮罩，预乘 alpha 输出无黑边。仅 photo 模式（有壁纸可采）走 WebGL，其余模式 / WebGL 不可用 / 跨域壁纸不可采时自动降级 CSS 磨砂。预设包只需一句 `chushi.glass.enable(cfg)` 调用引擎，参数逐字段白名单夹紧；单持有者制（他预设已持有则 `ok:false`），删除预设/脚本冻结即整体回收还原磨砂。官方「液态玻璃」预设（`examples/液态玻璃预设.json`）即参考实现：游乐场同款滑杆 + 调用引擎。

自定义视觉与焕新仍走下表作用面：**fx**（v1.1.3 起）挂自定义 style/svg、**位图通道**（v1.3.0 起，自绘引擎上屏）、**设置面**（v1.2.0 起）、**图标替换与主题令牌覆写**（v1.3.0 起）。

| API / 钩子 | 说明 |
|---|---|
| `chushi.glass.enable(cfg)` | v1.5.0（游乐场语义）：启用内建液态玻璃引擎并持有（Promise 回执 `{ok, message?}`）。cfg 字段：`refractionHeight`(0–48px 默认 24)、`refractionAmount`(0–48px 默认 24，引擎内部取负 = 凸透镜)、`blur`(0–32px 默认 8)、`chromatic`(0–1 默认 0)、`saturation`(100–260% 默认 150)、`brightness`(85–115% 默认 100)、`highlight`(布尔)、`coverage`(`"core"` 基础四区 / `"full"` 全部玻璃面)；非法字段回默认 |
| `chushi.glass.patch(cfg)` | v1.5.0：热更新部分参数（设置面板拖动滑杆即走这里） |
| `chushi.glass.disable()` | v1.5.0：停用并交还引擎，全站玻璃还原磨砂 |
| 引擎玻璃面注册表 | core = `.search-pill` / `.cl-dock` / `.cl-dock-indicator`（底栏玻璃指示器）/ `.cl-panel` / `.glass-card`；full 另含 `.glass-chip`。嵌套玻璃面豁免（外层玻璃内的小面背景非壁纸）；全屏幕布永不折射 |
| 底栏/按钮动效（v1.5.0 移植） | 指示器滑动/按压/速度拉伸 = LiquidBottomTabs + DampedDragAnimation 移植（临界阻尼 spring(1,1000)、欠阻尼 spring(0.6/0.7,250) 到 78/56、速度拉伸除数 10、panelOffset 4dp）；按钮按压 = LiquidButton 律（scale 1+4/48×p + tanh 平移 + 追光白晕） |
| `chushi.fx.mount(id, html)` | 把纯视觉结构（`<style>` / `<svg>`）幂等挂进宿主隐藏容器 `#chushi-fx-root`；同 id 重复挂载为替换。单次 ≤192KB |
| `chushi.fx.unmount(id)` | 摘除一个挂载 |
| `chushi.fx.onResize(cb)` | 订阅玻璃容器几何快照（`cb` 收 `[{fx, key, w, h, radius, x, y, cv}]`，含视口坐标与画布存活标志），返回退订函数 |
| `chushi.fx.onPositions(cb)` | v1.3.0：transform 动画期元素视口位置推送（`[{fx,x,y}]`，rAF 跟踪，变化才推）——折射采样坐标据此与壁纸逐帧对齐 |
| `chushi.fx.attachCanvas(fx)` | v1.3.0：在玻璃元素内创建透明占位画布（z-index:-1，位于背景与内容之下）；返回 `{ok}` |
| `chushi.fx.pushFrame(fx, bitmap, w, h)` | v1.3.0：引擎本地自绘（WebGL/2D 均可）后把 ImageBitmap 交宿主 blit 上屏；宿主只搬运像素不做视觉计算；ImageBitmap 通道跨内核可靠 |
| `chushi.fx.getBackdrop()` | v1.3.0：背景事实数据 `{kind:'photo', scrim, bitmap?}` / `{kind:'glow', base, blobs[]}` / `{kind:'flat', base}` + `vw/vh/dark`；photo 的壁纸位图由宿主代取后转移（沙箱零 CORS/零污染负担） |
| `[data-fx="fxN"]` | 宿主打在白名单玻璃容器（同注册表 + `.glass-chip`）上的稳定标记，预设 CSS 用它触达真实元素 |
| `--fx-mx` / `--fx-my` | 指针在玻璃容器内移动时宿主写在容器上的相对坐标（%），CSS 用 `var()` 做镜面高光 |
| `chushi.settings.define(schema)` | v1.2.0 设置面：预设向设置面板贡献一个分区（≤12 个 slider/toggle/select 控件，schema 整体白名单校验） |
| `chushi.settings.get()` | 读取当前设置值（Promise；宿主按 schema 校验 localStorage 持久化值并补默认值） |
| `chushi.settings.onChange(cb)` | 用户在设置面板改动时回调整组值（热生效），返回退订函数；删除预设即连分区带持久化值一并回收 |
| `chushi.icons.override(map)` | v1.3.0 图标替换：槽位 → 图片（`https:` / `data:image`）白名单，页面在 FxIcon 渲染点替换内置图标；空 map = 清除。槽位契约见开发者文档 |
| `chushi.theme.override({light, dark})` | v1.3.0 主题令牌覆写：亮/暗双域 CSS 令牌（`--ui-accent` / `--background` / `--card` / `--border` / `--ring` 等 28 项白名单），整体拒绝制；删除预设即整组还原 |

安全边界：mount 的 html 只接受 `<style>` / `<svg>` 顶层结构（禁 `script`、事件属性、foreignObject 与外链资源）；全屏幕布（⌘K / 对话框遮罩）永不打标——幕布不是玻璃块；图标覆写只接受 https / data:image（`<img>` 渲染不执行 SVG 内脚本）；主题令牌名与值双白名单。

⚠ **实时渲染律（v1.4.0）**：折射贴图是几何的函数——玻璃几何（含 transform 弹簧）变化时贴图必须随之重建。内建引擎在宿主可见文档 rAF 逐帧追踪：变动期 1/4 分辨率 30fps 重建（折射在线）、稳定 ~160ms 后换半分辨率精贴图、新贴图经 Image 预解码后原子换 href（无空窗帧）。引擎内建前的「沙箱自建引擎」受隐藏文档 rAF 冻结所限只能事后重建贴图，正是「玻璃不实时」的根源。
>
> ⚠ **材质即顺序（链序律）**：`backdrop-filter` 引用 SVG 滤镜时必须 `blur` 在前、`url(#filter)` 在后（先霜化再折射，弯曲锐利）；引擎已内置该律，fx 自写折射时请照抄。需要 Chromium 系浏览器，Firefox / Safari 自动保持普通磨砂。
>
> ⚠ **位图通道律（v1.3.0，自绘引擎适用）**：引擎在沙箱本地画布自绘（`preserveDrawingBuffer` 保证 `createImageBitmap` 可读），位图经 `pushFrame` 交宿主 blit——OffscreenCanvas 直转移在 Chromium 下多次发送后回包不可靠，已废弃；WebGL 不可用时降级纯 CSS 材质（`blur+saturate`）。位置跟踪由宿主 rAF 兜底（ResizeObserver 不触发 transform 动画），引擎按 `onPositions` 更新采样原点重绘。

### 预设包（`.cshz`）与本地文件导入（v1.0.6 起）

「导入预设」除了粘贴 JSON，还支持本地文件与**拖拽导入**（把文件直接拖到导入面板上，v1.2.0 起）：**`.json`**（单文件预设）与 **`.cshz`**（预设包，本质是 zip，按下面结构打包；普通 `.zip` 同样可导入）：

```
my-preset.cshz（zip）
├── manifest.json     必需 —— 预设主体，与粘贴导入完全同一份 JSON 结构
├── assets/           可选 —— 资源目录
│   └── photo.jpg
└── （其余文件一律忽略，如 README.md）
```

- 资源引用：`pages[].html`、`widgets[].html` 与 `animations[].css` 里写 `asset:文件名`，导入时自动替换为内联 data URL，装完无需保留包；
- 护栏：解压后总量 ≤4MB、≤64 个条目；单资源 ≤512KB，仅图片 / 音频 / 视频 / 字体；资源文件名仅限字母、数字、点、下划线、连字符；
- `manifest.json` 复用与粘贴导入完全相同的校验（白名单动作、长度上限、引用完整性），任何一项不合法整体拒绝。


## 快速开始

环境要求：Node.js 18+ 与 [bun](https://bun.sh)（或直接使用 npm）。

```bash
# 安装依赖
bun install        # 或 npm install

# 配置数据库连接（Prisma SQLite，相对路径以 prisma/ 为基准）
echo 'DATABASE_URL="file:../db/custom.db"' > .env
# 仓库已自带空库 db/custom.db；如缺表可执行 bun run db:push

# 开发模式（:3000）
bun run dev        # 或 npm run dev

# 生产构建 + 启动
bun run build
bun run start
```

打开 `http://localhost:3000` 即可。起始页功能不依赖数据库；仓库内的 Prisma/shadcn 脚手架保持平台默认配置，未使用的数据表不影响运行。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 15（App Router）+ React 19 |
| 样式 | Tailwind CSS 4 |
| 动效 | framer-motion + 原生 CSS 动画（磨砂玻璃存活原则） |
| 组件 | shadcn/ui（Radix 系列） |
| 数据 | localStorage（偏好/番茄钟）+ IndexedDB（自定义壁纸） |
| 字体 | Geist（经 next/font 自托管，SIL OFL） |
| 图标 | lucide-react（ISC） |

## 图片来源与致谢

本项目的美，一半来自这些摄影师。**代码以 MIT 许可开源，图片不在此列**——所有摄影作品均来自 [Unsplash](https://unsplash.com)，适用 [Unsplash License](https://unsplash.com/license)（免费用于商业与非商业用途，无需逐案授权；唯不可将其汇编为竞争性图库服务或未经修改单独售卖）。

### 随仓库分发的本地壁纸（`public/gallery/`，国风十帧）

以下十张图已本地化存储于本仓库，特此逐张标明出处（编号与 `src/lib/startpage/gallery.ts` 中的 gallery id 一致）：

| gallery id | 名称 | 摄影师 / 机构 | 原片 |
|---|---|---|---|
| `great-wall-sunrise` | 长城映日 | [Johannes Plenio](https://unsplash.com/@jplenio) | [unsplash.com/photos/e7nDDmyZH54](https://unsplash.com/photos/great-wall-of-china-e7nDDmyZH54) |
| `li-river` | 漓江山水 | [Ekaterina Zlotnikova](https://unsplash.com/@katja_zlotnikova) | [unsplash.com/photos/f_jBvzQIgig](https://unsplash.com/photos/lush-green-karst-mountains-flank-a-winding-river-f_jBvzQIgig) |
| `huangshan-peaks` | 黄山云峰 | [Sherry Xu](https://unsplash.com/@sherry_bird) | [unsplash.com/photos/YNximhgXa9k](https://unsplash.com/photos/a-view-of-a-mountain-range-covered-in-fog-YNximhgXa9k) |
| `palace-turret` | 角楼落日 | [Yilei (Jerry) Bao](https://unsplash.com/@yileijerrybao) | [unsplash.com/photos/zbOLCwA9Fq0](https://unsplash.com/photos/brown-concrete-building-near-green-trees-and-lake-during-daytime-zbOLCwA9Fq0) |
| `yulong-river` | 遇龙河畔 | [Joshua Earle](https://unsplash.com/@joshuaearle) | [unsplash.com/photos/EqztQX9btrE](https://unsplash.com/photos/bamboo-raft-EqztQX9btrE) |
| `bamboo-sea` | 竹海幽篁 | [Keisuke Kuribara](https://unsplash.com/@ksukkuri) | [unsplash.com/photos/2CY5P28RdDI](https://unsplash.com/photos/low-angle-photography-of-green-trees-during-daytime-2CY5P28RdDI) |
| `ink-wash-hills` | 墨韵远山 | [Art Institute of Chicago](https://unsplash.com/@artchicago) | [unsplash.com/photos/vjrzHCu0ONk](https://unsplash.com/photos/a-painting-of-a-landscape-with-a-mountain-in-the-background-vjrzHCu0ONk) |
| `ink-pine-cliff` | 松崖云雾 | [The Walters Art Museum](https://unsplash.com/@thewalters) | [unsplash.com/photos/17cN3tYHJrI](https://unsplash.com/photos/traditional-chinese-ink-painting-of-misty-mountains-and-pine-17cN3tYHJrI) |
| `longji-terraces` | 龙脊绿浪 | [Chopsticks on the Loose](https://unsplash.com/@chopsticksontheloose) | [unsplash.com/photos/_75I7lCDgY8](https://unsplash.com/photos/aerial-view-of-green-mountain-during-daytime-_75I7lCDgY8) |
| `misty-terraces` | 云雾梯田 | [Simonetta Pugnaghi](https://unsplash.com/@pugnaghis) | [unsplash.com/photos/JI0aBYrZgkI](https://unsplash.com/photos/beautiful-rice-terraces-winding-up-a-green-mountainside-JI0aBYrZgkI) |

### 运行时热链的图库壁纸（不随仓库分发）

图库其余十四张以 Unsplash CDN 直链热链加载（仓库仅存 URL 字符串，运行时从 Unsplash 官方 CDN 取图），出处以 CDN 文件地址标明：

| gallery id | 名称 | CDN 出处 |
|---|---|---|
| `mist-lake` | 晨雾湖山 | [photo-1470071459604-3b5ec3a7fe05](https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05) |
| `lake-glow` | 湖光斜阳 | [photo-1501785888041-af3ef285b470](https://images.unsplash.com/photo-1501785888041-af3ef285b470) |
| `turquoise-canoe` | 青湖独舟 | [photo-1476514525535-07fb3b4ae5f1](https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1) |
| `green-cliff` | 崖壁青峦 | [photo-1506744038136-46273834b3fb](https://images.unsplash.com/photo-1506744038136-46273834b3fb) |
| `ridge-clouds` | 云海山脊 | [photo-1464822759023-fed622ff2c3b](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b) |
| `sunbeam-ridge` | 山间光柱 | [photo-1469474968028-56623f02e42e](https://images.unsplash.com/photo-1469474968028-56623f02e42e) |
| `forest-path` | 林间幽径 | [photo-1441974231531-c6227db76b6e](https://images.unsplash.com/photo-1441974231531-c6227db76b6e) |
| `pine-mist` | 雾雪松林 | [photo-1418065460487-3e41a6c84dc5](https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5) |
| `golden-field` | 暮野流金 | [photo-1472214103451-9374bd1c798e](https://images.unsplash.com/photo-1472214103451-9374bd1c798e) |
| `coast-dusk` | 海岸暮色 | [photo-1507525428034-b723cf961d3e](https://images.unsplash.com/photo-1507525428034-b723cf961d3e) |
| `ember-dusk` | 烬色黄昏 | [photo-1508739773434-c26b3d09e071](https://images.unsplash.com/photo-1508739773434-c26b3d09e071) |
| `snow-night` | 雪夜星野 | [Benjamin Voros](https://unsplash.com/@benjaminvoros) · [photo-1519681393784-d120267933ba](https://images.unsplash.com/photo-1519681393784-d120267933ba) |
| `galaxy-vault` | 星河天穹 | [photo-1462331940025-496dfbfc7564](https://images.unsplash.com/photo-1462331940025-496dfbfc7564) |
| `city-light` | 城市夜航 | [photo-1477959858617-67f85cf4f1df](https://images.unsplash.com/photo-1477959858617-67f85cf4f1df) |

### 其他资产

- **logo.svg / start.svg**：本项目原创，随 MIT 许可分发
- **快捷服务 favicon**：运行时从 DuckDuckGo 图标服务加载，仓库不含图标文件
- **Geist 字体**：Vercel，SIL Open Font License，经 `next/font` 自托管

> 若您是上述图片的权利人并希望调整署名方式或移除图片，请提 Issue，我们会在第一时间处理。

## 项目结构

```
src/
├── app/                    # 页面入口（单页起始页）
├── components/startpage/   # 时钟/搜索/Dock/面板/禅模式等组件
└── lib/startpage/          # 图库、搜索引擎、农历、天气、亮度采样等纯逻辑
public/gallery/             # 本地化壁纸（全图 + 缩略图）
docs/                       # README 预览图
```

## 贡献者

| 贡献者 | 角色 |
|---|---|
| **Super Z**（AI 智能体 · [Z.ai](https://z.ai) GLM） | 界面与动效设计、工程实现、发布工程、文档 |
| **[LXgssy](https://github.com/LXgssy)** | 产品发起人、需求定义、验收 |
| **DeepSeek**（AI 智能体 · deepseek-v4-flash） | 档案补全与发布工程 |

后续版本迭代由 Super Z 以作者身份提交署名。

## 许可证

- **源代码**：[MIT License](./LICENSE)
- **摄影图片**：各自适用 [Unsplash License](https://unsplash.com/license)，与代码许可相互独立
- **字体与图标**：SIL OFL / ISC（详见上文）

---

*初始 · 每一次新标签页，都是一次重新开始。*
