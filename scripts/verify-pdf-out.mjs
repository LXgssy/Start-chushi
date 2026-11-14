// verify-pdf-out.mjs — 复现 harness 的输出解析验证（六链质量断言）
import fs from "node:fs";
import { execSync } from "node:child_process";

const OUT = "/tmp/pdf-out";
const manifest = JSON.parse(fs.readFileSync(`${OUT}/manifest.json`, "utf-8"));
let pass = 0;
const bad = [];
const T = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { bad.push(name); console.log(`  [FAIL] ${name}${detail ? " | " + detail : ""}`); }
};

/* ---------- PDF 文本抽取（pdfjs legacy） ---------- */
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
async function pdfText(path) {
  const data = new Uint8Array(fs.readFileSync(path));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    pages.push(tc.items.map((it) => it.str || "").join("\n"));
  }
  return { n: doc.numPages, text: pages.join("\n") };
}

/* ---------- ① word2pdf ---------- */
{
  const { n, text } = await pdfText(manifest.word2pdf);
  console.log("[word2pdf]", n, "页,", text.length, "字符");
  T("W1 标题在文字层", text.includes("季度经营分析报告"));
  T("W2 正文段落完整", text.includes("本报告汇总了第二季度各部门的核心经营指标"));
  T("W3 表格内容在", text.includes("研发部") && text.includes("1280.5") && text.includes("同比增长"));
  T("W4 结论段在", text.includes("整体经营状况稳中向好"));
  T("W5 无乱码替换符", !text.includes("\uFFFD"));
  T("W6 页数合理（1-4）", n >= 1 && n <= 4, `n=${n}`);
}

/* ---------- ② excel2pdf ---------- */
{
  const { n, text } = await pdfText(manifest.excel2pdf);
  console.log("[excel2pdf]", n, "页,", text.length, "字符");
  T("E1 表头在", text.includes("产品名称") && text.includes("单价") && text.includes("金额"));
  T("E2 数据行在", text.includes("智能音箱 Pro") && text.includes("47880"));
  T("E3 第二张表（备注）在", text.includes("本表数据用于格式转换验证"));
  T("E4 无乱码替换符", !text.includes("\uFFFD"));
}

/* ---------- ③ ppt2pdf ---------- */
{
  const { n, text } = await pdfText(manifest.ppt2pdf);
  console.log("[ppt2pdf]", n, "页,", text.length, "字符");
  T("P1 页数=幻灯片数 2", n === 2, `n=${n}`);
  T("P2 页 1 标题+列点", text.includes("产品发布计划") && text.includes("第一阶段：内测招募") && text.includes("第三阶段：正式上线"));
  T("P3 页 2 标题+列点", text.includes("里程碑") && text.includes("九月底完成灰度放量"));
  T("P4 无乱码替换符", !text.includes("\uFFFD"));
}

/* ---------- ④ pdf2word（docx 解包） ---------- */
{
  const docx = manifest.pdf2word;
  execSync(`rm -rf /tmp/dx && mkdir /tmp/dx && cd /tmp/dx && unzip -q "${docx}"`);
  const xml = fs.readFileSync("/tmp/dx/word/document.xml", "utf-8");
  const paragraphs = (xml.match(/<w:p[ >]/g) || []).length;
  const tables = (xml.match(/<w:tbl>/g) || []).length;
  console.log("[pdf2word]", paragraphs, "段,", tables, "表");
  T("D1 标题段在", xml.includes("数字化转型白皮书"));
  T("D2 正文段在（战略层面）", xml.includes("战略层面，企业需要明确转型的愿景与路线图"));
  T("D3 正文段在（技术层面）", xml.includes("云原生架构与数据中台建设"));
  T("D4 无乱码替换符", !xml.includes("\uFFFD"));
  T("D5 段落数合理（4-12）", paragraphs >= 4 && paragraphs <= 12, `p=${paragraphs}`);
}

/* ---------- ⑤ pdf2excel（飞鼠引擎：P001-T01 网格 + P001-Raw 留档） ---------- */
{
  const XLSX = await import("xlsx");
  const wb = XLSX.read(fs.readFileSync(manifest.pdf2excel), { type: "array" });
  console.log("[pdf2excel] sheets:", JSON.stringify(wb.SheetNames));
  const tName = wb.SheetNames.find((n) => /-T0/.test(n));
  const rName = wb.SheetNames.find((n) => /-Raw/.test(n));
  const grid = tName ? XLSX.utils.sheet_to_json(wb.Sheets[tName], { header: 1, raw: true }) : [];
  const raw = rName ? XLSX.utils.sheet_to_json(wb.Sheets[rName], { header: 1, raw: true }) : [];
  T("X0 表格工作表存在（P00X-T01）", !!tName);
  T("X1 网格首行 [部门,营收,成本,利润]", JSON.stringify(grid[0] || []) === JSON.stringify(["部门", "营收", "成本", "利润"]), JSON.stringify(grid[0]));
  T("X2 数据行研发部 [研发部,1280.50,960.30,320.20]", JSON.stringify(grid[1] || []) === JSON.stringify(["研发部", "1280.50", "960.30", "320.20"]), JSON.stringify(grid[1]));
  T("X3 数据行市场部/客服部", grid.some((r) => String(r?.[0]) === "市场部") && grid.some((r) => String(r?.[0]) === "客服部"));
  T("X4 网格 4×4 无碎裂", grid.length === 4 && grid.every((r) => r.length === 4), JSON.stringify(grid.map((r) => r.length)));
  T("X5 标题/注释入 Raw 留档不混表", !!rName && raw.some((r) => r.some((c) => String(c || "").includes("季度财务汇总表"))) && raw.some((r) => r.some((c) => String(c || "").includes("利润 = 营收"))));
  T("X6 行序从上到下（标题在数据行之前）", !!rName && raw.findIndex((r) => r.some((c) => String(c || "").includes("季度财务汇总表"))) < grid.length);
}

/* ---------- ④b pdf2word（表格版：网格还原为 docx Table） ---------- */
{
  execSync(`rm -rf /tmp/dx2 && mkdir /tmp/dx2 && cd /tmp/dx2 && unzip -q "${manifest.pdf2wordTable}"`);
  const xml = fs.readFileSync("/tmp/dx2/word/document.xml", "utf-8");
  const tables = (xml.match(/<w:tbl>/g) || []).length;
  const cells = (xml.match(/<w:tc>/g) || []).length;
  console.log("[pdf2word-table]", tables, "表,", cells, "格");
  T("X7 表格还原为 docx Table（1 表 16 格）", tables === 1 && cells === 16, `t=${tables} c=${cells}`);
  T("X8 表头格在", xml.includes("营收") && xml.includes("利润"));
  T("X9 数据格在", xml.includes("1280.50") && xml.includes("2379.60"));
  T("X10 注释在表外段落", (xml.match(/<w:p[ >]/g) || []).length > 0 && xml.includes("同比增长率详见附表"));
}

/* ---------- ⑥ pdf2ppt（解包） ---------- */
{
  const pptx = manifest.pdf2ppt;
  execSync(`rm -rf /tmp/px && mkdir /tmp/px && cd /tmp/px && unzip -q "${pptx}"`);
  const slides = fs.readdirSync("/tmp/px/ppt/slides").filter((f) => f.endsWith(".xml"));
  const media = fs.existsSync("/tmp/px/ppt/media") ? fs.readdirSync("/tmp/px/ppt/media") : [];
  console.log("[pdf2ppt]", slides.length, "slides,", media.length, "media");
  T("S1 slide 数=1（源 PDF 1 页）", slides.length === 1, `n=${slides.length}`);
  T("S2 图片型幻灯片含媒体", media.length >= 1, JSON.stringify(media));
}

/* ---------- ⑦ 复杂样本：跨页表 pdf2word + 图 docx word2pdf ---------- */
{
  execSync(`rm -rf /tmp/dx3 && mkdir /tmp/dx3 && cd /tmp/dx3 && unzip -q "${manifest.pdf2wordComplex}"`);
  const xml = fs.readFileSync("/tmp/dx3/word/document.xml", "utf-8");
  const tables = (xml.match(/<w:tbl>/g) || []).length;
  const rows40 = (xml.match(/商品型号/g) || []).length;
  console.log("[pdf2word-complex]", tables, "表,", rows40, "商品型号格");
  T("C1 跨页表 40 行商品型号全在", rows40 === 40, `n=${rows40}`);
  T("C2 序号列 1-40 连续（行序正向）", xml.includes(">40<") && (xml.indexOf(">1<") < xml.indexOf(">40<")));
  T("C3 区域销售表在", xml.includes("区域") && xml.includes("5820.40"));
}
{
  const { n, text } = await pdfText(manifest.word2pdfComplex);
  console.log("[word2pdf-complex]", n, "页,", text.length, "字符");
  T("C4 三级标题在", text.includes("项目启动方案") && text.includes("实施阶段") && text.includes("第一阶段"));
  T("C5 列表项在", text.includes("需求调研与访谈") && text.includes("技术选型确认"));
  T("C6 表格在", text.includes("阶段") && text.includes("张工") && text.includes("李工"));
  T("C7 页数合理（2-6）", n >= 2 && n <= 6, `n=${n}`);
}

console.log(`\nVERIFY-PDF-OUT: ${pass} PASS / ${bad.length} FAIL`);
if (bad.length) { console.log("FAILED:", ...bad); process.exit(1); }
console.log("ALL PASS");
