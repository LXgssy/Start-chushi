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

**v8.7.167 补充（官方 Release 分发的 Windows 引擎包）**：Releases 发布的
`chushi-pdf-bridge-win64-v1.0.0.zip` 内含——桥接服务 exe（Node.js SEA 官方
单可执行方案打包，运行时为 Node.js v26，Node.js 许可 MIT）；原生
Tesseract 5.2.0 引擎及其依赖库，自 **conda-forge 发行版**（win-64，Apache-2.0
/ BSD 系各组件原许可）按依赖闭环组装；MSVC 运行时（vcruntime140 等，微软
凭再分发许可随应用程序本地部署）；tessdata_fast 语言包（Apache-2.0）。
全部仅作非商用分发，来源与许可不变。

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
「初始」v8.7.173 的 PDF 转 Word / PDF 转 Excel 在上述致谢基础上**直接移植**了
该项目的转换引擎源码（显著署名保持，二次开发成果同样非商用）：

1. `pdf-table-extractor.js` / `pdf-table-runtime.js` 两文件为**零逻辑改动
   逐字节移植**（module.exports → ESM export 桥接除外），保留原作者文件级
   口径与注释；网格并查集、锚点列聚类、算术自洽修复、跨页续表全部为原实现。
2. `pdf-office.ts` 浏览器桥接层按其 `pdf-office-xlsx.js`（ExcelJS 写入器：
   formatPdfWorkbookSheet / applyColumnWidths / addPdfTableNotes 口径）与
   `pdf-office-docx.js`（makeTable / tableRows 口径）移植；矢量线提取为
   浏览器侧 camelot-lattice 等价实现（其 native 路径依赖原生 docengine
   二进制，浏览器环境不可用，详见源码头注）。
3. 依许可要求显著标注：原作者 **牢蜂（LaoFeng）**，项目
   github.com/LaoFeng-mouse/flyingmouse-format；《飞鼠格式非商用许可协议》
   全文随上游仓库分发，本扩展同样**禁止商用**。


「初始」v8.7.170 的转换链路根修在此基础上扩大移植范围（`src/lib/startpage/
pdf-cjk.ts` 与 PdfTools.tsx，算法口径移植、零依赖浏览器适配重写）：

4. PDF 文本行分组口径（其 pdf-table.js `groupPdfItemsIntoLines`）：行聚类
   高度自适应容差律、CJK 相邻零空格律、片段切分律（间隙 > max(14, 行高×1.6)）；
5. 表格行对齐律（同文件 `aligned` 判定）：相邻行片段数一致且逐列 x 对齐
   （±10px）才升格为表格单元格——单纯定位词永不成表；
6. 列宽计宽律（同文件 `pdfCellDisplayWidth`/`applyColumnWidths`）：CJK/全角
   计双宽、组合记号计零宽，xlsx 列宽按内容宽度计算；
7. Word→PDF 版式语义参考（其 pdf-office-docx.js：标题层级/段距/表格网格/
   跨页表头重复；其 LibreOffice 桌面管线不可入浏览器，本工具箱以
   mammoth→结构重排版实现同目标）。

相应地在 `src/lib/startpage/pdf-cjk.ts` 文件头、`PdfTools.tsx` 各转换函数
注释与本节同样标注了该来源。本项目承诺：与飞鼠一样**永久开源非商用**，
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
| fontkit | 字体解析/子集化（@cantoo/pdf-lib 嵌入） | MIT |
| Noto Sans SC（TTF 随包） | CJK 文字层嵌入字体 | SIL Open Font License 1.1 |
| docx | 文本 → docx | MIT |
| pptxgenjs | 文本 → pptx | MIT |
| lucide-react | 图标 | ISC |
| framer-motion | 动效 | MIT |

以上组件均以其原始许可随包分发，未做商用化使用；如需完整许可文本，
可在各组件 npm 包内 `LICENSE` 文件查看。
