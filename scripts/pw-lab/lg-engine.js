/* ============================================================
 * 液态玻璃引擎 v2 —— 物理透镜折射（全部代码住在本预设包里）
 * ============================================================
 * 架构律：宿主（「初始」）不内建任何视觉引擎，只提供受控「作用面」：
 *   chushi.fx.mount(id, html)   把 <style>/<svg> 幂等挂进宿主 #chushi-fx-root
 *   chushi.fx.onResize(cb)      订阅玻璃容器尺寸快照 [{fx, key, w, h, radius}]
 *   chushi.settings.define/get/onChange   v1.2.0 作用面：向设置面板贡献调节项
 *   [data-fx="fxN"]             宿主打在玻璃容器上的稳定标记（CSS 触达点）
 *   --fx-mx / --fx-my           宿主写在容器上的指针相对坐标（镜面追光）
 *
 * 物理模型（v1.2.0 重写，对齐 Apple 液态玻璃的边缘透镜观感）：
 *   把玻璃视为一块带圆角倒边的厚玻璃板（纸镇/鱼缸）。位移贴图按光学
 *   取样律生成：越靠边缘，取样点越向玻璃「外」偏折——边缘环带显示的
 *   是被压缩进来的玻璃外世界（环绕折射），中心几乎无畸变。
 *   ① 方向 = SDF 梯度（边缘外法线）：长边中部的弯曲垂直于边缘，
 *      与真实透镜一致；v1 指向几何中心，长边上会产生斜向歪曲；
 *   ② 剖面 = smoothstep²(t)：t 从玻璃深处 0 → 边缘 1，弯曲集中在
 *      边缘窄带（默认半短边的 26%），带内越靠边越陡；
 *   ③ 滤镜域外扩 pad：边缘环带可取到元素边界之外——这是「环绕感」
 *      的来源；pad 环上位移渐隐归零防硬边。贴图半分辨率生成
 *      （梯度场平滑，视觉无损，编码成本 1/4）。
 *   可选：边缘色散（三通道分层位移出彩虹棱边）、镜面高光。
 *
 * ⚠ 材质即顺序（链序律）：backdrop-filter 引用 SVG 滤镜必须 blur 在前、
 *   url(#filter) 在后——先霜化再折射，弯曲保持锐利；写反了折射被糊掉。
 *
 * ⚠ 布局动画防闪（v1.2.0）：backdrop-filter: url() 的 SVG 滤镜在元素
 *   布局尺寸连续变化（dock 面板高度弹簧、窗口拖拽）时逐帧重栅格化 +
 *   贴图尺寸滞后错帧 = 用户可见的闪动。律：尺寸变动期退化为纯
 *   blur/saturate（标准滤镜函数无此病），尺寸稳定 ~160ms 后再生成
 *   贴图换全链。
 * ============================================================ */

/* ---------- 材质参数（chushi.settings 驱动，改动即热生效） ---------- */
var DEFAULTS = {
  refPct: 145,       /* 折射强度 %：边缘位移上限 = 折射 × 边缘带宽 */
  bandPct: 26,       /* 边缘带宽 %（半短边占比）：越窄越像薄倒角 */
  blurPx: 3,         /* 霜化模糊 px（链序律第一位） */
  satPct: 180,       /* 饱和度 %（提鲜让弯曲带色彩可辨） */
  brightPct: 100,    /* 透亮 %（玻璃体亮度微提） */
  dispersion: false, /* 边缘色散：三通道分层位移（彩虹棱边） */
  specular: true,    /* 镜面高光：边缘内影 + 指针追光 */
};
var cfg = null;

function applyCfg(v) {
  cfg = {};
  for (var k in DEFAULTS) {
    cfg[k] = v && typeof v[k] !== "undefined" && v[k] !== null ? v[k] : DEFAULTS[k];
  }
}
function cfgSignature() {
  return JSON.stringify([cfg.refPct, cfg.bandPct, cfg.blurPx, cfg.satPct, cfg.brightPct, cfg.dispersion]);
}

/* ---------- 设置面板贡献（宿主 v1.2.0 settings 作用面） ---------- */
if (chushi.settings && chushi.settings.define) {
  try {
    chushi.settings.define({
      title: "液态玻璃",
      controls: [
        { type: "slider", key: "refPct", label: "折射强度", min: 0, max: 300, step: 5, def: 145, unit: "%" },
        { type: "slider", key: "bandPct", label: "边缘带宽", min: 8, max: 60, step: 1, def: 26, unit: "%" },
        { type: "slider", key: "blurPx", label: "霜化模糊", min: 0, max: 12, step: 1, def: 3, unit: "px" },
        { type: "slider", key: "satPct", label: "饱和度", min: 100, max: 260, step: 5, def: 180, unit: "%" },
        { type: "slider", key: "brightPct", label: "透亮", min: 80, max: 140, step: 1, def: 100, unit: "%" },
        { type: "toggle", key: "dispersion", label: "边缘色散", def: false },
        { type: "toggle", key: "specular", label: "镜面高光", def: true },
      ],
    });
  } catch (e) { /* 宿主校验拒绝则用默认参数渲染 */ }
}
applyCfg(chushi.settings && chushi.settings.get ? await chushi.settings.get() : null);
var cfgSig = cfgSignature();

/* ---------- 材质 CSS：底色调透 + 边缘高光 + 镜面追光 ----------
 * 磨砂下的高不透明度会洗掉折射，先调透玻璃底；高光层用 ::before/::after
 * （box-shadow / radial-gradient，非 backdrop root 影响源）。深色主题
 * 经 html.dark 前缀适配。 */
function materialCss() {
  var css =
    "[data-fx].glass-card{background:rgb(252 251 248/.4);position:relative}" +
    "html.dark [data-fx].glass-card{background:rgb(22 22 27/.48)}" +
    "[data-fx].glass-pill{background:rgb(255 255 255/.24)}" +
    "html.dark [data-fx].glass-pill{background:rgb(255 255 255/.04)}";
  if (cfg.specular) {
    css +=
      "[data-fx]::before{content:\"\";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;" +
      "box-shadow:inset 0 0 0 1px rgb(255 255 255/.32),inset 1.8px 3px 0 -2px rgb(255 255 255/.8)," +
      "inset -2px -2px 0 -2px rgb(255 255 255/.8),inset -3px -9px 1px -6px rgb(255 255 255/.5)," +
      "inset 3px 9px 1px -6px rgb(255 255 255/.32),inset 0 -1px 5px 0 rgb(0 0 0/.1)}" +
      "html.dark [data-fx]::before{box-shadow:inset 0 0 0 1px rgb(255 255 255/.14)," +
      "inset 1.8px 3px 0 -2px rgb(255 255 255/.42),inset -2px -2px 0 -2px rgb(255 255 255/.42)," +
      "inset -3px -9px 1px -6px rgb(255 255 255/.22),inset 3px 9px 1px -6px rgb(255 255 255/.14)," +
      "inset 0 -1px 5px 0 rgb(0 0 0/.28)}" +
      "[data-fx]::after{content:\"\";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;" +
      "opacity:0;transition:opacity .35s;background:radial-gradient(220px circle at var(--fx-mx,50%) var(--fx-my,50%)," +
      "rgb(255 255 255/.24),transparent 65%)}" +
      "[data-fx]:hover::after{opacity:1}";
  }
  return css;
}

/* ---------- 位移贴图：物理透镜（SDF 梯度方向 + 外绕边缘带 + pad 渐隐环） ---------- */
function buildMap(w, h, radius) {
  var band = Math.max(2, (Math.min(w, h) / 2) * (cfg.bandPct / 100));
  var maxDisp = (cfg.refPct / 100) * band;
  if (maxDisp < 0.5) return null; /* 折射归零：纯磨砂，无需贴图 */
  var pad = Math.ceil(maxDisp) + 2;
  var W = w + pad * 2, H = h + pad * 2;
  /* 半分辨率：位移场平滑，feImage 拉伸插值视觉无损，编码成本 1/4 */
  var mw = W > 140 ? Math.ceil(W / 2) : W;
  var mh = H > 140 ? Math.ceil(H / 2) : H;
  var canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  var img = ctx.createImageData(mw, mh);
  var data = img.data;
  var hw = w / 2, hh = h / 2;
  var r = Math.min(radius, hw, hh);
  var fade0 = pad * 0.55, fadeLen = Math.max(1, pad - fade0);
  var scale = maxDisp * 2;
  var sx = W / mw, sy = H / mh;

  function sdf(px, py) {
    var qx = Math.abs(px) - hw + r, qy = Math.abs(py) - hh + r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  }

  var i = 0;
  for (var y = 0; y < mh; y++) {
    for (var x = 0; x < mw; x++, i += 4) {
      var px = (x + 0.5) * sx - pad - hw;
      var py = (y + 0.5) * sy - pad - hh;
      var d = sdf(px, py);
      /* t：玻璃深处 0 → 边缘 1（域外夹 1，由渐隐环接管） */
      var t = d / band + 1;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var s = t * t * (3 - 2 * t);
      var m = s * s; /* smoothstep²：弯曲集中边缘窄带、越靠边越陡 */
      if (d > fade0) {
        var f = 1 - (d - fade0) / fadeLen;
        if (f < 0) f = 0;
        m *= f;
      }
      /* 方向 = SDF 梯度（向外法线）：边缘向外取样 = 玻璃外世界压缩环绕 */
      var gx = sdf(px + 1, py) - sdf(px - 1, py);
      var gy = sdf(px, py + 1) - sdf(px, py - 1);
      var gl = Math.hypot(gx, gy);
      if (gl < 1e-6) { gx = 0; gy = 0; gl = 1; }
      data[i] = Math.min(Math.max(((gx / gl) * m * maxDisp) / scale + 0.5, 0), 1) * 255;
      data[i + 1] = Math.min(Math.max(((gy / gl) * m * maxDisp) / scale + 0.5, 0), 1) * 255;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL(), scale: scale, pad: pad };
}

/* ---------- SVG 滤镜：feImage(贴图) + feDisplacementMap（域外扩 pad） ---------- */
function svgHtml(id, w, h, map, dispersion) {
  var pad = map.pad;
  var rw = w + pad * 2, rh = h + pad * 2;
  var body =
    '<feImage result="map" preserveAspectRatio="none" x="' + -pad + '" y="' + -pad +
    '" width="' + rw + '" height="' + rh + '" href="' + map.url + '"/>';
  if (dispersion) {
    /* 三通道分层位移：边缘出彩虹棱边（可选，滤镜开销 ×3） */
    var sMul = [1, 1.14, 1.28];
    var rows = [
      "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
      "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
      "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
    ];
    for (var c = 0; c < 3; c++) {
      body +=
        '<feColorMatrix in="SourceGraphic" type="matrix" values="' + rows[c] + '" result="ch' + c + '"/>' +
        '<feDisplacementMap in="ch' + c + '" in2="map" xChannelSelector="R" yChannelSelector="G" scale="' +
        (map.scale * sMul[c]).toFixed(2) + '" result="d' + c + '"/>';
    }
    body +=
      '<feComposite in="d0" in2="d1" operator="arithmetic" k2="1" k3="1" result="d01"/>' +
      '<feComposite in="d01" in2="d2" operator="arithmetic" k2="1" k3="1"/>';
  } else {
    body +=
      '<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" scale="' +
      map.scale.toFixed(2) + '"/>';
  }
  return (
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' +
    '<filter id="' + id + '" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"' +
    ' x="' + -pad + '" y="' + -pad + '" width="' + rw + '" height="' + rh + '">' +
    body + "</filter></svg>"
  );
}

/* ---------- 渲染循环（防闪：变动期退化纯模糊，稳定后建贴图换全链） ---------- */
var sigOf = {};      /* fx → 最近一次快照签名（尺寸+参数） */
var builtSig = {};   /* fx → 已建贴图的签名 */
var settleUntil = {};/* fx → 忙碌截止时刻（布局动画/拖拽期） */
var liveMarks = {};
var lastItems = [];
var SETTLE = 160;
var settleTimers = {};

function chainFor(it, busy) {
  var parts = ["blur(" + cfg.blurPx + "px)"];
  var band = Math.max(2, (Math.min(it.w, it.h) / 2) * (cfg.bandPct / 100));
  if (!busy && (cfg.refPct / 100) * band >= 0.5) parts.push("url(#lg-" + it.fx + ")");
  parts.push("saturate(" + cfg.satPct + "%)");
  if (cfg.brightPct !== 100) parts.push("brightness(" + cfg.brightPct + "%)");
  return parts.join(" ");
}

function armSettle(fx) {
  if (settleTimers[fx]) clearTimeout(settleTimers[fx]);
  settleTimers[fx] = setTimeout(function () {
    delete settleTimers[fx];
    render(lastItems);
  }, SETTLE + 20);
}

function render(items) {
  lastItems = items;
  var now = Date.now();
  var css = ["<style>", materialCss()];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.fx || !it.w || !it.h) continue;
    seen[it.fx] = true;
    var sig = it.w + "x" + it.h + "@" + it.radius + "|" + cfgSig;
    if (sigOf[it.fx] !== sig) {
      sigOf[it.fx] = sig;
      settleUntil[it.fx] = now + SETTLE; /* 尺寸/参数变动：先防闪 */
      armSettle(it.fx);
    }
    var busy = now < (settleUntil[it.fx] || 0);
    css.push(
      '[data-fx="' + it.fx + '"]{backdrop-filter:' + chainFor(it, busy) +
      "!important;-webkit-backdrop-filter:" + chainFor(it, busy) + "!important}"
    );
    if (!busy && builtSig[it.fx] !== sig) {
      var map = buildMap(it.w, it.h, it.radius);
      if (map) {
        builtSig[it.fx] = sig;
        mount("svg-" + it.fx, svgHtml("lg-" + it.fx, it.w, it.h, map, cfg.dispersion));
      } else {
        builtSig[it.fx] = sig;
        unmount("svg-" + it.fx); /* 折射为 0：摘贴图 */
      }
    }
  }
  mount("css", css.join("") + "</style>");
  /* 摘除已消失标记的贴图（⌘K 关了再开是全新标记，旧 svg 必须回收） */
  for (var k in liveMarks) {
    if (!seen[k]) {
      unmount("svg-" + k);
      delete sigOf[k];
      delete builtSig[k];
      delete settleUntil[k];
      if (settleTimers[k]) { clearTimeout(settleTimers[k]); delete settleTimers[k]; }
    }
  }
  liveMarks = seen;
}

/* 高频推送合并（RO 在弹簧动画/窗口拖拽期逐帧触发）。
 * ⚠ 不可用 requestAnimationFrame：沙箱 iframe 是 display:none，Chromium 对
 * 隐藏文档暂停渲染循环，rAF 回调永不触发（v1.2.0 实测引擎因此整体罢工）；
 * setTimeout 在隐藏 iframe 中仍会触发（仅限频），60ms 合帧足够顺滑。 */
var coalesceTimer = 0;
var pendItems = null;
function schedule(items) {
  pendItems = items;
  if (coalesceTimer) return;
  coalesceTimer = setTimeout(function () {
    coalesceTimer = 0;
    render(pendItems);
  }, 60);
}

function mount(id, html) {
  var p = chushi.fx.mount(id, html);
  if (p && p.catch) p.catch(function () {});
}
function unmount(id) {
  var p = chushi.fx.unmount(id);
  if (p && p.catch) p.catch(function () {});
}

/* ---------- 设置热更新：拖动滑杆 = 立即换参重渲（变动期自动退化防闪） ---------- */
if (chushi.settings && chushi.settings.onChange) {
  chushi.settings.onChange(function (v) {
    applyCfg(v);
    cfgSig = cfgSignature();
    render(lastItems);
  });
}

/* ---------- 启动：订阅即收到首帧快照，随开随渲染 ---------- */
var offResize = chushi.fx.onResize(schedule);
