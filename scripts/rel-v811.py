#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.1.1 GitHub Release 发布（黑边根治；v8.1.0 未单独发版一并交付；逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.1.1'
OUT = ROOT / 'download/v8.1.1'

ASSETS = [
    'ChuShi-Music-Bridge-8.1.0.plugin',
    'ChuShi-Lyric-Source-7.3.0.plugin',
    'ChuShi-NewTab-v8.1.1.zip',
    'ChuShi-Music-Preset-8.1.0.cshz',
    'ChuShi-v8.1.1-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.1.1 · 「初始」右侧黑边根治（v8.1.0 歌词乱跳/面板闪断双根治一并交付）

> v8.1.0 未单独发 Release，其全部修复包含在本版内。**本版唯一新内容：NewTab v8.1.1 黑边根治**；桥/歌词源/预设沿用 8.1.0 / 7.3.0 / 8.1.0（未变组件按惯例保留真实版本号）。

### v8.1.1 · 右侧大黑边

| 现象 | 根因 | 修复 |
|---|---|---|
| 壁纸模式下「初始」页右侧空一条大黑边 | `scrollbar-gutter:stable` 常驻预留 ~15px 经典滚动条槽位；Chromium 对槽位只画画布背景，且一切元素绘制（含根元素背景图像）均裁剪在 ICB 边界——壁纸铺不到槽位（最小页实证，CSS 无解） | **根滚动条隐藏**（`scrollbar-width:none`）：无滚动条即无槽位，壁纸全出血直通右缘；滚动条出现/消失不再改变布局宽度（v1.8.0「两排变一排抖动」防抖目标同源保持）；页面仍可滚（滚轮/触摸/键盘）；旧 CEF 自动回退经典滚动条 |

配套：html 画布主题底色（浅色 `#f6f5f2` / 深色 `#0a0a0e`，首帧防闪白）+ body 保持透明（不遮 `-z-10` 壁纸层）。

### v8.1.0 · 歌词乱跳 / 面板闪断 双根治

| 现象 | 根因 | 修复 |
|---|---|---|
| 歌曲正常播放，歌词 1:05↔1:06 秒级锯齿乱跳 | 桥端位置双源交替：InfLink 时间线（SMTC 上报滞后 ~1s）与 audio 元素真值在空缺时交替补位，位置每拍在两源间跳动，页面端偏差 ≥0.35s 硬锚放大成锯齿 | 桥 **8.1.0 位置单源化**：一律以 audio 元素 currentTime（帧级连续真值）为唯一源，InfLink 时间线仅元素缺席兜底 |
| seek 后时间与歌词短暂脱节 | seek 后网易云上报「中间态」位置快照，旧护航窗对中间态直接弃窗回锚 | NewTab 8.1.0 **回退熔断**（稳态期回退 0.6~6s 拍拒收，连续 2 拍放行，护航窗收窗 grace 豁免）+ **中间态保位**；**暂停/播放逐字歌词校准管线原样未动** |
| 面板每 ~4.5s 整体消失成「系统媒体待接入」再恢复 | 桥状态时间戳陈旧触发全端口重探，重探计入掉线连败 → 面板周期切空态 | smtc.ts 重探不再触发掉线（只换端口、本拍照常上屏）；cshz 8.1.0 连接瞬断先保内容亮黄灯「重连中…」3 秒才降级 |
| gh-pages 网页黑屏 | 上一次部署误用 EXTENSION_MODE（无 basePath）构建 → 资源 404 | EXPORT_MODE basePath 重建部署并线上核验 |

### 测试

- 核心单测：verify-v809-core 21/21 + verify-v810-core 12/12（双源交替零回跳 / 连续回退诚实放行 / 收窗 grace / 中间态保位 / 判歌容错 / 翻转放行暂停取真值）
- 链路 e2e：真实桥 × 真实 hub × 双实例 15/15；歌词源信封门 11/11
- 黑边修复验证 9+1 全绿：gutter=0 / clientWidth==innerWidth / Aurora+壁纸 rect 直通右缘 / 右缘像素照片模式全红 + 极光模式无缝 / 右缘命中壁纸层 / 滚动可用

### 升级步骤

**上次用到 v8.0.9 或更早（大多数用户）——四件全换：**

1. **任务管理器结束所有网易云进程**
2. BetterNCM 插件目录替换 `ChuShi-Music-Bridge-8.1.0.plugin` 与 `ChuShi-Lyric-Source-7.3.0.plugin`（歌词乱跳根治在桥）
3. 「初始」页更新到 v8.1.1（扩展用户覆盖安装 `ChuShi-NewTab-v8.1.1.zip`；网页版 gh-pages 已同步上线）
4. 「初始」页内重新导入 `ChuShi-Music-Preset-8.1.0.cshz`（面板防闪断宽限）
5. 启动网易云 → 面板显示 `已连接 · API v8.0.9`（hub 版本线沿用）

**已在内测 v8.1.0（未发布版）：只需更新 NewTab v8.1.1。**

### 验收要点

- 壁纸模式右侧无黑边，壁纸直通屏幕右缘；窗口缩放无布局抖动
- 正常播放歌词行稳定推进，无秒级锯齿；拖动进度条立即对位
- 音乐面板不再周期性整体消失
- 若异常：「初始」页控制台 `__chushiMusicBridge.debug()` 截图（`postTrace` / `cmdTrace` / `selftest`）
'''

def api(method, path, data=None, raw=False, ctype='application/json'):
    if path.startswith('http'):
        url = path
    else:
        url = f'https://api.github.com/repos/{REPO}/{path.lstrip("/")}'
    req = Request(url, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    body = None
    if data is not None:
        body = data if raw else json.dumps(data).encode()
        if raw:
            req.add_header('Content-Type', ctype)
        else:
            req.add_header('Content-Type', 'application/json')
    try:
        with urlopen(req, body) as r:
            txt = r.read()
            return r.status, json.loads(txt) if txt and not raw else (json.loads(txt) if txt else {})
    except HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    code, rel = api('GET', f'/releases/tags/{TAG}')
    if code == 200:
        rid = rel['id']
        print(f'release {TAG} exists id={rid}, updating')
        api('PATCH', f'/releases/{rid}', {'body': BODY, 'draft': False, 'prerelease': False})
    else:
        code, rel = api('POST', '/releases', {
            'tag_name': TAG, 'target_commitish': 'main', 'name': TAG,
            'body': BODY, 'draft': False, 'prerelease': False,
        })
        rid = rel['id']
        print(f'release {TAG} created id={rid} (HTTP {code})')

    for name in ASSETS:
        p = OUT / name
        code, assets = api('GET', f'/releases/{rid}/assets?per_page=100')
        for a in assets:
            if a['name'] == name:
                api('DELETE', f'/releases/assets/{a["id"]}')
                print(f'  deleted old {name}')
                time.sleep(1)
        upload_url = rel['upload_url'].split('{')[0] + f'?name={name}'
        code, resp = api('POST', upload_url, p.read_bytes(), raw=True,
                         ctype='application/octet-stream')
        state = resp.get('state') if isinstance(resp, dict) else None
        print(f'  upload {name}: HTTP {code} state={state} ({p.stat().st_size} B)')

    code, assets = api('GET', f'/releases/{rid}/assets?per_page=100')
    names = {a['name']: a['id'] for a in assets}
    all_ok = True
    for name in ASSETS:
        if name not in names:
            print(f'  VERIFY {name}: MISSING')
            all_ok = False
            continue
        import urllib.request as ur2
        req = ur2.Request(f'https://api.github.com/repos/{REPO}/releases/assets/{names[name]}', method='GET')
        req.add_header('Authorization', f'Bearer {TOKEN}')
        req.add_header('Accept', 'application/octet-stream')
        with ur2.urlopen(req) as r:
            got = hashlib.sha256(r.read()).hexdigest()
        want = sha256(OUT / name)
        okk = got == want
        all_ok = all_ok and okk
        print(f'  VERIFY {name}: {"OK" if okk else "MISMATCH"}')
    print('ALL OK' if all_ok else 'HAS FAILURES')
    sys.exit(0 if all_ok else 1)

if __name__ == '__main__':
    main()
