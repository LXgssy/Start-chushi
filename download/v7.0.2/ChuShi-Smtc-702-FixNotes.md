# ChuShi SMTC Manager 7.0.2 — 时间线崩溃终修

## 这版修了什么
7.0.1 播歌崩溃（Windows.Media.MediaControl.dll 访问冲突）根因已实锤：
进度条时间线更新时，插件把「时间线属性」当成裸结构体直接传给了系统 API，
而该 API 实际要求传入一个 COM 对象。系统把结构体内容当对象指针解引用，
必然崩溃。7.0.2 改为按系统要求先创建对象再传入（并带双保险兜底）。

## 与网易云自带 SMTC 的关系
无关。崩溃是插件自身传参错误；Windows 支持多个媒体会话并存，网易云自带
SMTC 开关开或关都不影响本插件（建议关闭网易云开关，仅为了避免系统弹出
两张重复的媒体卡片）。

## 安装（只换插件A）
1. 完全退出网易云音乐（托盘也退出）
2. 删除 C:\betterncm\plugins\ 里的旧 ChuShi-SMTC-Manager-7.0.1.plugin
3. 把本 7.0.2 .plugin 放入 C:\betterncm\plugins\
4. 启动网易云音乐（插件B/C 7.0.0 不用动）

## 验收点
- 播歌不再崩溃
- Windows 音量弹层 / 锁屏出现独立媒体卡片（封面/标题/进度走动/可拖/媒体键）
- 「初始」面板正常显示音乐状态
- 若异常：发 C:\betterncm\plugins_runtime\ChuShi-SMTC-Manager\native-log.txt

sha256: 295a024d25e8c4ea2c8fb88398299775df7ee5a338b056390362cab922b3b890
