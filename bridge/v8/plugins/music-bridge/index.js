/* ============================================================================
 * ChuShi Music Bridge 8.1.3 — 网易云 InfLink-rs 适配桥（媒体键退役 + 备路三代修正）
 *   v8.1.3（真机录屏 18:28：歌词卡死——部件时间 1:06↔1:08 两秒闪烁、
 *   歌词行恒驻不前，肉眼即「歌词冻住」；页面诊断 stateAge 11.5s）：
 *   ① 状态推送先行——旧序里 /api/state 排在 poll/selftest/cmds 三次往返
 *     之后，hub 半死（响应秒级迟滞）时最坏 ~7s/拍，页面拿到的位置长期
 *     恒定（陈旧真值 +6s 封顶）→ 引擎熔断拒/放循环 = 2s 闪烁；现读真值
 *     → 推状态紧跟租约认领，页面数据源不再为命令链路让路；
 *   ② 超时收紧：poll 2.5→1.2s / state 2.5→1.5s / selftest 2.5→1.2s /
 *     cmds 2.0→1.2s——hub 半死时单拍最坏 ~5s（旧 ~9.5s），stateAge 峰值
 *     腰斩；配套页面端 sandbox.js v8.1.3 恒源钉守（重现拒收值即封顶保持）
 *     双层根治显示闪烁。
 *   v8.1.0（用户实机录屏：歌曲正常播放但歌词乱跳 1:05↔1:06 锯齿）：
 *   ① 位置单源化——旧版 InfLink 时间线（SMTC 上报滞后 ~1s）与元素真值
 *     空缺交替补位，两源逐拍交替 → 页面每拍硬锚 → 进度/歌词秒级锯齿；
 *     现一律以 el.currentTime 为位置唯一源，InfLink 时间线仅元素缺席兑底。
 *   v8.0.9（用户实机：「拖动成功了却提示拖动不成功 + 回弹几秒才跳转」）：
 *   ①doSeek 读回校验 v2——InfLink 时间线第一读回源（页面所见即所验）+
 *     元素备源，420/1000/2200ms 三拍耐心（旧版只读元素且仅两拍，NCM 应用
 *     seek 异步 + InfLink 回传延迟时两拍必墨）；三态诚实上报：无读回源
 *     保持 null，ne.seekAckKnown=false，页面端不再亮假失败芯片。
 *   v8.0.1：①命令解析兼容 hub 实物协议 {"_id",raw:{...}}；②jpost 2.5s 超时；
 *   ③toggle 方向判定取 InfLink 真值。
 *   v8.0.2：控制验证+三级备路 / 播放态时间线自愈 / 封面 https 升级。
 *   v8.0.3：按钮候选扩宽 / 完整指针序列 / toggle 元素路径复验。
 *   v8.0.4：切歌曲键检测+pending 清槽 / 逐字校准管线 / 命令回执进 /api/state。
 *   v8.0.5：native 媒体键兜底（已按用户指令于本版退役——系统媒体卡片
 *   实测可控制，证明 InfLink-rs 控制通路有效，断点在桥端备路，OS 输入层
 *   方案整体废除：hub.dll 媒体键端点同步删除）。
 *   v8.0.6（InfLink-rs 3.2.11 源码逐行比对结论）：
 *   ①系统卡片按钮 → Rust dispatch_event → InfLink 前端 handleAdapterCommand
 *     → adapter.play() → reduxStore.dispatch；而 window.InfLinkApi.play()
 *     就是同一个 adapter.play()——三者同路。桥主路（v8.0.2 起）调用入口
 *     正确，但缺调用级遥测，失败不可见 → 本版 apiToggle/next/prev/seek
 *     全部落 trace。
 *   ②实锤修复：桥全部 store 判定（findDvaStore/findStoreViaFiber/storeOk/
 *     readStore）只认 2.x 顶层 st.player——NCM 3.x 顶层是 st.playing
 *     （InfLink v3 adapter 即读 playing/playingList）→ 3.x 上 redux 备路
 *     全灭（no-store）。本版 storeOk 改判 player(2.x) ∥ playing(3.x)，
 *     readStore 同步兼容 playingState/resourceTrackId/resourceName。
 *   ③控制 store 优先级反转：fiber（InfLink 同款 #root 遍历）> webpack
 *     dva > g_app——第二路与系统卡片按钮的 dispatch 等效。
 *   ④幂等闸防 hub 重启 _id 回退碰撞（hub 重启 g_cmdNextId 归零，桥侧
 *     lastCmdDone 残留旧 _id 会把新命令当重复静默吞掉）。
 *   ⑤cmdTrace 容量 12→20。
 *
 *   v8.0.8（hubsim 协议级复现实锢 —— 控制失效真正根因）：
 *   ①hub dataDrainCmds 拼接排空数组时从未写入外层对象收尾 '}'，
 *     ["_id":1,"raw":{"cmd":"toggle"}（缺收尾）自 v8.0.0 起每代
 *     发布二进制皆然（反汇编 0x7d 存储指令计数=0 实锢）→ 桥 r.json()
 *     必抛 → jget 静默 null → Array.isArray(null)=false → 循环永不执行 →
 *     cmdTrace 永远空、命令随排空灰飞烟灭。历次 e2e 用自拼正确 JSON 的
 *     mock hub，永远测不出（mock 假绿第二课）。本版 hub 已修（'"}' 补写），
 *     桥侧同步加固：拉取 null/非数组不再静默，trace 落 'pull-fail'。
 *   ②回路自证（loopback selftest）——每 8s 向自己队列投递 {cmd:'_selftest'}
 *     并验证 4s 内从自己的排空里收回：收不回 = 本桥与 hub 的命令回路断裂
 *     （端口拓扑漂移/队列被夺/hub 半死），连续 2 败即强制全端口重新发现。
 *     结果透传 state.selftest = {ok, failStreak, at}，页面诊断口一眼定层。
 *   ③轮询计数透传 state.poll = {drains, emptyStreak, lastCount, lastGetAt,
 *     lastNullAt}——「桥在拉但永远空」从猜测变成可见事实。
 *
 *   v8.0.7（用户实机 cmdTrace 取证：POST 全 ok + 桥状态活 + 回执从未出现）：
 *   ①轮询租约（poller lease）——/api/cmd 排空式先到先得，网易云残留进程/
 *     多进程注入的第二桥实例（window.__chushiMusicBridge 防重入守卫只在
 *     单进程内有效）会把命令队列随机分走 → 新桥永远空手、回执永不产生、
 *     控制全部落空——这是上述三证据同时成立的唯一自洽解释。本版每拍先
 *     POST /api/poll {id:POLL_ID} 认领（粘性持有者，TTL 4s）；未持有
 *     =备胎待命：不拉命令、不推状态、不写歌词（hub 侧同步把非持有者的
 *     GET /api/cmd 拦为 []，双保险）。旧 hub 无 /api/poll（404）→ legacy
 *     模式照常全权，升级窗口双向兼容。
 *   ②执行轨迹全量透传：state.cmd.trace（20 条环形）+ who（实例身份）
 *     + lease（holder/standby/legacy）——页面侧诊断口从此能看到桥内部
 *     每一步（cmd#/recv/link:play-called/redux:no-store/fb:button…），
 *     「桥到底有没有收到命令、走到哪一路」在浏览器里一条命令可见，
 *     诊断盲区永久消灭。
 *
 * v8 架构律（本代宪法）：
 *   1. 零自写 SMTC——系统媒体卡片（元数据/封面/时间线/媒体键/拖动）完全由
 *      InfLink-rs（Rust 原生插件）持有；本插件零 SMTC 代码，绝不与 WinRT
 *      发生任何关系（v7.0.x 四代崩溃永久终结）。
 *   2. InfLink-rs 主真值——window.InfLinkApi（InfLink-rs 设置页挂载的全局
 *      API）是歌曲/状态/时间线的第一真值源：
 *        getCurrentSong() → {songName, authorName, albumName, cover:{url}, ncmId, duration(ms)}
 *        getPlaybackStatus() → "Playing" | "Paused" | "Loading" | "Error"
 *        getTimeline() → {currentTime(ms), totalTime(ms)} | null
 *      单位律：InfLink 时间线一律毫秒，本插件统一 /1000 折算秒。
 *   3. 五层阶梯备源——InfLink 缺席（未装/禁用）或字段缺失时，旧真值阶梯
 *      只填空缺（audio 粘滞锁 → React fiber store → g_app → mediaSession →
 *      播放条 DOM 刮削）；非空字段优先，低阶源绝不覆盖高阶源。
 *   4. 控制主路走 InfLinkApi——play/pause/next/prev=InfLink 官方控制面
 *      （redux 派发，与系统卡片按钮同路），seek=seekTo(毫秒)；备路沿用
 *      audio 元素方法 + 可见按钮 + currentTime 单次直写 + 双读回校验。
 *   5. 枢纽客户位——本插件内置的 hub.dll（零 WinRT 纯 winsock 中继，
 *      127.0.0.1:26901/26902/26903）是唯一对外通道：
 *        拉命令  GET  /api/cmd    （页面控制，排空）
 *        推状态  POST /api/state  （1Hz，页面唯一数据源）
 *        推歌词  POST /api/lyric  （歌词源插件产物中继）
 *   6. 诚实降级——任一环节失败都在状态里如实标注，绝不假装在线。
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__chushiMusicBridge) return;

  var VER = '8.3.5';
  var HUB_NAME = 'chushi-music-hub';
  var HUB_PORTS = [26901, 26902, 26903];
  var BEAT_MS = 1000;
  /* v8.2.9 命令快排：专职 drain 循环节拍——「按了暂停好久才暂停」根治。
     旧版命令拉取串在 beat 尾部（poll→推状态→selftest→拉命令，最坏 ~4s/拍），
     命令平均等 0.5s、最坏 ~5s 才被执行；现拆出独立 200ms 快排循环，
     状态推送再拥堵也不拖累命令（环回 GET 微秒级，5/s 无感）。 */
  var DRAIN_MS = 200;
  /* v8.0.8 回路自证节律 */
  var SELFTEST_MS = 8000;
  var SELFTEST_WAIT_MS = 4000;
  /* v8.0.7 实例身份：本 JS 生命周期内稳定，跨进程唯一——多桥实例同抢
     /api/cmd 的时代结束；who 字段透出后，用户在页面诊断口就能看到
     「现在是谁在当家」 */
  var POLL_ID = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  /* 租约状态：leaseKnown=false → 旧 hub（无 /api/poll）→ legacy 全权模式；
     iHold=true → 本实例是持有者（legacy 下恒 true） */
  var leaseKnown = false;
  var iHold = true;

  window.__chushiMusicBridge = { ver: VER };
  /* v8 诊断口：控制台 window.__chushiMusicBridge.debug() 一眼看全真值链 */
  window.__chushiMusicBridge.debug = function () {
    return {
      ver: VER,
      hubPort: hub.port,
      hubVer: hub.version,
      inflink: { ver: inflink.ver, present: !!inflink.api },
      truth: JSON.parse(JSON.stringify(truth)),
      sources: {
        inflink: !!inflink.api && inflink.hit,
        element: !!getAudio(),
        webpackStore: !!(storeProbe.found),
        fiberStore: !!(fiberProbe.store),
        mediaSession: !!(readMediaSession()),
        domScrape: !!(scrapeBar())
      },
      seekAck: JSON.parse(JSON.stringify(seekAck)),
      cmdLast: JSON.parse(JSON.stringify(cmdLast)),
      cmdTrace: cmdTrace.slice(),
      selftest: JSON.parse(JSON.stringify(selftest)),
      poll: JSON.parse(JSON.stringify(pollStat)),
      who: POLL_ID,
      lease: leaseKnown ? (iHold ? 'holder' : 'standby') : 'legacy'
    };
  };

  /* ------------------------------------------------------------------ */
  /* 小工具                                                              */
  /* ------------------------------------------------------------------ */
  function nowMs() { return Date.now(); }
  function clampNum(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  }
  function clip(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }

  /* ------------------------------------------------------------------ */
  /* 真值源一：InfLink-rs（v8 主源）                                        */
  /* ------------------------------------------------------------------ */
  var inflink = { ver: '', api: null, hit: false, failStreak: 0 };

  function probeInflight() {
    try {
      var api = window.InfLinkApi;
      if (api && typeof api.getCurrentSong === 'function' && typeof api.play === 'function') {
        if (inflink.api !== api) {
          inflink.api = api;
          inflink.ver = clip(String(api.version || ''), 16);
          inflink.failStreak = 0;
        }
        return true;
      }
    } catch (e) { /* 探测异常按缺席 */ }
    if (inflink.api) { inflink.api = null; inflink.ver = ''; }
    return false;
  }

  /* 读 InfLink 三件套；任何一件命中即记 hit；播客同步 throw 当作无歌 */
  function readViaInflight(out) {
    var api = inflink.api;
    if (!api) return false;
    var got = false;
    try {
      var st = api.getPlaybackStatus ? api.getPlaybackStatus() : null;
      if (typeof st === 'string' && st) {
        out.playing = (st === 'Playing' || st === 'Loading');
        got = true;
      }
    } catch (e1) { /* 状态缺席 */ }
    try {
      var tl = api.getTimeline ? api.getTimeline() : null;
      if (tl && typeof tl === 'object') {
        var curMs = Number(tl.currentTime);
        var totMs = Number(tl.totalTime);
        if (isFinite(curMs) && curMs >= 0) { out.position = curMs / 1000; got = true; }
        if (isFinite(totMs) && totMs > 0) out.duration = totMs / 1000;
      }
    } catch (e2) { /* 时间线缺席 */ }
    try {
      var song = api.getCurrentSong ? api.getCurrentSong() : null;
      if (song && typeof song === 'object') {
        var id = Number(song.ncmId);
        var name = song.songName || song.name || '';
        if (name || (isFinite(id) && id > 0)) {
          var pic = '';
          try {
            if (song.cover && song.cover.url) pic = String(song.cover.url).slice(0, 500);
          } catch (e4) { /* 封面缺席 */ }
          out.song = {
            songId: isFinite(id) && id > 0 ? id : 0,
            title: String(name).slice(0, 200),
            artist: String(song.authorName || song.artist || '').slice(0, 200),
            album: String(song.albumName || song.album || '').slice(0, 200),
            pic: pic,
            durationMs: Number(song.duration) > 0 ? Number(song.duration) : 0
          };
          got = true;
        }
      }
    } catch (e3) { /* 播客信息尚未同步（InfLink throw）→ 当作无歌 */ }
    inflink.hit = got;
    return got;
  }

  /* ------------------------------------------------------------------ */
  /* 真值源二：audio 元素（粘滞身份锁，备源）                                */
  /* ------------------------------------------------------------------ */
  var elLock = { el: null, dur: 0, bad: 0 };

  function pickAudio() {
    var list = document.querySelectorAll('audio');
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.duration > 0 || a.currentTime > 0) { best = a; break; }
      if (!best) best = a;
    }
    return best;
  }

  function getAudio() {
    if (elLock.el && elLock.el.isConnected) return elLock.el;
    var el = pickAudio();
    if (el && el !== elLock.el) {
      elLock.el = el;
      elLock.dur = el.duration || 0;
      elLock.bad = 0;
    }
    return el;
  }

  /* ------------------------------------------------------------------ */
  /* 真值源三a：React fiber store 探针（webpack5 可靠路径）                  */
  /* ------------------------------------------------------------------ */
  var fiberProbe = { tried: 0, lastScan: 0, store: null };

  function fiberKeyOf(el) {
    var keys;
    try { keys = Object.keys(el); } catch (e) { return null; }
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactContainer$') === 0) return k;
    }
    return null;
  }

  /* v8.0.6：store 合法性判三代——2.x 顶层 st.player；3.x 顶层 st.playing
     （InfLink v3 adapter 即读 playing/playingList，从不读 player）。旧版只
     认 player → 3.x 全树扫描必然判废 → redux 备路全灭（no-store）。 */
  function storeOk(s) {
    try {
      var st = s.getState();
      if (!st || typeof st !== 'object') return false;
      return !!(st.player && typeof st.player === 'object') ||
             !!(st.playing && typeof st.playing === 'object');
    } catch (e) { return false; }
  }

  function findStoreViaFiber(force) {
    if (fiberProbe.store) {
      if (storeOk(fiberProbe.store)) return fiberProbe.store;
      fiberProbe.store = null;
    }
    var t = nowMs();
    if (!force && t - fiberProbe.lastScan < 15000) return null;
    if (fiberProbe.tried > 8) return null;
    fiberProbe.lastScan = t;
    fiberProbe.tried++;
    var body = document.body;
    if (!body) return null;
    var entry = null;
    var nodes = [body];
    try {
      var list = body.querySelectorAll('*');
      for (var i = 0; i < list.length && i < 4000; i++) nodes.push(list[i]);
    } catch (e) { /* DOM 异常跳过 */ }
    for (var j = 0; j < nodes.length; j++) {
      var k = fiberKeyOf(nodes[j]);
      if (k) { entry = nodes[j][k]; break; }
    }
    if (!entry) return null;
    var root = entry, guard = 0;
    while (root && root.return && guard++ < 500) root = root.return;
    if (!root) return null;
    /* BFS：react-redux Provider 把 dva store 放在 props.store */
    var queue = [root], seen = 0;
    while (queue.length && seen < 4000) {
      var f = queue.shift();
      seen++;
      try {
        var p = f.memoizedProps;
        if (p && p.store && typeof p.store.getState === 'function' && storeOk(p.store)) {
          fiberProbe.store = p.store;
          return fiberProbe.store;
        }
        if (f.stateNode && f.stateNode.props && f.stateNode.props.store &&
            typeof f.stateNode.props.store.getState === 'function' &&
            storeOk(f.stateNode.props.store)) {
          fiberProbe.store = f.stateNode.props.store;
          return fiberProbe.store;
        }
      } catch (e2) { /* 单节点异常忽略 */ }
      if (f.child) queue.push(f.child);
      if (f.sibling) queue.push(f.sibling);
    }
    return null;
  }

  /* 真值源三b：dva 全局应用（若有） */
  function findStoreViaGApp() {
    try {
      var g = window.g_app;
      var s = g && (g._store || (typeof g.getStore === 'function' && g.getStore()));
      if (s && typeof s.getState === 'function' && storeOk(s)) return s;
    } catch (e) { /* 忽略 */ }
    return null;
  }

  /* 真值源四：navigator.mediaSession.metadata（本体开了 SMTC 时页面自会设置） */
  function readMediaSession() {
    try {
      var md = navigator.mediaSession && navigator.mediaSession.metadata;
      if (md && (md.title || md.artist || md.album)) {
        var pic = '';
        try {
          if (md.artwork && md.artwork.length) {
            var a = md.artwork[md.artwork.length - 1];
            pic = (a && a.src) || '';
          }
        } catch (e1) { /* artwork 异常忽略 */ }
        return {
          title: typeof md.title === 'string' ? md.title : '',
          artist: typeof md.artist === 'string' ? md.artist : '',
          album: typeof md.album === 'string' ? md.album : '',
          pic: pic
        };
      }
    } catch (e) { /* mediaSession 缺席 */ }
    return null;
  }

  /* 真值源五：播放条 DOM 刮削（3 秒缓存） */
  var barProbe = { lastAt: 0, cache: null };

  function scrapeBar() {
    var t = nowMs();
    if (barProbe.cache && t - barProbe.lastAt < 3000) return barProbe.cache;
    barProbe.lastAt = t;
    var out = null;
    try {
      var bar = document.querySelector('#main-player')
        || document.querySelector('.j-play-bar')
        || document.querySelector('[class*="playBar"]')
        || document.querySelector('[class*="play-bar"]');
      if (bar) {
        var scope = bar.parentElement && bar.parentElement !== document.body ? bar.parentElement : bar;
        var img = scope.querySelector('img[src*="music.126.net"]');
        var title = '', artist = '';
        var tEls = scope.querySelectorAll('.j-title, [class*="title"] a, [class*="title"] span, [class*="title"]');
        for (var i = 0; i < tEls.length && i < 8; i++) {
          var tx = String(tEls[i].textContent || '').trim();
          if (tx && tx.length <= 60) { title = tx; break; }
        }
        var aEls = scope.querySelectorAll('.j-artist, [class*="artist"], [class*="singer"]');
        for (var j2 = 0; j2 < aEls.length && j2 < 8; j2++) {
          var ax = String(aEls[j2].textContent || '').trim();
          if (ax && ax.length <= 80) { artist = ax; break; }
        }
        var pic = img ? (img.getAttribute('src') || '') : '';
        if (title || artist || pic) out = { title: title, artist: artist, album: '', pic: pic };
      }
    } catch (e) { /* 刮削异常按无处理 */ }
    barProbe.cache = out;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 真值源六：dva store 只读探针（webpack4 老路径，保留兼容）                */
  /* ------------------------------------------------------------------ */
  var storeProbe = { tried: 0, found: null, lastScan: 0 };

  function captureWebpackRequire() {
    var req = null;
    function fakeModule() { return 1; }
    try {
      if (typeof window.webpackJsonp === 'object' && window.webpackJsonp && window.webpackJsonp.push) {
        var oldPush = window.webpackJsonp.push;
        window.webpackJsonp.push([
          ['__cs8_probe__'], { __cs8_probe__: function (m, e, r) { req = r; } },
          [['__cs8_probe__']]
        ]);
        if (!req) window.webpackJsonp.push = oldPush;
        if (req) return req;
      }
    } catch (e) { /* 探测失败继续下一种 */ }
    try {
      var keys = Object.keys(window);
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].indexOf('webpackChunk') !== 0) continue;
        var arr = window[keys[k]];
        if (!arr || typeof arr.push !== 'function' || !Array.isArray(arr)) continue;
        arr.push([['__cs8_probe__'], { __cs8_probe__: function (m2, e2, r2) { req = r2; } }, [['__cs8_probe__']]]);
        if (req) return req;
      }
    } catch (e2) { /* 放弃 */ }
    return req;
  }

  function findDvaStore(force) {
    if (storeProbe.found) {
      try {
        var st = storeProbe.found.getState ? storeProbe.found.getState() : null;
        if (st && (st.player || st.playing)) return storeProbe.found;
      } catch (e) { /* 缓存失效重扫 */ }
      storeProbe.found = null;
    }
    var t = nowMs();
    if (!force && t - storeProbe.lastScan < 30000) return null;
    storeProbe.lastScan = t;
    if (storeProbe.tried > 12) return null;
    storeProbe.tried++;
    var req = captureWebpackRequire();
    if (!req || !req.c) return null;
    var ids = Object.keys(req.c);
    for (var i = 0; i < ids.length && i < 1500; i++) {
      var mod = req.c[ids[i]];
      if (!mod || !mod.exports) continue;
      try {
        var ex = mod.exports;
        var cand = null;
        if (ex && typeof ex.getState === 'function') cand = ex;
        else if (ex.default && typeof ex.default.getState === 'function') cand = ex.default;
        if (!cand) continue;
        var st2 = cand.getState();
        if (st2 && ((st2.player && typeof st2.player === 'object') ||
                    (st2.playing && typeof st2.playing === 'object'))) {
          storeProbe.found = cand; return cand;
        }
      } catch (e3) { /* 单模块异常忽略 */ }
    }
    return null;
  }

  function readStore() {
    var out = { song: null, playing: null, position: -1 };
    try {
      var store = findDvaStore(false) || findStoreViaFiber(false) || findStoreViaGApp();
      if (!store) return out;
      var st = store.getState();
      /* v8.0.6：2.x 取 st.player；3.x 取 st.playing（InfLink v3 同源） */
      var pl = (st && st.player && typeof st.player === 'object') ? st.player
             : (st && st.playing && typeof st.playing === 'object') ? st.playing : null;
      if (!pl) return out;
      if (typeof pl.isPlaying === 'boolean') out.playing = pl.isPlaying;
      else if (typeof pl.playing === 'boolean') out.playing = pl.playing;
      else if (typeof pl.playingState === 'number') out.playing = pl.playingState === 2;
      /* 3.x playing 结构：resourceTrackId/resourceName/resourceArtists */
      if (pl.resourceTrackId != null && !out.song) {
        out.song = {
          id: Number(pl.resourceTrackId) || 0,
          name: typeof pl.resourceName === 'string' ? pl.resourceName : '',
          artist: (pl.resourceArtists && pl.resourceArtists[0] && pl.resourceArtists[0].name) || '',
          album: (pl.curTrack && pl.curTrack.album && pl.curTrack.album.name) || ''
        };
      }
      var posCands = [pl.position, pl.progress, pl.currentTime];
      for (var i = 0; i < posCands.length; i++) {
        var p = Number(posCands[i]);
        if (isFinite(p) && p > 0 && p < 86400) { out.position = p; break; }
      }
      var songCands = [
        pl.meta && pl.meta.currentSong, pl.currentSong, pl.meta && pl.meta.song,
        pl.song, pl.musicInfo, pl.currentMusic
      ];
      for (var j = 0; j < songCands.length; j++) {
        var s = songCands[j];
        if (s && typeof s === 'object') {
          var name = s.name || s.title || '';
          var pic = s.picUrl || (s.album && s.album.picUrl) || '';
          var id = Number(s.id || s.songId || 0);
          if ((name || id) && !out.song) {
            var artists = [];
            if (Array.isArray(s.artists)) artists = s.artists;
            else if (Array.isArray(s.ar)) artists = s.ar;
            else if (s.artist) artists = [s.artist];
            var artNames = artists.map(function (a) { return (a && (a.name || a.nickname)) || ''; })
              .filter(function (x) { return !!x; });
            out.song = {
              songId: id,
              title: String(name).slice(0, 200),
              artist: artNames.slice(0, 5).join('/').slice(0, 200),
              album: String((s.album && s.album.name) || s.album || '').slice(0, 200),
              pic: pic ? String(pic).slice(0, 500) : '',
              durationMs: Number(s.duration || (s.album && s.album.duration) || 0) || 0
            };
            break;
          }
        }
      }
    } catch (e) { /* store 读取异常按无处理 */ }
    return out;
  }

  /* 阶梯合成：store → mediaSession → DOM（低阶只补前级空缺） */
  function readLadderMeta() {
    var store = readStore();
    var song = store.song;
    var msMeta = song ? null : readMediaSession();
    var domMeta = (song || msMeta) ? null : scrapeBar();
    var src = song ? 'store' : (msMeta ? 'ms' : (domMeta ? 'dom' : ''));
    var songOut = null;
    if (song || msMeta || domMeta) {
      var base = song || { title: '', artist: '', album: '', pic: '', songId: 0, durationMs: 0 };
      var fill = song ? null : (msMeta || domMeta);
      songOut = {
        songId: base.songId || 0,
        title: base.title || (fill && fill.title) || '',
        artist: base.artist || (fill && fill.artist) || '',
        album: base.album || (fill && fill.album) || '',
        pic: base.pic || (fill && fill.pic) || '',
        durationMs: base.durationMs || 0
      };
    }
    return { song: songOut, src: src };
  }

  /* ------------------------------------------------------------------ */
  /* 歌词（与歌词源插件协作：cc:lyric-req → cc:lyric-res）                  */
  /* v8.0.4：hub /api/lyric 是单槽缓存——切歌后新词到达前，页面拉到的必然是
     旧词；旧版不推不清，页面就看到上一首的词一直滚。现在 requestLyric
     先推 pending 占位清槽；曲键（songId|title）变化即重拉；暂停态对无
     逐字结果节流重查升级真 yrc（用户指定校准管线）。                    */
  /* ------------------------------------------------------------------ */
  var lyric = { songId: 0, payload: null, pendingId: 0, pendingAt: 0, done: {},
    refineAt: 0, refineTries: 0 };

  window.addEventListener('cc:lyric-res', function (ev) {
    try {
      var d = ev.detail || {};
      if (d.reqId !== lyric.pendingId) return;
      if (d.songId !== lyric.songId) return;
      /* 升级保护：已有带 yrc 的结果时不被无逐字结果降级 */
      var better = d.payload && (d.payload.yrc || d.payload.lrc) &&
        !(lyric.payload && lyric.payload.yrc && !d.payload.yrc);
      if (better) {
        lyric.payload = d.payload;
        pushLyric();
      }
      lyric.pendingAt = 0;
    } catch (e) { /* 忽略坏应答 */ }
  }, false);

  function pushLyricPending(songId) {
    if (!hub.port) return;
    /* 占位清槽：页面端 songId 强校验 + 空 yrc/lrc → 走重试分支，绝不渲染旧词 */
    jpost(hub.url('/api/lyric'), { ok: true, lyric: {
      songId: songId, pending: true, title: '', artist: '',
      yrc: '', ytlrc: '', lrc: '', tlyric: '', source: 'pending', rev: 'p-' + songId
    } });
  }

  function requestLyric(songId, title, artist, force) {
    lyric.songId = songId;
    if (!force) lyric.refineTries = 0;
    if (lyric.done[songId]) { lyric.payload = lyric.done[songId]; pushLyric(); return; }
    lyric.payload = null;
    pushLyricPending(songId); /* 立即清 hub 单槽旧词（切歌滞留根治） */
    if (!songId) return;
    lyric.pendingId++;
    lyric.pendingAt = nowMs();
    try {
      window.dispatchEvent(new CustomEvent('cc:lyric-req', {
        detail: { songId: songId, reqId: lyric.pendingId, force: force === true,
          title: clip(String(title || ''), 120), artist: clip(String(artist || ''), 120),
          want: ['yrc', 'ytlrc', 'lrc', 'tlyric'] }
      }));
    } catch (e) { /* 歌词源缺席 */ }
  }

  function pushLyric() {
    if (!hub.port || !lyric.payload) return;
    if (lyric.payload.songId) lyric.done[lyric.payload.songId] = lyric.payload;
    var keys = Object.keys(lyric.done);
    if (keys.length > 4) delete lyric.done[keys[0]]; /* LRU 4 首 */
    jpost(hub.url('/api/lyric'), { ok: true, lyric: lyric.payload });
  }

  /* ------------------------------------------------------------------ */
  /* 枢纽客户端                                                            */
  /* ------------------------------------------------------------------ */
  var hub = { port: 0, version: '', failStreak: 0, lastPing: 0 };

  function jget(url, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var ctl = null;
      try { ctl = new AbortController(); } catch (e) { ctl = null; }
      var timer = setTimeout(function () {
        if (done) return; done = true; resolve(null);
        try { if (ctl) ctl.abort(); } catch (e) { }
      }, timeoutMs || 2600);
      try {
        fetch(url, { signal: ctl ? ctl.signal : undefined })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (done) return; done = true; clearTimeout(timer); resolve(j);
          })
          .catch(function () {
            if (done) return; done = true; clearTimeout(timer); resolve(null);
          });
      } catch (e) { if (!done) { done = true; clearTimeout(timer); resolve(null); } }
    });
  }

  function jpost(url, bodyObj, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var ctl = null;
      try { ctl = new AbortController(); } catch (e) { ctl = null; }
      var timer = setTimeout(function () {
        if (done) return; done = true; resolve(null);
        try { if (ctl) ctl.abort(); } catch (e) { }
      }, timeoutMs || 2500);
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj),
          signal: ctl ? ctl.signal : undefined
        })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (done) return; done = true; clearTimeout(timer); resolve(j);
          })
          .catch(function () {
            if (done) return; done = true; clearTimeout(timer); resolve(null);
          });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); resolve(null); }
      }
    });
  }

  hub.url = function (path) { return 'http://127.0.0.1:' + hub.port + path; };

  async function discoverHub() {
    for (var i = 0; i < HUB_PORTS.length; i++) {
      var p = HUB_PORTS[i];
      var j = await jget('http://127.0.0.1:' + p + '/api/ping', 1800);
      if (j && j.ok === true && j.name === HUB_NAME) {
        hub.port = p;
        hub.version = clip(String(j.version || ''), 16);
        hub.lastPing = nowMs();
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* 控制执行（主路 InfLinkApi → 延时验证 → 直发 dva → 元素/按钮，单次执行律） */
  /* v8.0.2 实机对症：InfLink 控制面 = this.reduxStore?.dispatch（play/pause/
   * next/prev/seek 全是），在部分 NCM 3.x 版本上这些 action 被 reducer 静默忽略
   * （同一 store 的读取却正常——现场即「数据活、按钮全死」）。故每次下发后
   * 延时验证「真翻转」，不动则降级：①直发 dva action（动词逐字抄 InfLink 3.2.11）
   * ②audio 元素 ③可见按钮。命令代数号闸：新命令到达即作废旧验证链。      */
  /* ------------------------------------------------------------------ */
  var seekAck = { id: '', ok: null, at: 0 };
  var lastCmdDone = {};
  var maxCmdId = 0; /* v8.0.6：hub 重启 _id 回退检测 */
  /* v8.0.8 回路自证 + 轮询计数：命令回路断裂从猜测变成可见事实 */
  var selftest = { pendingAt: 0, ok: true, failStreak: 0, lastOkAt: 0, lastFailAt: 0, note: '' };
  var pollStat = { drains: 0, delivered: 0, emptyStreak: 0, lastCount: 0, lastGetAt: 0, lastNullAt: 0 };
  var cmdSeq = 0;
  var cmdTrace = [];
  /* v8.0.4 命令回执：随 /api/state 透出（控制可观测——面板端直读归因） */
  var cmdLast = { id: 0, type: '', ok: null, path: '', at: 0 };

  function traceCmd(kind, detail) {
    cmdTrace.push({ at: nowMs(), k: clip(String(kind || ''), 12), d: clip(String(detail || ''), 80) });
    if (cmdTrace.length > 20) cmdTrace.shift();
  }

  function markCmd(id, type, ok, path) {
    cmdLast.id = Number(id) || 0;
    cmdLast.type = clip(String(type || ''), 16);
    cmdLast.ok = (ok === true || ok === false) ? ok : null;
    cmdLast.path = clip(String(path || ''), 16);
    cmdLast.at = nowMs();
  }

  /* v8.0.6 控制优先级反转：fiber（InfLink v3 同款 #root 遍历）第一——
     与系统卡片按钮的 dispatch 同源等效；webpack/dva/g_app 依次殿后 */
  function controlStore() {
    var st = null;
    try { st = findStoreViaFiber(true) || findDvaStore(true) || findStoreViaGApp(); } catch (e0) { st = null; }
    if (st && typeof st.dispatch === 'function') return st;
    return null;
  }

  function reduxDispatch(type, payload) {
    var st = controlStore();
    if (!st) { traceCmd('redux', 'no-store:' + type); return false; }
    try {
      var act = { type: type };
      if (payload) act.payload = payload;
      st.dispatch(act);
      traceCmd('redux', type);
      return true;
    } catch (e) { traceCmd('redux', 'throw:' + type); return false; }
  }

  function linkStatus() {
    if (inflink.api && typeof inflink.api.getPlaybackStatus === 'function') {
      try {
        var s = inflink.api.getPlaybackStatus();
        if (typeof s === 'string' && s) return s;
      } catch (e) { /* 状态缺席 */ }
    }
    return '';
  }

  function songKey() { return truth.songId + '|' + truth.title; }

  /* 方向真值（v8.0.5 仲裁律——e2e B3 台架实锤的假 'link' 回执根因）：
     ①linkStatus() 实时读 playState 是唯一无陈旧窗口的信号，第一优先；
     ②唯一例外 = v8.0.2 冻结病（playState 恒 Paused 而进度在推进）：
       真值快照带 inflink+heal 标记且新鲜 → heal 铁证赢过冻结的实时值；
     ③探测前遗留的无源帧（src=none，playing 继承自初始化假值）绝不可信；
     ④InfLink 缺席 → 新鲜真值 → audio 元素 → 继承值。 */
  /* 方向真值（v8.0.6 修订）：
     ①执行前方向判定 playingNowCalc()：实时 linkStatus 第一优先 + 冻结病仲裁；
     ②执行后验证 linkNow()：只信 InfLink 实时状态，零仲裁——v8.0.6 e2e 台架
       实锤：首拍无源帧（position=0）→ toggle 拍跳变 12.3s → 自愈误标
       inflink+heal → 900ms 验证被仲裁判败 → 主路误降级。执行后验证绝不信快照。 */
  function linkNow() {
    var st = linkStatus();
    if (st) return st === 'Playing' || st === 'Loading';
    return playingNowCalc();
  }

  function playingNowCalc() {
    var fresh = !!(truth.updatedAt && nowMs() - truth.updatedAt < 2500);
    var st = linkStatus();
    if (st) {
      var live = (st === 'Playing' || st === 'Loading');
      if (fresh && truth.playing !== live) {
        if (truth.playing && truth.src === 'inflink+heal') return true; /* 冻结病仲裁 */
        return live; /* 无源帧/其他分歧 → 信实时 */
      }
      return live;
    }
    if (fresh) return truth.playing;
    var el = getAudio();
    if (el) return !el.paused && !el.ended;
    return truth.playing;
  }

  function apiToggle(playing) {
    var api = inflink.api;
    if (!api) { traceCmd('link', 'absent'); return false; }
    try {
      if (playing) {
        if (typeof api.pause === 'function') { api.pause(); traceCmd('link', 'pause-called'); return true; }
      } else {
        if (typeof api.play === 'function') { api.play(); traceCmd('link', 'play-called'); return true; }
      }
      traceCmd('link', 'no-method');
    } catch (e) { traceCmd('link', 'throw'); }
    return false;
  }

  function apiSeek(posSec) {
    var api = inflink.api;
    if (!api || typeof api.seekTo !== 'function') { traceCmd('link', 'seek-noapi'); return false; }
    try {
      api.seekTo(Math.round(posSec * 1000)); /* InfLink 律：毫秒 */
      traceCmd('link', 'seek-called');
      return true;
    } catch (e) { traceCmd('link', 'seek-throw'); return false; }
  }

  function elemToggle(el, wantPlay) {
    try {
      if (wantPlay) {
        var pr = el.play();
        if (pr && typeof pr.catch === 'function') {
          pr.catch(function () { clickSeq(visibleBtn(BTN_PLAY)); }); /* 自动播放策略拒绝 → 按钮 */
        }
      } else {
        el.pause();
      }
      return true;
    } catch (e) { return false; }
  }

  function execCommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return;
    var type = clip(cmd.cmd || cmd.type, 16);
    if (!type) return; /* 坏命令（raw 解析失败等）直接丢 */
    /* v8.0.8 回路自证命令：只记账不执行——它是桥自己投给自己队列的探针 */
    if (type === '_selftest') {
      selftest.pendingAt = 0;
      selftest.ok = true;
      selftest.failStreak = 0;
      selftest.lastOkAt = nowMs();
      selftest.note = 'loop';
      traceCmd('selftest', 'loop-ok');
      return;
    }
    /* v8.0.6 幂等闸回退防护：hub 重启后 g_cmdNextId 归零重计，桥侧
       lastCmdDone 残留旧世代 _id 会把新命令当重复静默吞掉（trace 都
       不会留）——检测到 _id 回退即清空旧世代记录 */
    var cid = Number(cmd._id) || 0;
    if (cid && maxCmdId && cid < maxCmdId) {
      lastCmdDone = {};
      traceCmd('reset', 'hub-id-rewind');
    }
    if (cid > maxCmdId) maxCmdId = cid;
    if (lastCmdDone[cmd._id]) return; /* 幂等闸：同一条命令只执行一次 */
    lastCmdDone[cmd._id] = true;
    var keys = Object.keys(lastCmdDone);
    if (keys.length > 64) delete lastCmdDone[keys[0]];

    probeInflight(); /* 双保险：执行前刷新 InfLinkApi 在场状态 */
    var seq = ++cmdSeq;
    traceCmd('cmd', type + '#' + (cmd._id != null ? cmd._id : '?'));
    markCmd(cmd._id, type, null, 'recv'); /* 回执：桥已收到（可观测起点） */

    if (type === 'play' || type === 'pause' || type === 'toggle') {
      var before = playingNowCalc();
      var wantPlay = type === 'play' ? true : type === 'pause' ? false : !before;
      if (wantPlay === before) { traceCmd('skip', 'already'); markCmd(cmd._id, type, true, 'skip'); return; } /* 已处目标态 */
      apiToggle(before); /* 主路：InfLink（与系统卡片按钮同路的 redux 派发） */
      /* +900ms 验证：播放态真翻转则收工；未翻转 → 直发 dva → 元素 → 按钮 */
      setTimeout(function () {
        if (seq !== cmdSeq) return;
        if (playingNowCalc() === wantPlay) { traceCmd('ok', 'link'); markCmd(cmd._id, type, true, 'link'); return; }
        reduxDispatch(wantPlay ? 'playing/resume' : 'playing/pause', { triggerScene: 'desktopLyric' });
        setTimeout(function () {
          if (seq !== cmdSeq) return;
          if (playingNowCalc() === wantPlay) { traceCmd('ok', 'redux'); markCmd(cmd._id, type, true, 'redux'); return; }
          var el = getAudio();
          if (el) elemToggle(el, wantPlay);
          /* v8.0.3：+700ms 复验——元素自身 paused 也算数（播放态真值可能冻结）；
             双真值都未达预期才走按钮，防双翻转（元素已停再点按钮=恢复播放） */
          setTimeout(function () {
            if (seq !== cmdSeq) return;
            var elOk = null;
            var el2 = getAudio();
            if (el2) elOk = wantPlay ? !el2.paused : el2.paused;
            if (playingNowCalc() === wantPlay || elOk === true) {
              traceCmd('ok', elOk === true ? 'element' : 'late');
              markCmd(cmd._id, type, true, elOk === true ? 'element' : 'late');
              return;
            }
            clickSeq(visibleBtn(BTN_PLAY));
            traceCmd('fb', 'button');
            /* v8.0.6：媒体键兜底已退役（用户指令）——四路全灭即诚实失败，
               归因 path=button，面板芯片直读 cmdLast */
            markCmd(cmd._id, type, false, 'button');
          }, 700);
        }, 800);
      }, 900);
    } else if (type === 'next' || type === 'prev') {
      var dir = type === 'next' ? 'next' : 'prev';
      var flag = dir === 'next' ? 1 : -1;
      var key0 = songKey();
      var done = false;
      try {
        var api2 = inflink.api;
        if (api2 && (dir === 'next' ? typeof api2.next === 'function' : typeof api2.previous === 'function')) {
          if (dir === 'next') { api2.next(); traceCmd('link', 'next-called'); }
          else { api2.previous(); traceCmd('link', 'prev-called'); }
          done = true;
        }
      } catch (e2) { done = false; traceCmd('link', 'throw:' + dir); }
      if (!done) {
        /* InfLink 缺席：直接 redux（同动词）→ 末端按钮 */
        var ok1 = reduxDispatch('playingList/jump2Track', { flag: flag, type: 'call', triggerScene: 'hotKey' });
        if (!ok1) clickTransport(dir);
        markCmd(cmd._id, type, ok1 ? true : false, ok1 ? 'redux' : 'button');
        return;
      }
      /* +1200ms 验证：曲未变（单循环曲也极少原地）→ 直发 dva；再 +1100ms 仍原曲 → 按钮终点 */
      setTimeout(function () {
        if (seq !== cmdSeq) return;
        if (songKey() !== key0) { traceCmd('ok', 'link'); markCmd(cmd._id, type, true, 'link'); return; }
        reduxDispatch('playingList/jump2Track', { flag: flag, type: 'call', triggerScene: 'hotKey' });
        setTimeout(function () {
          if (seq !== cmdSeq) return;
          if (songKey() !== key0) { traceCmd('ok', 'redux'); markCmd(cmd._id, type, true, 'redux'); return; }
          clickTransport(dir);
          traceCmd('fb', 'button');
          /* v8.0.6：媒体键兜底已退役——诚实失败 */
          markCmd(cmd._id, type, false, 'button');
        }, 1100);
      }, 1200);
    } else if (type === 'seek') {
      var pos = clampNum(Number(cmd.position), 0, 86400);
      doSeek(pos);
      markCmd(cmd._id, type, null, 'seek');
    }
  }

  /* 备路：CEF 自动播放策略拒绝 el.play() 时，降级点击本体播放/暂停按钮。
     v8.0.3 套路升级：①完整指针序列（pointerdown→mousedown→pointerup→mouseup
     →click，部分 NCM 版本的 React 处理器监听鼠标事件而非 click）；
     ②候选选择器扩宽（aria-label/title 中文关键词，NCM 3.x DOM 改版兼容），
     误中保护：列表/队列类按钮（播放列表等）一律跳过。 */
  var BTN_PLAY = ['.btn-p-play', '#btn-play', '.j-play', '[data-action="play"]',
    '[aria-label*="播放"]', '[aria-label*="暂停"]', '[title*="播放"]', '[title*="暂停"]',
    '[class*="btn"][class*="play"]', '[class*="play"][class*="btn"]', '.play-btn', '.playBtn'];
  var BTN_NEXT = ['.btn-p-next', '#btn-next', '.j-next', '[data-action="next"]', '.next-btn',
    '[aria-label*="下一首"]', '[title*="下一首"]', '[class*="btn"][class*="next"]'];
  var BTN_PREV = ['.btn-p-previous', '#btn-previous', '.j-prev', '[data-action="previous"]', '.prev-btn',
    '[aria-label*="上一首"]', '[title*="上一首"]', '[class*="btn"][class*="prev"]'];

  function btnLabelOk(el) {
    try {
      var lab = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '';
      if (/列表|队列|清单|歌单/.test(lab)) return false; /* 误中保护：播放列表类按钮不碰 */
    } catch (e) { /* 属性异常按可用 */ }
    return true;
  }

  function visibleBtn(cands) {
    for (var i = 0; i < cands.length; i++) {
      var list = document.querySelectorAll(cands[i]);
      for (var j = 0; j < list.length; j++) {
        var b = list[j];
        if (b && b.offsetParent !== null && typeof b.click === 'function' && btnLabelOk(b)) return b;
      }
    }
    return null;
  }

  function clickSeq(el) {
    if (!el) return false;
    try {
      var opts = { bubbles: true, cancelable: true, view: window };
      var evs = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'];
      for (var i = 0; i < evs.length; i++) {
        try {
          var isPtr = evs[i].indexOf('pointer') === 0 && typeof PointerEvent === 'function';
          el.dispatchEvent(isPtr ? new PointerEvent(evs[i], opts) : new MouseEvent(evs[i], opts));
        } catch (e1) { /* 单事件失败继续 */ }
      }
      if (typeof el.click === 'function') { el.click(); return true; }
    } catch (e) { /* 点击异常 */ }
    return false;
  }

  function clickTransport(dir) {
    clickSeq(visibleBtn(dir === 'next' ? BTN_NEXT : BTN_PREV));
  }

  /* ---------------------------------------------------------------- */
  /* v8.0.6：native 媒体键兜底整体退役（用户指令）。OS 输入层重放方案   */
  /*   与 v8 宪法第 1 条（零 OS 干预）冲突，且系统卡片实测可控证明       */
  /*   InfLink 通路有效——修复重心回到桥端备路与遥测。                  */
  /* ---------------------------------------------------------------- */

  function doSeek(pos) {
    seekAck.id = 's-' + nowMs() + '-' + Math.floor(Math.random() * 999);
    seekAck.ok = null;
    seekAck.at = nowMs();
    var doneLink = apiSeek(pos);
    var el = getAudio();
    if (!doneLink && el && el.readyState !== 0) {
      var dur = el.duration || 0;
      if (dur > 0 && pos > dur) pos = dur;
      try {
        el.currentTime = pos; /* 备路唯一写点（单次执行律） */
      } catch (e) {
        seekAck.ok = false; seekAck.at = nowMs();
        return;
      }
    }
    if (!doneLink && !el) {
      /* v8.0.2：无元素可写时直发 dva 动词（InfLink 同款载荷，秒制） */
      reduxDispatch('playing/setPlayingPosition', { duration: Math.round(pos) });
      seekAck.ok = null; seekAck.at = nowMs(); /* 诚实未知，不假装成功 */
      return;
    }
    /* v8.0.9 读回校验 v2（用户实机：「拖动成功了却提示拖动不成功」）——
       旧版只读 audio 元素且仅 420/580ms 两拍：①元素缺席（NCM 3.x 常态）时
       ok 恒 null，但 ne.seekAckOk 把 null 塞成 false → 页面亮假失败芯片；
       ②网易云应用 seek 异步且 InfLink 时间线回传有延迟，两拍常常等不到。
       新版：读回源 = InfLink 时间线第一优先（页面所见即所验）+ 元素备源；
       耐心三拍 420/1000/2200ms；任一拍 |读回-pos|<2.5 即 ok=true；
       三拍全墨且存在读回源才 ok=false；全程无读回源保持 null（诚实未知，
       ne.seekAckKnown=false → 页面不再亮假失败芯片）。 */
    var tried = 0;
    function readPos() {
      var api = inflink.api;
      if (api && typeof api.getTimeline === 'function') {
        try {
          var tl = api.getTimeline();
          var cur = tl ? Number(tl.currentTime) : NaN;
          if (isFinite(cur) && cur >= 0) return cur / 1000;
        } catch (e0) { /* 时间线缺席，落元素 */ }
      }
      if (el) {
        try {
          var r = Number(el.currentTime);
          if (isFinite(r) && r >= 0) return r;
        } catch (e1) { /* 元素读回失败 */ }
      }
      return -1;
    }
    function check() {
      tried++;
      var r = readPos();
      if (r >= 0 && Math.abs(r - pos) < 2.5) {
        seekAck.ok = true; seekAck.at = nowMs();
        /* v8.3.5 读回终局即拍：真值（跳转后位置）立即推 hub，不等 BEAT_MS
           1s 节拍——页面护航窗（0.8s 收窗）提前 ~1s 拿到真值，seek 后歌词
           快速对齐（「跳转后要校准」根治的桥侧一刀）。 */
        setTimeout(function () { try { beat().catch(function () { }); } catch (eS) { } }, 60);
        return;
      }
      if (tried < 3) { setTimeout(check, tried === 1 ? 580 : 1200); return; }
      if (r >= 0) {
        seekAck.ok = false; seekAck.at = nowMs();
        /* v8.3.5：失败终局同样即拍——页面尽早诚实回锚（护航窗过期前） */
        setTimeout(function () { try { beat().catch(function () { }); } catch (eS2) { } }, 60);
      }
      /* r<0：全程无读回源 → ok 保持 null（诚实未知） */
    }
    setTimeout(check, 420);
  }

  /* ------------------------------------------------------------------ */
  /* 快照构建与心跳                                                        */
  /* ------------------------------------------------------------------ */
  var truth = {
    playing: false, position: 0, duration: 0,
    songId: 0, title: '', artist: '', album: '', pic: '',
    src: 'none', updatedAt: 0
  };

  function readTruth() {
    var t = nowMs();
    var hasLink = !!inflink.api; /* 探针已在 beat 顶部刷新，此处只读缓存 */

    /* 主源：InfLink-rs 三件套 */
    var linkOut = { playing: null, position: -1, duration: 0, song: null };
    var linkGot = hasLink ? readViaInflight(linkOut) : false;

    /* 备源：元素 + 阶梯（InfLink 缺席时全量，在场时只补空缺） */
    var playing = linkOut.playing;
    var position = linkOut.position;
    var duration = linkOut.duration;
    var metaSrc = '';

    var el = getAudio();
    if (!linkGot) {
      if (el) {
        if (playing === null) playing = !el.paused && !el.ended;
        if (position < 0) position = Number(el.currentTime) || 0;
        if (duration <= 0) {
          var d = Number(el.duration) || 0;
          if (isFinite(d) && d > 0) duration = d;
        }
        metaSrc = 'element';
      }
      var store = readStore();
      if (playing === null && store.playing !== null) { playing = store.playing; metaSrc += (metaSrc ? '+' : '') + 'store'; }
      if (position < 0 && store.position >= 0) { position = store.position; }
      /* 物理自愈：进度在走 = 在播放（阶梯路径专属；<1.2s 窗防暂停微抖；
         v8.0.6：上一拍必须非无源帧——src='none' 首拍 position 从 0 跳变
         不是「在播放」的铁证） */
      if (playing === false && position - truth.position > 1.2 && t - truth.updatedAt < 4000 &&
          truth.src !== 'none' &&
          (!truth.songId || !store.song || Number(store.song.songId) === truth.songId)) {
        playing = true;
      }
      var lad = readLadderMeta();
      metaSrc += lad.src ? (metaSrc ? '+' : '') + lad.src : '';
      var song = linkOut.song || lad.song;
      if (duration <= 0 && song && song.durationMs > 0) duration = song.durationMs / 1000;
      if (!linkOut.song && song) linkOut.song = song; /* 供下方统一取值 */
    } else {
      /* InfLink 在场：元数据/时长用 InfLink；位置单源化取元素真值。
         v8.1.0 锯齿根治：旧版「InfLink 时间线优先、空缺由元素补」——而
         InfLink getTimeline 上游（SMTC 位置上报）滞后元素真值 ~1s，且
         节流间隙/瞬时缺席时落到元素值，两源相差 ~1s 逐拍交替，页面端
         每拍 |Δ|≥0.35s 硬锚 → 进度 1 秒锯齿来回、歌词行边界反复横跳
         （真机录屏 1:05↔1:06 实锤）。现一律以 el.currentTime（帧级连续
         真值）为位置唯一源；元素缺席才回落 InfLink 时间线（源恒定单一，
         不再交替）。 */
      if (el) {
        var elCur = Number(el.currentTime);
        if (isFinite(elCur) && elCur > 0) position = elCur;
        if (duration <= 0) {
          var d2 = Number(el.duration) || 0;
          if (isFinite(d2) && d2 > 0) duration = d2;
        }
      }
      if (position < 0 && linkOut.position >= 0) position = linkOut.position;
      if (duration <= 0 && linkOut.song && linkOut.song.durationMs > 0) duration = linkOut.song.durationMs / 1000;
      /* v8.0.2 状态自愈：InfLink playState 冻结为 Paused 但时间线仍在推进
         （≥1.2s/拍、同曲、拍间陈旧 <4s）→ 按播放处理。只治假暂停，
         绝不反向伪造（缓冲/加载中交由 'Loading' 原义承载）。
         v8.0.6 收紧：上一拍必须已是 InfLink 源（src 以 inflink 开头）——
         首拍/源切换的无源帧 position=0 → 本拍 12.3s 的跳变不是「假暂停」，
         是无源→有源的正常建立，绝不自愈（e2e 台架实锤的误触发）。 */
      if (playing === false && position - truth.position > 1.2 &&
          t - truth.updatedAt < 4000 &&
          truth.src.indexOf('inflink') === 0 &&
          (!truth.songId || !linkOut.song || Number(linkOut.song.songId) === truth.songId)) {
        playing = true;
        metaSrc = 'inflink+heal';
      }
      metaSrc = metaSrc || 'inflink';
    }

    var song = linkOut.song;
    var songId = song && song.songId ? song.songId : (truth.songId || 0);
    var title = (song && song.title) || truth.title;
    var artist = (song && song.artist) || truth.artist;
    var album = (song && song.album) || truth.album;
    var pic = (song && song.pic) || truth.pic;
    /* v8.0.2：协议相对与 http 封面升级 https（页面端 https 源按 CSP/混合内容策略
       会丢弃 http 图 → 恒显默认底；126 CDN 双协议均可用） */
    if (pic && pic.indexOf('//') === 0) pic = 'https:' + pic;
    if (pic && /^http:\/\/[^\/]*music\.126\.net/i.test(pic)) pic = 'https://' + pic.slice(7);
    if (pic && pic.indexOf('?param=') < 0 && pic.indexOf('http') === 0) pic = pic + '?param=500y500';
    if (position < 0) position = 0;
    if (playing === null) playing = truth.playing;

    var changedSong = songId !== truth.songId && !!songId;
    /* v8.0.4 曲键切换检测：songId 变化 或（songId 同但 title 变，治 songId 恒 0
       的真值源）都触发歌词重拉——旧版只看 songId，恒 0 时永不重拉 */
    var metaKey = (songId || 0) + '|' + (title || '');
    var metaChanged = changedSong || metaKey !== (truth._metaKey || '');
    truth.playing = playing === true;
    truth.position = position;
    truth.duration = duration;
    truth.songId = songId || 0;
    truth.title = title || '';
    truth.artist = artist || '';
    truth.album = album || '';
    truth.pic = pic || '';
    truth.src = clip(metaSrc || (hasLink ? 'inflink' : 'none'), 32);
    truth.updatedAt = t;
    truth._metaKey = metaKey;

    if (metaChanged) requestLyric(truth.songId, truth.title, truth.artist, false);
    return truth;
  }

  function buildStateBlob() {
    return {
      ok: true,
      name: 'chushi-music-state',
      v: VER,
      ts: nowMs(),
      ne: {
        songId: truth.songId,
        title: truth.title,
        artist: truth.artist,
        album: truth.album,
        pic: truth.pic,
        position: Math.round(truth.position * 100) / 100,
        duration: Math.round(truth.duration * 100) / 100,
        playing: truth.playing,
        ts: truth.updatedAt,
        v: VER,
        src: truth.src,
        seekAckId: seekAck.id,
        seekAckOk: seekAck.ok === true,
        /* v8.0.9 三态诚实律：ok=null（无读回源）≠ 失败——页面端只在
           known=true 且 ok=false 时才亮「拖动未生效」芯片（假失败根治） */
        seekAckKnown: seekAck.ok !== null,
        seekAckAt: seekAck.at
      },
      /* v8.0.4 控制可观测：命令回执（面板/页面端直读归因，不再黑盒）
         v8.0.7：执行轨迹全量透传（20 条环形）+ 实例身份 + 租约态——
         页面侧诊断口从此能看到桥内部每一步，诊断盲区永久消灭 */
      cmd: { last: { id: cmdLast.id, type: cmdLast.type, ok: cmdLast.ok, path: cmdLast.path, at: cmdLast.at },
             trace: cmdTrace.slice() },
      /* v8.0.8 回路自证 + 轮询计数透传：页面诊断口一键定层 */
      selftest: { ok: selftest.ok === true, failStreak: selftest.failStreak,
                  at: selftest.lastOkAt || selftest.lastFailAt, note: selftest.note },
      poll: { drains: pollStat.drains, delivered: pollStat.delivered,
              emptyStreak: pollStat.emptyStreak,
              lastCount: pollStat.lastCount, lastGetAt: pollStat.lastGetAt,
              lastNullAt: pollStat.lastNullAt },
      who: POLL_ID,
      lease: leaseKnown ? (iHold ? 'holder' : 'standby') : 'legacy',
      /* smtcVer v8 语义 = InfLink-rs 版本（系统卡片提供方）；空 = 未装/未启用 */
      smtcVer: inflink.ver,
      inflinkVer: inflink.ver,
      version: hub.version,
      hubVer: hub.version
    };
  }

  var beatBusy = false;
  async function beat() {
    if (beatBusy) return;
    beatBusy = true;
    try {
      /* 1) 枢纽保活 */
      if (!hub.port || nowMs() - hub.lastPing > 20000) {
        var ok = await discoverHub();
        if (!ok) { hub.failStreak++; return; }
      }
      hub.failStreak = 0;

      /* 2) 探针先行：命令执行前必须刷新 InfLinkApi 在场状态
         （首拍/InfLink 重载后，命令执行不得落在空探针上） */
      probeInflight();

      /* 2.5) v8.0.7 轮询租约认领：粘性持有者唯一排空权——网易云残留进程/
         多进程注入的第二桥实例抢排 /api/cmd（排空式先到先得）是
         「POST ok + 桥状态活 + 回执永不出现」的唯一自洽解释。
         认领失败 = 备胎待命：不拉命令、不推状态、不写歌词
         （hub 侧同步把非持有者的 GET /api/cmd 拦为 []，双保险）。
         旧 hub 无 /api/poll（404 → ok!==true）→ legacy 全权模式。 */
      var pl = await jpost(hub.url('/api/poll'), { id: POLL_ID }, 1200);
      if (pl && pl.ok === true) {
        leaseKnown = true;
        iHold = pl.lease === true;
      } else {
        leaseKnown = false;
        iHold = true;
      }
      if (!iHold) return;

      /* 3) v8.1.3 状态推送先行：读真值 → 推状态提到命令链路之前——
         hub 半死时（响应秒级迟滞）旧序里状态推送排在 poll/selftest/cmds
         三次往返之后（最坏 ~7s/拍 → 页面 stateAge 长期 >6s → 恒定位置喂
         引擎 → 显示 2s 闪烁，真机录屏 18:28 实锤）；现页面数据源不再为
         命令链路让路，命令拉取延后的代价可控（命令低频且页面会重试）。 */
      readTruth();
      /* v8.0.4 暂停校准（用户指定管线）：当前词无逐字（纯行级/伪逐字降级）时，
         趁暂停每 30s 重查逐字源（至多 3 次/曲），拿到 yrc 即升级真逐字 */
      if (!truth.playing && lyric.payload && !lyric.payload.yrc && lyric.songId &&
          nowMs() - lyric.refineAt > 30000 && lyric.refineTries < 3) {
        lyric.refineAt = nowMs();
        lyric.refineTries++;
        requestLyric(lyric.songId, truth.title, truth.artist, true);
      }
      await jpost(hub.url('/api/state'), buildStateBlob(), 1500);

      /* 4) v8.0.8 回路自证：每 8s 向自己队列投一条 _selftest，验证 4s 内
         能从自己的排空里收回。收不回 = 命令回路断裂（拓扑漂移/队列被夺/
         hub 半死）→ 连续 2 败强制全端口重新发现 hub。 */
      var tNow = nowMs();
      if (selftest.pendingAt && tNow - selftest.pendingAt > SELFTEST_WAIT_MS) {
        selftest.pendingAt = 0;
        selftest.ok = false;
        selftest.failStreak++;
        selftest.lastFailAt = tNow;
        selftest.note = 'no-loopback';
        traceCmd('selftest', 'fail#' + selftest.failStreak);
        if (selftest.failStreak >= 2) {
          traceCmd('hub', 'rediscover');
          hub.port = 0; /* 下一拍全端口重探（discoverHub 粘性重建） */
          selftest.failStreak = 0;
        }
      }
      if (!selftest.pendingAt && tNow - Math.max(selftest.lastOkAt, selftest.lastFailAt) > SELFTEST_MS) {
        var stOk = await jpost(hub.url('/api/cmd'), { cmd: '_selftest', t: tNow }, 1200);
        if (stOk && stOk.ok === true) selftest.pendingAt = tNow;
        else { traceCmd('selftest', 'post-fail'); }
      }

      /* 5) 拉页面命令——v8.2.9 已拆出独立快排循环 drainCmds()（200ms 节拍）。
         beat 不再承担命令链路：状态推送再拥堵（hub 迟滞/超时）也不拖累
         命令执行（「按了暂停好久才暂停」根治）。协议律不变：
         hub 实物返回 [{"_id":N,"raw":{...}}]；租约门非持有者拦为 []。 */
    } catch (e) {
      hub.failStreak++;
    } finally {
      beatBusy = false;
    }
  }

  /* v8.2.9 专职命令快排（200ms 节拍，与 beat 解耦）：
     协议律 v8.0.1/v8.0.7/v8.0.8 全保留——[{"_id":N,"raw":{...}}] 双形兼容、
     URL 携带实例 id、租约门校验、失败落 trace + poll.lastNullAt。 */
  var drainBusy = false;
  function drainCmds() {
    if (drainBusy) return;
    if (!iHold || !hub.port) return;
    drainBusy = true;
    jget(hub.url('/api/cmd?id=' + POLL_ID), 900).then(function (cmds) {
      pollStat.lastGetAt = nowMs();
      if (Array.isArray(cmds)) {
        pollStat.drains++;
        pollStat.lastCount = cmds.length;
        pollStat.delivered += cmds.length;
        pollStat.emptyStreak = cmds.length ? 0 : (pollStat.emptyStreak + 1);
        for (var c = 0; c < cmds.length; c++) {
          var item = cmds[c];
          try {
            var obj = item;
            if (item && item.raw != null) {
              obj = (typeof item.raw === 'string') ? JSON.parse(item.raw) : item.raw;
            }
            if (obj && obj._id == null && item && item._id != null) obj._id = item._id;
            execCommand(obj);
          } catch (e) {
            /* v8.0.8：坏命令不再纯静默——落 trace 便于诊断（含 raw 解析抛） */
            traceCmd('badcmd', (item && item._id != null ? '#' + item._id : '?') + ' ' + (e && e.message ? String(e.message).slice(0, 40) : 'parse'));
          }
        }
      } else {
        pollStat.lastNullAt = nowMs();
        pollStat.emptyStreak++;
        /* 拉取失败防刷屏（200ms 节拍下 25 次 = 5s 一条） */
        if (pollStat.emptyStreak % 25 === 1) traceCmd('pull-fail', 'non-array');
      }
    }).catch(function () {
      pollStat.lastNullAt = nowMs();
    }).finally(function () {
      drainBusy = false;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 启动                                                                  */
  /* ------------------------------------------------------------------ */
  function start() {
    readTruth();
    beat().finally(function () { });
    setInterval(function () { beat(); }, BEAT_MS);
    /* v8.2.9 命令快排循环：200ms 专职排空（与状态推送 beat 完全解耦） */
    setInterval(function () { drainCmds(); }, DRAIN_MS);
    /* v8.3.5 后台抗节流心跳（「下一首歌已播一半才显示 + 控制没效果」根治）：
       上面两组 setInterval 跑在网易云 CEF 页面主线程——网易云窗口最小化/
       完全遮挡时 Chromium 对隐藏页 DOM timer 强节流（intensive throttling
       链式定时器可至 1/min）→ 桥停摆：状态不推（面板/浮窗卡旧歌）、
       命令不拉（控制无响应），窗口回前台才恢复（用户实测「下一首歌已播
       一半才显示」的分钟级延迟即此）。Worker 的 timer 不在隐藏页节流域——
       blob Worker 定时 postMessage 唤醒主线程（message 是任务不是 timer，
       不节流）跑 beat/drainCmds。原 setInterval 保留兜底：Worker 创建失败
       （CEF 禁用/安全策略）或被杀时退回旧行为；双驱动无害（beatBusy/
       drainBusy 幂等守卫，重复触发被挡）。onerror 自毁退回纯 interval。 */
    var hbWorker = null;
    try {
      var hbSrc = 'setInterval(function(){postMessage(1)},' + BEAT_MS + ');' +
                  'setInterval(function(){postMessage(2)},' + DRAIN_MS + ');';
      hbWorker = new Worker(URL.createObjectURL(
        new Blob([hbSrc], { type: 'text/javascript' })));
      hbWorker.onmessage = function (e) {
        if (e.data === 1) { try { beat().catch(function () { }); } catch (eB) { } }
        else if (e.data === 2) { try { drainCmds(); } catch (eD) { } }
      };
      hbWorker.onerror = function () {
        try { hbWorker.terminate(); } catch (eT) { }
        hbWorker = null;
        traceCmd('hb', 'worker-down:legacy-interval');
      };
    } catch (eHB) {
      hbWorker = null;
      traceCmd('hb', 'worker-no:legacy-interval');
    }
    /* 歌词请求超时重试（v8.0.7：备胎待命时不重试——歌词写入权也归持有者） */
    setInterval(function () {
      if (!iHold) return;
      if (lyric.pendingAt && nowMs() - lyric.pendingAt > 4000) {
        lyric.pendingAt = 0;
        requestLyric(lyric.songId);
      }
    }, 5000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 1500);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 1500); });
  }
})();
