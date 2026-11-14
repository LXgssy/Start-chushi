// verify-real.mjs — 真实样本输出解析验证
import fs from "node:fs";
import { execSync } from "node:child_process";

const OUT = "/tmp/pdf-out-real";
let pass = 0;
const bad = [];
const T = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { bad.push(name); console.log(`  [FAIL] ${name}${detail ? " | " + detail : ""}`); }
};

/* ---------- 扫描件 → Word（OCR 段落流） ---------- */
{
  execSync(`rm -rf /tmp/dxs && mkdir /tmp/dxs && cd /tmp/dxs && unzip -q "${OUT}/PDF 转 Word-scanned.pdf.out.docx" 2>/dev/null || unzip -q "${OUT}/PDF 转 Word-scanned.pdf.out"`);
  const xml = fs.readFileSync("/tmp/dxs/word/document.xml", "utf-8");
  const has = (t) => xml.includes(t);
  console.log("[scan2word]");
  T("S1 标题 OCR（入库单）", has("入库单") || has("入 库 单"));
  T("S2 表头 OCR（编号+物料名称+单价同行）", has("编号") && has("物料名称") && has("单价"));
  T("S3 数据 OCR（WL-001~004 行 + 数量/单价列）", has("WL-001") && has("WL-004") && has("42.50") && has("31.75"));
  T("S4 第二页 OCR（出库单）", has("出库单") || has("出 库 单"));
  T("S5 非空段落 >4", (xml.match(/<w:p[ >]/g) || []).length > 4);
}

/* ---------- 发票 → Word（原生网格） ---------- */
{
  execSync(`rm -rf /tmp/dxi && mkdir /tmp/dxi && cd /tmp/dxi && unzip -q "${OUT}/PDF 转 Word-invoice.pdf.out"`);
  const xml = fs.readFileSync("/tmp/dxi/word/document.xml", "utf-8");
  const tbl = (xml.match(/<w:tbl>/g) || []).length;
  console.log("[invoice2word]", tbl, "表");
  T("I1 结算清单标题", xml.includes("销售结算清单"));
  T("I2 表格还原（1 表）", tbl === 1, `t=${tbl}`);
  T("I3 表头与数据格", xml.includes("货物名称") && xml.includes("高精度轴承 6205"));
  T("I4 金额格", xml.includes("6400.00") && xml.includes("4480.00"));
  T("I5 合计在", xml.includes("20,031.15"));
}

/* ---------- 发票 → Excel（矢量网格） ---------- */
{
  const XLSX = await import("xlsx");
  const wb = XLSX.read(fs.readFileSync(`${OUT}/PDF 转 Excel-invoice.pdf.out`), { type: "array" });
  const tName = wb.SheetNames.find((n) => /-T0/.test(n));
  const grid = tName ? XLSX.utils.sheet_to_json(wb.Sheets[tName], { header: 1, raw: true }) : [];
  console.log("[invoice2excel]", JSON.stringify(wb.SheetNames), grid.length, "行");
  T("E1 表格工作表存在", !!tName);
  T("E2 表头行 6 列", JSON.stringify(grid[0] || []).includes("货物名称") && (grid[0] || []).length >= 6, JSON.stringify(grid[0]));
  T("E3 数据行（轴承 6400.00）", grid.some((r) => r.some((c) => String(c || "").includes("高精度轴承"))));
  T("E4 行数 5", grid.length === 5, `n=${grid.length}`);
}

/* ---------- 扫描件 → Excel（OCR 词元网格） ---------- */
{
  const XLSX = await import("xlsx");
  const wb = XLSX.read(fs.readFileSync(`${OUT}/PDF 转 Excel-scanned.pdf.out`), { type: "array" });
  const t1 = wb.SheetNames.find((n) => n === "P001-T01");
  const t2 = wb.SheetNames.find((n) => n === "P002-T01");
  const g1 = t1 ? XLSX.utils.sheet_to_json(wb.Sheets[t1], { header: 1, raw: true }) : [];
  const g2 = t2 ? XLSX.utils.sheet_to_json(wb.Sheets[t2], { header: 1, raw: true }) : [];
  console.log("[scan2excel]", JSON.stringify(wb.SheetNames));
  T("O1 两页各出一张表", !!t1 && !!t2);
  T("O2 表头列位（编号+物料+数量+单价同行）", g1.some((r) => r.includes("编号") && r.includes("数量") && r.includes("单价")));
  T("O3 数据行编号列对位（WL-001~004 全在首列）", g1.filter((r) => String(r[0] || "").startsWith("WL-")).length === 4);
  T("O4 数量/单价列对位（120/42.50 同行相邻）", g1.some((r) => r.includes("120") && r.includes("42.50")));
  T("O5 第二页出库单（CK-002/一车间）", g2.some((r) => String(r[0] || "").startsWith("CK-002")) && g2.some((r) => r.includes("一") && r.includes("车间")));
}

/* ---------- WPS docx → PDF ---------- */
{
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(`${OUT}/Word 转 PDF-wps.docx.out`));
  const doc = await pdfjs.getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    text += (await pg.getTextContent()).items.map((it) => it.str || "").join("\n");
  }
  console.log("[wps2pdf]", doc.numPages, "页");
  T("W1 标题/标题层级", text.includes("项目验收报告") && text.includes("验收概述"));
  T("W2 正文完整", text.includes("测试用例执行率 100%") && text.includes("建议进入质保期"));
}

/* ---------- 合并单元格 xlsx → PDF ---------- */
{
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(`${OUT}/Excel 转 PDF-merged.xlsx.out`));
  const doc = await pdfjs.getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    text += (await pg.getTextContent()).items.map((it) => it.str || "").join("\n");
  }
  console.log("[merged2pdf]", doc.numPages, "页");
  T("M1 合并标题行", text.includes("2026 年度部门预算汇总表"));
  T("M2 数据完整", text.includes("研发") && text.includes("150") && text.includes("行政"));
  T("M3 第二 sheet（说明）", text.includes("财务部复核确认"));
}

/* ---------- 分组形状 pptx → PDF ---------- */
{
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(`${OUT}/PPT 转 PDF-grouped.pptx.out`));
  const doc = await pdfjs.getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    text += (await pg.getTextContent()).items.map((it) => it.str || "").join("\n");
  }
  console.log("[grouped2pdf]", doc.numPages, "页");
  T("G1 分组形状文本", text.includes("季度经营复盘") && text.includes("研发投入占比 18%"));
  T("G2 表格形状文本", text.includes("营收（万元）") && text.includes("41.6%"));
}

console.log(`\nVERIFY-REAL: ${pass} PASS / ${bad.length} FAIL`);
if (bad.length) { console.log("FAILED:", ...bad); process.exit(1); }
console.log("ALL PASS");
