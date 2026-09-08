# ChuShi 音乐链路 v7.1.0 修复说明

## 本版修了什么

### 1. SMTC 插件崩溃网易云 —— 架构级根治（不再是补丁）

**四代崩溃的完整因果链**（v7.0.0 → v7.0.2 递进修复仍崩）：
- v7.0.0：缺 apartment 初始化 → 崩 combase.dll
- v7.0.1：TimelineProperties 被误判为值类型栈上直传 → 崩 Windows.Media.MediaControl.dll
- v7.0.2：ABI 全部修正（windows-rs 逐槽位核实）仍崩——反汇编实锤崩溃点在
  `RoActivateInstance(TimelineProperties)` 成功之后、对系统返回对象做 QI 时崩在
  系统 DLL 内部。我们侧代码全对，**只能是网易云进程内的 COM/SMTC 环境被污染**
  （你之前猜「和网易云的 smtc 服务冲突」方向是对的）。

**v7.1.0 架构律：WinRT 绝不进宿主进程。**
- 插件 DLL 瘦身为纯「监督者」：只负责释放并拉起独立进程 `ChuShiSMTCBroker.exe`、看护重启
- 全部 WinRT/SMTC 工作在 broker 自己的干净进程里完成（STA + 消息泵 + GetForWindow，Firefox 同款序列）
- **网易云进程内零 WinRT 代码，结构上不可能再崩宿主**
- broker 就算出问题也只死自己：无系统弹窗、自动重启（10 分钟内最多 5 次，防崩溃循环）、
  全程写日志；网易云完全无感
- 时间线对象改用自实现 COM 对象（CCW），彻底绕开崩溃过的系统类激活路径
- 父进程看门狗：网易云退出，broker 跟着退出，不留僵尸会话

### 2. 音乐面板预设包「registerCommand is not defined」弹窗

预设命令脚本还在用旧版裸 `registerCommand(...)` / `notify(...)` 写法，
而现版沙箱只注入 `chushi` 命名空间。已改为 `chushi.registerCommand` / `chushi.notify`，
预设包重新打包。

## 安装（三插件 + 预设包都在本目录）

1. **先卸载旧版 ChuShi-SMTC-Manager**（BetterNCM 插件列表里卸载，或直接删
   `C:\betterncm\plugins_runtime\ChuShi-SMTC-Manager` 后重启网易云）
2. 安装 `ChuShi-SMTC-Manager-7.1.0.plugin`（拖进 BetterNCM 插件文件夹即可）
3. `ChuShi-Music-Bridge-7.0.0.plugin` 与 `ChuShi-Lyric-Source-7.0.0.plugin`
   未变，若已装 7.0.0 无需重装
4. 「初始」里重新导入 `初始SMTC音乐预设.cshz`（先删旧的音乐预设再导入）

## 验收清单

- [ ] 启动网易云**不再弹 BetterNCM 崩溃报告**（本版宿主进程零 WinRT，理论上不可能再崩）
- [ ] 任务管理器可见 `ChuShiSMTCBroker.exe` 后台进程（网易云启动后被拉起）
- [ ] Windows 系统媒体卡片（音量弹层/Win+G）显示真实曲目：歌名/歌手/专辑，不再是「未知曲目」
- [ ] 系统卡片播放/暂停/上一首/下一首可用
- [ ] 系统卡片进度条可拖（seek 生效）
- [ ] 无需开启网易云自带 SMTC 开关（建议保持关闭，避免系统出现两张卡片）
- [ ] 「初始」页面音乐面板显示播放中曲目，进度/时间随播放走
- [ ] 加载音乐面板预设包不再弹「registerCommand is not defined」

## 报障指引

若仍有异常，请把以下两个文件一起发来（都在
`C:\betterncm\plugins_runtime\ChuShi-SMTC-Manager\`）：
- `native-log.txt`（监督者日志：broker 拉起/退出/重启记录）
- `broker-log.txt`（broker 日志：SMTC 注册/每次状态落盘/事件分发/任何 AV 的十六进制码）

 broker 若崩溃会自动重启，你最多只会感到系统卡片闪一下。

## SHA256

见 `SHA256SUMS.txt`。
