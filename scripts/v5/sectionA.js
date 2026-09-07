  /** 媒体通道状态（v5 全新命名）：get/control 共用 pending 表 + 定向快照回调集 */
  var pendingMedia = {};
  var mediaSnapCbs = new Map();
  /** 每脚本最近一份快照（smtcTick 锚点校正的落点） */
  var mediaLastSnap = new Map();
  var mediaReqSeq = 0;
  /** 音乐引擎核心实例：scriptKey → api（smtcPush/smtcTick 同源喂数） */
  var musicCores = new Map();

  /** 媒体控制请求（脚本通道共用实现）：8s 超时 Promise，白名单由宿主复核 */
  function mediaControlRequest(scriptKey, cmd, position) {
    return new Promise(function (resolve) {
      var id = ++mediaReqSeq;
      var t = setTimeout(function () {
        delete pendingMedia[id];
        resolve(false);
      }, 8000);
      pendingMedia[id] = {
        f: function (v) {
          clearTimeout(t);
          resolve(v === true);
        },
      };
      post({
        type: "api",
        op: "smtcControl",
        scriptKey: scriptKey,
        cmd: str(cmd, 8),
        position: typeof position === "number" && isFinite(position) ? position : null,
        reqId: id,
      });
    });
  }
