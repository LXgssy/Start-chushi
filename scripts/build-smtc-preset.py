# build-smtc-preset.py — 组装「初始 · SMTC 音乐」预设包 .cshz（v1.8.1 起改包形态）
# 源：preset-src/smtc/music-widget.html + music-commands.js + assets/cover.svg
# 出：examples/初始SMTC音乐预设.cshz（zip：manifest.json + assets/cover.svg，
#     与 src/lib/startpage/pack.ts parsePack 的白名单结构一一对应）
# 校验：widget html ≤25600（v8.2.9 与宿主 widgetHtmlLen 同步放宽）、script code ≤16000
# ⚠ html 里的 "asset:cover.svg" 引用只能在 .cshz 导入时被内联 —— 本包不再产单 JSON 形态
import json, re, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "preset-src" / "smtc"


def minify_css(s: str) -> str:
    """CSS 全压缩：语法允许零空白。只处理 <style> 内部，不触及 JS/HTML。"""
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
    """JS 保守压缩：去块注释/整行注释/行首缩进，保留换行作语句边界。"""
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"^\s*//[^\n]*$", "", s, flags=re.M)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*", "\n", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


def minify_html(s: str) -> str:
    """总装：分段压缩 <style> / <script>，HTML 结构压标签间空白。"""
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    style_re = re.compile(r"(<style>)(.*?)(</style>)", re.S)
    s = style_re.sub(lambda m: m.group(1) + minify_css(m.group(2)) + m.group(3), s)
    script_re = re.compile(r"(<script>)(.*?)(</script>)", re.S)
    s = script_re.sub(lambda m: m.group(1) + minify_js(m.group(2)) + m.group(3), s)
    # v8.0.1：srcdoc 固定 iframe 用不到的文档头杂物剥离（viewport/title/lang）
    s = re.sub(r'<meta name="viewport"[^>]*>', "", s)
    s = re.sub(r"<title>[^<]*</title>", "", s)
    s = s.replace('<html lang="zh-CN">', "<html>")
    s = re.sub(r">\s*\n\s*<", "><", s)
    s = re.sub(r"\s*\n\s*", "\n", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


html = minify_html((SRC / "music-widget.html").read_text(encoding="utf-8"))
code = minify_js((SRC / "music-commands.js").read_text(encoding="utf-8"))
cover_svg = (SRC / "assets" / "cover.svg").read_text(encoding="utf-8")

assert len(html) <= 25600, f"widget html 超限: {len(html)} > 25600"  # v8.2.9：24000→25600 与宿主同步放宽（双开关+128 段）
# v8.2.9 特征门（宿主 preset.ts widgetHtmlLen 同步改，两道数字门禁止漂移——Task 100 律）
for feat in ("csGlowBtn", "csFloatBtn", "csGlow", "csFloat",
             "mus.now(lyMode === 0)", "bandAvg(n.bands, 9, 85)", "glowOn2"):
    assert feat in html, f"cshz 缺 v8.2.9 特征 {feat!r}——重建遗漏"
assert "cs-ring" not in html.replace("cs-ring 废弃", ""), "cshz 代码残留 cs-ring"
assert len(code) <= 16000, f"script code 超限: {len(code)} > 16000"
# widget html 不能含外链脚本/资源（iframe 不透明源本就加载不了，这里防手滑）
# v8.0.1：data-URI 兜底封面合法；xmlns 命名空间标识（w3.org）不是外链资源，剔除后再查
_no_data = re.sub(r"data:image/svg\+xml,[^\"']+", "", html)
_no_ns = _no_data.replace("http://www.w3.org/", "")
assert "http://" not in _no_ns and "https://" not in _no_ns, "widget html 不应包含外链 URL"
# 资产引用自检：默认封面引用 cover.svg（pack.ts ASSET_REF_RE 白名单字符集）
refs = set(re.findall(r"asset:([A-Za-z0-9._-]{1,64})", html))
assert refs == {"cover.svg"}, f"asset 引用异常: {refs}"

preset = {
    "chushi": 1,
    "name": "初始 · SMTC 音乐",
    "author": "初始",
    "description": "系统媒体音乐面板：dock 按钮弹出，网易云等即播即显，⌘K 可控",
    "widgets": [
        {
            "id": "music",
            "name": "音乐",
            # v1.8.2 dock 表面：不出角落磁贴，改为 tab 栏音乐按钮 + 弹出面板
            "surface": "dock",
            "icon": "music",
            "width": 340,
            "height": 92,  # 初始空态高度；接入媒体后部件自 resize 到 248，宿主弹簧跟随
            "html": html,
        }
    ],
    "scripts": [
        {
            "id": "music-ctl",
            "name": "SMTC 媒体控制",
            "code": code,
        }
    ],
    "animations": [
        {
            "id": "smtc-motion",
            "name": "面板内容过渡",
            "css": (
                "/* SMTC 音乐面板：模式切换时部件内容淡入（面板高度弹簧由宿主承载） */\n"
                ".cl-dockwidget iframe { transition: opacity .3s ease; }\n"
                ".cl-dockwidget .card, .cl-widget .card { transition: background .3s ease; }\n"
            ),
        }
    ],
}

out = ROOT / "examples" / "初始SMTC音乐预设.cshz"
if out.exists():
    out.unlink()
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("manifest.json", json.dumps(preset, ensure_ascii=False, indent=2))
    z.writestr("assets/cover.svg", cover_svg)

# 回读验包：结构 + 引用完整性
with zipfile.ZipFile(out) as z:
    names = set(z.namelist())
    assert names == {"manifest.json", "assets/cover.svg"}, f"包结构异常: {names}"
    m = json.loads(z.read("manifest.json"))
    assert m["chushi"] == 1 and m["widgets"] and m["widgets"][0]["html"] == html

print(f"OK widget={len(html)} chars, script={len(code)} chars -> {out} ({out.stat().st_size/1024:.1f} KB)")
