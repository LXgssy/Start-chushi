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
- **预设**：声明式 JSON 预设，可给指令面板注册新命令、给底部栏加自定义按钮、批量导入磁贴，甚至**向设置面板贡献自己的调节项**（v1.2.0 设置面作用面，滑杆/开关/分段选择，改动热生效）；进阶玩法还可在预设里携带**沙箱 JS 脚本**（唯一源隔离，拿不到页面数据），写自己的数据源与通知机器人；**图标替换 / 主题令牌 / 动效语言 / 时钟格式**四个焕新作用面（v1.7.0），配合 `chushi.material` **通用换材质接口**（v1.7.0）——宿主不内建任何具体材质，亚克力、Mica、液态玻璃等风格全部由预设自行实现；支持粘贴、本地文件与**拖拽文件导入**；官方**图形化预设开发工具**（v1.7.0，单文件离线应用，导入面板一键下载）无需手写 JSON；一段 JSON 复制给朋友，导入即用
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
> v1.2.0 起，液态玻璃对齐 Apple 物理透镜观感并开放热调：①折射重写为「SDF 梯度方向 + 外绕边缘窄带 + 滤镜域外扩」，边缘环带显示被压缩进来的玻璃外世界（纸镇/鱼缸效应），不再向中心歪折；②新增 **chushi.settings 设置面作用面**——预设脚本可向设置面板贡献自己的调节项，官方液态玻璃预设的折射强度/边缘带宽/霜化/饱和/透亮/边缘色散/镜面高光均可热调并持久化；③根治「面板开合动画期间液态玻璃闪动」（布局尺寸连续变化期自动退化为纯磨砂，稳定后重建贴图）；④导入预设支持拖拽文件；⑤右键菜单项与开发者文档分区开/关均增加级联模糊过场。

> v1.8.0 起（**SMTC 系统媒体换线批，推翻网易云插件路线**）：音乐接入整体改为直连 **Windows 系统媒体会话（SMTC）**——不再需要任何网易云插件（BetterNCM 插件 / CDP 独立桥全部退役并从仓库移除）：①新增**「初始SMTC桥」**（`bridge/smtc/`，PowerShell + WinRT **零依赖**脚本，双击即用、可选开机自启）：本机 127.0.0.1:20754 暴露 `/api/state /api/cover /api/control`，请求驱动轮询（CPU 近零），优先跟随网易云、无网易云时跟随「正在播放」的任何应用；②宿主新增 **SMTC 媒体作用面**：`chushi.smtc.get/control/subscribe`（沙箱脚本与角落小部件两通道同款 API），1s 轮询 + 本地时钟插值 + 关键签名变化才广播（position 由消费方插值）；③**官方「初始 · SMTC 音乐」预设包**（v1.8.1 起为 `examples/初始SMTC音乐预设.cshz` 包形态，UI 与默认封面资源打包在内）：右下角双形态音乐磁贴（紧凑条 ⇄ 展开大卡，封面呼吸光晕 / 切歌上浮 / 进度插值 / 可拖 seek）+ ⌘K 四条媒体命令；内置 MusicPanel 与 dock「音乐」面板按钮已随插件路线一并移除；④修复「关闭面板时快速点开另一个功能，选框重播打开动画」——450ms 切换窗口内改播 layoutId 切换滑移；⑤修复「删磁贴两排变一排时页面抖动」——Windows 经典滚动条出现/消失改变布局宽度（±15px 整页水平瞬跳），`html{scrollbar-gutter:stable}` 槽位常驻根治。
>
> v1.8.1 起（SMTC 预设包修订）：①预设包改以 **.cshz 包**发布（`examples/初始SMTC音乐预设.cshz`，`manifest.json + assets/cover.svg`——磁贴 UI 与默认唱片资源全部打包，导入时按 `asset:` 引用内联），不再提供单 JSON 形态（`asset:` 引用只在包导入时解析）；②音乐磁贴展开卡 UI **复刻 v1.7.x dock 音乐面板**：96px 大封面 + 播放态 accent 光晕/微缩放/绿点、标题/歌手/专辑三级信息、细进度条 + 常显白 thumb、居中圆形控制排 + accent 主键、底部「已连接 · 来源应用」状态行，紧凑条/空态同语言；③修复桥启动器 .bat 在中文 Windows 下的乱码假命令（UTF-8 + `chcp 65001` 触发 cmd 重读错位）——.bat 改按 ANSI/GBK 编码发布并移除 chcp，桥主脚本更名 `ChuShi-SMTC-Bridge.ps1` 并强制 UTF-8 BOM（v1.1.0）；④磁贴修复「首次从空态切紧凑条时播放态类被 className 整写抹掉」（setMode 先于 playIcons）。

> v1.7.4 起（删除磁贴抖动修复批）：①**修复「删除快捷服务时整页布局抖动」**——两个根因叠加：行数计算漏算了常驻的「添加」磁贴（6 磁贴实际占 7 槽仍两排却被误判单排，主列 padding 误上移，下一删网格塌回单排又回落，一上一下瞬跳）；跨排增删时网格容器高度瞬跳、justify-center 的整列内容（时钟/搜索）随之瞬移。现行数计入添加位 + main 的 padding 换挡挂 500ms 过渡 + 磁贴网格改用弹簧高度形变盒（与 Dock 面板同套 morph 律）——增删磁贴整列平滑滑移，不再有任何瞬跳；顺带修正：5 磁贴及以下才是真正的单排上移态（与网格实际排数始终一致）。
>
> v1.7.5–v1.7.8（**网易云音乐插件路线，已于 v1.8.0 退役**）：Dock「音乐」面板 + BetterNCM 插件 / CDP 独立桥架构，历经插件 1.3.0 控制链路修复、v1.7.8 端口自动发现。该路线需侵入网易云进程且随内核升级失效，v1.8.0 起由 SMTC 系统媒体路线整体替代，相关代码已从仓库移除（git 历史可考），历史 Release 资产不再维护。
>
> v1.7.5 起（**网易云音乐接入批**）：Dock 新增**「音乐」面板**——在网易云音乐装上 chromatic（BetterNCMII）插件管理器与配套发布的**「初始音乐桥」插件**后，初始可实时显示正在播放的歌曲（封面/歌名/歌手/进度）并遥控播放（播放/暂停/上下曲/seek/音量）。桥为双组件架构：插件 JS 读网易云 dva store 与原生播放事件、把快照原子写入数据目录；`bridge.dll`（BetterNCMII 原生插件通道）在网易云进程内起一个**仅绑定 127.0.0.1** 的本地 HTTP 服务（Origin 白名单，防任意网页窥探）。初始侧每秒轮询 + 本地时钟插值，断连自动回落指引态。不使用音乐面板则完全无感——面板仅在打开时才发起连接。
>
> v1.7.7 起（**音乐桥 1.3.0 控制链路修复 + 音乐面板翻新批**）：①**修复「网页上无法控制网易云音乐」的根因**——bridge.dll 1.2.0 及之前把控制命令文件误写到 `chushi-music\` 根目录（少拼 `\cmd` 子目录），而插件 JS 只轮询 `cmd\` 子目录，命令永远不被执行（接口却返回成功）；1.3.0 修正落盘路径，插件侧兼扫根目录残留并启动清扫（旧 DLL 不升级也能控）；插件侧控制命令执行后 420ms 校验实际效果，未生效时直接驱动媒体元素兜底；②state.json 增加 5s 强制心跳——暂停不再零写盘，`/api/debug` 的 stateAgeMs 恒小于 5 秒成为「桥活着」的可靠信号；③**音乐面板翻新**：大封面 + 播放态光晕、专辑信息行、新增**诊断卡**（桥版本 / 三源状态 / 状态文件年龄一目了然 + 一键复制诊断 JSON 回传排障 + 状态陈旧自解释升级提示）；接入指引改回 BetterNCM 插件路线主推（与官方插件商店同构的 `.plugin` 包），独立版 ChuShiBridge 继续作为兜底。
>
> v1.7.6 起（**桥接独立版批**）：**摆脱 BetterNCM 框架依赖**——BetterNCM（chromatic）已停更于网易云（作者弃坑、chromatic 2.0 无二进制发布，最后一版 1.3.4 无法适配新客户端），「初始音乐桥」升级为**独立版 ChuShiBridge**：一键安装包内置 `ChuShiBridge.exe`（以 **CEF 调试端口**替代 CEF 内部 hook——不 hook 网易云任何内部函数，**不随网易云升级而失效**，理论支持所有 CEF 架构的网易云 3.x）+ `msimg32.dll` 装载器（BetterNCM 同款劫持位但只做 PEB 命令行追加，保证用户双击网易云原图标也能开启桥接）+ 安装/卸载脚本；双击安装 → 网易云自动重启 → 音乐面板即连。API 与 v1.7.5 插件版**完全同契约**（初始侧 10754 客户端零改动），新增 `/api/debug` 排障端点与 `%LOCALAPPDATA%\ChuShiBridge\bridge.log` 日志；音乐面板指引同步改为三步接入（下载安装包 → 双击安装 → 重试连接）。
>
> v1.7.3 起（壁纸视频修复批）：①**修复「导入视频后壁纸没反应」**——根因是浏览器解不出该视频编码（如 HEVC/H.265，Chrome/Edge 默认不支持）：此前静默入库后 `<video>` 永不 canplay，壁纸永远黑屏且无任何提示；现在导入视频（本地/直链）前会先做**可解码性探测**，解不出时明确提示「请转码为 H.264 的 MP4」，不再无声失败；②**修复「custom 模式下重复导入壁纸不刷新」**——新增设置字段 wallpaperRev 导入版本号，每次导入自增并强制渲染端重读壁纸源（此前 photoId/wallpaperUrl 均不变导致 effect 不重跑，壁纸停在旧画面）；③视频直链 URL 导入同样先探测（链路失效/编码不支持即拒），重复导入同一 URL 也会强制刷新。
>
> v1.7.2 起（体验与一致性批）：①**掠影自定义壁纸支持 GIF 与视频**：本地上传 GIF 原样保存（不再被降采样抽成静帧），视频（mp4/webm 等）静音循环播放，视频/GIF 自动免用 kenburns 镜头推移（自身已动，不再叠加）；新增**直链 URL 导入**——图片/视频远程直链（含视频 URL）粘贴即用，仅存 URL 零下载持久化，与本地上传互斥；②搜索建议鼠标悬停选中后**移出列表即取消高亮**（不再残留、回车不再误发旧项）；③磁贴单排时主列整体上移（与双排时的自然重心对齐，窄屏不受影响）；④**扩展版时钟字体与网页版完全一致**：根因是扩展新标签页有一条 UA 注入的未分层 body 字体规则压过了官方字体栈，现以未分层高特异性规则锚回 Geist——字重恢复超细，小时与分钟间的自绘冒号也随字体基准回归居中；⑤导入预设面板的拖拽提示/错误列表高度形变与按钮组下移改为**同参弹簧**（与指令面板外壳同一套 460/38 弹簧），形变一体不再脱拍。
>
> v1.7.1 起（体验修缮批）：①图形化开发工具支持**直接导出 `.cshz` 预设包**，并修复表单按钮溢出裁切、帮助弹窗超高不可滚动等显示问题；②tab 栏选框动效三段式：**出现** Q 弹保留、**切换滑移恢复基线手感**（Q 弹滑移交由 playful 动效档——示例预设已含）、**消失**补缩回淡出；③导入预设面板拖拽提示/错误列表改为高度形变推下，按钮组不再瞬移；④PC 端右键菜单新增**批量管理磁贴**；⑤预设 clock 的小时制/秒数改为安装时一次性合入用户设置——修复「预设改了时钟后设置面板怎么调都没效」的逻辑问题。
>
> v1.7.0 起，液态玻璃正式撤下、通用「换材质」登场（v1.3.0–v1.6.0 为液态玻璃试验线，随本版整体移除，相关版本号不再复用）：**液态玻璃无法真正移植到「初始」**——官方「液态玻璃」预设移除，宿主不内建任何具体材质；改为通用材质作用面 `chushi.material.apply / reset`（任何风格由预设脚本自行实现，亚克力 / Mica / 液态玻璃 / Win UI 均可）。同一批新增四个焕新作用面：**icons**（tab 栏六个内建按钮的图标替换）、**tokens**（强调色与选框/分隔线主题令牌覆写）、**motion**（动效语言：standard/playful/calm/instant 弹簧档位 + 入场动画倍率）、**clock**（12/24 小时制、秒数、日期行、问候语模板）；tab 栏选框出现改为 Q 弹回弹（非玻璃材质样式）；官方 **图形化预设开发工具**（单文件离线应用）内嵌应用内，导入预设面板「开发工具」按钮一键下载；官方「焕新示例预设」（`examples/焕新示例预设.json`）一次覆盖材质/内容/排版/动画/图标/令牌/动效/时钟八个维度。

## 右键菜单

在页面任意空白处右键，弹出的不是浏览器默认菜单，而是「初始」专属快捷菜单：指令面板 / 添加链接 / **批量管理磁贴**（v1.7.1，PC 端批量编辑/删除快捷服务的入口：进入磁贴编辑模式后连点编辑、连点 × 删除、拖拽排序，点击空白处退出） / 明暗切换 / 禅模式 / 设置 / 开发者文档 / 导出备份，常用的动作都在指尖最近处。

- 菜单是一块小玻璃卡片，材质类预设可经 fx 作用面触及（视觉与全站同源）；
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
| `icons` | 图标替换：把 tab 栏六个内建按钮（天气/待办/便签/番茄钟/设置/⌘K）换成内置图标名或 base64 图片（≤6 条，v1.7.0 起） |
| `tokens` | 主题令牌覆写：`--ui-accent` / `--pill-seg` / `--pill-seg-ring` / `--pill-line`（键白名单，v1.7.0 起） |
| `motion` | 动效语言：弹簧档位 standard/playful/calm/instant + 入场动画倍率 0.5–2（v1.7.0 起） |
| `clock` | 时钟格式覆写：12/24 小时制、秒数（v1.7.1 起安装时一次性合入用户设置，之后可在设置面板随意调整）、日期行、问候语模板（`{greet}`/`{name}` 占位，声明式覆写，v1.7.0 起） |

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
| `chushi.material.apply({ css, svg? })` | **换材质**（v1.7.0）：把材质 CSS（可带 SVG 滤镜）挂进宿主受控容器，整体换装玻璃观感；重复调用幂等替换，`chushi.material.reset()` 摘除，删除预设即回收 |

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
- **容量**：每预设 ≤3 个脚本，每个 ≤16000 字符，每脚本 ≤12 条命令。

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
| `[data-fx="fxN"]` | 玻璃容器稳定标记（折射类材质预设的触达点，v1.1.3 起） |

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

### 换材质（material 作用面，v1.7.0 起）、视觉效果与设置面

视觉风格**不由宿主内建**：宿主只提供受控的「作用面」，材质的**全部实现代码住在预设包的 `scripts` 里**——安装即生效、删除预设（或脚本被冻结）即整组回收。亚克力、Mica、液态玻璃等任何风格都由预设经这套接口自行实现；官方「焕新示例预设」（`examples/焕新示例预设.json`）演示了 Fluent 亚克力材质的完整写法。最省事的入口是 `chushi.material.apply`（材质 CSS 直接用公开元素钩子）；需要折射贴图、动态高光等高级材质时再下探 `chushi.fx` 高阶接口（canvas 生成 SDF 位移贴图 → SVG `feDisplacementMap` 实时折射 → CSS 叠加高光），并可通过 `chushi.settings` 把折射强度/霜化/色散等调节项贡献进设置面板热调。

| API / 钩子 | 说明 |
|---|---|
| `chushi.material.apply({ css, svg? })` | **换材质（v1.7.0，推荐入口）**：css 包 `<style>`、svg 直传，组包后走 fx 挂载（挂载 id 固定 `material`，重复 apply 幂等替换）；配套 `chushi.material.reset()` |
| `chushi.fx.mount(id, html)` | 把纯视觉结构（`<style>` / `<svg>`）幂等挂进宿主隐藏容器 `#chushi-fx-root`；同 id 重复挂载为替换。单次 ≤192KB |
| `chushi.fx.unmount(id)` | 摘除一个挂载 |
| `chushi.fx.onResize(cb)` | 订阅玻璃容器尺寸快照（`cb` 收 `[{fx, key, w, h, radius}]`），返回退订函数 |
| `[data-fx="fxN"]` | 宿主打在白名单玻璃容器（`.search-pill` / `.cl-dock` / `.cl-panel` / `.glass-card`）上的稳定标记，预设 CSS 用它触达真实元素 |
| `--fx-mx` / `--fx-my` | 指针在玻璃容器内移动时宿主写在容器上的相对坐标（%），CSS 用 `var()` 做镜面高光 |
| `chushi.settings.define(schema)` | v1.2.0 设置面：预设向设置面板贡献一个分区（≤12 个 slider/toggle/select 控件，schema 整体白名单校验） |
| `chushi.settings.get()` | 读取当前设置值（Promise；宿主按 schema 校验 localStorage 持久化值并补默认值） |
| `chushi.settings.onChange(cb)` | 用户在设置面板改动时回调整组值（热生效），返回退订函数；删除预设即连分区带持久化值一并回收 |

安全边界：mount 的 html 只接受 `<style>` / `<svg>` 顶层结构（禁 `script`、事件属性、foreignObject 与外链资源）；全屏幕布（⌘K / 对话框遮罩）永不打标——幕布不是玻璃块。

⚠ **材质即顺序（链序律）**：`backdrop-filter` 引用 SVG 滤镜时必须 `blur` 在前、`url(#filter)` 在后（先霜化再折射，弯曲锐利）；写反了折射会被模糊糊掉。需要 Chromium 系浏览器（`backdrop-filter: url()`），Firefox / Safari 自动保持普通磨砂。

⚠ **布局动画防闪律（v1.2.0）**：玻璃元素在布局尺寸连续变化（面板高度弹簧、窗口拖拽缩放）期间，SVG 位移滤镜会逐帧重栅格化且贴图尺寸滞后错帧，表现为闪动——引擎须在尺寸变动期退化为纯 `blur/saturate`（标准滤镜函数无此病），稳定约 160ms 后再生成贴图换全链。折射类材质都应内置该策略。

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


### 八维焕新示例与图形化开发工具（v1.7.0 起）

官方「焕新示例预设」（`examples/焕新示例预设.json`）一次覆盖预设系统的八个维度：Fluent 亚克力**材质**（`chushi.material.apply`）、快捷磁贴**内容**、时钟缩放与磁贴列数**排版**、磁贴悬停微动**画**、tab 栏**图标**替换、Fluent 蓝**主题令牌**、playful Q 弹**动效语言**、12 小时制与问候模板**时钟格式**——导入即见效，删除即还原，可作为焕新类预设的结构模板。

不想手写 JSON？⌘K →「导入预设」→「**开发工具**」可下载官方**图形化预设开发工具**：单文件离线 HTML 应用（内嵌在应用静态资源里，不依赖任何服务器，断网也能下载使用），表单式编辑全部声明式字段、实时生成 JSON 与完整性提示、内嵌使用说明与上限速查。下载后双击在任意浏览器打开即可，可直接**导出官方 `.cshz` 预设包**（v1.7.1，拖进导入面板即装）。

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
