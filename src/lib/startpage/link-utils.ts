/* URL 工具：提取主机名等 */

export function normalizeUrl(input: string): string {
  let s = input.trim();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    new URL(s);
    return s;
  } catch {
    return "";
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
