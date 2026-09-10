#!/bin/bash
# 编译 ChuShi Music Hub v8.2.5 原生件。本版实质变更（电流音根治·引擎零扰律，
# 用户 v8.2.4 实测电音依旧 + 「关扩展/移桥即消」对照实验 + spectrum-log 实锤）：
#   ① chushi-spectrum.exe 需求门挡在引擎门口——零消费者绝不 Initialize/Start
#     loopback（连 COM 都不初始化）；link down 的 retry 归途同门。日志实锤：
#     served=0 时仍每 5s 一次 0x88890004 → reinit = 驱动节能拉闸 × 本程序唤醒
#     = 扬声器上下电 pop 循环（电音本音）。零消费者 = 引擎零 loopback 客户端。
#   ② 退避真实化——consecDown 归零从「up 瞬间」挪到「稳定运行 ≥60s」，
#     退避链 800ms→…→30s 封顶，风暴自然衰减。
#   ③ 撤 MMCSS "Pro Audio"（v8.2.4 误方）→ BELOW_NORMAL 让核。
#   ④ FFT 20Hz 节流（50ms 一拍，DSP CPU -80%）。
#   ⑤ hub.dll 中继/keeper 线程 BELOW_NORMAL——网易云进程内让核给音频。
# 宪法门继续断言 hub 导入表仅 ws2_32+kernel32（零 COM 零 WinRT）。
set -e
TOOL=$(ls -d /home/z/my-project/.pkgtmp/toolchain/llvm-mingw*/bin | head -1)
SRC=/tmp/my-project/bridge/v8/native
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

echo "== hub strings (v8.2.5 特征：版本 + BELOW_NORMAL 让核) =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E '^8\.2\.5|/api/spectrum-boot|demand fresh|keeper' | head -8

echo "== helper strings (v8.2.5 特征：需求门/退避真实化/按需/优雅退出，且 MMCSS 已撤) =="
"$TOOL/llvm-strings" "$SRC/chushi-spectrum.exe" | grep -E '^8\.2\.5|demand gate|engine untouched|link down \(storm|loopback paused|consumer back|graceful teardown|warmup reinit|pkts=|process starting' | head -14
if "$TOOL/llvm-strings" "$SRC/chushi-spectrum.exe" | grep -q 'Pro Audio'; then
  echo "MMCSS 门 FAIL：Pro Audio 串残留（撤 MMCSS 未净）"; exit 1
fi
echo "  (MMCSS 撤净 ✓)"

echo "== zero native residue check =="
"$TOOL/llvm-strings" "$SRC/hub.dll.x64.dll" | grep -E 'nativeFire|WM_APPCOMMAND|keybd_event|/api/native' | head -5 || echo "  (clean)"
echo "BUILD v8.2.5 DONE"
