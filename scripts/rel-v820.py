#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.0 GitHub Release 发布（悬浮音乐卡 + 封面高光律动；逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.2.0'
OUT = ROOT / 'download/v8.2.0'

ASSETS = [
    'ChuShi-Music-Bridge-8.2.0.plugin',
    'ChuShi-Lyric-Source-7.3.0.plugin',
    'ChuShi-NewTab-v8.2.0.zip',
    'ChuShi-Music-Preset-8.2.0.cshz',
    'ChuShi-v8.2.0-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.2.0 · 悬浮音乐卡（置顶所有网页）+ 封面高光律动

### 想法一：音乐卡片置顶在所有网页上 ✅

搜索完跳转到其它页面也能直接控制音乐——悬浮迷你音乐卡出现在所有 http/https 网页：

| 能力 | 说明 |
|---|---|
| 迷你卡 | 封面 + 歌名/歌手 + 上一首/播放暂停/下一首 + 进度条；**点卡片主体回到完整面板** |
| 拖动 | 随意拖位置，**自动记忆**；双击药丸展开 |
| 收起 | × 收起成小药丸（封面+播放指示灯，持久记忆） |
| 按站隐藏 | 点右上角 × 在当前网站隐藏（**会话级**，浏览器重启还原，绝不给死路） |
| 诚实反馈 | 播放暂停乐观翻转 + 真值验证；音乐系统未连接时卡片自动隐没 |

- 架构：新增 MV3 background Service Worker 作状态中继（hub 真值 1s 轮询广播 / 命令代理 / 频谱流转发）；**惰性律**——零卡片在线零轮询，SW 可睡，不白耗电
- 诚实边界：chrome:// 设置页、浏览器商店页等特权页无法显示（Chrome 安全规则，所有扩展一致）

### 想法二：封面高光跟随歌曲律动 ✅（方案 A · 宪章内实现）

封面辉光随**系统正在播放的音频**实时起伏（低频能量驱动，鼓点跟拍）：

- **独立频谱助手 `chushi-spectrum.exe`**：WASAPI loopback 采集系统输出 → FFT 2048 → 16 对数频段 + bass 能量（127.0.0.1:26911-26913）
- **hub v8 宪法门不破**：hub.dll 本体保持零 COM（导入表仍仅 ws2_32+kernel32），频谱 COM 全部关在助手自己的进程——**崩溃域隔离**，炸也炸不到网易云；hub 只做 CreateProcess + Job Object 监护
- 生命周期四保险：宿主退出即杀（Job）/ 60s 无人听自退 / hub 重启收养 / 声卡切换自动重连
- 任何应用放歌都有效；暂停安静回落；尊重系统「减少动态效果」；旧 hub 下高光静态降级不报错
- 渲染只写 opacity/transform（合成器友好，v8.1.4 帧率律同源）

### 测试

- 新增 verify-v820-glow **9/9**（bass 驱动 opacity/scale 直写 + 归零交还样式表 + 旧宿主守卫降级 + reduced-motion + 暂停门/恢复回归）
- 新增 verify-v820-ext **9/9**（真浏览器×真实桥模拟器×真实频谱模拟器：扩展接受 / **SW 在册** / **悬浮卡在 http 页挂载** / SW 真值轮询 hublog 双证 / **SW→助手 30Hz 频谱流** / openPanel / 零致命）
- 原生：hub v8.2.0 双架构编译 + **宪法门**（导入表仅 ws2_32+kernel32）+ 频谱助手 x64 编译；hubsim/spectrumsim POSIX 1:1 测试替身（spectrumsim 合成 120BPM 频谱）
- 回归：verify-v814-core 15/15 + v813-core 18/18 + v810-core 12/12 + v809-core 21/21 + lyricapi 11/11 + 真桥×hubsim e2e 15/15 全绿；tsc src 零错误
- 规范扩展包：防呆门（manifest 8.2.0 / SW+悬浮卡+频谱端口在位 / 零内联 / 保留名 0 违规 / 引擎特征）

### 升级步骤（本版三件必换）

1. 「初始」页更新到 v8.2.0（扩展用户覆盖安装 `ChuShi-NewTab-v8.2.0.zip`：**删净旧解压目录** → 解压新包 → 扩展页点刷新；网页版 gh-pages 已同步）
2. 更新桥插件到 **8.2.0**（内含 hub 8.2.0 + **chushi-spectrum.exe**，替换后**重启网易云**）
3. 重新导入 `ChuShi-Music-Preset-8.2.0.cshz`（律动高光在部件里）
4. 歌词源 7.3.0 沿用
5. 验收：①任意网页右上角出现悬浮音乐卡，点击回面板、拖动换位、× 收起；②播放时封面辉光随鼓点起伏，暂停安静；③不想在某站看到卡片 → 点卡上 ×（重启浏览器还原）

> 插件列表版本 8.2.0 = 新桥（诊断口 pluginVer 8.1.3 为桥 JS 自报，桥 JS 本体未变）；律动依赖 hub ≥ 8.2.0
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
        s = 'OK' if got == want else 'MISMATCH'
        if got != want:
            all_ok = False
        print(f'  VERIFY {name}: {s}')
    print('ALL OK' if all_ok else 'HAS FAILURES')
    sys.exit(0 if all_ok else 1)

if __name__ == '__main__':
    main()
