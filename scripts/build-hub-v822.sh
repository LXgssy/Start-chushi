#!/bin/bash
# 编译 ChuShi Music Hub v8.2.2 原生件。本版实质变更（用户实机反馈：
# chushi-spectrum 根本没在跑 + 日志找不到）：
#   ① chushi-spectrum.exe 日志固定写 %LOCALAPPDATA%\ChuShi\spectrum-log.txt
#     （用户指定唯一位置；v8.2.1 的 exe 同目录优先回退链作废），启动最先
#     留痕——互斥体占用/WSA 失败/端口全忙全部有日志可查；
#   ② hub.dll 日志回退链（DLL 目录只读 → %LOCALAPPDATA%\ChuShi\hub-log.txt）
#     + 助手主动保活 specEnsure（/api/state 请求附带保障助手在场）
#     + 助手退出码留痕（0xC0000135=缺 DLL 等）。
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

echo "== version + v8.2.2 特征 (x64 hub) =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E '^8\.2\.|/api/spectrum-boot|chushi-spectrum|\[spec\]|auto-ensure|LOCALAPPDATA' | head -8

echo "== helper strings (v8.2.2 特征：版本 + 固定日志位 + 启动留痕) =="
"$TOOL/llvm-strings" "$SRC/chushi-spectrum.exe" | grep -E '^8\.2\.2|spectrum-log\.txt|ChuShi|LOCALAPPDATA|log file|process starting|mutex|WSAStartup|\[cap\]|\[boot\]' | head -14

echo "== zero native residue check =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E 'nativeFire|WM_APPCOMMAND|keybd_event|/api/native' | head -5 || echo "  (clean)"
echo "BUILD v8.2.2 DONE"
