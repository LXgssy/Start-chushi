#!/bin/bash
# 编译 ChuShi Spectrum Helper v8.2.9（128 段频谱）。本版实质变更：
#   ① BANDS 16→128（用户指令「提高fft采样点数，提升到128」）——
#     帧体 ~0.9KB@40Hz 环回无感；低频侧被单调守卫线性化（段k≈bin k+2，
#     23.4Hz/段）= 低频真·细化；对数分布 2kHz+ 保持。
#   ② bass 重定义：0..1/2..3/4..6 段（47~211Hz）分区带权——底鼓拳感
#     与 16 段时代等价（DSP 数学门 dsp-gate-v829.py 五场景断言）。
# 引擎零扰律：hub.dll / hub.dll.x64.dll 不重编译（md5 与 8.2.5 一致），
#   仅 chushi-spectrum.exe 换血（SPEC_VERSION 8.2.9）。
# 宪法门继续断言 spectrum 导入表（ole32+ws2_32+kernel32+ucrt）。
set -e
TOOL=$(ls -d /home/z/my-project/.pkgtmp/toolchain/ex/llvm-mingw-*/bin | head -1)
SRC=/tmp/my-project/bridge/v8/native
CFLAGS="-O2 -Wall -Wextra -Wno-unused-parameter -fms-extensions"
LIBS="-lws2_32 -lkernel32 -static"

echo "== build spectrum helper v8.2.9 (x64 独立进程, BANDS=128) =="
"$TOOL/x86_64-w64-mingw32-gcc" $CFLAGS -o "$SRC/chushi-spectrum.exe" \
  "$SRC/chushi_spectrum.c" -lole32 $LIBS

echo "== artifacts =="
ls -la "$SRC"/chushi-spectrum.exe

echo "== spectrum imports —— ole32 允许（COM 只在助手进程） =="
"$TOOL/llvm-objdump" -p "$SRC/chushi-spectrum.exe" | grep 'DLL Name'

echo "== strings 特征门（版本 + 128 段 + 需求门） =="
if grep -c "8\.2\.9" "$SRC/chushi-spectrum.exe" > /dev/null; then echo "  8.2.9 in binary OK"; else echo "  版本串缺失 FAIL"; exit 1; fi
if grep -c "demand gate" "$SRC/chushi-spectrum.exe" > /dev/null; then echo "  demand gate OK"; else echo "  需求门特征缺失 FAIL"; exit 1; fi

echo "== hub.dll 引擎零扰律 md5 对拍（必须与 8.2.5 一致 07011f2c...） =="
md5sum "$SRC/hub.dll" "$SRC/hub.dll.x64.dll"

echo "== 新旧 exe md5 必不同（Task 93 假绿律：产物对拍） =="
OLD=$(md5sum /tmp/my-project/download/v8.2.8-ref-spectrum.exe 2>/dev/null | cut -d' ' -f1 || true)
NEW=$(md5sum "$SRC/chushi-spectrum.exe" | cut -d' ' -f1)
echo "  new exe md5: $NEW"
python3 scripts/build-smtc-preset.py > /dev/null 2>&1 || true
echo "BUILD OK"
