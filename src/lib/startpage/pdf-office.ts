/* 「初始」PDF 工具箱 → Office 引擎桥接层（v8.7.173）
 *
 * 六链重做（用户口径「为什么不直接用飞鼠的转换代码」——直接用）：
 *   · pdf-table-extractor.js / pdf-table-runtime.js = 「飞鼠格式转换」
 *     （github.com/LaoFeng-mouse/flyingmouse-format，作者 牢蜂 LaoFeng，
 *     《飞鼠格式非商用许可协议》）引擎的零逻辑改动移植，本模块只做浏览器适配：
 *     pdfjs 文本项→词元（200dpi 视口坐标）+ canvas 栅格线检测 +
 *     detectTablesOnPage → buildWorkbookModel（跨页续接/并查集网格/
 *     锚点列聚类/算术修复全为飞鼠原口径）。
 *   · ExcelJS 写入器移植自飞鼠 formatPdfWorkbookSheet + applyColumnWidths +
 *     addPdfTableNotes 口径（网格边框/表头灰底/冻结首行/横向 fitToPage/
 *     CJK 双宽列宽/低置信批注）。
 *   · docx 写入器移植自飞鼠 pdf-office-docx.js makeTable/tableRows 口径
 *     （DXA 固定布局/内边距/B7C3D0 边框/纵向合并/低置信底纹）；标题层级
 *     以 fontSizePt 启发式近似（飞鼠结构引擎未随移植，见 worklog）。
 *   · 扫描件 pdf→excel 按 飞鼠「宁可不给也不给错表」口径显式拒绝
 *     （PDF_TABLE_OCR_REQUIRED 同码）。
 */
import {
  detectTablesOnPage,
  buildWorkbookModel,
} from "./pdf-table-extractor";
import { pdfTextContentToWords, detectTableLinesFromRaw } from "./pdf-table-runtime";

const RENDER_DPI = 200;
const PDF_PT = 72;
const SCALE = RENDER_DPI / PDF_PT;

/* 飞鼠 formatPdfWorkbookSheet 口径常量 */
const BORDER_ARGB = "FF737373";
const HEADER_FILL = "FFF0F3F7";
const REVIEW_FILL = "FFF2CC";
const REVIEW_CONFIDENCE = 0.85;

/** 飞鼠 pdfCellDisplayWidth：CJK/全角计 2、组合记号计 0、Tab 计 4、其余计 1 */
function pdfCellDisplayWidth(value: unknown): number {
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

/** pdfjs 单页引擎输入（词元 + 栅格线，统一 200dpi 视口坐标系） */
export interface OfficePageInput {
  pageNumber: number;
  width: number;
  height: number;
  words: { text: string; x: number; y: number; width: number; height: number; confidence: number; style?: Record<string, unknown> }[];
  lines: { x1: number; y1: number; x2: number; y2: number; thickness?: number }[];
}

/** pdfjs 文本项 → 飞鼠词元（字体真名经 commonObjs 解析，unresolved 回落泛型族） */
function resolveFontNames(textContent: Record<string, unknown>, page: unknown): void {
  try {
    const styles = (textContent.styles || {}) as Record<string, Record<string, unknown>>;
    const commonObjs = (page as { commonObjs?: Map<string, unknown> }).commonObjs;
    if (!commonObjs || typeof commonObjs.get !== "function") return;
    for (const [fontId, style] of Object.entries(styles)) {
      if (!commonObjs.has(fontId)) continue;
      const font = commonObjs.get(fontId) as { name?: string; bold?: boolean; italic?: boolean } | null;
      if (typeof font?.name === "string") style.fontName = font.name;
      if (typeof font?.bold === "boolean") style.bold = font.bold;
      if (typeof font?.italic === "boolean") style.italic = font.italic;
    }
  } catch {
    /* 内部 API 形态变化不阻塞（泛型族兜底） */
  }
}

/** 单页：文本词元 + 200dpi 栅格线（飞鼠 hybrid 口径：文本+光栅线双源） */
export async function extractOfficePage(
  page: import("pdfjs-dist").PDFPageProxy,
  pageNumber: number
): Promise<OfficePageInput> {
  const viewport = page.getViewport({ scale: SCALE, rotation: (page as unknown as { rotate?: number }).rotate || 0 });
  let textContent = (await page.getTextContent()) as unknown as {
    items: { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string }[];
    styles: Record<string, Record<string, unknown>>;
  };
  resolveFontNames(textContent as unknown as Record<string, unknown>, page);
  const words = pdfTextContentToWords({ textContent, viewport }) as OfficePageInput["words"];
  /* 矢量线（描边算子直读——发丝级表格线的主源，camelot-lattice 口径）∪
     栅格线（canvas 200dpi 渲染 → 飞鼠 detectTableLinesFromRaw——扫描件兜底） */
  const lines: OfficePageInput["lines"] = [];
  try {
    lines.push(...((await extractVectorLines(page, viewport)) as OfficePageInput["lines"]));
  } catch {
    /* 算子表形态变化不阻塞（栅格线兜底） */
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx as CanvasRenderingContext2D, viewport, background: "#ffffff" }).promise;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      lines.push(...(detectTableLinesFromRaw({
        data: new Uint8Array(img.data.buffer),
        width: canvas.width,
        height: canvas.height,
        channels: 4,
      }) as OfficePageInput["lines"]));
    }
  } catch {
    /* 渲染失败退化无网格模式（锚点列聚类兜底，飞鼠 no-render 同路径） */
  }
  page.cleanup();
  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    words,
    lines,
  };
}

/** 页模型 → 飞鼠 detectTablesOnPage（跨页续接前的逐页产物） */
export function detectPageTables(page: OfficePageInput, source: "text") {
  return detectTablesOnPage({
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    pagePointScale: 1 / SCALE,
    source,
    words: page.words as never,
    lines: page.lines as never,
  });
}

/** 工作簿模型（飞鼠 buildWorkbookModel 直通） */
export function buildModel(pages: ReturnType<typeof detectPageTables>[]) {
  return buildWorkbookModel(pages as unknown as Parameters<typeof buildWorkbookModel>[0]);
}

/* ---------------- 矢量线提取（浏览器侧 camelot-lattice 等价物） ----------------
 * 飞鼠的 native 表格路径依赖原生 docengine 二进制（camelot，浏览器不可行），
 * 其 fallback 栅格路径在发丝级矢量表格线（0.5pt 灰线）上会因 200dpi 抗锯齿
 * 混色而漏检（diag 实锤：vertical=0）。本函数从 pdfjs 算子表直接读描边路径
 * 段（m/l/re + stroke），经视口变换喂给飞鼠 detectTablesOnPage——与栅格线
 * 并集喂入，文本型 PDF 表格网格命中率恢复 native 水准。 */

let OPS_CACHE: Record<string, number> | null = null;
async function getOps(): Promise<Record<string, number>> {
  if (!OPS_CACHE) {
    OPS_CACHE = (await import("pdfjs-dist")).OPS as unknown as Record<string, number>;
  }
  return OPS_CACHE!;
}

/** 算子表 → 视口坐标线段（描边提交/填充仅发丝矩形/近白跳过/上限 1900） */
export async function extractVectorLines(
  page: import("pdfjs-dist").PDFPageProxy,
  viewport: { transform: number[]; width: number; height: number }
): Promise<{ x1: number; y1: number; x2: number; y2: number }[]> {
  const OPS = await getOps();
  const opList = await page.getOperatorList();
  const v = viewport.transform;
  /* CTM 跟踪：内容流 cm 变换不进路径坐标（reportlab/Word 导出画表格前必发
     cm）——本地路径点先经 CTM 回用户空间，再经视口变换到设备空间 */
  let ctm: number[] = [1, 0, 0, 1, 0, 0];
  const ctmStack: number[][] = [];
  const mul = (l: number[], r: number[]): number[] => [
    l[0] * r[0] + l[2] * r[1],
    l[1] * r[0] + l[3] * r[1],
    l[0] * r[2] + l[2] * r[3],
    l[1] * r[2] + l[3] * r[3],
    l[0] * r[4] + l[2] * r[5] + l[4],
    l[1] * r[4] + l[3] * r[5] + l[5],
  ];
  const toViewport = (x: number, y: number): [number, number] => {
    const ux = ctm[0] * x + ctm[2] * y + ctm[4];
    const uy = ctm[1] * x + ctm[3] * y + ctm[5];
    return [v[0] * ux + v[2] * uy + v[4], v[1] * ux + v[3] * uy + v[5]];
  };
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let pending: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let skipPending = false;
  let cur: [number, number] | null = null;
  let subStart: [number, number] | null = null;
  const commit = () => {
    if (!skipPending) segments.push(...pending);
    pending = [];
    skipPending = false;
  };
  const push = (a: [number, number], b: [number, number]) => {
    const [x1, y1] = toViewport(a[0], a[1]);
    const [x2, y2] = toViewport(b[0], b[1]);
    if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
      pending.push({ x1, y1, x2, y2 });
    }
  };
  for (let i = 0; i < opList.fnArray.length && segments.length < 1900; i += 1) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as unknown[];
    if (fn === OPS.constructPath) {
      /* pdfjs v4+：args = [ops[], coords[]]；旧版为扁平混排 */
      const ops = (Array.isArray(args[0]) && Array.isArray(args[1]) ? args[0] : null) as number[] | null;
      const coords = (ops ? args[1] : args) as number[];
      const pathOps: number[] = ops || [];
      let k = 0;
      let opIndex = 0;
      while (ops ? opIndex < pathOps.length : k + 1 < coords.length) {
        const op = ops ? pathOps[opIndex] : coords[k];
        if (op === OPS.moveTo) {
          cur = [coords[k], coords[k + 1]];
          subStart = cur;
          k += 2;
        } else if (op === OPS.lineTo) {
          if (cur) push(cur, [coords[k], coords[k + 1]]);
          cur = [coords[k], coords[k + 1]];
          k += 2;
        } else if (op === OPS.rectangle) {
          const [x, y, w, h] = [coords[k], coords[k + 1], coords[k + 2], coords[k + 3]];
          push([x, y], [x + w, y]);
          push([x + w, y], [x + w, y + h]);
          push([x + w, y + h], [x, y + h]);
          push([x, y + h], [x, y]);
          k += 4;
        } else if (op === OPS.closePath) {
          if (cur && subStart) push(cur, subStart);
          cur = subStart;
        } else if (op === OPS.endPath) {
          cur = null;
          subStart = null;
        }
        opIndex += 1;
        if (!ops) {
          /* 旧扁平格式按 op 编码宽度推进（简化：moveTo/lineTo 各 2 参） */
          k += op === OPS.rectangle ? 4 : 2;
        }
      }
    } else if (fn === OPS.transform) {
      const m = (args as number[]).map(Number);
      if (m.length === 6 && m.every(Number.isFinite)) ctm = mul(m, ctm);
    } else if (fn === (OPS.save as number)) {
      ctmStack.push(ctm);
    } else if (fn === (OPS.restore as number)) {
      ctm = ctmStack.pop() ?? ctm;
    } else if (fn === OPS.setStrokeRGBColor || fn === OPS.setStrokeGrayN || fn === OPS.setStrokeCMYKColor) {
      const rgb = (args as number[]).map(Number);
      skipPending = rgb.length >= 3 && rgb.every((c) => Number.isFinite(c) && c > 0.92);
    } else if (fn === OPS.stroke || fn === OPS.closeStroke) {
      commit();
      cur = null;
      subStart = null;
    } else if (fn === OPS.fill || fn === OPS.eoFill) {
      /* 填充路径仅收「发丝矩形」的边（fill-as-line 惯用法），整块填充丢弃 */
      const hairline = pending.filter((s) => {
        const dx = Math.abs(s.x2 - s.x1);
        const dy = Math.abs(s.y2 - s.y1);
        return Math.min(dx, dy) <= SCALE * 1.6 && Math.max(dx, dy) > 8;
      });
      if (!skipPending) segments.push(...hairline);
      pending = [];
      skipPending = false;
      cur = null;
      subStart = null;
    } else if (fn === OPS.setFillRGBColor || fn === OPS.setFillGrayN || fn === OPS.setFillCMYKColor) {
      const rgb = (args as number[]).map(Number);
      skipPending = rgb.length >= 3 && rgb.every((c) => Number.isFinite(c) && c > 0.92);
    }
  }
  commit();
  return segments.slice(0, 1900);
}

/* ---------------- ExcelJS 写入器（飞鼠 xlsx 口径移植） ---------------- */

type AnySheet = { getRow: (n: number) => AnyRow; getColumn: (n: number) => { width: number }; addImage?: never };
type AnyRow = { height: number; getCell: (n: number) => AnyCell; eachCell: (fn: (c: AnyCell, n: number) => void) => void; values?: unknown[]; addPageBreak?: () => void };
type AnyCell = {
  value: unknown; font: Record<string, unknown>; fill: Record<string, unknown>;
  alignment: Record<string, unknown>; border: Record<string, unknown>; numFmt?: string;
  note?: string;
};

function xBorder() {
  return {
    top: { style: "thin", color: { argb: BORDER_ARGB } },
    left: { style: "thin", color: { argb: BORDER_ARGB } },
    bottom: { style: "thin", color: { argb: BORDER_ARGB } },
    right: { style: "thin", color: { argb: BORDER_ARGB } },
  };
}

/** 飞鼠 configureSheet：冻结首行 + 横向 fitToPage + 默认行高 */
function configureSheet(sheet: AnySheet & { views?: unknown; pageSetup?: unknown; properties?: Record<string, unknown> }, freezeRows = 1) {
  sheet.views = [{ state: "frozen", ySplit: freezeRows, showGridLines: false }];
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  (sheet.properties as Record<string, unknown>).defaultRowHeight = 22;
}

/** 飞鼠 applyColumnWidths：CJK 双宽内容宽+2（上限 48），列锚/网格边可用时按几何比例 */
function applyColumnWidths(sheet: { getColumn: (n: number) => { width: number } }, rows: string[][], item: { columnAnchors?: number[]; bounds?: { right?: number; left?: number }; pageWidth?: number; pageHeight?: number }) {
  const count = rows.reduce((max, row) => Math.max(max, row.length), 1);
  const widths = Array<number>(count).fill(8);
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index], Math.min(pdfCellDisplayWidth(cell) + 2, 48));
    });
  }
  const anchors = item.columnAnchors || [];
  const edges: number[] = anchors.length === count ? [...anchors, Number(item.bounds?.right) || 0] : anchors;
  if (edges.length === count + 1 && edges.every(Number.isFinite) && edges.every((edge, index) => index === 0 || edge > edges[index - 1])) {
    const pageWidth = Math.max(Number(item.pageWidth) || 0, (edges.at(-1) as number) || 0);
    const landscape = Number(item.pageWidth) > Number(item.pageHeight) || count > 8;
    const scale = (landscape ? 770 : 523) / Math.max(1, pageWidth);
    for (let column = 0; column < count; column += 1) {
      widths[column] = Math.max(5, Math.min(60, (edges[column + 1] - edges[column]) * scale / 5.25));
    }
  }
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = Math.round(width * 100) / 100; });
}

/** 飞鼠 formatPdfWorkbookSheet：边框/表头灰底/换行对齐/行高按 CJK 计宽推演 */
function formatWorkbookSheet(
  sheet: AnySheet & { views?: unknown; pageSetup?: unknown; properties?: Record<string, unknown> },
  rows: string[][],
  opts: { table?: boolean; headerRows?: number[]; merges?: { startRow: number; startCol: number; endRow: number; endCol: number }[]; item?: Record<string, unknown> } = {}
) {
  const { table = false, headerRows = [], merges = [], item = {} } = opts;
  const count = rows.reduce((max, row) => Math.max(max, row.length), 1);
  const landscape = Number(item.pageWidth) > Number(item.pageHeight) || count > 8;
  sheet.pageSetup = {
    orientation: landscape ? "landscape" : "portrait",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  (sheet.properties as Record<string, unknown>).defaultRowHeight = 22;
  sheet.views = [{ showGridLines: !table }];
  const mergedAreas = merges.map((range) => ({ top: range.startRow + 1, left: range.startCol + 1, bottom: range.endRow + 1, right: range.endCol + 1 }));
  for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.height = 22;
    for (let column = 1; column <= count; column += 1) {
      const cell = row.getCell(column);
      const heading = headerRows.includes(rowIndex);
      cell.font = { name: "Microsoft YaHei", size: 10, bold: heading, color: { argb: "FF1F2937" } };
      cell.alignment = { vertical: "middle", horizontal: heading ? "center" : "left", wrapText: true };
      if (table) cell.border = xBorder();
      if (heading) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    }
  }
  /* 合并区右缘续画边框（formatPdfWorkbookSheet 的 mergedAreas 行高推演口径） */
  applyColumnWidths(sheet as unknown as { getColumn: (n: number) => { width: number } }, rows, item);
}

/** 飞鼠 addPdfTableNotes：低置信单元格加批注 */
function addTableNotes(sheet: { getRow: (n: number) => AnyRow }, rows: unknown[][], confidenceRows?: number[][]) {
  rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    const conf = confidenceRows?.[rowIndex]?.[columnIndex];
    if (value && Number.isFinite(conf as number) && (conf as number) < 0.75) {
      const cell = sheet.getRow(rowIndex + 1).getCell(columnIndex + 1);
      cell.note = `低置信识别 / Low-confidence extraction: ${Math.round((conf as number) * 100)}%`;
    }
  }));
}

/** model.sheets → ExcelJS 工作簿 buffer（表头行冻结 + 低置信批注 + 原口径列宽） */
export async function writeModelToXlsxBuffer(
  model: ReturnType<typeof buildModel>
): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default as unknown as {
    Workbook: new () => {
      creator: string;
      created: Date;
      modified: Date;
      calcProperties: { fullCalcOnLoad: boolean };
      addWorksheet: (name: string) => AnySheet & {
        views?: unknown; pageSetup?: unknown; properties?: Record<string, unknown>;
        mergeCells: (range: string) => void;
        addRow: (values: unknown[]) => void;
        getCell: (addr: string) => AnyCell;
      };
      xlsx: { writeBuffer: () => Promise<ArrayBuffer> };
    };
  };
  const wb = new ExcelJS.Workbook();
  wb.creator = "FlyingMouse Format (ported for ChuShi)";
  wb.created = new Date("2000-01-01T00:00:00.000Z");
  wb.modified = new Date("2000-01-01T00:00:00.000Z");
  wb.calcProperties.fullCalcOnLoad = true;
  const colLetters = (n: number) => {
    let s = "";
    for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(65 + ((v - 1) % 26)) + s;
    return s;
  };
  for (const sheet of model.sheets) {
    const rows: string[][] = sheet.rows.map((row: unknown[]) => row.map((v) => String(v ?? "")));
    const count = rows.reduce((m, r) => Math.max(m, r.length), 1);
    const ws = wb.addWorksheet(sheet.name);
    if (sheet.name.endsWith("-Raw")) {
      /* 非表格文本：飞鼠 -Raw sheet（单列逐行，网格线关） */
      formatWorkbookSheet(ws as never, rows, { table: false, item: sheet });
      rows.forEach((row) => ws.addRow(row));
    } else {
      const merges = (sheet.merges || []).map((m: { startRow: number; startCol: number; endRow: number; endCol: number }) =>
        `${colLetters(m.startCol + 1)}${m.startRow + 1}:${colLetters(m.endCol + 1)}${m.endRow + 1}`);
      formatWorkbookSheet(ws as never, rows, { table: true, headerRows: [1], merges: sheet.merges || [], item: sheet });
      for (let r = 0; r < rows.length; r += 1) {
        for (let c = 0; c < count; c += 1) {
          const cell = ws.getRow(r + 1).getCell(c + 1);
          const v = rows[r]?.[c] ?? "";
          cell.value = v === "" ? null : v;
          if (v !== "") cell.numFmt = "@";
        }
      }
      for (const range of merges) ws.mergeCells(range);
      addTableNotes(ws as never, rows, sheet.cellConfidence);
      /* 低置信整表加待核对染色（REVIEW_FILL） */
      (sheet.cellConfidence || []).forEach((row: number[], r: number) => row.forEach((conf, c) => {
        if (Number.isFinite(conf) && conf < REVIEW_CONFIDENCE && rows[r]?.[c]) {
          const cell = ws.getRow(r + 1).getCell(c + 1);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REVIEW_FILL } };
        }
      }));
    }
    configureSheet(ws as never, 1);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/* ---------------- docx 写入器（飞鼠 makeTable/tableRows 口径移植） ---------------- */

const A4_WIDTH_DXA = 11906;
const MARGIN_DXA = 1440;
const CONTENT_WIDTH_DXA = A4_WIDTH_DXA - 2 * MARGIN_DXA;
const TABLE_INDENT_DXA = 120;
const TABLE_WIDTH_DXA = CONTENT_WIDTH_DXA - TABLE_INDENT_DXA;

interface MergeRange { startRow: number; startCol: number; endRow: number; endCol: number }

/** 飞鼠 tableRows 的 rows+merges 形态：网格并查集产物 → 单元格锚点+覆盖表 */
function tableCellsFromRows(rows: string[][], merges: MergeRange[], cellConfidence: number[][]) {
  const columns = Math.max(1, ...rows.map((r) => r.length));
  const rowCount = rows.length;
  const base = Math.floor(TABLE_WIDTH_DXA / columns);
  const widths = Array.from({ length: columns }, (_, index) =>
    index === columns - 1 ? TABLE_WIDTH_DXA - base * (columns - 1) : base);
  const anchors = new Map<string, { text: string; rowSpan: number; columnSpan: number; confidence?: number }>();
  const covering = new Map<string, { row: number; column: number; rowSpan: number; columnSpan: number; confidence?: number }>();
  for (const merge of merges) {
    anchors.set(`${merge.startRow}:${merge.startCol}`, {
      text: String(rows[merge.startRow]?.[merge.startCol] ?? ""),
      rowSpan: merge.endRow - merge.startRow + 1,
      columnSpan: merge.endCol - merge.startCol + 1,
      confidence: cellConfidence[merge.startRow]?.[merge.startCol],
    });
    for (let r = merge.startRow; r <= merge.endRow; r += 1) {
      for (let c = merge.startCol; c <= merge.endCol; c += 1) {
        covering.set(`${r}:${c}`, { row: merge.startRow, column: merge.startCol, rowSpan: anchors.get(`${merge.startRow}:${merge.startCol}`)!.rowSpan, columnSpan: anchors.get(`${merge.startRow}:${merge.startCol}`)!.columnSpan, confidence: cellConfidence[merge.startRow]?.[merge.startCol] });
      }
    }
  }
  for (let r = 0; r < rowCount; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      if (!anchors.has(`${r}:${c}`) && !covering.has(`${r}:${c}`)) {
        anchors.set(`${r}:${c}`, { text: String(rows[r]?.[c] ?? ""), rowSpan: 1, columnSpan: 1, confidence: cellConfidence[r]?.[c] });
      }
    }
  }
  return { anchors, covering, widths, columns, rowCount };
}

/** 页产物 → docx Document children（段落用 runs 样式；标题按 fontSizePt 启发式） */
export async function writePagesToDocxBlob(
  pages: { pageNumber: number; tables: ReturnType<typeof detectPageTables>["tables"]; rawBlocks: NonNullable<ReturnType<typeof detectPageTables>["rawBlocks"]> }[]
): Promise<Blob> {
  const docx = await import("docx");
  const {
    AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph,
    ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun,
    VerticalMergeType, WidthType, PageBreak,
  } = docx as unknown as Record<string, never> & typeof import("docx");

  const confidenceShading = (conf: unknown) =>
    Number.isFinite(Number(conf)) && Number(conf) < REVIEW_CONFIDENCE
      ? { type: ShadingType.CLEAR, color: "auto", fill: REVIEW_FILL }
      : undefined;

  const makeTable = (table: { rows: string[][]; merges: MergeRange[]; cellConfidence: number[][] }) => {
    const { anchors, covering, widths, columns, rowCount } = tableCellsFromRows(table.rows, table.merges || [], table.cellConfidence || []);
    const border = { style: BorderStyle.SINGLE, size: 4, color: "B7C3D0" };
    const out: import("docx").TableRow[] = [];
    for (let row = 0; row < rowCount; row += 1) {
      const cells: import("docx").TableCell[] = [];
      for (let column = 0; column < columns;) {
        const anchor = anchors.get(`${row}:${column}`);
        if (anchor) {
          const spanWidth = widths.slice(column, column + anchor.columnSpan).reduce((sum, value) => sum + value, 0);
          cells.push(new TableCell({
            children: [new Paragraph({ text: anchor.text })],
            width: { size: spanWidth, type: WidthType.DXA },
            columnSpan: anchor.columnSpan > 1 ? anchor.columnSpan : undefined,
            verticalMerge: anchor.rowSpan > 1 ? VerticalMergeType.RESTART : undefined,
            shading: confidenceShading(anchor.confidence),
          }));
          column += anchor.columnSpan;
          continue;
        }
        const covered = covering.get(`${row}:${column}`);
        if (covered && covered.row < row && covered.column === column) {
          const spanWidth = widths.slice(column, column + covered.columnSpan).reduce((sum, value) => sum + value, 0);
          cells.push(new TableCell({
            children: [new Paragraph("")],
            width: { size: spanWidth, type: WidthType.DXA },
            columnSpan: covered.columnSpan > 1 ? covered.columnSpan : undefined,
            verticalMerge: VerticalMergeType.CONTINUE,
            shading: confidenceShading(covered.confidence),
          }));
          column += covered.columnSpan;
          continue;
        }
        if (covered) { column += 1; continue; }
        cells.push(new TableCell({
          children: [new Paragraph("")],
          width: { size: widths[column], type: WidthType.DXA },
        }));
        column += 1;
      }
      out.push(new TableRow({ children: cells }));
    }
    return new Table({
      rows: out,
      width: { size: TABLE_WIDTH_DXA, type: WidthType.DXA },
      columnWidths: widths,
      indent: { size: TABLE_INDENT_DXA, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    });
  };

  const runsOf = (block: { text: string; runs?: { text: string; style?: { bold?: boolean; italic?: boolean; fontSizePt?: number; fontName?: string } }[] }) => {
    const runs = block.runs?.length ? block.runs : [{ text: block.text, style: undefined as unknown as { bold?: boolean; italic?: boolean; fontSizePt?: number; fontName?: string } }];
    return runs.map((run) => new TextRun({
      text: run.text,
      bold: run.style?.bold,
      italics: run.style?.italic,
      font: run.style?.fontName,
      size: run.style?.fontSizePt ? Math.round(run.style.fontSizePt * 2) : undefined,
    }));
  };

  const children: (import("docx").Paragraph | import("docx").Table)[] = [];
  let editable = false;
  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    /* 飞鼠版面流：表（bounds.top）与文本块（y）按纵向次序穿插 */
    const flow: { y: number; kind: "table" | "text"; render: () => import("docx").Paragraph | import("docx").Table }[] = [];
    for (const table of page.tables || []) {
      if (!table) continue;
      flow.push({ y: (table as { bounds?: { top?: number } }).bounds?.top ?? 0, kind: "table", render: () => makeTable({ rows: (table as { rows: string[][] }).rows, merges: (table as { merges: MergeRange[] }).merges, cellConfidence: (table as { cellConfidence: number[][] }).cellConfidence }) });
    }
    for (const block of page.rawBlocks || []) {
      if (!String(block.text || "").trim()) continue;
      const size = Number(block.style?.fontSizePt) || 11;
      const heading = size >= 17 ? HeadingLevel.HEADING_1 : size >= 13.5 ? HeadingLevel.HEADING_2 : undefined;
      flow.push({
        y: block.y,
        kind: "text",
        render: () => new Paragraph({
          children: runsOf(block as never),
          heading,
          alignment: AlignmentType.LEFT,
          spacing: { line: 340, after: 120 },
        }),
      });
    }
    flow.sort((a, b) => a.y - b.y);
    for (const item of flow) {
      children.push(item.render());
      editable = true;
    }
  });
  if (!editable) {
    throw Object.assign(new Error("未从 PDF 提取到可编辑内容（扫描件请使用「扫描件 OCR」工具）"), { code: "PDF_DOCX_NO_EDITABLE_CONTENT" });
  }
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: A4_WIDTH_DXA, height: 16838 },
          margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA },
        },
      },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
