// diag-xlsx-lines.mjs — 幽灵列实锤：200dpi 渲染 → detectTableLinesFromRaw → 打印竖线
import fs from "node:fs";
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { createCanvas } = await import("@napi-rs/canvas");
const mod = await import("../src/lib/startpage/pdf-table-runtime.js");
const office = await import("../src/lib/startpage/pdf-office.ts");
const ext = await import("../src/lib/startpage/pdf-table-extractor.js");

const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync("/tmp/pdf-samples/table-doc.pdf")) }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 200 / 72 });
const canvas = createCanvas(Math.floor(vp.width), Math.floor(vp.height));
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, canvas.width, canvas.height);
await page.render({ canvasContext: ctx, viewport: vp, background: "#ffffff" }).promise;
const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
const lines = mod.detectTableLinesFromRaw({ data: new Uint8Array(img.data.buffer), width: canvas.width, height: canvas.height, channels: 4 });
const vertical = lines.filter((l) => Math.abs(l.x2 - l.x1) <= 2).map((l) => Math.round(l.x1)).sort((a, b) => a - b);
const horizontal = lines.filter((l) => Math.abs(l.y2 - l.y1) <= 2).length;
console.log("vertical x:", vertical.join(", "), "| horizontal count:", horizontal);
const vlines = await office.extractVectorLines(page, vp);
console.log("vector lines:", vlines.length);
vlines.slice(0, 20).forEach((l) => console.log("   v", l.x1.toFixed(0), l.y1.toFixed(0), "→", l.x2.toFixed(0), l.y2.toFixed(0)));
console.log("vp.transform:", vp.transform.map((n) => Math.round(n * 1000) / 1000).join(","), "| size:", Math.round(vp.width), Math.round(vp.height));
const tcRaw = await page.getTextContent();
console.log("first item transform:", JSON.stringify(tcRaw.items.find((it) => it.str?.trim())?.transform));
const words = mod.pdfTextContentToWords({ textContent: tcRaw, viewport: vp });
console.log("words:", words.length, "| sample:", words.slice(0, 3).map((w) => `${w.text}@${Math.round(w.x)},${Math.round(w.y)}`).join(" | "));
const allLines = [...vlines, ...lines];
console.log("total lines:", allLines.length);
const detected = ext.detectTablesOnPage({ pageNumber: 1, width: vp.width, height: vp.height, pagePointScale: 1 / (200 / 72), source: "text", words, lines: allLines });
console.log("tables:", detected.tables.length);
detected.tables.forEach((t, i) => {
  console.log(`  T${i}: kind=${t.kind} rows=${t.rows?.length} cols=${t.rows?.[0]?.length} bounds.top=${Math.round(t.bounds?.top || 0)} rowAnchors=${JSON.stringify((t.rowAnchors || []).map(Math.round))}`);
  console.log(`      rows0-3: ${JSON.stringify(t.rows?.slice(0, 4))}`);
});

