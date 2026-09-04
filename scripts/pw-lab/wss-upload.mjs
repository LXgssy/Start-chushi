// wss-upload.mjs — 文叔叔批量上传（重建版）
// 用法: node wss-upload.mjs <file1> [file2] ...
// 输出: 分享链接（c.wss.ink/f/xxx）
const BASE = "https://www.wenshushu.cn";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

let cookie = "";

async function api(path, body) {
  const headers = {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    Origin: BASE,
    Referer: BASE + "/",
    token: globalThis.WSS_TOKEN || "",
  };
  headers["Content-Type"] = "application/json";
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(BASE + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const sc = res.headers.getSetCookie?.() || [];
  if (sc.length) {
    const jar = cookie ? cookie.split("; ").filter(Boolean) : [];
    for (const c of sc) jar.push(c.split(";")[0]);
    cookie = [...new Set(jar)].join("; ");
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok || !json) {
    throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) { console.error("usage: node wss-upload.mjs <files...>"); process.exit(1); }
  const fs = await import("node:fs");
  const crypto = await import("node:crypto");

  // 0. 预热拿 cookie
  try {
    const r = await fetch(BASE + "/", { headers: { "User-Agent": UA } });
    const sc = r.headers.getSetCookie?.() || [];
    cookie = sc.map((c) => c.split(";")[0]).join("; ");
  } catch {}
  console.log("[0] cookie 预热:", cookie ? "OK" : "空(继续尝试)");

  // 1. 匿名登录
  const devInfo = JSON.stringify({
    platform: "web", sversion: "4.2.5", build: "20240",
    model: "chrome", ua: UA,
  });
  const lg = await api("/ap/login/anonymous", { token: "", dev_info: devInfo });
  if (lg.code !== 0 || !lg.data?.token) throw new Error("匿名登录失败: " + JSON.stringify(lg).slice(0, 200));
  globalThis.WSS_TOKEN = lg.data.token;
  console.log("[1] 匿名 token OK");

  // 2. 逐个预上传拿 fid
  const fids = [];
  for (const fp of files) {
    const buf = fs.readFileSync(fp);
    const name = fp.split("/").pop();
    const hash = crypto.createHash("md5").update(buf).digest("hex");
    const pre = await api("/ap/ufile/pre", {
      name, size: buf.length, hash, mime: "application/octet-stream",
    });
    if (pre.code !== 0) throw new Error(`pre 失败(${name}): ` + JSON.stringify(pre).slice(0, 300));
    const d = pre.data;
    console.log(`[2] pre ${name}: up_type=${d.up_type} up_url=${(d.up_url || "").slice(0, 60)}...`);
    const putRes = await fetch(d.up_url, {
      method: d.method?.toUpperCase() || "PUT",
      headers: { "Content-Type": "application/octet-stream", "User-Agent": UA },
      body: buf,
    });
    if (!putRes.ok) throw new Error(`上传失败(${name}): HTTP ${putRes.status} ${await putRes.text().then(t=>t.slice(0,200))}`);
    fids.push(d.fid);
    const end = await api("/ap/ufile/end", { fid: d.fid });
    if (end.code !== 0) throw new Error(`end 失败(${name}): ` + JSON.stringify(end).slice(0, 200));
    console.log(`[2] 上传完成 ${name} (${(buf.length / 1048576).toFixed(1)}MB)`);
  }

  // 3. 创建任务（type=2 文件）
  const task = await api("/ap/task/create", {
    type: 2, file_box: fids.map((fid) => ({ fid })), boxid: "", tid: "",
  });
  if (task.code !== 0 || !task.data?.tid) throw new Error("task/create: " + JSON.stringify(task).slice(0, 300));
  console.log("[3] tid =", task.data.tid);

  // 4. 生成分享链接
  const link = await api("/ap/ding/sharelink", {
    tid: task.data.tid, type: 1, url: "", dev_info: "{}",
  });
  if (link.code !== 0 || !link.data?.url) throw new Error("sharelink: " + JSON.stringify(link).slice(0, 300));
  console.log("\n=== 分享链接 ===");
  console.log(link.data.url);
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
