#!/bin/bash
# 编译 ChuShi Music Hub v8.0.7 原生 DLL（双架构：x86 主架 + x64 变体）
# v8.0.7：轮询租约（/api/poll 认领 + /api/cmd 排空权唯一化）——杜绝多桥实例
#         （网易云残留进程/多进程注入）抢排命令队列（用户实机 cmdTrace 取证：
#         POST 全 ok + 桥状态活 + 回执从未出现 → 命令被第二轮询者分走的唯一解释）
# 双架构律欠账补齐：v8.0.0~v8.0.6 六代发布包 hub.dll 全是 x64-only，32 位网易云
#   用户从未加载成功过。本版恢复宪法：主架 hub.dll=x86，x64 变体=hub.dll.x64.dll
#   （BetterNCM v2 加载序列：先试 manifest native_plugin，失败追加 .x64.dll 重试，
#   与 InfLink-rs backend.dll/backend.dll.x64.dll 同约定）。
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

echo "== version + lease strings (x64) =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E '^8\.0\.7|/api/poll|lease|\[poll\]' | head -8
echo "== version + lease strings (x86) =="
"$TOOL/llvm-strings" "$SRC/hub.dll" | grep -E '^8\.0\.7|/api/poll|lease|\[poll\]' | head -8
echo "== zero native residue check =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E 'nativeFire|WM_APPCOMMAND|keybd_event|/api/native' | head -5 || echo "  (clean)"
