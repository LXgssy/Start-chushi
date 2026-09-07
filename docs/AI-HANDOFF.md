# AI-HANDOFF — 给下一个读这个仓库的 AI / 开发者

> 最后更新：v5.0.0（2026-09-07）。写给你的：无论你是人类贡献者还是 AI 助手，
> 这一页是项目的「当前状态 + 下一步该干什么」的单一事实来源。
> 动手前请先读完本页，不要凭想象改架构。

## 项目一句话

「初始 / Start-chushi」：Next.js 15 新标签页（网页 + Edge MV3 扩展双形态），
其中 SMTC 音乐面板显示网易云播放真值（进度/逐字歌词）并可控播。
**v5.0.0 = 音乐链路五层全部从零重写完成**（v4 四层 + 用户指认补齐的
预设包/音乐面板 API/前端层；用户明确指令：删光老代码、零复用）。

## v4.0.0 重写的用户三条硬性指令（宪法级，永远生效）

1. **不许复用老代码**——v3 及之前的插件/桥/宿主仲裁层全部删除重写。
   任何"在老代码上打补丁"的倾向都违背本指令。
2. **不依赖网易云自带的 SMTC**——网易云设置里的 SMTC 开关开或关都不影响。
   引擎代码里**不存在**任何读取外部 SMTC 会话的路径（构建断言强制）。
3. **插件不能有中文**——插件文件名、manifest、代码内容全部 ASCII
   （构建门逐字符断言）。用户真机实证：中文会导致"读取不了"。

**v5.0.0 补齐指令（同宪法级）**：用户「预设包和音乐面板所有相关的 API
也不用重写了？全部重写」——v4 保留字节不动的 music-widget.html、沙盒
音乐核心、smtc.ts 数据面在 v5 全部从零重写（视觉样式不变）；至此
插件A/插件B/引擎/预设包/音乐面板 API 与前端**五层 0 复用**。

## 组件拓扑（v5.0.0 — 谁跟谁说话，谁拥有什么）

```
[Edge 扩展 / gh-pages 网页] ←同代码双形态→ [Next.js 静态导出 out/]
        │ postMessage(sandbox iframe / widget shim)
        │  host: src/lib/startpage/smtc.ts v5（单真值直显，1s 轮询 127.0.0.1:26801）
        ▼
[引擎 bridge/engine/chushi-smtc-engine.ps1 v5.0.0]
        │  自有满血 SMTC 会话（MediaPlayer + CommandManager 禁用 = 官方
        │  manual-control 模式；AUMID 'ChuShi.SmtcEngine'；内存静音 WAV）：
        │    时间线 1Hz 墙钟推进 / IsPlaybackPositionEnabled 可拖 /
        │    Min+MaxSeekTime 必设（否则悬浮窗不抛 PositionChangeRequest）
        │    媒体键/悬浮窗事件 → Register-ObjectEvent + 同步 ArrayList 出队
        │  ⚠ 引擎绝不读取任何外部 SMTC 会话（reader-side 类被构建门封禁）
        │  HTTP 枢纽（runspace，只碰同步哈希表，绝不碰 WinRT 对象）：
        │    GET  /api/ping   GET /api/state  GET /api/lyric?songId=
        │    POST /api/ne(插件真值 1Hz)  POST /api/lyric  POST /api/cmd(宿主)
        │    GET  /api/cmd(插件 300ms 出队)  POST /api/mgr(管理插件心跳)
        ▲ /api/ne /api/lyric /api/cmd        ▲ /api/ping /api/mgr
        │                                    │
[插件B ChuShi Music API cc.chushi.ncmapi v5.0.0]  [插件A ChuShi SMTC Manager cc.chushi.smtcbridge v5.0.0]
 只读真值生产者 + 控制执行器 + 全量歌词            引擎部署/杀旧/拉起/监督（SHA-256 读回校验）

**v5 换代的四层（全部从零新写，样式不变）**：
- 预设包部件 preset-src/smtc/music-widget.html v5（防位移三律/lyHold 迟滞/
  乐观翻转/芯片四态诚实归因全保留，实现全新）+ music-commands.js v5。
- 沙盒音乐核心 public/sandbox.js `__chushiMusicCoreV5`（Function.toString()
  双通道同源；whitelist() 宿主态→部件快照扁平化唯一出口）。
- 数据面 src/lib/startpage/smtc.ts v5（ENGINE_VER_MIN/PLUGIN_VER_MIN=5.0.0）。
- 部件通道 src/components/startpage/PresetWidgets.tsx v5 路由。
```

**v4 数据律（每数据单主，缺一即复发老 bug）**：
1. 真值只产自插件B（原生事件 legacyNativeCmder + dva store 只读 + 元素校验）。
2. 引擎只搬运 + 驱动自己的 SMTC 会话（墙钟推进是它会话自己的数据）。
3. 宿主只显示（一次性年龄补偿 + fetchedAt 插值）。**宿主没有任何仲裁/
   守卫/锚定代码**（judgeNcmOwns/harmonize/seekHold 已全部删除，构建门验证）。
4. 控制只从元素执行：play/pause/seek = 元素方法；next/prev = 网易云自家可见按钮。
   seek 只写一次 currentTime + 读回校验 + seekAck 诚实上报——**绝不重写循环**
   （老版 1600ms 末级重写就是"装插件弄坏网易云自家进度条"的元凶）。

**逐字歌词管线（用户指定，已落地）**：
插件B 抓全量 yrc（eapi /api/song/lyric/v1，自实现 MD5+AES-128-ECB，FIPS-197
向量验证）→ 引擎存 4 首 LRU → 宿主 sandbox.js 音乐核心解析 + 真值对齐
（slew 0.35s 微抖吸收）→ 暂停瞬间按当前词剩余时长算 fadeMs（120-420ms）→
部件淡入淡出。漂移 = 本地积分累计，v4 真值直显 + 插值基准重置，结构性归零。

## 构建产线（改完代码必走全）

1. `node scripts/syntax-gate-v5.mjs` — 全部 v5 JS 语法门（含 .plugin 内嵌 index.js 回环解析）
2. `node scripts/verify-v5.mjs` + `node scripts/verify-v5-whitebox.mjs` +
   `node scripts/verify-v5-e2e.mjs` — **184 项 × 2 轮**（静态 137 + 白盒 24 + e2e 23）
3. `python3 scripts/build-v5-plugins.py` — 双 .plugin（引擎 base64 注入 + 门）
4. `EXTENSION_MODE=1 bun run build:extension` → out/ ⚠ `next build` standalone 不写 out/
5. `python3 scripts/build-extension.py` → 扩展 zip v5.0.0（⚠ 覆盖 out/，Pages 部署必须在其前）
6. `python3 scripts/build-v5-preset.py` → examples/初始SMTC音乐预设.cshz
7. `python3 scripts/build-v5-assets.py` → download/v5.0.0/ 交付六件套 + SHA256SUMS.txt
8. `bash scripts/deploy-pages.sh` → gh-pages → 线上 grep 指纹验证
9. Release（token 在 .pkgtmp/gh-token，0600；上传走 uploads.github.com）+ 文叔叔
   （scripts/pw-lab/wss-send.py；匿名限 2 任务/天，链接 1 天过期）

## 版本兼容矩阵

| 宿主 | 要求引擎 | 要求API插件 | 管理插件 | 说明 |
|------|---------|------------|---------|------|
| v5.0.0 | 5.0.0（自有满血会话） | 5.0.0（只读+元素控制+歌词） | 5.0.0 | 五层全量重写代 |
| v4.0.0 | 4.0.0（自有满血会话） | 3.0.0（只读+元素控制+歌词） | 3.0.0 | 四层重写代 |

- 引擎不可达 = needsBridge（装 Manager 插件自动管理，或手动 Start-Engine.bat）。
- ne 心跳缺失/ne.v < 5.0.0 = needsPlugin（装/更新 .plugin）。
- 版本各查各的活源：引擎版本=/api/state.ver；API 插件=ne.v；管理插件=/api/state.mgr。
  不猜、不缓存。
- **迁移**：v5 双插件可直接覆盖 v4 双插件（同名 slug 自动替换）；
  旧「初始歌词源」应卸载（插件B 配置面板有冲突提醒）。

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

## 用户机器的已知约束（真机实证）

- Windows 策略/杀软拦截进程创建——「手动启动引擎」兜底永远留在交付包。
- 用户对「提示说要做的操作做了却没用」零容忍。
- 用户对"复用老代码"零容忍——重写就是重写。

## 下一步开发任务（按优先级）

### A. v5.0.0 真机验收（最高优先，等用户反馈）
1. 网易云 SMTC 开关**关闭**状态下：放歌 → 悬浮窗/锁屏出现本引擎卡片
   （进度每秒走、可拖、媒体键全响应）；拖动后网易云真实跳转。
2. 面板进度/时间/逐字歌词跟手；暂停淡出、恢复淡入；暂停 30s 恢复无漂移。
3. 网易云**自家**进度条/按钮与装插件前行为一致（"装插件弄坏本体"根治确认）。
4. 页脚 `API v5.0.0 · 管理 v5.0.0`；升级芯片熄灭。
5. 若引擎未自启（策略拦截）：交付包手动 Start-Engine.bat 后面板应连上。

### B. seek 元素级真机验证
- 新路径只有一条：el.currentTime 直写一次 + 读回校验。若真机失败率
  高，用 BetterNCM 开发者工具抓网易云自家进度条拖动的完整调用链
  （channel.call 劫持日志），把可用的内部 seek 函数作为第二级
  （注意：仍须一次性调用 + 校验，不许循环重写）。

### C. 部件视觉细节（低优先）
- 逐字「大字居中」↔ 行级模式切换的高度弹簧仍可能跳一次（lyHold 只管
  同曲丢词）。任务：迟滞扩展到模式切换。

### D. 工程化欠账
- `transfer/`（wss 上传工具源码）移出仓库或 submodule 化。
- 旧版 bridge/lyric-plugin/、bridge/smtc/（v3 桥脚本）仅作历史参考，
  不再构建发布。

## 交付流程备忘（每次发版照抄）

1. 改码 → 全产线重建 → verify-v5 三套全绿（两轮）
2. commit（`vX.Y.Z: 一句话——①②③`）→ push main
3. `bash scripts/deploy-pages.sh`（工作树必须干净）→ 线上 grep 指纹
4. GitHub Release：资产直链 + SHA-256 全输出 ALL OK
5. 文叔叔合并包（wss-send.py）→ 链接发用户
6. worklog.md 追加本版记录；README 版本历史补段；本文件更新「下一步任务」
