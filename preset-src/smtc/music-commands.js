/* 初始 · SMTC 音乐 ⌘K 命令（v7.1.0 适配版）
 * 数据面 = chushi.music（宿主预计算快照）；兼容回退旧 chushi.smtc。
 * v7.1.0 修复：沙箱只注入 chushi 命名空间——registerCommand/notify 必须
 * 经 chushi.* 调用（裸调用会 ReferenceError：「registerCommand is not defined」）。 */
var musicApi = (window.chushi && chushi.music) ? chushi.music :
  (chushi.smtc ? { snapshot: null, toggle: chushi.smtc.control ? function () { return chushi.smtc.control("toggle"); } : null } : null);

function describeTrack(state) {
  if (!state || !state.connected) return "音乐桥未连接（安装 ChuShi Music Bridge 插件并重启网易云）";
  var t = state.track;
  if (!t || !t.title) return "当前没有媒体会话";
  return t.title + (t.artist ? " — " + t.artist : "");
}

chushi.registerCommand({
  id: "toggle",
  title: "音乐：播放 / 暂停",
  run: async function () {
    var ok = musicApi && musicApi.toggle ? await musicApi.toggle() : false;
    chushi.notify({ title: ok ? "已切换播放状态" : "控制未生效", description: ok ? "" : "音乐桥未连接或没有活跃媒体会话" });
  },
});

chushi.registerCommand({
  id: "next",
  title: "音乐：下一首",
  run: async function () {
    var ok = musicApi && musicApi.next ? await musicApi.next() : false;
    if (!ok) chushi.notify({ title: "控制未生效", description: "音乐桥未连接或没有活跃媒体会话" });
  },
});

chushi.registerCommand({
  id: "prev",
  title: "音乐：上一首",
  run: async function () {
    var ok = musicApi && musicApi.prev ? await musicApi.prev() : false;
    if (!ok) chushi.notify({ title: "控制未生效", description: "音乐桥未连接或没有活跃媒体会话" });
  },
});

chushi.registerCommand({
  id: "now",
  title: "音乐：正在播放什么",
  run: async function () {
    var state = null;
    if (musicApi && musicApi.snapshot) state = await musicApi.snapshot();
    else if (chushi.smtc && chushi.smtc.get) state = await chushi.smtc.get();
    chushi.notify({ title: describeTrack(state) });
  },
});
