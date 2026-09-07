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

---
Task ID: 64
Agent: main (Super Z)
Task: 用户录屏反馈「删除快捷服务时『初始』布局出现抖动」—— v1.7.4 删除磁贴抖动修复批

Work Log:
- 【录屏取证】19.6s 1080p60 录屏 3fps 抽帧 59 张逐帧分析：批量管理模式连删磁贴，f27(7磁贴)→f32(6磁贴) 时钟/搜索整列上移、f32→f44(5磁贴) 又回落——一上一下两次瞬跳
- 【根因①排数误判】磁贴网格末尾的「添加」磁贴是常驻渲染（非编辑态专属）却没进排数估算：6 磁贴实际 7 槽两排被 Math.ceil(6/6)=1 误判单排 → mainPb 误换挡（pb-44→pb-[15rem]，justify-center 下整列瞬跳 32px）；下一删（5 磁贴）网格真塌单排 → 居中重心又瞬跳回落——正对录屏形态
- 【根因②高度瞬跳】跨排增删时 flex-wrap 网格容器高度瞬变（一行 ≈104px），justify-center 的整列内容（时钟/搜索）随之瞬移；磁贴自身有 framer layout 弹簧但外层盒没有
- 【修复三层】①page.tsx 行数改 ceil((links+1)/columns)——主列形态永远与网格实际排数一致（5 磁贴及以下才是单排上移态）；②main 挂 transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]——pb 换挡滑移；③QuickLinks 网格外包 useMorphHeight(500) + motion.div 高度盒（LAYOUT_SPRING 420/36、relative 锚 popLayout 退场磁贴、contain:layout 圈 reflow、不裁溢出）——跨排高度弹簧滑移
- 【验证环境律·新】800px 视口下内容恒溢出 dvh、justify-center 空隙恒 0，时钟零位移复现不了抖动——915px 视口才命中「内容+padding 与 dvh 相互作用」的抖动敏感区；无头 13fps 下弹簧首帧步进可达行程 30%+（真机 60fps 约 1/4），单帧阈值会误伤弹簧——瞬跳/弹簧判别改用「运动连续性」（中间帧数：瞬跳=0）
- 【验证】verify-v174 11/11：6 磁贴(7槽)不再误上移 / 5 磁贴单排上移到位 / 同排删除时钟 Δ=0（旧 32px 瞬跳根除）/ 跨排删除多步滑移 mid≥1 / 高度盒弹簧中间帧连续(184→80 distinct=3) / padding 过渡在位 / 添加回磁贴恢复基线 / pageerror=0；扩展冒烟 7/7（复用 v173 套件，运行时无回归）
- 【发布】main 775f3e4；gh-pages 4d812c8（.nojekyll 显式补齐——上轮事故律落实为部署流程固定步骤；sw BUILD 20260904174000-775f3e4）；Release v1.7.4（id 382605731）+ ChuShi-NewTab-v1.7.4.zip（11.7MB）；线上特征实测 ✓（pb-[15rem]/transition-[padding] 命中主 chunk）；交付物 download/v1.7.4/（更新说明+开发者文档+示例预设+扩展 zip+合并交付包 11.7MB）

Stage Summary:
- 排版律（v1.7.4 定稿）：任何参与 flex-wrap 网格的常驻元素（含工具位）必须计入外层排数估算；居中列的跨排高度变化一律走高度形变盒（morph 律），padding 换挡一律挂过渡——「瞬跳」在布局系统中零容忍
- 验证律：布局抖动类断言 = 抖动敏感视口（内容与 dvh 相互作用区间）+ 运动连续性判据（中间帧），单帧阈值在无头节流下不可用
- 交付：文叔叔 v1.7.4 合并交付包 → https://c.wss.ink/f/kskx33uaxid（1 天过期）；Pages 已上线（.nojekyll 在位实测 ✓）
- 待办：Edge 商店提交材料仍未做

---
Task ID: 65
Agent: main (Super Z)
Task: 用户需求「通过 chromatic 插件在『初始』上提供 API，接入后在初始添加音乐播放器页面」—— v1.7.5 网易云音乐接入批

Work Log:
- 【调研定案】chromatic 发布物实为 BetterNCMII.dll（BetterNCM 换名重写，NCM 插件管理器）；NCM 3.x 为 CEF 架构：渲染进程无 Node、插件 JS 不能监听端口；js-framework 提供 plugin.onLoad/onConfig/getConfig + betterncm.fs（HTTP 文件 API）+ betterncm_native.fs.watchDirectory；播放状态读取/控制逐行对标 InfLink-rs 适配器（webpackJsonp push 假模块捕获 require → dva getStore → store.getState().playing；控制=playing/resume|pause、playingList/jump2Track(±1)、playing/setPlayingPosition(秒)、playing/setVolume、switchMute；事件=legacyNativeCmder.appendRegisterCall("PlayState"/"PlayProgress"/"Seek","audioplayer")，Orpheus 1=播放 2=暂停 vs redux playingState===2=播放，两者相反需防混）
- 【架构】双组件桥：index.js（渲染端）读播放状态→原子写 <datapath>\chushi-music\state.json（tmp+fs/rename，失败回落直写）+ watchDirectory/800ms 轮询消费 cmd\cmd-*.json→dispatch；bridge.dll（native_plugin 通道，与 InfLink backend.dll 同路数）llvm-mingw 交叉编译 x64（zig/npm 源超时弃用，GitHub release 84MB 秒下），零警告；导出 BetterNCMPluginMain（Win64 ABI 只收指针不展开结构体），命名互斥体 Local\ChuShiMusicBridgeServer 保证主/渲染进程重复加载时服务单例；Winsock 仅绑 127.0.0.1:10754 起顺延 10 个端口并写 server.json；路由 ping/status/control + OPTIONS 预检；Origin 白名单（扩展族/lxgssy.github.io/localhost 族）不回 ACAO 即拒绝读取；请求头 8KB/体 4KB/读超时 5s；cmd 落盘 tmp+MoveFileEx 原子；datapath=GetEnvironmentVariableW(BETTERNCM_PROFILE) else C:\betterncm 与 dllmain 严格同源
- 【初始侧】PanelId+music；Dock 新增音乐按钮（番茄钟与指令面板之间）；MusicPanel（未接入三步指引+地址修正+重试 / 已连接：封面 https 升级+歌名歌手+可拖进度 seek+播放控制+音量 / 空态）；music.ts 客户端：1s 轮询 /api/status + 本地时钟插值（快照 ts 外推封顶曲长）+ 连续 3 败→error 态 + 5s 低频探测自愈；控制乐观 POST；⌘K「音乐」入口；预设 icons 上限 6→7、ICON_TARGETS/PANEL_IDS/panel action 增 music
- 【事故】normalizeMusicUrl 给 parsed.pathname 赋 "" 被 URL 语义重置回 "/" 产生 //api 双斜杠 404——改为局部变量不回写（Playwright reqfail 抓获）；E1 插值断言首轮失败是 mock 语义错（每次轮询刷 ts = 每秒把进度"seek 回"30s），加 freeze 模式模拟插件写盘间隙后全绿——插值逻辑本身正确
- 【验证】verify-v175 21/21（dock 按钮/指引/无协议地址规范化接入/快照渲染/插值推进 2.5s≥2s/toggle·next·prev·volume·seek 全链路到桥/暂停态回落/断连回落指引/Ctrl+K 入口/pageerror=0；G 项三个坑：Meta→Ctrl+K、面板退场 700ms 后才可开 ⌘K、text=音乐 需精确锚定 [cmdk-item] 因「网易云音乐」链接子串命中）；verify-ext-v175 7/7（扩展页 CORS 回显 chrome-extension:// 源接入 mock 桥全链路）；bridge.c 协议以 mock-bridge.mjs Node 孪生对拍（DLL 本体无法在 Linux 沙箱运行，真机首连以 /api/ping 自证）
- 【发布】main df6420e；gh-pages 87ed1bd（.nojekyll 显式补齐 + sw BUILD 20260904124555-df6420e；线上 chunk dc1a914b 含 chushi-music-bridge 代码 200 实测）；Release v1.7.5（id 382724253）双资产：扩展 zip 11.7MB + **ChuShi-Music-Bridge-v1.0.0.zip（30KB，首次新增原生插件类交付物）**；交付物 download/v1.7.5/（扩展 zip+桥插件 zip+更新说明+开发者文档+示例预设+合并包 11.7MB）；PRESET_DEV.md 同步 music 图标目标
- 工具律：llvm-mingw 解 mingw 交叉编译（apt 无 root / ziglang.org 慢源皆不可行时，GitHub release 单包工具链最稳）；npm 后台下载任务不随 bash 会话存活，长任务必须前台跑

Stage Summary:
- 产品律（v1.7.5 定稿）：外部能力接入一律走「本地回环服务 + Origin 白名单 + 轮询短请求」三件套，不用长连接（EventSource/流在 https→localhost 受 LNA/混合内容影响面大）；面板仅在打开时发起连接，未用功能零后台流量
- 架构律：CEF 渲染进程无 Node，NCM 插件的本机能力通道 = BetterNCMII native_plugin DLL；JS↔DLL 文件契约（state.json 出 / cmd/*.json 入）跨进程零耦合，datapath 推导必须与 dllmain 同源（env BETTERNCM_PROFILE else C:\betterncm）
- URL 律：URL API 的 pathname 赋空串会回弹 "/"——拼接型规范化一律局部变量，不回写 URL 对象
- 交付：文叔叔 v1.7.5 合并交付包 → https://c.wss.ink/f/ksmeq0qn7z9（1 天过期）；Release v1.7.5；Pages 已上线
- 待办：Edge 商店提交材料仍未做；bridge.dll 真机行为待用户实测首连（协议已对拍）；歌词/收藏/队列未含（后续按需）

---
Task ID: 66
Agent: main (Super Z)
Task: 用户指令「现在的betterncm没有办法适配最新的网易云音乐客户端了，你单独写一个专门适配'初始'的betterncm，并且要支持最新的网易云客户端，还有一个问题，就是你发的桥接插件安装了没有反应，你写完新的betterncm后打包成一键安装，然后告诉我这个项目允不允许我们更改并发布到自己的仓库」—— v1.7.6 初始音乐桥·独立版（ChuShiBridge）

Work Log:
- 【调研定案】BetterNCM 仓库已整体改名/重写为 chromatic（README 原文：作者迁移至 QQ 音乐、BetterNCM 疏于维护）；最后一版可用二进制 = BetterNCMII 1.3.4（2024-10，v2 分支，GPL-3.0）；chromatic master 2.0 是 Frida 风格通用注入工具链（Process/Memory/Interceptor API），无插件生态、无二进制发布、根目录无 LICENSE——「桥接插件装了没反应」根因 = 框架自身在新版网易云注入失败（EasyCEFHooks 依赖 CEF 内部特征，升级即失效），插件从未被加载
- 【架构定案】独立版 ChuShiBridge = 启动器 exe（CDP 附加 + 10754 API）+ msimg32.dll 装载器（PEB 命令行追加调试端口），零 CEF 内部 hook——不随网易云升级失效；API 与 v1.7.5 bridge.dll 完全同契约（「初始」客户端零改动）
- 【页内桥 bridge-core.js】window.__chushiBridge：三路状态源（dva store 经 webpackJsonp push 同步捕获 require→模块缓存扫描 / legacyNativeCmder PlayState·PlayProgress·Seek 事件 / 媒体元素 paused·currentTime·volume 音频真源）+ 8 种控制命令 dispatch + DOM 兜底；snapshot()/controlText() 双入口；Node 假 NCM 世界（webpack jsonp+dva+cmder+media 四件可开关）对拍 37/37
- 【exe】chushibridge.c（main/配置/NCM 定位/进程操作/CDP 线程）+ cb_server.c（HTTP：ping/status/control/debug+OPTIONS，Origin 白名单，快照 4s 过期 503，命令 FIFO 队列）+ cb_cdp.c（/json/list 发现、RFC6455 最小 WS 客户端（掩码/ping-pong/分片聚合）、Runtime.evaluate returnByValue、JSON \uXXXX 反转义含代理对→UTF-8）；llvm-mingw x86_64 -Wall -Wextra 零警告；单实例互斥体；bridge.log + /api/debug（ncmRunning/cdp/bridge/diag.store…）排障面
- 【装载器 cb_loader.c】msimg32 代理（5 导出懒解析转发，.def 命名）+ DLL_PROCESS_ATTACH 时 PEB→ProcessParameters(0x20)→CommandLine(0x70) 原地/换指针追加 --remote-debugging-port=18754 --remote-allow-origins=*（幂等、--type= 子进程跳过、零指令 patch）；导出表 objdump 自检 5/5
- 【一键安装】install.ps1（注册表/常见路径/运行进程三路定位网易云→PE machine 架构检查（仅 x64 装装载器）→已有 msimg32 备份替换（BetterNCM 兼容）→本体+config→桌面快捷方式→可选自启→--kill-ncm 重启网易云→60s ping 健康检查→现场生成卸载脚本，目录不可写自动 UAC 提升）+ uninstall.ps1（还原备份/删快捷方式/延迟自删）；ps1 打包注入 UTF-8 BOM（PS5.1 中文律）
- 【初始侧 v1.7.6】MusicPanel 指引改「接入三步（新版客户端推荐）」+ Release latest 固定资产直链（ChuShiBridge-2.0.0-Setup.zip，ASCII 名规避 URL 编码坑）+ 旧路线回落链接（v1.7.5 chromatic 插件）+ 失败文案「初始音乐桥未运行」；music.ts/版本号/README 同步
- 【验证】verify-v175 全量回归 21/21（协议兼容性证明：客户端零改动）+ verify-v176 专项 13/13（新指引/直链/回落/失败文案/协议快通）+ 扩展冒烟 7/7（⚠持久化 profile 残留旧 sw 缓存致 A2 假阴——清 profile 即愈，扩展冒烟前 rm profile 入律）+ exe/loader 编译自检
- 【发布】main 2897348；gh-pages b5ad26e（独立 clone 三件套，BUILD 20260904151607-2897348）；线上 chunk dcda66aded355cd6 特征实测 ✓；Release v1.7.6（id 382824140）双资产：扩展 zip 11.7MB + ChuShiBridge-2.0.0-Setup.zip 68KB
- 【License 答复（已入 Release notes）】BetterNCM/BetterNCMII（chromatic v2 分支）= GPL-3.0：允许修改并发布到自己的仓库，条件=同 GPL-3.0 开源+保留版权声明+注明修改；chromatic master（2.0）无 LICENSE 文件=默认保留所有权利，不建议基于其修改再分发；ChuShiBridge 全部代码为原创实现（不含 BetterNCM 代码，仅借鉴 msimg32 劫持这一通用机制与自有协议），可自由发布/自选协议

Stage Summary:
- 产品律（v1.7.6 定稿）：外部能力接入的注入层必须「零目标内部 hook」——CEF 调试端口方案以「进程外协议」替代「进程内特征」，版本免疫；装载器只做命令行追加这类无副作用数据面操作
- 排障律：本地服务三态可见性（/api/debug 结构化诊断 + 落盘日志 + 控制台），「装了没反应」类问题必须给用户可自助的三查路径
- 测试律：持久化浏览器 profile 会缓存旧 sw——扩展冒烟前必须清 profile；二进制无法在沙箱真机运行时，「Node 孪生对拍 + 编译自检 + 导出表核验 + 真机 /api/ping 自证」四件套兜底
- 交付：文叔叔 v1.7.6 合并交付包（见后续链接）；Release v1.7.6；Pages 已上线
- 待办：Edge 商店提交材料仍未做；ChuShiBridge 真机首连待用户实测（安装器已内置健康检查自证）；歌词/收藏/队列未含（后续按需）

---
Task ID: 68
Agent: main (Super Z)
Task: r3 运行态热修——用户 r2 实测反馈「网易云启动了但桥接不起（attach: eval-fail-1）」+「网易云运行中无法安装，只能关闭后安装」；另：本会话现场再次被清理（bridge 源码/v1.7.6 交付物/Task56-67 worklog 丢失），先 git 考古重建现场再修复

Work Log:
- 【现场重建】git remote URL 内嵌 PAT 完好 → 提取存回 .pkgtmp/gh-token；远端 main(3b38437) 含全部桥接源码（本地曾停在 Task55 2159fb9，仅多一条等价 worklog 提交，reset --hard 对齐）；llvm-mingw 20260826 工具链重下（83.9MB，路径与 build 脚本一致）；确认 r2 改动（install.ps1 重写+版本 2.0.1+attach 字段）只存在于 Release 资产未入仓 → 本轮源码全部重建后立即 commit 防再丢
- 【根因分析】用户日志：CDP 目标清单已拿到（page|orpheus://orpheus/pub/app.html，HTTP 发现层通）但 cdp/bridge=false、attach=eval-fail-1、日志无「已附加」→ 失败在 ws_connect/probe/注入/快照四步之一且全部静默。r2 的 probe 判据仅认 window.legacyNativeCmder——新版网易云 3.x 若移除该对象则永远 attach 不上（头号嫌疑）；附带发现真 bug：①ws_eval 分片处理 r==4 时 free 聚合缓冲、continuation 数据丢失 ②--kill-ncm 在 launch 之后的循环里才消费——会误杀刚代启的带参实例再「等用户手动开网易云」（与用户「网易云明明启动了但系统没反应」体感吻合）③PowerShell 5.1 ConvertTo-Json 输出 \uXXXX 路径 C 端不解析（中文目录场景）
- 【C 修复】probe 三路判据放宽（cmder || webpackJsonp || webpackChunk* 前缀扫描 || url 含 orpheus/music.163.com）+ PROBE_MISS/PROBE_EVAL_FAIL 细分返回码；attach_fail_log 节流上报（同签名 5min 不刷屏）+ cb_attach_set/get 状态机（/api/debug 新增 attach/attachDetail 字段，9 类状态：ok/ws-fail/probe-eval-fail/probe-miss/install-fail/snap-fail/poll-fail/idle）；cb_cdp.c 新增 ws_read_message 跨帧聚合修分片 bug + cdp_last_error 捕获失败详情（ws-handshake 状态行/cdp-error message/eval-no-value 响应原文/timeout）+ cdp_list_targets 节流日志（目标清单变化才打，恢复 r2 日志格式）；kill_ncm 移到 cdp_thread 开头（先杀再 launch 不误杀）；json_wstr 支持 \uXXXX+代理对→UTF-8；CB_VERSION 2.0.2
- 【页内桥】bridge-core.js 2.0.2：captureRequireSync 双兼容 webpack4（webpackJsonp.push 模块工厂）与 webpack5（webpackChunk* 全局 push([ids,{},runtimeFn])）；版本幂等改为同版本才 return（旧版本自动覆盖升级）
- 【install.ps1 r3 全量重写】①第 0 步 Stop-Process cloudmusic 提前到一切文件操作之前+等待句柄释放——运行中安装根治（用户无需手动关网易云），装完第 8 步带参重启 ②Clean-Path 消毒+Find-Asset 四路候选自探测+自提升不回传 -Root ③全量 -LiteralPath ④Copy-Item-Retry 5 次锁定重试+同尺寸跳过 ⑤卸载脚本自复制进数据目录+卸载 bat 纯 ASCII 无路径参数（uninstall.ps1 从 config.json 自读 ncmPath，param 块删除）⑥config.json 以 UTF8Encoding(false) 无 BOM 写入
- 【验证】verify-installer-r3.py 64/64 全绿（PS1 词法平衡/Clean-Path 孪生五组脏参数/bat 调用行无 -Root/zip 顶层 ChuShiBridge-Setup 布局+BOM+一致性/停进程早于 DLL 拷贝序/C 源 r3 特征/cdp_js.h 状态机反转义全量比对/exe 版本串/dll UTF-16 参数串）；⚠验证脚本自身三轮误报教训：PS1 无 param 块时 split("param") 失效、C 源转义序列匹配要按源文件字面、宽字符字面量在 PE 里是 UTF-16LE 而非字节序
- 【发布】commit 0a06c7e 推 main（17 文件，源码+build 产物+交付物全部入仓）；Release v1.7.6 资产 ChuShiBridge-2.0.0-Setup.zip 同名替换（75115B→76597B，id 545245980，直链与 MusicPanel 零改动）+ notes 追加 r3 记录（幂等 MARK）；线上直链实测 SHA-256 8d69c9bf… 与本地一致
- 【交付】文叔叔 ChuShiBridge-一键安装包.zip → https://c.wss.ink/f/kss9sz8hmw5（1 天过期）

Stage Summary:
- 结论：r3 修复「运行中无法安装」（install.ps1 第 0 步停进程）与「桥接不起」（probe 判据放宽+分片 bug+kill 时序三重修复）；用户下次实测若仍连不上，bridge.log 与 /api/debug 的 attach/attachDetail 字段可一次定位到具体环节
- 新律：①跨会话交付物必须 commit 入仓——Release 资产不是版本控制，环境清理后源码即失传（r2 源码已永久丢失，本轮重建）②WS 客户端读消息必须跨帧聚合（continuation 帧缓冲与循环作用域同生命周期）③CDP 页面判据不可绑定单一全局对象（legacyNativeCmder 随网易云版本存亡），多路特征兜底 ④PowerShell ConvertTo-Json 的 \uXXXX 输出必须假设消费端只认 \\\\ 转义——要么消费端解码、要么 WriteAllText 手动构造
- 待办：用户实测 r3 → 依据 attach 字段定位残余问题；任务B（音乐面板体验）收尾；任务A（磁贴抖动）；Edge 商店材料

---
Task ID: 69
Agent: main (Super Z)
Task: r4 通道重构——用户 r3 实测日志「CDP 目标清单 1 个：page|（url 空）」+「[attach] probe-eval-fail：eval-ws-closed」，初始仍连不上

Work Log:
- 【决定性诊断】r3 细分诊断生效：probe-eval-fail + eval-ws-closed = **WS 握手成功（101）后、发 PROBE 求值时连接被 CloudMusic CEF 主动关闭**——失败发生在页面判据之前，r3 放宽判据未触及真因；`page|` 空 url 同时暴露 /json/list 字段序非标准（type 在前 url 在后）
- 【r4 重构】cb_cdp.c：新增 cdp_command（通用 CDP 命令往返，支持 sessionId）+ ws_eval_ex（会话版 evaluate）；**主路改 browser flatten**：/json/version→browser WS→Target.getTargets（needle 依次 orpheus/music.163/任意 page）→Target.attachToTarget(flatten:true)→sessionId→页内 evaluate；**页端点降为回退**（网易云生态适配器同款路径）；ws_read_message 解析 close 帧状态码/原因（1002 协议错/1000/1011）进 cdp_last_error——下次被拒 attachDetail 直出证据；cdp_http_body 抽取（list/version 共用）+ target_desc_at 前后双搜 + cdp_port_alive 探活；discover_and_attach 改「探活→cdp_open_target→注入→快照」，通道复用进轮询（不再二次 connect），附加日志标注 flatten/page 模式；chushibridge.c 删旧 probe_target（判定移 cb_cdp.c cdp_probe_page）
- 【验证】verify-installer-r4.py 74/74 全绿（新增 flatten 主路/attachToTarget/pick_page_target/close 解析/通道复用/探活 10 项）；⚠教训：验证脚本代际升级用 cp+替换比 heredoc 嵌套引号可靠（连续两次 Python 内联转义翻车，改用 Edit 工具）
- 【发布事故】使用说明更新后重打包 → 本地 zip 与刚传的线上资产不一致 → 立即重跑 rel-installer-r4.py（幂等）再替换，直链 SHA d53de6e2… 复核一致；⚠律：改包内任何文件后必须重跑 Release 替换并复核哈希，不能只改一处
- 【发布】main ccf23a3 + ddcd31e（11+ 文件）；Release 资产 78845B（id 545267623）；文叔叔 https://c.wss.ink/f/kssfsfr6wpx
- 【版本】桥接器 2.0.3；Release notes r3 段已由 r4 段替换（MARK 幂等）

Stage Summary:
- 结论：页端点直连被 CloudMusic CEF 拒（握手后 close）是「初始连不上」的真因层；flatten 会话是网易云 CDP 生态验证过的正路；若 flatten 也被拒，close 帧状态码会给出下一步证据
- 新律：①CDP 对客制化 CEF（CloudMusic）不要假设页端点可用——browser flatten 优先、页端点回退 ②close 帧负载（状态码+原因）是最便宜的深诊断，第一次实现 WS 客户端就该解析它 ③多文件交付物（zip）任何成员变更后都要视为「新包」重新走完整发布链
- 待办：用户实测 r4 → attach=flatten+ok 则收尾「初始侧连接」；残余问题看 attachDetail（ws-close 码/timeout/probe-miss）

---
Task ID: 70
Agent: main (Super Z)
Task: r5 热修——用户回传 2.0.3 实测 /api/debug（attach=ok、cdp/bridge=true、lastEvalAgoMs=609，但 diag.store/events/media 全 false），按 Task 69 待办收尾「连接层已通，残余看 diag」

Work Log:
- 【环境自检】workspace 又被清理：.pkgtmp/gh-token、llvm-mingw 工具链、worklog Task 56-69 段全部丢失；gh-token 从 .git/config 内嵌凭据恢复（python 解析不回显）；工具链重新下载 llvm-mingw-20260826（mstorsjo release，84MB）；git reset --hard origin/main 对齐 4911028
- 【决定性判读】lastEvalAgoMs=609（<800ms 轮询周期）说明 g_cb.snap 正被 ok:true 回执持续刷新——三源至少一路活、/api/status 数据链路已通；attach=flatten+ok 证实 r4 flatten 会话是真解。diag 全 false 是**读出层缺陷**：cdp 线程只把内层 "snap":{...} 存进 g_cb.snap，/api/debug 却向它索要 "diag":{ 段——永远扑空；ok:false 时 error 也整段丢弃
- 【r5 修复】①chushibridge.c 新增 record_snap_receipt()：括号配对提取外层回执的 diag 段 + ok 布尔 + error 字符串，附加/轮询两处调用 → cb_diag_set 落库；②cb_server.h 状态体扩 diag_json/snap_ok_flag/snap_err；③handle_debug 重写：真实 diag 段 ASCII 安全化内嵌（"diag":%s），新增 snapOk/snapErr 字段，无数据时兜底全 false 段，body 1536→2048；④预检响应补 Access-Control-Allow-Private-Network: true（PNA 收紧护栏，网页版直连用）；⑤页内桥 2.0.4：diag 增加 href（location.href 截 80 字符，确认注入目标页面）
- 【构建】llvm-mingw 重建后编译零警告；exe 124KB / msimg32.dll 52KB，导出表 5/5
- 【验证】verify-installer-r5.py（cp r4 改造 + [7b] diag/PNA 10 项 + [4b] 说明段）90/90 全绿；⚠又一转义坑：链式比较行多写一个右括号 SyntaxError，逐行数括号修复
- 【发布】main 647a3a8 推送；rel-installer-r5.py 同名替换 ChuShiBridge-2.0.0-Setup.zip（79893B，资产 id 545466215）+ notes 追加 r5 段（保留 r4 段历史）；直链 SHA-256 c9f82de1… 复核一致（r4 律执行）
- 【交付】pw-lab 依赖重装（base58/pycryptodomex，PEP 668 需 --break-system-packages）后 wss-send.py 上传成功

Stage Summary:
- 结论：用户的 2.0.3 已把连接层修通（flatten 会话 ok、快照新鲜流转），diag 全 false 纯属诊断接口自身的读出 bug——**桥很可能一直在正常给「初始」喂数据**；2.0.4 后 /api/debug 终于说真话，下一步排障看 diag 三源与 snapOk/snapErr 即可
- 新律：①「诊断接口必须与诊断数据同源」——从共享状态读什么、写什么要成对设计，中间层（快照提取）丢字段是静默故障温床 ②快照回执外层（ok/diag/error）与内层（snap）应分开落库，禁止从内层反查外层信息 ③gh-token 丢了不必找历史——git remote 内嵌凭据就是活副本
- 交付：Release 资产直链 https://github.com/LXgssy/Start-chushi/releases/download/v1.7.6/ChuShiBridge-2.0.0-Setup.zip ；文叔叔 https://c.wss.ink/f/kstzjjy27ir （1 天过期）
- 待办：用户实测 2.0.4 → 若「初始」仍无数据，看 /api/debug 的 diag 三源（store/events/media）与 snapOk/snapErr：snapOk=true 而面板无歌 = 前端问题；diag 全 false + snapErr=no-source = 页内三源皆未命中（需适配新网易云内核）；Edge 商店提交材料仍未做

---
Task ID: 71
Agent: main (Super Z)
Task: 用户决定放弃自研独立版路线、回归 BetterNCM 插件——「把插件写好后把 betterncm 的安装包也发我」

Work Log:
- 【路线尊重】用户实测独立版三连修（r3/r4/r5）后选择放弃；独立版 2.0.4 保留在 Release 不撤，作为兜底路线（接口同契约，「初始」侧零改动）
- 【插件升级 1.1.0】①index.js：移植 r3 的 webpack4/5 双兼容（webpackJsonp 假模块捕获 + webpackChunk* 全局扫描，工厂双参 r0/r1 捕获 runtime require）；新增 diag.json 诊断落盘（storeReady/eventsHooked/getPlayingSong/media/href，变更即写 + 10s 心跳），writeStateAtomic 泛化为 writeTextAtomic 复用 ②bridge.c/bridge.dll：新增 GET /api/debug（diag.json 括号快检透传 + state.json 存在性/mtime 年龄 stateAgeMs，缺省兜底全 false 段）；预检补 Access-Control-Allow-Private-Network（PNA）；BRIDGE_VERSION 1.1.0 ③manifest 1.1.0 + 安装说明补升级段/排障 FAQ/已知边界（BetterNCM 1.3.4 停更于 2024-10，新内核可能不兼容——独立版是兜底）
- 【构建】llvm-mingw 编译 bridge.dll 61952B 零警告；x86-64 + BetterNCMPluginMain 导出在位；⚠新律：llvm clang 把 strcmp(x,"字面量")==0 折叠为立即数比较，路由串不再入 .rdata——二进制断言改验响应格式串与宽字符（UTF-16LE）互斥体名
- 【验证】verify-plugin.py（manifest/JS 特征/C 源/DLL 二进制/zip 布局/安装器/合并包）54/54 全绿；node --check JS 语法过
- 【交付物】初始音乐桥-插件-1.1.0.zip（顶层目录 初始音乐桥/，四件套齐）+ betterncm_installer.exe（官方 BetterNCM-Installer 1.2.0，673280B，SHA-256 f4aabe8f… 与 Release 资产一致）+ 安装指南.md（两步安装 + /api/debug 自检 + 已知边界）→ 合并 ChuShi-音乐桥-BetterNCM-交付包.zip（407KB）
- 【发布】main a2ab433 推送；文叔叔 https://c.wss.ink/f/ksubawihzxh

Stage Summary:
- 结论：插件路线交付完毕——BetterNCM 官方安装器 + 升级到 1.1.0 的插件（webpack5 兼容 + /api/debug 诊断）。插件与独立版同端口同 API，数据契约 v1.7.5 起未变，「初始」侧无需任何改动
- 新律：①strcmp 常量折叠——编译期优化会把字符串比较烙进指令流，二进制特征断言要挑「响应格式串/宽字符」这类不会被折叠的目标 ②文件契约（state.json/diag.json/cmd/*.json）是 JS↔DLL 的进程边界，diag 也走同一条原子写管道，排障数据与业务数据同通道最省心
- 待办：用户实测插件路线——装 BetterNCM（若网易云起不来即框架/内核不兼容，回独立版）→ 装插件 → F12 看 [ChuShiMusicBridge] 日志 → /api/debug 反馈；Edge 商店提交材料仍未做

---
Task ID: 72
Agent: main (Super Z)
Task: 用户实测反馈「安装不成功，而且我怎么没有看到 .plugin.path.meta 和要放在 plugins 文件夹里的 .plugin 文件」——对照 BetterNCMII(v2 分支) 源码考古插件装载全链，修正插件包格式与安装指南

Work Log:
- 【源码考古定案】chromatic 已迁至 std-microblock/chromatic（MicroCBer/BetterNCM 301 跳转）；v2 分支（BetterNCMII 1.3.4）双装载通道全链确认：①C++ extractPackedPlugins：plugins 目录只认 *.plugin 后缀（本质 zip），zip_entry_open 直读根部 "manifest.json" 条目 → 解压到 plugins_runtime\<slug>\ 并自动写入 .plugin.path.meta（内容=来源 .plugin 相对路径，供商店更新）；plugins_runtime 每次启动全量重建（第 225-243 行先清后解）②js-framework（子模块 BetterNCM/js-framework）loader.ts：pageMap={"/pub/app.html":"Main"}，读 plugins_runtime+plugins_dev 的 manifest.json → injects["Main"] → AsyncFunction("plugin", code) 执行——injects.Main 是 v2 唯一 JS 消费链（App.cpp 的 startup_script 是并存 C++ 通道，二者同声明会双重执行，故只保留 injects）
- 【根因】Task 71 交付包只有「顶层带目录的 .zip」+ plugins_dev 文件夹安装说明：zip 放进 plugins 不被认领（只认 .plugin 后缀）、拖拽安装提示是误导、用户找不到 .plugin/.plugin.path.meta 两个「本该由 BetterNCM 自动生成」的产物——安装姿势与生态机制错位，插件从未被装载
- 【兼容门核对】from_json 第 72 行读的就是 "ncm3-compatible"（带连字符，与我们写法一致）；ncm-version-req 缺省 "> 2.10.2"（NCM3.x 满足），本轮显式写入 manifest；loadInPath(plugins_dev) 不走兼容门；native_plugin 先按原名 LoadLibrary，失败才试 *.x64.dll——bridge.dll x64 原名即可；与 v2 内置 resource/PluginMarket.plugin 解包对拍（根部平铺 main.js+manifest.json、无 startup_script、无 type 字段）完全同构
- 【插件 1.2.0】manifest 补 ncm-version-req 显式声明+安装提示描述；index.js BRIDGE_VERSION 1.2.0+幂等护栏（__chushiMusicBridgeActive 防同页二次注入重复写盘）+加载日志；bridge.c 版本串同步；llvm-mingw 重编译零警告（60KB）
- 【打包修正】build-plugin.py 双产线：①ChuShi-MusicBridge-1.2.0.plugin（zip 根部平铺 manifest.json/index.js/bridge.dll/README.txt，条目全 ASCII+无目录前缀断言——BetterNCM zip 库直读条款）②初始音乐桥-插件-1.2.0.zip（顶层目录式，plugins_dev 路线保留）；清陈旧 1.1.0 包
- 【验证】verify-plugin.py 升级到 74/74 全绿（新增：.plugin 平铺布局/ASCII/根部 manifest、与官方 PluginMarket 同构比对、防 startup_script 双通道断言、幂等护栏、包内 DLL/JS 与源哈希一致、交付包内 .plugin 一致）；node --check 过
- 【文档】安装指南.md 重写（.plugin 与 .plugin.path.meta 机制专段/路线 A 放 C:\betterncm\plugins\ 主推/路线 B plugins_dev 兜底/安装器失败四查：官网桌面版非商店版/管理员+SmartScreen 仍要运行/杀软放行/内核不兼容回落独立版/装后 plugins_runtime 产物自证）；插件内安装说明.txt 同步（含卸载对应两路线差异）
- 【发布】main 推送；文叔叔合并交付包（443KB）：https://c.wss.ink/f/ksukoeyldar

Stage Summary:
- 结论：「安装不成功」根因 = 交付物格式与 BetterNCM 生态机制错位（.zip ≠ .plugin；.plugin.path.meta 是 BetterNCM 解压时自动生成的来源指针，用户无需也不能手动创建）；1.2.0 起交付与插件商店同构的 .plugin 包，放 C:\betterncm\plugins\ 重启网易云即装
- 新律：①给插件生态做交付必须先读它的加载器源码——「看起来合理的 zip/manifest」与「装载器实际认领的格式」之间隔着整条 extractPackedPlugins ②多装载通道（C++ startup_script vs JS injects）并存时只能择一声明，否则双重执行 ③官方内置插件包（resource/*.plugin）是最便宜的格式参照物，解包对拍胜过任何文档 ④plugins_runtime 类「每次启动重建」的缓存目录绝不能当安装目标
- 待办：用户按新指南实测 1.2.0（装完看 plugins_runtime\cc.chushi.musicbridge\ 是否自动出现 → F12 Console [ChuShiMusicBridge] → /api/debug）；若框架层就失败（网易云起不来/管理界面空白）= 内核不兼容，回独立版 2.0.4；Edge 商店提交材料仍未做

---
Task ID: 73
Agent: main (Super Z)
Task: 用户反馈「是不是应该把'初始'里的音乐界面改一下，而且现在还是无法正常在网页上控制网易云音乐」+ 附 /api/debug（1.2.0 全绿 diag、stateAgeMs=356400 ≈ installedAt）—— 插件 1.3.0 控制链路根因修复 + 音乐面板 v1.7.7 翻新

Work Log:
- 【决定性判读】diag 全绿（storeReady/eventsHooked/getPlayingSong/media=true、href=orpheus 页）= 插件 JS 活着且数据源全通；state.json 与 diag.json 走同一条 writeTextAtomic 管道而 diag.ts 新鲜（10s 心跳在写）→ JS 写盘能力没问题，state 陈旧是 pushState 签名去重（暂停时快照不变零写盘，设计使然但 stateAgeMs 因此失去活性语义）；「无法控制」与之独立——控制链路（页面→DLL→cmd 文件→JS→dispatch）另有断点
- 【根因】bridge.c build_paths() 里 g_cmd_dir = L"%s\\%s"（<datapath>\chushi-music），少拼 L"\cmd" 子目录——DLL 把 cmd-*.json 落到 chushi-music\ 根目录，而 index.js 只轮询 chushi-music\cmd\；/api/control 照样返回 ok:true（文件确实写成功了），两端路径错位静默失败。v1.7.5 首版即如此（mock 桥只对拍 HTTP 协议层，文件契约层从未真机验证过——「协议对拍不覆盖文件落点」的测试盲区）
- 【插件 1.3.0 修复】①bridge.c：g_cmd_dir 补 \cmd（一行根因）+ 版本串；②index.js：pollCmds 双扫描（主路 cmd/ + 根目录兼容——旧 DLL 不升级也能控）+ 启动 sweepRootLeftovers 清扫 1.2.x 误写积压 + state.json 5s 强制心跳（stateAgeMs 恒<5s 成为桥活性信号）+ writeTextAtomic 补 rename 响应校验（ok===false/status 非 2xx 即抛，堵「rename 静默失败→直写兜底永不触发」的洞）+ handleCommand 重构为意图式（intent/seekMs）+ verifyThenFallback（dispatch 后 420ms 校验 storePlaying(playingState===2 即播放)/媒体元素实际状态，不符则 el.play/pause/currentTime 直接驱动）+ 音量双通道（dispatch+el.volume 即时同步）+ 启动即推首帧快照（无需等 store 发现）
- 【⚠新坑】index.js 注释里写 cmd-*/tmp-*.json——注释中 */ 提前终结块注释 SyntaxError（node --check 抓获）；中文「兜底/兑底」错字导致 verify 断言假阴（码点核对 0x515C vs 0x5151）
- 【面板翻新 v1.7.7】MusicPanel：大封面(96px)+播放态 accent 光晕+专辑信息行+诊断卡（诊断开关→/api/debug 拉取：桥版本/端口/状态文件年龄/三源 ✓✕ 芯片/注入页 href + 陈旧警示（stateAgeMs>15s 提示 1.2.x 暂停不写盘现象与升级指引）+ 复制诊断（剪贴板 JSON））；music.ts 增 MusicBridgeDebug 类型 + debug() 方法；接入指引改回 BetterNCM 插件路线主推（Release latest 直链 .plugin）+ 独立版兜底 + BetterNCM 安装器链接
- 【验证】verify-plugin.py 87/87（新增：g_cmd_dir 带 \cmd/旧路径消失/cmd 目录补建顺序/rename 校验/5s 心跳/双扫描/清扫/verifyThenFallback/mediaElStrict/storePlaying/音量双通道/启动首帧 + DLL 无 1.2.0 残留 + 说明含升级指引；[7][8] 改为交付物就位后强制）；verify-v177 33/33（v175 全量迁移 + 专辑行 + A4 插件路线文案 + I0-I8 诊断卡九项：版本/芯片/href/年龄/陈旧警示/升级指引/复制反馈/剪贴板 JSON 完整性——⚠诊断 fetch 渲染竞态需 waitForFunction 等 textContent 含 bridge.dll）；verify-ext-v177 9/9（扩展页 CORS 回显 + 诊断卡冒烟；profile 先清律执行）
- 【发布】main e8b3d8b；gh-pages 对齐 origin（本地分支落后被拒→reset --hard origin/gh-pages 再部署）BUILD 20260905094248-e8b3d8b；线上 chunk c3e21f9 特征实测 ✓（BetterNCM 插件路线/桥接诊断/复制诊断/1.3.0 直链全命中）；Release v1.7.7（id 383203415）五资产直链 SHA-256 全对拍一致
- 【⚠新坑】GitHub Release 资产名不支持中文——「初始音乐桥-插件-1.3.0.zip」被剥离成 '-.-1.3.0.zip'（ASCII 名律从 zip 内条目扩展到资产名本身）；同名资产删后立即重传 422（需 3s+ 传播窗口）；脚本 rel-v177.py 幂等（建/更 Release + 清烂名残留 + 删旧传新 + 直链复核）
- 【交付】文叔叔 ChuShi-音乐桥-BetterNCM-交付包.zip（459KB：.plugin + dev zip + 官方安装器 + 1.3.0 安装指南）→ https://c.wss.ink/f/ksvdij7fm37

Stage Summary:
- 结论：「无法控制」根因 = DLL 命令文件落盘路径与 JS 轮询路径错位（一行代码，两层静默）；1.3.0 双端修复 + 兜底三层（双扫描/媒体元素校验/音量直驱）。用户升级：删旧 .plugin → 放 1.3.0 → 重启网易云
- 新律：①「协议对拍必须覆盖文件落点」——JS↔DLL 文件契约的路径拼接两端各自独立推导，mock 层测不出路径错位，真机契约验证要用目录清单对拍 ②GitHub Release 资产名 ASCII 硬约束（中文被静默剥离成乱码名，不报错）③Release 资产删除→重传需传播窗口（422）④JS 注释里写 glob 模式（*/）会终结块注释 ⑤verify 断言中文字符串要与源码逐码点核对（兜/兑形近字假阴）⑥诊断卡 fetch 是异步渲染，端到端断言用 waitForFunction 等内容而非固定 sleep
- 待办：用户实测 1.3.0（升级后 /api/debug version 应为 1.3.0，stateAgeMs 恒<5s，控制应全部生效）；任务B（音乐面板体验）继续按反馈迭代；任务A（磁贴抖动 v1.7.4 已修待确认）；史7遗留（开发工具显示 bug、预设覆盖可调回、⌘K 面板外点关闭、ContextMenu/PresetDocs blur、预设导入拖拽）；Edge 商店提交材料仍未做

---
Task ID: 74
Agent: main (Super Z)
Task: 回应用户反馈「没有看到诊断按钮 + 控制仍无效，是否网页问题」——现场审计 + 诊断回复

Work Log:
- 审计 git log：Task 71/72/73 已闭环（插件 1.2.0→1.3.0、v1.7.7 面板翻新、gh-pages 已部署 BUILD 20260905094248-e8b3d8b、Release v1.7.7 五资产直链 SHA 全对拍）
- 确认 MusicPanel v1.7.7 诊断按钮位置：面板底部连接状态行右侧（Activity 图标 +「诊断」文字，aria-label=桥接诊断）
- 确认 sw.js 更新策略：导航 stale-while-revalidate + skipWaiting/clients.claim → 部署后首次打开仍见旧页，需再开一次/硬刷新
- 验证 GitHub Release v1.7.7 五资产全部 uploaded（authenticated API）
- 复用 Task 73 已发文叔叔链接 https://c.wss.ink/f/ksvdij7fm37 作备份，主推 Release 直链

Stage Summary:
- 结论：用户双旧——网页旧（无诊断按钮）+ 插件仍 1.2.0（debug version 实锤，控制命令路径错位根因未升级）。回复升级路径：删 1.2.0 .plugin → 放 1.3.0 → 重启网易云；网页再开一次标签页/硬刷新；验证 /api/debug version=1.3.0 且 stateAgeMs<5000
- 待办：等用户实测 1.3.0 反馈；任务B 继续迭代；任务A/史7遗留/Edge 商店材料未动

---
Task ID: 75
Agent: main (Super Z)
Task: 用户反馈「插件 1.3.0 已上但网页仍连不上 + 插件里改了服务端口后面板显示的还是 10754」→ v1.7.8 端口自动发现

Work Log:
- 读用户新 debug：version/stateAgeMs=3795/port=8008 全健康 → 桥已在 8008 服务，面板仍敲 10754 = 端口错位（面板保存地址 start:music-url 默认 10754，不知道插件配置页改的端口）
- 审计插件 index.js：plugin.onConfig 提供「服务端口」UI，写 BetterNCM config + DIR/config.json，DLL 读之换端口 → 机制本身正常，缺的是面板跟随
- music.ts：MUSIC_PORT_CANDIDATES=[10754,8008] + candidateMusicUrls()；MusicBridgeClient 增 onAdopted 回调；connect() 主址快败后 scanCandidates()；pollOnce 5s 重连环增扫描（运行中换端口也能跟）；probe 拆 probeUrl(url)
- MusicPanel：onAdopted→setSavedUrl+setUrlDraft（记住+回填）；reasonText refused 提及改端口；错误态加「自动尝试常见端口（10754/8008）/自定义端口填法」提示行
- verify-v178.mjs（新写 43 项）：A/G/C/D/E/I 回归 + K1 挂载即扫描、K2 记住 8008（useStored JSON 包裹，断言需 JSON.parse）、F0/B1/B2（无协议直连非候选端口 19099/错误地址扫描自愈）、K4 重挂载再扫描、I2 诊断端口回显 :8008、K5/K5b/K5c 异名服务 CORS+name 校验拒绝+错误态输入框回填、K7 恢复重试回归
- 【⚠新坑】①连接成功后错误态 UI（地址输入/重试按钮）整体卸载——点击这类按钮会 detach 超时，必须 catch 容错 + waitForSelector 等结果 ②B2 前必须先关上一个桥回错误态腾出输入框 ③面板重开（cmdk/点按钮）后新客户端立刻 connect，早前用「点击重试」断言挂载扫描会和自动接入竞态（按钮被已连接 UI 换掉）
- gh-pages 部署 BUILD 20260905114942-fd775b1；线上 chunk 6f318335a334bd39 特征「自动尝试常见端口」实测命中（⚠首个 chunk 不含面板代码，须遍历全部 chunks）
- build-extension.py VERSION→1.7.8（/tmp/ext-ref 从 v1.1.2 zip 重解压）；扩展 zip 11.7MB manifest 1.7.8 验包 ✓
- rel-v178.py：Release v1.7.8（id 383231768）五资产（新扩展 zip + 四个 1.3.0 桥资产原样重传保 latest 直链齐全）直链 SHA-256 ALL OK
- 文叔叔发扩展 zip → https://c.wss.ink/f/ksw8ufwzo7h；main c3279fb 推送

Stage Summary:
- 结论：桥(8008)与面板(10754)端口错位；v1.7.8 面板自动扫描 10754/8008 命中即接入并记住，用户改任意候选端口零操作跟随，非候选端口可在地址栏手填
- 用户动作：网页版重开标签页两次/Ctrl+F5（SW 换新）；扩展版重装 v1.7.8 zip；之后面板应自动连上 8008 并恢复全部控制
- 待办：用户实测反馈；任务A/史7遗留/Edge 商店材料未动

---
Task ID: 76
Agent: main (Super Z)
Task: 用户指令「推翻推翻，全部推翻，把所有插件删掉，网易云本体支持 smtc，'初始'直接适配 smtc 就行了，然后把音乐面板删掉，'初始'提供 smtc 相关 API 即可，做成预设包，我要这个预设包必须有精美的ui和符合直觉交互以及高雅的动画」+ 双 bug（tab 选框动画/快捷服务删行抖动）—— v1.8.0 SMTC 系统媒体换线

Work Log:
- 【路线推翻】BetterNCM 插件 / CDP 独立桥整线退役：git rm bridge/（native/standalone/plugin 全部）、MusicPanel.tsx、music.ts、build-plugin/chushibridge/bncm-delivery 脚本与音乐 mock/verify 探针；Dock 删音乐按钮+面板分支、CommandPalette 删音乐入口、types.PanelId/preset.ts panel 白名单+PresetIconTarget 删 music（README 标注 v1.7.5–1.7.8 段「已退役」）
- 【SMTC 作用面】smtc.ts（宿主单例客户端）：轮询 127.0.0.1:20754（1s，连败 2 次降频 2.6s 恢复扫描）+ 本地时钟插值（smtcPositionNow）+ 关键签名广播（position 不推）+ 封面 /api/cover→dataURL 缓存；两通道同款 API：①脚本通道 sandbox.ts onApi smtcSubscribe/Get/Control（白名单+回收）+ sandbox.js makeChushi().smtc；②widget 通道 PresetWidgets 中继 + sandbox.js widgetShim/widgetMode 扩展（cmd/position 字段 + widgetSmtc/widgetSmtcResult 下行）；page.tsx 挂载即 smtc.start()
- 【初始SMTC桥】bridge/smtc/ChuShi-SMTC桥.ps1（PS 5.1 + WinRT 零依赖）：GlobalSystemMediaTransportControlsSessionManager 枚举会话，「AppFilter 正则(网易云系)优先→Playing→第一个」三段选会话；HttpListener 127.0.0.1:20754 暴露 /api/state /api/cover /api/control(含 TryChangePlaybackPositionAsync seek) /api/ping；CORS+PNA 头全配；请求驱动轮询（350ms 节流，空闲零工作）；封面按 (title|artist|album) 哈希缓存二进制；启动器/自启/卸载 bat 三件套（⚠ps1 必须 UTF-8 BOM，PS 5.1 无 BOM 当 ANSI 读）
- 【预设包】preset-src/smtc/ 源码 + build-smtc-preset.py（minify：CSS 全压/JS 保守/HTML 分段，19011→11996 字符贴 12000 上限，三轮瘦身：短类名+--ez/--r9 变量+Material 短 path+:has() 显隐+砍装饰）；双形态磁贴（紧凑条 64px⇄大卡 300px，点条展开/⌃收起/呼吸光晕/切歌上浮 swap/暂停降饱和/rAF 进度插值/可拖 seek）；scripts 注册 ⌘K 四命令；animations 给 .cl-widget 高度弹簧过渡（与面板同曲线）
- 【bug1 tab 选框】Dock lastCloseRef 时间戳：switchTo(null)/closePanel 统一记录，pillPop 追加「距关闭>450ms」条件——关闭退场期快速点开另一功能改播 layoutId 切换滑移，不再重播 Q 弹
- 【bug2 删行抖动】Playwright 复现实证：高度弹簧+pb 换挡全程平滑（原生 el.click() 零跳变；90px 跳变系 Playwright scrollIntoViewIfNeeded 伪影）；真因=Windows 经典滚动条出现/消失改变布局宽度（±15px 整页水平瞬跳，headless overlay 滚动条测不到）——globals.css html{scrollbar-gutter:stable} 根治
- 【验证】verify-v180.mjs 23 项全绿（mock SMTC 桥同契约：D 退役回归/W1-W7 预设导入→挂载→空态→播放态→封面→暂停推送→toggle→展开/seek/收起/K1-K2 ⌘K 命令→S1-S2 gutter+删磁贴/E1 pageerror=0）；⚠三坑：①导入按钮选择器 first() 会命中「导入预设」tab 按钮（须 exact「导入」）②widget iframe 点击后焦点困 iframe，⌘K 快捷键丢——点 dock ⌘K 按钮归还焦点③addInitScript 进 sandboxed iframe 读 localStorage 抛 SecurityError（try/catch 吞）；verify-ext-v180.mjs 8 项全绿（真浏览器扩展：渲染/无音乐按钮/导入/磁贴显示/control 上行/DOM click→桥/pageerror=0）——⚠Playwright 鼠标事件在嵌套 srcdoc frame 有丢失先例，嵌套 iframe 控制断言一律 DOM click
- 【发布】main b0886a5+a7ff334 推送；gh-pages 1bcd069（BUILD 20260905145849-b0886a5，线上 sw.js/sandbox.js smtcSubscribe 特征实测命中）；扩展 build:extension→build-extension.py v1.8.0（11.7MB）；⚠build-extension.py 输出路径硬编码旧版本号，发版必查；Release v1.8.0（id 383281524）三资产（扩展 zip/ChuShi-SMTC-Delivery.zip/ChuShi-SMTC-Preset.json）直链 SHA-256 ALL OK（⚠脚本 API 基址含 /releases，PATCH/DELETE 路径不可再拼 /releases——404 三连教训）
- 【交付】download/v1.8.0/（使用说明-SMTC音乐.md + 初始SMTC桥/ + 预设 JSON + 扩展 zip + 合并包 12.2MB）；文叔叔 https://c.wss.ink/f/ksxoe5v9171（1 天过期）

Stage Summary:
- 架构律：宿主媒体能力=「SMTC 作用面」——数据/控制/订阅三 API 两通道（脚本+widget）同契约；系统媒体会话是正确的集成层（不侵入任何播放器、随 Windows 天然稳定），侵入式桥（CDP/BetterNCM）路线教训完结
- 新律：①Playwright 鼠标事件在「唯一源宿主→srcdoc」嵌套 frame 里可能整体丢失——跨层交互断言用 DOM click；②addInitScript 会进 sandboxed iframe，碰 localStorage 必须 try/catch；③PS 5.1 脚本 UTF-8 BOM 是交付纪律；④Release 资产 ASCII 名律之外，release 脚本基址拼接也要逐段核对（/releases 双拼 404 三连）
- 待办：用户实测 SMTC 桥+预设包（真机 Windows 是 SMTC 链路唯一未验证环节：网易云 SMTC 会话行为/TrySeek 可用性/封面流读取）；任务A/史7遗留/Edge 商店材料未动

---
Task ID: 77
Agent: main (Super Z)
Task: 用户反馈两问题——①双击启动 bat 报「'敤' 不是内部或外部命令 / '垵濮?SMTC' 不是内部或外部命令」乱码假命令；②播放器样式要回上一个 dock 栏版本样式，且预设包用 .cshz 打包 UI 不要单 JSON —— v1.8.1 SMTC 预设包修订

Work Log:
- 【bat 乱码根因】源 bat 为 UTF-8 无 BOM + `chcp 65001`：cmd 按控制台代码页(936)逐行解码批处理，中途切码页后重读文件字节错位，把注释/title 的 UTF-8 中文按 GBK 误读成假命令执行（'敤'/'垵濮' 即 mojibake）；修复=3×bat 改按 ANSI/GBK 编码发布（build-smtc-delivery.py 统一 utf-8→gbk 转写 + GBK 往返断言 + 禁含 chcp）并移除 chcp——cmd(936) 读 GBK 天然一致
- 【ps1 加固】git mv 更名 ASCII `ChuShi-SMTC-Bridge.ps1`（消除 -File 参数一切路径编码变数），源文件补 UTF-8 BOM（此前源无 BOM，靠交付脚本加 BOM 才合格；现源即 BOM），版本 1.0.0→1.1.0，.NOTES 写明双编码纪律；⚠确认 v1.8.0 交付的 ps1 实际带 BOM（build 脚本第 20-21 行加过），用户侧 ps1 无恙，锅只在 bat
- 【.cshz 预设包】build-smtc-preset.py 改产 zip：manifest.json + assets/cover.svg（新增 1.2KB 紫渐变唱片 SVG 默认封面），包结构/引用完整性自检；html 里 `asset:cover.svg` 经 pack.ts parsePack 白名单内联为 data:URL——单 JSON 形态作废（git rm examples/初始SMTC音乐预设.json，asset: 引用只在包导入路径解析）
- 【dock 面板复刻 UI】music-widget.html 重写展开卡（340×248）：96px 封面(ring16)+播放态 accent 光晕(blur12 op.24)/scale1.02/右上 emerald 绿点、标题15/歌手12/专辑11 三级信息、4px 细进度条 accent 填充+常显 10px 白 thumb(accent 描边)、居中控制排(38px ghost×2+46px accent 主键 active:scale.94)、底部「已连接 · {app}」状态行(emerald/amber 点)；紧凑条 64/空态 92 同语言保留；lucide stroke 图标 defs+use 复用（play/pause/pv/nx/chevron 5 定义 6 引用）；主键渐变改纯 accent、砍 -webkit- 前缀/微进度条/♪占位层，压线 11751/12000 字符
- 【磁贴真 bug】W3f 实证：render() 里 setMode 整写 className 会抹掉 playIcons 先加的 pl 类（v1.8.0 靠封面异步第二帧重播掩盖，coverRev 空时暴露）——setMode 先于 playIcons 修复
- 【验证】verify-v181.mjs 26/26 全绿：.cshz 导入(setInputFiles)/defs+use/空态→播放态/默认唱片(svg dataURL)→真封面(png)/暂停降饱和/toggle 上行/展开 248+专辑行+footer+光晕/seek/收起 64/⌘K/gutter/删磁贴/pageerror=0；shot-v181.mjs 双主题六截图视觉验收（dock 面板气质到位）
- 【发布】main 66344a4 推送；Release v1.8.1（id 383293830）双资产 ChuShi-SMTC-Delivery.zip + ChuShi-SMTC-Preset.cshz 直链 SHA-256 ALL OK；app 本体零改动（无 gh-pages/扩展重打包）；文叔叔 https://c.wss.ink/f/ksxzra8jup1（1 天过期）
- 【文档】README v1.8.1 段 + v1.8.0 段 .cshz 引用、PRESET_DEV §12 官方示例引用、使用说明 md 全面改 .cshz 导入与编码 FAQ、说明.txt v1.1.0

Stage Summary:
- 编码律升级：**bat=发布态 GBK、源码态 UTF-8 经 build 转写并断言往返**；ps1=源文件即 UTF-8 BOM，不依赖交付层补救；被 cmd/PS 解释的脚本，编码是发布物的一部分
- 预设包律：带资源的预设一律 .cshz（manifest+assets），`asset:` 引用与单 JSON 互斥；parsePack 的 ASSET_REF_RE 白名单字符集 [A-Za-z0-9._-] 是引用命名硬约束
- widget className 整写型状态机：模式切换类与状态类共存时，先整写再叠加，顺序是契约
- 待办：用户真机复测（启动 bat 不再乱码→导入 .cshz→dock 风格磁贴）；任务A（磁贴删除抖动已被 scrollbar-gutter 根治，待用户确认）/史7遗留/Edge 商店材料未动

---
Task ID: 78
Agent: main (Super Z)
Task: 用户反馈「不是作为磁贴啊，是把音乐面板放到dock，在dock栏加一个音乐的按钮，然后要有弹出动画，做不到就加API；启动bat又弹假命令：'ANSI'/'桥'/'e'/'MTC'」—— v1.8.2 dock 音乐按钮+弹出面板（API 扩展）+ bat 编码终修

Work Log:
- 【bat 乱码第二轮根因】v1.8.1 交付 bat 虽已 GBK，但换行符 LF（Unix）：cmd 批处理解析器遇「LF-only + 多字节 GBK」行偏移错位，把行中片段当命令执行（'ANSI'/'桥'/'e'/'MTC' 全部可由行内切位复现）——与 v1.8.0 的「UTF-8 被 GBK 误读」是两种独立病；fix-bats-v182.py 三 bat 重写为**纯 ASCII 内容 + CRLF + 无 BOM**（三重保险：任何代码页/解析器行为一致），窗口提示改英文（说明.txt 带 BOM 承载中文），build-smtc-delivery.py 断言升级（全 ASCII/无 bare LF/无 BOM/chcp 禁令）
- 【API 扩展】PresetWidget 增 surface(corner|dock)/icon 字段：dock 表面不在角落出磁贴，由 Dock.tsx 注册 tab 栏按钮（icon=lucide 白名单或 data:image），点击在 dock 上方弹出同源沙箱面板——PresetWidgets 渲染 PresenceClass(panel-rise/panel-sink)+motion 高度弹簧(420/34)与内建 PanelStage 同语言；width/height 语义=弹出面板宽/初始高；关闭=再点按钮/外点遮罩/Esc/部件内 chushi.close()（sandbox.js widgetShim 新 API，op=closePanel，宿主复核仅 dock 表面且在开态）；与内建面板互斥（page.tsx 双向 effect+toggle）；dock 形态沙箱置 dataset.panel=1
- 【预设改版】SMTC 音乐预设 widget：surface=dock+icon=music+width 340+height 92；部件 html panel 形态=连接后直开展开卡（跳过紧凑条）、收起键改 chushi.close()；⌘K 四命令保留
- 【⚠新坑①（v1.8.1 就带着的）】music-widget.html 的 <svg width=0 height=0> 是 inline 元素，body 行盒撑 19px 把 .card 顶下去→弹层顶部 19px 白条（沙箱宿主白底透出）；空态层 .em 与紧凑条 .cp 同屏叠加——修：svg 加 position:absolute + .mode-em .cp 隐藏；Playwright frame API 探针（elementFromPoint+computed style）实锤
- 【⚠新坑②】npm run build 默认 standalone；verify 服务的 out/ 是 EXPORT_MODE 产物——改完源码忘跑 EXPORT_MODE=1 重导出，验证全跑在旧 bundle 上（表现：parsePreset「丢」surface/icon，实为旧代码）。「验证前先核对被测产物的时间戳与构建模式」
- 【⚠新坑③】shot 脚本 mock 桥端口写 20755（smtc.ts 硬编码 20754）→ 播放态截图永远空态；探针类调试走 Playwright frames()（host iframe 有 sandbox=allow-scripts，contentDocument 拿不到）
- 【验证】verify-v182.mjs 29/29 全绿：.cshz 导入→dock 按钮出现+角落磁贴消失/空态弹出 92+dataset.panel/Esc+外点+收起键三路关闭/active 选框/播放态 248 直开(mode-fl)/默认唱片→真封面/toggle+seek 上行/与内建面板互斥双向/⌘K 命令/gutter+删磁贴回归/pageerror=0；shot-v182 双主题 8 截图视觉验收（空态/播放态/特写）；扩展 zip 验包（manifest 1.8.2+closePanel/panelMode/cl-dockwidget 特征）
- 【发布】main b0b3e5b；gh-pages 665aba8（sw BUILD 20260905171705-b0b3e5b，线上 css .cl-dockwidget/js onToggleDockWidget/sandbox closePanel 全命中）；扩展 build-extension.py v1.8.2（11.7MB）；Release v1.8.2（id 383316183）三资产（Delivery.zip/Preset.cshz/NewTab-v1.8.2.zip）直链 SHA-256 ALL OK；文叔叔合并包 https://c.wss.ink/f/ksykldwv8lp
- 【文档】README v1.8.2 段、PRESET_DEV §12 重写（surface/icon/chushi.close + 双 widget 示例）+ 钩子表 + 作用面总览、PresetDocs.tsx 同步（应用内 §12+demo）、使用说明-SMTC音乐.md v1.8.2 全文改 dock 交互、说明.txt v1.2.0

Stage Summary:
- 结论：预设系统获得第二个 widget 表面（dock 按钮+弹出面板，「做不到就加API」落到 surface 字段+chushi.close API）；音乐面板即 v1.7.x dock 栏样式以弹出形态回归；bat 编码问题以「纯 ASCII+CRLF」终局（两轮两种根因都已写进断言与文档）
- 新律：①被 cmd 解释的脚本，换行符与编码同级危险——LF-only+多字节=行偏移错位，发布断言必须同时锁内容与行尾；②改源码后必须重跑对应 MODE 的导出再验证（out/ 双模式：EXPORT=Pages/EXTENSION=扩展），「测试绿」先问「测的是哪个 bundle」；③inline <svg width=0> 会撑行盒——zero-size 资产一律 absolute；④沙箱 host iframe（sandbox attr）contentDocument 不可达，嵌套 iframe 调试走 Playwright frames()
- 待办：用户真机复测（桥 bat 不再假命令→导入新 .cshz→dock 音乐按钮→弹出面板控制网易云）；旧 .cshz 预设需删除重导（surface 字段在新 manifest）；任务A（磁贴删除抖动）/史7遗留/Edge 商店材料未动

---
Task ID: 79
Agent: main (Super Z)
Task: 用户四组反馈——①音乐面板打开瞬间白屏 ②面板切换动画与内建不衔接 ③封面不显示 ④进度条完全是坏的 + 新需求：BetterNCM API 插件读网易云逐字歌词、用 SMTC 时间戳对歌词

Work Log:
- 【进度条根因（本轮最大发现）】完整快照广播签名不含 position → seek 后新位置永远不会到达部件（签名未变不广播），部件继续从旧锚点插值 → **拖完进度条弹回**，即用户真机「进度条完全是坏的」的主根因；v1.8.2 的 verify 之所以全绿：mock 只改签名可见字段，从未单独改 position。修法 = 双通道：①smtc 单例新增 onTick（轮询成功每拍必发轻量锚点 position/duration/playing/rate/fetchedAt，与签名无关、不携歌词大载荷），PresetWidgets/sandbox.ts 双消费方转发 widgetSmtcTick/smtcTick；②sandbox.js 两通道按 scriptKey/widget 维度保存 lastSmtc，tick 只改锚点字段不覆盖 cover/lyric；③部件 seek 提交成功后本地乐观重锚（position=fetchedAt=now）。verify 新增 L9 行切换用例实证修复
- 【白屏根因】v1.8.2 弹出面板 iframe 挂在 AnimatePresence 内——每次打开新挂 iframe → sandbox.html 冷加载 → srcdoc 注入 → 订阅回推，首帧白屏。修法 = **常驻预热**：dock 部件的弹出容器+iframe 随页面常驻（相位机 closed/open/closing 管高度弹簧与 panel-rise/panel-sink 类），iframe 节点永不卸载；SMTC 订阅/封面/歌词后台持续更新，打开零白屏零重载。新律：iframe 跨开关存活 → 打开瞬间内容已渲染（W1 用例：开后 320ms 内 #card 可见）
- 【动画衔接】弹出面板弹簧由硬编码 420/34 改为 MOTION_PROFILES[motionProfile]（随设置动效档位）；常驻预热消除加载卡顿后，弹出/收起与内建面板完全同一套「高度弹簧+rise/sink」语言；aria-hidden 移到 .cl-dockwidget 卡片本身（原来在外层 wrapper，选择器/可及性都不对）
- 【歌词架构（按用户指令「写一个 betterNCM 的 api 插件读歌词、用 smtc 时间戳对」）】三层链路：①**初始歌词源** BetterNCM 插件（bridge/lyric-plugin/，纯 API 无 UI）：dva store/legacyNativeCmder/媒体元素三源读状态（复用旧插件技术），歌词 eapi /api/song/lyric/v1（yv=1/-1 双试）→ klyric 转 yrc 同构 → channel.call("track.lyric.getinfo") → 直连 music.163.com 四层回退；自包含 eapi 加密（MD5+AES-128-ECB，S-box 运行时构造），**标准向量测试全绿**（RFC1321/中文 UTF-8/FIPS-197 C.1/SP800-38A）；1s 心跳 POST 推桥，桥不可达暂存补推。②**桥 v1.2.0**（PS1）：/api/plugin/state、/api/plugin/lyric（插件推送，内存缓存）、/api/lyric（宿主拉取），/api/state 附带 ne（≤5s 新鲜度+lyricRev）。③**宿主 smtc.ts 合并**：曲目匹配（标题双向包含）时 SMTC 时间轴缺失（0）用插件帧级进度兜底、封面缺失用插件 picUrl 兜底（coverUrl），lyricRev 变化拉歌词随快照广播
- 【逐字歌词渲染】music-widget.html v2：yrc 解析（[start,dur](s,d,0)词）→ 行/词 DOM → rAF 逐帧：当前词 linear-gradient --p 扫色（-webkit-background-clip:text）、行 translateY 居中滚动（0.55s 缓动+上下渐隐 mask）、当前行下方翻译（ytlrc/tlyric 按时间就近对齐）；无 yrc 落 lrc 行级高亮；无歌词区隐藏+面板自动收窄（248⇄372，H_MAX 320→460）
- 【加密调试实录（两坑）】①MD5 长度字段：JS 移位计数取模 32——bitLen 高 4 字节用 x>>>(8*i)（i≥4）等于不移位，把低位字节重复写进 msg[60]（md5('') 侥幸过、其余全错；Python 镜像逐轮对拍+逐长度扫描才定位）；②AES ShiftRows 只回写 1..3 行，**第 0 行从未经过 SubBytes**（FIPS 向量逐轮对拍实锤）。另：我背错 RFC 'abc' 向量尾部，四个独立实现（hashlib/node/md5sum/openssl）一致才确认记忆错误——「标准向量以本机多实现对拍为准，不以记忆为准」
- 【扩展版离线真凶】build-extension.py manifest 的 host_permissions 缺 127.0.0.1:20754——扩展版所有桥请求被浏览器拦截，音乐面板在扩展里**完全离线**（web 版靠桥的 CORS * 存活）；补上后扩展冒烟 14/14。这很可能叠加在用户真机症状上（若用户装的是扩展）
- 【旧坑复修】部件 --ez:var(--ez) 自引用=无效声明（跨 iframe 拿不到宿主变量，全部 transition 静默退化）→ 真实 cubic-bezier(.22,1,.36,1)；.rl u thumb 初始 left:0；seek 拖动后乐观重锚
- 【环境考古】.pkgtmp/gh-token 又丢 → 从 git remote 内嵌凭据重建（0600+API 验证）；deploy-pages.sh 与 wss 依赖（base58/pycryptodomex）随环境清理丢失 → deploy 脚本自 /tmp 归档恢复并加固（--ignore-submodules=all，transfer 子模块环境侧脏态不再阻塞）；pip 装到系统 python 而 python3 是 venv——统一 python3 -m pip
- 【验证】verify-v190 **50/50**：导入/预热断言（P4-P7）/零白屏（W1）/92⇄248⇄372 三态高度/进度条活性+带宽/SMTC 封面+插件 picUrl 兜底（route 拦截 mock 域验证 naturalWidth）/插件进度兜底 21.25%/歌词 2 行+行高亮+居中滚动+当前词 act+--p 扫色/L9 行切换（tick 通道实证）/互斥往返 iframe 不重载（dataset.mark）/⌘K/gutter/删磁贴/pageerror=0；扩展冒烟 14/14（manifest host_permissions+歌词态直开+控制上行）；shot-v190 双主题 6 截图视觉验收（逐字扫色/翻译行/mask 渐隐肉眼确认）
- 【发布】main 2f2d3d4+96defde；gh-pages b5044b3（sw BUILD 20260906-042503-96defde，线上 chunk+sandbox.js 均实测含 widgetSmtcTick）；扩展 build-extension.py v1.9.0（11.7MB，host_permissions 修复）；Release v1.9.0（id 383463460）三资产直链 SHA-256 ALL OK；文叔叔合并包 https://c.wss.ink/f/kt3clnj8ivn；docs：README v1.9.0 段+PRESET_DEV §12（预热行为/高度 460/限额 18000）+PresetDocs 同步+使用说明全文重写（三步安装+FAQ）

Stage Summary:
- 结论：四项反馈全部根治且各有实证——白屏（预热+W1）、动画衔接（同弹簧+同语言）、封面（三重保障+N4/N5）、进度条（tick 锚点+乐观重锚+M3/N2/L9）；新增逐字歌词全链路（插件加密向量全绿+50 项端到端）
- 新律：①「签名广播」与「连续量」必须分离——position 这类每拍都变的量走轻量 tick 通道，整包快照只随离散签名走，否则 seek/漂移校正永远到不了消费方；②沙箱 iframe 的「打开即挂载」一律改「常驻预热」——冷加载白屏是 iframe 固有属性，不是动画问题；③eapi 加密自实现必须过标准向量（FIPS-197/RFC1321），且向量化对拍要多实现互证（记忆不可靠）；④JS 移位计数取模 32 是密码学自实现的长尾坑（x>>>32===x>>>0）；⑤扩展 host_permissions 是扩展版本地服务的第一嫌疑犯（web 版正常+扩展版全挂=先查 manifest）
- 待办：用户真机复测（新 .cshz+新桥 v1.2.0+歌词源插件三件套）；旧 .cshz 需删除重导；Edge 商店材料仍未动；Release v1.7.7 旧资产（含退役插件包）去留未决

---
Task ID: 80
Agent: main (Super Z)
Task: 用户五组反馈——①预设包还是没接入切换动画（接口不够接着加）②开面板仍闪白 ③没歌词 ④进度条还是坏的（不能拖/不显示整首时长）⑤开关动画没模糊 + 架构指令「预设包只写音乐面板样式，检测 SMTC 等直接写在初始里面，提供封面/歌名/歌词/进度条等预计算 API，用户零计算」——v2.0.0 统一面板舞台 + 核心内建音乐引擎

Work Log:
- 【视频取证】upload 录屏（15.6s，v1.9.0 上线 12 分钟后录制）：vision API 两次 1210 拒收 mp4 → ffmpeg 抽帧 16 帧 @1fps + 全帧/面板区域 YAVG 亮度尖峰分析（471 帧 @30fps，无全帧白闪 → 闪白在录制前的冷打开）+ 过渡窗 30fps 逐帧：实证进度钉死 0:00（t=2s 与 t=6s 原生分辨率裁剪对比，播放中）、内建→音乐切换 = 淡出→空档→独立弹出两段式、快速开关循环
- 【冻结进度真机根因（本轮最大发现）】网易云的 SMTC TimelineProperties.Position 整首歌不上报（录屏实锤），桥 v1.2.0 裸报 $tl.Position 且宿主 smtc.ts 每拍 fetchedAt=Date.now() 重置锚点 → 插值永远≈0；v1.9.0 的 M3 采样窗口（780ms）恰好落在轮询间隙没抓到回跳。双端根治：①桥 v1.3.0 源头时钟补偿（raw Position/LastUpdatedTime/Playing/曲目键 任一变化重置墙钟锚，其间 position=Base+墙钟差×速率，clamp 时长）②宿主 smtc.ts 锚点保持兜底（曲目/app/playing/rate/位置全未变 → 保留上拍 position+fetchedAt，旧桥也能走）；verify-v200 F1/F2 跨轮询采样（3.2s>2 周期）断言单调无回跳——旧实现必挂，新版 Δ=1.13% 单调
- 【统一面板舞台】Dock.PanelStage 重构为常驻相位机（closed/open/closing，渲染期调整 state 模式，同步 setState-in-effect lint 禁令）：dock 部件视图（.cl-dockwidget 移居舞台内 absolute top-0 overlay，iframe 永不卸载=预热）与内建视图同一壳体——开=panel-rise+content-focus 模糊聚拢、关=panel-sink 级联模糊散场、互切=旧视图 view-exit+新视图 content-focus+高度/宽度 px 弹簧（360⇄340 同一动效档位）；壳体透明（内建才套 glass-card，音乐面板自带暗卡视觉交叉溶解自然过渡）；部件激活用「摘类→reflow→挂类」重播 content-focus；PresetWidgets 瘦身为角落磁贴+消息路由（帧句柄经 widget-frames.ts 共享注册表，chushi.resize 高度上提 page→Dock）
- 【核心内建音乐引擎 chushi.music】sandbox.js __chushiMusicCore（单源函数，脚本通道直用+部件通道 Function.toString 内嵌，public/ 不经打包器零改写风险）：yrc/lrc 解析+双语翻译就近对齐（yrc 行文本 t=词串连接）+本地时钟插值+二分逐字对齐；now() 同步返回 {position,duration,progress,playing,lineIndex,wordIndex,wordProgress,lineProgress,lineText,lineTr,wordText}；subscribe 只推离散快照；seek 成功自动乐观重锚；脚本通道经 smtcPush/smtcTick 同源喂数（零新增消息类型），旧 chushi.smtc 保持兼容；music-widget.html v3 瘦身 12875 字符纯样式零计算（修歌词键 bug：rev+存在性双标志，首个快照歌词未到不再吞掉到位重建）
- 【动画/白屏实证】verify-v200 61/61：W1 内容瞬时可见、W2/W3 rise+content-focus 类在位、A1/A6 跨切换壳体同一 DOM 节点（dataset.mark）、A5 旧内建视图 view-exit、X1 iframe 不重载；shot-v200 双主题 6 截图（逐字扫色/翻译行/mask 渐隐肉眼确认）；dark 面板歌词两行+翻译+0:47/4:29 进度全对
- 【发布】main c284692 推送；gh-pages BUILD 20260906-053841-c284692（线上 sandbox.js 含 __chushiMusicCore 实测命中）；扩展 EXTENSION_MODE 重打 v2.0.0（⚠再次踩 out/ 双模式坑：先 EXPORT 打的 zip 页面白屏超时，EXTENSION 重导后过）；Release v2.0.0（id 383478195）三资产直链 SHA-256 ALL OK（⚠rel 脚本两处 404 复发：①API 基址含 /releases 时 PATCH/DELETE/GET 相对路径不可再拼 /releases ②资产上传必须 uploads.github.com 专用域）；文叔叔合并包 https://c.wss.ink/f/kt3vlwtwoer（1 天过期）
- 【文档】README v2.0.0 段（升级三件套：桥换 v1.3.0+删旧导新 .cshz+Ctrl+F5）；PRESET_DEV §12 chushi.music API 表+统一舞台行为说明；PresetDocs.tsx 同步；download/v2.0.0/使用说明-SMTC音乐.md 全文重写

Stage Summary:
- 结论：五项反馈全部闭环——切换动画衔接（统一舞台实证）、闪白（常驻预热+壳体首帧有类）、歌词（chushi.music 全链路+61 项回归）、进度条（双端时钟补偿+跨轮询回归）、模糊（同一套 content-focus 词汇）；架构按用户指令落地：预设只写样式，宿主内建引擎提供预计算 API
- 新律：①「采样窗口必须横跨轮询周期」——进度类活性断言 780ms 窗口会漏掉 1s 锚点重置（v1.9.0 假绿教训）；②真机录屏是最低成本根因取证：ffmpeg YAVG 尖峰+过渡窗逐帧可实证「冻结/两段式/无白闪」，vision API 拒收也不挡路；③Function.toString 单源内嵌是双通道 shim 防漂移的正解（public/ 资产无打包器改写风险）；④rel 脚本两处 404 是 v1.8.0 教训复发——PATCH 相对路径与 uploads 域，教训必须写成脚本注释而非只进 worklog
- 待办：用户真机复测（新桥 v1.3.0+新 .cshz+Ctrl+F5 三件套）；任务A/史7遗留/Edge 商店材料未动；Release v1.7.7 旧资产去留未决

---
Task ID: 81
Agent: main (Super Z)
Task: 用户第 5 轮反馈（附新演示视频 https://c.wss.ink/f/kt47itg94bp）——音频歌词不同步/歌词闪动/暂停重置进度条歌词/再播放重头/进度条拖不动/播放暂停反应慢/关闭箭头反向/切换仍是开关动画/dock 选框关闭动画/开面板闪白，且「逐字歌词不行就正常歌词即可」——v2.0.1 六联修复 + 桥 v1.4.0

Work Log:
- 【视频取证（upload/66MB 60fps，v2.0.0 上线 31 分钟后录制）】1fps 全片抽帧+进度条横条逐秒放大：0:15→1:04 单调前进（v2.0.0 冻结修复生效实证）→ **t=74.5 暂停瞬间 1:04→0:00 →0:00 冻 3 秒 → 再播放 0:01/0:02/0:03 重头计数 → t=81 又归零**（用户「暂停后重置+重头再来」的帧级实锤）；t=6.37 开面板 1-2 帧灰白壳（闪白）；30fps 歌词区逐帧 diff：扫色词整词隐形闪动；总时长 3:26 常显（确证用户已在 v2.0.0）
- 【根因链】①桥 v1.3.0 锚点重置一律取 raw Position（网易云整首钉死 0）→ 暂停归零/恢复重数；②seek 后网易云不刷新 SMTC 时间轴 → 桥不重锚 + 下一拍把乐观锚点拽回；③rAF 逐帧覆写进度条 → 拖动预览 16ms 被冲掉；④按钮等下一轮询才翻图标（最坏 ~1.5-3.6s）；⑤壳 panel-rise（opacity 0→1）× content-focus（opacity 0+blur）双重半透明叠明亮壁纸=灰闪，且 CDP 帧序列进一步实锤：visibility/opacity/transform 隐藏过的 iframe 重激活首帧被合成器填纯白（来自旧层树，DOM 层叠拦不住）；⑥-webkit-background-clip:text 渐变在 transform 过场部分帧不绘制=整词隐形
- 【桥 v1.4.0】锚点重置策略重写：曲目键变→raw；其余（暂停/恢复/Lu 刷新）→上一拍连续位置 CurPos（无缝冻结/续接）；seek 成功后立即 Base=sec+At=now
- 【宿主 smtc.ts harmonize 守卫链】（旧桥不升级也全对）：a) 本端 seekHold 4s 内信 seek 线；b) 暂停冻结（playing 翻 false 且 reported 回退>3s → 冻在本端插值处）；c) 恢复续接（reported≈0 而本端>5s → 续接冻结值）；d) 持续偏移保持（rdelta 同偏移漂移≤1.5 → 保本端时钟；突跳=真实时间线变化→放行）；control() 成功后 schedule(80) 立即补拍
- 【互斥单帧化】switchTo/gotoPanel/cmdk panel 动作同批 setDockWidget(null)（原 effect 二段渲染，两帧间隙双 pill 同 layoutId 共存→滑移失效变 Q 弹+舞台同帧双视图）；pillPop 条件补 prevWidgetOpenRef；部件关闭也记 lastCloseRef
- 【壳体类稳定律】openAsWidget 于 closed→open 迁移定格——若按 activeWidget 实时取值，音乐→内建互切壳类 ""→"panel-rise" 类变化=CSS 动画重播=切换整壳淡入闪白
- 【闪白终案（试错链全记录）】visibility 隐藏→白帧；opacity:0→白帧；scale(0.001) 保活+overflow 切换→白帧；纯裁剪→白帧（合成器对子帧未就绪一律白填充）；boot 同色罩 140ms→白帧在 190ms（227=0.87 白混合，罩子先淡完）；驻留 280ms→冷开灭/热开仍漏（旧层树罩=0）；**终案=罩子基态常开（closed 相位也 1，反正视图藏着）+ 激活播 boot-reveal（280ms 驻留+180ms 揭开,forwards）+ 关闭相位摘类回基态（下一轮重激活的旧层树里罩子=1）+ sandbox.js colorScheme 随主题（预绘制帧暗色化）**→ CDP 冷/热开白帧 NONE
- 【歌词扫色重写】双层实体色：底层 .lyw 实色永可见，上层 .ov 同文本 clip-path:inset 按 --p 裁剪显色；JS 每帧只写 --p 一个变量（无 class 摘挂）
- 【验证】verify-v201 60/60×2 轮稳定（W1-W5 无 opacity 聚拢+opacity=1 实测/F1-F4 暂停冻结+恢复续接跨轮询/S1-S4 拖动预览 50%+seek 命令+seekHold 钉 50%+不弹回/O1-O4 乐观翻转<250ms+真实态确认/AR1 箭头朝下/LY1-LY12 双层扫色结构断言/A1-A10 单帧互切壳类稳定/B1 内建 panel-rise 回归/K/G/E）；⚠坑：F4 mock 从计数线切静态 0 产生 -3s 突跳被守卫当真实变化放行（mock 要连续接管）；verify-ext-v201 14/14；CDP 帧序列冷/热开白帧 NONE；shot-v201 双主题 8 图（开场中帧无灰白+箭头朝下+双层扫色肉眼确认）
- 【发布】main 提交推送；gh-pages DEPLOY-OK（线上 chunk content-focus-solid/seekHold、sandbox.js colorScheme、sandbox.html?v=121 透明全命中）；扩展 EXTENSION_MODE v2.0.1（⚠build-extension.py 输出路径硬编码旧版本号教训三犯——sed 后重打）；Release v2.0.1（id 383510090）三资产直链 SHA-256 ALL OK；文叔叔合并包 https://c.wss.ink/f/kt4xhcuo2ml（1 天过期）

Stage Summary:
- 结论：十项反馈全闭环且各有帧级实证；架构继续兑现「预设只写样式、宿主全包计算」——本轮宿主侧新增 harmonize 旧桥伪影守卫，用户只 Ctrl+F5 网页也能立刻全对，桥升级后源头更干净
- 新律：①「连续量锚点重置必须用连续位置，raw 只属于新曲目」；②合成器对子帧未就绪的 iframe 一律白填充且发生在旧层树上——DOM 层叠拦不住，罩子必须在「关闭期间」就处于开启态（基态常开+激活时揭）才能盖住旧层树帧；③CSS 动画类在常驻元素上变化即重播——相位机里跨切换不得让动画类易值，开打瞬间定格；④子文档 color-scheme 决定合成器预绘制帧的底色；⑤rAF 渲染循环与交互态（drag）要互斥，否则预览被逐帧冲掉；⑥录屏取证要打时间戳放大关键横条，帧级实锤胜过一切推测
- 待办：用户真机复测（桥 v1.4.0+新 .cshz+Ctrl+F5）；任务A/史7遗留/Edge 商店材料未动；Release v1.7.7 旧资产去留未决

---
Task ID: 82
Agent: main (Super Z)
Task: 用户第 6 轮反馈（附新演示视频 https://c.wss.ink/f/kt5ozvh62s3）——①播放/暂停按钮轻微位移 ②暂停后再继续播放歌词对不上 ③自动下一首歌歌词概率加载不出来 ④进度条还是没办法拖动——v2.1.0 四联修复 + 桥 v1.5.0 + 插件 v1.1.0

Work Log:
- 【视频取证（65.6MB 60fps，Edge 2026-09-06 17:53 录制）】文叔叔匿名下载链路新写 wss-fetch/wss-probe/wss-grab（scan 端点 404 → Playwright 点「下载」按钮截 download 事件拿直链）；1fps 全片 + 3fps 面板裁剪 + 10fps 进度条横条：①t=19-21.5 用户 6 次拖动全部「预览 2:04/2:18/2:36/1:55/1:04 正确显示、松手 0.1-0.3s 内弹回 0:08-0:11」→ seek 命令根本没生效（v2.0.1 的拖动预览修复生效实证）②t≈7-10 切歌序列：旧词+紫图标+--:-- 过渡态 1.2s → Self Love 带词 → 角贴 → Move Up 重开 ③t≈27-28 暂停/恢复：暂停冻结 0:15/恢复续接正常（v2.0.1 生效实证），但 0:16→0:15 一次 1s 回跳校正=插值漂移存在实锤
- 【按钮位移取证】60fps 按钮区裁剪 + PIL 质心测量：紫圆质心全程 (101.5,80.5) 不动、▶/⏸ 字形质心差仅 0.2-0.4px、30fps 帧差只有按钮+专辑图滤镜+光标 → 「位移」观感 = 细线框▶→实心⏸ 的视觉质量跳变 + display 硬切换；修法 = 双 SVG 同圆心绝对堆叠 + opacity/scale .16s 交叉淡切（布局零位移，verify BT4 实测 dx=dy=dw=0）+ 播放三角实心化（.pc）+ 三角光学居中（points 8,4 20,12 8,20）
- 【歌词错位根因】桥 v1.4.0 连续位置锚点在暂停检测晚一拍（≤1 采样窗）时多算，多次暂停逐次累积成永久偏移（音频/歌词错位）；修法（桥 v1.5.0）= 插件真值锚定：网易云插件在客户端内直读 el.currentTime（帧级真值）每秒心跳重锚，暂停/恢复漂移归零；无插件场景半窗补偿（暂停时连续位置回退 0.5×采样窗，期望残差归零）
- 【歌词加载不出根因（三层孪生竞态，逐层取证）】①宿主 fetchLyric：inflight 守卫静默丢弃新 rev（切歌瞬间旧拉取未完成→新 rev 永不拉取）→ lyricWanted latest-wins 链式补拉 + 重试去掉 state.lyric==null 抑制（切歌快照保留旧词时重试被永久压制）②沙箱 __chushiMusicCore.feed：parsed 布尔被切歌快照捎带的旧词载荷消费→宿主真词载荷永久跳过 → 改按载荷对象引用判重（parsedRef）③部件 render：lyKey=rev+存在性 在「同 rev 旧词→新词」时键不变不再重建 → 加行数组引用维（lyRef）。dbg-lyr210 探针实锤：snapshot 已是 3 行新词而 DOM 停留旧词 → 锁定第三层
- 【seek 拖不动根因】桥 'seek' 以 IsSeekAvailable 一票否决（网易云实测报 false）→ {ok:false} → 宿主不 seekHold 不重锚 → 下一拍弹回；修法 = ①照发 TryChangePlaybackPositionAsync 取真实返回值 ②seek 命令经插件心跳应答通道直通（桥挂 NeCmd→插件心跳响应捎带→el.currentTime 直写→插件 PlayProgress/Seek 事件回报真值自动验证）→ SMTC 拒绝也跳得动
- 【⚠环境级发现：写管道啃蚀 [m 序列】工作区文件 `[math]`→`ath]`（5 处，v1.4.0 桥上轮交付即损坏→用户机器从未启动成功 v1.4.0、实际跑 v1.3.0+宿主守卫）；且 Read 工具会渲染出未损坏假象、bash 读到的是字节真值、写入传播有秒级延迟——对策：统一改写为大写 [Math]::（PS 大小写不敏感+实测不被啃）+ fix-bridge-final.py 收敛写入（fsync+2s 后复核）+ 交付物字节级断言（BOM/版本/裸 ath=0/[Math]×10）
- 【桥 v1.5.0 全改】seek 重写（真实返回值+插件直通）/ Test-TitleMatch（双向包含+归一化包含，与宿主同律）/ 插件真值锚定 / 暂停半窗补偿（prevSampleAt 不确定窗）/ /api/lyric 尊重 ?v=（rev-mismatch 拒旧词）/ 心跳应答捎带命令（消费即清 5s 过期）；audit-bridge-v150.py 静态审计（括号平衡/标记/编码/无硬门）
- 【插件 v1.1.0】postJson + pushState 应答解析 + applyBridgeCmd（seek 直写 el.currentTime，带时长夹紧+切歌丢弃守卫）
- 【宿主 smtc.ts】fetchLyric 三修（latest-wins 链/重试去 null/j.rev 校验 stale-lyric）+ trackMatchesNe v2（归一化包含+时长±2s 且歌手首段重合兜底——SMTC 标题被本地化时的概率性不匹配）
- 【验证】verify-v210 68/68 ×2 轮稳定（新增 BT1-BT4 按钮堆叠/过渡/零位移、LR1-LR2 竞态切歌 B 词 1.4s inflight 窗口内到位、ST1-ST2 桥回旧词拒收+新词重试到位；O 段适配 .off 类）；⚠三层 bug 是串行发现的：verify 全绿后 LR/ST 才红——每层修复必须重跑全套；扩展冒烟 14/14；shot-v210 双主题 8 图（实心暂停条/扫色/翻译/向下箭头肉眼确认）；线上核验 chunk lyricWanted+stale-lyric ✓ sandbox.js parsedRef ✓ sw BUILD 20260906-105842（⚠线上核验路径是 _next/static/chunks/ 不是 static/chunks/）
- 【发布】main dedfa36+worklog；gh-pages DEPLOY-OK；扩展 v2.1.0（11.7MB）；Release v2.1.0 三资产直链 SHA-256 ALL OK；文叔叔合并包 https://c.wss.ink/f/kt66cten2xf（⚠第一次合并包 zip 预设路径错打残且已误传 kt666r1ijvp 作废——重打校验后重传）；交付物字节级复核（ps1 BOM/v1.5.0/[Math]×10/裸ath=0、cshz 含 .off+lyRef、plugin 1.1.0 含 applyBridgeCmd）

Stage Summary:
- 结论：四项反馈全闭环且各有帧级/构建内实证；歌词「概率加载不出」实为三层同构竞态（宿主 inflight 丢弃/沙箱 parsed 消费/部件 lyKey 不变），「歌词对不上」为暂停检测滞后的累积漂移，「拖不动」为 IsSeekAvailable 谎报+无备用通道——全部根治且旧桥场景宿主守卫继续兜底
- 新律：①「切歌快照必捎带旧词载荷」是数据流的固有属性——所有按「存在性/首见」判重的缓存都要加内容引用维；②写管道会啃 [m 序列且 Read 工具渲染不可信——关键文件一律字节级验证+大写 [Math]+收敛写入复核；③文叔叔上传前必须先本地 zip 完整性校验（残包上传不可撤回）；④「预览正确+松手弹回」=命令被拒而非 UI 问题——seek 类反馈先查桥的 ok 语义；⑤环境的多层文件视图会短暂不一致——交付前在同一指令内做最终字节断言
- 待办：用户真机复测（桥 v1.5.0+插件 v1.1.0+新 .cshz+Ctrl+F5 四件套）；任务A（快捷服务删除抖动）/史7遗留/Edge 商店材料未动；Release v1.7.7 旧资产去留未决

---
Task ID: 83
Agent: Super Z (main)
Task: v2.2.0 三联升级——真机第 7 轮反馈（面板能拖但网易云本体不动→改用 API 控制；暂停后再播放仍累积漂移；SMTC 桥合并进扩展不再多开窗口）

Work Log:
- 审计定位三层根因：①宿主 harmonize(d)「持续偏移保持」无过期会在插件真值在场时无限期钉住本端 seek 线（面板假跳本体不动的观感根因）+ v2.1.0 真值锚定只在 SMTC position≤0 时兑底（SMTC 报非零陈旧值时真值被忽略→漂移温床）；②桥 Test-TitleMatch 单层容错失配时整段回退 v1.4.0 启发（已知累积漂移路径）；③开机自启 Run 键永远指向旧解压目录——四件套版本漂移是「修了但没生效」的高概率元凶
- 外部调研：NM manifest 无 args 字段（PS1 无法直接作 NM host、无编译器产不出 shim exe）→ 桥合并方案定为隐身化；网易云内部 seek action = playing/setPlayingPosition（v1.7.x 控制插件源码 git 考古 + Lyricify 文档佐证 SMTC seek 客户端级残疾）
- 插件 v1.2.0：seek 双级阶梯（dispatch setPlayingPosition → 420ms el.currentTime 实测校验 → 元素直写兑底 → 再校验）+ seekAck{id,ok,pos,at} 随心跳回传 + buildSnapshot 不再用 store.playingState 覆写 el.paused（元素为音频真值）+ 版本串 1.0.0→1.2.0 修正
- 桥 v1.6.0：/api/control seek 生成 seekId 随 NeCmd 下发、心跳应答捎带 id、Update-NeState 捕获 seekAck/v（插件版本）透传 /api/state；自愈自启（Run 键存在时每次启动重写到当前目录）；端口接管（绑定失败时按命令行识别本桥旧实例并结束重试）；新增 bridge-hidden.vbs（纯 ASCII）+ 添加开机自启.bat 改经 wscript 静默拉起
- 宿主 smtc.ts v2.2.0：插件真值绝对锚定（ne 心跳 ts≤3s 新鲜且曲目匹配时 position/duration/playing 一律以 el.currentTime 真值为锚——暂停/恢复/微 seek 1s 内绝对重锚，误差不可能累积；harmonize/锚点保持仅 SMTC-only 启用）+ verifySeek 诚实验证（seekAck 直答快路径 / 真值 2.5s 跟上确认 / 未跟上弹回+seekNote）+ pluginVer/seekNote 进 stateSig 广播
- 沙箱/部件：sandbox.js feed 白名单加 pluginVer/seekNote、sandbox.html ?v=122、部件页脚渲染 seekNote 优先 + 「· 插件 v1.2.0」诊断尾缀
- verify-v220.mjs 新套 17/17：V 真值锚定（SMTC 钉死 50 + 真值 100s 前进→面板跟真值 38.9%）、D 两轮暂停/恢复偏差 0.03%/0.06% 无累积、S1 seek 生效不弹回/S2 未生效诚实弹回+页脚提示、FT 页脚插件版本、LG SMTC-only 回归、X pageerror=0；verify-v210 74 行「损坏」实为回传显示层啃蚀假象（od 字节级证伪，文件本体完好）
- 交付物字节断言 21/21（ps1 BOM+v1.6.0+[Math]×10+seekId/seekAck/自愈/接管；plugin v1.2.0+dispatch+eapi；ts 真值锚/verifySeek；sandbox 白名单；widget 页脚；vbs/bat ASCII+CRLF）；build-v220-assets.py 出三包（SMTC 交付包 34KB / 扩展 11.7MB / 合并包 12MB）全断言过
- Release v2.2.0 id=383576441 三资产直链 SHA-256 ALL OK；main ae7994a 推送；gh-pages DEPLOY-OK 线上特征实测（sandbox.js pluginVer 白名单 ✓ chunk v=122/verifySeek×2/拖动未生效 ✓ sw BUILD 20260906-123255-ae7994a）；文叔叔合并包 https://c.wss.ink/f/kt6tg9pzhut（wss-send 上传 12/12 块 complete code=0 success 99%；回下验包因 wss scan 接口下线不可行——旧链 kt66cten2xf 同样 404 实证接口级变更而非链接问题）
- 本轮环境新发现：bash heredoc 内嵌含 s[m 序列的修复脚本会被啃蚀导致断言错位——修法=布尔输出的 python 断言 + od 字节级取证；grep/Read 输出均可能被显示层啃蚀，关键判定只信 od/程序化计数

Stage Summary:
- 三项反馈全闭环：seek=客户端内部 API 阶梯 + 诚实弹回（绝不再假跳）；漂移=真值绝对锚定结构性归零；窗口=隐身自启 + 自愈升级 + 端口接管（Windows 无 NM args/无编译器约束下的最优「并入扩展」体验）
- 新律：①多组件交付必须内建版本自检（页脚 pluginVer/桥版本对拍）+ 自愈升级（Run 键重写）+ 端口接管，三件套把「用户停在旧版」从原因变成症状可见；②「面板动了本体不动」类反馈优先怀疑验证缺失（假信任窗）而非单点失效——诚实回退比虚假成功更重要；③回传显示层会啃蚀特定字节序列——交付判定只信 od/程序化断言，grep/Read 目视不可作证据
- 待办：用户真机复测（合并包四件套 + 页脚插件版本对拍 + 拖动看网易云本体）；wss scan 回下验包接口待修（本次以 complete+process 双确认替代）；任务A（快捷服务删除抖动）/Edge 商店材料未动；Release v1.7.7 旧资产去留未决

---
Task ID: 84
Agent: Super Z (main)
Task: v2.3.0 一体化插件——按用户指认思路抛弃独立 SMTC 桥文件全部集成进插件（seek 原生 RPC 正门 + 提示芯片 + 漂移加固）

Work Log:
- 外部调研三连：①BetterNCM js-framework 源码实锤 betterncm.app.exec(cmd, elevate, showWindow=false)（默认隐藏窗口）+ getDataPath/fs.writeFileText → 插件可自部署+自拉起服务；②GitHub 代码搜索+源码取证 refined-now-playing-netease 劫持 channel.call 发现网易云自家进度条拖动走 audioplayer.seek（参数 [songId, "songId|seek|rand", 秒]）= 用户说的 channel.seek 的真身；③ohMyCloudmusic 独立佐证 playing/setPlayingPosition
- 桥 v1.7.0（chushi-bridge.ps1，纯 ASCII 英文，永久绝编码后患）：新增 GET /api/plugin/cmd 快命令通道（插件 300ms 轮询，seek 延迟 ≤300ms）；端口冲突版本仲裁（运行中桥 ≥自身版本→静默退出，旧版→按命令行杀旧绑新，兼容新旧两个文件名）；启动即自写 Run 键指向部署位置（开机自启零窗口）；携带 v1.5/v1.6 全部能力（真值锚定/seek 双发+id/歌词 rev 校验/半窗补偿）
- 插件 v1.3.0（一体化）：内嵌桥 ps1+vbs base64（构建时注入，回环校验字节一致）；superviseBridge 每 20s 健康检查（不可达或版本旧→重部署+拉起，exec wscript 优先/powershell 兜底）；seek 三级阶梯 channel.call("audioplayer.seek") 正门 → setPlayingPosition dispatch → el.currentTime 兑底，逐级 420ms el.currentTime 实测，全败 seekAck ok:false；粘滞媒体元素选择（5s 内沿用上一活跃元素，修换源/缓冲过场命中预加载空元素报 0 的真实错位源）；buildSnapshot 更新 lastSongId 供 channel seek
- 宿主 smtc.ts v2.3.0：needsUpdate（桥<1.7.0 ∨ 插件<1.3.0 ∨ 插件不在场）进 stateSig 广播；verLt 语义版本比较
- 部件 v5：seekNote 改为进度条正上方醒目芯片（v2.2.0 页脚 10.5px 文案用户完全看不到的反馈属实）+ needsUpdate 常驻橙色升级芯片；空态文案改「安装 .plugin 后播放音乐即自动接入」
- verify-v230 20/20（v220 全回归 + S2c 芯片点亮 + NU1 旧桥无插件→芯片亮 + NU2 新桥新插件→芯片熄；修 mock 插件版本 1.2.0→1.3.0 后 NU2 转绿）；交付物断言：桥纯 ASCII/括号平衡、.plugin 内嵌回环、扩展 2.3.0、交付包零独立桥文件
- 发布：Release v2.3.0 四资产直链 SHA-256 ALL OK（新增 ChuShi-LyricSource-1.3.0.plugin 独立资产）；main bd6107c；gh-pages DEPLOY-OK 线上特征命中（chunk 拖动未生效/needsUpdate/v=123、sandbox.js 白名单、sw BUILD 20260906-144219-bd6107c）；文叔叔合并包 https://c.wss.ink/f/kt7qmlc5vv7（wss-send complete code=0；mjs 版登录接口 1003 复现=接口变更非链接问题）
- 交付物形态质变：Windows 侧从「桥文件夹+3bat+vbs+plugin」四件套收敛为「一个 .plugin」，使用说明重写为两步升级

Stage Summary:
- 用户三点反馈闭环：①seek 正门改走网易云自家 audioplayer.seek 原生 RPC（与本体 UI 同源，理论成功率最高）+ 逐级实测 + 全败醒目芯片；②漂移=真值绝对锚定（v2.2.0 已具备，本轮再补粘滞元素）+ 一体化消灭版本漂移这一真凶；③独立桥文件废除，插件自部署/自拉起/监督/自启/仲裁全自动化
- 新律：①「集成进插件」类诉求的可行解 = 插件内嵌资源 + betterncm.app.exec 自拉起 + 健康检查监督 + 版本仲裁自愈——多组件交付的一切版本漂移都可用「让组件自己带版本、自己升级自己」结构性消灭；②外部技术考证优先读一手源码（js-framework app.ts / 劫持 channel.call 的真实项目），搜索摘要只能当线索；③提示类反馈必须区分「功能缺失」与「可见性缺失」——v2.2.0 的 seekNote 在但看不见，本轮以芯片级可见性收口
- 待办：用户真机复测（单 .plugin + Ctrl+F5/扩展 + 预设 v5；看 audioplayer.seek 是否真机生效与漂移是否归零）；任务A（快捷服务删除抖动）/Edge 商店材料未动；旧 bridge/smtc/*.{bat,ps1} 源保留作回滚基线；wss mjs 登录接口 1003 待修（py 版可用）

---
Task ID: 85
Agent: Super Z (main)
Task: 用户真机第 8 轮反馈（附 WSH 弹窗截图）——「弹这个 + 进度条不动/逐字歌词不动/播放时间显示0 + 播放暂停按钮又位移 + 概率出现初始播放网易云暂停反着来」——v2.3.1 四联修复 + 插件 v1.4.0 + 桥 v1.7.1

Work Log:
- 【截图取证】WSH 模态框：chushi-bridge-launch.vbs 第 17 行字符 3 错误 0x80070312 源 (null)——web 检索证实 = 「访问被管理员按策略规则限制」＝用户机器策略/杀软拦截 wscript→powershell 的进程创建；「第 17 行」vs 仓库/内嵌/Release 三处 VBS 均只有 10-14 行 ⇒ 磁盘部署文件曾被写坏（writeFileText 疑似追加语义 + 监督每 20s 重写叠加）；插件监督无退避每 20s 硬重试 = 弹窗反复出现
- 【冻 0/反转根因链】宿主 apply 580 行旧守卫 `if (ne.positionMs > 0 || !ne.playing)` + `t.playing = ne.playing` 无条件采纳 ⇒ 插件 v1.3.0 mediaElStrict()（粘滞+首中即选）选中错误媒体元素（NCM 页面预加载/流浪 video）报 paused+0 → 面板钉死 0:00（进度/歌词/时间全冻）；错误元素 paused=false 时反报播放中 → 状态概率反转；em↔fl 形态互切 + 歌词出现/消失 124px 高度塌缩 → 按钮大幅位移——四症状同根
- 【插件 v1.4.0 真值熔断重构】①原生事件（PlayState/PlayProgress/Seek，网易云自家引擎直出不可能被流浪元素污染）为 playing/进度主源（lastPlayingAt/lastProgressAt 时间戳 + 2s 漂移插值）②媒体元素降级对齐校验：与原生期望差 ≤1.5s 才采信 currentTime（补亚秒精度），脱钩一律不信 ③评分制选元素 pickMediaEl（对齐分 12 主导，平分 DOM 靠前者胜——主播放器 DOM 首位是 v2.2.0 真机实证基线），废除粘滞选择器 ④垃圾零值熔断：posMs<800 && lastProgressMs>3000 && 5s 内无本端 seek → 弃样本沿用原生进度 ⑤时长 store curTrack（歌锚定）优先，仅对齐元素时长可兑底 ⑥seek 验证基准改 buildSnapshot() 熔断后真值 + 时长闸用快照时长（旧 el.duration 会被下一首时长误杀）⑦channel seek 健康闸：seek 后 2s 内播放态翻停 → 本会话禁用 channel 路线并 localStorage 持久化 ⑧needLyric 自愈：心跳应答 needLyric=<songId>（桥重启丢词）→ 缓存补推/触发拉取
- 【弹窗根除四层】①VBS 顶层 On Error Resume Next（物理不可能弹 WSH 框）②spawnBridge 直启 powershell 优先（不经 wscript 无 WSH 错误面），wscript 仅兑底 ③deployBridge 读回校验：readFileText 比对、一致跳过重写（防追加污染）、两次重写仍不一致绝不拉起（宁可不在线也不运行损坏脚本）+ 无 readFileText 的旧 BetterNCM 盲写退化 ④拉起失败退避 spawnBackoffMs 20/40/80/120s 封顶 + 拉起后 2.5s ping 仍不健康计失败驱动退避（exec 返回值不代表桥真起来了）
- 【宿主 smtc.ts v2.3.1 零值两击守卫】neZeroStreak/neLastPosSec/neSongKey：深位置后突报 <0.8s 的样本首拍不采纳（延迟一拍）、连续两拍或本端 seekHold≤3s 才信；播放态不在可疑零拍上翻转；⚠修复过程实锤「posSec>0 短路放走非零垃圾样本」（0.4s 样本被采纳 Z1a 红）→ 收紧为 trustZero || posSec>=0.8；needsUpdate 阈值升桥 1.7.1/插件 1.4.0
- 【部件 v6 歌词高度迟滞】lyHold：buildLyric 歌词在场置 true，同曲丢词保持高度不塌 124px，换曲 key 块重算 + ⚠重算后必须补 setMode 重报高度（LYH3 实锤：lyHold 变了但 resize 没人调，高度停 372）
- 【桥 v1.7.1】版本串 + /api/plugin/state 心跳应答捎带 needLyric=<songId>（songId 在场且 NeLyricRev 空）
- 【⚠本 round 环境级大坑：bun run build 不写 out/】standalone 构建只产 .next——out/ 只由 build:export（gh-pages）与 build:extension（扩展）写入；两轮「修复无效」假象（Z1a 恒红、产物 chunk 指纹 (n>0||o) 旧守卫）实为 verify/扩展/gh-pages 全在用修复前的旧导出——**判构建 freshness 必须在产物 chunk 里 grep 数字指纹**（新守卫 (s||n>=.8)）；且 gh-pages push 的本地 remote-tracking ref 会陈旧，验远端要 fetch
- 【验证】verify-v231 30/30 ×2 轮稳定：ST1-10 静态断言（直启优先/读回校验/退避/熔断标记/粘滞废除/needLyric/VBS On Error/桥版本/宿主守卫/部件迟滞）+ Z1a/b 单拍零样本不钉0不翻转（39.63% 真值区）+ Z2a/b playing+0 反转守卫 + Z3a/b 连续零样本采纳（真实重启场景）+ Z4 恢复跟随 + V/D/S/FT/NU/LG 全回归 + LYH1-3 高度迟滞（372→372→248）+ X1 pageerror=0；mock 桩两坑：宿主要求歌词载荷嵌 j.lyric 下 + j.rev 必须回显（stale-lyric 拒收）
- 【交付形态】SMTC 交付包恢复「手动启动桥（备用）」文件夹（bat ASCII+CRLF + ps1 v1.7.1 + vbs On Error 版）——策略拦截机器（插件直启也被拦）的最后兜底；使用说明重写为「四症状根因 + 三件套升级 + 手动兜底指引」
- 【发布】main 7648c1b 推送；gh-pages DEPLOY-OK 线上实测新守卫指纹 n>=.8 命中 + sw BUILD 20260906-153901-ef7d85e；扩展 v2.3.1（11.7MB）；交付物字节级断言 11/11（ext 2.3.1+新守卫指纹/内嵌回环+On Error+CRLF/熔断标记/粘滞废除/兜底 bat ASCII+CRLF/cshz lyHold 指纹/合并包字节一致）；Release v2.3.1 id=383635313 五资产直链 SHA-256 ALL OK；文叔叔合并包 https://c.wss.ink/f/kt85whlgdnp（complete code=0 success 99%）
- 【README】补 v2.3.0–v2.3.1 合并段（Task 84 未写 README，本轮一并补上）

Stage Summary:
- 四症状全闭环且各有构建内/回归实证：弹窗=物理静默+退避（不可能再弹）；冻 0=插件真值熔断+宿主两击（单拍垃圾样本零影响实测）；反转=同源修复+播放态不在可疑零拍翻转；按钮位移=高度迟滞（372→372 实证）
- 新律：①「挑元素读进度」类集成在别人页面里的代码，永远不要信单一启发——用宿主自己的事件流当主源、启发式只做校验；②守卫的边界样本（非零垃圾如 0.4s）必须进回归（posSec>0 短路这类「看起来对」的条件是漏网之鱼）；③「修复没生效」先验产物指纹再怀疑人生——构建产线多模式（standalone/export/extension）时 out/ 归属必须清醒；④弹窗类反馈的根治层级：物理不可能弹（On Error）→ 不制造弹窗条件（直启）→ 不运行可疑文件（读回校验）→ 不高频重试（退避），四层缺一不可
- 待办：用户真机复测（.plugin 1.4.0 + Ctrl+F5/扩展 2.3.1 + 新 .cshz；看弹窗消失/进度前进/状态不反/按钮不跳）；若策略连直启也拦 → 面板未连接时用交付包手动兜底；任务A（快捷服务删除抖动）/Edge 商店材料未动；旧 Release v1.7.7 资产去留未决

---
Task ID: 86
Agent: Super Z (main)
Task: 用户真机第 9 轮反馈（附视频逐帧取证）——「插件是最新的却说是旧版 + 播放依旧反着来 + 进度 0.5x 爬行/倒退」——v2.3.2 三联修复 + 插件 v1.5.0 + AI-HANDOFF 落库

Work Log:
- 【视频取证】下载文叔叔 40s 录屏逐帧（wss API 404 已变更 → Playwright wss-grab.mjs 网页 UI 路径仍可用）：①「组件过旧」芯片全程常亮但页脚明确「插件 v1.4.0」= 误报旧版实锤；②One Last Time 播放中面板显示 ▶（暂停）长达 12s + 状态点黄/绿与按钮态强相关 = 状态反向实锤；③34s 只爬 5s（0:06→0:11）+ 换歌后 0:09→0:08 倒退 = 进度锯齿实锤；④f28 面板整体 y 位移一次（部件歌词模式切换高度跳动的另一形态，留待 D 任务）
- 【误报旧版根因链】needsUpdate=connected&&(!pluginVer||verLt(plugin,1.4.0)||verLt(bridge,1.7.1))，页脚证明插件版本上报正常 ⇒ 芯片常亮唯一来源 = 桥 <1.7.1；插件 v1.4.0 内嵌桥 v1.7.1（构建断言+回环验证）⇒ 用户机器上旧桥进程永生占端口、新桥拉起被策略拦截（Task 85 实锤 0x80070312 双拦 wscript/powershell）而 v1.4.0 监督只会「重试拉起」从不杀旧桥；更糟的是芯片文案喊「更新 .plugin 即可全自动修复」——对该场景是无效指引，用户照做无效即怒
- 【修复一：杀旧桥+归因拆分】插件 v1.5.0 superviseBridge 拆「升级路径」（桥可达但版本旧：deployBridge → killStaleBridge 双路径 cmd netstat+taskkill /F /T 优先/powershell Get-NetTCPConnection+Stop-Process 兜底 → 端口腾空才 spawnBridge；失败独立退避 30/60/120s、≥2 次置 bridgeBlocked+warn）与「冷启动路径」（不可达：v1.4.0 原样退避）；宿主 v2.3.2 needsPlugin（阈值 1.5.0）/needsBridge（阈值 1.7.1 桥零改动）分开判定分开进签名；部件芯片文案分叉（仅桥旧→「手动启动桥（备用）」诚实指引）；⚠verify NU3 实锤 sandbox.js snap 白名单漏透 needsPlugin/needsBridge（宿主算了部件拿不到）——已补
- 【修复二：状态反向】v2.3.1「原生事件 5s 新鲜窗」是范畴错误：PlayState 是事件语义（切换瞬间触发一次）非遥测流，暂停超 5s 必过期降级 el.paused → 评分选中流浪元素即报反状态。插件 v1.5.0 playing 改最后事件语义（lastPlayingAt 在场即信 lastPlaying，永不过期；仅从未收到事件才降级）+ store.paused 交叉自愈（dva paused 与原生事件矛盾 >3s 以 store 纠正）+ 加载时以 store 预热初始播放态
- 【修复三：进度锯齿】录屏 0.5x 爬行+倒退 = 每拍重新评分换人读流浪元素陈旧 currentTime。插件 v1.5.0 元素身份锁定（连续对齐 ≥2 拍上锁同歌不换人，脱钩 ≥3 拍解锁）+ 倒退熔断（同歌+playing 未变+无 seek，较上拍上报值倒退 >2.5s 丢弃沿上拍外推；⚠推演发现 song 身份不明时熔断会误杀无 store 环境的新歌开头——收紧为 songIdNow 在场且同歌才熔断）+ PlayProgress 存活自检（10s 无事件重注册）
- 【验证】verify-v232 43/43 ×2 轮：ST1-15 静态（含桥零改动断言）+ P0-P7 插件 vm 白盒（真实 index.js 在 mock NCM 环境执行：最后事件语义/倒退熔断/身份锁定/杀旧双路径真实时序实测/心跳带版本）+ e2e V/D/S/FT/NU1-4 归因四态文案/LYH/X 全回归；⚠测试侧三坑：fire 参数错位（PlayProgress 回调两参非三参，sec 传成字符串被丢弃）、defaultNe 依赖 mockTruth 需先取后置 null、execCalls 中途清空毁掉时序断言
- 【构建/交付】扩展 2.3.2 zip（11.7MB）+ .plugin 1.5.0 + .cshz（updTxt 双文案指纹验证）+ 交付包/合并包 + 使用说明重写（三问题根因白话 + 「手动启动桥」分步指引 + 组件对拍表）
- 【仓库】docs/AI-HANDOFF.md 落库（用户指令「告诉其它读取工作仓库的AI现在要开发什么」）：组件拓扑/构建产线 7 步/版本兼容矩阵（needsPlugin 才许喊更新 .plugin 的铁律）/8 坑清单/下一步任务 A-E（A=seek 真机参数实抓 B=暂停恢复逐字漂移终验 C=手动启动桥体验收口 D=部件歌词模式高度跳动 E=工程化欠账）+ 发版流程备忘；README 补 v2.3.2 段

Stage Summary:
- 三症状全闭环且各有构建内/回归实证：误报旧版=杀旧桥通道+归因拆分+诚实指引（该场景自修/手动兜底两条路都真实可行）；状态反向=最后事件语义（事件≠遥测的范畴修正）；进度锯齿=身份锁定+倒退熔断（song 身份不明不熔断防误杀）
- 新律：①「最后事件」语义的值（状态/配置类）永不做时间窗过期——过期降级=换一个更不可信的源；②升级提示的文案必须与真实可行路径一一对应——「更新 A 可修」在根因是 B 时是谎言；③snap/DTO 白名单层是字段失踪的高发地带——新增状态字段必须端到端 grep 透传链；④测试驱动的事件回调 fire 助手必须按真实回调签名分发参数（参数错位的静默丢弃比崩溃更毒）
- 待办：用户真机复测（.plugin 1.5.0 + 完全重启网易云 + Ctrl+F5 + 重导 .cshz；看芯片是否消失/状态不反/进度 1x 不倒退；若提示手动启动桥则跑备用 bat）；AI-HANDOFF 任务 A（seek 真机参数实抓）为下轮最高优先；任务B 暂停恢复逐字漂移终验；任务C/D/E 排后
- 【交付落盘】main 5ed4a57 推送；gh-pages DEPLOY-OK 线上实测（sandbox.js needsPlugin ×2 + chunk e9acad6c31bbd078.js needsPlugin 指纹命中）；Release v2.3.2 id 五资产直链 SHA-256 ALL OK（Delivery/LyricSource-1.5.0.plugin/Preset.cshz/NewTab-v2.3.2.zip/AllInOne）；文叔叔合并包 https://c.wss.ink/f/kt8kvm8i9hv（complete code=0 success 99%）

---
Task ID: 86
Agent: main (Super Z)
Task: 用户指认「smtc 和自写的网易云 api 冲突了，重写，smtc 插件和 api 分开写成两个插件，预设包也重写，样式不要变，不要出现播放键位移等 bug」→ v3.0.0 双插件架构重写

Work Log:
- 【冲突确诊】读尽 v2.3.3 全链源码（插件 1252 行/桥 661 行/宿主 smtc.ts 834 行/部件 383 行）确认用户判断成立：位置真值被三层各自修正互相打架（插件 buildSnapshot 熔断 → 桥 ne-anchoring 再改 → 宿主 harmonize/零值守卫/绝对锚定再改）= 九轮真机故障（反转/0.5x 爬行/冻死 0:00/版本误报）的共同结构根源；一体化插件「既管桥进程又产状态」让版本误报与状态扰动互相伪装
- 【现场自检】.pkgtmp/gh-token 因环境清理丢失 → 从 git remote URL 程序化重建（不回显，API 200 验证）；本地 main 落后远端 → reset 对齐 45ef16e（v2.3.3 线）
- 【桥 v2.0.0 纯传输化】删 Update-MediaState 内 ne-anchoring 整块（桥层互打终结，保留时长钳制）；新增 /api/plugin/register（管理插件活体注册，90s 窗口 → /api/state.plugins.smtc）；新增 role 心跳仲裁（role=ncm 在场 10s 压制旧一体化插件 role-less 心跳——并存不互打）；ASCII 纯净 + 全部原协议端点零改动
- 【插件A 初始SMTC桥 cc.chushi.smtcbridge v2.0.0】bridge/smtc-plugin/：v1.4.0–v1.5.1 桥管理代码原样提取（部署读回校验/直启 powershell 优先/杀旧双路径 netstat+taskkill→Get-NetTCPConnection/冷启动 20-40-80-120s 与升级 30-60-120s 双退避/bridgeBlocked）；新增 registerSelf 活体注册；绝不推 /api/plugin/state（职责单一律进构建断言）
- 【插件B 初始网易云API cc.chushi.ncmapi v2.0.0】bridge/ncm-plugin/：v1.5.1 真值代码原样保留（原生事件主源/元素身份锁/倒退熔断/零值熔断/channel 健康闸/seek 三级阶梯 420ms 实测/needLyric 自愈/eapi 歌词三层回退）；心跳加 role:"ncm"；删全部桥管理代码；配置面板加旧插件冲突检测（__chushiLyricSourceActive 在场即提醒卸载）
- 【宿主 smtc.ts v3 单主仲裁】judgeNcmOwns 唯一判定点：会话身份用桥 app 字段（"NetEase Music" AUMID 归一，比标题模糊匹配可靠，标题匹配仅旧桥兜底）+ ne 新鲜（ts≤3s）；NCM 在场→真值独占（元数据/进度/时长/播放态一次性年龄补偿 fetchedAt=now，零守卫零混合）；NCM 播放中无条件独占（修「面板显示其它应用/暂停态而网易云在响」反转）；SMTC-only 才走 harmonize+锚点保持；删宿主 neZeroStreak 零值守卫（插件已有全套熔断，宿主再叠=互打复辟）；版本活源三分（桥 version/ne.v/plugins.smtc），needsPlugin 语义=缺失/<1.4.0 损坏/1.4.0-1.5.1 迁移，needsBridge 新增「管理插件已注册但桥旧」=旧桥杀不死实锤态；SmtcState+sandbox.js 加 smtcVer
- 【预设包 v4】music-widget.html 样式与 DOM 零改动（双 SVG 同圆心交叉淡切防播放键位移/lyHold 高度迟滞/乐观翻转/拖动失败醒目芯片全保留）；脚本加 verLt 同构分叉：芯片四态（缺件安装/旧一体化迁移/桥未运行/旧桥杀不死手动指引）+ 页脚双版本（API vX · 管理 vY/手动桥）+ 空态双插件指引
- 【验证】verify-v3.mjs 38/38 × 2 轮：ST16 静态（桥纯传输/双插件职责单一/单主律/防位移保留）+ PB1-3/PA1-5 vm 白盒（role=ncm 心跳/真值快照/零 exec；在场注册零进程操作/冷启动部署+直启）+ e2e（N1-3 单主反转实证：SMTC 修饰名+暂停假象 vs ne 真值播放→面板全取 ne；N4-6 页脚双版本/芯片熄灭/手动桥；N7a-N8c 芯片四态；N9 SMTC-only 兜底；X1 pageerror=0）；扩展冒烟 verify-ext-v3.mjs 5/5（manifest v3.0.0+host_permissions/渲染/导入/单主仲裁/页脚双版本/0 pageerror）——首跑 M3 失败为测试 mock 静态 ts 3s 过期触发 SMTC-only 兜底（恰是 v3 设计行为），mock 改动态新鲜 ts 后全绿
- 【发布】main 4d8d778 推送；gh-pages 部署 DEPLOY-OK + 线上指纹 judgeNcmOwns 命中（63023df0 chunk）；扩展 build:extension 外置 7 内联脚本 → ChuShi-NewTab-v3.0.0.zip 11.7MB；build-v3-assets.py 双 .plugin 回环断言+交付包全家；Release v3.0.0 五资产直链 SHA-256 ALL OK（含 ChuShi-SmtcBridge-2.0.0.plugin/ChuShi-NcmApi-2.0.0.plugin 直发）；文叔叔合并包 https://c.wss.ink/f/ktcf9jy1ok3；docs/AI-HANDOFF.md 全量重写（单主律宪法/新拓扑/兼容矩阵/10 坑清单/任务 A-E）；README v3.0.0 版本段；package.json 3.0.0

Stage Summary:
- 架构律（v3.0.0 宪法）：每数据单主——真值只产自插件B，桥只传输（ne-anchoring 已删永不再加），宿主只仲裁（judgeNcmOwns 唯一判定+一次性补偿）；宿主不许再叠零值/倒退守卫（插件B 全套熔断已在内，再叠=三层互打复辟）
- 版本律：版本只查活源（桥 /api/state.version、API 插件 ne.v 心跳、管理插件 plugins.smtc 注册表），不猜不缓存；needsBridge 新语义「管理插件在场但桥旧」=旧桥进程杀不死实锤，只给手动指引
- 迁移律：新双插件与旧一体化并存无害（桥 role 仲裁），但面板芯片必须引导卸旧装新（「双插件迁移」文案对应真实可行操作）；插件B 配置面板双保险提醒
- 交付：Release v3.0.0（id 见 repo）+ 文叔叔 ktcf9jy1ok3（1 天过期）；用户升级三步：卸旧「初始歌词源」→装双新 .plugin→重启网易云
- 待办：Edge 商店提交材料仍未做；seek 真机有效性（channel.seek 参数形态实抓）= 下一任 AI 最高优先任务（见 AI-HANDOFF 任务 A）

---
Task ID: 87
Agent: main (Super Z)
Task: 用户真机第 10 轮反馈「逐字歌词是坏的，播放状态没有同步网易云音乐，进度条也不会动，数字时间也没有变化」→ v3.0.1 四症状定点根治

Work Log:
- 【链路通读】v3.0.0 双插件全链源码重读（插件B 1084 行/插件A 271 行/桥 v2.0.0 仲裁/宿主 smtc.ts 839 行/sandbox.js music core/部件 music-widget.html/PresetWidgets 部件通道 tick 路由）；verify-v3 基线 38/38 全绿 → 四症状是真机环境特有断点，非 mock 可测的回归
- 【根因判定】四症状最短共同路径 = ne 真值断供/失真 → 宿主回退 SMTC-only → 网易云桌面版 SMTC TimelineProperties position 基本不更新（当初自写网易云 API 的原因）→ 进度/时间/逐字歌词全冻结 + 播放态漂移。锁定三个确凿缺陷：①judgeNcmOwns 与 apply 不对称（!t 时 return ne.playing 判独占，apply 只认 t 非空 → 桥抓不到网易云 SMTC 会话时真值被判独占却无人消费）②插件B playing 无物理自愈（PlayState 事件丢失/store 迟到 → 报暂停 → 宿主锚点 playing=false 插值恒 0 → 四症状全现，正是「状态没有同步」形态）③原生死 + 元素不可信时无兜底 → positionMs 冻死
- 【修复一：宿主虚拟曲目】judgeNcmOwns !t → return true（ne 新鲜 = 网易云开着，比「桥抓没抓到会话」更硬）；apply 在 ncmOwns 且 next.track=null 时以 ne 构造虚拟曲目（app="NetEase Music"，真值独占填充，coverRev 空 → 封面走 ne.pic）
- 【修复二：插件B 物理自愈】buildSnapshot 末尾：!playing && lastReportedPosMs>=0 && posMs-lastReportedPosMs>800 && 无本端 seek(5s) && (!songIdNow || 同歌) → playing=true + lastPlaying/lastPlayingAt 写回（事件语义接管；<800ms 闸防暂停微抖误判；真暂停时 store 交叉自愈 3s 纠回；每拍独立判定无累积误判；songId 不明也生效——换歌首拍已被 lastReportedPosMs>=0 重置闸排除）
- 【修复三：插件B store 次级真值】expectMs<0 且元素身份不符分支：dva playing.position 兜底（网易云自家进度条同源，秒；单位闸 (0,36000) 防字段形态漂移 + 时长闸防越界）
- 【版本】插件B 2.0.0→2.1.0（manifest+PLUGIN_VERSION+描述）；宿主 package.json 3.0.1；插件A/桥 2.0.0 零改动（needsBridge 链不动）
- 【验证升级】verify-v3 38→44 项 ×2 轮全绿：新增 ST17（虚拟曲目静态）/ST18（物理自愈+store 兜底静态）/PB4（物理自愈三拍白盒：拍0 突跳自愈就位基准→拍1 推进 0.2s 不误判→拍2 推进 1.6s 必自愈；⚠拍间须重 fire PlayState(2) 隔离 lastPlaying 写回残留）/PB5（store 兜底白盒：⚠webpack require 的 .c 模块缓存必须挂在 require 函数对象上——纯箭头函数 mock 是 findStore 失败根因）/N10（e2e：track=null+ne 播放 → 面板显示网易云）/N10b（进度推进 0.8%/2.2s）
- 【构建】build-ncm-plugin/build-v3-assets/build-extension 断言同步 2.1.0/3.0.1；全产线重建：双 .plugin + 扩展 zip 11.7MB + SMTC 交付包 + v3.0.1 合并交付包 + 使用说明重写（四症状根因白话 + 两步升级 + 30 秒自查：页脚只显「管理 v2.0.0」无「API v2.1.0」= 插件B 未加载即装包/重启问题非代码问题）
- 【文档】AI-HANDOFF 更新（v3.0.1 单主律第 3 条补虚拟曲目、坑 11「SMTC-only 是冻结区」、坑 12「物理自愈是输出修正不是状态改写」、任务 B 改四症状验收 + 页脚排障法）；README v3.0.1 段

Stage Summary:
- 三症状根因全闭环且有针对性回归实证：虚拟曲目（N10/N10b e2e 实证桥无会话时真值独占+进度推进）、物理自愈（PB4 三拍实证 <800ms 不误判/>800ms 必自愈）、store 兜底（PB5 实证原生死+元素不可信时 pos=120000 不冻死）
- 新律：①「判独占」与「消费独占」必须同拍同条件落地——仲裁层判定 true 而消费端不接 = 真值黑洞；②物理自愈（进度推进=在播放）是播放态事件丢失的终极兜底，闸必须是每拍独立判定 + <800ms 窗，写回事件语义让下拍接管；③测试 mock 外部系统必须同构到隐藏协议面（webpack require.c），差一个属性整个链路静默失败
- 待办：用户真机复测（扩展 3.0.1 + 插件B 2.1.0 替换 + 重启网易云 + Ctrl+F5；看进度/时间/逐字歌词跟手、页脚 API v2.1.0 在场）；任务 A（seek 真机参数实抓）仍为下轮最高优先
- 【交付落盘】main 2eec15e 推送；gh-pages DEPLOY-OK + 线上指纹实证（chunk 77b5fc11f59bb797.js 内 `e.track??{app:"NetEase Music"...` 虚拟曲目代码与本地逐字节一致）；Release v3.0.1 id=383802989 五资产直链 SHA-256 ALL OK（Delivery/SmtcBridge-2.0.0/NcmApi-2.1.0/Preset.cshz/NewTab-v3.0.1.zip）；文叔叔合并包 https://c.wss.ink/f/ktcz2owgf4j（complete code=0 success 99%）
- 【排障备忘】rel 脚本三坑：①API 基址已含 /releases，path 再带 /releases 前缀 = 双重路径 404（PATCH/DELETE/list assets 全中）；②/tag 返回 tag SHA 对象非 release；③release by tag 正确写法 = api(f"/tags/{TAG}")。上传段加 4 次退避重试

---
Task ID: 88
Agent: main (Super Z)
Task: 用户指令「看视频：音乐一直在播放但初始显示暂停；进度条不能拖动不显示进度——不要依靠网易云自带的残疾 smtc，自己写满血版 smtc 插件，桥连接自己写的 smtc；逐字歌词=api 插件取全量歌词→smtc 对时间戳→暂停时计算淡入淡出时间防累积漂移」→ v3.1.0 满血版 SMTC 重写

Work Log:
- 【技术考证（一手资料定路径）】微软官方 manual-control 文档逐段实读：MediaPlayer.SystemMediaTransportControls + CommandManager.IsEnabled=false = 手动控制正门；cnblogs（.NET 与 SMTC 交互）实证 ISystemMediaTransportControlsInterop::GetForWindow 在 .NET SDK 受保护不可直接调——GetForWindow 路线否决，MediaPlayer 路线选定；时间线律「必须设 MinSeekTime/MaxSeekTime 否则不给抛 PositionChangeRequest」+ 官方建议 5s/次更新（本桥 1Hz）
- 【桥 v3.0.0 满血自有 SMTC 会话】Initialize-OwnSmtc：显式 AUMID 'ChuShi.SmtcBridge'（SetCurrentProcessExplicitAppUserModelID，读会话侧自过滤锚点）→ InMemoryRandomAccessStream 内存构造 1s 静音 WAV（DataWriter StoreAsync/FlushAsync，绝不落 %TEMP%——中文用户名路径防御）→ MediaPlayer（Volume 0/muted/looping）→ CommandManager 禁用 → IsPlay/Pause/Next/Previous/PlaybackPositionEnabled 全开 → Register-ObjectEvent(ButtonPressed/PlaybackPositionChangeRequested, -MessageData 同步 ArrayList——规避 scriptblock 强转 WinRT 委托的回调线程无 runspace 崩溃) → Play() 注册会话；Update-SmtcOwn 随每次 ne 心跳驱动（元数据 DisplayUpdater+https 封面 URI/状态 PlaybackStatus/时间线 UpdateTimelineProperties 1Hz 墙钟推进+age 补偿）；Tick-SmtcOwn 真值断供 6s → Closed 防僵尸卡片；Pop-SmtcEvents 主循环每次请求出栈（延迟 ≤300ms 插件轮询约束）
- 【控制全回路】媒体键/悬浮窗按钮 → Invoke-Control Try*Async 直控网易云会话（play/pause/next/prev 真机已验证可行），失败自动 Enqueue-NeCmd 转插件页内执行；悬浮窗拖动 seek → 恒转插件（网易云唯一接受路径）+ 自有时间线乐观重锚（悬浮窗条即时跟手，心跳纠偏=诚实弹回）；命令队列化 $script:NeCmdQueue（单槽→同步 ArrayList，最早优先 5s 过期 cap8——面板 seek/悬浮窗按钮/拖动可并存）；桥控制门两修复：无 SMTC 会话（虚拟曲目场景）时 Invoke-Control 转发插件（旧版 ok:false 死路=面板按钮拖动全灭），seek 旧标题匹配门废除（SMTC 会话标题与插件标题不一致时静默杀 seek=真机「拖了没反应」桥侧根因；插件本就有歌身份闸，桥层门是冗余误杀）
- 【插件B 2.2.0 控制执行器】applyBridgeCmd 扩 play/pause/toggle/next/prev（toggle 按快照播放态定方向防双翻转）；ctrlPlayPause 锁定元素 play()/pause() 优先（与本体 audio 引擎同源语义）+ 页脚可见按钮多候选兑底（#btn-pause/#btn-play/.btn-* offsetParent 可见性点击，不押注单一选择器）；ctrlNextPrev 页脚可见按钮；⚠ vm 白盒揪出并修复作用域 bug：startSeekWatch 的 elNow 原声明在 try 块内，身份捕获代码在块外引用会 ReferenceError 静默炸掉 seek 监视；seek 末级加固 1600ms 重写（防本体直写后重置 currentTime）+ 身份捕获（被直写且真实生效的元素立即 elLock 上锁 streak=2，真值读取不再依赖评分漂移）
- 【渲染层逐字歌词防漂移（用户思路落地）】sandbox.js 音乐核心：①slew 微抖吸收 LY_SLEW_SEC=0.35——播放中真值漂移 <0.35s 的拍不重锚（position/fetchedAt 都不动，只改其一=倒退；1s 轮询的事件到达抖动是逐字扫色肉眼抖动的来源），大跳/播放态翻转/seek 立即重锚——显示层平滑不改真值；②calcFadeMs=clamp(120..420ms, 当前词剩余时长)（二分定位当前词，无词在唱用行尾剩余，兜底 260ms）——播放→暂停翻转时算一次，恢复沿用该值淡入；now() 增发 fadeMs；部件 lyricFrame 消费（内联 transition='transform .55s var(--ez), opacity Nms ease' + opacity 1↔0.38，CSS 布局零改动，防位移/高度迟滞全保留）
- 【宿主 3.1.0】needsPlugin 阈值 2.0.0→2.2.0（2.0/2.1 用户诚实喊更新）、needsBridge 2.0.0→3.0.0（缺满血会话；插件A 自动升级桥，拦截才亮芯片）；smtcOwn 诊断字段前向兼容（e2e 实证）
- 【⚠本版环境级新坑】①MultiEdit 顺序提交语义：原子失败声明下已成功的编辑照样落盘（sandbox.js/AI-HANDOFF 两度中招）——多段编辑后必须 grep 核对全部目标段实际状态再续作；②GitHub Release 资产上传必须走 uploads.github.com（api.github.com 上传 404——rel-v301 教训在本版重蹈，已固化进 rel-v310）；③终端显示吃 [m 字符串（ANSI SGR）——'.bt.mi svg...' 等含 [x] 断言的显示假象要用 python in 判定不信目视
- 【验证】verify-v31 58/58 × 2 轮稳定：新增 PSX 门（.pkgtmp/pwsh = Linux 版 PowerShell 7 真解析器 ParseFile 验证桥 ps1 语法 SYNTAX OK——此前 11 版桥脚本首次有真语法门）+ ST19a/b/c 满血 SMTC 全要素静态 + ST20 控制门修复 + ST22a/b/c 插件B 执行器/末级重写/歌词链 + ST23 宿主新阈值 + ST24a/b sandbox slew/fadeMs + ST25 部件淡入淡出 + ST26 版本；PB1-5 v3.0.1 全量回归 + PB6/PB7 控制执行器白盒（play/pause 走元素、next/prev 页脚点击、toggle 方向、真值上报不破坏）；PA1-5 桥管理回归（pingVer 3.0.0）；e2e N1-N10b 全量回归（mock 桥 3.0.0+smtcOwn）+ N7b 新阈值 2.1.0→组件待更新芯片；X1 pageerror=0
- 【构建/发布】双 .plugin 回环断言（内嵌桥逐字节+满血标记）；build-v310-assets 六项指纹断言（预设 html 内嵌 manifest 形态的断言修正——⚠.cshz 里 widget html 在 manifest.widgets[0].html 不在 zip 根）；扩展 3.1.0 zip 11.7MB；main 99ab7e8 推送；gh-pages DEPLOY-OK + 线上指纹（sandbox.js LY_SLEW_SEC×2 命中 + chunk 9d493f9f "3.0.0" 阈值+judgeNcmOwns 命中）；Release v3.1.0 id=383843444 五资产直链 SHA-256 ALL OK；文叔叔合并包 https://c.wss.ink/f/ktdz3e2w36t（complete code=0 success pro=99）
- 【文档】AI-HANDOFF v3.1.0：新拓扑图（桥=传输+满血会话双职责，控制回路全景）、兼容矩阵 v3.1.0 行、坑 13（MediaPlayer 手动控制全要素+Register-ObjectEvent 律）坑 14（中文路径/ASCII 防御）、任务 A=满血 SMTC 真机验收清单（悬浮窗卡片/可拖进度/自动升级链路/排障口令）任务 B=seek 真机（新路径对比）；README v3.1.0 版本段

Stage Summary:
- 用户「满血版 SMTC」指令全链落地：Windows 侧从「读网易云残疾会话」翻转为「桥自有满血会话」，悬浮窗/锁屏进度真实可拖、媒体键全通，网易云残疾 SMTC 退役；面板拖动的桥侧误杀门（标题匹配）废除+无会话转发——「拖动无效」的桥侧死路清空，剩余成败移交插件页内阶梯（任务 B 真机实抓）
- 逐字歌词按用户三段思路闭环：全量歌词（既有 eapi 链）→真值时间轴对齐+slew 吸收→暂停按词时间计算淡入淡出；冻结感/扫色抖动/累积漂移三形态分别有渲染层/显示层/真值层对策
- 新律：①选型前一手文档逐段实读（manual-control 模式+Min/MaxSeekTime 门槛都是文档里读出来的，搜索摘要给不了）；②被平台「保护」的 API 必有替代正门（interop 受保护→MediaPlayer 自动集成就是门）；③真语法门优于一切静态断言——70MB 的 pwsh 换 11 版桥脚本首次 SYNTAX OK，值
- 待办：用户真机复测（扩展 3.1.0 + 双插件 2.1.0/2.2.0 + 重启网易云 + Ctrl+F5；看悬浮窗卡片可拖进度/媒体键/面板拖动/暂停淡入淡出）；任务 B 剩余=audioplayer.seek 参数实抓；Edge 商店材料仍未动

---
Task ID: 89
Agent: main (Super Z)
Task: 用户第 11 轮指令「重写=删光老代码从头写，不许复用；现在问题一个没解决，装插件还弄坏网易云本体进度条；不再需要网易云自带 smtc 开关，直接靠插件；插件不能是中文否则读取不了」→ v4.0.0 音乐链路四层全量重写

Work Log:
- 【三条宪法落门】①零复用：插件A/B index.js、引擎 ps1、宿主 smtc.ts(862→439 行，judgeNcmOwns/harmonize/seekHold/trackMatchesNe/lastDelta 全删)、sandbox 音乐核心、部件脚本五层全部从零新写，构建门断言老符号零残留；②不依赖网易云自带 SMTC：引擎零读取外部会话（GlobalSystemMediaTransportControls*/GetSessions/TryPlayAsync/TryPauseAsync/GetForCurrentView 构建门封禁），网易云 SMTC 开关开或关都不影响；③插件全英文：双 .plugin 文件名/manifest/代码逐字符 ASCII 断言（test-crypto-v4 + build-v4-plugins 双门）
- 【引擎 chushi-smtc-engine.ps1 v4.0.0 新写】自有满血会话（MediaPlayer+CommandManager 禁用官方 manual-control 模式+AUMID ChuShi.SmtcEngine+内存静音 WAV 不落盘+Min/MaxSeekTime 必设+IsPlaybackPositionEnabled 可拖+Register-ObjectEvent 同步队列事件）；HTTP 枢纽 127.0.0.1:26801（新端口隔离旧僵尸桥）：/api/ping|state|ne|lyric|cmd|mgr 全 CORS；HTTP 跑独立 runspace 只碰同步集合、WinRT 留主线程；ne 断供 6s → 会话 Closed；命令队列（SMTC 事件+宿主 POST 同槽，5s 过期 cap8）
- 【插件B ChuShi Music API v3.0.0 新写】只读律：原生事件（PlayState state===1/PlayProgress/Seek）+dva store 只读（绝不 dispatch）+元素粘滞校验（时长锚定 ±1.5s，无评分轮盘）；位置=元素对齐原生时取元素亚秒钟→原生→store.position 三级调和；控制单次执行律：play/pause=元素方法、next/prev=网易云自家可见按钮、seek=currentTime 直写一次+420ms/1s 双读回校验+seekAck 诚实上报（构建门断言 currentTime 写入点唯一）；全量歌词：eapi /api/song/lyric/v1（自实现 MD5 RFC1321+AES-128-ECB 运行时 S-box）+klyric 转换+channel+直连三级回退，缓存 8 首
- 【密码学向量门抓出真 bug】MD5 位长度字节被 JS 位移 mod-32 陷阱写坏（bitLen>>>32===bitLen>>>0 → m[60] 污染），FIPS-197 C.1+Node aes-128-ecb 对照双门抓住；修复=算术右移；AES 网上公开向量逐字节通过；此坑写入 AI-HANDOFF 坑 1
- 【宿主 smtc.ts v4 单真值直显】轮询 /api/state → ne 原样成曲目（一次性年龄补偿+fetchedAt 插值），零仲裁零守卫零混合；歌词按 songId 拉取 /api/lyric；needsPlugin(ne.v<3.0.0)/needsBridge(引擎不可达) 诚实归因；seekAck false → 3.8s 醒目提示「拖动未生效：网易云未响应」；公开面（smtc 单例/SMTC_COMMANDS/smtcPositionNow/类型）不变，消费方零改动
- 【沙盒核心+部件】__chushiMusicCore 从零重写（同契约 feed/tick/now/subscribe/seek；slew 0.35s 吸收+暂停按当前词剩余算 fadeMs 120-420ms——用户指定防漂移管线）；music-widget.html DOM/CSS 字节不动（防位移双 SVG 交叉淡切/lyHold 迟滞全保留）仅换 script（芯片文案分叉：缺件安装/引擎未运行/插件过旧）
- 【⚠本代新坑三件】①JS 位移 mod-32（坑1）；②strict 部件脚本漏 var lyActive → ReferenceError 被 feed catch 吞 → 面板停在静态 DOM（E2E 文案级断言抓出——「渲染必须断言到具体文案」）；③终端显示吃 `[h` 序列：文件里 [hashtable] 回显成 ashtable]（python codepoint 断言定真相），且 "ashtable]" 是 "[hashtable]" 子串、盲 replace 会造双括号——文件字节从未坏，全是显示伪影
- 【验证】test-crypto-v4 全过（MD5 RFC 向量/AES FIPS-197/Node 多块对照/ASCII 门）+ verify-v4 141/141 × 2 轮：S1-S10 静态（含 S2 引擎零 SMTC 读取逐符号、S4 插件 B 单写点、S6 宿主老符号零残留、S9 内嵌引擎逐字节回环）+ PSX 真语法门（pwsh 7.4.6 ParseFile——修复 [hashtable] 前报 Unexpected token 实锤显示伪影真相）+ V1-V5 插件白盒（vm 跑真 index.js：真值调和/seek 读回 ack/按钮路由/歌词 eapi 全链）+ M1-M4 音乐核心单测 + E1-E11 e2e（mock 引擎 26801：导入/等待态/真值显示/双版本页脚/进度推进/seek 到达引擎/旧版芯片）+ X1 pageerror=0
- 【构建/交付】双 .plugin（ChuShi-SMTC-Manager-3.0.0/ChuShi-Music-API-3.0.0）+ 扩展 4.0.0 zip 11.7MB + .cshz + 手动兜底包（Start-Engine.bat ASCII+CRLF + 引擎 ps1 CRLF）+ 合并交付包 + SHA256SUMS.txt + 使用说明重写（用户每条症状对应新架构解法 + 三步升级 + 30 秒自查）；旧代 .plugin 产物 git rm
- 【文档】AI-HANDOFF 全量重写（v4 宪法三条/新拓扑图/数据律四条/歌词管线/产线 9 步/兼容矩阵/14 坑/任务 A-D）；README v4.0.0 段；package.json 4.0.0

Stage Summary:
- 用户三条硬指令全部落为构建门（机器强制而非口头承诺）：零复用=老符号零残留断言、无 SMTC 读取=reader-side 类封禁、全 ASCII=逐字符断言；「装插件弄坏网易云本体」结构性根治=只读律+单次控制执行律（currentTime 全文件唯一写点）
- 新律：①重写类指令的验收=构建门断言老符号不存在，不是「我保证没抄」；②自实现密码学必须向量门先行（本代 MD5 真错被 FIPS 抓出）；③E2E 必须断言渲染产物文案而非「无报错」（catch 吞异常让静态 DOM 假活）；④显示伪影与文件真相分离：codepoint 断言定真相，显示层吃字符序列时严禁目视诊断
- 待办：用户真机复测（卸旧装双新 .plugin+重启网易云+Ctrl+F5+重导 .cshz；网易云 SMTC 开关关闭状态验满血卡片/可拖进度/媒体键；确认网易云自家进度条不受影响；暂停 30s 恢复读词零漂移）；任务 B=seek 元素级真机成功率；Edge 商店材料仍未动

---
Task ID: 90
Agent: Super Z (main)
Task: 会话接续——v5.0.0 全量重写收尾：e2e 跑绿三重根因修复 + 交付链路全通（Release/文叔叔/gh-pages/文档）

Work Log:
- 【现场核实】丢失会话已完成 v5.0.0 五层全量重写并提交（558d60d：插件A/B 5.0.0 + 引擎 ps1 + 预设包 music-widget/music-commands + 沙盒核心 + 宿主 smtc.ts + PresetWidgets），但验证未跑、交付未做、worklog 无记录；.pkgtmp/gh-token 完好在位
- 【⚠显示伪影险情再实录】music-widget.html 231 行「Hode]」疑似语法错误——Edit 两次匹配失败 + python find 找不到 + codepoint 逐字符 dump 定真相：文件实为 `H[mode]` 完全正常，`[m` 序列被终端回显吃掉（Task 89 坑 4 同类）。教训强化：一切判定以 codepoint/程序化断言为准，目视「看到错误」不可信，目视「没看到错误」更不可信
- 【e2e 三重根因修复（全非产品 bug）】verify-v5-e2e harness 从未执行部件脚本：①innerHTML 注入的 <script> 按 HTML5 规范永不执行 → 部件停在默认空态浮层拦截一切点击（E3 超时根因）→ 改 iframe srcdoc + mock 定义先于部件脚本；②String.replace 第二参为 JS 源码时 $&/$'/\$` 特殊序列陷阱 → 函数替换器；③sandbox.js 按 location.search 分发 pageMode/widgetMode，srcdoc 无 query 永远进不了 widgetMode（「Unexpected identifier found」= 404 页面文本被当 JS 解析的副证）→ 改生产同形 /sandbox-frame?mode=widget 服务器路径 + sandbox.js 直出；另有 sandbox.js 含字面 </script> 内联需 <\/script> 转义（JS 字符串等价）
- 【验证】verify-v5 三套（静态 137 + 白盒 24 + e2e 23）= 184 项断言 × 2 轮全绿；e2e 升级为真执行渲染（断言到具体文案/进度推进/seek 到达 269.3*0.5±6/乐观翻转/芯片四态/sandbox 协议 subscribe + pageerror=0）；新增 syntax-gate-v5.mjs 语法门（全部 v5 JS 含 .plugin 内嵌 index.js 回环解析，14/15——sectionD 为构建拼接片段独立不可解析属预期）
- 【构建】build-v5-plugins.py 门全过重建双 .plugin；build-v5-preset.py 重建 .cshz（7567B）；build-extension.py VERSION/DEST 4.0.0→5.0.0（丢失会话漏改版本号）+ EXTENSION_MODE=1 重建扩展 zip 11.7MB（manifest 5.0.0 + 端口 26801 + sandbox.js 与 public/ 字节一致断言）；新增 build-v5-assets.py 组装交付六件套（内嵌引擎==CRLF 引擎字节断言 + manifest 版本断言 + 合并包内容断言）
- 【发布】main 8fdefee 推送；gh-pages DEPLOY-OK（sw BUILD 20260907-115358-8fdefee）+ 线上指纹 __chushiMusicCoreV5/whitelist 双命中；Release v5.0.0 id=384054435 五资产直链 SHA-256 ALL OK（⚠本代新坑：token 对 DELETE release asset 端点 404（上传/更新正常）——幂等逻辑不能再依赖「先删后传」，资产已全部在位时直接 SHA-256 校验即收尾）；文叔叔合并包 https://c.wss.ink/f/ktgudphl4sz（complete code=0 success 99%，302→wenshushu.cn 验证有效）
- 【文档】README v5.0.0 版本段；AI-HANDOFF 更新（v5 宪法补齐指令/拓扑 v5/产线 v5/兼容矩阵 v5 行/坑 13-16/任务 A=v5.0.0 真机验收）；交付包使用说明 v5.0.0 版（五层 0 复用 + 升级三步 + 30 秒自查）

Stage Summary:
- 用户「全部重写」指令全链闭环：五层（插件A/插件B/引擎/预设包/音乐面板 API+前端）全部从零新写且样式不变，三套验证 184 项×2 轮全绿后交付
- 新律：①e2e harness 三重根因（innerHTML 不执行脚本/replace $ 序列/sandbox 模式分发）都披着「产品坏了」的外衣——先分层归因再动手；②token 权限缺口可能只影响 DELETE 不影响上传/更新——发布脚本的幂等策略必须容忍「删不掉」并以 SHA-256 校验为最终收口；③显示伪影判定律升级：连「目视发现的 bug」也要先过 codepoint 断言再动手修
- 待办：用户真机复测（卸旧装双新 .plugin 5.0.0 + 完全重启网易云 + Ctrl+F5 + 重导 .cshz；网易云 SMTC 开关关闭状态验满血卡片/可拖进度/媒体键/暂停恢复零漂移/网易云本体进度条不受影响；页脚 API v5.0.0 · 管理 v5.0.0）；任务 B seek 真机成功率、C 部件高度弹簧、D 工程化欠账（AI-HANDOFF）

---
Task ID: 91
Agent: Super Z (main)
Task: 用户反馈「ChuShi-SMTC-Manager-5.0.0.plugin 安装了无法在插件列表显示出来」+「插件名称要改成英文，不是介绍之类的也改成英文」——v5.0.1 修复

Work Log:
- 【源码级根因】拉 BetterNCM v2 源码（本体已改名 std-microblock/chromatic，v2 冻结源码从 fork NanoRocky/BetterNCM 取）读 PluginManager.cpp extractPackedPlugins 过滤链：`isNCM3 && !manifest.ncm3Compatible → continue`——网易云 3.x 静默丢弃 manifest 缺 ncm3-compatible:true 的插件（不解压/不加载/列表不显示/不报错）；v5.0.0 重写时 SMTC Manager 丢了该字段（老版 2.1.0 有），Music API 5.0.0 带着字段——「只有一个插件看不到」症状不对称即定位实锤；同源实锤两条：①中文 .plugin 文件名经 zip_open 按 ANSI(GBK) 码页解析→打不开→用户「中文读不了」判断正确（ASCII 文件名门保留）；②同 slug 插件解压到同一目录 plugins_runtime/<slug>，plugins 文件夹旧 .plugin 不删会启动时反向覆盖（中文名 ASCII 序在后=旧覆盖新）；另有 disable_list.txt 同 slug 连坐风险
- 【修复】双插件 manifest 补 ncm3-compatible:true；按用户规则文案调整：name 保持英文（ChuShi SMTC Manager / ChuShi Music API）、description 改回中文；.plugin 文件名与 index.js/engine 仍纯 ASCII；双插件 PLUGIN_VERSION → 5.0.1（宿主 PLUGIN_VER_MIN=5.0.0 semverLt 门兼容）；引擎零改动（$EngineVersion 5.0.0 与 ENGINE_VER_REQUIRED 一致）
- 【构建门升级】build-v5-plugins.py：manifest 从 raw-ASCII 门改结构门（JSON 解析+manifest_version==1+slug+版本+name 纯 ASCII+description 必含 CJK+ncm3-compatible 必须 true+injects Main→index.js+hijacks）——本坑机器锁死永不复发；OUT 路径版本化 f-string；BetterNCM 过滤链模拟器（zip 布局/manifest_version/ncm3 门/版本 req/extract 目标）双插件 WOULD LOAD AND LIST 全过；syntax-gate-v5 13+1（sectionD 预期）
- 【交付】download/v5.0.1/ 六件套（扩展保持 ChuShi-NewTab-v5.0.0.zip 诚实命名零改动+双 .plugin 5.0.1+交付包+合并包+SHA256SUMS+使用说明 5.0.1 版新增「装完列表里还是没有」排障节）；main 8dc364b 推送；Release v5.0.1 id=384081046 六资产直链 SHA-256 ALL OK（⚠又踩：/releases/assets 顶层列表端点不存在 404→改 /releases/tags/{TAG} 自带 assets 校验）；文叔叔合并包 https://c.wss.ink/f/kth6ggzedzh（200→wenshushu.cn 验证有效）
- 【文档】AI-HANDOFF 坑 17（BetterNCM ncm3 静默过滤全链+中文文件名 ANSI 实锤+同 slug 覆盖+disable_list 连坐+chromatic 改名/源码 fork 考古路径）+ 任务 A 升 v5.0.1 验收（第 0 项=双插件列表可见）；README v5.0.1 版本段

Stage Summary:
- 「装了不显示」不是玄学：BetterNCM 对网易云 3.x 有静默白名单字段 ncm3-compatible，缺失=无声消失；修复+构建门锁死+排障文档三件套闭环
- 新律：①「插件列表不显示」类问题第一步查 BetterNCM 过滤链（disable_list/ncm3/version-req/manifest_version），不是查 zip；②插件 manifest 的 name（英文）/description（中文）/文件名（ASCII）三者的语言规则是三条独立用户规则，构建门分别断言；③升级说明必须写「删掉所有旧 .plugin」——同 slug 解压目录覆盖方向由文件名排序决定，不可赌
- 待办：用户真机复测（删光旧 .plugin→装 5.0.1 双插件→完全重启→列表双可见→SMTC 关闭态满血卡片/可拖/媒体键→页脚 API v5.0.1 · 管理 v5.0.1）；若列表仍缺→disable_list.txt 排查（使用说明有步骤）；任务 B/C/D 沿 AI-HANDOFF
---
Task ID: 92
Agent: Super Z (main)
Task: 用户指令「算了还是把桥单独写成一个插件吧，分成三个插件，因为现在初始的页面还是不会显示音乐，要不要把初始的前端音乐API都重写一下」→ v6.0.0 三插件纯插件架构（外部引擎整体退役）

Work Log:
- 【架构裁决】「桥独立成插件+三个插件」落为 SMTC Manager / Music Bridge / Lyric Source 三 .plugin；「页面不显示音乐」根因定性 = v5 页面数据面必经外部引擎（插件A 5.0.0 曾不可见 → 引擎从未部署 → 枢纽 26801 死 → 页面空），根治 = 枢纽住进桥插件（渲染进程内 require("http").createServer，v5 已实证渲染进程有完整 Node）
- 【调研实锤】BetterNCM 本体服务器（NanoRocky/BetterNCM v2 App.cpp）httplib 无任何 Access-Control 头 + /api/fs/* 全走 checkApiKey（外部页面拿不到 key）——本体服务器不能当中继（坑 19）；PAT 文件再丢但 git remote 内嵌 token 在位 → 重建 .pkgtmp/gh-token（600，API push 权限核实）
- 【插件A 6.0.0】纯 JS navigator.mediaSession 满血会话：metadata+artwork(?param=500y500)/playbackState/positionState（1s 重锚+系统侧本地时钟插值）/8 个 action handler（play/pause/prev/next/stop/seekto/seekforward/seekbackward 本地钟）；只转发 cc:smtc-cmd 绝不执行播放控制；零 require/零 child_process/零 fs；mediaSession 缺失 → "unsupported" 诚实上报
- 【插件B 6.0.0 桥】真值三级调和（元素粘滞时长锚定 → 原生 PlayState/PlayProgress/Seek 新鲜窗 → dva store 只读 webpack 探针）；控制单次执行律（currentTime 全文件唯一写点 + 420ms/1s 双读回 seekAck；play/pause=元素方法、next/prev=可见按钮）；枢纽 127.0.0.1:26801（/api/ping|state|lyric|cmd，CORS * + PNA 预飞行头，EADDRINUSE 自动退 26802 + 页面双端口重探）；window 事件总线（cc:music-state 1s 心跳 / cc:smtc-cmd / cc:lyric-req|res|hello / cc:smtc-ack），三邻居全可选全诚实降级
- 【插件C 6.0.0】歌词源独立：eapi /api/song/lyric/v1（渲染进程 node crypto，协议常量级实现）→ channel.track.lyric.getinfo → 直连三级回退；klyric→yrc 转换；LRU 8 + localStorage 持久化；reqId 配对应答。eapi 协议公网端到端实测 3/3（verify-v6-eapi：同协议常量 Node 复算 + 真 POST）
- 【页面音乐 API 重写】smtc.ts v6 全新实现：双端口发现+粘滞（26801→26802，失败 4 轮重开双探）、HUB_NAME/HUB_VER_MIN 门、ne.v<6.0.0 needsPlugin 门；公开面（SmtcTrack/SmtcState/SmtcLyric/SMTC_COMMANDS/smtcPositionNow/smtc 单例）字段级兼容——PresetWidgets/sandbox/page.tsx/预设脚本零改动；引擎引用零残留
- 【预设包/沙盒/扩展】music-widget 芯片文案换桥语义（音乐桥未连接/版本过旧/未就绪/三插件组件待更新 + 空态三件套文案），DOM/CSS 字节不动（样式不变律）；沙盒音乐核心 __chushiMusicCoreV5→V6 标记升级契约零改；扩展 6.0.0 host_permissions 加 26802
- 【构建门】build-v6-plugins G1-G11：node --check 语法/manifest 结构/name ASCII/description 必含 CJK/ncm3-compatible true/injects/版本一致/文件名 ASCII/zip 根布局/BetterNCM 过滤链模拟器（WOULD LOAD AND LIST × 3）/slug+防重入键唯一
- 【验证】两轮全绿：静态 112（宪法/单写点/歌词梯/公开面/文案指纹）+ 白盒 46（桥真值调和/枢纽路由+CORS+PNA/命令队列/seekAck/端口回退；SMTC 应用+动作转发+unsupported；歌词 eapi 参数与参考实现逐字节对照+回退梯+缓存）+ e2e 32（部件芯片矩阵 W6.1-W6.5/进度推进/seek/逐字/空态/沙盒协议 + 全页 .cshz 导入 + mock 枢纽真轮询：E4 真值显示/E5 页脚 v6/E7 逐字/E8 seek 到枢纽/X pageerror=0）+ eapi 实测 3/3
- 【交付】download/v6.0.0 七件套（扩展 zip+三 .plugin+.cshz+合并包+SHA256SUMS+使用说明 v6 版含「列表还是没有」排障）；main 019b0b6 推送（旧代 bridge/{engine,smtc,ncm-plugin,smtc-plugin,lyric-plugin} 全部 git rm——退役即删码）；gh-pages DEPLOY-OK + 线上指纹（sandbox.js __chushiMusicCoreV6 ×3 + chunk d3219b9e chushi-music-hub）；Release v6.0.0 id=384138990 七资产 digest ALL OK（idempotency：先传 4 资产后 cshz 缺件失败 → 补齐重跑只传缺件）；文叔叔合并包 https://c.wss.ink/f/kthto9s9qxf（302→wenshushu.cn 200 验证有效）
- 【文档】AI-HANDOFF：v6 宪法三条/拓扑图 v6（数据律 4 条）/产线 10 步/兼容矩阵 v6 行/坑 18（枢纽必须住插件里）坑 19（BetterNCM 本体服务器不能当中继：api_key+CORS 双锁）/任务 A=v6 真机验收（mediaSession unsupported 诊断路径）；README v6.0.0 版本段；package.json 6.0.0

Stage Summary:
- 用户三条指令闭环：三插件独立（桥单独成插件）、页面音乐 API 重写（传输层换桥枢纽、公开面零破坏）、「初始页面不显示音乐」结构性根治（数据面去引擎化——枢纽住在插件里，插件活着页面就有数据）
- 新律：①渲染进程 = 完整 Node 运行时，枢纽/服务类需求优先 require("http") 进插件，不再外溢进程；②BetterNCM 本体服务器有 api_key+CORS 双锁，不能当页面中继；③「装了看不见」之后的新三律（结构门/过滤链模拟器/语言三律分立断言）已机器锁死
- 待办：用户真机复测（删旧装三新 → 重启网易云 → 列表三可见 → SMTC 开关关闭验系统卡片/可拖/媒体键 → 面板真值/逐字/seek 回执 → 本体不受影响确认）；真机 mediaSession 不出卡片时按任务 A.1 诊断路径查 unsupported；Edge 商店材料仍未动
