/* ============================================================================
 * 「初始」资源嗅探页面桥 sniffer-bridge v4（v8.7.115，+初始化段备胎+自动下载）
 * ----------------------------------------------------------------------------
 * v8.7.115 缓存抓取可播性根修（用户：「缓存抓取下载的文件没有 mp4 无法正常
 *   播放」）——两处断链：
 *   ①捕获中途开启：捕到的分段缺初始化段（fMP4 ftyp+moov / WebM EBML 头），
 *     合成文件无初始化段播放器不认。根修＝初始化段备胎库：探针在捕获未开
 *     期间也截每轨道头部追加（v4 探针），桥按轨道攒初始化段，box-walk 判
 *     攒齐（见 moof/styp/Cluster 边界即截断，或 1MB 顶）后回 __chushiSniff
 *     Ctrl/catch-init-done 让探针停；下载合成时 chunks[0] 非容器头即前缀
 *     补齐。缺备胎时诚实提示「缺初始化段，建议从头捕获」。
 *   ②嗅探晚开（页面播到一半才开开关）：catch-track 登记永远错过 → mime
 *     空 → 扩展名 bin。根修＝探针 catch-chunk 随行 mime（v4），桥侧兜底
 *     回填；仍无 mime 时从首块字节识别容器（ftyp/EBML/TS）定扩展名。
 * v8.7.115 缓存完成自动下载开关（用户指令）：chrome.storage.local
 *   snifferCatchAutoDl（全局偏好），完成点（endOfStream/手动停止且已有
 *   数据/1GB 顶）读开关命中即自动合成下载，备注经状态事件推浮窗 toast。
 * ----------------------------------------------------------------------------
 * v8.7.112 缓存抓取（能力对齐猫抓 cat-catch 的 catch-script/catch.js，
 *   实现为本仓自有代码）：探针在捕获态（data-chushi-catch 属性）下把
 *   appendBuffer 分段拷贝经 postMessage 送来，这里按轨道攒块；下载在
 *   本世界合成 Blob 直下（点击手势在本世界，a[download] 无激活丢失）。
 *   同世界 API：sniffer-float.js 与本桥同 ISOLATED world，直接调
 *   window.__chushiCatchApi（info/toggle/restart/download）；状态变更
 *   另发 CustomEvent chushi-catch-state（500ms 节流）给浮窗刷尺寸。
 *   容量律：整页 1GB 硬顶（猫抓同量级），到顶自动停捕获防 OOM。
 *   威胁模型：页面 postMessage 可伪造同形消息（与嗅探信号同一暴露面，
 *   猫抓同款）——伪造至多污染用户主动在该页发起的捕获，可接受。
 * v8.7.112 避免抓取名单（README《版权保护与拒绝抓取声明》代码侧落点）：
 *   命中站点整帧不武装——探针信号收不到、DOM 扫描不跑、缓存抓取不可用；
 *   SW 侧 ext-bg.js 另有同源名单拦 webRequest 通道。
 * ----------------------------------------------------------------------------
 * 定位：探针（sniffer-probe.js，MAIN world）与 SW 数据面（ext-bg.js）之间的
 * ISOLATED world 桥——Ghost-Downloader-3 的 Attribution Engine 信号消费端
 * 思路 + 初始自有的门控/分类/图片扫描：
 *   1. 门控：桥可读 chrome.storage.local.snifferOn（主世界读不到），据此
 *      设置/摘除 documentElement 的 data-chushi-sniff 属性；探针每次上报前
 *      查该属性，关闭态探针零动作。onChanged 热跟随（开启/关闭即拍生效，
 *      开启时补一轮 DOM 扫描——页面早已加载完的图片也能收进来）。
 *   2. 分类（cat-catch 规则表，移植自 GD3 shared/cat-catch.ts）：视频/音频
 *      大扩展名表 + HLS/DASH MIME 集 + image/* + URL 查询参数 mime= 兜底
 *      （googlevideo 系）。SW 侧保留一份同源分类供 webRequest 通道用。
 *   3. MSE 会话助推（GD3 核心洞察）：addSourceBuffer 报来的 mimeType
 *      （带 codecs）给页面盖「媒体活跃」戳（60s 衰减）——窗口内的
 *      fetch/XHR 无扩展名 octet-stream 一律判视频分段（抖音/快手式
 *      无扩展名分段的唯一抓手）。
 *   4. DOM 图片扫描（GD3 的 DOM-side discovery / capturePageResource 路）：
 *      img（naturalWidth 或版面 ≥200px 过门，图标不淹列表）+ video poster
 *      + video/source 显式 src。DOMContentLoaded / load / MutationObserver
 *      （防抖 1.5s，懒加载图热收）三触发，armed 才扫。
 *   5. 转发纪律：分类命中才 sendMessage（不唤醒 SW 于无用请求）；同 URL
 *      去重（页内 seen 表，FIFO 400）；批量合并（500ms 窗）——
 *      {type:"sniffer-page-media", items:[...]} → SW 按标签页归集。
 * 帧律：all_frames 注入——iframe 里的播放器（B 站外嵌等）同样有桥，
 *   sender.tab.id 由浏览器统一归属顶层标签页；浮球只在顶层 frame。
 * 幂等律：顶层 __chushiSnifferBridge 守卫。
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__chushiSnifferBridge) return;
  window.__chushiSnifferBridge = true;

  var sniffOn = false;
  var seen = [];                        /* FIFO：已转发 URL（去重） */
  var seenSet = new Set();
  var SEEN_MAX = 400;
  var pending = [];                     /* 待转发条目（500ms 批量窗） */
  var flushTimer = 0;
  var scanTimer = 0;
  var mseMimes = new Map();             /* mimeType -> 衰减时刻（ms） */
  var MSE_TTL_MS = 60000;

  /* ------------------------------------------- 避免抓取名单（v8.7.112）---- */
  /* README《版权保护与拒绝抓取声明》的代码侧落点：站点按声明流程提 Issue
     后把主机名（不带 www.）加入本表，命中即整帧不武装（探针信号收不到、
     DOM 扫描不跑、缓存抓取不可用）；webRequest 通道由 ext-bg.js 同源名单拦。 */
  var OPT_OUT_HOSTS = [];
  function optOut() {
    try {
      return OPT_OUT_HOSTS.indexOf(location.hostname.replace(/^www\./, "")) >= 0 ||
        OPT_OUT_HOSTS.indexOf(location.hostname) >= 0;
    } catch (e) { return false; }
  }

  /* ------------------------------------------------ 门控（属性即开关） */
  function arm(on) {
    sniffOn = !!on;
    try {
      if (sniffOn && !optOut()) document.documentElement.setAttribute("data-chushi-sniff", "1");
      else document.documentElement.removeAttribute("data-chushi-sniff");
    } catch (e) { /* noop */ }
    if (sniffOn && !optOut()) { scanSoon(); sweep(); }
    else {
      seen = []; seenSet.clear(); pending = []; mseMimes.clear();
      if (!sniffOn) catchTearDown();   /* 嗅探总关：缓存抓取一并拆 */
    }
  }
  try {
    chrome.storage.local.get("snifferOn", function (o) { arm(!!(o && o.snifferOn)); });
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === "local" && ch.snifferOn) arm(!!ch.snifferOn.newValue);
    });
  } catch (e) { /* noop */ }

  /* ------------------------------------------------------ cat-catch 规则 */
  var VIDEO_EXT = { "3gp":1, asf:1, avi:1, divx:1, f4v:1, flv:1, hlv:1, mkv:1,
    mov:1, mp4:1, mpeg:1, mpeg4:1, movie:1, ogv:1, ts:1, vid:1, webm:1, wmv:1 };
  var AUDIO_EXT = { aac:1, acc:1, flac:1, m4a:1, mp3:1, ogg:1, opus:1, wav:1,
    weba:1, wma:1 };
  var IMAGE_EXT = { jpg:1, jpeg:1, png:1, gif:1, webp:1, bmp:1, avif:1, heic:1 };
  var DOC_EXT = { doc:1, docx:1, xls:1, xlsx:1, ppt:1, pptx:1, txt:1, epub:1,
    apk:1, csv:1, pdf:1 };
  var ARCHIVE_EXT = { zip:1, rar:1, "7z":1, tar:1, gz:1, iso:1, bz2:1, xz:1 };

  function extOf(url) {
    try {
      var m = url.split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i);
      return m ? m[1].toLowerCase() : "";
    } catch (e) { return ""; }
  }

  /* URL 查询参数 mime=（googlevideo 系）：mime=video%2Fmp4 */
  function mimeParamOf(url) {
    try {
      var v = new URL(url).searchParams.get("mime");
      return v ? v.toLowerCase() : "";
    } catch (e) { return ""; }
  }

  function isHlsMime(mime) {
    return mime === "application/vnd.apple.mpegurl" ||
      mime === "application/x-mpegurl" || mime === "application/mpegurl" ||
      mime === "application/octet-stream-m3u8" || /\/(vnd\.apple\.mpegurl|x-mpegurl|mpegurl|octet-stream-m3u8)$/.test(mime);
  }

  /* 桥侧分类：返回类型或 null（媒体活跃窗口把无扩展名 octet-stream 助推为
     视频分段——GD3 request_completed × mse_buffer_appended 关联的轻量版） */
  function classify(url, mime, detailsType) {
    mime = (mime || "").split(";")[0].trim().toLowerCase();
    var ext = extOf(url);
    if (ext === "m3u8" || ext === "m3u" || ext === "mpd" || isHlsMime(mime) ||
        mime === "application/dash+xml") return "stream";
    if (!mime && !ext) mime = mimeParamOf(url);
    if (mime.indexOf("video/") === 0) return "video";
    if (ext === "m4s") return "video";                 /* DASH 分段：B 站主力 */
    if (mime.indexOf("audio/") === 0 || mime === "application/ogg") return "audio";
    if (VIDEO_EXT[ext]) return "video";
    if (AUDIO_EXT[ext]) return "audio";
    if (mime === "video/mp2t" || (ext === "" && mime === "application/octet-stream" &&
        (detailsType === "media" || mseActive()))) return "video";
    if (mime === "application/pdf" || ext === "pdf") return "pdf";
    if (ARCHIVE_EXT[ext] || mime.indexOf("zip") >= 0 || mime.indexOf("compressed") >= 0) return "archive";
    if (DOC_EXT[ext] || mime.indexOf("officedocument") >= 0 || mime.indexOf("msword") >= 0) return "doc";
    if (mime.indexOf("image/") === 0 || IMAGE_EXT[ext]) return "image";
    return null;
  }

  /* ------------------------------------- 缓存抓取数据面（v8.7.112）------- */
  var catchOn = false;
  var catchDone = false;
  var catchNote = "";
  var catchTracks = [];                /* 轨道号 → {mime, chunks:[], size} */
  var catchTotal = 0;
  var CATCH_MAX_BYTES = 1073741824;    /* 1GB 硬顶：到顶自动停捕获防 OOM */
  var catchNotifyTimer = 0;
  /* v8.7.115 初始化段备胎库：轨道号 → {parts:[], size, complete, initBytes}
     探针在捕获未开期间转交的头部追加在这里攒；box-walk 判齐（见 moof/styp
     /Cluster 边界即截断）后回 __chushiSniffCtrl/catch-init-done 让探针停；
     下载合成时 chunks[0] 非容器头即取 initBytes 前缀补齐。 */
  var catchInit = {};
  var CATCH_INIT_MAX = 1048576;

  function initJoin(st) {
    var buf = new Uint8Array(st.size);
    var o = 0;
    for (var i = 0; i < st.parts.length; i++) {
      buf.set(new Uint8Array(st.parts[i]), o);
      o += st.parts[i].byteLength;
    }
    return buf;
  }

  function initMarkDone(st, idx, endBytes) {
    st.complete = true;
    st.initBytes = endBytes;
    try {
      window.postMessage({ __chushiSniffCtrl: true, kind: "catch-init-done", idx: idx }, "*");
    } catch (e) { /* noop */ }
  }

  /* 初始化段攒齐判定：fMP4 顶层 box-walk（遇 moof/styp 即初始化段终点）；
     WebM 找首个 Cluster 元素 ID（1F 43 B6 75）；TS 自包含直接判齐。
     未判齐返回 false（探针继续转交，1MB 顶后强停）。 */
  function initScan(st, idx) {
    try {
      var buf = initJoin(st);
      var total = buf.length;
      if (total >= 8) {
        var tag4 = String.fromCharCode(buf[4], buf[5], buf[6], buf[7]);
        if (buf[0] === 0x47) { initMarkDone(st, idx, total); return true; }
        if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) {
          for (var p = 0; p <= total - 4; p++) {
            if (buf[p] === 0x1F && buf[p + 1] === 0x43 && buf[p + 2] === 0xB6 && buf[p + 3] === 0x75) {
              initMarkDone(st, idx, p); return true;
            }
          }
          return false;
        }
        if (tag4 === "ftyp") {
          var off = 0;
          while (off + 8 <= total) {
            var size = ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
            var type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
            if (type === "moof" || type === "styp") { initMarkDone(st, idx, off); return true; }
            if (size < 8) return false;
            off += size;
          }
          return false;
        }
      }
    } catch (e) { /* noop */ }
    return false;
  }

  /* 下载合成用：首块缺初始化段时取备胎前缀（initBytes 截断防备胎尾混入
     媒体分段）；返回 null=无需补，数组=前缀块，"missing"=缺备胎诚实提示 */
  function initPrefixFor(ti, firstChunk) {
    try {
      var u8 = firstChunk instanceof ArrayBuffer
        ? new Uint8Array(firstChunk)
        : new Uint8Array(firstChunk.buffer, firstChunk.byteOffset, firstChunk.byteLength);
      if (u8.length < 8) return null;
      var tag4 = String.fromCharCode(u8[4], u8[5], u8[6], u8[7]);
      if (tag4 === "ftyp") return null;
      if (u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) return null;
      if (u8[0] === 0x47) return null;
      if (tag4 === "moof" || tag4 === "styp") {
        var st = catchInit[ti];
        if (st && st.complete && st.initBytes > 0) {
          var parts = [];
          var left = st.initBytes;
          for (var i = 0; i < st.parts.length && left > 0; i++) {
            var b = st.parts[i];
            if (left >= b.byteLength) { parts.push(b); left -= b.byteLength; }
            else { parts.push(b.slice(0, left)); left = 0; }
          }
          return parts.length ? parts : "missing";
        }
        return "missing";
      }
    } catch (e) { /* noop */ }
    return null;
  }

  /* 容器识别（mime 缺席时的扩展名兑底）：ftyp→mp4 / EBML→webm / 0x47→ts */
  function catchContainerOf(firstChunk) {
    try {
      var u8 = firstChunk instanceof ArrayBuffer
        ? new Uint8Array(firstChunk)
        : new Uint8Array(firstChunk.buffer, firstChunk.byteOffset, firstChunk.byteLength);
      if (u8.length < 12) return "";
      var tag4 = String.fromCharCode(u8[4], u8[5], u8[6], u8[7]);
      if (tag4 === "ftyp") return "mp4";
      if (u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) return "webm";
      if (u8[0] === 0x47) return "ts";
    } catch (e) { /* noop */ }
    return "";
  }

  function catchInfo() {
    var filled = 0;
    for (var i = 0; i < catchTracks.length; i++) {
      if (catchTracks[i] && catchTracks[i].size > 0) filled++;
    }
    return { on: catchOn, done: catchDone, total: catchTotal, tracks: filled, note: catchNote };
  }

  function catchNotify() {
    if (catchNotifyTimer) return;
    catchNotifyTimer = setTimeout(function () {
      catchNotifyTimer = 0;
      try {
        window.dispatchEvent(new CustomEvent("chushi-catch-state", { detail: catchInfo() }));
      } catch (e) { /* noop */ }
    }, 500);
  }

  function catchSetArm(on) {
    catchOn = !!on;
    catchNote = "";
    if (catchOn) catchDone = false;
    try {
      if (catchOn) document.documentElement.setAttribute("data-chushi-catch", "1");
      else document.documentElement.removeAttribute("data-chushi-catch");
    } catch (e) { /* noop */ }
    catchNotify();
  }

  function catchClear() {
    catchTracks = [];
    catchTotal = 0;
    catchDone = false;
    catchNotify();
  }

  function catchTearDown() {
    /* 嗅探总关：捕获态、已攒数据与初始化段备胎一并拆（浮窗面板重开时
       info() 为空态） */
    catchClear();
    catchInit = {};
    catchSetArm(false);
  }

  function catchSeekToStart() {
    /* 「从头捕获」：清块 + 回跳视频到 0 重播（ISOLATED world 共享 DOM 直调） */
    try {
      var vids = document.querySelectorAll("video");
      for (var i = 0; i < vids.length; i++) {
        try { vids[i].currentTime = 0; } catch (e) { /* noop */ }
      }
    } catch (e) { /* noop */ }
  }

  var CATCH_EXT = {
    "video/mp4": "mp4", "video/webm": "webm", "video/mp2t": "ts",
    "video/ogg": "ogv", "video/quicktime": "mov", "video/x-matroska": "mkv",
    "audio/mp4": "m4a", "audio/mp4a-latm": "m4a", "audio/mpeg": "mp3",
    "audio/aac": "aac", "audio/ogg": "ogg", "audio/flac": "flac",
    "audio/x-flac": "flac", "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/webm": "webm", "audio/opus": "opus"
  };

  function catchExtOf(mime) {
    var base = (mime || "").split(";")[0].trim().toLowerCase();
    if (CATCH_EXT[base]) return CATCH_EXT[base];
    var sub = (base.split("/")[1] || "").replace(/[^a-z0-9]/g, "");
    return sub || "bin";
  }

  function catchTrackLabel(mime) {
    var base = (mime || "").split(";")[0].trim().toLowerCase();
    if (base.indexOf("video/") === 0) return "视频";
    if (base.indexOf("audio/") === 0) return "音频";
    return "轨道";
  }

  function catchSanitize(s) {
    var name = String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
    return (name || "捕获数据").slice(0, 80);
  }

  function catchDownload() {
    var saved = 0;
    var warn = "";
    try {
      var base = catchSanitize(document.title);
      var filled = catchTracks.filter(function (t) { return t && t.chunks.length; });
      var multi = filled.length > 1;
      for (var i = 0; i < catchTracks.length; i++) {
        var t = catchTracks[i];
        if (!t || !t.chunks.length) continue;
        var mime = (t.mime || "").split(";")[0].trim().toLowerCase();
        /* v8.7.115 初始化段补齐：首块非容器头（moof/styp 开头）即前缀备胎 */
        var prefix = initPrefixFor(i, t.chunks[0]);
        if (prefix === "missing" && !warn) {
          warn = "部分文件缺初始化段（可能无法播放），建议「从头捕获」后重播视频再下载";
        }
        var parts = Array.isArray(prefix) ? prefix.concat(t.chunks) : t.chunks;
        var blob = new Blob(parts, { type: mime || "application/octet-stream" });
        var url = URL.createObjectURL(blob);
        var ext = catchExtOf(t.mime);
        if (!t.mime || ext === "bin") {
          ext = catchContainerOf(t.chunks[0]) || "bin";   /* mime 缺席：字节识别容器 */
        }
        var a = document.createElement("a");
        a.href = url;
        a.download = base + (multi ? "-" + catchTrackLabel(t.mime) : "") + "." + ext;
        document.documentElement.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function (u) { try { URL.revokeObjectURL(u); } catch (e2) { /* noop */ } }, 30000, url);
        saved++;
      }
    } catch (e) { /* noop */ }
    return { saved: saved, warn: warn };
  }

  /* v8.7.115 缓存完成自动下载：读全局偏好（chrome.storage.local
     snifferCatchAutoDl），命中且有数据即自动合成下载；结果经备注
     通道（chushi-catch-state → 浮窗 toast 去重）告知用户。 */
  function catchMaybeAutoDownload() {
    try {
      chrome.storage.local.get("snifferCatchAutoDl", function (o) {
        if (!o || !o.snifferCatchAutoDl) return;
        if (catchTotal <= 0) return;
        var r = catchDownload();
        if (r.saved > 0) {
          catchNote = "捕获完成，已自动下载（" + r.saved + " 个文件）";
        } else if (r.warn) {
          catchNote = r.warn;
        }
        try {
          window.dispatchEvent(new CustomEvent("chushi-catch-state", { detail: catchInfo() }));
        } catch (e) { /* noop */ }
      });
    } catch (e) { /* noop */ }
  }

  /* 同世界直达 API（sniffer-float.js 与本桥同 ISOLATED world，点击时直调；
     桥后于浮窗装载也不碍事——浮窗只在事件里取） */
  if (!optOut()) {
    window.__chushiCatchApi = {
      info: catchInfo,
      /* v8.7.115 手动停止也算「捕获完成」：有数据且开了自动下载即下 */
      toggle: function () {
        catchSetArm(!catchOn);
        if (!catchOn && catchTotal > 0) catchMaybeAutoDownload();
        return catchOn;
      },
      restart: function () { catchClear(); catchSetArm(true); catchSeekToStart(); return true; },
      download: catchDownload,
    };
  }

  function mseActive() {
    var now = Date.now();
    var live = false;
    mseMimes.forEach(function (until, mime) {
      if (until <= now) mseMimes.delete(mime);
      else live = true;
    });
    return live;
  }

  /* ------------------------------------------------------ 信号消费与转发 */
  window.addEventListener("message", function (ev) {
    if (ev.source !== window || !sniffOn) return;
    var d = ev.data;
    if (!d || d.__chushiSniffSignal !== true) return;
    try {
      if (d.kind === "mse") {
        var mime = String(d.mime || "").toLowerCase();
        if (mime) mseMimes.set(mime, Date.now() + MSE_TTL_MS);
        else mseMimes.set("*", Date.now() + MSE_TTL_MS);
        return;
      }
      if (d.kind === "hls") { offer(String(d.url || ""), "", "stream"); return; }
      if (d.kind === "catch-track") {
        /* 轨道登记常备（不问捕获开关）：捕获中途开启也能接上后续分段 */
        var ti = Number(d.idx) || 0;
        if (!catchTracks[ti]) catchTracks[ti] = { mime: String(d.mime || ""), chunks: [], size: 0 };
        else if (d.mime && !catchTracks[ti].mime) catchTracks[ti].mime = String(d.mime);
        return;
      }
      if (d.kind === "catch-chunk") {
        var ci = Number(d.idx) || 0;
        var cm = String(d.mime || "");
        var tr = catchTracks[ci];
        if (!tr) { tr = { mime: cm, chunks: [], size: 0 }; catchTracks[ci] = tr; }
        else if (cm && !tr.mime) tr.mime = cm;    /* v8.7.115 嗅探晚开：mime 随行回填 */
        var n = d.data && d.data.byteLength ? d.data.byteLength : 0;
        if (!n) return;
        if (!catchOn) {
          /* v8.7.115 初始化段备胎：捕获未开也攒头部追加（box-walk 判齐即
             回流 catch-init-done 让探针停）；1MB 顶强停。此处零媒体分段
             驻留——判齐后的迟到块直接丢弃。 */
          var st = catchInit[ci];
          if (!st) { st = { parts: [], size: 0, complete: false, initBytes: 0 }; catchInit[ci] = st; }
          if (!st.complete) {
            st.parts.push(d.data);
            st.size += n;
            initScan(st, ci);                        /* 攒齐即内部回流 catch-init-done */
            if (!st.complete && st.size >= CATCH_INIT_MAX) {
              /* 超顶放弃：内容不可判齐时前缀不可信，置空并同样回流让探针停 */
              st.complete = true;
              st.initBytes = 0;
              try {
                window.postMessage({ __chushiSniffCtrl: true, kind: "catch-init-done", idx: ci }, "*");
              } catch (e) { /* noop */ }
            }
          }
          return;
        }
        if (catchTotal + n > CATCH_MAX_BYTES) {
          catchSetArm(false);
          catchDone = true;
          catchNote = "已达 1GB 容量上限，捕获自动停止";
          try {
            window.dispatchEvent(new CustomEvent("chushi-catch-state", { detail: catchInfo() }));
          } catch (e) { /* noop */ }
          catchMaybeAutoDownload();
          return;
        }
        tr.chunks.push(d.data);
        tr.size += n;
        catchTotal += n;
        catchNotify();
        return;
      }
      if (d.kind === "catch-eos") {
        if (!catchOn) return;
        catchDone = true;
        catchNotify();
        catchMaybeAutoDownload();   /* v8.7.115 播放器宣告到尾＝捕获完成 */
        return;
      }
      if (d.kind === "req") {
        var url = String(d.url || "");
        if (!/^https?:/i.test(url)) return;            /* blob:/data: SW 无法下载 */
        var type = classify(url, String(d.mime || ""), "");
        if (type === "image") return;                  /* 页面图走 DOM 扫描，XRH 小图不收 */
        if (type) offer(url, String(d.mime || ""), type);
      }
    } catch (e) { /* noop */ }
  });

  function offer(url, mime, type) {
    if (seenSet.has(url)) return;
    seenSet.add(url); seen.push(url);
    while (seen.length > SEEN_MAX) seenSet.delete(seen.shift());
    try {
      var u = new URL(url);
      var seg = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
      var name;
      try { name = decodeURIComponent(seg); } catch (e) { name = seg; }  /* 非法百分号编码容错 */
      pending.push({
        url: url,
        type: type,
        ext: extOf(url),
        name: name || u.hostname,
        size: 0,
        host: (u.hostname || "").replace(/^www\./, ""),
      });
    } catch (e) { return; }
    if (!flushTimer) flushTimer = setTimeout(flush, 500);
  }

  function flush() {
    flushTimer = 0;
    if (!sniffOn || !pending.length) { pending = []; return; }
    var items = pending; pending = [];
    try { chrome.runtime.sendMessage({ type: "sniffer-page-media", items: items }, function () { void chrome.runtime.lastError; }); }
    catch (e) { /* noop */ }
  }

  /* ------------------------------------------------------- DOM 图片扫描 */
  /* img：naturalWidth（已解码）或版面尺寸 ≥200px 过门——表情图/图标不淹列表；
     video poster 与 video/source 显式 http src 同收。每轮结果走同一 offer
     去重管线，重复扫描零重复转发。 */
  function scanNow() {
    if (!sniffOn) return;
    var candidates = [];
    try {
      var imgs = document.images || [];
      for (var i = 0; i < imgs.length && i < 600; i++) {
        var img = imgs[i];
        var src = img.currentSrc || img.src || "";
        if (!/^https?:/i.test(src)) continue;
        var w = img.naturalWidth || 0, h = img.naturalHeight || 0;
        if (w < 200 && h < 200) {
          var rect = img.getBoundingClientRect();
          if (rect.width < 200 && rect.height < 200) continue;
        }
        candidates.push({ url: src, mime: "", type: "image" });
      }
      var meds = document.querySelectorAll("video[poster], video[src], source[src]");
      for (var j = 0; j < meds.length && j < 100; j++) {
        var el = meds[j];
        var tag = el.tagName === "VIDEO" ? "video" : "source";
        if (tag === "video" && el.hasAttribute("poster")) {
          var poster = el.getAttribute("poster") || "";
          if (/^https?:/i.test(poster)) candidates.push({ url: poster, mime: "", type: "image" });
        }
        var vsrc = el.getAttribute("src") || "";
        if (/^https?:/i.test(vsrc)) {
          var t = tag === "video" ? classify(vsrc, "", "media") : classify(vsrc, "", "");
          if (t) candidates.push({ url: vsrc, mime: "", type: t });
        }
      }
    } catch (e) { /* noop */ }
    for (var k = 0; k < candidates.length; k++) {
      offer(candidates[k].url, candidates[k].mime, candidates[k].type);
    }
  }

  function scanSoon() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () { scanTimer = 0; scanNow(); }, 1200);
  }

  function sweep() {
    /* 懒加载观察：armed 期间新增 img/src 变更 → 防抖扫描（重复 offer 被去重） */
    if (!sniffOn || typeof MutationObserver === "undefined") return;
    try {
      var mo = new MutationObserver(function () { scanSoon(); });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "poster"] });
    } catch (e) { /* noop */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { if (sniffOn) { scanNow(); sweep(); } });
  } else if (sniffOn) {
    scanSoon(); sweep();
  }
  window.addEventListener("load", function () { if (sniffOn) scanNow(); });
})();
