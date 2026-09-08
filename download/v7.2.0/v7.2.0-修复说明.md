# ChuShi SMTC 三插件 v7.2.0 修复说明

> 本轮基于你提供的 broker-log.txt / native-log.txt 定位，三个问题两个根治、一个澄清。

## 本轮日志诊断结论（重要，请先读）

**好消息：这轮没有任何崩溃弹窗 = v7.1.0 独立 broker 架构完全成功。**
日志显示 broker 干净启动（STA 初始化 → 会话注册 → 两个事件监听全部成功），
网易云进程全程零崩溃。剩下的问题是功能性的，本轮全部处理：

### 1. 系统卡片显示「未知曲目」—— 根因找到并根治

日志证据：broker 在启动 1.7 秒后收到了插件B 的第一次推送，说明 **B→broker
数据链路是通的**。但推送内容是空的（歌名/歌手/专辑全空）。

根因：插件B 读取网易云内部 dva store 的探针用的是 webpack4 的老办法
（模块缓存挂在 require.c 上），**新版网易云换 webpack5 后这个缓存已不存在**，
store 永远找不到 → 歌名永远为空 → broker 把自己的兜底字符串「未知曲目」
推上了系统卡片。**你在卡片上看到的「未知曲目」就是这四个字本身。**

v7.2.0 修复（插件B 升级 7.1.0）：
- **React fiber 树查找**（webpack5 可靠路径）：从页面任意元素找 React fiber，
  走到根后广度优先搜索 react-redux Provider 的 store —— 这是新版网易云唯一
  稳定的 store 入口
- 保留 webpack4 老探针（老版本兼容）+ window.g_app 快速通道
- **navigator.mediaSession.metadata** 兜底（若开了网易云自带 SMTC，页面自己会设置元数据，直接读）
- **播放条 DOM 刮削** 最后兜底（封面/标题/歌手）
- broker 侧同步修复：全空元数据一律不再上卡（宁可保留上一首的真实信息，也不再刷「未知曲目」）

### 2. 系统卡片点暂停/播放后消失 —— raise 路径加防弹衣 + 5 秒自愈

根因：系统卡片按钮的事件回调发生在 broker 消息泵的 DispatchMessageW 内部，
v7.1.0 这里没有 SEH 保护 —— 一旦系统回调路径出任何异常，broker 会静默退出
（崩溃界面已被主动压制），媒体会话随之销毁 = 卡片消失。

v7.2.0 修复（插件A 升级 7.2.0）：
- 消息泵整个循环体（含事件分发）全部 SEH 覆盖，HTTP 线程同样覆盖
- SetUnhandledExceptionFilter 最后防线：任何线程任何路径的未处理异常先落日志再退场
- broker 若真的异常退出，监督者 **4 秒内自动拉起**（原最长 8 秒），卡片自动回来
- 新增事件级日志：每次按钮/拖动事件的系统回调、每次元数据应用（含歌名前 40 字）
  都会记入 broker-log.txt —— 下次再有任何异常，日志能直接给出精确位置

### 3. 安装后加载久 / 插件市场打不开 —— 澄清 + 优化

native-log 显示三个网易云进程在 250ms 内全部完成插件加载，我们的 DLL 全程
异步非阻塞（日志里 broker 是 6 秒后才在后台线程拉起的，不占宿主时间）。
加载慢与市场打不开更可能是：
- **首次安装后 Windows Defender 对新释放的 broker exe 的扫描**（一次性，之后缓存）
- **BetterNCM 插件市场的源站在境外，网络不通/超时**（与插件无关）

v7.2.0 仍做了优化：监督者改为「先备好 exe 再探测」，broker 尽早就位；
新增计时日志，下次如果还慢，日志会写明时间花在哪一步。

## 安装步骤

1. 完全退出网易云（托盘也退出）
2. 把 `plugins_runtime`（C:\betterncm\plugins_runtime）里旧的
   ChuShi-SMTC-Manager / ChuShi-Music-Bridge / ChuShi-Lyric-Source 三个文件夹删掉
3. 把本包三个 .plugin 文件放进 C:\betterncm\plugins\（或用 BetterNCM 安装）
4. 启动网易云，播放任意一首歌
5. 看系统音量浮窗/媒体卡片：应显示真实歌名、歌手、封面；卡片按钮可控制网易云，
   进度条可拖动

## 验收清单

- [ ] 播放歌曲后，系统媒体卡片显示真实歌名/歌手/封面（不再「未知曲目」）
- [ ] 在系统卡片上点暂停/播放/上一首/下一首，网易云正常响应，卡片**不再消失**
- [ ] 在系统卡片上拖进度条，网易云跳转正确
- [ ] 「初始」新标签页音乐面板同步播放状态
- [ ] 网易云本体全程无崩溃弹窗

## 包内容

| 文件 | 版本 | 说明 |
|---|---|---|
| ChuShi-SMTC-Manager-7.2.0.plugin | 7.2.0 | SMTC 管理器（监督者 DLL + 独立 broker） |
| ChuShi-Music-Bridge-7.1.0.plugin | 7.1.0 | 网易云 API 桥（元数据链根治） |
| ChuShi-Lyric-Source-7.0.0.plugin | 7.0.0 | 歌词源（未变动，重打包） |
| 初始SMTC音乐预设.cshz | — | 「初始」音乐面板预设（未变动） |

## 报障方式

若仍有异常，把这两个文件一起发来：
- C:\betterncm\plugins_runtime\ChuShi-SMTC-Manager\native-log.txt
- C:\betterncm\plugins_runtime\ChuShi-SMTC-Manager\broker-log.txt

另外可在网易云页面控制台（F12）执行 `window.__chushiMusicBridge.debug()`
把输出发来 —— 会直接显示五层元数据源各命中了哪一层。
