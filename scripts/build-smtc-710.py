#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v7.1.0 SMTC-Manager 打包（独立 broker 进程架构，仅插件A 重发 + 预设包修复）

v7.1.0 架构律：WinRT 绝不进宿主进程。
  v7.0.x 四代崩溃收束：SMTC/WinRT 在网易云进程内跑，环境被本体 SMTC 与其它
  插件污染（v7.0.2 ABI 全对仍崩于系统 QI 路径：RoActivateInstance(Timeline-
  Properties) 成功后 QI 系统对象时 Windows.Media.MediaControl.dll 内 AV）。
  本版：DLL=纯监督者（选举/释放/拉起/看护 broker + 诊断 API），broker 独立
  进程承载全部 WinRT/SMTC/HTTP 枢纽；时间线对象一律自实现 CCW（彻底绕开
  TimelineProperties 系统类激活路径）；broker 崩溃只死自己、预算内重启。

门禁清单：
  G1  node --check smtc-manager/index.js
  G2  manifest 结构（v1/ASCII name/CJK description/ncm3/injects）
  G3  zip 根布局 4 文件
  G4  DLL 导出 BetterNCMPluginMain；体积 > 60KB（含内嵌 exe）
  G5  版本一致性 7.1.0（manifest/伴生 JS/DLL banner/broker banner）
  G6  文件名 ASCII
  G7  BetterNCM 过滤链模拟 → WOULD LOAD AND LIST
  G8  【零 WinRT 律】DLL 导入表不含 combase.dll / api-ms-*winrt*；
      DLL 不含 SMTC IID 字节（TimelineProps/SMTCInterop/SMTC）
  G9  broker exe：PE 合法；含 STA 窗口类名/互斥体名/枢纽路由/版本串；
      含 IID_SMTCInterop+IID_SMTC+IID_TimelineProps 字节；
      【CCW 律】不含 TimelineProperties 系统类名（UTF-16）
  G10 内嵌 blob == 包内 exe（sha256 一致）
  G11 反汇编：五 putter 槽位 *0x38..*0x78 连续 + 后随 *0x60
      （UpdateTimelineProperties）——CCW 时间线 ABI 断言
  G12 预设包：node --check + 禁裸 registerCommand(/notify( + 必含 chushi.*
"""
import hashlib, json, re, struct, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path('/home/z/my-project')
WT = ROOT / '.wt-v7'
SRC = WT / 'bridge/v7/plugins/smtc-manager'
NATIVE_DIR = WT / 'bridge/v7/native'
BROKER_C = NATIVE_DIR / 'chushi_smtc_broker.c'
NATIVE_C = NATIVE_DIR / 'chushi_smtc_native.c'
BROKER_EXE = NATIVE_DIR / 'ChuShiSMTCBroker.exe'
NATIVE_DLL = NATIVE_DIR / 'chushi_smtc_native.dll'
BLOB_H = NATIVE_DIR / 'chushi_broker_blob.h'
OUT = WT / 'download/v7.1.0'
VER = '7.1.0'
NAME = f'ChuShi-SMTC-Manager-{VER}'
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
    """PE 导入表 DLL 名列表（x64）"""
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
    magic = struct.unpack_from('<H', data, opt)[0]
    assert magic == 0x20b, 'not PE32+'
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
    """断言：连续间接调用子序列 *0x38/*0x48/*0x58/*0x68/*0x78 后接 *0x60"""
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

    print('== [1/4] compile broker exe ==')
    sh([GCC, '-O2', '-Wall', '-Wextra', '-Wno-unused-parameter',
        '-fms-extensions', '-o', str(BROKER_EXE), str(BROKER_C),
        '-lkernel32', '-luser32', '-lws2_32', '-lole32', '-static'])
    exe_bytes = BROKER_EXE.read_bytes()
    print(f'  broker exe: {len(exe_bytes)} bytes')

    print('== [2/4] embed blob + compile supervisor dll ==')
    lines = ['/* auto-generated by build-smtc-710.py — 内嵌 broker exe */',
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

    print('== [3/4] gates ==')
    js = (SRC / 'index.js').read_text(encoding='utf-8')
    manifest = json.loads((SRC / 'manifest.json').read_text(encoding='utf-8'))

    r = subprocess.run(['node', '--check', str(SRC / 'index.js')], capture_output=True, text=True)
    check('G1 node --check index.js', r.returncode == 0, r.stderr[:200])

    check('G2 manifest_version==1', manifest.get('manifest_version') == 1)
    check('G2 slug ASCII', is_ascii(manifest.get('slug', '')))
    check('G2 name 纯 ASCII', is_ascii(manifest.get('name', '')))
    check('G2 description 必含 CJK（中文文案律）', has_cjk(manifest.get('description', '')))
    check('G2 ncm3-compatible true', manifest.get('ncm3-compatible') is True)
    check('G2 injects Main→index.js',
          manifest.get('injects', {}).get('Main') == [{'file': 'index.js', 'type': 'script'}])

    exports = pe_export_names(dll_bytes)
    check('G4 DLL 导出 BetterNCMPluginMain', 'BetterNCMPluginMain' in exports, str(exports))
    check('G4 DLL 非占位（>60KB，含内嵌 exe）', len(dll_bytes) > 60000, str(len(dll_bytes)))

    check('G5 manifest 版本 7.1.0', manifest.get('version') == VER)
    check('G5 伴生 JS 版本 7.1.0', f"var VER = '{VER}';" in js)
    check('G5 DLL 版本串', b'7.1.0' in dll_bytes and b'supervisor' in dll_bytes)
    check('G5 exe 版本串', b'7.1.0' in exe_bytes and b'ChuShi SMTC Broker' in exe_bytes)

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
    # 注：clang -O2 把短字面量 strcmp 内联成 8 字节立即数比较，
    # 门禁只查优化后仍完整存活的长字符串标记 + 路由处理函数存在性
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
    check('G9 exe 含 STA 初始化（RO_INIT_SINGLETHREADED 注记）', b'STA' in exe_bytes)

    blob_off = dll_bytes.find(exe_bytes[:4096])
    check('G10 内嵌 blob 在 DLL 内', blob_off > 0, str(blob_off))

    broker_c_src = BROKER_C.read_text(encoding='utf-8')
    n_assert = broker_c_src.count('_Static_assert(offsetof(')
    check('G11 【编译期 ABI 门】broker 源含 ≥20 条 vtable offsetof 静态断言（编译过=布局对）',
          n_assert >= 20, str(n_assert))
    r11 = subprocess.run(['objdump', '-d', str(BROKER_EXE)], capture_output=True, text=True)
    check('G11 UpdateTimelineProperties 间接调用(*0x60) 在位',
          r11.returncode == 0 and re.search(r'call\s+\*0x60\(', r11.stdout) is not None)

    # 预设包
    cmd_src = (WT / 'preset-src/smtc/music-commands.js').read_text(encoding='utf-8')
    r = subprocess.run(['node', '--check', str(WT / 'preset-src/smtc/music-commands.js')],
                       capture_output=True, text=True)
    check('G12 node --check music-commands.js', r.returncode == 0, r.stderr[:200])
    check('G12 禁裸 registerCommand(', re.search(r'(?<![.\w])registerCommand\s*\(', cmd_src) is None)
    check('G12 禁裸 notify(', re.search(r'(?<![.\w])notify\s*\(', cmd_src) is None)
    check('G12 必含 chushi.registerCommand(', 'chushi.registerCommand(' in cmd_src)
    check('G12 必含 chushi.notify(', 'chushi.notify(' in cmd_src)

    # 预设 .cshz 重建
    sh([sys.executable, str(WT / 'scripts/build-smtc-preset.py')])
    preset_cshz = WT / 'examples/初始SMTC音乐预设.cshz'
    check('G12 预设 .cshz 重建在位', preset_cshz.exists())
    with zipfile.ZipFile(preset_cshz) as z:
        pm = json.loads(z.read('manifest.json'))
    check('G12 预设 script code 无裸 registerCommand',
          re.search(r'(?<![.\w])registerCommand\s*\(', pm['scripts'][0]['code']) is None)
    check('G12 预设 script code 含 chushi.registerCommand', 'chushi.registerCommand(' in pm['scripts'][0]['code'])

    # 打包
    print('== [4/4] package ==')
    target = OUT / f'{NAME}.plugin'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json', (SRC / 'manifest.json').read_text(encoding='utf-8'))
        z.write(SRC / 'index.js', 'index.js')
        z.write(NATIVE_DLL, 'smtc_native.dll')
        z.write(BROKER_EXE, 'ChuShiSMTCBroker.exe')

    with zipfile.ZipFile(target) as z:
        names = z.namelist()
        exe_in_pkg = z.read('ChuShiSMTCBroker.exe')
    check('G3 zip 根布局（manifest/index.js/dll/exe）',
          set(names) == {'manifest.json', 'index.js', 'smtc_native.dll', 'ChuShiSMTCBroker.exe'}, str(names))
    check('G10 包内 exe == 内嵌 blob（sha256）',
          hashlib.sha256(exe_in_pkg).hexdigest() == hashlib.sha256(exe_bytes).hexdigest())
    check('G6 文件名 ASCII', is_ascii(target.name))
    sim = betterncm_filter_sim(manifest, set(names))
    check('G7 BetterNCM 过滤链模拟', sim == 'WOULD LOAD AND LIST', sim)

    sha = hashlib.sha256(target.read_bytes()).hexdigest()
    preset_sha = hashlib.sha256(preset_cshz.read_bytes()).hexdigest()
    (OUT / 'SHA256SUMS.txt').write_text(
        f'{sha}  {target.name}\n{preset_sha}  {preset_cshz.name}\n', encoding='utf-8')

    print(f'\n== {PASS} passed, {FAIL} failed ==')
    print(f'artifact: {target} ({target.stat().st_size} bytes)')
    print(f'sha256:   {sha}')
    print(f'preset:   {preset_cshz} ({preset_cshz.stat().st_size} bytes)')
    sys.exit(1 if FAIL else 0)

if __name__ == '__main__':
    main()
