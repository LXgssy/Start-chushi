#!/usr/bin/env python3
# verify-plugin.py — 初始音乐桥 BetterNCM 插件 1.2.0 回归验证
# 覆盖：manifest / index.js 特征 / bridge.c 特征 / bridge.dll 二进制 /
#       .plugin 官方包布局（根部平铺）/ dev zip 布局 / 安装器 / 合并交付包
import zipfile, re, sys, os, hashlib

ROOT = "/home/z/my-project"
SRC = f"{ROOT}/bridge/plugin"
NATIVE = f"{ROOT}/bridge/native"
DL = f"{ROOT}/download/v1.7.6"
VER = "1.2.0"
ZIP = f"{DL}/初始音乐桥-插件-{VER}.zip"
PLUGIN = f"{DL}/ChuShi-MusicBridge-{VER}.plugin"
INSTALLER = f"{DL}/betterncm_installer.exe"
MERGED = f"{DL}/ChuShi-音乐桥-BetterNCM-交付包.zip"

passed, failed = [], []
u16 = lambda s: s.encode("utf-16-le")

def check(name, cond, detail=""):
    (passed if cond else failed).append((name, detail))
    print(("  PASS " if cond else "  FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

# ---------- 1. manifest ----------
print("[1] manifest.json")
import json
m = json.load(open(f"{SRC}/manifest.json", encoding="utf-8"))
check("版本 1.2.0", m["version"] == VER)
check("manifest_version=1", m.get("manifest_version") == 1)
check("native_plugin=bridge.dll", m.get("native_plugin") == "bridge.dll")
check("injects Main=index.js（v2 唯一消费链）", m["injects"]["Main"][0]["file"] == "index.js")
check("不声明 startup_script（防 C++/JS 双通道双重执行）", "startup_script" not in m)
check("ncm3-compatible=true（NCM3 装载门）", m.get("ncm3-compatible") is True)
check("ncm-version-req > 2.10.2", m.get("ncm-version-req") == "> 2.10.2")
check("slug ASCII（plugins_runtime 目录名）", m["slug"].encode("ascii", "strict").decode() == m["slug"])
check("slug=cc.chushi.musicbridge", m["slug"] == "cc.chushi.musicbridge")

# ---------- 2. index.js 特征 ----------
print("[2] index.js 特征")
js = open(f"{SRC}/index.js", encoding="utf-8").read()
check("版本 1.2.0", f'BRIDGE_VERSION = "{VER}"' in js)
check("幂等护栏(防二次注入)", "if (window.__chushiMusicBridgeActive) return;" in js)
check("webpack5 兼容(webpackChunk 扫描)", 'k.indexOf("webpackChunk") === 0' in js)
check("webpack4 保留(webpackJsonp)", "webpackJsonp" in js and 'gp.push([[id], chunk, [[id]]])' in js)
check("webpack5 工厂双参捕获(r0/r1)", "function (r0, r1)" in js)
check("diag 落盘 pushDiag", "async function pushDiag" in js and 'writeTextAtomic("diag.json", d)' in js)
check("diag 含三源与 href", all(k in js for k in ["storeReady", "eventsHooked", "getPlayingSong", 'href: String']))
check("eventsOk 标志置位", "eventsOk = true" in js)
check("diag 心跳 10s", "setInterval(() => { pushDiag().catch(() => {}); }, 10000)" in js)
check("状态原子写通用化 writeTextAtomic", "async function writeTextAtomic(file, json)" in js)
check("控制命令集完整", all(a in js for a in ['"play"', '"pause"', '"toggle"', '"next"', '"prev"', '"seek"', '"volume"', '"mute"']))
check("配置面保留", "plugin.onConfig" in js)
check("JS 语法平衡", js.count("{") == js.count("}") and js.count("(") == js.count(")"))

# ---------- 3. bridge.c 特征 ----------
print("[3] bridge.c 特征")
c = open(f"{NATIVE}/bridge.c", encoding="utf-8").read()
check("版本 1.2.0", f'#define BRIDGE_VERSION   "{VER}"' in c)
check("DIAG_FILE 定义", '#define DIAG_FILE        L"diag.json"' in c)
check("g_diag_path 构建", "g_diag_path" in c and "swprintf_s(g_diag_path" in c)
check("/api/debug 路由", 'strcmp(req.path, "/api/debug") == 0' in c)
check("debug: diag.json 透传(括号快检)", "diag[dlen - 1] == '}'" in c and "diag[0] == '{'" in c)
check("debug: stateFile/stateAgeMs", '\\"stateFile\\":%s,\\"stateAgeMs\\":%llu,\\"diag\\":%s' in c and "state_age_ms" in c)
check("debug: 兜底全 false 段", '\\"storeReady\\":false' in c)
check("PNA 预检头", "Access-Control-Allow-Private-Network: true" in c)
check("Origin 白名单保留", "origin_allowed" in c and "chrome-extension://" in c)
check("回环绑定保留", "INADDR_LOOPBACK" in c)
check("命令文件原子写保留", "MoveFileExW" in c and "MOVEFILE_REPLACE_EXISTING" in c)

# ---------- 4. bridge.dll 二进制 ----------
print("[4] bridge.dll 二进制")
dll = open(f"{NATIVE}/bridge.dll", "rb").read()
check("PE x86-64 (MZ+PE)", dll[:2] == b"MZ" and b"PE\x00\x00" in dll[:0x400])
check("含 1.2.0 版本串", VER.encode() in dll)
check("无 1.1.0 版本串残留", b'"1.1.0"' not in dll)
# 注：LLVM 会把 strcmp(x,"字面量")==0 折叠为立即数比较，路由串不入 .rdata ——
# 改验不会被折叠的响应格式串；路由本身由 bridge.c 源码断言覆盖
check("含 debug 响应格式串(stateAgeMs)", b"stateAgeMs" in dll)
check("含 PNA 头", b"Access-Control-Allow-Private-Network" in dll)
check("含互斥体单例(UTF-16)", u16("Local\\ChuShiMusicBridgeServer") in dll)
check("含 diag.json(UTF-16)", u16("diag.json") in dll)
check("含回环标记 fmt 串", b"bridge.dll" in dll)
pd = open(f"{SRC}/bridge.dll", "rb").read()
check("plugin/ 与 native/ DLL 一致", hashlib.sha256(dll).hexdigest() == hashlib.sha256(pd).hexdigest())

# ---------- 5. .plugin 官方安装包布局（核心新增） ----------
print("[5] .plugin 官方包（zip 根部平铺，放 C:\\betterncm\\plugins\\）")
zp = zipfile.ZipFile(PLUGIN)
pn = zp.namelist()
check("条目平铺无目录前缀", all("/" not in n for n in pn), str(pn))
check("条目全 ASCII（BetterNCM zip 库直读）", all(n.encode("ascii", "strict") for n in pn))
check("根部含 manifest.json（extractPlugin 直读条目名）", "manifest.json" in pn)
check("根部含 index.js", "index.js" in pn)
check("根部含 bridge.dll", "bridge.dll" in pn)
check("根部含 README.txt", "README.txt" in pn)
pm = json.loads(zp.read("manifest.json").decode("utf-8"))
check("包内 manifest 版本 1.2.0", pm["version"] == VER)
check("包内 injects.Main 指向 index.js", pm["injects"]["Main"][0]["file"] == "index.js")
check("包内 ncm3-compatible=true", pm.get("ncm3-compatible") is True)
check("包内 DLL 与源一致", hashlib.sha256(zp.read("bridge.dll")).hexdigest() == hashlib.sha256(dll).hexdigest())
check("包内 JS 与源一致", zp.read("index.js").decode("utf-8") == js)
check("包内 README 含 .plugin.path.meta 说明", b".plugin.path.meta" in zp.read("README.txt"))
# 与官方 PluginMarket.plugin 同构性比对（v2 内置资源包）
ref = f"{ROOT}/.pkgtmp/chromatic-v2/resource/PluginMarket.plugin"
if os.path.exists(ref):
    rn = zipfile.ZipFile(ref).namelist()
    check("与官方 PluginMarket.plugin 同构(manifest.json 在根部)", "manifest.json" in rn and rn == ["main.js", "manifest.json"], str(rn))

# ---------- 6. dev zip 布局（plugins_dev 路线） ----------
print("[6] dev zip（顶层 初始音乐桥/）")
z = zipfile.ZipFile(ZIP)
names = z.namelist()
tops = set(n.split("/")[0] for n in names)
check("顶层唯一目录 初始音乐桥/", tops == {"初始音乐桥"}, str(tops))
for n in ["manifest.json", "index.js", "bridge.dll", "安装说明.txt"]:
    check(f"zip 含 {n}", f"初始音乐桥/{n}" in names)
check("zip 内 DLL 与源一致", z.read("初始音乐桥/bridge.dll") == dll)
check("zip 内 manifest 一致", z.read("初始音乐桥/manifest.json").decode("utf-8") == open(f"{SRC}/manifest.json", encoding="utf-8").read())
ud = z.read("初始音乐桥/安装说明.txt").decode("utf-8")
check("说明含 1.2.0 升级段", f"v{VER} 相对 1.1.0 的升级" in ud and "/api/debug" in ud)
check("说明含 .plugin.path.meta 机制段", ".plugin.path.meta" in ud and "plugins_runtime" in ud)
check("说明含已知边界提示", "已知边界" in ud and "独立版" in ud)

# ---------- 7. BetterNCM 安装器 ----------
print("[7] betterncm_installer.exe")
ie = open(INSTALLER, "rb").read()
check("大小 673280(与 release 资产一致)", len(ie) == 673280, str(len(ie)))
check("PE 可执行(MZ)", ie[:2] == b"MZ")
check("含 BetterNCM 字样", b"BetterNCM" in ie)
check("SHA-256 记录", hashlib.sha256(ie).hexdigest()[:12] + "…")

# ---------- 8. 合并交付包 ----------
print("[8] 合并交付包")
zm = zipfile.ZipFile(MERGED)
mnames = zm.namelist()
for n in [f"初始音乐桥-插件-{VER}.zip", f"ChuShi-MusicBridge-{VER}.plugin", "betterncm_installer.exe", "安装指南.md"]:
    check(f"交付包含 {n}", n in mnames)
inner = zm.read(f"ChuShi-MusicBridge-{VER}.plugin")
check("交付包内 .plugin 与源一致", hashlib.sha256(inner).hexdigest() == hashlib.sha256(open(PLUGIN, "rb").read()).hexdigest())

# ---------- 汇总 ----------
print(f"\n===== {len(passed)} passed / {len(failed)} failed =====")
if failed:
    for n, d in failed:
        print(f"  FAIL {n} {d}")
    sys.exit(1)
print("ALL GREEN")
