/* ============================================================================
 * 「初始」资源嗅探主世界探针 sniffer-probe v5（v8.7.125，+媒体源实例分组）
 * ----------------------------------------------------------------------------
 * v8.7.125 缓存抓取抓错目标根修（用户：「没有正确抓取当前播放视频的缓存，
 *   文件一堆乱码且音画不同步」）：v4 探针把页面【所有】MediaSource 的
 *   SourceBuffer 平铺登记为轨道（idx 全局自增），现代视频页普遍存在多个
 *   MS 实例（片头广告、正片、预加载下一集/推荐流、ABR 换源重建），桥
 *   下载时全量无差别出文件，用户拿到的是广告/预加载的分段。本版给 MS
 *   实例懒分配 msId（WeakMap，首个 addSourceBuffer 时编号），catch-track
 *   /catch-chunk/catch-eos 三信号全部随行 ms 字段——桥按媒体源实例分组
 *   攒块，下载只合成「最近活跃组」（正在喂当前播放器的 MS），其余组
 *   忽略并计数提示。旧字段 idx 语义不变（兼容按轨道存备胎）。
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
     v8.7.115：mime 随行（轨道登记缺席时桥侧兜底）。
     v8.7.125：ms 随行（媒体源实例分组，桥按组过滤下载目标）。 */
  function catchChunk(idx, data, mime, ms) {
    if (!data) return;
    try {
      var copy = null;
      if (data instanceof ArrayBuffer) copy = data.slice(0);
      else if (ArrayBuffer.isView(data)) {
        copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      }
      if (!copy || !copy.byteLength) return;
      post({ kind: "catch-chunk", idx: idx, mime: mime || "", ms: ms || 0, data: copy }, [copy]);
    } catch (e) { /* noop */ }
  }

  /* v8.7.125 媒体源实例身份：WeakMap 懒分配（首个 addSourceBuffer 时
     编号，实例回收后编号不重发——同号只归同一实例）。 */
  var msSeq = 0;
  var msIds = typeof WeakMap === "function" ? new WeakMap() : null;
  function msIdOf(msObj) {
    try {
      if (!msIds) return 0;
      var id = msIds.get(msObj);
      if (id === undefined) { id = ++msSeq; msIds.set(msObj, id); }
      return id;
    } catch (e) { return 0; }
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
          /* v8.7.125 媒体源实例分组：this 即 MS 实例，懒分配 msId 随行 */
          var msId = msIdOf(this);
          /* 缓存抓取轨道登记：每次 addSourceBuffer 都报（嗅探开着就报，
             桥侧常备轨道表——捕获中途开启也能接上后续分段） */
          var trackIdx = sbSeq++;
          if (armed()) post({ kind: "catch-track", idx: trackIdx, mime: mime, ms: msId });
          try {
            /* appendBuffer 包装是 GD3 的缓冲追加确认信号；个别播放器把
               SourceBuffer 实例冻结，包装失败只降级为 addSourceBuffer 信号。
               v8.7.112：捕获态下同时截留分段（拷贝转交，原始照传页面） */
            var origAppend = sb.appendBuffer;
            if (typeof origAppend === "function") {
              sb.appendBuffer = function (data) {
                post({ kind: "mse", mime: mime });
                if (catchArmed()) catchChunk(trackIdx, data, mime, msId);
                else if (!initDone[trackIdx]) {
                  /* v8.7.115 初始化段备胎：捕获未开也截前几段（桥判齐即停） */
                  var n = data instanceof ArrayBuffer ? data.byteLength
                    : ArrayBuffer.isView(data) ? data.byteLength : 0;
                  initSentBytes[trackIdx] = (initSentBytes[trackIdx] || 0) + n;
                  if (initSentBytes[trackIdx] <= INIT_HARD_CAP) catchChunk(trackIdx, data, mime, msId);
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
        try {
          if (catchArmed()) post({ kind: "catch-eos", ms: msIdOf(this) });   /* v8.7.125 随行媒体源 */
        } catch (e) { /* noop */ }
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

/*! 初始 · 视频录制探针（录制第一步，2026-10）
 *  MSE/blob 站点（抖音推荐页等）没有可下载的媒体 URL，唯一可行路径是
 *  对正在播放的 <video> 做 captureStream + MediaRecorder 录制。
 *  本段只暴露主世界 API，供页面控制台手动验证；不接 UI、不改既有逻辑。
 *  用法（页面控制台，主世界）：
 *    __chushiRec.list()            → 可录视频候选 [{i,w,h,t,paused,muted}]
 *    __chushiRec.pickMime()        → 实际可用格式（优先 mp4，回退 webm）
 *    __chushiRec.start(i)          → 开始录制（i 来自 list()）
 *    __chushiRec.stop()            → 停止并返回 {url,size,mime,seconds}
 *  注意：录制是实时的（录多久要播多久），且 mp4 录制仅部分 Chrome 支持。 */
(function () {
  "use strict";
  function videos() {
    return Array.prototype.slice.call(document.querySelectorAll("video")).filter(function (v) {
      return v && v.videoWidth > 0 && (v.currentTime > 0 || !v.paused);
    });
  }
  function list() {
    return videos().map(function (v, i) {
      return { i: i, w: v.videoWidth, h: v.videoHeight, t: Math.floor(v.currentTime || 0), paused: !!v.paused, muted: !!v.muted };
    });
  }
  function pickMime() {
    var c = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"], i;
    for (i = 0; i < c.length; i++) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) { /* noop */ }
    }
    return "";
  }
  var rec = null, chunks = [], startedAt = 0;
  function start(i) {
    if (rec) return { ok: false, error: "busy" };
    var v = videos()[i];
    if (!v) return { ok: false, error: "no-video" };
    var mime = pickMime();
    if (!mime) return { ok: false, error: "unsupported" };
    var stream = null;
    try { stream = v.captureStream ? v.captureStream() : (v.mozCaptureStream ? v.mozCaptureStream() : null); } catch (e) { stream = null; }
    if (!stream) return { ok: false, error: "no-captureStream" };
    chunks = []; startedAt = Date.now();
    try { rec = new MediaRecorder(stream, { mimeType: mime }); } catch (e) { rec = null; return { ok: false, error: "recorder-failed" }; }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(1000);
    return { ok: true, mime: mime };
  }
  function stop() {
    if (!rec) return Promise.reject(new Error("not-recording"));
    return new Promise(function (resolve) {
      var r = rec;
      r.onstop = function () {
        var b = new Blob(chunks, { type: (r && r.mimeType) || "video/webm" });
        var secs = Math.round((Date.now() - startedAt) / 1000);
        rec = null; chunks = [];
        resolve({ ok: true, url: URL.createObjectURL(b), size: b.size, mime: b.type, seconds: secs });
      };
      try { r.stop(); } catch (e) { rec = null; resolve({ ok: false, error: "stop-failed" }); }
    });
  }
  window.__chushiRec = { list: list, start: start, stop: stop, pickMime: pickMime };
})();

/*! 第二步：主世界录制请求通道（探针 = MAIN world，桥 = ISOLATED world，
 *  两者 window 不相通，只能用 postMessage 通信）。请求/应答约定：
 *  请求  { __chushiRecReq: id, op: "list"|"start"|"stop"|"pickMime", i }
 *  应答  { __chushiRecRes: id, ...payload }                                    */
(function () {
  "use strict";
  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.__chushiRecReq === undefined) return;
    var api = window.__chushiRec, id = d.__chushiRecReq, reply = function (payload) {
      try { window.postMessage(Object.assign({ __chushiRecRes: id }, payload), "*"); } catch (e) { /* noop */ }
    };
    if (!api) { reply({ ok: false, error: "no-probe" }); return; }
    try {
      if (d.op === "list") reply({ ok: true, list: api.list() });
      else if (d.op === "pickMime") reply({ ok: true, mime: api.pickMime() });
      else if (d.op === "start") reply(api.start(d.i || 0));
      else if (d.op === "stop") api.stop().then(reply, function (e) { reply({ ok: false, error: String((e && e.message) || e) }); });
      else reply({ ok: false, error: "bad-op" });
    } catch (e) { reply({ ok: false, error: String((e && e.message) || e) }); }
  });
})();
