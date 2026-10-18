/* ============================================================================
 * 「初始」资源嗅探全局浮窗 sniffer-float v2（v8.7.115 / v8.7.128 自愈）
 * ----------------------------------------------------------------------------
 * v8.7.128 浮窗出现链自愈（用户实测「浮窗在 B 站页面不出现、平台专下载
 *   全没了」）：出现链原有多处单点静默死亡——①boot 的 ask 无应答（SW 唤醒
 *   /休眠竞态丢包）即永久放弃且后续 sniffer-new 全被丢弃；②开启亮窗完全
 *   依赖 SW 广播，丢失则已开页面永不亮窗。自愈五律：ask 退避重试 3 轮 /
 *   sniffer-new 到达即重问（SW 只在开启时推送，收到即证 on=true）/
 *   storage snifferOn=true 本地兜底 boot / visibilitychange 切页重问
 *   （30s 节流）/ bili+yt 解析 sw-offline 粘滞错误改可重试（2s 后开面板
 *   自动重试，真失败仍终态防抖）。SW 侧配合：冷启动 sniffOn=true 时
 *   sniffAnnounceOn 补播（ext-bg.js）。
 * 数据面：ext-bg.js（SW）注册 webRequest 监听 → 按标签页归集可下载资源
 *   （chrome.storage.session 持久，SW 复活后重建）→ tabs.sendMessage 推送
 *   到本内容脚本。本脚本只做三件事：圆形浮球、资源面板、发现提示（toast）。
 * 消息面（runtime/tabs sendMessage，type 判别，其它脚本的陌生消息静默忽略）：
 *   浮球 → SW：{type:"sniffer-ask"}                  初挂载拉全量状态
 *              {type:"sniffer-clear"}                清空本标签页资源
 *              {type:"sniffer-download",url,filename} SW 代理 chrome.downloads
 *   SW → 浮球：{type:"sniffer-new",items}             新资源（全量列表随行）
 *              {type:"sniffer-off"}                  开关已关 → 自毁
 * 兜底：chrome.storage.onChanged 直接盯 snifferOn（SW 短暂离线也不漏关）。
 * UI 律：
 *   · 全部进 closed ShadowRoot——页面 CSS/主题永远摸不到浮窗；
 *   · 浮球可拖拽（pointer 事件，>4px 算拖），落点持久化 localStorage
 *     （按 origin 天然分域）；点击展开面板；
 *   · 计数徽标（发现提示 toast 已在 v8.7.115 退役，toast 仅服务下载/捕获反馈）；
 *   · z-index 恒顶（2147483647），不注册任何全局点击拦截，页面零打扰。
 * v8.7.112 缓存抓取区（面板内第三区块）：数据面在 sniffer-bridge.js
 *   （同 ISOLATED world，window.__chushiCatchApi 直调）——本脚本只做
 *   「开始/停止 / 从头捕获 / 下载数据」三钮与状态行；捕获中的实时尺寸
 *   靠桥发的 CustomEvent chushi-catch-state（500ms 节流）回刷面板。
 * v8.7.115 三改（用户指令）：
 *   ①抖音完整视频下载区（对齐 B 站/YouTube 区形态）：抖音播放器是渐进式
 *     MP4 单直链（XHR 拉 /aweme/v1/play/ → douyinvod 等 CDN，无 MSE 分档），
 *     直链由嗅探管线自动入库——本区从资源列表里取最新的抖音域族视频直链
 *     一键下（文件名用页面标题＝视频描述）；Referer 由 SW 侧 DNR 会话
 *     规则（ext-bg ensureDnrDouyin）补齐，CDN 鉴权不再拒。
 *   ②缓存抓取「完成后自动下载」开关（chrome.storage.local
 *     snifferCatchAutoDl 全局偏好，桥在完成点读取执行）。
 *   ③删除「嗅探到 N 个可下载资源」发现提示 toast（徽标与面板计数保留）。
 * v8.7.53 面板布局重排（用户：「各种信息堆在一起太乱了」）：头部 = 图标+
 *   标题+计数徽章+图标动作钮（清空/收起）；列表项 = 类型色块（title 全称）+
 *   文件名/「大小 · 来源域名」两行分层；空态图标+双行文案。
 * 幂等律：isolated world 顶层守卫 __chushiSnifferMounted 防重复注入
 *   （manifest 注入 + SW 补针双路径同世界共存）。v8.7.128 升级为版本戳：
 *   同版本重复注入幂等早退；**异版本（扩展更新）落进的注入先拆旧宿主再
 *   挂新浮窗**——旧律裸真值守卫会把更新后的旧标签页钉死在孤儿旧浮窗上
 *   （旧脚本 chrome.runtime 已失效：不亮/点击无响应/平台专区全失联，
 *   用户感知即「更新后浮窗没了」，须逐页手动刷新才恢复）。
 * ==========================================================================*/
(function () {
  "use strict";
  var MOUNT_VER = "v8.7.128";
  if (window.__chushiSnifferMounted === MOUNT_VER) return;
  /* 旧挂载残迹判定：v8.7.127 及更早是布尔 true，128 起是版本串——
     两者皆视作「页面上可能留有旧宿主」，更新换代时整体拆除 */
  var hadStale = !!window.__chushiSnifferMounted;
  window.__chushiSnifferMounted = MOUNT_VER;
  /* 更新换代：旧版本（任意旧版）宿主整体拆除——旧脚本残余监听器持有
     的引用全部落空即自然退场，新浮窗干净接管 */
  if (hadStale) {
    try {
      var stale = document.querySelectorAll("#chushi-sniffer-host");
      for (var si = 0; si < stale.length; si++) stale[si].parentNode && stale[si].parentNode.removeChild(stale[si]);
    } catch (e) { /* noop */ }
  }

  var POS_KEY = "chushi-sniffer-pos";
  var TYPE_META = {
    video:  { label: "V", color: "#ef4444", name: "视频" },
    audio:  { label: "A", color: "#f59e0b", name: "音频" },
    image:  { label: "I", color: "#10b981", name: "图片" },
    pdf:    { label: "P", color: "#8b5cf6", name: "PDF" },
    doc:    { label: "D", color: "#3b82f6", name: "文档" },
    archive:{ label: "Z", color: "#64748b", name: "压缩包" },
    stream: { label: "S", color: "#ec4899", name: "流" },
    file:   { label: "F", color: "#64748b", name: "文件" },
  };

  var state = {
    on: false,
    items: [],
    panelOpen: false,
    booted: false,   /* 首次拿到状态 */
    toastTimer: 0,
    /* v8.7.69 B 站完整视频下载（仅 B 站视频页出现；SPA 导航换 BV 重置） */
    bili: { bvid: "", page: 1, pages: 0, resolving: false, resolved: null, error: "", downloading: 0 },
    /* v8.7.71 YouTube 完整视频下载（仅 watch 页出现；SPA 导航换视频重置） */
    yt: { vid: "", resolving: false, resolved: null, error: "", downloading: 0, progress: null },
    /* v8.7.112 缓存抓取：状态由桥的 info()/CustomEvent 推送，这里只存 toast 去重用备注 */
    catchNote: "",
  };

  /* ---------- Shadow DOM 舞台 ---------- */
  var host = document.createElement("div");
  host.id = "chushi-sniffer-host";
  host.style.cssText =
    "position:fixed;inset:0 auto auto 0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  var root = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  var css = [
    ".float-root{position:fixed;pointer-events:none;font-family:-apple-system,'PingFang SC','Microsoft YaHei UI','Microsoft YaHei',system-ui,sans-serif;}",
    ".ball{pointer-events:auto;position:fixed;width:44px;height:44px;border-radius:999px;",
    "display:flex;align-items:center;justify-content:center;cursor:grab;user-select:none;-webkit-user-select:none;",
    "background:rgba(255,255,255,.72);backdrop-filter:blur(12px) saturate(1.5);-webkit-backdrop-filter:blur(12px) saturate(1.5);",
    "border:1px solid rgba(24,22,36,.12);box-shadow:0 4px 18px rgba(0,0,0,.18);color:#3f3f46;",
    "transition:box-shadow .25s ease,transform .18s cubic-bezier(.22,1,.36,1);will-change:transform;touch-action:none;}",
    ".ball:hover{box-shadow:0 6px 24px rgba(0,0,0,.25);}",
    ".ball.drag{cursor:grabbing;transition:none;}",
    ".ball:active{transform:scale(.94);}",
    ".ball svg{width:19px;height:19px;pointer-events:none;}",
    ".badge{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;",
    "background:var(--acc,#8b5cf6);color:#fff;font-size:10px;font-weight:600;line-height:17px;text-align:center;",
    "box-shadow:0 1px 4px rgba(0,0,0,.25);display:none;}",
    ".badge.show{display:block;}",
    ".panel{pointer-events:auto;position:fixed;width:280px;max-height:420px;display:flex;flex-direction:column;",
    "border-radius:14px;background:rgba(255,255,255,.9);backdrop-filter:blur(20px) saturate(1.6);-webkit-backdrop-filter:blur(20px) saturate(1.6);",
    "border:1px solid rgba(24,22,36,.12);box-shadow:0 12px 40px rgba(0,0,0,.22);color:#27272a;",
    "opacity:0;visibility:hidden;transform:translateY(6px) scale(.98);transition:opacity .22s ease,transform .22s cubic-bezier(.22,1,.36,1),visibility 0s linear .22s;}",
    ".panel.open{opacity:1;visibility:visible;transform:none;transition:opacity .22s ease,transform .22s cubic-bezier(.22,1,.36,1);}",
    /* v8.7.53 布局重排：头部 = 图标标题+计数徽章+图标动作钮；列表项 =
       类型色块 + 文件名/元信息两行分层；杜绝信息全堆一行 */
    ".ph{display:flex;align-items:center;gap:7px;padding:11px 12px 10px;border-bottom:1px solid rgba(24,22,36,.07);}",
    ".ph .ico{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:8px;background:color-mix(in srgb,var(--acc,#8b5cf6) 12%,transparent);color:var(--acc,#8b5cf6);}",
    ".ph .ico svg{width:13px;height:13px;}",
    ".ph .t{font-size:12px;font-weight:500;letter-spacing:.04em;}",
    ".cnt{flex-shrink:0;min-width:20px;height:16px;padding:0 5px;border-radius:999px;background:color-mix(in srgb,var(--acc,#8b5cf6) 14%,transparent);color:var(--acc,#8b5cf6);font-size:9.5px;font-weight:600;line-height:16px;text-align:center;}",
    ".ph .sp{flex:1;}",
    ".ph .ib{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;border-radius:7px;background:none;color:#a1a1aa;cursor:pointer;transition:background .15s ease,color .15s ease;}",
    ".ph .ib:hover{background:rgba(24,22,36,.06);color:#52525b;}",
    ".ph .ib svg{width:13px;height:13px;}",
    ".list{overflow-y:auto;padding:7px;scrollbar-width:thin;}",
    ".list::-webkit-scrollbar{width:5px;}.list::-webkit-scrollbar-thumb{background:rgba(24,22,36,.15);border-radius:999px;}",
    ".empty{padding:26px 12px 24px;text-align:center;color:#a1a1aa;}",
    ".empty svg{width:20px;height:20px;display:block;margin:0 auto 8px;opacity:.6;}",
    ".empty .e1{font-size:11px;font-weight:400;color:#71717a;margin-bottom:3px;}",
    ".empty .e2{font-size:9.5px;font-weight:300;line-height:1.6;}",
    ".item{display:flex;align-items:center;gap:9px;padding:8px;border-radius:10px;}",
    ".item:hover{background:rgba(24,22,36,.045);}",
    ".tag{flex-shrink:0;width:22px;height:22px;border-radius:7px;color:#fff;font-size:10px;font-weight:700;line-height:22px;text-align:center;}",
    ".meta{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px;}",
    ".meta .nm{font-size:11.5px;font-weight:450;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".meta .sub{font-size:9.5px;font-weight:300;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".act{flex-shrink:0;display:flex;gap:2px;}",
    ".act button{border:0;background:none;padding:4px;border-radius:7px;cursor:pointer;color:#71717a;}",
    ".act button:hover{background:rgba(24,22,36,.07);color:#27272a;}",
    ".act svg{width:13px;height:13px;display:block;}",
    ".act button.ok{color:#10b981;}",
    ".toast{pointer-events:none;position:fixed;padding:8px 14px;border-radius:999px;font-size:11.5px;font-weight:300;letter-spacing:.03em;",
    "background:rgba(39,39,42,.92);color:#fafafa;box-shadow:0 6px 24px rgba(0,0,0,.25);",
    "opacity:0;transform:translateY(6px);transition:opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1);}",
    ".toast.show{opacity:1;transform:none;}",
    /* v8.7.55 主题跟随：深色段从 @media(prefers-color-scheme) 迁到
       :host(.framedark)——跟随「初始」的主题档位（cardDark 镜像）而非
       宿主系统偏好；accent 全部走 --acc / --acc-soft 变量（style 前置
       注入，storage.onChanged 热跟随） */
    ":host(.framedark) .ball{background:rgba(39,39,42,.72);border-color:rgba(255,255,255,.14);color:#e4e4e7;}",
    ":host(.framedark) .panel{background:rgba(24,24,27,.92);border-color:rgba(255,255,255,.12);color:#f4f4f5;}",
    ":host(.framedark) .ph{border-bottom-color:rgba(255,255,255,.08);}",
    ":host(.framedark) .ph .ico{background:color-mix(in srgb,var(--acc,#8b5cf6) 22%,transparent);color:var(--acc-soft,#a78bfa);}",
    ":host(.framedark) .cnt{background:color-mix(in srgb,var(--acc,#8b5cf6) 22%,transparent);color:var(--acc-soft,#a78bfa);}",
    ":host(.framedark) .ph .ib:hover{background:rgba(255,255,255,.08);color:#f4f4f5;}",
    ":host(.framedark) .list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);}",
    ":host(.framedark) .item:hover{background:rgba(255,255,255,.06);}",
    ":host(.framedark) .empty .e1{color:#a1a1aa;}",
    ":host(.framedark) .meta .sub{color:#71717a;}",
    ":host(.framedark) .act button{color:#a1a1aa;}",
    ":host(.framedark) .act button:hover{background:rgba(255,255,255,.08);color:#f4f4f5;}",
    /* v8.7.69 B 站完整视频下载区（面板顶部，浮窗面板样式语言同族） */
    ".bili{padding:9px 10px 8px;border-bottom:1px solid rgba(24,22,36,.07);}",
    ".bili-h{display:flex;align-items:center;gap:6px;margin-bottom:6px;}",
    ".bili-ic{flex-shrink:0;width:18px;height:18px;border-radius:5px;background:#fb7299;color:#fff;font-size:10px;font-weight:700;line-height:18px;text-align:center;}",
    ".bili-t{font-size:11.5px;font-weight:450;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;}",
    ".bili-p{flex-shrink:0;font-size:9.5px;color:#a1a1aa;}",
    ".bq{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:8px;}",
    ".bq:hover{background:rgba(24,22,36,.045);}",
    ".bq .l{flex-shrink:0;width:80px;font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".bq .s{flex:1;font-size:9.5px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".bq button{flex-shrink:0;border:0;background:color-mix(in srgb,var(--acc,#8b5cf6) 12%,transparent);color:var(--acc,#8b5cf6);font-size:10px;font-weight:500;padding:3px 10px;border-radius:999px;cursor:pointer;transition:background .15s ease;}",
    ".bq button:hover{background:color-mix(in srgb,var(--acc,#8b5cf6) 22%,transparent);}",
    ".bq button:disabled{opacity:.55;cursor:default;}",
    ".bq .pc{flex-shrink:0;width:38px;font-size:9.5px;color:var(--acc,#8b5cf6);text-align:right;font-variant-numeric:tabular-nums;}",
    ".bili-tip{margin-top:5px;font-size:9px;font-weight:300;color:#a1a1aa;line-height:1.5;}",
    ".bili-err{padding:2px 6px;font-size:10.5px;line-height:1.6;color:#ef4444;}",
    ".bili-load{padding:6px;font-size:10.5px;color:#a1a1aa;}",
    ":host(.framedark) .bq:hover{background:rgba(255,255,255,.06);}",
    ":host(.framedark) .bili-tip{color:#71717a;}",
    ":host(.framedark) .bili-p{color:#71717a;}",
    /* v8.7.112 缓存抓取区（面板内第三区块，样式语言同 bili 区） */
    ".catch{padding:9px 10px 8px;border-bottom:1px solid rgba(24,22,36,.07);}",
    ".catch-h{display:flex;align-items:center;gap:6px;margin-bottom:6px;}",
    ".catch-ic{flex-shrink:0;width:18px;height:18px;border-radius:5px;background:#0ea5e9;color:#fff;font-size:10px;font-weight:700;line-height:18px;text-align:center;}",
    ".catch-t{font-size:11.5px;font-weight:450;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".catch-s{flex-shrink:0;font-size:9.5px;color:#a1a1aa;font-variant-numeric:tabular-nums;}",
    ".catch-s.live{color:#0ea5e9;font-weight:500;}",
    ".catch-btns{display:flex;gap:6px;}",
    ".catch-btns button{flex:1;border:0;background:color-mix(in srgb,var(--acc,#8b5cf6) 12%,transparent);color:var(--acc,#8b5cf6);font-size:10px;font-weight:500;padding:4px 0;border-radius:8px;cursor:pointer;transition:background .15s ease;white-space:nowrap;}",
    ".catch-btns button:hover{background:color-mix(in srgb,var(--acc,#8b5cf6) 22%,transparent);}",
    ".catch-btns button.stop{background:#0ea5e9;color:#fff;}",
    ".catch-btns button.stop:hover{background:#0284c7;}",
    ".catch-btns button:disabled{opacity:.5;cursor:default;background:rgba(24,22,36,.06);color:#a1a1aa;}",
    ".catch-tip{margin-top:5px;font-size:9px;font-weight:300;color:#a1a1aa;line-height:1.5;}",
    ":host(.framedark) .catch-s{color:#71717a;}",
    ":host(.framedark) .catch-btns button:disabled{background:rgba(255,255,255,.08);color:#71717a;}",
    ":host(.framedark) .catch-tip{color:#71717a;}",
    /* v8.7.115 缓存完成自动下载开关（行内胶囊开关，样式同族） */
    ".catch-auto{display:flex;align-items:center;justify-content:space-between;margin-top:7px;}",
    ".catch-auto .ca-t{font-size:10px;font-weight:300;color:#71717a;}",
    ".catch-auto .sw{position:relative;width:30px;height:17px;border-radius:999px;border:0;padding:0;cursor:pointer;background:rgba(24,22,36,.18);transition:background .18s ease;}",
    ".catch-auto .sw .knob{position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:999px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.22,1,.36,1);}",
    ".catch-auto .sw.on{background:var(--acc,#8b5cf6);}",
    ".catch-auto .sw.on .knob{transform:translateX(13px);}",
    ":host(.framedark) .catch-auto .sw{background:rgba(255,255,255,.22);}",
    ":host(.framedark) .catch-auto .sw.on{background:var(--acc,#8b5cf6);}",
  ].join("");

  var style = document.createElement("style");
  root.appendChild(style);

  /* ---------- v8.7.55 主题状态：cardAcc / cardDark（chrome.storage 镜像） ---------- */
  var theme = { acc: "", dark: null };   /* acc 空串=未镜像（走 CSS 兜底值） */
  function refreshTheme() {
    var acc = theme.acc || "#8b5cf6";
    var soft = "color-mix(in srgb, " + acc + " 72%, white)";
    style.textContent =
      ":host{--acc:" + acc + ";--acc-soft:" + soft + ";}" + css;
    /* dark: true=「初始」深色 / false=浅色 / null=未镜像（宿主系统兜底） */
    var dark = theme.dark === true
      ? true
      : theme.dark === false
        ? false
        : (window.matchMedia
            ? window.matchMedia("(prefers-color-scheme: dark)").matches
            : false);
    root.host.classList.toggle("framedark", dark);
  }
  try {
    chrome.storage.local.get({ cardAcc: "", cardDark: null }, function (o) {
      if (o && typeof o.cardAcc === "string" && /^#[0-9a-fA-F]{6}$/.test(o.cardAcc)) {
        theme.acc = o.cardAcc;
      }
      if (o && (o.cardDark === 0 || o.cardDark === 1)) theme.dark = o.cardDark === 1;
      refreshTheme();
    });
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area !== "local") return;
      var touched = false;
      if (ch.cardAcc && ch.cardAcc.newValue && /^#[0-9a-fA-F]{6}$/.test(ch.cardAcc.newValue)) {
        theme.acc = ch.cardAcc.newValue;
        touched = true;
      }
      if (ch.cardDark && (ch.cardDark.newValue === 0 || ch.cardDark.newValue === 1)) {
        theme.dark = ch.cardDark.newValue === 1;
        touched = true;
      }
      if (touched) refreshTheme();
    });
  } catch (e) { /* 无 chrome 宿主（理论不可达：content script 必有） */ }
  refreshTheme();

  var ball = document.createElement("div");
  ball.className = "ball";
  ball.style.display = "none";
  ball.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 20h15"/>' +
    "</svg>" +
    '<span class="badge"></span>';
  root.appendChild(ball);
  var badge = ball.querySelector(".badge");

  var panel = document.createElement("div");
  panel.className = "panel";
  panel.style.display = "none";
  root.appendChild(panel);

  var toast = document.createElement("div");
  toast.className = "toast";
  toast.style.display = "none";
  root.appendChild(toast);

  /* ---------- 位置持久化 ---------- */
  function loadPos() {
    try {
      var raw = localStorage.getItem(POS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p.x === "number" && typeof p.y === "number") return p;
      }
    } catch (e) { /* noop */ }
    return null;
  }
  function clampPos(x, y) {
    var w = 44, m = 6;
    var maxX = window.innerWidth - w - m, maxY = window.innerHeight - w - m;
    return {
      x: Math.min(Math.max(m, x), Math.max(m, maxX)),
      y: Math.min(Math.max(m, y), Math.max(m, maxY)),
    };
  }
  function applyBallPos() {
    var p = loadPos();
    if (!p) {
      /* 缺省：右侧中部 */
      p = { x: window.innerWidth - 44 - 18, y: Math.round(window.innerHeight * 0.42) };
    }
    p = clampPos(p.x, p.y);
    ball.style.left = p.x + "px";
    ball.style.top = p.y + "px";
    placePanel();
  }
  function placePanel() {
    var bx = parseFloat(ball.style.left) || 0;
    var by = parseFloat(ball.style.top) || 0;
    var px = bx - 280 - 12;
    if (px < 8) px = Math.min(bx + 56, window.innerWidth - 280 - 8);
    var py = by - 6;
    py = Math.min(Math.max(8, py), Math.max(8, window.innerHeight - 420));
    panel.style.left = px + "px";
    panel.style.top = py + "px";
    placeToast();
  }
  /* v8.7.68 提示词改挂在嗅探面板上方（用户：「提示嗅探到多少资源的提示词
     位置放到嗅探弹窗的上方」）：旧定位锚在浮球上沿（by - 44），新定位 =
     面板左缘对齐 + 面板顶沿上方 10px 间距（toast 高度实时测，
     display:none 时 offsetHeight=0 走 33px 兑底）；面板开合/拖球跟随时
     toast 同步跟随（placePanel 尾链），高度不足时 clamp 到视口上沿。 */
  function placeToast() {
    if (toast.style.display === "none") return;
    var px2 = Math.max(8, parseFloat(panel.style.left) || 0);
    var py2 = parseFloat(panel.style.top) || 0;
    var th = toast.offsetHeight || 33;
    toast.style.left = px2 + "px";
    toast.style.top = Math.max(8, py2 - th - 10) + "px";
  }
  window.addEventListener("resize", function () {
    if (state.on) applyBallPos();
  });

  /* ---------- 拖拽 + 点击（>4px 算拖拽，up 后 260ms 吞 click 防误开） ---------- */
  var drag = null;
  var swallowClick = 0;
  ball.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag = { x0: e.clientX, y0: e.clientY, moved: false, lx: e.clientX, ly: e.clientY };
    /* capture 失败（合成事件/自动化环境无 active pointer）不阻断点击链 */
    try { ball.setPointerCapture(e.pointerId); } catch (er) { /* noop */ }
  });
  ball.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      ball.classList.add("drag");
    }
    if (drag.moved) {
      /* 增量 = 本次与上次事件的差（movementX 在触屏/某些指鼠下不可靠） */
      var p = clampPos(
        parseFloat(ball.style.left || "0") + (e.clientX - drag.lx),
        parseFloat(ball.style.top || "0") + (e.clientY - drag.ly)
      );
      ball.style.left = p.x + "px";
      ball.style.top = p.y + "px";
      placePanel();
    }
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  });
  ball.addEventListener("pointerup", function (e) {
    if (!drag) return;
    var wasDrag = drag.moved;
    ball.classList.remove("drag");
    try { ball.releasePointerCapture(e.pointerId); } catch (er) { /* noop */ }
    drag = null;
    if (wasDrag) {
      try {
        localStorage.setItem(
          POS_KEY,
          JSON.stringify({ x: parseFloat(ball.style.left), y: parseFloat(ball.style.top) })
        );
      } catch (er) { /* noop */ }
      swallowClick = Date.now();
      /* 拖后落点防出屏（窗口缩小时 clamp 兜底在 applyBallPos） */
    } else {
      if (Date.now() - swallowClick < 260) return; /* 拖后误触吞 click */
      togglePanel();
    }
  });

  /* ---------- 面板渲染 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtSize(n) {
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB";
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " KB";
    return n + " B";
  }
  function guessName(it) {
    if (it.name) return it.name;
    try {
      var u = new URL(it.url);
      var seg = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
      return decodeURIComponent(seg).slice(0, 80);
    } catch (e) {
      return it.url.slice(0, 60);
    }
  }
  /* v8.7.53：元信息行只留「大小 · 来源域名」——类型语义已由色块字母承载
     （title 补全称），不再和大小/域名堆成一行长串 */
  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  }
  var ICON_DL =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10"/><path d="m8 10.5 4 4 4-4"/><path d="M5 20h14"/></svg>';
  var ICON_CP =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
  var ICON_TRASH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12"/></svg>';
  var ICON_X =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>';
  var ICON_DOWN_DOC =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 20h15"/></svg>';
  /* ---------- v8.7.69 B 站完整视频下载 ---------- */
  function detectBili() {
    /* SPA 导航友好：每次渲染面板时重检（开销一次正则） */
    var m = String(location.href).match(/bilibili\.com\/(?:video\/)?(BV[0-9A-Za-z]{10})/);
    var bvid = m ? m[1] : "";
    var pm = String(location.href).match(/[?&]p=(\d+)/);
    var page = pm ? Math.max(1, parseInt(pm[1], 10) || 1) : 1;
    if (bvid !== state.bili.bvid || page !== state.bili.page) {
      state.bili = { bvid: bvid, page: page, pages: 0, resolving: false, resolved: null, error: "", downloading: 0 };
    }
  }
  function biliResolve() {
    if (!state.bili.bvid || state.bili.resolving || state.bili.resolved) return;
    /* v8.7.128 sw-offline 可重试：旧逻辑 error 粘滞（一次 SW 打嗝 → 专区
       永久「解析失败」直到刷新页面，用户感知即「下载没了」）——sw-offline
       且 2s 后的下次开面板自动重试；真解析失败仍保持终态防抖 */
    if (state.bili.error) {
      if (!(state.bili.error === "sw-offline" && Date.now() - (state.bili.errorTs || 0) > 2000)) return;
      state.bili.error = "";
    }
    state.bili.resolving = true;
    if (state.panelOpen) renderPanel();
    send({ type: "bili-resolve", bvid: state.bili.bvid, page: state.bili.page }, function (resp) {
      state.bili.resolving = false;
      if (resp && resp.type === "bili-resolve-reply") {
        if (resp.ok) {
          state.bili.resolved = resp.info;
          state.bili.pages = (resp.info.pages && resp.info.pages.length) || 0;
        } else {
          state.bili.error = String(resp.error || "resolve-fail");
        }
      } else {
        state.bili.error = "sw-offline";
        state.bili.errorTs = Date.now();
      }
      if (state.panelOpen) renderPanel();
    });
  }
  function biliStart(qn, btn) {
    if (state.bili.downloading) return;
    var info = state.bili.resolved;
    if (!info) return;
    state.bili.downloading = qn;
    renderPanel();
    showToast("开始下载「" + info.title + "」完整视频…");
    send(
      {
        type: "bili-download",
        bvid: state.bili.bvid, qn: qn, page: state.bili.page, title: info.title,
      },
      function (resp) {
        if (!resp || resp.ok !== true) {
          state.bili.downloading = 0;
          if (state.panelOpen) renderPanel();
          showToast("下载启动失败：" + ((resp && resp.error) || "未知错误"));
        }
      }
    );
  }
  function biliPctText(loaded, total) {
    if (!total) return "";
    var p = Math.min(100, Math.round((loaded / total) * 100));
    return p + "%";
  }

  /* ---------- v8.7.71 YouTube 完整视频下载（Ghost Downloader 能力移植） ----------
     与 B 站区同架构：面板惰性解析（SW 拉 watch 页 → ytInitialPlayerResponse）
     → MP4 档位列表 → 一键分流下载+浏览器内 remuxYT 合并 → 落盘。 */
  function detectYt() {
    var m = String(location.href).match(/youtube\.com\/watch\?[^#]*\bv=([\w-]{11})/);
    var vid = m ? m[1] : "";
    if (vid !== state.yt.vid) {
      state.yt = { vid: vid, resolving: false, resolved: null, error: "", downloading: 0, progress: null };
    }
  }
  function ytResolve() {
    if (!state.yt.vid || state.yt.resolving || state.yt.resolved) return;
    /* v8.7.128 sw-offline 可重试（同 B 站区律） */
    if (state.yt.error) {
      if (!(state.yt.error === "sw-offline" && Date.now() - (state.yt.errorTs || 0) > 2000)) return;
      state.yt.error = "";
    }
    state.yt.resolving = true;
    if (state.panelOpen) renderPanel();
    send({ type: "yt-resolve", videoId: state.yt.vid }, function (resp) {
      state.yt.resolving = false;
      if (resp && resp.type === "yt-resolve-reply") {
        if (resp.ok) state.yt.resolved = resp.info;
        else state.yt.error = String(resp.error || "resolve-fail");
      } else {
        state.yt.error = "sw-offline";
        state.yt.errorTs = Date.now();
      }
      if (state.panelOpen) renderPanel();
    });
  }
  function ytStart(itag, label) {
    if (state.yt.downloading) return;
    var info = state.yt.resolved;
    if (!info) return;
    state.yt.downloading = itag;
    renderPanel();
    showToast("开始下载「" + info.title + "」完整视频…");
    send(
      { type: "yt-download", videoId: state.yt.vid, itag: itag, label: label, title: info.title },
      function (resp) {
        if (!resp || resp.ok !== true) {
          state.yt.downloading = 0;
          if (state.panelOpen) renderPanel();
          showToast("下载启动失败：" + ((resp && resp.error) || "未知错误"));
        }
      }
    );
  }
  function ytProgress(msg) {
    var y = state.yt;
    if (!y.downloading) return;
    y.progress = { stage: msg.stage, loaded: msg.loaded || 0, total: msg.total || 0 };
    var stageLabel = msg.stage === "video" ? "视频" : msg.stage === "audio" ? "音频" : "合并中";
    var pct = y.progress.total ? Math.min(100, Math.round((y.progress.loaded / y.progress.total) * 100)) : 0;
    var mb = msg.loaded ? "（" + (msg.loaded / 1048576).toFixed(1) + "MB" + (msg.total ? "/" + (msg.total / 1048576).toFixed(1) + "MB" : "") + "）" : "";
    if (state.toastTimer) clearTimeout(state.toastTimer);
    toast.textContent = "下载" + stageLabel + " " + pct + "% " + mb;
    toast.style.display = "block";
    void toast.offsetHeight;
    placeToast();
    toast.classList.add("show");
    biliToastHold = setTimeout(function () {
      toast.classList.remove("show");
      setTimeout(function () { if (!state.yt.downloading) toast.style.display = "none"; }, 320);
    }, 60000);
    if (state.panelOpen) renderPanel();
  }
  function ytDone(msg) {
    var y = state.yt;
    y.downloading = 0;
    y.progress = null;
    if (biliToastHold) { clearTimeout(biliToastHold); biliToastHold = 0; }
    if (msg.ok) showToast("完整视频已保存到下载列表 ✓");
    else showToast("完整视频下载失败：" + (msg.error || "未知错误") + "（YouTube 风控可能拦截，可稍后重试）");
    if (state.panelOpen) renderPanel();
  }
  function ytBlockHtml() {
    detectYt();
    if (!state.yt.vid) return "";
    var y = state.yt;
    var head =
      '<div class="bili-h">' +
      '<span class="bili-ic" style="background:#ff0033">Y</span>' +
      '<span class="bili-t" title="' + esc(y.resolved ? y.resolved.title : y.vid) + '">' +
      esc(y.resolved ? y.resolved.title : "YouTube 完整视频") + "</span>" +
      "</div>";
    var body;
    if (y.resolving) {
      body = '<div class="bili-load">正在解析视频画质…</div>';
    } else if (y.error) {
      body = '<div class="bili-err">解析失败：' + esc(y.error) +
        (/playability-LIVE_STREAM|LOGIN_REQUIRED/i.test(y.error) ? "（该视频需登录或不支持下载）" : "") + "</div>";
    } else if (y.resolved) {
      var info = y.resolved;
      var rows = (info.qualities || []).concat(info.progressive || []);
      var qs = rows
        .map(function (q) {
          var busy = y.downloading === q.itag;
          var anyBusy = !!y.downloading;
          var pct = busy && y.progress && y.progress.total
            ? biliPctText(y.progress.loaded, y.progress.total) : "";
          return (
            '<div class="bq">' +
            '<span class="l" title="' + esc(q.label + (q.codecs ? " · " + q.codecs : "")) + '">' + esc(q.label) + "</span>" +
            '<span class="s">' + fmtSize(q.size) + (q.single ? " · 一体" : " · 含音轨") + "</span>" +
            (pct ? '<span class="pc">' + pct + "</span>" : "") +
            '<button data-act="yt-dl" data-q="' + q.itag + '" data-l="' + esc(q.label) + '"' +
            (anyBusy ? " disabled" : "") + ">" + (busy ? "下载中" : "合并下载") + "</button>" +
            "</div>"
          );
        })
        .join("");
      body = qs || '<div class="bili-err">当前无可下载的 MP4 档位（VP9/AV1 档暂不支持合并）</div>';
      body += '<div class="bili-tip">音视频自动合并为完整 MP4（浏览器内完成，无需本地程序）；部分视频受 YouTube 风控限制</div>';
    } else {
      body = '<div class="bili-load">…</div>';
    }
    return '<div class="bili">' + head + body + "</div>";
  }

  /* v8.7.115 抖音完整视频下载区（对齐 B 站/YouTube 区形态）。
     抖音网页播放器是渐进式 MP4 单直链：XHR 拉 /aweme/v1/play/（302 跳
     douyinvod/zjcdn CDN），直链已被嗅探管线自动入库——本区从资源列表里
     倒序找最新一条抖音域族视频直链；SPA 换视频后新直链自然顶掉旧条目。
     Referer 由 SW 侧 DNR 会话规则补齐（ext-bg ensureDnrDouyin）。 */
  var DOUYIN_FAM = ["douyin.com", "douyinvod.com", "zjcdn.com", "amemv.com",
    "douyinpic.com", "bytecdn.cn", "snssdk.com", "iesdouyin.com", "douyinstatic.com"];
  function onDouyinPage() {
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (h !== "douyin.com" && !/\.douyin\.com$/.test(h)) return false;
      var href = String(location.href);
      return /douyin\.com\/(?:video|note)\/\d+/.test(href) || /[?&]modal_id=\d+/.test(href);
    } catch (e) { return false; }
  }
  function hostInFam(h) {
    h = String(h || "").toLowerCase();
    for (var i = 0; i < DOUYIN_FAM.length; i++) {
      var d = DOUYIN_FAM[i];
      if (h === d || (h.length > d.length && h.slice(-(d.length + 1)) === "." + d)) return true;
    }
    return false;
  }
  function douyinPlayItem() {
    for (var i = state.items.length - 1; i >= 0; i--) {
      var it = state.items[i];
      if (!it || it.type !== "video") continue;
      var u = String(it.url || "");
      if (u.indexOf("/aweme/v1/play/") >= 0) return it;
      if (hostInFam(hostOf(u))) return it;
    }
    return null;
  }
  function douyinTitle() {
    /* document.title 即视频描述（尾缀「-抖音」系站点附加，洗掉） */
    var t = String(document.title || "").replace(/[-–—~|\s]*抖音.*$/, "").trim();
    return t || "抖音视频";
  }
  function douyinBlockHtml() {
    if (!onDouyinPage()) return "";
    var it = douyinPlayItem();
    var title = douyinTitle();
    var head =
      '<div class="bili-h">' +
      '<span class="bili-ic" style="background:#161823">抖</span>' +
      '<span class="bili-t" title="' + esc(title) + '">' + esc(title) + "</span>" +
      "</div>";
    var body;
    if (it) {
      var idx = state.items.indexOf(it);
      body =
        '<div class="bq">' +
        '<span class="l">完整视频</span>' +
        '<span class="s">' + (it.size > 0 ? fmtSize(it.size) + " · " : "") + "网页播放档 · 含音轨</span>" +
        '<button data-act="douyin-dl" data-i="' + idx + '">下载</button>' +
        "</div>" +
        '<div class="bili-tip">直链来自网页播放器当前档位（含音轨）；若下载失败多为直链过期——重播视频刷新直链后再试</div>';
    } else {
      body = '<div class="bili-load">播放视频后自动捕获直链…（MSE 分段流形态请用下方「缓存抓取」）</div>';
    }
    return '<div class="bili">' + head + body + "</div>";
  }

  /* v8.7.69 B 站完整视频下载区（仅 B 站视频页渲染；首开面板时惰性解析） */
  function biliBlockHtml() {
    detectBili();
    if (!state.bili.bvid) return "";
    var b = state.bili;
    var head =
      '<div class="bili-h">' +
      '<span class="bili-ic">B</span>' +
      '<span class="bili-t" title="' + esc(b.resolved ? b.resolved.title : b.bvid) + '">' +
      esc(b.resolved ? b.resolved.title : "哔哩哔哩完整视频") + "</span>" +
      (b.pages > 1 ? '<span class="bili-p">P' + b.page + "/" + b.pages + "</span>" : "") +
      "</div>";
    var body;
    if (b.resolving) {
      body = '<div class="bili-load">正在解析视频清晰度…</div>';
    } else if (b.error) {
      body = '<div class="bili-err">解析失败：' + esc(b.error) +
        (/101|login/i.test(b.error) ? "（可在浏览器登录 B 站后重试）" : "") + "</div>";
    } else if (b.resolved) {
      var info = b.resolved;
      var qs = (info.qualities || [])
        .map(function (q) {
          var busy = b.downloading === q.id;
          var anyBusy = !!b.downloading;
          var pct = busy && b.progress && b.progress.total
            ? biliPctText(b.progress.loaded, b.progress.total) : "";
          return (
            '<div class="bq">' +
            '<span class="l" title="' + esc(q.label + " · " + q.codecs) + '">' + esc(q.label) + "</span>" +
            '<span class="s">' + fmtSize(q.size) + (info.audio ? " · 含音轨" : " · 无音轨") + "</span>" +
            (pct ? '<span class="pc">' + pct + "</span>" : "") +
            '<button data-act="bili-dl" data-q="' + q.id + '"' +
            (anyBusy ? " disabled" : "") + ">" + (busy ? "下载中" : "合并下载") + "</button>" +
            "</div>"
          );
        })
        .join("");
      body = qs || '<div class="bili-err">当前无可下载清晰度（可尝试登录 B 站后重试）</div>';
      if (info.login === false) {
        body += '<div class="bili-tip">未登录 B 站：最高 480P；浏览器登录后可下 1080P 及更高</div>';
      } else {
        body += '<div class="bili-tip">音视频自动合并为完整 MP4（浏览器内完成，无需本地程序）</div>';
      }
    } else {
      body = '<div class="bili-load">…</div>';
    }
    return '<div class="bili">' + head + body + "</div>";
  }

  /* v8.7.112 缓存抓取区块：数据面在 sniffer-bridge.js（同 ISOLATED world），
     info() 拉当前态、按钮直调 toggle/restart/download；桥未就绪或站点
     在避免抓取名单（API 未暴露）时整块不渲染。
     v8.7.115：+「完成后自动下载」开关行（snifferCatchAutoDl 全局偏好）。 */
  var catchAutoDl = false;
  try {
    chrome.storage.local.get("snifferCatchAutoDl", function (o) {
      catchAutoDl = !!(o && o.snifferCatchAutoDl);
      if (state.panelOpen) renderPanel();
    });
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === "local" && ch.snifferCatchAutoDl) {
        catchAutoDl = !!ch.snifferCatchAutoDl.newValue;
        if (state.panelOpen) renderPanel();
      }
    });
  } catch (e) { /* noop */ }
  function catchBlockHtml() {
    var api = window.__chushiCatchApi;
    if (!api || typeof api.info !== "function") return "";
    var inf = api.info();
    if (!inf) return "";
    var size = inf.total > 0 ? fmtSize(inf.total) : "";
    /* v8.7.125 媒体源分组过滤：忽略组计数随状态行提示 */
    var extra = inf.extra > 0 ? " · 其他源" + inf.extra : "";
    var stateHtml;
    if (inf.on) {
      stateHtml = '<span class="catch-s live">捕获中' + (size ? " · " + size : "") + (inf.done ? " · 已到尾" : "") + extra + "</span>";
    } else if (inf.total > 0) {
      stateHtml = '<span class="catch-s">已捕获 ' + size + (inf.done ? " · 已到尾" : "") + extra + "</span>";
    } else {
      stateHtml = '<span class="catch-s">待开始</span>';
    }
    return (
      '<div class="catch">' +
      '<div class="catch-h"><span class="catch-ic">抓</span><span class="catch-t">缓存抓取</span>' + stateHtml + "</div>" +
      '<div class="catch-btns">' +
      '<button data-act="catch-toggle"' + (inf.on ? ' class="stop"' : "") + ">" + (inf.on ? "停止捕获" : "开始捕获") + "</button>" +
      '<button data-act="catch-restart">从头捕获</button>' +
      '<button data-act="catch-dl"' + (inf.total > 0 ? "" : " disabled") + ">下载数据</button>" +
      "</div>" +
      '<div class="catch-auto"><span class="ca-t">捕获完成后自动下载</span>' +
      '<button class="sw' + (catchAutoDl ? " on" : "") + '" data-act="catch-auto" role="switch" aria-checked="' + (catchAutoDl ? "true" : "false") + '" aria-label="捕获完成后自动下载"><span class="knob"></span></button></div>' +
      '<div class="catch-tip">把页面播放器已缓存的分段数据（MSE 流）截留合并成文件，各视频站通用；建议「从头捕获」后重播视频，播完点「下载数据」。只保存当前播放的媒体源，广告/预加载自动忽略；播放中切换清晰度会按切换点拆成多段；多音轨分文件保存。</div>' +
      "</div>"
    );
  }

  function renderPanel() {
    detectBili();
    if (state.bili.bvid) biliResolve();
    detectYt();
    if (state.yt.vid) ytResolve();
    /* v8.7.138 默认精选（按 URL 指纹去重）+ 可切「显示全部」。索引仍指回
       state.items，保证列表里每个按钮的 data-i 点击语义不变。 */
    if (typeof state.showAll !== "boolean") state.showAll = false;
    var rowsIdx = [], seenFp = {}, ii, fpTmp;
    for (ii = 0; ii < state.items.length; ii++) {
      fpTmp = fpOf(state.items[ii]);
      if (!state.showAll && fpTmp) { if (seenFp[fpTmp]) continue; seenFp[fpTmp] = 1; }
      rowsIdx.push(ii);
    }
    var rows = rowsIdx
      .map(function (i) { var it = state.items[i];
        var meta = TYPE_META[it.type] || TYPE_META.file;
        var size = fmtSize(it.size);
        var extLabel = it.ext === "m3u8" ? "m3u8 流列表" : "";
        var sub = [extLabel, size, hostOf(it.url)]
          .filter(Boolean)
          .join(" · ");
        return (
          '<div class="item" data-i="' + i + '">' +
          '<span class="tag" style="background:' + meta.color + '" title="' + esc(meta.name) + '">' + meta.label + "</span>" +
          '<span class="meta"><span class="nm" title="' + esc(guessName(it)) + '">' + esc(guessName(it)) + "</span>" +
          '<span class="sub" title="' + esc(sub) + '">' + esc(sub) + "</span></span>" +
          '<span class="act">' +
          (it.ext === "m3u8"
            ? ""
            : '<button data-act="dl" title="下载">' + ICON_DL + "</button>") +
          '<button data-act="cp" title="复制链接">' + ICON_CP + "</button>" +
          "</span></div>"
        );
      })
      .join("");
    panel.innerHTML =
      '<div class="ph">' +
      '<span class="ico">' + ICON_DOWN_DOC + "</span>" +
      '<span class="t">资源嗅探</span>' +
      (state.items.length > 0 ? '<span class="cnt">' + state.items.length + "</span>" : "") +
      '<span class="sp"></span>' +
      '<button class="ib" data-act="clear" title="清空列表" aria-label="清空列表">' + ICON_TRASH + "</button>" +
      '<button class="ib" data-act="hide" title="收起" aria-label="收起面板">' + ICON_X + "</button>" +
      "</div>" +
      biliBlockHtml() +
      ytBlockHtml() +
      douyinBlockHtml() +
      catchBlockHtml() +
      '<div class="list">' +
      (rows ||
        '<div class="empty">' + ICON_DOWN_DOC +
        '<div class="e1">暂无可下载资源</div>' +
        '<div class="e2">浏览网页时自动嗅探视频、音频、图片、文档等文件</div>' +
        "</div>") +
      "</div>";
  }
  function togglePanel(force) {
    var next = typeof force === "boolean" ? force : !state.panelOpen;
    state.panelOpen = next;
    if (next) {
      renderPanel();
      panel.style.display = "flex";
      /* 强制 reflow 后再挂 open，保证每次展开都走过渡 */
      void panel.offsetHeight;
      panel.classList.add("open");
    } else {
      panel.classList.remove("open");
      setTimeout(function () {
        if (!state.panelOpen) panel.style.display = "none";
      }, 240);
    }
  }
  panel.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    if (act === "bili-dl") {
      var qn = parseInt(btn.getAttribute("data-q"), 10);
      if (qn) biliStart(qn, btn);
      return;
    }
    if (act === "yt-dl") {
      var yitag = parseInt(btn.getAttribute("data-q"), 10);
      if (yitag) ytStart(yitag, btn.getAttribute("data-l") || "");
      return;
    }
    if (act === "catch-toggle" || act === "catch-restart" || act === "catch-dl" || act === "catch-auto") {
      var capi = window.__chushiCatchApi;
      if (act === "catch-auto") {
        try { chrome.storage.local.set({ snifferCatchAutoDl: !catchAutoDl }); } catch (e) { /* noop */ }
        return;
      }
      if (!capi) return;
      if (act === "catch-toggle") {
        var nowOn = capi.toggle();
        if (!nowOn) {
          var infNow = capi.info ? capi.info() : null;
          showToast(infNow && infNow.total > 0 && catchAutoDl ? "已停止，自动下载已发起" : "缓存抓取已停止");
        } else {
          showToast("缓存抓取已开始，播放视频即可截留");
        }
      } else if (act === "catch-restart") {
        capi.restart();
        showToast("已从头捕获：视频回到开头重新缓冲");
      } else {
        var r = capi.download();
        showToast(r && r.warn ? r.warn : (r && r.saved > 0 ? "已发起下载（" + r.saved + " 个文件）" : "没抓到有效数据"));
      }
      renderPanel();
      return;
    }
    if (act === "douyin-dl") {
      var dItem = state.items[Number(btn.getAttribute("data-i"))];
      if (!dItem) return;
      send({ type: "sniffer-download", url: dItem.url, filename: douyinTitle() + ".mp4" });
      btn.classList.add("ok");
      showToast("抖音视频已发起下载（Referer 已由扩展补齐）");
      return;
    }
    if (act === "show-all") { state.showAll = true; renderPanel(); return; }
    if (act === "show-uniq") { state.showAll = false; renderPanel(); return; }
    if (act === "hide") return togglePanel(false);
    if (act === "clear") {
      send({ type: "sniffer-clear" });
      state.items = [];
      renderBadge();
      renderPanel();
      return;
    }
    var itemEl = btn.closest(".item");
    if (!itemEl) return;
    var it = state.items[Number(itemEl.getAttribute("data-i"))];
    if (!it) return;
    if (act === "cp") {
      copyText(it.url, btn);
    } else if (act === "dl") {
      btn.classList.add("ok");
      send({ type: "sniffer-download", url: it.url, filename: guessName(it) });
    }
  });
  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      btn.classList.add("ok");
      setTimeout(function () { btn.classList.remove("ok"); }, 1200);
    };
    try {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } catch (e) {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done();
    } catch (e) { /* noop */ }
  }

  /* ---------- 徽标 + toast ---------- */
  function renderBadge() {
    var n = state.items.length;
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.classList.toggle("show", n > 0);
  }
  function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = "block";
    void toast.offsetHeight;
    placeToast();
    toast.classList.add("show");
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      toast.classList.remove("show");
      setTimeout(function () { toast.style.display = "none"; }, 320);
    }, 3500);
  }

  /* v8.7.69 B 站下载进度/完成（toast 实时进度 + 按钮态回填）。
     进度期间 toast 常驻（showToast 会重置 3.5s 计时，改手动控灯：
     downloading 存续时持续刷新，done 后按结果收尾）。 */
  var biliToastHold = 0;
  function biliProgress(msg) {
    if (msg.kind === "yt") return ytProgress(msg);
    var b = state.bili;
    if (!b.downloading) return;
    b.progress = { stage: msg.stage, loaded: msg.loaded || 0, total: msg.total || 0 };
    var stageLabel = msg.stage === "video" ? "视频" : msg.stage === "audio" ? "音频" : "合并中";
    var pct = b.progress.total ? Math.min(100, Math.round((b.progress.loaded / b.progress.total) * 100)) : 0;
    var mb = msg.loaded ? "（" + (msg.loaded / 1048576).toFixed(1) + "MB" + (msg.total ? "/" + (msg.total / 1048576).toFixed(1) + "MB" : "") + "）" : "";
    /* 进度期重置 toast 计时器：走 showToast 的样式刷新但不让 3.5s 收走 */
    if (state.toastTimer) clearTimeout(state.toastTimer);
    toast.textContent = "下载" + stageLabel + " " + pct + "% " + mb;
    toast.style.display = "block";
    void toast.offsetHeight;
    placeToast();
    toast.classList.add("show");
    biliToastHold = setTimeout(function () {
      toast.classList.remove("show");
      setTimeout(function () { if (!state.bili.downloading) toast.style.display = "none"; }, 320);
    }, 60000);
    if (state.panelOpen) renderPanel();
  }
  function biliDone(msg) {
    if (msg.kind === "yt") return ytDone(msg);
    var b = state.bili;
    var wasQn = b.downloading;
    b.downloading = 0;
    b.progress = null;
    if (biliToastHold) { clearTimeout(biliToastHold); biliToastHold = 0; }
    if (msg.ok) {
      showToast("完整视频已保存到下载列表 ✓");
    } else {
      showToast("完整视频下载失败：" + (msg.error || "未知错误") + "（可改用下方分段直下）");
    }
    if (state.panelOpen) renderPanel();
    void wasQn;
  }

  /* ---------- 消息面 ---------- */
  /* v8.7.135 HLS 合并进度：SW 转发的 hls-progress / hls-done 进 toast
     （解析阶段「解析播放列表…」，下载阶段「合并中 n%（done/total）」）。 */
  try {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg) return;
      if (msg.type === "hls-progress") {
        var pct = msg.total ? Math.floor((msg.done / msg.total) * 100) : 0;
        showToast(msg.phase === "parse" ? "解析播放列表…" : "合并中 " + pct + "%（" + msg.done + "/" + msg.total + "）");
      } else if (msg.type === "hls-done") {
        showToast(msg.ok ? "合并完成，已发起下载" : "合并失败：" + (msg.error || "未知错误"));
      }
    });
  } catch (e) { /* noop */ }

  /* v8.7.138 URL 指纹（去重用）：去掉查询/锚，取路径末段 + 类型。
     抖音同一视频常以多域名多签名 URL 出现，按末段聚成一条。 */
  function fpOf(it) {
    if (!it || typeof it.url !== "string") return "";
    var u = it.url.split("?")[0].split("#")[0];
    var seg = u.split("/").pop() || u;
    return (it.type || "") + "|" + seg;
  }

  function send(msg, cb) {
    try {
      if (cb) chrome.runtime.sendMessage(msg, function (resp) { void chrome.runtime.lastError; cb(resp); });
      else chrome.runtime.sendMessage(msg, function () { void chrome.runtime.lastError; });
    } catch (e) { /* 扩展上下文失效（更新中）：静默 */ }
  }

  /* v8.7.112 缓存抓取状态跟随：桥 500ms 节流广播（捕获中刷尺寸；备注
     变化时 toast——到顶自动停等）；面板开着则同步重渲染。 */
  try {
    window.addEventListener("chushi-catch-state", function (ev) {
      var d = ev && ev.detail;
      if (d && d.note && d.note !== state.catchNote) {
        state.catchNote = d.note;
        showToast(d.note);
      }
      if (state.panelOpen) renderPanel();
    });
  } catch (e) { /* noop */ }

  function applyItems(items) {
    state.items = Array.isArray(items) ? items.slice(0, 50) : [];
    renderBadge();
    /* v8.7.115：「嗅探到 N 个可下载资源」发现提示 toast 按用户指令退役
       （徽标与面板计数保留，下载/捕获反馈 toast 不受影响） */
    if (state.panelOpen) renderPanel();
  }

  /* v8.7.128 自愈 boot：ask 无应答（SW 唤醒/体眠竞态丢包，MV3 已知行为）
     不再静默死刑——退避重试 3 轮（600ms/1.2s/2.4s）。旧逻辑无应答即永久
     返囬（state.booted 已置真、state.on 恒假），后续 sniffer-new 推送也被
     丢弃，浮窗对本标签页永不同亮（用户实测「浮窗在 B 站页面不出现」）。 */
  var bootRetries = 0;
  function boot(force) {
    if (state.booted && !force) return;
    state.booted = true;
    send({ type: "sniffer-ask" }, function (resp) {
      if (!resp || resp.type !== "sniffer-state") {
        bootRetries++;
        if (bootRetries <= 3) {
          setTimeout(function () { boot(true); }, 600 * bootRetries);
        }
        return;
      }
      bootRetries = 0;
      if (!resp.on) { destroy(); return; }
      state.on = true;
      ball.style.display = "flex";
      applyBallPos();
      /* v8.7.115：存量资源静默入列（发现提示 toast 已退役，徽标计数
         照常亮起，面板打开可见全量） */
      applyItems(resp.items || []);
    });
  }

  function destroy() {
    state.on = false;
    state.panelOpen = false;
    ball.style.display = "none";
    panel.style.display = "none";
    toast.style.display = "none";
  }

  try {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "sniffer-new") {
        /* v8.7.128 自愈律：SW 只在嗅探开启时才推送 sniffer-new，收到即证
           SW 侧 on=true——此前未亮（boot 死亡/广播丢失）时重问 SW 而非
           丢消息，ask 应答自带全量 items，亮窗与入列一步完成 */
        if (!state.on) { boot(true); return; }
        ball.style.display = "flex";
        applyBallPos();
        applyItems(msg.items || []);
      } else if (msg.type === "bili-progress") {
        biliProgress(msg);
      } else if (msg.type === "bili-done") {
        biliDone(msg);
      } else if (msg.type === "sniffer-off") {
        destroy();
      } else if (msg.type === "sniffer-state") {
        /* SW 广播形态（开关切换后）：on → 显示/自毁 */
        if (msg.on) {
          state.on = true;
          ball.style.display = "flex";
          applyBallPos();
          applyItems(msg.items || []);
        } else {
          destroy();
        }
      }
    });
  } catch (e) { /* 无 runtime 宿主 */ }

  /* storage 兜底双向化（v8.7.128）：关 → 自毁；开 → 本地兜底重问（旧逻辑
     只处理关，开启亮窗完全依赖 SW 广播 sniffAnnounceOn，广播在 SW 竞态下
     丢失则已开页面永不亮窗——v8.7.58 用户实测缺陷同根） */
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes && "snifferOn" in changes) {
        if (changes.snifferOn.newValue === true) boot(true);
        else destroy();
      }
    });
  } catch (e) { /* noop */ }

  /* v8.7.128 可见性重问律：后台标签页 boot 死亡（SW 休眠期丢包）后，
     用户切回标签页时重问一次（30s 节流）——切页即自愈，无需刷新 */
  var lastVisRecheck = 0;
  try {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible" || state.on) return;
      var now = Date.now();
      if (now - lastVisRecheck < 30000) return;
      lastVisRecheck = now;
      boot(true);
    });
  } catch (e) { /* noop */ }

  boot();
})();
