# AI-HANDOFF — 给下一个读这个仓库的 AI / 开发者

> 最后更新：v8.0.3（2026-09-08，控制末端加固四联修：按钮扩宽+指针序列+元素复验 / 悬停律 / 中文逐字根修 / 只读进度条）。写给你的：无论你是人类贡献者还是 AI 助手，
> 这一页是项目的「当前状态 + 下一步该干什么」的单一事实来源。
> 动手前请先读完本页，不要凭想象改架构。

## 项目一句话

「初始 / Start-chushi」：Next.js 15 新标签页（网页 + Edge MV3 扩展双形态），
其中 SMTC 音乐面板显示网易云播放真值（进度/逐字歌词）并可控播。
**v8.0.0 = 自研 SMTC 全面退役 + InfLink-rs 适配**：系统媒体卡片由第三方 Rust 插件
**InfLink-rs**（网易云市场可装）独占持有，本项目代码零 WinRT/零 SMTC（构建门断言）；
ChuShi Music Bridge 8.0.0 以 `window.InfLinkApi` 为第一真值源、控制主路走 InfLinkApi，
内置零 WinRT 纯 winsock hub.dll 承接页面数据通道（127.0.0.1:26901-26903）；
插件 B/C 与页面音乐 API 纯 JS 零 Node。五层零复用原则延续：每代全部从零新写。

## 宪法（用户硬性指令，永远生效）

1. **不许复用老代码**——插件/桥/宿主数据层每代全部删除重写，构建门断言老符号零残留。
2. **系统媒体卡片归 InfLink-rs（v8.0.0 起用户指令）**——自研 SMTC 永久退役；
   本项目任何代码不得持有/创建/驱动 WinRT SMTC 会话，系统卡片完全是
   InfLink-rs 的领域；网易云自带 SMTC 开关开或关均无关（InfLink-rs 劫持接管）。
3. **插件命名语言三律分立**（构建门分别断言）：插件 name 英文（ASCII）、
   介绍/描述/面板文案中文、.plugin 文件名 ASCII。
4. **「重写」验收 = 构建门**：老符号零残留断言，不是口头承诺。
5. **【v7.1.0 新增·v8 升格为全域】零 WinRT**——本项目全部产物（DLL/JS/页面）
   零 WinRT/零 COM（hub.dll 导入表断言无 combase/ole32/winrt，仅 ws2_32+kernel32+ucrt）。
6. **【v8.0.0 新增】数据枢纽是不可删的结构性必需件**——CEF 渲染进程无法监听端口
  （v7.0.0 实锤），网易云↔浏览器的唯一可行通道 = 本地 HTTP 枢纽；v8 起枢纽载体
   = 音乐桥内置 hub.dll（纯 winsock，零 WinRT 结构性无崩溃面）。

## v8.0.3（当前版）：控制末端加固四联修（按钮 / 悬停 / 中文逐字 / 进度条）

**取证链**：用户复测反馈「双语歌词已好（部件层修复生效）但按键仍死、悬停变黑位移仍在、中文无逐字」——修复生效面分布揭示了「用户重导了 cshz 但未必换了插件」的交付学新律。

- **①交付分层律**：控制修复住桥插件、显示修复住预设部件——用户重导 cshz 只会让显示修复生效；「歌词好了按键还坏」正是插件未换的特征组合。应对：a) 部件新增**控制诚实反馈芯片**（点击后 3.2s 真值未翻转即亮红芯片：pluginVer<8.0.3 → 「音乐桥插件 vX 控制能力不足·请更新插件并完全重启网易云」；否则「控制已下发但网易云未响应·请完全重启网易云」；POST 失败即亮「音乐桥未连接·控制未送达」）——把「没反应」变成可归因反馈；b) smtc.ts PLUGIN_VER_MIN → 8.0.3，旧插件持续亮「组件待更新」芯片。
- **②桥 8.0.3 末端加固**：a) 按钮候选扩宽——aria-label/title 中文关键词（播放/暂停/下一首/上一首）+ class 模糊匹配（NCM 3.x 改版 DOM 兼容）+ **列表类误中保护**（aria-label/title 含「列表/队列/清单/歌单」的一律跳过，防误点播放列表）；b) 点击改**完整指针事件序列**（pointerdown→mousedown→pointerup→mouseup→click，部分 React 处理器只听鼠标事件）；c) toggle 元素路径 +700ms 复验——**元素自身 paused 即算生效**（播放态真值可能冻结），双真值（全局 playingNowCalc + 元素 el.paused）都未达预期才走末端按钮，防双翻转（元素已停再点按钮=恢复播放）。
- **③主键悬停律**：`.cs-b:hover{background:var(--card2);color:var(--ink);transform:scale(1.06)}` 与主键 `.cs-bmain{background:var(--acc);color:#fff}` 同特异性(0,2,0) vs (0,1,0)——hover 规则胜出 → 暗色主题 card2 半透暗底盖 accent（变黑）+ 图标变色 + scale 读作位移。修复 = 主键后置 `.cs-bmain,.cs-bmain:hover{color:#fff;background:var(--acc)}` + `.cs-bmain:hover{filter:brightness(1.12);transform:none}`。新律：嵌套按钮组的 ：hover 全局规则必须显式豁免强调色主键，同特异性时靠源码顺序。
- **④中文逐字根修（歌词源 7.1.0）**：a) klyricToYrc 旧版输出 LRC 式逐词时间戳 `[mm:ss.ff]词…`，音乐核心 parseWordLine 只认 yrc 轴 `[s,d](s,d,0)词` → 中文歌（klyric 为主力逐字源）整首退化行级——**转换器产出必须按消费方解析器格式**（往返单测入门禁）；b) eapi 请求补 `credentials:'include'`（yrc 只对登录会话下发；官方 web 播放器同款）；c) 新增同源 web v1 备路（music.163.com 自带 cookie，免加密免 CORS）；取词阶梯 = 带凭据 eapi → 同源 web v1 → 匿名 eapi → channel → 公开旧接口。
- **⑤进度条被动化**：用户决策「网页端不提供拖动调节就别暗示可拖」——滑块/拖拽删除只留只读填充条；seek 交互删除但 mus.seek API 保留（供其他预设脚本）。seekNote 芯片位改作控制反馈芯片。
- **发版**：插件门 37/37 + e2e 40/40 + 渲染台架 17/17（probe-widget-v803.mjs：悬停三断言+进度条三断言+控制反馈三态+歌词回归）+ klyric→yrc 往返单测 + Release id=384686520（6 资产逐个 sha256 核验）+ 文叔叔 https://c.wss.ink/f/ktr2viap0gj + Pages（4d24854）+ main 4d24854。

## v8.0.2（历史）：实机对症三联修（按键 / 状态脱同步 / 双语歌词）

**取证链**：用户 30s 录屏逐帧 + hub/桥日志 + InfLink-rs 3.2.11 .plugin 解包源码解剖。三方证据闭环。

- **①按键全坏的终局根因**：InfLink 控制面 = `window.InfLinkApi` 方法体内 `this.reduxStore?.dispatch(...)`——`playing/resume`、`playing/pause`、`playingList/jump2Track(flag±1,hotKey)`、`playing/setPlayingPosition(duration秒)`。部分网易云 3.x 版本上这些 action 被 reducer **静默忽略**（?. 链吞错），而数据读取走同一 store 正常 → 现场呈「数据活、按键全死」。v8.0.1 的「命令解析双形兼容」修的是命令**到达**桥的问题；v8.0.2 修的是命令**执行后无声无息**的问题。
- **②桥 v8.0.2 控制律（验证+三级备路）**：下发（InfLink 主路）→ +900/+1200ms 延时验证（播放态真翻转 / 曲目号变化）→ 不动则直发 dva action（动词逐字抄 InfLink 3.2.11）→ audio 元素 → 末端可见按钮。cmdSeq 代数号闸防旧验证链串扰；cmdTrace 12 条环形轨迹进 `__chushiMusicBridge.debug()`。方向真值优先本桥 truth 快照（1Hz 新鲜，含自愈），不再盲信可能冻结的 getPlaybackStatus。
- **③时间线自愈律**：InfLink 报 Paused 但进度推进 ≥1.2s/拍（同曲+拍间 <4s）→ 按播放处理（metaSrc=inflink+heal）。只治假暂停，绝不反向伪造。修「面板▶/黄灯与真实播放同屏矛盾」。
- **④歌词单高亮律**：逐字歌词行离场必须回落灰（`.cs-ln.done` + 遮罩归零），不许保留 100% 全亮遮罩——否则回声行/重复句呈双高亮。间奏（lineIndex=-1）维持已唱进度；seek 倒回自动还原未唱行。翻译只挂当前行（.cs-sub 仅 .on 显示）。
- **⑤封面 http→https**：网易云封面 http URL 被 https 页面按混合内容策略丢弃（恒显默认底的根因）；桥端升级 `http://*.music.126.net` → https + 协议相对(//)补全。
- **e2e 工作树纪律**：verify-v8-e2e.ts 从 `.wt-v7` 工作树读桥/客户端源码——发版前必须同步该工作树（本次漏同步差点假绿复辟）。
- **发版**：插件门 35/35 + e2e 40/40 + 渲染台架 8 断言（probe-widget-v802.mjs，沙箱链路截图 + 直渲染 stub 双通道）+ Release id=384636131 + 文叔叔 + Pages（smtc chunk deec180a 含 8.0.2 已核验）+ main 008174c。

## v8.0.1（历史）：音乐链路三连修

用户真机三反馈的根因与修复（细节见 worklog Task 99）：

1. **控制失效** = 桥对 hub 实物命令协议 `{"_id",raw:{...}}` 误用 `JSON.parse`（raw 是对象，parse 必抛）→ 全部控制命令被静默丢弃。**e2e mock 曾用扁平形状（无 raw 包装）——mock 与实物协议分叉使测试全绿假象**。修：双形兼容；e2e mock 改实物同形。新律：mock 必须实物协议同形。
2. **间歇掉线** = hub 单线程 accept 循环被浏览器预连接空连接阻塞 3s > 页面 1.4s×2 连败判掉线。修：hub 空连接 400ms select 快关 + recv 500ms + TCP_NODELAY；页面超时 2.2s/3 连败；桥 jpost 补 2.5s 超时（无超时+beatBusy 闸=一次挂起永久哑掉）。
3. **面板显示异常**（封面铺满/无标题）= v6+ 部件把 .cs-pic 从 flex 直接子元素降级为嵌套 span，行内宽高失效 → img width:100% 按包含块解析铺满全板、标题列 0 宽；sandbox shim 前置 doctype 致全代 quirks 模式放大。修：.cs-pic display:block + 默认封面 data-URI 内联 + shim 移 doctype 后。新律：尺寸关键元素必须显式块化；srcdoc 拼 shim 必须在 doctype 之后。
4. **架构考古**：InfLink-rs 官方包 = backend.dll(x86) + backend.dll.x64.dll 双架——主流网易云 2.x 为 32 位进程；本仓 v7/v8 原生 dll 只发过 x64（在 32 位机从未加载成功）。BetterNCM v2 的 "dll doesn't exists or is not adapted to this arch" = LoadLibrary 两连败统一文案。x86 hub.dll 构建暂停（clang i686 SEH×DWARF EH 后端崩溃，见 worklog Task 99）。

## v8.0.0（当前版）：自研 SMTC 退役 · InfLink-rs 适配

背景：v7.2.0 后用户再报四症状（加载久/市场打不开/卡片无信息/点暂停卡片消失），
第五轮修复启动前用户改向：「InfLinkrs-3.2.11 插件有 smtc 功能，直接舍弃自写的 smtc，
让音乐桥和 API 都去适配这个插件」。

- **InfLink-rs 3.2.11 考古**（.plugin = zip：index.js 532KB + backend.dll Rust）：
  - 前端 React 应用挂载 **`window.InfLinkApi`**：`version/getCurrentSong/
    getPlaybackStatus/getTimeline/getPlayMode/getVolume/play/pause/stop/next/
    previous/seekTo(ms)/toggleShuffle/toggleRepeat/setRepeatMode/setVolume/toggleMute/addEventListener`。
  - 形状（从 bundle 反解）：getCurrentSong → `{songName, authorName, albumName,
    cover:{url}|null, ncmId, duration(ms)}`（播客未同步时 **throw**，须 try/catch）；
    getPlaybackStatus → 字符串 `"Playing"/"Paused"/"Loading"/"Error"`；
    getTimeline → `{currentTime(ms), totalTime(ms)}`（1Hz 节流）或 null。
  - 后端 `betterncm_native.native_plugin.call('inflink.dispatch',[JSON])`，命令
    UpdateMetadata/UpdatePlayState/UpdateTimeline/UpdatePlayMode/EnableSmtc/…；
    事件回调 registerEventCallback。**backend.dll 无 HTTP/落盘对外通道**（无
    axum/hyper/bind 字符串）——故页面数据通道必须自建（见宪法 6）。
- **ChuShi-SMTC-Manager 退役**：v7 全部原生产物（smtc_native.dll/broker exe）从
  产线删除；构建门 OLD_SYMBOLS 清单断言零残留。
- **ChuShi Music Bridge 8.0.0**（slug 不变，manifest `native_plugin: hub.dll`）：
  - hub.dll（bridge/v8/native/chushi_hub.c 全新编写，~500 行）：仅 winsock2+kernel32+ucrt；
    Main 进程（ptype=0x1）互斥体当选（Renderer=0x10 静默）；26901→26902→26903 退让；
    四端点 ping/state/cmd/lyric（state 1MB/lyric 1MB/单命令 8KB/队列 32 深度）；
    CORS *+PNA；accept 循环整体 SEH 自愈；hub-log.txt 1.5MB 轮转；
    BetterNCMPluginMain 零阻塞（CreateThread 即返）。
  - index.js v8：真值 = InfLinkApi 主源（三件套，播客 throw 当无歌）→ 五层阶梯
    只填空缺；物理自愈（进度走=在播）仅限阶梯路径；控制主路 InfLinkApi
    （play/pause/toggle 按元素/真值现状定方向，已处目标态=主路完成禁走备路；
    seek=seekTo(ms)+元素双读回 seekAck），备路 audio 元素+可见按钮；
    **beat 探针先行律**：probeInflight 必须在拉命令前执行（首拍/InfLink 重载后
    命令不得落在空探针上——e2e 抓出）；心跳 1Hz：保活→探针→拉命令→读真值→推 state；
    歌词 cc:lyric-req/res 协议与 LRU4 缓存不变。
  - 状态 blob：`{ok,name:'chushi-music-state',v:'8.0.0',ts,ne{…},smtcVer:inflinkVer,
    inflinkVer,version:hubVer,hubVer}`。
- **smtc.ts v8**：公开面（SMTC_PORT/SmtcTrack/SmtcState/SmtcLyric/SMTC_COMMANDS/
  smtcPositionNow/smtc）字段级兼容零改动；HUB_NAME='chushi-music-hub'，
  HUB_VER_MIN=PLUGIN_VER_MIN='8.0.0'；cleanNe 不变；`smtcVer = ne.inflinkVer`
  （InfLink-rs 版本，空=未装）；needsBridge/needsPlugin/engineOld 语义不变。
- **预设**：music-widget.html 两处文案（「安装 InfLink-rs 与初始插件…」/页脚
  「InfLink-rs vX」芯片），.cshz 重建（17943/1443 字符限额内）。
- **验证**：插件门 31/31（G5 导入表零 WinRT/G6 零老符号/G7 v8 契约/PE 导出解析）+
  e2e 39/39（A 客户端公开面/发现/快照/控制/歌词；B 桥 vm 白盒 InfLinkApi 全链
  含命令主路 seek=100000ms 断言；C v7 老身份否定门）+ Next 构建（TS 门）。
- **验证环境坑（新）**：bun 1.3.14 对大型 TS 模块的**原始值 export 命名空间绑定
  有缺陷**（SMTC_PORT 等读出 undefined，模块内部值完好）——测试只依赖
  `{smtc, SMTC_COMMANDS}`（绑定正常）；v7 坑9 重申：bun 测试环境必须
  `globalThis.window = globalThis` 垫片，否则 SSR 守卫拦截 start()。

## v7.2.0（历史）：raise 路径 SEH 全覆盖 + 「未知曲目」根治

用户真机日志（broker-log + native-log）证明 v7.1.0 架构成功：零崩溃弹窗，
broker 干净启动、会话注册成功、B→broker HTTP 链路通。剩余两问题定位与修复：

- **「未知曲目」真相**：卡片上那四个字就是 broker 的 fallback 字符串——
  插件B 的 dva store 探针依赖 webpack4 的 `require.c`（模块缓存），
  **webpack5 已移除该属性** → store 永远找不到 → 歌名全空 → 空 title 走
  `L"未知曲目"` fallback 上卡。修复（插件B 7.1.0）= 真值源五层阶梯：
  ① React fiber 树查找（任意元素 `__reactFiber$` → 根 fiber → BFS 找
  react-redux Provider 的 `props.store` = dva store，webpack5 可靠路径）
  ② webpack4 老探针（兼容） ③ `window.g_app` ④ `navigator.mediaSession.metadata`
  ⑤ 播放条 DOM 刮削（封面/标题/歌手，3s 缓存）。broker 侧：全空元数据一律
  不上卡（保留上一首真实信息）。另有 safePlay：CEF 自动播放策略拒绝
  el.play() 时降级点击本体播放/暂停按钮。诊断口：
  控制台 `window.__chushiMusicBridge.debug()` 返回五层源命中情况。
- **卡片消失（点按钮后）**：ButtonPressed/Position 系统事件 raise 发生在
  broker 消息泵 `DispatchMessageW` 内部，v7.1.0 该路径无 SEH——系统回调
  路径任何 AV 会静默杀死 broker（SEM_NOGPFAULTERRORBOX 压掉 UI）→ 会话
  销毁 = 卡片消失。修复（插件A 7.2.0）= 泵循环体整体 GUARD + conn 线程
  GUARD + `SetUnhandledExceptionFilter` 最后防线（先落 UNHANDLED 日志再退场）
  + 重启退避封顶 8s→4s（卡片 5 秒内自愈）。
- **可观测性**：`[evt] raise-button/raise-seek/status-set`（前 20 条全记 +
  每 50 条记 1）、`[meta] applied title='…'`（每次元数据变更含歌名前 40 字）、
  监督者计时日志（extract/ping 耗时）。下轮报障日志直接给精确位置。
- **加载慢澄清**：三进程 250ms 内完成加载、全异步非阻塞；市场打不开 =
  BetterNCM 市场源境外网络问题（与插件无关）。监督者改为先释放 exe 再探测。

## v7.1.0（独立 broker 进程——四代崩溃的终局答案）

四代崩溃因果链：v7.0.0 缺 RoInitialize（combase AV）→ v7.0.1 TimelineProperties
误判值类型栈传（WMM AV）→ v7.0.2 ABI 全对（windows-rs 逐槽核实）仍崩：反汇编实锤
崩溃在 RoActivateInstance(TimelineProperties) 成功后对系统对象 QI 的路径上、
AV 于 Windows.Media.MediaControl.dll 内部——我们侧全对，故为宿主进程内 COM/SMTC
环境被污染（网易云本体 SMTC 会话 + 其它插件共存）。

结论：问题不可在宿主进程内修复，只能隔离。v7.1.0 布局：
- `ChuShiSMTCBroker.exe`（bridge/v7/native/chushi_smtc_broker.c）：独立进程承载
  全部 WinRT/SMTC + HTTP 枢纽（协议与 v7.0.2 完全一致，B/C/页面零改动）。
  STA(RoInitialize(1)=SINGLETHREADED) + 隐藏窗口 + GetForWindow（Firefox 同款序列）；
  时间线对象一律自实现 CCW（TpObj，绝不再激活 TimelineProperties 系统类）；
  全链 HRESULT 检查 + GUARD 宏 SEH 包裹（AV=记日志后 ExitProcess(2)，无 WER 弹窗）；
  单实例互斥体；`--parent <pid>` 看门狗（父死即退）；`--log` 指定 broker-log.txt。
- 插件 A DLL（chushi_smtc_native.c 重写为监督者）：零 WinRT 零 SMTC——选举
  （互斥体同 v7 名）→ 从内嵌 blob（构建期生成的 chushi_broker_blob.h）释放 exe 到
  `%LOCALAPPDATA%\ChuShiSmtc\` → CreateProcess → 看护（滚动 10 分钟 ≤5 次重启预算，
  防崩溃循环）；发现旧版 broker 在跑 → /api/ping 验版本，异版 POST
  /api/broker/shutdown 再拉新；渲染进程诊断 API 契约不变（ChuShi.Smtc.info，
  新增 broker 子对象）。
- ABI 防回归：broker 源内 23 条 `_Static_assert(offsetof(Vtbl, ...))` 编译期证明
  全部槽位布局（构建门 G11），比反汇编模式匹配更强。
- 生命周期：网易云启动 → DLL 释放+拉起 broker（CREATE_NO_WINDOW）→ broker 注册
  系统会话；网易云退出 → 看门狗 → broker 退出（会话随宿主消亡，无僵尸卡片）。
- 已知取舍：系统卡片封面经 Uri→RandomAccessStreamReference 工厂链（槽位已按
  windows-rs streams.rs/foundation.rs 核实 + 全 hr 检查，失败仅丢封面不丢元数据）。

### v7.1.0 真机排障路径
1. `native-log.txt`（监督者）：boot(elected as supervisor) → sup(broker exe ready)
   → sup(broker spawned pid=N)。若 seen 「restart budget exhausted」= broker 持续
   崩溃，去看 broker-log。
2. `broker-log.txt`（broker）：boot → smtc(RoInitialize ok (STA) → GetForWindow OK)
   → http(listening on 26901) → upd(timeline applied) / [cover] 降级行。
   `[seh] AV 0x...` 行 = broker 崩溃点（监督者会自动重启，宿主无感）。
3. `GET http://127.0.0.1:26901/api/smtc/status` → smtcReady/metaApplied/updApplied。
4. 任务管理器应见 ChuShiSMTCBroker.exe；网易云退出后它应在数秒内消失。

## v7.0.0 翻案（本代核心结论，用户第 12 轮反馈触发）

用户真机：「三个插件完全是坏的，甚至 smtc 插件连 windows 都读取不了」。
根因确诊（一手源码实证，不是猜测）：

1. **BetterNCM v2 是 CEF 架构，渲染进程没有 Node**（源码 NanoRocky/BetterNCM
   v2 分支：cef_v8value_t 注入、无 nodeIntegration）。v6 的
   `require("http")` 枢纽在真机第一行就炸 → 页面必然无数据。
   「v5 已实证渲染进程有完整 Node」是错误结论，本代作废。
2. **`navigator.mediaSession` 在该环境不产生 Windows 系统媒体卡片**
   （NCM 禁用/无 media element 关联）→「Windows 都读取不了」。
   **原生能力必须原生 DLL**，这是唯一可靠路径。
3. **BetterNCM 原生 ABI**（实测）：导出 `void BetterNCMPluginMain(PluginAPI*)`；
   `PluginAPI{int(*addNativeAPI)(NativeAPIType[],int,const char*,char*(*)(void**));
   const char* betterncmVersion; NCMProcessType processType; const unsigned short(*ncmVersion)[3]}`
   （x64 指针传参）。native_plugin 只在 `processType & Renderer` 时真正注册
   API（其它进程是 addNativeAPIEmpty）。JS 端
   `betterncm_native.native_plugin.call("id",[args])`：第二参必须数组且
   **参数个数严格等于 argsNum**（否则 throw）；调用发生在 V8 主线程，
   **必须立即返回**（我们的 DLL 全部走工作线程队列）；返回 char* 会被
   拷贝成 JS 字符串（用静态缓冲，勿泄漏）。
4. **BetterNCM 过滤链**（v2 PluginManager.cpp）：manifest_version==1 →
   slug → disable_list → 重复 → `isNCM3 && !ncm3-compatible → 静默跳过`
   → ncm-version-req（默认 `> 2.10.2`）。native_plugin 非空时每次启动
   重新解压覆盖（JS-only 插件则是先 remove_all 再解压）。
5. **GitHub Release 资产文件名吃非 ASCII**：中文名上传后变成
   `ChuShi-v7.0.0-.zip` / `SMTC.cshz` 这类残缺名（不报错！）。
   Release 资产一律 ASCII 名（AllInOne/Preset 等），SHA256SUMS 与
   资产名一一对应。

## v7.0.0 组件拓扑（谁跟谁说话，谁拥有什么）

```
[网易云主进程 cloudmusic.exe]
  └─ smtc_native.dll（ChuShi SMTC Manager 的原生模块，processType=Main）
      ├─ Host 选举（命名互斥体；Main 先加载天然当选；GPU/Utility 静默）
      ├─ SMTC 线程：RoInitialize(MTA) → 隐藏窗口 → GetForWindow →
      │    独立系统会话（媒体键 ButtonPressed / 可拖 PlaybackPositionChangeRequested）
      │    元数据=DisplayUpdater（Music 属性+AlbumTitle(QI v2)+封面 CreateFromUri）
      │    时间线=TimelineProperties（Min/MaxSeekTime 必设）+ 本地 100ms 定时合并应用
      ├─ HTTP 枢纽线程：127.0.0.1:26901（占用退 26902/26903），CORS * + PNA
      │    GET  /api/ping        身份（name=chushi-smtc-hub, version, host）
      │    GET/POST /api/state   页面状态快照（插件B 推，页面拉，原样中继）
      │    GET/POST /api/lyric   歌词缓存（插件B 推，页面拉）
      │    GET/POST /api/cmd     页面→插件B 命令队列
      │    GET  /api/smtc/events 系统事件（媒体键/拖动）→ 插件B 排空
      │    POST /api/smtc/update 插件B → SMTC（urlencoded，标题/封面/状态/pos/dur）
      │    GET  /api/smtc/status SMTC 诊断（ready/updApplied/lastHr）
      └─ 事件回调线程（WinRT 线程池）→ 仅入队，绝不跨线程调 WinRT

[网易云渲染进程（CEF V8，无 Node）]
  ├─ 插件A index.js（探针）：ChuShi.Smtc.info 原生 API → cc:smtc-info 事件
  ├─ 插件B ChuShi Music Bridge（纯 JS）：
  │    真值 = audio 元素粘滞锁 + dva store 只读探针（webpackJsonp /
  │      webpackChunk* 双格式捕获 __webpack_require__ → 扫模块缓存找
  │      getState().player；多键位兼容读取 meta.currentSong 等）
  │      + 物理自愈（进度走=在播，>1.2s 窗）
  │    控制 = 元素 play/pause；next/prev 可见按钮；seek=currentTime
  │      全文件唯一写点 + 420ms/1s 双读回 → seekAck 诚实上报
  │    1Hz 心跳 = 排空 /api/cmd + /api/smtc/events → 执行 →
  │      POST /api/smtc/update + POST /api/state（含 smtcVer/hubVer）
  └─ 插件C ChuShi Lyric Source（纯 JS）：
       eapi /api/song/lyric/v1（自实现 MD5 + AES-128-ECB，纯 JS）
         → channel.call("track.lyric.getinfo") → 直连 /api/song/lyric
         三层回退；klyric→yrc 转换；LRU 8 + localStorage；reqId 配对应答

[「初始」页面（web / Edge MV3 扩展）]
  └─ smtc.ts v7：/api/ping 三端口发现粘滞 → 1Hz 轮询 /api/state →
       一次性年龄补偿直显（零仲裁零守卫）；控制 POST /api/cmd；
       歌词 GET /api/lyric；诚实归因芯片（needsPlugin/needsBridge/smtcVer）
```

**数据律（v7）**：
1. 页面唯一数据源 = `/api/state` 的 `ne`（一次年龄补偿后直显）。
2. 端口发现靠 `/api/ping` 身份（name=chushi-smtc-hub）而非端口猜；三端口
   顺序探测 + 粘滞；扩展 host_permissions 三端口齐备（26901/26902/26903）。
3. 全链路诚实降级：任一环节缺席，`/api/state` 对应字段为空/为 false，
   面板芯片如实归因，绝不假装在线。
4. 原生 DLL 内的 WinRT 调用只发生在 SMTC 线程；事件回调线程只入队；
   HTTP 线程只碰自己的互斥锁保护的数据——三条线程三份职责。

## 构建产线（改完代码必走全）

```
0. bash scripts/build-smtc-native.sh           # 原生 DLL 编译（llvm-mingw）+ 导出表断言
1. node scripts/verify-v7-g1.js                # 语法门 + 纯 JS 密码学向量门 + 纪律门（26 项 ×2）
2. python3 scripts/build-v7-plugins.py         # 三插件打包 + BetterNCM 过滤链模拟器（37 项）
3. bun run build                               # Next 生产构建（TS 门）
4. EXTENSION_MODE=1 bun run build:extension && python3 scripts/build-extension.py
5. python3 scripts/build-v5-preset.py          # .cshz（DOM/CSS 字节不动）
6. bun scripts/verify-v7-e2e.ts                # mock 原生枢纽 e2e（21 项 ×2）
7. python3 scripts/build-v7-assets.py          # 交付七件套 + SHA256SUMS + 使用说明
8. ② ⑥ 两轮全绿才准发版
```

发布四件套（照抄）：commit/push main → `bash scripts/deploy-pages.sh`（线上
grep 指纹：chunk 内 `26901|chushi-smtc-hub`）→ `python3 scripts/rel-v7.py`
+ `rel-v7-fix.py`（**资产必须 ASCII 名**；uploads.github.com 直传 + 逐资产
SHA-256 校验）→ 文叔叔 `scripts/pw-lab/wss-send.py <合并包>`。
**Release 资产名单（v7 固定）**：ChuShi-SMTC-Manager-7.0.0.plugin /
ChuShi-Music-Bridge-7.0.0.plugin / ChuShi-Lyric-Source-7.0.0.plugin /
ChuShi-NewTab-v7.0.0.zip / ChuShi-Smtc-Preset-7.0.0.cshz /
ChuShi-v7.0.0-AllInOne.zip / SHA256SUMS.txt。

## 版本兼容矩阵

| 宿主页面 | 枢纽/真值来源 | needsPlugin 门 | needsBridge 门 | 插件版本 |
|---------|--------------|----------------|----------------|---------|
| v7.0.0 | DLL HTTP 枢纽 26901-26903 + 插件B ne.v | < 7.0.0 | ping 身份不符或 hubVer < 7.0.0 | 7.0.0 三件套 |

- 枢纽不可达 = needsBridge（装/更新 SMTC Manager 后完全重启网易云）。
- ne 心跳缺失/ne.v < 7.0.0 = needsPlugin（更新 Music Bridge）。
- 版本各查各的活源：枢纽=ping.version+state.hubVer；桥=ne.v；
  SMTC=state.smtcVer（插件A 探针 cc:smtc-info 心跳）。不猜、不缓存。
- **迁移**：v7 三插件与 v6/v5 不同 slug/同 slug 但内容全新——升级必须
  **删光旧 .plugin** 再装新（同 slug 目录覆盖 + 旧包反向覆盖风险）。

## 已知坑（本代新坑 + 沿用铁律）

20. **（v7 新）CEF 渲染进程无 Node**：任何 `require(` 在真机直接
    ReferenceError。插件只许用页面 JS + `betterncm_native`。
21. **（v7 新）navigator.mediaSession 不是系统会话**：Electron/CEF 里
    metadata/positionState 不出 Windows 卡片；需要系统级集成必须原生 DLL。
22. **（v7 新）BetterNCM native_plugin 线程律**：原生 API 回调在 V8 主线程，
    立即返回；WinRT 全部在工作线程（MTA RoInitialize）；事件回调线程
    只入队。跨线程违规 = 随机崩溃。
23. **（v7 新）GitHub Release 资产名吃非 ASCII**：不报错地截断
    （`合并交付包.zip`→`.zip`）；上传后必须按 API 资产名单逐个校验。
24. **（v7 新）C 宏参数里的花括号逗号会被预处理器拆参**：
    `DEFINE_GUID(x, 1,2,3,{4,5,...})` 实际按逗号拆成多参产生双花括号
    嵌套（clang 报 excess elements in scalar initializer）。GUID 逐字节
    传参，宏体内加花括号。
25. **（v7 新）llvm-mingw 头文件已有 HSTR/HRESULT/S_OK**：自定义 WinRT
    垫层必须用系统类型（HSTRING=DECLARE_HANDLE）；`boolean`=1 字节
    unsigned char；WinRT 枚举=4 字节 int。
26. **（v7 新）SMTC v1 vtable 序与老版本不同**：16299 的
    ISystemMediaTransportControls 是 get_DisplayUpdater 属性 +
    IsRecordEnabled 在列 + Previous 在 Next 之前——**必须按 SDK 头
    实际槽位序**写 vtable，凭记忆写必死（本代逐槽位对照 16299 头文件）。
27. **（v7.0.2 终局实锤，推翻 v7.0.1 结论！）TimelineProperties 是【可激活 runtime class】，UpdateTimelineProperties 的 ABI 参数是接口指针**：
    v7.0.0 误判为接口却未初始化 apartment 就 RoActivateInstance（combase AV）；
    v7.0.1 又误判为「struct 值类型」栈上直传——**这个结论也是错的且继续崩**
    （网易云 Windows.Media.MediaControl.dll AV，栈 smtc_native.dll+0x266E 实锤，
    objdump 定位 = apply_op 里 UpdateTimelineProperties 的 call *0x60 内部）。
    真相（windows-rs master 投影源逐行实锤）：
    `SystemMediaTransportControlsTimelineProperties` 是【可激活 runtime class】
    （FactoryCache 默认构造 + RuntimeName），默认接口 =
    `ISystemMediaTransportControlsTimelineProperties`
    （{5125316A-C3A2-475B-8507-93534DC88F15}，IInspectable + StartTime/EndTime/
    MinSeekTime/MaxSeekTime/Position 五对 get/put，getter 在前，无 LastUpdatedTime）；
    `UpdateTimelineProperties` 参数 = 该接口的 COM 对象指针——传裸栈结构体 =
    系统把前 8 字节当虚表指针解引用 → 必崩。v7.0.2 正解：RoActivateInstance(类名)
    → QI → 逐属性 put → UpdateTimelineProperties(接口指针)；激活失败回退自实现
    CCW（全套 10 槽位 + IAgileObject）。判断律（修正版）：凡 metadata 里的
    struct/enum/delegate 一律不可激活；但「类 vs struct」不要凭记忆判——查
    windows-rs 投影源有没有 `FactoryCache`/`RuntimeName`，有则是类、可激活、
    ABI 传接口指针。v7.0.2 已把全部 IID/vtable 逐项对照 windows-rs master +
    Microsoft SDK 原版 SystemMediaTransportControlsInterop.idl + pinterface 盐
    算法（sha1({11F47AD5-7B73-42C0-ABAE-878B1E16ADEE} + 签名串)后 from_be
    组 GUID）复核通过。
28. **（v7 新）事件 handler 特化 GUID 必须精确**：
    ITypedEventHandler<SMTC,ButtonPressedArgs> =
    0557e996-7b23-5bae-aa81-ea0d671143a4；
    <SMTC,PlaybackPositionChangeRequested> =
    44e34f15-bdc0-50a7-ace4-39e91fb753f1；QI 必须应答这两个 IID
    + IUnknown + IInspectable；GetRuntimeClassName 返回 E_NOTIMPL（参数化
    接口无运行时类名）。v7.0.1 已对照 windows-rs 投影逐项验证全部 9 个
    IID/vtable 均正确（interop DDB0472D-C911-4A1F-86D9-DC3D71A95F5A 与
    MinGW-w64 官方 idl 一致；勿信记忆里的「9C67CDCD549A」变体）。
29. **（v7.0.1 新）真机崩溃日志符号化陷阱**：BetterNCM CrashReport 的
    BackTrace 只有导出符号，非导出函数全被归到最近导出名
    （smtc_thread/apply_op 都会显示成 BetterNCMPluginMain）——不要按符号名
    定位，按 **RVA+offset 反汇编** 定位（llvm-objdump -d 搜偏移）。
30. **（v7.0.1 新）native-log.txt 日志通道**：native DLL 在
    plugins_runtime/<slug>/native-log.txt 记录 boot/host/smtc/http/upd 全链
    （GetModuleHandleExW FROM_ADDRESS 取自身路径，>1.5MB 自动重建）；
    用户报障直接要这个文件，不再盲猜。Host 选举失败自动让位（Relinquish）
    也入日志。
1. **JS 位移移位数按 32 取模**：MD5 长度字节必须算术右移（v4 真踩）。
2. **自实现 AES 必须先过 FIPS-197 C.1 + node crypto 对照**（v7 向量门在
   scripts/verify-v7-g1.js；注意 MD5("abc") 真值 =
   900150983cd24fb0d6963f7d28e17f72——node/python 双实现交叉确认，
   别信记忆里的「经典向量」）。
3. **strict 部件脚本漏 var = 静默死**（catch 吞 ReferenceError）：
   部件渲染必须 E2E 断言到具体文案。
4. **终端显示吃 SGR/控制序列**：判定用 codepoint/程序化断言，不信目视。
5. **verify 白盒的永久轮询循环不退场**：结尾必须显式 process.exit。
6. **Min/MaxSeekTime 必设**，否则系统不给抛 PositionChangeRequest。
7. **sw.js 缓存**：gh-pages 部署后用户需 Ctrl+F5。
8. **build:extension 覆盖 out/**：Pages 部署必须紧随其后。
9. **e2e harness 三律**：innerHTML 不执行 script（用 iframe srcdoc/真 fetch
   环境）；replace 第二参 $ 序列陷阱；bun/node 测试环境要补
   `globalThis.window` 垫片（SSR 守卫会拦截 start()）。
10. **BetterNCM 静默过滤链**：ncm3-compatible 缺失/中文文件名/disable_list
    都会让插件无声消失（v5.0.1 实锤，构建门已锁死）。

## 用户机器的已知约束（真机实证）

- 用户对「提示说要做的操作做了却没用」零容忍。
- 用户对"复用老代码"零容忍——重写就是重写。
- 用户环境 = 网易云 3.x + BetterNCM（CEF）；Windows 10/11 x64。

## 下一步开发任务（按优先级）

### A. v8.0.0 真机验收（最高优先，等用户反馈）
1. 网易云插件目录：删 `ChuShi-SMTC-Manager-*.plugin` → 放 `ChuShi-Music-Bridge-8.0.0.plugin`
   （Lyric-Source 7.0.0 不动）→ **完全重启网易云**。
2. 验收点：InfLink-rs 卡片正常（封面/标题/进度/媒体键/拖动）；「初始」面板真值/
   逐字/拖动回执；页脚芯片显示 InfLink-rs vX；任务管理器无 ChuShiSMTCBroker.exe。
3. 若面板无数据：`GET http://127.0.0.1:26901/api/ping`（应答 chushi-music-hub 8.0.0）
   + 桥日志 `plugins_runtime/ChuShi-Music-Bridge/hub-log.txt` + 控制台
   `window.__chushiMusicBridge.debug()`（inflink.present / sources 五层命中）。
4. 若系统卡片异常：那是 InfLink-rs 领域（检查其设置 SMTC 开关），与本桥无关。

### B. SMTC 排障路径（v8 已移交 InfLink-rs）
自研 SMTC 代码已全删，无排障面。系统卡片问题直接看 InfLink-rs 的设置与日志；
数据面问题按 A3 三件套定位。

### C. 预设包/工程化欠账
- 预设包脚本内注释版本仍是 v5.0.0 字样（外观性）；music-commands 的
  「安装 ChuShi Music Bridge」文案在 v7 语义仍准确。
- Edge 商店提交材料仍未做（每代顺延）。
- llvm-mingw 工具链在 .pkgtmp/toolchain（可再下载，见
  scripts/build-smtc-native.sh 头部路径）。

## 交付流程备忘（每次发版照抄）

见「构建产线」与「发布四件套」。文叔叔链接 1 天过期，发完立即给用户。
worklog.md 追加 Task 段；本文件与 README 版本段同步更新。
