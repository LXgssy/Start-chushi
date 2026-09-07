/* 初始 · SMTC 音乐 ⌘K 命令（v5.0.0 全新实现）
 * 数据面 = chushi.music（宿主预计算快照）；兼容回退旧 chushi.smtc。 */
var musicApi = (window.chushi && chushi.music) ? chushi.music :
  (chushi.smtc ? { snapshot: null, toggle: chushi.smtc.control ? function () { return chushi.smtc.control("toggle"); } : null } : null);

function describeTrack(state) {
  if (!state || !state.connected) return "引擎未运行（安装 ChuShi SMTC Manager 插件自动管理）";
  var t = state.track;
  if (!t || !t.title) return "当前没有媒体会话";
  return t.title + (t.artist ? " — " + t.artist : "");
}

registerCommand({
  id: "toggle",
  title: "音乐：播放 / 暂停",
  run: async function () {
    var ok = musicApi && musicApi.toggle ? await musicApi.toggle() : false;
    notify({ title: ok ? "已切换播放状态" : "控制未生效", description: ok ? "" : "引擎未运行或没有活跃媒体会话" });
  },
});

registerCommand({
  id: "next",
  title: "音乐：下一首",
  run: async function () {
    var ok = musicApi && musicApi.next ? await musicApi.next() : false;
    if (!ok) notify({ title: "控制未生效", description: "引擎未运行或没有活跃媒体会话" });
  },
});

registerCommand({
  id: "prev",
  title: "音乐：上一首",
  run: async function () {
    var ok = musicApi && musicApi.prev ? await musicApi.prev() : false;
    if (!ok) notify({ title: "控制未生效", description: "引擎未运行或没有活跃媒体会话" });
  },
});

registerCommand({
  id: "now",
  title: "音乐：正在播放什么",
  run: async function () {
    var state = null;
    if (musicApi && musicApi.snapshot) state = await musicApi.snapshot();
    else if (chushi.smtc && chushi.smtc.get) state = await chushi.smtc.get();
    notify({ title: describeTrack(state) });
  },
});
