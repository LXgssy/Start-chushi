# 「初始」PDF 桥接（chushi-pdf-bridge）

配合 Chrome 扩展「初始」PDF 工具箱的 **OCR 文字识别** 可选本地增强引擎。

## 它是什么

一个**零 npm 依赖**的单文件 Node 服务（`chushi-pdf-bridge.js`），监听
`127.0.0.1:27001`（占用自动顺扫到 27005），提供：

| 端点 | 说明 |
| --- | --- |
| `GET /health` | 探活 + 自报身份（扩展以此识别桥在不在） |
| `POST /ocr` | `{ "image": "<png base64>", "lang": "chi_sim+eng" }` → `{ "text": "..." }` |

扩展侧逻辑：OCR 时先探活 `/health`，**桥在 → 走本地原生 tesseract（快、离线、
零下载）；桥不在 → 自动落浏览器内 tesseract.js WASM（首次下载语言包，之后离线）**。
用户不装桥也完全可用。

设计取自开源项目「飞鼠格式转换」（作者：牢蜂 LaoFeng，
github.com/LaoFeng-mouse/flyingmouse-format，非商用许可），依其许可要求显著署名。
OCR 引擎与语言包均为 Apache-2.0（Tesseract / tessdata）。

## 快速开始（脚本版）

1. 装 [Node.js](https://nodejs.org)（≥18）与
   [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki)（Windows 安装包，勾选中文简体语言包）；
2. `node chushi-pdf-bridge.js`；
3. 打开「初始」→ 右键 → PDF 工具箱 → OCR 文字识别，状态栏出现
   `本地引擎（127.0.0.1:27001）` 即已生效。

## 就绪包（免装 Node，直接下载，v8.7.167 起扩展内嵌下载入口）

不想装环境的话，用官方 Releases 已打包好的 Windows 免安装包
（PDF 工具箱 → OCR 文字识别面板内也有这个下载入口）：

```
https://github.com/LXgssy/Start-chushi/releases/download/pdf-bridge-v1.0.0/chushi-pdf-bridge-win64-v1.0.0.zip
SHA256: a37244af52b86f5d67649f942778c95b4d66bed522d1284078abb48faa0b9361
```

解压后双击 `chushi-pdf-bridge.exe`（SmartScreen 提示点「更多信息 → 仍要运行」），
扩展 OCR 面板自动探活并优先走本地引擎。包内布局：

- `chushi-pdf-bridge.exe` —— 桥接服务单文件（Node.js SEA 官方方案打包）；
- `tesseract\` —— 原生 Tesseract 5.2.0 引擎与依赖（依 conda-forge 发行版按
  依赖闭环组装，全部 Apache-2.0 / BSD 系原许可）；
- `tessdata\` —— chi_sim + eng 语言包（tessdata_fast，Apache-2.0）。

## 打包 Windows 免安装 exe（可选）

Node 单可执行应用（SEA）方案，产物是一个 exe + 旁边放引擎与语言包：

```powershell
# 1) 生成 SEA 配置与注入 blob（Node ≥ 20）
node --experimental-sea-config sea-config.json
# 2) 复制 node.exe 并注入
Copy-Item (Get-Command node).Source chushi-pdf-bridge.exe
npx postject chushi-pdf-bridge.exe NODE_SEA_BLOB sea-prep.blob `
  --sentinel-fuse NODE_SEA_FUSE_..f1ca6bb1e0e0
# 3) 同目录放置
#    tesseract\tesseract.exe        （UB-Mannheim 安装目录整拷，或装好即可走 PATH）
#    tessdata\chi_sim.traineddata.gz
#    tessdata\eng.traineddata.gz
```

`sea-config.json`：

```json
{ "main": "chushi-pdf-bridge.js", "output": "sea-prep.blob", "disableExperimentalSEAWarning": true }
```

目录结构（exe 与资源同层，全部 Apache-2.0 / 飞鼠非商用许可允许分发范围）：

```
chushi-pdf-bridge.exe        ← SEA 注入后的单文件
tesseract\tesseract.exe      ← 原生引擎
tessdata\*.traineddata.gz    ← chi_sim + eng
```

> 分发提示：对外发布请只提供本目录源码与构建说明（或指向本仓库 Releases），
> 请勿倒卖安装包；引擎与语言包遵循各自上游许可（Apache-2.0）。

## 安全说明

- 仅接受 `127.0.0.1` / `::1` 直连；`Origin`/`Referer` 必须是
  `chrome-extension://` 或 `http://localhost`/`http://127.0.0.1`，公网站点 403；
- 请求体上限 25MB；单请求 180s 超时；
- 不落任何用户文件：图片写入系统临时目录，识别完立即删除。

## 端口

27001 → 27005 顺扫。与「初始」音乐枢纽（26901-26903 / 26911-26913）天然避让。
