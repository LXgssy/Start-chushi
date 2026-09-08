#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v7.2.0 SMTC 三插件打包（broker 全路径 SEH + 元数据链根治）

v7.2.0 三大修复：
  F1 卡片「未知曲目」根治：插件B store 探针升级多阶梯（React fiber /
     webpack4 / g_app / mediaSession / DOM 刮削）；broker 全空元数据
     不再上卡（「未知曲目」是 v7.1.0 空 title 走的 fallback 字符串）。
  F2 卡片消失自愈：ButtonPressed/Position 系统事件 raise 路径（发生在
     DispatchMessageW 内）全 SEH 覆盖 + SetUnhandledExceptionFilter
     兜底日志；broker 异常只死自己，监督者 ≤4s 拉起（退避封顶 8s→4s）。
  F3 可观测性：事件 raise 限频日志 / meta 应用日志 / op 应用日志 /
     监督者计时日志 —— 下轮报障一眼定位。

门禁清单（继承 710 全部 + 新增）：
  G1  node --check 三个 index.js
  G2  manifest 结构（v1/ASCII name/CJK description/ncm3/injects/版本）
  G3  zip 根布局
  G4  DLL 导出 BetterNCMPluginMain；体积 > 60KB
  G5  版本一致性（A=7.2.0 / B=7.1.0 / C=7.0.0 / broker=7.2.0）
  G6  文件名 ASCII
  G7  BetterNCM 过滤链模拟 → WOULD LOAD AND LIST
  G8  【零 WinRT 律】DLL 导入表无 combase/winrt；DLL 自身无 SMTC IID
  G9  broker exe：PE/窗口类/互斥体/路由/IID/CCW 律
  G10 内嵌 blob == 包内 exe（sha256）
  G11 CCW 时间线 ABI（编译期静态断言 + 反汇编 *0x60）
  G12 预设包（chushi.registerCommand 律）
  G13 【新】broker 含 SetUnhandledExceptionFilter 导入名 + UNHANDLED 日志标记
  G14 【新】broker 含事件/元数据日志标记（[evt] / [meta] applied）
  G15 【新】插件B fiber 探针标记（__reactFiber$ / readMediaSession / scrapeBar / safePlay）
"""
import hashlib, json, re, struct, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path('/home/z/my-project')
WT = ROOT / '.wt-v7'
PLG = WT / 'bridge/v7/plugins'
NATIVE_DIR = WT / 'bridge/v7/native'
BROKER_C = NATIVE_DIR / 'chushi_smtc_broker.c'
NATIVE_C = NATIVE_DIR / 'chushi_smtc_native.c'
BROKER_EXE = NATIVE_DIR / 'ChuShiSMTCBroker.exe'
NATIVE_DLL = NATIVE_DIR / 'chushi_smtc_native.dll'
BLOB_H = NATIVE_DIR / 'chushi_broker_blob.h'
OUT = WT / 'download/v7.2.0'
VER_A = '7.2.0'
VER_B = '7.1.0'
VER_C = '7.0.0'
TOOL = sorted((ROOT / '.pkgtmp/toolchain').glob('llvm-mingw*/bin'))[0]
GCC = str(TOOL / 'x86_64-w64-mingw32-gcc')

PASS = 0
FAIL = 0

def check(name, cond, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  PASS {name}')
    else:
        FAIL += 1
        print(f'  FAIL {name} {detail}')

def is_ascii(s):
    return all(ord(c) < 128 for c in s)

def has_cjk(s):
    return any('\u4e00' <= c <= '\u9fff' for c in s)

def utf16le(s):
    return s.encode('utf-16-le')

def guid_bytes(l, w1, w2, b):
    return struct.pack('<IHH', l, w1, w2) + bytes(b)

def pe_imports(path):
    data = Path(path).read_bytes()
    if data[:2] != b'MZ':
        return []
    pe = struct.unpack_from('<I', data, 0x3C)[0]
    if data[pe:pe + 4] != b'PE\0\0':
        return []
    coff = pe + 4
    num_sec = struct.unpack_from('<H', data, coff + 2)[0]
    opt_size = struct.unpack_from('<H', data, coff + 16)[0]
    opt = coff + 20
    imp_rva, imp_size = struct.unpack_from('<II', data, opt + 120)
    sec = opt + opt_size
    sections = []
    for i in range(num_sec):
        so = sec + i * 40
        vsize, vaddr, rsize, roff = struct.unpack_from('<IIII', data, so + 8)
        sections.append((vaddr, vsize, roff, rsize))
    def rva2off(rva):
        for vaddr, vsize, roff, rsize in sections:
            if vaddr <= rva < vaddr + max(vsize, rsize):
                return roff + (rva - vaddr)
        return None
    names = []
    if imp_rva == 0:
        return names
    off = rva2off(imp_rva)
    if off is None:
        return names
    while True:
        ent = data[off:off + 20]
        if len(ent) < 20 or ent == b'\0' * 20:
            break
        name_rva = struct.unpack_from('<I', ent, 12)[0]
        if name_rva:
            no = rva2off(name_rva)
            if no is not None:
                end = data.index(b'\0', no)
                names.append(data[no:end].decode(errors='replace').lower())
        off += 20
    return names

def pe_export_names(dll_bytes):
    if dll_bytes[:2] != b'MZ':
        return []
    pe_off = struct.unpack_from('<I', dll_bytes, 0x3C)[0]
    if dll_bytes[pe_off:pe_off + 4] != b'PE\0\0':
        return []
    coff = pe_off + 4
    num_sections = struct.unpack_from('<H', dll_bytes, coff + 2)[0]
    opt_size = struct.unpack_from('<H', dll_bytes, coff + 16)[0]
    opt = coff + 20
    export_rva, export_size = struct.unpack_from('<II', dll_bytes, opt + 112)
    if export_rva == 0:
        return []
    sec = opt + opt_size
    sections = []
    for i in range(num_sections):
        so = sec + i * 40
        vsize, vaddr, rsize, roff = struct.unpack_from('<IIII', dll_bytes, so + 8)
        sections.append((vaddr, vsize, roff, rsize))
    def rva2off(rva):
        for vaddr, vsize, roff, rsize in sections:
            if vaddr <= rva < vaddr + max(vsize, rsize):
                return roff + (rva - vaddr)
        return None
    eo = rva2off(export_rva)
    if eo is None:
        return []
    nnames = struct.unpack_from('<I', dll_bytes, eo + 24)[0]
    names_rva = struct.unpack_from('<I', dll_bytes, eo + 32)[0]
    no = rva2off(names_rva)
    names = []
    for i in range(nnames):
        rva = struct.unpack_from('<I', dll_bytes, no + i * 4)[0]
        o = rva2off(rva)
        end = dll_bytes.index(b'\0', o)
        names.append(dll_bytes[o:end].decode())
    return names

def betterncm_filter_sim(manifest, zip_names):
    if not manifest.get('ncm3-compatible', False):
        return 'REJECT ncm3-compatible missing'
    if manifest.get('manifest_version') != 1:
        return 'REJECT manifest_version != 1'
    if 'manifest.json' not in zip_names:
        return 'REJECT manifest.json not at zip root'
    native = manifest.get('native_plugin', '')
    if native and native not in zip_names:
        return 'REJECT native_plugin missing in zip'
    return 'WOULD LOAD AND LIST'

def disasm_slots_gate(pe_path):
    r = subprocess.run(['objdump', '-d', str(pe_path)], capture_output=True, text=True)
    if r.returncode != 0:
        return False, 'objdump failed'
    seq = []
    for line in r.stdout.splitlines():
        m = re.search(r'call\s+\*(0x[0-9a-f]+)\(', line)
        if m:
            seq.append(int(m.group(1), 16))
    want = [0x38, 0x48, 0x58, 0x68, 0x78, 0x60]
    hits = [i for i in range(len(seq) - 5) if seq[i:i + 6] == want]
    return bool(hits), f'seq windows found={hits} all_calls={len(seq)}'

def sh(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        print(r.stdout[-2000:])
        print(r.stderr[-2000:])
        sys.exit(f'BUILD STEP FAILED: {cmd}')
    return r

def main():
    OUT.mkdir(parents=True, exist_ok=True)

    print('== [1/5] compile broker exe ==')
    sh([GCC, '-O2', '-Wall', '-Wextra', '-Wno-unused-parameter',
        '-fms-extensions', '-o', str(BROKER_EXE), str(BROKER_C),
        '-lkernel32', '-luser32', '-lws2_32', '-lole32', '-static'])
    exe_bytes = BROKER_EXE.read_bytes()
    print(f'  broker exe: {len(exe_bytes)} bytes')

    print('== [2/5] embed blob + compile supervisor dll ==')
    lines = ['/* auto-generated by build-smtc-720.py — 内嵌 broker exe */',
             'static const unsigned char g_brokerBlob[] = {']
    hexes = []
    for i in range(0, len(exe_bytes), 20):
        hexes.append(','.join(f'0x{b:02x}' for b in exe_bytes[i:i + 20]))
    lines.append(','.join(hexes))
    lines.append('};')
    lines.append(f'static const unsigned int g_brokerBlobLen = {len(exe_bytes)};')
    BLOB_H.write_text('\n'.join(lines) + '\n', encoding='utf-8')

    sh([GCC, '-O2', '-Wall', '-Wextra', '-Wno-unused-parameter',
        '-shared', '-o', str(NATIVE_DLL), str(NATIVE_C),
        f'{NATIVE_DIR}/chushi_smtc.def',
        '-lkernel32', '-luser32', '-lws2_32', '-lshell32', '-lole32', '-static'])
    dll_bytes = NATIVE_DLL.read_bytes()
    print(f'  supervisor dll: {len(dll_bytes)} bytes')

    print('== [3/5] gates ==')
    js_a = (PLG / 'smtc-manager/index.js').read_text(encoding='utf-8')
    js_b = (PLG / 'music-bridge/index.js').read_text(encoding='utf-8')
    js_c = (PLG / 'lyric-source/index.js').read_text(encoding='utf-8')
    mf_a = json.loads((PLG / 'smtc-manager/manifest.json').read_text(encoding='utf-8'))
    mf_b = json.loads((PLG / 'music-bridge/manifest.json').read_text(encoding='utf-8'))
    mf_c = json.loads((PLG / 'lyric-source/manifest.json').read_text(encoding='utf-8'))

    for nm, p in [('A', PLG / 'smtc-manager/index.js'),
                  ('B', PLG / 'music-bridge/index.js'),
                  ('C', PLG / 'lyric-source/index.js')]:
        r = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
        check(f'G1 node --check 插件{nm}', r.returncode == 0, r.stderr[:200])

    for nm, mf, ver in [('A', mf_a, VER_A), ('B', mf_b, VER_B), ('C', mf_c, VER_C)]:
        check(f'G2 插件{nm} manifest_version==1', mf.get('manifest_version') == 1)
        check(f'G2 插件{nm} slug ASCII', is_ascii(mf.get('slug', '')))
        check(f'G2 插件{nm} name 纯 ASCII', is_ascii(mf.get('name', '')))
        check(f'G2 插件{nm} description 必含 CJK', has_cjk(mf.get('description', '')))
        check(f'G2 插件{nm} ncm3-compatible true', mf.get('ncm3-compatible') is True)
        check(f'G2 插件{nm} 版本 {ver}', mf.get('version') == ver)
        check(f'G2 插件{nm} injects Main→index.js',
              mf.get('injects', {}).get('Main') == [{'file': 'index.js', 'type': 'script'}])

    check(f'G5 插件A JS 版本 {VER_A}', f"var VER = '{VER_A}';" in js_a)
    check(f'G5 插件B JS 版本 {VER_B}', f"var VER = '{VER_B}';" in js_b)
    check(f'G5 插件C JS 版本 {VER_C}', f"var VER = '{VER_C}';" in js_c)
    check(f'G5 DLL 版本串 {VER_A}+supervisor',
          VER_A.encode() in dll_bytes and b'supervisor' in dll_bytes)
    check(f'G5 exe 版本串 {VER_A}+broker banner',
          VER_A.encode() in exe_bytes and b'ChuShi SMTC Broker' in exe_bytes)

    exports = pe_export_names(dll_bytes)
    check('G4 DLL 导出 BetterNCMPluginMain', 'BetterNCMPluginMain' in exports, str(exports))
    check('G4 DLL 非占位（>60KB，含内嵌 exe）', len(dll_bytes) > 60000, str(len(dll_bytes)))

    imports = pe_imports(NATIVE_DLL)
    check('G8 【零 WinRT 律】DLL 导入表无 combase.dll',
          not any('combase' in x for x in imports), str(imports))
    check('G8 【零 WinRT 律】DLL 导入表无 api-ms-win-core-winrt*',
          not any('winrt' in x for x in imports), str(imports))
    tl = guid_bytes(0x5125316A, 0xC3A2, 0x475B, [0x85, 0x07, 0x93, 0x53, 0x4D, 0xC8, 0x8F, 0x15])
    ip = guid_bytes(0xDDB0472D, 0xC911, 0x4A1F, [0x86, 0xD9, 0xDC, 0x3D, 0x71, 0xA9, 0x5F, 0x5A])
    sm = guid_bytes(0x99FA3FF4, 0x1742, 0x42A6, [0x90, 0x2E, 0x08, 0x7D, 0x41, 0xF9, 0x65, 0xEC])
    blob_off = dll_bytes.find(exe_bytes[:4096])
    dll_own = dll_bytes[:blob_off] + dll_bytes[blob_off + len(exe_bytes):] if blob_off > 0 else dll_bytes
    check('G8 【零 WinRT 律】DLL 自身代码不含 SMTC IID 字节（排除内嵌 blob 区）',
          not (tl in dll_own or ip in dll_own or sm in dll_own), f'blob_off={blob_off}')

    check('G9 exe PE 合法', exe_bytes[:2] == b'MZ' and b'PE\0\0' in exe_bytes[:0x400])
    check('G9 exe 含 STA 窗口类名', utf16le('ChuShiSmtcBrokerWnd') in exe_bytes)
    check('G9 exe 含互斥体名', utf16le('ChuShi.Smtc.Broker.v1') in exe_bytes)
    check('G9 exe 含父看门狗/日志参数', b'--parent' in exe_bytes and b'--log' in exe_bytes)
    check('G9 exe 含枢纽路由标记（优化存活子集）',
          b'/api/smtc/update' in exe_bytes and b'/api/smtc/events' in exe_bytes
          and b'/api/cmd' in exe_bytes and b'/api/broker/shut' in exe_bytes
          and b'/api/smtc/status' in exe_bytes)
    check('G9 exe 含枢纽名', b'chushi-smtc-hub' in exe_bytes)
    check('G9 exe 含 IID_SMTCInterop 字节', ip in exe_bytes)
    check('G9 exe 含 IID_SMTC 字节', sm in exe_bytes)
    check('G9 exe 含 IID_TimelineProps 字节（CCW 接口应答）', tl in exe_bytes)
    check('G9 【CCW 律】exe 不含 TimelineProperties 系统类名',
          utf16le('Windows.Media.SystemMediaTransportControlsTimelineProperties') not in exe_bytes)
    check('G9 exe 含 SMTC 运行时类名', utf16le('Windows.Media.SystemMediaTransportControls') in exe_bytes)

    blob_off = dll_bytes.find(exe_bytes[:4096])
    check('G10 内嵌 blob 在 DLL 内', blob_off > 0, str(blob_off))

    broker_c_src = BROKER_C.read_text(encoding='utf-8')
    n_assert = broker_c_src.count('_Static_assert(offsetof(')
    check('G11 【编译期 ABI 门】broker 源含 ≥20 条 vtable offsetof 静态断言',
          n_assert >= 20, str(n_assert))
    r11 = subprocess.run(['objdump', '-d', str(BROKER_EXE)], capture_output=True, text=True)
    check('G11 UpdateTimelineProperties 间接调用(*0x60) 在位',
          r11.returncode == 0 and re.search(r'call\s+\*0x60\(', r11.stdout) is not None)

    # --- v7.2.0 新增门禁 ---
    check('G13 【新】broker 含 SetUnhandledExceptionFilter 导入名',
          b'setunhandledexceptionfilter' in exe_bytes.lower())
    check('G13 【新】broker 含 UNHANDLED 兜底日志标记', b'UNHANDLED' in exe_bytes)
    check('G13 【新】broker 源含 pump 全覆盖 SEH 注记（DispatchMessageW 在 GUARD 内）',
          'DispatchMessageW(&msg);' in broker_c_src and '/* v7.2.0：【raise 路径全覆盖】' in broker_c_src)
    check('G14 【新】broker 含事件 raise 日志标记', b'[evt]' in exe_bytes)
    check('G14 【新】broker 含元数据应用日志标记', b'[meta] applied' in exe_bytes)
    check('G14 【新】broker 源含全空元数据跳过（未知曲目根治）',
          'op->hasMeta = 0;' in broker_c_src)
    check('G15 【新】插件B fiber 探针（webpack5 根治）',
          '__reactFiber$' in js_b and 'findStoreViaFiber' in js_b)
    check('G15 【新】插件B mediaSession 元数据源', 'readMediaSession' in js_b)
    check('G15 【新】插件B DOM 刮削兑底', 'scrapeBar' in js_b)
    check('G15 【新】插件B 自动播放拒绝降级', 'safePlay' in js_b)
    check('G15 【新】插件B 诊断口', '__chushiMusicBridge.debug' in js_b)

    # 预设包
    cmd_src = (WT / 'preset-src/smtc/music-commands.js').read_text(encoding='utf-8')
    r = subprocess.run(['node', '--check', str(WT / 'preset-src/smtc/music-commands.js')],
                       capture_output=True, text=True)
    check('G12 node --check music-commands.js', r.returncode == 0, r.stderr[:200])
    check('G12 禁裸 registerCommand(', re.search(r'(?<![.\w])registerCommand\s*\(', cmd_src) is None)
    check('G12 禁裸 notify(', re.search(r'(?<![.\w])notify\s*\(', cmd_src) is None)
    check('G12 必含 chushi.registerCommand(', 'chushi.registerCommand(' in cmd_src)
    check('G12 必含 chushi.notify(', 'chushi.notify(' in cmd_src)

    sh([sys.executable, str(WT / 'scripts/build-smtc-preset.py')])
    preset_cshz = WT / 'examples/初始SMTC音乐预设.cshz'
    check('G12 预设 .cshz 重建在位', preset_cshz.exists())
    with zipfile.ZipFile(preset_cshz) as z:
        pm = json.loads(z.read('manifest.json'))
    check('G12 预设 script code 无裸 registerCommand',
          re.search(r'(?<![.\w])registerCommand\s*\(', pm['scripts'][0]['code']) is None)
    check('G12 预设 script code 含 chushi.registerCommand', 'chushi.registerCommand(' in pm['scripts'][0]['code'])

    # 打包
    print('== [4/5] package ==')
    pkgs = [
        (f'ChuShi-SMTC-Manager-{VER_A}.plugin', 'smtc-manager', mf_a,
         [('manifest.json', (PLG / 'smtc-manager/manifest.json').read_text(encoding='utf-8')),
          ('index.js', None),
          ('smtc_native.dll', None),
          ('ChuShiSMTCBroker.exe', None)]),
        (f'ChuShi-Music-Bridge-{VER_B}.plugin', 'music-bridge', mf_b,
         [('manifest.json', (PLG / 'music-bridge/manifest.json').read_text(encoding='utf-8')),
          ('index.js', None)]),
        (f'ChuShi-Lyric-Source-{VER_C}.plugin', 'lyric-source', mf_c,
         [('manifest.json', (PLG / 'lyric-source/manifest.json').read_text(encoding='utf-8')),
          ('index.js', None)]),
    ]
    built = []
    for fname, subdir, mf, entries in pkgs:
        target = OUT / fname
        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
            for arc, content in entries:
                if arc == 'manifest.json':
                    z.writestr(arc, content)
                elif arc == 'index.js':
                    z.write(PLG / subdir / 'index.js', arc)
                elif arc == 'smtc_native.dll':
                    z.write(NATIVE_DLL, arc)
                elif arc == 'ChuShiSMTCBroker.exe':
                    z.write(BROKER_EXE, arc)
        with zipfile.ZipFile(target) as z:
            names = set(z.namelist())
            if 'ChuShiSMTCBroker.exe' in names:
                exe_in_pkg = zipfile.ZipFile(target).read('ChuShiSMTCBroker.exe')
                check(f'G10 包内 exe == 内嵌 blob（{fname}）',
                      hashlib.sha256(exe_in_pkg).hexdigest() == hashlib.sha256(exe_bytes).hexdigest())
        check(f'G3 zip 根布局（{fname}）', 'manifest.json' in names and 'index.js' in names, str(names))
        check(f'G6 文件名 ASCII（{fname}）', is_ascii(fname))
        sim = betterncm_filter_sim(mf, names)
        check(f'G7 BetterNCM 过滤链模拟（{fname}）', sim == 'WOULD LOAD AND LIST', sim)
        built.append(target)

    print('== [5/5] checksums ==')
    lines = []
    for t in built + [preset_cshz]:
        h = hashlib.sha256(t.read_bytes()).hexdigest()
        lines.append(f'{h}  {t.name}')
        print(f'  {h[:16]}…  {t.name}  ({t.stat().st_size} bytes)')
    (OUT / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')

    print(f'\n== {PASS} passed, {FAIL} failed ==')
    sys.exit(1 if FAIL else 0)

if __name__ == '__main__':
    main()
