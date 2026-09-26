#!/usr/bin/env python3
# build-netease-preset.py — 组装「初始 · 网易云播放器」预设包 .cshz（v8.7.23 方案二）
# 源：preset-src/netease/player.html
# 出：examples/初始网易云播放器预设.cshz（zip：manifest.json，无资产）
# 校验：widget html ≤28800（与宿主 preset.ts widgetHtmlLen 同步，两道数字门律）
# 架构：widget 沙箱无跨域能力 → chushi.ne.api/audio 经宿主代理（netease.ts），
#       直链由宿主 <audio> + MediaSession 播放（系统媒体会话 ↔ SMTC 桥互通）。
import base64, json, pathlib, re, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "preset-src" / "netease"


def minify_css(s: str) -> str:
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"\s*:\s*", ":", s)
    s = re.sub(r"\s*;\s*", ";", s)
    s = re.sub(r"\s*\{\s*", "{", s)
    s = re.sub(r"\s*\}\s*", "}", s)
    s = re.sub(r"\s*,\s*", ",", s)
    s = re.sub(r"\s*>\s*", ">", s)
    s = re.sub(r"\s*~\s*", "~", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def minify_js(s: str) -> str:
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"^\s*//[^\n]*$", "", s, flags=re.M)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*", "\n", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


def minify_html(s: str) -> str:
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    style_re = re.compile(r"(<style>)(.*?)(</style>)", re.S)
    s = style_re.sub(lambda m: m.group(1) + minify_css(m.group(2)) + m.group(3), s)
    script_re = re.compile(r"(<script>)(.*?)(</script>)", re.S)
    s = script_re.sub(lambda m: m.group(1) + minify_js(m.group(2)) + m.group(3), s)
    s = re.sub(r'<meta name="viewport"[^>]*>', "", s)
    s = re.sub(r"<title>[^<]*</title>", "", s)
    s = s.replace('<html lang="zh-CN">', "<html>")
    s = re.sub(r">\s*\n\s*<", "><", s)
    s = re.sub(r"\s*\n\s*", "\n", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


html = minify_html((SRC / "player.html").read_text(encoding="utf-8"))

assert len(html) <= 39600, f"widget html 超限: {len(html)} > 39600"  # v8.7.26：36800→39600（音质/YRC 修复/频谱律动）与宿主 widgetHtmlLen 同步（两道数字门律）
# 特征门（核心链路防回归）
for feat in (
    "chushi.ne.api",           # 宿主代理 API
    "chushi.ne.audio",         # 宿主音频
    "chushi.ne.sub(",          # 状态帧订阅
    "/weapi/search/get",       # 搜索端点（cloudsearch 反爬规避）
    "/weapi/song/enhance/player/url/v1",  # 直链端点
    "/weapi/song/lyric",       # 歌词端点
    "/weapi/login/qrcode/unikey",  # 扫码登录
    "parseYrc",                # 逐字歌词
    "qrMatrix",                # QR 编码器
    "chushi.ne.pub(",          # v8.7.24 歌词外送
    "csDlyric",                # v8.7.24 词钮=全局歌词开关
    "/weapi/logout",           # v8.7.24 退出登录
    "lyReconcile",             # v8.7.24 歌词动效 v2（行态机）
    "setPointerCapture",       # v8.7.24 音量滑块拖拽
    'replace(/^http:/,"https:")',  # 直链 https 升级
):
    assert feat in html, f"cshz 缺特征 {feat!r}"
# widget html 不能含外链资源（iframe 不透明源加载不了；运行时 URL 字符串不算资源加载）
_no_data = re.sub(r"data:image/svg\+xml,[^\"']+", "", html)
_no_ns = _no_data.replace("http://www.w3.org/", "")
assert "http://" not in _no_ns and "https://" not in _no_ns, "widget html 不应包含外链 URL 字面量（运行时拼接除外）"

# dock 图标：黑胶唱片+音符（初始风格，accent 紫）—— data:image/svg+xml;base64
ICON_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    '<circle cx="12" cy="12" r="10" fill="#8b5cf6"/>'
    '<circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="1.4"/>'
    '<path d="M10.2 15.6V8.9l5-1.1v6.5" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
    '<circle cx="9.1" cy="15.6" r="1.7" fill="#fff"/>'
    '<circle cx="14.1" cy="14.3" r="1.7" fill="#fff"/>'
    "</svg>"
)
icon = "data:image/svg+xml;base64," + base64.b64encode(ICON_SVG.encode("utf-8")).decode("ascii")
assert len(icon) <= 8192, f"icon 超限: {len(icon)}"

preset = {
    "chushi": 1,
    "name": "初始 · 网易云播放器",
    "author": "初始",
    "description": "内置网易云直链播放器：dock 按钮弹出面板，扫码登录/搜索/歌单/逐字歌词",
    "widgets": [
        {
            "id": "netease",
            "name": "网易云播放器",
            "surface": "dock",
            "icon": icon,
            "width": 400,
            "height": 460,
            "html": html,
        }
    ],
}

out = ROOT / "examples" / "初始网易云播放器预设.cshz"
if out.exists():
    out.unlink()
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("manifest.json", json.dumps(preset, ensure_ascii=False, indent=2))

# 回读验包
with zipfile.ZipFile(out) as z:
    names = set(z.namelist())
    assert names == {"manifest.json"}, f"包结构异常: {names}"
    m = json.loads(z.read("manifest.json"))
    assert m["chushi"] == 1 and m["widgets"] and m["widgets"][0]["html"] == html
    assert m["widgets"][0]["surface"] == "dock" and m["widgets"][0]["width"] == 400

print(f"OK widget={len(html)} chars, icon={len(icon)} chars -> {out} ({out.stat().st_size/1024:.1f} KB)")
