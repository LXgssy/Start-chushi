/* 搜索引擎配置与查询解析 */

export interface Engine {
  id: string;
  name: string;
  hint: string; // 占位提示
  search: (q: string) => string;
  /** 分组：web = 常规搜索引擎；site = 站内直搜（v8.7.55 四站并入引擎选择器）。
   *  直搜项同样可作为「当前引擎」——回车即在目标站内检索，联想词照常提示 */
  group?: "web" | "site";
  /** 站内直搜的标识色（选择列表色点，hex） */
  color?: string;
}

export const ENGINES: Engine[] = [
  {
    id: "google",
    name: "谷歌",
    hint: "在谷歌中搜索，或输入网址",
    search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    group: "web",
  },
  {
    id: "bing",
    name: "必应",
    hint: "在必应中搜索，或输入网址",
    search: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    group: "web",
  },
  {
    id: "baidu",
    name: "百度",
    hint: "在百度中搜索，或输入网址",
    search: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
    group: "web",
  },
  {
    id: "so360",
    name: "360搜索",
    hint: "在 360 搜索中搜索，或输入网址",
    search: (q) => `https://www.so.com/s?q=${encodeURIComponent(q)}`,
    group: "web",
  },
  {
    id: "ddg",
    name: "DuckDuckGo",
    hint: "在 DuckDuckGo 中搜索，或输入网址",
    search: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    group: "web",
  },
  {
    id: "bilibili",
    name: "哔哩哔哩",
    hint: "在哔哩哔哩中搜索，或输入网址",
    search: (q) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}`,
    group: "site",
    color: "#fb7299",
  },
  {
    id: "github",
    name: "GitHub",
    hint: "在 GitHub 中搜索，或输入网址",
    search: (q) => `https://github.com/search?q=${encodeURIComponent(q)}`,
    group: "site",
    color: "#8b949e",
  },
  {
    id: "zhihu",
    name: "知乎",
    hint: "在知乎中搜索，或输入网址",
    search: (q) => `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(q)}`,
    group: "site",
    color: "#0084ff",
  },
  {
    id: "douyin",
    name: "抖音",
    hint: "在抖音中搜索，或输入网址",
    search: (q) => `https://www.douyin.com/search/${encodeURIComponent(q)}`,
    group: "site",
    color: "#fe2c55",
  },
];

/** 常规搜索引擎（引擎选择列表第一组） */
export const WEB_ENGINES = ENGINES.filter((e) => (e.group ?? "web") === "web");
/** 站内直搜（引擎选择列表第二组，v8.7.55 四站并入） */
export const SITE_ENGINES = ENGINES.filter((e) => e.group === "site");

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
