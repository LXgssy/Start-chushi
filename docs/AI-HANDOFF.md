# AI-HANDOFF — 给下一个读这个仓库的 AI / 开发者

> 最后更新：v3.0.1（2026-09-07）。写给你的：无论你是人类贡献者还是 AI 助手，
> 这一页是项目的「当前状态 + 下一步该干什么」的单一事实来源。
> 动手前请先读完本页和 `README.md` 的版本历史段，不要凭想象改架构。

## 项目一句话

「初始 / Start-chushi」：Next.js 15 新标签页（网页 + Edge MV3 扩展双形态），
其中 SMTC 音乐面板显示 Windows 系统媒体会话（网易云等）的进度/歌词并可控播。
**v3.0.0 起为双插件架构**：网易云真值与桥进程管理彻底分离，每数据单主。

## 组件拓扑（v3.0.0 — 谁跟谁说话，谁拥有什么）

```
[Edge 扩展 / gh-pages 网页] ←同代码双形态→ [Next.js 静态导出 out/]
        │ postMessage(sandbox iframe / widget shim)
        │  host: src/lib/startpage/smtc.ts v3（唯一仲裁层，1s 轮询 127.0.0.1:20754）
        ▼
[PS1 桥 chushi-bridge.ps1 v2.0.0]（纯传输：SMTC 会话 + ne 中转 + 插件注册表 + 命令队列；
        │  ⚠ 绝不修正任何真值——v1.7.x 的 ne-anchoring 已删除，别加回来）
        ▲ /api/plugin/register(管理插件) ▲ /api/plugin/state(1s) + /api/plugin/cmd(300ms)
        │
[插件A 初始SMTC桥 cc.chushi.smtcbridge v2.0.0]   [插件B 初始网易云API cc.chushi.ncmapi v2.1.0]
 bridge/lyric-plugin 的桥管理段原样提取          bridge/lyric-plugin 的真值段原样提取
 只管桥进程：部署/杀旧/拉起/监督/注册            只产真值：原生事件+锁定元素+seek 阶梯+歌词
 产出零网易云状态                                进程管理零调用
```

**单主律（架构宪法，改动前自问有没有违反）**：
1. 位置/时长/播放态/元数据/歌词的真值**只产自插件B**（原生事件为主源）。
2. 桥只传输（+自己 SMTC 会话的墙钟补偿，那是它自己的会话数据）。
3. 宿主只仲裁：`judgeNcmOwns()` 唯一判定点——桥 app 字段（"NetEase Music"，
   AUMID 归一，权威）或标题兜底匹配 + ne 新鲜（ts≤3s）→ **插件真值独占**
   （一次性年龄补偿后零守卫零混合）；否则 SMTC-only（harmonize 只活在这条路径）。
   **v3.0.1：桥无 SMTC 会话（track=null）时 ne 新鲜即独占**，apply 以 ne 构造
   虚拟曲目——绝不因 SMTC 会话缺失弃用有效真值（四症状根治点一）。
4. **不要在宿主重新叠加零值/倒退守卫**——插件B 已有全套熔断（身份锁/倒退熔断/
   零值熔断/channel 健康闸），宿主再叠一层 = v2.x 三层互打复辟（九轮真机故障根源）。

**构建产线（改完代码必走全）**：
1. `python3 scripts/build-smtc-plugin.py` → 初始SMTC桥-2.0.0.plugin（内嵌桥回环断言）
2. `python3 scripts/build-ncm-plugin.py` → 初始网易云API-2.0.0.plugin
3. `bun run build:export` → out/（gh-pages/网页用）⚠ `next build` standalone 不写 out/
4. `python3 scripts/build-extension.py` → 扩展 zip（⚠ 会覆盖 out/，Pages 部署必须在其前）
5. `python3 scripts/build-smtc-preset.py` → examples/初始SMTC音乐预设.cshz
6. `python3 scripts/build-v3-assets.py` → download/v3.0.1/ 交付包全家
7. `node scripts/pw-lab/verify-v3.mjs` → 必须 44/44（两轮）
8. `bash scripts/deploy-pages.sh` → gh-pages（工作树必须干净）→ 线上 grep 指纹验证
9. Release + 文叔叔交付（py 版 wss-send.py；mjs 版登录接口 1003 已坏）

## 版本兼容矩阵（改阈值前必读）

| 宿主 | 要求桥 ≥ | 要求API插件 ≥ | 需要管理插件 | 说明 |
|------|---------|--------------|-------------|------|
| v3.0.1 | 2.0.0 | 2.1.0 | 建议（无也可手动 bat） | 四症状定点根治（虚拟曲目/物理自愈/store 兑底） |
| v3.0.0 | 2.0.0 | 2.0.0 | 建议（无也可手动 bat） | 全新双插件架构 |

- **needsPlugin**（插件缺失 / <1.4.0 / 1.4.0–1.5.1 旧一体化）→ 部件分叉三种文案：
  缺件安装 / 更新修复 / **双插件迁移**（卸旧「初始歌词源」装双新件）。
- **needsBridge**（桥不可达，或**管理插件已注册但桥版本旧** = 旧桥进程杀不死实锤）
  → 只给手动指引（启动桥.bat / 重启电脑），**永远不许喊「更新 .plugin」**。
- 版本各查各的**活源**：桥版本=/api/state.version；API 插件=ne.v（心跳）；
  管理插件=plugins.smtc（/api/plugin/register 活体注册，90s 窗口）。不猜、不缓存、
  不用内嵌版本推断在场状态——这就是「插件明明最新却喊旧版」的根治。

## 已解决的坑（别再踩，细节看 git log 各版本 commit message）

1. **多层真值互打是万恶之源**（v2.0.0–v2.3.3 九轮真机故障的共同结构根源）：
   插件、桥、宿主三层各自"修正"进度/播放态，补丁互相覆盖 → 反转/0.5x 爬行/冻死。
   v3.0.0 单主律根治。**任何"再加一层守卫更保险"的想法都是开倒车。**
2. **PlayState 是事件不是遥测**：`appendRegisterCall("PlayState")` 只在状态切换
   瞬间触发。任何「N 秒没事件就当过期」的设计都会在暂停 >N 秒后降级猜 DOM →
   状态反转（v2.3.1/v2.3.2 两轮真机实证）。插件B 现为「最后事件语义」+ store 交叉自愈。
3. **每拍重新评分选媒体元素会换人**：网易云 DOM 有预加载/流浪 video/audio。
   插件B 是「连续对齐 2 拍上身份锁，同歌不换人」。别改回裸评分。
4. **倒退熔断必须 song 身份在场才启用**：songIdNow=0 时不熔断（误杀新歌开头比跳帧糟）。
5. **桥 ne-anchoring 已删**：桥对 ne 的唯一职责是中转。若面板进度错，先查插件B
   buildSnapshot，再查宿主 judgeNcmOwns 分支——桥永远不是嫌疑人。
6. **双心跳仲裁**：旧一体化插件与新插件B 并存时，桥按 role 仲裁（ncm 10s 窗口压制
   role-less）。这是迁移期保护，不是长期形态；新装机用户只装双新插件。
7. **WSH/PowerShell 策略拦截**（用户机器实证 0x80070312）：插件A 直启 powershell 优先 +
   VBS On Error 静默 + 部署读回校验 + 冷启动/升级双退避 + bridgeBlocked 诚实置位。
   任何新的「拉进程」路径都必须能容忍被拦。
8. **显示层啃蚀**：关键判定用 od / 程序化断言，不信目视。
9. **sw.js 缓存**：gh-pages 部署后用户需 Ctrl+F5。每次改宿主行为都要提醒。
10. **build:extension 覆盖 out/**：Pages 部署必须紧随 build:export，与扩展构建强隔离。
11. **SMTC-only 是冻结区**（v3.0.1 实锤）：网易云桌面版 SMTC 的 TimelineProperties
    position 基本不更新——只要宿主回退 SMTC-only，面板进度/时间/逐字歌词就会冻结。
    「四症状全现」= ne 真值断供的第一嫌疑。排查顺序：插件B 是否加载（页脚 API vX）
    → 桥 /api/state 是否有 ne → judgeNcmOwns 是否判 false。
12. **物理自愈是输出修正不是状态改写**（v3.0.1）：插件B buildSnapshot 末尾
    「推进>800ms/拍 → playing=true」每拍独立判定，写回 lastPlaying 后由事件语义
    接管；真暂停时 store 交叉自愈 3s 内纠回。别改成持续状态或删掉 <800ms 闸。

## 用户机器的已知约束（真机实证）

- Windows 策略/杀软拦截进程创建（0x80070312）——「手动启动桥（备用）」文件夹永远留在交付包。
- 用户对「提示说要做的操作做了却没用」零容忍：任何提示芯片必须与真实可行路径一一对应。

## 下一步开发任务（按优先级——这就是你要做的）

### A. seek 真机有效性验证（最高优先，用户核心诉求，v2.x 起唯一未根治项）
- 现状：插件B 三级阶梯 `channel.call("audioplayer.seek")` → `playing/setPlayingPosition`
  dispatch → `el.currentTime` 直写，逐级 420ms 实测，全败如实弹回 + seekNote 芯片。
  真机反馈「拖动无效」仍未根除；channel 路线健康闸会话禁用说明它可能打断播放。
- 任务：
  1. 在网易云 3.x 最新版用 BetterNCM 开发者工具实抓 `audioplayer.seek` 真实参数形态
     （`[songId, "songId|seek|rand", sec]` 的 tag 随机数是否必需、songId 类型）。
     插件B 的 `channelSeek` 已有回调捕获 + `__seekDebug()` 诊断面，直接看日志。
  2. 劫持 `channel.call` 打日志对比「网易云自家进度条拖动」的完整调用链（v2.3.0 曾
     实证自家进度条同源走 audioplayer.seek——找到参数差异就是终点）。
  3. 若 channel 路线在最新版可用：验证 seek 后逐字歌词立即跳句（seekNote ok 路径）。
  4. 验证 `playing/setPlayingPosition` dispatch 的 payload 形态（v1.5.1 已改回数值秒，
     但真机若仍无效需再核实 reducer 期望）。

### B. v3.0.1 四症状真机验收（本版刚交付，等用户反馈）
- 用户本轮四症状：逐字歌词坏/播放状态不同步/进度条不动/数字时间不变。
- 三个根治点：①虚拟曲目（桥无 SMTC 会话时 ne 真值不弃用）②物理自愈
  （播放态事件丢失时进度推进=在播放）③store 次级真值（原生死时不冻死）。
- 验收：页脚 `API v2.1.0` 在场 + 进度/时间/逐字歌词跟手；若仍冻结，
  让用户截图面板页脚——只显示 `管理 v2.0.0` 无 `API v2.1.0` = 插件B 未加载
  （装包/重启问题，不是代码问题）。

### C. 暂停→恢复逐字歌词漂移的最终确认（用户持续报告的遗留项）
- 真值绝对锚定理论上已结构性归零漂移。任务：真机暂停 30s → 恢复，录屏对比歌词
  高亮句与歌声音节；若仍 >0.5s 错位，检查部件 lyric 引擎 `lines[].t` 时间基与
  插件B positionMs 的单位一致性。

### D. 部件视觉细节（低优先）
- 逐字歌词「大字居中」↔ 行级模式切换时面板高度弹簧仍有一次跳动（v2.3.1 lyHold
  只管同曲丢词）。任务：高度迟滞扩展到「同曲内歌词模式切换」。

### E. 工程化欠账
- `transfer/` 目录是第三方 wss 上传工具源码，考虑移出仓库或 submodule 化。
- verify-v232.mjs 及更早 verify 脚本针对 v2.x 宿主行为，v3.0.0 起**以 verify-v3.mjs
  为准**（旧脚本留作历史参考，勿再对着旧断言改新代码）。
- `bridge/lyric-plugin/`（旧一体化 v1.5.1）保留仅作历史参考与回退，不再构建发布；
  其构建脚本 build-lyric-plugin.py 同步冻结。

## 交付流程备忘（每次发版照抄）

1. 改码 → 全产线重建 → verify-v3 全绿（两轮）
2. commit（message 格式照旧：`vX.Y.Z: 一句话——①②③细节`）→ push main
3. `bash scripts/deploy-pages.sh`（工作树必须干净）→ 线上 grep 指纹验证
4. GitHub Release：`scripts/rel-v232.py` 风格（token 在 .pkgtmp/gh-token，0600）
   五资产直链 + SHA-256 全输出 ALL OK
5. 文叔叔合并包：`scripts/pw-lab/wss-send.py`（匿名限 2 任务/天，链接 1 天过期）
6. worklog.md 追加本版记录；README 版本历史补段；本文件更新「下一步任务」
