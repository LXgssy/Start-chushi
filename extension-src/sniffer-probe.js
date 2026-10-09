/* ============================================================================
 * 「初始」资源嗅探主世界探针 sniffer-probe v2（v8.7.66，嗅探机制整体重写）
 * ----------------------------------------------------------------------------
 * 方案来源：Ghost-Downloader-3 browser_extension 的 MSE Probe（page-media/
 * attribution/mse-probe.ts，参照 cat-catch 拦截布局）——在页面主世界挂钩
 * 媒体数据流的四个必经入口，把「哪个 URL 在喂播放器」以轻量信号形式上报，
 * 只发信号不缓存数据：
 *   1. URL.createObjectURL  —— MediaSource 实例建 blob URL 即报（MSE 播放器
 *      造册；blob 本身不可下载，价值在标记「本页有 MSE 会话」）；
 *   2. MediaSource.addSourceBuffer —— 记 mimeType（video/mp4;codecs=...
 *      是 DASH 音视频轨道的唯一判据，B 站 da3 格式音视频同 trackId 段，
 *      只有 MSE 侧 mime 能分）+ 包一层 appendBuffer 报缓冲追加；
 *   3. fetch —— 每个完成的响应报 {url, mime}；小响应（≤2MB）窥首块，
 *      0x23 '#'+#EXTM3U 即 HLS 播放列表（服务器常给泛型 MIME，
 *      只有内容能实锤）；
 *   4. XMLHttpRequest —— open 记 URL、send 挂 loadend，同 fetch 面报
 *      {url, mime}；文本响应直接查 #EXTM3U。
 *
 * 跨世界通道：window.postMessage({__chushiSniffSignal:true,...}) →
 *   ISOLATED world 的 sniffer-bridge.js（分类/去重/转发 SW）。与 GD3 的
 *   attribution-signal 同构：两端各持同名字符串约定，不共享运行时对象。
 *
 * 门控律（成本零余量）：探针在 document_start 无条件注入（GD3 同款），
 *   但钩子内每次上报前查 documentElement 的 data-chushi-sniff 属性——
 *   属性由桥（ISOLATED，可读 chrome.storage）按 snifferOn 开关设置，
 *   关闭态零 postMessage、零响应窥探，钩子包装开销可忽略。
 *   storage 异步读取的空窗期（页面加载头几毫秒）漏报可接受：新请求
 *   自然到来，桥 arm 时另触发一轮 DOM 扫描补图片面。
 *
 * 健壮性律（GD3 实证）：每个钩子独立 try/catch 安装——某些播放器冻结
 *   原型（frozen prototype）时包装抛错不能殃及其余钩子；包装全程透传
 *   原方法返回值，页面行为零改变。幂等律：顶层 __chushiSnifferProbe
 *   守卫（all_frames 每 frame 一份实例，互不干扰）。
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__chushiSnifferProbe) return;
  window.__chushiSnifferProbe = true;   /* 幂等守卫，兼作验证脚本特征锚 */

  function armed() {
    try { return document.documentElement.hasAttribute("data-chushi-sniff"); }
    catch (e) { return false; }
  }

  /* MAIN world → ISOLATED world（分离 frame 的 postMessage 抛错吞掉） */
  function post(signal) {
    if (!armed()) return;
    try {
      var msg = { __chushiSniffSignal: true };
      for (var k in signal) msg[k] = signal[k];
      window.postMessage(msg, "*");
    } catch (e) { /* noop */ }
  }

  /* ---------------------------------------------------------------- 1/2 MSE */
  var msIdSeq = 0;
  try {
    if (typeof window.URL === "function" && typeof window.URL.createObjectURL === "function" &&
        typeof window.MediaSource !== "undefined") {
      var origCreateObjectURL = window.URL.createObjectURL;
      window.URL.createObjectURL = function (obj) {
        var url = origCreateObjectURL.apply(this, arguments);
        try {
          if (typeof MediaSource !== "undefined" && obj instanceof MediaSource) {
            post({ kind: "mse", mime: "" });
          }
        } catch (e) { /* noop */ }
        return url;
      };
    }
  } catch (e) { /* noop */ }

  try {
    if (typeof window.MediaSource !== "undefined" &&
        MediaSource.prototype && typeof MediaSource.prototype.addSourceBuffer === "function") {
      var origAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
      MediaSource.prototype.addSourceBuffer = function (mimeType) {
        var sb = origAddSourceBuffer.apply(this, arguments);
        try {
          var mime = String(mimeType || "");
          post({ kind: "mse", mime: mime });
          try {
            /* appendBuffer 包装是 GD3 的缓冲追加确认信号；个别播放器把
               SourceBuffer 实例冻结，包装失败只降级为 addSourceBuffer 信号 */
            var origAppend = sb.appendBuffer;
            if (typeof origAppend === "function") {
              sb.appendBuffer = function (data) {
                post({ kind: "mse", mime: mime });
                return origAppend.apply(this, arguments);
              };
            }
          } catch (e) { /* frozen instance */ }
        } catch (e) { /* noop */ }
        return sb;
      };
    }
  } catch (e) { /* frozen prototype */ }

  /* ------------------------------------------------------------- 3 fetch */
  /* 小响应窥首块实锤 HLS：content-length ≤2MB 才窥（列表都是小文件，
     大流绝不 clone——tee 分支会被动缓冲）；Opaque 响应 clone 抛错吞掉 */
  function probeStream(response, url) {
    if (!armed()) return;
    try {
      var len = parseInt(response.headers.get("content-length") || "", 10);
      if (len > 2000000) return;
      var reader = response.clone().body && response.clone().body.getReader();
      if (!reader) return;
      reader.read().then(function (r) {
        try { reader.cancel(); } catch (e) { /* noop */ }
        if (!r || !r.value || r.value[0] !== 0x23) return;
        var text = "";
        try { text = new TextDecoder().decode(r.value); } catch (e) { return; }
        if (text.indexOf("#EXTM3U") !== 0) return;
        post({ kind: "hls", url: url, master: text.indexOf("#EXT-X-STREAM-INF") >= 0 });
      }).catch(function () { /* noop */ });
    } catch (e) { /* opaque response */ }
  }

  try {
    if (typeof window.fetch === "function") {
      var origFetch = window.fetch;
      window.fetch = function (input, init) {
        var url = "";
        try {
          if (typeof input === "string") url = input;
          else if (input && typeof input.url === "string") url = input.url;
          else url = String(input || "");
        } catch (e) { /* noop */ }
        var promise = origFetch.apply(this, arguments);
        try {
          promise.then(function (response) {
            try {
              var resolved = (response && response.url) || url;
              var mime = "";
              try { mime = (response && response.headers && response.headers.get("content-type")) || ""; } catch (e) { /* noop */ }
              post({ kind: "req", url: resolved, mime: mime });
              probeStream(response, resolved);
            } catch (e) { /* opaque */ }
          }).catch(function () { /* noop */ });
        } catch (e) { /* noop */ }
        return promise;
      };
    }
  } catch (e) { /* noop */ }

  /* --------------------------------------------------------------- 4 XHR */
  try {
    if (window.XMLHttpRequest && XMLHttpRequest.prototype) {
      var origOpen = XMLHttpRequest.prototype.open;
      var origSend = XMLHttpRequest.prototype.send;
      if (typeof origOpen === "function" && typeof origSend === "function") {
        XMLHttpRequest.prototype.open = function (method, url) {
          try { this.__chushiUrl = String(url || ""); } catch (e) { /* noop */ }
          return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
          var xhr = this;
          try {
            xhr.addEventListener("loadend", function () {
              try {
                var resolved = xhr.responseURL || xhr.__chushiUrl || "";
                if (!resolved) return;
                var mime = "";
                try { mime = xhr.getResponseHeader("content-type") || ""; } catch (e) { /* noop */ }
                post({ kind: "req", url: resolved, mime: mime });
                try {
                  if ((xhr.responseType === "" || xhr.responseType === "text") &&
                      typeof xhr.responseText === "string" &&
                      xhr.responseText.indexOf("#EXTM3U") === 0) {
                    post({ kind: "hls", url: resolved, master: xhr.responseText.indexOf("#EXT-X-STREAM-INF") >= 0 });
                  }
                } catch (e) { /* non-text responseType */ }
              } catch (e) { /* noop */ }
            });
          } catch (e) { /* noop */ }
          return origSend.apply(this, arguments);
        };
      }
    }
  } catch (e) { /* frozen prototype */ }
})();
