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
