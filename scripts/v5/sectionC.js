    var coreCbs = [];
    mediaSnapCbs.set(scriptKey, coreCbs);
    /* 音乐引擎核心实例（v5）：喂数由全局 smtcPush/smtcTick 处理器桥接 */
    var coreApi = __chushiMusicCoreV5({
      control: function (cmd, position) { return mediaControlRequest(scriptKey, cmd, position); },
      requestSubscribe: function () {
        post({ type: "api", op: "smtcSubscribe", scriptKey: scriptKey });
      },
    });
    musicCores.set(scriptKey, coreApi);
