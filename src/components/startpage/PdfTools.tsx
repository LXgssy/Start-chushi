"use client";

/* ============================================================
 * 「初始」PDF 工具箱（v8.7.52）—— 新标签页内置的本地 PDF 转换面板
 *
 * 回答「可以内置一个 PDF 转换工具吗」：可以，而且不需要任何服务器——
 * 图片转 PDF / 合并用 pdf-lib（纯 JS 直写 PDF 字节），PDF 转图片 /
 * 提取文本用 pdf.js（Firefox 同款渲染引擎，worker 文件随扩展包内置），
 * 全程 File API 本地处理，文件永不离开设备（隐私律）。
 *
 * 四功能：
 *   ① 图片转 PDF —— 多选 jpg/png/webp/gif/bmp/avif，按列表顺序每图一页
 *      （webp 等非 jpg/png 先经 canvas 转 PNG 再嵌入；jpg/png 原字节直嵌）；
 *   ② PDF 转图片 —— 每页渲染 2x PNG，多页自动打 zip（fflate）一次下载；
 *   ③ PDF 合并   —— 多选按序 copyPages 合成一个；
 *   ④ 提取文本   —— 每页 getTextContent 拼接，txt 下载 + 一键复制。
 *
 * 懒加载律：pdf-lib / pdfjs-dist / worker 全部动态 import，用户点开面板
 * 并真正开始转换才拉取（分 chunk，首屏与主 bundle 零负担）。worker 路径
 * 与 gallery.ts/sandbox.ts 同律：构建期 NEXT_PUBLIC_BASE_PATH 内联——
 * 扩展环境空串（根路径），网页版 /Start-chushi 前缀。
 * ============================================================ */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
import { Check, FileText, Image as ImageIcon, Loader2, RefreshCw, X } from "lucide-react";

type TabId = "img2pdf" | "pdf2img" | "merge" | "text";

const TABS: { id: TabId; name: string; desc: string }[] = [
  { id: "img2pdf", name: "图片转 PDF", desc: "多张图片合成一个 PDF，每图一页，按列表顺序" },
  { id: "pdf2img", name: "PDF 转图片", desc: "每一页渲染成 PNG，多页自动打包 zip 下载" },
  { id: "merge", name: "PDF 合并", desc: "多个 PDF 按列表顺序合并为一个文件" },
  { id: "text", name: "提取文本", desc: "抽取 PDF 全部文字，下载 txt 或直接复制" },
];

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
  const [tab, setTab] = useState<TabId>("img2pdf");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [doneMsg, setDoneMsg] = useState("");
  const [err, setErr] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [textOut, setTextOut] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* 打开面板即重置全部状态（tab 保留，文件不跨会话残留） */
  useEffect(() => {
    if (open) {
      setFiles([]);
      setBusy(false);
      setStatus("");
      setDoneMsg("");
      setErr("");
      setTextOut("");
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

  function pickFiles(accept: string, multiple: boolean) {
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    input.accept = accept;
    input.multiple = multiple;
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

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, k) => k !== i));
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

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setErr("");
    setDoneMsg("");
    try {
      const msg = await fn();
      setDoneMsg(msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  /* ---------- ① 图片转 PDF ---------- */
  const img2pdf = () =>
    run(async () => {
      if (!files.length) throw new Error("请先选择图片");
      const { PDFDocument } = await import("pdf-lib");
      setStatus(`合成 ${files.length} 张图片…`);
      const doc = await PDFDocument.create();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setStatus(`嵌入 (${i + 1}/${files.length})：${f.name}`);
        const { data, kind } = await toEmbeddable(f);
        const img =
          kind === "jpg" ? await doc.embedJpg(data) : await doc.embedPng(data);
        const page = doc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      const bytes = await doc.save();
      downloadBlob(
        new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        "图片合集.pdf"
      );
      return `已生成「图片合集.pdf」（${files.length} 页）`;
    });

  /* ---------- ② PDF 转图片 ---------- */
  const pdf2img = () =>
    run(async () => {
      if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc =
        `${(process.env.NEXT_PUBLIC_BASE_PATH as string) || ""}/pdf.worker.min.mjs`;
      setStatus("解析 PDF…");
      const doc = await pdfjs.getDocument({ data: await files[0].arrayBuffer() }).promise;
      const zipBag: Record<string, Uint8Array> = {};
      const single = doc.numPages === 1;
      for (let i = 1; i <= doc.numPages; i++) {
        setStatus(`渲染第 ${i}/${doc.numPages} 页…`);
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob: Blob | null = await new Promise((res) =>
          canvas.toBlob((b) => res(b), "image/png")
        );
        if (!blob) throw new Error(`第 ${i} 页导出失败`);
        const name = `${files[0].name.replace(/\.pdf$/i, "")}-第${i}页.png`;
        if (single) {
          downloadBlob(blob, name);
        } else {
          zipBag[name] = new Uint8Array(await blob.arrayBuffer());
        }
      }
      if (single) return `已导出 1 张 PNG`;
      const { zipSync } = await import("fflate");
      setStatus("打包 zip…");
      const zipped = zipSync(zipBag);
      downloadBlob(
        new Blob([zipped as unknown as BlobPart], { type: "application/zip" }),
        `${files[0].name.replace(/\.pdf$/i, "")}-图片.zip`
      );
      return `已导出 ${doc.numPages} 页 PNG 并打包 zip`;
    });

  /* ---------- ③ PDF 合并 ---------- */
  const mergePdfs = () =>
    run(async () => {
      if (files.length < 2) throw new Error("请选择至少 2 个 PDF 文件");
      const { PDFDocument } = await import("pdf-lib");
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
    });

  /* ---------- ④ 提取文本 ---------- */
  const extractText = () =>
    run(async () => {
      if (files.length !== 1) throw new Error("请选择 1 个 PDF 文件");
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc =
        `${(process.env.NEXT_PUBLIC_BASE_PATH as string) || ""}/pdf.worker.min.mjs`;
      setStatus("解析 PDF…");
      const doc = await pdfjs.getDocument({ data: await files[0].arrayBuffer() }).promise;
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
      setTextOut(text.slice(0, 4000) + (text.length > 4000 ? "\n…（全文已含在下载文件中）" : ""));
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      downloadBlob(blob, `${files[0].name.replace(/\.pdf$/i, "")}-文本.txt`);
      return `已提取 ${doc.numPages} 页文本并下载 txt`;
    });

  const acceptForTab =
    tab === "img2pdf"
      ? "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif"
      : "application/pdf";
  const multipleForTab = tab === "img2pdf" || tab === "merge";

  if (!host) return null;
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
          <PresenceClass
            exitClass="dialog-sink"
            duration={0.2}
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

            {/* 功能页签 */}
            <div className="flex gap-1 border-b border-zinc-900/5 px-4 pt-3 dark:border-white/5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id);
                    setFiles([]);
                    setDoneMsg("");
                    setErr("");
                    setTextOut("");
                  }}
                  className={`relative rounded-t-lg px-3 py-2 text-xs font-light transition-colors duration-150 ${
                    tab === t.id
                      ? "text-zinc-900 dark:text-zinc-50"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  {t.name}
                  {tab === t.id && (
                    <span
                      aria-hidden
                      className="absolute inset-x-2 bottom-0 h-0.5 rounded-full"
                      style={{ background: "var(--ui-accent, #8b5cf6)" }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* 正文 */}
            <div className="slim-scroll docs-anim overflow-y-auto px-5 py-4">
              <p className="mb-3 text-[11px] font-extralight leading-relaxed text-zinc-500 dark:text-zinc-400">
                {TABS.find((t) => t.id === tab)!.desc}
              </p>

              <div
                role="button"
                tabIndex={0}
                onClick={() => pickFiles(acceptForTab, multipleForTab)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pickFiles(acceptForTab, multipleForTab);
                  }
                }}
                className="mb-3 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-900/15 py-6 transition-colors duration-200 hover:border-zinc-900/30 hover:bg-zinc-900/[0.03] dark:border-white/15 dark:hover:border-white/30 dark:hover:bg-white/[0.04]"
              >
                <ImageIcon className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
                <p className="text-xs font-light text-zinc-600 dark:text-zinc-300">
                  点击选择{multipleForTab ? "（可多选）" : ""}
                </p>
                <p className="text-[10px] font-extralight text-zinc-400 dark:text-zinc-500">
                  {tab === "img2pdf"
                    ? "支持 JPG / PNG / WebP / GIF / BMP / AVIF"
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
                      {multipleForTab && (
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
                onClick={() => {
                  if (tab === "img2pdf") img2pdf();
                  else if (tab === "pdf2img") pdf2img();
                  else if (tab === "merge") mergePdfs();
                  else extractText();
                }}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-light tracking-wide text-white transition-opacity duration-200 disabled:opacity-40"
                style={{ background: "var(--ui-accent, #8b5cf6)" }}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
                {busy
                  ? status || "处理中…"
                  : tab === "img2pdf"
                    ? "转换为 PDF"
                    : tab === "pdf2img"
                      ? "转换为图片"
                      : tab === "merge"
                        ? "开始合并"
                        : "提取文本"}
              </button>

              {doneMsg && (
                <p
                  className="mb-2 flex items-center gap-1.5 text-[11px] font-light"
                  style={{ color: "var(--ui-accent, #8b5cf6)" }}
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
