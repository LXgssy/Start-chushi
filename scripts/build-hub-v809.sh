#!/bin/bash
# 编译 ChuShi Music Hub v8.0.9 原生 DLL（双架构：x86 主架 + x64 变体）
# v8.0.9：dataDrainCmds 排空 JSON 收尾 '}' 补写（v8.0.0~v8.0.7 八代全部漏写，
#         桥 r.json() 必抛 → 命令随排空灰飞烟灭——hubsim 协议级复现 +
#         发布二进制反汇编 0x7d 存储指令计数=0 实锢）；
#         新增 GET /api/hublog 证据端点（环形请求日志 + 入队/排空/租约收据）。
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

echo "== artifacts =="
ls -la "$SRC"/hub.dll "$SRC"/hub.dll.x64.dll

echo "== exports (x86) =="
"$TOOL/llvm-nm" --defined-only --extern-only "$SRC/hub.dll" | head -5
echo "== exports (x64) =="
"$TOOL/llvm-nm" --defined-only --extern-only "$SRC/hub.dll.x64.dll" | head -5

echo "== imports (x86) =="
"$TOOL/llvm-objdump" -p "$SRC/hub.dll" | grep 'DLL Name'
echo "== imports (x64) =="
"$TOOL/llvm-objdump" -p "$SRC/hub.dll.x64.dll" | grep 'DLL Name'

echo "== version + hublog strings (x64) =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E '^8\.0\.8|/api/hublog|\[drain\]|\[enqueue\]' | head -8
echo "== version + hublog strings (x86) =="
"$TOOL/llvm-strings" "$SRC/hub.dll" | grep -E '^8\.0\.8|/api/hublog|\[drain\]|\[enqueue\]' | head -8
echo "== zero native residue check =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E 'nativeFire|WM_APPCOMMAND|keybd_event|/api/native' | head -5 || echo "  (clean)"
