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
    id: "ddg",
    name: "DuckDuckGo",
    hint: "在 DuckDuckGo 中搜索，或输入网址",
    search: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
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
