/* 「初始」— 文件夹磁贴数据助手（v8.7.156）
 *
 * start:links 从 StartLink[] 升级为 StartEntry[]（链接 | 文件夹 混存）。
 * 本模块集中所有「跨文件夹」的数据操作，保证：
 *   · 不可变更新（一律返回新数组，setLinks 惯例）；
 *   · 单层嵌套律（children 恒 StartLink[]，文件夹不套文件夹）；
 *   · 旧数据零迁移（isFolder 判别 + sanitize 兜底）。
 */

import type { StartEntry, StartFolder, StartLink } from "./types";

/** 条目判别：folder:true 且 children 为数组才算文件夹（旧链接条目天然 false） */
export function isFolder(e: StartEntry): e is StartFolder {
  return (e as StartFolder).folder === true && Array.isArray((e as StartFolder).children);
}

/** 深度查找链接所在位置：wallIndex = 顶层索引；childIndex 非空表示在对应文件夹内 */
export function locateLink(
  entries: StartEntry[],
  id: string
): { wallIndex: number; folder: StartFolder | null; childIndex: number } | null {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!isFolder(e)) {
      if (e.id === id) return { wallIndex: i, folder: null, childIndex: -1 };
      continue;
    }
    const ci = e.children.findIndex((c) => c.id === id);
    if (ci >= 0) return { wallIndex: i, folder: e, childIndex: ci };
  }
  return null;
}

/** 定位顶层条目（链接或文件夹）索引 */
export function locateEntry(entries: StartEntry[], id: string): number {
  return entries.findIndex((e) => e.id === id);
}

/** 按顶层索引不可变替换文件夹（children 变更走这里） */
export function patchFolder(
  entries: StartEntry[],
  folderId: string,
  patch: (f: StartFolder) => StartFolder
): StartEntry[] {
  return entries.map((e) => (isFolder(e) && e.id === folderId ? patch(e) : e));
}

/** 把链接放入文件夹指定位置（index 缺省 = 追加末尾）。链接若已在别的
 *  文件夹或顶层，先从原位摘除。返回 [新数组, 是否发生变更]。 */
export function putLinkIntoFolder(
  entries: StartEntry[],
  linkId: string,
  folderId: string,
  index?: number
): [StartEntry[], boolean] {
  const loc = locateLink(entries, linkId);
  if (!loc) return [entries, false];
  if (loc.folder && loc.folder.id === folderId) {
    /* 已在目标夹内：位置由夹内排序负责，这里不动 */
    return [entries, false];
  }
  /* 从原位摘除 */
  let link: StartLink;
  let next: StartEntry[];
  if (loc.folder) {
    link = loc.folder.children[loc.childIndex];
    next = patchFolder(entries, loc.folder.id, (f) => ({
      ...f,
      children: f.children.filter((c) => c.id !== linkId),
    }));
  } else {
    link = entries[loc.wallIndex] as StartLink;
    next = entries.filter((e) => e.id !== linkId);
  }
  /* 追加进目标夹 */
  next = patchFolder(next, folderId, (f) => {
    const children = [...f.children];
    const at = index == null || index < 0 || index > children.length ? children.length : index;
    children.splice(at, 0, link);
    return { ...f, children };
  });
  return [next, true];
}

/** 从文件夹摘出链接放回墙面（wallIndex 缺省 = 追加末尾） */
export function takeLinkOutOfFolder(
  entries: StartEntry[],
  linkId: string,
  wallIndex?: number
): [StartEntry[], boolean] {
  const loc = locateLink(entries, linkId);
  if (!loc || !loc.folder) return [entries, false];
  const link = loc.folder.children[loc.childIndex];
  let next = patchFolder(entries, loc.folder.id, (f) => ({
    ...f,
    children: f.children.filter((c) => c.id !== linkId),
  }));
  const at = wallIndex == null || wallIndex < 0 || wallIndex > next.length ? next.length : wallIndex;
  const wall = [...next];
  wall.splice(at, 0, link);
  next = wall;
  return [next, true];
}

/** 文件夹拆散：children 依序散落回墙面原位置（文件夹自身移除，链接零丢失） */
export function dissolveFolder(entries: StartEntry[], folderId: string): StartEntry[] {
  const fi = locateEntry(entries, folderId);
  if (fi < 0) return entries;
  const f = entries[fi];
  if (!isFolder(f)) return entries;
  const next = [...entries];
  next.splice(fi, 1, ...f.children);
  return next;
}

/** 顶层重排（现有拖拽语义：splice 让位），文件夹与链接一视同仁 */
export function reorderWall(entries: StartEntry[], fromId: string, toId: string): StartEntry[] {
  const fi = entries.findIndex((e) => e.id === fromId);
  const ti = entries.findIndex((e) => e.id === toId);
  if (fi < 0 || ti < 0 || fi === ti) return entries;
  const next = [...entries];
  const [moved] = next.splice(fi, 1);
  next.splice(ti, 0, moved);
  return next;
}

/** 新建文件夹（三种建夹入口共用：右键 / ⌘K / 拖叠） */
export function createFolder(name = "新建文件夹", children: StartLink[] = []): StartFolder {
  return {
    id: "fd" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    name,
    folder: true,
    children,
  };
}

/** 拖叠建夹（v8.7.163）：链接 A 悬停链接 B 的 merge-dwell 到点——被悬停的
 *  B 原位转夹（保持墙面位置与邻序，墙面观感 = B 原地变成文件夹），拖拽者
 *  A 吸收为第二成员（children = [B, A]，后拖入者排后，iOS 同款语义）。
 *  先摘 A 再在 B 的实位转夹：两序（A 在 B 前/后）文件夹都精确落在 B 原
 *  墙位（若先置后摘，A 在 B 前时 splice 移位会让文件夹左漂一格）。
 *  任一方已是文件夹则零变更（单层嵌套律：夹套夹由既有 putLinkIntoFolder
 *  语义承担，不走这里）。 */
export function mergeLinksWith(entries: StartEntry[], fromId: string, toId: string): StartEntry[] {
  const fi = entries.findIndex((e) => e.id === fromId);
  const ti = entries.findIndex((e) => e.id === toId);
  if (fi < 0 || ti < 0 || fi === ti) return entries;
  const a = entries[fi];
  const b = entries[ti];
  if (isFolder(a) || isFolder(b)) return entries;
  const next = entries.filter((e) => e.id !== fromId);
  const bi = next.findIndex((e) => e.id === toId);
  next[bi] = createFolder("新建文件夹", [b as StartLink, a as StartLink]);
  return next;
}

/* ---------- 读入期消毒（旧数据 / 弹窗直写 / 备份导入 / storage 事件共用） ----------
 * 规则：
 *   · 非对象条目丢弃；
 *   · folder:true 且 children 数组 → 文件夹：name 兜底「新建文件夹」，
 *     children 逐条按 StartLink 校验修剪，文件夹不套文件夹（children 内
 *     出现 folder 条目时降级展开为链接保留，防止单层律被历史数据破坏）；
 *   · 其余 → StartLink（id/name/url 三字符串），残缺丢弃；
 *   · id 缺失的合法条目补 id（旧备份可能没有）；
 *   · 顶层 id 去重（后到让位）。 */
export function sanitizeEntries(raw: unknown): StartEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StartEntry[] = [];
  const asLink = (l: unknown, fallbackName: string): StartLink | null => {
    if (!l || typeof l !== "object") return null;
    const o = l as Partial<StartLink>;
    if (typeof o.url !== "string" || !o.url) return null;
    const link: StartLink = {
      id: typeof o.id === "string" && o.id ? o.id : "lk" + Math.random().toString(36).slice(2, 10),
      name: typeof o.name === "string" && o.name ? o.name : fallbackName,
      url: o.url,
    };
    return link;
  };
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Partial<StartFolder> & Partial<StartLink>;
    if (o.folder === true && Array.isArray(o.children)) {
      const children: StartLink[] = [];
      for (const c of o.children) {
        /* children 里的历史文件夹条目：按单层律展开其链接，散点链接照收 */
        if (c && typeof c === "object" && (c as Partial<StartFolder>).folder === true) {
          const nested = (c as Partial<StartFolder>).children;
          if (Array.isArray(nested)) {
            for (const nc of nested) {
              const link = asLink(nc, "链接");
              if (link) children.push(link);
            }
          }
          continue;
        }
        const link = asLink(c, "链接");
        if (link) children.push(link);
      }
      const id = typeof o.id === "string" && o.id ? o.id : "fd" + Math.random().toString(36).slice(2, 10);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        name: typeof o.name === "string" && o.name ? o.name : "新建文件夹",
        folder: true,
        children,
      });
      continue;
    }
    const link = asLink(item, "链接");
    if (!link) continue;
    if (seen.has(link.id)) continue;
    seen.add(link.id);
    out.push(link);
  }
  return out;
}

/** 扁平化全部链接（指令面板搜索 / 图标统计等消费场景：文件夹内链接照常可见） */
export function flattenLinks(entries: StartEntry[]): StartLink[] {
  const out: StartLink[] = [];
  for (const e of entries) {
    if (isFolder(e)) out.push(...e.children);
    else out.push(e);
  }
  return out;
}
