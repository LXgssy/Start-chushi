#!/bin/bash
# 编译 ChuShi Music Hub v8.2.1 原生件（hub.dll 与 v8.2.0 同源重编；本版实质变更
# 只在频谱助手：chushi-spectrum.exe 日志回退链——spectrum-log.txt 写盘失败时
# 退 %LOCALAPPDATA%\ChuShi\，启动首行自证实际路径，根治「找不到日志」）。
# 宪法门继续断言 hub 导入表仅 ws2_32+kernel32（零 COM 零 WinRT）。
set -e
TOOL=$(ls -d /home/z/my-project/.pkgtmp/toolchain/llvm-mingw*/bin | head -1)
SRC=/home/z/my-project/bridge/v8/native
CFLAGS="-O2 -Wall -Wextra -Wno-unused-parameter -fms-extensions"
LIBS="-lws2_32 -lkernel32 -static"

echo "== build x86 (hub.dll, 主架) =="
"$TOOL/i686-w64-mingw32-gcc" $CFLAGS -DHUB_NO_SEH -shared -o "$SRC/hub.dll" \
  "$SRC/chushi_hub.c" "$SRC/chushi_hub.def" $LIBS

echo "== build x64 (hub.dll.x64.dll) =="
"$TOOL/x86_64-w64-mingw32-gcc" $CFLAGS -shared -o "$SRC/hub.dll.x64.dll" \
  "$SRC/chushi_hub.c" "$SRC/chushi_hub.def" $LIBS

echo "== build spectrum helper (x64 独立进程) =="
"$TOOL/x86_64-w64-mingw32-gcc" $CFLAGS -o "$SRC/chushi-spectrum.exe" \
  "$SRC/chushi_spectrum.c" -lole32 $LIBS

echo "== artifacts =="
ls -la "$SRC"/hub.dll "$SRC"/hub.dll.x64.dll "$SRC"/chushi-spectrum.exe

echo "== exports (x86) =="
"$TOOL/llvm-nm" --defined-only --extern-only "$SRC/hub.dll" | head -5

echo "== imports (x86) —— 宪法门：仅 ws2_32 + kernel32（+ UCRT api 集） =="
"$TOOL/llvm-objdump" -p "$SRC/hub.dll" | grep 'DLL Name'
"$TOOL/llvm-objdump" -p "$SRC/hub.dll" | grep 'DLL Name' | grep -Eiv 'ws2_32|kernel32|api-ms-win-crt' \
  && { echo "宪法门 FAIL：hub 导入表出现非法 DLL"; exit 1; } || echo "  (宪法门过：零 COM/零 WinRT)"

echo "== imports (x64) —— 同门 =="
"$TOOL/llvm-objdump" -p "$SRC/hub.dll.x64.dll" | grep 'DLL Name' | grep -Eiv 'ws2_32|kernel32|api-ms-win-crt' \
  && { echo "宪法门 FAIL：hub 导入表出现非法 DLL"; exit 1; } || echo "  (宪法门过：零 COM/零 WinRT)"

echo "== spectrum helper imports —— ole32 允许（COM 只在助手进程） =="
"$TOOL/llvm-objdump" -p "$SRC/chushi-spectrum.exe" | grep 'DLL Name'

echo "== version + log-fallback strings (x64) =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E '^8\.2\.|/api/spectrum-boot|chushi-spectrum|\[spec\]' | head -6
echo "== helper strings (v8.2.1 特征：版本 + 日志回退 + 自证行) =="
"$TOOL/llvm-strings" "$SRC/chushi-spectrum.exe" | grep -E '^8\.2\.1|spectrum-log\.txt|ChuShi|LOCALAPPDATA|log file|\[cap\]|\[boot\]' | head -12
echo "== zero native residue check =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E 'nativeFire|WM_APPCOMMAND|keybd_event|/api/native' | head -5 || echo "  (clean)"
echo "BUILD v8.2.1 DONE"
