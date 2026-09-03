/* ============================================================
 * 「初始」液态玻璃 —— WebGL 着色器（v1.5.0 · 玻璃游乐场移植版）
 * ============================================================
 * 出处与作者（法律与诚意声明，勿删）：
 *   本文件的物理模型与 GLSL 代码移植自开源项目 liquid-glass-webgl
 *   （「玻璃游乐场」，浏览器版 iOS 液态玻璃）：
 *     仓库：https://github.com/martin65536/liquid-glass-webgl
 *     作者：martin65536（Z.ai Agent 辅助开发）
 *     许可：Apache License 2.0
 *   其原型为 Kyant0 在 Android 上还原 iOS 液态玻璃的开源项目：
 *     仓库：https://github.com/Kyant0/AndroidLiquidGlass
 *     作者：Kyant0
 *     许可：Apache License 2.0
 *   移植时做了面向「初始」DOM 架构的精简：去掉 SDF 文本玻璃、
 *   开关/指示器/放大镜取径与 PEF/ping-pong 全景管线，仅保留
 *   「壁纸直采（LayerBackdrop）」路径 —— 与游乐场
 *   directBackdropSample 默认路径一致。
 *
 * 光学模型（对齐游乐场 element.ts，其本身忠实移植 AndroidLiquidGlass）：
 *   ① 透镜剖面 circleMap(t) = 1 − √(1−t²)：球面透镜投影，弯曲集中在
 *      边缘折射带（refractionHeight）内，深处平坦；
 *   ② 位移方向 = 圆角矩形 SDF 梯度（外法线）× refractionAmount
 *      （游乐场/Kyant 默认 −24dp，负号 = 凸透镜放大，本引擎在
 *      JS 侧取负传入，着色器公式保持原样）；
 *   ③ 色散 = 7 通道 ROYGBV 分层采样，权重矩阵照抄原 AGSL；
 *   ④ 霜化 = Vogel 金角螺旋 16-tap 高斯盘（JS 展开，WebGL1 常量循环）；
 *   ⑤ colorControls（饱和/亮度/对比）= Compose ColorFilter 移植；
 *   ⑥ 预乘 alpha 输出（premultiplied），杜绝边缘黑边。
 * ============================================================ */

/** Vogel 金角螺旋高斯盘：生成 tap 序列（sigma=1，运行时按半径缩放） */
function gaussianDisc(tapCount: number): Array<{ x: number; y: number; w: number }> {
  const taps: Array<{ x: number; y: number; w: number }> = [];
  if (tapCount <= 1) return [{ x: 0, y: 0, w: 1 }];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const maxRadius = 3; /* 3σ 截断 */
  let total = 0;
  for (let i = 0; i < tapCount; i++) {
    const t = (i + 0.5) / tapCount;
    const r = maxRadius * Math.sqrt(t);
    const a = i * goldenAngle;
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    const w = Math.exp(-0.5 * (x * x + y * y));
    taps.push({ x, y, w });
    total += w;
  }
  for (const t of taps) t.w /= total;
  return taps;
}

export const BLUR_TAPS = 16;

/** 展开 16-tap 纹理采样（WebGL1 循环边界须常量） */
function blurTapsGLSL(pxToUv: string): string {
  return gaussianDisc(BLUR_TAPS)
    .map(
      (t) =>
        `    sum += texture2D(uWallpaper, uv + vec2(${t.x.toFixed(6)}, ${t.y.toFixed(6)}) * ${pxToUv}) * ${t.w.toFixed(8)};`
    )
    .join("\n");
}

/* ---------- 公共 GLSL：SDF + cover 拟合 + 颜色工具 + 壁纸取样 ----------
 * blurCode：16-tap 高斯盘展开序列（JS 生成，函数化注入避免 GLSL1 常量循环限制） */
function commonGlsl(blurCode: string): string {
  return /* glsl */ `
// —— 移植自 liquid-glass-webgl shaders/sdf.ts（Kyant0/AndroidLiquidGlass Shaders.kt）——

// 圆角矩形 SDF：内部为负、边缘为 0、外部为正
float sdRoundedRect(vec2 coord, vec2 halfSize, float radius) {
    vec2 cornerCoord = abs(coord) - (halfSize - vec2(radius));
    float outside = length(max(cornerCoord, 0.0)) - radius;
    float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);
    return outside + inside;
}

// SDF 梯度（外法线）：折射方向与高光方向共用
vec2 gradSdRoundedRect(vec2 coord, vec2 halfSize, float radius) {
    vec2 cornerCoord = abs(coord) - (halfSize - vec2(radius));
    if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {
        vec2 v = max(cornerCoord, vec2(0.0));
        float len = length(v);
        if (len < 1e-6) return vec2(0.0);
        return sign(coord) * (v / len);
    } else {
        float gradX = step(cornerCoord.y, cornerCoord.x);
        return sign(coord) * vec2(gradX, 1.0 - gradX);
    }
}

vec2 rotateBy(vec2 v, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

// 球面透镜投影剖面（RoundedRectRefractionWithDispersionShaderString 原式）
float circleMap(float x) {
    return 1.0 - sqrt(1.0 - x * x);
}

// —— kenburns 逆变换：壁纸 <img> 持续缓动（scale + translate3d），
//    折射取样必须先回到壁纸布局坐标再 cover 拟合，否则玻璃看到的是漂移前的世界 ——
vec2 kenInverse(vec2 p) {
    return uScreenCenter + (p - uScreenCenter - uWpTranslate) / uWpScale;
}

// —— 壁纸 cover 拟合（CSS background-size:cover 等价映射，
//    移植自 liquid-glass-webgl shaders/sdf.ts COVER_GLSL）——
vec2 coverUv(vec2 canvasPx) {
    float canvasAspect = uScreenSize.x / uScreenSize.y;
    float wpAspect = uWallpaperSize.x / uWallpaperSize.y;
    vec2 uv = canvasPx / uScreenSize;
    if (wpAspect > canvasAspect) {
        float s = canvasAspect / wpAspect;
        uv.x = (uv.x - 0.5) * s + 0.5;
    } else {
        float s = wpAspect / canvasAspect;
        uv.y = (uv.y - 0.5) * s + 0.5;
    }
    return uv;
}

vec2 canvasPxToUvScale() {
    float canvasAspect = uScreenSize.x / uScreenSize.y;
    float wpAspect = uWallpaperSize.x / uWallpaperSize.y;
    if (wpAspect > canvasAspect) {
        return vec2(canvasAspect / wpAspect, 1.0) / uScreenSize;
    } else {
        return vec2(1.0, wpAspect / canvasAspect) / uScreenSize;
    }
}

// —— colorControls（饱和/亮度/对比，移植自 element-utils.ts，
//    对应 Compose ColorFilter.kt colorControlsColorFilter）——
vec3 applyColorControls(vec3 color, float brightness, float contrast, float saturation) {
    color += brightness;
    color = (color - vec3(0.5)) * contrast + vec3(0.5);
    float grey = dot(color, vec3(0.3086, 0.6094, 0.0820));
    color = mix(vec3(grey), color, saturation);
    return color;
}

// —— HSV 与 Hue 混合（染色用，移植自 element-utils.ts）——
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Skia 不可分离 Hue 混合：取源色相，保留目标饱和度/明度
vec3 blendHue(vec3 dst, vec3 src) {
    return hsv2rgb(vec3(rgb2hsv(src).x, rgb2hsv(dst).y, rgb2hsv(dst).z));
}

// —— 压暗遮罩（photo-scrim 等价：平底 + 上/下渐变，黑层叠加取最大）——
float scrimAlphaAt(float yNorm) {
    float aTop = uScrimTop * smoothstep(0.30, 0.0, yNorm);
    float aBottom = uScrimBottom * smoothstep(0.60, 1.0, yNorm);
    float a = uScrimFlat;
    a = max(a, aTop);
    a = max(a, aBottom);
    return a;
}

// —— 壁纸 + 压暗遮罩合成取样（游乐场 sampleBackdrop 壁纸路径）——
vec4 sampleWallpaper(vec2 canvasPx) {
    vec2 uv = coverUv(kenInverse(canvasPx));
    vec4 c;
    if (uBlurRadius < 0.5) {
        c = texture2D(uWallpaper, uv);
    } else {
        vec2 pxToUv = uBlurRadius * canvasPxToUvScale();
        vec4 sum = vec4(0.0);
${blurCode}
        c = sum;
    }
    float scrimA = scrimAlphaAt(canvasPx.y / uScreenSize.y);
    c.rgb = mix(c.rgb, vec3(0.0), scrimA);
    c.a = 1.0;
    return c;
}
`;
}

/* ---------- 玻璃体片元着色器（单元素视口渲染） ---------- */
export function elementFragmentSource(): string {
  const blurCode = blurTapsGLSL("pxToUv");
  const common = commonGlsl(blurCode);
  return /* glsl */ `
precision highp float;
// —— 移植自 liquid-glass-webgl shaders/element.ts 标准胶囊路径
//    （原型：Kyant0/AndroidLiquidGlass RoundedRectRefractionWithDispersionShaderString）——

uniform sampler2D uWallpaper;     // 壁纸纹理
uniform vec2  uScreenSize;        // 屏幕 CSS px（cover 拟合基准）
uniform vec2  uWallpaperSize;     // 壁纸纹理自然尺寸 px
uniform vec2  uWpScale;           // kenburns 缩放（getComputedStyle 逆解）
uniform vec2  uWpTranslate;       // kenburns 平移 px
uniform vec2  uScreenCenter;      // 屏幕中心（kenburns 变换原点）
uniform vec2  uElementSize;       // 元素 CSS px（本视口尺寸）
uniform vec2  uElementOffset;     // 元素左上角在屏幕上的 CSS px
uniform vec2  uLayerScale;        // 动画缩放（按压/速度拉伸），几何围绕元素中心
uniform float uDpr;               // 设备像素比（gl_FragCoord 设备 px → CSS px）
uniform float uCornerRadius;      // 圆角 CSS px（原始空间）
uniform float uRefractionHeight;  // 折射带高 px（原始空间，游乐场 refractionHeightFrac×短边）
uniform float uRefractionAmount;  // 折射量 px（游乐场语义为正数，JS 侧取负传入 = 凸透镜）
uniform float uDepthEffect;       // 0/1 深度效应（折射叠加向心分量）
uniform float uChromatic;         // 0..1 色散强度开关量
uniform float uBlurRadius;        // 霜化半径 px
uniform float uSaturation;        // 饱和度（1.5 = 游乐场 vibrancy）
uniform float uBrightness;        // 亮度偏移
uniform float uContrast;          // 对比
uniform vec4  uTintColor;         // 染色（Hue 混合 + 0.75α 罩）
uniform vec4  uSurfaceColor;      // 表面色（drawRect 等价）
uniform float uScrimFlat;         // 压暗遮罩平底 α
uniform float uScrimTop;          // 顶部渐变附加 α
uniform float uScrimBottom;       // 底部渐变附加 α
uniform float uEnterAlpha;        // 入场透明度 0..1

${common}

void main() {
    // gl_FragCoord（设备 px，左下原点）→ 元素局部 CSS px（左上原点）→ 屏幕 CSS px
    vec2 devicePx = vec2(gl_FragCoord.x, uElementSize.y * uDpr - gl_FragCoord.y);
    vec2 local = devicePx / uDpr;
    vec2 screenCoord = uElementOffset + local;

    vec2 halfSize = uElementSize * 0.5;
    vec2 centered = local - halfSize;
    vec2 layerScale = max(uLayerScale, vec2(1e-4));
    // 原始空间坐标（形状不被拉伸，缩放发生在输出 —— graphicsLayer 律）
    vec2 centeredOrig = centered / layerScale;
    vec2 origHalfSize = halfSize / layerScale;
    float origRadius = min(uCornerRadius / min(layerScale.x, layerScale.y), min(origHalfSize.x, origHalfSize.y));

    float sd = sdRoundedRect(centeredOrig, origHalfSize, origRadius);
    if (sd > 0.5) discard;
    float edgeAlpha = 1.0 - smoothstep(-0.5, 0.5, sd);

    vec4 backdrop = sampleWallpaper(screenCoord);
    vec3 color = applyColorControls(backdrop.rgb, uBrightness, uContrast, uSaturation);
    float alpha = backdrop.a;

    // —— 透镜折射（circleMap × SDF 梯度；负量 = 凸透镜放大）——
    if (uRefractionHeight > 0.5 && (-sd) < uRefractionHeight) {
        float sdClamped = min(sd, 0.0);
        float d = circleMap(1.0 - (-sdClamped) / uRefractionHeight) * uRefractionAmount;

        float gradRadius = min(origRadius * 1.5, min(origHalfSize.x, origHalfSize.y));
        vec2 grad = gradSdRoundedRect(centeredOrig, origHalfSize, gradRadius);
        vec2 depthVec = vec2(0.0);
        if (uDepthEffect > 0.5) {
            float dirLen = length(centeredOrig);
            if (dirLen > 1e-6) depthVec = centeredOrig / dirLen;
        }
        vec2 gradSum = grad + uDepthEffect * depthVec;
        float gradLen = length(gradSum);
        if (gradLen > 1e-6) grad = gradSum / gradLen;

        // 原始空间位移 → 屏幕空间取样点（layerScale 映射，graphicsLayer 律）
        vec2 refractedOffsetOrig = d * grad;
        vec2 refractedScreen = screenCoord + refractedOffsetOrig * layerScale;

        if (uChromatic > 0.5) {
            // 7 通道 ROYGBV 色散（权重矩阵照抄原 AGSL）
            float dispersionIntensity = uChromatic * ((centeredOrig.x * centeredOrig.y) / (origHalfSize.x * origHalfSize.y));
            vec2 dispersedOffsetScreen = refractedOffsetOrig * dispersionIntensity * layerScale;

            vec4 sRed    = sampleWallpaper(refractedScreen + dispersedOffsetScreen);
            vec4 sOrange = sampleWallpaper(refractedScreen + dispersedOffsetScreen * (2.0 / 3.0));
            vec4 sYellow = sampleWallpaper(refractedScreen + dispersedOffsetScreen * (1.0 / 3.0));
            vec4 sGreen  = sampleWallpaper(refractedScreen);
            vec4 sCyan   = sampleWallpaper(refractedScreen - dispersedOffsetScreen * (1.0 / 3.0));
            vec4 sBlue   = sampleWallpaper(refractedScreen - dispersedOffsetScreen * (2.0 / 3.0));
            vec4 sPurple = sampleWallpaper(refractedScreen - dispersedOffsetScreen);

            vec3 dispColor = vec3(0.0);
            float dispAlpha = 0.0;
            dispColor.r += sRed.r / 3.5;    dispAlpha += sRed.a / 7.0;
            dispColor.r += sOrange.r / 3.5; dispColor.g += sOrange.g / 7.0; dispAlpha += sOrange.a / 7.0;
            dispColor.r += sYellow.r / 3.5; dispColor.g += sYellow.g / 3.5; dispAlpha += sYellow.a / 7.0;
            dispColor.g += sGreen.g / 3.5;  dispAlpha += sGreen.a / 7.0;
            dispColor.g += sCyan.g / 3.5;   dispColor.b += sCyan.b / 3.0;   dispAlpha += sCyan.a / 7.0;
            dispColor.b += sBlue.b / 3.0;   dispAlpha += sBlue.a / 7.0;
            dispColor.r += sPurple.r / 7.0; dispColor.b += sPurple.b / 3.0; dispAlpha += sPurple.a / 7.0;

            color = applyColorControls(dispColor, uBrightness, uContrast, uSaturation);
            alpha = dispAlpha;
        } else {
            vec4 refracted = sampleWallpaper(refractedScreen);
            color = applyColorControls(refracted.rgb, uBrightness, uContrast, uSaturation);
            alpha = refracted.a;
        }
    }

    // —— onDrawSurface：染色（Hue + 0.75α）与表面色（游乐场 LiquidButton 律）——
    if (uTintColor.a > 0.001) {
        vec3 hueBlended = blendHue(color, uTintColor.rgb);
        color = mix(color, hueBlended, uTintColor.a);
        color = mix(color, uTintColor.rgb, 0.75 * uTintColor.a);
    }
    if (uSurfaceColor.a > 0.001) {
        color = mix(color, uSurfaceColor.rgb, uSurfaceColor.a);
    }

    // 预乘 alpha 输出（杜绝线性过滤暗边）
    float coverage = alpha * edgeAlpha * uEnterAlpha;
    gl_FragColor = vec4(color * coverage, coverage);
}
`;
}

/* ---------- 边缘高光片元着色器（独立 pass，Plus 混合） ---------- */
export const rimHighlightFragmentSource = /* glsl */ `
precision highp float;
// —— 移植自 liquid-glass-webgl shaders/highlight.ts RIM_HIGHLIGHT_FRAGMENT_SHADER
//    （原型：Kyant0 HighlightModifier.kt；描边 + BlurMaskFilter 等价）——

uniform vec2  uElementSize;
uniform vec2  uLayerScale;
uniform float uDpr;
uniform float uCornerRadius;
uniform vec3  uHighlightColor;
uniform float uHighlightAngle;    // 弧度
uniform float uHighlightFalloff;
uniform float uHighlightAlpha;
uniform float uHighlightMode;     // 0=Default 1=Ambient 2=Plain
uniform float uHighlightWidth;    // 全描边宽 px
uniform float uHighlightBlur;     // 高斯 σ px

float sdRoundedRect(vec2 coord, vec2 halfSize, float radius) {
    vec2 cornerCoord = abs(coord) - (halfSize - vec2(radius));
    float outside = length(max(cornerCoord, 0.0)) - radius;
    float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);
    return outside + inside;
}

vec2 gradSdRoundedRect(vec2 coord, vec2 halfSize, float radius) {
    vec2 cornerCoord = abs(coord) - (halfSize - vec2(radius));
    if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {
        vec2 v = max(cornerCoord, vec2(0.0));
        float len = length(v);
        if (len < 1e-6) return vec2(0.0);
        return sign(coord) * (v / len);
    } else {
        float gradX = step(cornerCoord.y, cornerCoord.x);
        return sign(coord) * vec2(gradX, 1.0 - gradX);
    }
}

void main() {
    vec2 devicePx = vec2(gl_FragCoord.x, uElementSize.y * uDpr - gl_FragCoord.y);
    vec2 local = devicePx / uDpr;
    vec2 halfSize = uElementSize * 0.5;
    vec2 centered = local - halfSize;
    vec2 layerScale = max(uLayerScale, vec2(1e-4));
    vec2 centeredOrig = centered / layerScale;
    vec2 origHalfSize = halfSize / layerScale;
    float origRadius = min(uCornerRadius / min(layerScale.x, layerScale.y), min(origHalfSize.x, origHalfSize.y));

    float sd = sdRoundedRect(centeredOrig, origHalfSize, origRadius);
    if (sd > 0.0) discard; // 只画内部（clipOutline 律）

    // 硬描边掩膜 ±width/2，3-tap 高斯卷积（σ 与 BlurMaskFilter 一致）
    float strokeHalf = uHighlightWidth * 0.5;
    float sigma = max(uHighlightBlur, 0.1);
    float strokeMask = 0.0;
    float wSum = 0.0;
    for (int i = -1; i <= 1; i++) {
        float offset = float(i) * sigma;
        float sampleSd = sd - offset;
        float hard = (abs(sampleSd) < strokeHalf) ? 1.0 : 0.0;
        float w = exp(-0.5 * (offset * offset) / (sigma * sigma));
        strokeMask += hard * w;
        wSum += w;
    }
    strokeMask /= wSum;
    strokeMask *= 0.5; // 裁剪减半（描边对称于边缘，外侧被裁）

    vec3 c;
    if (uHighlightMode < 0.5) {
        // Default：方向性白色高光（白 0.5，45°）
        float gradRadius = min(origRadius * 1.5, min(origHalfSize.x, origHalfSize.y));
        vec2 grad = gradSdRoundedRect(centeredOrig, origHalfSize, gradRadius);
        vec2 normal = vec2(cos(uHighlightAngle), sin(uHighlightAngle));
        float d = dot(grad, normal);
        float intensity = pow(abs(d), uHighlightFalloff);
        c = uHighlightColor * intensity * strokeMask * uHighlightAlpha;
    } else if (uHighlightMode < 1.5) {
        // Ambient：明暗两分（球面感）
        float gradRadius = min(origRadius * 1.5, min(origHalfSize.x, origHalfSize.y));
        vec2 grad = gradSdRoundedRect(centeredOrig, origHalfSize, gradRadius);
        vec2 normal = vec2(cos(uHighlightAngle), sin(uHighlightAngle));
        float d = dot(grad, normal);
        float intensity = pow(abs(d), uHighlightFalloff);
        float t = step(0.0, d);
        float i = intensity * strokeMask * uHighlightAlpha;
        c = uHighlightColor * t * i;
    } else {
        // Plain：均匀描边（游乐场面板/广场玻璃用，α=0.38）
        c = uHighlightColor * strokeMask * uHighlightAlpha;
    }
    gl_FragColor = vec4(c, 1.0); // Plus 混合（ONE, ONE），预乘贡献
}
`;

/* ---------- 全屏四边形顶点着色器 ---------- */
export const vertexSource = /* glsl */ `
attribute vec2 aPos;
void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;
