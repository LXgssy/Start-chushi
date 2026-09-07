# AI-HANDOFF — 给下一个读这个仓库的 AI / 开发者

> 最后更新：v7.0.0（2026-09-07）。写给你的：无论你是人类贡献者还是 AI 助手，
> 这一页是项目的「当前状态 + 下一步该干什么」的单一事实来源。
> 动手前请先读完本页，不要凭想象改架构。

## 项目一句话

「初始 / Start-chushi」：Next.js 15 新标签页（网页 + Edge MV3 扩展双形态），
其中 SMTC 音乐面板显示网易云播放真值（进度/逐字歌词）并可控播。
**v7.0.0 = 三插件原生架构**：SMTC 由**原生 DLL** 直接持有（真 Windows 系统会话），
HTTP 枢纽住进 DLL；插件 B/C 与页面音乐 API 纯 JS 零 Node。
v5 起五层零复用原则延续：三插件/页面音乐 API 每代全部从零新写。

## 宪法（用户硬性指令，永远生效）

1. **不许复用老代码**——插件/桥/宿主数据层每代全部删除重写，构建门断言老符号零残留。
2. **不依赖网易云自带的 SMTC**——网易云 SMTC 开关开或关都不影响；v7 起自有原生会话。
3. **插件命名语言三律分立**（构建门分别断言）：插件 name 英文（ASCII）、
   介绍/描述/面板文案中文、.plugin 文件名 ASCII。
4. **「重写」验收 = 构建门**：老符号零残留断言，不是口头承诺。

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
27. **（v7 新）TimelineProperties 是接口不是结构体**：
    RoActivateInstance("Windows.Media.SystemMediaTransportControlsTimelineProperties")
    后逐属性 put，再 SMTC2.UpdateTimelineProperties。
28. **（v7 新）事件 handler 特化 GUID 必须精确**：
    ITypedEventHandler<SMTC,ButtonPressedArgs> =
    0557e996-7b23-5bae-aa81-ea0d671143a4；
    <SMTC,PlaybackPositionChangeRequested> =
    44e34f15-bdc0-50a7-ace4-39e91fb753f1；QI 必须应答这两个 IID
    + IUnknown + IInspectable；GetRuntimeClassName 返回 E_NOTIMPL（参数化
    接口无运行时类名）。
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

### A. v7.0.0 真机验收（最高优先，等用户反馈）
0. 删光旧 .plugin → 装三个 v7 插件 → **完全重启网易云** → 插件列表
   三件全可见（仍缺 → disable_list.txt 排查）。
1. 网易云 SMTC 开关**关闭**：放歌 → Windows 音量弹层/锁屏出现独立卡片，
   封面/标题正确、进度每秒走、**可拖**、媒体键全响应；拖动后网易云真实
   跳转。若卡片不出：任务 B.1 排障路径。
2. 「初始」面板出现曲目/进度推进/逐字歌词扫色；暂停 30s 恢复无漂移；
   面板拖动 → 网易云真实生效（失败有「拖动未生效」回执）。
3. 网易云**自家**进度条/按钮与装插件前一致（只读律确认）。
4. 页脚 `API v7.0.0 · 管理 v7.0.0`；升级芯片熄灭。

### B. SMTC 原生 DLL 真机排障路径（若卡片不出）
1. BetterNCM 开发者工具（网易云渲染进程控制台）跑
   `betterncm_native.native_plugin.call('ChuShi.Smtc.info',[''])` →
   应返回 `{"ok":true,...,"host":true/false,"smtcReady":true/false}`。
2. `host=false`：说明 DLL 在 Main 进程未被加载或互斥体被占（查
   BetterNCM 版本是否支持 native_plugin）。
3. `smtcReady=false`：看 `GET http://127.0.0.1:26901/api/smtc/status` 的
   `lastHr`（WinRT HRESULT）——GetForWindow 失败时 DLL 不再重试，需定位
   该 hr 码（若为 0x80070490 之类 ElementNotFound → 用户的 Windows 版本
   对 interop 有限制，回退方案=Renderer 进程 Hosting 或 MediaPlayer 路线）。
4. 枢纽端口被占：26901/26902/26903 三端口都试；`/api/ping` 无响应 =
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
