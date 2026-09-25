# build-official-presets.py — 生成 ⌘K「官方预设」内嵌数据（v8.4.11）
# 源：examples/焕新示例预设.json + examples/初始SMTC音乐预设.cshz（build-smtc-preset.py 产物）
#      + examples/初始网易云播放器预设.cshz（build-netease-preset.py 产物，v8.7.23）
# 出：src/lib/startpage/official-presets.json（official-presets.ts 导入）
# 形态：{ generatedAt, presets: [{id,name,label,tagline,manifest,assets}] }
#   · manifest 原样保留 asset: 引用（页面侧 parsePreset 先按内联前长度过校验，与
#     parsePack 同序）；assets 表存 base64+MIME，页面侧 pack.ts inlineOfficialAssets
#     内联成与 .cshz 导入完全相同的 data:URL。
#   · 本文件是 examples/ → 应用内嵌 的单向同步器：改预设先改 examples/（或
#     preset-src/ 重建 cshz），再跑本脚本，禁止手改 official-presets.json。
import base64
import json
import pathlib
import re
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "src/lib/startpage/official-presets.json"

MIME = {
    "svg": "image/svg+xml",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "bmp": "image/bmp",
    "ico": "image/x-icon",
    "avif": "image/avif",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "m4a": "audio/mp4",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "woff2": "font/woff2",
    "woff": "font/woff",
    "ttf": "font/ttf",
    "otf": "font/otf",
}


def pack_assets(zf: zipfile.ZipFile) -> dict:
    """assets/ 平铺资源 → {base: {b64, mime}}；白名单外类型直接拒绝。"""
    assets = {}
    for n in zf.namelist():
        if not n.startswith("assets/") or n == "assets/":
            continue
        base = n[len("assets/"):]
        if "/" in base:
            continue  # 子目录资源不参与引用（pack.ts 同律）
        ext = base.rsplit(".", 1)[-1].lower()
        mime = MIME.get(ext)
        if not mime:
            raise SystemExit(f"assets/{base}：MIME 白名单外类型，请扩 build-official-presets.py MIME 表")
        assets[base] = {
            "b64": base64.b64encode(zf.read(n)).decode("ascii"),
            "mime": mime,
        }
    return assets


def check_refs(manifest: dict, assets: dict) -> None:
    """manifest 里 asset: 引用 ⊆ assets 表，缺失即拒绝（pack.ts 缺失报错同律）。"""
    refs: set = set()

    def scan(o):
        if isinstance(o, str):
            refs.update(re.findall(r"asset:([A-Za-z0-9._-]{1,64})", o))
        elif isinstance(o, list):
            for x in o:
                scan(x)
        elif isinstance(o, dict):
            for x in o.values():
                scan(x)

    scan(manifest)
    missing = refs - set(assets)
    if missing:
        raise SystemExit(f"manifest 引用了包里不存在的资产: {sorted(missing)}")


# ① 页面焕新预设（纯 JSON，无资产）
refresh = json.loads((ROOT / "examples" / "焕新示例预设.json").read_text(encoding="utf-8"))
check_refs(refresh, {})

# ② 音乐面板预设（.cshz 包：manifest.json + assets/cover.svg）
with zipfile.ZipFile(ROOT / "examples" / "初始SMTC音乐预设.cshz") as z:
    music = json.loads(z.read("manifest.json"))
    assets = pack_assets(z)
check_refs(music, assets)

# ③ 网易云播放器预设（v8.7.23：.cshz 包 manifest，无资产）
with zipfile.ZipFile(ROOT / "examples" / "初始网易云播放器预设.cshz") as z:
    netease = json.loads(z.read("manifest.json"))
    netease_assets = pack_assets(z)
check_refs(netease, netease_assets)

data = {
    "generatedAt": "2026-09-25",
    "presets": [
        {
            "id": "refresh",
            "name": refresh["name"],
            "label": "页面焕新预设",
            "tagline": "八维焕新 · 官方样板",
            "manifest": refresh,
            "assets": {},
        },
        {
            "id": "music",
            "name": music["name"],
            "label": "音乐面板预设",
            "tagline": "SMTC 桥接 · 含媒体控制插件",
            "manifest": music,
            "assets": assets,
        },
        {
            "id": "netease",
            "name": netease["name"],
            "label": "网易云播放器预设",
            "tagline": "方案二 · 直链播放 · 扫码登录",
            "manifest": netease,
            "assets": netease_assets,
        },
    ],
}

OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"official-presets.json: {OUT} ({OUT.stat().st_size} bytes)")
for p in data["presets"]:
    print(f"  - {p['id']}: {p['name']} (assets: {', '.join(p['assets']) or '—'})")
