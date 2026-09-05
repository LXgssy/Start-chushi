# build-smtc-preset.py — 组装「初始 · SMTC 音乐」预设包 .cshz（v1.8.1 起改包形态）
# 源：preset-src/smtc/music-widget.html + music-commands.js + assets/cover.svg
# 出：examples/初始SMTC音乐预设.cshz（zip：manifest.json + assets/cover.svg，
#     与 src/lib/startpage/pack.ts parsePack 的白名单结构一一对应）
# 校验：widget html ≤12000、script code ≤16000、animation css ≤6000（PRESET_LIMITS）
# ⚠ html 里的 "asset:cover.svg" 引用只能在 .cshz 导入时被内联 —— 本包不再产单 JSON 形态
import json, re, pathlib, zipfile

ROOT = pathlib.Path("/home/z/my-project")
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
    s = re.sub(r">\s*\n\s*<", "><", s)
    s = re.sub(r"\s*\n\s*", "\n", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


html = minify_html((SRC / "music-widget.html").read_text(encoding="utf-8"))
code = minify_js((SRC / "music-commands.js").read_text(encoding="utf-8"))
cover_svg = (SRC / "assets" / "cover.svg").read_text(encoding="utf-8")

assert len(html) <= 12000, f"widget html 超限: {len(html)} > 12000"
assert len(code) <= 16000, f"script code 超限: {len(code)} > 16000"
# widget html 不能含外链脚本/资源（iframe 不透明源本就加载不了，这里防手滑）
assert "http://" not in html and "https://" not in html, "widget html 不应包含外链 URL"
# 资产引用自检：html 里必须恰好引用 cover.svg（pack.ts ASSET_REF_RE 白名单字符集）
refs = set(re.findall(r"asset:([A-Za-z0-9._-]{1,64})", html))
assert refs == {"cover.svg"}, f"asset 引用异常: {refs}"

preset = {
    "chushi": 1,
    "name": "初始 · SMTC 音乐",
    "author": "初始",
    "description": "系统媒体音乐磁贴（dock 面板风格）：网易云等即播即显，⌘K 可控",
    "widgets": [
        {
            "id": "music",
            "name": "SMTC 音乐磁贴",
            "corner": "bottom-right",
            "width": 340,
            "height": 64,
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
            "name": "磁贴高度弹簧",
            "css": (
                "/* SMTC 音乐磁贴：紧凑条 ⇄ 展开卡的高度过渡（与面板高度弹簧同曲线） */\n"
                ".cl-widget { transition: height .5s cubic-bezier(.22,1,.36,1) !important; }\n"
                ".cl-widget iframe { transition: opacity .3s ease; }\n"
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
