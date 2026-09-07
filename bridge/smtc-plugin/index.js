/* ============================================================================
 * ChuShi SMTC Manager v5.0.0  (generation 5, written from scratch)
 *
 * Single responsibility: keep the ChuShi SMTC engine process alive.
 *   deploy (embedded payload, sha256 read-back verified) ->
 *   spawn powershell.exe -> health check -> supervise with backoff ->
 *   honest blocked/conflict states -> heartbeat so the panel knows who runs.
 *
 * It holds ZERO playback state and never touches NetEase Music internals.
 * ASCII-only by constitution (build gate asserts every byte).
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__chushiSmtcManagerV5) return;
  window.__chushiSmtcManagerV5 = true;

  var PLUGIN_VERSION = "5.0.1";
  var ENGINE_VER_REQUIRED = "5.0.0";
  var ENGINE_NAME = "chushi-smtc-engine";
  var DEFAULT_PORT = 26801;
  var LEGACY_PORTS = [20754]; /* engines from retired generations */

  /* Engine payload injected by build-v5-plugins.py */
  var ENGINE_B64 = "__ENGINE_B64__";
  var ENGINE_SHA256 = "__ENGINE_SHA256__";

  var cp = require("child_process");
  var fs = require("fs");
  var os = require("os");
  var path = require("path");
  var nodeCrypto = require("crypto");

  function cfgPort() {
    try {
      var p = plugin.getConfig("port", DEFAULT_PORT);
      p = parseInt(p, 10);
      if (p >= 1024 && p <= 65535) return p;
    } catch (e) { }
    return DEFAULT_PORT;
  }
  var PORT = cfgPort();
  var BASE = "http://127.0.0.1:" + PORT;

  var state = {
    engine: "none",        /* none | deployed | running | blocked | conflict */
    engineVer: "",
    lastAction: "",
    failStreak: 0,
    backoffMs: 0,
    nextSpawnAt: 0,
  };

  function log(m) {
    try { console.log("[ChuShi SMTC Manager " + PLUGIN_VERSION + "] " + m); } catch (e) { }
  }

  function fetchJson(url, timeoutMs, method, body) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(null); }
      }, timeoutMs);
      try {
        fetch(url, {
          method: method || "GET",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (!done) { done = true; clearTimeout(timer); resolve(j); }
        }).catch(function () {
          if (!done) { done = true; clearTimeout(timer); resolve(null); }
        });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); resolve(null); }
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Kill helpers: only ever kill processes we can positively identify
   * as our own powershell-based engine. Foreign listeners = conflict.
   * ------------------------------------------------------------------ */
  function findListenerPids(port) {
    var pids = [];
    try {
      var out = cp.execSync("netstat -ano -p tcp", { encoding: "utf8", windowsHide: true });
      var lines = String(out).split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (ln.indexOf(":" + port + " ") === -1) continue;
        if (ln.indexOf("LISTENING") === -1) continue;
        var parts = ln.trim().split(/\s+/);
        var pid = parseInt(parts[parts.length - 1], 10);
        if (pid > 0 && pids.indexOf(pid) === -1) pids.push(pid);
      }
    } catch (e) { }
    return pids;
  }

  function pidImage(pid) {
    try {
      var out = cp.execSync('tasklist /FI "PID eq ' + pid + '" /FO CSV /NH',
        { encoding: "utf8", windowsHide: true });
      var m = String(out).match(/^"([^"]+)"/);
      return m ? m[1].toLowerCase() : "";
    } catch (e) { return ""; }
  }

  function killOwnListeners(port) {
    var killed = 0, conflict = false;
    var pids = findListenerPids(port);
    for (var i = 0; i < pids.length; i++) {
      var img = pidImage(pids[i]);
      if (img.indexOf("powershell") !== -1 || img.indexOf("pwsh") !== -1) {
        try {
          cp.execSync("taskkill /F /T /PID " + pids[i], { windowsHide: true });
          killed++;
        } catch (e) { }
      } else if (img) {
        conflict = true;
      }
    }
    return { killed: killed, conflict: conflict };
  }

  /* ------------------------------------------------------------------ *
   * Engine deployment: decode -> verify -> write -> read-back verify
   * ------------------------------------------------------------------ */
  function engineDir() {
    return path.join(process.env.LOCALAPPDATA || os.homedir(), "ChuShiSmtcEngine");
  }
  function enginePath() {
    return path.join(engineDir(), "chushi-smtc-engine.ps1");
  }

  function sha256Hex(buf) {
    return nodeCrypto.createHash("sha256").update(buf).digest("hex");
  }

  function deployEngine() {
    var payload = Buffer.from(ENGINE_B64, "base64");
    if (payload.length < 2000) { state.lastAction = "bad-payload"; return false; }
    if (sha256Hex(payload) !== String(ENGINE_SHA256).toLowerCase()) {
      state.lastAction = "payload-sha-mismatch";
      return false;
    }
    try {
      fs.mkdirSync(engineDir(), { recursive: true });
      fs.writeFileSync(enginePath(), payload);
      var back = fs.readFileSync(enginePath());
      if (back.length !== payload.length) { state.lastAction = "read-back-len"; return false; }
      if (sha256Hex(back) !== String(ENGINE_SHA256).toLowerCase()) {
        state.lastAction = "read-back-sha";
        return false;
      }
      state.lastAction = "deployed";
      return true;
    } catch (e) {
      state.lastAction = "deploy-fail:" + String(e && e.message || e).slice(0, 80);
      return false;
    }
  }

  function spawnEngine() {
    try {
      var child = cp.spawn("powershell.exe", [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
        "-File", enginePath(), "-Port", String(PORT),
      ], { detached: true, stdio: "ignore", windowsHide: true });
      child.unref();
      state.lastAction = "spawned";
      return true;
    } catch (e) {
      state.lastAction = "spawn-fail:" + String(e && e.message || e).slice(0, 80);
      return false;
    }
  }

  /* ------------------------------------------------------------------ *
   * Ensure loop: one pass = ping -> (upgrade | spawn | confirm)
   * ------------------------------------------------------------------ */
  var ensureBusy = false;
  function ensureEngine() {
    if (ensureBusy) return;
    ensureBusy = true;
    var done = function () { ensureBusy = false; };
    ensureEngineAsync().then(done, done);
  }

  function ensureEngineAsync() {
    return fetchJson(BASE + "/api/ping", 1600).then(function (j) {
      if (j && j.ok === true && j.name === ENGINE_NAME && String(j.ver) === ENGINE_VER_REQUIRED) {
        state.engine = "running";
        state.engineVer = String(j.ver);
        state.failStreak = 0;
        state.backoffMs = 0;
        state.lastAction = "healthy";
        return;
      }
      if (j && j.ok === true && j.name === ENGINE_NAME && j.ver && String(j.ver) !== ENGINE_VER_REQUIRED) {
        /* an engine of a previous generation owns the port: replace it */
        log("engine v" + j.ver + " on port, upgrading to v" + ENGINE_VER_REQUIRED);
        var up = killOwnListeners(PORT);
        if (up.conflict) { state.engine = "conflict"; state.lastAction = "foreign-listener"; return; }
      }
      /* no healthy engine: deploy + spawn with backoff */
      var now = Date.now();
      if (state.nextSpawnAt && now < state.nextSpawnAt) return;
      if (state.failStreak > 0) {
        state.backoffMs = state.backoffMs ? Math.min(state.backoffMs * 2, 160000) : 20000;
        state.nextSpawnAt = now + state.backoffMs;
      }
      var legacy = killOwnListeners(PORT);
      if (legacy.conflict) { state.engine = "conflict"; state.lastAction = "foreign-listener"; return; }
      if (!deployEngine()) { state.failStreak++; return; }
      if (!spawnEngine()) { state.failStreak++; return; }
      state.failStreak++;
      if (state.failStreak >= 2) state.engine = "blocked";
      /* confirm after the engine had a moment to bind */
      return new Promise(function (res) { setTimeout(res, 2500); }).then(function () {
        return fetchJson(BASE + "/api/ping", 1600).then(function (j2) {
          if (j2 && j2.ok === true && j2.name === ENGINE_NAME && String(j2.ver) === ENGINE_VER_REQUIRED) {
            state.engine = "running";
            state.engineVer = String(j2.ver);
            state.failStreak = 0;
            state.backoffMs = 0;
            state.nextSpawnAt = 0;
          }
        });
      });
    });
  }

  function heartbeat() {
    fetchJson(BASE + "/api/mgr", 1200, "POST", { v: PLUGIN_VERSION });
  }

  /* one-time cleanup of retired-generation engines */
  try {
    for (var li = 0; li < LEGACY_PORTS.length; li++) killOwnListeners(LEGACY_PORTS[li]);
  } catch (e) { }

  setTimeout(ensureEngine, 1200);
  setInterval(ensureEngine, 15000);
  setInterval(heartbeat, 10000);
  setTimeout(heartbeat, 4000);

  /* ------------------------------------------------------------------ *
   * Diagnostics panel (best effort; honest English status only)
   * ------------------------------------------------------------------ */
  function panelStatusLine() {
    return "engine: " + state.engine.toUpperCase() +
      (state.engineVer ? " v" + state.engineVer : "") +
      " | last: " + (state.lastAction || "-") +
      " | fails: " + state.failStreak +
      " | port: " + PORT;
  }
  try {
    if (typeof plugin !== "undefined" && plugin && typeof plugin.onConfig === "function") {
      plugin.onConfig(function () {
        try {
          var wrap = document.createElement("div");
          wrap.style.cssText = "font-family:monospace;font-size:12px;line-height:1.7;padding:6px 2px";
          var line = document.createElement("div");
          line.textContent = panelStatusLine();
          wrap.appendChild(line);
          setInterval(function () { line.textContent = panelStatusLine(); }, 2000);
          return wrap;
        } catch (e) { return document.createElement("div"); }
      });
    }
  } catch (e) { }

  log("manager up, port " + PORT);
})();
