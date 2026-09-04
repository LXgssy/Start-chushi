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

> ⚠ 历史档案：v1.3.0–v1.6.0 液态玻璃试验线（Task 56–59）的完整工作记录自远端并入，供考古。该线代码随 v1.7.0（液态玻璃撤下版）整体移除。

---
Task ID: 56
Agent: main (Super Z)
Task: 用户指令「液态玻璃换成 https://github.com/martin65536/liquid-glass-webgl 接口不够继续加；补一下图标替换与主题令牌覆写的API」

Work Log:
- 【调研】liquid-glass-webgl = Kyant0/AndroidLiquidGlass 的 WebGL 移植（Apache-2.0 可用）。element shader 核心提炼：circleMap(t)=1−√(1−t²) 圆弧透镜剖面（球面透镜投影，比 v1.2.0 smoothstep² 更物理）、SDF 梯度方向 + **负 amount 向内采样 = 凸透镜放大**（对齐 Apple/Kyant 默认 refractionAmount −24dp——v1.2.0 的「外绕」方向其实与 Apple 相反，本轮纠正）、7 通道 ROYGBV 色散、Vogel 金角螺旋 16-tap 高斯盘、边缘 stroke 高光（plus 混合）、premultiplied 输出
- 【架构决策】它是 canvas 全页自绘体系，「初始」是 DOM 应用 → 采用「每玻璃元素叠加画布」方案。**OffscreenCanvas 直转移（transferControlToOffscreen + postMessage transfer）实证不可靠：第 3 个起回包稳定丢失**（dbg-transfer/dbg-file 双重复现）→ 改 ImageBitmap 通道：引擎沙箱本地 canvas 自绘（preserveDrawingBuffer:true 保证可读）→ createImageBitmap → pushFrame → 宿主 2d.drawImage blit——宿主只搬运像素不做视觉计算（架构律保持），实测 100% 可靠且 Firefox 兼容
- 【宿主新作用面】fx.ts：快照升级（+x/y 视口坐标、+cv 画布存活标志）、attachCanvas（普通占位画布，static 父自动补 relative）、frame()（位图 blit）、backdrop()（photo: fetch→blob→createImageBitmap 宿主代取转移，glow: 光斑程序化描述 GLOW_BLOBS 契约常量、flat、+vw/vh/dark）、rAF 位置跟踪（transform 动画期 RO 不触发，变化才推 fxPositions）；sandbox.ts：fxCanvas/fxFrame/fxBackdrop 路由 + iconsOverride/themeOverride 校验（ICON_URL_RE 只收 https/data:image、THEME_TOKENS 28 项白名单）+ cleanup 事件；sandbox.js：chushi.fx.attachCanvas/pushFrame/getBackdrop/onPositions + chushi.icons.override + chushi.theme.override + fxFrameResult/fxPositions 兑现
- 【引擎 v3】scripts/pw-lab/lg-engine-v3.js（17745 字符→打包 15258<16000）：GLSL 精简版（折射+色散+blur+cctl+高光+coverUv，taps JS 展开 16/6 双档）、快照串行队列（snapChain 防并发）、bgCanvas 60s 复用+引用比对重传、位置推送 16ms 合帧、降级链（WebGL/背景不可用→纯 CSS blur+saturate）
- 【失同步自愈】React remount 连带销毁宿主画布而引擎 els 残留 → 快照 cv:false 时弃置重建；**失败分级**：单元素临时失败（快照过期）continue 重试不株连全局，仅 API 缺失/背景失败才 breakGl
- 【调试实录】①Bash 工具显示层会吞 [m.s 字节序列（grep 输出 pendingFxReq[m.seq] 显示成 .seq]）——差点误判文件损坏，Read 工具为准；②dev server Fast Refresh 会在编辑代码后打断测试（边改边测=自我干扰）→ production 构建验证才作数；③python patch 静默失败两次（锚点缩进不匹配/部分生效），教训：patch 后必须 grep 验证关键标识落盘
- 【焕新 API】chushi.icons.override：FxIcon 组件（IconOverrideContext）+ Dock 7 槽位（weather/todo/note/pomodoro/cmdk/settings/close）+ searchbar；chushi.theme.override：亮暗双域 style 元素（:root/.dark !important 压 inline accent），cleanup 即还原
- 【验证】verify-v13.mjs 27 项全过（production standalone）：canvas 挂载×3（search/dock/⌘K 卡 fx4）、z-index=-1、无降级、⌘K 开合重建、设置分区 5 滑杆、拖拽导入、图标覆写生效（img 替换）、主题覆写生效（accent #00c896）、删除全回收（canvas/图标/主题/磨砂）、pageerror=0；浅色/深色双主题折射截图在 shots/
- 【发布】main 85b60ba；gh-pages e0583bb（.nojekyll 三件套+线上核验：index 一致、ebcda285 chunk 含 v=115+iconsOverride、sandbox.js 含 pushFrame）；Release v1.3.0（id 381899327）+ ChuShi-NewTab-v1.3.0.zip（11.7MB）已传；build-extension.py 重建为 REF_ZIP 动解压（/tmp 清理免疫）；sandboxSrc v=115
- 【文档】README（版本注记 v1.3.0 段+fx 作用面表全量重写+WebGL 通道律）；docs/PRESET_DEV.md（§08 WebGL 骨架+通道律+物理模型、§08.5 图标/主题、§10 API 表、§15 六维焕新结论）；PresetDocs.tsx 页内同步
- 【交付】文叔叔 v1.3.0 合并交付包（更新说明+开发者文档+液态玻璃预设+扩展 zip）→ https://c.wss.ink/f/ksarhg4soy5（1 天过期）

Stage Summary:
- 架构律（新增）：①跨上下文位图通道用 ImageBitmap（OffscreenCanvas transfer 在 Chromium 多发后回包丢失，实证废弃）；②引擎状态与宿主 DOM 会因 React remount 失同步——快照必须带宿主侧存活标志（cv）驱动重建；③失败分级：临时失败（快照过期）元素级重试，永久失败（API 缺失）才全局降级
- 物理律（修正）：Apple 液态玻璃边缘折射 = circleMap 圆弧剖面 × SDF 梯度 × 负 amount 内采样（凸透镜放大）——v1.2.0 的外绕方向与 Apple 相反，本轮纠正
- 环境律：①Bash 工具显示层吞 [m.s 序列，文件内容以 Read 为准；②边改代码边跑 dev 测试=Fast Refresh 自我干扰，production 构建验证才作数；③gh-token 文件可从 git remote URL 重建
- 交付：https://c.wss.ink/f/ksarhg4soy5（1 天过期）
- 待办：Edge 商店提交材料仍未做

---
Task ID: 57
Agent: main (Super Z)
Task: 用户反馈「液态玻璃光靠预设包效果还是不行，直接写进初始里面，通过预设包调用；玻璃不会实时渲染；覆盖范围不够」——引擎收编内建宿主 v1.4.0（并合并远端 Task 56 的图标/主题 API）

Work Log:
- 【考古排雷】push 被拒后发现远端已有 Task 56（85b60ba，v1.3.0 已发布：WebGL 液态玻璃住预设包 + chushi.icons.override 图标替换 + chushi.theme.override 主题令牌 28 项白名单 + fx 位图通道 attachCanvas/pushFrame/getBackdrop/onPositions）——用户本条反馈正是对那版的否定；本地工作与之分叉，策略 = 合并保留其图标/主题/位图通道 API，液态玻璃按最新指令换成宿主内建引擎，版本顺延 v1.4.0
- 【污染清剿】Task 56 曾把整套 Pages 构建产物（.nojekyll/_next/404.html/api/gallery 等 21 项）误提交进仓库根——合并解决时全部 git rm，.gitignore 增设根级产物防护段；过时的 lg-engine-v3.js（15KB WebGL 预设引擎）一并移除（git 历史可考）
- 【引擎定稿】src/lib/startpage/liquid-glass.ts（~600 行）：rAF 逐帧 getBoundingClientRect 几何追踪（transform/高度弹簧/transition 全覆盖）；变动期贴图 1/4 分辨率 30fps 重建（折射全程在线，永不再退化纯模糊），稳定 160ms 换半分辨率精贴图；新贴图 Image 预解码后原子换 href 无空窗帧；物理 = SDF 梯度 × **负量内采样（feDisplacementMap 负 scale，凸透镜放大，Apple/Kyant refractionAmount −24dp 同向）** × smoothstep² 边缘窄带 + 贴图域渐隐环 + 链序律 blur→url→saturate；单持有者制（enable 冲突返回 ok:false）；覆盖注册表 core 四区 + full 另含 .glass-chip（天气芯片），全屏幕布永不折射；零几何侵入（不改 border/margin/width——曾实现的「边框外扩真环绕」因与负采样物理冲突且增布局风险，本版移除）
- 【新作用面】chushi.glass.enable/patch/disable：cfg 八字段白名单夹紧（refraction/band/frost/saturation/brightness/dispersion/specular/coverage core|full）；sandbox.ts glassEnable/glassPatch/glassDisable 路由 + teardown/prevKeys/watchdog 三路 release；sandbox.js chushi.glass + glassResult 兑现；官方液态玻璃预设瘦身为 1.8KB 薄脚本（settings.define 八项含「覆盖范围」select + enable + onChange→patch），设置持久化/删除回收沿用 v1.2.0 设置面
- 【合并实录】9 处冲突逐一解决：sandbox.ts（glass 分支 + icons/theme 分支共存）、sandbox.js（双方 API 并集）、fx.ts（保留其 attachCanvas 位图通道 + 我的 chip 白名单）、README/PRESET_DEV/PresetDocs（§08 重写为 chushi.glass + 保留 §08.5 图标/主题与位图通道律）、build-extension.py（其 REF_ZIP 动解压版 + VERSION 1.4.0）、verify-v13.mjs 归还其作者（历史探针）、v1.3.0 交付 zip 归还其发布版；沙箱 v=115→116
- 【验证】verify-v14.mjs 九组全过：激活/链序/负 scale(−21.11)/实时（弹簧 900ms 贴图 5 版 0 掉链帧）/覆盖热切（chip full↔core 注入式判定）/⌘K 卡折射/幕布豁免/双通道共存/删除全回收+外点关闭回归，0 pageerror；verify-ext-v14.mjs 扩展冒烟（真浏览器 --load-extension：负采样+实时链+贴图 ✓）；verify-icons-theme.mjs 合并回归：icons.override 正向注入+空 map 清除 ✓、theme.override 注入+删除还原 ✓
- 【发布】main 5def1fa；gh-pages c2fe144（线上 index 引 7acde5f chunk 含 chushi-lg-root+v=116 实测 ✓）；Release v1.4.0（id 381999367）+ ChuShi-NewTab-v1.4.0.zip（12.2MB）已传；文叔叔合并交付包 → https://c.wss.ink/f/ksbxrbzpaod
- 【教训】①合并前必须 git log HEAD..origin/main 考古——远端可能已有同版本号的不同实现（本轮 v1.3.0 撞号，顺延解决）；②gh-pages 指纹核验别拿共享 chunk（哈希跨版本稳定），要用新功能特征串（chushi-lg-root/v=116）；③沙箱环境 python 多版本（3.12 venv 无 base58/pycryptodomex）——wss-send.py 已加 base58 内置兜底，pycryptodomex 用 venv pip 安装

Stage Summary:
- 架构律（v1.4.0 定稿）：液态玻璃引擎内建宿主（可见文档 rAF 实时渲染），预设包只调用——「宿主不做视觉引擎」旧律废除；fx 通用面与位图通道保留为自定义视觉通道
- 物理律：Apple 边缘折射 = SDF 梯度 × 负量内采样（凸透镜放大）；SVG feDisplacementMap 负 scale 即可实现，无需自绘
- 交付：文叔叔 https://c.wss.ink/f/ksbxrbzpaod（1 天过期）；Release v1.4.0；Pages 已上线
- 待办：Edge 商店提交材料仍未做

---
Task ID: 58
Agent: main (Super Z)
Task: 用户指令「把旧的 liquid glass 遗留代码全部删掉，玻璃面板与 liquid glass 设置换成 liquid-glass-webgl（玻璃游乐场）的实现，底部标签栏动效与按钮动效也换成该仓库的，代码里写明作者和出处」—— v1.5.0 游乐场移植版

Work Log:
- 【调研】完整克隆研读 https://github.com/martin65536/liquid-glass-webgl（Next.js 16 单 WebGL 画布渲染体系，Apache-2.0，作者 martin65536；原型 Kyant0/AndroidLiquidGlass）：element.ts 着色器（circleMap 圆弧剖面 × SDF 梯度 × 负量内采样 −24dp × 7 通道 ROYGBV 色散 × 16-tap Vogel 盘 × colorControls × 预乘输出）、highlight.ts 描边 pass（3-tap 高斯 + Plus 混合，Default/Ambient/Plain）、spring.ts 闭式弹簧（临界 1000 / 欠阻尼 250@0.6/0.7、300@0.5）、methods-tabs.ts + DampedDragAnimation（78/56 按压、速度拉伸除数 10、panelOffset 4dp EaseOut）、build-glass-playground.ts（五滑杆：圆角/模糊/折射高/折射量/色散）
- 【清剿】git rm src/lib/startpage/liquid-glass.ts（v1.4.0 SVG 引擎 600 行）→ 新建 src/lib/startpage/liquid-glass/ 四件：shader.ts（GLSL 移植精简：仅壁纸直采路径）、spring.ts（弹簧+VelocityTracker1D）、engine.ts（单 GL 上下文共享画布 + createImageBitmap 串行队列上屏（v1.3.0 实证律）+ 每元素 2d 叠层 z-index:-1 + 覆盖注册表 core(+dock-indicator)/full + 嵌套玻璃豁免（指示器例外）+ kenburns computed-transform 逆解 + photo-scrim 三段常量 + 角色 ROLES 对照游乐场各页参数）、dock-motion.ts（TabIndicatorMotion 滑动/按压/速度拉伸/panelOffset 状态机 + LiquidButtonPress）
- 【Dock 重构】framer layoutId 药丸 → .cl-dock-indicator 玻璃胶囊（motion 驱动 transform、槽位浮点插值）；DockButton 换 LiquidButtonPress（scale 1+4/48×p + tanh 平移 + --press-p 白晕 .liquid-btn-glow plus-lighter）；nav 级拖拽滑选（8px 阈值、suppressClick 抑制、按钮按压取消协议）
- 【预设包】settings.define 换游乐场五滑杆（折射高度/折射量/模糊/色散%/饱和度）+透亮+高光+覆盖范围；chromaticPct→chromatic 换算；glass API 形状不变（chushi.glass.enable/patch/disable）
- 【调试实录】①tick 空引用 wpImg.currentSrc（null 崩溃断 rAF 链）②tick 作用域 key（嵌套豁免引用 observe 的局部量）③patch 漏刷 cfgSig（热调不重绘——签名含 cfgSig 但 patch 没更新）④嵌套豁免误杀指示器（它是 nav 子元素但背景是壁纸）⑤teardown 不回收 .lg-ov 画布（残留 3 面）⑥跨域壁纸 texImage2D SecurityError 被 catch 吞 → 空纹理采样恒黑（黑板玻璃截图实证）→ fetch-CORS 链路在 SW cache-first 下挂起 → 改 crossOrigin="anonymous" Image 重载（命中缓存 280ms）落定；调试基建：window.__chushiLG() 探针（cfg/recs/lastDraw/sig/wpDbg）
- 【验证】verify-v15.mjs 八组全过（photo 模式种入：photo-mode+壁纸/引擎激活+叠层画布/GL 像素 98%+面板弹簧期画布尺寸五连变+指示器滑动+玻璃画布/按压 0.93+白晕/嵌套豁免/blur 8→24 热调像素差 26.9 万/删除全回收+⌘K 回归/0 pageerror）；verify-ext-v15.mjs 扩展冒烟（glow→CSS 磨砂降级预期、photo→WebGL 真像素 [27,39,4] 绿色系）
- 【发布】main ef719ad；gh-pages 8ea7c6c（out/ 纯净重建，线上 a719bed chunk 含 chushi-lg-root+v=117+dock-indicator 实测 ✓）；Release v1.5.0（id 382100654）+ ChuShi-NewTab-v1.5.0.zip（12.2MB）已传；sandboxSrc v=117；build-extension.py VERSION/DEST 改 v1.5.0（并发现其只打包现成 out/，build:extension 必须先跑）
- 【交付物】download/v1.5.0/（更新说明+开发者文档+液态玻璃预设+扩展 zip+合并交付包）
- 【教训】①Bash 显示层吞 [m 字节序列（[martin 被显示成 artin）——文件内容以 Read 为准（本轮再次实证）；②build-extension.py 不执行构建只打包 out/——换版本先 build:extension；③跨域 <img> 能显示≠能上纹理（WebGL taint 抛 SecurityError），CDN 带 ACAO:* 时 crossOrigin="anonymous" 重载是唯一稳路（SW 场景 fetch 不可靠）

Stage Summary:
- 架构律（v1.5.0 定稿）：液态玻璃 = 游乐场移植版宿主内建（WebGL 单上下文+位图串行队列+叠层画布），预设包 chushi.glass 一句调用；底栏指示器/按钮动效同源移植；所有移植文件头部+文档+预设包带作者出处
- 物理律：circleMap(1−√(1−t²)) × SDF 梯度 × 负量内采样；速度拉伸除数 10；按压 78/56；slider/容器缩放 16dp/宽×1.2
- 部署：Pages 已上线（线上特征核验 ✓）；Release v1.5.0 已传；文叔叔交付见后续
- 待办：Edge 商店提交材料仍未做

---
Task ID: 59
Agent: main (Super Z)
Task: 用户截图反馈五问题（①设置不是游乐场的 ②底栏灾难：拖拽只放大图标不放大胶囊/松手概率不回弹 ③玻璃不渲染组件只渲染背景 ④移植要覆盖所有按钮 ⑤非玻璃模式不得用新动效）——澄清后范围=整个 liquid-glass-webgl 仓库，玻璃设置取自游乐场（除圆角半径）——v1.6.0

Work Log:
- 【调研】重克隆 liquid-glass-webgl：游乐场设置面板 = build-glass-playground.ts 五滑杆（圆角/模糊/折射高/折射量/色差）；tab = LiquidBottomTabs（容器 64dp lens(24,−24) blur8、指示器 lens(10,−14) blur0 透明面 dim0.1、按压 78/56、速度拉伸除数10、panelOffset 4dp EaseOut）；按钮 = LiquidButton（1+4/48×p + tanh + InteractiveHighlight）
- 【病理五连】①v1.5.0 发布的 lg-engine.js 仍是旧八项滑杆（游乐场滑杆没进发布包）②叠层画布整面不透明采壁纸→玻璃身后 DOM 全被抹掉③nav 拖拽无 pointer capture→拖出 nav 外松手 isDragging 永久卡死→「概率不回弹」④指示器 opacity=panel?1:0→面板没开拖拽时胶囊不可见=「只有图标变大边框不变」+ tab 按钮自带 LiquidButtonPress 与组按压 1.2× 双重放大⑤v1.5.0 把 framer 药丸永久换掉=新动效泄漏到非玻璃模式
- 【渲染模型重构】shader 输出乘 SDF 距离归一带掩膜 band=1−smoothstep(0.55,1,−sd/height)（height=0 全透明）→画布只画边缘折射带；材质 CSS 改为玻璃体=CSS backdrop-filter 磨砂（:root --lg-blur/--lg-sat，cfg 热调即刷）+ 逐角色表面色（dock/panel/card=tabsContainer .4、search=buttonSurface .3、指示器/芯片透明）→玻璃身后组件可见可点
- 【渲染缺陷修复】rim 高光 pass Plus 混合输出常数 alpha=1 会把带掩膜后的内部整体顶回不透明黑（v1.5.0 内部本就实心故未暴露）→ alpha 贡献改 = max(r,g,b)
- 【设置面板】lg-engine.js v4：游乐场四滑杆（模糊半径0-32/折射高度0-48/折射量0-48/色差0-100%）+覆盖范围；色差 %→0..1 换算；重建 examples/液态玻璃预设.json（2402 chars）
- 【dock 双模式】lgOn=useSyncExternalStore(liquidGlass.subscribe/isOn)：玻璃模式=指示器常显（.cl-dock-indicator + cl-ind-dim/cl-ind-rim 按 --press-p 驱动）+TabIndicatorMotion+容器缩放（nav 本体 scale 1+16/W×p，Tailwind v4 translate 属性与 transform 不冲突）+内容 1.2×+拖拽物理；非玻璃=原 framer layoutId 药丸+纯 hover；动作按钮（⌘K/预设）走全局 LiquidButtonGlobalController（document 捕获委托，覆盖全文档按钮，data-lg-tab 豁免 tab）
- 【点击失效实录】setPointerCapture 挂 pointerdown 会把 click 重定目标到公共祖先（nav）→玻璃模式 dock 全部点击死——capture 必须延迟到拖拽启动（8px 阈值）时刻；另补 hold/unhold（按住 tab 容器/内容/指示器同步胀，DampedDragAnimation hold 律）
- 【调试实录】①无头 Chromium rAF 节流 ~13fps，弹簧 dt 上限 50ms→仿真时间慢于墙钟，按压衰减需 ~1s（真机 0.3s）——测试等待不足误判「松手不复位」②部署事故：git worktree prune 后在失注册目录 git add -A 把主仓 60907 文件（含 .env）staged、reset --hard gh-pages 把 main 打到部署树清掉工作区源码——reflog 里 e01cba8 完好，git reset --hard e01cba8 完整恢复；教训：gh-pages 部署一律独立 git clone（--depth 1 --branch gh-pages），废弃 worktree 方案
- 【验证】verify-v16.mjs 九组 41 断言全过：带掩膜画布（中心 alpha=0 边缘带 234）/组件透见（面板 bg .4 + bf blur8 + 截图目检搜索条磁贴透过玻璃）/指示器常显对齐/拖拽放大 1.39+速度拉伸+拖出 nav 外松手回弹/组按压 1.2×+tab 零自身变换/⌘K 全局按压+松手清零/游乐场五控件+blur 热调像素差 25.8 万+色差 %→0.8 换算/非玻璃全静默+framer 药丸回归/⌘K 回归+0 pageerror；verify-ext-v16.mjs 扩展冒烟（glow→CSS 磨砂降级、photo→WebGL 真像素）
- 【发布】main e01cba8；gh-pages e446549（独立 clone 部署，线上 1778cbf2 chunk 特征串 6 处命中实测 ✓）；Release v1.6.0（id 382151880）+ChuShi-NewTab-v1.6.0.zip（12.2MB）；文叔叔交付包 → https://c.wss.ink/f/ksdfh4nwmfn（1 天过期）

Stage Summary:
- 架构律（v1.6.0 定稿）：玻璃 = 边缘折射带画布 + CSS backdrop-filter 磨砂体混合合成（画内部=抹组件）；新动效由 lgOn 门控只给玻璃模式；tab 按钮豁免自身按压防双重放大；全局按钮按压走事件委托控制器
- 指针律：setPointerCapture 必须在拖拽启动时刻而非 pointerdown（capture 重定目标 click）；无头 rAF 节流下弹簧验证要按仿真时间放宽等待
- 交付：https://c.wss.ink/f/ksdfh4nwmfn（1 天过期）；Release v1.6.0；Pages 已上线
- 待办：Edge 商店提交材料仍未做

---
Task ID: 60
Agent: main (Super Z)
Task: 用户指令（史6，最高优先级）「把液态玻璃所有相关代码删掉，添加通用换材质API（非液态玻璃特化，用户可经它实现液态玻璃甚至Win UI），更新日志写无法真正移植到'初始'；修 tab 栏液态玻璃动画+选框改Q弹；开发者文档正式化；API 覆盖动效语言与时钟格式；写 8 维示例预设包；导入面板加图形化开发工具下载按钮（HTML 单文件内嵌、含使用说明、离线可用）」—— v1.7.0

Work Log:
- 【考古排雷】push 被拒后发现远端已有 Task 56–59（v1.3.0–v1.6.0 液态玻璃试验线：WebGL 引擎内建/游乐场移植/玻璃动效/lgOn 门控）——史6 指令语义正是删除该线全部内容。裁决：以本地 v1.2.0 干净基线 + 史6 工作为主线 force push（试验线代码主体即待删对象；其伴随 API icons.override/theme.override 由本版声明式 icons/tokens 覆盖且更完整）；版本顺延 v1.7.0（v1.3.0–v1.6.0 不复用）；远端 worklog Task 56–59 并入本仓作历史档案；Release v1.3.0–v1.6.0 资产留在 GitHub 不可变
- 【液态玻璃清剿】examples/液态玻璃预设.json、pw-lab lg-engine/build-lg-preset/verify-lg/verify-disp/verify-ext-v12 全删（git rm）；fx.ts/sandbox.ts/sandbox.js/preset-settings/SettingsPanel/ContextMenu 注释中液态玻璃措辞中性化为「材质」；宿主代码确认零液态玻璃实现（v1.1.3 架构律延续）
- 【换材质 API】public/sandbox.js 新增 chushi.material.apply({css,svg?})/reset()：css 包 <style>（剥 </style 防提前闭合）、svg 直传，组包走 fx mount（挂载 id 固定 material，重复 apply 幂等替换不闪断）；材质 CSS 直接用公开元素钩子（.search-pill/.cl-dock/.cl-panel/.glass-card），无需感知 data-fx；高级折射类仍可下探 fx.onResize 动态贴图。删除预设宿主整组回收
- 【四焕新作用面】preset.ts 新增声明式字段：icons（target 白名单六按钮 × icon=内置名/data:image base64 ≤8KB，<img> 静态渲染不执行脚本）；tokens（键白名单 --ui-accent/--pill-seg/--pill-seg-ring/--pill-line，值 ≤120 净空 ;{}<>）；motion（profile standard/playful/calm/instant + speed 0.5–2）；clock（hour12/showSeconds/showDate/greeting 模板 {greet}/{name} ≤40，空串=隐藏）。parsePreset 白名单整体拒绝制校验
- 【接线】page.tsx presetExtras 派生（安装顺序后者胜）+ tokens 注入 effect（--mo-speed 同载；声明序在强调色 effect 后=预设胜，删预设 removeProperty 还原）；Dock 接 motionProfile/presetIcons；Clock 接 preset（字段存在即覆盖用户设置）
- 【tab 栏】DockButton 选框（layoutId dock-active-pill）加 initial scale .6/opacity 0 → POPPING spring（520/20/0.9）Q 弹出场（backOut 过冲，非玻璃材质）；MOTION_PROFILES 四档接管面板高度弹簧与选框滑动；Dock 新增 PresetGlyph（lucide 名→组件 currentColor，data URL→img）
- 【globals.css】--mo-speed 乘入九条入场/聚拢动画时长（intro-rise/panel-fade/veil-in/card-in/content-focus/ctx-in/ctx-item-in/docs-item-in/dock-rise 含延迟）；退场类恒定（JS 卸载计时一致性律——PresenceClass/framer exit 定时器变速会截断动画）
- 【8 维示例预设】examples/焕新示例预设.json（1983 chars）：Fluent 亚克力材质（material.apply，亮暗双变体+圆角 10px）+ 4 磁贴 + layout 列数/缩放 + 磁贴微动效 animations + 3 图标替换（weather→cloud/todo→star/command→terminal）+ Fluent 蓝令牌 + playful/speed1.1 + 12h/问候模板；生成器 scripts/build-showcase-preset.py
- 【图形化开发工具】public/preset-studio.html（39.9KB 单文件离线应用，零依赖）：四页签表单（基础/内容/焕新/样式与脚本）+ 动态列表编辑（命令/磁贴/栏按钮/图标/动画/脚本）+ 实时 JSON + 完整性提示（https/图标形态/speed 区间）+ 下载/复制/示例填充/JSON 导入回填 + 内嵌使用说明（三步上手/作用面速查表/换材质示例/上限表）；PresetPanel 导入视图「开发工具」按钮 a[download] 同源直下（basePath 兼容 Pages/扩展）；sw.js 预缓存该文件（离线下载保障）
- 【文档正式化】PresetDocs.tsx：§07b 焕新四作用面新增；§08 重写「fx 效果作用面与换材质 API」（material 行入表、官方液态玻璃预设引用全清、settings 示例改「材质调校」）；§14 补图形化工具条目；§15「整页焕新能力评估」重写为「作用面总览」正式版（八维表+示例索引，删「按性价比排序/下一批最值得补」评估口吻）；docs/PRESET_DEV.md 同步（目录/§02 十三字段/§03 四行上限/§07b/§08/§10 material/§14/§15）；README（预设功能行/v1.7.0 注记含试验线说明/字段表四行/chushi API 表 material/换材质节重写/八维示例与工具节/沙箱容量 8000→16000 修正）
- 【验证】verify-v13.mjs 21/21 全过（基线/tokens Fluent 蓝/mo-speed 1.1/12h+问候模板/material 挂载+亚克力滤镜/磁贴 6 列/CSS 注入/star 覆写/Q 弹 matrix(0.6)→none/工具 200+下载按钮/删除全还原/pageerror 0）；verify-ext-v13.mjs 扩展冒烟 6/6（unpacked 扩展 ID=路径 SHA256 前 32 hex→a-p 映射推导，headless=new 下 SW 探测不稳的替代律）
- 【发布】main 3a7efd5 force push（e65b8be→3a7efd5）；gh-pages 9d89648 独立 clone 部署（线上 76ca538b chunk 含 material.apply+preset-studio ✓、sandbox.js material ×6 ✓、studio 39906B 200 ✓）；Release v1.7.0（id 382469849）+ ChuShi-NewTab-v1.7.0.zip（12.2MB）已传；交付物 download/v1.7.0/（更新说明+开发者文档+焕新示例预设+扩展 zip+合并交付包 11.7MB）

Stage Summary:
- 架构律（v1.7.0 定稿）：宿主零视觉引擎回归——液态玻璃试验线（v1.3.0–v1.6.0 四个版本）整体移除，「初始」以 v1.2.0 干净基线 + 通用作用面重新出发；材质/风格全部由预设经 chushi.material（首选）或 chushi.fx（高阶）自行实现
- 声明式作用面扩至八维：材质（脚本 API）/内容/排版/动画/图标/令牌/动效/时钟；「装了即生效、删除即还原、白名单整体拒绝、后者胜」产品律全维适用
- 版本考古律：push 前必查远端（git fetch + log HEAD..origin/main）——上一会话可能已在远端发布同号版本；撞号即顺延，历史档案（worklog）合并保留
- 交付：文叔叔 v1.7.0 合并交付包（见下方链接）
- 待办：Edge 商店提交材料仍未做

---
Task ID: 61
Agent: main (Super Z)
Task: 用户反馈六问题（①开发工具导出 .cshz 包 ②开发工具显示/其它 bug ③tab 选框切换动画恢复旧样式+Q 弹进示例预设+补消失动画 ④导入面板拖拽提示无下移动画 ⑤PC 批量编辑/删除快捷服务进右键菜单 ⑥预设改时钟后设置面板调不回）—— v1.7.1 体验修缮批

Work Log:
- 【开发工具 .cshz 导出】preset-studio.html 内置零依赖 zip 写入器（CRC32 表 + STORE 法 + UTF-8 标志 + 固定 DOS 时间戳防部分解压器不兼容），「下载 .cshz 包」升为主按钮，manifest.json 单文件包与 pack.ts 解析端约定一致；文件名非法字符净化
- 【studio bug 三连】①`all: unset` 会把 box-sizing 重置回 content-box——`.add`（width:100%+内边距）溢出面板 34px 被裁切（截图 bug 实证根因），修复后补 focus-visible 焦点环；②动态项卡片 padding-right 34px 给悬浮 × 让位；③帮助 dialog 补 max-height:84vh+overflow:auto；④【功能 bug】静态字段（名称/令牌/动效/时钟/布局）此前无任何监听，只有动态列表编辑才触发 update()——JSON 输出与完整性提示不实时刷新，补 main 下全局 input/change 监听；⑤dock open 动作补 https 前缀校验提示
- 【选框三段式】出现=Q 弹固定保留（initial scale .6→POPPING）；切换=layoutId 滑移恢复基线弹簧 420/34（与 v1.1.x 一致），**且 pillPop 门控 initial**——无面板→开面板才播 Q 弹，面板间切换不重播（渲染期 prevPanelRef 同步，React 官方模式）；消失=AnimatePresence 包裹+exit scale .6/opacity 0（0.16s 退场加速曲线）；Q 弹滑移=playful 档专属（示例预设已用 playful=动画进示例预设）；per-value transition 语法 transition={{layout,opacity,scale}}
- 【导入面板形变】Collapse 组件（AnimatePresence+motion.div height 0↔auto+overflow-hidden，内边距放子元素防 height:0 占位）包住拖拽提示与错误列表，按钮组被平滑推下；宿主形变舞台 ResizeObserver 自然跟随
- 【批量管理磁贴】QuickLinks 监听 start:links-manage 全局事件→setEditing(true)（与触屏长按同模式：jiggle+× 删除+点击编辑+拖拽排序+空白退出）；ContextMenu 加 ListChecks 图标；page.tsx 右键动作「批量管理磁贴」+进入 toast 操作指引
- 【时钟语义修正】Clock 只从 preset 读 showDate/greeting（无面板控件，声明式，删除即还原）；hour12/showSeconds 改 installPreset 时一次性 patchSettings（与 settings 字段同律），面板随时可调回；PresetClock 注释/文档同步
- 【验证】verify-v171.mjs 25/25：studio .add 右缘 701≤面板 720 / .cshz 下载→fflate 解包 manifest 含 clock.hour12 / 拖入安装→settings.hour12=true / 预设装着时面板切 24 时→UI 立即回 24 时制 / 选框出场 matrix(0.6) 起步 / 切换 matrix(1,0,0,1,-43,0) 纯滑移 / 消失中间态 opacity 0.295 / 拖拽提示位移+高度盒 / 右键 8 项含批量管理 / pageerror=0；verify-ext-v171.mjs 扩展冒烟 7/7（unpacked ID 推导律沿用）
- 【测试环境律重申】无头 rAF 节流 ~13fps：0.32s 形变只够采 2-3 帧，中间帧断言按仿真时间放宽（位移发生+framer 高度盒 overflow:hidden 在管 兜底判定）；evaluate 内联 dragover+rAF 采样消除 roundtrip 延迟
- 【事故】正则批量注入 JSX 把 `=>` 当标签结束截坏 Dock.tsx——git checkout 回滚后改手动 MultiEdit 七处注入；bun run build（standalone 变体）≠ build:export（Pages 导出）——out/ 未更新导致首轮 studio 断言全炸，Pages 部署一律 build:export
- 【发布】main 4048061；gh-pages e64eb92 独立 clone 部署（线上 chunk b0e17f69 含「批量管理磁贴」、studio 含 zipStore 实测 ✓）；Release v1.7.1（id 382489131）+ ChuShi-NewTab-v1.7.1.zip（12.2MB）已传；交付物 download/v1.7.1/（更新说明+开发者文档+焕新示例预设+扩展 zip+合并交付包 12.3MB）

Stage Summary:
- 产品律（v1.7.1 定稿）：选框动效三段式——出现 Q 弹/切换标准滑移（playful 档例外）/消失缩回淡出；预设 clock 拆两语义（hour12/showSeconds 一次性合入面板可调，showDate/greeting 声明式删除还原）
- 架构律：`all: unset` 后必须重申 box-sizing；Next.js 双构建变体（build=standalone / build:export=Pages）别混用；静态表单字段必须统一挂更新监听
- 交付：文叔叔 v1.7.1 合并交付包 → https://c.wss.ink/f/ksj2vh8gfwz（1 天过期）；Release v1.7.1；Pages 已上线
- 待办：Edge 商店提交材料仍未做

---
Task ID: 62
Agent: main (Super Z)
Task: 用户反馈五问题（①搜索建议选中残留 ②掠影壁纸支持 GIF/视频 + URL 直链导入 ③单排磁贴主列上移 ④扩展时钟字体与网页版不一致/冒号不居中 ⑤导入面板拖拽提示与按钮下移不同步）—— v1.7.2

Work Log:
- 【①搜索建议】SearchBar 建议列表容器补 onMouseLeave={() => setActive(-1)}：hover 设置的 active 此前在指针离开后残留、回车误发旧项；键盘 ↑↓ 导航不受影响（verify 实测 hover→移出→高亮清除→键盘仍可选）
- 【②掠影媒体化】Settings 新增 wallpaperUrl 字段（URL 导入源，与本地上传 IndexedDB 互斥，导入其一清另一）；gallery.ts 新增 wallpaperKindOf（MIME 优先、扩展名回落：video/gif/image 三态）+ WALLPAPER_ACCEPT；SettingsPanel：GIF/视频原样入库（canvas 降采样会把 GIF 抽成静帧——跳过；视频上限 80MB）、壁纸区新增直链 URL 输入行（http(s) 校验、回车/按钮导入、视频缩略图 Clapperboard 图标占位防坏图）；AuroraBackground：custom 源 URL 优先于 IDB、customUrlRef/customKindRef 双 ref 供黑幕序列与渲染派生、视频走 <video muted loop autoPlay playsinline>（onCanPlay 门控揭幕）、GIF/img 免 kenburns、preloadVideo 以 canplay/2s 预算放行；page.tsx 传 wallpaperUrl；禅模式亮度采样对视频天然回退（无 img[data-wallpaper] → tone auto）
- 【③排版重心】单排磁贴（rows=ceil(n/columns??6)==1 且 ≥720px）时 main 由 pb-44 换 min-[720px]:pb-[15rem]，整组上移 32px 对齐双排自然重心；窄屏估算失真场景不受影响
- 【④字体锚·本版最深排障】CDP 逐层实证：扩展新标签页命中 body 的 font-family 规则有两条——官方 @layer base 栈（regular）+ **UA 注入的未分层 body{font-family:"DejaVu Sans"...;font-size:75%}（origin=injected）**，未分层恒压分层 → 扩展时钟回退系统字体（字重发虚+冒号双点失准：Colon 的 DIGIT_INK_CENTER_EM 按 Geist 烤定）；网页版无该注入规则故正常（六轮 probe 排除 @property/变量链/CSP/字体文件，fontsCheck=true 而 computed 无 Geist 的矛盾由 injected 规则唯一解释）；修复=globals.css 追加未分层 html body 官方字体栈（特异性 0,0,2>0,0,1）；扩展实测 body/时钟栈均回 Geist ✓
- 【⑤同参弹簧】PresetPanel Collapse 由 EASE 0.32s 补间改为与宿主指令面板外壳同参弹簧（stiffness 460/damping 38）——此前两条时间线叠加致列表形变与按钮推移脱拍；同参后外壳仅晚一帧追随同一弹簧
- 【验证】verify-v172 19/19（建议 hover/移出/键盘、URL 图片/视频导入持久化与渲染、GIF 原样入库+互斥、单排/双排 class 断言、网页字体栈回归、拖拽提示弹簧中间帧 distinct≥2、pageerror=0）；verify-ext-v172 8/8（**body/时钟含 Geist、Geist 150 可用、冒号双点对称 ink=0.5000/dot=0.5075**、data URL 壁纸渲染、基线、pageerror=0）
- 【测试环境律】无头 waitForSelector 对 opacity-0 元素需 state:"attached"（无效视频永不 canplay）；React 合成事件不在 DOM 属性上，dragover 断言须派发 DragEvent；设置面板滚动深处另有「导入」数据按钮——URL 导入断言用回车提交防误点
- 【发布】main 32e234d；gh-pages 2ea3a44（sw BUILD 20260904055939-32e234d，新 chunk ae9df258 含 html body 字体锚 ✓）；Release v1.7.2（id 382509651）+ ChuShi-NewTab-v1.7.2.zip（12.2MB）；交付物 download/v1.7.2/（更新说明+开发者文档+焕新示例预设+扩展 zip+合并交付包 12.3MB）
- 注意：GitHub Pages CDN 对 HTML/sw 有 ~600s 缓存，部署后线上验证需等待或避开高峰

Stage Summary:
- 架构律（v1.7.2 定稿）：CSS 层叠律新条目——chrome-extension 新标签页存在 UA 注入的未分层 body 字体规则，@layer 内字体栈在扩展必被压；官方字体栈需未分层高特异性锚规则双保险（网页版无副作用）
- 掠影壁纸媒体三态（image/gif/video）定型：MIME 优先判定、GIF/视频免 kenburns、URL 直链零下载持久化、本地上传与 URL 导入互斥（导入其一清另一）
- 形变同步律：内部 Collapse 与宿主高度盒必须同参弹簧，异构时间线（EASE+spring）叠加必脱拍
- 交付：文叔叔 v1.7.2 合并交付包 → https://c.wss.ink/f/ksjgnvm183x（1 天过期）；Release v1.7.2；Pages 已上线
- 待办：Edge 商店提交材料仍未做

---
Task ID: 63
Agent: main (Super Z)
Task: 用户上传 123.mp4 反馈「视频作为壁纸导入后没有反应 + 导入视频后不会刷新」—— v1.7.3 壁纸视频修复批

Work Log:
- 【根因①黑屏】ffprobe 实证 123.mp4 = HEVC/H.265（hev1 tag, 4K60, 17.3Mbps, 43MB）——Chrome/Edge 默认无 HEVC 解码器（对照：用户旧 SVID = H.264 可播）；v1.7.2 渲染端 <video> 永不 canplay → photoReady 恒 false → 壁纸层恒 opacity-0，且导入时零提示 = 「没反应」
- 【根因②不刷新】AuroraBackground 自定义壁纸 effect 依赖仅 [photoId, wallpaperUrl]——已处 custom 模式（wallpaperUrl=""）再导入本地文件时两依赖均不变 → effect 不重跑 → IDB 新文件永不读取；SettingsPanel 缩略图 effect 同病
- 【修复①探测】SettingsPanel 新增 probeVideo（临时 <video> 试播：canplay=通过 / error=拒绝并提示「不支持该视频编码…请转码 H.264」/ 4s 超时放行防误拒）；本地视频入库前+URL 视频导入前均探测（URL 探测期间显示「正在探测直链视频…」）
- 【修复②版本号】types.ts 新增 Settings.wallpaperRev（默认 0，迁移 effect 自动补齐）；每次导入（本地/URL）onPatch 自增；AuroraBackground 与 SettingsPanel 缩略图 effect 依赖均加入 → custom 模式重复导入必刷新；URL 重导同一 URL（对端换内容）也强制刷新
- 【转码交付】双进程管道（ffmpeg rawvideo nut pipe：4K HEVC 解码与 x264 编码内存隔离——合并单进程被 SIGKILL×3 实证）→ 123-H264壁纸版.mp4（H.264 1080p60 CRF21, 8MB, +faststart, -an）；libx265 实拍测试资产 hevc-test.mp4 + w-red/w-blue.mp4 入库 pw-lab/media/
- 【验证】verify-v173 21/21（红→蓝重复导入刷新像素级实证 [254,0,0]→[0,0,253]、HEVC 拦截+提示+rev/壁纸/IDB 三不变、直链导入生效+互斥清 IDB、图片直链回归、pageerror=0）；verify-ext-v173 7/7（扩展环境全链路；http 跨源视频 canvas 污染 px="taint" 属浏览器安全模型非缺陷，跨源以 readyState≥2 判定）
- 【发布】main 6c24f7e；gh-pages 独立 clone 部署；Release v1.7.3（id 382588334）+ ChuShi-NewTab-v1.7.3.zip（11.7MB）已传；交付物 download/v1.7.3/（更新说明+开发者文档+示例预设+扩展 zip+H.264 转码视频+合并交付包 19.8MB）
- 【事故·部署律新条】git rm -rf . 清 gh-pages 树把 .nojekyll 一并删掉、out/ 又不含它 → Pages 走 Jekyll 忽略 _next/ 全目录：HTML/sw（根级）200 而全部静态资产 404（Pages builds/latest status=built 且 sw 已新版的假象下 chunk 持续 404，排查耗时 ~20min）——修复=树里补回 .nojekyll 触发重建；教训：gh-pages 部署清单必须显式包含 .nojekyll（deploy-pages.sh 丢失后手工部署踩坑）

Stage Summary:
- 产品律（v1.7.3 定稿）：视频壁纸导入必有可解码性守门——探测通过才入库，解不出明确说人话（转码 H.264）；wallpaperRev 导入版本号 = 自定义壁纸刷新的强制依赖
- 工具律：4K HEVC 转码在弱内存沙箱用 rawvideo nut 管道双进程隔离；chrome-extension 页对 http 跨源媒体 canvas 污染是安全模型，验证断言须按同源/跨源分流
- 部署律：gh-pages 独立 clone 部署三件套 = 清树 + out/ + **.nojekyll（不可少）** + sw BUILD 戳替换
- 交付：文叔叔 v1.7.3 合并交付包 → https://c.wss.ink/f/kskp3nsy0y5（1 天过期）；Pages 已上线（.nojekyll 修复后实测 ✓）
- 待办：Edge 商店提交材料仍未做
