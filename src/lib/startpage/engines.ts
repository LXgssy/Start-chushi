/* 搜索引擎配置与查询解析 */

export interface Engine {
  id: string;
  name: string;
  hint: string; // 占位提示
  search: (q: string) => string;
  /** 站内直搜引擎的自绘图标 id（bilibili/github/zhihu/douyin，
   *  SearchBar.DirectIcon 渲染）；主引擎无图标走首字符圆形徽标 */
  icon?: string;
}

export const ENGINES: Engine[] = [
  {
    id: "google",
    name: "谷歌",
    hint: "在谷歌中搜索，或输入网址",
    search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "bing",
    name: "必应",
    hint: "在必应中搜索，或输入网址",
    search: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "baidu",
    name: "百度",
    hint: "在百度中搜索，或输入网址",
    search: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
  },
  {
    id: "so360",
    name: "360搜索",
    hint: "在 360 搜索中搜索，或输入网址",
    search: (q) => `https://www.so.com/s?q=${encodeURIComponent(q)}`,
  },
  {
    id: "ddg",
    name: "DuckDuckGo",
    hint: "在 DuckDuckGo 中搜索，或输入网址",
    search: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  },
  /* v8.7.53 站内直搜四站并入引擎列表（用户裁定：直搜选项应放在搜索引擎
   * 里，而非建议下拉的直达行）——与主引擎同契约，选中即当前引擎，回车
   * 语义 = 在该站检索。icon 字段供引擎菜单渲染自绘 logo。
   * 抖音的搜索 URL 是路径段形态，非 ?query= 参数形态。 */
  {
    id: "bilibili",
    name: "哔哩哔哩",
    hint: "在哔哩哔哩搜索，或输入网址",
    search: (q) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}`,
    icon: "bilibili",
  },
  {
    id: "github",
    name: "GitHub",
    hint: "在 GitHub 搜索，或输入网址",
    search: (q) => `https://github.com/search?q=${encodeURIComponent(q)}`,
    icon: "github",
  },
  {
    id: "zhihu",
    name: "知乎",
    hint: "在知乎搜索，或输入网址",
    search: (q) => `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(q)}`,
    icon: "zhihu",
  },
  {
    id: "douyin",
    name: "抖音",
    hint: "在抖音搜索，或输入网址",
    search: (q) => `https://www.douyin.com/search/${encodeURIComponent(q)}`,
    icon: "douyin",
  },
];

/** 主引擎（无 icon）——引擎菜单上半区；四站直搜排在「站内直搜」分组下 */
export const MAIN_ENGINES = ENGINES.filter((e) => !e.icon);
export const SITE_ENGINES = ENGINES.filter((e) => !!e.icon);

export function getEngine(id: string): Engine {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0];
}

/** 判断输入是否像一个网址（含点号、无空格，或带协议） */
export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (!s || /\s/.test(s)) return false;
  if (/^(https?|file):\/\//i.test(s)) return true;
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(s)) return true;
  // 域名形态：xxx.yyy（至少两段字母数字），可带路径
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s);
}

export function toUrl(input: string): string {
  const s = input.trim();
  if (/^[a-z]+:\/\//i.test(s)) return s;
  return `https://${s}`;
}
