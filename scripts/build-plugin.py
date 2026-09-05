#!/usr/bin/env python3
# build-plugin.py — 初始音乐桥 BetterNCM 插件打包（1.2.0）
#   编译 bridge/native/bridge.c → bridge.dll（llvm-mingw）→ 复制进 plugin/ → 组装两种包：
#   ① ChuShi-MusicBridge-1.2.0.plugin  —— 官方安装包（zip 平铺：manifest.json 必须在包根部，
#      放入 C:\betterncm\plugins\ 由 BetterNCM 自动解压 → plugins_runtime + .plugin.path.meta）
#   ② 初始音乐桥-插件-1.2.0.zip —— plugins_dev 文件夹安装路线（顶层目录式）
import subprocess, os, sys, zipfile, shutil

ROOT = "/home/z/my-project"
SRC = f"{ROOT}/bridge/plugin"
NATIVE = f"{ROOT}/bridge/native"
TC = "/home/z/toolchain/llvm-mingw-20260826-ucrt-ubuntu-22.04-x86_64/bin"
CC = f"{TC}/x86_64-w64-mingw32-gcc"
OBJDUMP = f"{TC}/x86_64-w64-mingw32-objdump"
DL = f"{ROOT}/download/v1.7.6"
VER = "1.2.0"
ZIP_NAME = f"初始音乐桥-插件-{VER}.zip"
PLUGIN_NAME = f"ChuShi-MusicBridge-{VER}.plugin"
TOP = "初始音乐桥"

def compile_dll():
    r = subprocess.run(
        [CC, "-O2", "-Wall", "-Wextra", "-Wno-unused-parameter", "-shared",
         f"{NATIVE}/bridge.c", "-o", f"{NATIVE}/bridge.dll", "-lws2_32", "-static"],
        capture_output=True, text=True)
    if r.returncode != 0:
        print("== bridge.dll 编译失败 =="); print(r.stderr); sys.exit(1)
    if r.stderr.strip():
        print("[警告]", r.stderr.strip()[:2000])
    print("[1] bridge.dll 编译通过（-Wall -Wextra）")

def self_check():
    r = subprocess.run([OBJDUMP, "-f", f"{NATIVE}/bridge.dll"], capture_output=True, text=True)
    assert "x86-64" in r.stdout, "架构错误"
    r = subprocess.run([OBJDUMP, "-p", f"{NATIVE}/bridge.dll"], capture_output=True, text=True)
    assert "BetterNCMPluginMain" in r.stdout, "导出缺失"
    print(f"[2] 自检：x86-64，{os.path.getsize(f'{NATIVE}/bridge.dll')//1024} KB，BetterNCMPluginMain 导出在位")

def zip_assert(names, flat, label):
    """包内布局断言：.plugin 必须平铺（manifest.json 在根部）且条目全 ASCII（BetterNCM zip 库直读）；
    dev zip 顶层唯一中文名目录（仅供用户手动解压，不经 BetterNCM zip 库）"""
    for n in names:
        assert "\\" not in n, f"{label}: 条目含反斜杠 {n}"
        if flat:
            assert n.encode("ascii", "strict"), f"{label}: 条目名非 ASCII {n}"
    if flat:
        assert "manifest.json" in names, f"{label}: manifest.json 不在包根部"
        assert not any("/" in n for n in names), f"{label}: 存在目录前缀条目 {names}"
    else:
        tops = set(n.split("/")[0] for n in names)
        assert tops == {TOP}, f"{label}: 顶层目录异常 {tops}"

def package():
    shutil.copyfile(f"{NATIVE}/bridge.dll", f"{SRC}/bridge.dll")
    os.makedirs(DL, exist_ok=True)
    stale = f"{DL}/初始音乐桥-插件-1.1.0.zip"
    if os.path.exists(stale):
        os.remove(stale); print("[*] 已清除旧包 初始音乐桥-插件-1.1.0.zip")

    # ① 官方 .plugin 安装包：zip 平铺（与 resource/PluginMarket.plugin 同构），后缀 .plugin
    zp_plugin = f"{DL}/{PLUGIN_NAME}"
    if os.path.exists(zp_plugin):
        os.remove(zp_plugin)
    with zipfile.ZipFile(zp_plugin, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(f"{SRC}/manifest.json", "manifest.json")
        z.write(f"{SRC}/index.js", "index.js")
        z.write(f"{SRC}/bridge.dll", "bridge.dll")
        z.write(f"{SRC}/安装说明.txt", "README.txt")
    with zipfile.ZipFile(zp_plugin) as z:
        zip_assert(z.namelist(), flat=True, label=".plugin")
    print(f"[3] 打包官方安装包：{zp_plugin}（{os.path.getsize(zp_plugin)//1024} KB，根部平铺）")

    # ② plugins_dev 文件夹路线 zip
    zp = f"{DL}/{ZIP_NAME}"
    if os.path.exists(zp):
        os.remove(zp)
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(f"{SRC}/manifest.json", f"{TOP}/manifest.json")
        z.write(f"{SRC}/index.js", f"{TOP}/index.js")
        z.write(f"{SRC}/bridge.dll", f"{TOP}/bridge.dll")
        z.write(f"{SRC}/安装说明.txt", f"{TOP}/安装说明.txt")
    with zipfile.ZipFile(zp) as z:
        zip_assert(z.namelist(), flat=False, label="dev-zip")
    print(f"[4] 打包 dev 包：{zp}（{os.path.getsize(zp)//1024} KB，顶层 {TOP}/）")

if __name__ == "__main__":
    compile_dll()
    self_check()
    package()
