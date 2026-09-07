      /* ---------- SMTC 媒体作用面（v5 全新实现）----------
       * get()：Promise<state|null> 当前媒体快照（宿主白名单产物）；
       * control(cmd, position?)：play/pause/toggle/next/prev/seek（seek 附秒），
       *   Promise<boolean> 兑现执行结果；subscribe(cb)：快照变化即回调。 */
      smtc: {
        get: function () {
          return new Promise(function (resolve) {
            var id = ++mediaReqSeq;
            var t = setTimeout(function () {
              delete pendingMedia[id];
              resolve(null);
            }, 8000);
            pendingMedia[id] = {
              f: function (v) {
                clearTimeout(t);
                resolve(v);
              },
            };
            post({ type: "api", op: "smtcGet", scriptKey: scriptKey, reqId: id });
          });
        },
        control: function (cmd, position) {
          return mediaControlRequest(scriptKey, cmd, position);
        },
        subscribe: function (cb) {
          if (typeof cb !== "function") return function () {};
          coreCbs.push(cb);
          post({ type: "api", op: "smtcSubscribe", scriptKey: scriptKey });
          return function () {
            var i = coreCbs.indexOf(cb);
            if (i >= 0) coreCbs.splice(i, 1);
          };
        },
      },
      /* ---------- 音乐引擎作用面（v5 全新实现）----------
       * 解析/插值/时间戳对齐全在宿主侧完成，预设零计算；
       * now() 同步返回实时态（rAF 每帧取用）；seek 成功即乐观重锚。 */
      music: {
        snapshot: function () { return coreApi.snapshot(); },
        now: function () { return coreApi.now(); },
        lyrics: function () { return coreApi.lyrics(); },
        subscribe: coreApi.subscribe,
        seek: coreApi.seek,
        play: coreApi.play,
        pause: coreApi.pause,
        toggle: coreApi.toggle,
        next: coreApi.next,
        prev: coreApi.prev,
      },
