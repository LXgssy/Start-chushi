# 「初始」v8.0.5 使用说明（控制终极兜底：原生媒体键）

## 这一代修什么：为什么你的按键一直没用

你在控制台看到的 `window.__chushiMusicBridge.debug().cmdTrace` 输出（两条
`toggle`、`ok:true`、`port:26901`）是非常关键的取证——它证明：

1. 「初始」页面 → hub（26901）的**控制投递链路完全正常**（`ok:true` 是 hub
   受理回执）；数据面（标题/进度/歌词）也一直活着，说明桥的轮询也活着。
2. 那么命令一定被桥取走并执行了。连续四轮（v8.0.2~v8.0.4）实测表明：桥在
   **渲染层**的四级备路——InfLink 派发 → 直发 dva action → audio 元素 →
   可见按钮——在你这台机器的网易云 3.x 版本上**全部无效**（这是部分 NCM
   3.x 版本的通病：同一 redux store 读取正常、派发被 reducer 静默忽略）。

**v8.0.5 的解法：不再依赖网易云内部任何东西。** hub.dll 就住在网易云主进程
里，新增 `/api/native` 端点，直接在**操作系统输入层**重放「媒体键」：

- mode 1：`WM_APPCOMMAND` 直投网易云主窗口（scoped，零外溢）；
- mode 2：`keybd_event` 全局虚拟媒体键（VK_MEDIA_PLAY_PAUSE / NEXT / PREV），
  与你**物理键盘上的媒体键走完全同一条系统通路**——网易云自带 SMTC 或
  InfLink-rs 二者必居其一持有媒体会话，物理媒体键能控歌，这条路就必通。

桥的执行顺序：InfLink → dva → 元素 → 按钮 → **原生媒体键（mode1 → mode2）**，
每一级都带延时验证与回执；注入前还有方向预检（目标已达成不补刀，防反复横跳）。

### 顺带修掉的一个隐藏 bug（e2e 台架实锤）

页面刚打开的几秒内点按键，桥可能拿「探测前的陈旧状态帧」判方向，导致方向
判反还被误报成功（假 `ok:'link'` 回执）。v8.0.5 改为「实时 playState 优先 +
自愈真值仲裁」，方向判定不再吃陈旧帧。

## 更新步骤（这次只需要换 1 个插件文件）

1. 关闭网易云，进 `C:\betterncm\plugins`：
   删掉旧 **ChuShi-Music-Bridge-8.0.x.plugin**，放入
   `ChuShi-Music-Bridge-8.0.5.plugin`（**新 hub.dll 8.0.5 已内嵌其中**）。
   Lyric-Source 7.2.0 不用动。
2. **完全退出并重启网易云**（托盘右键退出，不是关窗口）；InfLink-rs 3.2.11
   保持启用。
3. 「初始」页刷新即可（线上 Pages 已同步 v8.0.5；扩展用户覆盖安装
   `ChuShi-NewTab-v8.0.5.zip`）。
4. **预设不用重导**——本代部件零改动，旧 cshz 继续用。

## 验收点

- 放歌 → 点面板播放/暂停、上一首/下一首：**应该动了**。
- 若万一还不动：面板顶部红芯片会写出桥走到哪一级——
  - 「桥已尝试全部备路（**native**）」= 连系统媒体键都没能翻转网易云，请
    完全退出并重启网易云再试；
  - 「组件待更新」= 插件没换成功或没重启网易云。
- 想看桥的执行轨迹：「初始」页控制台
  `window.__chushiMusicBridge.debug()` → `cmdLast` 字段（`path:'napp'` =
  WM_APPCOMMAND 生效，`'nkey'` = 全局媒体键生效）。
- 网易云侧同目录 `hub-log.txt` 会有 `[native] appcommand/mediakey` 注入日志。

## 组件版本

- ChuShi Music Bridge **8.0.5**（**内含重编的 hub.dll 8.0.5**：新增
  `/api/native` 原生媒体键端点；导入表新增 USER32，零 WinRT 宪法不变）
- ChuShi Lyric Source **7.2.0**（未变更）
- 「初始」NewTab **8.0.5**（插件版本门升至 8.0.5，旧插件会亮「组件待更新」）
- SMTC 音乐预设 8.0.5（部件与 v8.0.4 完全一致，**无需重导**）
