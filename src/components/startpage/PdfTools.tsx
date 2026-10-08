"use client";

/* ============================================================
 * 「初始」PDF 工具箱（v8.7.52 落地 / v8.7.55 重构）
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
 *   html2canvas + jspdf：Word/Excel → HTML 排版 → 光栅化 → A4 分页；
 *   docx：PDF 文本 → .docx（每页标题 + 段落）；
 *   pptxgenjs：PDF 每页 2x PNG → 16:9 全幅图片型 .pptx。
 *
 * 保真度声明（诚实降级，UI 内注明）：
 *   Word/Excel → PDF 走「HTML 重排版 + 光栅化」（视觉保真、文字不可选）；
 *   PPT → PDF 走「文本重构」（提取每页标题与列点，不含原始图形元素）；
 *   PDF → Word/Excel 走「文本流转换」（版式简化为段落/表格行列）。
 * ============================================================ */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, useReducedMotion } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
import { SPRING_CARD } from "./CommandPalette";
import {
  Check,
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
  Presentation,
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
  | "text";

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
    accept: "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif",
    multiple: true,
  },
  {
    id: "word2pdf",
    name: "Word 转 PDF",
    desc: "docx 文档转 PDF（HTML 重排版，视觉保真）",
    icon: <FileType strokeWidth={1.5} />,
    group: "convert",
    accept: ".docx",
    multiple: false,
  },
  {
    id: "excel2pdf",
    name: "Excel 转 PDF",
    desc: "表格转 PDF，每张工作表一页（HTML 重排版）",
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
    accept: "application/pdf",
    multiple: false,
  },
  {
    id: "pdf2excel",
    name: "PDF 转 Excel",
    desc: "按坐标还原表格结构，每页一张工作表",
    icon: <FileSpreadsheet strokeWidth={1.5} />,
    group: "convert",
    accept: "application/pdf",
    multiple: false,
  },
  {
    id: "pdf2ppt",
    name: "PDF 转 PPT",
    desc: "每页渲染成图片，生成 16:9 演示文稿",
    icon: <Presentation strokeWidth={1.5} />,
    group: "convert",
    accept: "application/pdf",
    multiple: false,
  },
  {
    id: "pdf2img",
    name: "PDF 转图片",
    desc: "每一页渲染成 PNG，多页自动打包 zip",
    icon: <Images strokeWidth={1.5} />,
    group: "convert",
    accept: "application/pdf",
    multiple: false,
  },
  {
    id: "merge",
    name: "PDF 合并",
    desc: "多个 PDF 按列表顺序合并为一个文件",
    icon: <Files strokeWidth={1.5} />,
    group: "process",
    accept: "application/pdf",
    multiple: true,
  },
  {
    id: "split",
    name: "PDF 拆分",
    desc: "每一页拆成独立 PDF，多页自动打包 zip",
    icon: <Scissors strokeWidth={1.5} />,
    group: "process",
    accept: "application/pdf",
    multiple: false,
  },
  {
    id: "encrypt",
    name: "PDF 加密",
    desc: "AES-256 加密，打开需要密码",
    icon: <Lock strokeWidth={1.5} />,
    group: "process",
    accept: "application/pdf",
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
    accept: "application/pdf",
    multiple: false,
    password: true,
  },
  {
    id: "text",
    name: "提取文本",
    desc: "抽取 PDF 全部文字，下载 txt 或直接复制",
    icon: <Type strokeWidth={1.5} />,
    group: "process",
    accept: "application/pdf",
    multiple: false,
  },
];

const GROUP_TITLE: Record<ToolMeta["group"], string> = {
  convert: "格式转换",
  process: "PDF 处理",
};

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

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `${(process.env.NEXT_PUBLIC_BASE_PATH as string) || ""}/pdf.worker.min.mjs`;
  return pdfjs;
}

/* ---------------- HTML → A4 PDF 管道（word2pdf / excel2pdf 共用） ---------------- */

/** 把已排版好的 HTML 容器光栅化并按 A4 竖版分页输出。
 *  容器要求：固定宽 794px（96dpi A4），高度任意，白底黑字自备样式 */
async function renderHtmlToA4(container: HTMLElement, outName: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const canvas = await html2canvas(container, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const pxPerPt = canvas.width / pw;
  const sliceH = Math.floor(ph * pxPerPt);
  const pageCanvas = document.createElement("canvas");
  const ctx2 = pageCanvas.getContext("2d")!;
  let rendered = 0;
  let page = 0;
  while (rendered < canvas.height) {
    const h = Math.min(sliceH, canvas.height - rendered);
    pageCanvas.width = canvas.width;
    pageCanvas.height = h;
    ctx2.fillStyle = "#ffffff";
    ctx2.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx2.drawImage(canvas, 0, rendered, canvas.width, h, 0, 0, canvas.width, h);
    if (page > 0) pdf.addPage();
    pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, h / pxPerPt);
    rendered += h;
    page += 1;
  }
  downloadBlob(pdf.output("blob"), outName);
  return page;
}

/** Word/Excel 转换共用的离屏排版容器（794px A4 宽，中文衬线标题+无衬线正文） */
function mountOffscreenDoc(html: string) {
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;color:#1c1c22;";
  holder.innerHTML = html;
  document.body.appendChild(holder);
  return holder;
}

function unmountOffscreenDoc(holder: HTMLElement) {
  holder.remove();
}

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

/* ② Word 转 PDF：mammoth docx→HTML → 离屏排版 → A4 光栅分页 */
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
  const holder = mountOffscreenDoc(
    `<style>
      .doc-root{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.75;padding:56px 64px;}
      .doc-root h1.doc-title{font-size:28px;font-weight:600;margin:0 0 18px;line-height:1.4;}
      .doc-root h1.doc-h1{font-size:22px;font-weight:600;margin:26px 0 12px;}
      .doc-root h2{font-size:18px;font-weight:600;margin:22px 0 10px;}
      .doc-root h3{font-size:16px;font-weight:600;margin:18px 0 8px;}
      .doc-root p{margin:0 0 12px;}
      .doc-root table{border-collapse:collapse;width:100%;margin:12px 0;}
      .doc-root td,.doc-root th{border:1px solid #d6d6de;padding:6px 10px;font-size:13px;}
      .doc-root ul,.doc-root ol{margin:0 0 12px;padding-left:26px;}
      .doc-root img{max-width:100%;}
    </style><div class="doc-root">${html}</div>`
  );
  try {
    const pages = await renderHtmlToA4(holder, `${baseName(f.name)}.pdf`);
    return `已生成「${baseName(f.name)}.pdf」（${pages} 页）`;
  } finally {
    unmountOffscreenDoc(holder);
  }
}

/* ③ Excel 转 PDF：SheetJS 读 → 每张表 sheet_to_html → 排版 → A4 分页 */
async function toolExcel2pdf(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个表格文件");
  const f = files[0];
  setStatus("解析表格…");
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
  setStatus(`渲染 ${wb.SheetNames.length} 张工作表…`);
  let tables = "";
  for (const sn of wb.SheetNames) {
    const html = XLSX.utils.sheet_to_html(wb.Sheets[sn], { header: "", footer: "" });
    tables += `<h2 class="sheet-name">${sn}</h2>${html}`;
  }
  const holder = mountOffscreenDoc(
    `<style>
      .doc-root{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;padding:48px 56px;color:#1c1c22;}
      .doc-root h2.sheet-name{font-size:16px;font-weight:600;margin:0 0 10px;}
      .doc-root h2.sheet-name:not(:first-child){margin-top:28px;}
      .doc-root table{border-collapse:collapse;width:100%;margin:0 0 8px;}
      .doc-root td{border:1px solid #d9d9e0;padding:5px 9px;font-size:12px;line-height:1.5;white-space:nowrap;max-width:420px;overflow:hidden;text-overflow:ellipsis;}
      .doc-root tr:first-child td{background:#f3f3f7;font-weight:600;}
    </style><div class="doc-root">${tables}</div>`
  );
  try {
    const pages = await renderHtmlToA4(holder, `${baseName(f.name)}.pdf`);
    return `已生成「${baseName(f.name)}.pdf」（${wb.SheetNames.length} 张表 / ${pages} 页）`;
  } finally {
    unmountOffscreenDoc(holder);
  }
}

/* ④ PPT 转 PDF：pptx 是 zip（fflate 直解）→ 每页提取 <a:t> 文本 → 横版 PDF */
async function toolPpt2pdf(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 .pptx 文件");
  const f = files[0];
  setStatus("解包演示文稿…");
  const { unzipSync, strFromU8 } = await import("fflate");
  const { jsPDF } = await import("jspdf");
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
  const pdf = new jsPDF({ unit: "pt", format: [960, 540], orientation: "landscape" });
  slideNames.forEach((name, i) => {
    const xml = strFromU8(zipped[name]);
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((m) => decodeXmlEntities(m[1]).trim())
      .filter(Boolean);
    if (i > 0) pdf.addPage([960, 540], "landscape");
    /* 深底白字横版：标题 + 列点（文本重构方案） */
    pdf.setFillColor(24, 24, 30);
    pdf.rect(0, 0, 960, 540, "F");
    pdf.setTextColor(250, 250, 252);
    if (texts.length) {
      pdf.setFontSize(30);
      const title = texts[0].slice(0, 42);
      pdf.text(title, 72, 150);
      pdf.setFontSize(16);
      pdf.setTextColor(214, 214, 224);
      let y = 220;
      for (const t of texts.slice(1, 9)) {
        const line = t.length > 52 ? t.slice(0, 52) + "…" : t;
        pdf.text(line, 96, y);
        y += 34;
      }
    }
    pdf.setFontSize(10);
    pdf.setTextColor(120, 120, 132);
    pdf.text(`${i + 1} / ${slideNames.length}`, 880, 512);
  });
  downloadBlob(pdf.output("blob"), `${baseName(f.name)}.pdf`);
  return `已生成「${baseName(f.name)}.pdf」（${slideNames.length} 页，文本重构版式）`;
}

/* ⑤ PDF 转 Word：pdf.js 文本 → docx（每页标题 + 段落行） */
async function toolPdf2word(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
  const f = files[0];
  const pdfjs = await loadPdfJs();
  setStatus("解析 PDF…");
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
  const children: InstanceType<typeof Paragraph>[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    setStatus(`提取第 ${i}/${doc.numPages} 页…`);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const lines: string[] = [];
    let cur = "";
    let lastY: number | null = null;
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const y = (it as { transform?: number[] }).transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 3 && cur) {
        lines.push(cur);
        cur = "";
      }
      cur += (cur && !cur.endsWith(" ") && it.str && " " ? " " : "") + it.str;
      lastY = y;
    }
    if (cur.trim()) lines.push(cur.trim());
    children.push(
      new Paragraph({
        text: `第 ${i} 页`,
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: i > 1,
      })
    );
    for (const line of lines) {
      if (line.trim()) children.push(new Paragraph({ text: line.trim() }));
    }
  }
  if (!children.length) throw new Error("未提取到文本（可能是扫描件）");
  const docx = new Document({ sections: [{ properties: {}, children }] });
  setStatus("生成 Word 文档…");
  const blob = await Packer.toBlob(docx);
  downloadBlob(blob, `${baseName(f.name)}.docx`);
  return `已生成「${baseName(f.name)}.docx」（${doc.numPages} 页文本流）`;
}

/* ⑥ PDF 转 Excel：pdf.js 坐标聚类（y 容差成行、x 间隙拆列）→ SheetJS */
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
    type Cell = { x: number; y: number; s: string };
    const cells: Cell[] = [];
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const tr = (it as { transform?: number[] }).transform;
      if (!tr) continue;
      cells.push({ x: tr[4], y: tr[5], s: it.str.trim() });
    }
    cells.sort((a, b) => b.y - a.y || a.x - b.x);
    /* 行聚类：y 差 ≤ 3.5 视为同一行；行内 x 间隙 > 14 拆列 */
    const rows: string[][] = [];
    let row: Cell[] = [];
    let rowY: number | null = null;
    const flush = () => {
      if (!row.length) return;
      row.sort((a, b) => a.x - b.x);
      const cols: string[] = [];
      let prevEnd = -1e9;
      for (const c of row) {
        if (prevEnd > -1e8 && c.x - prevEnd > 14) cols.push("");
        cols.push(c.s);
        prevEnd = c.x + c.s.length * 5.2;
      }
      rows.push(cols);
      row = [];
    };
    for (const c of cells) {
      if (rowY === null || Math.abs(c.y - rowY) <= 3.5) {
        row.push(c);
        rowY = rowY === null ? c.y : (rowY + c.y) / 2;
      } else {
        flush();
        row = [c];
        rowY = c.y;
      }
    }
    flush();
    const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [["（本页未提取到文本）"]]);
    XLSX.utils.book_append_sheet(wb, ws, `第${i}页`);
  }
  XLSX.writeFile(wb, `${baseName(f.name)}.xlsx`);
  return `已生成「${baseName(f.name)}.xlsx」（${doc.numPages} 张工作表）`;
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

/* ⑩ PDF 拆分：逐页独立 PDF，多页 zip */
async function toolSplit(
  files: File[],
  setStatus: (s: string) => void
): Promise<string> {
  if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
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
  for (let i = 0; i < n; i++) {
    setStatus(`拆出第 ${i + 1}/${n} 页…`);
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(src, [i]);
    single.addPage(copied);
    const bytes = await single.save();
    zipBag[`${baseName(f.name)}-第${i + 1}页.pdf`] = bytes;
  }
  const { zipSync } = await import("fflate");
  setStatus("打包 zip…");
  const zipped = zipSync(zipBag);
  downloadBlob(
    new Blob([zipped as unknown as BlobPart], { type: "application/zip" }),
    `${baseName(f.name)}-拆分.zip`
  );
  return `已拆分为 ${n} 个 PDF 并打包 zip`;
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

/* ================= 组件 ================= */

export default function PdfTools({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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
    }
  }, [open]);

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
    setFiles((prev) => {
      /* 同名同大小去重（重复拖选同一文件） */
      const seen = new Set(prev.map((f) => f.name + ":" + f.size));
      return [...prev, ...list.filter((f) => !seen.has(f.name + ":" + f.size))];
    });
    setDoneMsg("");
    setErr("");
  }

  function selectTool(id: ToolId) {
    setTool(id);
    setFiles([]);
    setDoneMsg("");
    setErr("");
    setTextOut("");
    setPwd1("");
    setPwd2("");
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
      else if (tool === "split") msg = await toolSplit(files, setStatus);
      else if (tool === "encrypt") msg = await toolEncrypt(files, pwd1, pwd2, setStatus);
      else if (tool === "decrypt") msg = await toolDecrypt(files, pwd1, setStatus);
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

