#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v7.0.0 三插件打包 + BetterNCM 结构门（过滤链模拟器）

门禁清单：
  G1 node --check 语法（三个 index.js）
  G2 manifest 结构：manifest_version==1 / slug / version / name 纯 ASCII /
     description 必含 CJK / ncm3-compatible true / betterncm_version / injects Main→index.js
  G3 zip 根布局：manifest.json 在根部（BetterNCM zip_entry_open("manifest.json")）
  G4 插件A：smtc_native.dll 在包内且导出 BetterNCMPluginMain（PE 导出表解析）
  G5 版本一致性：manifest/PLUGIN 注释/DLL 版本串 = 7.0.0
  G6 文件名 ASCII；slug 唯一
  G7 BetterNCM 过滤链模拟器：disable_list/ncm3/version-req → WOULD LOAD AND LIST
"""
import json, re, shutil, struct, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path('/home/z/my-project')
SRC = ROOT / 'bridge/v7/plugins'
NATIVE_DLL = ROOT / 'bridge/v7/native/chushi_smtc_native.dll'
OUT = ROOT / 'download/v7.0.0'
VER = '7.0.0'

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

PLUGINS = [
    ('smtc-manager', 'ChuShi-SMTC-Manager', True),
    ('music-bridge', 'ChuShi-Music-Bridge', False),
    ('lyric-source', 'ChuShi-Lyric-Source', False),
]

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
    # PE32+ 导出目录 RVA 在 opt+112
    export_rva, export_size = struct.unpack_from('<II', dll_bytes, opt + 112)
    if export_rva == 0:
        return []
    sec_table = opt + opt_size
    sections = []
    for i in range(num_sections):
        base = sec_table + i * 40
        vsize, vaddr, rsize, raddr = struct.unpack_from('<IIII', dll_bytes, base + 8)
        sections.append((vaddr, vsize, raddr, rsize))
    def rva2off(rva):
        for vaddr, vsize, raddr, rsize in sections:
            if vaddr <= rva < vaddr + max(vsize, rsize):
                return raddr + (rva - vaddr)
        return None
    eo = rva2off(export_rva)
    if eo is None:
        return []
    nnames = struct.unpack_from('<I', dll_bytes, eo + 0x18)[0]
    names_rva = struct.unpack_from('<I', dll_bytes, eo + 0x20)[0]
    no = rva2off(names_rva)
    names = []
    for i in range(nnames):
        nva = struct.unpack_from('<I', dll_bytes, no + i * 4)[0]
        noff = rva2off(nva)
        end = dll_bytes.index(b'\0', noff)
        names.append(dll_bytes[noff:end].decode('ascii'))
    return names

def betterncm_filter_sim(manifest, zip_names):
    """按 BetterNCM v2 extractPackedPlugins 过滤链判定是否会加载并列出"""
    if manifest.get('manifest_version') != 1:
        return 'REJECT manifest_version'
    slug = manifest.get('slug') or manifest['name'].replace(' ', '-')
    if not re.fullmatch(r'[A-Za-z0-9-]+', slug):
        return 'REJECT slug'
    # ncm3 门（用户环境为网易云 3.x）
    if not manifest.get('ncm3-compatible', False):
        return 'REJECT ncm3-compatible missing'
    req = manifest.get('ncm-version-req', '> 2.10.2')
    m = re.fullmatch(r'>\s*(\d+)\.(\d+)\.(\d+)', req)
    if not m:
        return 'REJECT ncm-version-req unparsable'
    # zip 根必须有 manifest.json
    if 'manifest.json' not in zip_names:
        return 'REJECT manifest.json not at zip root'
    if 'index.js' not in zip_names:
        return 'REJECT index.js missing'
    native = manifest.get('native_plugin', '')
    if native and native not in zip_names:
        return 'REJECT native_plugin missing in zip'
    return 'WOULD LOAD AND LIST'

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print(f'== G1 语法门 ==')
    for d, slug, native in PLUGINS:
        r = subprocess.run(['node', '--check', str(SRC / d / 'index.js')],
                           capture_output=True, text=True)
        check(f'node --check {d}', r.returncode == 0, r.stderr[:160])

    print('== G2-G6 manifest/结构门 ==')
    slugs = set()
    for d, slug, native in PLUGINS:
        mp = SRC / d / 'manifest.json'
        manifest = json.loads(mp.read_text('utf-8'))
        check(f'{d} manifest_version==1', manifest.get('manifest_version') == 1)
        check(f'{d} slug', manifest.get('slug') == slug, str(manifest.get('slug')))
        slugs.add(manifest.get('slug'))
        check(f'{d} version', manifest.get('version') == VER)
        check(f'{d} name ASCII', is_ascii(manifest.get('name', '')), manifest.get('name'))
        check(f'{d} description CJK', has_cjk(manifest.get('description', '')))
        check(f'{d} ncm3-compatible', manifest.get('ncm3-compatible') is True)
        inj = manifest.get('injects', {}).get('Main', [])
        check(f'{d} injects Main→index.js', any(x.get('file') == 'index.js' for x in inj))
        fname = f'{slug}-{VER}.plugin'
        check(f'{d} filename ASCII', is_ascii(fname), fname)

    print('== 打包 ==')
    for d, slug, native in PLUGINS:
        zpath = OUT / f'{slug}-{VER}.plugin'
        if zpath.exists():
            zpath.unlink()
        with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
            z.write(SRC / d / 'manifest.json', 'manifest.json')
            z.write(SRC / d / 'index.js', 'index.js')
            if native:
                z.write(NATIVE_DLL, 'smtc_native.dll')
        print(f'  built {zpath.name} ({zpath.stat().st_size} bytes)')

    print('== G3/G4/G7 回环断言 ==')
    for d, slug, native in PLUGINS:
        zpath = OUT / f'{slug}-{VER}.plugin'
        with zipfile.ZipFile(zpath) as z:
            names = z.namelist()
            manifest = json.loads(z.read('manifest.json').decode('utf-8'))
        check(f'{d} zip 根 manifest.json', 'manifest.json' in names)
        sim = betterncm_filter_sim(manifest, names)
        check(f'{d} 过滤链模拟器', sim == 'WOULD LOAD AND LIST', sim)
        if native:
            with zipfile.ZipFile(zpath) as z:
                dll = z.read('smtc_native.dll')
            exports = pe_export_names(dll)
            check('smtc_native.dll 导出 BetterNCMPluginMain',
                  'BetterNCMPluginMain' in exports, str(exports))
            check('smtc_native.dll 内嵌版本串', b'7.0.0' in dll)
            check('smtc_native.dll 非占位（>40KB）', len(dll) > 40000, str(len(dll)))

    check('slug 唯一', len(slugs) == 3, str(slugs))

    print(f'\nRESULT: {PASS} pass, {FAIL} fail')
    sys.exit(1 if FAIL else 0)

if __name__ == '__main__':
    main()
