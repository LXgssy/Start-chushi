# AI-HANDOFF — 给下一个读这个仓库的 AI / 开发者

> 最后更新：v2.3.2（2026-09-07）。写给你的：无论你是人类贡献者还是 AI 助手，
> 这一页是项目的「当前状态 + 下一步该干什么」的单一事实来源。
> 动手前请先读完本页和 `README.md` 的版本历史段，不要凭想象改架构。

## 项目一句话

「初始 / Start-chushi」：Next.js 15 新标签页（网页 + Edge MV3 扩展双形态），
其中 SMTC 音乐面板可以显示 Windows 系统媒体会话（网易云等）的进度/歌词，
并通过 BetterNCM 插件 + 本地 PS1 桥拿到网易云内部真值（精确进度、逐字歌词、seek 透传）。

## 组件拓扑（谁跟谁说话）

```
[Edge 扩展 / gh-pages 网页]  ←同代码双形态→  [Next.js 静态导出 out/]
        │ postMessage(sandbox iframe)
        │  host: src/lib/startpage/smtc.ts（轮询 127.0.0.1:20754）
        ▼
[SMTC 桥 chushi-bridge.ps1 v1.7.1]（PowerShell 常驻，WinRT SMTC + 本地 HTTP）
        ▲ 心跳 /api/plugin/state（1s）+ /api/plugin/cmd（300ms 轮询）
        │
[BetterNCM 插件 bridge/lyric-plugin/index.js v1.5.0]
        │ 运行在网易云 renderer：legacyNativeCmder 原生事件 + dva store + eapi 歌词
        └ 内嵌整座桥（base64）：自部署 → 杀旧桥 → 自拉起 → 20s 监督 → 版本仲裁
```

**构建产线（改完代码必走全）**：
1. `python3 scripts/build-lyric-plugin.py` → 初始歌词源-X.Y.Z.plugin（内嵌桥回环断言）
2. `bun run build:export` → out/（gh-pages/网页用）⚠ standalone `next build` **不写 out/**
3. `python3 scripts/build-extension.py` → 扩展 zip
4. `python3 scripts/build-smtc-preset.py` → examples/初始SMTC音乐预设.cshz（部件 html 嵌在 manifest）
5. `python3 scripts/build-v232-assets.py` → download/v2.3.2/ 交付包全家
6. `node scripts/pw-lab/verify-v232.mjs` → 必须 43/43
7. `bash scripts/deploy-pages.sh` → gh-pages（要求工作树干净）
8. Release + 文叔叔交付

## 版本兼容矩阵（改阈值前必读）

| 宿主 | 要求桥 ≥ | 要求插件 ≥ | needsPlugin 文案 | needsBridge 文案 |
|------|---------|-----------|------------------|------------------|
| v2.3.2 | 1.7.1 | 1.5.0 | 「更新 .plugin 即可全自动修复」 | 「手动启动备用桥（启动桥.bat）」 |

- **needsPlugin**（插件缺失/过旧）才能喊「更新 .plugin」——该场景插件装上后确实能自动修好一切。
- **needsBridge**（插件已新但桥旧）**永远不许**喊「更新 .plugin」：真机实证用户机器策略拦截
  进程创建，旧桥进程杀不掉时更新一万遍插件也没用，只能给手动兜底指引。这是 v2.3.2 的
  核心教训，别回退。

## 已解决的坑（别再踩，细节看 git log 各版本 commit message）

1. **PlayState 是事件不是遥测**：`appendRegisterCall("PlayState")` 只在状态切换瞬间触发。
   任何「N 秒没事件就当过期」的设计都会在暂停 >N 秒后降级去猜 DOM → 状态反转（v2.3.1/v2.3.2 两轮真机）。
2. **每拍重新评分选媒体元素会换人**：网易云 DOM 有预加载/流浪 video/audio。
   现在是「连续对齐 2 拍上身份锁，同歌不换人」。别改回裸评分。
3. **倒退熔断必须 song 身份在场才启用**：songIdNow=0 时不熔断，否则无 store 环境新歌开头被钉死。
4. **零值垃圾样本**：深位置突报 ≈0 首拍不采纳（宿主 neZeroStreak 两击守卫 + 插件熔断双保险）。
   边界样本（0.4s 这种「非零垃圾」）必须进回归。
5. **构建产物 freshness**：`next build`（standalone）不写 out/。判断产物新旧的唯一可靠办法是
   在 out/ 的 chunk 里 grep 数字指纹（如 `needsPlugin`、`1.5.0`）。
6. **显示层啃蚀**：工具回传的文件内容可能被啃掉字节（`H[mode` 显示成 `Hode`）。
   关键判定用 od / 程序化断言，不信目视。
7. **WSH/PowerShell 策略拦截**（用户机器实证 0x80070312）：插件拉桥已 On Error 静默化 +
   直启优先 + 读回校验 + 退避。任何新的「拉进程」路径都必须能容忍被拦。
8. **sw.js 缓存**：gh-pages 部署后用户需 Ctrl+F5。每次改宿主行为都要提醒。

## 用户机器的已知约束（真机实证）

- Windows 策略/杀软拦截 wscript→powershell 进程创建（0x80070312），v2.3.2 起也拦不干净
  插件的 cmd/powershell 杀旧桥路径的可能性存在——所以「手动启动桥（备用）」文件夹永远留在交付包里。
- 用户对「提示说要做的操作做了却没用」零容忍：任何提示芯片必须与真实可行路径一一对应。

## 下一步开发任务（按优先级）

### A. seek 真机有效性验证与打磨（最高优先，用户核心诉求）
- 现状：三级阶梯 `channel.call("audioplayer.seek")` → `playing/setPlayingPosition` dispatch →
  `el.currentTime` 直写，逐级 420ms 实测，全败如实弹回。真机反馈「拖动无效」仍未根除。
- 任务：
  1. 在网易云 3.x 最新版上用 BetterNCM 开发者工具实抓 `audioplayer.seek` 的真实参数形态
     （`[songId, "songId|seek|rand", sec]` 的 tag 到底要不要随机数、songId 是 string 还是 number）。
  2. 若原生 RPC 形态不对，研究网易云自家进度条拖动的完整调用链（劫持 channel.call 打日志）。
  3. seek 生效后逐字歌词的时间轴跟随验证（seekNote ok 路径下歌词应立即跳句）。

### B. 暂停→恢复逐字歌词漂移的最终确认（用户持续报告的遗留项）
- v2.2.0 起的「真值绝对锚定」理论上已结构性归零漂移，v2.3.2 又加了身份锁+倒退熔断。
- 任务：真机暂停 30s → 恢复，录屏对比歌词高亮句与歌声音节；若仍有 >0.5s 错位，
  检查部件 lyric 引擎的 `lines[].t` 时间基与桥 `positionMs` 的时区/单位一致性。

### C. 「手动启动桥」体验收口
- 现状：芯片提示用户去交付包找 `启动SMTC桥.bat`。
- 任务：①做 `chushi-smtc-bridge.hta` 或带通知的静默安装器（注册计划任务代替 Run 键，
  计划任务不被 WSH 策略拦的概率更高）；②桥离线时面板给一键复制诊断信息
  （桥版本/插件版本/端口占用），降低用户回报成本。

### D. 部件视觉细节
- 逐字歌词「大字居中」模式与普通行级模式切换时面板高度弹簧仍有一次跳动（v2.3.1 lyHold 只管同曲丢词）。
  任务：高度迟滞扩展到「同曲内歌词模式切换」。
- f28 帧显示面板整体 y 位移过一次——复现路径待查（可能与歌词模式切换同一根因）。

### E. 工程化欠账
- `transfer/` 目录是第三方 wss 上传工具源码，考虑移出仓库或 submodule 化。
- upload/ 里的用户录屏/截图（含隐私）不要提交进 git（已在 .gitignore 确认）。
- verify-v232.mjs 里 NU 段的 mockTruth 注入手法较绕（先取 defaultNe 再置 null），
  重构时考虑给 mock 服务器加「逐拍 ne 覆盖」的正式接口。

## 交付流程备忘（每次发版照抄）

1. 改码 → 全产线重建 → verify 全绿（两轮）
2. commit（message 格式照旧：`vX.Y.Z: 一句话——①②③细节`）→ push main
3. `bash scripts/deploy-pages.sh`（工作树必须干净）→ 线上 grep 指纹验证
4. GitHub Release：`scripts/rel-v232.py` 风格（token 在 .pkgtmp/gh-token，0600）
   五资产直链 + SHA-256 全输出 ALL OK
5. 文叔叔合并包：`scripts/pw-lab/wss-send.py`（mjs 版登录接口 1003 已坏，用 py 版）
6. worklog.md 追加本版记录；README 版本历史补段
