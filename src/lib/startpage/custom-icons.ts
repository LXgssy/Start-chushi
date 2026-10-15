"use client";

/* 「初始」— 磁贴自定义上传图标（v8.7.105）。
 *
 * 用户在链接编辑弹窗（右键磁贴直达）为本机磁贴上传专属图标，按 host 绑定：
 * 同 host 的磁贴（新标签页 / 抽屉 / ghost / 拖拽浮层）一律生效，与全局
 * iconStyle 无关——显式上传的个性化图标优先级最高（自绘册 / favicon 链 /
 * 字母都在其后）。
 *
 * 存储：localStorage 单键 JSON（host → dataURL）。128×128 PNG（保透明）
 * 压缩后单枚 5~30KB，localStorage 5MB 预算下可容纳上百站；量级远低于
 * 需要 IndexedDB 的门槛，且与 links/settings 同域同生命周期，导出备份
 * （start:settings/start:links 同法）未来可一并纳管。
 * 上传的图是用户显式资产：换网址（host 变）后旧图标自然失配（按 host
 * 索引），同 host 新磁贴仍复用——不做删除，数据无破坏性。
 */

const KEY = "start:custom-icons";

export type CustomIconMap = Record<string, string>;

export function readCustomIcons(): CustomIconMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? (j as CustomIconMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: CustomIconMap) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* 配额满（极端：上百枚大图）：静默放弃，图标回落自绘/favicon 链 */
  }
}

export function saveCustomIcon(host: string, dataUrl: string) {
  if (!host) return;
  const map = readCustomIcons();
  map[host] = dataUrl;
  writeMap(map);
}

export function removeCustomIcon(host: string) {
  if (!host) return;
  const map = readCustomIcons();
  if (!(host in map)) return;
  delete map[host];
  writeMap(map);
}

/**
 * 上传图标压缩：任意用户图片 → 128×128 PNG dataURL（cover 裁切居中）。
 * PNG 保透明（logo 类素材普遍带 alpha）；128px 在 2x DPR 下覆盖 64 物理
 * 像素（磁贴内显示 32px），高清无压力。
 */
export async function compressCustomIcon(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    img.close?.();
    throw new Error("canvas unavailable");
  }
  /* cover：短边铺满、长边居中裁切（与磁贴视觉一致） */
  const scale = Math.max(128 / img.width, 128 / img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
  const url = canvas.toDataURL("image/png");
  img.close?.();
  return url;
}
