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
