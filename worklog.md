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
Task ID: 94
Agent: main (Super Z)
Task: 「初始」音乐系统 v8.2.9——桥响应迟钝根治（命令快排 200ms）+ 逐行歌词行级时钟 + 面板「律动/浮窗」双开关（右键隐藏退役）+ FFT 频段 16→128 + 三态动画修订（去封面飞形+钉位防跳）

Work Log:
- 【现场】真工作树 /tmp/my-project（e8cf8a6=v8.2.8）；Edit 工具只认 /home/z → /home/z/work-v829/ 镜像编辑 + cp 回同步；llvm-mingw 20260826 重下（x86_64 lib 936 .a 对拍）
- 【五连修】①桥命令串行链（poll→推状态→selftest→拉命令，最坏 ~4s/拍）拆出独立 200ms drainCmds + 面板 hublog 不阻塞节拍 + TRUTH_STALE_SEC 6→12（「面板冻结浮窗正常」= 年龄封顶过早钉守的精确病理）；②行级时钟分离（逐行 0ms/逐字 -100ms，ext-lyric+sandbox+widgetShim+两渲染层六处贯通）；③面板双开关 csGlow/csFloat → mirrorExtCard → cardGlow/cardEnabled，浮窗全局显隐+律动总开关（关=撤频谱订阅零开销）；④BANDS 128（实际映射律：2048 FFT 下低频侧线性化 段k≈bin k+2，探针实证 100Hz 峰在段 2；bass 分区带权 47~211Hz；hub.dll 引擎零扰律）；⑤去封面 clone 飞形 + 形变期钉位（left/top 随形变动画到夹紧位，cleanup 才提交 pos）
- 【门禁】lyric-engine-v829 + dsp-gate-v829 五场景（场景包络 memset 隔离）+ verify-v827-ext 31/31 + verify-v827-panel 7/7 + sandbox 核心行为门全绿；widgetHtmlLen 24000→25600 双数字门同批改（Task 100 律）
- 【发布】main b5db0ae + tag v8.2.9 + Release 386754467 七资产 SHA 回读 5/5；gh-pages 部署（v829 脚本级根治坑⑤：显式 remote add + push 失败即退 + SHA 配对 + 线上内容门；线上 sandbox.js 行级时钟/chunk 8.2.9 实测在位）；交付物 /home/z/my-project/download/v8.2.9/ 双落位

Stage Summary:
- 新律：①串行链路里命令与数据必须分道（专职快排循环）；②补偿常量必须分时基（逐字补偿不得拖累行级时钟）；③理论映射≠实际映射（频段选轴以探针实测为准）；④单帧包络值=raw×攻（测试场景 memset 隔离+稳态断言）；⑤同一真值的双消费端年龄语义必须一致
- 待办：用户实机验收；Edge 商店提交材料仍未做

---
Task ID: 95
Agent: main (Super Z)
Task: 用户两条实机反馈——①三态动画纠偏（要一镜到底：封面该飞但要修校准卡顿，现版线性无回弹、mini⇄full 有复位感）②不要休眠音乐面板（切歌后面板留在上一首）——v8.3.0

Work Log:
- 【现场】真工作树 /tmp/my-project（b5db0ae=v8.2.9）；/home/z/work-v829 镜像已过时（v8.2.8），重建 /home/z/work-v830 镜像编辑 + cp 回同步；hubsim/spectrumsim//tmp/ext-ref/playwright 均在位
- 【动画①真弹簧】v8.2.9 的贝塞尔形变推翻：springFrames 半隐式欧拉采样单位弹簧（k=430/d=24，ζ≈0.58，~10% 过冲，4 子步积分防数值阻尼吃掉回弹），width/height/left/top/borderRadius 全走同一进度轨迹采样成 WAAPI 关键帧（样本间 linear）——dock POPPING 同族手感，cleanup 样式即终态
- 【动画②封面连续锚】covClone 复活封面飞行并根治校准卡顿：两端矩形全部 getBoundingClientRect 实测（目标壳隐身布局实测，收缩方向确定性 56×56），cloneNode 带走辉光/律动内联样式，飞行走布局属性（非 transform scale，逐帧清晰），落地同帧同位交接零接缝；形变途中切歌经 trans.cloneImg 热跟随
- 【动画③复位感双凶】cscardin 入场 CSS 动画改 .boot 仅首挂载——display:none→block 会重放 CSS 动画，旧版每次切换叠一层 0.96→1 缩放；内容改 t+60ms 级联上浮淡入（dock content-focus 同语言 26ms 级联，旧版等 35% 才开始=空壳感），形变期壳 overflow:hidden 裁切生长；目标壳保持可点（中断律），真封面延迟到 clone 落地才显形（防双封面）
- 【休眠②】ext-bg visCount 门整体拆除（vis 上报分支+卡侧上报全删）：state 轮询只要还有卡片 Port 就 1Hz 常开——旧律全 hidden 即停，停摆期切歌真值永久丢失且无自愈；SW 因每秒广播保活不休眠（本律代价=目的）；频谱 specWanted 门照旧（渲染需求≠真值需求）；渲染休眠律（needFrame）保留不动 5070 回退；面板侧配套：smtc.ts bindVisHeal——后台标签 1s 节拍被 Chrome 重节流（最长 1/min），visibility→visible 瞬间 schedule(100) 立即补拍（beat busy 守卫下双拍无害）
- 【门禁】build-extension.py v8.3.0：required +springFrames/morphFrames/covClone/surf.boot/cloneImg，bg required +cards.size===0、gone +case "vis"/port.__vis/postMessage type vis；EXTENSION_MODE 全量重建 out/（smtc.ts 变更入包）
- 【取证】verify-v830-ext.mjs 13/13 全绿：F30a 弹簧过冲（形变峰值宽 330>终值 322+4=回弹存在）+F30b 收敛 416ms；F31 封面飞行（full→mini 40% 途中走廊采样 max 通道 253=clone 在飞非原地消失）；F5c 四态往返宽度全对+位置零漂移 Δ0（校准卡顿反证）；F32 全卡片隐藏期 SW 仍 1Hz 拉真值（hublog tick 增量 3 条/3.5s；⚠48 条环形缓冲快照计数法被稀释必假阴——必须按条目 tick>since 增量）+F32b 隐藏期切歌回前台首帧即新曲；v8.2.7 全量回归 31/31 PASS（辉光/拖动/歌词/零跳转/一镜到底中途帧全保）
- 【调试实录】工具显示层吞 [h 序列（"hublog err" 显成 "ublog err]"）误导排障两轮——文件实际无损，Task 54 [m 同源；F32 取证器两版假阴（startsWith 漏 #seq 前缀 → 环形缓冲稀释）靠 tick 增量根治
- 【发布】main + tag v8.3.0；交付 download/v8.3.0/ 七件（NewTab zip/桥 8.2.9 沿用/预设 8.2.9 沿用/歌词源 7.3.0 沿用/说明/SHA256SUMS/AllInOne）；gh-pages 不涉及（NewTab 扩展包独立）

Stage Summary:
- 新律：①display:none→block 重放 CSS 动画——入场动画必须类门控仅首挂载（三态切换复位感真凶之二）；②跨态连续动画的终点必须实测（目标壳隐身布局量测），估算终态=校准卡顿；③环形缓冲日志不能快照计数——按条目时间戳增量；④真值链路任何「节能门」都必须回答「门关期间的真值丢失如何自愈」，答不出就不能上；⑤后台标签定时器不可依赖——可见性恢复瞬间必须主动补拍
- 待办：用户实机验收；Edge 商店提交材料仍未做

---
Task ID: 97
Agent: main (Super Z)
Task: 用户反馈「没有推送到公开仓库」——v8.3.1 发布链补推（commit/tag/Release 全缺）

Work Log:
- 【现场】真工作树 /tmp/my-project（c8665a4=v8.3.1 本地已提交）；origin/main 停在 dfa7c32（v8.3.0）；.pkgtmp PAT 已丢失但 origin URL 内嵌 token 可用（curl API + push 全程零碍）
- 【缺口定位】GitHub Releases v8.2.3–v8.3.0 全在位（均七资产），唯独 v8.3.1 整条发布链未做：c8665a4 未推、无 tag、无 Release；仓库自带 worklog 的 Task 96 记录完整（随 c8665a4 入仓）——上一会话在「打包双落位后、发布前」断电
- 【补链】①交付物 SHA256SUMS 四件校验全过 → 补建 AllInOne 合并包（六件平铺对齐 v8.3.0 结构）→ commit fe6af19 → push main（dfa7c32..fe6af19）→ tag v8.3.1；②发布脚本 scripts/rel-v831.py（幂等：GET 404=不存在即创建、按名跳过已传资产、SHA 回读 4/4 断言）
- 【新坑·CJK 资产名】GitHub 上传资产会剥非 ASCII 字符——「使用说明-v8.3.1.md」落地成「-v8.3.1.md」；v8.3.0 资产用 ASCII 名（ChuShi-v8.3.0-Usage-Notes.md）正是此律。修复三连：ASCII 副本入库（fb1c4eb：ChuShi-v8.3.1-Usage-Notes.md + AllInOne 内部文件名同步 ASCII，中文名原件保留）；脚本加陈旧资产清除；AllInOne 入 FORCE_REUPLOAD 强制重传集（内容变过不能按名跳过）；tag 移到最终交付态 fb1c4eb
- 【发布核验】Release v8.3.1（id 386877336）七资产齐：NewTab zip 12.3MB / 桥 8.3.1 / 预设 8.2.9 沿用 / 歌词源 7.3.0 沿用 / SHA256SUMS / Usage-Notes / AllInOne 12.4MB；SHA 回读 4/4 OK；gh-pages 不涉及（远端停在 v8.2.9 部署 649a4ae，本版 web 面仅 smtc.ts 版本常量变化，沿用 v8.3.0「扩展包独立」先例）

Stage Summary:
- 新律：①GitHub Release 资产名剥 CJK——公开资产一律 ASCII 名（仓库文件可保中文，双名并存）；②按名幂等的资产上传必须区分「名字没变但内容变了」——FORCE_REUPLOAD 集是幂等上传的必备配套；③发布链五件套（commit/tag/Release/资产/SHA 回读）任一环断链都算未发布——「本地提交完成」≠「已推送」，用户视角只认公开仓库
- 交付：https://github.com/LXgssy/Start-chushi/releases/tag/v8.3.1
- 待办：用户实机验收 v8.3.1 九项反馈修复；Edge 商店提交材料仍未做

---
Task ID: 96（补记·重建）
Agent: main (Super Z)（前一会话，实录见仓库 worklog.md@v8.3.1）
Task: 用户实机反馈八连——快捷服务浮窗缺失/弹簧克制/cover→mini 一镜到底/三态复位清零/高光渐入/弱歌律动（AGC）/chushi-spectrum 常驻/歌词动效——v8.3.1

Work Log:
- （本条为外层 worklog 补记；完整实录在仓库 worklog.md 的 Task 96 段，随 c8665a4 入库）
- 核心结论：八项全部实现并打包（c8665a4 + download/v8.3.1/ 双落位），发布链断在会话断电——由 Task 97 补推完成

Stage Summary:
- 见仓库 worklog.md Task 96（cloneNode 内联样式律/弹簧阻尼观感律/AGC 峰值跟随律/keeper 常驻律等六新律）

---
Task ID: 98
Agent: main (Super Z)
Task: 用户实机反馈两连——①v8.3.1 新加歌词动效没看到 ②缺「未播放/已播放歌词高斯模糊」——且动效要覆盖浮窗和「初始」面板——v8.3.2

Work Log:
- 【取证①】呼吸动效 v8.3.1 只落了浮窗（ext-card.js .fln scale 1.06/0.94），面板 music-widget.html 完全没动（仍 .55s 滚动/.5s 行色、无呼吸无模糊）——用户常看「初始」面板=「没看到」真因；且浮窗 13.5px 字号 ±6% 缩放本就难辨，缺模糊衬托
- 【实现①②】双渲染层同律：①高斯模糊景深三档——未唱 blur(2px)/已唱 blur(1.1px)/当前行 blur(0) sharp，filter .45s 同曲线过渡（cubic-bezier(.22,1,.36,1)）与呼吸缩放叠加；②面板补呼吸 scale 1.06/0.94 + 三档模糊 + 滚动 .55s→.45s + 行色 .5s→.35s（CSS 与 JS 内联 transition 五处同步——面板 lyInr.style.transition 内联覆盖 CSS，漏改 JS 等于白改）
- 【门禁】build-extension.py VERSION 8.3.2 + blur 三档特征门；build-smtc-preset.py 面板五特征门（scale/filter/双时序）；build-v832-assets.py 资产组装（桥 8.3.1/歌词源 7.3.0 沿用+校验，cshz 8.3.2 新建）；EXTENSION_MODE 全量重建（smtc.ts CLIENT_VER 8.3.2 入包——资产组装器强制校验宿主 bundle 版本号，漏重建必拒）
- 【e2e 新门】verify-v832-panel.mjs 13/13（CDP 跨源直查 opaque iframe computed style：blur 三档精确值+matrix(1.06/0.94)+双时序+滚动位移+零报错）；verify-v832-ext.mjs 9/9（closed Shadow DOM 像素取证：逐行边缘能量剖面，当前行 35.2 vs 相邻行 0.7=50 倍锐利差、峰值亮度 244 vs 59，位置推移 6.2→12.4 效果跟随=动态景深非静态样式）；存量回归 v831 专项 14/14 + v827 全量 31/31（一次偶发 FAIL 无失败项复现，连跑两次全 PASS 判定时序抖动）+ 面板律动 7/7
- 【取证器三坑】①hubsim 端口绑定前 POST /api/lyric 静默丢失→ping 就绪重试；②真桥 /api/lyric 响应形={ok:true,lyric:{...}} 包装（SW 解 j.lyric），裸 body=永远「暂无歌词」；③shim whitelist 走 ensureParsed 只认原始 yrc/lrc 文本，预解析 lines 被静默丢弃——面板测试必须喂原始 lrc
- 【发布】main 3d224d0 + tag v8.3.2 + Release（id 387001630）七资产 SHA 回读 4/4；交付 download/v8.3.2/ 双落位（NewTab zip/preset 8.3.2/桥 8.3.1 沿用/歌词源沿用/SHA256SUMS/双名说明/AllInOne）；repo worklog 提交前发现被外部同步进程覆写丢 Task 96 段→git checkout 恢复后再追加

Stage Summary:
- 新律：①动效类需求「覆盖 A 和 B」必须双渲染层同版交付——单侧落地=用户必看不到；②JS 内联 style.transition 会覆盖 CSS transition，改时序必须双处同改；③closed Shadow DOM 用像素能量剖面取证（锐利/模糊 50 倍差），opaque iframe 可 CDP 直查 computed style；④mock 桥响应形必须对齐真桥包装（{ok,lyric}），裸形=静默空转；⑤worklog 会被外部同步覆写——提交前 git diff worklog 是新 Ritual
- 交付：https://github.com/LXgssy/Start-chushi/releases/tag/v8.3.2
- 待办：用户实机验收（浮窗+面板双端歌词动效）；Edge 商店提交材料仍未做

---
Task ID: 99
Agent: main (Super Z)
Task: 用户实机反馈三连——①不要给封面加高光（高光就在封面底下，「让高光明显」≠给封面加高光）②切下一句时上一句歌词的模糊有个「重置效果」③新开「初始」标签页聚焦在网址搜索栏不要聚焦——v8.3.3

Work Log:
- 【取证②三段】computed style 层逐字节复刻（.fln 全同 CSS+同切类序列）四种环境（DPR1/1.25/1.5/backdrop 祖先）全部零突跳=类翻转论排除；CDP screencast 逐帧能量剖面抓到 t≈470ms（过渡结束帧）当前行锐度 46→71.6（+56%）=合成层动画结束降层重栅格化（0.94 起始纹理被放大到 1.06 后换原生烘焙）；帧带慢动作逐帧目检确认全程平滑、仅结束帧跳
- 【根治②a】done 行常驻合成层（will-change:transform,filter）——done 静息 scale .94 与 raster 一致=零重栅格零阶跃；离屏 done 行 Chrome 自动裁 tile 层成本有界
- 【根治②b】行界滞回门——位置源回跳两机制：SW/桥管线延迟拍、连续回退放行后 800ms smoothstep 入轨（上游滞后 ~1s 时导数 rate−k'δ 变负=显示倒退 ~150ms 跨回行界）→ 行号翻转 → 上一行 done→on→done = blur 取消倒放重演（字面「重置」）。门律：前进即时（逐行快一拍律不破）/ 后退与间奏候选持续 650ms 才采纳 / seekGuard+位置大跳 2.5s 立即放行。三层同修：ext-card.js lyricFrame + public/sandbox.js gateFrame（面板 mus.now 宿主预计算层）
- 【新坑②门复位键】初版拿 lastSnap 对象身份做切歌复位——快照每拍都是新对象（生产 1Hz 轮询同样）=门每拍被复位形同虚设（e2e 实锤 11/13 穿门）；改 songId|title|lyricRev 三元组（且白名单后字段在快照顶层，track 子对象取值两连错）。【新坑②旁路】初版拿 lastHardAt 当旁路——backward 爬行源第 2 拍放行也走 reanchor 打点=旁路自败；改 seek 护航窗 guard 单信号（仅 seek() 设置）
- 【修复①高光归位】封面 img brightness/saturate/contrast 滤镜退役（v8.2.7 提亮路线废），能量全走封面背后 .glow/.cs-glow（opacity 低音 0.68→0.85 基线 0.28/0.30、scale 0.08/0.075、外圈 -6/-8px blur 10/13px）；covClear/picImgEl 写入全拆；暂停态 .cs-pz 样式表滤镜与内联残留的老干扰连根拔
- 【修复③焦点归位】page.tsx 挂载短窗（30ms~1s 六次重试 + focus 事件 1.2s 窗）body tabIndex=-1 focus 偷回；页面已有具体焦点元素一律不碰；敲键自然落 type-to-search（body 聚焦不挡 window 键事件）
- 【门禁】build-extension.py VERSION 8.3.3 + 特征门（will-change:transform,filter/GATE_MS/gPend/lastHardAt）+ gone 门（c.img.style.filter 残留拒收）；build-smtc-preset.py + will-change + 0.30+pb*0.72 + picImgEl.style.filter 残留拒收（面板 JS 压缩去注释，注释特征门落空改代码级特征）；build-v833-assets.py 净目录幂等（目录扫描哈希混入陈旧 AllInOne=顺序缺陷实测）+ 显式四件清单哈希
- 【取证】verify-v833-ext.mjs 11/11（NTP body 焦点+tabIndex=-1 / 像素级门压制 backward 双拍 0/14 重亮 / 扫描峰上移一行 1228ms / staged 法门四件）；verify-v833-panel.mjs 9/9（类级门压制 0/13 / 前进 34ms / 大步后退单次收敛 / done will-change=transform,filter / beat 期封面零内联滤镜 + 辉光 inline opacity=1）；probe-v833-gate.mjs 门内幕探针（临时仪器化取证后拆除）
- 【回归律对齐】v827 F13b「封面随拍提亮」改判「封面恒定≤3 + 辉光承拍」；glow 套件 8 处旧律断言（旧增益/提亮滤镜/细节环）按归位律改写 14/14；v830 F30a v8.3.0 旧阈（+4px）与 v8.3.1 克制弹簧（~1%≈+3.2px）冲突→微过冲 ∈+[1,6]px（v8.3.1 时漏改，Task98 回归矩阵未含 v830 故潜伏）。终版全矩阵九套全绿：v833 11+9 / v832 9+13 / v831 14 / v827 全量 PASS+glow 14+panel 7 / v830 ALL GREEN
- 【发布】main + tag v8.3.3 + Release 七资产 SHA 回读 4/4；交付 download/v8.3.3/ 双落位（NewTab zip / preset 8.3.3 / 桥 8.3.1 沿用 / 歌词源 7.3.0 沿用 / SHA256SUMS / 双名说明 / AllInOne）

Stage Summary:
- 新律：①transform+filter 共动画的合成层在过渡结束降层重栅格化=确定性质感阶跃——静止态行必须常驻提层（静息 scale 与 raster 一致）；②任何「门」的复位键禁止用对象身份（快照每拍都是新对象），用业务三元组；③门旁路信号必须单源（seek 护航窗），凡非 seek 事件也会打的点都不能当旁路；④测试舞台会陈旧（out→stage 只随 bun build:extension 刷新），取证前必须核对 stage 与当前构建同代——本轮门「失效」半数是舞台旧码假象；⑤交付哈希显式列文件名，目录扫描必混陈旧；⑥取证判据必须贴合布局律（滚动居中=最亮行 y 恒定；逐字扫描=方差峰随当前行移动），首版 E3「最亮行下移」是错模型
- 交付：https://github.com/LXgssy/Start-chushi/releases/tag/v8.3.3
- 待办：用户实机验收（封面底下高光/上一句模糊平滑/新标签页焦点）；Edge 商店提交材料仍未做

---
Task ID: 100
Agent: main (Super Z)
Task: 用户实机反馈四连（附截图）——①歌词被边框吃掉一部分（很多歌都这样）②标准态/完全态律动高光溢出容器 ③新歌词切上来「咯噔」④暂停/播放键按下「复位」——v8.3.4

Work Log:
- 【取证①防裁切】长行（多行换行+翻译行）垂直居中后上下余量不足：mask 渐隐区旧 16%/84% 百分比（118px 容器≈19px）+ overflow 硬裁——行顶侵入渐隐区被淡化/吃掉（用户截图：当前行顶部削平+底部行裁半）。修复三连：flyr 118→140 / cs-lyr 124→146 加高（LY_H 同步，cshz 压缩后 24.9K<25.6K 门不动）+ 渐隐区固定 18px（calc(100% - 18px)，百分比随高度浮动退役）+ 行 padding 3→5px / 4→6px 呼吸
- 【修复②防溢出】.glow（inset:-6px+blur10px+scale≤1.08）光晕超卡片圆角，v8.3.3 增益拉满后更明显——mini/full 壳静态 overflow:hidden（辉光仍在封面四周晕出但被卡片圆角裁住），cover 态保持晕出（56px 方块环绕光=设计本意）；形变期 style.overflow 临时值 removeProperty 后自然回落 CSS 默认，零冲突
- 【取证③咯噔主因】翻译行 .fsub/.cs-sub display:none↔block 硬切——切行瞬间旧行高 -17px/新行高 +17px 两处布局瞬跳。修复：fsubw/csubw grid 包裹 + 显式 height 0↔16/17px 过渡（.38s 同曲线）——同行收/展抵消，下方行 offsetTop 恒定（P3a 实证 Δ=0）；滚动 target 逐帧追踪（lyrTrackUntil 560ms 窗内每帧重算，fsubw 过渡期 offsetHeight 连续变化由 transform transition 小步跟随，收敛终态精确居中）
- 【新坑③·三连】①grid-template-rows 0fr↔1fr 在本环境实测离散跳变（0→17 一步无中间值，getAnimations=[]）——fr 插值不可信，改显式 height（length 插值 100% 可靠）；②翻译行 padding-top 在 0fr 轨道残 2px（min-content 含 padding）——间距走 line-height；③on 行提层实证反悔：任何 will-change（transform 或 filter）都把 raster 冻结在切行瞬间 .94，1.06 静息显示=整体放大采样模糊（F15b 对照实验：无提层 245 / transform 提层 203 / filter 提层 203）——当前行白亮（v8.2.3 两色调律核心）不可牺牲，提层撤销；blur 撤层的「变清晰」方向友好非用户所指咯噔
- 【修复④防复位】乐观窗固定 2500ms 到期强制回落真值——SW 轮询 1Hz 最坏 ~2s 才拿新真值，窗口余量极小，桥/网易云慢时图标翻回再翻来=字面复位。新律（浮窗+面板同律）：真值对齐即退役（onState 路径 effPlaying 内清窗）+ 未对齐期间持续显示点击方向（顺延）+ OPT_MAX 7s 硬上限防桥挂死锁显；loopBody/render 只兜底硬上限触发重绘
- 【门禁】build-extension.py VERSION 8.3.4 + 特征门（lyrTrackUntil/scrollLyricTo/fsubw/height:16px/OPT_MAX/height:140px/calc(100% - 18px)/display:none;overflow:hidden）；build-smtc-preset.py +（height:146px/cs-subw/height:17px/lyrTrackUntil/OPT_MAX）；smtc.ts CLIENT_VER 8.3.4 + EXTENSION_MODE 全量重建（组装器宿主 bundle 版本强制校验律）
- 【取证】verify-v834-panel.mjs 12/12（连跑两次：146px+mask 固定/subw 展开 0fr 收起/transition 含 height/非 display 硬切/on 行零提层防 raster 冻结/切行下方行零扰动 Δ=0/收敛终态/零 pageerror）；verify-v834-ext.mjs 16/16（长行行顶亮像素 1226/卡外 B 28-30 无溢出+卡内辉光 B=101 活着/播放键像素质心定位+点击翻转+3.8s>旧窗不复位+真值对齐仍▶/staged 法门五件/零 pageerror）；probe-subw.mjs 过渡探针（0fr 离散跳变实锤仪器）
- 【回归】九套全绿：v834 双（12/12+16/16）+ v833 双（11/11+9/9）+ v832 双（13/13+9/9）+ v831 ALL PASS + v830 ALL GREEN + v827-glow 14/14 + v827 全量 PASS（F15b 曾 203×2 确定性回归→提层反悔律后 245 恢复）
- 【发布】main + tag v8.3.4 + Release 七资产 SHA 回读 4/4；交付 download/v8.3.4/ 双落位（NewTab zip/cshz 8.3.4/桥 8.3.1 沿用/歌词源沿用/SHA256SUMS/双名说明/AllInOne）；worklog 外部压缩覆写→git checkout 恢复后再追加（Ritual 再验证）

Stage Summary:
- 新律：①grid fr 插值在本环境离散跳变——高度动画一律显式 length（0fr↔1fr 技巧不可信，实测说话）；②will-change 是 raster 冻结器：任何合成层常驻提层都锁首次栅格 scale，transform 静息缩放比≠1 的元素提层前必须对照实验测亮度/锐度（F15b 三态对照 245/203/203 入档）；③grid item 的 padding/margin 计入 0fr 轨道 min-content——轨道内间距走 line-height；④乐观窗「到期回落」是复位感制造机——真值对齐退役+顺延+硬上限三件套才是完整语义；⑤双表面动效修复必须同步核查「同码律」下的测试舞台代际（本轮 P3b 时序脆弱=feed 推进恰好越界，before 读取点留足余量）
- 交付：https://github.com/LXgssy/Start-chushi/releases/tag/v8.3.4
- 待办：用户实机验收（歌词不裁/高光不溢/切行不咯噔/播放键不复位）；Edge 商店提交材料仍未做
