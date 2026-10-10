/* ============================================================================
 * 「初始」B 站完整视频下载 offscreen 控制器 offscreen-bili.js（v8.7.69）
 * ----------------------------------------------------------------------------
 * 职责链（消息驱动，单任务）：
 *   SW → {type:"bili-offscreen-job", job:"remux", videoUrl, audioUrl,
 *         filename, tabId, totalSize}
 *     ① fetch 视频 m4s（流式 reader 分块入内存，每 3% 或 800ms 报进度）
 *     ② fetch 音频 m4s（同上）
 *     ③ BiliRemux.remuxBuffers 合并 → 渐进 MP4
 *     ④ Blob → createObjectURL → chrome.downloads.download
 *     ⑤ 监听 downloads.onChanged 至 complete/interrupted → bili-done
 *   任何环节失败 → bili-done{ok:false,error}（SW 决定是否降级分离下载）
 * 下载优先 offscreen 直接 chrome.downloads（扩展页有 downloads API 面）；
 * 异常时回退 blobUrl 交 SW 代下（bili-blob-download 消息）。
 * 内存律：分块 chunk 累积 + 最终 concat，峰值 ≈ 2×媒体体积；SW 侧传
 * totalSize 供超大提醒（面板层已提示，本层不设硬顶）。
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__chushiBiliOffscreen) return;
  window.__chushiBiliOffscreen = true;

  var busy = false;          /* 单任务锁 */
  var liveBlobs = [];        /* 活跃 blob URL（文档存活期由本 doc 持有） */
  var reportTimer = 0;

  function reply(msg) {
    /* offscreen → SW（SW 醒着处理并转标签页） */
    try { chrome.runtime.sendMessage(msg, function () { void chrome.runtime.lastError; }); } catch (e) { /* noop */ }
  }

  function reportProgress(tabId, stage, loaded, total, kind) {
    reply({
      type: "bili-progress", tabId: tabId, stage: stage,
      loaded: loaded, total: total || 0, kind: kind || "bili",
    });
  }

  /* 流式拉取：分块累积 + 节流进度（3% 或 800ms 双阈值） */
  function fetchWithProgress(url, tabId, stage, onProgress) {
    return fetch(url, { credentials: "omit", cache: "no-store" }).then(function (resp) {
      if (!resp.ok) throw new Error("http-" + resp.status);
      var cl = +resp.headers.get("content-length") || 0;
      var reader = resp.body && resp.body.getReader ? resp.body.getReader() : null;
      if (!reader) {
        /* 无流式读能力（理论不可达）：退化为整包 */
        return resp.arrayBuffer().then(function (buf) { onProgress(buf.byteLength, cl); return buf; });
      }
      var chunks = [];
      var loaded = 0;
      var lastPct = -1;
      var lastTick = Date.now();
      return reader.read().then(function pump(r) {
        if (r.done) {
          var all = new Uint8Array(loaded);
          var off = 0;
          for (var i = 0; i < chunks.length; i++) { all.set(chunks[i], off); off += chunks[i].length; }
          chunks = null;
          onProgress(loaded, cl || loaded);
          return all.buffer;
        }
        chunks.push(r.value);
        loaded += r.value.length;
        var now = Date.now();
        var pct = cl > 0 ? Math.floor((loaded / cl) * 100) : -1;
        if (pct !== lastPct && (pct - lastPct >= 3 || now - lastTick >= 800 || pct < 0)) {
          lastPct = pct; lastTick = now;
          onProgress(loaded, cl);
        }
        return reader.read().then(pump);
      });
    });
  }

  function downloadBlob(blobUrl, filename) {
    return new Promise(function (resolve) {
      try {
        chrome.downloads.download(
          { url: blobUrl, filename: filename, saveAs: false },
          function (id) {
            if (chrome.runtime.lastError || typeof id !== "number") { resolve(null); return; }
            resolve(id);
          }
        );
      } catch (e) { resolve(null); }
    });
  }

  function watchDownload(id, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (ok) {
        if (done) return;
        done = true;
        try { chrome.downloads.onChanged.removeListener(li); } catch (e) { /* noop */ }
        clearTimeout(guard);
        resolve(ok);
      };
      var li = function (delta) {
        if (delta.id !== id) return;
        if (delta.state && delta.state.current === "complete") finish(true);
        else if (delta.state && delta.state.current === "interrupted") finish(false);
      };
      try { chrome.downloads.onChanged.addListener(li); } catch (e) { /* noop */ }
      /* 超时兜底：大文件下载慢，给足 2h */
      var guard = setTimeout(function () { finish(false); }, timeoutMs || 7200000);
    });
  }

  function handleJob(msg) {
    if (busy) { reply({ type: "bili-done", tabId: msg.tabId, ok: false, error: "busy", kind: msg.muxer === "yt" ? "yt" : "bili" }); return; }
    busy = true;
    var tabId = msg.tabId;
    var kind = msg.muxer === "yt" ? "yt" : "bili";
    /* v8.7.71 muxer 开关：B 站 m4s = fMP4（remuxBuffers），
       YouTube adaptive = 常规 MP4（remuxYT，stbl 表抽取）；返回同形 */
    /* muxer 选择在下方合并处内联三元（yt 通道单文件形态需 audioBuf 回退
       videoBuf，无法用单值 muxFn 表达） */
    var videoBuf = null, audioBuf = null;

    var chain = Promise.resolve();
    if (msg.videoUrl) {
      chain = chain.then(function () {
        return fetchWithProgress(msg.videoUrl, tabId, "video", function (loaded, total) {
          reportProgress(tabId, "video", loaded, total, kind);
        });
      }).then(function (buf) { videoBuf = buf; });
    }
    if (msg.audioUrl) {
      chain = chain.then(function () {
        return fetchWithProgress(msg.audioUrl, tabId, "audio", function (loaded, total) {
          reportProgress(tabId, "audio", loaded, total, kind);
        });
      }).then(function (buf) { audioBuf = buf; });
    }
    chain = chain.then(function () {
      reportProgress(tabId, "merge", 0, 0, kind);
      /* yt 通道单文件形态（一体档/纯音频）：audioUrl 缺省时从同一缓冲抽双轨
         （extractTracksStbl 同文件取 vide+soun），统一走 remuxYT；无音频轨则
         自动退化为单轨输出 */
      var r = kind === "yt"
        ? BiliRemux.remuxYT(videoBuf, audioBuf || videoBuf)
        : BiliRemux.remuxBuffers(videoBuf, audioBuf);
      videoBuf = audioBuf = null; /* 释放原始流内存 */
      return r.bytes;
    }).then(function (bytes) {
      var blob = new Blob([bytes], { type: "video/mp4" });
      bytes = null;
      var url = URL.createObjectURL(blob);
      liveBlobs.push(url);
      return downloadBlob(url, msg.filename).then(function (id) {
        if (id !== null) return watchDownload(id).then(function (ok) {
          if (ok) return { ok: true };
          throw new Error("download-interrupted");
        });
        /* offscreen 无 downloads 面（理论不可达）：交 SW 代下 */
        reply({ type: "bili-blob-download", tabId: tabId, blobUrl: url, filename: msg.filename });
        /* 等待 SW 侧启动下载即视为交接完成（完成态由浏览器下载面板呈现） */
        return { ok: true, handedOff: true };
      });
    }).then(function (res) {
      reply({ type: "bili-done", tabId: tabId, ok: true, handedOff: !!(res && res.handedOff), kind: kind });
    }).catch(function (err) {
      reply({ type: "bili-done", tabId: tabId, ok: false, error: String((err && err.message) || err), kind: kind });
    }).then(function () {
      busy = false;
    });
  }

  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || msg.type !== "bili-offscreen-job") return;
      if (msg.job === "remux") {
        handleJob(msg);
        try { sendResponse({ ok: true, accepted: true }); } catch (e) { /* noop */ }
      } else if (msg.job === "ping") {
        try { sendResponse({ ok: true, busy: busy }); } catch (e) { /* noop */ }
      }
      return; /* 同步应答 */
    });
  } catch (e) { /* noop */ }
})();
