"use client";

/* 「初始」— 自定义壁纸历史记录（v8.7.105，chrome.storage.sync 同步）。
 *
 * 用户指令：给自定义壁纸加历史记录，方案用 chrome.storage.sync——
 * 用户误删扩展重装后，登录同一账号同步回来，不用重新找壁纸。
 *
 * 配额现实与通道设计：
 *   chrome.storage.sync 单 item 8KB / 总 102.4KB——壁纸原图（几百 KB 起）
 *   物理上进不了 sync。因此历史条目只存「恢复所需元数据 + 64px 缩略图」：
 *     · gallery / daily：photoId 即全部（官方图库直链随版本分发），跨设备
 *       完整可恢复；
 *     · url：壁纸直链 URL 即全部（导入时验证过可达），跨设备完整可恢复；
 *     · file：原图在 IndexedDB（重装即失）——条目仍同步（缩略图 + 名称），
 *       同设备可一键恢复原图；跨设备恢复时检测 IndexedDB 无图，点击提示
 *       重新选择。这是 sync 硬配额下能做到的极限，缩略图让历史不至于
 *       变成一行干巴巴的文字。
 *
 *   存储拓扑：每条历史一个 key（wh:<ts>）+ 索引键 whIndex。单条独立 8KB
 *   预算（64px JPEG q0.55 缩略 ≈ 1~3KB base64，余量充足），12 条滚动淘汰。
 *   环境：扩展 iframe 内 chrome.storage.sync 可用；纯网页部署（Vercel
 *   演示）无 chrome API → 回落 localStorage（本地历史仍可用，仅不跨设备）。
 */

const INDEX_KEY = "whIndex";
const ITEM_PREFIX = "wh:";
const MAX_ITEMS = 12;

export type WallHistoryKind = "gallery" | "daily" | "url" | "file";

export interface WallHistoryItem {
  /** 稳定 id：gallery=图库 id；url/url 类=直链；file=name:size；daily="daily" */
  id: string;
  kind: WallHistoryKind;
  /** 图库 id（gallery/daily） */
  photoId?: string;
  /** 直链（url 类） */
  url?: string;
  /** 展示名（文件名 / 图库名 / host） */
  name: string;
  /** 64px JPEG 缩略 dataURL（file 类）；gallery/url 类直接用远程缩略地址 */
  thumb?: string;
  ts: number;
}

/* ---------- 通道抽象：chrome.storage.sync 优先，localStorage 兜底 ---------- */

type SyncStore = {
  get: (keys: string[] | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string[]) => Promise<void>;
};

function syncStore(): SyncStore | null {
  const c = typeof chrome !== "undefined" ? (chrome as unknown as { storage?: { sync?: SyncLike } }) : undefined;
  const s = c?.storage?.sync;
  if (s) {
    return {
      get: (keys) =>
        new Promise((res) => {
          try {
            s.get(keys ?? null, (out) => {
              void chrome.runtime.lastError;
              res((out ?? {}) as Record<string, unknown>);
            });
          } catch {
            res({});
          }
        }),
      set: (items) =>
        new Promise((res) => {
          try {
            s.set(items, () => {
              void chrome.runtime.lastError;
              res();
            });
          } catch {
            res();
          }
        }),
      remove: (keys) =>
        new Promise((res) => {
          try {
            s.remove(keys, () => {
              void chrome.runtime.lastError;
              res();
            });
          } catch {
            res();
          }
        }),
    };
  }
  /* 纯网页兜底：localStorage 同构通道（key 空间同前缀，结构一致） */
  return {
    get: async (keys) => {
      const out: Record<string, unknown> = {};
      try {
        const list = keys ?? Object.keys(window.localStorage);
        for (const k of list) {
          const raw = window.localStorage.getItem("start:wh:" + k);
          if (raw != null) out[k] = JSON.parse(raw);
        }
      } catch {
        /* noop */
      }
      return out;
    },
    set: async (items) => {
      try {
        for (const [k, v] of Object.entries(items))
          window.localStorage.setItem("start:wh:" + k, JSON.stringify(v));
      } catch {
        /* noop */
      }
    },
    remove: async (keys) => {
      try {
        for (const k of keys) window.localStorage.removeItem("start:wh:" + k);
      } catch {
        /* noop */
      }
    },
  };
}

type SyncLike = {
  get: (keys: string[] | null, cb: (items: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>, cb?: () => void) => void;
  remove: (keys: string[], cb?: () => void) => void;
};

/* ---------- 读写 ---------- */

export async function readWallHistory(): Promise<WallHistoryItem[]> {
  const store = syncStore();
  if (!store) return [];
  const out = await store.get([INDEX_KEY]);
  const ids = Array.isArray(out[INDEX_KEY]) ? (out[INDEX_KEY] as string[]) : [];
  if (!ids.length) return [];
  /* 读取键必须与写入键同构：条目键 = ITEM_PREFIX + id（读写错位则历史恒空，
     v8.7.105 运行时实测抓到——sync 数据在位而 UI 恒不渲染即此因） */
  const items = await store.get(ids.map((x) => ITEM_PREFIX + x));
  const list: WallHistoryItem[] = [];
  for (const id of ids) {
    const it = items[ITEM_PREFIX + id] as WallHistoryItem | undefined;
    if (it && typeof it.id === "string") list.push(it);
  }
  return list;
}

/** 新增一条历史：去重（同 id 提到最前并刷新元数据）、12 条滚动淘汰 */
export async function pushWallHistory(item: Omit<WallHistoryItem, "ts">): Promise<void> {
  const store = syncStore();
  if (!store || !item.id) return;
  const out = await store.get([INDEX_KEY]);
  const ids = Array.isArray(out[INDEX_KEY]) ? (out[INDEX_KEY] as string[]) : [];
  const entry: WallHistoryItem = { ...item, ts: Date.now() };
  const nextIds = [item.id, ...ids.filter((x) => x !== item.id)].slice(0, MAX_ITEMS);
  const evict = ids.filter((x) => x !== item.id).slice(MAX_ITEMS - 1);
  const patch: Record<string, unknown> = { [ITEM_PREFIX + item.id]: entry, [INDEX_KEY]: nextIds };
  await store.set(patch);
  if (evict.length) void store.remove(evict.map((x) => ITEM_PREFIX + x));
}

export async function clearWallHistoryItem(id: string): Promise<void> {
  const store = syncStore();
  if (!store) return;
  const out = await store.get([INDEX_KEY]);
  const ids = Array.isArray(out[INDEX_KEY]) ? (out[INDEX_KEY] as string[]) : [];
  await store.set({ [INDEX_KEY]: ids.filter((x) => x !== id) });
  await store.remove([ITEM_PREFIX + id]);
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
