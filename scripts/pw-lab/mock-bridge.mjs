/* mock-bridge.mjs — bridge.dll 协议的 Node 孪生实现（测试替身）
 * 与 bridge.c 完全同契约：
 *   GET  /api/ping     → {"ok":true,"name":"chushi-music-bridge","version":...,"port":N}
 *   GET  /api/status   → 快照 JSON / 503 no-state
 *   POST /api/control  → {"ok":true}，记录供断言
 *   OPTIONS            → CORS 预检
 * Origin 白名单与 DLL 一致（扩展族 / lxgssy.github.io / localhost 族），
 * 另加 /api/__controls 测试自省端点。 */
import { createServer } from "node:http";

export function createMockBridge({ portA, portB }) {
  const controls = [];        // 收到的控制命令（按序）
  let snap = {
    v: 1,
    ts: Date.now(),
    client: "netease-music",
    song: {
      id: 347230,
      name: "夜空中最亮的星",
      artists: ["逃跑计划"],
      album: "世界",
      cover: "",
      durationMs: 251000,
      local: false,
    },
    playing: true,
    positionMs: 30000,
    volume: 0.7,
    mode: "playOrder",
  };
  /* /api/debug 诊断（bridge.dll 1.1.0+ 同形状） */
  let debug = {
    ok: true,
    version: "1.3.0",
    native: "bridge.dll",
    port: portA,
    stateFile: true,
    stateAgeMs: 800,
    diag: {
      v: "1.3.0",
      ts: Date.now(),
      installedAt: Date.now() - 60000,
      storeReady: true,
      eventsHooked: true,
      getPlayingSong: true,
      media: true,
      href: "orpheus://orpheus/pub/app.html",
    },
  };
  const originAllowed = (o) =>
    !o ||
    o.startsWith("chrome-extension://") ||
    o.startsWith("moz-extension://") ||
    o.startsWith("safari-web-extension://") ||
    o === "https://lxgssy.github.io" ||
    o === "http://lxgssy.github.io" ||
    o.startsWith("http://localhost:") ||
    o.startsWith("https://localhost:") ||
    o.startsWith("http://127.0.0.1:") ||
    o.startsWith("https://127.0.0.1:");

  function cors(req, res) {
    const o = req.headers.origin || "";
    if (originAllowed(o)) {
      res.setHeader("Access-Control-Allow-Origin", o || "*");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
      res.writeHead(204);
      res.end();
      return true;
    }
    return false;
  }

  const handler = (req, res) => {
    if (cors(req, res)) return;
    const path = new URL(req.url, "http://x").pathname;
    const o = req.headers.origin || "";
    if (path === "/api/ping") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, name: "chushi-music-bridge", version: "1.0.0", port: portA }));
      return;
    }
    if (path === "/api/status") {
      const out = frozenTs ? { ...snap, ts: frozenTs } : { ...snap, ts: Date.now() };
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(out));
      return;
    }
    if (path === "/api/control" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const j = JSON.parse(body);
          if (j && typeof j.action === "string") {
            controls.push({ ...j, at: Date.now() });
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.writeHead(400); res.end(JSON.stringify({ ok: false }));
          }
        } catch {
          res.writeHead(400); res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }
    if (path === "/api/debug") {
      const out = { ...debug, diag: { ...debug.diag, ts: Date.now() } };
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(out));
      return;
    }
    if (path === "/api/__controls") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(controls));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not-found" }));
  };

  const servers = [portA, portB].map(
    (p) => new Promise((r) => {
      const s = createServer(handler);
      s.listen(p, "127.0.0.1", () => r(s));
    })
  );
  /* 插值测试用：冻结快照时间戳（模拟插件 1s 写盘节奏间的窗口） */
  let frozenTs = 0;
  return {
    controls,
    snapRef: () => snap,
    setSnap: (patch) => { snap = { ...snap, ...patch, ts: Date.now() }; },
    setDebug: (patch) => {
      debug = { ...debug, ...patch, diag: { ...debug.diag, ...(patch.diag || {}) } };
    },
    freeze: (on) => { frozenTs = on ? Date.now() : 0; },
    ready: Promise.all(servers),
  };
}
