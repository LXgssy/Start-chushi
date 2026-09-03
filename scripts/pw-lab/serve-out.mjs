/* 静态导出预览服务器：out/ + basePath /Start-chushi 的 URL 映射
 * 用法: node scripts/pw-lab/serve-out.mjs  (端口 3000) */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const OUT = "/home/z/my-project/out";
const BASE = "/Start-chushi";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let u = decodeURIComponent((req.url || "/").split("?")[0]);
    if (u === BASE || u === BASE + "/") u = "/";
    if (u === "/") u = "/index.html";
    else if (u.startsWith(BASE + "/")) u = u.slice(BASE.length);
    if (!u.startsWith("/")) u = "/" + u;
    let f = path.join(OUT, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      const alt = path.join(OUT, u + ".html");
      if (fs.existsSync(alt)) f = alt;
      else {
        // 无扩展名的 Next 数据路由回退 404
        res.writeHead(404);
        res.end("not found");
        return;
      }
    }
    const ext = path.extname(f).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  })
  .listen(3000, () => console.log("serving out/ on :3000 (base " + BASE + ")"));
