// diag-hang.mjs — 卡死隔离：invoice.pdf 全管线（检测→docx 构建）带看门狗
import fs from "node:fs";

const watchdog = setTimeout(() => {
  console.error("WATCHDOG: 60s 未完成——管线卡死实锤");
  console.error(new Error().stack);
  process.exit(9);
}, 60000);

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { createCanvas } = await import("@napi-rs/canvas");
const mod = await import("../src/lib/startpage/pdf-table-runtime.js");
const ext = await import("../src/lib/startpage/pdf-table-extractor.js");
const office = await import("../src/lib/startpage/pdf-office.ts");

const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync("/tmp/pdf-samples-real/invoice.pdf")) }).promise;
console.log("pages:", doc.numPages);
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const t0 = Date.now();
  const input = await office.extractOfficePage(page, i);
  console.log(`page ${i}: words=${input.words.length} lines=${input.lines.length} (${Date.now() - t0}ms)`);
  const t1 = Date.now();
  const detected = office.detectPageTables(input, "text");
  console.log(`  detect: tables=${detected.tables?.length} rawBlocks=${detected.rawBlocks?.length} (${Date.now() - t1}ms)`);
  for (const t of detected.tables || []) {
    console.log(`  table: ${t.rows?.length}x${t.rows?.[0]?.length} merges=${JSON.stringify(t.merges).slice(0, 120)}`);
  }
  pages.push({ pageNumber: i, tables: detected.tables || [], rawBlocks: detected.rawBlocks || [] });
}
console.log("— detect done, building docx…");
const t2 = Date.now();
const blob = await office.writePagesToDocxBlob(pages);
console.log(`docx built in ${Date.now() - t2}ms, size=${blob.size}`);
clearTimeout(watchdog);
console.log("NO HANG");
