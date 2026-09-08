#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 rel-v805.py 生成 rel-v806.py（版本/资产/BODY 替换）"""
import pathlib, re

src = pathlib.Path(__file__).resolve().parents[1] / 'scripts/rel-v805.py'
dst = pathlib.Path(__file__).resolve().parents[1] / 'scripts/rel-v806.py'
s = src.read_text(encoding='utf-8')
s = s.replace("TAG = 'v8.0.5'", "TAG = 'v8.0.6'")
s = s.replace("OUT = ROOT / 'download/v8.0.5'", "OUT = ROOT / 'download/v8.0.6'")
s = s.replace("'ChuShi-Music-Bridge-8.0.5.plugin'", "'ChuShi-Music-Bridge-8.0.6.plugin'")
s = s.replace("'ChuShi-NewTab-v8.0.5.zip'", "'ChuShi-NewTab-v8.0.6.zip'")
s = s.replace("'ChuShi-Music-Preset-8.0.5.cshz'", "'ChuShi-Music-Preset-8.0.6.cshz'")
s = s.replace("'ChuShi-v8.0.5-AllInOne.zip'", "'ChuShi-v8.0.6-AllInOne.zip'")

new_body = r'''## v8.0.6 · 媒体键退役 + 桥端备路实锤修复（InfLink-rs 源码逐行比对）+ 跳转恢复

### 这轮的结论（源码级）

系统媒体卡片能控制 ⇔ **InfLink-rs 内部控制通路有效**。源码实锤：系统卡片按钮 → Rust SMTC → InfLink 前端 handleAdapterCommand → adapter.play() → redux dispatch；而 `window.InfLinkApi.play()` 就是同一个 adapter.play()——三者同一条路。桥 v8.0.2 起主路就在调它，但备路有实锤 bug，导致一失效就全灭。

### 修了什么

| 问题 | 根因 | 修复 |
|---|---|---|
| **桥 redux 备路全灭（实锤）** | 桥全部 store 判定只认网易云 2.x 顶层 st.player；NCM 3.x 顶层是 st.playing（InfLink v3 adapter 即读 playing/playingList）→ 3.x 上备路永远 no-store | storeOk/findDvaStore/readStore 判三代（player ∥ playing）；控制 store 优先级反转 fiber（InfLink 同款 #root 遍历）第一——第二路与系统卡片按钮的 dispatch 等效 |
| **媒体键方案退役（按你指令）** | 系统卡片实测可控证明 InfLink 通路有效，OS 输入层重放不再需要 | /api/native 从桥与 hub.dll 双侧根除；导入表回到 ws2_32 + kernel32（user32 清零），构建门断言「零 USER32」+「媒体键符号根除」 |
| **断点不可见** | 主路调用缺遥测，失败看不见 | 控制全链调用级遥测进 cmdTrace（link:play-called / pause-called / next-called / seek-called / absent / throw），容量 12→20 |
| **命令可能被静默吞** | hub 重启后 _id 归零重计，桥侧 lastCmdDone 残留旧世代 _id 把新命令当重复跳过（trace 都不留） | 幂等闸回退防护：检测 _id 回退自动清空旧世代记录（e2e B5 断言） |
| **主路验证误判（e2e 台架实锤）** | 首拍无源帧 position=0 → toggle 拍跳变 12.3s → 「假暂停自愈」误触发 → 900ms 验证被冻结病仲裁判败 → 主路误降级 | 执行后验证改 linkNow()（只信 InfLink 实时状态，零快照仲裁）；自愈收紧（上一拍必须已是同源，首拍/源切换跳变绝不自愈） |
| **跳转（seek）恢复** | v8.0.3 曾把进度条改只读 | 部件进度条恢复拖动/点击（InfLink seekTo 同源通路），拖动中本地预览、松手跳转；失败亮「拖动未生效」芯片诚实呈现；面板与网易云双向同步 |

### 升级（务必照做）
1. 关网易云，`C:\betterncm\plugins`：删旧 **ChuShi-Music-Bridge**，放入 `ChuShi-Music-Bridge-8.0.6.plugin`（Lyric-Source 7.2.0 不变；hub.dll 已内嵌）
2. **完全退出并重启网易云**（托盘也要退）；InfLink-rs 3.2.11 不动
3. 「初始」页更新到 v8.0.6（线上 Pages 已同步；扩展用户重装 zip）
4. **重新导入 `ChuShi-Music-Preset-8.0.6.cshz`**（进度条拖动在部件里）

### 验证
- 插件门 43/43（新增：零 USER32 导入门 + 媒体键符号根除门 + 三代 store/遥测/幂等闸回退门）
- e2e 50/50（新增 B3 死网易云→诚实失败 path=button + 媒体键零触碰行为断言；B4 活 link 主路一枪命中 path=link；B5 hub 重启 _id 回退不吞命令）
- Pages 线上核验：chunk 含 8.0.6 版本门、sandbox.js unitizeLine 在位
- Pages 已部署：https://lxgssy.github.io/Start-chushi/
'''

# 直白切割：定位 BODY = r''' ... ''' 整块替换
start = s.index("BODY = r'''")
end = s.index("'''", start + 10) + 3
s = s[:start] + "BODY = r'''" + new_body + "'''" + s[end:]
dst.write_text(s, encoding='utf-8')
print('rel-v806.py generated OK')
