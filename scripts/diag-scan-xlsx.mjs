// diag-scan-xlsx.mjs — 扫描件 OCR→表格全链 Node 复现（带看门狗）
import fs from "node:fs";

const watchdog = setTimeout(() => {
  console.error("WATCHDOG: 90s 未完成——OCR 表格链卡死实锤");
  process.exit(9);
}, 90000);

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { createCanvas } = await import("@napi-rs/canvas");
const mod = await import("../src/lib/startpage/pdf-table-runtime.js");
const ext = await import("../src/lib/startpage/pdf-table-extractor.js");

const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync("/tmp/pdf-samples-real/scanned.pdf")) }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 200 / 72 });
const canvas = createCanvas(Math.floor(vp.width), Math.floor(vp.height));
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, canvas.width, canvas.height);
await page.render({ canvasContext: ctx, viewport: vp, background: "#ffffff" }).promise;

/* 线检测 */
const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
const lines = mod.detectTableLinesFromRaw({ data: new Uint8Array(img.data.buffer), width: canvas.width, height: canvas.height, channels: 4 });
console.log("raster lines:", lines.length, "| vertical:", lines.filter((l) => Math.abs(l.x2 - l.x1) <= 2).length);

/* OCR（tesseract.js Node 侧，200dpi 口径） */
const { createWorker } = await import("tesseract.js");
const worker = await createWorker("chi_sim+eng", 1, {
  langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
});
await worker.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "200" });
const t0 = Date.now();
const pngBuffer = canvas.toBuffer("image/png");
const { data } = await worker.recognize(pngBuffer, {}, { blocks: true });
console.log(`ocr done in ${Date.now() - t0}ms, text chars=${(data.text || "").length}`);
await worker.terminate();

const words = mod.normalizeOcrResult(data);
console.log("normalized words:", words.length, "| sample:", words.slice(0, 4).map((w) => `${w.text}@${Math.round(w.x)},${Math.round(w.y)}`).join(" | "));

const t1 = Date.now();
const detected = ext.detectTablesOnPage({ pageNumber: 1, width: vp.width, height: vp.height, pagePointScale: 1 / (200 / 72), source: "ocr", words, lines });
console.log(`detect in ${Date.now() - t1}ms: tables=${detected.tables?.length} rawRows=${detected.rawRows?.length ?? "-"}`);
for (const t of detected.tables || []) {
  console.log(`  table ${t.kind} ${t.rows?.length}x${t.rows?.[0]?.length} conf=${t.confidence?.toFixed?.(2)}`);
  console.log("   ", JSON.stringify(t.rows?.slice(0, 3)).slice(0, 200));
}
const model = ext.buildWorkbookModel([detected]);
console.log("model sheets:", model.sheets.map((s) => `${s.name}(${s.rows.length}行)`).join(", "));
const ocrConf = (model.summary || []).filter((s) => s.source === "ocr").map((s) => s.confidence);
console.log("ocr confidences:", JSON.stringify(ocrConf));
clearTimeout(watchdog);
console.log("NO HANG");
