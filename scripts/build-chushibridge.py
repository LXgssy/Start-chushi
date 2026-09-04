#!/usr/bin/env python3
# build-chushibridge.py — 初始音乐桥·独立版 构建与打包
#   1) bridge-js/bridge-core.js → cdp_js.h（C 字符串嵌入）
#   2) llvm-mingw 交叉编译 ChuShiBridge.exe + msimg32.dll（含 .def 导出表）
#   3) 导出表 / PE 架构自检
#   4) 组装一键安装包 zip（exe + msimg32 + 安装/卸载 + 说明）
import subprocess, os, sys, zipfile, shutil

ROOT = "/home/z/my-project"
SRC = f"{ROOT}/bridge/standalone"
TC = "/home/z/toolchain/llvm-mingw-20260826-ucrt-ubuntu-22.04-x86_64/bin"
OUT = f"{SRC}/build"
CC = f"{TC}/x86_64-w64-mingw32-gcc"
OBJDUMP = f"{TC}/x86_64-w64-mingw32-objdump"

def gen_js_header():
    js = open(f"{SRC}/bridge-js/bridge-core.js", encoding="utf-8").read()
    esc = js.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    with open(f"{SRC}/cdp_js.h", "w", encoding="utf-8") as f:
        f.write("/* auto-generated from bridge-js/bridge-core.js — DO NOT EDIT */\n")
        f.write('#ifndef CDP_JS_H\n#define CDP_JS_H\n')
        f.write('static const char BRIDGE_INSTALL_JS[] =\n')
        # 分段字符串，避免单行过长
        CHUNK = 2000
        parts = [esc[i:i+CHUNK] for i in range(0, len(esc), CHUNK)]
        for p in parts:
            f.write(f'"{p}"\n')
        f.write(';\n#endif\n')
    print(f"[1] cdp_js.h 生成（{len(esc)} 字符 JS）")

def gen_loader_def():
    with open(f"{SRC}/loader/msimg32.def", "w", encoding="ascii") as f:
        f.write("LIBRARY msimg32\nEXPORTS\n")
        f.write("  AlphaBlend = cb_AlphaBlend\n")
        f.write("  TransparentBlt = cb_TransparentBlt\n")
        f.write("  GradientFill = cb_GradientFill\n")
        f.write("  vSetDdrawflag = cb_vSetDdrawflag\n")
        f.write("  DllInitialize = cb_DllInitialize\n")
    print("[2] msimg32.def 生成")

def compile_all():
    os.makedirs(OUT, exist_ok=True)
    r = subprocess.run(
        [CC, "-O2", "-Wall", "-Wextra", "-Wno-unused-parameter",
         f"{SRC}/chushibridge.c", f"{SRC}/cb_server.c", f"{SRC}/cb_cdp.c",
         "-o", f"{OUT}/ChuShiBridge.exe",
         "-lws2_32", "-ladvapi32", "-lshell32", "-luser32", "-static"],
        capture_output=True, text=True)
    if r.returncode != 0:
        print("== exe 编译失败 =="); print(r.stderr); sys.exit(1)
    if r.stderr.strip():
        print("[exe 警告]", r.stderr.strip()[:3000])
    print("[3] ChuShiBridge.exe 编译通过（含 -Wall -Wextra 无警告）" if not r.stderr.strip() else "[3] exe 编译通过（有警告，见上）")

    r2 = subprocess.run(
        [CC, "-O2", "-Wall", "-Wextra", "-shared",
         f"{SRC}/loader/cb_loader.c", f"{SRC}/loader/msimg32.def",
         "-o", f"{OUT}/msimg32.dll", "-static"],
        capture_output=True, text=True)
    if r2.returncode != 0:
        print("== loader 编译失败 =="); print(r2.stderr); sys.exit(1)
    if r2.stderr.strip():
        print("[loader 警告]", r2.stderr.strip()[:2000])
    print("[4] msimg32.dll 编译通过")

def self_check():
    for f in ["ChuShiBridge.exe", "msimg32.dll"]:
        r = subprocess.run([OBJDUMP, "-f", f"{OUT}/{f}"], capture_output=True, text=True)
        arch = "x86-64" if "x86-64" in r.stdout else "?"
        print(f"[check] {f}: {arch}, {os.path.getsize(f'{OUT}/{f}')//1024} KB")
        assert arch == "x86-64", "架构错误"
    r = subprocess.run([OBJDUMP, "-p", f"{OUT}/msimg32.dll"], capture_output=True, text=True)
    need = ["AlphaBlend", "TransparentBlt", "GradientFill", "vSetDdrawflag", "DllInitialize"]
    missing = [n for n in need if n not in r.stdout]
    print(f"[check] msimg32.dll 导出表：{[n for n in need if n in r.stdout]}")
    assert not missing, f"导出缺失: {missing}"
    print("[check] 导出表 5/5 齐全")

def _ps1_bytes(path):
    """PowerShell 5.1 需要 UTF-8 BOM 才能正确读中文"""
    with open(path, encoding="utf-8") as f:
        return f.read().encode("utf-8-sig")

def package(version_dir):
    dl = f"{ROOT}/download/{version_dir}"
    os.makedirs(dl, exist_ok=True)
    zip_path = f"{dl}/ChuShiBridge-一键安装包.zip"
    if os.path.exists(zip_path):
        os.remove(zip_path)
    inst = f"{SRC}/installer"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(f"{OUT}/ChuShiBridge.exe", "ChuShiBridge/ChuShiBridge.exe")
        z.write(f"{OUT}/msimg32.dll", "ChuShiBridge/msimg32.dll")
        z.writestr("ChuShiBridge/install.ps1", _ps1_bytes(f"{inst}/install.ps1"))
        z.writestr("ChuShiBridge/uninstall.ps1", _ps1_bytes(f"{inst}/uninstall.ps1"))
        z.write(f"{inst}/安装初始音乐桥.bat", "安装初始音乐桥.bat")
        z.write(f"{inst}/卸载初始音乐桥.bat", "卸载初始音乐桥.bat")
        z.write(f"{inst}/使用说明.md", "使用说明.md")
    print(f"[5] 打包完成：{zip_path}（{os.path.getsize(zip_path)//1024} KB）")
    # Release 资产用 ASCII 名（GitHub latest/download 直链更稳）
    setup_path = f"{dl}/ChuShiBridge-2.0.0-Setup.zip"
    shutil.copyfile(zip_path, setup_path)
    print(f"[5b] Release 资产：{setup_path}")

if __name__ == "__main__":
    version_dir = sys.argv[1] if len(sys.argv) > 1 else "v1.7.6"
    gen_js_header()
    gen_loader_def()
    compile_all()
    self_check()
    package(version_dir)
