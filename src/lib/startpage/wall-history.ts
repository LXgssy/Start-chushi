"use client";

/* 「初始」— 自定义壁纸历史记录（v8.7.105 引入，v8.7.123 存储域重置）。
 *
 * v8.7.105~121：历史存 chrome.storage.sync（wh:/whIndex 键）——本意是
 * 扩展重装后随 Chrome 账号同步找回。但账号云同步（v8.7.50 闭源登录模块）
 * 只同步六键（start:settings/links/todos/note/presets/preset-settings），
 * chrome.storage.sync 的历史从未随账号云同步走——用户实测「云端同步没有
 * 同步历史壁纸」。
 *
 * v8.7.123（用户指令三项之二）：历史整体迁入 settings.wallHistory——
 *   · 随六键全量上云：登录云同步 / 从云端恢复 / 备份导出导入全链随行；
 *   · 缩略图仍只存元数据 + 64px JPEG dataURL（单条 1~3KB，7 条 ≤21KB，
 *     settings 体量无压力；原图二进制仍然不进任何同步通道）；
 *   · chrome.storage.sync 旧数据一次性迁移（readLegacySyncHistory →
 *     settings → clearLegacySyncHistory），旧键清空防双源漂移。
 *
 * 本地原图恢复（v8.7.123 用户指令三项之一，同版修复）：
 *   file 类条目的原图此前只存 IndexedDB 单一槽（custom-wallpaper）——
 *   新壁纸上传覆盖旧壁纸后，点历史里任何旧的本地图标恢复的都是最新那张
 *   （「无法切换到之前更换过的本地壁纸」的根因）。本版起每条 file 历史
 *   入史时把原图归档进独立槽 whfile:<id>（IndexedDB，无 sync 配额压力，
 *   7 条滚动上限天然约束总量）；恢复走归档槽，归档不在（旧版本条目/
 *   重装/跨设备）诚实提示重传，绝不再拿当前槽的「别人的壁纸」冒充。
 *
 * 缩略图：v8.7.106 视频壁纸取第一帧 64px JPEG（<video> 试解码 + seek
 * 首帧 → canvas cover 裁切；远程直链 crossOrigin 匿名尝试，跨域拒画则
 * 回落图标占位——缩略失败永不妨碍历史条目本身）。
 */

import { idbDel, idbGet, idbSet } from "./idb";
import type { WallHistoryItem } from "./types";

export type { WallHistoryItem, WallHistoryKind } from "./types";

/** 历史容量（v8.7.106 用户指令 12→7，存储与展示同容） */
export const MAX_WALL_HISTORY = 7;

/** file 类原图归档槽前缀（IndexedDB 键 = 前缀 + 历史条目 id） */
export const WALL_FILE_PREFIX = "whfile:";

/* ---------- 历史列表纯运算 ---------- */

/** 入史：同 id 去重（提到最前并刷新元数据）+ 7 条滚动淘汰。
 *  纯函数——列表随 settings.wallHistory 走 React 域（useStored 整对象
 *  写回，任何绕过 React 的直写都会被下一次 patch 覆盖），淘汰条目的
 *  归档槽清理由调用方（SettingsPanel）按 evicted 执行。 */
export function applyWallHistoryPush(
  prev: WallHistoryItem[],
  item: Omit<WallHistoryItem, "ts">,
): { list: WallHistoryItem[]; evicted: WallHistoryItem[] } {
  if (!item.id) return { list: prev, evicted: [] };
  const entry: WallHistoryItem = { ...item, ts: Date.now() };
  const next = [entry, ...prev.filter((x) => x.id !== item.id)];
  const list = next.slice(0, MAX_WALL_HISTORY);
  const evicted = next.slice(MAX_WALL_HISTORY);
  return { list, evicted };
}

/* ---------- chrome.storage.sync 旧数据一次性迁移 ---------- */

const LEGACY_INDEX_KEY = "whIndex";
const LEGACY_ITEM_PREFIX = "wh:";

type SyncLike = {
  get: (keys: string[] | null, cb: (items: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>, cb?: () => void) => void;
  remove: (keys: string[], cb?: () => void) => void;
};

/** MV3 回调无错时必须读一次 lastError 否则控制台告警；经 globalThis 取，
 *  不引入裸 chrome 标识符（纯网页构建无 chrome 全局类型） */
function swallowLastErr() {
  try {
    void (globalThis as unknown as { chrome?: { runtime?: { lastError?: unknown } } }).chrome?.runtime?.lastError;
  } catch {
    /* noop */
  }
}

function legacySync(): SyncLike | null {
  const g = globalThis as unknown as { chrome?: { storage?: { sync?: SyncLike } } };
  return g.chrome?.storage?.sync ?? null;
}

/** 读取 chrome.storage.sync 时代的旧历史（不清理）；纯网页部署旧数据在
 *  localStorage start:wh:*（同构键位），同法读取。 */
export async function readLegacySyncHistory(): Promise<WallHistoryItem[]> {
  const out: WallHistoryItem[] = [];
  const s = legacySync();
  if (s) {
    const idx = await new Promise<Record<string, unknown>>((res) => {
      try {
        s.get([LEGACY_INDEX_KEY], (o) => {
          swallowLastErr();
          res((o ?? {}) as Record<string, unknown>);
        });
      } catch {
        res({});
      }
    });
    const ids = Array.isArray(idx[LEGACY_INDEX_KEY]) ? (idx[LEGACY_INDEX_KEY] as string[]) : [];
    if (ids.length) {
      const items = await new Promise<Record<string, unknown>>((res) => {
        try {
          s.get(ids.map((x) => LEGACY_ITEM_PREFIX + x), (o) => {
            swallowLastErr();
            res((o ?? {}) as Record<string, unknown>);
          });
        } catch {
          res({});
        }
      });
      for (const id of ids) {
        const it = items[LEGACY_ITEM_PREFIX + id] as WallHistoryItem | undefined;
        if (it && typeof it.id === "string") out.push(it);
      }
    }
    return out;
  }
  /* 纯网页兜底：localStorage start:wh:* 旧键 */
  try {
    const raw = window.localStorage.getItem("start:wh:" + LEGACY_INDEX_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as string[];
    if (!Array.isArray(ids)) return [];
    for (const id of ids) {
      try {
        const it = JSON.parse(window.localStorage.getItem("start:wh:" + LEGACY_ITEM_PREFIX + id) ?? "null") as
          | WallHistoryItem
          | null;
        if (it && typeof it.id === "string") out.push(it);
      } catch {
        /* 单条残缺跳过 */
      }
    }
  } catch {
    /* noop */
  }
  return out;
}

/** 清掉 chrome.storage.sync / localStorage 里的旧历史键（迁移完成后调用，
 *  防双源漂移：旧键永远不再被读，留着只会占 sync 配额） */
export async function clearLegacySyncHistory(): Promise<void> {
  const s = legacySync();
  if (s) {
    const idx = await new Promise<Record<string, unknown>>((res) => {
      try {
        s.get([LEGACY_INDEX_KEY], (o) => {
          swallowLastErr();
          res((o ?? {}) as Record<string, unknown>);
        });
      } catch {
        res({});
      }
    });
    const ids = Array.isArray(idx[LEGACY_INDEX_KEY]) ? (idx[LEGACY_INDEX_KEY] as string[]) : [];
    await new Promise<void>((res) => {
      try {
        s.remove([LEGACY_INDEX_KEY, ...ids.map((x) => LEGACY_ITEM_PREFIX + x)], () => {
          swallowLastErr();
          res();
        });
      } catch {
        res();
      }
    });
  }
  try {
    window.localStorage.removeItem("start:wh:" + LEGACY_INDEX_KEY);
  } catch {
    /* noop */
  }
}

/* ---------- file 类原图归档（IndexedDB，无配额压力） ---------- */

/** 入史归档：把 file 类壁纸原图存进独立槽（恢复时按条目 id 取）。
 *  非文件类（gallery/daily/url）零归档——photoId/直链即全部。 */
export async function archiveWallFile(id: string, blob: Blob): Promise<void> {
  try {
    await idbSet(WALL_FILE_PREFIX + id, blob);
  } catch {
    /* 归档失败不阻塞入史：恢复侧回落「不在本机」诚实提示 */
  }
}

/** 取归档原图；不存在（旧版本条目/重装/跨设备）返回 undefined */
export function readWallFileArchive(id: string): Promise<Blob | undefined> {
  return idbGet<Blob>(WALL_FILE_PREFIX + id);
}

/** 淘汰清理：条目滚出历史时删除其归档槽 */
export async function dropWallFileArchive(id: string): Promise<void> {
  try {
    await idbDel(WALL_FILE_PREFIX + id);
  } catch {
    /* noop */
  }
}

/* ---------- 缩略图 ---------- */

/** 本地文件 → 64×64 JPEG dataURL（cover 裁切）；视频/GIF 返回 undefined（图标占位） */
export async function fileThumb(file: File | Blob): Promise<string | undefined> {
  try {
    if (file instanceof File && (wallKindOf(file.name, file.type) !== "image" || file.type === "image/gif")) return undefined;
    const img = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const scale = Math.max(64 / img.width, 64 / img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    ctx.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
    const url = canvas.toDataURL("image/jpeg", 0.55);
    img.close?.();
    return url;
  } catch {
    return undefined;
  }
}

function wallKindOf(name: string, type: string): "image" | "video" {
  if (type.startsWith("video/")) return "video";
  return /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(name) ? "video" : "image";
}

/** 视频第一帧 → 64×64 JPEG dataURL（cover 裁切，v8.7.106 用户指令）。
 *  本地文件走 blob URL（同源必可画）；远程直链带 crossOrigin 匿名尝试——
 *  对端无 CORS 头则视频加载失败（而非画布染脏），统一回落 undefined
 *  （图标占位）。超时 5s 放弃，永不阻塞历史条目写入主流程。 */
export async function videoThumb(src: Blob | string): Promise<string | undefined> {
  const objUrl = typeof src === "string" ? null : URL.createObjectURL(src);
  const v = document.createElement("video");
  try {
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    const url = typeof src === "string" ? src : (objUrl as string);
    if (typeof src === "string") v.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error("timeout")), 5000);
      v.onloadeddata = () => {
        clearTimeout(t);
        res();
      };
      v.onerror = () => {
        clearTimeout(t);
        rej(new Error("media"));
      };
      v.src = url;
    });
    /* seek 到近首帧确保解码器真正出图（部分编码 loadeddata 仍是空帧） */
    await new Promise<void>((res) => {
      const t = setTimeout(res, 800);
      v.onseeked = () => {
        clearTimeout(t);
        res();
      };
      try {
        v.currentTime = Math.min(0.04, v.duration || 0.04);
      } catch {
        clearTimeout(t);
        res();
      }
    });
    const vw = v.videoWidth || 64;
    const vh = v.videoHeight || 64;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const scale = Math.max(64 / vw, 64 / vh);
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    ctx.drawImage(v, (64 - w) / 2, (64 - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.55);
  } catch {
    return undefined;
  } finally {
    try {
      v.pause();
      v.removeAttribute("src");
      v.load();
    } catch {
      /* noop */
    }
    if (objUrl) URL.revokeObjectURL(objUrl);
  }
}
