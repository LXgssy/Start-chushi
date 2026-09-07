/*
 * 初始SMTC桥 (ChuShi SMTC Bridge) — BetterNCMII / chromatic 插件（纯管理，无状态）
 * v3.0.0 双插件架构：本插件 = 桥进程生命周期的唯一管理者（零网易云状态生产）。
 * 网易云真值（进度/播放态/歌词/seek）由「初始网易云API」插件（cc.chushi.ncmapi）负责。
 *
 * 职责（全部沿用 v1.4.0–v1.5.1 真机验证过的桥管理代码，原样提取）：
 *   部署（betterncm.fs → 数据目录 chushi-bridge/，写后读回校验——
 *         内容一致才跳过重写，读回不一致绝不拉起，宁可桥不在线也不弹损坏脚本框）
 *   拉起（直启 powershell 优先——不经 wscript 即无 WSH 错误弹窗；VBS 已 On Error
 *         静默化兑底；拉起失败 20/40/80/120s 封顶退避，不再每 20s 弹窗）
 *   升级（旧桥在场 = 先部署最新版再杀旧进程——cmd netstat+taskkill 优先 /
 *         powershell Get-NetTCPConnection 兜底——端口腾空后立即拉起；
 *         杀不死/拉不起 → bridgeBlocked 置位 → 宿主给「手动启动桥」诚实指引）
 *   监督（20s 健康检查 + ping 版本仲裁；向桥 /api/plugin/register 上报本插件
 *         版本 → 宿主从 /api/state.plugins.smtc 读到活的管理者，版本误报根治）
 *   自启（桥启动时自写 HKCU Run 键指向部署位置，开机零窗口）
 *
 * 与旧「初始歌词源」（一体化 v1.3.0–v1.5.1）的关系：完全替代其桥管理职能。
 * 两者并存无害（网易云状态通道由桥 role 仲裁归「初始网易云API」），但建议卸载旧版。
 *
 * 本文件由 BetterNCMII(js-framework) 以 AsyncFunction("plugin", code) 调用执行，
 * 顶层即异步上下文。注入通道：manifest 的 injects.Main。
 */
/* eslint-disable */
(async function () {
  if (window.__chushiSmtcBridgePluginActive) return;
  window.__chushiSmtcBridgePluginActive = true;

  const TAG = "[ChuShiSmtcBridge]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const PLUGIN_VERSION = "2.0.0";

  /* ---------- 内嵌桥（构建时注入 base64，纯 ASCII ps1 + On Error 静默 vbs） ---------- */
  const EMBEDDED_BRIDGE_VERSION = "2.0.0";
  const EMBEDDED_BRIDGE_PS1_B64 = "/*__BRIDGE_PS1_B64__*/";
  const EMBEDDED_BRIDGE_VBS_B64 = "/*__BRIDGE_VBS_B64__*/";
  const BRIDGE_DIR_REL = "chushi-bridge";

  /* ---------- 配置 ---------- */
  let bridgePort = 20754;
  try {
    const p = parseInt(plugin.getConfig("port", 20754), 10);
    if (p >= 1024 && p <= 65535) bridgePort = p;
  } catch (e) { /* 默认端口 */ }
  const BRIDGE = `http://127.0.0.1:${bridgePort}`;

  /* ---------- 桥管理状态（v1.4.0 → v1.5.1 加固，原样沿用） ---------- */
  let bridgeDeployed = false;
  let bridgeSpawnFails = 0;
  let bridgeRunningVer = "";
  let lastSpawnAt = 0;
  /* 升级链路状态（旧桥占端口场景专用，与冷启动退避分开计数） */
  let bridgeUpgradeFails = 0;
  let lastUpgradeAt = 0;
  let bridgeBlocked = false; /* 自动升级被策略拦截（≥2 次杀旧+拉起均未生效） */
  const PS1_NAME = "chushi-bridge.ps1";
  const VBS_NAME = "chushi-bridge-launch.vbs";
  function versionLt(a, b) {
    const pa = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x < y; }
    return false;
  }
  async function fsReadRel(rel) {
    try {
      if (window.betterncm && window.betterncm.fs && typeof window.betterncm.fs.readFileText === "function") {
        return await window.betterncm.fs.readFileText(rel);
      }
    } catch (e) { /* 读不到按 null 处理 */ }
    return null;
  }
  async function deployBridge() {
    try {
      if (!window.betterncm || !window.betterncm.fs) return false;
      try { await window.betterncm.fs.mkdir(BRIDGE_DIR_REL); } catch (e) { /* 已存在 */ }
      const bin = atob(EMBEDDED_BRIDGE_PS1_B64);
      const vb = atob(EMBEDDED_BRIDGE_VBS_B64);
      const canVerify = typeof window.betterncm.fs.readFileText === "function";
      for (const [name, content] of [[PS1_NAME, bin], [VBS_NAME, vb]]) {
        const rel = BRIDGE_DIR_REL + "/" + name;
        if (!canVerify) {
          /* 旧版 BetterNCM 无 readFileText：退化为盲写一次（v1.3.0 行为） */
          try { await window.betterncm.fs.writeFileText(rel, content); } catch (e) { warn("桥部署写入失败", name, e); return false; }
          continue;
        }
        let cur = await fsReadRel(rel);
        if (cur === content) continue; /* 已是正确内容：跳过重写（防追加语义污染） */
        for (let attempt = 0; attempt < 2 && cur !== content; attempt++) {
          try { await window.betterncm.fs.writeFileText(rel, content); } catch (e) { warn("桥部署写入失败", name, e); }
          cur = await fsReadRel(rel);
        }
        if (cur !== content) {
          /* 读回不一致 = 磁盘视图异常（追加/编码/占用）：绝不拉起——
             宁可桥暂不在线（宿主 SMTC 兜底），也不让 wscript 弹损坏脚本的框 */
          warn("桥部署读回校验失败，本轮不拉起", name);
          return false;
        }
      }
      bridgeDeployed = true;
      return true;
    } catch (e) { warn("桥部署失败", e); return false; }
  }
  async function pingBridge() {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch(BRIDGE + "/api/ping", { signal: ctl.signal });
      clearTimeout(t);
      if (!r || !r.ok) return "";
      const j = await r.json().catch(() => null);
      return j && j.version ? String(j.version) : "";
    } catch (e) { return ""; }
  }
  /* v2.0.0 向桥注册本插件版本（宿主经 /api/state.plugins.smtc 读到活的管理者） */
  async function registerSelf() {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      await fetch(BRIDGE + "/api/plugin/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "smtc", v: PLUGIN_VERSION }),
        signal: ctl.signal,
      });
      clearTimeout(t);
    } catch (e) { /* 桥不在线，监督循环会重试 */ }
  }
  async function spawnBridge() {
    try {
      if (!window.betterncm || !window.betterncm.app || !window.betterncm.app.exec) { bridgeSpawnFails++; return false; }
      const dp = await window.betterncm.app.getDataPath();
      const dir = String(dp || "").replace(/[\\/]+$/, "") + "\\" + BRIDGE_DIR_REL;
      const ps1 = dir + "\\" + PS1_NAME;
      const vbs = dir + "\\" + VBS_NAME;
      lastSpawnAt = Date.now();
      let ok = false;
      /* v1.4.0：直启 powershell 优先（app.exec 默认隐藏窗口；不经 wscript
         即不会产生 WSH 错误弹窗），wscript 仅作兑底（VBS 已 On Error 静默化） */
      try { ok = await window.betterncm.app.exec('powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ps1 + '"'); } catch (e) { ok = false; }
      if (!ok) {
        try { ok = await window.betterncm.app.exec('wscript.exe "' + vbs + '"'); } catch (e) { ok = false; }
      }
      if (ok) bridgeSpawnFails = 0; else bridgeSpawnFails++;
      log("桥拉起 ->", ok);
      return !!ok;
    } catch (e) { warn("桥拉起异常", e); bridgeSpawnFails++; return false; }
  }
  function spawnBackoffMs() {
    /* 20s → 40s → 80s → 封顶 120s：拉起被策略拦截时不再每 20s 弹一次窗 */
    return Math.min(120000, 20000 * Math.pow(2, Math.min(3, bridgeSpawnFails)));
  }
  function upgradeBackoffMs() {
    /* v1.5.0 升级独立退避（30s→60s→120s 封顶）：旧桥占端口时的杀旧+拉起
       尝试与冷启动拉起分开计数，互不拖累 */
    return Math.min(120000, 30000 * Math.pow(2, Math.min(2, bridgeUpgradeFails)));
  }
  /* v1.5.0 杀旧桥进程：拉起本身被系统策略拦截时（真机 0x80070312 对
   * powershell/wscript 双拦），旧桥进程永生占端口，宿主「组件过旧」芯片
   * 永远亮，用户更新 .plugin 也无效（第 9 轮真机「插件是新的却提示旧版」
   * 的直接根因）。这里由插件主动杀掉端口上的旧监听进程，再拉起新桥。
   * 双路径：cmd(netstat+taskkill，cmd 常不在拦截名单) → powershell 兜底。 */
  async function killStaleBridge() {
    const port = String(bridgePort);
    try {
      const c1 = 'cmd.exe /c for /f "tokens=5" %a in (\'netstat.exe -aon ^| findstr :' + port + ' ^| findstr LISTENING\') do @taskkill /F /T /PID %a';
      await window.betterncm.app.exec(c1);
      await sleep(600);
      const ver = await pingBridge();
      if (!ver) return true; /* 端口已空 = 杀成功 */
    } catch (e) { /* 走兜底 */ }
    try {
      const c2 = 'powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort ' + port + ' -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"';
      await window.betterncm.app.exec(c2);
      await sleep(600);
      const ver = await pingBridge();
      if (!ver) return true;
    } catch (e) { /* 双路径都失败 */ }
    return false;
  }
  async function superviseBridge() {
    try {
      const ver = await pingBridge();
      bridgeRunningVer = ver;
      if (ver) await registerSelf(); /* 桥在线即登记（宿主可见活的管理者） */
      if (ver && !versionLt(ver, EMBEDDED_BRIDGE_VERSION)) {
        bridgeSpawnFails = 0; lastSpawnAt = 0; bridgeUpgradeFails = 0;
        return;
      }
      if (ver && versionLt(ver, EMBEDDED_BRIDGE_VERSION)) {
        /* 旧桥在场（无论本插件是否已部署过）：这是「升级」不是「冷启动」
           ——先部署最新版，再杀旧进程，端口腾空后立即拉起新桥（新桥不再
           需要自己仲裁杀旧，拉起即绑定）。杀不死/拉不起（策略拦截）：
           bridgeUpgradeFails 驱动独立退避，bridgeBlocked 置位 → 宿主据此
           展示「手动启动备用桥」的诚实指引而非无效的「更新 .plugin」。 */
        if (lastUpgradeAt && Date.now() - lastUpgradeAt < upgradeBackoffMs()) return;
        lastUpgradeAt = Date.now();
        const ok = await deployBridge();
        if (!ok) { bridgeUpgradeFails++; return; }
        const killed = await killStaleBridge();
        if (killed) await spawnBridge();
        else bridgeUpgradeFails++;
        setTimeout(async () => {
          bridgeRunningVer = await pingBridge();
          if (!bridgeRunningVer || versionLt(bridgeRunningVer, EMBEDDED_BRIDGE_VERSION)) {
            bridgeUpgradeFails++;
            if (bridgeUpgradeFails >= 2 && !bridgeBlocked) {
              bridgeBlocked = true;
              warn("桥自动升级被系统策略拦截（连杀旧/拉起均未生效）：请在「初始SMTC桥」交付包的「手动启动桥（备用）」文件夹手动运行 启动桥.bat");
            }
          } else { bridgeUpgradeFails = 0; if (bridgeBlocked) bridgeBlocked = false; }
        }, 2500);
        return;
      }
      /* 不可达（冷启动路径，v1.4.0 原样）：退避节流拉起 */
      if (lastSpawnAt && Date.now() - lastSpawnAt < spawnBackoffMs()) return;
      const ok = await deployBridge();
      if (!ok) { bridgeSpawnFails++; return; }
      await spawnBridge();
      setTimeout(async () => {
        bridgeRunningVer = await pingBridge();
        log("桥健康检查 ->", bridgeRunningVer || "不可达");
        /* 拉起后仍不可达/版本旧：计一次失败驱动退避（exec 返回值不代表桥真的起来了） */
        if (!bridgeRunningVer || versionLt(bridgeRunningVer, EMBEDDED_BRIDGE_VERSION)) bridgeSpawnFails++;
      }, 2500);
    } catch (e) { /* 忽略 */ }
  }
  setTimeout(superviseBridge, 2000);
  setInterval(superviseBridge, 20000);

  /* ---------- 配置面（NCM 插件管理器） ---------- */
  try {
    plugin.onConfig(function (tools) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "font-size:12px;line-height:1.8;";
      const info = document.createElement("div");
      info.innerText = `初始SMTC桥 ${PLUGIN_VERSION} — 桥进程生命周期唯一管理者（部署/拉起/杀旧/监督/自启），内嵌桥 v${EMBEDDED_BRIDGE_VERSION}；网易云真值由「初始网易云API」插件提供，两端端口须一致`;
      const st = document.createElement("div");
      st.innerText = "当前桥状态: " + (bridgeRunningVer ? "运行中 v" + bridgeRunningVer : "不可达（监督循环会自动重试拉起）") + (bridgeBlocked ? "（自动升级被系统策略拦截，请用交付包内「手动启动桥（备用）」文件夹的 启动桥.bat）" : "");
      const row = document.createElement("div");
      const label = document.createElement("span");
      label.innerText = "桥端口（与「初始网易云API」插件保持一致，重启网易云生效，默认 20754）: ";
      const input = tools.makeInput(String(plugin.getConfig("port", 20754)), { type: "number" });
      const btn = tools.makeBtn("保存", function () {
        const p = parseInt(input.value, 10);
        if (!p || p < 1024 || p > 65535) { alert("端口需在 1024-65535 之间"); return; }
        plugin.setConfig("port", p);
        alert("已保存，重启网易云音乐后生效");
      });
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(btn);
      wrap.appendChild(info);
      wrap.appendChild(st);
      wrap.appendChild(row);
      return wrap;
    });
  } catch (e) { /* 配置面非关键 */ }

  /* ---------- 启动 ---------- */
  log("SMTC桥管理器就绪 v" + PLUGIN_VERSION + "（内嵌桥 v" + EMBEDDED_BRIDGE_VERSION + "，→ " + BRIDGE + "）");
  try {
    window.__chushiSmtcBridgePlugin = {
      version: PLUGIN_VERSION,
      embeddedBridge: EMBEDDED_BRIDGE_VERSION,
      bridge: () => ({ deployed: bridgeDeployed, running: bridgeRunningVer, spawnFails: bridgeSpawnFails, upgradeFails: bridgeUpgradeFails, blocked: bridgeBlocked }),
    };
  } catch (e) { /* 忽略 */ }
})();
