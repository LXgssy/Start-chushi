/*
 * ChuShi SMTC Manager (cc.chushi.smtcbridge) v3.0.0 -- REWRITTEN FROM SCRATCH.
 *
 * Single responsibility: make sure the ChuShi SMTC engine process
 * (chushi-smtc-engine.ps1, embedded below as base64) is deployed, running,
 * and healthy on the loopback port. It produces ZERO playback state.
 *
 * What it does:
 *   1. Deploy the engine to %LOCALAPPDATA%\ChuShiSmtcEngine and verify the
 *      written file by SHA-256 read-back (never trust a blind write).
 *   2. Ping the engine; if the answer is not the exact required version,
 *      kill the stale listener (ONLY powershell/pwsh images -- never an
 *      unknown process) and spawn the freshly deployed engine.
 *   3. Supervise every 15 s with an honest backoff (20/40/80/160 s) when
 *      spawn attempts fail (e.g. security software blocks process creation).
 *   4. Heartbeat /api/mgr so the engine can report the manager version.
 *
 * The engine itself owns the full-power SMTC session. It never reads
 * NetEase's own SMTC session, and this plugin never touches playback.
 *
 * Executed by BetterNCM as AsyncFunction("plugin", code) -- top level await
 * is available. This file is ASCII-only by contract.
 */
(async function () {
  if (window.__chushiSmtcManagerV4) return;
  window.__chushiSmtcManagerV4 = true;

  const PLUGIN_VERSION = "3.0.0";
  const ENGINE_VER_REQUIRED = "4.0.0";
  const DEFAULT_PORT = 26801;
  const LEGACY_PORTS = [20754]; // previous-generation engine ports: free them once

  const log = (...a) => console.log("[ChuShiSmtcManager]", ...a);
  const warn = (...a) => console.warn("[ChuShiSmtcManager]", ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const PORT = (parseInt(plugin.getConfig("port", DEFAULT_PORT), 10) || DEFAULT_PORT);
  const BASE = "http://127.0.0.1:" + PORT;

  /*__ENGINE_B64_START__*/
  const ENGINE_B64 = "__ENGINE_B64__";
  const ENGINE_SHA256 = "__ENGINE_SHA256__";
  /*__ENGINE_B64_END__*/

  const state = {
    deployed: false,
    running: false,
    engineVer: "",
    blocked: false,   // process creation is being blocked (honest flag)
    conflict: false,  // unknown image squatting on our port
    failStreak: 0,
    backoffMs: 0,
    nextTryAt: 0,
    lastAction: "",
  };

  let fs, path, os, cp, crypto;
  try {
    fs = require("fs");
    path = require("path");
    os = require("os");
    cp = require("child_process");
    crypto = require("crypto");
  } catch (e) {
    warn("node modules unavailable:", e && e.message);
    return;
  }

  function engineDir() {
    const root = (process.env && process.env.LOCALAPPDATA) || path.join(os.homedir(), "AppData", "Local");
    return path.join(root, "ChuShiSmtcEngine");
  }
  function enginePath() { return path.join(engineDir(), "chushi-smtc-engine.ps1"); }

  /* ---------- process helpers (defensive, image-name guarded) ---------- */

  function pidsListeningOn(port) {
    const found = new Set();
    try {
      const out = cp.execSync("netstat -ano -p tcp", { encoding: "utf8", windowsHide: true, timeout: 8000 });
      const needle = ":" + port;
      for (const ln of String(out).split(/\r?\n/)) {
        if (ln.indexOf(needle) === -1) continue;
        if (ln.indexOf("LISTENING") === -1) continue;
        const parts = ln.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid > 0) found.add(pid);
      }
    } catch (e) { /* netstat unavailable -> report empty */ }
    return Array.from(found);
  }

  function pidImageName(pid) {
    try {
      const out = cp.execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: "utf8", windowsHide: true, timeout: 6000,
      });
      const m = String(out).split(/\r?\n/).find((l) => l.trim().length > 0);
      if (!m) return "";
      return m.split('","')[0].replace(/^"/, "").toLowerCase();
    } catch (e) { return ""; }
  }

  function killPowershellOn(port) {
    const pids = pidsListeningOn(port);
    let killed = 0, foreign = 0;
    for (const pid of pids) {
      const img = pidImageName(pid);
      if (img.indexOf("powershell") !== -1 || img.indexOf("pwsh") !== -1) {
        try { cp.exec(`taskkill /F /T /PID ${pid}`, { windowsHide: true }); killed++; } catch (e) { }
      } else if (img) {
        foreign++;
      }
    }
    return { killed, foreign, total: pids.length };
  }

  /* ---------- deploy / spawn / ping ---------- */

  function deployEngine() {
    const dir = engineDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(ENGINE_B64, "base64");
    fs.writeFileSync(enginePath(), buf);
    const back = fs.readFileSync(enginePath());
    const sha = crypto.createHash("sha256").update(back).digest("hex");
    if (ENGINE_SHA256 && sha.toLowerCase() !== String(ENGINE_SHA256).toLowerCase()) {
      throw new Error("engine read-back sha256 mismatch");
    }
    if (back.length !== buf.length) throw new Error("engine read-back size mismatch");
    state.deployed = true;
    log("engine deployed + verified:", enginePath(), `(${back.length} bytes)`);
  }

  function spawnEngine() {
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
      "-File", enginePath(), "-Port", String(PORT)];
    const child = cp.spawn("powershell.exe", args, { detached: true, stdio: "ignore", windowsHide: true });
    try { child.unref(); } catch (e) { }
    log("engine spawned (detached, hidden)");
  }

  async function pingEngine(timeoutMs) {
    const ctl = new AbortController();
    const t = setTimeout(() => { try { ctl.abort(); } catch (e) { } }, timeoutMs || 1600);
    try {
      const r = await fetch(BASE + "/api/ping", { signal: ctl.signal });
      const j = await r.json();
      if (j && j.ok === true && j.name === "chushi-smtc-engine") return String(j.ver || "");
      return null;
    } catch (e) {
      return null;
    } finally { clearTimeout(t); }
  }

  async function heartbeat() {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => { try { ctl.abort(); } catch (e) { } }, 1200);
      await fetch(BASE + "/api/mgr", {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v: PLUGIN_VERSION }),
      });
      clearTimeout(t);
    } catch (e) { /* engine not up yet */ }
  }

  /* ---------- supervision ---------- */

  function scheduleBackoff() {
    state.backoffMs = state.backoffMs ? Math.min(state.backoffMs * 2, 160000) : 20000;
    state.nextTryAt = Date.now() + state.backoffMs;
  }

  async function superviseOnce() {
    const ver = await pingEngine(1600);
    if (ver) {
      state.running = true; state.blocked = false; state.conflict = false;
      state.failStreak = 0; state.backoffMs = 0; state.engineVer = ver;
      state.lastAction = "engine ok v" + ver;
      if (ver !== ENGINE_VER_REQUIRED) {
        // Not our generation: free the port (powershell images only) and relaunch.
        state.lastAction = "replacing engine v" + ver;
        killPowershellOn(PORT);
        await sleep(700);
        try { spawnEngine(); } catch (e) { warn("respawn failed:", e && e.message); }
      }
      return;
    }
    state.running = false;
    state.engineVer = "";
    if (Date.now() < state.nextTryAt) return;

    // Free the port from stale engines of ANY generation (powershell only).
    const k = killPowershellOn(PORT);
    if (k.foreign > 0) { state.conflict = true; state.lastAction = "foreign process on port"; }
    else { state.conflict = false; }
    if (k.killed > 0) { await sleep(700); }

    try {
      deployEngine();
    } catch (e) {
      warn("deploy failed:", e && e.message);
      state.blocked = true; state.lastAction = "deploy failed";
      scheduleBackoff();
      return;
    }
    try {
      spawnEngine();
    } catch (e) {
      state.failStreak++;
      state.blocked = state.failStreak >= 2; // honest: creation is being blocked
      state.lastAction = "spawn failed";
      warn("spawn failed:", e && e.message);
      scheduleBackoff();
      return;
    }
    await sleep(2500);
    const v2 = await pingEngine(1600);
    if (v2) {
      state.running = true; state.blocked = false; state.failStreak = 0;
      state.backoffMs = 0; state.engineVer = v2;
      state.lastAction = "engine started v" + v2;
    } else {
      state.failStreak++;
      state.blocked = state.failStreak >= 2;
      state.lastAction = "engine did not answer";
      scheduleBackoff();
    }
  }

  /* ---------- config panel (BetterNCM manager UI) ---------- */

  try {
    plugin.onConfig(function (tools) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "font-size:12px;line-height:1.8;";
      const info = document.createElement("div");
      info.innerText = `ChuShi SMTC Manager ${PLUGIN_VERSION} -- deploys and supervises the full-power SMTC engine (own Windows media session; NetEase's built-in SMTC switch is NOT required). Truth data comes from the ChuShi Music API plugin. Both plugins must use the same port.`;
      const st = document.createElement("div");
      st.style.cssText = "margin-top:6px;color:#166534;font-weight:600;";
      const refresh = () => {
        st.innerText = `engine: ${state.running ? "RUNNING v" + state.engineVer : "not running"}` +
          ` | deployed: ${state.deployed ? "yes" : "no"}` +
          ` | blocked: ${state.blocked ? "yes (security software)" : "no"}` +
          ` | conflict: ${state.conflict ? "foreign process on port" : "no"}` +
          ` | ${state.lastAction}`;
      };
      refresh();
      const timer = setInterval(refresh, 2000);
      try { wrap.addEventListener("DOMNodeRemoved", () => clearInterval(timer)); } catch (e) { }
      const row = document.createElement("div");
      row.style.cssText = "margin-top:6px;";
      const label = document.createElement("span");
      label.innerText = "Engine port (must match ChuShi Music API plugin; default 26801): ";
      const input = tools.makeInput(String(PORT), { type: "number" });
      const btn = tools.makeBtn("Save", function () {
        const p = parseInt(input.value, 10);
        if (!p || p < 1024 || p > 65535) { alert("Port must be 1024-65535"); return; }
        plugin.setConfig("port", p);
        alert("Saved. Restart NetEase Cloud Music to apply.");
      });
      row.appendChild(label); row.appendChild(input); row.appendChild(btn);
      wrap.appendChild(info); wrap.appendChild(st); wrap.appendChild(row);
      return wrap;
    });
  } catch (e) { /* config panel is optional */ }

  /* ---------- boot ---------- */

  log(`SMTC Manager v${PLUGIN_VERSION} boot (engine ${ENGINE_VER_REQUIRED} on port ${PORT})`);

  // Hygiene: previous-generation engines may linger on old ports.
  for (const lp of LEGACY_PORTS) {
    try { const k = killPowershellOn(lp); if (k.killed) log(`legacy port ${lp}: killed ${k.killed}`); }
    catch (e) { }
  }

  await superviseOnce();
  setInterval(() => { superviseOnce().catch((e) => warn("supervise:", e && e.message)); }, 15000);
  setInterval(() => { heartbeat(); }, 10000);
  heartbeat();
})();
