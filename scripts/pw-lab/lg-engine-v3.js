/* ============================================================
 * 液态玻璃引擎 v3 —— WebGL 物理透镜（全部代码住本预设包）
 * ============================================================
 * 架构律：「初始」只提供 API（v1.3.0 作用面），引擎整体住预设包：
 *   chushi.fx.attachCanvas(fx)  占位画布创建（宿主只出画布）
 *   chushi.fx.pushFrame(fx,bmp) 位图帧上屏（本地自绘 → ImageBitmap → 宿主 blit）
 *   chushi.fx.getBackdrop()     背景事实数据（photo 位图 / glow 描述）
 *   chushi.fx.onResize(cb)      玻璃容器快照 [{fx,key,w,h,radius,x,y}]
 *   chushi.fx.onPositions(cb)   transform 动画期视口坐标推送
 *   chushi.settings.define/get/onChange   设置面板贡献
 *
 * 物理模型（忠实移植 martin65536/liquid-glass-webgl ← Kyant0/AndroidLiquidGlass，
 * Apache-2.0；对齐 Apple 液态玻璃边缘折射观感）：
 *   ① 透镜剖面 circleMap(t)=1-√(1-t²)：球面透镜 2D 投影——弯曲从玻璃
 *      中心平滑累积到边缘，越靠边越陡（圆方程剖面 = 真实凸透镜厚度）；
 *   ② 方向 = SDF 梯度（边缘外法线）；位移量 d=circleMap(1-pen/H)×A，
 *      A 取负 → 边缘采样点向玻璃内偏 = 凸透镜放大（边缘看到更靠中心
 *      的世界被拉伸弯折，与 Apple/Kyant 默认 refractionAmount=-24dp 同向）；
 *   ③ 7 通道色散（ROYGBV 加权）、Vogel 金角螺旋 16-tap 高斯盘模糊、
 *      colorControls（饱和/对比/亮度）、边缘高光（stroke band 高斯卷积
 *      ×法线·光向 falloff，plus 混合）；
 *   ④ 采样基于全屏壁纸纹理：折射偏移在视口坐标系进行，边缘环带自然
 *      取到元素边界外的世界——无需 SVG 贴图域外扩。
 *
 * 稳定律：
 *   - WebGL canvas 自绘不受 backdrop-filter 重栅格化影响，布局/弹簧
 *     动画期无闪动（v1.2.0 SVG 方案的防闪 hack 不再需要）；
 *   - 静态效果按需重绘（快照/位置/参数/纹理变化），无逐帧循环；
 *   - 沙箱禁 rAF（隐藏 iframe 渲染循环暂停）——一律 setTimeout 合帧；
 *   - WebGL/OffscreenCanvas 不可用 → 降级纯 CSS 材质（blur+saturate）。
 * ============================================================ */
/* ---------- 材质参数（chushi.settings 驱动，改动即热生效） ---------- */
var DEFAULTS = {
  refPct: 145,       /* 折射强度 %：位移上限 = refPct/100 × 16px（145 ≈ 原版 -24dp） */
  bandPct: 26,       /* 透镜环带深度 %（半短边占比，circleMap 归一化深度 H） */
  blurPx: 3,         /* 霜化模糊 px（Vogel 盘半径） */
  satPct: 180,       /* 饱和度 %（提鲜让折射带色彩可辨） */
  brightPct: 100,    /* 透亮 %（玻璃体亮度微提） */
  dispersion: false, /* 边缘色散：7 通道分层折射（彩虹棱边） */
  specular: true,    /* 边缘高光（stroke band + 左上光向） */
};
var cfg = {};
function applyCfg(v) {
  for (var k in DEFAULTS) {
    cfg[k] = (v && typeof v[k] !== "undefined" && v[k] !== null) ? v[k] : DEFAULTS[k];
  }
}
if (chushi.settings && chushi.settings.define) {
  try {
    chushi.settings.define({
      title: "液态玻璃",
      controls: [
        { type: "slider", key: "refPct", label: "折射强度", min: 0, max: 300, step: 5, def: 145, unit: "%" },
        { type: "slider", key: "bandPct", label: "环带深度", min: 8, max: 60, step: 1, def: 26, unit: "%" },
        { type: "slider", key: "blurPx", label: "霜化模糊", min: 0, max: 12, step: 1, def: 3, unit: "px" },
        { type: "slider", key: "satPct", label: "饱和度", min: 100, max: 260, step: 5, def: 180, unit: "%" },
        { type: "slider", key: "brightPct", label: "透亮", min: 80, max: 140, step: 1, def: 100, unit: "%" },
        { type: "toggle", key: "dispersion", label: "边缘色散", def: false },
        { type: "toggle", key: "specular", label: "边缘高光", def: true },
      ],
    });
  } catch (e) { /* 宿主校验拒绝则用默认参数渲染 */ }
}
applyCfg(chushi.settings && chushi.settings.get ? await chushi.settings.get() : null);

/* ---------- GLSL ---------- */
var VERT = "attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}";

/* Vogel 金角螺旋高斯盘（16 tap，σ=1，运行时乘半径） */
function vogel(n) {
  var t = [], ga = Math.PI * (3 - Math.sqrt(5)), tot = 0, i;
  for (i = 0; i < n; i++) {
    var r = 3 * Math.sqrt((i + 0.5) / n), a = i * ga;
    var x = r * Math.cos(a), y = r * Math.sin(a);
    var w = Math.exp(-0.5 * (x * x + y * y));
    tot += w; t.push([x, y, w]);
  }
  for (i = 0; i < n; i++) t[i][2] /= tot;
  return t;
}
function tapsGlsl(taps, fn) {
  var s = "";
  for (var i = 0; i < taps.length; i++) {
    s += "s+=" + fn(taps[i]) + ";";
  }
  return s;
}
var T16 = vogel(16), T6 = vogel(6);

var FRAG_HEADER =
  "precision highp float;" +
  "uniform sampler2D uWp;uniform vec2 uViewport;uniform vec2 uWpSize;" +
  "uniform vec2 uSize;uniform vec2 uOrigin;uniform float uRadius;uniform float uDpr;" +
  "uniform float uBmpH;uniform float uRH;uniform float uRA;uniform float uBlur;" +
  "uniform float uSat;uniform float uBright;uniform float uDisp;uniform float uSpec;" +
  "float cm(float x){return 1.0-sqrt(max(0.0,1.0-x*x));}" +
  "float sdRR(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+vec2(r);" +
  "return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;}" +
  "vec2 gradRR(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+vec2(r);" +
  "if(q.x>=0.0||q.y>=0.0){vec2 v=max(q,vec2(0.0));float l=length(v);" +
  "return l<1e-6?vec2(0.0):sign(p)*(v/l);}" +
  "float gx=step(q.y,q.x);return sign(p)*vec2(gx,1.0-gx);}" +
  "vec2 coverUv(vec2 w){vec2 uv=w/uViewport;float ca=uViewport.x/uViewport.y;" +
  "float wa=uWpSize.x/uWpSize.y;" +
  "if(wa>ca)uv.x=(uv.x-0.5)*(ca/wa)+0.5;else uv.y=(uv.y-0.5)*(wa/ca)+0.5;return uv;}" +
  "vec2 pxUv(){float ca=uViewport.x/uViewport.y;float wa=uWpSize.x/uWpSize.y;" +
  "return wa>ca?vec2(ca/wa,1.0)/uViewport:vec2(1.0,wa/ca)/uViewport;}" +
  "vec3 cctl(vec3 c,float br,float con,float sat){float l=dot(c,vec3(0.213,0.715,0.072));" +
  "c=mix(vec3(l),c,sat);c=(c-0.5)*con+0.5;return c+br;}";

function buildFrag() {
  var fast = tapsGlsl(T16, function (t) {
    return "texture2D(uWp,uv+vec2(" + t[0].toFixed(4) + "," + t[1].toFixed(4) + ")*sc)*" + t[2].toFixed(5);
  });
  var low = tapsGlsl(T6, function (t) {
    return "texture2D(uWp,uv+vec2(" + t[0].toFixed(4) + "," + t[1].toFixed(4) + ")*sc)*" + t[2].toFixed(5);
  });
  return FRAG_HEADER +
    "vec4 smp(vec2 w,float r){vec2 uv=coverUv(w);" +
    "if(r<0.5)return texture2D(uWp,uv);" +
    "vec2 sc=pxUv()*r;vec4 s=vec4(0.0);" + fast + "return s;}" +
    "vec4 smpD(vec2 w,float r){vec2 uv=coverUv(w);" +
    "if(r<0.5)return texture2D(uWp,uv);" +
    "vec2 sc=pxUv()*r;vec4 s=vec4(0.0);" + low + "return s;}" +
    "void main(){" +
    "vec2 frag=vec2(gl_FragCoord.x,uBmpH-gl_FragCoord.y)/uDpr;" +
    "vec2 hf=uSize*0.5;vec2 c=frag-hf;" +
    "float sd=sdRR(c,hf,uRadius);" +
    "if(sd>0.5)discard;" +
    "float edge=1.0-smoothstep(-0.5,0.5,sd);" +
    "vec2 gr=gradRR(c,hf,min(uRadius*1.5,min(hf.x,hf.y)));" +
    "float sdc=min(sd,0.0);" +
    "float d=(uRH>0.5&&(-sdc)<uRH)?cm(1.0-(-sdc)/uRH)*uRA:0.0;" +
    "vec2 world=uOrigin+frag+d*gr;" +
    "vec3 col;float al;" +
    "if(uDisp>0.5&&d!=0.0){" +
    "float di=(c.x*c.y)/(hf.x*hf.y);vec2 doff=d*gr*di;" +
    "vec3 a3=vec3(0.0);float aa=0.0;vec4 s;" +
    "s=smpD(world+doff,uBlur);a3.r+=s.r/3.5;aa+=s.a/7.0;" +
    "s=smpD(world+doff*0.667,uBlur);a3.r+=s.r/3.5;a3.g+=s.g/7.0;aa+=s.a/7.0;" +
    "s=smpD(world+doff*0.333,uBlur);a3.r+=s.r/3.5;a3.g+=s.g/3.5;aa+=s.a/7.0;" +
    "s=smpD(world,uBlur);a3.g+=s.g/3.5;aa+=s.a/7.0;" +
    "s=smpD(world-doff*0.333,uBlur);a3.g+=s.g/3.5;a3.b+=s.b/3.0;aa+=s.a/7.0;" +
    "s=smpD(world-doff*0.667,uBlur);a3.b+=s.b/3.0;aa+=s.a/7.0;" +
    "s=smpD(world-doff,uBlur);a3.r+=s.r/7.0;a3.b+=s.b/3.0;aa+=s.a/7.0;" +
    "col=cctl(a3,uBright,1.0,uSat);al=aa;" +
    "}else{" +
    "vec4 b=smp(world,uBlur);col=cctl(b.rgb,uBright,1.0,uSat);al=b.a;}" +
    "if(uSpec>0.5){" +
    "float half_=1.6;float sig=1.2;float sm=0.0;float ws=1.0+2.0*exp(-0.5);" +
    "for(int i=-1;i<=1;i++){float o=float(i)*sig;" +
    "sm+=((abs(sd-o)<half_)?1.0:0.0)*exp(-0.5*o*o/(sig*sig));}" +
    "sm/=ws;sm*=0.5;" +
    "float inten=pow(abs(dot(gr,vec2(-0.6,-0.8))),1.0);" +
    "col+=vec3(1.0)*inten*sm*0.5;}" +
    "float cov=al*edge;" +
    "gl_FragColor=vec4(col*cov,cov);" +
    "}";
}

/* ---------- 背景纹理（宿主事实数据 → 共享离屏画布，一次构建） ---------- */
var bgCanvas = null, bgKind = "", bgFetchedAt = 0, bgVw = 1280, bgVh = 800, glBroken = false;

function buildBgCanvas(desc, bitmap) {
  var vw = Math.max(1, desc.vw || 1280), vh = Math.max(1, desc.vh || 800);
  var c = document.createElement("canvas");
  var long = Math.max(vw, vh), scale = Math.min(1, 1600 / long);
  c.width = Math.round(vw * scale);
  c.height = Math.round(vh * scale);
  var x = c.getContext("2d");
  if (!x) return null;
  x.fillStyle = desc.base || (desc.dark ? "#0a0a0e" : "#f6f5f2");
  x.fillRect(0, 0, c.width, c.height);
  if (desc.kind === "photo" && bitmap) {
    /* 壁纸 cover 裁剪（与宿主 object-cover 同律） */
    var ba = bitmap.width / bitmap.height, ca = c.width / c.height;
    var dw = ba > ca ? c.width * (ba / ca) : c.width;
    var dh = ba > ca ? c.height : c.height * (ca / ba);
    x.drawImage(bitmap, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    var scrim = desc.scrim;
    if (scrim && scrim.stops) {
      var g = x.createLinearGradient(0, 0, 0, c.height);
      for (var i = 0; i < scrim.stops.length; i++) {
        g.addColorStop(scrim.stops[i][0], "rgba(0,0,0," + scrim.stops[i][1] + ")");
      }
      x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
      if (scrim.flat) {
        x.fillStyle = "rgba(0,0,0," + scrim.flat + ")"; x.fillRect(0, 0, c.width, c.height);
      }
    }
  } else if (desc.kind === "glow" && desc.blobs && desc.blobs.length) {
    for (var j = 0; j < desc.blobs.length; j++) {
      var b = desc.blobs[j];
      var r = b.r * c.width;
      var gr = x.createRadialGradient(b.x * c.width, b.y * c.height, 0, b.x * c.width, b.y * c.height, r);
      gr.addColorStop(0, b.color);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = gr;
      x.fillRect(0, 0, c.width, c.height);
    }
  }
  return c;
}

var bgFetching = false;
async function ensureBackdrop() {
  if (bgCanvas && Date.now() - bgFetchedAt < 60000) return true;
  if (!chushi.fx.getBackdrop) return false;
  /* 在途合并：并发调用等同一轮结果；有旧底时失败兜底不中断渲染 */
  if (!bgFetching) {
    bgFetching = true;
    try {
      var r = await chushi.fx.getBackdrop();
      if (r && r.ok && r.desc) {
        var c = buildBgCanvas(r.desc, r.bitmap);
        if (c) {
          bgCanvas = c;
          bgKind = r.desc.kind;
          bgVw = Math.max(1, r.desc.vw || 1280);
          bgVh = Math.max(1, r.desc.vh || 800);
          bgFetchedAt = Date.now();
        }
      }
    } catch (e) { /* 旧底兜底 */ }
    bgFetching = false;
  } else {
    /* 等待在途请求落地（轮询合帧；沙箱禁 rAF，setTimeout 合规） */
    for (var i = 0; i < 40 && bgFetching; i++) {
      await new Promise(function (res) { setTimeout(res, 25); });
    }
  }
  return bgCanvas != null;
}

/* ---------- WebGL 元素引擎 ---------- */
var els = {};        /* fx → state */
var dprCap = Math.min((typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1), 2);
var pendingDraw = false;

function initGl(st, cnv) {
  var gl = cnv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return false;
  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  }
  var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, buildFrag());
  if (!vs || !fs) return false;
  var pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
  gl.useProgram(pr);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (bgCanvas) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgCanvas);
  st.gl = gl; st.pr = pr; st.tex = tex;
  st.u = {};
  var names = ["uViewport", "uWpSize", "uSize", "uOrigin", "uRadius", "uDpr", "uBmpH", "uRH", "uRA", "uBlur", "uSat", "uBright", "uDisp", "uSpec"];
  for (var i = 0; i < names.length; i++) st.u[names[i]] = gl.getUniformLocation(pr, names[i]);
  return true;
}

function draw(st) {
  if (!st.gl || !bgCanvas || !st.local) return;
  var gl = st.gl;
  var W = Math.max(1, Math.round(st.w * dprCap)), H = Math.max(1, Math.round(st.h * dprCap));
  if (st.local.width !== W || st.local.height !== H) {
    st.local.width = W; st.local.height = H;
  }
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(st.pr);
  gl.bindTexture(gl.TEXTURE_2D, st.tex);
  /* 背景画布重建（壁纸切换/过期重取）后按引用比对重传纹理 */
  if (st.bgRef !== bgCanvas) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgCanvas);
    st.bgRef = bgCanvas;
  }
  var u = st.u;
  gl.uniform2f(u.uViewport, bgVw, bgVh);
  gl.uniform2f(u.uWpSize, bgCanvas.width, bgCanvas.height);
  gl.uniform2f(u.uSize, st.w, st.h);
  gl.uniform2f(u.uOrigin, st.x, st.y);
  gl.uniform1f(u.uRadius, st.radius);
  gl.uniform1f(u.uDpr, dprCap);
  gl.uniform1f(u.uBmpH, H);
  gl.uniform1f(u.uRH, Math.max(2, (Math.min(st.w, st.h) / 2) * (cfg.bandPct / 100)));
  gl.uniform1f(u.uRA, -(cfg.refPct / 100) * 16);
  gl.uniform1f(u.uBlur, cfg.blurPx);
  gl.uniform1f(u.uSat, cfg.satPct / 100);
  gl.uniform1f(u.uBright, (cfg.brightPct - 100) / 100);
  gl.uniform1f(u.uDisp, cfg.dispersion ? 1 : 0);
  gl.uniform1f(u.uSpec, cfg.specular ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  pushFrame(st, W, H);
}

/* 帧上屏：本地位图 → ImageBitmap → 宿主 blit（在途合并防消息洪峰） */
var frameBusy = {};
function pushFrame(st, W, H) {
  if (frameBusy[st.fx] || !chushi.fx.pushFrame) return;
  frameBusy[st.fx] = true;
  createImageBitmap(st.local)
    .then(function (bmp) {
      return chushi.fx.pushFrame(st.fx, bmp, W, H);
    })
    .catch(function () {})
    .then(function () {
      delete frameBusy[st.fx];
    });
}

function scheduleDraw() {
  if (pendingDraw) return;
  pendingDraw = true;
  setTimeout(function () {
    pendingDraw = false;
    for (var k in els) draw(els[k]);
  }, 32);
}

/* ---------- 降级：WebGL 不可用时挂纯 CSS 材质（blur 在前折射无，链序律保留） ---------- */
var fallbackOn = false;
function setFallback(on) {
  if (on === fallbackOn) return;
  fallbackOn = on;
  if (on) {
    mount("css", "<style>" +
      "[data-fx]{backdrop-filter:blur(" + cfg.blurPx + "px) saturate(" + cfg.satPct + "%)!important;" +
      "-webkit-backdrop-filter:blur(" + cfg.blurPx + "px) saturate(" + cfg.satPct + "%)!important;" +
      "background:rgb(255 255 255/.18)!important}html.dark [data-fx]{background:rgb(255 255 255/.06)!important}" +
      "</style>");
  } else {
    unmount("css");
  }
}

function mount(id, html) {
  var p = chushi.fx.mount(id, html);
  if (p && p.catch) p.catch(function () {});
}
function unmount(id) {
  var p = chushi.fx.unmount(id);
  if (p && p.catch) p.catch(function () {});
}

/* ---------- 快照驱动：新元素挂 canvas，几何变化重绘 ---------- */
function onSnapshot(items) {
  snapChain = snapChain
    .then(function () { return processSnap(items); })
    .catch(function () {});
}
var snapChain = Promise.resolve();
async function processSnap(items) {
  if (glBroken) { setFallback(true); return; }
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.fx || !it.w || !it.h) continue;
    seen[it.fx] = true;
    var st = els[it.fx];
    /* React remount 会连带销毁宿主画布：引擎状态与 DOM 失同步即弃置重建 */
    if (st && st.local && it.cv === false) {
      delete els[it.fx];
      st = null;
    }
    if (!st) {
      st = { fx: it.fx, w: it.w, h: it.h, radius: it.radius, x: it.x || 0, y: it.y || 0 };
      els[it.fx] = st;
      if (!chushi.fx.attachCanvas) { breakGl(); return; }
      var r = await chushi.fx.attachCanvas(it.fx);
      if (!r || !r.ok) {
        /* 快照过期等临时失败（⌘K 开合期常态）：只弃置该元素，下轮快照重试；
         * 不触发全局降级——其余元素的 WebGL 通道不受牵连 */
        delete els[it.fx];
        continue;
      }
      /* 本地画布自绘（preserveDrawingBuffer 保证 createImageBitmap 可读），
       * 画好经 pushFrame 交宿主 blit——位图通道跨内核可靠 */
      st.local = document.createElement("canvas");
      var bgOk = await ensureBackdrop();
      if (!bgOk) { breakGl(); return; }
      if (!initGl(st, st.local)) { breakGl(); return; }
      setFallback(false);
      draw(st); st.drawn = true;
      continue;
    }
    var gChanged = st.w !== it.w || st.h !== it.h || st.radius !== it.radius;
    if (gChanged || !st.drawn) {
      st.w = it.w; st.h = it.h; st.radius = it.radius;
      if (typeof it.x === "number") st.x = it.x;
      if (typeof it.y === "number") st.y = it.y;
      draw(st); st.drawn = true;
    } else if (typeof it.x === "number" && (st.x !== it.x || st.y !== it.y)) {
      st.x = it.x; st.y = it.y; draw(st);
    }
  }
  for (var k in els) {
    if (!seen[k]) delete els[k]; /* 元素卸载：状态弃置（宿主 canvas 随子树回收） */
  }
}

/* WebGL 通道不可用（不支持 OffscreenCanvas 转移 / context 创建失败 /
 * 背景不可得）：永久降级纯 CSS 材质，不再逐快照重试 */
function breakGl() {
  glBroken = true;
  for (var k in els) delete els[k];
  setFallback(true);
}

/* ---------- 位置推送：弹簧动画期逐帧对齐壁纸采样坐标 ---------- */
var posTimer = 0, pendPos = null;
if (chushi.fx.onPositions) {
  chushi.fx.onPositions(function (items) {
    pendPos = items;
    if (posTimer) return;
    posTimer = setTimeout(function () {
      posTimer = 0;
      var arr = pendPos || [];
      for (var i = 0; i < arr.length; i++) {
        var st = els[arr[i].fx];
        if (st && (st.x !== arr[i].x || st.y !== arr[i].y)) {
          st.x = arr[i].x; st.y = arr[i].y; draw(st);
        }
      }
    }, 16);
  });
}

/* ---------- 参数热更新：换参即全量重绘 ---------- */
if (chushi.settings && chushi.settings.onChange) {
  chushi.settings.onChange(function (v) {
    applyCfg(v);
    setFallback(fallbackOn);
    for (var k in els) draw(els[k]);
    scheduleDraw();
  });
}

/* ---------- 启动：订阅即收首帧快照 ---------- */
var offResize = chushi.fx.onResize(onSnapshot);
