#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.8 交付组装：桥插件（含重编 hub 双架构）+ NewTab zip + 说明 + AllInOne + SHA256SUMS

资产名单（v8.0.8）：
  ChuShi-Music-Bridge-8.0.8.plugin      音乐桥（hub.dll 8.0.8 重编：排空 JSON 修复 + hublog）
  ChuShi-Lyric-Source-7.2.0.plugin      歌词源（与上版相同，不重打包）
  ChuShi-NewTab-v8.0.8.zip              新标签页扩展（smtc.ts 8.0.8：stateAge/selftest/poll/hubLog）
  ChuShi-Music-Preset-8.0.6.cshz        SMTC 音乐预设（与上版相同，不重打包）
  ChuShi-v8.0.8-Usage-Notes.md          使用说明（ASCII 名）
  ChuShi-v8.0.8-AllInOne.zip            合并交付包
  SHA256SUMS.txt
"""
import hashlib, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.0.8'
VER = '8.0.8'
LYRIC_VER = '7.2.0'
PRESET_VER = '8.0.6'
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1) 桥 .plugin（zip 根部平铺，与历版同构） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{VER}.plugin'
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js', 'hub.dll', 'hub.dll.x64.dll'):
        p = BRIDGE_DIR / name
        if not p.exists():
            raise SystemExit(f'缺文件: {p}')
        z.write(p, name)
print(f'  built {plugin.name} ({plugin.stat().st_size} B)')

# ---------- 2) NewTab zip（EXTENSION_MODE=1 产物 out/ 根平铺） ----------
out_dir = ROOT / 'out'
if not out_dir.exists():
    raise SystemExit('缺 out/（先 EXTENSION_MODE=1 npx next build）')
newtab = OUT / f'ChuShi-NewTab-v{VER}.zip'
with zipfile.ZipFile(newtab, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(out_dir.rglob('*')):
        if p.is_file():
            z.write(p, p.relative_to(out_dir).as_posix())
print(f'  built {newtab.name} ({newtab.stat().st_size} B)')

# ---------- 3) 复用资产 ----------
for src, dst in [
    (ROOT / f'download/v8.0.7/ChuShi-Lyric-Source-{LYRIC_VER}.plugin',
     OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'),
    (ROOT / f'download/v8.0.7/ChuShi-Music-Preset-{PRESET_VER}.cshz',
     OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'),
]:
    if not src.exists():
        raise SystemExit(f'缺复用资产: {src}')
    shutil.copy2(src, dst)
    print(f'  copied {dst.name}')

# ---------- 4) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（控制失效真正根因修复：排空 JSON 八代缺失的收尾符）

## 你上一轮证据的完整解释

「音乐面板的所有控制还是无效」+ `debug()` 里 `postTrace: (7)`（页面发了 7 条命令全部 ok）+
`cmdTrace: []`（桥侧执行轨迹永远为空）+ 面板状态/进度正常——这四件事的唯一自洽解释：
**hub 的命令队列在把命令交给桥的那一刻，把它们全部弄坏了**。

本版用「逐行移植 hub C 逻辑到 Linux + 真实桥 JS 对打」的协议级复现抓到铁证：hub 排空接口
拼接的 JSON 数组每一条都**缺少外层对象的收尾大括号**——

    [{{"_id":1,"raw":{{"cmd":"toggle"}}}},...     ← 每条都差一个 }}

这不是合法 JSON。桥收到后解析必然抛异常 → 静默丢弃 → 但队列已经排空 →
命令灰飞烟灭、轨迹永远空白。反汇编比对本代所有历史发布包（v8.0.0~v8.0.7 八代
二进制里没有任何一处写入 `}}` 的指令），确认这是**与生俱来的八代缺陷**；
而历次自动化测试的模拟枢纽是自己拼的正确 JSON，所以永远测不出来。

## 修复

| 修复 | 说明 |
|---|---|
| **排空 JSON 收尾符（根因）** | hub 每条命令体后补写 `}}`——v8.0.0~v8.0.7 八代全部中招，本版起命令交付链路在协议层闭合 |
| **回路自证** | 桥每 8s 向自己队列投一条 `_selftest` 探针并验证 4s 内收回；连续 2 败自动全端口重发现枢纽。`debug().selftest` 一眼判断「命令回路是否闭合」 |
| **拉取失败不再静默** | 桥拉取解析失败/非数组落 `pull-fail` 轨迹 + `poll.lastNullAt`；轮询计数 `poll.drains/delivered` 透传 |
| **状态新鲜度** | `debug().stateAge` = 桥状态年龄（秒）；持续 >8s 自动全端口重探——「看到的状态是不是活的」变成数字 |
| **枢纽请求日志** | hub 新增 `/api/hublog`：入队/排空/租约/拦截收据环形 48 条，`debug().hubLog` 直读——未来任何断链一屏定层 |
| **no-recv 标记** | 页面 POST ok 但 6s 内无桥侧轨迹的命令在 `postTrace` 里标 `recv:false`（断层直接证据） |

## 升级步骤

1. **任务管理器结束所有网易云进程**（老规矩，防残留进程干扰）
2. 进 BetterNCM 插件目录：**替换 `ChuShi-Music-Bridge-{VER}.plugin`**（歌词源 7.2.0 与 cshz 预设均与上版相同，无需动）
3. 「初始」页更新到 v{VER}（扩展用户覆盖安装 NewTab zip）
4. 启动网易云 → 面板显示 `已连接 · API v8.0.8`

## 验收 / 若仍无效（可能性已极低）

面板点播放/暂停/上下曲/拖进度条。若仍有异常，「初始」页控制台：

    __chushiMusicBridge.debug()

截图完整输出。本轮起诊断口可一屏定层：

- `selftest.ok:false` → 命令回路断（桥会自动重探，若持续为 false 截图发我们）
- `postTrace` 里有 `recv:false` → 页面命令未达桥（配 `hubLog` 直接入队/排空对不上的位置）
- `cmdTrace` 有 `cmd#` 且 `cmdLast.ok:true` → 控制链路全通，问题在网易云侧（另查）
- `stateAge > 8` → 桥状态冻结（桥/宿主异常，重启网易云）

## 组件版本

- ChuShi Music Bridge **{VER}**（hub.dll **{VER}** 双架构重编：x86 主架 + x64 变体）
- ChuShi Lyric Source **{LYRIC_VER}**（与上版相同）
- 「初始」NewTab **{VER}**（插件版本门升至 {VER}）
- SMTC 音乐预设 {PRESET_VER}（与上版相同）
'''
notes = OUT / f'ChuShi-v{VER}-Usage-Notes.md'
notes.write_text(NOTES, encoding='utf-8')
print(f'  built {notes.name}')

# ---------- 5) SHA256SUMS + AllInOne ----------
staged = [plugin, newtab,
          OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin',
          OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz',
          notes]

def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

sums = OUT / 'SHA256SUMS.txt'
with sums.open('w', encoding='utf-8') as f:
    for p in sorted(staged):
        f.write(f'{sha256(p)}  {p.name}\n')
print('  built SHA256SUMS.txt')

aio = OUT / f'ChuShi-v{VER}-AllInOne.zip'
if aio.exists():
    aio.unlink()
with zipfile.ZipFile(aio, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(staged):
        z.write(p, p.name)
    z.write(sums, 'SHA256SUMS.txt')
print(f'  built {aio.name} ({aio.stat().st_size} B)')
print('\nDONE')
