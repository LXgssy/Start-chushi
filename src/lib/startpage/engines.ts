/* 搜索引擎配置与查询解析 */

export interface Engine {
  id: string;
  name: string;
  hint: string; // 占位提示
  search: (q: string) => string;
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
];

/* v8.7.52 站内直搜：搜索建议下拉底部的直达入口行。
 * 语义与引擎解耦——引擎管「回车搜哪」，直搜行管「一键换站搜同一个词」；
 * 空词不展示（无目标词的直搜无意义），URL 形态输入同样跳过（用户要的是
 * 前往网址本身）。抖音的搜索 URL 是路径段形态，非 ?query= 参数形态。 */
export interface DirectSite {
  id: string;
  name: string;
  search: (q: string) => string;
}

export const DIRECT_SITES: DirectSite[] = [
  {
    id: "bilibili",
    name: "哔哩哔哩",
    search: (q) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}`,
  },
  {
    id: "github",
    name: "GitHub",
    search: (q) => `https://github.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "zhihu",
    name: "知乎",
    search: (q) => `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(q)}`,
  },
  {
    id: "douyin",
    name: "抖音",
    search: (q) => `https://www.douyin.com/search/${encodeURIComponent(q)}`,
  },
];

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
