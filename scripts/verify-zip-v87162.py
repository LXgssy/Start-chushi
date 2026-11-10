#!/usr/bin/env python3
"""verify-zip-v87162：ChuShi-NewTab v8.7.162 构建产物全量门检。
继承 v8.7.156–161 关键回归锚 + v8.7.162 新门（迷你格形状统一律 object-cover）。
用法：python3 scripts/verify-zip-v87162.py
"""
import pathlib, re, sys, zipfile, tempfile, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
ZIP = ROOT / "download/v8.7.162/ChuShi-NewTab-v8.7.162.zip"
SNAP = ROOT / "download/v8.7.162/ChuShi-CloudSnapshot-v8.7.162.zip"

results = []
def gate(name, ok, detail=""):
    results.append((name, bool(ok), detail))

def main():
    if not ZIP.exists():
        sys.exit(f"missing {ZIP}")
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="v87162-"))
    with zipfile.ZipFile(ZIP) as z:
        z.extractall(tmp)
    # 全文本产物
    blobs = {}
    for p in tmp.rglob("*"):
        if p.suffix in (".js", ".css", ".html", ".json", ".webmanifest") and p.is_file():
            try:
                blobs[str(p.relative_to(tmp))] = p.read_text("utf-8", "ignore")
            except Exception:
                pass
    all_text = "\n".join(blobs.values())

    # ---------- v8.7.162 新门（迷你格形状统一律） ----------
    N = [
        ("162 changelog 标题", "文件夹迷你格形状统一"),
        ("162 changelog 高亮·正方形统一", "不再长方形正方形混排"),
        ("162 bare 图标统一 16px object-cover", "h-4 w-4 shrink-0 max-w-none object-cover"),
    ]
    for name, needle in N:
        gate(name, needle in all_text, needle)
    # 旧 14px contain 迷你格字形退役（防回退）
    gate("162 旧迷你格 14px contain 退役", "h-3.5 w-3.5 object-contain" not in all_text)
    # object-cover 出现次数 ≥2（上传图标 + favicon 两分支）
    n_cover = all_text.count("h-4 w-4 shrink-0 max-w-none object-cover")
    gate("162 object-cover 双分支在位", n_cover >= 2, f"出现 {n_cover} 次")

    # ---------- 继承回归门（156–161 关键锚） ----------
    R = [
        ("161 changelog 标题·双形态", "文件夹图标两种新形态"),
        ("161 changelog 高亮·三排微缩墙", "三排微缩墙"),
        ("161 settings 键 folderIconStyle", "folderIconStyle"),
        ("161 默认值 grid2", 'folderIconStyle:"grid2"'),
        ("161 面板 segKey folder-icon-style", "folder-icon-style"),
        ("161 面板标签 双排迷你格", "双排迷你格"),
        ("161 grid3 磁贴类名 grid-cols-3", "grid-cols-3 gap-[2px] p-[7px]"),
        ("161 grid3 空位占位 bg-white/20", "bg-white/20"),
        ("161 面板「文件夹图标」标签", "文件夹图标"),
        ("157 九宫格标记 data-cl-folder-grid", "data-cl-folder-grid"),
        ("157 白卡实底 solid-card", "solid-card"),
        ("158 设置键 folderOpenStyle", "folderOpenStyle"),
        ("158 面板 segKey folder-open-style", "folder-open-style"),
        ("158 面板标签 文件夹展开方式", "文件夹展开方式"),
        ("159 morph 皮层标记 data-cl-folder-morph-preview", "data-cl-folder-morph-preview"),
        ("159 皮层 grid2 同源类名", "grid-cols-2 gap-[3px] p-[9px]"),
        ("160 morph 覆盖式·卡片 inset-0 覆盖层", "absolute inset-0"),
        ("160 收起补全·safeToRemove", "safeToRemove"),
        ("160 夹内磁贴零入场·intro 通道", "link-intro-tile"),
        ("156 popover 锚 data-cl-folder-popover", "data-cl-folder-popover"),
        ("158 modal 锚 data-cl-folder-modal", "data-cl-folder-modal"),
        ("158 inline 锚 data-cl-folder-inline", "data-cl-folder-inline"),
        ("156 整墙落区 cl-wall-zone", "cl-wall-zone"),
        ("156 夹内落区 cl-folder-zone", "cl-folder-zone"),
        ("156 入场三通道 cl-fade-leaf", "cl-fade-leaf"),
        ("155 背景冻结三闸门 cs-bg-frozen", "cs-bg-frozen"),
        ("155 自绘 per-key 路径 selfdraw/i/", "selfdraw/i/"),
        ("changelog 全量保留·8.7.156 文件夹系统条目", "8.7.156"),
        ("changelog 全量保留·8.7.160 动画修补条目", "8.7.160"),
        ("154 学习通 chaoxing 描摹", "chaoxing"),
        ("快照服务 cs-snap/sw.js", "cs-snap/sw.js"),
        ("壳运行时 shell.html", "shell.html"),
        ("壳桥 shell-bridge.js", "shell-bridge.js"),
        ("SW 注册 sw.js", "sw.js"),
        ("manifest 版本 8.7.162", '"version": "8.7.162"'),
    ]
    for name, needle in R:
        gate(name, needle in all_text, needle)

    # manifest 版本独立核
    man = (tmp / "manifest.json")
    if man.exists():
        try:
            gate("manifest.json 可解析且 version=8.7.162",
                 '"8.7.162"' in man.read_text("utf-8"))
        except Exception as e:
            gate("manifest.json 可解析", False, str(e))
    else:
        gate("manifest.json 存在", False)

    # ---------- 云快照守恒（160 起 Next 多吐 clientMiddlewareManifest.json → 292） ----------
    if SNAP.exists():
        with zipfile.ZipFile(SNAP) as z:
            n = len([i for i in z.infolist() if not i.is_dir()])
        gate("云快照载荷 292 文件（与 160/161 云镜像守恒）", n == 292, f"实际 {n}")
    else:
        gate("云快照 zip 存在", False, str(SNAP))

    # ---------- 结构防呆 ----------
    bad = [k for k in blobs if "/_next/" in k]
    gate("零 /_next 残留", not bad, str(bad[:3]))
    gate("locale 目录在位", (tmp / "_locales").exists())
    gate("icons 目录在位", (tmp / "icons").exists())
    sd = [p for p in tmp.rglob("selfdraw/i/*.json")]
    gate("自绘 per-key 拆分册 ≥180 个", len(sd) >= 180, f"实际 {len(sd)}")

    shutil.rmtree(tmp, ignore_errors=True)

    ok = sum(1 for _, g, _ in results if g)
    total = len(results)
    for name, g, detail in results:
        print(("PASS " if g else "FAIL ") + name + ("" if g else f"   [{detail}]"))
    print(f"\nVERIFY {ok}/{total} " + ("ALL GREEN" if ok == total else "HAS RED"))
    sys.exit(0 if ok == total else 1)

if __name__ == "__main__":
    main()
