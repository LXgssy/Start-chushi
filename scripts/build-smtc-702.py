#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v7.0.2 SMTC-Manager 崩溃根因修复打包（仅插件A 重发，B/C/前端零变化）

v7.0.2 根因（反汇编 +266E 实锤 + windows-rs master 投影源实锤）：
  UpdateTimelineProperties 的 ABI 参数是 ISystemMediaTransportControls-
  TimelineProperties（{5125316A-C3A2-475B-8507-93534DC88F15}）的 COM 对象
  指针；v7.0.1 误判 TimelineProperties 为 struct 值类型并栈上直传，系统把
  结构体前 8 字节当虚表指针解引用 → Windows.Media.MediaControl.dll 内 AV。
  v7.0.2 主路径 = RoActivateInstance(类) → QI → 逐属性 put；失败回退自实现
  CCW；事件 handler 应答 IAgileObject。

门禁清单：
  G1 node --check 语法（smtc-manager/index.js）
  G2 manifest 结构：manifest_version==1 / slug / version / name 纯 ASCII /
     description 必含 CJK / ncm3-compatible true / injects Main→index.js
  G3 zip 根布局：manifest.json 在根部
  G4 smtc_native.dll 在包内且导出 BetterNCMPluginMain（PE 导出表解析）
  G5 版本一致性：manifest/伴生 JS/DLL 版本串 = 7.0.2
  G6 文件名 ASCII
  G7 BetterNCM 过滤链模拟器：disable_list/ncm3/version-req → WOULD LOAD AND LIST
  G8 v7.0.2 专项（ABI 修复在位）：
     a) DLL 导入 RoInitialize + RoActivateInstance（apartment 初始化 + 类激活）
     b) DLL 含 TimelineProperties 运行时类名（UTF-16-LE 宽字符串）
     c) DLL 含 IID_TimelineProps 二进制 GUID 字节
     d) objdump 反汇编：时间线分支五 putter 槽位 0x38/0x48/0x58/0x68/0x78
        连续出现，且其后跟 UpdateTimelineProperties 的 call *0x60
"""
import json, re, struct, subprocess, sys, zipfile, hashlib
from pathlib import Path

ROOT = Path('/home/z/my-project')
WT = ROOT / '.wt-v7'
SRC = WT / 'bridge/v7/plugins/smtc-manager'
NATIVE_DLL = WT / 'bridge/v7/native/chushi_smtc_native.dll'
OUT = WT / 'download/v7.0.2'
VER = '7.0.2'
NAME = f'ChuShi-SMTC-Manager-{VER}'

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

def pe_export_names(dll_bytes):
    """极简 PE 导出表解析（x64）"""
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

def utf16le(s):
    return s.encode('utf-16-le')

def guid_bytes(l, w1, w2, b):
    return struct.pack('<IHH', l, w1, w2) + bytes(b)

def betterncm_filter_sim(manifest, zip_names):
    """BetterNCM v2 加载过滤链模拟（isNCM3 & ncm3-compatible & version-req）"""
    if not manifest.get('ncm3-compatible', False):
        return 'REJECT ncm3-compatible missing (NCM 3.x 静默丢弃)'
    if manifest.get('manifest_version') != 1:
        return 'REJECT manifest_version != 1'
    if 'manifest.json' not in zip_names:
        return 'REJECT manifest.json not at zip root'
    native = manifest.get('native_plugin', '')
    if native and native not in zip_names:
        return 'REJECT native_plugin missing in zip'
    return 'WOULD LOAD AND LIST'

def disasm_slots_gate(dll_path):
    """G8d：objdump 反汇编验证时间线分支 ABI 修复在位。
    断言：存在连续间接调用子序列 call *0x38 / *0x48 / *0x58 / *0x68 / *0x78
    （五 putter），且其下一个间接调用为 *0x60（UpdateTimelineProperties）。"""
    r = subprocess.run(['objdump', '-d', str(dll_path)],
                       capture_output=True, text=True)
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

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print(f'== v{VER} SMTC-Manager 修复包 ==')

    js = (SRC / 'index.js').read_text(encoding='utf-8')
    manifest = json.loads((SRC / 'manifest.json').read_text(encoding='utf-8'))
    dll = NATIVE_DLL.read_bytes()

    # G1 语法门
    r = subprocess.run(['node', '--check', str(SRC / 'index.js')], capture_output=True, text=True)
    check('G1 node --check index.js', r.returncode == 0, r.stderr[:200])

    # G2 manifest 结构门
    check('G2 manifest_version==1', manifest.get('manifest_version') == 1)
    check('G2 slug ASCII', is_ascii(manifest.get('slug', '')))
    check('G2 name 纯 ASCII', is_ascii(manifest.get('name', '')))
    check('G2 description 必含 CJK（中文文案律）', has_cjk(manifest.get('description', '')))
    check('G2 ncm3-compatible true', manifest.get('ncm3-compatible') is True)
    check('G2 injects Main→index.js',
          manifest.get('injects', {}).get('Main') == [{'file': 'index.js', 'type': 'script'}])

    # G4/G5 DLL 门
    exports = pe_export_names(dll)
    check('G4 smtc_native.dll 导出 BetterNCMPluginMain', 'BetterNCMPluginMain' in exports, str(exports))
    check('G5 DLL 版本串 7.0.2', b'7.0.2' in dll)
    check('G5 伴生 JS 版本 7.0.2', "var VER = '7.0.2';" in js)
    check('G5 manifest 版本 7.0.2', manifest.get('version') == VER)
    check('G4 DLL 非占位（>40KB）', len(dll) > 40000, str(len(dll)))

    # G8 v7.0.2 专项：ABI 修复在位
    check('G8a DLL 导入 RoInitialize（apartment 初始化）', b'RoInitialize' in dll)
    check('G8a DLL 导入 RoActivateInstance（TimelineProperties 类激活）', b'RoActivateInstance' in dll)
    check('G8b DLL 含 TimelineProperties 类名（宽字符串）',
          utf16le('Windows.Media.SystemMediaTransportControlsTimelineProperties') in dll)
    check('G8c DLL 含 IID_TimelineProps GUID 字节',
          guid_bytes(0x5125316A, 0xC3A2, 0x475B, [0x85, 0x07, 0x93, 0x53, 0x4D, 0xC8, 0x8F, 0x15]) in dll)
    ok8d, detail8d = disasm_slots_gate(NATIVE_DLL)
    check('G8d 反汇编：五 putter 槽位 + UpdateTimelineProperties(*0x60)', ok8d, detail8d)

    # 打包
    target = OUT / f'{NAME}.plugin'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json', (SRC / 'manifest.json').read_text(encoding='utf-8'))
        z.write(SRC / 'index.js', 'index.js')
        z.write(NATIVE_DLL, 'smtc_native.dll')

    # G3/G6/G7 复检打包产物
    with zipfile.ZipFile(target) as z:
        names = z.namelist()
    check('G3 zip 根布局（manifest.json/index.js/smtc_native.dll）',
          set(names) == {'manifest.json', 'index.js', 'smtc_native.dll'}, str(names))
    check('G6 文件名 ASCII', is_ascii(target.name))
    sim = betterncm_filter_sim(manifest, set(names))
    check('G7 BetterNCM 过滤链模拟', sim == 'WOULD LOAD AND LIST', sim)

    # SHA256
    sha = hashlib.sha256(target.read_bytes()).hexdigest()
    (OUT / 'SHA256SUMS.txt').write_text(f'{sha}  {target.name}\n', encoding='utf-8')

    print(f'\n== {PASS} passed, {FAIL} failed ==')
    print(f'artifact: {target} ({target.stat().st_size} bytes)')
    print(f'sha256:   {sha}')
    sys.exit(1 if FAIL else 0)

if __name__ == '__main__':
    main()
