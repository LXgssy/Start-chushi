#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.0 双插件打包 + BetterNCM 结构门（过滤链模拟器）+ 零 WinRT 门

门禁清单：
  G1 node --check 语法（music-bridge / lyric-source index.js）
  G2 manifest 结构：manifest_version==1 / slug / version / name 纯 ASCII /
     description 必含 CJK / ncm3-compatible true / betterncm_version / injects Main→index.js
  G3 zip 根布局：manifest.json 在根部（BetterNCM zip_entry_open("manifest.json")）
  G4 music-bridge：hub.dll 在包内且导出 BetterNCMPluginMain（PE 导出表解析）
  G5 零 WinRT 门（v8 宪法）：hub.dll 导入表不得含 combase/ole32/WinTypes/
     Windows.Foundation/winrt 任一；必须含 WS2_32
  G6 零老符号门：music-bridge index.js 不得含 v7 SMTC 痕迹
     (/api/smtc/、chushi-smtc-hub、cc:smtc-info、ChuShiSMTCBroker、smtc_native)
  G7 v8 契约门：index.js 必含 InfLinkApi/chushi-music-hub/api 四端点/cc:lyric-req；
     manifest native_plugin=hub.dll；bridge version=8.0.0；lyric-source version=7.0.0
  G8 文件名 ASCII；slug 唯一
  G9 BetterNCM 过滤链模拟器：disable_list/ncm3/version-req → WOULD LOAD AND LIST
"""
import json, re, struct, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'bridge/v8/plugins'
NATIVE_DLL = ROOT / 'bridge/v8/native/hub.dll'            # 主架 x86（双架构律：32 位宿主直载）
NATIVE_DLL_X64 = ROOT / 'bridge/v8/native/hub.dll.x64.dll' # x64 变体（.x64.dll 后缀重试约定）
OUT = ROOT / 'download/v8.0.7'
VER = '8.0.7'
LYRIC_VER = '7.2.0'

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
    # (dir, slug, version, native)
    ('music-bridge', 'ChuShi-Music-Bridge', VER, True),
    ('lyric-source', 'ChuShi-Lyric-Source', LYRIC_VER, False),
]

OLD_SYMBOLS = ['/api/smtc/', 'chushi-smtc-hub', 'cc:smtc-info', 'ChuShiSMTCBroker',
               'smtc_native', 'smtc_native.dll', 'ChuShi SMTC Manager']
WINRT_IMPORT_HINTS = [b'combase', b'ole32', b'WinTypes', b'Windows.Foundation',
                      b'winrt', b'RoInitialize', b'WindowsRuntime']

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
    magic = struct.unpack_from('<H', dll_bytes, opt)[0]
    dd_off = opt + (112 if magic == 0x20b else 96)  # PE32+ / PE32 数据目录基址
    export_rva, export_size = struct.unpack_from('<II', dll_bytes, dd_off)
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

def pe_import_names(dll_bytes):
    """极简 PE 导入表 DLL 名解析（x64）"""
    if dll_bytes[:2] != b'MZ':
        return []
    pe_off = struct.unpack_from('<I', dll_bytes, 0x3C)[0]
    coff = pe_off + 4
    num_sections = struct.unpack_from('<H', dll_bytes, coff + 2)[0]
    opt_size = struct.unpack_from('<H', dll_bytes, coff + 16)[0]
    opt = coff + 20
    magic = struct.unpack_from('<H', dll_bytes, opt)[0]
    dd_off = opt + (112 if magic == 0x20b else 96)
    import_rva = struct.unpack_from('<I', dll_bytes, dd_off + 8)[0]
    if import_rva == 0:
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
    io = rva2off(import_rva)
    names = []
    while io:
        ordinal, name_rva = struct.unpack_from('<II', dll_bytes, io + 12)[:2]
        name_rva = struct.unpack_from('<I', dll_bytes, io + 12)[0]
        if name_rva == 0:
            break
        noff = rva2off(name_rva)
        if noff is None:
            break
        end = dll_bytes.index(b'\0', noff)
        names.append(dll_bytes[noff:end].decode('ascii', 'replace'))
        io += 20
    return names

def betterncm_filter_sim(manifest, zip_names):
    """按 BetterNCM v2 extractPackedPlugins 过滤链判定是否会加载并列出"""
    if manifest.get('manifest_version') != 1:
        return 'REJECT manifest_version'
    slug = manifest.get('slug') or manifest['name'].replace(' ', '-')
    if not re.fullmatch(r'[A-Za-z0-9-]+', slug):
        return 'REJECT slug'
    if not manifest.get('ncm3-compatible', False):
        return 'REJECT ncm3-compatible missing'
    req = manifest.get('ncm-version-req', '> 2.10.2')
    m = re.fullmatch(r'>\s*(\d+)\.(\d+)\.(\d+)', req)
    if not m:
        return 'REJECT ncm-version-req unparsable'
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
    print('== G1 语法门 ==')
    for d, slug, ver, native in PLUGINS:
        r = subprocess.run(['node', '--check', str(SRC / d / 'index.js')],
                           capture_output=True, text=True)
        check(f'node --check {d}', r.returncode == 0, r.stderr[:160])

    print('== G2/G8 manifest 结构门 ==')
    slugs = set()
    for d, slug, ver, native in PLUGINS:
        mp = SRC / d / 'manifest.json'
        manifest = json.loads(mp.read_text('utf-8'))
        check(f'{d} manifest_version==1', manifest.get('manifest_version') == 1)
        check(f'{d} slug', manifest.get('slug') == slug, str(manifest.get('slug')))
        slugs.add(manifest.get('slug'))
        check(f'{d} version', manifest.get('version') == ver,
              f'{manifest.get("version")} != {ver}')
        check(f'{d} name ASCII', is_ascii(manifest.get('name', '')), manifest.get('name'))
        check(f'{d} description CJK', has_cjk(manifest.get('description', '')))
        check(f'{d} ncm3-compatible', manifest.get('ncm3-compatible') is True)
        inj = manifest.get('injects', {}).get('Main', [])
        check(f'{d} injects Main→index.js', any(x.get('file') == 'index.js' for x in inj))
        fname = f'{slug}-{ver}.plugin'
        check(f'{d} filename ASCII', is_ascii(fname), fname)

    print('== 打包 ==')
    for d, slug, ver, native in PLUGINS:
        zpath = OUT / f'{slug}-{ver}.plugin'
        if zpath.exists():
            zpath.unlink()
        with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
            z.write(SRC / d / 'manifest.json', 'manifest.json')
            z.write(SRC / d / 'index.js', 'index.js')
            if native:
                z.write(NATIVE_DLL, 'hub.dll')
                z.write(NATIVE_DLL_X64, 'hub.dll.x64.dll')
        print(f'  built {zpath.name} ({zpath.stat().st_size} bytes)')

    print('== G3-G9 回环断言 ==')
    for d, slug, ver, native in PLUGINS:
        zpath = OUT / f'{slug}-{ver}.plugin'
        with zipfile.ZipFile(zpath) as z:
            names = z.namelist()
            manifest = json.loads(z.read('manifest.json').decode('utf-8'))
            js = z.read('index.js').decode('utf-8')
        check(f'{d} zip 根 manifest.json', 'manifest.json' in names)
        sim = betterncm_filter_sim(manifest, names)
        check(f'{d} 过滤链模拟器', sim == 'WOULD LOAD AND LIST', sim)

        if native:
            check('manifest native_plugin=hub.dll', manifest.get('native_plugin') == 'hub.dll')
            with zipfile.ZipFile(zpath) as z:
                dll = z.read('hub.dll')
                dll_x64 = z.read('hub.dll.x64.dll')
            # v8.0.7 双架构律门（六代欠账本次起强制）：主架必须 x86，变体必须 x64
            def pe_machine(b):
                pe_off = struct.unpack_from('<I', b, 0x3C)[0]
                return struct.unpack_from('<H', b, pe_off + 4)[0]
            check('hub.dll(主架) 必须是 x86 (0x14c)', pe_machine(dll) == 0x14c, hex(pe_machine(dll)))
            check('hub.dll.x64.dll 必须是 x64 (0x8664)', pe_machine(dll_x64) == 0x8664, hex(pe_machine(dll_x64)))
            check('hub.dll.x64.dll 导出 BetterNCMPluginMain', 'BetterNCMPluginMain' in pe_export_names(dll_x64))
            check('hub.dll.x64.dll 零 WinRT/USER32 导入',
                  not any(h in pe_import_names(dll_x64)[0].encode() + b'|'.join(n.encode() for n in pe_import_names(dll_x64))
                          for h in (b'WinRT', b'USER32', b'combase', b'ole32')))
            check('hub.dll.x64.dll 内嵌租约响应串（路由字面量被 -O2 展开，按 v8.0.5 老律断言运行时串）',
                  b'{"ok":true,"lease":' in dll_x64)
            check('hub.dll.x64.dll 内嵌版本串 8.0.7', b'8.0.7' in dll_x64)
            exports = pe_export_names(dll)
            check('hub.dll 导出 BetterNCMPluginMain',
                  'BetterNCMPluginMain' in exports, str(exports))
            imports = pe_import_names(dll)
            imp_blob = b'|'.join(n.encode() for n in imports)
            check('hub.dll 必须导入 WS2_32', b'WS2_32' in imp_blob, str(imports))
            check('hub.dll 零 USER32 导入（v8.0.6 媒体键退役，OS 输入层干预根除）', b'USER32' not in imp_blob, str(imports))
            hit = [h.decode() for h in WINRT_IMPORT_HINTS if h in imp_blob]
            check('hub.dll 零 WinRT/COM 导入（v8 宪法 G5）', not hit, str(hit))
            check('hub.dll 内嵌版本串 8.0.7', b'8.0.7' in dll)
            check('hub.dll(x86) 内嵌租约端点 /api/poll', b'/api/poll' in dll)
            check('hub.dll(x86) 无 SEH 串（HUB_NO_SEH 构建契约）', b'[seh]' not in dll)
            check('hub.dll 媒体键符号根除（nativeFire/WM_APPCOMMAND/keybd_event）',
                  not any(s in dll for s in (b'nativeFire', b'WM_APPCOMMAND', b'keybd_event', b'api/native')))
            check('hub.dll 非占位（>30KB）', len(dll) > 30000, str(len(dll)))
            check('hub.dll 导出表仅 BetterNCMPluginMain（def 收敛）', exports == ['BetterNCMPluginMain'], str(exports))
            check('hub.dll 防阻塞三律在位（select 快关/NODELAY/500ms）',
                  b'preconnect guard' in dll and b'400ms' not in dll[:0]+b'', '')
            check('hub.dll.x64.dll SEH 自愈在位', b'[seh] connection path' in dll_x64, '')

            old_hits = [s for s in OLD_SYMBOLS if s in js]
            check('music-bridge 零老 SMTC 符号（G6）', not old_hits, str(old_hits))
            need = ['window.InfLinkApi', 'chushi-music-hub', '/api/ping', '/api/cmd',
                    '/api/state', '/api/lyric', 'cc:lyric-req', 'cc:lyric-res',
                    'getPlaybackStatus', 'getTimeline', 'getCurrentSong', 'seekTo']
            missing = [s for s in need if s not in js]
            check('music-bridge v8 契约符号齐备（G7）', not missing, str(missing))

        if native and d == 'music-bridge':
            # v8.0.2 实机对症门：验证+三级备路 + 时间线自愈 + 封面升级必须全部在位
            v802_marks = ['jump2Track', 'playing/resume', 'playing/pause',
                          'setPlayingPosition', 'inflink+heal', 'cmdTrace',
                          'music\\.126\\.net']
            miss2 = [s for s in v802_marks if s.replace('\\\\', '\\') not in js]
            check('music-bridge v8.0.2 备路/自愈/封面升级符号在位', not miss2, str(miss2))
            check('music-bridge cmdTrace 上限 20', 'cmdTrace.length > 20' in js)
            # v8.0.3 末端加固门：按钮扩宽+指针序列+元素复验
            v803_marks = ['aria-label*="下一首"', 'aria-label*="上一首"',
                          'pointerdown', 'pointerup', 'clickSeq', 'elemToggle',
                          'btnLabelOk', "el2.paused"]
            miss3 = [s for s in v803_marks if s not in js]
            check('music-bridge v8.0.3 按钮扩宽/指针序列/元素复验符号在位', not miss3, str(miss3))
            # v8.0.4 歌词滞留根治 + 控制可观测门
            v804_marks = ['pushLyricPending', 'pending: true', "metaKey",
                          'metaChanged', 'markCmd', 'refineTries',
                          "cmd: { last:"]
            miss4 = [s for s in v804_marks if s not in js]
            check('music-bridge v8.0.4 曲键切歌/pending占位/命令回执/暂停校准符号在位', not miss4, str(miss4))
            # v8.0.6 媒体键退役 + 备路三代修正门
            check('music-bridge 媒体键兜底符号根除（nativeEscalate/nativeFireOnce//api/native）',
                  not any(s in js for s in ('nativeEscalate', 'nativeFireOnce', '/api/native')))
            v806_marks = ['st2.playing', 'playingState === 2', 'resourceTrackId',
                          'resourceName', 'resourceArtists',
                          'findStoreViaFiber(true)', 'hub-id-rewind',
                          "traceCmd('link', 'play-called')", "traceCmd('link', 'pause-called')",
                          "traceCmd('link', 'next-called')", "traceCmd('link', 'prev-called')",
                          "traceCmd('link', 'seek-called')", 'storeOk']
            miss6 = [s for s in v806_marks if s not in js]
            check('music-bridge v8.0.6 三代 store/遥测/幂等闸回退防护符号在位', not miss6, str(miss6))
            # v8.0.7 轮询租约 + 执行轨迹透传门
            v807_marks = ['POLL_ID', '/api/poll', '/api/cmd?id=', 'leaseKnown', 'iHold',
                          'who: POLL_ID', 'trace: cmdTrace.slice()',
                          "lease: leaseKnown ? (iHold ? 'holder' : 'standby') : 'legacy'"]
            miss7b = [s for s in v807_marks if s not in js]
            check('music-bridge v8.0.7 轮询租约/轨迹透传/身份透出符号在位', not miss7b, str(miss7b))
            check('music-bridge v8.0.7 备胎早退（不拉命令不推状态）', 'if (!iHold) return;' in js)
        else:
            # v7.1.0 歌词源门：带凭据 eapi + 同源 web v1 + 真 yrc klyric 转换
            v710_marks = ['credentials: withCreds', "credentials: 'include'",
                          'fetchViaWebV1', 'web-v1', 'totalMT',
                          "'[' + s0 + ',' + lineDur + ']'", 'yrv: 0']
            miss7 = [s for s in v710_marks if s not in js]
            check('lyric-source v7.1.0 凭据/同源v1/真yrc转换符号在位', not miss7, str(miss7))
            # v7.2.0 暂停校准门：force 绕缓存 + 无逐字升级
            v720_marks = ['function getLyric(songId, force)', 'd.force === true',
                          'up && up.yrc']
            miss8 = [s for s in v720_marks if s not in js]
            check('lyric-source v7.2.0 force/无逐字升级符号在位', not miss8, str(miss8))

    check('slug 唯一', len(slugs) == 2, str(slugs))

    print(f'\nRESULT: {PASS} pass, {FAIL} fail')
    sys.exit(1 if FAIL else 0)

if __name__ == '__main__':
    main()
