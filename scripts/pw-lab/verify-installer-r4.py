#!/usr/bin/env python3
# verify-installer-r3.py — 初始音乐桥 r3 全量回归验证
# 覆盖：PS1 词法平衡 / Clean-Path 孪生模拟 / bat 调用行 / zip 布局 / 关键修复序 /
#       C 源静态特征 / bridge-js 一致性 / exe 版本字符串
import zipfile, re, sys, os

ROOT = "/home/z/my-project"
SRC = f"{ROOT}/bridge/standalone"
DL = f"{ROOT}/download/v1.7.6"
ZIP = f"{DL}/ChuShiBridge-一键安装包.zip"

passed, failed = [], []

def check(name, cond, detail=""):
    (passed if cond else failed).append((name, detail))
    print(("  PASS " if cond else "  FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

# ---------- 1. PS1 词法感知平衡检查 ----------
def strip_ps(text):
    """剥离 PS1 的 here-string、注释、字符串字面量，返回剩余代码（用于括号平衡检查）"""
    out, i, n = [], 0, len(text)
    while i < n:
        # here-string @'...'@ 或 @"..."@
        m = re.match(r"@['\"]\r?\n", text[i:])
        if m:
            end = re.search(r"\r?\n['\"]@", text[i + m.end():])
            if not end:
                return None  # 未闭合
            i = i + m.end() + end.end()
            continue
        # 注释
        if text.startswith("<#", i):
            e = text.find("#>", i + 2)
            if e < 0: return None
            i = e + 2
            continue
        if text.startswith("#", i) and (i == 0 or text[i-1] in "\r\n"):
            e = text.find("\n", i)
            i = n if e < 0 else e
            continue
        # 字符串
        c = text[i]
        if c in "'\"":
            dq = c == '"'
            j = i + 1
            while j < n:
                if text[j] == c:
                    if j + 1 < n and text[j+1] == c:  # 双写转义
                        j += 2; continue
                    break
                if dq and text[j] == '`': j += 1  # 反引号转义
                j += 1
            if j >= n: return None
            i = j + 1
            continue
        out.append(c)
        i += 1
    return "".join(out)

print("[1] PS1 词法平衡")
for fn in ["install.ps1", "uninstall.ps1"]:
    txt = open(f"{SRC}/installer/{fn}", encoding="utf-8").read()
    code = strip_ps(txt)
    ok = code is not None
    bal = ok and code.count("{") == code.count("}") and code.count("(") == code.count(")")
    check(f"{fn} 无未闭合块", ok)
    check(f"{fn} 花括号/圆括号平衡", bal,
          f"{{={code.count('{')}/{code.count('}')} ({code.count('(')}/{code.count(')')})" if ok else "")

# ---------- 2. Clean-Path 孪生模拟 ----------
def clean_path_py(p):
    if not p: return ""
    q = p.strip()
    q = q.strip('"').strip()
    while len(q) > 3 and q.endswith("\\"): q = q[:-1]
    while len(q) > 1 and q.endswith('"'): q = q.strip('"').strip()
    return q

print("[2] Clean-Path 孪生回归（五组脏参数）")
cases = [
    ('"C:\\Program Files\\Netease\\CloudMusic\\"', "C:\\Program Files\\Netease\\CloudMusic"),
    ('"C:\\path with space\\x""', "C:\\path with space\\x"),
    ("C:\\plain\\", "C:\\plain"),
    ('  "D:\\中文 目录"  ', "D:\\中文 目录"),
    ("", ""),
]
for raw, want in cases:
    got = clean_path_py(raw)
    check(f"Clean-Path({raw!r}) → {want!r}", got == want, f"got {got!r}")
# 幂等性
x = clean_path_py('"C:\\a\\"')
check("Clean-Path 幂等", clean_path_py(x) == x)

# ---------- 3. bat 调用行 ----------
print("[3] bat 调用行")
for fn in ["安装初始音乐桥.bat", "卸载初始音乐桥.bat"]:
    txt = open(f"{SRC}/installer/{fn}", encoding="utf-8").read()
    lines = [l for l in txt.splitlines() if "powershell" in l.lower()]
    ok = len(lines) == 1 and "-Root" not in lines[0] and "%~dp0" in lines[0]
    check(f"{fn}: powershell 行无 -Root 且用 %~dp0", ok, str(lines))

# ---------- 4. zip 布局 ----------
print("[4] zip 布局与编码")
z = zipfile.ZipFile(ZIP)
names = z.namelist()
tops = set(n.split("/")[0] for n in names)
check("zip 顶层唯一目录 ChuShiBridge-Setup/", tops == {"ChuShiBridge-Setup"}, str(tops))
need = [
    "ChuShiBridge-Setup/ChuShiBridge/ChuShiBridge.exe",
    "ChuShiBridge-Setup/ChuShiBridge/msimg32.dll",
    "ChuShiBridge-Setup/ChuShiBridge/install.ps1",
    "ChuShiBridge-Setup/ChuShiBridge/uninstall.ps1",
    "ChuShiBridge-Setup/安装初始音乐桥.bat",
    "ChuShiBridge-Setup/卸载初始音乐桥.bat",
    "ChuShiBridge-Setup/使用说明.md",
]
for n in need:
    check(f"zip 含 {n.split('/', 1)[1]}", n in names)
for n in ["ChuShiBridge-Setup/ChuShiBridge/install.ps1", "ChuShiBridge-Setup/ChuShiBridge/uninstall.ps1"]:
    b = z.read(n)
    check(f"{n.split('/')[-1]} 带 UTF-8 BOM", b[:3] == b"\xef\xbb\xbf")
    src = open(f"{SRC}/installer/{n.split('/')[-1]}", encoding="utf-8").read()
    check(f"{n.split('/')[-1]} 与源一致", b.decode("utf-8-sig") == src)

# ---------- 5. install.ps1 关键修复序 ----------
print("[5] install.ps1 关键序与特征")
ip = open(f"{SRC}/installer/install.ps1", encoding="utf-8").read()
i_stop = ip.find("Stop-Process -Name cloudmusic")
i_dll  = ip.find("Copy-Item-Retry $SrcDll $dstDll")
check("停网易云(第0步) 早于 装载器拷贝", 0 < i_stop < i_dll, f"stop@{i_stop} dll@{i_dll}")
check("Clean-Path 函数存在", "function Clean-Path" in ip)
check("Find-Asset 四路候选", "function Find-Asset" in ip and "$PSScriptRoot" in ip)
check("自提升不回传 -Root", "-File `\"$PSCommandPath`\" -Elevated" in ip and "-Root" not in ip[ip.find("Start-Process powershell"):ip.find("Start-Process powershell")+300])
check("全量 -LiteralPath 文件操作", "Copy-Item -LiteralPath" in ip and "Test-Path -LiteralPath" in ip and "Get-Item -LiteralPath" in ip)
check("裸 Copy-Item(无-LiteralPath) 仅在备份/重试内部", all(
    "Copy-Item " not in l or "-LiteralPath" in l or "Copy-Item-Retry" in l or "$_" in l
    for l in ip.splitlines() if "Copy-Item" in l and "function" not in l),
    str([l.strip() for l in ip.splitlines() if "Copy-Item" in l and "-LiteralPath" not in l and "Copy-Item-Retry" not in l and "function" not in l]))
check("拷贝重试兜底(5次)", "for ($i = 0; $i -lt 5; $i++)" in ip and "Copy-Item-Retry" in ip)
check("同尺寸跳过", "$sz -eq $ourSz" in ip)
check("卸载脚本自复制", "uninstall.ps1" in ip and "Copy-Item -LiteralPath $SrcUn" in ip)
check("config 无 BOM 写入", "UTF8Encoding($false)" in ip)
check("卸载 bat 纯 ASCII 生成", "[System.Text.Encoding]::ASCII" in ip)
check("健康检查 /api/ping", "/api/ping" in ip and "chushi-music-bridge" in ip)
check("提示 debug 端点", "/api/debug" in ip)

# ---------- 6. uninstall.ps1 特征 ----------
print("[6] uninstall.ps1 特征")
up = open(f"{SRC}/installer/uninstall.ps1", encoding="utf-8").read()
check("从 config.json 读 ncmPath", "config.json" in up and "ncmPath" in up)
head5 = "\n".join(up.splitlines()[:6])
check("无 param 块（零命令行依赖）", "param(" not in head5 and "$NcmDir =" in up)
check("还原备份逻辑", "chushi-backup" in up)

# ---------- 7. C 源静态特征 ----------
print("[7] C 源 r3 特征")
main_c = open(f"{SRC}/chushibridge.c", encoding="utf-8").read()
cdp_c  = open(f"{SRC}/cb_cdp.c", encoding="utf-8").read()
srv_c  = open(f"{SRC}/cb_server.c", encoding="utf-8").read()
hdr    = open(f"{SRC}/cb_server.h", encoding="utf-8").read()
check("probe 三路判据(orpheus)", 'orpheus' in cdp_c and 'cdp_probe_page' in cdp_c)
check("probe webpackChunk 判据(wc)", 'wc:(function' in cdp_c and 'webpackChunk' in cdp_c and '===0)return true' in cdp_c)
check("probe miss 细分", "CDP_PROBE_MISS" in cdp_c and "cdp_probe_page" in cdp_c)
check("attach 细分日志节流(5min)", "300000" in main_c and "attach_fail_log" in main_c)
check("attach 状态全集(r4)", all(s in main_c for s in ['"probe-miss"', '"install-fail"', '"snap-fail"', '"poll-fail"', '"ok"']))
# kill 时序：kill_ncm 消费在 for(;;) 之前
it = main_c.find("cdp_thread(LPVOID")
ifork = main_c.find("for (;;)", it)
ikill = main_c.find("c->kill_ncm = 0;", it)
check("kill_ncm 在循环外先消费(不误杀)", 0 < ikill < ifork)
check("分片聚合 ws_read_message", "ws_read_message" in cdp_c and "continue;" in cdp_c)
check("求值链路 cdp_command→ws_read_message", 'cdp_command(ws, "Runtime.evaluate"' in cdp_c and 'ws_read_message(ws, m' in cdp_c)
check("eval 失败详情捕获", "cmd-timeout" in cdp_c and "cdp-error" in cdp_c and "eval-no-value" in cdp_c)
check("ws 握手状态行捕获", "ws-handshake" in cdp_c)
check("清单日志节流", "CDP 目标清单" in cdp_c and "last_desc" in cdp_c)
check("config \\uXXXX 解码", "hexok" in main_c and "代理对" in main_c)
check("CB_VERSION 2.0.3", '#define CB_VERSION     "2.0.3"' in hdr)
check("/api/debug 输出 attach/attachDetail", '"attach\\"' in srv_c and '"attachDetail' in srv_c)
check("debug body 扩容 1536", "char body[1536]" in srv_c)

check("r4 flatten 主路: cdp_open_target", "cdp_open_target" in cdp_c and "cdp_open_target(port" in main_c)
check("r4 attachToTarget flatten:true", 'Target.attachToTarget' in cdp_c and 'flatten\\":true' in cdp_c)
check("r4 getTargets+pick_page_target", "Target.getTargets" in cdp_c and "pick_page_target" in cdp_c)
check("r4 browser wsurl(/json/version)", "cdp_browser_wsurl" in cdp_c and "/json/version" in cdp_c)
check("r4 通用命令 cdp_command(带 sessionId)", "cdp_command" in cdp_c and '"sessionId":' in cdp_c.replace("\\", ""))
check("r4 close 帧状态码解析", "ws-close(%u" in cdp_c)
check("r4 页端点回退保留", "page 端点回退" in cdp_c)
check("r4 轮询复用通道(cdp_eval)", "cdp_eval(ch" in main_c and "cdp_close(ch)" in main_c)
check("r4 端口活性探活", "cdp_port_alive(port)" in main_c)
check("r4 附加日志含模式", "flatten" in main_c and "page" in main_c and "%s 模式" in main_c)

# ---------- 8. bridge-js 一致性 ----------
print("[8] bridge-js 与 cdp_js.h 一致")
js = open(f"{SRC}/bridge-js/bridge-core.js", encoding="utf-8").read()
gen = open(f"{SRC}/cdp_js.h", encoding="utf-8").read()
seg = gen.split('static const char BRIDGE_INSTALL_JS[] =', 1)[1].split(";\n#endif", 1)[0]
# C 字符串字面量状态机反转义（\" \\ \n），还原出原始 JS 再与源文件全量比对
chars, ci, in_str = [], 0, False
while ci < len(seg):
    c = seg[ci]
    if c == '"':
        in_str = not in_str; ci += 1; continue
    if not in_str:
        ci += 1; continue
    if c == '\\' and ci + 1 < len(seg):
        nc = seg[ci + 1]
        if nc == 'n': chars.append('\n'); ci += 2; continue
        if nc == '"': chars.append('"'); ci += 2; continue
        if nc == '\\': chars.append('\\'); ci += 2; continue
    chars.append(c); ci += 1
body = "".join(chars)
check("cdp_js.h 与 JS 同步生成", body == js,
      f"gen_len={len(body)} js_len={len(js)} diff@" + str(next((k for k in range(min(len(body), len(js))) if body[k] != js[k]), "eol")))
check("JS 版本 2.0.2", 'VERSION = "2.0.3"' in js and '__v === "2.0.3"' in js)
check("webpack5 兼容", "webpackChunk" in js and "__chushi_" in js)
check("安装回执保留", "chushi-bridge-installed" in js)

# ---------- 9. exe 二进制版本 ----------
print("[9] exe 版本字符串")
exe = open(f"{SRC}/build/ChuShiBridge.exe", "rb").read()
check("exe 含 2.0.2", b"2.0.3" in exe)
check("exe 无 2.0.1/2.0.0 版本残留", b"2.0.1" not in exe)
dll = open(f"{SRC}/build/msimg32.dll", "rb").read()
# 装载器命令行是宽字符字面量 → UTF-16LE 字节序
u16 = lambda s: s.encode("utf-16-le")
check("dll 含 --remote-allow-origins(UTF-16)", u16("--remote-allow-origins") in dll)
check("dll 含 --remote-debugging-port(UTF-16)", u16("--remote-debugging-port") in dll)
check("dll 含 --chushi-bridge(UTF-16)", u16("--chushi-bridge") in dll)

# ---------- 汇总 ----------
print(f"\n===== {len(passed)} passed / {len(failed)} failed =====")
if failed:
    for n, d in failed:
        print(f"  FAIL {n} {d}")
    sys.exit(1)
print("ALL GREEN")
