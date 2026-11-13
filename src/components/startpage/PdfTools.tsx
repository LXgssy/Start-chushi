"use client";

/* ============================================================
 * 「初始」PDF 工具箱（v8.7.52 落地 / v8.7.55 重构 / v8.7.164 修复 / v8.7.166 OCR / v8.7.167 引擎下载入口）
 *
 * itab「PDF 转换大师」同构布局：两行分组宫格（转换 / 处理）+ 选中后
 * 操作区（描述 → 条件输入 → 选择文件 → 文件列表 → 执行 → 结果）。
 * 13 个功能全程本地处理（File API + 纯 JS 库，文件永不离开设备）：
 *   转换组：图片转 PDF / Word 转 PDF / Excel 转 PDF / PPT 转 PDF /
 *           PDF 转 Word / PDF 转 Excel / PDF 转 PPT / PDF 转图片
 *   处理组：PDF 合并 / PDF 拆分 / PDF 加密 / PDF 解密 / 提取文本
 *
 * 引擎（全部动态 import 分 chunk，首屏零负担）：
 *   @cantoo/pdf-lib（pdf-lib 加密分支）：图片转 PDF / 合并 / 拆分 /
 *     加密（AES-256） / 解密——API 与 pdf-lib 兼容，统一走一个包；
 *   pdfjs-dist：PDF 转图片 / PDF 转 Word / Excel / PPT / 提取文本；
 *   mammoth：Word(docx) → HTML（浏览器 browser 字段映射）；
 *   xlsx（SheetJS）：Excel 读（xlsx/xls → HTML 表格）与写（PDF → xlsx）；
 *   fflate：多文件 zip 打包（也用于 pptx 的 zip 直解）；
 *   fontkit + Noto Sans SC（随包 TTF 运行时子集化）：@cantoo/pdf-lib 嵌入
 *     中文字形，Word/Excel/PPT→PDF 输出真实可选取文字层（v8.7.170 起，
 *     html2canvas+jspdf 光栅管线退役——光栅件无文字层/不可选/不可搜）；
 *   docx：PDF 文本 → .docx（每页标题 + 段落 + 飞鼠口径还原表格）；
 *   pptxgenjs：PDF 每页 2x PNG → 16:9 全幅图片型 .pptx。
 *
 * v8.7.166 新增 OCR 文字识别（双轨制，扫描件/图片型 PDF 逐页提取文本）：
 *   轨道 A（默认，人人可用）：tesseract.js WASM 随包离线（/ocr/），语言包
 *     首用 CDN 拉取（tessdata Apache-2.0）+ IndexedDB 缓存，之后离线可用；
 *   轨道 B（增强，可选）：本机运行「初始 PDF 桥接」（bridge/，零依赖 Node
 *     服务 + 原生 tesseract.exe），探活命中走本地，更快且零下载；桥不在
 *     自动漫回轨道 A，用户无感。
 *   预处理致谢：飞鼠格式转换（牢蜂 LaoFeng，非商用许可）300dpi + 灰度
 *     归一化口径。OCR 引擎：Tesseract（Apache-2.0）。
 *
 * v8.7.167 新增本地引擎下载入口（用户口径「就像预设功能里的开发工具一样」）：
 *   选 OCR 即自动探活本地桥接并显示状态——已就绪（走本地，快/离线）或
 *   未运行时内嵌下载链接直达 GitHub Releases 官方发布页的免安装 zip
 *   （chushi-pdf-bridge.exe SEA 单文件 + 原生 tesseract.exe + tessdata，
 *   下载解压双击即用），与预设导入面板「开发工具」下载入口同款交互。
 *
 * v8.7.164 修复（用户反馈「全部功能不可用」实证收窄）：
 *   ① Word/Excel→PDF 红字报错 oklch —— html2canvas 克隆 ownerDocument 全文档
 *      样式，Tailwind v4 @theme 的 oklch() 在其 CSS 解析器直接抛错；根修：
 *      排版容器迁入 srcdoc 同源 iframe（独立文档零应用样式表）；
 *   ② pdf2excel 下载名丢成 UUID —— XLSX.writeFile 在扩展页的 blob 触发链
 *      不同于锚点下载，统一改 XLSX.write + downloadBlob；
 *   ③ PDF 拆分新增每组 N 页（飞鼠格式同款口径）；
 *   ④ 选文件前置类型校验：accept 是软限制，拖入可绕过，不匹配直接红字提示
 *      （.doc 明确告知需另存 .docx）。
 *
 * 保真度声明（诚实降级，UI 内注明）：
 *   Word/Excel → PDF 走「结构重排版」（mammoth/SheetJS 提取内容后按 A4
 *   版式语义重排，真实文字层可选可搜；复杂嵌套版式与艺术字不逐像素还原，
 *   飞鼠同款口径的浏览器端实现——其 LibreOffice 桌面管线不可入浏览器）；
 *   PPT → PDF 走「文本重构」（提取每页标题与列点，不含原始图形元素）；
 *   PDF → Word/Excel 走「文本流转换」（版式简化为段落/表格行列）。
 * ============================================================ */

import { useEffect, useRef, useState } from "react";
import { useBgFreeze } from "@/hooks/use-start";
import { bridgeOcr, probePdfBridge, type PdfBridgeInfo } from "@/lib/startpage/pdf-bridge";
import { browserOcrCanvas, preprocessCanvas } from "@/lib/startpage/ocr-engine";
import { createPortal } from "react-dom";
import { AnimatePresence, useReducedMotion } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
import { SPRING_CARD } from "./CommandPalette";
import {
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  FileType,
  Files,
  FolderOutput,
  Images,
  ImagePlus,
  Lock,
  LockOpen,
  Loader2,
  PlugZap,
  Presentation,
  ScanText,
  Scissors,
  Type,
  X,
} from "lucide-react";

/* ---------------- 工具清单（itab 转换大师同构：两组宫格） ---------------- */

type ToolId =
  | "img2pdf"
  | "word2pdf"
  | "excel2pdf"
  | "ppt2pdf"
  | "pdf2word"
  | "pdf2excel"
  | "pdf2ppt"
  | "pdf2img"
  | "merge"
  | "split"
  | "encrypt"
  | "decrypt"
  | "text"
  | "ocr";

interface ToolMeta {
  id: ToolId;
  name: string;
  desc: string;
  icon: React.ReactNode;
  group: "convert" | "process";
  /** 文件选择 accept */
  accept: string;
  /** 是否多选 */
  multiple: boolean;
  /** 是否需要密码输入 */
  password?: boolean;
  /** 是否二次密码确认（加密） */
  passwordConfirm?: boolean;
}

const TOOLS: ToolMeta[] = [
  {
    id: "img2pdf",
    name: "图片转 PDF",
    desc: "多张图片合成一个 PDF，每图一页，按列表顺序",
    icon: <ImagePlus strokeWidth={1.5} />,
    group: "convert",
    accept: "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif",
    multiple: true,
  },
  {
    id: "word2pdf",
    name: "Word 转 PDF",
    desc: "docx 文档转 PDF（结构重排版，文字可选可搜）",
    icon: <FileType strokeWidth={1.5} />,
    group: "convert",
    accept: ".docx",
    multiple: false,
  },
  {
    id: "excel2pdf",
    name: "Excel 转 PDF",
    desc: "表格转 PDF，网格重排（文字可选可搜）",
    icon: <FileSpreadsheet strokeWidth={1.5} />,
    group: "convert",
    accept: ".xlsx,.xls",
    multiple: false,
  },
  {
    id: "ppt2pdf",
    name: "PPT 转 PDF",
    desc: "演示文稿转 PDF（文本重构：每页标题与列点）",
    icon: <Presentation strokeWidth={1.5} />,
    group: "convert",
    accept: ".pptx",
    multiple: false,
  },
  {
    id: "pdf2word",
    name: "PDF 转 Word",
    desc: "提取 PDF 文本生成 docx（每页标题 + 段落）",
    icon: <FileText strokeWidth={1.5} />,
    group: "convert",
    accept: "application/pdf,.pdf",
    multiple: false,
  },
  {
    id: "pdf2excel",
    name: "PDF 转 Excel",
    desc: "按坐标还原表格结构，每页一张工作表",
    icon: <FileSpreadsheet strokeWidth={1.5} />,
    group: "convert",
    accept: "application/pdf,.pdf",
    multiple: false,
  },
  {
    id: "pdf2ppt",
    name: "PDF 转 PPT",
    desc: "每页渲染成图片，生成 16:9 演示文稿",
    icon: <Presentation strokeWidth={1.5} />,
    group: "convert",
    accept: "application/pdf,.pdf",
    multiple: false,
  },
  {
    id: "pdf2img",
    name: "PDF 转图片",
    desc: "每一页渲染成 PNG，多页自动打包 zip",
    icon: <Images strokeWidth={1.5} />,
    group: "convert",
    accept: "application/pdf,.pdf",
    multiple: false,
  },
  {
    id: "merge",
    name: "PDF 合并",
    desc: "多个 PDF 按列表顺序合并为一个文件",
    icon: <Files strokeWidth={1.5} />,
    group: "process",
    accept: "application/pdf,.pdf",
    multiple: true,
  },
  {
    id: "split",
    name: "PDF 拆分",
    desc: "逐页或按每组 N 页拆成独立 PDF，多组自动打包 zip",
    icon: <Scissors strokeWidth={1.5} />,
    group: "process",
    accept: "application/pdf,.pdf",
    multiple: false,
  },
  {
    id: "encrypt",
    name: "PDF 加密",
    desc: "AES-256 加密，打开需要密码",
    icon: <Lock strokeWidth={1.5} />,
    group: "process",
    accept: "application/pdf,.pdf",
    multiple: false,
    password: true,
    passwordConfirm: true,
  },
  {
    id: "decrypt",
    name: "PDF 解密",
    desc: "输入密码，导出无密码副本",
    icon: <LockOpen strokeWidth={1.5} />,
    group: "process",
    accept: "application/pdf,.pdf",
    multiple: false,
    password: true,
  },
  {
    id: "text",
    name: "提取文本",
    desc: "抽取 PDF 全部文字，下载 txt 或直接复制",
    icon: <Type strokeWidth={1.5} />,
    group: "process",
    accept: "application/pdf,.pdf",
    multiple: false,
  },
  {
    id: "ocr",
    name: "OCR 文字识别",
    desc: "扫描件/图片型 PDF 逐页识别出文本（默认中英文）",
    icon: <ScanText strokeWidth={1.5} />,
    group: "process",
    accept: "application/pdf,.pdf",
    multiple: false,
  },
];

const GROUP_TITLE: Record<ToolMeta["group"], string> = {
  convert: "格式转换",
  process: "PDF 处理",
};

/* v8.7.167 本地 OCR 增强引擎官方发布页（Releases 直链，与预设「开发工具」
 * 下载入口同款交互；资产由官方 Release 分发，不倒卖不重托管） */
const BRIDGE_DOWNLOAD_URL =
  "https://github.com/LXgssy/Start-chushi/releases/download/pdf-bridge-v1.0.0/chushi-pdf-bridge-win64-v1.0.0.zip";

function fmtSize(n: number) {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(0) + " KB";
  return n + " B";
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

/** v8.7.164 前置类型校验：accept 串（.ext / type/* / type）逐项匹配，
 *  MIME 空的文件回退扩展名判定 */
function acceptOk(meta: ToolMeta, f: File): boolean {
  const parts = meta.accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const name = f.name.toLowerCase();
  const mime = (f.type || "").toLowerCase();
  return parts.some((p) => {
    if (p.startsWith(".")) return name.endsWith(p);
    if (p.endsWith("/*")) return mime.startsWith(p.slice(0, -1));
    return mime === p;
  });
}

function decodeXmlEntities(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/* ---------------- pdf.js 加载器（worker 路径与构建期 BASE_PATH 同律） ---------------- */

import {
  A4_H,
  A4_W,
  MARGIN,
  CONTENT_W,
  createCjkA4Doc,
  layoutFlowA4,
  wrapCjkText,
  groupPdfItemsIntoLines,
  cjkDisplayWidth,
  type FlowBlock,
  type PdfTextItem,
} from "@/lib/startpage/pdf-cjk";

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `${(process.env.NEXT_PUBLIC_BASE_PATH as string) || ""}/pdf.worker.min.mjs`;
  return pdfjs;
}

/* ---------------- v8.7.170 文字层转换管线 ----------------
 * 旧实现三大缺陷（用户实测「所有转换功能转换完都是有错误的」探针复现）：
 *   ① word2pdf/excel2pdf 走 html2canvas 光栅——输出无文字层（不可选/不可搜/
 *      放大糊，jsPDF JPEG 压缩后大文件），②ppt2pdf 走 jsPDF 默认 Helvetica——
 *      CJK 字节被硬塞 Latin-1 输出乱码，③pdf2word/pdf2excel 表格不还原。
 * 根修：统一走 @cantoo/pdf-lib + fontkit 运行时子集化嵌入 Noto Sans SC
 * （真实可选文字层），表格走飞鼠行分组/对齐口径（见 pdf-cjk.ts 致谢）。 */

const H_SIZES: Record<string, number> = { H1: 18, H2: 15, H3: 13, H4: 12, H5: 11, H6: 10.5 };

/* ---------------- 各功能实现（run 包装统一错误/状态） ---------------- */

/* ① 图片转 PDF */
async function toolImg2pdf(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (!files.length) throw new Error("请先选择图片");
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  setStatus(`合成 ${files.length} 张图片…`);
  const doc = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    setStatus(`嵌入 (${i + 1}/${files.length})：${f.name}`);
    const { data, kind } = await toEmbeddable(f);
    const img = kind === "jpg" ? await doc.embedJpg(data) : await doc.embedPng(data);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const bytes = await doc.save();
  downloadBlob(
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    "图片合集.pdf"
  );
  return `已生成「图片合集.pdf」（${files.length} 页）`;
}

/** 非 jpg/png 图片 → PNG（canvas 重编码），jpg/png 原样返回 */
async function toEmbeddable(file: File): Promise<{ data: ArrayBuffer; kind: "jpg" | "png" }> {
  if (file.type === "image/jpeg" || file.type === "image/jpg") {
    return { data: await file.arrayBuffer(), kind: "jpg" };
  }
  if (file.type === "image/png") {
    return { data: await file.arrayBuffer(), kind: "png" };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new window.Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error(`无法解码图片 ${file.name}`));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error(`图片重编码失败 ${file.name}`);
    return { data: await blob.arrayBuffer(), kind: "png" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ② Word 转 PDF：mammoth docx→块流 → @cantoo/pdf-lib CJK 文字层 A4 排版。
 *    v8.7.170 根修：输出真实可选/可搜文字层（旧 html2canvas 光栅件无文字层，
 *    jsPDF JPEG 压缩后大且糊）。版式语义（标题层级/段距/表格网格/跨页表头
 *    重复）参考飞鼠格式转换口径。 */
async function toolWord2pdf(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 .docx 文件");
  const f = files[0];
  setStatus("解析 Word 文档…");
  const mammoth = await import("mammoth");
  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer: await f.arrayBuffer() },
    { styleMap: ["p[style-name='Title'] => h1.doc-title:fresh", "p[style-name='Heading 1'] => h1.doc-h1:fresh"] }
  );
  setStatus("排版并输出 PDF…");
  const blocks = htmlToBlocks(html);
  const { doc, font, colors } = await createCjkA4Doc();
  const pages = await layoutFlowA4(doc, font, colors, blocks, {
    onNewPage: (pg, idx) => {
      pg.drawText(`${idx + 1}`, { x: A4_W - MARGIN, y: MARGIN - 16, size: 8, font, color: colors.gray });
    },
  });
  const bytes = await doc.save();
  downloadBlob(
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    `${baseName(f.name)}.pdf`
  );
  return `已生成「${baseName(f.name)}.pdf」（${pages} 页，可选取文字层）`;
}

/** mammoth HTML → 排版块流（标题层级/段落/列表/表格/内嵌图） */
function htmlToBlocks(html: string): FlowBlock[] {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const blocks: FlowBlock[] = [];
  const pushText = (text: string, size: number, gap: number, indent = 0) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t) blocks.push({ kind: "text", text: t, size, gapBefore: gap, indent, lineHeight: size * 1.5 });
  };
  const walk = (el: Element) => {
    for (const node of Array.from(el.children)) {
      const tag = node.tagName.toUpperCase();
      if (/^H[1-6]$/.test(tag)) {
        pushText(node.textContent || "", H_SIZES[tag] ?? 11, tag === "H1" ? 12 : 9);
      } else if (tag === "P") {
        /* 段落内嵌图（mammoth 输出 data URI img）：先图后文，图片不丢 */
        for (const img of Array.from(node.querySelectorAll("img"))) {
          if (/^data:image\/(png|jpeg);base64,/i.test(img.getAttribute("src") || "")) {
            blocks.push({ kind: "img", dataUri: img.getAttribute("src")! });
          }
        }
        pushText(node.textContent || "", 10.5, 4);
      } else if (tag === "UL" || tag === "OL") {
        Array.from(node.children).forEach((li, i) =>
          pushText(`${tag === "OL" ? `${i + 1}. ` : "• "}${li.textContent || ""}`, 10.5, 2, 18)
        );
      } else if (tag === "TABLE") {
        const rows: string[][] = [];
        for (const tr of Array.from(node.querySelectorAll("tr"))) {
          rows.push(Array.from(tr.querySelectorAll("td,th")).map((td) => (td.textContent || "").trim()));
        }
        if (rows.length) blocks.push({ kind: "table", rows, header: true });
      } else if (node.children.length) {
        walk(node);
      } else {
        pushText(node.textContent || "", 10.5, 4);
      }
    }
  };
  walk(dom.body);
  if (!blocks.length) throw new Error("未从 Word 文档解析到内容");
  return blocks;
}

/* ③ Excel 转 PDF：SheetJS 读表 → 网格块（首行表头/列宽 CJK 双宽计宽律/
 *    跨页表头重复）→ @cantoo/pdf-lib 文字层 A4。
 *    v8.7.170 根修：旧 sheet_to_html+html2canvas 光栅输出无文字层。 */
async function toolExcel2pdf(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个表格文件");
  const f = files[0];
  setStatus("解析表格…");
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
  const blocks: FlowBlock[] = [];
  for (const sn of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sn], {
      header: 1,
      defval: "",
      raw: false,
    });
    const rows = (aoa as unknown[]).map((r) =>
      Array.isArray(r) ? r.map((c) => String(c ?? "")) : [String(r ?? "")]
    );
    if (!rows.length) continue;
    blocks.push({ kind: "table", title: sn, titleGap: blocks.length ? 14 : 0, rows, header: true });
  }
  if (!blocks.length) throw new Error("未从表格文件解析到内容");
  setStatus("排版并输出 PDF…");
  const { doc, font, colors } = await createCjkA4Doc();
  const pages = await layoutFlowA4(doc, font, colors, blocks, {
    onNewPage: (pg, idx) => {
      pg.drawText(`${idx + 1}`, { x: A4_W - MARGIN, y: MARGIN - 16, size: 8, font, color: colors.gray });
    },
  });
  const bytes = await doc.save();
  downloadBlob(
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    `${baseName(f.name)}.pdf`
  );
  return `已生成「${baseName(f.name)}.pdf」（${wb.SheetNames.length} 张表 / ${pages} 页，可选取文字层）`;
}

/* ④ PPT 转 PDF：pptx 是 zip（fflate 直解）→ 每页提取 <a:t> 文本 →
 *    @cantoo/pdf-lib CJK 文字层横版（960×540）。
 *    v8.7.170 根修：旧 jsPDF 默认 Helvetica 不含 CJK 字形，中文全部输出
 *    乱码（探针实证：GBK 字节被硬塞 Latin-1）——改子集化嵌入 Noto Sans SC，
 *    标题/列点全部真实文字。 */
async function toolPpt2pdf(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 .pptx 文件");
  const f = files[0];
  setStatus("解包演示文稿…");
  const { unzipSync, strFromU8 } = await import("fflate");
  const zipped = unzipSync(new Uint8Array(await f.arrayBuffer()));
  const slideNames = Object.keys(zipped)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)![1]);
      const nb = Number(b.match(/slide(\d+)\.xml$/)![1]);
      return na - nb;
    });
  if (!slideNames.length) throw new Error("未找到幻灯片内容（仅支持 .pptx）");
  setStatus(`转换 ${slideNames.length} 页…`);
  const { doc, font, colors, rgbRaw } = await createCjkA4Doc();
  const SW = 960;
  const SH = 540;
  for (let i = 0; i < slideNames.length; i++) {
    const xml = strFromU8(zipped[slideNames[i]]);
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((m) => decodeXmlEntities(m[1]).trim())
      .filter(Boolean);
    const pg = doc.addPage([SW, SH]);
    /* 深底白字横版：标题 + 列点（文字重构方案，真实可选文字层） */
    pg.drawRectangle({ x: 0, y: 0, width: SW, height: SH, color: colors.heading });
    if (texts.length) {
      let ty = SH - 120;
      for (const line of wrapCjkText(texts[0], SW - 144, 30, font).slice(0, 2)) {
        pg.drawText(line, { x: 72, y: ty, size: 30, font, color: colors.white });
        ty -= 42;
      }
      let y = ty - 26;
      for (const t of texts.slice(1, 9)) {
        if (y < 72) break;
        for (const line of wrapCjkText(t, SW - 192, 16, font)) {
          if (y < 72) break;
          pg.drawText(line, { x: 96, y, size: 16, font, color: rgbRaw.sub });
          y -= 28;
        }
        y -= 8;
      }
    }
    pg.drawText(`${i + 1} / ${slideNames.length}`, {
      x: SW - 90,
      y: 30,
      size: 10,
      font,
      color: rgbRaw.pageNum,
    });
  }
  const bytes = await doc.save();
  downloadBlob(
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    `${baseName(f.name)}.pdf`
  );
  return `已生成「${baseName(f.name)}.pdf」（${slideNames.length} 页，文字重构版式）`;
}

/* ⑤ PDF 转 Word：飞鼠行分组/表格对齐口径移植（牢蜂 LaoFeng，非商用许可）
 *    → 段落 + 真实 docx Table + 高度启发式标题判级。
 *    v8.7.170 根修：旧实现 y 容差拼行只出段落流，表格内容散落成普通段落
 *    （探针实证「表格还原为 docx 表」FAIL）——现按 groupPdfItemsIntoLines
 *    的片段对齐律升格表格行（相邻行同列数且逐列 x 对齐 ±10px），连续对齐
 *    行合并为 docx Table；行高 ≥ 正文中位数 ×1.5 判一级标题、×1.25 判二级。 */
async function toolPdf2word(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
  const f = files[0];
  const pdfjs = await loadPdfJs();
  setStatus("解析 PDF…");
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
  } = await import("docx");
  const children: (
    | InstanceType<typeof Paragraph>
    | InstanceType<typeof Table>
  )[] = [];
  let tableCount = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    setStatus(`解析第 ${i}/${doc.numPages} 页…`);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    /* 飞鼠 groupPdfItemsIntoLines 口径：行聚类（高度自适应容差）+ CJK 相邻
       零空格 + 片段切分 + aligned 表格行判定 */
    const lines = groupPdfItemsIntoLines(tc.items as PdfTextItem[]);
    const heights = lines.map((l) => l.height).sort((a, b) => a - b);
    const bodyH = heights.length ? heights[Math.floor(heights.length / 2)] : 10;
    children.push(
      new Paragraph({
        text: `第 ${i} 页`,
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: i > 1,
      })
    );
    let k = 0;
    while (k < lines.length) {
      const line = lines[k];
      if (line.cells.length > 1) {
        /* 连续同列数对齐行 → docx Table（飞鼠表格行语义） */
        const cols = line.cells.length;
        const tbl: string[][] = [];
        while (k < lines.length && lines[k].cells.length === cols) {
          tbl.push(lines[k].cells);
          k++;
        }
        if (tbl.length) {
          tableCount += 1;
          children.push(buildDocxTable(tbl, { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle }));
          continue;
        }
      }
      const t = line.text.trim();
      if (t) {
        if (line.height >= bodyH * 1.5 && t.length < 40) {
          children.push(new Paragraph({ text: t, heading: HeadingLevel.HEADING_1 }));
        } else if (line.height >= bodyH * 1.25 && t.length < 60) {
          children.push(new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 }));
        } else {
          children.push(new Paragraph({ text: t }));
        }
      }
      k++;
    }
  }
  if (!children.length) throw new Error("未提取到文本（可能是扫描件，请用 OCR 文字识别）");
  const docx = new Document({ sections: [{ properties: {}, children }] });
  setStatus("生成 Word 文档…");
  const blob = await Packer.toBlob(docx);
  downloadBlob(blob, `${baseName(f.name)}.docx`);
  return `已生成「${baseName(f.name)}.docx」（${doc.numPages} 页 / ${tableCount} 张表格，表格已还原为可编辑表）`;
}

/** docx Table 构建（等宽列 + 灰边框 + 中文 eastAsia 字体声明） */
function buildDocxTable(
  rows: string[][],
  libs: {
    Paragraph: typeof import("docx").Paragraph;
    TextRun: typeof import("docx").TextRun;
    Table: typeof import("docx").Table;
    TableRow: typeof import("docx").TableRow;
    TableCell: typeof import("docx").TableCell;
    WidthType: typeof import("docx").WidthType;
    BorderStyle: typeof import("docx").BorderStyle;
  }
): import("docx").Table {
  const border = { style: libs.BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new libs.Table({
    width: { size: 100, type: libs.WidthType.PERCENTAGE },
    rows: rows.map(
      (cells) =>
        new libs.TableRow({
          children: cells.map(
            (c) =>
              new libs.TableCell({
                width: { size: Math.floor(100 / Math.max(1, cells.length)), type: libs.WidthType.PERCENTAGE },
                borders,
                children: [
                  new libs.Paragraph({
                    children: [
                      new libs.TextRun({
                        text: String(c ?? ""),
                        font: { eastAsia: "Microsoft YaHei", hAnsi: "Calibri" },
                      }),
                    ],
                  }),
                ],
              })
          ),
        })
    ),
  });
}

/* ⑥ PDF 转 Excel：飞鼠行分组 + aligned 表格行口径（牢蜂 LaoFeng，非商用许可）
 *    → SheetJS 网格 + 列宽（CJK 双宽计宽律）。
 *    v8.7.170 根修：旧实现固定 y 容差 + x 间隙拆列——正文段落被切成碎格、
 *    表头行对不齐（探针实证）。现 rows = lines.map(cells)：定位词单行整格、
 *    对齐行升格单元格，列宽按内容 CJK 双宽计算（飞鼠 applyColumnWidths 简化口径）。 */
async function toolPdf2excel(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
  const f = files[0];
  const pdfjs = await loadPdfJs();
  setStatus("解析 PDF…");
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (let i = 1; i <= doc.numPages; i++) {
    setStatus(`还原第 ${i}/${doc.numPages} 页表格…`);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    /* 飞鼠 groupPdfItemsIntoRows 口径：rows = lines.map(cells) */
    const lines = groupPdfItemsIntoLines(tc.items as PdfTextItem[]);
    const rows = lines.map((l) => l.cells).filter((r) => r.some((c) => c.trim()));
    const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [["（本页未提取到文本）"]]);
    ws["!cols"] = computeXlsxColWidths(rows);
    XLSX.utils.book_append_sheet(wb, ws, `第${i}页`);
  }
  /* v8.7.164：XLSX.writeFile 在扩展页会丢下载名（blob 触发链不同），
   * 统一改 XLSX.write + downloadBlob 锚点下载 */
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as unknown as ArrayBuffer;
  downloadBlob(
    new Blob([bytes as unknown as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${baseName(f.name)}.xlsx`
  );
  return `已生成「${baseName(f.name)}.xlsx」（${doc.numPages} 张工作表，表格网格已还原）`;
}

/** xlsx 列宽（飞鼠 pdfCellDisplayWidth/applyColumnWidths 简化口径：内容宽 + 2，上限 48） */
function computeXlsxColWidths(rows: string[][]): { wch: number }[] {
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const widths = Array<number>(cols).fill(8);
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i], Math.min(cjkDisplayWidth(cell) + 2, 48));
    });
  }
  return widths.map((w) => ({ wch: Math.round(w * 100) / 100 }));
}

/* ⑦ PDF 转 PPT：pdf.js 每页 2x PNG → pptxgenjs 16:9 全幅图片型 */
async function toolPdf2ppt(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
  const f = files[0];
  const pdfjs = await loadPdfJs();
  setStatus("解析 PDF…");
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "W16x9", width: 13.333, height: 7.5 });
  pptx.layout = "W16x9";
  for (let i = 1; i <= doc.numPages; i++) {
    setStatus(`渲染第 ${i}/${doc.numPages} 页…`);
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    const slide = pptx.addSlide();
    slide.addImage({
      data: canvas.toDataURL("image/png"),
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
    });
  }
  await pptx.writeFile({ fileName: `${baseName(f.name)}.pptx` });
  return `已生成「${baseName(f.name)}.pptx」（${doc.numPages} 页，图片型幻灯片）`;
}

/* ⑧ PDF 转图片（原 v8.7.52 实现：2x PNG，多页 zip） */
async function toolPdf2img(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
  const f = files[0];
  const pdfjs = await loadPdfJs();
  setStatus("解析 PDF…");
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const zipBag: Record<string, Uint8Array> = {};
  const single = doc.numPages === 1;
  for (let i = 1; i <= doc.numPages; i++) {
    setStatus(`渲染第 ${i}/${doc.numPages} 页…`);
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/png")
    );
    if (!blob) throw new Error(`第 ${i} 页导出失败`);
    const name = `${baseName(f.name)}-第${i}页.png`;
    if (single) {
      downloadBlob(blob, name);
    } else {
      zipBag[name] = new Uint8Array(await blob.arrayBuffer());
    }
  }
  if (single) return "已导出 1 张 PNG";
  const { zipSync } = await import("fflate");
  setStatus("打包 zip…");
  const zipped = zipSync(zipBag);
  downloadBlob(
    new Blob([zipped as unknown as BlobPart], { type: "application/zip" }),
    `${baseName(f.name)}-图片.zip`
  );
  return `已导出 ${doc.numPages} 页 PNG 并打包 zip`;
}

/* ⑨ PDF 合并（原实现，迁移至 @cantoo/pdf-lib） */
async function toolMerge(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length < 2) throw new Error("请选择至少 2 个 PDF 文件");
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  setStatus(`合并 ${files.length} 个文件…`);
  const out = await PDFDocument.create();
  let pages = 0;
  for (let i = 0; i < files.length; i++) {
    setStatus(`合并 (${i + 1}/${files.length})：${files[i].name}`);
    const src = await PDFDocument.load(await files[i].arrayBuffer(), {
      ignoreEncryption: true,
    });
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
    pages += copied.length;
  }
  const bytes = await out.save();
  downloadBlob(
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    "合并文档.pdf"
  );
  return `已生成「合并文档.pdf」（${files.length} 个文件 / ${pages} 页）`;
}

/* ⑩ PDF 拆分：逐页/每组 N 页独立 PDF，多组打包 zip（飞鼠格式同款每组 N 页） */
async function toolSplit(
  files: File[],
  perGroup: number,
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
  const pg = Math.max(1, Math.min(99, Math.floor(perGroup || 1)));
  const f = files[0];
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  setStatus("解析 PDF…");
  const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
  const n = src.getPageCount();
  if (n === 1) {
    const bytes = await src.save();
    downloadBlob(
      new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
      `${baseName(f.name)}.pdf`
    );
    return "该 PDF 只有 1 页，已原样导出";
  }
  const zipBag: Record<string, Uint8Array> = {};
  let group = 0;
  for (let start = 0; start < n; start += pg) {
    const end = Math.min(start + pg, n);
    group += 1;
    setStatus(`拆出第 ${start + 1}-${end} 页…`);
    const single = await PDFDocument.create();
    const copied = await single.copyPages(src, Array.from({ length: end - start }, (_, k) => start + k));
    copied.forEach((p) => single.addPage(p));
    const bytes = await single.save();
    const range = pg === 1 ? `第${start + 1}页` : `第${start + 1}-${end}页`;
    zipBag[`${baseName(f.name)}-${range}.pdf`] = bytes;
  }
  const { zipSync } = await import("fflate");
  setStatus("打包 zip…");
  const zipped = zipSync(zipBag);
  downloadBlob(
    new Blob([zipped as unknown as BlobPart], { type: "application/zip" }),
    `${baseName(f.name)}-拆分.zip`
  );
  return `已拆分为 ${group} 个 PDF（每组 ${pg} 页）并打包 zip`;
}

/* ⑪ PDF 加密：@cantoo/pdf-lib AES-256 */
async function toolEncrypt(
  files: File[],
  pwd1: string,
  pwd2: string,
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
  if (!pwd1) throw new Error("请输入打开密码");
  if (pwd1 !== pwd2) throw new Error("两次输入的密码不一致");
  const f = files[0];
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  setStatus("加密中…");
  const doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
  doc.encrypt({ userPassword: pwd1, ownerPassword: pwd1 });
  const bytes = await doc.save();
  downloadBlob(
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    `${baseName(f.name)}-加密.pdf`
  );
  return `已生成「${baseName(f.name)}-加密.pdf」（AES-256，打开需密码）`;
}

/* ⑫ PDF 解密：带密码载入 → 导出无密码副本 */
async function toolDecrypt(
  files: File[],
  pwd: string,
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
  if (!pwd) throw new Error("请输入密码");
  const f = files[0];
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  setStatus("解密中…");
  let doc;
  try {
    doc = await PDFDocument.load(await f.arrayBuffer(), { password: pwd });
  } catch {
    throw new Error("密码错误或文件已损坏");
  }
  const bytes = await doc.save();
  downloadBlob(
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    `${baseName(f.name)}-解密.pdf`
  );
  return `已生成「${baseName(f.name)}-解密.pdf」（无密码副本）`;
}

/* ⑬ 提取文本（原实现） */
async function toolText(
  files: File[],
  setStatus: (s: string) => void
): Promise<{ msg: string; text: string }> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
  const f = files[0];
  const pdfjs = await loadPdfJs();
  setStatus("解析 PDF…");
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    setStatus(`提取第 ${i}/${doc.numPages} 页…`);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const line = tc.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    parts.push(`【第 ${i} 页】\n${line}`);
  }
  const text = parts.join("\n\n");
  downloadBlob(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
    `${baseName(f.name)}-文本.txt`
  );
  return {
    msg: `已提取 ${doc.numPages} 页文本并下载 txt`,
    text: text.slice(0, 4000) + (text.length > 4000 ? "\n…（全文已含在下载文件中）" : ""),
  };
}

/* ⑭ OCR 文字识别（v8.7.166 双轨）：pdf.js 逐页光栅化（~300dpi）→ 灰度归一化
 *  → 本地桥接（轨道 B）优先，未命中自动落浏览器 tesseract.js（轨道 A）。
 *  逐页独立识别，单页失败不拖垮整份（留占位继续） */
type OcrLang = "chi_sim+eng" | "chi_sim" | "eng";

async function canvasToBase64(canvas: HTMLCanvasElement): Promise<string> {
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("页面 PNG 导出失败");
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) {
    s += String.fromCharCode(...buf.subarray(i, i + CH));
  }
  return btoa(s);
}

async function toolOcr(
  files: File[],
  lang: OcrLang,
  setStatus: (s: string) => void
): Promise<{ msg: string; text: string }> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
  const f = files[0];
  const pdfjs = await loadPdfJs();
  setStatus("解析 PDF…");
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  /* 轨道判定：探活本地桥接（60s 粘滞），未命中落浏览器引擎 */
  setStatus("探测本地 OCR 引擎…");
  const bridge = await probePdfBridge();
  let engine: "bridge" | "browser" = bridge ? "bridge" : "browser";
  const engineLabel = engine === "bridge"
    ? `本地引擎（${bridge!.base.replace("http://", "")}）`
    : "浏览器引擎（语言包首次需联网下载，之后离线可用）";
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    setStatus(`识别第 ${i}/${doc.numPages} 页…（${engineLabel}）`);
    const page = await doc.getPage(i);
    /* 300dpi 口径：A4 竖版 1x 宽 612pt，目标 ~2200px（内存与精度平衡） */
    const p1 = page.getViewport({ scale: 1 });
    const scale = Math.min(3, Math.max(1.5, 2200 / p1.width));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    preprocessCanvas(canvas);
    let pageText = "";
    if (engine === "bridge") {
      try {
        pageText = await bridgeOcr(bridge!.base, await canvasToBase64(canvas), lang);
      } catch {
        /* 桥中途掉线（关机/退出）→ 本页起自动落浏览器轨道，不打断整体 */
        engine = "browser";
        setStatus(`本地引擎失联，第 ${i} 页起切换浏览器引擎…`);
        pageText = "";
      }
    }
    if (engine === "browser") {
      pageText = await browserOcrCanvas(canvas, lang, (p) => {
        if (p.status.includes("recognizing")) {
          setStatus(`识别第 ${i}/${doc.numPages} 页…（浏览器引擎 ${Math.round(p.progress * 100)}%）`);
        }
      });
    }
    const clean = pageText.replace(/\n{3,}/g, "\n\n").trim();
    parts.push(`【第 ${i} 页】\n${clean || "（本页未识别出文字）"}`);
  }
  const text = parts.join("\n\n");
  const got = parts.filter((p) => !p.endsWith("（本页未识别出文字）")).length;
  if (!got) {
    throw new Error(
      "未识别出文字——请确认 PDF 是扫描件且文字清晰可辨，或改用「提取文本」（文字型 PDF 更快更准）"
    );
  }
  downloadBlob(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
    `${baseName(f.name)}-OCR文本.txt`
  );
  return {
    msg: `OCR 完成（${engine === "bridge" ? "本地引擎" : "浏览器引擎"}）：${got}/${doc.numPages} 页识别出文字，txt 已下载`,
    text: text.slice(0, 6000) + (text.length > 6000 ? "\n…（全文已含在下载文件中）" : ""),
  };
}

/* ================= 组件 ================= */

export default function PdfTools({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  /* v8.7.155 背景冻结律：纱罩打开期暂停极光/kenburns（globals.cs-bg-frozen） */
  useBgFreeze(open);
  const [host] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.body
  );
  const [tool, setTool] = useState<ToolId>("img2pdf");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [doneMsg, setDoneMsg] = useState("");
  const [err, setErr] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [textOut, setTextOut] = useState("");
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [splitEvery, setSplitEvery] = useState(1);
  /* v8.7.166 OCR 语言：默认中英混合（中文用户主口径），eng 更小更快 */
  const [ocrLang, setOcrLang] = useState<"chi_sim+eng" | "chi_sim" | "eng">("chi_sim+eng");
  /* v8.7.167 本地引擎探测态：undefined=探测中 / null=未运行 / info=已就绪 */
  const [bridgeState, setBridgeState] = useState<PdfBridgeInfo | null | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reduceMotion = useReducedMotion();
  const meta = TOOLS.find((t) => t.id === tool)!;

  /* 打开面板即重置全部状态（tool 保留，文件不跨会话残留） */
  useEffect(() => {
    if (open) {
      setFiles([]);
      setBusy(false);
      setStatus("");
      setDoneMsg("");
      setErr("");
      setTextOut("");
      setPwd1("");
      setPwd2("");
      setSplitEvery(1);
      setOcrLang("chi_sim+eng");
      setBridgeState(undefined);
    }
  }, [open]);

  /* v8.7.167 选中 OCR 即探活本地引擎（60s 粘滞缓存复用，不额外扫口） */
  useEffect(() => {
    if (!open || tool !== "ocr") return;
    let alive = true;
    setBridgeState(undefined);
    probePdfBridge()
      .then((info) => {
        if (alive) setBridgeState(info);
      })
      .catch(() => {
        if (alive) setBridgeState(null);
      });
    return () => {
      alive = false;
    };
  }, [open, tool]);

  /* Esc 捕获拦截：开着时 Esc 只关本面板，不穿透全局链 */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  function pickFiles() {
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    input.accept = meta.accept;
    input.multiple = meta.multiple;
    input.click();
  }

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    /* v8.7.164 前置类型校验：accept 是软限制（拖入/手动全选可绕过），
     * 不匹配直接红字提示而非让深层引擎报玄学错 */
    const ok = list.filter((f) => acceptOk(meta, f));
    const bad = list.filter((f) => !acceptOk(meta, f));
    if (ok.length) {
      setFiles((prev) => {
        /* 同名同大小去重（重复拖选同一文件） */
        const seen = new Set(prev.map((f) => f.name + ":" + f.size));
        return [...prev, ...ok.filter((f) => !seen.has(f.name + ":" + f.size))];
      });
    }
    if (bad.length) {
      const hint = meta.id === "word2pdf" ? "仅支持 .docx（.doc 请先用 Word 另存为 .docx）" : `需要：${meta.accept}`;
      setErr(`不支持的文件类型：${bad.map((f) => f.name).join("、")} —— ${hint}`);
    } else {
      setErr("");
    }
    setDoneMsg("");
  }

  function selectTool(id: ToolId) {
    setTool(id);
    setFiles([]);
    setDoneMsg("");
    setErr("");
    setTextOut("");
    setPwd1("");
    setPwd2("");
    setSplitEvery(1);
    setOcrLang("chi_sim+eng");
  }

  function moveFile(i: number, dir: -1 | 1) {
    setFiles((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, k) => k !== i));
  }

  async function run() {
    if (busy) return;
    setBusy(true);
    setErr("");
    setDoneMsg("");
    setTextOut("");
    try {
      let msg: string;
      if (tool === "img2pdf") msg = await toolImg2pdf(files, setStatus);
      else if (tool === "word2pdf") msg = await toolWord2pdf(files, setStatus);
      else if (tool === "excel2pdf") msg = await toolExcel2pdf(files, setStatus);
      else if (tool === "ppt2pdf") msg = await toolPpt2pdf(files, setStatus);
      else if (tool === "pdf2word") msg = await toolPdf2word(files, setStatus);
      else if (tool === "pdf2excel") msg = await toolPdf2excel(files, setStatus);
      else if (tool === "pdf2ppt") msg = await toolPdf2ppt(files, setStatus);
      else if (tool === "pdf2img") msg = await toolPdf2img(files, setStatus);
      else if (tool === "merge") msg = await toolMerge(files, setStatus);
      else if (tool === "split") msg = await toolSplit(files, splitEvery, setStatus);
      else if (tool === "encrypt") msg = await toolEncrypt(files, pwd1, pwd2, setStatus);
      else if (tool === "decrypt") msg = await toolDecrypt(files, pwd1, setStatus);
      else if (tool === "ocr") {
        const r = await toolOcr(files, ocrLang, setStatus);
        msg = r.msg;
        setTextOut(r.text);
      }
      else {
        const r = await toolText(files, setStatus);
        msg = r.msg;
        setTextOut(r.text);
      }
      setDoneMsg(msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  if (!host) return null;

  const groups: ToolMeta["group"][] = ["convert", "process"];
  const accent = "var(--ui-accent, #8b5cf6)";

  return createPortal(
    <AnimatePresence>
      {open && (
        <PresenceClass
          key="pdf-tools-overlay"
          exitClass="veil-out"
          duration={0.3}
          className="veil-in cl-screen-veil fixed inset-0 z-[60] flex items-center justify-center bg-white/10 px-4 backdrop-blur-md backdrop-saturate-150 dark:bg-black/10"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="PDF 工具箱"
        >
          {/* v8.7.53 弹窗动画统一律：开 = SPRING_CARD 弹簧 + .card-in 显影；
              关 = .palette-out（30% 处微胀再收）。正文区挂 .content-focus——
              关闭路径由 .palette-out .content-focus 级联散场（0.16s），
              与卡片收场（0.26s）同步，子元素不再「面板消失后过一会才消失」 */}
          <PresenceClass
            initial={reduceMotion ? false : { y: -20, scale: 0.88 }}
            animate={{ y: 0, scale: 1 }}
            transition={SPRING_CARD}
            exitClass="palette-out"
            duration={0.26}
            style={{ transformOrigin: "top center", willChange: "transform" }}
            className="card-in glass-card slim-scroll flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl"
          >
            {/* 顶栏 */}
            <div className="content-focus flex items-center gap-2 border-b border-zinc-900/5 px-5 py-3 dark:border-white/5">
              <FileText className="h-4 w-4 text-zinc-500 dark:text-zinc-400" strokeWidth={1.5} />
              <p className="text-sm font-light tracking-wide text-zinc-800 dark:text-zinc-100">
                PDF 工具箱
              </p>
              <p className="hidden text-[10px] font-extralight tracking-wider text-zinc-400 dark:text-zinc-500 sm:inline">
                全程本地处理 · 文件不上传
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭 PDF 工具箱"
                className="ml-auto rounded-full p-1.5 text-zinc-400 opacity-70 transition-all duration-200 hover:bg-zinc-900/5 hover:opacity-100 dark:text-zinc-500 dark:hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>

            {/* 宫格选择区（itab PDF 转换大师同构：两组宫格 + 强调色选中态） */}
            <div className="content-focus slim-scroll overflow-y-auto px-5 pb-1 pt-4">
              {groups.map((g) => (
                <div key={g} className="mb-3">
                  <p className="mb-2 text-[10px] font-extralight tracking-widest text-zinc-400 dark:text-zinc-500">
                    {GROUP_TITLE[g]}
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {TOOLS.filter((t) => t.group === g).map((t) => {
                      const on = t.id === tool;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => selectTool(t.id)}
                          aria-pressed={on}
                          className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-all duration-200 ${
                            on
                              ? "shadow-sm"
                              : "border-zinc-900/[0.08] hover:border-zinc-900/20 hover:bg-zinc-900/[0.03] dark:border-white/[0.08] dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
                          }`}
                          style={
                            on
                              ? {
                                  borderColor: accent,
                                  background: `color-mix(in srgb, ${accent} 9%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-lg"
                            style={
                              on
                                ? {
                                    background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                                    color: accent,
                                  }
                                : {
                                    background:
                                      "color-mix(in srgb, currentColor 6%, transparent)",
                                  }
                            }
                          >
                            {t.icon}
                          </span>
                          <span
                            className={`text-[11px] font-light leading-none ${
                              on
                                ? "text-zinc-900 dark:text-zinc-50"
                                : "text-zinc-600 dark:text-zinc-300"
                            }`}
                          >
                            {t.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 操作区 */}
            <div className="content-focus slim-scroll overflow-y-auto border-t border-zinc-900/5 px-5 py-4 dark:border-white/5">
              <p className="mb-3 text-[11px] font-extralight leading-relaxed text-zinc-500 dark:text-zinc-400">
                {meta.desc}
              </p>

              {meta.password && (
                <div className="mb-3 flex flex-col gap-2">
                  <input
                    type="password"
                    value={pwd1}
                    onChange={(e) => setPwd1(e.target.value)}
                    placeholder={tool === "encrypt" ? "设置打开密码" : "输入打开密码"}
                    autoComplete="new-password"
                    className="h-9 rounded-xl border border-zinc-900/10 bg-zinc-900/[0.02] px-3 text-xs font-light text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900/25 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/30"
                  />
                  {meta.passwordConfirm && (
                    <input
                      type="password"
                      value={pwd2}
                      onChange={(e) => setPwd2(e.target.value)}
                      placeholder="再次输入密码确认"
                      autoComplete="new-password"
                      className="h-9 rounded-xl border border-zinc-900/10 bg-zinc-900/[0.02] px-3 text-xs font-light text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900/25 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/30"
                    />
                  )}
                </div>
              )}

              {tool === "split" && (
                <div className="mb-3 flex items-center gap-2">
                  <label
                    htmlFor="pdf-split-every"
                    className="shrink-0 text-[11px] font-extralight text-zinc-500 dark:text-zinc-400"
                  >
                    每组页数
                  </label>
                  <input
                    id="pdf-split-every"
                    type="number"
                    min={1}
                    max={99}
                    value={splitEvery}
                    onChange={(e) =>
                      setSplitEvery(Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))))
                    }
                    aria-label="每组页数"
                    className="h-9 w-20 rounded-xl border border-zinc-900/10 bg-zinc-900/[0.02] px-3 text-xs font-light text-zinc-800 outline-none transition-colors focus:border-zinc-900/25 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:focus:border-white/30"
                  />
                  <span className="text-[10px] font-extralight leading-tight text-zinc-400 dark:text-zinc-500">
                    1 = 每页一个文件；N = 每 N 页合为一个文件
                  </span>
                </div>
              )}

              {tool === "ocr" && (
                <div className="mb-3 flex items-center gap-2">
                  <label
                    htmlFor="pdf-ocr-lang"
                    className="shrink-0 text-[11px] font-extralight text-zinc-500 dark:text-zinc-400"
                  >
                    识别语言
                  </label>
                  <select
                    id="pdf-ocr-lang"
                    value={ocrLang}
                    onChange={(e) => setOcrLang(e.target.value as "chi_sim+eng" | "chi_sim" | "eng")}
                    aria-label="识别语言"
                    className="h-9 rounded-xl border border-zinc-900/10 bg-zinc-900/[0.02] px-3 text-xs font-light text-zinc-800 outline-none transition-colors focus:border-zinc-900/25 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:focus:border-white/30"
                  >
                    <option value="chi_sim+eng">中英文混合（推荐）</option>
                    <option value="chi_sim">仅简体中文</option>
                    <option value="eng">仅英文（语言包更小）</option>
                  </select>
                  <span className="text-[10px] font-extralight leading-tight text-zinc-400 dark:text-zinc-500">
                    语言包首次使用需联网下载，之后自动缓存离线可用
                  </span>
                </div>
              )}

              {/* v8.7.167 本地引擎状态 + 下载入口（与预设导入面板「开发工具」
                  下载入口同款交互：探活在位显示引擎态，不在位给官方 Releases
                  直链；链接恒在，用户自行取用） */}
              {tool === "ocr" && (
                <div className="mb-3 rounded-xl border border-zinc-900/[0.06] bg-zinc-900/[0.02] px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.04]">
                  {bridgeState === undefined ? (
                    <p className="text-[10px] font-extralight leading-relaxed text-zinc-400 dark:text-zinc-500">
                      正在探测本地 OCR 引擎…
                    </p>
                  ) : bridgeState ? (
                    <p
                      className="flex items-center gap-1.5 text-[10px] font-extralight leading-relaxed"
                      style={{ color: accent }}
                    >
                      <PlugZap className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                      本地引擎已就绪（{bridgeState.base.replace("http://", "")}）——本次识别将走本机原生
                      Tesseract，更快且完全离线
                    </p>
                  ) : (
                    <>
                      <p className="text-[10px] font-extralight leading-relaxed text-zinc-500 dark:text-zinc-400">
                        可选增强：未检测到本地引擎，当前用浏览器内置引擎（识别稍慢、语言包首次需联网）。
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <a
                          href={BRIDGE_DOWNLOAD_URL}
                          target="_blank"
                          rel="noreferrer"
                          title="下载本地 OCR 引擎（Windows 免安装包，来源为本项目官方 GitHub Releases）"
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-light text-zinc-600 transition-colors duration-150 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-zinc-50"
                        >
                          <Download className="h-3 w-3" strokeWidth={1.5} />
                          下载 Windows 本地引擎（约 55 MB）
                        </a>
                        <span className="text-[10px] font-extralight text-zinc-400 dark:text-zinc-500">
                          解压后双击 chushi-pdf-bridge.exe（SmartScreen 提示点「仍要运行」），回本页自动启用
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div
                role="button"
                tabIndex={0}
                onClick={pickFiles}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pickFiles();
                  }
                }}
                className="mb-3 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-900/15 py-5 transition-colors duration-200 hover:border-zinc-900/30 hover:bg-zinc-900/[0.03] dark:border-white/15 dark:hover:border-white/30 dark:hover:bg-white/[0.04]"
              >
                <FolderOutput className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
                <p className="text-xs font-light text-zinc-600 dark:text-zinc-300">
                  点击选择{meta.multiple ? "（可多选）" : ""}
                </p>
                <p className="text-[10px] font-extralight text-zinc-400 dark:text-zinc-500">
                  {tool === "img2pdf"
                    ? "支持 JPG / PNG / WebP / GIF / BMP / AVIF"
                    : tool === "word2pdf"
                      ? "支持 .docx"
                      : tool === "excel2pdf"
                        ? "支持 .xlsx / .xls"
                        : tool === "ppt2pdf"
                          ? "支持 .pptx"
                          : "PDF 文件"}
                </p>
              </div>
              <input ref={inputRef} type="file" hidden onChange={onPicked} />

              {files.length > 0 && (
                <ul className="mb-3 flex flex-col gap-1.5">
                  {files.map((f, i) => (
                    <li
                      key={f.name + ":" + f.size + ":" + i}
                      className="flex items-center gap-2 rounded-lg border border-zinc-900/[0.06] bg-zinc-900/[0.02] px-3 py-1.5 dark:border-white/[0.07] dark:bg-white/[0.04]"
                    >
                      <span className="w-5 text-center text-[10px] font-light text-zinc-400 dark:text-zinc-500">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-light text-zinc-700 dark:text-zinc-200">
                        {f.name}
                      </span>
                      <span className="shrink-0 text-[10px] font-extralight text-zinc-400 dark:text-zinc-500">
                        {fmtSize(f.size)}
                      </span>
                      {meta.multiple && (
                        <span className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            aria-label="上移"
                            disabled={i === 0}
                            onClick={() => moveFile(i, -1)}
                            className="rounded px-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label="下移"
                            disabled={i === files.length - 1}
                            onClick={() => moveFile(i, 1)}
                            className="rounded px-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                          >
                            ↓
                          </button>
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label="移除"
                        onClick={() => removeFile(i)}
                        className="shrink-0 rounded-full p-0.5 text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                      >
                        <X className="h-3 w-3" strokeWidth={1.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                disabled={busy || files.length === 0}
                onClick={run}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-light tracking-wide text-white transition-opacity duration-200 disabled:opacity-40"
                style={{ background: accent }}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
                {busy
                  ? status || "处理中…"
                  : tool === "encrypt"
                    ? "加密并下载"
                    : tool === "decrypt"
                      ? "解密并下载"
                      : tool === "split"
                        ? "开始拆分"
                        : tool === "merge"
                          ? "开始合并"
                          : tool === "text"
                            ? "提取文本"
                            : tool === "ocr"
                              ? "开始识别"
                              : "开始转换"}
              </button>

              {doneMsg && (
                <p
                  className="mb-2 flex items-center gap-1.5 text-[11px] font-light"
                  style={{ color: accent }}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {doneMsg}
                </p>
              )}
              {err && (
                <p className="mb-2 text-[11px] font-light text-red-500 dark:text-red-400">
                  {err}
                </p>
              )}
              {textOut && (
                <pre className="slim-scroll max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-zinc-900/[0.06] bg-zinc-900/[0.02] p-3 text-[11px] font-light leading-relaxed text-zinc-600 dark:border-white/[0.07] dark:bg-white/[0.04] dark:text-zinc-300">
                  {textOut}
                </pre>
              )}
            </div>
          </PresenceClass>
        </PresenceClass>
      )}
    </AnimatePresence>,
    host
  );
}

