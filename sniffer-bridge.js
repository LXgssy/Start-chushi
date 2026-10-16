/* ============================================================================
 * 「初始」资源嗅探页面桥 sniffer-bridge v3（v8.7.112，+缓存抓取数据面）
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
    /* 嗅探总关：捕获态与已攒数据一并拆（浮窗面板重开时 info() 为空态） */
    catchClear();
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
    try {
      var base = catchSanitize(document.title);
      var multi = catchTracks.filter(function (t) { return t && t.chunks.length; }).length > 1;
      for (var i = 0; i < catchTracks.length; i++) {
        var t = catchTracks[i];
        if (!t || !t.chunks.length) continue;
        var mime = (t.mime || "").split(";")[0].trim().toLowerCase();
        var blob = new Blob(t.chunks, { type: mime || "application/octet-stream" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = base + (multi ? "-" + catchTrackLabel(t.mime) : "") + "." + catchExtOf(t.mime);
        document.documentElement.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function (u) { try { URL.revokeObjectURL(u); } catch (e2) { /* noop */ } }, 30000, url);
        saved++;
      }
    } catch (e) { /* noop */ }
    return saved;
  }

  /* 同世界直达 API（sniffer-float.js 与本桥同 ISOLATED world，点击时直调；
     桥后于浮窗装载也不碍事——浮窗只在事件里取） */
  if (!optOut()) {
    window.__chushiCatchApi = {
      info: catchInfo,
      toggle: function () { catchSetArm(!catchOn); return catchOn; },
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
        if (!catchOn) return;                    /* 未开捕获：分段零驻留 */
        var ci = Number(d.idx) || 0;
        var tr = catchTracks[ci];
        if (!tr) { tr = { mime: "", chunks: [], size: 0 }; catchTracks[ci] = tr; }
        var n = d.data && d.data.byteLength ? d.data.byteLength : 0;
        if (!n) return;
        if (catchTotal + n > CATCH_MAX_BYTES) {
          catchSetArm(false);
          catchDone = true;
          catchNote = "已达 1GB 容量上限，捕获自动停止";
          try {
            window.dispatchEvent(new CustomEvent("chushi-catch-state", { detail: catchInfo() }));
          } catch (e) { /* noop */ }
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
