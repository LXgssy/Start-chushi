#!/usr/bin/env python3
"""build-v6-plugins.py — 三插件打包 + 全量结构门（v6.0.0）

三个插件（generation 6，从零新写）：
  A. ChuShi SMTC Manager  (bridge/v6/smtc-manager)
  B. ChuShi Music Bridge  (bridge/v6/music-bridge)
  C. ChuShi Lyric Source  (bridge/v6/lyric-source)

构建门（任何一条失败即退出非零）：
  G1  index.js 通过 node --check 语法门
  G2  manifest.json 可解析、manifest_version==1、slug/version 存在
  G3  name 纯 ASCII（用户规则：插件名称英文）
  G4  description 必含 CJK（用户规则：介绍中文）
  G5  ncm3-compatible 必须 true（网易云 3.x 静默过滤链，v5.0.1 实锤）
  G6  injects.Main -> index.js 存在；hijacks 键存在
  G7  index.js 内 PLUGIN_VERSION 与 manifest 版本一致
  G8  .plugin 文件名纯 ASCII（zip_open ANSI 码页律）
  G9  zip 根布局 = manifest.json + index.js（无顶层目录嵌套）
  G10 BetterNCM 过滤链模拟器：isNCM3/ncm3Compatible/manifest_version/
      ncm-version-req 解析 + 解压目标路径模拟 → WOULD LOAD AND LIST
  G11 三插件 slug 互不相同；index.js 各自防重入全局键互不相同
"""
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path("/home/z/my-project")
V6 = ROOT / "bridge/v6"
DIST = V6 / "dist"

PLUGINS = [
    ("smtc-manager", "ChuShi-SMTC-Manager-6.0.0.plugin"),
    ("music-bridge", "ChuShi-Music-Bridge-6.0.0.plugin"),
    ("lyric-source", "ChuShi-Lyric-Source-6.0.0.plugin"),
]

CJK_RE = re.compile(r"[\u4e00-\u9fff]")
ASCII_RE = re.compile(r"^[\x20-\x7e]+$")

errors: list[str] = []
notes: list[str] = []


def fail(msg: str):
    errors.append(msg)


def gate_syntax(idx: Path):
    r = subprocess.run(["node", "--check", str(idx)], capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"G1 语法门 FAIL {idx.name}: {r.stderr.strip()[:300]}")
    else:
        notes.append(f"G1 语法 OK: {idx.parent.name}/index.js")


def gate_manifest(d: Path, name_ascii_ok: bool) -> dict:
    mf = d / "manifest.json"
    try:
        m = json.loads(mf.read_text(encoding="utf-8"))
    except Exception as e:
        fail(f"G2 manifest 解析 FAIL {d.name}: {e}")
        return {}
    if m.get("manifest_version") != 1:
        fail(f"G2 manifest_version FAIL {d.name}: {m.get('manifest_version')}")
    if not m.get("slug") or not m.get("version"):
        fail(f"G2 slug/version 缺失 FAIL {d.name}")
    name = m.get("name", "")
    if not ASCII_RE.match(name):
        fail(f"G3 name 非 ASCII FAIL {d.name}: {name!r}")
    desc = m.get("description", "")
    if not CJK_RE.search(desc):
        fail(f"G4 description 无中文 FAIL {d.name}")
    if m.get("ncm3-compatible") is not True:
        fail(f"G5 ncm3-compatible FAIL {d.name}: {m.get('ncm3-compatible')!r} (必须 true)")
    injects = m.get("injects", {})
    main = injects.get("Main", [])
    if not main or main[0].get("file") != "index.js":
        fail(f"G6 injects.Main FAIL {d.name}: {main}")
    if "hijacks" not in m:
        fail(f"G6 hijacks 缺失 FAIL {d.name}")
    if not (d / "index.js").exists():
        fail(f"G6 index.js 不存在 FAIL {d.name}")
    # G7 版本一致
    js = (d / "index.js").read_text(encoding="utf-8")
    mv = re.search(r'PLUGIN_VERSION\s*=\s*"([^"]+)"', js)
    if not mv or mv.group(1) != m.get("version"):
        fail(f"G7 版本不一致 FAIL {d.name}: js={mv.group(1) if mv else None} manifest={m.get('version')}")
    notes.append(f"G2-G7 结构门 OK: {d.name} slug={m.get('slug')} v={m.get('version')}")
    return m


def gate_zip(d: Path, out: Path, manifest: dict):
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(d / "manifest.json", "manifest.json")
        z.write(d / "index.js", "index.js")
    fn = out.name
    if not ASCII_RE.match(fn):
        fail(f"G8 文件名非 ASCII FAIL: {fn}")
    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        if set(names) != {"manifest.json", "index.js"}:
            fail(f"G9 zip 根布局 FAIL {fn}: {names}")
        m2 = json.loads(z.read("manifest.json").decode("utf-8"))
        if m2.get("slug") != manifest.get("slug"):
            fail(f"G9 zip 内 manifest slug 不一致 FAIL {fn}")
        # G10 过滤链模拟器
        sim_ok = True
        if m2.get("manifest_version") != 1:
            sim_ok = False
        if m2.get("ncm3-compatible") is not True:
            sim_ok = False
        req = m2.get("ncm-version-req", "")
        mt = re.search(r">\s*([\d.]+)", req)
        if not mt:
            sim_ok = False
        # 解压目标 = plugins_runtime/<slug>，slug 必须安全
        slug = m2.get("slug", "")
        if not re.match(r"^[A-Za-z0-9._-]+$", slug):
            sim_ok = False
        if not sim_ok:
            fail(f"G10 过滤链模拟 FAIL {fn}")
        else:
            notes.append(f"G10 WOULD LOAD AND LIST: {fn} -> plugins_runtime/{slug}")
    notes.append(f"G8/G9 打包 OK: {fn} ({out.stat().st_size} bytes)")


def main():
    DIST.mkdir(parents=True, exist_ok=True)
    for d in DIST.glob("*.plugin"):
        d.unlink()

    slugs = []
    guard_keys = []
    for dirname, outname in PLUGINS:
        d = V6 / dirname
        idx = d / "index.js"
        gate_syntax(idx)
        manifest = gate_manifest(d, True)
        slugs.append(manifest.get("slug", ""))
        js = idx.read_text(encoding="utf-8")
        mguard = re.search(r"window\.(__chushi[A-Za-z0-9]+V6)\b", js)
        guard_keys.append(mguard.group(1) if mguard else "")
        gate_zip(d, DIST / outname, manifest)

    if len(set(slugs)) != 3 or "" in slugs:
        fail(f"G11 slug 冲突 FAIL: {slugs}")
    if len(set(guard_keys)) != 3 or "" in guard_keys:
        fail(f"G11 防重入键冲突 FAIL: {guard_keys}")
    else:
        notes.append(f"G11 slug/防重入键唯一 OK: {guard_keys}")

    for n in notes:
        print("  " + n)
    if errors:
        print("\n=== BUILD GATE FAILURES ===")
        for e in errors:
            print("  " + e)
        sys.exit(1)
    print(f"\nALL GATES PASSED — {len(PLUGINS)} plugins built into {DIST}")


if __name__ == "__main__":
    main()
