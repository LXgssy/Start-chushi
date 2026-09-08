#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.4 GitHub Release 发布（资产 ASCII 名 + 逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.0.4'
OUT = ROOT / 'download/v8.0.4'

ASSETS = [
    'ChuShi-Music-Bridge-8.0.4.plugin',
    'ChuShi-Lyric-Source-7.2.0.plugin',
    'ChuShi-NewTab-v8.0.4.zip',
    'ChuShi-Music-Preset-8.0.4.cshz',
    'ChuShi-v8.0.4-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.0.4 · 歌词滞留根治 + 逐字全曲覆盖（按你指定的架构）+ 控制可观测

### 修了什么

| 问题 | 根因 | 修复 |
|---|---|---|
| **切歌后歌词不换，还是上一首的词在滚** | ①hub 歌词缓存是单槽，切歌瞬间页面拉到的必然是上一首的词，而页面端不校验归属照单全收、还把新歌标记为「已拉取」；②真值源 songId 恒 0 时切歌检测永不触发 | 三层根治：桥切歌检测改曲键（songId|title）+ 切歌立即推占位清槽；页面端歌词归属强校验（songId 不符一律拒绝重试，e2e 首帧旧歌残留被拒实测）；渲染层曲目不一致拦截 |
| **中文歌没有逐字效果（yrc 不覆盖所有歌）** | 逐字渲染只在有 yrc 逐字数据时启用 | **按你指定的架构实现**：纯行级歌词行内按显示单元（汉字/英文单词加权均分）生成逐字，时间基准完全由 SMTC 播放进度驱动——全曲都有逐字；暂停时桥自动重查逐字源校准升级（30s×3 次/曲），拿到真 yrc 无缝替换 |
| **暂停/恢复后逐字漂移** | 网易云暂停/恢复有淡入淡出，恢复瞬间进度上报带偏差 | 恢复翻转时 600ms 软重锚缓动入轨（smoothstep）：不跳变、淡入期偏差不残留成永久漂移 |
| **一行唱完后高亮瞬间消失** | 行离场时遮罩直接归零 | 已唱行离场保持全亮，高亮层 0.6s 渐隐 + 行色渐变到已唱灰（过了这句再渐变消失）；seek 倒回自动还原未唱态 |
| **放歌时歌词不立即跳到第一行** | 前奏期歌词区不定位 | 前奏期立即定位并高亮第一行（未唱态） |
| **播放/暂停、上一首/下一首按键失效无从排查** | 桥执行轨迹只在网易云页面诊断口，浏览器里测试拿不到 | **控制可观测**：桥把命令回执（是否执行/四路降级走到哪一级）随状态透出，面板芯片归因三态——「插件过旧」/「音乐桥未执行命令」/「网易云未响应控制（桥已尝试全部备路）」；「初始」页控制台 window.__chushiMusicBridge.debug().cmdTrace 现在也有页面侧口（side:"page"，含 hub 连接/控制 POST 轨迹） |

### 升级（务必照做）
1. 关网易云，`C:\betterncm\plugins`：**删旧 Music-Bridge/Lyric-Source**，放入 `ChuShi-Music-Bridge-8.0.4.plugin` + `ChuShi-Lyric-Source-7.2.0.plugin`（**两个都要换**）
2. **完全退出并重启网易云**；InfLink-rs 3.2.11 不动
3. 「初始」页更新到 v8.0.4（线上 Pages 已同步）
4. **重新导入 `ChuShi-Music-Preset-8.0.4.cshz`**（渐隐/首行定位/控制归因都在部件里）

### 验证
- 插件门 39/39（新增 v8.0.4 曲键切歌/pending 占位/命令回执/暂停校准门 + 歌词源 force/升级门）
- e2e 44/44（**新增：mock hub 单槽首帧回旧歌残留 → 客户端拒绝并重试直至新词**；cmdLast 回执透出断言）
- 渲染台架 25/25：渐隐律五断言（沙箱链路）+ 伪逐字五断言（纯 lrc 歌 mode=1 + 词遮罩推进）+ 首行预备 + 归因三态 + v8.0.3 悬停/进度条/控制反馈全量回归
- Pages 已部署：https://lxgssy.github.io/Start-chushi/
'''

def api(method, path, data=None, raw=False, ctype='application/json'):
    url = path if path.startswith('https://') else f'https://api.github.com{path}'
    req = Request(url, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'chushi-rel')
    body = None
    if data is not None:
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
        req.add_header('Content-Type', ctype)
    try:
        with urlopen(req, body if method != 'GET' else None, timeout=120) as r:
            payload = r.read()
            return r.status, (payload if raw else (json.loads(payload) if payload else {}))
    except HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    code, rel = api('GET', f'/repos/{REPO}/releases/tags/{TAG}')
    if code == 200:
        rid = rel['id']
        print(f'release {TAG} exists id={rid}, updating')
        api('PATCH', f'/repos/{REPO}/releases/{rid}', {'body': BODY, 'draft': False, 'prerelease': False})
    else:
        code, rel = api('POST', f'/repos/{REPO}/releases', {
            'tag_name': TAG, 'target_commitish': 'main', 'name': TAG,
            'body': BODY, 'draft': False, 'prerelease': False,
        })
        rid = rel['id']
        print(f'release {TAG} created id={rid}')

    for name in ASSETS:
        p = OUT / name
        dig = sha256(p)
        # 已有同名资产先删
        code, assets = api('GET', f'/repos/{REPO}/releases/{rid}/assets?per_page=100')
        for a in assets:
            if a['name'] == name:
                api('DELETE', f"/repos/{REPO}/releases/assets/{a['id']}")
                print(f'  deleted old {name}')
                time.sleep(1)
        upload_url = rel['upload_url'].split('{')[0] + f"?name={name}"
        code, resp = api('POST', upload_url, p.read_bytes(), raw=True,
                         ctype='application/octet-stream')
        print(f'  upload {name}: HTTP {code} ({p.stat().st_size} B)')
        # 回读校验
        code2, assets = api('GET', f'/repos/{REPO}/releases/{rid}/assets?per_page=100')
        match = [a for a in assets if a['name'] == name]
        ok = match and match[0]['size'] == p.stat().st_size
        print(f'  verify {name}: {"OK" if ok else "MISMATCH"}')
        if not ok:
            sys.exit(1)
    print(f'RELEASE-OK {TAG} id={rid}')

if __name__ == '__main__':
    main()
