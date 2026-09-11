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
Task ID: 96
Agent: main (Super Z)
Task: 用户实机反馈八连——①快捷服务进入网页浮窗不显示 ②弹簧太过（克制如「初始」、封面免回弹）③cover→mini 封面没有一镜到底 ④三态封面复位感清零 ⑤形变后高光突兀→渐入 ⑥弱歌（《不凡》）律动不明显 ⑦chushi-spectrum 启动慢+暂停即停 ⑧歌词动效对齐「初始」完全体（视频示例）——v8.3.1

Work Log:
- 【现场】真工作树 /tmp/my-project（dfa7c32=v8.3.0）；/home/z/work-v831 镜像编辑 + cp 回同步；hubsim/spectrumsim/llvm-mingw 20260826 在位
- 【取证③④】录屏复现真凶：cover→mini 形变途中只有暗壳、封面全程隐身——covClone 的 cloneNode 连内联样式一起走，而 display 切换（coverEl→none）先于克隆执行，clone 出厂即 display:none；v8.3.0 F31 只测了 full→mini（.cov 无内联 display 不受影响）所以假绿。修复 = covClone 无条件 display:block 拨正；复录封面全程在飞（形变 40% 走廊彩度 253）
- 【取证②④「复位感」】v8.3.0 弹簧 ζ≈0.58 ~10% 过冲：行程 200px 时冲过头 20px 再弹回 = 用户读作「复位/回弹」。克制化：壳弹簧 dock standard 同参（420/34，ζ≈0.83，~1% 微过冲）；封面 clone 临界阻尼（420/41，零过冲——用户「封面没必要有回弹」）；壳/封面统一时长 D（关键帧自带 offset，WAAPI updateTiming 拉伸同曲线，杜绝先到者 cancel 迟到者）
- 【⑤高光渐入】形变期 clone 携清零辉光 + paintGlow 把包络值写进目标态真封面（当时不可见、写值缓存被占）→ 落地 0→满格突兀。修：cleanup covClear 目标态 + glowRampAt 起点，paintGlow 按 smoothstep 480ms 渐入（brightness/saturate/scale 同因子）；像素取证晕彩度 64→90 渐亮
- 【⑥律动 AGC】弱歌隐形根因 = 固定增益对低电平歌增益不足。三轴峰值跟随天花板（攻=瞬间/放=×0.998-0.0004 每帧，地板 0.12），显示值=env/ceiling；《不凡》型弱鼓 nb→1.0、brightness 1.51（旧 ~1.06）、glow→1.0；响歌 nb 谷 0.10 动态保持；静音零放大；尖峰后 ~2s 天花板回收。agate-v831.mjs 四场景门全过；pow 0.85→0.75 + 增益上调（brightness 0.42/glow 0.68）
- 【⑧歌词动效】对齐「初始」完全体（用户视频逐帧考古：整列 ~400ms ease-out 上滑、入场行途中即亮）：当前行 scale 1.06/邻行 0.94 呼吸过渡（transform 不动布局，offsetTop 滚动数学不受影响）、滚动 .55s→.45s、行色 .5s→.35s
- 【①注入兜底】干净 Chromium 三路径（NTP 同签 <a> 导航/直接 goto/window.open）实测浮窗全过 = 环境性缺针（疑 Edge 启动加速）。兜底：manifest +scripting +http/https 通配 host（与 content_scripts 同域授权面零增量；用户删目录重解压更新流程无增量审批）；ext-bg ensureCardInjected（state||cards 门 + 15s/tab 节流 + 隔离世界 __chushiCardMounted 幂等守卫）× onConnect 首连 sweepInjectAll + tabs.onUpdated complete 补针
- 【⑦助手常驻】hub.dll keeper 政策重写：宿主（网易云）存活⟺keeper 存活，撤 120s 需求门，助手不在场即拉起（首拍 5s→1.2s、节拍 5s→3s）；chushi_spectrum.c IDLE_EXIT 60s 空闲自退整体拆除（进程生命周期=宿主生命周期，Job KILL_ON_JOB_CLOSE 随网易云回收）；引擎 CAP_IDLE_STOP 需求门原样保留=电流音律不破，暂停期摘管、复播 ~300ms 回位。版本 hub/spectrum 8.2.5/8.2.9→双 8.3.1，PLUGIN_VER_MIN/CLIENT_VER 8.3.1 强制升桥；PLUGIN_VER_MIN 校验对象是桥心跳 ne.v（hub 版本走 HUB_VER_MIN 8.0.0 宽门）
- 【门禁】build-extension.py 新特征门（display:block;position:fixed/SPRING_COVER/glowRampAt/envNorm/transform:scale(1.06)/updateTiming/scripting/http 通配）；build-v831-assets.py（桥 manifest/index.js/exe 8.3.1 + hub.dll md5≠8.2.5 基准 + exe 无 self exit 串 + hub 宪法门导入表零 COM）；agate-v831 AGC 四场景；build-hub-v831.sh（宪法门+新串在位+旧串退役）
- 【e2e】verify-v831-ext.mjs 14/14（F30r 克制弹簧峰值 324≤322+3 + 收敛 592ms∈[280,700]；F31c cover→mini 走廊彩度 253；F31d 渐入 64→90；F5c 零漂移 Δ0；F6 补针幂等 host=1；F32 常开增量 7）；v8.2.7 全量回归 31/31（F5b 两处 sleep 550→950——新收敛 592ms 超旧等待窗，且塌缩期 fromSurf pointer-events:none 期间 elementFromPoint 探不到=设计使然非回归）；面板律动真转发链 7/7；probe-quicklink 三路径显示全过
- 【交付】download/v8.3.1/ 六件：NewTab zip 12.3MB + 桥 .plugin（hub.dll fcd0d879 + spectrum 5785e64b）+ 歌词源 7.3.0 沿用 + 预设 8.2.9 沿用 + SHA256SUMS + 使用说明；/home/z/my-project/download/v8.3.1/ 双落位

Stage Summary:
- 新律：①cloneNode 连内联样式一起走——克隆时机与 display 切换的先后是隐形成真凶，克隆体必须显式拨正关键内联；②回归探针的等待窗必须随弹簧参数重校（收敛 416→592ms 让旧 550ms 等待全变假阴）；③塌缩形变期源壳 pointer-events:none，elementFromPoint 探针在形变期必然读 0——取证窗口要避开形变期或换像素法；④「复位感」的第一嫌疑是过冲回弹不是位置跳变——观感问题先量弹簧阻尼；⑤弱歌隐形用 AGC（峰值跟随归一）治，不硬抬增益（响歌会糊）；⑥环境性缺针用 SW scripting 补针兜底，幂等守卫在隔离世界全局
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
Task ID: 98
Agent: main (Super Z)
Task: 用户实机反馈两连——①v8.3.1 新加歌词动效没看到 ②缺「未播放/已播放歌词高斯模糊」——且动效要覆盖浮窗和「初始」面板——v8.3.2

Work Log:
- 【取证①】呼吸动效 v8.3.1 只落了浮窗（ext-card.js .fln scale 1.06/0.94），面板 music-widget.html 完全没动（仍 .55s 滚动/.5s 行色、无呼吸无模糊）——用户常看「初始」面板=「没看到」真因；且浮窗 13.5px 字号 ±6% 缩放本就难辨，缺模糊衬托
- 【实现①②】双渲染层同律：①高斯模糊景深三档——未唱 blur(2px)/已唱 blur(1.1px)/当前行 blur(0) sharp，filter .45s 同曲线过渡（cubic-bezier(.22,1,.36,1)）与呼吸缩放叠加；②面板补呼吸 scale 1.06/0.94 + 三档模糊 + 滚动 .55s→.45s + 行色 .5s→.35s（CSS 与 JS 内联 transition 五处同步——面板 lyInr.style.transition 内联覆盖 CSS，漏改 JS 等于白改）
- 【门禁】build-extension.py VERSION 8.3.2 + blur 三档特征门；build-smtc-preset.py 面板五特征门（scale/filter/双时序）；build-v832-assets.py 资产组装（桥 8.3.1/歌词源 7.3.0 沿用+校验，cshz 8.3.2 新建）；EXTENSION_MODE 全量重建（smtc.ts CLIENT_VER 8.3.2 入包——资产组装器强制校验宿主 bundle 版本号，漏重建必拒）
- 【e2e 新门】verify-v832-panel.mjs 13/13（CDP 跨源直查 opaque iframe computed style：blur 三档精确值+matrix(1.06/0.94)+双时序+滚动位移+零报错）；verify-v832-ext.mjs 9/9（closed Shadow DOM 像素取证：逐行边缘能量剖面，当前行 35.2 vs 相邻行 0.7=50 倍锐利差、峰值亮度 244 vs 59，位置推移 6.2→12.4 效果跟随=动态景深非静态样式）；存量回归 v831 专项 14/14 + v827 全量 31/31（一次偶发 FAIL 无失败项复现，连跑两次全 PASS 判定时序抖动）+ 面板律动 7/7
- 【取证器三坑】①hubsim 端口绑定前 POST /api/lyric 静默丢失→ping 就绪重试；②真桥 /api/lyric 响应形={ok:true,lyric:{...}} 包装（SW 解 j.lyric），裸 body=永远「暂无歌词」；③shim whitelist 走 ensureParsed 只认原始 yrc/lrc 文本，预解析 lines 被静默丢弃——面板测试必须喂原始 lrc
- 【发布】download/v8.3.2/ 七件（NewTab zip/preset 8.3.2/桥 8.3.1 沿用/歌词源沿用/SHA256SUMS/双名说明/AllInOne）；repo worklog 提交前发现被外部同步进程覆写丢 Task 96 段→git checkout 恢复后再追加（双 worklog 律的同步反向坑）

Stage Summary:
- 新律：①动效类需求「覆盖 A 和 B」必须双渲染层同版交付——单侧落地=用户必看不到；②JS 内联 style.transition 会覆盖 CSS transition，改时序必须双处同改；③closed Shadow DOM 用像素能量剖面取证（锐利/模糊 50 倍差），opaque iframe 可 CDP 直查 computed style；④mock 桥响应形必须对齐真桥包装（{ok,lyric}），裸形=静默空转；⑤worklog 会被外部同步覆写——提交前 git diff worklog 是新 Ritual
- 待办：用户实机验收（浮窗+面板双端歌词动效）；Edge 商店提交材料仍未做
