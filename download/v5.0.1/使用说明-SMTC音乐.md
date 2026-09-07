# 「初始」SMTC 音乐 v5.0.1 插件修复说明（SMTC Manager 在插件列表消失）

## 这一代只修一件事：SMTC Manager 装了但插件列表里看不到

1. **根因（BetterNCM 源码实锤）**：网易云 3.x 下，BetterNCM 会**静默丢弃**
   manifest 里没有 `"ncm3-compatible": true` 字段的插件——不报错、不显示、
   不解压。v5.0.0 的 SMTC Manager 重写时丢了这个字段（老版 2.1.0 是有的），
   所以在你的网易云 3.x 上消失；而 Music API 5.0.0 带着这个字段，所以
   显示正常。这正是「只有一个插件看不到」的原因。
2. **v5.0.1 修复**：两个插件 manifest 都带上 `ncm3-compatible: true`，
   并新增构建门：今后任何一代缺这个字段直接构建失败，永不复发。
3. **文案按你的要求调整**：插件**名称保持英文**（ChuShi SMTC Manager /
   ChuShi Music API），**介绍改回中文**；.plugin 文件名与代码仍为纯 ASCII
   （中文文件名在 BetterNCM 里按 ANSI 码页解析，确实读不了，实测实锤）。
4. **本次只改两个插件包**：扩展、预设包、引擎零改动——无需重装扩展、
   无需重导预设、无需强刷浏览器。

## 升级（只两步）

1. **删旧插件**：打开 BetterNCM 数据目录的 `plugins` 文件夹，
   **删掉里面所有旧版 .plugin 文件**（包括 ChuShi-*-5.0.0.plugin 和
   任何更早的「初始」插件）。同 slug 的插件会解压到同一目录，
   旧文件不删会在启动时反向覆盖新插件。
2. **装新插件**：放入 `ChuShi-SMTC-Manager-5.0.1.plugin` 和
   `ChuShi-Music-API-5.0.1.plugin`，**完全退出并重启网易云音乐**
   （插件只在启动时解压加载，热插不生效）。

## 装完列表里还是没有？

- 看看 BetterNCM 数据目录有没有 `disable_list.txt`：里面若有一行
  `cc.chushi.smtcbridge` 或 `cc.chushi.ncmapi`，删掉那一行再重启
  网易云（这是「已停用插件」名单，新旧插件共用 slug，会被旧记录连坐）。
- 确认放对目录：.plugin 文件要放在 BetterNCM 数据目录的 `plugins`
  文件夹里（不是 plugins_runtime，那个是启动时自动生成的）。
- 确认网易云是完全重启过的（托盘右键退出，不是只关窗口）。

## 30 秒自查

- BetterNCM 插件列表同时出现 **ChuShi Music API** 和 **ChuShi SMTC Manager**；
- 网易云播放任意歌曲 → Windows 悬浮窗/音量面板出现卡片，**进度条每秒走、可拖**；
- 「初始」面板显示歌名/进度/逐字歌词，页脚 `API v5.0.1 · 管理 v5.0.1`；
- 拖动面板进度条 → 网易云真实跳转（失败会明确提示，不再静默无效）；
- 暂停 30 秒再恢复 → 逐字歌词从暂停处继续，无漂移；
- 网易云**自己的**界面（进度条/播放按钮）行为与装插件前完全一致。

## 手动兜底（仅当安全软件拦截插件自动拉起引擎时）

交付包里 `ChuShi-SMTC音乐-交付包.zip` 内含 `chushi-smtc-engine.ps1` 与
`Start-Engine.bat`：解压后双击 `Start-Engine.bat` 即手动启动引擎，
「初始」面板几秒内应自动连接。

## 端口

引擎监听 `127.0.0.1:26801`（仅本机回环）。宿主、双插件、预设三方一致；
旧端口残留引擎会被新管理插件自动清掉。
