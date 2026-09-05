#!/usr/bin/env python3
# build-plugin.py — 初始音乐桥 BetterNCM 插件打包（1.1.0）
#   编译 bridge/native/bridge.c → bridge.dll（llvm-mingw）→ 复制进 plugin/ → 组装 zip
import subprocess, os, sys, zipfile, shutil

ROOT = "/home/z/my-project"
SRC = f"{ROOT}/bridge/plugin"
NATIVE = f"{ROOT}/bridge/native"
TC = "/home/z/toolchain/llvm-mingw-20260826-ucrt-ubuntu-22.04-x86_64/bin"
CC = f"{TC}/x86_64-w64-mingw32-gcc"
OBJDUMP = f"{TC}/x86_64-w64-mingw32-objdump"
DL = f"{ROOT}/download/v1.7.6"
ZIP_NAME = "初始音乐桥-插件-1.1.0.zip"

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

def package():
    shutil.copyfile(f"{NATIVE}/bridge.dll", f"{SRC}/bridge.dll")
    os.makedirs(DL, exist_ok=True)
    zp = f"{DL}/{ZIP_NAME}"
    if os.path.exists(zp):
        os.remove(zp)
    TOP = "初始音乐桥"
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(f"{SRC}/manifest.json", f"{TOP}/manifest.json")
        z.write(f"{SRC}/index.js", f"{TOP}/index.js")
        z.write(f"{SRC}/bridge.dll", f"{TOP}/bridge.dll")
        z.write(f"{SRC}/安装说明.txt", f"{TOP}/安装说明.txt")
    print(f"[3] 打包：{zp}（{os.path.getsize(zp)//1024} KB）")

if __name__ == "__main__":
    compile_dll()
    self_check()
    package()
