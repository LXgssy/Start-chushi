# 第三方组件致谢与许可（THIRD PARTY NOTICES）

「初始」(Start-chushi) 是开源非商用项目。本文件列出随扩展分发或运行时调用的
第三方组件与其许可。对各组件原作者的劳动，我们深表感谢。

## Tesseract OCR 引擎体系（v8.7.166 起，OCR 文字识别）

| 组件 | 用途 | 许可 | 来源 |
| --- | --- | --- | --- |
| tesseract.js 5.1.1 | 浏览器层 WASM OCR 引擎（轨道 A） | Apache-2.0 | github.com/naptha/tesseract.js |
| tesseract.js-core | WASM 核心（随包分发于 `/ocr/`） | Apache-2.0 | github.com/naptha/tesseract.js-core |
| tessdata 语言包 | chi_sim / eng 识别模型（首次使用经 CDN 拉取并本地缓存） | Apache-2.0 | github.com/tesseract-ocr/tessdata（经 tessdata.projectnaptha.com 分发） |
| tesseract（可选，本地桥接） | 本地原生引擎（轨道 B，用户自装/自备） | Apache-2.0 | github.com/tesseract-ocr/tesseract |

「初始」与上述组件同样遵循 Apache-2.0 精神：**不商用、保留署名**。

## 飞鼠格式转换（设计取经与致谢）

- 项目：飞鼠格式转换（FlyingMouse Format）
- 原作者：**牢蜂（LaoFeng）**
- 仓库：github.com/LaoFeng-mouse/flyingmouse-format
- 许可：《飞鼠格式非商用许可协议》（个人免费使用/传播/二次开发；公开发布
  二次开发成果须**显著标注原作者**并同样非商用；禁止商用、套壳改名冒充、
  删改署名）

「初始」v8.7.166 的本地 PDF 桥接服务（`bridge/chushi-pdf-bridge.js`）在设计上
参考并致谢该项目的以下成果（零依赖适配重写，非原代码复制）：

1. 「本地 HTTP 桥接服务 + 网页按端口调用本地引擎」的整体架构（其 server.js）；
2. 本地请求守卫模式（仅本机直连 + 来源校验，其 `assertLocalWebRequest`）；
3. OCR 工程口径：中英文固定语言集（chi_sim+eng）、300dpi、灰度归一化预处理、
   逐页识别与置信度意识（其 ocr.js）。

相应地在扩展侧（`src/lib/startpage/ocr-engine.ts` 的预处理注释与 PdfTools
关于文案）同样标注了该来源。本项目承诺：与飞鼠一样**永久开源非商用**，
不做任何商用、售卖或套壳冒充。

## 随包分发的其它引擎库（v8.7.52 起的 PDF 工具箱）

| 组件 | 用途 | 许可 |
| --- | --- | --- |
| pdfjs-dist | PDF 解析/渲染/文本提取 | Apache-2.0 |
| @cantoo/pdf-lib | PDF 生成/合并/拆分/加密 | Apache-2.0（pdf-lib 分支） |
| pdf-lib（上游） | PDF 生成 | MIT |
| mammoth | docx → HTML | BSD-2-Clause |
| SheetJS (xlsx) | xlsx/xls 读写 | Apache-2.0（Community Edition） |
| fflate | zip 打包/解包 | MIT |
| jsPDF | PDF 光栅输出 | MIT |
| html2canvas | HTML 光栅化 | MIT |
| docx | 文本 → docx | MIT |
| pptxgenjs | 文本 → pptx | MIT |
| lucide-react | 图标 | ISC |
| framer-motion | 动效 | MIT |

以上组件均以其原始许可随包分发，未做商用化使用；如需完整许可文本，
可在各组件 npm 包内 `LICENSE` 文件查看。
