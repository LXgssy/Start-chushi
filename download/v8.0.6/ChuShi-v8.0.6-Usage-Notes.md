# ChuShi v8.0.6 · 使用说明（媒体键退役 + 桥端备路修正 + 跳转恢复）

## 这次修了什么

1. **OS 媒体键方案整体退役（按你的指令）**：系统媒体卡片实测可控制，证明 InfLink-rs 控制通路有效，断点在桥端备路。v8.0.5 的 /api/native（WM_APPCOMMAND / keybd_event）从桥与 hub.dll 双侧根除，导入表回到 ws2_32 + kernel32（user32 清零）。
2. **实锤修复（InfLink-rs 源码逐行比对结论）**：桥全部 store 判定只认网易云 2.x 顶层 st.player——NCM 3.x 顶层是 st.playing（InfLink v3 adapter 即读 playing/playingList），旧版 redux 备路在 3.x 上永远 no-store 全灭。本版判三代，且控制 store 优先级反转 fiber（InfLink 同款 #root 遍历）第一——第二路与系统卡片按钮的 dispatch 等效。
3. **控制全链调用级遥测**：apiToggle/next/prev/seek 每次调用都落 cmdTrace（link:play-called / pause-called / no-method / throw / absent），断点不再不可见。
4. **幂等闸防 hub 重启吞命令**：hub 重启后 _id 归零重计，旧版 lastCmdDone 残留会静默吞掉新命令；检测 _id 回退自动清空旧世代。
5. **跳转（seek）恢复**：部件进度条恢复拖动/点击（InfLink seekTo 同源通路），拖动中本地预览，松手跳转；失败由 seekAck 管线亮「拖动未生效」芯片诚实呈现。
6. **e2e 台架立功抓到并修复真 bug**：首拍无源帧 position=0 → toggle 拍跳变 → 「假暂停自愈」误触发 → 主路验证被冻结病仲裁误判败 → 主路误降级。修复：执行后验证改 linkNow()（只信 InfLink 实时状态，零快照仲裁）+ 自愈收紧（上一拍必须已是同源）。

## 升级步骤（务必照做）

1. 关网易云，`C:\betterncm\plugins`：删旧 **ChuShi-Music-Bridge**，放入 `ChuShi-Music-Bridge-8.0.6.plugin`（Lyric-Source 7.2.0 不变；hub.dll 已内嵌在插件包里）
2. **完全退出并重启网易云**（托盘图标也要退）；InfLink-rs 3.2.11 不动
3. 「初始」页更新到 v8.0.6（线上 Pages 已同步；扩展用户重装 zip）
4. **重新导入 `ChuShi-Music-Preset-8.0.6.cshz`**（进度条拖动恢复在部件里）

## 验收

- 播放/暂停、上一首/下一首：面板按键 + 系统媒体卡片应同时可控
- 进度条：拖动/点击可跳转（面板与网易云双向同步）
- 若按键仍有问题：控制台（「初始」页或网易云页面）执行 `window.__chushiMusicBridge.debug().cmdTrace`，把输出发我——现在每次调用都有遥测（link:play-called 等），一眼定位断点
