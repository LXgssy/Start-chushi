#!/bin/bash
# 编译 ChuShi SMTC Manager 原生 DLL (x64 Windows, llvm-mingw)
set -e
TOOL=$(ls -d /home/z/my-project/.pkgtmp/toolchain/llvm-mingw*/bin | head -1)
SRC=/home/z/my-project/.wt-v7/bridge/v7/native
OUT=/home/z/my-project/.wt-v7/bridge/v7/native/chushi_smtc_native.dll
"$TOOL/x86_64-w64-mingw32-gcc" -O2 -Wall -Wextra -Wno-unused-parameter \
  -shared -o "$OUT" "$SRC/chushi_smtc_native.c" "$SRC/chushi_smtc.def" \
  -lkernel32 -luser32 -lws2_32 -static
echo "BUILD OK: $(ls -la "$OUT" | awk '{print $5}') bytes"
"$TOOL/llvm-objdump" -p "$OUT" | grep -A8 'Export Address Table' | head -12 || true
echo '--- exports ---'
"$TOOL/llvm-nm" --defined-only --extern-only "$OUT" | head -10
echo '--- imports (dll names) ---'
"$TOOL/llvm-objdump" -p "$OUT" | grep 'DLL Name' | head -12
