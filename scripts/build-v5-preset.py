#!/usr/bin/env python3
"""v5 preset package (.cshz) builder + gates.

Inputs : preset-src/smtc/music-widget.html, music-commands.js, assets/cover.svg
Output : examples/初始SMTC音乐预设.cshz  (zip: manifest.json + assets/cover.svg)
Gates  : size limits, no external URLs, asset refs == {cover.svg},
         anti-shift CSS literals present, v4 widget class names absent.
"""
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path("/home/z/my-project")
SRC = ROOT / "preset-src/smtc"
OUT = ROOT / "examples/初始SMTC音乐预设.cshz"

HTML_MAX = 18000
CODE_MAX = 16000


def fail(msg: str):
    print(f"PRESET GATE FAIL: {msg}")
    sys.exit(1)


def minify_css(css: str) -> str:
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{}:;,])\s*", r"\1", css)
    css = css.replace(";}", "}")
    return css.strip()


def minify_js(js: str) -> str:
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)          # block comments
    js = re.sub(r"^\s*//.*$", "", js, flags=re.M)          # whole-line comments
    lines = []
    for ln in js.split("\n"):
        ln = ln.rstrip()
        # drop leading indentation (safe: no template literals in the widget JS)
        ln = re.sub(r"^\s+", "", ln)
        if ln:
            lines.append(ln)
    return "\n".join(lines)


def minify_html_gap(html: str) -> str:
    html = re.sub(r">\s+<", "><", html)
    return html


def main():
    widget = (SRC / "music-widget.html").read_text(encoding="utf-8")
    commands = (SRC / "music-commands.js").read_text(encoding="utf-8")
    cover = (SRC / "assets/cover.svg").read_bytes()

    m = re.search(r"<style>(.*?)</style>", widget, flags=re.S)
    if not m:
        fail("widget: <style> block not found")
    css = minify_css(m.group(1))

    sm = re.search(r"<script>(.*?)</script>", widget, flags=re.S)
    if not sm:
        fail("widget: <script> block not found")
    js = minify_js(sm.group(1))

    # rebuild: head + minified style + body + minified script
    head = widget[: m.start(1) - len("<style>")]
    html = (
        head
        + "<style>"
        + css
        + "</style>"
        + widget[m.end(1) + len("</style>"): sm.start(1) - len("<script>")]
        + "<script>"
        + js
        + "</script></body></html>"
    )
    # normalize the tail (source ends with </script></body></html>)
    html = minify_html_gap(html)

    code = minify_js(commands)
    if not code.endswith("\n"):
        code += "\n"

    # ---------------- gates ----------------
    if len(html) > HTML_MAX:
        fail(f"widget html too long: {len(html)} > {HTML_MAX}")
    if len(code) > CODE_MAX:
        fail(f"commands code too long: {len(code)} > {CODE_MAX}")
    if re.search(r"https?://", html):
        fail("widget html contains an external URL")
    refs = set(re.findall(r"asset:([A-Za-z0-9._-]{1,64})", html))
    if refs != {"cover.svg"}:
        fail(f"widget asset refs unexpected: {refs}")
    # anti-shift law: stacked icons share one center
    css_ns = css.replace(" ", "")
    if ".cs-bmainsvg{position:absolute;left:50%;top:50%" not in css_ns:
        fail("anti-shift CSS literal missing (.cs-bmain svg stacked)")
    if "margin:-10px00-10px" not in css_ns:
        fail("anti-shift CSS literal missing (margin -10px centering)")
    # lyric mask + word sweep present
    if "clip-path:inset(-8%calc(100%-var(--p,0%))-8%0)" not in css_ns:
        fail("word sweep clip-path CSS missing")
    if "-webkit-mask-image" not in css:
        fail("lyric mask CSS missing")
    # v4 widget class names must be gone (fresh markup)
    for old in (".bt", ".fl{", ".lyw", ".lyline", ".lyin{", ".chip{", ".cw{", ".he{"):
        if old in css:
            fail(f"old v4 widget class present in css: {old}")
    for old in ("__chushiMusicCore(", "LY_SLEW_SEC", "calcFadeMs", "lyHold=lyHold"):
        if old in js:
            fail(f"old v4 widget symbol present in js: {old}")

    anim_css = (
        "/* SMTC 音乐面板：模式切换时部件内容淡入（面板高度弹簧由宿主承载） */\n"
        ".cl-dockwidget iframe { transition: opacity .3s ease; }\n"
        ".cl-dockwidget .cs-card, .cl-widget .cs-card { transition: background .3s ease; }\n"
    )

    manifest = {
        "chushi": 1,
        "name": "初始 · SMTC 音乐",
        "author": "初始",
        "description": "系统媒体音乐面板：dock 按钮弹出，网易云等即播即显，⌘K 可控",
        "widgets": [
            {
                "id": "music",
                "name": "音乐",
                "surface": "dock",
                "icon": "music",
                "width": 340,
                "height": 92,
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
                "css": anim_css,
            }
        ],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))
        z.writestr("assets/cover.svg", cover)

    # read-back structure check
    with zipfile.ZipFile(OUT) as z:
        names = z.namelist()
        if set(names) != {"manifest.json", "assets/cover.svg"}:
            fail(f"cshz entries unexpected: {names}")
        man = json.loads(z.read("manifest.json").decode("utf-8"))
    assert man["widgets"][0]["id"] == "music"
    assert man["widgets"][0]["surface"] == "dock"
    assert len(man["widgets"][0]["html"]) == len(html)
    print(f"OK: {OUT.name} ({OUT.stat().st_size}B) html={len(html)}B code={len(code)}B")


if __name__ == "__main__":
    main()
