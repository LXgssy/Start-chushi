#!/usr/bin/env python3
"""扩展打包：EXTENSION_MODE 导出产物 → MV3 扩展 zip（v1.7.1，v8.1.2 复用）。
步骤：index.html 内联 <script> 外置为 ext-script-N.js（MV3 CSP 兼容）→
写入 manifest.json（版本号此处维护）→ 复制 _locales/icons → zip。
⚠ v8.0.8~v8.1.1 发版回归：build-v8xx-assets.py 直接 zip out/，漏掉本脚本
全部注入步骤（manifest/_locales/icons/内联外置）→ 发布包无法全新安装。
v8.1.2 起恢复本流程作为扩展包唯一产出门。
v8.2.1 新增：ext-lyric.js（完全体歌词引擎，拼接在 ext-card.js 之前——内容脚本
不支持 importScripts）+ ext-card.js 三态重构（封面收起/标准/完全体歌词）。
历史：v8.2.0 ext-bg.js（SW 状态中继）+ ext-card.js（悬浮音乐卡）注入。
v8.2.3 新增：辉光层叠修复（高光跑封面根治）+ 两色调 + 顶带收敛/带左时间 + 主题色跟随 cardAcc；
v8.2.2 保留：数据面软重锚/回退熔断/seek 护航（乱跳根治）+ 高光保持律 +
封面态拖动 + openPanel 全拆（零跳转「初始」）+ img ghost 禁拖。
v8.3.0 新增：三态切换真弹簧（springFrames 采样）+ 封面连续锚 covClone（两端实测矩形，
  校准零误差）+ 内容级联快交叉 + cscardin 入场仅 .boot（display 重放真凶）+
  vis 上报退役（数据面休眠拆除：state 轮询只要还有卡片 Port 就常开）。
v8.3.1 新增：封面 clone display 拨正（cover→mini 一镜到底真凶）+ 弹簧克制化
  （dock standard 同参 + 封面临界阻尼）+ 高光渐入（glowRamp）+ 律动 AGC +
  歌词行呼吸动效 + 内容脚本注入兜底（scripting 权限 + SW 清扫/补针）。
v8.3.2 新增：歌词高斯模糊景深（未唱 2px/已唱 1.1px/当前行 sharp，同曲线
  filter 过渡）+ 面板侧 music-widget.html 同步呼吸/模糊/时序（双渲染层
  动效完全对齐，用户：要覆盖浮窗和「初始」面板）。
v8.4.4 新增：云端更新壳（学习青柠起始页 1.4.0 壳机制）——新标签页改为
  shell.html（全屏 iframe 载 GitHub Pages 云端版「初始」，云端迭代即时
  生效）；壳桥 shell-bridge.js（扩展页上下文）监听 iframe postMessage
  （origin 白名单 https://lxgssy.github.io + e.source 校验）代写
  chrome.storage.local，onChanged 反向推送 → 壳内页面与浮窗开关同步；
  shim-page.js（MAIN world document_start）为旧版云端页伪造
  chrome.storage.local（页面零改动即获镜像能力）；cs-bridge.js（isolated
  world，顶层直访 Pages）与 shim 配对代写 —— 网页版与扩展同库；握手 10s
  超时回退本地完整版 index.html。
v8.4.5 改版（用户指令「加载完成后直接缓存在本地，新开标签页时直接就加载
  最新的版本即可，而且地址栏不要写一串网址」）——壳架构反转为「本地直载」：
  ① 新标签页零网络：壳只做版本路由（IDB 快照 meta vs 扩展自版本），
    iframe 指本地内嵌完整版 index.html（或快照 /cs-snap/index.html）；
  ② 云端静默更新：ext-bg.js 更新器定期比对云端 version.json，严格更新
    才下载文件集缓存进 IndexedDB（chushi-snap），原子提交 meta，下一
    标签页起直载快照（cs-snap/sw.js 快照 SW 虚拟目录服务，离线可用）；
  ③ 地址栏收敛：永不跳转外部网址；加载后 replaceState 到 ./index.html
    （地址栏只剩扩展 ID + 文件名，F5 落自足应用顶层；Chrome 对扩展根
    路径 "/" 是硬豁免 404 且 background SW 不拦 fetch——决胜实验 X2，
    根形态无法 F5 兜底故不用）；
  ④ cs-snap/sw.js（快照 SW，子路径作用域 cs-snap/，真实目录无下划线过
    保留名规则）：/cs-snap/* 快照服务 + 快照文档 referrer 改写；
    manifest sandbox.pages 增补 cs-snap/sandbox.html（虚拟路径保留
    沙箱特权）；+alarms 权限；
  ⑤ 云端快照载荷：build 额外产出 cloud-snapshot/（version.json + 页面
    文件集）——部署到任意 https 镜像即激活云端更新（本版不推公开仓，
    交付包内附载荷，部署由用户决定）。
用法: python3 scripts/build-extension.py
输出: download/<VERSION>/ChuShi-NewTab-v<VERSION>.zip
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
STAGE = pathlib.Path("/tmp/ext-stage")
REF = pathlib.Path("/tmp/ext-ref")  # v1.1.2 参考包（_locales/icons 素材源）
EXT_SRC = ROOT / "extension-src"    # v8.2.0 SW/内容脚本源
VERSION = "8.6.14"
DEST = ROOT / f"download/v{VERSION}/ChuShi-NewTab-v{VERSION}.zip"

if not OUT.exists() or not (OUT / "index.html").exists():
    sys.exit("out/index.html 不存在——先跑 EXTENSION_MODE=1 bun run build:extension")
if not REF.exists():
    sys.exit("/tmp/ext-ref 不存在——先解压 download/v1.1.2/ChuShi-NewTab-v1.1.2.zip 到该目录")

# 0) 干净舞台
if STAGE.exists():
    shutil.rmtree(STAGE)
STAGE.mkdir(parents=True)

# 1) 复制导出产物
shutil.copytree(OUT, STAGE, dirs_exist_ok=True)

# 2) index.html 内联脚本外置（theme 引导 + Next Flight 数据），MV3 普通页禁内联脚本
html = (STAGE / "index.html").read_text(encoding="utf-8")
# v8.4.7 网页版回归引导：载荷 index.html 被浏览器直接访问（github.io 镜像根）
# 时重定向到 /web/（basePath 独立构建的网页版）。扩展内/快照内 hostname 是
# 扩展 ID，条件恒假 = 零打扰。外置后成为 ext-script 首脚本，先于一切应用脚本。
html = html.replace(
    "<head>",
    '<head><script>(function(){if(location.hostname==="lxgssy.github.io")location.replace("web/")})();</script>',
    1,
)
scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
n = 0
for code in scripts:
    if not code.strip():
        continue
    n += 1
    (STAGE / f"ext-script-{n}.js").write_text(code, encoding="utf-8")
    html = html.replace(f"<script>{code}</script>", f'<script src="/ext-script-{n}.js"></script>', 1)
(STAGE / "index.html").write_text(html, encoding="utf-8")
print(f"index.html: 外置 {n} 个内联脚本")
# v8.4.7 网页版重定向必须是【相对引用】：镜像根上绝对 /ext-script-1.js 会
# 解析到域名根 404，重定向永远不执行；相对 ext-script-1.js 在镜像根解析为
# /Start-chushi/ext-script-1.js（存在），在扩展快照解析为 /cs-snap/ext-
# script-1.js（SW 供数）。重定向是自研脚本，不受 Turbopack /next/ 键约束。
if n >= 1 and "lxgssy.github.io" not in (STAGE / "ext-script-1.js").read_text(encoding="utf-8"):
    sys.exit("ext-script-1.js 不是网页版重定向引导——注入序被破坏")
html = html.replace('<script src="/ext-script-1.js">', '<script src ="ext-script-1.js">', 1)
(STAGE / "index.html").write_text(html, encoding="utf-8")
print("index.html: 重定向引导已改相对引用（免疫态）")

# 2.5) Chromium 保留名改造：「加载已解压的扩展程序」拒绝任何 `_` 开头的路径组件
# （Chromium 规则：下划线开头组件仅允许 _locales/_platform_specific/_metadata；
#   ⚠ --load-extension 命令行路径不校验——冒烟必须另加保留名校验门，不能只信真浏览器）。
# Next.js 导出的 _next/、_not-found*、_buildManifest.js 等必须改名并同步全部文本引用；
# __next.*.txt Flight 预取回退在单页扩展中永不 fetch（无客户端导航），直接删除。
RESERVED_OK = {"_locales", "_platform_specific", "_metadata"}
TEXT_EXT = {".html", ".js", ".css", ".json", ".txt", ".svg", ".webmanifest", ".map"}
REPL = [
    (b"/_next", b"/next"),    # 绝对路径（覆盖 /_next/… 与串尾 "/_next"）
    (b"_next/", b"next/"),    # 拼接串形态；__next_f 等全局变量不含 "_next/" 不受影响
    (b"_buildManifest", b"buildManifest"),
    (b"_ssgManifest", b"ssgManifest"),
    (b"_clientMiddlewareManifest", b"clientMiddlewareManifest"),
    (b"_not-found", b"not-found"),
]
touched = 0
for p in STAGE.rglob("*"):
    if p.is_file() and p.suffix in TEXT_EXT:
        raw = p.read_bytes()
        new = raw
        for a, b in REPL:
            new = new.replace(a, b)
        if new != raw:
            p.write_bytes(new)
            touched += 1
print(f"保留名改造: 文本引用替换 {touched} 个文件")
for p in STAGE.glob("__next.*"):
    p.unlink()
renamed = 0
for p in sorted(STAGE.rglob("*"), key=lambda x: len(x.parts), reverse=True):
    if not p.exists() or p.name in RESERVED_OK or not p.name.startswith("_"):
        continue
    p.rename(p.parent / p.name.lstrip("_"))
    renamed += 1
print(f"保留名改造: 目录/文件改名 {renamed} 个")

# 2.7) v8.4.7 快照启动修复（本次事故根因）：Turbopack 运行时块内硬编码
#   分块键前缀 t="/next/"（构建期 basePath），注册键=脚本标签 src 属性剥
#   "/next/"，加载键=编译期相对路径（"static/chunks/…"）——两者必须在字面
#   "/next/" 前提下才相等。v8.4.5~8.4.6 的 ext-bg snapRewriteHtml 把快照
#   HTML 的 src/href 前缀成 /cs-snap/next/… → 注册键剥离失败 → 引导分块
#   永不 resolve → 快照静默卡加载（探针 final-gate 实证）。
#   修法=「属性空格前置 =」免疫态：src ="/next/…" 是合法 HTML 且恰好绕过
#   (src|href)=("|')\/ 改写正则 → 旧壳/新壳下载后标签保持字面 /next/…，
#   快照文档的一切 /next/* 子资源经 cs-snap SW referrer 分支从 IDB 原样供
#   数，键空间与根路径完全一致 → 启动恢复。对包内 HTML 同样生效（根路径
#   语义等价），包/载荷单文件同源。
_patched = 0
for _hp in STAGE.rglob("*.html"):
    _ht = _hp.read_text(encoding="utf-8")
    _ht2 = re.sub(r'(\ssrc)="(/(?!/))', r'\1 ="\2', _ht)
    _ht2 = re.sub(r'(\shref)="(/(?!/))', r'\1 ="\2', _ht2)
    if _ht2 != _ht:
        _hp.write_text(_ht2, encoding="utf-8")
        _patched += 1
print(f"免疫态改写: {_patched} 个 HTML 的根绝对 src/href 已前置空格")

# 3) manifest.json（相对路径引用，扩展根即站点根）
manifest = {
    "manifest_version": 3,
    "name": "__MSG_extName__",
    "short_name": "初始",
    "version": VERSION,
    "description": "__MSG_extDesc__",
    "default_locale": "zh_CN",
    "icons": {"16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png"},
    # v8.4.4：新标签页改为壳页。v8.4.5：壳反转为本地直载（零网络路由），
    # 云端静默更新只影响后续标签页（见 ext-bg.js 更新器 / shell-bridge.js）。
    # v8.5.4 曾把覆盖页退化成跳板 nt.html（无条件跳转）→ 地址栏永远显示扩展地址，
    # 弹窗那个开关形同失效；v8.5.8 回退：覆盖页仍是壳页本身。默认停在覆盖页 URL
    # 就是浏览器默认（地址栏聚焦、不显示扩展地址）；需要「不聚焦地址栏」时由
    # shell-bridge 按开关自发导航一次。
    "chrome_url_overrides": {"newtab": "shell.html"},
    # v8.5.0：工具栏图标弹窗快捷面板（青柠起始页同款交互）：流畅模式 /
    # 新标签页不聚焦地址栏 / 完整设置直达。此前无 action 键（点击无动作）；
    # 加 default_popup 后 action.onClicked 不再触发（ext-bg 本就无监听，零冲突）。
    # 页面数据面：popup 与新标签页同 origin 共享 localStorage（start:settings），
    # 开关即时生效（storage 事件热跟随）；本文件属扩展包体，需换 crx 才能获得。
    "action": {
        "default_popup": "popup.html",
        "default_title": "初始 · 快捷面板",
        "default_icon": {
            "16": "icons/icon16.png",
            "48": "icons/icon48.png",
            "128": "icons/icon128.png",
        },
    },
    # v8.4.4：MAIN world 内容脚本（shim-page.js 伪造 chrome.storage）需 Chrome 111+。
    "minimum_chrome_version": "111",
    # v7.0.0：原生 DLL 枢纽——ChuShi SMTC Manager 的原生模块在本机回环
    # 开 HTTP 中继（26901，被占用时自动退 26902/26903）。host_permissions
    # 同时放行三端口（缺了它扩展版所有 127.0.0.1 请求被浏览器拦截，音乐
    # 面板在扩展里完全离线；web 版靠枢纽的 CORS * 响应头，不受影响）。
    # v6 渲染进程内 require("http") 枢纽在 CEF 环境不可用（无 Node），已退役。
    # v8.2.0：+26911/26912/26913（独立频谱助手 chushi-spectrum.exe，律动高光）。
    "host_permissions": [
        "https://www.baidu.com/*",
        "https://weather.cma.cn/*",
        "https://api.open-meteo.com/*",
        "https://geocoding-api.open-meteo.com/*",
        "https://api.bigdatacloud.net/*",
        "https://images.unsplash.com/*",
        "http://127.0.0.1:26901/*",
        "http://127.0.0.1:26902/*",
        "http://127.0.0.1:26903/*",
        "http://127.0.0.1:26911/*",
        "http://127.0.0.1:26912/*",
        "http://127.0.0.1:26913/*",
        # v8.3.1 注入兜底：executeScript 需要目标页 host 权限（与 content_scripts
        # 的 http/https 通配同域——授权面无增量）
        "http://*/*",
        "https://*/*",
    ],
    # v8.2.0 悬浮音乐卡（想法一三件套之二/之三）：SW 状态中继 + <all_urls>
    # 内容脚本。卡片在自家新标签页不出现（内容脚本不匹配 chrome-extension://），
    # chrome:// 等特权页浏览器规则性无法注入（诚实边界，发版说明已告知）。
    # permissions：storage（卡片位置/药丸/按站隐藏持久化）+ tabs（openPanel
    # 的 tabs.query(url) 聚焦已有面板页；create 不需要权限，query 需要）。
    # v8.3.1：+scripting（注入兜底——快捷服务等场景 manifest 注入偶发缺席，
    # SW 用 executeScript 补针；host_permissions +http/https 通配 = 与
    # content_scripts 同域，安装授权提示无增量）。用户更新流程是删目录重
    # 解压（全新安装），无增量权限审批问题。
    # v8.3.6：+geolocation——天气面板「定位」按钮在扩展页读经纬度必须有它。
    # MV3 下 chrome-extension:// 页面的 navigator.geolocation 若未声明该权限会
    # 直接拿不到坐标（只能手动搜城市）；网页版走标准 Web 权限流程，不受影响。
    # PRIVACY.md / README 一直按「扩展声明 geolocation」描述，本次补齐实现。
    # v8.4.5：+alarms——云端静默更新器周期检查（ext-bg.js 更新器，6h）。
    "permissions": ["storage", "tabs", "scripting", "geolocation", "alarms"],
    "background": {"service_worker": "ext-bg.js"},
    # v8.4.4：+ 壳桥页面端双注入（仅「初始」云端域，授权面无增量）——
    #   shim-page.js（MAIN world，document_start）：为云端页面伪造 chrome.storage.local，
    #     页面既有 chrome.storage 调用（mirrorExtCard 开关镜像）零改动经桥落库；
    #   cs-bridge.js（isolated world，顶层）：直访 Pages（无壳）时收 shim 消息代写，
    #     网页版与扩展共享同一 chrome.storage —— 面板与浮窗开关全局同步。
    "content_scripts": [
        {
            "matches": ["http://*/*", "https://*/*"],
            "js": ["ext-card.js"],
            "run_at": "document_idle",
            "all_frames": False,
        },
        {
            "matches": ["https://lxgssy.github.io/*"],
            "js": ["shim-page.js"],
            "run_at": "document_start",
            "world": "MAIN",
            # v8.4.4 必备 all_frames：壳内 gh-pages 页不是顶层 frame，缺省 false 不注入
            "all_frames": True,
        },
        {
            "matches": ["https://lxgssy.github.io/*"],
            "js": ["cs-bridge.js"],
            "run_at": "document_start",
            # cs-bridge 仅顶层生效（脚本内 window.top 双保险）：壳内由壳桥负责
            "all_frames": True,
        },
    ],
    # v8.4.5：+ cs-snap/sandbox.html——快照虚拟目录下的沙箱页必须保留
    # 沙箱特权（unsafe-eval），否则云端快照模式预设脚本被 CSP 拦截。
    "sandbox": {"pages": ["sandbox.html", "cs-snap/sandbox.html"]},
    "content_security_policy": {
        "sandbox": "sandbox allow-scripts; script-src 'self' 'unsafe-inline' 'unsafe-eval'; object-src 'self'"
    },
}
(STAGE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# 4) _locales 与 icons（素材沿用 v1.1.2）+ v8.2.1 SW/内容脚本注入
shutil.copytree(REF / "_locales", STAGE / "_locales", dirs_exist_ok=True)
shutil.copytree(REF / "icons", STAGE / "icons", dirs_exist_ok=True)
# v8.2.1 装配律：ext-card.js = ext-lyric.js（歌词引擎）+ ext-card.js（三态 UI）
# 拼接——内容脚本无 importScripts；node 单测直接 require ext-lyric.js 同源码。
_lyric = (EXT_SRC / "ext-lyric.js").read_text(encoding="utf-8")
_card = (EXT_SRC / "ext-card.js").read_text(encoding="utf-8")
(STAGE / "ext-card.js").write_text(
    "/* == ext-lyric.js (歌词引擎，build 时拼接) == */\n" + _lyric +
    "\n/* == ext-card.js (三态悬浮卡) == */\n" + _card,
    encoding="utf-8")
shutil.copy2(EXT_SRC / "ext-bg.js", STAGE / "ext-bg.js")
# v8.4.4：云端更新壳三件（壳页 + 壳桥 + 页面端 shim/顶层桥）
# v8.4.5：+ cs-snap/sw.js（快照 SW：子路径作用域，真实目录过保留名规则）
# v8.5.0：+ 弹窗快捷面板（popup.html + popup.js）
for _shell in ("shell.html", "shell-bridge.js", "shim-page.js", "cs-bridge.js", "popup.html", "popup.js"):
    shutil.copy2(EXT_SRC / _shell, STAGE / _shell)
if (STAGE / "cs-snap").exists():
    shutil.rmtree(STAGE / "cs-snap")
shutil.copytree(EXT_SRC / "cs-snap", STAGE / "cs-snap")
# v8.4.5 沙箱双保险：cs-snap/ 内落真实沙箱文件副本——快照 SW 对 sandbox.*
# 豁免（SW 合成沙箱特权页会挂死，对照实验实证），任何对
# /cs-snap/sandbox.html 的请求都落网络拿到真文件，manifest sandbox.pages
# 的 cs-snap/sandbox.html 条目保证特权不丢
shutil.copy2(STAGE / "sandbox.html", STAGE / "cs-snap" / "sandbox.html")
shutil.copy2(STAGE / "sandbox.js", STAGE / "cs-snap" / "sandbox.js")
print("扩展部件注入: ext-bg.js (SW 中继+歌词代理+云端更新器) + ext-card.js (三态卡=歌词引擎+UI)")
print("本地直载壳注入: shell.html + shell-bridge.js (壳运行时+云桥保留) + cs-snap/sw.js (快照 SW) + shim-page.js + cs-bridge.js")

# 5) 防呆门：保留名 0 违规（UI 加载路径的硬校验）+ 扩展结构完整性
bad = sorted(
    "/".join(p.relative_to(STAGE).parts)
    for p in STAGE.rglob("*")
    if any(c.startswith("_") and c not in RESERVED_OK for c in p.relative_to(STAGE).parts)
)
if bad:
    sys.exit(f"保留名违规（Chromium UI 加载必拒）: {bad[:5]}")
for must in ("manifest.json", "_locales/zh_CN/messages.json", "icons/icon128.png",
             "index.html", "sandbox.html", "sandbox.js", "ext-bg.js", "ext-card.js",
             # v8.4.4 云端更新壳三件 + v8.4.5 快照 SW（子路径作用域）
             "shell.html", "shell-bridge.js", "shim-page.js", "cs-bridge.js", "cs-snap/sw.js",
             # v8.5.0 弹窗快捷面板
             "popup.html", "popup.js"):
    if not (STAGE / must).exists():
        sys.exit(f"缺 {must}——产物不完整")
# v8.2.1 门：SW/内容脚本语法自检（node --check；拼接后的 ext-card.js 才是真产物）
# v8.4.4：+ 壳桥三件（shell-bridge/shim-page/cs-bridge）同门
# v8.4.5：+ 快照 SW（cs-snap/sw.js）同门
for ext_file in ("ext-bg.js", "ext-card.js", "shell-bridge.js", "shim-page.js", "cs-bridge.js", "cs-snap/sw.js"):
    r = subprocess.run(["node", "--check", str(STAGE / ext_file)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"{ext_file} 语法门 FAIL: {r.stderr[:300]}")
_card_js = (STAGE / "ext-card.js").read_text(encoding="utf-8")
for feat in ("ChuShiLyric", "parseWordText", "unitizeLine",  # 歌词引擎特征
             "fcard", "flyr-in", "setMode", "cover",         # 三态/歌词 DOM 特征
             "chushi-card",                                    # Port 名
             "ingestTrack", "reconcileLines", "posNowOf",     # v8.2.2 乱跳根治/高光保持
             "coverClickBlock", "dragstart",                   # 封面态拖动 + ghost 禁拖
             "seekGuard", "backStreak",                       # seek 护航/回退熔断
             "needFrame", "sleepNow", "visibilitychange",     # v8.2.6 渲染休眠律
             "cglow", "covClear",                             # v8.2.7 封面态律动
             "forceWord", "cardForceWord", "rebuildForForce", # v8.2.8 强行逐字跟随
             "lastLyrTy", "Math.pow",                         # v8.2.8 间奏滚动防抖+非线性律
             "cardEnabled", "cardGlow", "initCard",           # v8.2.9 全局双开关（右键隐藏退役）
             "applyEnabled", "applyGlowEnabled", "specMsgOn",  # v8.2.9 开关应用面
             "ChuShiLyric.align(ly.parsed, ms, lyMode === 0)",  # v8.2.9 行级时钟
             "bands.length >= 100",                             # v8.2.9 128 段自适应
             "springFrames", "morphFrames", "covClone",        # v8.3.0 真弹簧+封面连续锚
             "surf.boot",                                       # v8.3.0 入场动画仅首挂载（复位感真凶之二）
             "cloneImg",                                        # v8.3.0 形变途中切歌热跟随
             "getBoundingClientRect", "borderRadius",          # morph 几何取证
             "display:block;position:fixed",                    # v8.3.1 封面 clone display 拨正（cover→mini 一镜到底真凶）
             "SPRING_COVER",                                    # v8.3.1 封面临界阻尼弹簧（零回弹）
             "glowRampAt", "glowRamp",                          # v8.3.1 高光渐入
             "envNorm",                                         # v8.3.1 律动 AGC（弱歌隐形根治）
             "transform:scale(1.06)",                           # v8.3.1 歌词当前行呼吸放大
             "filter:blur(2px)", "filter:blur(1.1px)", "filter:blur(0)",  # v8.3.2 歌词高斯模糊景深
             "will-change:transform,filter",                    # v8.3.3 done 行常驻提层（模糊防重置）
             "高光归位律", "GATE_MS", "gPend", "lastHardAt", "seekGuard ||",  # v8.3.3 辉光归位+行界滞回门
             "lyrTrackUntil", "scrollLyricTo",                  # v8.3.4 滚动 target 逐帧追踪（切行「咯噔」）
             "fsubw", ".fln.on .fsubw{height:16px",              # v8.3.4 翻译行 height 过渡（布局零跳变）
             "OPT_MAX",                                         # v8.3.4 乐观窗顺延（播放键复位根治）
             "height:140px", "calc(100% - 18px)",               # v8.3.4 歌词容器加高+mask 固定渐隐（防裁切）
             "display:none;overflow:hidden",                    # v8.3.4 mini/full 壳裁切（高光防溢出）
             # v8.3.5 逐字重影根治 + 高光照字提层 + seek 护航窗收紧
             ".fw{position:relative;display:inline-block",      # v8.3.5 词壳 inline-block（两层文本基线重合）
             "pointer-events:none;white-space:nowrap;",         # v8.3.5 .ov nowrap 双保险
             ".meta{flex:1;min-width:0;position:relative;z-index:1}",  # v8.3.5 内容件提层（辉光之上）
             ".rail{position:relative;z-index:1",
             "seekGuard.to) <= 0.8", "seekGuard.at > 3000",     # v8.3.5 收窗 0.8s + 护航窗 3s
             "updateTiming"):                                   # v8.3.1 壳/封面统一形变时长
    if feat not in _card_js:
        sys.exit(f"ext-card.js 缺特征 {feat} —— 拼接/源码不完整")
for gone in ("flyCoverClone", "animsRemoveClones", "siteHidden", "saveHide",
             "contextmenu", "c.img.style.filter"):   # v8.3.3 封面滤镜退役（高光归位律）
    if gone in _card_js:
        sys.exit(f"ext-card.js 残留 {gone} —— 旧律已退役，拒绝")
if 'type: "spec", on: vis }' in _card_js or 'type: "spec", on: vis}' in _card_js:
    sys.exit("ext-card.js 频谱订阅未过 specMsgOn 门——律动开关不生效，拒绝")
if 'postMessage({ type: "vis"' in _card_js:
    sys.exit("ext-card.js 残留 vis 上报 —— v8.3.0 数据面休眠退役未落地，拒绝")
if 'postMessage({ type: "openPanel"' in _card_js or 'case "openPanel"' in _card_js:
    sys.exit("ext-card.js 残留 openPanel 发送方——用户明确浮窗零跳转「初始」，拒绝")
_bg_js = (STAGE / "ext-bg.js").read_text(encoding="utf-8")
for feat in ("chushi-spectrum", "spectrum-boot", "chushi-card", 'case "lyric":',
             "fetchedAt",  # v8.2.2：ne.ts 采样时刻透传（乱跳根治数据面）
             "broadcastSpec", "cards.size === 0", "stopStateLoop",  # v8.3.0：state 轮询常开（休眠退役）
             "slice(0, 128)",                               # v8.2.9：频段细化透传
             "ensureCardInjected", "sweepInjectAll",        # v8.3.1：注入兜底
             "chrome.scripting.executeScript",              # v8.3.1：补针执行面
             "chrome.tabs.onUpdated",                      # v8.3.1：complete 补针钩子
             "SNAP_MIRRORS", "version.json",               # v8.4.5：云端静默更新器
             "chushi-snap", "SNAP_ALARM", "snapCheck"):    # v8.4.5：IDB 库名/报警/检查入口
    if feat not in _bg_js:
        sys.exit(f"ext-bg.js 缺特征 {feat} —— SW 歌词代理面缺失")
if 'case "vis"' in _bg_js or "port.__vis" in _bg_js:
    sys.exit("ext-bg.js 残留 vis 上报处理 —— v8.3.0 数据面休眠退役未落地，拒绝")
if 'case "openPanel"' in _bg_js:
    sys.exit("ext-bg.js 残留 openPanel 转发——浮窗零跳转律，拒绝")
_html = (STAGE / "index.html").read_text(encoding="utf-8")
if [s for s in re.findall(r"<script>(.*?)</script>", _html, re.S) if s.strip()]:
    sys.exit("index.html 残留内联脚本（MV3 CSP 必拦）")
if '"/_next' in _html or "/_next/" in _html:
    sys.exit("index.html 残留 /_next 引用——替换漏网")
# v8.4.7 门：免疫态必须完整——任何未前置空格的根绝对 src/href 都会被旧版
# 更新器改写 → 快照键失配 → 卡加载（本次事故）。零容忍。
_leak = re.findall(r'(src|href)="(/(?!/))', _html)
if _leak:
    sys.exit(f"index.html 存在 {len(_leak)} 处未免疫根绝对引用——改写漏网")
if 'src ="' not in _html:
    sys.exit("index.html 缺免疫态引用——空格前置未生效")
# v8.2.0 门：manifest 必含 background + content_scripts + 频谱端口
_m = json.loads((STAGE / "manifest.json").read_text(encoding="utf-8"))
if "background" not in _m or "service_worker" not in _m["background"]:
    sys.exit("manifest 缺 background.service_worker——悬浮卡数据面缺失")
if not _m.get("content_scripts") or "ext-card.js" not in _m["content_scripts"][0].get("js", []):
    sys.exit("manifest 缺 content_scripts(ext-card.js)——悬浮卡缺失")
if "http://127.0.0.1:26911/*" not in _m.get("host_permissions", []):
    sys.exit("manifest 缺频谱助手端口 26911 host_permissions")
if "scripting" not in _m.get("permissions", []):
    sys.exit("manifest 缺 scripting 权限——v8.3.1 注入兜底缺失")
if "http://*/*" not in _m.get("host_permissions", []) or "https://*/*" not in _m.get("host_permissions", []):
    sys.exit("manifest 缺 http/https 通配 host_permissions——v8.3.1 补针无执行权")
# v8.4.5 门：本地直载壳三要素（路由 + 地址栏收敛 + 站点 SW）+ alarms + 快照沙箱特权
if "alarms" not in _m.get("permissions", []):
    sys.exit("manifest 缺 alarms 权限——v8.4.5 云端静默更新器缺失")
if "cs-snap/sandbox.html" not in _m.get("sandbox", {}).get("pages", []):
    sys.exit("manifest sandbox.pages 缺 cs-snap/sandbox.html——快照模式沙箱特权缺失")
_sw_js = (STAGE / "cs-snap" / "sw.js").read_text(encoding="utf-8")
for feat in ('"/cs-snap/"', "chushi-snap", "respondWith"):
    if feat not in _sw_js:
        sys.exit(f"cs-snap/sw.js 缺特征 {feat} —— 快照 SW 不完整")
_sb_js = (STAGE / "shell-bridge.js").read_text(encoding="utf-8")
if "replaceState" not in _sb_js or "cs-snap/sw.js" not in _sb_js:
    sys.exit("shell-bridge.js 缺 replaceState/cs-snap 注册 —— 地址栏收敛未落地")
print("防呆门通过: 保留名 0 违规 + 结构完整 + 零内联 + 零 /_next 残留 + SW/三态悬浮卡/歌词引擎/频谱端口在位")
print("v8.4.5 门通过: alarms + 快照沙箱特权 + cs-snap/sw.js 快照服务 + 地址栏 replaceState 在位")

# 6) zip（ext-script 引用为绝对路径 /ext-script-N.js，zip 根 = 扩展根）
DEST.parent.mkdir(parents=True, exist_ok=True)
if DEST.exists():
    DEST.unlink()
subprocess.run(["zip", "-rq", str(DEST), "."], cwd=STAGE, check=True)
size = DEST.stat().st_size / 1024 / 1024
print(f"OK -> {DEST} ({size:.1f} MB)")

# 7) v8.4.5 云端快照载荷：version.json + 页面文件集（STAGE 去扩展运行件）。
#    部署到任意 https 镜像根即激活云端更新（ext-bg.js 更新器严格更新才吃，
#    永不降级）；本版不推公开仓，载荷随交付包附送，部署由用户决定。
EXCLUDE = {"manifest.json", "ext-bg.js", "ext-card.js", "sw.js",
           "shell.html", "shell-bridge.js", "shim-page.js", "cs-bridge.js", "version.json"}
# 快照载荷排除壳运行件与快照 SW 自身（cs-snap/ 目录整个不进载荷）
snap_dir = DEST.parent / "cloud-snapshot"
if snap_dir.exists():
    shutil.rmtree(snap_dir)
snap_dir.mkdir(parents=True)
files_list = []
for p in sorted(STAGE.rglob("*")):
    if not p.is_file():
        continue
    rel = p.relative_to(STAGE).as_posix()
    if rel in EXCLUDE or rel.startswith("_locales/") or rel.startswith("cs-snap/"):
        continue
    dst = snap_dir / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dst)
    files_list.append({"p": rel, "s": p.stat().st_size})
(snap_dir / "version.json").write_text(
    json.dumps({"v": VERSION, "files": files_list}, ensure_ascii=False) + "\n", encoding="utf-8")
snap_zip = DEST.parent / f"ChuShi-CloudSnapshot-v{VERSION}.zip"
if snap_zip.exists():
    snap_zip.unlink()
subprocess.run(["zip", "-rq", str(snap_zip), "."], cwd=snap_dir, check=True)
print(f"云端快照载荷 -> {snap_zip} ({len(files_list)} 文件, v{VERSION})")
