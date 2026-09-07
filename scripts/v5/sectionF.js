    if (m.type === "smtcPush" && typeof m.scriptKey === "string") {
      /* 快照定向推送（签名变化才到）：state 整包透传，音乐核心同源喂数 */
      var snapCbs = mediaSnapCbs.get(m.scriptKey);
      var snapMsg = m.state && typeof m.state === "object" ? m.state : null;
      mediaLastSnap.set(m.scriptKey, snapMsg);
      var coreA = musicCores.get(m.scriptKey);
      if (coreA && snapMsg) coreA.feed(snapMsg);
      if (!snapCbs || snapCbs.length === 0) return;
      for (var ai = 0; ai < snapCbs.length; ai++) {
        try {
          snapCbs[ai](snapMsg);
        } catch (err) {
          post({ type: "runtimeError", message: errMsg(err) });
        }
      }
      return;
    }

    if (m.type === "smtcTick" && typeof m.scriptKey === "string") {
      /* 每拍锚点：只改锚点字段，不覆盖重载荷；未拿到过快照则丢弃 */
      var tk = m.tick && typeof m.tick === "object" ? m.tick : null;
      var lastSnapMsg = mediaLastSnap.get(m.scriptKey);
      if (!tk || !lastSnapMsg || !lastSnapMsg.track) return;
      if (typeof tk.position === "number") lastSnapMsg.track.position = tk.position;
      if (typeof tk.duration === "number") lastSnapMsg.track.duration = tk.duration;
      if (typeof tk.playing === "boolean") lastSnapMsg.track.playing = tk.playing;
      if (typeof tk.rate === "number") lastSnapMsg.track.rate = tk.rate;
      if (typeof tk.fetchedAt === "number") lastSnapMsg.track.fetchedAt = tk.fetchedAt;
      var coreB = musicCores.get(m.scriptKey);
      if (coreB) coreB.tick(tk);
      var tickCbs = mediaSnapCbs.get(m.scriptKey);
      if (!tickCbs || tickCbs.length === 0) return;
      for (var bi = 0; bi < tickCbs.length; bi++) {
        try {
          tickCbs[bi](lastSnapMsg);
        } catch (err) {
          post({ type: "runtimeError", message: errMsg(err) });
        }
      }
      return;
    }

    if (m.type === "smtcGetResult") {
      var getWaiter = pendingMedia[m.reqId];
      if (getWaiter) {
        delete pendingMedia[m.reqId];
        getWaiter.f(m.state && typeof m.state === "object" ? m.state : null);
      }
      return;
    }

    if (m.type === "smtcControlResult") {
      var ctlWaiter = pendingMedia[m.reqId];
      if (ctlWaiter) {
        delete pendingMedia[m.reqId];
        ctlWaiter.f(m.ok === true);
      }
      return;
    }
