# AI-HANDOFF — 给下一个读这个仓库的 AI / 开发者

> 最后更新：v7.2.0（2026-09-08，raise 路径 SEH 全覆盖 + 元数据链根治）。写给你的：无论你是人类贡献者还是 AI 助手，
> 这一页是项目的「当前状态 + 下一步该干什么」的单一事实来源。
> 动手前请先读完本页，不要凭想象改架构。

## 项目一句话

「初始 / Start-chushi」：Next.js 15 新标签页（网页 + Edge MV3 扩展双形态），
其中 SMTC 音乐面板显示网易云播放真值（进度/逐字歌词）并可控播。
**v7.2.0 = 三插件 + 独立 broker 进程架构 + 全路径 SEH + 多阶梯元数据源**：SMTC 由独立进程
`ChuShiSMTCBroker.exe` 直接持有（真 Windows 系统会话 + HTTP 枢纽全在 broker），
插件 A 的原生 DLL 只是监督者（释放/拉起/看护 broker）；插件 B/C 与页面音乐
API 纯 JS 零 Node。v5 起五层零复用原则延续：三插件/页面音乐 API 每代全部从零新写。

## 宪法（用户硬性指令，永远生效）

1. **不许复用老代码**——插件/桥/宿主数据层每代全部删除重写，构建门断言老符号零残留。
2. **不依赖网易云自带的 SMTC**——网易云 SMTC 开关开或关都不影响；v7 起自有原生会话。
3. **插件命名语言三律分立**（构建门分别断言）：插件 name 英文（ASCII）、
   介绍/描述/面板文案中文、.plugin 文件名 ASCII。
4. **「重写」验收 = 构建门**：老符号零残留断言，不是口头承诺。
5. **【v7.1.0 新增·最高优先】WinRT 绝不进宿主进程**——网易云进程内零 WinRT/
   零 SMTC 代码（构建门 G8 断言导入表无 combase/winrt、自身代码无 SMTC IID
   字节）。SMTC 一律由独立 broker 进程承载。违反此律 = 复蹈 v7.0.x 四代崩溃。

## v7.2.0（当前版）：raise 路径 SEH 全覆盖 + 「未知曲目」根治

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

### A. v7.0.2 真机验收（最高优先，等用户反馈；本轮 = 时间线 ABI 根因修复）
0. 前情：v7.0.1 装上后播歌仍崩（Windows.Media.MediaControl.dll AV，
   smtc_native.dll+0x266E 反汇编实锤 = UpdateTimelineProperties 栈结构体直传）。
   v7.0.2 已修复：TimelineProperties 以 COM 对象传入（RoActivateInstance 主路径
   + CCW 兜底），20/20 构建门全绿（含 G8d 反汇编槽位断言）。
1. 只需换插件A：删旧 ChuShi-SMTC-Manager-7.0.1.plugin → 装入
   7.0.2（B/C 两个 7.0.0 不动）→ **完全重启网易云**。
2. 验收点：播歌不崩；Windows 音量弹层/锁屏出独立卡片（封面/标题/进度每秒走/
   可拖/媒体键）；「初始」面板真值/逐字/拖动回执；网易云自带 SMTC 开关无关。
3. 若异常：**直接要 native-log.txt**
   （C:\betterncm\plugins_runtime\ChuShi-SMTC-Manager\native-log.txt），
   boot/host/smtc/http/upd 全链日志都在里面（upd 行含 src=os/ccw 溯源），
   按行定位，不再盲猜。
4. 页脚仍是 API v7.0.0 · 管理 v7.0.0（本轮未动前端，正常）。

### B. SMTC 原生 DLL 真机排障路径（若卡片不出；v7.0.1 首选日志文件）
1. **native-log.txt 优先**：
   `C:\betterncm\plugins_runtime\ChuShi-SMTC-Manager\native-log.txt`；
   正常链 = boot( elected as host ) → smtc( RoInitialize ok → GetForWindow
   OK ) → http( listening on 26901 ) → upd( timeline applied first time )；
   断在哪一行就是哪一环（give up host = 让位重选）。
2. BetterNCM 开发者工具（网易云渲染进程控制台）跑
   `betterncm_native.native_plugin.call('ChuShi.Smtc.info',[''])` →
   应返回 `{"ok":true,...,"host":true/false,"smtcReady":true/false}`。
3. `host=false`：说明 DLL 在 Main 进程未被加载或互斥体被占（查
   BetterNCM 版本是否支持 native_plugin）。
4. `smtcReady=false`：看 `GET http://127.0.0.1:26901/api/smtc/status` 的
   `lastHr`（WinRT HRESULT）与 native-log 中 GetForWindow 的 hr——v7.0.1
   失败会自动让位，若所有进程都失败则日志里每进程都有 give up 行。
5. 枢纽端口被占：26901/26902/26903 三端口都试；`/api/ping` 无响应 =
   DLL HTTP 线程未起（winsock 初始化失败罕见）。

### C. 预设包/工程化欠账
- 预设包脚本内注释版本仍是 v5.0.0 字样（外观性）；music-commands 的
  「安装 ChuShi Music Bridge」文案在 v7 语义仍准确。
- Edge 商店提交材料仍未做（每代顺延）。
- llvm-mingw 工具链在 .pkgtmp/toolchain（可再下载，见
  scripts/build-smtc-native.sh 头部路径）。

## 交付流程备忘（每次发版照抄）

见「构建产线」与「发布四件套」。文叔叔链接 1 天过期，发完立即给用户。
worklog.md 追加 Task 段；本文件与 README 版本段同步更新。
