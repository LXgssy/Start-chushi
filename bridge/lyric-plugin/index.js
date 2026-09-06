/*
 * 初始歌词源 (ChuShi Lyric Source) — BetterNCMII / chromatic 插件（纯 API，无 UI）
 *
 * 「初始」SMTC 音乐面板的网易云增强数据源：
 *   ① 精确播放状态（songId/positionMs/durationMs/playing/封面 URL）——
 *      SMTC 时间轴缺失或停滞时的时钟兜底（帧级精度，取自媒体元素）
 *   ② 逐字歌词（yrc）——网易云客户端内部才有，SMTC 不提供
 *   数据主动 POST 推送到「初始 SMTC 桥」(http://127.0.0.1:20754，见本文件末尾配置)：
 *      /api/plugin/state  1s 心跳（暂停 3.5s）
 *      /api/plugin/lyric  切歌时推送 + 启动时补推缓存
 *
 * 歌词获取策略（按优先级，先到先用）：
 *   A. eapi /api/song/lyric/v1（yv=1）→ yrc 逐字 + ytlrc 逐字翻译（主流曲库均有）
 *   B. 同接口返回的 klyric（卡拉 OK 字级，覆盖较少）→ 自行转 yrc 同构文本
 *   C. channel.call("track.lyric.getinfo") → lrc/tlyric 行级
 *   D. 直连 music.163.com/api/song/lyric → lrc/tlyric 行级
 * 歌词按 songId 缓存（内存 + localStorage，上限 8 首），切回最近曲目不重拉。
 *
 * 状态源（v1.4.0 真值熔断：原生事件为主，媒体元素只作对齐校验）：
 *   ① legacyNativeCmder 原生事件（PlayState/PlayProgress/Seek）——网易云自家
 *      引擎直出，不会被流浪 video/预加载元素污染（主源）；
 *   ② 媒体元素：仅当与原生期望位置对齐（≤1.5s）时采信其 currentTime（亚秒精度）；
 *      原生事件缺失时才用评分制选元素兑底（v1.3.0 粘滞首中选元曾被预加载/
 *      流浪元素污染，真机报出 paused+0 → 面板冻死 0:00 + 播放态反转）
 *
 * 本文件由 BetterNCMII(js-framework) 以 AsyncFunction("plugin", code) 调用执行，
 * 顶层即异步上下文。注入通道：manifest 的 injects.Main。
 */
/* eslint-disable */
(async function () {
  if (window.__chushiLyricSourceActive) return;
  window.__chushiLyricSourceActive = true;

  const TAG = "[ChuShiLyricSource]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const PLUGIN_VERSION = "1.4.0";

  /* ---------- 一体化服务（v1.3.0）：内嵌 SMTC 桥，抛弃独立桥文件 ----------
   * 桥 ps1/vbs 以 base64 内嵌（纯 ASCII，构建时注入），本插件负责：
   *   部署（betterncm.fs → 数据目录 chushi-bridge/）→
   *   拉起（betterncm.app.exec，默认隐藏窗口，零窗体）→
   *   监督（20s 健康检查：不可达或版本低于内嵌版 → 重新部署+拉起；
   *        新实例自带版本仲裁：杀旧绑新/静默退出）→
   *   自启（桥启动时自写 Run 键指向部署位置，开机零窗口）。
   * 用户从此只装这一个 .plugin，版本漂移结构性消灭。 */
  const EMBEDDED_BRIDGE_VERSION = "1.7.1";
  const EMBEDDED_BRIDGE_PS1_B64 = "/*__BRIDGE_PS1_B64__*/";
  const EMBEDDED_BRIDGE_VBS_B64 = "/*__BRIDGE_VBS_B64__*/";
  const BRIDGE_DIR_REL = "chushi-bridge";

  /*__EAPI_CRYPTO_START__*/
  // —— eapi 加密（与 NetEaseCloudMusicApi 同构：nobody{url}use{text}md5forencrypt
  //    + AES-128-ECB(key=e82ckenh8dichen8) → 大写 hex）。自包含实现，运行时
  //    生成 S-box（GF(2^8) 逆元 + 仿射变换），避免手抄 256 魔数出错。
  function utf8Bytes(str) {
    const bin = unescape(encodeURIComponent(str));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }
  function bytesToHexUpper(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += (bytes[i] >> 4).toString(16) + (bytes[i] & 15).toString(16);
    return s.toUpperCase();
  }
  // ---------- MD5（RFC 1321，输入 Uint8Array，输出小写 hex） ----------
  function md5Bytes(bytes) {
    const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    // 64 个常量：floor(abs(sin(i+1)) * 2^32)
    const K = new Int32Array(64);
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    let a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;
    const origLen = bytes.length;
    const bitLen = origLen * 8;
    // padding: msg + 0x80 + zeros + 8-byte little-endian bitLen
    const padded = (((origLen + 8) >> 6) + 1) << 6;
    const msg = new Uint8Array(padded);
    msg.set(bytes);
    msg[origLen] = 0x80;
    /* ⚠ JS 移位计数取模 32：8*i ≥ 32 时 x>>>(8*i) 等于不移位，会把低位字节重复写进
       高位长度字（md5('a') 首次跑错就是它）——i≥4 的长度字节直接置 0（消息 < 512MB 恒成立） */
    for (let i = 0; i < 8; i++) msg[padded - 8 + i] = i < 4 ? (bitLen >>> (8 * i)) & 0xff : 0;
    const M = new Int32Array(16);
    const rl = (x, c) => (x << c) | (x >>> (32 - c));
    for (let off = 0; off < padded; off += 64) {
      for (let i = 0; i < 16; i++) {
        const j = off + i * 4;
        M[i] = (msg[j] | (msg[j + 1] << 8) | (msg[j + 2] << 16) | (msg[j + 3] << 24)) | 0;
      }
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
        else { F = C ^ (B | ~D); g = (7 * i) & 15; }
        F = (F + A + K[i] + M[g]) | 0;
        A = D; D = C; C = B;
        B = (B + rl(F, s[i])) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const out = new Uint8Array(16);
    const words = [a0, b0, c0, d0];
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) out[i * 4 + j] = (words[i] >>> (8 * j)) & 0xff;
    let hex = "";
    for (let i = 0; i < 16; i++) hex += (out[i] >> 4).toString(16) + (out[i] & 15).toString(16);
    return hex;
  }
  // ---------- AES-128 ECB 加密 ----------
  const AES = (() => {
    // GF(2^8) 乘法
    const gmul = (a, b) => {
      let p = 0;
      for (let i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        const hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi) a ^= 0x1b;
        b >>= 1;
      }
      return p;
    };
    // S-box：乘法逆元 + 仿射变换（运行时构造）
    const SBOX = new Uint8Array(256);
    {
      const inv = new Uint8Array(256);
      // 求逆元：枚举（256 元素小表，O(256^2) 可接受）
      for (let i = 1; i < 256; i++)
        for (let j = 1; j < 256; j++)
          if (gmul(i, j) === 1) { inv[i] = j; break; }
      inv[0] = 0;
      for (let i = 0; i < 256; i++) {
        let x = inv[i], s = x;
        for (let b = 0; b < 4; b++) {
          // 循环左移 1 位
          const hi = (x >> 7) & 1;
          x = ((x << 1) | hi) & 0xff;
          s ^= x;
        }
        SBOX[i] = (s ^ 0x63) & 0xff;
      }
    }
    const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
    function expandKey(key) {
      const w = new Uint8Array(176);
      w.set(key);
      for (let i = 16; i < 176; i += 4) {
        let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
        if (i % 16 === 0) {
          const tmp = t0;
          t0 = SBOX[t1] ^ RCON[i / 16 - 1];
          t1 = SBOX[t2];
          t2 = SBOX[t3];
          t3 = SBOX[tmp];
        }
        w[i] = w[i - 16] ^ t0;
        w[i + 1] = w[i - 15] ^ t1;
        w[i + 2] = w[i - 14] ^ t2;
        w[i + 3] = w[i - 13] ^ t3;
      }
      return w;
    }
    function encryptBlock(w, input) {
      const st = new Uint8Array(16);
      for (let i = 0; i < 16; i++) st[i] = input[i] ^ w[i];
      for (let round = 1; round <= 10; round++) {
        // SubBytes + ShiftRows（⚠ 四行都要从 t 回写——只写 1..3 行会让第 0 行
        // 跳过 SubBytes，整轮密文全错）
        const t = new Uint8Array(16);
        for (let i = 0; i < 16; i++) t[i] = SBOX[st[i]];
        for (let c = 0; c < 4; c++)
          for (let r = 0; r < 4; r++) st[r + 4 * c] = t[r + 4 * ((c + r) & 3)];
        if (round !== 10) {
          // MixColumns（列主序 st[4c+r]，标准矩阵 2/3/1/1）
          for (let c = 0; c < 4; c++) {
            const a0 = st[4 * c], a1 = st[4 * c + 1], a2 = st[4 * c + 2], a3 = st[4 * c + 3];
            st[4 * c] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
            st[4 * c + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
            st[4 * c + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
            st[4 * c + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
          }
        }
        // AddRoundKey（在 MixColumns 之后——FIPS-197 轮序：Sub/Shift → Mix → AddKey）
        for (let i = 0; i < 16; i++) st[i] ^= w[16 * round + i];
      }
      return st;
    }
    return {
      ecbEncrypt(bytes, key) {
        /* PKCS#7 填充（node crypto aes-128-ecb 默认，eapi 服务端要求） */
        const pad = 16 - (bytes.length % 16);
        const buf = new Uint8Array(bytes.length + pad);
        buf.set(bytes);
        buf.fill(pad, bytes.length);
        const w = expandKey(key);
        const out = new Uint8Array(buf.length);
        for (let off = 0; off < buf.length; off += 16) {
          out.set(encryptBlock(w, buf.subarray(off, off + 16)), off);
        }
        return out;
      },
    };
  })();
  const EAPI_KEY = utf8Bytes("e82ckenh8dichen8");
  function eapiParams(apiPath, payloadObj) {
    const text = JSON.stringify(payloadObj);
    const digest = md5Bytes(utf8Bytes(`nobody${apiPath}use${text}md5forencrypt`));
    const data = `${apiPath}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
    return bytesToHexUpper(AES.ecbEncrypt(utf8Bytes(data), EAPI_KEY));
  }
  /*__EAPI_CRYPTO_END__*/

  /* ---------- 配置 ---------- */
  let bridgePort = 20754;
  try {
    const p = parseInt(plugin.getConfig("port", 20754), 10);
    if (p >= 1024 && p <= 65535) bridgePort = p;
  } catch (e) { /* 默认端口 */ }
  const BRIDGE = `http://127.0.0.1:${bridgePort}`;

  /* ---------- 内嵌桥：部署 / 拉起 / 监督（v1.3.0 → v1.4.0 加固）----------
   * v1.4.0 真机教训（用户机器策略拦截 + WSH 弹窗 0x80070312）：
   *   a) 部分机器的策略/杀软会拦截 wscript→powershell 的进程创建——拉起改为
   *      直启 powershell 优先（app.exec 默认隐藏窗口，不经 wscript 即无 WSH
   *      错误弹窗）；VBS 也已加 On Error Resume Next 兜底静默。
   *   b) 部署文件曾被写坏（真机 WSH 报第 17 行，仓库/内嵌均只有 14 行）——
   *      部署后必须读回校验：内容一致才跳过重写（防追加语义污染），读回
   *      不一致绝不拉起（宁可桥不在线，也不弹损坏脚本错误框）。
   *   c) 拉起失败无退避会每 20s 弹窗/拉进程——失败按 20/40/80/120s 封顶退避。 */
  let bridgeDeployed = false;
  let bridgeSpawnFails = 0;
  let bridgeRunningVer = "";
  let lastSpawnAt = 0;
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
  async function superviseBridge() {
    try {
      const ver = await pingBridge();
      bridgeRunningVer = ver;
      if (ver && !versionLt(ver, EMBEDDED_BRIDGE_VERSION)) { bridgeSpawnFails = 0; lastSpawnAt = 0; return; }
      /* 不可达或版本旧 → 重新部署最新内嵌版并拉起（新实例自带版本仲裁：
         若端口被同版本或更新版本占用则静默退出，被旧版占用则杀旧绑新）。
         v1.4.0：失败退避节流（上一次拉起尝试后未满退避窗则本轮跳过），
         真机策略拦截场景不再以 20s 周期反复触发进程创建/弹窗 */
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
  /* 快命令通道（v1.3.0）：300ms 轮询 /api/plugin/cmd，seek 延迟 ≤300ms
     （旧版靠心跳指带最多延迟 1s）；空轮询成本可忽略（本机回环） */
  setInterval(async () => {
    if (disposed) return;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1200);
      const r = await fetch(BRIDGE + "/api/plugin/cmd", { signal: ctl.signal });
      clearTimeout(t);
      if (!r || !r.ok) return;
      const j = await r.json().catch(() => null);
      if (j && j.cmd) applyBridgeCmd(j, buildSnapshot());
    } catch (e) { /* 桥不在线，静默 */ }
  }, 300);

  /* ---------- 运行时句柄 ---------- */
  let store = null;
  let getPlayingSong = null;
  let lastPlaying = false;
  let lastPlayingAt = 0;
  let lastProgressMs = 0;
  let lastProgressAt = 0;
  let lastSeekAt = 0;
  let lastSongId = 0;
  let disposed = false;
  const installedAt = Date.now();
  log("加载中 v" + PLUGIN_VERSION, "→ 桥", BRIDGE);

  for (let i = 0; i < 100 && !window.legacyNativeCmder; i++) await sleep(200);
  if (!window.legacyNativeCmder) warn("legacyNativeCmder 未出现，事件源降级");
  try {
    if (window.betterncm && window.betterncm.ncm && window.betterncm.ncm.getPlayingSong) {
      getPlayingSong = window.betterncm.ncm.getPlayingSong.bind(window.betterncm.ncm);
    }
  } catch (e) { /* 兜底不可用则跳过 */ }

  /* ---------- 媒体真值（v1.4.0 熔断重构）----------
   * 主源 = legacyNativeCmder 原生事件（网易云自家引擎直出，不可能被
   * 流浪 video / 预加载元素污染）：PlayState→lastPlaying(At)、
   * PlayProgress→lastProgressMs(At)。
   * 媒体元素降级为「对齐校验」：与原生期望位置差 ≤1.5s 才采信其
   * currentTime（补亚秒精度）；原生事件缺失（老客户端无 cmder）时才用
   * 评分制选元素兑底（对齐分优先，平分 DOM 靠前者胜——主播放器在 DOM
   * 首位是 v2.2.0 真机实证基线）。
   * v1.3.0 的「粘滞 + 首中即选」会粘住预加载/流浪元素，真机报出
   * paused+0 → 宿主绝对锚定把面板钉死 0:00 / 播放态概率反转，废除。 */
  function nativeExpectMs(nowMs) {
    if (!lastProgressAt) return -1;
    const drift = lastPlaying && lastPlayingAt ? Math.min(2000, Math.max(0, nowMs - Math.max(lastProgressAt, lastPlayingAt))) : 0;
    return lastProgressMs + drift;
  }
  function pickMediaEl(nowMs) {
    try {
      const els = Array.from(document.querySelectorAll("video,audio"));
      if (!els.length) return null;
      const expectMs = nativeExpectMs(nowMs);
      let best = null, bestS = -1e9;
      for (const e of els) {
        if (!e) continue;
        let s = 0;
        if (e.duration > 0 && isFinite(e.duration)) s += 2;
        if (e.paused === false) s += 4;
        if ((e.currentTime || 0) > 0.2) s += 1;
        if (expectMs >= 0 && isFinite(e.currentTime)) {
          const diff = Math.abs(e.currentTime * 1000 - expectMs);
          if (diff < 1500) s += 12 - Math.min(8, diff / 200);
          else s -= Math.min(10, diff / 1000);
        }
        if (s > bestS) { bestS = s; best = e; } /* 平分时 DOM 靠前者胜出 */
      }
      return best;
    } catch (e) { return null; }
  }
  function httpsUp(u) {
    if (!u || typeof u !== "string") return "";
    let s = u.replace(/^http:\/\//i, "https://");
    if (s.indexOf("param=") === -1 && /music\.126\.net/.test(s)) {
      s += (s.indexOf("?") === -1 ? "?" : "&") + "param=500y500";
    }
    return s;
  }
  /* 状态快照（v1.4.0 真值熔断）：
   *   playing = 原生 PlayState 主源（新鲜 ≤5s）；无原生时才信元素 paused；
   *   positionMs = 原生期望位置为主，元素对齐（≤1.5s）时用元素值补亚秒精度；
   *   深位置突现 ≈0 且 5s 内无本端 seek → 判为垃圾样本丢弃（沿用原生进度）；
   *   durationMs = store curTrack（歌锚定）优先，对齐元素时长只作兑底——
   *   错误元素的 duration 是下一首的，绝不能当当前歌时长上报。 */
  function buildSnapshot() {
    const nowMs = Date.now();
    const el = pickMediaEl(nowMs);
    const expectMs = nativeExpectMs(nowMs);
    let playing;
    if (lastPlayingAt && nowMs - lastPlayingAt < 5000) playing = lastPlaying;
    else if (el) playing = el.paused === false;
    else playing = lastPlaying;
    let posMs = 0, posAligned = false;
    if (el && isFinite(el.currentTime)) {
      if (expectMs >= 0) {
        if (Math.abs(el.currentTime * 1000 - expectMs) < 1500) { posMs = Math.floor(el.currentTime * 1000); posAligned = true; }
        else posMs = expectMs; /* 元素与原生期望脱钩（错误元素/换源过场）：不信元素 */
      } else { posMs = Math.floor(el.currentTime * 1000); posAligned = true; }
    } else if (expectMs >= 0) posMs = expectMs;
    /* 垃圾零值熔断：对齐样本突报 ≈0（错误元素/缓冲过场）而原生进度深在
       前方、5s 内无本端 seek → 丢弃该读数，沿用原生进度（真机「播放时间
       显示 0 + 进度/歌词冻死」的直接根因就在这条路径上） */
    if (posMs < 800 && lastProgressMs > 3000 && nowMs - lastSeekAt > 5000) {
      posMs = Math.max(expectMs, lastProgressMs);
      posAligned = false;
    }
    let song = null;
    let durMs = 0;
    try {
      if (store) {
        const p = store.getState().playing || {};
        const id = p.resourceTrackId || p.onlineResourceId || null;
        if (id) {
          song = {
            id: Number(id) || id,
            name: p.resourceName || "未知歌名",
            artists: (p.resourceArtists || []).map((a) => a && a.name).filter(Boolean),
            album: (p.curTrack && p.curTrack.album && (p.curTrack.album.albumName || p.curTrack.album.name)) || "",
            cover: httpsUp(p.resourceCoverUrl || (p.curTrack && p.curTrack.album && p.curTrack.album.picUrl) || ""),
          };
          if (p.curTrack && p.curTrack.duration > 0) durMs = Math.floor(p.curTrack.duration);
        }
      }
      if (!song && getPlayingSong) {
        const d = (getPlayingSong() || {}).data;
        if (d && d.id) {
          song = {
            id: Number(d.id) || d.id,
            name: d.name || "未知歌名",
            artists: (d.artists || []).map((a) => a && a.name).filter(Boolean),
            album: (d.album && (d.album.name || d.album.albumName)) || "",
            cover: httpsUp((d.album && d.album.picUrl) || ""),
          };
          if (d.duration > 0) durMs = Math.floor(d.duration);
        }
      }
    } catch (e) { /* 状态降级 */ }
    if (durMs <= 0 && posAligned && el && el.duration > 0 && isFinite(el.duration)) {
      /* 仅对齐元素（=确认是当前歌的元素）的时长才可作兑底 */
      durMs = Math.floor(el.duration * 1000);
    }
    if (song && song.id) lastSongId = Number(song.id) || lastSongId;
    return {
      song,
      playing,
      positionMs: Math.max(0, Math.floor(posMs)),
      durationMs: Math.max(0, durMs),
      ts: nowMs,
    };
  }

  /* ---------- 推送到桥 ---------- */
  let bridgeAlive = false;
  async function post(path, body) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(BRIDGE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      clearTimeout(t);
      return r && r.ok;
    } catch (e) { return false; }
  }
  /* v1.1.0：带应答体的 POST（心跳命令通道用；其余路径行为同 post） */
  async function postJson(path, body) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(BRIDGE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (!r || !r.ok) return null;
      return await r.json().catch(() => null);
    } catch (e) { return null; }
  }
  let lastStateSig = "";
  async function pushState(force) {
    if (disposed) return;
    const snap = buildSnapshot();
    lastPlaying = snap.playing;
    if (snap.durationMs > 0 && snap.positionMs > snap.durationMs) snap.positionMs = snap.durationMs;
    const sig = JSON.stringify([snap.song && snap.song.id, snap.playing, snap.positionMs, snap.durationMs]);
    if (!force && sig === lastStateSig) return;
    lastStateSig = sig;
    /* v1.2.0：心跳捎带插件版本（宿主/面板可诊断插件在场与版本）与最近一次
       seek 执行结果（seekAck）——桥透传给宿主做 seek 快速确认 */
    const body = Object.assign({}, snap, { v: PLUGIN_VERSION, seekAck: lastSeekAck });
    const resp = await postJson("/api/plugin/state", body);
    const ok = !!resp;
    if (ok && resp && resp.cmd) applyBridgeCmd(resp, snap);
    /* v1.4.0 歌词自愈：桥重启后会丢掉内存里的歌词，心跳应答带
       needLyric=<songId>；插件有缓存则补推，无缓存则触发拉取 */
    if (ok && resp && resp.needLyric) rePushLyric(Number(resp.needLyric));
    if (ok && !bridgeAlive) { bridgeAlive = true; log("桥已连通"); }
  }
  /* ---------- 桥下发命令（v1.1.0 心跳应答 / v1.2.0 dispatch / v1.3.0 三级阶梯）----------
     A0 正门：channel.call("audioplayer.seek", cb, [songId, tag, 秒]) ——
             网易云自家进度条拖动走的就是这条原生 RPC（refined-now-playing
             劫持 channel.call 实证），参数 [songId, "songId|seek|rand", 秒]；
     A1 兑底：store.dispatch("playing/setPlayingPosition" payload 秒)；
     B  末级：el.currentTime 直写。
     每级 420ms 后用 el.currentTime 实测校验；全部未生效则 seekAck ok:false
     如实回报（宿主弹回进度条并提示，绝不假装已跳转）。 */
  let lastSeekAck = null; // {id, ok, pos, at} —— 随心跳上报，宿主据此快速确认
  /* v1.4.0：channel 路线健康闸——真机若 audioplayer.seek 的参数形态在本版
     客户端上会打断播放（seek 后 2s 内播放态翻停），本会话永久禁用 channel
     路线并持久化，后续 seek 走 dispatch/元素路线，绝不反复伤害播放 */
  let channelDisabled = false;
  let channelSeekAt = 0;
  let channelPlayingBefore = false;
  try { channelDisabled = localStorage.getItem("chushi-channel-seek-disabled") === "1"; } catch (e) {}
  function normTitle(s) {
    return String(s || "").toLowerCase().replace(/[\s\-_·・()（）\[\]【】「」『』,，。、!！?？~～'\"＂]/g, "");
  }
  function channelSeek(songId, pos) {
    try {
      if (!songId || !window.channel || typeof window.channel.call !== "function") return false;
      if (channelDisabled) return false; /* 健康闸：曾打断过播放则本会话不再走 */
      channelSeekAt = Date.now();
      channelPlayingBefore = lastPlaying;
      const tag = songId + "|seek|" + Math.random().toString(36).substring(6);
      window.channel.call("audioplayer.seek", function () {}, [songId, tag, pos]);
      return true;
    } catch (e) { return false; }
  }
  function seekVerify(seekId, pos, el, stage, round) {
    /* stage: 0=channel 1=dispatch 2=element
       v1.4.0：验证基准改用 buildSnapshot() 的熔断后真值（与宿主看到的一致），
       不再裸读可能选错元素的 el.currentTime */
    setTimeout(function () {
      if (disposed) return;
      const curMs = buildSnapshot().positionMs || 0;
      if (Math.abs(curMs / 1000 - pos) <= 1.2) {
        lastSeekAck = { id: seekId, ok: true, pos: pos, at: Date.now() };
        lastProgressMs = Math.floor(pos * 1000);
        lastProgressAt = Date.now();
        pushState(true).catch(function () {});
        log("seek 生效（" + (stage === 0 ? "channel" : stage === 1 ? "dispatch" : "element") + "）-> " + pos.toFixed(1) + "s");
        return;
      }
      if (stage === 0) {
        try { if (store) store.dispatch({ type: "playing/setPlayingPosition", payload: { duration: pos } }); } catch (e) { warn("dispatch 失败", e); }
        seekVerify(seekId, pos, el, 1, 0);
        return;
      }
      if (stage === 1) {
        try { const el2 = pickMediaEl(Date.now()) || el; if (el2) el2.currentTime = pos; } catch (e) {}
        lastProgressMs = Math.floor(pos * 1000);
        lastProgressAt = Date.now();
        seekVerify(seekId, pos, el, 2, 0);
        return;
      }
      if (round < 2) { seekVerify(seekId, pos, el, stage, round + 1); return; } // 客户端 seek 异步，再等一拍
      lastSeekAck = { id: seekId, ok: false, pos: pos, at: Date.now() };
      pushState(true).catch(function () {});
      warn("seek 三级均未生效 pos=" + pos.toFixed(1));
    }, 420);
  }
  function applyBridgeCmd(resp, snap) {
    try {
      if (resp.cmd !== "seek") return;
      const pos = Number(resp.position);
      if (!isFinite(pos) || pos < 0) return;
      const seekId = String(resp.id || "").slice(0, 40);
      if (resp.title) {
        const cur = (snap && snap.song && snap.song.name) || "";
        const a = normTitle(cur), b = normTitle(resp.title);
        if (a && b && !(a.includes(b) || b.includes(a))) return; // 已切歌，丢弃旧命令
      }
      const songId = (snap && snap.song && Number(snap.song.id)) || lastSongId || 0;
      /* 时长闸用快照时长（歌锚定）——v1.3.0 用 el.duration 会被错误元素的
         「下一首时长」误杀合法 seek */
      if (snap && snap.durationMs > 0 && pos * 1000 > snap.durationMs + 500) return;
      lastSeekAt = Date.now();
      const viaChannel = channelSeek(songId, pos);
      if (!viaChannel) {
        try { if (store) store.dispatch({ type: "playing/setPlayingPosition", payload: { duration: pos } }); } catch (e) { warn("dispatch 失败", e); }
      }
      lastProgressMs = Math.floor(pos * 1000);
      lastProgressAt = Date.now();
      pushState(true).catch(function () {});
      seekVerify(seekId, pos, pickMediaEl(Date.now()), viaChannel ? 0 : 1, 0);
      log("桥命令 seek -> " + pos.toFixed(1) + "s（" + (viaChannel ? "channel" : "dispatch") + " 路线）");
    } catch (e) {}
  }
  /* 心跳：播放 1s / 暂停 3.5s（桥侧 5s 新鲜度窗口，暂停也必须保活） */
  setInterval(() => { pushState(true).catch(() => {}); }, 1000);
  setInterval(() => { if (!lastPlaying) pushState(true).catch(() => {}); }, 3500);

  /* ---------- NCM 原生事件（播放态/进度兜底） ---------- */
  try {
    const cmder = window.legacyNativeCmder;
    if (cmder && cmder.appendRegisterCall) {
      cmder.appendRegisterCall("PlayState", "audioplayer", function (playId, idStr, state) {
        lastPlaying = state === 1;
        lastPlayingAt = Date.now();
        /* v1.4.0 channel 健康闸：seek 后 2s 内播放态意外翻停 = channel 路线
           打断了播放 → 本会话禁用并持久化 */
        if (!lastPlaying && channelSeekAt && Date.now() - channelSeekAt < 2000 && channelPlayingBefore) {
          channelDisabled = true;
          channelSeekAt = 0;
          try { localStorage.setItem("chushi-channel-seek-disabled", "1"); } catch (e) {}
          warn("channel seek 后播放中断：本会话禁用 channel 路线");
        }
        pushState(true).catch(() => {});
      });
      cmder.appendRegisterCall("PlayProgress", "audioplayer", function (playId, sec) {
        if (typeof sec === "number" && sec >= 0) { lastProgressMs = Math.floor(sec * 1000); lastProgressAt = Date.now(); }
      });
      cmder.appendRegisterCall("Seek", "audioplayer", function (playId, seekId, code, pos) {
        if (typeof pos === "number" && pos >= 0) {
          lastProgressMs = Math.floor(pos * 1000);
          lastProgressAt = Date.now();
          lastSeekAt = Date.now();
          pushState(true).catch(() => {});
        }
      });
      log("原生事件已注册（PlayState/PlayProgress/Seek）");
    }
  } catch (e) { warn("注册原生事件失败", e); }

  /* ---------- Redux store 发现（NCM 3.x dva；webpack4/5 双兼容） ---------- */
  function captureWebpackRequire() {
    return new Promise((resolve) => {
      try {
        const gp = window.webpackJsonp;
        if (gp && typeof gp.push === "function") {
          const id = "__chushi_lyric_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
          const chunk = {};
          chunk[id] = function (module, exports, require) {
            try { resolve(typeof require === "function" ? require : null); } catch (e) { resolve(null); }
          };
          if (Array.isArray(gp[0])) gp.push([[id], chunk, [[id]]]);
          else gp.push([[id], chunk]);
          setTimeout(() => resolve(null), 3000);
          return;
        }
      } catch (e) { /* 落入 webpack5 尝试 */ }
      try {
        for (const k in window) {
          if (k.indexOf("webpackChunk") === 0 && window[k] && typeof window[k].push === "function") {
            let req = null;
            window[k].push([
              ["__chushi_lyric_" + Date.now()],
              {},
              function (r0, r1) {
                if (typeof r0 === "function") req = r0;
                else if (typeof r1 === "function") req = r1;
              },
            ]);
            resolve(req);
            return;
          }
        }
      } catch (e) { /* 忽略 */ }
      resolve(null);
    });
  }
  function findModule(req, filter) {
    try {
      const cache = req && req.c;
      if (!cache) return null;
      for (const id in cache) {
        const mod = cache[id];
        const ex = mod && mod.exports;
        if (!ex) continue;
        const target = ex && ex.default ? ex.default : ex;
        try { if (filter(target)) return target; } catch (e) { /* 继续 */ }
      }
    } catch (e) { /* 忽略 */ }
    return null;
  }
  (async function findStore() {
    for (let i = 0; i < 50 && !disposed; i++) {
      const req = await captureWebpackRequire();
      if (req) {
        const dva = findModule(req, (ex) =>
          ex && typeof ex === "object" && ex.a && typeof ex.a.getStore === "function"
        );
        if (dva && dva.a && dva.a.inited && dva.a.app && dva.a.app._store) {
          store = dva.a.app._store;
          log("dva Redux store 已获取");
          /* 切歌即触发歌词流程 */
          try {
            let lastTrackId = null;
            store.subscribe(function () {
              try {
                const p = store.getState().playing || {};
                const tid = p.resourceTrackId || p.onlineResourceId || null;
                if (tid !== lastTrackId) {
                  lastTrackId = tid;
                  lastProgressMs = 0;
                  pushState(true).catch(() => {});
                  ensureLyric();
                }
              } catch (e) { /* 忽略 */ }
            });
          } catch (e) { /* 忽略 */ }
          break;
        }
      }
      await sleep(400);
    }
    if (!store) warn("未找到 Redux store，运行于媒体元素降级模式（无 songId 时歌词不可用）");
  })();

  /* ---------- 歌词 ---------- */
  const lyricCache = new Map();   // songId -> payload
  let curLyricSongId = 0;
  let lyricInflight = false;
  const CACHE_LS_KEY = "chushi-lyric-cache";
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_LS_KEY) || "[]");
    if (Array.isArray(saved)) for (const [k, v] of saved) lyricCache.set(k, v);
  } catch (e) { /* 缓存坏则重建 */ }
  function saveCache() {
    try {
      while (lyricCache.size > 8) lyricCache.delete(lyricCache.keys().next().value);
      localStorage.setItem(CACHE_LS_KEY, JSON.stringify(Array.from(lyricCache.entries()).slice(-8)));
    } catch (e) { /* 忽略 */ }
  }

  /* klyric JSON → yrc 同构文本：[start,dur](s,d,0)字(s,d,0)字… */
  function klyricToYrcText(klyricStr) {
    try {
      const k = JSON.parse(klyricStr);
      const lines = (k && k.lyric) || [];
      return lines.map((ln) => {
        const parts = (ln.c || []).map((w) => {
          const tx = String(w.tx || "");
          const ws = Math.round((ln.t || 0));
          return tx ? `(${ws},${Math.max(1, ln.d || 1)},0)${tx}` : "";
        }).join("");
        return `[${Math.round(ln.t || 0)},${Math.max(1, ln.d || 1)}]` + parts;
      }).join("\n");
    } catch (e) { return ""; }
  }

  async function fetchLyricEapi(songId) {
    const apiPath = "/api/song/lyric/v1";
    const attempt = async (yv) => {
      const params = eapiParams(apiPath, {
        id: String(songId), cp: false, radio: false,
        cv: 0, kv: 0, tv: 0, lv: 0, rv: 0, st: 0, yv: yv,
      });
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      try {
        const r = await fetch("https://interface3.music.163.com/eapi" + apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "params=" + params,
          signal: ctl.signal,
        });
        clearTimeout(t);
        if (!r || !r.ok) return null;
        return await r.json();
      } catch (e) { clearTimeout(t); return null; }
    };
    let j = await attempt(1);
    if (!j || !(j.yrc && j.yrc.lyric)) j = await attempt(-1);
    if (!j) return null;
    const yrc = (j.yrc && j.yrc.lyric) || "";
    const ytlrc = (j.ytlrc && j.ytlrc.lyric) || "";
    let krc = "";
    if (!yrc && j.klyric && j.klyric.lyric) krc = klyricToYrcText(j.klyric.lyric);
    return {
      yrc, ytlrc,
      lrc: (j.lrc && j.lrc.lyric) || "",
      tlyric: (j.tlyric && j.tlyric.lyric) || "",
      source: yrc ? "eapi-yrc" : krc ? "eapi-klyric" : "eapi-lrc",
      _krcText: krc,
    };
  }

  function channelCallLyric(songId) {
    return new Promise((resolve) => {
      try {
        if (!window.channel || typeof window.channel.call !== "function") return resolve(null);
        window.channel.call("track.lyric.getinfo", function (err, res) {
          try {
            if (err || !res) return resolve(null);
            resolve({
              yrc: "", ytlrc: "",
              lrc: (res.lrc && res.lrc.lyric) || "",
              tlyric: (res.tlyric && res.tlyric.lyric) || "",
              source: "channel-lrc",
              _krcText: "",
            });
          } catch (e) { resolve(null); }
        }, { id: String(songId), tv: -1, lv: -1, rv: -1, kv: -1 });
        setTimeout(() => resolve(null), 6000);
      } catch (e) { resolve(null); }
    });
  }

  async function fetchLyricPlain(songId) {
    try {
      const r = await fetch(`https://music.163.com/api/song/lyric?os=pc&id=${songId}&lv=-1&kv=-1&tv=-1`, { method: "GET" });
      if (!r || !r.ok) return null;
      const j = await r.json();
      if (!j) return null;
      return {
        yrc: "", ytlrc: "",
        lrc: (j.lrc && j.lrc.lyric) || "",
        tlyric: (j.tlyric && j.tlyric.lyric) || "",
        source: "plain-lrc",
        _krcText: "",
      };
    } catch (e) { return null; }
  }

  async function ensureLyric() {
    if (lyricInflight || disposed) return;
    const snap = buildSnapshot();
    const song = snap.song;
    if (!song || !song.id) return;
    const songId = song.id;
    if (songId === curLyricSongId) return;
    lyricInflight = true;
    curLyricSongId = songId;
    try {
      let payload = lyricCache.get(songId) || null;
      if (!payload) {
        payload = await fetchLyricEapi(songId);
        const wordOk = payload && (payload.yrc || payload._krcText);
        if (!wordOk) {
          const c2 = await channelCallLyric(songId);
          if (c2 && (c2.lrc || c2.tlyric)) payload = c2;
          else {
            const c3 = await fetchLyricPlain(songId);
            if (c3 && (c3.lrc || c3.tlyric)) payload = c3;
            else if (payload && (payload.lrc || payload.tlyric)) payload = payload;
            else payload = null;
          }
        }
      }
      if (!payload) { warn("歌词获取失败 songId=", songId); return; }
      const finalPayload = {
        songId, title: song.name || "", artist: (song.artists || []).join("/"),
        yrc: payload.yrc || payload._krcText || "",
        ytlrc: payload.ytlrc || "",
        lrc: payload.lrc || "",
        tlyric: payload.tlyric || "",
        source: payload.source || "",
      };
      if (!finalPayload.yrc && !finalPayload.lrc) { log("该曲目无歌词", songId); return; }
      lyricCache.set(songId, finalPayload);
      saveCache();
      const ok = await post("/api/plugin/lyric", finalPayload);
      log("歌词已推送", songId, finalPayload.source, ok ? "" : "(桥不可达，稍后随心跳重试)");
      if (!ok) lyricRetryPayload = finalPayload;
    } finally {
      lyricInflight = false;
    }
  }
  /* 桥暂时不可达时暂存，心跳恢复后补推 */
  let lyricRetryPayload = null;
  setInterval(async () => {
    if (lyricRetryPayload && !disposed) {
      const ok = await post("/api/plugin/lyric", lyricRetryPayload);
      if (ok) { lyricRetryPayload = null; }
    }
  }, 5000);
  /* v1.4.0 歌词自愈：桥心跳应答 needLyric=<songId>（桥重启丢词）时补推。
     有缓存直接补推；缓存也没有（极端：刚清库）则交给 ensureLyric 拉取。
     curLyricSongId 相同的早退不拦这里——补推走的是独立通道。 */
  function rePushLyric(songId) {
    try {
      if (!songId || disposed || lyricInflight) return;
      const payload = lyricCache.get(songId) || null;
      if (payload) {
        post("/api/plugin/lyric", payload).then((ok) => { if (ok) log("桥缺词已补推", songId); }).catch(() => {});
      } else {
        ensureLyric().catch(() => {});
      }
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 配置面（NCM 插件管理器） ---------- */
  try {
    plugin.onConfig(function (tools) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "font-size:12px;line-height:1.8;";
      const info = document.createElement("div");
      info.innerText = `初始歌词源 ${PLUGIN_VERSION} — 给「初始」SMTC 音乐面板提供逐字歌词与精确进度（桥端口须与 SMTC 桥一致）`;
      const row = document.createElement("div");
      const label = document.createElement("span");
      label.innerText = "桥端口（重启网易云生效，默认 20754）: ";
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
      wrap.appendChild(row);
      return wrap;
    });
  } catch (e) { /* 配置面非关键 */ }

  /* ---------- 启动 ---------- */
  log("歌词源就绪 v" + PLUGIN_VERSION + "（→ " + BRIDGE + "）");
  await pushState(true).catch(() => {});
  await ensureLyric().catch(() => {});
  setInterval(() => { ensureLyric().catch(() => {}); }, 4000);

  try {
    window.__chushiLyricSource = {
      version: PLUGIN_VERSION,
      hasStore: () => !!store,
      snapshot: buildSnapshot,
      currentLyricSongId: () => curLyricSongId,
      lastSeekAck: () => lastSeekAck,
      bridge: () => ({ deployed: bridgeDeployed, running: bridgeRunningVer, spawnFails: bridgeSpawnFails }),
    };
  } catch (e) { /* 忽略 */ }
})();
