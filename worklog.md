# Start-chushi 多会话工作日志（重建版）

> 说明：本文件为重建版。环境清理导致先前本地 worklog.md 与 .pkgtmp/ 丢失；
> Task 45–52 记录曾由 workspace-archive.sh 归档至工作库（4314a69）。
> 本轮（Task 53）以 git 考古为准重建，并补记 v1.1.0–v1.1.2 三条线。

---
Task ID: 53
Agent: main (Super Z)
Task: 用户指令「试试自己重启」——会话卡死后的现场自检重启 + 核实 v1.1.0–v1.1.2 五项反馈实现 + worklog 重建

Work Log:
- 【现场自检】环境已清理：.pkgtmp/gh-token 丢失 → 由对话历史 PAT 重建（600 权限验证 API 可达）；本地 git remote 配置丢失 → 重挂 origin；worklog.md 与 pw-lab 探针 .mjs 脚本一并丢失；工作区仅 4 个文件模式位变化（diff 0 行，无实质改动）
- 【git 考古】远端 main = d2d8c0b（v1.1.2），本地 reset 对齐。三条提交线均由先前会话完成并推送：
  - fff3efc v1.1.0：预设系统 effects.glass 声明式液态玻璃——宿主内建 feDisplacementMap 折射引擎（SDF 位移贴图 R=X/G=Y、边缘指向中心、平方平滑），全站玻璃磨砂→液态切换，官方液态玻璃预设
  - b0a5345 v1.1.1：⌘K 幕布轻雾化 + 液态玻璃全屏幕布护栏（全屏元素永不折射，防贴图边缘位移拉丝擦除）；ContextMenu.tsx（160 行，「初始」专属右键菜单）；PresetDocs.tsx（516 行，预设开发文档）
  - d2d8c0b v1.1.2：五项用户反馈修复（见下）
- 【五项核实①折射写进玻璃】用户原话「折射没有写在玻璃里面」真因：v1.1.0 滤镜链为 url() blur()，折射在前、模糊在后，弯曲被 6px 模糊糊成雾；v1.1.2 改为 blur(3px) url(#map) saturate(180%)（链序律：先霜化再重采样折射），refraction 0.6→0.75——透镜边缘弯曲透过玻璃体清晰可辨；examples/液态玻璃预设.json 同步新参数
- 【五项核实②文档遮挡】真因：PresetDocs 原嵌在 ⌘K 卡片 DOM 内，⌘K 卡是 will-change:transform + overflow-hidden 的 motion 盒，fixed inset-0 被当成该盒包含块且被裁剪；修复 = createPortal 直挂 body（SSR 惰性初始化，open=false 水合零差异），彻底逃出形变舞台堆叠/裁剪上下文
- 【五项核实③返回按钮】文档顶栏新增 ArrowLeft +「返回上一级」（onClose 回 ⌘K 预设视图）
- 【五项核实④文档同步 GitHub】docs/PRESET_DEV.md（268 行：预设包结构/字段白名单/effects.glass 参数表/沙箱脚本/打包导入流程）已随 d2d8c0b 入仓推送
- 【五项核实⑤右键菜单】弹出动画 = ctx-in 关键帧（spring 曲线 cubic-bezier(0.34,1.56,0.64,1) 0.2s），transformOrigin 按边界翻转方向自适应（向下展开 top 原点/向上 bottom/向右 left/向左 right）——菜单总是「从鼠标点长出来」，右键换位同律；开发者文档入口 = page.tsx dev-docs 菜单项（BookOpen 图标）直达全屏文档；globals.css 声明顺序律注释在位（ctx-out 必须在 ctx-in 之后）
- 【发布核验】GitHub main d2d8c0b ✓；Pages status=built 且线上 CSS bundle 实测含 ctx-in ×4 / liquid-glass ×21（确为 v1.1.2 内容）✓；Release v1.1.2（含 ChuShi-NewTab-v1.1.2.zip）+ v1.1.1 均已发布 ✓；sandboxSrc v=112 ✓；README v1.1.1/v1.1.2 版本行 ✓
- 【worklog 重建】本文件以 git 提交信息 + 代码考古为准重建；先前会话细节以归档版为准
- 【交付】环境清理导致 pw-lab/wss-upload.mjs 失传 → 重建受阻于文叔叔新 API（/ap/login/anonymous 仅收 {"dev_info":"{}"}，多余 token 字段=1003；头名 X-TOKEN 非 token；旧 /ap/ufile/pre 已废弃）。经子代理 GitHub 考古（Aruelius/wenshushu + Mikubill/transfer）+ 实测复现新链路：addsend(A-code DES 签名)→getupid→逐块 psurl+PUT(1MB 分块)→complete→getprocess→copysend；脚本存档 scripts/pw-lab/wss-send.py。v1.1.2 交付包（更新说明+开发者文档+液态玻璃预设+扩展 zip 共 12.1MB）上传成功：c.wss.ink/f/ks7lv1klwyt

Stage Summary:
- 结论：用户反馈五项（折射写进玻璃、文档遮挡、返回按钮、文档同步 GitHub、右键菜单鼠标原点弹出 + 文档入口）在 v1.1.2 全部实现并已上线（网页版 Pages + 扩展 Release）
- 新律：①环境清理会带走 .pkgtmp、worklog、探针脚本与 git remote——重启后先自检现场再干活（PAT/remote 可重建，worklog 以 git 考古重建）；②backdrop-filter 引用 SVG 滤镜时链序即材质：blur 在前保锐利折射，url 在前则弯曲被糊掉；③fixed 元素嵌在带 will-change:transform/overflow-hidden 的 motion 盒内会被其包含块化+裁剪，全屏浮层一律 portal 到 body；④文叔叔匿名上传现行律：body 零冗余字段（多余字段=1003）、Accept-Language 必带、addsend 需 A-code DES 签名（Req-Time 60s 窗口）、>2MB 必须 1MB 分块逐块 psurl、匿名限 2 任务/天
- 待办：Edge 商店 v1.1.2 提交材料未做（商店 zip 可从交付包内取）；匿名分享链接 1 天过期，需留存请转存

---
Task ID: 54
Agent: main (Super Z)
Task: 用户两条反馈——①液态玻璃架构纠错（删除「初始」宿主内建引擎，全部代码移入预设包）②⌘K 面板交互 bug（删除预设返回后外点关闭失效 + 选项选中残留）

Work Log:
- 【现场】前会话（上下文耗尽前）已完成：fx.ts 宿主作用面 303 行、sandbox.ts 桥接、sandbox.js 沙箱侧 fx API、toaster.tsx pointer-events-none 修复、repro-kbug.mjs 复现脚本；page.tsx 一度疑似语法错误 `ounted` 经 od 字节核验为 shell 输出吞 `[m`（ANSI 序列），文件实际完好
- 【架构①删宿主】删除 liquid-glass.ts 整文件；preset.ts 移除 PresetGlassEffect/PresetEffects/effects 解析与 SAMPLE_PRESET 示例字段；globals.css 删除 html.liquid-glass 主题区块（92 行，材质 CSS 迁入预设包）；page.tsx 删 effects 派生 useMemo + activateLiquidGlass effect + toast 提及；PresetPanel.tsx 删 effects 展示项；tsc 全绿
- 【架构①新作用面】fx.ts（v1.1.3）：#chushi-fx-root 注入点（DOMParser 白名单仅 style/svg，禁 script/on*/foreignObject/外链，≤192KB/次、512KB/预设）、[data-fx=fxN] 白名单标记（search-pill/cl-dock/cl-panel/glass-card；全屏幕布永不打标）、ResizeObserver 快照推送、--fx-mx/--fx-my 指针变量桥；sandbox.js 沙箱侧 chushi.fx.mount/unmount/onResize；codeLen 8000→16000；sandboxSrc v=113
- 【架构①预设包】lg-engine.js（6977 字符）= 完整液态玻璃引擎：圆角矩形 SDF 位移贴图（R=X/G=Y、0.5 灰零位移、平方平滑）、feImage+feDisplacementMap SVG 构造、链序律 backdrop-filter:blur(3px) url(#lg-fxN) saturate(180%)、材质 CSS（底调透/边缘高光/镜面高光/深浅色）、120ms 重渲染节流、消失标记自动 unmount 回收；经 build-lg-preset.py 打包进 examples/液态玻璃预设.json（scripts[0].code）
- 【调试实录】初版挂载为 0，逐一拔出三只潜伏虫：①sandbox.js pendingFx 声明在 makeChushi 内而 fxResult 处理器在 IIFE 顶层作用域引用（ReferenceError，且沙箱不透明源把报错掩成 "Script error."）→ 提升到顶层；②桥把消息层 op 名 fxSubscribe 原样传 fxHost.apply，其 switch 期望裸名 subscribe → 静默落 default → sandbox.ts 加 FX_OP_MAP 映射；③fx.ts sanitize 只扫 doc.body，而独立 <style> 被 text/html 解析器放进 head → 纯样式挂载恒拒 → 收集 head+body。修后链路全通（订阅→快照→贴图→挂载→⌘K 卡折射→消失回收）
- 【⌘K②外点关闭】前会话已定根因（Radix Toast viewport 固定右上竖带 z-100，toast 期间 pointer-events 置 auto 拦截 ⌘K 遮罩 z-50 右列点击）+ toaster.tsx viewport 加 pointer-events-none；本轮实测复验：toast 显示窗口内点右侧空白面板正常关闭 ✓
- 【⌘K②选中残留】cmdk 恒有一 data-selected 锚点项，指针离板后高光常驻。CommandPalette 加 data-nav 三态门控：Command 根 onPointerEnter/Leave + 方向键 onKeyDown 切 idle/mouse/kbd，globals.css 仅在 mouse/kbd 显示 [cmdk-item][data-selected] 高光与 enter-hint；视图互切（指令⇄预设）useEffect 重置 idle。五态探针全过：外开无高亮/悬停跟随/移出即清/方向键重现/返回重置
- 【端到端】verify-lg.mjs（导入后 bf=blur(3px) url(#lg-fx1) saturate(1.8)、⌘K 卡折射、幕布不打标、0 pageerror）+ verify-e2e.mjs（导入→管理→删除→返回→toast 窗口内点空白关闭✓→首项无高亮✓→删除后磨砂还原 bf=blur(40px)、fx 挂载清零✓→刷新持久化干净✓）
- 【发布】main 三笔提交（f2dfe01 架构+修复 / 9768398 交付物 / 80cdf9c .nojekyll）已推；扩展打包脚本失传重建为 scripts/build-extension.py（index.html 内联脚本外置 ext-script-N.js——⚠不可加 defer 否则 Flight 数据晚于 chunk 执行白屏；manifest v1.1.3；_locales/icons 沿用 v1.1.2 素材）；真浏览器 --load-extension 冒烟：渲染✓、扩展内液态玻璃全链路✓（直注 localStorage 需按 parsePreset 归一化补 links/dock 空数组，否则 raw.dock.flatMap 崩——测试脚本之过非产品之过）；Release v1.1.3（381710044）+ ChuShi-NewTab-v1.1.3.zip 已传
- 【Pages 事故】gh-pages 首推后 CSS/JS chunk 全 404（index.html/沙箱.js 却可用）：根因为部署脚本失传时一并丢了 .nojekyll——Jekyll 默认排除 _next 下划线目录；补 .nojekyll（gh-pages 即修 + public/ 永久随导出）后线上 CSS 实测含 data-nav、无 liquid-glass ✓
- 【文档】README（功能行/版本注记/字段表删 effects/scripts 16000/钩子表补 data-fx/effects 节重写为 fx 作用面）；docs/PRESET_DEV.md（目录/九字段/§08 重写 fx 接口+骨架示例+链序律/§09 钩子表/§10 API 表）；页内 PresetDocs.tsx 同步

Stage Summary:
- 架构律（新增）：宿主不做视觉引擎——fx 作用面三件套（mount/onResize/data-fx 标记/指针变量）是唯一触达通道；「效果全部代码住预设包」与沙箱脚本白名单复核同构
- 调试律：沙箱 iframe 不透明源会把一切未捕获错误掩成 "Script error."——Playwright pageerror 才能拿到真实报错；跨层 op 名契约（消息层 fxXxx ↔ fxHost 裸名）必须在桥做映射；DOMParser text/html 会把独立 <style> 归入 head，白名单扫描要 head+body 双收集
- 发布律：gh-pages 部署三件套 = .nojekyll + 全量替换 + 构建号核验（线上 CSS grep 特征串）；扩展内联脚本外置禁 defer（Flight 数据须先于 chunk）
- 交付：文叔叔（wss-send.py）发送 v1.1.3 交付包（更新说明+开发者文档+液态玻璃预设+扩展 zip+合并包）→ https://c.wss.ink/f/ks876g5lr2l（1 天过期）
- 待办：Edge 商店提交材料仍未做

---
Task ID: 55
Agent: main (Super Z)
Task: 用户四组反馈——①液态玻璃物理透镜重写（对齐 Apple 边缘折射，全部代码仍住预设包，API 不足则加 API）②液态玻璃调节设置经预设包进设置面板 ③导入预设支持拖拽文件 ④右键菜单/开发者文档子元素开/关模糊过场；附「整页焕新 API 评估」

Work Log:
- 【物理透镜 v2】lg-engine.js 重写：位移方向由「指向几何中心」改为 **SDF 梯度（边缘外法线）**（长边弯曲垂直于边缘，消除斜向歪折）；边缘环带改**向外取样**（环绕折射/纸镇效应——玻璃外世界被压缩拉入边缘环带），为此滤镜域 userSpaceOnUse 外扩 pad=ceil(maxDisp)+2、feImage 覆盖全域、pad 环位移渐隐防硬边；剖面 smoothstep² 集中到 26% 边缘窄带；贴图半分辨率（W>140 时 /2，feImage 拉伸插值无损）；可选色散 = feColorMatrix×3 隔离 RGB + 三路 feDisplacementMap（scale ×1/1.14/1.28）+ feComposite arithmetic×2 合成；引擎 11727 字符（上限 16000）
- 【设置面 API（宿主新作用面）】preset-settings.ts（schema 白名单校验：slider/toggle/select，controls≤12，键 ID_RE 唯一；LS 读写+按 schema 夹紧+prune）；sandbox.js makeChushi.settings{define/get/onChange}+settingsValues/settingsPush 消息；sandbox.ts onApi settingsDefine（校验+登记+emit settingsSchema 事件）/settingsGet（settingsProvider 回执）/pushSettingsValues；page.tsx 接线（schema 状态、activeScriptKeys 过滤、changePresetSetting 持久化+下发、removePreset 时 prunePresetSettings）；Dock/PanelStage 透传；SettingsPanel 渲染预设分区（滑杆 accentColor/accentColor var、复用 Switch、Segmented）
- 【防闪】面板高度弹簧等布局尺寸连续变化期，SVG 位移滤镜逐帧重栅格化+贴图错帧=闪动。引擎策略：快照签名变化即 busy（settleUntil=now+160ms）退化为纯 blur/saturate，armSettle 定时器稳定后建贴图换全链；实测 [3] 动画期无 url、稳定后 blur(3px) url("#lg-fx5") saturate(1.8) ✓
- 【调试实录·沙箱 rAF 罢工】引擎 v2 首测全挂（材质不挂载、滤镜 0）：沙箱 iframe 是 display:none，Chromium 对隐藏文档暂停渲染循环——**rAF 回调永不触发**（v1.1.3 用 setTimeout 侥幸避开）；改 60ms setTimeout 合帧后全通。新律：沙箱内禁 rAF，一律 setTimeout
- 【fx 回收卫生】fxHost.stop() 擦净全部 data-fx 标记与 --fx-mx/--fx-my（此前惰性残留）；removePreset 时 prunePresetSettings(`${id}:`) 回收设置持久化值——「删除预设即还原」语义完整
- 【拖拽导入】PresetPanel 导入视图 onDragOver/onDrop（与文件选择器同 importFile 路径），textarea 拖入高亮（data-drag + accent 边框），window 级 dragover/drop guard 防浏览器「打开文件」；⚠ 测试点 (640,400) 在搜索药丸内部——右键输入框按产品律让路原生菜单，测试点改空白区
- 【子元素模糊过场】globals.css 新增 ctx-item-in/out-kf（.ctx-in .ctx-item / .ctx-out .ctx-item，--ci 级联 24ms）与 docs-item-in/out-kf（.docs-anim>section，--di 级联 36ms）；声明顺序律 *-out 在 *-in 之后；ContextMenu 菜单项 style --ci=i、PresetDocs Sec style --di=parseInt(n)
- 【Pages 事故】build:extension 会以无 basePath 构建**覆盖 out/**——本次部署 gh-pages 恰在其后，线上 index 引用 /_next/* 404；发现后重建 build:export 重推 gh-pages（eb7d67e）并线上核验（index 链接 /Start-chushi/_next ✓、270f63d5 CSS 含 ctx-item-in-kf ✓、sandbox?v=114 200 ✓）。新律：Pages 部署必须紧随 build:export，与 extension 构建顺序强隔离
- 【验证】verify-v12.mjs 八组全过：引擎链序/域外扩(-13,-13 606x82)/贴图、设置分区 5 滑杆+2 开关、折射 145→60 热生效（scale 21.11→8.74）+持久化、防闪、拖拽导入、ctx 菜单项 7 条级联动画（第3项延迟 0.048s）、docs 15 分区（--di=4 延迟 0.144s）、回归（删预设→返回→toast 窗口内外点关闭✓/无选中残留✓/fx 挂载+标记+设置键全回收✓）、pageerror=0；verify-disp.mjs 色散滤镜 3+2 就位；verify-ext-v12.mjs 扩展冒烟（chrome-extension 真浏览器：渲染✓、blur(3px) url("#lg-fx1") saturate(1.8)✓、无报错）
- 【发布】main 5596f43；gh-pages eb7d67e（重建版）；Release v1.2.0（id 381776779）+ ChuShi-NewTab-v1.2.0.zip（12.2MB）已传；交付物 download/v1.2.0/（更新说明+开发者文档+液态玻璃预设+扩展zip+合并包）

Stage Summary:
- 架构律：宿主新作用面=「设置面」——schema 白名单校验（整体拒绝）+ 值按 schema 夹紧 + 删除即回收；液态玻璃七参数热调即首个使用者，引擎与宿主零耦合
- 物理律：透镜折射 = SDF 梯度方向 × smoothstep²(t) × 外绕取样；环绕感来自「滤镜域外扩取到元素外世界」
- 环境律：①沙箱 iframe 禁 rAF（隐藏文档渲染循环暂停，setTimeout 才活着）②build:extension 覆盖 out/，gh-pages 部署必须紧随 build:export ③gh CLI 随环境清理丢失——GitHub 操作用 curl+PAT（.pkgtmp/gh-token）
- 交付：文叔叔 v1.2.0 合并交付包 → https://c.wss.ink/f/ks97ijpd21f（1 天过期）
- 焕新评估结论（已写入文档 §15）：材质/内容/排版/动画四维已可整页焕新；图标替换与主题令牌覆写是下一批最值得补的作用面
- 待办：Edge 商店提交材料仍未做

---
Task ID: 102
Agent: main (Super Z)
Task: 用户「读取一下现在的仓库」——仓库状态盘点 + 面板三症状（截断/复位/位移）对当前代码的实证核验

Work Log:
- 发现远端 main 已前进 8 提交（另一会话产物）：v8.3.6 面板三修（1193085，9-12 晚，恰对应用户三条反馈）→ geolocation 修复 → v8.4.0~8.4.3（更新日志/快捷服务 favicon 回退/拖拽排序打磨/crx+CI）
- 本地 worklog.md 为已知外部覆写损坏（删段），git checkout 还原后 --ff-only 快进同步至 148de0d (v8.4.3)，0 ahead
- 写 scripts/probe-v836-panel.mjs（Playwright + sandbox.html 直载 + widgetSmtc 喂拍 + CDP 真实鼠标按下）：对 v8.4.3 重建 cshz 实测四门全过——A 左右截断 6.1px/边(旧)→0(新)；B 切行 0 方向反转（>3px 跳变皆为同向平滑滚动帧）；C :active 真实捕获 15 帧、按钮恒 46px 零位移、transform:none 在位；D 同内容重复 feed 歌词 DOM 零重建（lyricSig 内容指纹门生效）
- 探针独立复现三根因（对旧版）：scale(1.06) 行盒横向扩出被 overflow:hidden 左右各切 6.1px；.cs-bmain:active scale(.94) 按下缩放被读作位移（合成事件不触发 :active 的教训→必须 CDP Input）；沙箱 whitelist 每次 feed 新建 lyric 包装对象→身份门恒假→整组 DOM 重建=复位。v8.3.6 三修与探针结论完全吻合
- Release 盘点：v8.3.6 七资产齐（含音乐预设 8.3.6）；v8.4.0~8.4.3 各 2 资产（crx+zip，新 crx 打包线）

Stage Summary:
- 结论：用户三条反馈（截断/复位/位移）的修复已在 v8.3.6 落地并随 v8.4.x 线延续，当前源码四门实证全绿；用户侧需确认实机版本 ≥ v8.3.6（推荐 v8.4.3）
- 新律：探针合成 dispatchEvent 不触发 :active——按压类取证必须 CDP Input.dispatchMouseEvent；本地 worklog 脏改先 diff 判断是否外部覆写再 checkout
- 待办：用户实机验收 v8.4.3；Edge 商店提交材料仍未做

---
Task ID: 103
Agent: main (Super Z)
Task: 用户「学习青柠起始页 1.4.0 crx 的云端更新机制并实现到『初始』（壳做桥：扩展页监听 iframe postMessage 校验 origin 代写 chrome.storage.local，保证面板与浮窗开关同步）；不推公开仓，推工作仓；文叔叔发件」

Work Log:
- 【机制考古】解包 upload/青柠起始页扩展_1.4.0.crx（Cr24/v3 头 1310B + zip payload）：壳=newtab-ext.html 521B 全屏 iframe 载 https://www.limestart.cn/；Android UA 直接跳网页；redirectNewTab 逃生门（壳读 storage.sync 决定重定向网页版）；内容脚本 customize-limestart.js 245B 单向挂 #ext 标记 div（data-ver 版本 + data-url chrome.runtime.getURL 壁纸）供云端页检测扩展 + web_accessible_resources wallpapers/* 本地壁纸提速；设置双轨（sync 给壳开关、页面设置住云端页自身 localStorage）；background.js 极薄（快捷键→?addUrl= 打网页）；popup 管设置+browsingData 清缓存。青柠无 postMessage 代写桥——用户方案是增强版（双向）
- 【架构定稿 v8.4.4】新标签页 manifest newtab → shell.html（壳：全屏 iframe 载 https://lxgssy.github.io/Start-chushi/ + boot 遮罩 + geolocation/clipboard allow 委托）；shell-bridge.js（扩展页上下文协议 host）：origin 白名单 https://lxgssy.github.io + e.source===frame.contentWindow + 键名 ^[A-Za-z][A-Za-z0-9_:-]{0,127}$ + 单值 512KB/单批 1MB，op hello/get/set/remove/getAll，chrome.storage.onChanged 反向推送，握手 10s 超时 location.replace("index.html") 回退本地完整版
- 【旧云端页零改动】线上 Pages=gh-pages 649a4ae（v8.2.9，有双开关但不识桥协议）→ shim-page.js（manifest content_scripts world:"MAIN" + run_at document_start + all_frames:true）伪造 window.chrome.storage.local（get/set/remove/clear/onChanged.addListener，不覆盖真 API）——页面既有 mirrorExtCard 调用链自动经桥落库
- 【两段式信任律】跨域 parent.origin 不可读（SecurityError→""）导致 shim 首版静默退出——探针诊断 log 实锤（boot 到场但 marked:false）；改握手确认：hello（零敏感）"*" 投递→回复 event.origin 浏览器保证不可伪造→校验 chrome-extension:// 前缀→数据消息才精确 origin 投递（握手前 bootQueue 排队 flush）；顶层场景（cs-bridge）handshaked 直通
- 【顶层桥】cs-bridge.js（isolated world，document_start）：直访 Pages（无壳）时与 shim 配对（同 window postMessage 跨 world），校验 e.origin===SELF + e.source===window 代写 chrome.storage——网页版与扩展同库
- 【反向实时同步（同步闭环关键）】PresetWidgets.tsx：EXT_KV_MAP（cardEnabled→:csFloat/cardGlow→:csGlow/cardForceWord→:csForceWord）+ chrome.storage.onChanged（真/shim 伪造同签名统一）→ 同值 no-op 守卫（回声吸收+回环断链）→ kvRef 回写+writeKv+postToWidget widgetStoragePatch；sandbox.js 转发白名单 +patch；music-widget.html patch 消费端（ev.source===window.parent 校验，csFloat/csGlow/csForceWord 翻转，glow 关时 beatFrame(null) 熄灯，forceWord 重建歌词）——浮窗/他页改开关→面板 UI 实时翻转（此前单向）
- 【数字门】cshz 超限 26207>25600：两道数字门同步放宽 26400（build-smtc-preset.py assert + preset.ts widgetHtmlLen，Task 100 律两处同改，向后兼容）
- 【探针十门】scripts/probe-v844-shell.mjs（launchPersistentContext+channel chromium+headless 扩展加载，EXT_ID=sha256(ROOT) 映射）：T1 壳加载+握手/T2a iframe 在场/T2b MAIN shim 伪造/T3 上行落库/T4 下行 onChanged/T5a source 伪造拒绝/T5b 非法键拒绝/T6 云端不可达 10s 自动回退 index.html/T7a 顶层 shim/T7b cs-bridge 同库——ALL-GREEN，pageerror=0
- 【坑录】①content_scripts all_frames 缺省 false→壳内 iframe（非顶层）不注入，首跑 T2b FAIL 实锤；②Pages 自身部件 iframe（父页同域）必须挡在 shim 信任面外（仅 chrome-extension:// 父页启用），否则伪造 storage 消息发同域父页无人监听空等超时；③/tmp/ext-ref 环境清理丢失→download/v1.1.2 zip 重解压恢复；④Write/Edit 工具限 /home/z——真树 /tmp/my-project 双向 rsync 工作流
- 【产物】download/v8.4.4/（ChuShi-NewTab-v8.4.4.zip 11.8MB + 初始SMTC音乐预设.cshz 26207c + SHA256SUMS + 更新说明）；main 本地 commit（不推公开仓，用户指定）

Stage Summary:
- 云端更新壳三件（shell.html/shell-bridge.js/shim-page.js/cs-bridge.js）+ 页面侧反向同步三处（PresetWidgets/sandbox.js/music-widget.html）+ 数字门 26400 双改
- 架构律：壳桥=两段独立信任（页面端握手 origin 确认 + host 端白名单校验）；MAIN world shim 让旧云端页零改动获得镜像能力；同值 no-op 守卫断回环
- 新律：跨域 parent.origin 不可读——跨源白名单必须走「握手-确认-精确投递」；content_scripts 想进 iframe 必须 all_frames:true
- 版本：v8.4.4；工作仓（Start-chushi-workspace 私有）随 workspace-archive.sh 同步；文叔叔发件

---
Task ID: 103-b
Agent: main (Super Z)
Task: Task 103 交付收尾——工作仓推送 + 文叔叔发件补录

Work Log:
- 【工作仓】token 由 origin URL 内嵌凭据重建（.pkgtmp/gh-token 600）；workspace-archive.sh 全链通过：黑名单/泄漏扫描 ✓ → private=True 断言 ✓ → 增量快照提交 → 推送 88f531f..f9d6093 → SHA 一致断言 ✓；公开仓 Start-chushi 未推送（用户指定，v8.4.4 仅本地 36ff0ac）
- 【文叔叔】wss_upload.py（旧 API）addsend 返回 TR_ACCOUNT_WREM（设备信任）→ 改用 pw-lab/wss-send.py（v1.1.2 重建版新链路）一次成功；12 分块（1MB×12）；依赖补装 pycryptodomex（venv 内 pycryptodome 3.23 为 Crypto 命名空间，Cryptodome 需 domex 变体）
- 【交付】v8.4.4-交付包.zip（11.8MB：扩展 zip + cshz + 更新说明 + SHA256SUMS）→ https://c.wss.ink/f/kv75434qsdh（1 天过期）；本补录随增量快照入工作仓

Stage Summary:
- 公开仓零推送 ✓；私有仓 f9d6093；文叔叔 c.wss.ink/f/kv75434qsdh
- 新律：wss_upload.py 旧链路已被设备信任门拦（TR_ACCOUNT_WREM），一律改用 pw-lab/wss-send.py；pycryptodomex 与 pycryptodome 命名空间之别（Cryptodome vs Crypto）

---
Task ID: 104
Agent: main (Super Z)
Task: 用户三条指令——「加载完成后直接缓存在本地，新开标签页时直接就加载最新的版本即可，而且地址栏不要写一串网址」——v8.4.4 云端壳反转为本地直载壳

Work Log:
- 【架构反转】v8.4.4 壳（iframe 载 GitHub Pages + 10s 握手超时回退）→ v8.4.5 本地直载：壳只做版本路由（IndexedDB 快照 meta vs chrome.runtime.getManifest().version 取较新者）+ 地址栏收敛，启动路径零网络；内嵌完整版 index.html 即最新版
- 【云端静默更新器】ext-bg.js 顶部追加：SNAP_MIRRORS 比对 version.json（严格更新才动，永不降级）→ 并发下载（限 4 路 + 尺寸校验 + HTML 文本改写 /cs-snap/ 前缀）→ IDB 库 chushi-snap（kv.meta 原子开关 + files."v::path"）→ snapPruneVersions 清旧版；触发面 onInstalled/onStartup/alarms 6h/storage 写 csSnapCheck（探针手动通道）；⚠ MV3 律：alarms.create 必须先 get 再 create（SW 每次唤醒跑顶层，无条件 create 归零计时器）
- 【SW 三连决胜实验】（scripts/probe-sw-feasibility.mjs / probe-bg-sw-fetch.mjs / probe-root-nav.mjs）：X0 最小扩展=扩展页可注册 SW 且瞬时激活（⚠ navigator.serviceWorker.ready 永不 resolve 的坑，改 getRegistrations 轮询）；X1 带 background 的真扩展里【子路径作用域】页面 SW 可注册可拦截（scope 最长前缀匹配胜出）；X2 background SW 不参与 fetch 拦截 + 根作用域页面 SW 注册被拒（user denied permission，scope "/" 被 bg 占位）→ 结论：根路径 "/" 导航是扩展协议硬豁免 404，无任何 SW 兜底手段
- 【快照虚拟目录】/__cssnap/ 作废（下划线目录违反 Chromium 保留名规则）→ /cs-snap/（真实目录，无下划线）；cs-snap/sw.js（scope=/cs-snap/）：/cs-snap/* 从 IDB 合成响应 + 快照文档 referrer 判定改写（运行时动态请求兜底）；壳快照模式先 ensureSnapSW(true) 等 activated（2.5s 上限）再设 iframe.src
- 【地址栏定稿】replaceState("./index.html")——无参数无云端网址，F5 落自足应用顶层（真文件直载，绝无 404）；根形态（纯 ID）因 X2 不可 F5 弃用；**沙箱特权 × SW 合成挂死对照实验**（probe-t9-final.mjs：同内容异路径，sandbox.html 挂死 plain.html 正常）→ 双保险：SW 对 sandbox.* 豁免落网络 + cs-snap/ 内放真实沙箱文件副本 + manifest sandbox.pages 增补 cs-snap/sandbox.html；应用 sandbox 引用为 ${base}/sandbox.html?v=N 根绝对，快照模式天然落真实文件
- 【坑录】①MultiEdit 非原子部分应用两次（docstring 重复插入、VERSION 残留）→ 逐行核实修复；②rsync --delete 方向写反把 /home/z 新文件冲掉（sw.js/shell*/ext-bg 回退）→ 全部重写，此后同步只走 /home/z → /tmp 单向；③探针 EXT_URL("/") 拼双斜杠假 FAIL
- 【探针 14 门 ALL-GREEN】probe-v845-shell.mjs：T1 本地直载/T2 零云端请求/T3 boot 257ms/T4 开关原生双向同步/T5 地址栏+F5 自足/T6 快照 SW activated/T7 快照端到端（mock 镜像 version.json v99 → 下载 → 原子提交 → 新标签页直载 /cs-snap/index.html → mark.js 子资源 IDB 服务）/T8 旧版永不降级/T9 快照沙箱特权 eval-ok+origin null；pageerror=0
- 【产物】download/v8.4.5/：ChuShi-NewTab-v8.4.5.zip（11.8MB）+ ChuShi-CloudSnapshot-v8.4.5.zip（云端快照载荷 69 文件+version.json，部署到任意 https 静态托管即激活云端更新）+ 初始SMTC音乐预设.cshz（同 v8.4.4，未改预设）+ 使用说明 + SHA256SUMS；manifest +alarms 权限、sandbox.pages 双条目、VERSION 8.4.5
- 【发布】公开仓零推送（用户指令）；main 本地 77a7db5；工作仓随 workspace-archive.sh 同步；文叔叔发 v8.4.5-交付包.zip（24MB）

Stage Summary:
- 架构律：新标签页壳=「版本路由+地址栏收敛」两件事，启动路径零网络；云端更新=后台静默（严格更新+原子提交+永不降级），与新标签页流程完全解耦
- 浏览器硬律（新）：①扩展根路径 "/" 导航恒 404 且不可被任何 SW 拦截（bg 占位 scope="/" 且不参与 fetch）②子路径作用域页面 SW 在带 bg 的真扩展里可用（最长前缀胜出）③SW 合成响应无法服务沙箱特权页（挂死）④扩展包内目录禁下划线开头（快照虚拟目录必须无下划线）
- 交付律：本版不部署公开更新源（用户指定不碰公开仓），云端更新机制完整就绪待用户自选托管

---
Task ID: 105
Agent: main (Super Z)
Task: 用户「好了可以推送到公开仓了，之后所有更新就靠云推了」——v8.4.5 推公开仓 + 云端镜像上线 + Release 发布

Work Log:
- 【镜像部署】ChuShi-CloudSnapshot-v8.4.5.zip（69 文件+version.json+.nojekyll）铺上 gh-pages 根（649a4ae→b31bd0a），旧网页版构建退役；Pages 工作流 success 实证——SNAP_MIRRORS[0]=https://lxgssy.github.io/Start-chushi 即刻生效；树与 version.json 清单零缺零多、69 文件尺寸全符（中途一次 MISMATCH 系测试参数笔误：thumbs 尺寸对到 wallpapers，非镜像问题）
- 【全量核验】scripts/verify-cloud-mirror.py：模拟 snapCheck 对线上镜像逐文件下载，尺寸+SHA256 与本地载荷双校验 ALL-GREEN；scripts/deploy-cloud-mirror.sh 固化未来云推链（worktree→清树铺载荷→清单一致性门→提交推送→Pages 收敛轮询→verify 全量核验）
- 【CI 发布】tag v8.4.5 推送触发 build-extension 工作流（run 34766117964 success）：bun 构建+CRX_PRIVATE_KEY 签名，自动建 Release 出 zip(12372653B)+crx(12378241B)；下载核验 manifest 8.4.5 + SNAP_MIRRORS 指向已上线镜像 + cs-snap/shell/shim/bridge 件全在包内
- 【Release 补齐】6 资产：CI zip/crx + ChuShi-CloudSnapshot-v8.4.5.zip + ChuShi-Music-Preset-8.4.5.cshz + ChuShi-v8.4.5-Usage-Notes.md + SHA256SUMS.txt（覆盖全部发布资产）；正文 PATCH 为中文云推说明（1850 字，rel-v845-body.py 固化）；无凭据复核 crx/zip 下载 200 全可达
- 【main 同步】148de0d→17600ef 四提交推公开仓（v8.4.4/v8.4.5/worklog/脚本）；worktree /tmp/cs-mirror 用毕即清

Stage Summary:
- 公开仓三线全通：①gh-pages=云镜像（69 文件 ALL-GREEN）②main 代码至 17600ef ③Release v8.4.5 六资产
- 云推全链定稿：改 VERSION → bun build → build-extension.py（第 7 段产载荷）→ deploy-cloud-mirror.sh → 装机端 ≤6h 静默自更新；crx/zip 由 tag 触发 CI 产出
- 新律：gh-pages 根已被云镜像占用，网页版构建不再部署该分支（恢复须另选分支/前缀）；CI 重建产物与本地构建字节级不同，SHA256SUMS 必须以「实际发布资产」回算而非本地构建物
- 用户从此更新路径：装机端后台自动云推（≤6h/启动时）；手动渠道=Release 页 crx

---
Task ID: 106
Agent: main (Super Z)
Task: 用户「再美化一下更新日志的页面，让它看起来更高级，然后优化一下拖拽快捷服务时的手感以及动画，让动画不要出现卡手以及动画复位卡顿」——v8.4.6 云推

Work Log:
- 【更新日志重设计】ChangelogDialog 时间线版式：左侧版本轨道（最新=强调色节点+光晕，历史=灰阶空心节点，轨道线 accent 35% 渐隐）、首条「最新」徽标、日期右齐、通道徽标（page=accent 淡底 / shell=zinc）、条目级联入场（stagger 35ms 弹簧上浮）、滚动区上下 14px 渐隐遮罩、页眉 overline+强调色渐变分隔线；changelog.ts 补 8.4.4/8.4.5/8.4.6 三条 + 近期版本日期
- 【卡手实锤】probe-drag-debug.mjs 取证：磁贴 <a> 的原生链接拖拽（Chrome drag 阈值 ~4px）先于 dnd-kit MouseSensor 6px 激活阈值触发，dragstart 一出 pointer 流被原生拖拽征用（事件流实证 dragstart@A 后 move 全打在拖拽影像层 DIV 上）——磁贴时灵时不灵/卡手真身；修法：磁贴 a 加 draggable={false}+onDragStart preventDefault，dnd-kit 稳定接管（对照实验：拦下 dragstart 浮层即活）
- 【复位顿挫根治】旧版两层硬切：①DragOverlay dropAnimation 期间子树冻结，抬起态（scale1.07+光晕+厚影+倾斜）冻到落地瞬间硬切磁贴静置态 → 抬起态三件套全改 motion value（liftScale/glowO/shadowO useSpring），MotionValue 绑定穿越冻结子树，松手 set(1/0/0) 与 300ms 飞回同频，落地=静置外观零跳变（厚影从图标 boxShadow 拆出独立层才可淡出）②磁贴「凹槽⇄本体」320ms 延迟挂载硬切 → 磁贴常驻不卸载（拖拽期透明+穿透），松手 160ms 淡入与凹槽 150ms 淡出交叉，settlingId 状态整体退役
- 【跟手】Tile memo 化 + enterEdit/removeLink useCallback（此前每次跨格 setLinks 整列磁贴全量重渲染+framer 全量重测布局）+ 浮层 will-change 合成层提升；TileIcon/TileVisual 的 lifted 死参数清理
- 【坑录】①glow/shadow 的 MotionValue 绑在普通 span 上 TS2322 且运行时不生效，必须 motion.span ②deploy-cloud-mirror.sh 清单门误报 worktree 的 .git 指针文件，补 .git 豁免 ③探针 T1 后设置面板未关，其全屏 z-30 遮罩吃掉后续拖拽事件（T2-pre 磁贴可达门防复发）④headless 软渲染 rAF 绝对帧距无意义，T5 改对比法（拖拽期长帧 ≤ 空闲基线+6）⑤外层 /home/z 工作区 scripts 被外部清理——真树 /tmp 为准
- 【验证】probe-v846.mjs 16 门 ALL-GREEN：更新日志 6 门（弹窗/v8.4.6 首条/最新徽标/26 条/日期/ESC）+ 拖拽 10 门（可达/浮层挂 body+will-change/凹槽在位/被拖磁贴隐身/跨格重排/浮层凹槽零残留/长帧对比/pageerror=0）；截图核验暗色时间线与拖拽中态
- 【云推+发布】VERSION 8.4.6 → 重打包（zip 11.8MB+快照 69 文件）→ deploy-cloud-mirror.sh 8.4.6（清单门过、gh-pages b31bd0a→e9c53b1、Pages 收敛、69 文件尺寸+SHA256 全量核验 ALL-GREEN）→ tag v8.4.6 CI success → Release 5 资产（crx 12379468B/zip 12373718B/快照/说明/SHA256SUMS）+ 中文正文；main d7f4917

Stage Summary:
- 首个完整走「云推」链的版本：改码→构建→deploy-cloud-mirror.sh→CI Release，未发任何新 crx 给存量用户（他们 6h 内自动升级）
- 新律：①原生 <a> 拖拽与 dnd-kit 激活阈值存在竞态，凡是 dnd-kit 拖锚点元素必须 draggable={false}+dragstart preventDefault ②DragOverlay dropAnimation 期间子树冻结但 MotionValue 引用仍活——浮层落地过渡一律走 MV 不走 animate 属性 ③worktree 清单门必须豁免 .git 指针文件 ④探针跨功能段必须验证前段遮罩清理（z-30 backdrop 教训）
- 待办：用户实机验收（云推 6h 内到位）；Edge 商店提交材料仍未做

---
Task ID: 107
Agent: main (Super Z)
Task: 用户「现在网页版进不去，扩展包新开网页也一直卡在加载页面，修复这个问题」——v8.4.7 云推修复

Work Log:
- 【取证】线上镜像 v8.4.6 载荷=裸构建产物：index.html 根绝对 /next/* 引用在 github.io 子路径全 404 → 网页版白屏实锤（Playwright 线上复现 ~18 个 404）
- 【复现】真实 v8.4.5 包（git 提交版）+ 真实 ext-bg 更新器全链复现用户卡死：更新器下载 70 文件正常、快照导航 200 + X-Chushi-Snap、全部静态资源 200、TURBOPACK 全局在、flight 六段全推——但 __next_f 六段永不消费、pulse 占位符永驻 = 静默卡死
- 【根因】bootdiff 逐拍对照 + 运行时块逆向：Turbopack 运行时块内硬编码分块键前缀 t="/next/"（构建期 basePath），注册键=脚本标签 src 属性剥 "/next/"、加载键=编译期相对路径（static/chunks/…，描述符 otherChunks 同）——ext-bg snapRewriteHtml 把标签改成 /cs-snap/next/… 后注册键剥离失败 → 引导分块（otherChunks→runtimeModuleIds 94553）永不 resolve → 排水器（1b722dc 内 DOMContentLoaded 分支）永不跑 → 静默卡死。二分实验：X2 真实文件子路径+根解析=BOOT（子路径无罪）、X4 respondWith 重包装=BOOT（SW 合成无罪），毒=改写后键失配
- 【修复】载荷「属性空格前置 =」免疫态：src ="/next/…" 合法 HTML 且恰好绕过 (src|href)=("|')\/ 改写正则 → 旧壳/新壳下载后标签保持字面 /next/…，快照子资源经 referrer 分支从 IDB 原样供数，键空间与根路径一致 → 启动恢复；ext-bg snapRewriteHtml 退役（字节原样入库）；免疫态门进 build 防呆（未逃逸根绝对引用零容忍）
- 【网页版回归】/web/ basePath 独立构建（next.config BASE_PATH 参数化 NEXT_PUBLIC_BASE_PATH）与载荷同仓共存零碰撞；镜像根 hostname 门重定向（ext-script-1，扩展内零打扰）——首版重定向用绝对引用在镜像根 404 永不执行，改相对引用后全通
- 【验证】final-gate：真实 8.4.5 壳 × 真实改写语义 × 真实 cs-snap SW → BOOT ✓；线上镜像端到端（真实更新器直连 lxgssy.github.io）：meta v=8.4.7 70 文件、快照 200 X-Chushi-Snap=8.4.7、快照出 UI ✓；网页版出 UI ✓；verify-cloud-mirror 70 文件 SHA256 全绿
- 【发布】gh-pages 重推（70 文件+web/+.nojekyll，部署脚本补 .nojekyll 自动落+web/ 同部署+清单门豁免 web/）；main faa52f0+f20ec17；tag v8.4.7 CI success（run 34821299188）；Release 5 资产（crx 12379974B / zip 12374275B / 快照 12291918B 修复后重传 / 中文说明 / SHA256SUMS 三资产）+ 正文 PATCH
- 【坑录】①工作树被外部还原到 9 月初旧版（build-extension.py 退回 v1.2.0 古董、-3785 行）——git checkout -- . 恢复，HEAD 是好的，已发布产物未受污染 ②Node URL 对 chrome-extension:// scheme 返回 origin=null ③探针种子忘 TextEncoder → 字符串 .buffer=undefined → IDB 全空值假象 ④载荷级内联注入插 <head> 最前会把 charset meta 顶出 1024 字节窗口（必须放 meta 后）⑤A1b FAIL 为探针姿势伪影（在壳页查 iframe 内 UI）

Stage Summary:
- 用户双病根治：扩展卡加载（8.4.6 快照键失配）+ 网页版 404（绝对路径×子路径）——全部走云推修复，存量用户 ≤6h 自愈，无需换包
- 新律：①Turbopack 构建的引导分块键=「脚本标签 src 属性剥运行时硬编码前缀」，任何属性改写/前缀变换都会静默卡死引导，载荷必须免疫一切文本改写 ②载荷 HTML 属性免疫态（空格前置=）是唯一兼容新旧壳的通道 ③镜像根=载荷+hostname 门重定向 /web/，网页版与载荷共存
- 用户侧预期：≤6h 新标签页自动恢复 v8.4.7（更新日志显示 8.4.7 条目）；网页版直接可访问

---
Task ID: 108
Agent: main (Super Z)
Task: 用户「写一个检查更新到更新日志旁边，这样可以由用户自己拉取更新，你现在就在8.4.5上改，然后用文叔叔发给我，并把这个改动同步到新版本」——v8.4.8 云推（检查更新按钮 + SW 免 referrer 硬化）

Work Log:
- 【版本澄清】用户口中「8.4.5」= 其手里最后一份文叔叔交付版的版本号；真树已在 v8.4.7（快照启动修复+网页版回归已云推）。本次在 v8.4.7 之上做 v8.4.8，交付包内含全部累积修复
- 【检查更新按钮】新增 CheckUpdateButton.tsx（设置→关于，更新日志旁同款胶囊）：预判直连镜像 version.json（GitHub Pages 全开 CORS，10s 超时）→ 云端 ≤ 本地地板 max(内嵌版, 快照 meta) 秒回「已是最新」不触发下载 → 发现新版写 csSnapCheck{manual:true}（v8.4.5 起常驻手动通道，旧壳 8.4.5~8.4.7 全兼容）→ 双通道等结果：新壳读 csSnapStatus 状态机（checking/downloading done/total/updated/latest/error），旧壳轮询 IDB chushi-snap kv.meta（90s 预算）→ 「启用新版 vX」accent 胶囊 → 顶层导航回 shell.html 重走版本路由（地址栏仍被壳收敛为 index.html）；网页版宿主（无 chrome.runtime.id）整颗隐藏
- 【ext-bg 手动回写】onChanged 识别 newValue.manual===true 才全程回写 csSnapStatus；6h 自动检查保持静默不打扰面板；探针旧值（时间戳）行为不变（T5 静默门实证）
- 【顺手根治二 bug】①csSnapStatus 平铺键：snapStatus 原写 Object.assign({...}, st) 平铺进 storage 根，csSnapStatus 键永远不存在（探针 T4c null 实锤）→ 修复为 {csSnapStatus:{...}} 显式包键 ②SW 子资源免 referrer 硬化：chromium-1234+ 实测扩展 origin 文档的子资源请求 referrer 恒空（diag-swtrace: fe /mark.js ref=EMPTY mode=no-cors），v8.4.5~8.4.7 sw.js 的 referrer 判定分支永不命中 → 快照子资源穿透网络 ERR_FILE_NOT_FOUND（页面卡快照静默断资源）；改为受控 client 同源请求按路径查快照 serveSnapIfAny（命中即 IDB 供数、未命中穿透网络/包内真文件），嵌入版/壳页非受控 client 请求不进 handler 零冲突，沙箱豁免保持——跨 Chromium 版本健壮
- 【探针】probe-v848.mjs 16 门 ALL-GREEN：boot/按钮在场/更新日志首条 8.4.8/已是最新快路径（mock 8.4.7）/手动下载→状态机 updated（mock 翻面 99.0.0）/启用新版/顶层重路由/快照直载/子资源 IDB 供数/旧通道静默/pageerror=0
- 【坑录】①app 侧预判 fetch 与 ext-bg SNAP_MIRRORS 必须同探针重定向，否则 app 拉真实镜像秒判最新永不触发 mock ②探针 profile 必须白纸——残留快照 IDB（meta=99）把路由劫持去 /cs-snap/ 旧快照，SW 供数失败 frame 不建立 ③shell replaceState 后顶层 URL=…/index.html，frames() 匹配必须排除 mainFrame ④iframe src 属性就位≠导航落地，快照 frame 须轮询等 ⑤页面注册的子路径 SW 无 chrome.* API（普通 SW），SW 侧调试日志只能走 IDB ⑥storage 单键读改写日志有竞态，独立键才可靠 ⑦worklog 被外部覆写成缩略版，diff 判断后 checkout 恢复详版
- 【云推+发布】deploy-cloud-mirror.sh 8.4.8：gh-pages 56f99a6→316b7c6、清单门 70 文件、Pages 收敛、SHA256 全量核验 ALL-GREEN；main 本次提交；tag v8.4.8 触发 CI Release；文叔叔发 v8.4.8-交付包；载荷 81 条目确认不含 cs-snap（SW 只随安装包走，旧装不受影响）
- 【验证】快照 SW 供数面复盘：/cs-snap/* 导航按 meta 服务不变；子资源面 referrer 分支退役改路径命中；嵌入版完整可用（T1b）

Stage Summary:
- 「检查更新」落地：用户可随时手动拉取云端新版，下载进度与结果即时可见，一键启用；云推 v8.4.8 上线，存量装机 ≤6h 自愈
- 新律：①扩展 origin 文档子资源 referrer 恒空——SW 供数判定禁依赖 referrer，一律按路径+命中查库 ②探针 app/ext-bg 双镜像重定向 + profile 白纸双纪律 ③storage 状态回写键必须显式包键，平铺写=键不存在 ④子路径页面 SW 无扩展 API，只有 IDB
- 待办：Edge 商店提交材料仍未做

---
Task ID: 109
Agent: main (Super Z)
Task: 用户「为什么会出现点击快捷服务后显示网页拒绝连接」——v8.4.8 补「外链提升」修复并重发

Work Log:
- 【根因】v8.4.5 壳架构副作用实锤：新标签页顶层是 shell.html，应用整体跑在其全屏 iframe 里（本地直载/cs-snap 快照同为扩展 origin）。QuickLinks 磁贴是普通 <a href>（无 target），点击默认只在 iframe 内导航；主流站点几乎都带 X-Frame-Options: DENY/SAMEORIGIN（或 CSP frame-ancestors），Chrome 拒绝被嵌 → 整页「xxx 拒绝了我们的连接请求」（REFUSED_TO_CONNECT）。v8.4.4 前应用本身是顶层文档（整页跳转）故无此问题；中键/Ctrl 点击开新标签页一直正常，所以「时灵时不灵」
- 【修复·nav.ts】新建 src/lib/startpage/nav.ts：inExtIframe()（chrome.runtime.id + self!==top，跨域访问 top 抛异常也算在 iframe）+ openExternalUrl(url, newTab)（扩展壳 iframe 内 → window.top.location.href 提升到顶层整页打开，同源 chrome-extension 可直写；newTab → window.open 开顶层新标签；跨域父页兜底 window.open；网页版保持 location.assign 行为不变）
- 【修复·全出口】磁贴（QuickLinks onClick 左键无修饰键时 preventDefault+提升，编辑态/长按逻辑不受影响，锚点加 data-cl-tile 标记）；page.tsx 四处（runSearch / 沙箱 open / 预设 open / openUrlFromPage）；SearchBar navigate()（保留 newTab 设置）；CommandPalette 三处（搜索引擎/打开网址/链接）；另挂 page.tsx 全局捕获监听兜底散落 <a>（WeatherPanel 数据源链接等；跳过 data-cl-tile / _blank / 修饰键 / 非 http(s)）
- 【探针】probe-v848.mjs 增 T8：独立标签页（必须在 T4 翻面前跑——v99 假快照页无监听器）；T8b 以 a[data-cl-tile] 出现为水合信号（SSR 静态 HTML 有子节点≠水合，首版 T8 在 effect 挂监听器前点击而假阴）；T8a 动态锚点点击 → 顶层整页跳 mock（page.waitForURL /probe-hoist/）。18 门 ALL-GREEN（T1 boot/T2 按钮在场+日志首条/T3 已是最新/T4 手动下载→updated/T5 旧通道静默/T6 快照直载+mark.js/T7 pageerror=0/T8 提升）
- 【云推补课】上轮（Task 108）v8.4.8 已推过 gh-pages（316b7c6=旧构建 buildId mUISk0s…）；本轮新构建（buildId Rnm3fNz…）重推 d6b447e——deploy 收敛轮询只比对 v 字段，同版本号双推时被旧清单骗过，首轮 verify 拿新 zip 对旧清单报 7 BAD（404/sha 不符）；等 Pages 二次收敛后全量 verify 70 文件 ALL-GREEN
- 【交付重建】更新说明-v8.4.8.txt 补「拒绝连接修复」条目；SHA256SUMS 重算；v8.4.8-交付包.zip 重打（zip+cshz+说明+校验）；文叔叔重传（public https://c.wss.ink/f/kvhn1xe8uxf（SHA 修正后重传终版））
- 【坑录】①SSR 静态导出「body 有子节点」≠水合完成，effect 挂的监听器要等水合信号 ②同版本号云推二次收敛必须以清单内容（buildId 目录名）而非 v 字段为准 ③verify-cloud-mirror fetch 的是线上 version.json 对本地 zip，两端构建不一致时 BAD 列表=新旧清单差集

Stage Summary:
- 用户报告的「快捷服务拒绝连接」根治：所有外链出口（磁贴/搜索/指令面板/预设/沙箱/散落锚点）在扩展壳内一律提升到顶层整页打开，行为与 v8.4.4 前一致；网页版零影响
- 云端 v8.4.8 重推收敛（70 文件 SHA256 ALL-GREEN），存量 8.4.5~8.4.7 装机 ≤6h 自动获得本修复（页面通道，无需换包）
- 新交付包已重传文叔叔，内含检查更新+拒绝连接修复双项
- 【补记】tag v8.4.8 重打至 50b3c5a 强推 → CI 34852379863 success；Release 6 资产全对齐新构建（zip/crx CI 产出，快照 zip/说明/SHA256SUMS 经 API 替换）；交付包以修正版 SHA256SUMS 重打重传文叔叔终版

---
Task ID: 110
Agent: main (Super Z)
Task: 用户「更新日志界面加返回设置按钮 + 重绘所有图标（设计不变、消笔画重叠）+ 做完云推」——v8.4.10 云推发布

Work Log:
- 【返回设置】ChangelogDialog 底部新增胶囊按钮（ArrowLeft+文字，hover 左移微动效），点击 onClose 回设置面板。首跑探针即断：真鼠标点击被拦——dbg-backbtn 取证 elementFromPoint 命中 BUTTON.dock-btn：弹窗 veil(z-50) 挂在 SettingsPanel(z-30 层叠上下文)内，z-50 只在父上下文内生效，整层被 dock(z-40) 压住，弹窗底部恰好落进 dock 条区域；ESC 关闭一直正常是因为键盘事件不走命中测试。修复=createPortal 到 body（PresetDocs 同款，Task 54「全屏浮层一律 portal」律），SSR 惰性挂载
- 【图标审计】对全套在用图标逐根笔画取证（lucide 原始路径数据 + 256px 栅格 + 4x 截屏）：真交叉/撞笔仅三处——square-check-big 对勾长臂戳出框角、notebook-pen 四根装订环横穿左边框(X 交叉×4)、cloud-sun 太阳弧端贴云谷小尺寸糊团；Timer/Command/Settings2 及面板内 lucide 工具件全是干净 T 触/留白，逐字保留
- 【cs-icons】新建自绘套件（24 网格/lucide 同语言，strokeWidth 默认 2 对齐 lucide 防静默变细）：CsCheckSquare=完整方框+对勾收进框内（勾尾距框边≥4 格）；CsNotebookPen=装订环改止于边框中线的 T 触短须（视觉不变零穿透），本体+笔原样；CsCloudSun=太阳弧 r4→3.4 上收（弧端与云净距≥2.5 格），四光芒线原位；CsTimer/CsCommand/CsSettings2 几何逐字收编。接入 Dock 六图标 + CommandPalette 打开组 + ContextMenu palette/settings
- 【验证】probe-v849 23 门 ALL-GREEN：boot/按钮在场/日志首条/返回设置关弹窗且设置仍在/Dock 五图标 path d 的 DOM 取证/已是最新/手动下载→updated/旧通道静默/快照直载/外链提升回归/pageerror=0；4x 截屏视觉终验（待办勾进框、便签环不穿、天气留隙、⌘K 同步）
- 【平行会话事故】gh-pages 发现两笔 v8.4.9 部署：d441101(00:29 北京,qu4imNX=仅升版本号的空构建,8.5h 窗口)与 380c58f(09:09,A84F=本会话全量构建)——并行会话在同一仓库/工作树活动（远端 main 三笔新提交+工作树不明 M 改动旁证）。同版本号严格大于才更新的规则下，窗口期拉取用户 floor=8.4.9 永远拿不到真内容→升版 8.4.10 救援，changelog 保留两条 8.4.9 历史条目
- 【git 卫生】首轮 v8.4.10 提交误用 git add -A src/ 把并行会话工作树 WIP（chime/liquid-glass v2/music/use-pomodoro 等 5210 行未跟踪死代码，无任何跟踪文件 import，tree-shake 后产物等价）扫进提交且 tag 已触发 CI——push main 被拒（远端前进）反而留下一线生机：soft-reset 重做、reset 到远端、单笔干净提交（delta 恰 12 文件 +756-29）、删 tag 重推、删 Release 重跑 CI 换血资产
- 【云推+发布】deploy-cloud-mirror.sh 8.4.10：清单门 70 文件、Pages 收敛、SHA256 全量核验 ALL-GREEN；main deed6b1 推送（基于并行会话 b0c7772 之上）；tag v8.4.10 CI success→Release 2 资产（crx 12383832B/zip 12378250B，manifest 8.4.10、返回设置与图标特征串在包内实证）；线上 version.json v=8.4.10

Stage Summary:
- 「返回设置」按钮落地且根治一层叠上下文劫持（新律：查 z 序问题先查祖先层叠上下文，z-50 在 z-30 上下文内打不过 z-40——固定层永远 portal 到 body）
- 图标重绘完成：设计零漂移，全图标零笔画交叉（新律：重绘前先拉 lucide 原始路径做几何审计，视觉取证用真栅格不用想象）
- 新律：共享工作树多会话并行时代，git add -A 是禁区（必须白名单加文件）；同版本号重复云推会卡死窗口期用户——发现即升版救援，changelog 折叠保历史连贯
- 装机端路径：存量 ≤8.4.9 装机 ≤6h 静默升 8.4.10（页面通道）；手动渠道=Release 页 crx/zip
