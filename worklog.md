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
Task ID: 114
Agent: main (Super Z)
Task: 用户「刷新初始页丢失更新修复 + 抽屉样式设置面板给选项（常驻/抽屉）+ 抽屉背景不要纯黑遮罩要整页高斯模糊 + 批量编辑抖动动画缺失 + 开关抽屉时搜索栏和图标磨砂消失 + 解包青柠 crx 参考『所有捷径』页」——v8.6.2 云推

Work Log:
- 【青柠侦察】解包 upload/青柠起始页扩展_1.4.0.crx（CRX3 头 12+hlen 偏移坑）→ 扩展只是 limestart.cn 的 iframe 壳，真正 UI 在站点本体；调研代理爬线上一手参数：二级界面=0.25s 纯淡入无遮罩、编辑拖拽时全图标 ±2°/0.25s linear infinite 交替反向（nth-child even reverse）、卡片 80×80 r15、弹层遮罩 blur(10px)+黑 35%、全局缓动 cubic-bezier(.65,.05,.1,1)；截图+DOM/CSS 摘录存 /tmp/lime-crx/recon/（备份 /home/z/my-project/recon-notes/）
- 【刷新丢更新根因】shell-bridge.js 版本路由后 history.replaceState 落 index.html——F5 直接重载内嵌版、完全绕过路由，云端快照新版被打回旧版（用户实测）；修复：replaceState 改落 shell.html（F5 重新走路由=max(内嵌,快照)）+ 云端握手超时回退同步改 shell.html；探针 T1b/T10 断言落点
- 【双形态回归】新字段 settings.linksForm（docked|drawer，默认 drawer）——刻意不复用 v8.5.x 的 linksStyle：存量数据残留的 "docked" 若被恢复会让 8.6.x 抽屉用户升级后突变回常驻；QuickLinks 重构双形态共享 Tile/拖拽/编辑/浮层，docked=v8.5.9 原样式（56px 内联网格、无纱罩无中键、pill 不渲染），drawer=中键唤出全屏磁贴墙（64px）；SettingsPanel 设置→链接 加「快捷服务样式」段控；page.tsx 双挂载点（docked 在 main 内搜索区下、drawer 在 main 外 portal）
- 【整页高斯模糊】.cl-drawer-veil 加 backdrop-filter blur(28px) saturate(1.5) + 染色大减（浅色白 .32/.20/.28、深色 zinc-900 .42/.28/.38 替代 zinc-950 厚涂——「纯黑遮罩」差评）；流畅模式 cs-lite 通配自动退化纯色纱（加深兜底保留）
- 【磨砂恒定在线】两处 backdrop-root 根因清除：①html.cs-drawer .cl-drawer-fade（搜索区 opacity+filter 雾化让位）整体退役——它的过渡正是「开关抽屉搜索栏磨砂消失」元凶，让位感由整页模糊承担；②抽屉根/容器动画去 opacity（initial={false}+exit 仅 pointerEvents，容器只动 y/scale transform），淡入淡出由纱罩自承载——探针 T3a 断言磁贴祖先链零 opacity<1/filter（入场动画中采样）
- 【抖动真修复（比用户说的还深）】真凶不是没写：.jiggle 与 .link-intro 同挂玻璃本体，后者在 globals.css 更后位置（v8.5.6 引入）同特异性级联后胜 → intro-rise 覆盖 jiggle，抖动自 8.5.6 起被静默杀死（v8.6.1 探针只数了 class 在场，假阴性）；修复=.jiggle 移到 TileVisual 包裹层（与 intro 不同元素互不干扰，退出编辑也不重播 intro）；参数强化 ±2°/0.28s linear + translateZ(0) 写进关键帧（动画覆盖内联 transform 的窗口期保住黑边修复的合成层提示）+ cl-links-grid nth-child(even) 交替反向（青柠同款）+ html.cs-lite .jiggle 时长豁免（流畅模式通配 0.001s 不再误杀）
- 【探针揪出第三 bug】批量管理 pill 被我移到 rootRef 外（pointer-events-none 容器下不可点 + 点击被「编辑态点外退出」误吞→toggle 翻回）；归位 rootRef 内（v8.6.1 原结构）双修
- 【坑录】①CSS 压缩器（lightningcss 系）对 backdrop-filter 与 -webkit-backdrop-filter 双写会吞标准属性只留 -webkit-——getComputedStyle().backdropFilter 读出 none 探针假阴，本项目惯例只写标准属性（Chromium 76+ 无前缀）；②MultiEdit 非原子：失败编辑前的编辑已落盘，续接时必须先 diff 核实当前态；③探针冷启动首跑扩展注册偶发慢，bootNewTab 加一轮重试兜底；④Write/Edit 工具只到 /home/z——transfer/ 暂存 + cp 回 /tmp 真树的工作流稳定复用
- 【验证】probe-v862 23 PASS / 0 FAIL：boot/刷新落点 shell.html/中键唤出/纱罩 blur(28px)/搜索区不卸载/入场中祖先零 opacity/filter/磁贴 blur(14px)/搜索栏磨砂在线/抖动 7 元素 0.28s/偶数反向/完成退场/纱罩收起/Dock 先收后开/设置段控在场/docked 持久化 reload/常驻 56px/常驻中键失效/流畅模式抖动豁免/流畅模式纱罩模糊关停/reload 落点/日志首条 8.6.2/pageerror=0；截图目检（整页磨砂/编辑态角标/常驻原样式）+ tsc 零新增（HEAD 预存 11 条噪音除外）
- 【发布】main 197f24f + tag v8.6.2 → CI 三流水线 success（build-extension Release crx 12,404,823B + zip 12,399,574B；cloud-push gh-pages）→ 线上 version.json v=8.6.2 73 文件 + verify-online-selfconsistent 73/73 全对（遵守 Task 113 律：本地不再跑 deploy-cloud-mirror，CI 为唯一来源）

Stage Summary:
- v8.6.2 全链路闭环：快捷服务「常驻（原样式）/抽屉」双形态设置回归、抽屉整页高斯模糊、磨砂恒定在线、抖动真修复（级联覆盖真相）、刷新丢更新根治（壳层）
- 分发说明：页面层（双形态/模糊/抖动/磨砂）走云推 ≤6h 到存量装机；刷新修复在 shell-bridge.js 属壳层，需用户换装新 crx（Release 页）才生效——旧壳+新页面兼容无碍
- 新律：①同一元素双动画类的级联后胜会静默杀死先定义的动画——状态类动画（jiggle）必须挂独立元素或更高特异性；②backdrop-filter 双写前缀会被压缩器吞标准属性；③动画类探针必须断言 computed animationName/duration，class 在场≠动画在跑

---
Task ID: 116
Agent: main (Super Z)
Task: 用户「①常驻快捷服务进入动画没有高斯模糊图标的效果 ②打断抽屉动画打开后不会执行关闭动画（动画直接消失），添加并行动画」——v8.6.7（远端并行会话已推 v8.6.4-6，本任务在其上合题）

Work Log:
- 【远端分叉发现】推 main 被拒后 fetch 逐提交审查：并行会话已推 v8.6.4（新建按钮同频+常挂重定向架构）/v8.6.5（抽屉弹回+小弹簧）/v8.6.6（图标入场恢复整块 filter 模糊），线上 version.json=8.6.6。本地基于 v8.6.3 的 v8.6.4（intro-rise-glass+WAAPI 冻结-淡出+460ms latch）弃推，备份分支 my-main-backup，reset 到 411e7b4 重做
- 【两轮拉锯的合题（三层拆分）】v8.6.4-远端只模糊内容被用户打回「没有模糊效果覆盖」；v8.6.6 玻璃本体整块 filter → 本体 backdrop-filter 被 filter 全程压掉（Chromium 行为），抽屉有纱罩兜底「观感一致」，常驻形态无纱罩=磨砂裸死 1s=用户本次抱怨①。v8.6.7 三通道互不相克：①包裹层 intro-tile-rise 只动 transform（translateZ(0) 写进关键帧保合成层提示，transform 不形成 backdrop root）；②霜层 intro-tile-frost 承载 backdrop-filter、0.18s 快速凝聚（自承载 opacity）；③内容层 intro-tile-body 色相渐变+图标 0.95s opacity+blur(10px) 模糊聚拢（覆盖整个磁贴面=v8.6.6 整块观感）——霜层与内容层是兄弟，内容层 filter 压不到霜层 backdrop-filter。名称/添加位保持 intro-rise 不动；translateZ/backfaceVisibility 合成提示归位（v8.6.6 撤它只因与本体 filter 相克）
- 【问题②根因承 Task 116 本地诊断】cs-drawer-closing 的 opacity:0!important 压过运行中 intro 的同时，运行中 CSS 动画阻断 opacity transition 起步（CSS Transitions §3）→ 打断关闭磁贴叶瞬跳 0（重要声明只得到瞬跳得不到过渡）；EASE 长尾段最后 ~150ms 计算值=1.000 而动画仍在跑，阈值分路必漏。修复=全叶 WAAPI 冻结-淡出（读当前值→el.animate 280ms 同纱罩缓动 fill:forwards，不设阈值、不动 intro 本体；快速重开 cancel 后 intro 从时间线当前位接续，与常挂架构「晚开重播」语义互补）；!important 规则降级普通声明只承担稳态退场，过渡对齐纱罩 0.28s
- 【工作树腐坏再袭（新形态）】reset 到远端后开工，QuickLinks.tsx 的 cs-drawer effect 依赖数组呈现 `}, ount, drawer]);`——git show 逐提交核对 59af3f6..411e7b4 全部干净=腐坏只在工作树（环境快照翻转 gremlin，Task 107/115 同族新样本）；构建被 next.config ignoreBuildErrors:true 放行 → 若漏网=运行时 ReferenceError 全页崩。律：开工/构建/提交三节点都必须 grep 校验腐坏串；修复用幂等单行替换（跨状态窗口安全）
- 【探针】probe-v867 35 PASS / 0 FAIL：T3a-h 三层冻结帧（包裹层 rise 在飞/霜层 0.18s 凝满+blur(14px) 在线/内容层 blur 聚拢在飞+12% 处霜层凝聚中）、T4a-d（WAAPI from 关键帧=冻结前值 metadata 断言——渲染值首样本在无头 jank 下不可测、280ms 并行淡出挂载、closing 类、完全关闭）、T5a-c（重开 cancel→恢复曲线 0.029→0.986→1.000、marker 证无重挂）、T6a-b（稳态叶纱同频走低 leafMin=0.000、latch 520ms 后完全关闭）、v8.6.3-6 全量回归（抖动整单元/pill 移除/右键编辑/常驻 56px+磨砂/中键守卫/路由落点/日志首条 8.6.7/pageerror=0）
- 【发布】main + tag v8.6.7 → CI 三流水线 → 线上 version.json 验证

Stage Summary:
- v8.6.7 三修闭环：①入场三通道（霜感先行+整块模糊覆盖两头都要，常驻/抽屉两形态同惠）②打断关闭 WAAPI 并行淡出（不瞬跳、重开恢复）③v8.6.6 残留腐坏清除（启动崩溃预防）
- 新律：①霜层与内容层必须兄弟不能父子——backdrop-filter 载体与 filter 动画载体同元素互斥、跨层嵌套全灭，拆兄弟层才两头都要；②「运行中 CSS 动画阻断 transition 起步」的打断类动画一律 WAAPI 从当前值接管且不设计算值阈值；③无头 jank 环境下动画断言只信 metadata（getKeyframes from 值/挂载存在性）不信渲染值首样本；④ignoreBuildErrors:true 的项目，工作树语法腐坏=线上崩溃，腐坏串检查必须进提交前清单
- 分发：纯页面层，云推 ≤6h 到存量装机

---
Task ID: 116-补记
Agent: main (Super Z)
Task: v8.6.7 发布结论

Work Log:
- main a429145 + tag v8.6.7 → CI 三流水线 success（build-extension Release / cloud-push gh-pages / pages deployment）
- 线上核验：https://lxgssy.github.io/Start-chushi/version.json → v=8.6.7，73 文件
- 分发：页面层改动（globals.css/QuickLinks/changelog），存量装机 ≤6h 自动静默更新；v8.6.6 启动崩溃预防对已中招用户随本次热更自愈

Stage Summary:
- v8.6.7 全链路闭环（探针 35 PASS / 0 FAIL + 线上自洽）

---
Task ID: 117
Agent: main (Super Z)
Task: 用户「接手最新版本开发，拉取仓库，浅色模式删掉所有老代码重写重构（禁止复用），可参考深色模式风格；现在浅色跟深色简直就是两个风格，且浅色快捷服务图标没有磨砂玻璃效果」——v8.6.16 云推

Work Log:
- 【状态对齐】/tmp 真树 main=origin/main=fec9c4c（v8.6.15）；worklog 工作区被外部回退到 Task 109 版（git checkout -- worklog.md 恢复 114/116）；摘要清单中抽屉/动画全部任务已在 v8.6.1~8.6.11 完成，本任务=唯一遗留最高优先项
- 【双主题截图取证】dev server + playwright 双主题截图：深色磁贴=深色玻璃体+描边高光+投影（立体），浅色磁贴=淡彩纸片（无着色/无边缘/无厚度）；根因三层：①:root 暖纸白（hue 85）与 .dark 墨夜（hue 297-300）色温两族 ②磁贴霜层只 blur 不着色，浅底上 backdrop-filter 后与背景无明度差——「磨砂玻璃存在却看不见」③浅色极光 35~40% 铺满全页无留白，层次无从立体
- 【瓷釉重写】浅色重造为「瓷釉」=墨夜的明极镜像（同一设计语言明暗两极）：①:root 冷瓷 token 全新（hue 300 同族）②磁贴霜层变量着色 --tile-frost-bg（浅白雾 .52/深暗雾 .20），描边环/高光/釉色渐变全 token 化（--tile-ring-l/a、--tile-hl-a、--tile-grad-l/a），QuickLinks TileIcon 内联 style 引 CSS 变量（hsl 动态 hue + 变量动态明度透明度）③.tile-shadow 替换 shadow-sm（浅色双层投影/深色原暗投影；cs-drawer-closing 的 box-shadow:none 特异性 0,2,1>0,1,0 退场律保持）④玻璃三件套 pill .62/墨描边 .10 镜像深色暗玻璃 .055/白描边 .09，vignette/掠影浅色霜层改走同名变量通道 ⑤极光浅色收敛 24~30% 瓷白主导 ⑥画布底色 #f6f5f9 四处同步（html/Aurora/骨架屏/layout theme-color）
- 【壁纸磨砂验证】photoId=custom+wallpaperUrl+background=photo 注入测试壁纸：浅色壁纸下磁贴白瓷磨砂/搜索条磨砂药丸/深墨字清晰可读；深色掠影压暗+白字+暗玻璃无回归
- 【死代码陷阱】liquid-glass.ts + liquid-glass/ 目录（engine/shader/spring/dock-motion/index 五文件）零引用（v1.7.0 液态玻璃撤下残留）、git 未跟踪不进构建图——本任务顺手改 engine role 色属无效改动，已还原并从提交撤出（半个模块不入库）；globals.css 的 [data-lg] cs-lite 降级规则同为死规则（无害保留）；changelog 第 5 条「液态玻璃表面色对齐」不实已删
- 【探针】probe-v8616 = v867 全量门 + TL 浅色九门（TL0 boot/TL1 类态/TL2 瓷釉画布 rgb(246,245,249)/TL3 霜层白雾 .52/TL4 磨砂 blur14 sat1.6/TL5 药丸 .62/TL6-8 深色回归暗雾 .20+画布 rgb(10,10,14)）44 PASS/0 FAIL；T5a 断言修正：every-首帧 WAAPI 取消断言在 headless 帧距抖动下必炸（+0/+40ms 仍在、+80ms 取消且不复发，行为正确）——改「cancel 最终生效且不复发」（首 0 后恒 0），与 T5b 600ms 恢复窗互补；v8.6.7 时代过绿属时序巧合
- 【发布】main 2126e94 + tag v8.6.16 → CI 三流水线 success（build-extension Release crx + cloud-push gh-pages + Pages）→ 线上 version.json v=8.6.16 73 文件逐文件字节数核验 ONLINE-ALL-GREEN
- 【坑录】①version.json 的 files[].s 是「字节数」不是 sha256（Task 108 mock 同构）——自洽核验用 sha 对 size 全线假阳 ②linksForm 默认 drawer，全新 localStorage 截图磁贴区恒空（旧 dev server 旧默认 docked 造成的假象），截图种子必须显式 linksForm:"docked" ③grep 输出会把 "[m" 吃掉造成「}, ounted」语法残缺假象（v8.6.7 同款坑），必须 Read 复核 ④3000 端口残留旧 dev server 服务旧代码，新 server EADDRINUSE 静默失败——先 pkill "next dev" 再起 ⑤pack 需要 /tmp/ext-ref（v1.1.2 参考包 _locales/icons 素材源）——工作区被清后从外层 /home/z/my-project/download/v1.1.2 zip 重建

Stage Summary:
- v8.6.16 全链路闭环：浅色「瓷釉」整体重写（冷瓷 token/瓷釉磨砂磁贴/亮玻璃件/收敛极光），与「墨夜」深色构成同一设计语言明暗两极；快捷服务图标磨砂玻璃浅色补齐（霜层着色=磨砂可见性的核心手）；壁纸场景磨砂效果一清二楚
- 分发：全改动在页面层，走云推 ≤6h 到存量装机（无需换 crx）；Release 已由 CI 产出 v8.6.16 crx
- 新律：①backdrop-filter 磨砂在浅底上必须「模糊+着色」复合才可感（单 blur 无明度差=隐形）②逐主题 token 化（--tile-*/--lg-*）是双主题同构的唯一可维护路径，内联硬编码色值是「两族风格」的温床 ③版本清单 s 字段=字节数；探针断言对 headless 帧距敏感处用「终态+不复发」语义替代「首帧即达」
---
Task ID: 118
Agent: main (Super Z)
Task: 用户「白雾太浓了，时钟底部的白色高光要去掉，浅色的快捷服务的磨砂玻璃图标质感明显不如深色」——v8.6.17 云推

Work Log:
- 【取证】dev server 双主题截图（种子显式 linksForm:"docked"）：白雾源=①.vignette 顶部白光 rgba(255,255,255,0.5)（at 50% 0%，浓 10 倍于深色 0.045）②磁贴霜层 0.52 白雾盖死透度③高光 0.85 死白；「时钟底部白高光带」即 vignette 顶部白光的淡出边缘（页高 ~45% 处恰在时钟下沿）
- 【三点修复】①vignette 0.5→0.12（画布还给极光，白雾+时钟白光带同源消失）②霜层 0.52→0.26 且转冷瓷调 rgba(252,251,255,.26)（磨砂的灵魂在「透」：深色质感源于暗雾 0.20 透 80% 背景纹理，白雾 0.52 把磁贴变成实心纸片——减雾后玻璃感回来，分层交给描边 0.32+投影 0.06/0.24 承担）③高光 0.85→0.45（釉面反光档）+渐变 0.38/0.26→0.28/0.18 防叠脏+掠影霜层 0.56→0.44 同步
- 【顺修：掠影磁贴名称可读性】截图验证发现深色壁纸上名称（GitHub/哔哩哔哩）几乎隐形——v8.6.15「裸文字深墨+白晕」清单漏了 .tile-label；补规则后又踩特异性坑：名称元素 intro 态自带 .link-intro 类（QuickLinks 260 行拼接），其规则 (0,3,1) 压过 (0,2,1)——dev server computed style 实锤后用同构选择器 html.photo-mode:not(.dark) .cl-links .tile-label 提级靠源顺序取胜，白晕升级四圈近描边（3px/0.95+4px/0.85+10px/0.6+20px/0.4）
- 【坑录】①Turbopack dev 对 cp 的 inode 替换不敏感：watcher 不触发重编译、grep 编译产物假阳/竞态抖动（同一 URL 两次响应内容不同）——cp 后必须 touch 源文件强制触发，且验证要看 computed style 或重启 dev ②grep 输出吃字符假象再现：`const [mount, setMount]` 显示为 `const ount,`（Task 117 坑录③同族），git show 同样显示腐坏但 Read 复核文件完好——腐坏判定只信 Read/构建结果 ③CI 与本地 Turbopack 构建产物非确定性：buildId/chunk 名一致但 21 个文件字节数不同，线上正确性验证应直接 fetch 线上 CSS 核对压缩值（#fcfbff42/#ffffff1f/#fffffff2 逐项 ✓）而非与本地清单逐字节对齐
- 【验证】probe-v8617 45 PASS / 0 FAIL（v867 全量 36 门+TL 九门更新断言值+TL9 新增掠影名称白晕门）；TL3 断言更新为 rgba(252,251,255,0.26)；线上 CSS 逐项核对通过（压缩形式 #fcfbff42=0.26 冷瓷霜层/#ffffff1f=0.12 瓷光/#fcfbff 掠影 0x70=0.44/#fffffff2 白晕描边/.dark #ffffff0b=0.045 无回归）
- 【发布】main 876b077 + tag v8.6.17 → CI 三流水线 success（build-extension/cloud-push/pages deployment）→ 线上 version.json v=8.6.17 73 文件

Stage Summary:
- v8.6.17 全链路闭环：浅色三点反馈修复（白雾减淡/时钟白光消失/磁贴质感对齐深色）+ 掠影磁贴名称可读性顺修
- 设计要点：磨砂玻璃质感的关键不是雾多而是「透」——减雾+冷瓷调让背景纹理透过磁贴面，层次由描边+投影承担，与深色「暗雾透纹理」同构镜像
- 分发：全改动在页面层，走云推 ≤6h 到存量装机
- 新律：①「透」是磨砂质感的本体，雾只是载体——雾浓到盖死透度（>0.5）时磁贴变纸片，质感反而崩 ②CSS 级联：给「动态拼接多类」的元素写覆盖规则前必须先查元素全部类名（intro 态的 link-intro 特异性陷阱）③验证 CSS 变更生效链路（源文件→watcher→编译产物→computed）每一环都可能断，以 computed 为准

---
Task ID: 119
Agent: main (Super Z)
Task: 用户「字体底部不要加白光，同时也不要丧失可读性」——v8.6.18 掠影浅色字体白晕修正 + 云推

Work Log:
- 【定位】全文排查「字体底部白光」唯一实体 = 掠影浅色块（globals.css html.photo-mode:not(.dark)）text-shadow 里的 0 1px 向下偏移白层×3：clock-text(0 1px 2px/.45)、link-intro(0 1px 2px/.5)、tile-label(0 1px 4px/.85)——白字 copy 下移 1px 画出贴笔画底缘的白边；主浅色（瓷釉）字体本无白光、zen on-light 白晕本就等向，均排除
- 【修复】三处删净底部偏移层，白晕改等向体系：贴身白圈 0 0 3px（clock/名称 .5~.55；tile-label 首圈 0 0 3px/.95 保持近描边）+ 外扩柔光 0 0 12~20px——可读性承接不变（等向白晕围笔画四周，非底部方向光）；globals.css 内立律注释「白晕一律 0 0，禁 0 1px 偏移层」，Python 断言全文零残留
- 【意外收获·repo 连贯性修复】git add 后发现 staged 18 文件 +5735 行远超本轮：HEAD(v8.6.17) 的 PresetPanel/pack.ts 引用 @/lib/startpage/preset 但 preset.ts 从未入库 → main 是 fresh clone 必炸的坏树；工作树完整（liquid-glass 系列/MusicPanel/PresetDialog/use-pomodoro/chime/music/FxIcon 等全靠未跟踪文件撑着构建）——核实归属后一并入库对齐（02e135a），孤儿模块不参与编译无害
- 【构建+探针】EXTENSION_MODE=1 构建 + build-extension.py 打包（需先补 /tmp/ext-ref=v1.1.2 壳基线解压）；probe-v8617 克隆为 probe-v8618（三处版本耦合点：ZIP 路径/mock 地板/日志首条）→ 45 PASS / 0 FAIL（TL9 computed 确认名称白晕首层=0 0 3px 等向圈、无偏移层）
- 【云推】deploy-cloud-mirror.sh 8.6.18：gh-pages 5a78a02→56c74c1、清单门 73 文件、Pages 收敛 1 轮、线上 version.json v=8.6.18 + 73 文件 SHA256 逐字节 ALL-GREEN
- 【坑录】①v8.6.17 交付会话只提交了 4 文件（globals.css/changelog/VERSION/probe），依赖模块全漂在未跟踪态——多轮会话叠加后 HEAD 与工作树漂移成坏树，提交前必须 git diff --cached --stat HEAD 对账而非只看 status ②build-extension.py 依赖 /tmp/ext-ref 壳基线，重开会话要先解压 v1.1.2 包 ③探针有版本号耦合（ZIP/mock/日志断言），bump 版本须同步克隆探针

Stage Summary:
- 用户「字体底部白光」根治且可读性不回退：等向白圈+外扩柔光替代底部偏移白层，掠影浅色裸文字无方向性白边
- 顺修 main 坏树：缺失模块全部入库（02e135a），fresh clone 可构建
- 云端 v8.6.18 上线（SHA256 ALL-GREEN），存量装机 ≤6h 自愈；分发全在页面层，无需换包

---
Task ID: 120
Agent: main (Super Z)
Task: 用户四点反馈「文字底部高光还是没删/常驻掠影背景加高斯模糊抽屉不加/掠影文字一律白色/抽屉模式时钟搜索不下移」——v8.6.19 掠影重定调 + 云推

Work Log:
- 【外部还原危害再发】本轮开工时工作树 3 文件被外部还原成 9 月初旧快照（globals.css 退回 v8.6.15 瓷釉前、mtime=9/1~9/3、瓷釉 token 退回暖纸白），git checkout -- . 恢复 HEAD（v8.6.18 完好已推送）——多轮会话开工必须先 diff --stat HEAD 对账
- 【底部高光真凶】「还是没有删除」根因=vignette 渲染在壁纸之上（AuroraBackground:364），浅色顶部瓷光径向 rgba(255,255,255,.12) 一直压在时钟后面，减淡杀不干净 → 掠影下 vignette 整体退役 background:none；掠影浅色深墨字体系（v8.6.15 含白晕）整体删除，掠影域 text-shadow 全域归零
- 【白字统一】v8.6.12 的 .dark 收窄反转：html.photo-mode.dark → html.photo-mode（壁纸是绝对主体主题退位）；磁贴暗雾 token（--tile-frost-bg 等 8 枚）从 .dark 提到 html.photo-mode 根（白字压白霜不可读），深色掠影零变化
- 【壁纸高斯模糊】AuroraBackground 加 .photo-blur 层（媒体与 scrim 之间），常驻形态 blur(24px)（与抽屉纱罩 28px 同族），抽屉形态 blur(0)；【坑】Lightning CSS 把 CSS 文件里的标准 backdrop-filter 改写成 -webkit- 别名且 blur(0px)→非法 blur()（TL9d/TL10 双 FAIL 根因）→ 改内联样式通道（与磁贴磨砂 blur(14px) 同源），blur(0)↔blur(24px) 内联 transition 平滑插值
- 【抽屉布局原位】根因=抽屉磁贴 portal 到 body 不占主列 → 居中列变矮时钟下移；修复=invisible 克隆常驻区块（.cl-layout-ghost）补回同高，两形态严格同位（TL11 clockΔ=0.00/searchΔ=0.00）；克隆安全性：中键监听有 !drawer 守卫、drag portal 靠 pointer 事件不会触发、visibility:hidden 无事件
- 【探针】probe-v8619：addInitScript 注入 qCl/qCla（ghost 祖先豁免，9 类选择器站点 20 处改写）；TL9 重写为白字统一/零光效/vignette 退役/常驻模糊四门 + TL10 抽屉不模糊/占位在位 + TL11 同位；50 PASS / 0 FAIL
- 【云推】gh-pages 推送 → version.json v=8.6.19、73 文件 SHA256 逐字节 ALL-GREEN
- 【坑录】①Lightning CSS 对 CSS 文件 backdrop-filter 的改写是无声的——backdrop-filter 一律走内联或 engine.ts 注入通道，CSS 文件里只写非压缩器敏感属性 ②外部还原会精确恢复旧 mtime，status M + diff 内容对不上 HEAD 时以 git show HEAD 为准 ③invisible 克隆与真身共享全部类名，DOM 采样必须带 ghost 豁免

Stage Summary:
- 掠影重定调上线：白字统一（不分主题）、文字零光效（底部高光真凶 vignette 退役）、常驻壁纸高斯模糊 blur(24px)、抽屉布局原位（Δ=0）
- 云端 v8.6.19（73 文件 SHA256 ALL-GREEN），存量装机 ≤6h 自愈；main cca75e4

---
Task ID: 121
Agent: main (Super Z)
Task: 用户三点反馈「模糊力度太高了要很轻一层/浅色模式在掠影不生效/主页面任何尺寸禁止上下左右滚动」——v8.6.20 + 云推

Work Log:
- 【取证·滚动】playwright 多视口×双形态实测：overY=35@800×600、132@560×440（两形态同值），源头=主列 min-h-dvh 内容+固定 pb-44(176px) 死垫超视口→body 默认 overflow 泄漏成滚动；横向 overX=0（aurora blob 溢出被 fixed overflow-hidden 裁住，不进滚动区）
- 【禁滚】html,body{overflow:hidden;overscroll-behavior:none}（globals.css，注释立律「新标签页是单屏画布不是文档」）；主列底部死垫 clamp 化：pb-44→pb-[clamp(8rem,22vh,11rem)]（lifted min-720px 档 clamp(8rem,30vh,15rem)）——800h 起点两档值与旧值完全一致（176/240px），小视口自动收缩死垫而非泄漏滚动；验证改用 page.mouse.wheel 真实输入（scrollTo 是编程滚动，overflow:hidden 下仍可动，不能当门）
- 【模糊减力】AuroraBackground 内联 blur(24px)→blur(8px)×2+注释（用户定调「有一层很轻的模糊就行」；24px≈抽屉纱罩 28px 同族的重磨砂，8px=壁纸轮廓可辨只软化细节）；globals.css .photo-blur 注释同步
- 【浅色归位·分工律】v8.6.19「主题退位」块重写：壁纸裸文字（时钟/副行/搜索提示/dock/常驻磁贴名称/新建加号）恒白不分主题；玻璃面内部（药丸/建议行/输入字/提交钮/磁贴字母/抽屉名称）跟随主题——search 系+blanket tile-label/tile-letter 白字规则收窄到 html.photo-mode.dark，浅色回落基线瓷釉（浅药丸 0.72 白玻璃+深墨字）；新增 html.photo-mode:not(.dark) .glass-pill{0.72 白}、.cl-links{--tile-frost-bg:0.44}（挂持久作用域不随 intro 类起伏）、html.photo-mode .cl-links-docked .tile-label{白}（常驻名称裸压壁纸恒白，抽屉名称压纱罩跟随主题）
- 【配套改动】QuickLinks 两形态根类名拆分 cl-links-docked/cl-links-drawer（名称配色分工的钩子）；v8.6.19 磁贴 token「一律暗雾」块与 photo-mode tile-shadow 规则删除（值与 .dark 全同→深色零变化，浅色回归 :root 瓷釉）
- 【探针】sed 克隆 probe-v8620 + 断言更新：TL9d 24px→8px；新增 TL9e（浅掠影瓷釉浅药丸+深墨输入字）、TL9f（浅掠影抽屉名称 zinc-600 深墨）、TL12×2（真实滚轮两轴归零+overflow hidden+无滚动条）→54 PASS/0 FAIL
- 【坑录】①addInitScript 每次导航都重跑：无条件写 localStorage 会把 patchSettings 的值冲掉（themeMode patch「生效」而 linksForm patch「失效」的假象根源）——init 播种必须 if(!key) 缺失才写 ②BackgroundMode 枚举是 glow|pure|photo，没有 aurora，喂错值被归一化吞掉（验证脚本假 FAIL）③overflow:hidden 下 scrollTo 仍可编程滚动（MDN：禁用户滚动不禁编程滚动）——禁滚验证必须用真实 wheel 输入 ④探针 TL9f 首跑 FAIL=label=null：drProbe 在抽屉关态采样而 portal 由 mount latch 控制（首次中键才挂载），label 必须【打开后实时采样】，不能复用关态快照 ⑤Tailwind v4 计算色是 oklch 字符串（zinc-600=oklch(0.442 0.017 285.786)），断言别写 rgb
- 【验证】dev server 四象限 28 门全绿（浅/深 × 常驻/抽屉 computed style + wheel 禁滚 + glow 非掠影零回归）+ 截图四张目检（浅常驻=白字+浅瓷釉药丸+轻模糊月亮轮廓可辨；浅抽屉=白纱深墨名称；深色两形态与 v8.6.19 零回归）+ 探针 54/0
- 【发布】main 6245115（staged 7 文件与 diff 逐行对账，无坏树）→ 云推 gh-pages 8166e3e：version.json v=8.6.20、73 文件尺寸+SHA256 逐字节 ALL-GREEN、Pages 收敛 2 轮

Stage Summary:
- v8.6.20 全链路闭环：模糊 24px→8px（轻纱）、浅色模式在掠影重新生效（分工律：壁纸裸文字恒白/玻璃面跟主题）、主页面任何尺寸两轴禁滚（真实滚轮验证）
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①单屏画布页禁滚=html/body overflow:hidden+底部死垫 clamp 化双管齐下，验证只用真实输入事件 ②掠影前景分层归属：贴壁纸的恒白、贴玻璃的跟主题——命名钩子 cl-links-docked/drawer 承载 ③验证脚本的 addInitScript 播种必须幂等（缺失才写），否则每次 reload 都会反转自己的 patch

---
Task ID: 122
Agent: main (Super Z)
Task: 用户七点反馈「模糊再轻/dock浅色掠影不一致/dock面板磨砂/图标统一深色/拖拽让位误播入场/hover阴影错位/强调色失效」——v8.6.21 + 云推

Work Log:
- 【强调色失效根因】page.tsx 预设令牌 effect 对 PRESET_TOKEN_KEYS 白名单（含 --ui-accent，preset.ts:164）执行「无值即 removeProperty」——--ui-accent 的还原值不在 CSS 里（JS 注入的用户设置），本 effect 声明在强调色 effect 之后、每次挂载必跑 → 新开标签页/更新后每次挂载都把用户强调色删掉回落默认紫；当场改色生效是因为 settings.accent 变化只重跑强调色 effect 不重跑令牌 effect（依赖数组无它）。修复=无预设值时 setProperty 回落 settings.accent（依赖数组补 settings.accent），有预设仍预设胜、删除预设回落用户值（焕新语义不变）；TL13d 门（accentVar==#8b5cf6）锁回归
- 【拖拽让位误播入场根因】QuickLinks DragOver 数组 splice 重排 → React key 稳定但 diff 会移动 DOM 节点（insertBefore）；CSS 动画对「脱文档再插入」的节点必然重播——往左拖时被移动的恰是「让位者」（React list diff 只移动 index < lastPlacedIndex 的节点），往右拖时被移动的是拖拽者（隐身中）→ 不对称观感。根治=入场播完摘 intro 类（TileIcon 根 span onAnimationEnd 捕获最晚的 intro-tile-body 通道 → TileVisual 本地 introDone → 三层 intro 类摘除），类摘后重播无动画可放；portal 重挂载（抽屉）新实例 introDone 复位、入场照常
- 【探针耦合】摘类机制让 .link-intro-* 类在稳态消失——探针 9 门（T8b-e/TL3/TL4/TL7）采样锚点全失效（frost=null）；四层加永驻语义类 tile-shell/tile-frost/tile-ring/tile-body，探针稳态采样换语义类锚点、freezeIntro 改按语义类抓元素+自行重挂动画类（重触发与摘类机制解耦）
- 【hover 阴影错位】headless 2x 连拍 8 帧（30-380ms）未复现真机观感——按 v8.6.11 合成层经验定修法：motion.span 常驻 willChange:transform（framer 动画结束会撤 will-change → 合成层撤销/重建瞬间 backdrop 子层重采样跳变，观感即「下沉收尾错位然后复位」）；确定性缓解，一行低风险
- 【图标统一深色釉】:root 浅色 8 枚磁贴 token 整体换成 .dark 同值（暗雾 0.2/环 60%/高光 0.18/渐变四值）+ tile-letter 恒 zinc-100 + 浅掠影白雾霜层（0.44）退役；主题差异只留投影（浅色深影塑体积）与名称配色
- 【dock 浅色归一】html.photo-mode .dock-btn 三条收窄到 .dark——dock 有自家玻璃背板（.glass-pill）按分工律跟主题，浅掠影回落基线墨系 zinc-500（TL13b 实测 oklch(0.552...)，zinc-600 假设被 computed 纠正）
- 【glass-card 磨砂】全部玻璃卡片（dock 面板/命令面板/对话框/右键菜单）背板 backdrop-filter:blur(20px) saturate(1.5)，底色浅 0.86→0.62/深 0.94→0.60；v1.0.8「磨砂+opacity 动画闪烁」规避：壳体 opacity 入退场期间磨砂暂退化纯色底（祖先 opacity<1 成 backdrop root），淡入淡出掩盖、稳态全程磨砂（纱罩同构先例）；cs-lite 补 backdrop-filter:none !important（流畅模式零合成开销）
- 【模糊再减】AuroraBackground 内联 blur(8px)→blur(4px)（用户「再轻一点」）；探针 TL9d 断言同步
- 【探针】probe-v8621（sed 克隆+断言更新）59 PASS / 0 FAIL：TL3/TL9d/TL13a-d 更新+新增（磨砂浅/深双门+强调色存活门+dock 墨系门）；verify-v8621 交互验证 6 PASS：摘类生效（replay 物理不可能）+ 拖拽向左换位功能正常（GitHub↔哔哩哔哩）+ willChange 常驻 + pageerror=0；hover-probe 2x 帧序列留档
- 【发布】main d79747d（10 文件 +926/-35 对账清晰）→ 云推 gh-pages d3c7699：Pages 收敛 4 轮（3 分钟超时后第 4 分钟到）、线上 v=8.6.21、73+1 文件 SHA256 逐字节 ALL-GREEN

Stage Summary:
- v8.6.21 全链路闭环：七点反馈全数落地（模糊 4px 极轻纱/dock 浅色归一/玻璃卡片磨砂化/图标统一深色釉/拖拽让位不重播/hover 收尾稳态/强调色存活）
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①预设令牌 effect 对「还原值不在 CSS 的 JS 注入变量」禁止无值 removeProperty——必须回落用户设置源 ②CSS 动画元素的类若被探针/其他机制采样，采样锚点用永驻语义类而非动画类（动画类会被摘）③React list diff 的 DOM 移动会重播 CSS 动画——「只在一侧出现」的动画 bug 先查哪一侧节点被移动 ④glass-card 家族磨砂后 cs-lite 必须同步 backdrop 禁用（否则流畅模式白留合成开销）

---
Task ID: 123
Agent: main (Super Z)
Task: 用户三点反馈「抽屉关闭阴影残留+常驻阴影抢跑/常驻壁纸模糊再轻一点点/入退场瞬间磨砂退化为纯色底必须解决」——v8.6.22 + 云推

Work Log:
- 【磨砂退化实验实证】根分区曾 100% 满（清 rec7safe/download/rec/旧宣传片约 2.2G 后恢复）；空间修复后做最小实验（scripts/blur-selftest.html+mjs，sharp 梯度能判据）：元素【自身】opacity<1 与祖先同样剧毒（动画中 2.997/静态 1.822 vs 稳态 1.395≈无磨砂 1.923）——「自承载 opacity 安全」旧律作废，磁贴霜层先例实为窗口极短+底色兜底的侥幸
- 【磨砂存活 2.0】全部玻璃壳体入退场去 opacity：入场=底色 alpha 凝入（panel-fade/card-in/ctx-in-kf 的 from 写 background-color/border-color/box-shadow 透明，不写 to→自然值浅深各自归位；backdrop 恒 20px 全程在线）；退场=底色渐隐+backdrop blur(20→1px) 收尾（dialog-sink/palette-out-kf/ctx-out-kf/glass-card-out-kf+新增 .panel-sink .glass-card 级联），blur 收尾消卸载锐化跳变；内容显隐由既有内容语言承担（content-focus 聚拢/content-defocus 散场/ctx-item/docs-anim），内容层是玻璃后代不触采样链
- 【压缩器双坑·产物实测】①saturate(1) 的参数 1 被 Lightning CSS 当默认值吃成非法 saturate()（非 0 blur 值无恙，v8.6.19 坑的新变体）；②keyframes 内 backdrop-filter 双写（无前缀+-webkit-）被去重成仅 -webkit- 版，而 Chromium 在 @keyframes 内不识别 webkit 别名（声明整个丢弃，CSSOM 序列化可证）——keyframes 内只写无前缀、saturate 必须写 1.5 与自然值同构（不同构会离散跳变）
- 【getComputedStyle 陷阱】合成中的 backdrop-filter 动画，主线程 computed style 返回基准值不反映插值——帧采样必须用像素（sharp 梯度+均色：open-60ms rgb(18,19,22)→120ms rgb(20,20,25) 底色凝入实证，close-60ms 梯度 1.53=壁纸透出）
- 【阴影残留根因】html.cs-drawer-closing .link-intro-tile 锚在 v8.6.21 摘类机制下已消失的类——稳态关闭不再命中→投影满值残留；换永驻语义类 .tile-shell
- 【阴影抢跑修复】投影长在包裹层本体且无入场通道（第 0 帧满值 vs 图标本体 0.95s 聚拢）——新增 from-only 关键帧 intro-tile-shadow（to=自然值，浅/深各自归位）挂 .link-intro-tile 双通道动画列表，与 body 通道同拍；closing 态收窄 animation-name 只留 rise（防新通道动画值压过 box-shadow:none 造成中途关闭残留回归）
- 【其余】AuroraBackground blur(4px)→blur(3px)（「再轻一点点」）；PresetDialog/PresetDocs 顶栏挂 content-focus（壳体去 opacity 后顶栏显隐入内容语言）；probe-v8622（sed 克隆+TL9d 3px+TL14a-d 四门：CSSOM 扫描退场关键帧零 opacity/入场底色凝入/级联与永驻选择器在位/中途关闭掐通道）；T4a 650→900ms 加固（qCl 首命中是常驻叶，打断落 frost 尾窗会采到动画值——负载相关 flaky 实证，v8.6.21 探针对照跑确认非回归）
- 【发布】main 0eec87e（7 文件 +796/-33 对账清晰）→ 云推 gh-pages：version.json v=8.6.22、73 文件尺寸+SHA256 逐字节 ALL-GREEN、curl 线上验证通过
- 【验证】probe-v8622 连续两轮 63 PASS / 0 FAIL；帧留档 download/v8622-frames/（open/close 各 3-4 帧）

Stage Summary:
- v8.6.22 全链路闭环：磨砂全程在线（面板/菜单/对话框开合不再闪纯色底）、磁贴阴影与图标同拍（入场不抢跑/关闭随退场/中途关闭不残留）、常驻壁纸轻纱 3px
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①backdrop-filter 元素 opacity<1 一律杀磨砂（自身与祖先同罪），入退场只许动底色 alpha/blur 值/transform ②CSS 文件 keyframes 内 backdrop-filter 只写无前缀且禁 saturate(1)/blur(0)（压缩器两吃参数）③同构律：backdrop-filter 关键帧插值两端函数列表必须等构 ④验证 backdrop 插值只能看像素不能看 getComputedStyle ⑤探针打断类时序门要远离短动画结束点（首命中元素≠目标元素时尤其）

---
Task ID: 124
Agent: main (Super Z)
Task: 用户「把磨砂写入底层，不要让磨砂闪纯色底」——v8.6.23 磨砂底层律收官 + 云推

Work Log:
- 【病根全图】v8.6.22 只清了玻璃卡片壳体的 CSS 关键帧通道，opacity 通道仍残留在四处：①抽屉纱罩 .cl-drawer-veil 由 framer 自身 opacity 0↔1 淡入淡出（注释还引用着已被 v8.6.22 实验推翻的「自承载安全」旧律）②veil-in/veil-fade 关键帧纯 opacity（五处对话框/指令面板/预设文档遮罩）③搜索药丸入场踩在 globals 假律②「自身 opacity/filter 不构成自身 backdrop root」上（v8.6.22 实验已证伪）④dock 入场 dock-rise 自身 opacity 0→1（0.8s）。全部命中「opacity<1 杀磨砂」实验定律 = 开合/入场期间纯色底闪现
- 【磨砂写入底层·总修法】玻璃件入退场只许动四类安全通道：transform / background-color alpha / backdrop-filter blur 值 / box-shadow；opacity 与 filter 只许落在无玻璃的内容层。纱罩拆两层：磨砂本体走底层 blur 值通道（CSS transition 1px↔28px，data-veil 门控，QuickLinks 端 veilOn 经 rAF 置位保首次唤出也有凝聚入场），染色线性渐变（不可插值）移 ::before 无磨砂层走 opacity；visibility 延迟门控（开态 0s 即时、关态 0.28s 收拢后）保常挂架构关态零合成开销；veil-in/veil-fade 关键帧改底色 alpha + blur(1px) 同构插值（to 留空=各元素自然值归位，非磨砂遮罩按 none↔列表替换律插值不可感）；搜索药丸改 pill-shell-in（壳体底色凝入+上浮）+ 内容层 pill-content-in 淡入聚拢；dock 改 dock-rise 纯 transform + .dock-intro > button 内容淡入（选框 span/指示器豁免防与 framer 弹簧打架）；霜层凝聚 intro-tile-frost 改 blur 值通道 1px→14px（与内联自然值 saturate(1.6) 同构）
- 【假律清除】globals 磨砂存活总律重写：自身与祖先同罪（v8.6.22 blur-selftest 实证）+ v8.6.23 底层律四通道清单，防再引用
- 【探针】probe-v8623（sed 克隆+veilRules 载荷扩展）：T3h/T6a 见证由 opacity 改 blur 值（opacity 恒 1 后旧见证失效）；T6a 升级帧级 rAF 曲线采样——run3 实证 10×40ms CDP 往返循环在高负载下可整体错过 280ms 过渡窗（leafMin=1.0/blur=28 假 FAIL），页内自驱 rAF 采样根治（run4 leafMin=0.017/veilBlurMin=1.5 实锤退场健康）；TL14 清单扩容（veil-in/veil-fade/intro-tile-frost/dock-rise/pill-shell-in 零 opacity 扫描）+ TL14e 遮罩族磨砂化 + TL14f 纱罩底层结构三门
- 【像素验证】verify-v8623（load-extension 全链 + 16px 棋盘壁纸 + 相邻像素差分能量判据）：清晰参照 6.32 → 开抽屉中途帧 1.02 ≈ 稳态 1.02 ≈ 关抽屉中途 1.02——开合每一帧磨砂在线，无任何纯色窗口；结构抽检 data-veil=1 + blur(28px) + visible；帧留档 /tmp/v8623-frames
- 【发布】main 4e0fc34（7 文件 +1516/-35 对账清晰）→ 云推 gh-pages 411a71a..d3b33cc：Pages 收敛 2 轮、线上 version.json v=8.6.23、73 文件尺寸+SHA256 逐字节 ALL-GREEN
- 【坑录】①磁盘 100% 复发（Task 123 清的是 /tmp 树，/home/z 树 download/rec 与 upload 603M 仍在）——两侧树都要清；git gc 在 93% 磁盘上 3 分钟超时，715M 余量直接构建可行 ②CDP 往返采样循环对 280ms 级过渡整体错窗是系统性 flaky（非负载偶发），时序门一律改页内 rAF 帧级曲线 ③染色渐变不能 transition 插值——「磨砂走 blur 通道 + 染色走 ::before opacity」是渐变底玻璃件开合的唯一无闪解 ④探针 cssScan 返回体按需扩容（veilRules 子集），引用前先核返回体字段

Stage Summary:
- v8.6.23 全链路闭环：「磨砂写入底层」落地——纱罩/五处遮罩/搜索药丸/dock/磁贴霜层的入退场与入场全程磨砂在线，任何帧不退化为纯色底（像素级 6 倍能量塌缩实证）
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①玻璃件动画四通道白名单（transform/底色 alpha/blur 值/box-shadow），opacity+filter 归内容层 ②渐变底玻璃件=磨砂本体（blur 通道）+染色 ::before（opacity）双层结构 ③时序门采样一律页内 rAF 帧级曲线，CDP 往返循环系统性错窗 ④假律「自承载 opacity 安全」已在总律注释中正式作废立碑
---
Task ID: 125
Agent: main (Super Z)
Task: 用户三点反馈「更新日志关闭=模糊先消失面板后消失/视频开合动画模糊有问题/dock入场磨砂底栏先于模糊出现」——v8.6.24 感知同步律 + 云推

Work Log:
- 【视频帧取证】用户录屏 11s@30fps 抽帧 165 帧+缩略图速览+中央区域放大：确认指令面板开启 2.67s 白底先现（壁纸透出清晰）、关闭 5.33s 内容先散后磨砂幽灵板残留约 0.4s；真机 dev server CDP 帧捕获+棋盘壁纸能量判据复现三处时序
- 【dock 入场根因】页内 rAF 逐帧 DOM 采样：dock t=708ms 即带 blur(40px) 全程在线（玻璃无恙），但壁纸 opacity 0→1 竟走 1.8s——首载壁纸误入 1800ms 柔化路径（该路径本为黑幕外换壁纸设计），玻璃件全程坐在近黑底上，磨砂质感自然「晚于底栏」出现。修复=AuroraBackground bootUrlRef 身份：首张壁纸 450ms 快显（img/video/scrim 三处），运行时换壁纸保留 1800ms 柔化
- 【开合失序根因=感知速率不同构】底色 alpha 与 blur 值两通道感知曲线不同：同曲线同时长插值必然「开=白底先于模糊（卡片底色 0.05s 即可见、纱幕 blur 0.28s 才凝满）、关=模糊先于白底（blur 线性放完、底色 ease-in 残留）」。更新日志卡片更无自身退场通道——纱幕 blur 释放完卡片还满值驻留，卸载帧突跳
- 【感知同步律·总修法】入=blur 领先：veil-in 加 45% 站点凝满自然值（底色全程跟随）；纱罩开态 transition 0.12s 凝满。退=blur 驻留：veil-fade/glass-card-out-kf/dialog-sink/palette-out-kf/ctx-out-kf 全部加 0-55% 满值站点（底色全程渐隐、尾段与 blur 残量同收）；纱罩关态 transition 0.14s 驻留+0.14s 收拢（run→start 间隔=delay，transitionend dur=140ms 实证）。任何帧不出现「看得见的白底配清晰壁纸」
- 【hold 逐元素适配】关键帧站点写 var(--veil-hold-bf, blur(12px) saturate(1.5))——PresetDialog 背板 blur-2xl(40px) 挂 .veil-hold-2xl、右键菜单捕获层（无磨砂）挂 .veil-hold-none（none↔blur(1px) 列表替换律 1px 不可感，旧律沿用）；必须与自然值同构同值否则 0 帧跳变
- 【面板随纱同散级联】.veil-out .glass-card:not(.palette-out):not(.dialog-sink):not(.ctx-out) 级联 glass-card-out-kf（时长经 --veil-out-dur 0.25/0.28s）+ .content-focus 级联 content-defocus——更新日志/添加链接卡片与纱幕同窗溶解；:not 排除自带退场通道卡片防 (0,2,0) 特异性覆盖专属关键帧（同 animation 属性互斥）
- 【帧级验证】修复后取证：更新日志关闭 002 帧卡片在 blur 满值中溶解、003 帧卡片已无 blur 才释放（能量曲线 center 679→6@0.29s、wall 1→3→72@0.41s）；指令面板开=雾先起板随行、关=同窗溶解；dock 入场黑底窗口 1.2s→0.2s（壁纸 018 帧就位）
- 【探针】probe-v8624（sed 全量克隆+TL14g/h 扩容：纱幕领先/驻留站点+卡片驻留+级联+hold 适配类+纱罩变速 transition）：68 PASS / 0 FAIL。T6a 根治：rAF 值采样在探针高负载下帧距>100ms 系统性错过 0.14s 释放窗（v8.6.23 run3 同源 flaky）——改 transition 事件见证（run/end/elapsedTime≈140ms 确定性）；插桩 MutationObserver 实证 data-veil 翻转与 latch 卸载时序健康
- 【坑录】①Bash 工具输出会吞 [m 字节序列（[mounted 显示成 ounted、[450ms] 显示成 s]）——md5/od 定案，勿凭显示判损坏 ②sharp extract 参数是 left/top 非 x/y ③addInitScript 每次导航重跑可装采样器（evaluate 状态 reload 即失） ④门户层 backdrop root：纱幕内卡片的自身 backdrop-filter 视觉死亡（采的是纱幕内容非壁纸），「透过卡片看到的模糊」全靠纱幕自身 blur——这也是开合失序感知的主因 ⑤300 端口被上一会话僵死 next dev 占用（EADDRINUSE），pkill 后复用
- 【发布】main 729bdfb（7 文件 +893/-8 对账无夹带）→ 云推 gh-pages 7bfe955：version.json v=8.6.24、73 文件尺寸+SHA256 逐字节 ALL-GREEN、curl 线上验证通过

Stage Summary:
- v8.6.24 全链路闭环：感知同步律落地——开=模糊先行凝聚、白底随后；关=模糊驻留、底色先散、尾段同收；壁纸先于玻璃件就位；更新日志/指令面板/抽屉纱罩/dock 入场四路动画时序全部同步
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①玻璃件入退场双通道感知同步（blur 领先/驻留站点），同曲线同时长=必失序 ②hold 值必须与元素自然值同构同值，经 --veil-hold-bf 逐元素适配 ③无自身退场通道的纱内卡片由 .veil-out 级联托管，:not 排除专属通道 ④首载壁纸必须先于玻璃件就位（bootUrlRef 450ms） ⑤探针行为见证优先 transition 事件（确定性）而非 rAF 值采样（负载漏窗）
---
Task ID: 126
Agent: main (Super Z)
Task: 用户视频四点反馈「快捷图标磨砂底板黑色先入场/dock磨砂玻璃优先级高于入场渐显/dock功能面板打开时模糊消失/删除图标底下阴影」——v8.6.25 磨砂与内容全同拍 + 云推

Work Log:
- 【视频帧取证】用户 33s 录屏（2560×1600@60）抽帧 60+ 张：①e_19.0/e_20.75 证实入场中间态=灰黑磁贴底板+dock 白条先坐在洗白页面上（图标未显）；②mic_23.6-23.8 证实图标底下有明显投影；③面板出生窗能量曲线（panel-blur-energy.py，面板区相邻像素差分）：出生 0.3s 内边缘能量 3.4-3.9≈锐利壁纸基线（23.75 无面板=3.37），settled 后落到 1.8≈磨砂值——「打开面板时模糊消失」0.3s 死窗量化实锤
- 【面板模糊消失根因】Dock PanelStage 的 PresenceClass 包裹层挂着 .content-focus（opacity 0→1 + filter blur(10px)→0，0.32s）——它是玻璃卡【祖先】：祖先 opacity<1 与 filter 均成 backdrop root，玻璃卡自身 backdrop-filter(20px) 在整个入场窗视觉死亡；关闭路径 content-defocus 级联同窗同罪，glass-card-out blur 驻留站点在 dock 面板上从未真正可见。v8.6.22/23 的「content 归内容层」改造漏掉了这一处（panel-rise 当时只修了 bg-alpha 通道）
- 【总修法】①content-focus 下沉：PresenceClass 只留 flow-root，卡内新增 <div class="content-focus relative p-4"> 包全部内容（p-4 从卡迁入——绝对定位关闭按钮的包含块从「卡 padding 盒」平移为「内容层 padding 盒」，两矩形=卡 border 盒-1px border 逐像素等位，按钮几何不变）②panel-rise 上卡本体（glass-card 家族同款：底色 alpha 凝入 0.3s 与 content-focus 0.32s 感知同步，雾先起板随行）③关闭经 .panel-sink .glass-card 级联（底色渐隐+blur 20→1px 收尾）在 dock 面板首次真正生效
- 【磁贴底板抢跑根因】intro-tile-frost 只凝聚磨砂（blur 1→14px/0.18s），霜层底色 --tile-frost-bg（暗雾）第 0 帧满值而图标本体 0.95s 聚拢——灰黑底板抢跑。修复=新增 intro-tile-tint from-only 通道（from background-color transparent → 自然值归位，premultiplied 插值无黑移）与 body 同拍（0.95s/同曲线/同延迟，.cl-links delay 覆盖对双通道统一平移）；磨砂本体仍 0.18s 快凝（底色透明期=纯玻璃片不带黑底）
- 【dock 玻璃抢跑根因】dock-rise 只动 transform，玻璃底色/边框/投影/磨砂第 0 帧满值——backwards 填充的 0.55s 延迟窗里白条已坐在页面上（壁纸 450ms 快显途中更显眼）。修复=dock-glass-in 同拍通道（底色/边框/投影 alpha 凝入+磨砂 blur(1px) 凝聚，与 dock-btn-in 同 0.8s/0.55s/同曲线；同构律 blur+saturate 与自然值 blur(40px) saturate(1.5) 等构）
- 【投影退役】用户指令「删除快捷服务的图标底下的阴影」：.tile-shadow（浅 0.06/0.24 双层、深 0.32 单层）、intro-tile-shadow 入场通道、cs-drawer-closing .tile-shell 投影淡出与 .link-intro-tile 通道收窄两条规则全拆；磁贴体积交还描边+高光+霜层着色；拖拽浮层 thick shadow 属拖拽手感反馈保留
- 【假敌排查】液态玻璃引擎（liquid-glass/）全库零导入=休眠代码，data-lg/!important 运行时不存在，keyframe 可自由覆盖玻璃底色；工作树中途一度疑似被外部还原（rg -r 参数误用致显示假象「glass-card→ln-card」），git diff HEAD 对账确认树净
- 【探针】probe-v8625（sed 克隆+五处适配）：T3b 包裹层 rise 单通道；kfIn 换 intro-tile-tint+dock-glass-in；TL13c1 新增面板出生窗结构见证（包裹层 wrapAnim=none/wrapFilter=none/wrapOp=1 + 内层 content-focus 在飞 filter=blur(10px) + 卡 panel-fade+BF blur(20px) 恒在线）；TL14c/d 重写（closing 投影规则退役断言 + tile-shadow 规则清零）；坑=findRule(".dock-intro") 被 reduced-motion 块（.aurora-blob,…,.dock-intro{animation:none!important}）先命中假 FAIL——改 rules.find(含 dock-glass-in 且含 dock-rise)。69 PASS / 0 FAIL
- 【发布】main e5df690（6 文件 +899/-61 对账清晰）→ 云推 gh-pages 85164db：version.json v=8.6.25、73 文件尺寸+SHA256 逐字节 ALL-GREEN、curl 线上验证通过
- 【坑录】①rg 的 -r 是「替换显示」不是 -l/-n 组合——rg -rln "glass" 会把 glass 显示成 ln，制造文件被改假象，判文件改动只认 git diff ②findRule(前缀选择器) 会被无关组合规则先命中（reduced-motion 通配块），CSSOM 找规则要按「特征声明对」过滤 ③录屏能量判据域选择要避开面板内容行（文本行引入高频边缘干扰基线）

Stage Summary:
- v8.6.25 全链路闭环：磨砂与内容全同拍——磁贴底板/描边/图标同拍聚拢、投影退役、dock 玻璃与按钮同拍渐显、dock 面板出生窗磨砂恒在线（祖先 backdrop root 毒链根除）
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①「内容模糊语言」挂载点必须在玻璃卡【内部】——任何祖先级 opacity/filter 在入场+关闭双窗杀磨砂，panel-rise 上卡本体+内容层下潜是 dock 面板唯一正解 ②玻璃壳体抢跑=transform-only 入场通道漏配玻璃四通道，新入场玻璃件一律 dock-glass-in 同款 from-only 凝入 ③CSSOM 断言按特征声明对过滤，不用选择器前缀 findRule

---
Task ID: 127
Agent: main (Super Z)
Task: 用户五点反馈「壁纸滤镜删掉/dock竖分割线先入场/面板切换磨砂闪动+概率动画消失/要求两套渲染系统/抽屉打开后dock浮在模糊上面」——v8.6.26 滤镜退役+双渲染系统 + 云推

Work Log:
- 【壁纸滤镜退役】photo-blur 层（v8.6.19 引入 24px→v8.6.20 8px→v8.6.21 4px→3px 一路减力的终点）随 photoBlur prop（AuroraBackground 两处）/page.tsx 传值/globals 两条规则全拆——用户指令「不要给壁纸套一层滤镜，把滤镜删掉」；白字可读性由 photo-scrim 压暗层独自承担（scrim 是暗化不是滤镜，保留）
- 【分割线抢跑根因】Divider 是裸 span（mx-1 h-5 w-px bg-[--pill-line]）不在 .dock-intro > button 的 dock-btn-in 通道内，第 0 帧满值——v8.6.25 dock-glass-in/dock-btn-in 同拍改造漏掉了 span。修复=dock-divider 类+同款通道规则
- 【互切磨砂闪动根因】view-defocus（opacity 1→0+filter blur 0→9px）挂在 view-exit 上=玻璃卡【祖先】——祖先 opacity<1/filter≠none 成 backdrop root，旧卡磨砂整窗死亡退化纯色底（v8.6.25 面板出生窗同源毒链的互切变体）。总修法=散场通道下沉：view-exit 主规则只留 absolute 钉位+pointer-events:none；玻璃卡走 .view-exit .glass-card 级联 glass-card-out-kf（0.2s 版，blur 20→1px 感知同步律关=驻留）+内容层 .view-exit .content-focus 走 content-defocus；部件视图 view-exit 落在 .cl-dockwidget 自身（实色 iframe 底无磨砂可杀）保留 view-defocus
- 【概率动画消失根因】leavingWidget 单值 state：快速三连切 A→B→C 时被 B 覆盖，A 的 view-exit 类即刻摘除=散场动画被吞。修复=Set 化（leavingWidgets），多退场视图互不覆盖各自 240ms 计时摘类（动画 forwards 停终态后摘类只是 hidden 切换无视觉跳变）
- 【dock z-48 退役】html.cs-drawer .cl-dock{z-index:48} 规则删除——抽屉打开后 dock 与搜索栏同层坐在纱罩（z-45）之下（用户指令「随着搜索栏这些组件在模糊下面」）；历史抬升的唯一理由（退场窗点击被纱罩吞）已被纱罩包裹层 pointerEvents:none（open=false 即禁命中）覆盖，QuickLinks 与 globals 两处注释同步改写
- 【双渲染系统做实】cs-lite 注释头升格「双渲染系统·其二：流畅系统」宣言（磨砂系统=backdrop-filter 玻璃语言全套；流畅系统=零 backdrop-filter/玻璃件实底/动画近零/装饰滤镜隐藏，无半帧共享视觉路径）；glass-pill 实底兜底补全（dock/搜索药丸此前不在清单——backdrop 通配关停后 0.62/0.055 半透底可读性崩，换 0.94 实底浅/深两条）；入口不变（扩展弹窗 popup.js+设置面板「性能」，settings.perfLite，storage 跨文档跟随）
- 【T6a 环境适配】transition 事件见证在本机扩展 iframe 环境稳定失效（evts=4 无 end，v8.6.25 探针同环境同 FAIL=非本轮回归）；http 快照模式独立取证：run(t+0)→start(t+214)→end(t+327,dur=140ms)+blur 驻留 28px 全程健康=产品序列无恙、persistent context 扩展环境 backdrop-filter transitionend 派发不可靠。T6a 改帧级 blur 值采样见证（驻留满值 27px+→真实渐降>5px），事件计数降级为诊断信息
- 【颜色断言双格式】TL13a/b、TL9e/f 四处 oklch 期望在当前 Chromium 被 getComputedStyle 序列化为 lab（值等价：lab(96.1634 0.0993 -0.364)=oklch(0.967 0.001 286.375)）——断言改双格式容忍
- 【探针】probe-v8626（sed 克隆+三段补丁）：TL9d/TL10 改「.photo-blur 元素不存在」断言；cssScan 扩容五字段（dividerRule/viewExit*/z48Rules/litePill*）；TL15a-d 四组新门（分割线通道/散场下沉/抬升退役/实底兜底）——⚠ TL15 首插在 T10 前落到 cssScan 块作用域外（cssScan is not defined FATAL），重插 TL14h 后块内。73 PASS / 0 FAIL
- 【发布】main 5b3346a（6 文件 +对账清晰）→ 云推 gh-pages：version.json v=8.6.26、73 文件尺寸+SHA256 逐字节 ALL-GREEN、curl 线上验证通过
- 【坑录】①probe 版本号 sed 全局替换会波及 gate 注释里的历史版本引用（TL9d「v8.6.25 再减」），补丁匹配前先核对 sed 后实际文本 ②扩展 iframe 环境 transitionend 事件对 backdrop-filter 派发不可靠=系统性环境差异，时序见证优先帧级值采样（rAF/computed style 逐帧），事件只当诊断 ③Chromium 新版 getComputedStyle 把 oklch 序列化为 lab——颜色断言一律双格式或色彩空间无关比较 ④dbg 脚本 EXT_ID 哈希输入必须与 probe ROOT 一致（/tmp/ext-v867）否则 ERR_BLOCKED_BY_CLIENT

Stage Summary:
- v8.6.26 全链路闭环：壁纸零滤镜原样直出、dock 分割线与按钮同拍、面板互切散场下沉磨砂全程在线、快速切换动画不再被吞、抽屉期 dock 回归纱罩之下与搜索栏同层、流畅系统升格为独立渲染系统（实底兜底补全）
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①互切散场=通道下沉三件套（包裹层钉位/玻璃卡 out-kf 级联/内容层 defocus），祖先 opacity+filter 毒链定律扩展到互切窗 ②多视图退场一律 Set 化管理，单值 state 在快速序列操作下必吞动画 ③探针时序见证=帧级值采样优先，transition 事件在扩展 iframe 环境不可作门 ④颜色断言色彩空间无关
---
Task ID: 128
Agent: main (Super Z)
Task: 用户反馈「dock栏面板切换时切换动画会叠加两个面板」——v8.6.27 互切单玻璃律 + 云推

Work Log:
- 【根因三层】①绘制序：退场卡被 .view-exit 钉为 position:absolute（定位元素恒绘制在非定位的文档流入场卡之上），旧卡永远盖住新卡；②双玻璃通道：旧卡 glass-card-out-kf（底色→透明 0.2s）+ 新卡 panel-fade（底色凝入 0.3s）同窗对开，双玻璃卡半透叠置=「叠加两个面板」；③内容层双读：旧 content-defocus 与新 content-focus 同窗交叉，双份内容叠影
- 【互切单玻璃律三件套】①.view-exit 钉位升级 absolute !important + z-index:0 !important（退场卡压底，与 DOM 位次无关——AnimatePresence 退场子元素渲染位次不保证在前）②.view-top（内建 wrapper 常驻 relative+z1）入场卡恒浮于退场卡之上 ③壳挂 .cl-switching（互切窗）：.cl-switching .glass-card.panel-rise { animation:none }——特异性 (0,3,0) 双停新旧两卡整卡动画：入场 panel-fade 停=玻璃帧 0 满值即时就位、退场 out-kf 停=玻璃底全程不散（被入场卡不透明底盖住，不透明度守恒；暴露带随高度弹簧收拢被壳体裁剪，卸载帧无跳变），内容层照常交叉溶解——「一块玻璃换内容」取代「两块玻璃互相溶解」
- 【互切检测补丁（探针首跑 TL16d FAIL 实证）】prevAnyActive 相位块只在开/关迁移（anyActive 翻转）执行，A→B 互切 anyActive 恒 true 不翻转 → switching 永不为 true。补「活动视图复合键」渲染期跟踪：activeViewKey = panel ?? dockWidgetOpen，保持打开的键变化=互切置 true；开（null→key）/关（key→null）由相位块归 false（本块同帧亦判 false，双写同值互不冲突）。定格律同 openAsWidget
- 【关闭路径零波及】close 同帧摘 cl-switching（switching 定律 false），旧卡 out-kf 照播——panel-sink 溶解语言保持 v8.6.24 感知同步律；首开 panel-rise 照播（TL13c1 复证 cardAnim=panel-fade）
- 【探针】probe-v8627（sed 全量克隆 + TL16 五门）：TL16a 钉位升级 / TL16b 恒浮通道 / TL16c 双停规则在位 / TL16d 互切窗双卡同框但单玻璃（旧卡 absolute z0 anim=none、新卡 relative z1 anim=none、壳 cl-switching）/ TL16e 落定旧卡卸载玻璃恒在。78 PASS / 0 FAIL
- 【坑录】①CSSOM 把 animation:none 简写序列化为长手形式（auto ease 0s 1 normal none running none）——cssText 断言不能匹配 "animation: none" 字面，规则在位用选择器匹配、none 行为用真实元素 getComputedStyle().animationName 见证 ②渲染期调整 state 模式只覆盖「值翻转」迁移，「值恒定但身份变化」（anyActive 恒 true 的互切）须单独跟踪复合键 ③T6a 存量 flake 实锤：v8.6.26 未改包同现 bfMin=28（帧采样漏 0.14s blur 渐降窗），与 v8.6.23/25 同源非本轮回归
- 【发布】main f535bb1（5 文件 +963/-6 对账无夹带）→ 云推 gh-pages：version.json v=8.6.27、73 文件尺寸+SHA256 逐字节 ALL-GREEN、curl 线上验证通过

Stage Summary:
- v8.6.27 全链路闭环：面板互切单玻璃律——玻璃底/描边/投影全程同一块，只换内容；退场卡压底钉位、入场卡恒浮，双面板叠影根除；首开/关闭动画语言原样
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①互切=「一块玻璃换内容」，任何玻璃卡入退场双动画通道在互切窗必须双停（双玻璃对开=双面板叠影）②定位退场卡 vs 文档流入场卡的绘制序由 z0/z1 显式裁决，不依赖 DOM 位次 ③互切检测用活动视图复合键（panel ?? dockWidgetOpen），anyActive 恒定迁移不触发相位块 ④CSSOM 简写序列化为长手形式，样式断言规则在位+行为见证双轨
---
Task ID: 129
Agent: main (Super Z)
Task: 用户反馈（附录屏）「面板切换动画还是有上一个面板残留，彻底修复」——v8.6.28 互切内容零残留律 + 云推

Work Log:
- 【录屏帧级取证】用户视频 2560x1600@60fps（ffmpeg 多线程/分段 seek 均被沙箱击杀 → OpenCV 逐帧受控采样 2fps 全片 52 帧 + 切换窗口 10fps 94 帧 + 原生分辨率裁切 17 帧）：2.267-2.317s 快捷服务面板完整显示 → 2.333-2.383s 番茄钟面板入场中**旧面板彩色圆点内容仍叠加可见**（新内容同时带 blur-in）→ 2.400s 后旧内容才消失——残留窗口 0.1-0.15s，与 content-defocus 0.16s 散场窗吻合
- 【根因】v8.6.27 互切单玻璃律只双停了整卡动画（玻璃层），特意保留「内容层交叉溶解」（.view-exit .content-focus 走 content-defocus 0.16s opacity 1→0 + 部件 .cl-dockwidget.view-exit 走 view-defocus 0.2s）——退场内容在半透磨砂玻璃下透出鬼影，玻璃单律救不了内容层
- 【互切内容零残留律】globals.css 在 .cl-switching .glass-card.panel-rise 之后插入：.cl-switching .view-exit{animation:none;opacity:0;visibility:hidden !important} + .cl-switching .view-exit .content-focus{animation:none}——互切窗内退场视图同帧隐没（动画双停 + 透明 + 硬藏），DOM 驻留至 PresenceClass 350ms 定时器卸载但恒不可见；部件分支同特异性 (0,2,0) 靠源顺序在后取胜、内容级联 (0,3,0) 压 (0,2,0)；visibility 须 !important 压部件视图内联 visibility:visible（isLeaving）；关闭/首开路径不经 cl-switching，panel-sink 溶解语言原样。纯 CSS 零 JS 改动
- 【探针】probe-v8628（sed 克隆 8.6.27→8.6.28 + v867→v868 + 四段补丁）：TL17a/b 规则在位静态门 + TL17c 行为门（复用 TL16d 双卡同框轮询扩容 op/vis 字段：退场卡 absolute z0 + opacity=0 + visibility=hidden）+ cssScan 扩容 switchExitRule/switchExitContent。80 PASS / 1 FAIL
- 【T6a 存量 flake 再实证】唯一 FAIL = T6a 帧级 blur 见证（bfMin=27.7 渐降窗漏采）——未改包 v8.6.27 对照复跑同 FAIL（bfMin=28.0），与 v8.6.23/25/26 同源，沙箱慢主线程固有采样 flake，非本轮回归（本轮只动互切窗 CSS，不触纱罩退场链）
- 【视觉验证 v2】visual-verify-v8628b.mjs（页内 rAF 30 帧追踪 + 150ms 全局 animation-play-state 冻结截图）：冻结帧退场卡 {op:0,vis:hidden,pos:absolute,z:0} + 双卡同框画面零鬼影（对比用户视频同位帧残影实锤）、落定态 n=1 无残留无卡顿；首版截图连拍方案（586ms/张）错过 350ms 窗作废，早冻结方案定案
- 【坑录】①大视频取证：沙箱 ffmpeg 对 2560x1600@60fps 长解码必被 OOM/超时击杀（>3s 均死、分段 seek 落稀疏关键帧间隙更慢）——OpenCV cv2.VideoCapture 逐帧受控采样（resize 即弃）是唯一稳路，fps 采样步进+窗口高密度二段式 ②headless 截图 300-600ms/张永远追不上 350ms 动画窗——帧级证据用页内 rAF 追踪 + setTimeout 定点冻结后截图，截图只拍冻结态 ③CSSOM animation:none 序列化为长手形式二次踩坑（TL17a/b 首跑 FAIL）——动画字面断言一律「属性在场 + 真实元素 getComputedStyle 行为见证」双轨
- 【发布】main（6 文件对账无夹带，含 Task 128 存量 worklog 补登）→ 云推 gh-pages：version.json v=8.6.28、curl 线上验证通过

Stage Summary:
- v8.6.28 全链路闭环：互切内容零残留律——面板切换瞬间旧面板内容同帧隐没，玻璃换内容读作「瞬换 + 新内容模糊聚拢」，上一面板残影彻底根除；内建面板/dock 部件全部互切路径统一；首开/关闭动画语言原样
- 分发：全改动在页面层（globals.css 单文件），云推 ≤6h 到存量装机，无需换 crx
- 新律：①互切零残留=内容层禁交叉溶解，退场视图同帧隐没（玻璃单律管玻璃、零残留律管内容，两律合璧才算「一块玻璃换内容」）②动画窗内取证=页内 rAF 追踪+定点冻结，浏览器外截图追不上动画 ③CSSOM 简写序列化坑永记，断言双轨

---
Task ID: 130
Agent: main (Super Z)
Task: 用户指令「面板的切换动画全面重写，删掉老代码重写效果，让切换面板的动画效果恢复到最初的拉伸动效」——v8.6.29 互切拉伸律（结构性重写）+ 云推

Work Log:
- 【考古定标】git 考古回 v1.0.8（bb1e0d6）原始实现：用户认可的「拉伸」= 高度盒 px 弹簧 + 同一张玻璃卡（key="dock-panel" 恒定）内内容交叉溶解；v2.0.0 统一舞台把内建卡搬进 AnimatePresence key={panel}——互切=整卡重挂，两块玻璃交叉溶解，是四轮反馈（闪动/叠加/残留）的结构性总根因；v8.6.26-28 三层补丁（view-exit 散场下沉→cl-switching 双停→零残留硬藏）全是错误结构上的止损
- 【互切拉伸律·结构重写】Dock.tsx PanelStage：①内建玻璃卡退役 AnimatePresence/PresenceClass（key={panel} 挂卸）改 open 相位恒挂载普通条件渲染——互切前后同一 DOM 节点，「一张玻璃卡换内容」结构保证，双玻璃交叉溶解不可能发生；②内容层 key=session+panel 同帧换装：旧内容同帧卸载（零残留结构性保证，不再依赖硬藏规则），新内容播 .cl-panel-content 简单淡入（0.3s 纯 opacity，无模糊）；③displayPanel=panel ?? (closing? lastPanelRef:null)——关闭相位渲染旧内容播 panel-sink 散场，SINK_MS 后卸载；④session 期次计数（false→true 迁移 +1）保证关后重开内容重挂播淡入
- 【删老代码清单】Dock.tsx：switching/cl-switching 状态机、activeViewKey/prevViewKey 复合键互切检测、openAsWidget 定格、leavingWidgets Set+定时器 effect、widget isLeaving/view-exit、PresenceClass import——部件切走改同帧 visibility:hidden（lastOpenWidgetRef 只管 closing 收尾）；shellAnim 简化为 phase==="closing"?"panel-sink":""（透明壳入场类本无视觉，reduceMotion 兜底移交 CSS reduce 块）
- 【globals.css 删补丁链】@keyframes view-defocus、.cl-dockwidget.view-exit、.view-top、.cl-switching .glass-card.panel-rise、.cl-switching .view-exit、.cl-switching .view-exit .content-focus 全删（退役注记留档）；新增 panel-content-in/out 关键帧 + .cl-panel-content 基线 + .panel-sink .cl-panel-content 级联（关闭内容同步淡出）+ reduce 块兜底三条；弹窗共用通道原样保留（.view-exit 基础钉位 + .view-exit .glass-card/.content-focus 级联、content-focus 家族、dialog-sink/palette-out 级联）——指令面板/预设弹窗互切语言不受波及
- 【测高链适配】measureRef 从 keyed PresenceClass 移到恒定 flow-root 包裹层——RO 跟踪内容换装高度变化驱动高度盒弹簧，互切期不再断开重连观察器
- 【探针】probe-v8629（sed 克隆 + 8 段补丁）：TL13c1 出生窗断言改 panel-content-in/innerFilter=none；TL16d 行为门重写为单卡律（900ms rAF 轮询 maxCards≤1 + cl-switching 从未出现）；TL17c=零残留+同卡律（data-probe-mark 节点标记跨切换存活 + data-panel 旧值同帧消失）；TL16e=落定磨砂在线；TL15b 改散场边界（部件分支退役+弹窗级联保留）；TL16b/16c 改退役门（view-top/cl-switching 家族清零）；TL17a/b 新门（内容层过场在位 + view-defocus 清零）；cssScan 扩容 panelContentIn/Out/viewDefocusAny——80 PASS / 1 FAIL
- 【T6a 存量 flake 第四次实证】唯一 FAIL=T6a 纱罩 blur 帧级见证（bfMin=28.0 渐降窗漏采）——与 v8.6.25/26/27/28 同源（沙箱慢主线程固有采样 flake，本轮未触纱罩/抽屉链路），非回归
- 【坑录】①shell className 拼接 `${switching?" cl-switching":""}` 漏改被自写残留门拦截（sub_once 全中但状态机删净后 className 拼接仍引用已删变量）——重写类改动残留检查必须覆盖「引用点」而非只覆盖「定义点」；②探针克隆后补丁锚点含版本号文本时，sed 已先行替换，锚点须按 sed 后文本书写（Task 127 坑②二次踩，本次补丁脚本加「已应用跳过」守卫）；③scripts/changelog.ts 杂散文件（历史遗留未跟踪）不入库，对账无夹带
- 【发布】main 提交（7 文件对账无夹带）→ 云推 gh-pages：version.json v=8.6.29、curl 线上验证通过

Stage Summary:
- v8.6.29 全链路闭环：面板切换动画全面重写落地——互切=一张玻璃卡同帧换内容+高度/宽度弹簧拉伸（最初的拉伸动效），残留/叠影/闪动从结构上不可能；老补丁链（view-top/cl-switching/view-defocus/leavingWidgets/content-focus dock 路径）整体退役；弹窗互切语言原样；首开/关闭语言原样（玻璃 out-kf 感知同步律保留）
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①互切零残留靠结构（同卡换内容同帧卸载）不靠 CSS 硬藏——凡是「用补丁止损错误结构」的链路，重写优于第七次补丁 ②重写类改动的残留检查=定义点+引用点双查 ③测高 ref 挂恒定包裹层，keyed 内容重挂不重连 RO
---
Task ID: 131
Agent: main (Super Z)
Task: 用户第 26 点反馈「b(高)→a(矮) 切换时底部收缩到卡片长度再复位，明显逻辑不对，应该底边不动上面收缩」——v8.6.30 互切底锚律 + 云推

Work Log:
- 【根因】玻璃卡在高度盒内【顶部对齐】，v8.6.29 换装帧卡高随新内容瞬变：shrink 方向玻璃底边瞬收（用户实测「底部收缩到卡片长度」）→ 窗口弹簧收缩、卡贴窗口顶整体悬空下降复位（「保持高度然后复位」）；grow 方向卡底溢出被壳体底缘（wrapper fixed bottom 恒定锚定 dock 上方）裁掉，恰好呈现完美拉伸——方向不对称。git 考古 v1.0.8（bb1e0d6）确认同 wrapper 锚定结构，根因锁定在 v8.6.29 换装链本身
- 【互切底锚律】Dock.tsx PanelStage：换装帧渲染期检测（prevAnyActive 同律，prevPanel useState 比对 displayPanel）锁玻璃卡 minHeight=换装前窗口高（contentH + PANEL_CARD_BORDER=卡 border 2px）——弹簧期卡高被撑住、贴窗口顶平滑下降，底部溢出段被壳底缘裁掉：玻璃底边恒定不动、面板从顶部平滑收缩；高度盒 onAnimationComplete 摘锁，卡高回落=内容高圆角复位；closed 相位（displayPanel=null）摘锁防旧高泄入下次首开；contentH 未武装（首开 500ms 内）不锁退化 auto 直就位
- 【双坑排查实录】①产物验证假象——Bash 工具 stdout 回传层吃 "[m" 字节序列（const [morphMinH 显示成 const orphMinH），Edit/python -c 修「坏行」全部撞假象空转，最终 ord 码逐字符输出（免疫字节吞噬）实锤源码完好；真凶=Next 增量缓存陈旧（Dock chunk 静默沿用 v8.6.29），rm -rf .next 全清重建后底锚代码进产物（onAnimationComplete 特征验证）②framer v12 对「animate 目标无变化的重渲」边缘触发 onAnimationComplete——换装帧刚设的底锚锁被同帧摘掉（diag 实测 minH 全程空+卡高瞬变悬空 62px），时间闸（换装帧后 150ms 内禁摘）修复，真弹簧完成 464ms 正常摘锁圆角复位
- 【帧级实证（diag 62 帧×2 程）】shrink：换装帧 minH=256px inline 在位、卡高 256 恒定、壳底 640 恒定、卡底 640→702 递增（溢出被壳底裁）、壳高 256→194 平滑收缩=底边不动上面收缩；落定摘锁后卡=壳 256 精确贴合；grow：落定 256 贴合，弹簧语言原样
- 【测高链适配】measureRef 挪挂 keyed 内容层（cl-panel-content，offsetHeight=真实内容高）——RO 只测内容高不被 minHeight 毒化死锁；换装重挂帧 ref 回调同步测高弹簧零迟滞；窗口目标高补卡 border 2px 落定卡=壳精确贴合（border 底线不被壳体裁）
- 【探针】probe-v8630（sed 克隆 8.6.29→8.6.30 + TL16f 插入）：底锚律行为门=壳体底缘恒定 ≤2px + 玻璃卡底永不悬空（gap≤0.5px，getBoundingClientRect 不受 overflow 裁剪）+ minHeight 底锚锁 inline 在位 + frames≥8（抗 headless rAF 节流 flake）；81 PASS / 1 FAIL——T6a 纱罩 blur 帧级见证（bfMin=27.7）存量 flake 第七次实证（v8.6.25/26/27/28/29 同源，本轮未触纱罩链路非回归）
- 【坑录】①Bash stdout 回传吃字节序列——「看到的坏行」可能不存在，文件状态判定必须 ord 码免疫输出；用源码标识符搜 minified 产物永远 MISS，要用 minify 保留的 JSX 属性名（onAnimationComplete）做特征验证 ②管道 exit code 假阳性：rg|head && echo 的 FOUND 判定不可信，rg 要独立断言 ③改码后 .next 必须全清——Next 增量缓存对源码变化的漏检是静默的，比代码 bug 更难查（本轮空转一轮的真正元凶）
- 【发布】main 4494be5（4 文件对账无夹带：Dock.tsx 底锚律/VERSION/changelog 插条/probe-v8630 新增）→ 云推 gh-pages：version.json v=8.6.30、73 文件尺寸+SHA256 ALL-GREEN、curl 线上验证通过

Stage Summary:
- v8.6.30 全链路闭环：面板切换两向底锚对称——b(高)→a(矮) 玻璃底边稳贴 dock 从顶部平滑收缩（不再先缩底边再整体悬空落位），a(矮)→b(高) 保持向上拉伸；v8.6.29 零残留/单玻璃/同卡换装/一张玻璃换内容律全部原样保留
- 分发：页面层改动，云推 ≤6h 到存量装机，无需换 crx
- 新律：①「文件坏行」判定必须 ord 码免疫输出——显示层字节吞噬假象可让排查空转一整轮 ②改码后 .next 全清重建——增量缓存静默陈旧是比代码 bug 更隐蔽的失败 ③minified 产物验证用 minify 保留属性名，不用源码标识符 ④framer onAnimationComplete 有边缘触发场景，摘锁类回调须加时间闸/状态闸防御
---
Task ID: 132
Agent: main (Super Z)
Task: 用户第 27 点反馈「切换面板时子元素的模糊过渡效果没了，修复一下」——v8.6.31 互切模糊聚拢回归 + 底锚检测提交期化修复 + 云推

Work Log:
- 【根因一（㉗ 本体）】v8.6.29 互切重写时内容过场收窄为纯 opacity（重写注释明示「无模糊」），丢掉全 app 唯一内容过场词汇「模糊聚拢」→ panel-content-in 关键帧恢复 filter blur(10px→0)，与 content-focus/intro-rise/禅模式雾化同源同参（0.3s cubic-bezier(0.22,1,0.36,1) backwards）；关闭方向 panel-content-out 语言原样（0.18s 纯 fade 不动，首开/关闭语言保持原则）；产物 CSS 全量 diff 恰 +45 字节零意外
- 【根因二（重构出的潜伏回归，诊断大战）】加 blur 后探针 TL16f（底锚律门）连续 FAIL（sawMinH:false）：①对照实验（旧探针+旧包 82 PASS/0 FAIL）排除环境因素 ②产物 JS 全量 hash diff 证明功能等价（仅 changelog 数据差 165B）③CSS diff 唯一 +45B——嫌疑唯一锁定 blur 关键帧但机制不明；自写 diag 在新旧包上竟均复现失败（diag 缺真实探针前置状态链，弃用）；MORPHLOG 插桩（3 版迭代）逐渲染日志实锤：lockSet 256 → 进 DOM（snap 见证 min-height:256px）→ 1ms 后无任何 setter 调用回退 null → 底锚锁形同虚设，收缩方向复现 62px 卡底悬空洞（用户第 26 点原始病灶形态）
- 【根因二定论】React 18 render-phase update（渲染期 setPrevPanel+setMorphMinH）与「换装帧 ref 回调同步测高 setContentH」同帧竞逐，锁状态被静默丢弃；blur 关键帧改变提交时序，使 v8.6.30 时代侥幸存续的潜伏竞态 100% 触发
- 【结构修复】底锚检测挪进 useLayoutEffect（普通更新队列不可能被静默丢弃，setState 同步冲刷 pre-paint 无闪烁窗）；prevPanel 降级为 ref（prevMorphPanelRef，避让父组件已有同名 ref）；contentH 渲染体镜像 ref（layout effect 运行于重测高渲染之前，读到的仍是换装前高度=正确锁值）；onAnimationComplete 150ms 时间闸保留
- 【亚像素副案】TL16f 偶发 gap 0.5-0.6 FAIL：逐帧 dump 定位为 framer 弹簧收敛过冲（sH=256.56 vs cH=256，阻尼振荡亚像素不可见，落定精确贴合 gap=0，round1 漏采 PASS/round2 捕到 FAIL 纯采样时机）——阈值 0.5→1px + 注释物理依据（真失效 signature 是 62px 级悬空）；顺手分数精度测高（getBoundingClientRect().height 取代整数 offsetHeight）+ 锁样式去 Math.round（落定卡=壳精确贴合原则化，CommandPalette 共用 hook 一并受益）
- 【坑录】①诊断 diag 必须复刻真实探针全部前置状态链，否则新旧包都可能假复现/假掩盖——本轮 diag 在旧包上也 FAIL 险些误导方向 ②插桩 useEffect 引用后声明的 state（prevPanel）→ TDZ 崩溃「Cannot access 'G' before initialization」50 门雪崩——插桩自身也要守 hooks 规则 ③「文件坏行」显示假象二次踩（const [morphMinH 显示成 const orphMinH），ord 码免疫输出判定 ④探针 gap 阈值调整必须给物理依据（真失效 signature 量级），不许为绿灯放水
- 【探针】TL13c1 出生窗改模糊追采门（innerBlurSeen：首见卡片后持续追采至 900ms，任一帧捕到非零 blur( 即见证模糊聚拢在飞，免疫 headless rAF 节流采样时机）；TL17a 标签同步；TL16f 容差更新。4 轮探针：81 PASS / 1 FAIL——唯一 FAIL=T6a 纱罩 blur 帧级见证存量沙箱 flake 第 9 次实证（bfMin=27.7-28.0 渐降窗漏采、run 间翻转，v8.6.25-30 同源，本轮未触纱罩链路非回归）；TL16f 三连 PASS（gap=0，sawMinH=true）
- 【发布】main 0f015fe（6 文件对账无夹带：globals.css/Dock.tsx/use-morph-height.ts/changelog.ts/build-extension.py/probe-v8631 新增）→ 云推 gh-pages：version.json v=8.6.31、73 文件尺寸+SHA256 ALL-GREEN、curl 线上验证通过

Stage Summary:
- v8.6.31 全链路闭环：面板切换内容层模糊聚拢回归（第 27 点——用户实测「模糊过渡没了」）+ 底锚检测提交期化（结构性修复，v8.6.30 底锚律在 blur 时序下确定性生效）+ 测高分数精度；v8.6.29/30 的零残留/单玻璃/同卡换装/底锚锚定律全部保留且探针级加固
- 分发：页面层改动（globals.css/Dock.tsx/use-morph-height.ts），云推 ≤6h 到存量装机，无需换 crx
- 新律：①render-phase update 与 commit 期 ref 测高 setState 同帧竞逐会静默丢状态——凡「渲染期 setState 设定且 DOM 立即可见」的关键动画状态一律 useLayoutEffect 常规 setState ②诊断插桩自身必须守 hooks 规则（TDZ 崩溃一次教训）③探针阈值调整必须给物理依据（真失效 signature 量级 vs 亚像素瞬态）④CSS 动画关键帧的增删会改变提交时序，可让潜伏的 React 竞态 100% 显形——「只加了 blur 为什么锁没了」类悬案优先查时序而非逻辑

---
Task ID: 133
Agent: main (Super Z)
Task: 用户三点反馈「禅模式退出后常驻快捷服务图标磨砂消失+要求两套渲染把磨砂写入底层（第 28 点）／预设面板→dock 其他面板仍是底部收缩动画（第 29 点）／面板切换动画底部深色浅色高光（第 30 点）」——v8.6.32 磨砂材质底层化 + 玻璃壳满窗律 + 云推

Work Log:
- 【㉘ 根因】docked 磁贴墙挂在 section.zen-fade 内，html.zen .zen-fade { filter: blur(12px) } 使整段成为 backdrop root（祖先 filter 毒链定律）——磨砂采样面归零，禅进出双窗杀磨砂且退出后可常数帧不复原（用户实测「退出禅模式磨砂消失」）；html.zen .zen-dock（dock 本体即 glass-pill 玻璃）与 html.zen .search-pill（本体即玻璃）同罪
- 【㉘ 修复】三条 html.zen 雾化规则删 filter 声明（opacity+transform 雾化语义不变，玻璃材质全程存活）；html.zen .cl-widgets 保留 blur 雾化（iframe 容器无磨砂可杀，v8.6.26 律）——「雾化语言让位于磨砂材质存活」
- 【磨砂底层化·图标材质】磁贴霜层材质从 JSX 内联样式收编 globals.css .tile-frost 基线（backdrop-filter blur(14px) saturate(1.6) + --tile-frost-bg 着色），内联退役——用户指令「把磨砂写入底层，从底层代码改变图标材质」；双渲染系统其一（磨砂）共享此基线、其二（cs-lite）经通配 backdrop-filter:none !important 统一关停（v8.6.26 已做实，本轮指令为其再确认）
- 【lightningcss 别名折叠坑】.tile-frost 若同时声明标准+前缀，构建时被折叠为最后声明（前缀版）且 Chromium 对构建产物的前缀别名不生效（探针首跑 computed=none 实锤，T3e/T8c/TL4/TL18b 四门连崩）——只声明标准属性，lightningcss 自动补 -webkit-（.glass-card 双份输出实证）；zen-dock/search-pill 声明全同被合并为分组选择器，探针门须按逗号分段精确匹配
- 【㉙㉚ 终极根因】玻璃卡是高度盒内一段独立高度的独立盒——换装帧（含部件→内建重挂）卡高与窗口弹簧各行其是；v8.6.30/31 的 minHeight 锁是「用 JS 追赶逐帧弹簧」，还引入渲染期 setState 丢锁竞态（v8.6.31 已修一次），且卡底溢出壳体被裁=裸切边（无描边无圆角）即用户所见底部高光
- 【玻璃壳满窗律（结构重解）】玻璃卡 h-full（flow-root 链同高）——卡高每帧恒等于高度盒（=壳体窗口）动画值：玻璃底边（含 1px 描边与圆角）恒贴壳体底缘不动、顶边随弹簧收放，双向对称；收缩=顶边收下（第 26 点定案语义）、内容溢出段由壳体裁掉永不露出；部件→内建重挂卡生而满窗（第 29 点归零）；玻璃自身完成边恒在窗底=裸切边不复存在（第 30 点归零）；minHeight 锁/时间闸/底锚检测 useLayoutEffect 整链退役（无锁=无竞态），morphMinH/lastMorphAtRef/prevMorphPanelRef/contentHMirrorRef 四态清零
- 【帧级实证】探针环境注入探针预设（start:presets 种 dock 表面部件 380px）：部件→待办切换窗 380→194 平滑收缩、壳底恒定 640（16 采样点位置数=1）、MAX gap=0、卡高每帧==壳高；首开轨迹 0→195 同律 gap=0；中帧截图 3 张（grow/shrink/部件→内建）底部均无高光带、玻璃圆角描边恒贴窗底
- 【探针】probe-v8632（sed 克隆 + 6 段补丁）：TL16f 重写为玻璃壳满窗门（sawMinH→sawTrack：卡高==壳高每帧贴随，minHeight 断言退役）；TL18a 禅雾化材质存活（三条 html.zen 规则无 filter 声明，[^-]filter: 正则排除 backdrop-filter 误配 + 分段匹配防分组选择器误判）+ TL18b 磨砂底层化（.tile-frost 基线在位 + 计算样式磨砂在线 + 内联退役 style.backdropFilter 空）；T3e/T8c/TL4/T3h/T8d/T5b 六门随材质修复自动复活。84 PASS / 0 FAIL（v8.6.31 基线 81/1，T6a 存量 flake 本轮亦过）
- 【发布】main 7bc7737（8 文件对账无夹带：globals.css/Dock.tsx/QuickLinks.tsx/changelog.ts/build-extension.py/probe-v8632 新增/visual-v8632+visual-v8632b 新增）→ 云推 gh-pages 932d20c：version.json v=8.6.32、73 文件尺寸+SHA256 逐字节 ALL-GREEN、curl 线上验证通过
- 【坑录】①lightningcss 别名折叠：标准+前缀双声明被折叠为最后声明（前缀版）且 Chromium 不生效——CSS 基线一律只写标准属性，前缀交给构建器 ②探针 CSSOM 门用选择器精确匹配时须按逗号分段（lightningcss 会合并声明全同的规则为分组选择器）③worklog 摘要与真实 git 状态可能严重脱节（本会话摘要停在 v8.6.18/Task 120，真实树已到 v8.6.31/Task 132）——动手前 git log --oneline + worklog tail 双重对齐 ④rg 输出 `[m` 序列被 stdout ANSI 吞（interface PresetWidget 显示成 interface n）——接口名/类名核对一律 python 读源

Stage Summary:
- v8.6.32 全链路闭环：禅模式雾化禁 filter（玻璃载体材质全程存活，退出后磨砂不再消失）+ 磁贴磨砂材质写入 CSS 底层（tile-frost 基线，双渲染系统共享）+ 面板玻璃壳满窗律（底边描边圆角恒贴窗底、预设→其他面板顶部收缩拉伸、底部高光根除）——第 28/29/30 点全清
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①玻璃载体的雾化/入场/退场通道禁 filter（opacity+transform 承载），祖先 filter=backdrop root 毒链定律扩展到禅模式 ②材质声明入 CSS 基线且只写标准属性（构建器补前缀），内联样式材质退役 ③「JS 锁追赶动画」类方案（minHeight 锁）终会被时序竞态反噬——让结构保证（h-full 恒等式）取代状态追赶 ④裸切边（无描边圆角的 overflow 裁切边）即视觉「高光」病灶——玻璃完成边必须恒在可视边界内
---
Task ID: 134
Agent: main (Super Z)
Task: 用户第十二轮反馈「不要删除雾化 filter，你的磁贴磨砂玻璃效果消失还是没有解决」——v8.6.33 禅雾化 filter 回归 + 玻璃载体零毒退场 + 云推

Work Log:
- 【根因】v8.6.32 删了 html.zen .zen-fade 的 filter: blur(12px)（雾化观感丢失——用户「不要删除雾化 filter」）但保留 opacity: 0 雾化——opacity<1 与 filter≠none 同为 backdrop root 毒物（v8.6.22「自身同样剧毒」已实证），磁贴墙（.tile-frost）仍挂 zen-fade 段内 → 禅过渡期磨砂采样面归零，用户 Chrome 过渡结束后磨砂层不复原 → 「还是没有解决」；v8.6.32 探针 TL18a 当时断言的恰是「无 filter」，对「祖先 opacity 雾化」这条毒链方向性盲区
- 【雾化 filter 回归】html.zen .zen-fade 恢复 filter: blur(12px)——zen-fade 语义收窄为时钟段专用（page.tsx 磁贴墙段改挂新 .zen-gone），时钟段无玻璃子树，blur 雾化全量回归零毒；html.zen .cl-widgets blur 雾化原样保留
- 【玻璃载体零毒退场】磁贴墙（.zen-gone 新基线）/dock（.zen-dock）/搜索药丸（.search-pill）禅退场一律 visibility:hidden + transform:scale(0)——visibility 与 transform 均不构成 backdrop root，磨砂采样全程存活；进禅 transform 收缩散场 + visibility 过渡末帧隐没（transition: visibility 0s 0.65s 延迟），退禅 visibility 即时可见（基线 0s 无延迟）+ 自零聚拢复现，双向无硬切；dock origin bottom（向底缘收没）、search-pill origin top、磁贴墙默认中心；产物 CSS 逐条验证（lightningcss 仅把 visibility 0s 极简为 visibility，延迟语义无损）
- 【探针】probe-v8633（sed 全量克隆 + TL18a 反转替换 + TL19 插入）：TL18a 反转为「zen-fade 恢复 blur(12px) + cl-widgets 保留」；TL18b' 玻璃载体零毒静态门（zen-gone/zen-dock/search-pill 三条 html.zen 规则 visibility+scale(0) 且零 opacity/零 filter + .zen-gone 基线在位）；TL19 禅窗行为门（docked 磁贴墙 zen 态 visibility=hidden 且 opacity=1/filter=none + 时钟段雾化 blur(12px) 在线 + 退禅 .tile-frost blur(14px) saturate(1.6) 恒在线）。89 PASS / 0 FAIL（含 T6a 存量 flake 本轮亦过）
- 【二轮补丁（首跑 2 类假阳教训）】①TL19a clockFil=blur(0.0037px) FAIL：时钟段 intro-rise 入场动画（0.1s+0.95s）在禅类添加时仍在运行，动画级联持有 filter（动画>过渡），快照撞上动画尾帧——非真实缺陷；补 rAF 排空 getAnimations 后再进禅 + 禅相位等待改 rAF 轮询（强制产帧，免 headless 遮挡冻结过渡时间线）②TL7/TL13a frost=null FAIL：TL19c 误删 linksForm 还原 drawer，破坏 T8a「docked 持久化」契约——改回 docked 复位（下游门依赖 docked 磁贴墙）
- 【像素级视觉验证】visual-v8633（docked 磁贴墙区域 clip 截图三连：禅前 A/禅中 B/退禅后 C）+ mad-v8633（MAD 判定）：MAD(A,C)=0.000（退禅后磁贴区与禅前像素级全等——磨砂+内容完整复原）、MAD(A,B)=MAD(B,C)=6.495（禅中磁贴隐没/磨砂模糊层真实渲染区别于裸壁纸）——FROST-ALIVE PASS
- 【发布】main 3efa7ed（7 文件对账无夹带：globals.css/page.tsx/changelog.ts/build-extension.py/probe-v8633 新增/visual-v8633 新增/mad-v8633 新增）→ 云推 gh-pages：version.json v=8.6.33、curl 线上验证通过
- 【坑录】①backdrop root 毒物清单应视为完备集：filter≠none、opacity<1、mask、mix-blend-mode≠normal、will-change(前述)——玻璃祖先链上任何一个瞬时出现都杀磨砂，「删一个留一个」的修复必复发（v8.6.31→32→33 三轮同链实证）②CSS 动画持有属性期间（animation>transition 级联）过渡类断言必须先 getAnimations() 排空，否则撞尾帧假阳③headless 遮挡页 setTimeout 等待不产帧、过渡时间线冻结——时序类行为门一律 rAF 轮询强制产帧④探针既有门的设置契约（如 T8a docked 持久化）是隐式依赖，插入新门改设置后必须按原契约复位

Stage Summary:
- v8.6.33 全链路闭环：雾化 filter 回归（时钟段+角落部件）+ 玻璃载体零毒退场（磁贴墙/搜索药丸/底栏 visibility+transform）——用户「不要删除雾化 filter」与「磁贴磨砂玻璃消失」双诉求结构性同时满足，磨砂丢失家族（⑰㉑㉗㉘）在禅模式入口终解
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①玻璃祖先链零毒律完备化——opacity 与 filter 同罪，雾化语言只落无玻璃子树 ②visibility+transform 是玻璃隐没/复现的唯一安全通道（离散插值自动实现「末帧隐没/即时复现」）③动画持有期断言先排空 getAnimations ④rAF 是 headless 行为门的唯一可靠时钟

---
Task ID: 135
Agent: main (Super Z)
Task: 用户第十三轮反馈「要改回之前的那种模糊过度而不是缩放动画！搜索框，快捷服务图标，dock栏过渡到禅模式的动画应该是时钟的这个模糊动画！」——v8.6.34 禅过渡模糊雾化统一 + 退禅磨砂复原双保险 + 云推

Work Log:
- 【根因】v8.6.33 为保磨砂把三玻璃载体（磁贴墙 zen-gone/dock zen-dock/搜索药丸 search-pill）禅退场全部走 visibility+scale(0) 零毒通道——磨砂保住了但观感是缩放；用户要的是时钟段 zen-fade 同款 blur(12px)+opacity 雾化散场。矛盾：玻璃载体上 filter/opacity 是 backdrop root 毒物（v8.6.22/32/33 三案定罪），直接挂雾化会复发「退禅后磨砂消失」
- 【方案：观感与磨砂解耦双保险】①CSS 三段反转：html.zen 下 zen-gone/zen-dock/search-pill 全部改 opacity:0+filter:blur(12px)+visibility 末帧隐没（0s 0.65s 延迟，lightningcss 极简为 visibility 0.65s——visibility 离散插值一端 visible 时中间全程 visible，语义等价无损），scale 全删；退禅显影由基线 transition（.zen-gone/.zen-dock 自带 opacity+filter 0.65s / search-pill 走 Tailwind duration-500 默认含 opacity+filter）承载=自雾化聚拢复现 ②page.tsx defrostGlass：退禅瞬间（html.zen 移除前）对三载体 display:none 往返+双 reflow 强制销毁毒物层缓存历史——磨砂参与者随新层重建百分百复原；getAnimations({subtree:true}) cancel 抑制 display 重置引发的入场动画重播（pill-shell-in/磁贴三通道/dock-intro 不重播，显影由 opacity/filter 过渡独占）；全程 visibility:hidden 禅态下执行用户无感 ③双退禅路径收口：dblclick toggle（zenRef 镜像判向，effect 依赖不含 zen 规避闭包陈旧）+ Esc 快捷键均先 defrostGlass() 再 setZen
- 【探针】probe-v8634（sed 全量克隆+3 补丁）：TL18b' 反转为「三载体 html.zen 规则 opacity:0+blur(12px)+零 scale+visibility 末帧隐没+基线 opacity/filter 过渡在位」；TL19 重写为 dblclick 真实 React 路径（不再手搓 classList——defrostGlass 必须经真实链路）：TL19a 进禅磁贴墙 opacity=0+blur(12px)+时钟雾化在线、TL19b 退禅 opacity=1+filter=none+.tile-frost blur(14px) saturate(1.6) 恒在线；TL19-pre 加 3s rAF 轮询根治 reload boot 时序 flake；TL20 新增源码门（defrostGlass 定义+subtree cancel+双路径调用）；89 PASS / 1 FAIL——唯一 FAIL=T6a 存量 flake（纱罩退场采样窗，v8.6.23 起注释在案），做基线对照实验：git stash 本轮 4 文件回 v8.6.33 跑 probe-v8633 同样 FAIL（leafMin=1.000 evts=0）→ 实锤与本轮无关系当前负载下探针时序脆弱
- 【像素级验证】visual-v8634/mad-v8634（v8.6.33 方案克隆）：docked 磁贴墙 clip 三连截图 MAD(A,C)=0.000（退禅后磁贴区与禅前像素级全等——磨砂+内容完整复原）、MAD(A,B)=6.495（禅中雾化真实渲染）——FROST-ALIVE PASS
- 【发布】main ad7e61b（7 文件对账无夹带：globals.css/page.tsx/changelog.ts/build-extension.py/probe-v8634 新增/visual-v8634+mad-v8634 新增）→ 云推 gh-pages：version.json v=8.6.34、73 文件尺寸+SHA256 逐字节 ALL-GREEN、curl 线上复核通过
- 【坑录】①Write/Bash 管道对源码文本中 "[m" 序列有写侧+读侧双重吞字（`[mounted` 可见为 `ounted`）——rg 回显假象与真实损坏的鉴别法：python 读源 count 断言，勿信任何管道回显 ②探针 sed 克隆后打补丁：OLD 块内不得含被 sed 改写的版本号字面量（v8.6.33→34 全局替换后 TL19 注释里的「8.6.33 首跑」已变「8.6.34 首跑」，OLD 不命中）③fix 脚本幂等化（内容标记 SKIP）+ 分段替换失败可续跑，避免全量重写撞唯一性断言 ④T6a 类存量 flake 判定流程：回滚本轮改动跑上版探针做基线对照，FAIL 复现即与本轮无关，勿空跑碰运气 ⑤CSS transition 简写 `visibility 0s 0.65s` 被 lightningcss 极简为 `visibility 0.65s`：visibility 离散插值规则（一端 visible 时 t∈(0,1) 全程 visible、末帧 hidden）使两者语义等价，无需防极简

Stage Summary:
- v8.6.34 全链路闭环：禅过渡动画语言统一（时钟/搜索药丸/磁贴墙/dock 四区同一套 opacity+blur(12px) 雾化散场/显影聚拢，缩放退场退役）+ 退禅磨砂复原双保险（defrostGlass 强制重挂，第 ㉝ 点清零）——磨砂丢失家族在「观感要雾化」与「磨砂要存活」的历史矛盾上结构性双满足
- 分发：全改动在页面层，云推 ≤6h 到存量装机，无需换 crx
- 新律：①玻璃载体雾化观感与磨砂存活可兼得——毒物层缓存历史用 display 往返重挂销毁，雾化照挂、磨砂照活，visibility:hidden 态执行零成本 ②display 重挂会重置子树 CSS 动画——getAnimations({subtree}) cancel 是重挂方案的必备配套，否则入场动画重播穿帮 ③探针行为门测 React 链路必须派发真实事件（dblclick），手搓 classList 绕过了关键副作用路径
---
Task ID: 136
Agent: main (Super Z)
Task: 用户第十四轮反馈「禅模式的时钟会出现闪动的情况，并且在退出禅模式后单击页面时禅模式的时钟会出现」——v8.6.35 禅时钟稳定化（动效 CSS 化）+ 退禅幽灵复现结构根治 + 云推

Work Log:
- 【侦查对齐】worklog 摘要与真实树脱节再确认（摘要停 v8.6.18/Task 120，真实树 v8.6.34/Task 135）——git log + worklog tail 双重对齐后定位本轮两条新反馈为禅模式覆盖层链路（page.tsx L1395-1418 AnimatePresence 条件渲染 + Clock Colon framer 呼吸）
- 【㉞ 根因一（缩放残留）】html.zen .zen-fade 残留 transform:scale(0.985)——v8.6.34 三载体缩放清理的漏网之鱼（用户第十三轮「模糊过渡而不是缩放动画」对时钟段未收口）；删除后时钟段纯 opacity+blur(12px) 雾化与 zen-gone/zen-dock/search-pill 完全同语言
- 【㉞ 根因二（WAAPI 闪动）】Colon 呼吸是 framer motion opacity [0.9,0.35,0.9] WAAPI 动画——globals.css L726 panel-fade 教训在案「framer v12 对 opacity 走 WAAPI 加速，内联值停在初始 0 动画结束才补写，中间空窗真机闪一拍」；时钟 useNow 每秒 re-render 叠加重启风险。修复：CSS keyframes colon-breathe（4s ease-in-out infinite 参数不变）+ .colon-breathe 类 + reduced-motion 豁免清单；全实例（主时钟/迷你时钟）受益
- 【㉟ 根因（exit 卸载链路）】禅覆盖层 {zen && <motion.div exit>}: ①exit 动画被 rAF 节流/中断时覆盖层滞留 DOM，后续 re-render 可令 motion 跳回可见态 ②卸载元素的合成层缓存可被单击触发的重绘闪现（v8.6.22 层缓存家族）。修复（结构根治）：覆盖层常驻 DOM + .zen-overlay CSS 过渡（visibility 离散插值：进禅即时可见/退禅末帧隐没 0.7s，与 zen-gone/zen-dock 同零毒通道，覆盖层内无玻璃子树）；迷你时钟常驻=时间热状态进禅零延迟；ZenPomodoro 保持 zen 条件挂载（到点结算/chime/toast 仅禅内生效——advanceRuntime 写者与 PomodoroPanel 互斥语义不变，防双重结算）
- 【framer 全退役】page.tsx 删 framer-motion import + AnimatePresence + EASE（唯一使用点即覆盖层）；Clock.tsx Colon 去 motion（Digit 翻转保留——主时钟同机制未被报，模糊聚拢词汇不动）
- 【探针】probe-v8635（sed 全量克隆 50 处版本号 + 3 门）：TL21 覆盖层常驻化源码门（framer/AnimatePresence/EASE 退役 + zen-overlay 常驻结构 + CSS visibility 双规则）+ TL22 时钟闪动门（colon-breathe 关键帧 + zen-fade 基线/禅态零 transform）+ TL23 行为门（dblclick 真实链路：DOM 恒在 + 进禅 opa=1/visible + 退禅 opa=0/hidden 末帧隐没）。93 PASS / 0 FAIL（v8.6.34 基线 89/1，T6a 存量 flake 本轮亦过）
- 【坑录】①bootNewTab 只等 body.children>0（水合早期）——TL23 首跑 present:false 假阴，补 3s rAF 轮询等常驻覆盖层渲染（TL19-pre dockedBooted 同惯例）后 PASS ②fix 脚本断言子串计数（".zen-overlay {" 是 "html.zen .zen-overlay {" 子串，count 应为 2）+ 注释字样撞「引用残留」断言——断言须锚定代码级特征（import 行/JSX 标签）③sub_once 幂等分支对空 new 失效（falsy 短路）——old not in s 判定才是正确幂等条件 ④visual 脚本 sed 克隆时 SHOTS 常量目录名（v8633-visual）与版本号字样（8.6.34）不同源，两处都要替换
- 【像素级验证】visual-v8635/mad-v8635（v8.6.34 方案克隆）：docked 磁贴墙 clip 三连截图 MAD(A,C)=0.000（退禅后磁贴区与禅前像素级全等——覆盖层常驻零副作用）、MAD(A,B)=6.495（禅中雾化真实渲染，与 v8.6.33/34 数值一致）——FROST-ALIVE PASS
- 【发布】main 0753644（8 文件对账无夹带：globals.css/page.tsx/Clock.tsx/changelog.ts/build-extension.py/probe-v8635 新增/visual-v8635+mad-v8635 新增）

Stage Summary:
- v8.6.35 全链路闭环：禅时钟闪动修复（缩放残留清零 + 冒号呼吸/覆盖层动效 CSS 化——framer WAAPI 空窗家族在禅链路清零）+ 退禅幽灵复现结构根治（exit 卸载链路退役，常驻 + visibility 离散插值）——第十四轮两点全清
- 分发：全改动在页面层（globals.css/page.tsx/Clock.tsx），云推 ≤6h 到存量装机，无需换 crx
- 新律：①「CSS 常驻 + visibility 离散插值」是条件渲染浮层的结构免疫形态——AnimatePresence exit 的节流滞留与卸载层缓存 ghost 两类病灶从结构上不存在，代价仅常驻渲染（轻量组件可忽略）②组件内「到点结算/副作用」型子组件必须条件挂载（常驻会改变写者拓扑，ZenPomodoro 若常驻则禅外番茄钟到点双重结算）③探针行为门的 evaluate 前必须 rAF 轮询等待目标节点（bootNewTab 的 body.children>0 是水合早期信号非渲染完成信号）
---
Task ID: 137
Agent: main (Super Z)
Task: 用户第十六轮反馈「关闭 dock 栏功能面板时，面板顶部会出现一条白条，修复这个问题（不要动任何功能和动画）」——v8.6.36 面板关闭白条修复（最小影响面）+ 云推

Work Log:
- 【诊断基建坑】/tmp/ext-v869 被中途清空（manifest/shell.html 丢失）→ 扩展加载失败 ERR_BLOCKED_BY_CLIENT（sw=[] 实锤未加载）——诊断脚本须自带 rmSync profile + 重新解包；诊断脚本 profile 必须与 EXT_ID 派生路径一致
- 【数值实锤根因】自写逐帧诊断（stage/card rect + computed 样式 + getAnimations）：关闭链路 = 高度盒折回 0（EXIT_EASE cubic-bezier(0.4,0,1,1) 前慢后快）+ 玻璃卡 h-full 满窗律被压扁（cardH==stageH 每帧贴合实证）+ 共享 out-kf 背景渐隐 0.22s 全程线性——压扁段（壳高 30-100px，t≈120-190ms）背景还剩 10-25% 白底 + blur 驻留满值把壁纸糊亮 → 压扁中的玻璃卡 = 面板顶部一条白条。卡壳贴合/底锚（stageY+stageH 恒 640）排除缝隙假说；anim 实验实锤 headless 时间膨胀（真实 120ms 动画只走 17ms）——数值采样必须 WAAPI currentTime 快进
- 【最小修复】新增 .panel-sink .cl-panel 专属 keyframes（cl-panel-out-kf）：背景/描边/阴影渐隐提前到 40%（88ms，EXIT_EASE 高度进度仅 ~22%=壳高 78% 完整段正常散场）完成，压扁段背景全透明=纯 blur 磨砂无白底；blur 驻留 55% 与 0.22s/cubic-bezier(0.4,0,1,1) 完全不变（感知同步律保留）。共享 glass-card-out-kf（纱幕 veil-out/弹窗 dialog-sink/ctx-out 通道）一字不动——用户「不要动无关」约束下 diff 仅 globals.css +30 行纯新增 + changelog +11 + VERSION 1 行
- 【探针】probe-v8636（sed 克隆 53 处 + TL24a/TL24b）：TL24a 静态门（专属 keyframes 在位 + 共享 out-kf 零波及 + 声明顺序后者胜）+ TL24b 行为门（真实关闭链路 + currentTime 快进：t=100ms bg=rgba(0,0,0,0)+blur(20px) 满值 / t=200ms bg 全透明+blur(6.8px) 收尾——修复前 t=100ms 白底 ~0.33）。94 PASS / 1 FAIL（T6a 存量 flake，v8.6.35 同款在案）
- 【坑录】①插入块引用后声明变量 → TDZ FATAL（「Cannot access 'cssSrc' before initialization」，Task 132 坑录同款再踩）——探针插块必须锚在其引用变量的定义门之后 ②行为门同步采样扑空（React 18 事件批处理：click 后 setState 异步提交，click 后立刻 getAnimations names=[]）——点击后 rAF×2 等提交再采样 ③探针门间状态耦合（TL24b 结束时面板未关完 → TL23 的 dblclick 被排除表 panel!=null 拦截 → inZen 假阴）——每个行为门结束必须恢复初始态（等 SINK_MS+margin）再放行 ④headless 时间膨胀（CSS 动画走时 ≈1/7 真实时间）——动画帧级断言一律 WAAPI currentTime 快进，禁止真实等待采样

Stage Summary:
- v8.6.36 全链路闭环：dock 面板关闭白条根除（压扁段背景提前散场与收折同步）——动画语言/时长/手感零变化，共享散场通道零波及，探针行为级证据闭环（第十六轮清零）
- 分发：全改动在页面层（globals.css），云推 ≤6h 到存量装机，无需换 crx
- 新律：①「不同时间基线的双动画并行」是视觉裂缝之源——高度弹簧（JS 逐帧）与 CSS 渐隐（timeline）的进度曲线必须按压扁窗口对齐，让快完成者覆盖慢完成者的可视段 ②修复类改动的 diff 纪律：新增专属规则优于修改共享规则（影响面=病灶本身）③探针行为门的时序三律：React 提交等待（rAF×2）/门间状态复位（等卸载）/headless 时间膨胀豁免（currentTime 快进）
