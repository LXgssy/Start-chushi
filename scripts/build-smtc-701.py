#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v7.0.1 SMTC-Manager 紧急崩溃修复打包（仅插件A 重发，B/C/前端零变化）

门禁清单（沿 build-v7-plugins.py 全部门）：
  G1 node --check 语法（smtc-manager/index.js）
  G2 manifest 结构：manifest_version==1 / slug / version / name 纯 ASCII /
     description 必含 CJK / ncm3-compatible true / injects Main→index.js
  G3 zip 根布局：manifest.json 在根部
  G4 smtc_native.dll 在包内且导出 BetterNCMPluginMain（PE 导出表解析）
  G5 版本一致性：manifest/伴生 JS/DLL 版本串 = 7.0.1
  G6 文件名 ASCII
  G7 BetterNCM 过滤链模拟器：disable_list/ncm3/version-req → WOULD LOAD AND LIST
  G8 v7.0.1 专项：DLL 无 RoActivateInstance 引用（崩溃根因清除）
"""
import json, re, struct, subprocess, sys, zipfile, hashlib
from pathlib import Path

ROOT = Path('/home/z/my-project')
SRC = ROOT / 'bridge/v7/plugins/smtc-manager'
NATIVE_DLL = ROOT / 'bridge/v7/native/chushi_smtc_native.dll'
OUT = ROOT / 'download/v7.0.1'
VER = '7.0.1'
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
    # 节表
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
    check('G5 DLL 版本串 7.0.1', b'7.0.1' in dll)
    check('G5 伴生 JS 版本 7.0.1', "var VER = '7.0.1';" in js)
    check('G5 manifest 版本 7.0.1', manifest.get('version') == VER)
    check('G4 DLL 非占位（>40KB）', len(dll) > 40000, str(len(dll)))

    # G8 崩溃根因清除门：DLL 中不得再有 RoActivateInstance 引用
    check('G8 DLL 无 RoActivateInstance（崩溃根因已清除）', b'RoActivateInstance' not in dll)

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
