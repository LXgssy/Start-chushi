/* ============================================================
 * 液态玻璃引擎 —— 官方参考实现（全部代码住在本预设包里）
 * ============================================================
 * 架构律：宿主（「初始」）不内建任何视觉引擎，只提供受控「作用面」：
 *   - chushi.fx.mount(id, html)  把 <style>/<svg> 幂等挂进宿主 #chushi-fx-root
 *   - chushi.fx.onResize(cb)     订阅玻璃容器尺寸快照 [{fx, key, w, h, radius}]
 *   - [data-fx="fxN"]            宿主打在玻璃容器上的稳定标记（CSS 触达点）
 *   - --fx-mx / --fx-my          宿主写在容器上的指针相对坐标（镜面高光用）
 *
 * 原理（Chromium 专属，其余内核自动保持磨砂现状）：
 *   为每块玻璃容器生成一张「位移贴图」（canvas，R=X 位移 / G=Y 位移）：
 *   圆角矩形 SDF → 越靠近边缘位移越大、方向指向中心 → feDisplacementMap
 *   实时折射背景，形成透镜边缘弯曲。
 *
 * ⚠ 材质即顺序（链序律）：backdrop-filter 引用 SVG 滤镜时必须
 *   blur 在前、url(#filter) 在后——先霜化再折射，弯曲保持锐利；
 *   写反了折射会被模糊糊掉。
 *
 * 已知律：不给任何玻璃元素的祖先加 opacity/filter（backdrop root 会杀死
 *   后代磨砂）；高光走 ::before/::after，不影响背景采样。
 * ============================================================ */

/* ---------- 材质参数（v1.1.2 视觉重调版） ---------- */
var REFRACTION = 0.75; /* 折射强度：边缘弯曲的位移上限系数 */
var BEZEL = 0.5;       /* 边缘折射区占比 */
var BLUR = 3;          /* 背景模糊 px（6 会把弯曲糊成雾，3 恰好） */
var SATURATION = 180;  /* 饱和度 %（提鲜让弯曲带色彩可辨） */

/* ---------- 材质 CSS：玻璃底调透 + 边缘高光 + 镜面高光 ----------
 * 磨砂下的高不透明度会把折射全部洗掉，先调透玻璃底；
 * 高光层用 ::before/::after（box-shadow / radial-gradient，非 backdrop
 * root 影响源）。深色主题经 html.dark 前缀适配。 */
var MATERIAL_CSS =
  /* 底色调透（折射要透过玻璃体可见） */
  '[data-fx].glass-card{background:rgb(252 251 248/.4);position:relative}' +
  'html.dark [data-fx].glass-card{background:rgb(22 22 27/.48)}' +
  /* 液态下 pill 底色随液体薄透（搜索药丸/dock 与折射叠色更自然） */
  '[data-fx].glass-pill{background:rgb(255 255 255/.24)}' +
  'html.dark [data-fx].glass-pill{background:rgb(255 255 255/.04)}' +
  /* 边缘高光：多层 inset shadow 模拟玻璃厚度反光 */
  '[data-fx]::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;' +
  'box-shadow:inset 0 0 0 1px rgb(255 255 255/.32),inset 1.8px 3px 0 -2px rgb(255 255 255/.8),' +
  'inset -2px -2px 0 -2px rgb(255 255 255/.8),inset -3px -9px 1px -6px rgb(255 255 255/.5),' +
  'inset 3px 9px 1px -6px rgb(255 255 255/.32),inset 0 -1px 5px 0 rgb(0 0 0/.1)}' +
  'html.dark [data-fx]::before{box-shadow:inset 0 0 0 1px rgb(255 255 255/.14),' +
  'inset 1.8px 3px 0 -2px rgb(255 255 255/.42),inset -2px -2px 0 -2px rgb(255 255 255/.42),' +
  'inset -3px -9px 1px -6px rgb(255 255 255/.22),inset 3px 9px 1px -6px rgb(255 255 255/.14),' +
  'inset 0 -1px 5px 0 rgb(0 0 0/.28)}' +
  /* 镜面高光：跟随宿主写入的 --fx-mx/--fx-my，hover 淡入 */
  '[data-fx]::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;' +
  'opacity:0;transition:opacity .35s;background:radial-gradient(220px circle at var(--fx-mx,50%) var(--fx-my,50%),' +
  'rgb(255 255 255/.24),transparent 65%)}' +
  '[data-fx]:hover::after{opacity:1}';

/* ---------- 位移贴图生成 ----------
 * 圆角矩形 SDF：内部为负、边界 0、外部正。
 * m = smoothStep(-bezel, 0, sdf)^2：玻璃深处几乎无形变，边缘最大；
 * 折射方向指向中心（透镜边缘压缩背景）。R=X / G=Y，0.5 灰 = 零位移。 */
function buildMap(w, h, radius) {
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  var img = ctx.createImageData(w, h);
  var data = img.data;
  var hw = w / 2, hh = h / 2;
  var bez = (Math.min(w, h) / 2) * BEZEL;
  var k = REFRACTION;
  var maxD = 0.0001;
  var dxs = new Float32Array(w * h);
  var dys = new Float32Array(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var cx = x + 0.5 - hw, cy = y + 0.5 - hh;
      var qx = Math.abs(cx) - hw + radius, qy = Math.abs(cy) - hh + radius;
      var sdf =
        Math.min(Math.max(qx, qy), 0) +
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
      var t = Math.min(Math.max((sdf + bez) / bez, 0), 1);
      var m0 = t * t * (3 - 2 * t);
      var m = m0 * m0;
      var len = Math.hypot(cx, cy) || 1;
      var dx = (-(cx / len) * m * k * bez);
      var dy = (-(cy / len) * m * k * bez);
      var i = y * w + x;
      dxs[i] = dx;
      dys[i] = dy;
      var ad = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
      if (ad > maxD) maxD = ad;
    }
  }
  var scale = maxD * 2;
  for (var p = 0, j = 0; j < dxs.length; j++, p += 4) {
    data[p] = Math.min(Math.max(dxs[j] / scale + 0.5, 0), 1) * 255;
    data[p + 1] = Math.min(Math.max(dys[j] / scale + 0.5, 0), 1) * 255;
    data[p + 2] = 128;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL(), scale: scale };
}

/* ---------- SVG 滤镜构造：feImage(贴图) + feDisplacementMap ---------- */
function svgHtml(id, w, h, url, scale) {
  return (
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' +
    '<filter id="' + id + '" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"' +
    ' x="0" y="0" width="' + w + '" height="' + h + '">' +
    '<feImage result="map" preserveAspectRatio="none" width="' + w + '" height="' + h + '" href="' + url + '"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G"' +
    ' scale="' + scale.toFixed(2) + '"/>' +
    '</filter></svg>'
  );
}

/* ---------- 渲染循环 ----------
 * 快照变化时：新元素 → 生成贴图并挂 svg；消失元素 → 摘 svg（挂载体积回收）；
 * CSS 挂载整体重建（同 id 幂等替换，不闪断）。同尺寸命中缓存直接跳过。 */
var sizeCache = {};   /* fx 标记 → "wxh@radius" 签名 */
var liveMarks = {};   /* 当前快照里存活的 fx 标记 */
var renderTimer = 0;
var lastRender = 0;

function render(items) {
  var css = ["<style>", MATERIAL_CSS];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.fx || !it.w || !it.h) continue;
    seen[it.fx] = true;
    var sig = it.w + "x" + it.h + "@" + it.radius;
    if (sizeCache[it.fx] !== sig) {
      var map = buildMap(it.w, it.h, it.radius);
      if (!map) continue;
      sizeCache[it.fx] = sig;
      var fid = "lg-" + it.fx;
      mount("svg-" + it.fx, svgHtml(fid, it.w, it.h, map.url, map.scale));
    }
    /* 链序律：blur 在前、折射在后、saturate 收尾 */
    var chain = "blur(" + BLUR + "px) url(#lg-" + it.fx + ") saturate(" + SATURATION + "%)";
    css.push('[data-fx="' + it.fx + '"]{backdrop-filter:' + chain + "!important;-webkit-backdrop-filter:" + chain + "!important}");
  }
  mount("css", css.join("") + "</style>");
  /* 摘除已消失标记的贴图（⌘K 关了再开是全新标记，旧 svg 必须回收） */
  for (var k in liveMarks) {
    if (!seen[k]) {
      unmount("svg-" + k);
      delete sizeCache[k];
    }
  }
  liveMarks = seen;
}

/* 重渲染节流：窗口拖拽缩放时 ResizeObserver 高频推送，120ms 合并一次 */
function schedule(items) {
  var run = function () {
    renderTimer = 0;
    render(items);
    lastRender = Date.now();
  };
  if (Date.now() - lastRender > 120) run();
  else if (!renderTimer) renderTimer = setTimeout(run, 120);
}

function mount(id, html) {
  var p = chushi.fx.mount(id, html);
  if (p && p.catch) p.catch(function () {});
}
function unmount(id) {
  var p = chushi.fx.unmount(id);
  if (p && p.catch) p.catch(function () {});
}

/* ---------- 启动：订阅即收到首帧快照，随开随渲染 ---------- */
var offResize = chushi.fx.onResize(schedule);
