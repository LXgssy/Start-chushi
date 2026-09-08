#!/bin/bash
# 编译 ChuShi Music Hub v8.0.6 原生 DLL（x64）
# v8.0.6：POST /api/native 媒体键端点整体退役（用户指令）——导入表回到
#         ws2_32 + kernel32（user32 引用清零），零 WinRT/COM/OS 输入层干预
# 注：x86 (i686) 构建触发 llvm clang 后端崩溃（SEH×DWARF EH 代码生成缺陷），按用户指示暂停 x86 线
set -e
TOOL=$(ls -d /home/z/my-project/.pkgtmp/toolchain/llvm-mingw*/bin | head -1)
SRC=/home/z/my-project/bridge/v8/native
CFLAGS="-O2 -Wall -Wextra -Wno-unused-parameter -fms-extensions"
LIBS="-lws2_32 -lkernel32 -static"

echo "== build x64 (hub.dll) =="
"$TOOL/x86_64-w64-mingw32-gcc" $CFLAGS -shared -o "$SRC/hub.dll" \
  "$SRC/chushi_hub.c" "$SRC/chushi_hub.def" $LIBS

echo "== artifacts =="
ls -la "$SRC"/hub.dll
echo "== exports =="
"$TOOL/llvm-nm" --defined-only --extern-only "$SRC/hub.dll" | head -5
echo "== imports (dll names) =="
"$TOOL/llvm-objdump" -p "$SRC/hub.dll" | grep 'DLL Name'
echo "== version string =="
"$TOOL/llvm-strings" "$SRC/hub.dll" | grep -E '^8\.0\.6|/api/native|\[native\]|nativeFire' | head -5
