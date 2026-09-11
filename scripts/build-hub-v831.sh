#!/bin/bash
# 编译 ChuShi Native v8.3.1（频谱助手常驻律）。本版实质变更：
#   ① chushi_hub.c keeper 拉起政策重写——「网易云一启动它就应该启动」：
#     宿主（网易云）存活 ⟺ keeper 存活，撤 120s 需求门，助手不在场即拉起；
#     首拍 5s→1.2s，节拍 5s→3s。引擎需求门（spectrum 侧 CAP_IDLE_STOP）
#     原样保留——拉起的只是进程，零消费者仍绝不碰 WASAPI（电流音律不破）。
#   ② chushi_spectrum.c 空闲自退拆除——「暂停时间过久不要停止运行；只要
#     网易云在运行就不要停止」：IDLE_EXIT 60s 自杀分支整体摘除，进程生命
#     周期 = 宿主生命周期（Job Object KILL_ON_JOB_CLOSE 随网易云退出回收）。
#     暂停期引擎照旧按需摘管（10s 无消费者 → Stop），复播 ~300ms 回位。
#   ③ 版本随动：hub 8.2.5→8.3.1（本版重编译，8.2.5 基准 md5 律本版起由
#     「keeper 政策重写」取代）、spectrum 8.2.9→8.3.1。
# 宪法门继续断言 hub 导入表仅 ws2_32+kernel32（+UCRT api 集）、spectrum
# 导入表 ole32+ws2_32+kernel32+ucrt。
set -e
TOOL=$(ls -d /home/z/my-project/.pkgtmp/toolchain/ex/llvm-mingw-*/bin | head -1)
SRC=/tmp/my-project/bridge/v8/native
CFLAGS="-O2 -Wall -Wextra -Wno-unused-parameter -fms-extensions"
LIBS="-lws2_32 -lkernel32 -static"

echo "== build hub.dll v8.3.1 (x86 主架) =="
"$TOOL/i686-w64-mingw32-gcc" $CFLAGS -DHUB_NO_SEH -shared -o "$SRC/hub.dll" \
  "$SRC/chushi_hub.c" "$SRC/chushi_hub.def" $LIBS

echo "== build hub.dll.x64.dll v8.3.1 =="
"$TOOL/x86_64-w64-mingw32-gcc" $CFLAGS -shared -o "$SRC/hub.dll.x64.dll" \
  "$SRC/chushi_hub.c" "$SRC/chushi_hub.def" $LIBS

echo "== build spectrum helper v8.3.1 (x64 独立进程) =="
"$TOOL/x86_64-w64-mingw32-gcc" $CFLAGS -o "$SRC/chushi-spectrum.exe" \
  "$SRC/chushi_spectrum.c" -lole32 $LIBS

echo "== artifacts =="
ls -la "$SRC"/hub.dll "$SRC"/hub.dll.x64.dll "$SRC"/chushi-spectrum.exe

echo "== imports (x86) —— 宪法门：仅 ws2_32 + kernel32（+ UCRT api 集） =="
"$TOOL/llvm-objdump" -p "$SRC/hub.dll" | grep 'DLL Name'
"$TOOL/llvm-objdump" -p "$SRC/hub.dll" | grep 'DLL Name' | grep -Eiv 'ws2_32|kernel32|api-ms-win-crt' \
  && { echo "宪法门 FAIL：hub 导入表出现非法 DLL"; exit 1; } || echo "  (宪法门过：零 COM/零 WinRT)"

echo "== imports (x64) —— 同门 =="
"$TOOL/llvm-objdump" -p "$SRC/hub.dll.x64.dll" | grep 'DLL Name' | grep -Eiv 'ws2_32|kernel32|api-ms-win-crt' \
  && { echo "宪法门 FAIL：hub 导入表出现非法 DLL"; exit 1; } || echo "  (宪法门过：零 COM/零 WinRT)"

echo "== spectrum imports —— ole32 允许（COM 只在助手进程） =="
"$TOOL/llvm-objdump" -p "$SRC/chushi-spectrum.exe" | grep 'DLL Name'

echo "== hub strings (v8.3.1 特征：常驻律 keeper) =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E '^8\.3\.1|host alive & helper absent|spectrum-boot|keeper' | head -6
if "$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -q 'demand fresh'; then
  echo "hub 门 FAIL：旧需求门字符串残留（v8.3.1 应已退役）"; exit 1
fi
echo "  (需求门字符串已退役 ✓)"

echo "== spectrum strings (v8.3.1 特征：空闲自退拆除) =="
"$TOOL/llvm-strings" "$SRC/chushi-spectrum.exe" | grep -E '^8\.3\.1|demand gate|loopback paused|consumer back|graceful teardown|warmup reinit|pkts=|process starting' | head -10
if "$TOOL/llvm-strings" "$SRC/chushi-spectrum.exe" | grep -q 'self exit'; then
  echo "spectrum 门 FAIL：空闲自退字符串残留（v8.3.1 应已拆除）"; exit 1
fi
echo "  (空闲自退字符串已拆除 ✓)"

echo "== 新旧 exe md5 必不同（产物对拍） =="
OLD=$(md5sum /tmp/my-project/download/v8.2.8-ref-spectrum.exe 2>/dev/null | cut -d' ' -f1 || true)
NEW=$(md5sum "$SRC/chushi-spectrum.exe" | cut -d' ' -f1)
echo "  new exe md5: $NEW"
if [ -n "$OLD" ] && [ "$OLD" = "$NEW" ]; then echo "  FAIL: exe 未换血"; exit 1; fi
echo "BUILD OK"
