# AI-HANDOFF — 给下一个读这个仓库的 AI / 开发者

> 最后更新：v6.0.0（2026-09-07）。写给你的：无论你是人类贡献者还是 AI 助手，
> 这一页是项目的「当前状态 + 下一步该干什么」的单一事实来源。
> 动手前请先读完本页，不要凭想象改架构。

## 项目一句话

「初始 / Start-chushi」：Next.js 15 新标签页（网页 + Edge MV3 扩展双形态），
其中 SMTC 音乐面板显示网易云播放真值（进度/逐字歌词）并可控播。
**v6.0.0 = 三插件纯插件架构**（用户指令：桥单独写成一个插件、分成三个插件；
外部引擎整体退役）。v5 的五层零复用原则延续：三插件/页面音乐 API 全部从零新写。

## v4.0.0 重写的用户三条硬性指令（宪法级，永远生效）

1. **不许复用老代码**——v3 及之前的插件/桥/宿主仲裁层全部删除重写。
   任何"在老代码上打补丁"的倾向都违背本指令。
2. **不依赖网易云自带的 SMTC**——网易云设置里的 SMTC 开关开或关都不影响。
   引擎代码里**不存在**任何读取外部 SMTC 会话的路径（构建断言强制）。
3. **插件不能有中文**——插件文件名、manifest、代码内容全部 ASCII
   （构建门逐字符断言）。用户真机实证：中文会导致"读取不了"。

**v5.0.0 补齐指令（同宪法级）**：用户「预设包和音乐面板所有相关的 API
也不用重写了？全部重写」——v4 保留字节不动的 music-widget.html、沙盒
音乐核心、smtc.ts 数据面在 v5 全部从零重写（视觉样式不变）。

**v6.0.0 补齐指令（同宪法级）**：用户「算了还是把桥单独写成一个插件吧，
分成三个插件」「初始的页面还是不会显示音乐，前端音乐 API 重写」——
1. **三插件纯插件架构**：SMTC Manager / Music Bridge / Lyric Source 三个
   独立 .plugin；外部引擎（PS1）整体退役，全栈零 child_process/spawn
   （构建门断言）。
2. **满血 SMTC = navigator.mediaSession**：渲染进程内直接注册独立系统
   媒体会话（metadata/playbackState/positionState/8 个 action handler），
   网易云自带 SMTC 开关保持关闭即可——「直接就靠插件」的最终形态。
3. **语言三律分立**（构建门分别断言）：插件 name 英文（ASCII）、介绍/
   描述/面板文案中文、.plugin 文件名 ASCII。

## 组件拓扑（v6.0.0 — 谁跟谁说话，谁拥有什么）

```
[Edge 扩展 / gh-pages 网页] ←同代码双形态→ [Next.js 静态导出 out/]
        │ postMessage（sandbox iframe / widget shim）
        │  host: src/lib/startpage/smtc.ts v6（单真值直显；双端口发现
        │  26801→26802 粘住第一个应答 chushi-music-hub 的端口；1s 轮询）
        ▼ HTTP（CORS * + PNA 预 Flight 由桥应答）
[插件B ChuShi Music Bridge v6（桥，独立插件）]
        │  渲染进程内 require("http").createServer 自建枢纽（只绑 127.0.0.1）：
        │    GET  /api/ping（身份+三插件版本）  GET  /api/state（真值快照）
        │    GET  /api/lyric?songId=            POST /api/cmd（控制命令队列）
        │  真值三级调和：媒体元素（时长锚定粘滞）→ 原生事件（PlayState/
        │  PlayProgress/Seek 新鲜窗）→ dva store 只读（webpack require 探针）
        │  控制单次执行律：play/pause=元素方法；next/prev=网易云可见按钮；
        │  seek=currentTime 全文件唯一写点 + 420ms/1s 双读回 seekAck
        │  端口被占（旧引擎僵尸）→ 自动退 26802，页面双端口重探
        │  ▲ window 事件总线（同渲染进程）
        ├── 发 "cc:music-state"（1s 心跳 + 显著变化即发）→ 插件A 消费
        ├── 收 "cc:smtc-cmd"（系统媒体键/悬浮窗指令）→ 命令队列
        ├── 发 "cc:lyric-req" / 收 "cc:lyric-res"（歌词编排，reqId 配对）
        └── 收 "cc:smtc-ack" / "cc:lyric-hello"（邻居健康，/api/state 透传）
        │
[插件A ChuShi SMTC Manager v6]  navigator.mediaSession 满血会话：
        │  metadata+artwork(?param=500y500)/playbackState/positionState
        │  （1s 重锚，系统侧本地时钟插值）/8 个 action handler → 只转发
        │  "cc:smtc-cmd"，自己绝不执行任何播放控制、绝不 require 任何 Node 模块
        │  不支持 mediaSession 的内核 → "unsupported" 诚实上报
        │
[插件C ChuShi Lyric Source v6]  纯歌词服务：
           eapi /api/song/lyric/v1（渲染进程 node crypto；yrc→klyric 转换→
           lrc）→ channel.call("track.lyric.getinfo") → 直连 music.163.com
           三级回退；LRU 8 + localStorage 持久化；reqId 配对应答
```

**数据律（v6）**：
1. 页面唯一数据源 = 桥枢纽 `/api/state` 的 `ne` 字段（一次年龄补偿后直显）。
2. 页面不猜端口：`smtc.ts` 双端口发现 + 粘滞；扩展 host_permissions 双端口齐备。
3. 三插件互为可选邻居：缺谁 `/api/state` 的对应字段就诚实降级
   （smtcVer 空 / lyricVer 空 / smtcSession=unknown），面板芯片如实归因。
4. 「初始页面不显示音乐」的根治 = 枢纽住在桥插件里：插件活着页面就有数据，
   不再有「引擎没跑起来」这个环节。

## 构建产线（改完代码必走全）

```
1. python3 scripts/build-v6-plugins.py        # 三插件打包 + 结构门/过滤链模拟器（G1-G11）
2. node scripts/verify-v6.mjs                 # 静态门 112（宪法/单写点/歌词梯/公开面/文案）
3. node scripts/verify-v6-whitebox.mjs        # vm 白盒 46（真值调和/枢纽路由/命令队列/歌词梯）
4. node scripts/verify-v6-eapi.mjs            # eapi 协议端到端实测（公网 3 首歌 3/3）
5. bun run build                              # Next 生产构建（TS 门）
6. EXTENSION_MODE=1 bun run build:extension && python3 scripts/build-extension.py
7. python3 scripts/build-v5-preset.py         # .cshz（样式字节不动 + v6 芯片文案断言）
8. node scripts/verify-v6-e2e.mjs             # e2e 32（部件芯片矩阵/沙盒协议/全页+mock枢纽+.cshz导入）
9. python3 scripts/build-v6-assets.py         # 交付六件套 + SHA256SUMS + 指纹断言
10. ②-⑧ 两轮全绿才准发版
```

发布四件套（照抄）：commit/push main → `bash scripts/deploy-pages.sh`（线上
grep 指纹：sandbox.js __chushiMusicCoreV6 + chunk "chushi-music-hub"）→
`python3 scripts/rel-v600.py`（uploads.github.com 直传 + digest 校验；本
token 删资产端点 404，幂等策略 = 资产在位即校验收口）→ `wss-send.py 合并包`。

## 版本兼容矩阵

| 宿主 | 要求桥插件（枢纽+真值） | SMTC 插件 | 歌词插件 | 说明 |
|------|------------------------|-----------|----------|------|
| v6.0.0 | ChuShi Music Bridge 6.0.0（ne.v 门） | ChuShi SMTC Manager 6.0.0（可缺，smtcVer 空=诚实降级） | ChuShi Lyric Source 6.0.0（可缺，lrc 行级无逐字） | 三插件纯插件代，引擎退役 |
| v5.0.1 | 5.0.1（ne.v 门） | 5.0.1（引擎 5.0.0） | —（歌词并入插件B） | 双插件+引擎代 |

- 枢纽不可达/版本 < 6.0.0 = needsBridge（装/更新 Music Bridge 后重启网易云）。
- ne 心跳缺失/ne.v < 6.0.0 = needsPlugin（同上，插件即枢纽，没有第二个东西）。
- 版本各查各的活源：枢纽版本=/api/state.version；桥插件=ne.v；
  SMTC 插件=state.smtcVer（cc:smtc-ack 心跳）。不猜、不缓存。
- **迁移**：v6 三插件与 v5 双插件是**不同 slug**——必须删光旧 .plugin
  再装新，旧「ChuShi Music API」「初始歌词源」与 v6 同装会出两份面板。
- **引擎退役**：chushi-smtc-engine.ps1 / Start-Engine.bat 已从产线与交付
  包移除；用户机上的旧引擎进程可手动结束（占着 26801 时桥会自动退 26802，
  页面双端口重探自动跟随，无感）。

## 已知坑（本代新坑 + 沿用铁律）

1. **JS 位移移位数按 32 取模**：`bitLen >>> 32 === bitLen >>> 0`——MD5 长度
   字节必须算术右移（本代真踩：m[60] 被误写导致 md5 错误，FIPS 向量抓出）。
   新写哈希/AES 一律过 test-crypto-v4 向量门。
2. **自实现 AES 必须先过 FIPS-197 Appendix C.1**（69c4e0d8…）再上线；
   ECB 多块再对照 node crypto（setAutoPadding(false)，输入须 16 字节对齐）。
3. **strict 模式部件脚本漏 var = 静默死**：buildLyric 漏声明 lyActive，
   ReferenceError 被 feed 循环 catch 吞掉 → 面板永远停在静态 DOM
   （E2E 抓出）。**部件渲染必须 E2E 断言到具体文案**，不能只断言"无报错"。
4. **终端显示吃 `[h` 序列**（与 SGR 序列同类的显示伪影）：文件里
   `[hashtable]` 在工具回显里显示为 `ashtable]`，别信目视——用 python
   逐字符 codepoint 断言；也不要对含该序列的文本做盲 replace
   （"ashtable]" 是 "[hashtable]" 的子串，替换会造出双括号）。
5. **verify 白盒的永久轮询循环不退场**：插件 while 循环基于真实定时器，
   verify 结尾必须显式 `process.exit`，否则零失败路径挂起超时。
6. **引擎 WinRT 律**：MediaPlayer 创建/更新只在主线程；HTTP 在独立 runspace
   只碰同步集合；事件用 Register-ObjectEvent（-MessageData 同步队列），
   绝不 scriptblock 强转 WinRT 委托（回调线程无 runspace 会炸）。
7. **Min/MaxSeekTime 必设**（官方 manual-control 文档），否则悬浮窗不给抛
   PositionChangeRequest——"进度条不能拖"的引擎侧根因。
8. **显示层啃蚀**：关键判定用 od/程序化断言，不信目视。
9. **sw.js 缓存**：gh-pages 部署后用户需 Ctrl+F5。
10. **build:extension 覆盖 out/**：Pages 部署必须紧随 build:export。
11. **策略拦截机器**：插件A 拉引擎失败 → 诚实 backoff + bridgeBlocked +
    交付包手动 bat 兜底。任何"拉进程"路径必须容忍被拦。
12. **升级提示文案必须与真实可行路径一一对应**（v2.3.2 教训延续）。
13. **e2e harness 的 innerHTML 不执行 <script>**（HTML5 规范）：部件 html
    用 innerHTML 注入后脚本永远不跑、空态浮层拦截一切点击（v5 首跑 E3
    超时的根因）。必须 iframe srcdoc + mock 定义在部件脚本之前；断言全部
    走 frame 上下文。
14. **String.replace 第二参为 JS 源码时 $&/$'/$` 是特殊序列**：会被替换
    语义解释。一律用函数替换器 `replace(s, () => code)`。
15. **sandbox.js 按 location.search 分发 pageMode/widgetMode**：srcdoc 无
    query 永远进不了 widgetMode（e2e 必须用服务器路径 /sandbox-frame?mode=widget
    生产同形加载）。含字面 `</script>` 的 JS 内联进 HTML script 块必须先
    `<\/script>` 转义（JS 字符串等价）。
16. **测试基建的三重根因都披着「被测代码坏了」的外衣**：v5 e2e 三连修
    （innerHTML→srcdoc / replace 陷阱 / 模式分发）全非产品 bug；先分层
    归因（产品 vs harness）再动手，别急着改产品代码。
17. **BetterNCM 在网易云 3.x 静默丢弃缺 `ncm3-compatible:true` 的插件**
    （v5.0.1 真机实锤，源码级根因）：PluginManager 过滤链
    `isNCM3 && !manifest.ncm3Compatible → continue`——不解压、不加载、
    列表不显示、不报错。v5.0.0 的 SMTC Manager 重写时丢了这个字段
    （老版 2.1.0 有）→ 「装了但插件列表看不到」；Music API 5.0.0 带着字段
    所以显示正常——症状不对称正是定位线索。构建门已锁死（manifest 结构门
    强制 ncm3-compatible）。同源实锤两条：①中文 .plugin **文件名**在
    zip_open 按 ANSI(GBK) 码页解析 → 永远打不开 → 用户「中文读不了」
    的判断正确，ASCII 文件名门继续保留；②同 slug 插件解压到同一目录，
    plugins 文件夹里旧 .plugin 不删会在启动时反向覆盖新插件（中文文件名
    ASCII 序在后 = 旧包覆盖新包），升级说明必须强调「删掉所有旧 .plugin」。
    另有 disable_list.txt 连坐：旧版被停用记录同 slug，新插件也会被跳过。
    （BetterNCM 本体已改名 std-microblock/chromatic，v2 源码从 fork 找，
    如 NanoRocky/BetterNCM）

**坑 18（v6 新增）——「枢纽必须住在插件里」**：外部引擎时代的所有
「页面没数据」故障（引擎未部署/被杀软拦截/端口被占/SmartScreen）都源于
数据面多了一个进程环节。v6 用渲染进程内 require("http") 自建枢纽根治；
bind 失败自动退端口 + 页面双端口重探是端口鲁棒性的双保险。
**坑 19（v6 新增）——BetterNCM 本体服务器不能当中继**：/api/fs/* 带
api_key 鉴权（页面拿不到）且无 CORS 头（httplib 无 Access-Control），
gh-pages/扩展页面都无法直读；插件自建枢纽（自带 CORS+PNA 头）才是正门。

## 用户机器的已知约束（真机实证）

- Windows 策略/杀软拦截进程创建——「手动启动引擎」兜底永远留在交付包。
- 用户对「提示说要做的操作做了却没用」零容忍。
- 用户对"复用老代码"零容忍——重写就是重写。

## 下一步开发任务（按优先级）

### A. v6.0.0 真机验收（最高优先，等用户反馈）
0. **删光旧 .plugin** → 装三个新插件 → 完全重启网易云 → 插件列表出现
   **ChuShi SMTC Manager / ChuShi Music Bridge / ChuShi Lyric Source** 三个
   （v6 与旧版不同 slug，旧包不删会同装冲突；列表仍缺 → disable_list.txt
   排查，见使用说明）。语言三律：名称英文、介绍中文、文件名 ASCII。
1. 网易云 SMTC 开关**关闭**状态：放歌 → 系统（Win+K/音量弹层/锁屏）出现
   曲目卡片，进度每秒走、可拖、媒体键全响应；拖动后网易云真实跳转。
   这是 navigator.mediaSession 会话——真机若不出卡片，优先查网易云
   Electron 版本的 mediaSession 支持（插件B 面板「SMTC 管理器」一行会
   显示 unsupported）。
2. 面板（Ctrl+F5 后重新导入 .cshz）出现曲目/进度/逐字歌词；暂停 30s
   恢复无漂移；seek 拖动到网易云真实生效（失败有「拖动未生效」回执）。
3. 网易云**自家**进度条/按钮与装插件前一致（严格只读律确认）。
4. 页脚 `API v6.0.0 · 管理 v6.0.0`；升级芯片熄灭。
5. 旧引擎残留：可结束旧 powershell 引擎进程；桥占不上 26801 会自动退
   26802，页面双端口重探自动跟随（面板枢纽一行显示实际端口）。

### B. seek/SMTC 真机验证
- mediaSession seekto 的 fastSeek 参数、seekbackward/forward 系统按钮
  行为真机确认（白盒已测转发正确性）。
- 若真机拖动失败率高：BetterNCM 开发者工具抓网易云自家进度条拖动调用链，
  可用内部 seek 函数作为第二级（仍须单次调用 + 校验，不许循环重写）。

### C. 部件视觉细节（低优先）
- 逐字「大字居中」↔ 行级模式切换的高度弹簧仍可能跳一次（lyHold 只管
  同曲丢词）。任务：迟滞扩展到模式切换。

### D. 工程化欠账
- `transfer/`（wss 上传工具源码）移出仓库或 submodule 化。
- 三插件注入顺序无保证——当前靠 1s 心跳/重试对冲；若未来需要硬顺序，
  研究插件的 load 钩子或 slug 排序是否稳定。

## 交付流程备忘（每次发版照抄）

1. 改码 → 全产线重建 → verify-v6 三套全绿（两轮）
2. commit（`vX.Y.Z: 一句话——①②③`）→ push main
3. `bash scripts/deploy-pages.sh`（工作树必须干净）→ 线上 grep 指纹
4. GitHub Release：资产直链 + SHA-256 全输出 ALL OK
5. 文叔叔合并包（wss-send.py）→ 链接发用户
6. worklog.md 追加本版记录；README 版本历史补段；本文件更新「下一步任务」
