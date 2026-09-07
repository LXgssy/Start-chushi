import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

let apiJs = fs.readFileSync("bridge/ncm-plugin/index.js", "utf8");
apiJs = apiJs.replace("        fetch(BASE + path, {",
  "        console.log('HJ ' + path); var __b; try { __b = body ? JSON.stringify(body) : undefined; console.log('STR OK '+String(__b).slice(0,60)); } catch (e5) { console.log('STR ERR ' + e5.message); }"
  + "fetch(BASE + path, {");
apiJs = apiJs.replace("body: body ? JSON.stringify(body) : undefined,", "body: __b,");
apiJs = apiJs.replace("var snap = composeSnapshot();",
  "var snap = (function(){ try { return composeSnapshot(); } catch (e3) { console.log('CS ERR ' + e3.message + ' @ ' + (e3.stack||'').split(String.fromCharCode(10))[1]); return null; } })();");
apiJs = apiJs.replace("      httpJson(\"POST\", \"/api/ne\", snap, 1800);", "      try { httpJson('POST', '/api/ne', snap, 1800); } catch (e2) { console.log('POST-NE ERR ' + e2.message + ' | ' + (e2.stack||'').split(String.fromCharCode(10))[1]); }");
const el = { tagName: "audio", isConnected: true, currentTime: 0, duration: 269.3, paused: true, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
const logs = [];
const sandbox = {
  console: { log: (...a) => logs.push(a.join(" ")) },
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 25)),
  clearTimeout, setInterval: (fn, ms) => setInterval(fn, Math.min(ms || 0, 50)), clearInterval,
  fetch: async (u, o) => { logs.push("FETCH " + String(u).slice(0, 70)); return new Response(JSON.stringify({ ok: true, cmds: [] })); },
  Response, Promise, Date, JSON, Math, Number, String, Array, Object, isFinite, parseFloat, parseInt, URL, Buffer,
  require: (n) => n === "crypto" ? crypto : null,
};
sandbox.window = sandbox;
sandbox.document = { querySelector: () => null, querySelectorAll: () => [el] };
sandbox.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
sandbox.betterncm = { ncm: { getPlayingSong() { return { data: { name: "晴天", artists: [{ name: "周杰伦" }], album: { picUrl: "https://x/a.jpg" }, duration: 269300 } }; } } };
sandbox.plugin = { getConfig: (_k, d) => d };
vm.createContext(sandbox);
try { vm.runInContext(apiJs, sandbox, { filename: "api.js" }); } catch (e) { console.log("BOOT ERR", e.message, e.stack.split("\n")[1]); }
setTimeout(() => { console.log("LOGS:", JSON.stringify(logs.slice(0, 30), null, 1)); process.exit(0); }, 600);
