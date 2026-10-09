/* ============================================================================
 * 「初始」资源嗅探页面桥 sniffer-bridge v2（v8.7.66，嗅探机制整体重写）
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

  /* ------------------------------------------------ 门控（属性即开关） */
  function arm(on) {
    sniffOn = !!on;
    try {
      if (sniffOn) document.documentElement.setAttribute("data-chushi-sniff", "1");
      else document.documentElement.removeAttribute("data-chushi-sniff");
    } catch (e) { /* noop */ }
    if (sniffOn) { scanSoon(); sweep(); }
    else {
      seen = []; seenSet.clear(); pending = []; mseMimes.clear();
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
