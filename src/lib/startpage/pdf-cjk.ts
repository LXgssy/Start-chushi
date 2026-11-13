/* 「初始」PDF 工具箱 CJK 文字层管线（v8.7.170）
 *
 * 为什么需要这个模块：
 *   旧实现 word2pdf/excel2pdf 走 html2canvas 光栅（输出无文字层：不可选、
 *   不可搜、放大糊），ppt2pdf 走 jsPDF 默认 Helvetica（CJK 字节被塞进
 *   Latin-1 输出乱码）——用户实测「所有转换功能转换完都是有错误的」。
 *   本模块统一改走 @cantoo/pdf-lib + fontkit 运行时子集化嵌入 Noto Sans SC：
 *   输出 PDF 带真实可选取文字层，产物体积只含用到的字形（数百 KB 级）。
 *
 * 算法口径移植致谢：
 *   行分组/表格对齐/列宽口径移植自开源项目「飞鼠格式转换」
 *   （作者 牢蜂 LaoFeng，github.com/LaoFeng-mouse/flyingmouse-format，
 *   非商用许可）——CJK 相邻不空格律、相邻行同列数对齐律、CJK 双宽计宽律。
 *
 * 字体：Noto Sans SC（SIL Open Font License 1.1），随包分发全量 TTF
 *   （public/fonts/NotoSansSC-Regular.ttf），运行时按文档字符集子集化嵌入，
 *   全量字体不出扩展包、产物不膨胀。 */
import type { PDFFont, PDFPage, PDFDocument, RGB } from "@cantoo/pdf-lib";

let fontBytesCache: Uint8Array | null = null;

/** 全量字体字节（模块级缓存：一次转换后驻留内存 ~10MB，避免重复 fetch） */
export async function loadCjkFontBytes(): Promise<Uint8Array> {
  if (fontBytesCache) return fontBytesCache;
  const base = (process.env.NEXT_PUBLIC_BASE_PATH as string) || "";
  const res = await fetch(`${base}/fonts/NotoSansSC-Regular.ttf`);
  if (!res.ok) throw new Error(`CJK 字体加载失败（${res.status}）`);
  const buf = await res.arrayBuffer();
  fontBytesCache = new Uint8Array(buf);
  return fontBytesCache;
}

export interface CjkDoc {
  doc: PDFDocument;
  font: PDFFont;
  rgbRaw: { sub: RGB; pageNum: RGB };
  /** 预置好的颜色（免各处再 dynamic import rgb） */
  colors: {
    text: RGB;
    heading: RGB;
    gray: RGB;
    line: RGB;
    headFill: RGB;
    white: RGB;
  };
}

/** 建 A4 文档并嵌入子集化中文字体（每次转换一份；子集只含本文档用到的字形） */
export async function createCjkA4Doc(): Promise<CjkDoc> {
  const { PDFDocument, rgb } = await import("@cantoo/pdf-lib");
  const fontkit = await import("fontkit");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit as unknown as Parameters<typeof doc.registerFontkit>[0]);
  const font = await doc.embedFont(await loadCjkFontBytes(), { subset: true });
  return {
    doc,
    font,
    colors: {
      text: rgb(0.11, 0.11, 0.13),
      heading: rgb(0.07, 0.07, 0.1),
      gray: rgb(0.45, 0.45, 0.5),
      line: rgb(0.78, 0.78, 0.82),
      headFill: rgb(0.94, 0.94, 0.96),
      white: rgb(1, 1, 1),
    },
    rgbRaw: {
      sub: rgb(0.84, 0.84, 0.88),
      pageNum: rgb(0.47, 0.47, 0.52),
    },
  };
}

/* ---------------- 排版常量（A4 竖版，pt） ---------------- */
export const A4_W = 595.28;
export const A4_H = 841.89;
export const MARGIN = 54;
export const CONTENT_W = A4_W - MARGIN * 2;

const CJK_CHAR = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef\uac00-\ud7af\u3040-\u30ff]/;

/** CJK 感知换行：中文逐字可断、拉丁词整体不断（飞鼠 CJK 口径的同族实现）。
 *  保证每行 widthOfTextAtSize ≤ maxWidth；超长拉丁词硬断。 */
export function wrapCjkText(
  text: string,
  maxWidth: number,
  size: number,
  font: PDFFont
): string[] {
  const lines: string[] = [];
  let cur = "";
  const push = () => {
    if (cur) lines.push(cur);
    cur = "";
  };
  const chars = Array.from(text);
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (CJK_CHAR.test(ch)) {
      // CJK/全角：逐字可断
      const next = cur + ch;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) cur = next;
      else {
        push();
        cur = ch;
      }
      i++;
      continue;
    }
    // 拉丁/数字词：整体消费到下一个可断点
    let j = i;
    while (j < chars.length && !CJK_CHAR.test(chars[j]) && !/\s/.test(chars[j])) j++;
    if (j === i) j = i + 1; // 单符号兜底
    let word = chars.slice(i, j).join("");
    if (/\s/.test(chars[j] ?? "")) word += " ";
    const next = cur + word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      cur = next;
    } else if (font.widthOfTextAtSize(word.trimEnd(), size) <= maxWidth) {
      push();
      cur = word.trimEnd();
    } else {
      // 超长词硬断
      for (const c of word) {
        if (font.widthOfTextAtSize(cur + c, size) <= maxWidth) cur += c;
        else {
          push();
          cur = c;
        }
      }
    }
    i = j + (/\s/.test(chars[j] ?? "") ? 1 : 0);
  }
  push();
  return lines.length ? lines : [""];
}

export interface TextBlock {
  kind: "text";
  text: string;
  size?: number;
  lineHeight?: number;
  indent?: number;
  gapBefore?: number;
  color?: RGB;
}

/** 按块流式排版 A4（自动分页），返回页数。onNewPage 供调用方画页眉页脚。 */
export async function layoutBlocksA4(
  doc: PDFDocument,
  font: PDFFont,
  blocks: TextBlock[],
  opts: { onNewPage?: (page: PDFPage, idx: number) => void } = {}
): Promise<number> {
  let page = doc.addPage([A4_W, A4_H]);
  opts.onNewPage?.(page, 0);
  let idx = 0;
  let y = A4_H - MARGIN;
  const newPage = () => {
    page = doc.addPage([A4_W, A4_H]);
    idx += 1;
    opts.onNewPage?.(page, idx);
    y = A4_H - MARGIN;
  };
  const ensure = (h: number) => {
    if (y - h < MARGIN) newPage();
  };
  for (const b of blocks) {
    const size = b.size ?? 10.5;
    const lineHeight = size * (b.lineHeight ?? 1.55);
    const lines = wrapCjkText(b.text, CONTENT_W - (b.indent ?? 0), size, font);
    lines.forEach((line, li) => {
      ensure(lineHeight + (li === 0 ? (b.gapBefore ?? 0) : 0));
      if (li === 0 && b.gapBefore) y -= b.gapBefore;
      if (line) {
        page.drawText(line, {
          x: MARGIN + (b.indent ?? 0),
          y: y - size,
          size,
          font,
          color: b.color,
        });
      }
      y -= lineHeight;
    });
  }
  return idx + 1;
}

/* ---------------- 飞鼠行分组/表格对齐口径移植（牢蜂 LaoFeng，非商用许可） ----------------
 * 移植自 flyingmouse-format/pdf-table.js 的 groupPdfItemsIntoLines 与
 * aligned 判定（pdf.js 文本坐标 → 行 → 片段 → 表格单元格）：
 *   · 行聚类容差 = max(2, 相邻条目高 × 0.28)（高度自适应，不再拍死 3px）；
 *   · 行内拼接 CJK 相邻不空格（汉字/假名/谚文相接零空格），拉丁按间隙空格；
 *   · 片段切分 = 间隙 > max(14, 行高 × 1.6)（视觉列边界）；
 *   · 表格行判定 = 相邻两行片段数相同且逐列 x 对齐（±10px）——单纯一行的
 *     定位词永不成表，重复出现的近邻列边界才升格为可编辑单元格。 */

export interface PdfTextItem {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
}

export interface PdfLine {
  y: number;
  height: number;
  text: string;
  fragments: { x: number; text: string }[];
  cells: string[];
  bbox: [number, number, number, number];
}

export function groupPdfItemsIntoLines(items: PdfTextItem[]): PdfLine[] {
  const cleanItems = items.flatMap((item) => {
    const text = String(item?.str || "").trim();
    const t = item?.transform;
    if (!text || !Array.isArray(t) || t.length < 6 || !t.every(Number.isFinite)) return [];
    const x = t[4];
    const y = t[5];
    const dx = t[0];
    const dy = t[1];
    const baselineLength = Math.hypot(dx, dy) || 1;
    const width = Math.max(0, Number(item.width) || 0);
    const height = Math.max(1, Number(item.height) || Math.hypot(t[2], t[3]));
    const endX = x + (dx / baselineLength) * width;
    const endY = y + (dy / baselineLength) * width;
    return [
      {
        text,
        x: Math.min(x, endX),
        y,
        end: Math.max(x, endX),
        height,
        bbox: [
          Math.min(x, endX),
          Math.min(y, endY) - height,
          Math.max(x, endX),
          Math.max(y, endY),
        ] as [number, number, number, number],
      },
    ];
  }).sort((a, b) => a.y - b.y || a.x - b.x);

  type WorkLine = PdfLine & { items: { text: string; x: number; y: number; end: number; height: number; bbox: [number, number, number, number] }[] };
  const lines: WorkLine[] = [];
  for (const item of cleanItems) {
    const previous = lines.at(-1);
    const tolerance = Math.max(2, Math.min(item.height, previous?.height || item.height) * 0.28);
    if (previous && Math.abs(previous.y - item.y) <= tolerance) {
      previous.items.push(item);
      previous.height = Math.max(previous.height, item.height);
    } else {
      lines.push({
        y: item.y,
        height: item.height,
        items: [item],
        text: "",
        fragments: [],
        cells: [],
        bbox: [0, 0, 0, 0],
      });
    }
  }

  /** CJK 相邻零空格 + 紧邻单字零空格 + 小间隙零空格（否则补一个空格） */
  function appendText(left: string, text: string, gap: number, previous?: { text: string; height: number }) {
    if (!left) return text;
    const cjk =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(left) &&
      /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
    const adjacentGlyphs =
      !!previous && previous.text.length === 1 && text.length === 1 &&
      gap <= Math.max(previous.height, height0(text)) * 0.85;
    return left + (cjk || adjacentGlyphs || gap <= 0.12 * height0(text) ? "" : " ") + text;
  }
  const height0 = (s: string) => 12; // 单字兜底高度（无逐字高可用，容差足够宽）

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    const fragments: { x: number; text: string }[] = [];
    let previous: (typeof cleanItems)[number] | undefined;
    let text = "";
    for (const item of line.items) {
      const gap = previous ? item.x - previous.end : 0;
      text = appendText(text, item.text, gap, previous);
      if (!fragments.length || gap > Math.max(14, line.height * 1.6)) {
        fragments.push({ x: item.x, text: item.text });
      } else {
        const fragment = fragments.at(-1)!;
        fragment.text = appendText(fragment.text, item.text, gap, previous);
      }
      previous = item;
    }
    line.text = text;
    line.fragments = fragments;
    line.bbox = [
      Math.min(...line.items.map((item) => item.bbox[0])),
      Math.min(...line.items.map((item) => item.bbox[1])),
      Math.max(...line.items.map((item) => item.bbox[2])),
      Math.max(...line.items.map((item) => item.bbox[3])),
    ];
  }

  /** 飞鼠 aligned 律：相邻行片段数一致 + 逐列 x 对齐（±10px）+ 片段短文本 */
  const aligned = (a?: PdfLine, b?: PdfLine) =>
    !!a && !!b && a.fragments.length > 1 &&
    a.fragments.length === b.fragments.length &&
    Math.abs(a.y - b.y) <= Math.max(a.height, b.height) * 3.5 &&
    a.fragments.every((fragment, index) => Math.abs(fragment.x - b.fragments[index].x) <= 10) &&
    a.fragments.every((fragment) => fragment.text.length < 80) &&
    b.fragments.every((fragment) => fragment.text.length < 80);
  lines.forEach((line, index) => {
    const prev = lines[index - 1];
    const next = lines[index + 1];
    line.cells =
      aligned(line, prev) || aligned(line, next)
        ? line.fragments.map((fragment) => fragment.text)
        : [line.text];
  });
  return lines;
}

/** 飞鼠 pdfCellDisplayWidth 口径：CJK/全角计 2、组合记号计 0、Tab 计 4、其余计 1 */
export function cjkDisplayWidth(value: unknown): number {
  return String(value ?? "")
    .split(/\r?\n/)
    .reduce((maximum, line) => Math.max(maximum, Array.from(line).reduce(
      (width, character) =>
        width +
        (/\p{Mark}/u.test(character)
          ? 0
          : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60]/u.test(character)
            ? 2
            : character === "\t"
              ? 4
              : 1),
      0
    )), 0);
}

/* ---------------- 统一块流排版（文本 + 表格网格，word/excel2pdf 共用） ---------------- */

export interface TableBlock {
  kind: "table";
  rows: string[][];
  /** 首行作表头（灰底）；跨页续排时重复表头 */
  header?: boolean;
  title?: string;
  titleGap?: number;
}

export interface ImageBlock {
  kind: "img";
  /** data URI（mammoth 内嵌图 data:image/png;base64,...） */
  dataUri: string;
}

export type FlowBlock = TextBlock | TableBlock | ImageBlock;

/** data URI → 已嵌入文档的图片（含像素尺寸解码；png/jpeg 二选一按前缀） */
async function embedDataImage(
  doc: PDFDocument,
  dataUri: string
): Promise<{ img: import("@cantoo/pdf-lib").PDFImage; w: number; h: number }> {
  const m = /^data:(image\/(png|jpeg));base64,(.+)$/i.exec(dataUri);
  if (!m) throw new Error("不支持的图片格式");
  const isPng = /png/i.test(m[1]);
  const bytes = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
  const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  return { img, w: img.width, h: img.height };
}

/** 单元格换行（列内宽度 = 列宽 - 左右 padding） */
function wrapCell(
  text: string,
  colW: number,
  size: number,
  font: PDFFont
): string[] {
  const inner = Math.max(12, colW - 8);
  return wrapCjkText(text.replace(/\t/g, "    "), inner, size, font);
}

/** 表格列宽（pt）：飞鼠 CJK 双宽计宽律取相对单位（内容宽 + 2，上限 46），
 *  再按单位→pt 换算适配 A4 内容宽（窄表拉伸、宽表收缩；单位≈12pt 上限防过伸）。
 *  v8.7.170 探针实锤：旧实现把「字符单位」直接当 pt 用（列宽 6-8pt），
 *  每个汉字被挤成单字一行、表头碎成竖排。 */
function computeColWidths(rows: string[][]): number[] {
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const units = Array<number>(cols).fill(6);
  for (const row of rows) {
    row.forEach((cell, i) => {
      units[i] = Math.max(units[i], Math.min(cjkDisplayWidth(cell) + 2, 46));
    });
  }
  const total = units.reduce((a, b) => a + b, 0);
  const k = Math.min(CONTENT_W / Math.max(total, 34), 13);
  const pts = units.map((w) => w * k);
  const sum = pts.reduce((a, b) => a + b, 0);
  if (sum > CONTENT_W) {
    const kk = CONTENT_W / sum;
    return pts.map((w) => Math.max(5, w * kk));
  }
  return pts;
}

/** 块流排版：text 块走 wrapCjkText 流，table 块画网格（自动分页 + 表头重复）。 */
export async function layoutFlowA4(
  doc: PDFDocument,
  font: PDFFont,
  colors: CjkDoc["colors"],
  blocks: FlowBlock[],
  opts: { onNewPage?: (page: PDFPage, idx: number) => void } = {}
): Promise<number> {
  let page = doc.addPage([A4_W, A4_H]);
  opts.onNewPage?.(page, 0);
  let idx = 0;
  let y = A4_H - MARGIN;
  const newPage = () => {
    page = doc.addPage([A4_W, A4_H]);
    idx += 1;
    opts.onNewPage?.(page, idx);
    y = A4_H - MARGIN;
  };

  for (const b of blocks) {
    if (b.kind === "img") {
      /* 内嵌图（Word 文档图片）：解码尺寸 → 等比缩放进内容宽 → 分页感知绘制 */
      try {
        const { img, w, h } = await embedDataImage(doc, b.dataUri);
        const scale = Math.min(1, CONTENT_W / w, (A4_H - MARGIN * 2 - 40) / h);
        const dw = w * scale;
        const dh = h * scale;
        if (y - dh - 6 < MARGIN) newPage();
        page.drawImage(img, { x: MARGIN + (CONTENT_W - dw) / 2, y: y - dh, width: dw, height: dh });
        y -= dh + 10;
      } catch {
        /* 图片解码失败不阻塞整份文档（旧光栅管线同类容错） */
      }
      continue;
    }
    if (b.kind === "text") {
      const size = b.size ?? 10.5;
      const lineHeight = size * (b.lineHeight ?? 1.55);
      const lines = wrapCjkText(b.text, CONTENT_W - (b.indent ?? 0), size, font);
      lines.forEach((line, li) => {
        if (y - lineHeight - (li === 0 ? (b.gapBefore ?? 0) : 0) < MARGIN) newPage();
        if (li === 0 && b.gapBefore) y -= b.gapBefore;
        if (line) {
          page.drawText(line, {
            x: MARGIN + (b.indent ?? 0),
            y: y - size,
            size,
            font,
            color: b.color ?? colors.text,
          });
        }
        y -= lineHeight;
      });
      continue;
    }
    /* ---- 表格 ---- */
    if (b.title) {
      if (y - 24 < MARGIN) newPage();
      y -= b.titleGap ?? 6;
      page.drawText(b.title, { x: MARGIN, y: y - 13, size: 11.5, font, color: colors.heading });
      y -= 22;
    }
    const rows = b.rows.length ? b.rows : [["（空表）"]];
    const widths = computeColWidths(rows);
    const size = 9;
    const rowLineH = size * 1.32;
    const drawRow = (row: string[], rIdx: number) => {
      const wrapped = row.map((cell, c) => wrapCell(cell ?? "", widths[c] ?? widths[widths.length - 1], size, font));
      const lines = Math.max(1, ...wrapped.map((w) => w.length));
      const rowH = lines * rowLineH + 7;
      if (y - rowH < MARGIN) {
        newPage();
        /* 跨页续排：表头重复（飞鼠 ExcelJS 口径的等价物） */
        if (b.header && rIdx > 0) drawRow(rows[0], 0);
      }
      let x = MARGIN;
      wrapped.forEach((cellLines, c) => {
        const w = widths[c] ?? widths[widths.length - 1];
        const isHead = b.header && rIdx === 0;
        page.drawRectangle({
          x,
          y: y - rowH,
          width: w,
          height: rowH,
          borderColor: colors.line,
          borderWidth: 0.5,
          color: isHead ? colors.headFill : undefined,
        });
        cellLines.forEach((line, li) => {
          page.drawText(line, {
            x: x + 4,
            y: y - 5 - size - li * rowLineH,
            size,
            font,
            color: isHead ? colors.heading : colors.text,
          });
        });
        x += w;
      });
      y -= rowH;
    };
    rows.forEach((row, rIdx) => drawRow(row, rIdx));
    y -= 8;
  }
  return idx + 1;
}
