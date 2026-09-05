/* 「初始 · SMTC 音乐」预设脚本：把系统媒体控制挂进 ⌘K 指令面板。
 * 数据面 = chushi.smtc（v1.8.0 媒体作用面）：get / control / subscribe。
 * 媒体来源是 Windows 系统媒体会话（SMTC）——网易云音乐、QQ 音乐、Spotify、
 * 浏览器视频等任何注册 SMTC 的播放器都在控制范围内。
 */
var smtcApi = chushi.smtc;

function describeTrack(state) {
  if (!state || !state.connected) return "SMTC 桥未运行";
  var t = state && state.track;
  if (!t) return "当前没有媒体会话";
  return (t.title || "未知曲目") + " — " + (t.artist || "未知艺术家");
}

chushi.registerCommand({
  id: "toggle",
  title: "音乐：播放 / 暂停",
  run: async function () {
    var ok = await smtcApi.control("toggle");
    chushi.notify({
      title: ok ? "已切换播放状态" : "无法控制",
      description: ok ? "" : "SMTC 桥未运行或没有活跃媒体会话",
    });
  },
});

chushi.registerCommand({
  id: "next",
  title: "音乐：下一首",
  run: async function () {
    var ok = await smtcApi.control("next");
    if (!ok) chushi.notify({ title: "无法切下一首", description: "SMTC 桥未运行或没有活跃媒体会话" });
  },
});

chushi.registerCommand({
  id: "prev",
  title: "音乐：上一首",
  run: async function () {
    var ok = await smtcApi.control("prev");
    if (!ok) chushi.notify({ title: "无法切上一首", description: "SMTC 桥未运行或没有活跃媒体会话" });
  },
});

chushi.registerCommand({
  id: "now",
  title: "音乐：正在播放什么",
  run: async function () {
    var s = await smtcApi.get();
    chushi.notify({ title: "正在播放", description: describeTrack(s) });
  },
});
