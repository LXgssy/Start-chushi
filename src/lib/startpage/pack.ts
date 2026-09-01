/* 「初始」预设包（.cshz）解析 — 本地导入的 zip 包格式
 *
 * 包结构（zip，推荐扩展名 .cshz，也接受 .zip；.json 单文件走另一条路）：
 *   preset.cshz
 *   ├── manifest.json     必需 — 预设主体（与粘贴导入完全同一份 chushi:1 结构）
 *   ├── assets/           可选 — 资源文件，manifest 里用 "asset:文件名" 引用
 *   │   └── photo.jpg           （替换为 data: URL 内联，导入后无需保留包）
 *   └── （其余文件一律忽略，README.md 等不解析）
 *
 * 安全护栏：
 *   - 不落盘：只按白名单键读 zip 内文件（manifest.json、assets/<name>），不存在路径穿越面；
 *   - 解压后总大小 ≤ 4MB、条目数 ≤ 64，防 zip 炸弹；
 *   - 资源文件名仅 [A-Za-z0-9._-]，单文件 ≤ 512KB，MIME 白名单（图片/字体/音频）；
 *   - manifest 复用 parsePreset 全量校验，资产替换发生在校验之后（html/css 长度按替换后复核）。
 */

import { unzipSync, strFromU8 } from "fflate";
import { parsePreset, PRESET_LIMITS, type PresetPayload } from "./preset";

export type PackParseResult =
  | { ok: true; preset: PresetPayload; packName: string }
  | { ok: false; errors: string[] };

const MAX_TOTAL = 4 * 1024 * 1024; // 解压后总大小上限
const MAX_ENTRIES = 64;
const MAX_ASSET = 512 * 1024; // 单资源上限
const ASSET_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** asset:引用出现的位置（pages[].html 与 animations[].css 两处） */
const ASSET_REF_RE = /asset:([A-Za-z0-9._-]{1,64})/g;

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  json: "application/json",
  txt: "text/plain",
};

/** .cshz / .zip 包解析（调用方保证是 File） */
export async function parsePack(file: File): Promise<PackParseResult> {
  const errors: string[] = [];
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { ok: false, errors: ["无法读取压缩包：文件已损坏或不是标准 zip/.cshz 格式"] };
  }

  const names = Object.keys(entries);
  if (names.length > MAX_ENTRIES) {
    return { ok: false, errors: [`压缩包条目数超过上限（${names.length} > ${MAX_ENTRIES}）`] };
  }
  const total = names.reduce((n, k) => n + entries[k].length, 0);
  if (total > MAX_TOTAL) {
    return {
      ok: false,
      errors: [`压缩包解压后超过 ${(MAX_TOTAL / 1024 / 1024).toFixed(0)}MB 上限（当前 ${(total / 1024 / 1024).toFixed(1)}MB）`],
    };
  }

  /* manifest.json 必需（允许嵌套一层目录的相对路径里恰好叫 manifest.json 的场景不予支持——格式从简） */
  const manifestRaw = entries["manifest.json"];
  if (!manifestRaw) {
    return { ok: false, errors: ['包里缺少 manifest.json —— .cshz 包必须按我们的格式打包：manifest.json（必需）+ assets/（可选资源目录）'] };
  }

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(strFromU8(manifestRaw));
  } catch (e) {
    return {
      ok: false,
      errors: [`manifest.json 不是合法 JSON：${e instanceof Error ? e.message : "解析失败"}`],
    };
  }

  /* 先过一遍结构校验（资产替换前），拿到 payload 后再做资产内联与长度复核 */
  const first = parsePreset(manifestJson);
  if (!first.ok) return { ok: false, errors: first.errors };

  /* 收集 assets/ 下的资源（平铺命名，拒绝子目录与越界名） */
  const assets = new Map<string, { bytes: Uint8Array; mime: string }>();
  for (const name of names) {
    if (!name.startsWith("assets/") || name === "assets/") continue;
    const base = name.slice("assets/".length);
    if (base.includes("/")) continue; // 子目录资源不参与引用，忽略
    if (!ASSET_NAME_RE.test(base)) {
      errors.push(`assets/${base}：文件名只允许字母/数字/点/下划线/连字符（≤64 字符）`);
      continue;
    }
    const ext = base.slice(base.lastIndexOf(".") + 1).toLowerCase();
    const mime = MIME[ext];
    if (!mime) {
      errors.push(`assets/${base}：不支持的资源类型 .${ext}（仅图片/音频/视频/字体）`);
      continue;
    }
    if (entries[name].length > MAX_ASSET) {
      errors.push(`assets/${base}：超过 ${(MAX_ASSET / 1024).toFixed(0)}KB 单文件上限`);
      continue;
    }
    assets.set(base, { bytes: entries[name], mime });
  }

  const preset = first.preset;
  let substituted = false;

  /** 资产引用替换：html/css 里的 asset:文件名 → data:URL；引用缺失即报错整体拒绝 */
  const subst = (text: string, where: string): string => {
    return text.replace(ASSET_REF_RE, (_m, base: string) => {
      const a = assets.get(base);
      if (!a) {
        errors.push(`${where}：引用了包里不存在的资源「asset:${base}」`);
        return _m;
      }
      substituted = true;
      let s = "";
      for (let i = 0; i < a.bytes.length; i++) s += String.fromCharCode(a.bytes[i]);
      const b64 = btoa(s);
      return `data:${a.mime};base64,${b64}`;
    });
  };

  if (preset.pages) {
    preset.pages = preset.pages.map((p) => ({ ...p, html: subst(p.html, `pages[${p.id}]`) }));
  }
  if (preset.animations) {
    preset.animations = preset.animations.map((a) => ({ ...a, css: subst(a.css, `animations[${a.id}]`) }));
  }

  if (errors.length > 0) return { ok: false, errors };

  /* 资产替换会显著加长 html/css：复核长度上限（原校验按替换前长度放过） */
  if (preset.pages) {
    for (const p of preset.pages) {
      if (p.html.length > PRESET_LIMITS.htmlLen + MAX_ASSET * 2) {
        /* data URL 允许超出原始 htmlLen（资源本身合法），只挡极端滥用 */
        return { ok: false, errors: [`pages[${p.id}]：资产内联后超出容量上限`] };
      }
    }
  }

  if (!substituted && assets.size > 0) {
    /* 有资源但没被引用：不报错（打包习惯冗余），仅提示信息交给上层 toast */
  }

  return { ok: true, preset, packName: file.name };
}
