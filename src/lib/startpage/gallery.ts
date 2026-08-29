/* 掠影官方图库：精选摄影壁纸。
 * 前段为 Unsplash 直链（CDN 按 w 参数出图，仅运行时引用、不随仓库分发）；
 * 国风十帧为本地资产（public/gallery/wallpapers 全图 3200w 内 + thumbs 400w，无外链依赖）。
 * 本地帧均取自 Unsplash（Unsplash License），逐张摄影师与原片链接见 README「图片来源与致谢」：
 *   great-wall-sunrise  = photo-1539987225288-7d998989461e (Johannes Plenio)
 *   li-river            = photo-1759322451543-68c2217e9046 (Ekaterina Zlotnikova)
 *   huangshan-peaks     = photo-1568454158153-6bf6cfda9070 (Sherry Xu)
 *   palace-turret       = photo-1625195374697-0bf5cbc5c5f8 (Yilei (Jerry) Bao)
 *   yulong-river        = photo-1536585806558-81c7ea4d393d (Joshua Earle)
 *   bamboo-sea          = photo-1620452172311-2a17a5c9c35a (Keisuke Kuribara)
 *   ink-wash-hills      = photo-1689259103820-a375e5a30e00 (Art Institute of Chicago)
 *   ink-pine-cliff      = photo-1762115839715-fbd4e2c65260 (The Walters Art Museum)
 *   longji-terraces     = photo-1537531383496-f4749b8032cf (Chopsticks on the Loose)
 *   misty-terraces      = photo-1780463000609-a12de7ebf17f (Simonetta Pugnaghi) */

export interface GalleryPhoto {
  id: string;
  name: string;
  /** 全尺寸壁纸 */
  url: string;
  /** 设置面板缩略图 */
  thumb: string;
}

const q = (w: number) => `auto=format&fit=crop&w=${w}&q=80`;
const u = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?${q(w)}`;
const local = (id: string) => ({
  url: `/gallery/wallpapers/${id}.jpg`,
  thumb: `/gallery/thumbs/${id}.jpg`,
});

export const GALLERY: GalleryPhoto[] = [
  /* —— 水 —— */
  {
    id: "mist-lake",
    name: "晨雾湖山",
    url: u("1470071459604-3b5ec3a7fe05", 2400),
    thumb: u("1470071459604-3b5ec3a7fe05", 400),
  },
  {
    id: "lake-glow",
    name: "湖光斜阳",
    url: u("1501785888041-af3ef285b470", 2400),
    thumb: u("1501785888041-af3ef285b470", 400),
  },
  {
    id: "turquoise-canoe",
    name: "青湖独舟",
    url: u("1476514525535-07fb3b4ae5f1", 2400),
    thumb: u("1476514525535-07fb3b4ae5f1", 400),
  },
  {
    id: "green-cliff",
    name: "崖壁青峦",
    url: u("1506744038136-46273834b3fb", 2400),
    thumb: u("1506744038136-46273834b3fb", 400),
  },
  {
    id: "yulong-river",
    name: "遇龙河畔",
    ...local("yulong-river"),
  },
  {
    id: "li-river",
    name: "漓江山水",
    ...local("li-river"),
  },
  /* —— 山 —— */
  {
    id: "ridge-clouds",
    name: "云海山脊",
    url: u("1464822759023-fed622ff2c3b", 2400),
    thumb: u("1464822759023-fed622ff2c3b", 400),
  },
  {
    id: "sunbeam-ridge",
    name: "山间光柱",
    url: u("1469474968028-56623f02e42e", 2400),
    thumb: u("1469474968028-56623f02e42e", 400),
  },
  {
    id: "huangshan-peaks",
    name: "黄山云峰",
    ...local("huangshan-peaks"),
  },
  /* —— 国风 —— */
  {
    id: "bamboo-sea",
    name: "竹海幽篁",
    ...local("bamboo-sea"),
  },
  {
    id: "palace-turret",
    name: "角楼落日",
    ...local("palace-turret"),
  },
  {
    id: "great-wall-sunrise",
    name: "长城映日",
    ...local("great-wall-sunrise"),
  },
  /* —— 墨 —— */
  {
    id: "ink-wash-hills",
    name: "墨韵远山",
    ...local("ink-wash-hills"),
  },
  {
    id: "ink-pine-cliff",
    name: "松崖云雾",
    ...local("ink-pine-cliff"),
  },
  /* —— 田 —— */
  {
    id: "longji-terraces",
    name: "龙脊绿浪",
    ...local("longji-terraces"),
  },
  {
    id: "misty-terraces",
    name: "云雾梯田",
    ...local("misty-terraces"),
  },
  /* —— 林 —— */
  {
    id: "forest-path",
    name: "林间幽径",
    url: u("1441974231531-c6227db76b6e", 2400),
    thumb: u("1441974231531-c6227db76b6e", 400),
  },
  {
    id: "pine-mist",
    name: "雾雪松林",
    url: u("1418065460487-3e41a6c84dc5", 2400),
    thumb: u("1418065460487-3e41a6c84dc5", 400),
  },
  /* —— 野 —— */
  {
    id: "golden-field",
    name: "暮野流金",
    url: u("1472214103451-9374bd1c798e", 2400),
    thumb: u("1472214103451-9374bd1c798e", 400),
  },
  /* —— 海 —— */
  {
    id: "coast-dusk",
    name: "海岸暮色",
    url: u("1507525428034-b723cf961d3e", 2400),
    thumb: u("1507525428034-b723cf961d3e", 400),
  },
  /* —— 暮 —— */
  {
    id: "ember-dusk",
    name: "烬色黄昏",
    url: u("1508739773434-c26b3d09e071", 2400),
    thumb: u("1508739773434-c26b3d09e071", 400),
  },
  /* —— 夜 —— */
  {
    id: "snow-night",
    name: "雪夜星野",
    url: u("1519681393784-d120267933ba", 2400),
    thumb: u("1519681393784-d120267933ba", 400),
  },
  {
    id: "galaxy-vault",
    name: "星河天穹",
    url: u("1462331940025-496dfbfc7564", 2400),
    thumb: u("1462331940025-496dfbfc7564", 400),
  },
  {
    id: "city-light",
    name: "城市夜航",
    url: u("1477959858617-67f85cf4f1df", 2400),
    thumb: u("1477959858617-67f85cf4f1df", 400),
  },
];

/** 每日精选（按日期轮换） */
export function dailyPhoto(): GalleryPhoto {
  const d = new Date();
  const idx = (d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate()) % GALLERY.length;
  return GALLERY[idx];
}

/** 解析壁纸源：返回图片 URL 与缩略图；自定义源返回 null（由调用方走 IndexedDB）。
 *  thumb 另供禅模式提示词的背景亮度采样（400w 小图，CORS 开销最低） */
export function resolveWallpaper(photoId: string): {
  url: string | null;
  thumb: string | null;
  name: string;
} {
  if (photoId === "daily") {
    const p = dailyPhoto();
    return { url: p.url, thumb: p.thumb, name: `每日精选 · ${p.name}` };
  }
  const found = GALLERY.find((g) => g.id === photoId);
  if (found) return { url: found.url, thumb: found.thumb, name: found.name };
  return { url: null, thumb: null, name: "自定义" };
}
