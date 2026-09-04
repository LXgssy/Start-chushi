#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 examples/焕新示例预设.json — 八维焕新示例（v1.3.0）
覆盖：材质(material API) / 内容(links) / 排版(layout) / 动画(animations)
     / 图标(icons) / 主题令牌(tokens) / 动效语言(motion) / 时钟格式(clock)
材质方向选 Fluent / Win UI 风（亚克力 Acrylic），呼应「换材质 API 不绑定任何
一种风格，液态玻璃、Win UI 等均可由社区经同一接口实现」。
"""
import json

MATERIAL_CSS = """/* Acrylic 亚克力材质（Win UI / Fluent 风）— 经 chushi.material.apply 挂载 */
.search-pill, .cl-dock, .cl-panel, .glass-card {
  backdrop-filter: blur(40px) saturate(1.6) !important;
  background:
    linear-gradient(135deg, rgba(255,255,255,.60), rgba(240,245,255,.38)) !important;
  border: 1px solid rgba(255,255,255,.55);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.65),
    0 8px 28px rgba(31,41,55,.14);
}
html.dark .search-pill, html.dark .cl-dock, html.dark .cl-panel, html.dark .glass-card {
  backdrop-filter: blur(36px) saturate(1.3) !important;
  background:
    linear-gradient(135deg, rgba(40,44,56,.72), rgba(28,31,40,.58)) !important;
  border: 1px solid rgba(255,255,255,.09);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.08),
    0 10px 32px rgba(0,0,0,.42);
}
.cl-panel, .glass-card { border-radius: 10px; }"""

MATERIAL_SCRIPT_CODE = """// 八维焕新 · 材质维度：Fluent 亚克力（经通用换材质 API 挂载，删除预设即还原）
const css = await chushi.storage.get('_material_css_ref');
await chushi.material.apply({
  css: [
    '.search-pill, .cl-dock, .cl-panel, .glass-card {',
    '  backdrop-filter: blur(40px) saturate(1.6) !important;',
    '  background: linear-gradient(135deg, rgba(255,255,255,.60), rgba(240,245,255,.38)) !important;',
    '  border: 1px solid rgba(255,255,255,.55);',
    '  box-shadow: inset 0 1px 0 rgba(255,255,255,.65), 0 8px 28px rgba(31,41,55,.14);',
    '}',
    'html.dark .search-pill, html.dark .cl-dock, html.dark .cl-panel, html.dark .glass-card {',
    '  backdrop-filter: blur(36px) saturate(1.3) !important;',
    '  background: linear-gradient(135deg, rgba(40,44,56,.72), rgba(28,31,40,.58)) !important;',
    '  border: 1px solid rgba(255,255,255,.09);',
    '  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 10px 32px rgba(0,0,0,.42);',
    '}',
    '.cl-panel, .glass-card { border-radius: 10px; }',
  ].join('\\n'),
});"""

ANIM_CSS = """/* Fluent 微动效：磁贴悬停轻浮起（Q 弹回落的克制版） */
.cl-links .group { transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1); }
.cl-links .group:hover { transform: translateY(-3px); }"""

preset = {
    "chushi": 1,
    "name": "八维焕新示例",
    "author": "初始",
    "description": "覆盖材质/内容/排版/动画/图标/令牌/动效/时钟的焕新样板",
    "links": [
        {"name": "Microsoft", "url": "https://www.microsoft.com"},
        {"name": "Fluent 2", "url": "https://fluent2.microsoft.design"},
        {"name": "GitHub", "url": "https://github.com"},
        {"name": "Bing", "url": "https://www.bing.com"},
    ],
    "layout": {"clockScale": 1.05, "linksColumns": 6, "verticalAlign": "center"},
    "animations": [
        {"id": "tile-lift", "name": "磁贴轻浮起", "css": ANIM_CSS}
    ],
    "icons": [
        {"target": "weather", "icon": "cloud"},
        {"target": "todo", "icon": "star"},
        {"target": "command", "icon": "terminal"},
    ],
    "tokens": {"--ui-accent": "#0078d4"},
    "motion": {"profile": "playful", "speed": 1.1},
    "clock": {
        "hour12": True,
        "showSeconds": False,
        "showDate": True,
        "greeting": "{greet}，{name} — 愿今天顺利",
    },
    "scripts": [
        {
            "id": "acrylic",
            "name": "亚克力材质",
            "code": MATERIAL_SCRIPT_CODE,
        }
    ],
}

# MATERIAL_SCRIPT_CODE 里首两行是说明性的（storage 引用是演示冗余，去掉更干净）
MATERIAL_SCRIPT_CODE_CLEAN = """// 八维焕新 · 材质维度：Fluent 亚克力（经通用换材质 API 挂载，删除预设即还原）
await chushi.material.apply({
  css: [
    '.search-pill, .cl-dock, .cl-panel, .glass-card {',
    '  backdrop-filter: blur(40px) saturate(1.6) !important;',
    '  background: linear-gradient(135deg, rgba(255,255,255,.60), rgba(240,245,255,.38)) !important;',
    '  border: 1px solid rgba(255,255,255,.55);',
    '  box-shadow: inset 0 1px 0 rgba(255,255,255,.65), 0 8px 28px rgba(31,41,55,.14);',
    '}',
    'html.dark .search-pill, html.dark .cl-dock, html.dark .cl-panel, html.dark .glass-card {',
    '  backdrop-filter: blur(36px) saturate(1.3) !important;',
    '  background: linear-gradient(135deg, rgba(40,44,56,.72), rgba(28,31,40,.58)) !important;',
    '  border: 1px solid rgba(255,255,255,.09);',
    '  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 10px 32px rgba(0,0,0,.42);',
    '}',
    '.cl-panel, .glass-card { border-radius: 10px; }',
  ].join('\\n'),
});"""
preset["scripts"][0]["code"] = MATERIAL_SCRIPT_CODE_CLEAN

out = "/home/z/my-project/examples/焕新示例预设.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(preset, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("written", out, len(json.dumps(preset, ensure_ascii=False)), "chars")
