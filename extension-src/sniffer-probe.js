/* ============================================================================
 * 「初始」资源嗅探主世界探针 sniffer-probe v4（v8.7.115，+初始化段备胎）
 * ----------------------------------------------------------------------------
 * v8.7.115 缓存抓取可播性根修：捕获中途开启时，捕获到的分段缺 fMP4/WebM
 *   初始化段（ftyp+moov / EBML 头）→ 合成文件无法播放。本版探针在「嗅探
 *   开启、捕获未开」时也把每轨道【首个 appendBuffer】拷贝转交（通常是
 *   初始化段，KB 量级，一次性成本）；桥在初始化段攒齐（box-walk 见
 *   moof/styp/Cluster 边界或 1MB 顶）后经 __chushiSniffCtrl 回流通道回
 *   catch-init-done，探针即停截留。打破 v8.7.112「未开捕获零拷贝」律的
 *   例外仅此一处，换来合成文件可播。
 *   同时 catch-chunk 信号随行 mime（闭包变量现成）：修「嗅探晚开→轨道
 *   登记缺席→mime 空→扩展名 bin」的断链（catch-track 只在 addSourceBuffer
 *   时发，错过即无 mime）。
 * ----------------------------------------------------------------------------
 * v8.7.112 缓存抓取（能力对齐猫抓 cat-catch 的 catch-script/catch.js，
 *   实现为本仓自有代码）：页面开启捕获态（桥设 data-chushi-catch 属性）
 *   期间，addSourceBuffer 登记【轨道号+mimeType】，appendBuffer 把分段
 *   【拷贝一份】postMessage 给桥（ISOLATED world）攒块——抓的是「播放器
 *   已缓冲的真实媒体数据」，各视频站 MSE 分段流的通用兑底下载方案。
 *   拷贝即转交（postMessage transfer 零二次拷贝），探针侧不驻留数据；
 *   未开捕获态零拷贝零转发，普通嗅探零增量。endOfStream 挂钩在捕获中
 *   报「捕获完成」信号。
 * ----------------------------------------------------------------------------
 * 方案来源：Ghost-Downloader-3 browser_extension 的 MSE Probe（page-media/
 * attribution/mse-probe.ts，参照 cat-catch 拦截布局）——在页面主世界挂钩
 * 媒体数据流的必经入口，把「哪个 URL 在喂播放器」以轻量信号形式上报，
 * 普通嗅探只发信号不缓存数据（v8.7.112 缓存抓取是唯一例外，见下）：
 *   1. URL.createObjectURL  —— MediaSource 实例建 blob URL 即报（MSE 播放器
 *      造册；blob 本身不可下载，价值在标记「本页有 MSE 会话」）；
 *   2. MediaSource.addSourceBuffer —— 记 mimeType（video/mp4;codecs=...
 *      是 DASH 音视频轨道的唯一判据，B 站 da3 格式音视频同 trackId 段，
 *      只有 MSE 侧 mime 能分）+ 包一层 appendBuffer 报缓冲追加；
 *      v8.7.112 缓存抓取态下另发轨道号登记与分段拷贝（catch-track /
 *      catch-chunk / catch-eos 三信号）；
 *   3. fetch —— 每个完成的响应报 {url, mime}；小响应（≤2MB）窥首块，
 *      0x23 '#'+#EXTM3U 即 HLS 播放列表（服务器常给泛型 MIME，
 *      只有内容能实锤）；
 *   4. XMLHttpRequest —— open 记 URL、send 挂 loadend，同 fetch 面报
 *      {url, mime}；文本响应直接查 #EXTM3U。
 *
 * 跨世界通道：window.postMessage({__chushiSniffSignal:true,...}) →
 *   ISOLATED world 的 sniffer-bridge.js（分类/去重/转发 SW + 缓存抓取
 *   攒块）。与 GD3 的 attribution-signal 同构：两端各持同名字符串约定，
 *   不共享运行时对象。
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

  function catchArmed() {
    try { return document.documentElement.hasAttribute("data-chushi-catch"); }
    catch (e) { return false; }
  }

  /* MAIN world → ISOLATED world（分离 frame 的 postMessage 抛错吞掉；
     transfer：ArrayBuffer 走转移零二次拷贝，分段的唯一大件通道） */
  function post(signal, transfer) {
    if (!armed()) return;
    try {
      var msg = { __chushiSniffSignal: true };
      for (var k in signal) msg[k] = signal[k];
      window.postMessage(msg, "*", transfer || undefined);
    } catch (e) { /* noop */ }
  }

  /* 缓存抓取分段截留：拷贝一份转交桥（原始 buffer 仍归播放器，页面行为
     零改变）。ArrayBuffer / TypedArray 双形态都接（播放器两种都传）。
     v8.7.115：mime 随行（轨道登记缺席时桥侧兜底）。 */
  function catchChunk(idx, data, mime) {
    if (!data) return;
    try {
      var copy = null;
      if (data instanceof ArrayBuffer) copy = data.slice(0);
      else if (ArrayBuffer.isView(data)) {
        copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      }
      if (!copy || !copy.byteLength) return;
      post({ kind: "catch-chunk", idx: idx, mime: mime || "", data: copy }, [copy]);
    } catch (e) { /* noop */ }
  }

  /* v8.7.115 初始化段备胎状态：每轨道只截「捕获未开期间」的头部追加，
     桥回 catch-init-done 即停（ISOLATED 桥 box-walk 判定攒齐）；
     桥缺席/未回流的兑底：单轨道 4MB 硬顶。 */
  var initDone = {};
  var INIT_HARD_CAP = 4194304;
  var initSentBytes = {};

  /* ---------------------------------------------------------------- 1/2 MSE */
  var msIdSeq = 0;
  var sbSeq = 0;               /* 缓存抓取轨道号：addSourceBuffer 顺序自增 */
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
          /* 缓存抓取轨道登记：每次 addSourceBuffer 都报（嗅探开着就报，
             桥侧常备轨道表——捕获中途开启也能接上后续分段） */
          var trackIdx = sbSeq++;
          if (armed()) post({ kind: "catch-track", idx: trackIdx, mime: mime });
          try {
            /* appendBuffer 包装是 GD3 的缓冲追加确认信号；个别播放器把
               SourceBuffer 实例冻结，包装失败只降级为 addSourceBuffer 信号。
               v8.7.112：捕获态下同时截留分段（拷贝转交，原始照传页面） */
            var origAppend = sb.appendBuffer;
            if (typeof origAppend === "function") {
              sb.appendBuffer = function (data) {
                post({ kind: "mse", mime: mime });
                if (catchArmed()) catchChunk(trackIdx, data, mime);
                else if (!initDone[trackIdx]) {
                  /* v8.7.115 初始化段备胎：捕获未开也截前几段（桥判齐即停） */
                  var n = data instanceof ArrayBuffer ? data.byteLength
                    : ArrayBuffer.isView(data) ? data.byteLength : 0;
                  initSentBytes[trackIdx] = (initSentBytes[trackIdx] || 0) + n;
                  if (initSentBytes[trackIdx] <= INIT_HARD_CAP) catchChunk(trackIdx, data, mime);
                  else initDone[trackIdx] = true;
                }
                return origAppend.apply(this, arguments);
              };
            }
          } catch (e) { /* frozen instance */ }
        } catch (e) { /* noop */ }
        return sb;
      };
    }
  } catch (e) { /* frozen prototype */ }

  /* endOfStream：播放器宣告所有轨道到尾——捕获中报「捕获完成」（猫抓
     catch.js 同款信号；个别播放器冻结原型时安装失败不影响其余钩子） */
  try {
    if (typeof window.MediaSource !== "undefined" &&
        MediaSource.prototype && typeof MediaSource.prototype.endOfStream === "function") {
      var origEOS = MediaSource.prototype.endOfStream;
      MediaSource.prototype.endOfStream = function () {
        try { if (catchArmed()) post({ kind: "catch-eos" }); } catch (e) { /* noop */ }
        return origEOS.apply(this, arguments);
      };
    }
  } catch (e) { /* frozen prototype */ }

  /* v8.7.115 桥回流通道：初始化段攒齐通知（ISOLATED → MAIN，同 window
     postMessage；独立标记 __chushiSniffCtrl 与嗅探信号互不混淆） */
  try {
    window.addEventListener("message", function (ev) {
      if (ev.source !== window) return;
      var d = ev.data;
      if (!d || d.__chushiSniffCtrl !== true) return;
      try {
        if (d.kind === "catch-init-done") initDone[Number(d.idx) || 0] = true;
      } catch (e) { /* noop */ }
    });
  } catch (e) { /* noop */ }

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
