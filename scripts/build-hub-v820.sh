#!/bin/bash
# 编译 ChuShi Music Hub v8.2.0 原生 DLL（双架构：x86 主架 + x64 变体）
# v8.2.0：新增 GET /api/spectrum-boot——惰性拉起/收养独立频谱助手
#         chushi-spectrum.exe（WASAPI loopback+FFT，COM 关在助手进程）。
#         hub 只用 CreateProcessW/Job Object 监护（kernel32）——
#         v8 宪法门继续断言导入表仅 ws2_32+kernel32（零 COM 零 WinRT）。
# 同行编译 chushi-spectrum.exe（x64 独立助手，ole32 仅允许出现在它里面）。
# x86 编译注：llvm-mingw i686 后端在 SEH×DWARF EH 代码生成上崩溃（历史挂起项），
#   x86 构建 -DHUB_NO_SEH 去掉 SEH 自愈（纯 winsock 代码可正常编译）。
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

echo "== version + spectrum strings (x64) =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E '^8\.2\.0|/api/spectrum-boot|chushi-spectrum|\[spec\]' | head -8
echo "== version + spectrum strings (x86) =="
"$TOOL/llvm-strings" "$SRC/hub.dll" | grep -E '^8\.2\.0|/api/spectrum-boot|chushi-spectrum|\[spec\]' | head -8
echo "== helper strings (WASAPI/FFT 特征) =="
"$TOOL/llvm-strings" "$SRC/chushi-spectrum.exe" | grep -E '^8\.2\.0|chushi-spectrum|/api/spectrum|\[cap\]|\[boot\]' | head -8
echo "== zero native residue check =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E 'nativeFire|WM_APPCOMMAND|keybd_event|/api/native' | head -5 || echo "  (clean)"
