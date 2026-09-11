/* ============================================================================
 * 「初始」ext-card v8.3.1 —— 内容脚本：悬浮音乐卡（置顶所有网页，三态）
 *
 * v8.3.1 用户实机反馈六连：
 *   ① 封面 clone 出厂不可见根治（cover→mini「封面没有一镜到底」真凶）：
 *      cloneNode 连内联样式一起走——display 切换（coverEl none）先于克隆，
 *      clone 出厂即 display:none = 封面瞬移全程隐身（录屏实帧取证：暗壳
 *      中间无封面）。covClone 无条件 display:block 拨正。
 *   ② 弹簧克制化（用户：太过了，和「初始」一样就行）——壳弹簧改 dock
 *      standard 同参（420/34，ζ≈0.83，~1% 微过冲）；封面 clone 临界阻尼
 *      （420/41，零过冲——「封面没必要有回弹」）。10% 大过冲读作「复位」
 *      的观感问题随阻尼提升整体消退（三态封面复位 = 弹簧回弹的视觉解读）。
 *   ③ 高光渐入——形变落地辉光 0→满格太突兀：cleanup 归零目标态缓存 +
 *      glowRampAt 起点，paintGlow 按 smoothstep ~480ms 渐入（含提亮/饱和）。
 *   ④ 律动更明显（弱歌隐形根治）——三轴 AGC：峰值跟随天花板（快攻慢放，
 *      地板 0.12），显示值=包络/天花板——《不凡》等低音能量小的曲子被拉
 *      回满幅可见区间；pow 0.85→0.75 + 增益上调（brightness 0.42/glow 0.68）。
 *   ⑤ 歌词动效对齐「初始」完全体（用户视频示例）——当前行 scale 1.06/
 *      邻行 0.94 呼吸过渡，滚动 .55s→.45s，行色 .5s→.35s（入场行滚动途中
 *      即亮）。
 *   ⑥ 壳/封面统一形变时长 D（关键帧自带 offset，WAAPI 拉伸同曲线）——
 *      杜绝两弹簧时长差导致先到者提前 cancel 迟到者。
 *
 * v8.3.0 用户实机反馈两连：
 *   ① 一镜到底动画重做（用户澄清：封面不是不能动——要修的是 v8.2.7 clone
 *      落地的「校准卡顿」；v8.2.9 的「壳变形+封面原地不动+内容长淡入淡出」
 *      读作线性动画且 mini⇄full 有复位感，全部推翻）。三件套：
 *      a) 真弹簧形变——springFrames 采样单位弹簧（k=430/d=26，欠阻尼 ~8%
 *         过冲 = dock 弹簧手感），width/height/left/top/borderRadius 全部按
 *         同一进度轨迹采样成关键帧（WAAPI linear 插样本 = 物理曲线），
 *         cleanup 时样式即终态 = 零校准跳变；
 *      b) 封面连续锚——covClone 从「当前态封面实测矩形」飞到「目标态封面
 *         实测矩形」（两端都 getBoundingClientRect 实测，落地即目标元素
 *         真实布局位 = 校准零误差；v8.2.7 的卡顿真凶是 transform:scale 的
 *         位图缩放与估算终态不重合）；飞行走布局属性（逐帧清晰不拉伸），
 *         落地瞬间 clone 撤、真封面同矩形接管（同帧同位，无接缝）；
 *      c) 内容快交叉——旧壳瞬时让位（新壳同矩形不透明底第 0 帧盖住），
 *         新内容 t+60ms 起级联上浮淡入（dock content-focus 同语言 26ms
 *         级联），收缩方向内容前 32% 淡出；形变期壳 overflow:hidden（内容
 *         生长裁切 = dock 同款），辉光由 clone 携带（裁切不伤光）；真封面
 *         本体延迟到 clone 落地才显形（防双封面同屏）。
 *      附证：cscardin 入场动画改 .boot 类仅首挂载——display:none→block 会
 *         重放 CSS 动画，旧版每次切换都叠一层 0.96→1 缩放 = 「复位感」
 *         真凶之二。
 *   ② 数据面休眠退役（用户指令「不要休眠音乐面板」——切歌后面板留在
 *      上一首）：卡侧不再发 vis 上报，SW 侧 state 轮询的 visCount 门整体
 *      拆除（详见 ext-bg.js）——只要还有卡片 Port 就持续 1Hz 拉真值。
 *      渲染层休眠律（v8.2.6 needFrame）保留：那只管 rAF 绘制帧，state
 *      消息驱动的内容更新从来不在轮询路径上，二者无关。
 *
 * v8.2.9 用户实机反馈五连：
 *   ① 桥响应迟钝浮窗侧配套：无（根修在桥插件 200ms 快排与页面端；本文件只
 *      接频段细化与全局开关）。
 *   ② 逐行歌词快一拍——align 第三参 lineMode：逐行渲染用原始时基（0ms），
 *      逐字扫光保持 -100ms 延迟补偿（v8.2.8 引入的统一延后让逐行显慢）。
 *   ③ 右键隐藏退役（用户指令）——改「初始」面板双开关：
 *      「律动」→ storage.local.cardGlow（默认开，关 = 封面/光晕律动停 +
 *      频谱订阅撤）；「浮窗」→ storage.local.cardEnabled（默认开，关 =
 *      本卡片卸下+断 SW，开启后所有网页显示；全局开关替代按站隐藏）。
 *   ④ 频段细化——specTgt 按 bands.length 自适应：128 段·实际映射（中 9..84
 *      ≈ 250Hz~2kHz / 高 85+ ≈ 2k~16kHz）与旧 16 段两代语义。
 *   ⑤ 三态动画修订（用户：封面都会位移去复位 + 完全体跳一下）：
 *      a) 封面 clone 飞形退役——形变期内容淡出/淡入已掩护封面重排，
 *         封面不再飞行（观感 = 面板壳在变形，封面原地不动）；
 *         b) 跳变根治——旧版切换即 applyPos 按新态宽度 clamp，贴边时新面板
 *         先跳后形变；现形变期钉住源位，left/top 一并动画到夹紧位，
 *         cleanup 才提交 pos。
 * v8.2.8 用户实机反馈五连：
 *   ① 浮窗强行逐字跟随——「初始」面板的强行逐字开关经 NewTab 镜像到
 *      storage.local.cardForceWord（PresetWidgets storageSet 分支，cardAcc
 *      同律），浮窗读取 + onChanged 热跟随；开 = lrc 源走伪逐字
 *      （unitizeLine 词级时间轴已在 parse 生成，只切渲染模式），
 *      yrc 真逐字永不降级。
 *   ② 跳转后歌词对不上（逐行尤严重）根治——间奏滚动跟进：seek 跨间奏
 *      落入时歌词区立即滚到已唱界行（旧版停在旧滚动位直到下一句开始 =
 *      长间奏歌词区完全错位）；transform 写值防抖。
 *   ③ 伴奏期逐字缓慢移动根治——ext-lyric.js 末词行尾硬终点律（词 d 离群
 *      检测压缩）+ LYR_LAG_MS=100 歌词延迟补偿（逐字比唱的快 = SMTC
 *      position 领先音频输出的系统性差，扫光等唱声到位）。
 *   ④ 去方框律——v8.2.7 的 .gring 细节环废弃（用户：方框太丑）；「细节」
 *      的本意 = 律动覆盖高中低音且细腻：三轴全部融入封面 filter
 *      （brightness/saturate/contrast）与辉光本体（opacity/scale 全频段
 *      合成），pow 0.85 非线性提升小信号可见度，分轴攻放（中高频攻快放快
 *      = 跟手，低音慢放 = 鼓点余韵）。
 *   ⑤ 三态切换形变律（dock 面板同语言·一镜到底）——目标面板从源矩形
 *      width/height/borderRadius 布局形变出来（cover→mini 从 56×56 长出、
 *      mini→cover 收缩成 56×56 正方形再无缝接管、mini⇄full 长方形互变），
 *      封面 clone 连续飞形（唯一连续锚），内容形变大半后淡入（不挤压）；
 *      收缩方向旧面板本体承担形变（其壳收缩成封面正方形）。
 *      SW 30Hz + native FFT 40Hz（延迟反馈），包络分轴攻放。
 * v8.2.7 实机反馈三连：
 *   ① 律动变亮律——旧辉光只在封面外圈晕开观感「变暗」；现封面本体随低音
 *      提亮（brightness/saturate 直写，只碰合成器友好属性），辉光上限
 *      0.5→0.85；中频驱动 .gring 细节环（rim light 无模糊，中频段看得清），
 *      高频驱动饱和脉冲——三轴包络（低/中/高）拆自 16 频段原始帧。
 *   ② 封面态 48→56px + 封面态同款律动高光（glow+gring 上身，overflow 放开）。
 *   ③ 三态切换一镜到底——clone 封面从旧态矩形连续飞到新态矩形
 *      （translate+scale），面板同时以「新封面中心」为 transform-origin
 *      长出（展开）/缩回（收进封面），同步开始；中断安全（finish 跳末态），
 *      prefers-reduced-motion / 标签隐藏直切。
 * v8.2.6 性能特供（「5070 卡成屎」根治·渲染休眠律）：
 *   ① rAF 主循环休眠改造——旧版 requestAnimationFrame(loop) 无条件永转，
 *      每个开着网页的前台标签 60fps 永动（Chrome 只暂停后台标签 rAF，
 *      前台标签哪怕浮窗无曲目也全帧跑）。现 needFrame() 判定「还有活干」
 *      才续帧：hidden 立睡 / 无曲目睡 / mini·cover 纯走针降 200ms 定时
 *      节拍（字符串每秒才变一次）/ 辉光衰减尾归零后才睡。
 *   ② visibilitychange 联动——标签切后台：spec off + vis off + sleepNow；
 *      切回：spec on + vis on + wake。后台标签整体撤离频谱链路，
 *      SW specWanted 归零 → 助手零消费者 → v8.2.5 需求门让引擎长眠。
 *   ③ connect() 频谱订阅按可见性初值（hidden 标签不订阅）。
 * v8.2.3 实机反馈四连修：
 *   ① 高光跑封面上根治——.glow（absolute）原来直接盖在静态 img 上 + 被
 *      .cov overflow:hidden 裁成贴脸色块；现 img relative z-index:1 压住
 *      glow、去裁剪，光环像「初始」面板一样从封面四周晕出；
 *   ② 逐字行底色两色调——active 行词底 #b4b4bc（未来#71717a/done#8e8e96/
 *      扫光白四级阶梯），行切换交叉渐隐窗口里当前行恒为视觉主角；
 *   ③ 标准态顶带 30→26px + 带左常显当前时间（红圈「太空」 feedback）；
 *   ④ 主题色跟随「初始」强调色——chrome.storage.local.cardAcc（NewTab
 *      settings.accent 镜像）→ host --acc + onChanged 热跟随，封面占位
 *      渐变 color-mix(--acc)。
 * v8.2.2 实机反馈五连修：
 *   ① 歌词乱跳根治（数据面）——状态真值改为连续锚定：微抖带（≤0.9s）不重锚
 *      （轨迹继续走），中幅偏差（≤2.5s）软重锚 800ms smoothstep 入轨，
 *      更大（seek/切歌）才硬跟随；ne.ts 采样年龄由 ext-bg 透传（同
 *      sandbox.js 恒源钉守/软重锚家族语义，旧版每秒硬换锚 = 锯齿源）。
 *   ② 逐字高光提前消失根治——扫光到 100% 后高光挂住，直到行切换才随
 *      done 渐隐（250ms 自动渐隐废弃）；间奏段同样挂住（自然流入
 *      activeLine===lastLine 不动 DOM），下一句开始才渐灰。
 *   ③ 浮窗任何位置点击都不再跳转「初始」（openPanel 全拆）。
 *   ④ 封面态可拖动：按住拖动（>6px）移窗，单击展开；原生图拖拽 ghost
 *      全面禁止（draggable=false + dragstart 拦截，浮窗与初始面板同律）。
 *   ⑤ 标准态右上钮组独立顶带（与播放/上一首/下一首明确分行）；
 *      写值防抖（词扫光/时间/进度只在变化时写 DOM）。
 *   v8.2.1 三态律保留：封面态（48px 整卡即封面+播放绿点）/标准态
 *   （[收起成封面][放大到完全体]，点进度条→完全体）/完全体（yrc 真逐字
 *   +lrc 逐行+翻译+seek 进度条）；closed Shadow DOM / SW 中继 / 位置持久
 *   / 右键隐藏 / 辉光律动不变。歌词引擎在 ext-lyric.js（build 拼接在前）。
 * ==========================================================================*/

"use strict";

(function () {
  if (window.__chushiCardMounted) return;
  window.__chushiCardMounted = true;

  var HOST_ID = "chushi-card-host";
  if (document.getElementById(HOST_ID)) return;

  /* ---------- v8.2.9 全局开关（面板「浮窗」开关镜像，右键隐藏退役） ----------
     用户指令：取消右键浮窗隐藏；「初始」音乐面板加「浮窗」开关（默认开，
     只要开启浮窗就在所有网页显示）。cardEnabled=false → 本卡卸下 + 断开
     SW（state/spec 轮询需求归零），true → 重连恢复。 */
  var cardEnabled = true;
  var cardBooted = false;
  function initCard() {
    if (cardBooted || !cardEnabled) return;
    cardBooted = true;
    loadPos();
    connect();
    applyPos();
    applyMode();
    /* v8.3.0 入场动画仅首挂载：.boot 类 340ms 后摘除，此后 display 切换
       不再重放 cscardin（复位感真凶之二，见文件头 ①附证） */
    var bootEl = SURFS[mode];
    if (bootEl) {
      bootEl.classList.add("boot");
      setTimeout(function () { bootEl.classList.remove("boot"); }, 340);
    }
    wake();
  }
  function applyEnabled() {
    if (!cardEnabled) {
      sleepNow();
      host.style.display = "none";
      if (port) { try { port.disconnect(); } catch (e0) { /* 已断 */ } port = null; }
    } else {
      if (!cardBooted) { initCard(); return; }
      connect();
      if (track) { host.style.display = "block"; applyVis(); wake(); }
    }
  }
  /* ---------- v8.2.9 律动总开关（面板「律动」开关镜像） ----------
     cardGlow=false → 三轴包络清零 + 辉光归还样式表 + 频谱订阅撤
     （specWanted 归零 → 引擎零参与，SW 轮询停——性能与开关双收益）。 */
  var glowEnabled = true;
  function specMsgOn() {
    return glowEnabled && document.visibilityState === "visible";
  }
  function applyGlowEnabled() {
    if (!glowEnabled) {
      envB = 0; envM = 0; envH = 0;
      for (var k in COVS) if (COVS[k].on) covClear(COVS[k]);
      lastSpec.on = false;
    }
    try { if (port) port.postMessage({ type: "spec", on: specMsgOn() }); } catch (e0) { /* 断线接管 */ }
    sleepNow(); wake();
  }
  try {
    chrome.storage.local.get(["cardEnabled", "cardGlow"], function (o) {
      if (o) {
        var ve = !(o.cardEnabled === false || o.cardEnabled === "false");
        if (ve !== cardEnabled) cardEnabled = ve;
        var vg = !(o.cardGlow === false || o.cardGlow === "false");
        if (vg !== glowEnabled) glowEnabled = vg;
      }
      initCard(); /* 默认开：直接启动；关：等 onChanged */
    });
    if (chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
      chrome.storage.onChanged.addListener(function (ch, area) {
        if (area !== "local" || !ch) return;
        if (ch.cardEnabled) {
          var v = !(ch.cardEnabled.newValue === false || ch.cardEnabled.newValue === "false");
          if (v !== cardEnabled) { cardEnabled = v; applyEnabled(); }
        }
        if (ch.cardGlow) {
          var g = !(ch.cardGlow.newValue === false || ch.cardGlow.newValue === "false");
          if (g !== glowEnabled) { glowEnabled = g; applyGlowEnabled(); }
        }
      });
    }
  } catch (e) { initCard(); /* 无存储上下文：默认开 */ }

  /* ---------- v8.2.3 主题色跟随「初始」强调色 ----------
     NewTab 页（chrome-extension 页面）把 settings.accent 镜像到
     storage.local.cardAcc（page.tsx）——浮窗任意网页读 storage + onChanged
     热跟随；CSS var(--acc,#8b5cf6) 的 fallback 只在没有「初始」数据时兜底。
     自定义属性不受 :host{all:initial} 影响（all 不作用于 custom props），
     host 级设置可穿透进 shadow 树。 */
  function applyAcc(v) {
    if (typeof v !== "string" || !/^#[0-9a-fA-F]{3,8}$/.test(v)) return;
    host.style.setProperty("--acc", v);
  }
  try {
    chrome.storage.local.get(["cardAcc"], function (o) { if (o) applyAcc(o.cardAcc); });
    if (chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
      chrome.storage.onChanged.addListener(function (ch, area) {
        if (area === "local" && ch && ch.cardAcc) applyAcc(ch.cardAcc.newValue);
      });
    }
  } catch (e) { /* 无存储上下文：沿用默认紫 */ }

  /* ---------- v8.2.8 浮窗强行逐字跟随 ----------
     「初始」面板 cs-wbw 开关 → NewTab（PresetWidgets storageSet）镜像到
     storage.local.cardForceWord → 浮窗任意网页读取 + onChanged 热跟随
     （cardAcc 同律镜像）。开 = lrc 源走伪逐字（unitizeLine 词级时间轴
     已在 parse 生成，只切渲染模式）；yrc 真逐字不受开关影响。 */
  var forceWord = false;
  function rebuildForForce() {
    if (ly.parsed) buildLyricDom(); /* lyMode 重判重建 DOM（歌词体已在） */
  }
  try {
    chrome.storage.local.get(["cardForceWord"], function (o) {
      var v = !!(o && (o.cardForceWord === true || o.cardForceWord === "true"));
      if (v !== forceWord) { forceWord = v; rebuildForForce(); }
    });
    if (chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
      chrome.storage.onChanged.addListener(function (ch, area) {
        if (area === "local" && ch && ch.cardForceWord) {
          var v = ch.cardForceWord.newValue === true || ch.cardForceWord.newValue === "true";
          if (v !== forceWord) { forceWord = v; rebuildForForce(); }
        }
      });
    }
  } catch (e) { /* 无存储上下文：跟随面板默认（关） */ }

  var track = null;      /* 最近真值 {title,artist,album,playing,position,duration,rate,pic,songId,fetchedAt} */
  var lastSpec = { on: false, bass: 0, bands: null, t: 0 };
  var envB = 0, envM = 0, envH = 0; /* v8.2.7 律动包络：低/中/高三轴 */
  var glowRampAt = 0;    /* v8.3.1 高光渐入起点（形变 cleanup 时置；0=无 ramp） */
  var pkB = 0, pkM = 0, pkH = 0; /* v8.3.1 AGC 峰值跟随（自适应归一化天花板） */
  var mode = "mini";     /* 三态：cover | mini | full（持久） */
  var optP = false, optAt = 0; /* 播放/暂停乐观翻转窗口 */

  /* ---------- UI（closed Shadow DOM：封面态/标准态/完全体三兄弟） ---------- */
  var host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;left:0;top:0;width:0;height:0;display:none";
  var shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif}' +
    'img{-webkit-user-drag:none;user-select:none}' +
    '@keyframes cscardin{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}' +
    /* v8.3.0：入场动画只在 .boot（首挂载）——display:none→block 会重放
       CSS 动画，旧版每次三态切换都叠一层 0.96→1 缩放 = 复位感真凶之二 */
    '.surf{position:fixed;border-radius:16px;color:#f4f4f5;user-select:none;touch-action:none;' +
    'background:rgba(28,28,32,.92);border:1px solid rgba(255,255,255,.1);' +
    'box-shadow:0 12px 36px rgba(0,0,0,.35)}' +
    '.surf.boot{animation:cscardin .24s ease}' +
    '.surf.draggable{cursor:grab}.surf.draggable:active{cursor:grabbing}' +
    'button{font-family:inherit}' +
    /* ---- 封面态 ---- */
    '.cover{width:56px;height:56px;border-radius:14px;padding:0;cursor:grab;' +
    'display:none;position:fixed;border:1px solid rgba(255,255,255,.14);' +
    'background:linear-gradient(135deg,color-mix(in srgb,var(--acc,#8b5cf6) 33%,transparent),' +
    'color-mix(in srgb,var(--acc,#8b5cf6) 13%,transparent));touch-action:none}' +
    '.cover:active{cursor:grabbing}' +
    '.cover img{width:100%;height:100%;object-fit:cover;display:block;' +
    'border-radius:inherit;position:relative;z-index:1}' +
    '.cdot{position:absolute;right:4px;bottom:4px;width:7px;height:7px;border-radius:999px;z-index:3;' +
    'background:#34d399;box-shadow:0 0 5px #34d399;display:none}' +
    '.cover.on .cdot{display:block}' +
    /* ---- 通用件 ---- */
    '.row{display:flex;align-items:center;gap:10px}' +
    /* v8.2.3 辉光层叠律：img relative+z-index:1 压住 glow（absolute 无
       z-index 会画在静态 img 上面=「高光跑封面上」）；.cov 去掉
       overflow:hidden（光环要从封面四周晕出去，不是贴脸色块），圆角由
       img inherit 自担 */
    '.cov{position:relative;flex:none;border-radius:10px;' +
    'background:linear-gradient(135deg,color-mix(in srgb,var(--acc,#8b5cf6) 33%,transparent),' +
    'color-mix(in srgb,var(--acc,#8b5cf6) 13%,transparent))}' +
    '.cov img{width:100%;height:100%;object-fit:cover;display:block;' +
    'border-radius:inherit;position:relative;z-index:1}' +
    '.glow{position:absolute;inset:-5px;border-radius:14px;background:var(--acc,#8b5cf6);opacity:0;' +
    'filter:blur(9px);pointer-events:none;z-index:0}' +
    /* v8.2.8 去方框律：.gring 细节环废弃（用户：方框太丑）——中高频
       细节改由辉光本体 opacity/scale 的全频段合成承担（paintGlow） */
    '.meta{flex:1;min-width:0}' +
    '.t1{font-size:12.5px;font-weight:560;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.t2{font-size:10.5px;color:#a1a1aa;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.b{appearance:none;border:0;background:transparent;color:#a1a1aa;width:30px;height:30px;flex:none;' +
    'display:flex;align-items:center;justify-content:center;border-radius:999px;cursor:pointer;' +
    'transition:color .25s,background-color .25s}' +
    '.b:hover{background:rgba(255,255,255,.1);color:#fff}' +
    '.b.main{width:34px;height:34px;color:#fff;background:var(--acc,#8b5cf6)}' +
    '.b.main:hover{filter:brightness(1.12);background:var(--acc,#8b5cf6)}' +
    '.b svg,.x svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;' +
    'stroke-linecap:round;stroke-linejoin:round}' +
    '.b.main svg{width:16px;height:16px;fill:currentColor;stroke:none}' +
    '.x{appearance:none;position:relative;width:22px;height:22px;border-radius:999px;border:0;flex:none;' +
    'background:transparent;color:#8e8e96;display:flex;align-items:center;justify-content:center;' +
    'cursor:pointer;opacity:.8;transition:opacity .2s,color .2s,background-color .2s}' +
    '.x:hover{opacity:1;color:#fff;background:rgba(255,255,255,.1)}' +
    '.x svg{width:12px;height:12px}' +
    '.cap{position:absolute;right:8px;top:8px;display:flex;gap:2px}' +
    '.rail{height:10px;display:flex;align-items:center;cursor:pointer}' +
    '.rin{width:100%;height:3px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden}' +
    '.fill{display:block;height:100%;width:0%;border-radius:2px;background:var(--acc,#8b5cf6)}' +
    /* ---- 标准态（v8.2.2 钮组独立顶带；v8.2.3 带 30→26px 收敛 + 带左常显时间——
        空带不再空） ---- */
    '.card{width:264px;padding:26px 12px 9px;display:none}' +
    '.card .cap{top:4px}' +
    '.mtm{position:absolute;left:12px;top:4px;height:22px;line-height:22px;font-size:10px;' +
    'color:#8e8e96;font-variant-numeric:tabular-nums;pointer-events:none}' +
    '.card .cov{width:44px;height:44px}' +
    '.card .rail{margin-top:9px}' +
    /* ---- 完全体 ---- */
    '.fcard{width:324px;padding:14px 16px 12px;border-radius:18px;display:none}' +
    '.fcard .cap{top:7px}' +
    '.fcard .row{padding-right:46px}' +
    '.fcard .cov{width:52px;height:52px;border-radius:12px}' +
    '.fcard .t1{font-size:13.5px}.fcard .t2{font-size:11px}' +
    '.ftm{display:flex;justify-content:space-between;font-size:10px;color:#8e8e96;margin-top:5px;font-variant-numeric:tabular-nums}' +
    '.fcard .rail{margin-top:2px}' +
    '.fctl{display:flex;align-items:center;justify-content:center;gap:22px;margin-top:4px}' +
    /* ---- 歌词（与「初始」部件同渲染律：双层实体色 + clip-path 扫光）----
       v8.3.1 歌词动效对齐「初始」完全体（用户视频示例）：
       · 当前行放大（scale 1.06）/邻行缩小（0.94）——行切换时字号呼吸过渡，
         transform 不参与布局（offsetTop 滚动数学不受影响）；
       · 滚动 .55s→.45s（视频实测 ~400ms ease-out）、行色 .5s→.35s
         （入场行在滚动途中就亮起，不再慢半拍）。 */
    '.flyr{position:relative;height:118px;margin-top:10px;overflow:hidden;flex:none;' +
    '-webkit-mask-image:linear-gradient(180deg,transparent,#000 16%,#000 84%,transparent)}' +
    '.flyr-in{position:absolute;left:0;right:0;top:0;transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .3s ease;will-change:transform}' +
    '.fln{padding:3px 2px;text-align:center;font-size:13.5px;font-weight:560;line-height:1.45;' +
    'color:#71717a;transform:scale(.94);transform-origin:50% 50%;' +
    'transition:color .35s ease,transform .45s cubic-bezier(.22,1,.36,1)}' +
    '.fln.on{color:#f4f4f5;transform:scale(1.06)}' +
    '.fln.done{color:#8e8e96}' +
    '.fln.done .fw{color:#8e8e96}' +
    '.fln.done .fw .ov{opacity:0;transition:opacity .6s ease}' +
    '.fln.gap{font-size:11px;letter-spacing:7px;color:#71717a}' +
    '.fw{position:relative;color:#71717a}' +
    /* v8.2.3 两色调：当前行未唱词底色提亮（四级阶梯：未来#71717a <
       done#8e8e96 < 当前行#b4b4bc < 扫光#f4f4f5）——行切换 0.6s 交叉
       渐隐窗口里当前行恒为视觉主角，白高光不再「看起来在上一行」 */
    '.fln.on .fw{color:#b4b4bc}' +
    '.fw .ov{position:absolute;left:0;top:0;color:#f4f4f5;pointer-events:none;' +
    'clip-path:inset(-8% calc(100% - var(--p,0%)) -8% 0)}' +
    '.fsub{font-size:10.5px;font-weight:400;color:#a1a1aa;margin-top:2px;display:none;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.fln.on .fsub{display:block}' +
    '.fempty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'font-size:12px;color:#5b5b63;letter-spacing:2px}' +
    '</style>' +
    /* 封面态 */
    '<button class="cover" id="cover" title="单击展开 · 按住拖动"><span class="glow" id="cglow"></span><img id="cpic" alt="" draggable="false"><span class="cdot" id="cdot"></span></button>' +
    /* 标准态 */
    '<div class="surf card" id="card">' +
    '<span class="mtm" id="mtm">0:00</span>' +
    '<div class="cap">' +
    '<button class="x" id="miniCover" title="收起成封面"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>' +
    '<button class="x" id="miniFull" title="放大到完全体（歌词）"><svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>' +
    '</div>' +
    '<div class="row">' +
    '<div class="cov"><span class="glow" id="glow"></span><img id="pic" alt="" draggable="false"></div>' +
    '<div class="meta"><div class="t1" id="t1">—</div><div class="t2" id="t2"></div></div>' +
    '<button class="b" id="prev" title="上一首"><svg viewBox="0 0 24 24"><path d="M19 20L9 12l10-8v16z"/><path d="M6 5.5v13"/></svg></button>' +
    '<button class="b main" id="play" title="播放 / 暂停"><svg id="icPlay" viewBox="0 0 24 24"><path d="M8 4l12 8-12 8V4z"/></svg><svg id="icPause" viewBox="0 0 24 24" style="display:none"><rect x="6.6" y="4.6" width="3.6" height="14.8" rx="1.3"/><rect x="13.8" y="4.6" width="3.6" height="14.8" rx="1.3"/></svg></button>' +
    '<button class="b" id="next" title="下一首"><svg viewBox="0 0 24 24"><path d="M5 4l10 8-10 8V4z"/><path d="M18 5.5v13"/></svg></button>' +
    '</div>' +
    '<div class="rail" id="rail" title="点按查看歌词（完全体）"><span class="rin"><span class="fill" id="fill"></span></span></div>' +
    '</div>' +
    /* 完全体 */
    '<div class="surf fcard" id="fcard">' +
    '<div class="cap">' +
    '<button class="x" id="fullCover" title="收起成封面"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>' +
    '<button class="x" id="fullMini" title="缩回标准卡"><svg viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg></button>' +
    '</div>' +
    '<div class="row">' +
    '<div class="cov"><span class="glow" id="glow2"></span><img id="fpic" alt="" draggable="false"></div>' +
    '<div class="meta"><div class="t1" id="ft1">—</div><div class="t2" id="ft2"></div></div>' +
    '</div>' +
    '<div class="flyr" id="flyr"><div class="fempty" id="fempty">暂无歌词</div><div class="flyr-in" id="flyrIn"></div></div>' +
    '<div class="ftm"><span id="tcur">0:00</span><span id="tdur">--:--</span></div>' +
    '<div class="rail" id="frail" title="点按跳转播放位置"><span class="rin"><span class="fill" id="ffill"></span></span></div>' +
    '<div class="fctl">' +
    '<button class="b" id="fprev" title="上一首"><svg viewBox="0 0 24 24"><path d="M19 20L9 12l10-8v16z"/><path d="M6 5.5v13"/></svg></button>' +
    '<button class="b main" id="fplay" title="播放 / 暂停"><svg id="ficPlay" viewBox="0 0 24 24"><path d="M8 4l12 8-12 8V4z"/></svg><svg id="ficPause" viewBox="0 0 24 24" style="display:none"><rect x="6.6" y="4.6" width="3.6" height="14.8" rx="1.3"/><rect x="13.8" y="4.6" width="3.6" height="14.8" rx="1.3"/></svg></button>' +
    '<button class="b" id="fnext" title="下一首"><svg viewBox="0 0 24 24"><path d="M5 4l10 8-10 8V4z"/><path d="M18 5.5v13"/></svg></button>' +
    '</div>' +
    '</div>';

  (document.body || document.documentElement).appendChild(host);
  /* 原生图拖拽 ghost 全面禁止（v8.2.2：初始面板与浮窗同律——拖窗口时
     封面被浏览器当 img 拖走的鬼影是「封面没禁拖」的真身） */
  host.addEventListener("dragstart", function (e) { e.preventDefault(); });

  function el(id) { return shadow.getElementById(id); }
  var coverEl = el("cover"), cpic = el("cpic"), cdot = el("cdot");
  var card = el("card"), pic = el("pic"), glow = el("glow");
  var fcard = el("fcard"), fpic = el("fpic"), glow2 = el("glow2");
  var cglow = el("cglow");
  var t1 = el("t1"), t2 = el("t2"), ft1 = el("ft1"), ft2 = el("ft2");
  var fill = el("fill"), ffill = el("ffill");
  var icPlay = el("icPlay"), icPause = el("icPause");
  var ficPlay = el("ficPlay"), ficPause = el("ficPause");
  var flyrIn = el("flyrIn"), fempty = el("fempty"), tcur = el("tcur"), tdur = el("tdur");
  var mtm = el("mtm");

  var SURFS = { cover: coverEl, mini: card, full: fcard };
  var WIDTH = { cover: 56, mini: 264, full: 324 };

  /* ---------- 位置：三态共用，拖动 + 持久 + 按当前态宽度钳制 ---------- */
  var pos = { x: Math.max(12, (window.innerWidth || 1200) - 296), y: 76 };
  function loadPos() {
    try {
      chrome.storage.local.get(["cardPos", "cardMode", "cardPill"], function (o) {
        if (o && o.cardPos && typeof o.cardPos.x === "number") pos = o.cardPos;
        /* v8.2.1 迁移：旧「药丸收起」用户 → 封面态（药丸已退役） */
        if (o && o.cardMode && SURFS[o.cardMode]) mode = o.cardMode;
        else if (o && o.cardPill) mode = "cover";
        applyPos(); applyMode();
      });
    } catch (e) { applyPos(); applyMode(); }
  }
  function savePos() {
    try { chrome.storage.local.set({ cardPos: pos, cardMode: mode }); } catch (e) { /* 隐私模式等 */ }
  }
  function clampPos() {
    var w = window.innerWidth || 1200, h = window.innerHeight || 800;
    var mw = WIDTH[mode] || 264;
    pos.x = Math.min(Math.max(8, pos.x), Math.max(8, w - mw - 8));
    pos.y = Math.min(Math.max(8, pos.y), h - 56);
  }
  function applyPos() {
    clampPos();
    for (var k in SURFS) {
      SURFS[k].style.left = pos.x + "px";
      SURFS[k].style.top = pos.y + "px";
    }
  }

  function applyMode() {
    for (var k in SURFS) {
      SURFS[k].style.display = k === mode ? "block" : "none";
      SURFS[k].style.overflow = ""; /* v8.3.0 安全网：形变期裁切绝不跨态残留 */
    }
    applyPos(); applyVis(); applyDraggable();
  }
  var RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var trans = null;
  function covUnitOf(m) { return COVS[m]; }
  function finishTrans() {
    if (!trans) return;
    var t = trans; trans = null;
    for (var i = 0; i < t.anims.length; i++) { try { t.anims[i].finish(); } catch (e1) { /* 已结束 */ } }
    t.cleanup();
  }
  function plainSetMode(m) {
    mode = m; lastTcur = ""; /* 强制下一帧重写 tcur/mtm——防态切换残留旧串 */
    savePos(); applyMode();
  }
  /* ---------- 三态几何（v8.3.0 实测律） ---------- */
  function rectOf(surf) {
    var r = surf.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height,
      br: parseFloat(getComputedStyle(surf).borderRadius) || 16 };
  }
  /* 封面矩形实测：cover 态本体即封面；mini/full 取壳内 .cov。
     两端全部实测（不估算）= clone 落地必与目标元素真实布局位重合
     （v8.2.7「校准卡顿」根治：估算终态 ≠ 真实布局位）。 */
  function covRectOf(surf) {
    var c = surf === coverEl ? surf : surf.querySelector(".cov");
    if (!c) return null;
    var r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height,
      br: parseFloat(getComputedStyle(c).borderRadius) || 10, el: c };
  }
  /* ---------- 真弹簧采样（v8.3.1 克制化：与「初始」dock 面板切换同族） ----------
     用户实机反馈：ζ≈0.58 的 ~10% 过冲「太过了」+ 封面回弹读作「复位」。
     现壳弹簧 = dock standard 同参（stiffness 420 / damping 34，framer 同族
     ζ≈0.83，过冲 ~1%——与「初始」面板切换手感一致，克制不 Q 弹）；
     封面 clone 弹簧 = 临界阻尼（420/41，ζ≈1.0，零过冲——封面没必要回弹）。
     每样本 4 子步积分（dt=1/240）防数值阻尼吃掉曲线；各形变属性共用同一
     进度轨迹（线性伸缩同一 ODE 解），样本间 WAAPI linear 插值 = 物理曲线。
     cleanup 时样式即终态，零校准跳变。 */
  var SPRING = [420, 34];        /* 壳：dock standard 同参（~1% 微过冲） */
  var SPRING_COVER = [420, 41];  /* 封面：临界阻尼（零过冲） */
  function springFrames(k, d) {
    var dt = 1 / 240, x = 0, v = 0, out = [], i, j;
    for (i = 0; i < 96; i++) {
      for (j = 0; j < 4; j++) {
        v += (-k * (x - 1) - d * v) * dt;
        x += v * dt;
      }
      out.push(x);
      if (Math.abs(x - 1) < 0.0015 && Math.abs(v) < 0.0045) break;
    }
    return out;
  }
  function morphFrames(fr, to, spr) {
    var ss = springFrames(spr ? spr[0] : SPRING[0], spr ? spr[1] : SPRING[1]), n = ss.length, kfs = [];
    kfs.push({ left: fr.left + "px", top: fr.top + "px", width: fr.width + "px",
      height: fr.height + "px", borderRadius: fr.br + "px", offset: 0 });
    for (var i = 0; i < n; i++) {
      var s = ss[i];
      kfs.push({
        left: (fr.left + (to.left - fr.left) * s) + "px",
        top: (fr.top + (to.top - fr.top) * s) + "px",
        width: (fr.width + (to.width - fr.width) * s) + "px",
        height: (fr.height + (to.height - fr.height) * s) + "px",
        borderRadius: (fr.br + (to.br - fr.br) * s) + "px",
        offset: (i + 1) / n
      });
    }
    return { kfs: kfs, dur: Math.max(220, Math.round(n * 1000 / 60)) };
  }
  /* 封面连续锚 clone：源封面 wrapper 原位克隆（cloneNode 带走辉光/律动
     内联样式与 img），fixed 定位按实测矩形飞行（布局属性动画 = 逐帧清晰
     不拉伸），pointer 穿透、置于最顶。
     v8.3.1 关键修复：cloneNode 会连内联样式一起带走——cover→mini/full 方向
     display 切换（coverEl style.display="none"）先于本函数执行，clone 出厂
     即 display:none = 封面瞬移、全程不可见（录屏实帧：暗壳中间无封面）。
     此处无条件 display:block 拨正，三方向 clone 恒可见。 */
  function covClone(fromRect) {
    var c = fromRect.el.cloneNode(true);
    var ids = c.querySelectorAll("[id]");
    for (var i = 0; i < ids.length; i++) ids[i].removeAttribute("id");
    c.style.cssText += ";display:block;position:fixed;margin:0;pointer-events:none;z-index:2147483000;" +
      "left:" + fromRect.left + "px;top:" + fromRect.top + "px;" +
      "width:" + fromRect.width + "px;height:" + fromRect.height + "px;" +
      "border-radius:" + fromRect.br + "px;";
    shadow.appendChild(c);
    return c;
  }
  /* ---------- 三态切换（v8.3.0 一镜到底·真弹簧·封面连续锚） ----------
     收缩（→cover）：旧壳本体弹簧收缩成 56×56（内容前 32% 淡出），封面
     clone 从旧封面矩形飞向同终点，cleanup 封面态无缝接管。
     展开/互变：目标壳从源矩形弹簧长出（width/height/left/top/borderRadius
     同轨迹，贴边时位置一并滑入夹紧位），内容 t+60ms 级联上浮淡入（dock
     content-focus 同语言），封面 clone 飞向目标封面实测矩形、落地时真封面
     才显形（防双封面同屏）。中断安全：finish 跳末态再起。 */
  function setMode(m) {
    if (!SURFS[m] || m === mode) return;
    finishTrans();
    if (RM || document.visibilityState !== "visible") { plainSetMode(m); wake(); return; }
    var from = mode;
    var fromSurf = SURFS[from], toSurf = SURFS[m];
    var sfr = rectOf(fromSurf);
    if (sfr.width < 4) { plainSetMode(m); wake(); return; }
    /* 先克隆（带走实时律动内联样式），再清源辉光（克隆体不受影响） */
    var covFrom = covRectOf(fromSurf);
    if (covUnitOf(from)) covClear(covUnitOf(from));
    mode = m; lastTcur = "";
    savePos();
    var vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    var tw = WIDTH[m] || 264;
    var toX = Math.min(Math.max(8, pos.x), Math.max(8, vw - tw - 8));
    var toY = Math.min(Math.max(8, pos.y), vh - 56);
    var collapsing = m === "cover";
    var surfAnim = collapsing ? fromSurf : toSurf;
    var toRect, covTo, clone = null, cloneImg = null;
    if (collapsing) {
      /* 收缩终点 = 封面态本体（56×56 圆角 14，位置即夹紧位）——确定性矩形 */
      toRect = { left: toX, top: toY, width: 56, height: 56, br: 14 };
      covTo = { left: toX, top: toY, width: 56, height: 56, br: 14 };
    } else {
      for (var k1 in SURFS) SURFS[k1].style.display = k1 === m ? "block" : "none";
      applyVis(); applyDraggable();
      /* 目标壳先按终局位隐身实测（自然尺寸 + 真实封面布局位），同任务内
         起动画，无中间帧外泄 */
      toSurf.style.left = toX + "px";
      toSurf.style.top = toY + "px";
      toSurf.style.visibility = "hidden";
      var str = rectOf(toSurf);
      covTo = covRectOf(toSurf);
      toSurf.style.visibility = "";
      if (str.width < 4 || !covTo) { plainSetMode(m); wake(); return; }
      toRect = { left: toX, top: toY, width: str.width, height: str.height, br: str.br };
    }
    var mf = morphFrames(
      { left: sfr.left, top: sfr.top, width: sfr.width, height: sfr.height, br: sfr.br },
      toRect);
    var D = mf.dur;
    var anims = [], kids = [];
    fromSurf.style.pointerEvents = "none";
    /* v8.3.0：目标壳保持可点（中断律——形变中再点切换钮 = finish 跳末态
       再起新形变；拖动被 WAAPI forwards 压住、cleanup 提交夹紧位，无害） */
    surfAnim.style.overflow = "hidden"; /* 形变期裁切内容生长（dock 同款）；辉光由 clone 携带 */
    /* ① 壳真弹簧形变（v8.3.1：克制 dock standard 弹簧） */
    anims.push(surfAnim.animate(mf.kfs, { duration: D, easing: "linear", fill: "forwards" }));
    /* ② 封面连续锚：实测矩形 → 实测矩形（临界阻尼零回弹，与壳同步开始）。
       v8.3.1：壳/封面统一时长 D——两套关键帧各自带 offset 0..1，WAAPI 按
       D 拉伸同曲线，杜绝「先到者 onfinish 提前 cancel 迟到者」的截断风险 */
    if (covFrom) {
      clone = covClone(covFrom);
      cloneImg = clone.querySelector ? clone.querySelector("img") : null;
      var cf = morphFrames(
        { left: covFrom.left, top: covFrom.top, width: covFrom.width,
          height: covFrom.height, br: covFrom.br },
        { left: covTo.left, top: covTo.top, width: covTo.width,
          height: covTo.height, br: covTo.br }, SPRING_COVER);
      if (cf.dur > D) D = cf.dur;
      anims.push(clone.animate(cf.kfs, { duration: D, easing: "linear", fill: "forwards" }));
      anims[0].effect.updateTiming({ duration: D }); /* 壳随 D 对齐（同曲线拉伸） */
    }
    /* ③ 内容交叉：收缩 = 前 32% 快淡出；展开/互变 = 级联上浮淡入；
       真封面本体延迟到 clone 落地才显形 */
    var hostK = collapsing ? fromSurf : toSurf;
    var kidsK = hostK.children;
    for (var i2 = 0; i2 < kidsK.length; i2++) {
      kids.push(collapsing
        ? kidsK[i2].animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: Math.round(D * 0.32), easing: "ease-in", fill: "forwards" })
        : kidsK[i2].animate(
            [{ opacity: 0, transform: "translateY(7px)" },
             { opacity: 1, transform: "translateY(0px)" }],
            { duration: 230, delay: 60 + i2 * 26,
              easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" }));
    }
    if (!collapsing && covTo.el && covTo.el !== toSurf) {
      kids.push(covTo.el.animate([{ opacity: 0 }, { opacity: 1 }],
        { duration: 150, delay: Math.max(0, D - 170), easing: "ease-out", fill: "backwards" }));
    }
    trans = { anims: anims, kids: kids, clone: clone, cloneImg: cloneImg,
      cleanup: function () {
        for (var i3 = 0; i3 < anims.length; i3++) { try { anims[i3].cancel(); } catch (e2) { /* 已结束 */ } }
        for (var i4 = 0; i4 < kids.length; i4++) { try { kids[i4].cancel(); } catch (e3) { /* 已结束 */ } }
        if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
        pos.x = toX; pos.y = toY; /* 形变终点即夹紧位：提交后 applyPos 零位移 */
        fromSurf.style.pointerEvents = "";
        toSurf.style.pointerEvents = "";
        surfAnim.style.overflow = "";
        /* v8.3.1 高光渐入：形变期 clone 携带的是清零辉光（covClear 后克隆），
           形变途中 paintGlow 又把目标态包络值写进了真封面（当时不可见，
           写值缓存被占）——落地瞬间辉光 0→满格 = 「突兀」。现 cleanup 把
           目标态缓存归零 + 记 ramp 起点，paintGlow 按 easeRamp 因子从
           中性渐入（~480ms），高光跟着形变落地温柔浮现。 */
        if (COVS[m]) { covClear(COVS[m]); }
        glowRampAt = Date.now();
        if (mode === m) plainSetMode(m);
        wake();
      } };
    for (var a2 = 0; a2 < anims.length; a2++) anims[a2].onfinish = finishTrans;
    wake(); /* v8.2.6 态切换接管：循环若在睡（如 cover 静置）按新态需求重估 */
  }
  function applyDraggable() {
    card.classList.toggle("draggable", mode === "mini");
    fcard.classList.toggle("draggable", mode === "full");
  }

  /* ---------- 拖动 / 点击 ----------
     把手 = 卡片主体空白（meta 区 + padding）+ 封面态整卡（按住拖动）；
     按钮、进度条、歌词区、标准/完全体封面一律不启动拖动。
     封面态：单击展开 / 按住拖动（拖后拦误触 click）。 */
  var drag = { on: 0, moved: 0, px: 0, py: 0, ox: 0, oy: 0, surf: null };
  function dragHandleOK(e) {
    if (e.button !== undefined && e.button !== 0) return false;
    var t = e.target;
    if (t.closest && t.closest("button, .cov, .rail, .flyr")) return false;
    return true;
  }
  function dragStart(e, surf) {
    drag.on = 1; drag.moved = 0;
    drag.px = e.clientX; drag.py = e.clientY;
    drag.ox = pos.x; drag.oy = pos.y;
    drag.surf = surf;
    try { surf.setPointerCapture(e.pointerId); } catch (e1) { /* 已释放 */ }
  }
  function onDown(e) {
    if (!dragHandleOK(e)) return;
    dragStart(e, e.currentTarget);
  }
  function onMove(e) {
    if (!drag.on) return;
    var dx = e.clientX - drag.px, dy = e.clientY - drag.py;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = 1;
    if (drag.moved) {
      pos.x = drag.ox + dx; pos.y = drag.oy + dy;
      applyPos();
    }
  }
  var coverClickBlock = 0;
  function onUp() {
    if (drag.on && drag.moved) {
      savePos();
      if (drag.surf === coverEl) coverClickBlock = Date.now(); /* 拖后拦截误触 click */
    }
    drag.on = 0;
    wake(); /* v8.2.6 拖动结束保险（进度/走针接续） */
  }
  card.addEventListener("pointerdown", onDown);
  card.addEventListener("pointermove", onMove);
  card.addEventListener("pointerup", onUp);
  card.addEventListener("pointercancel", function () { drag.on = 0; });
  fcard.addEventListener("pointerdown", onDown);
  fcard.addEventListener("pointermove", onMove);
  fcard.addEventListener("pointerup", onUp);
  fcard.addEventListener("pointercancel", function () { drag.on = 0; });
  /* 封面态：整卡即把手——按住拖动移窗，单击展开（拖动后 350ms 内的
     click 是拖动误触，拦截） */
  coverEl.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    dragStart(e, coverEl);
  });
  coverEl.addEventListener("pointermove", onMove);
  coverEl.addEventListener("pointerup", onUp);
  coverEl.addEventListener("pointercancel", function () { drag.on = 0; });
  /* v8.2.2 用户律：浮窗任何位置点击都不跳转「初始」——主体点击无操作 */

  /* ---------- SW 通道（断线重连 + 保活） ---------- */
  var port = null;
  var cmdSeq = 0;
  var pingTimer = null;

  function connect() {
    if (port) return;
    try {
      port = chrome.runtime.connect({ name: "chushi-card" });
    } catch (e) {
      port = null; /* 扩展上下文失效（更新中） */
      return;
    }
    port.onMessage.addListener(onMsg);
    port.onDisconnect.addListener(function () {
      port = null;
      setTimeout(function () { if (!port) connect(); }, 1200);
    });
    if (!pingTimer) {
      pingTimer = setInterval(function () {
        if (document.visibilityState !== "visible") return;
        try { if (port) port.postMessage({ type: "ping" }); } catch (e) { /* 断线事件接管 */ }
      }, 10000);
    }
    /* v8.3.0：vis 上报退役（数据面休眠拆除，见文件头 ②）——state 轮询
       不再依赖可见性；频谱订阅仍按 specMsgOn()（可见 + 律动开）初值。
       hidden 标签不订阅频谱（specWanted=0 → 引擎零参与）照旧。 */
    try {
      port.postMessage({ type: "spec", on: specMsgOn() });
    } catch (e) { /* 断线事件接管 */ }
  }

  function send(cmd, position) {
    return new Promise(function (resolve) {
      if (!port) { resolve(false); return; }
      var id = ++cmdSeq;
      try {
        port.postMessage({ type: "cmd", cmd: cmd, position: position, id: id });
        port.__cmdResolve = port.__cmdResolve || {};
        port.__cmdResolve[id] = function (ok) {
          /* v8.2.2 seek 乐观重锚 + 护航窗：进度条即时到位，真值收敛前
             陈旧拍不回弹（sandbox.js v8.0.9 同律） */
          if (ok && cmd === "seek" && typeof position === "number" && track) {
            track.position = Math.max(0, position);
            track.fetchedAt = Date.now();
            softA = null;
            seekGuard = { to: position, at: Date.now() };
            backStreak = 0;
          }
          resolve(ok === true);
        };
        setTimeout(function () {
          if (port && port.__cmdResolve && port.__cmdResolve[id]) {
            delete port.__cmdResolve[id]; resolve(false);
          }
        }, 4000);
      } catch (e) { resolve(false); }
    });
  }

  /* v8.2.2：openPanel 已拆——浮窗零跳转「初始」（用户明确不要） */

  function onMsg(m) {
    if (!m || typeof m !== "object") return;
    if (m.type === "state") {
      var nt = m.track && typeof m.track === "object" ? m.track : null;
      if (nt && !(nt.fetchedAt > 0)) nt.fetchedAt = m.at || Date.now();
      ingestTrack(nt);
      renderStatic();
      host.style.display = "block";
      applyVis();
      lyricTick(); /* 切歌检测（want 变化时内部自重建） */
      wake(); /* v8.2.6 真值到达：循环若在睡（无曲目期）此处唤醒 */
    } else if (m.type === "spec") {
      lastSpec = { on: m.on === true, bass: Number(m.bass) || 0,
        bands: Array.isArray(m.bands) ? m.bands : null, t: Date.now() };
      if (lastSpec.on) wake(); /* v8.2.6 频谱活动帧：辉光包络需要帧 */
    } else if (m.type === "cmdOk" && m.id) {
      var r = port && port.__cmdResolve && port.__cmdResolve[m.id];
      if (r) { delete port.__cmdResolve[m.id]; r(m.ok); }
    } else if (m.type === "lyric") {
      onLyricMsg(m);
    }
  }

  /* ---------- 渲染 ---------- */
  function renderStatic() {
    if (!track) return;
    t1.textContent = track.title || "—";
    t2.textContent = track.artist || "";
    ft1.textContent = track.title || "—";
    ft2.textContent = track.artist || "";
    var src = track.pic || "";
    if (src) {
      if (pic.getAttribute("src") !== src) pic.setAttribute("src", src);
      if (fpic.getAttribute("src") !== src) fpic.setAttribute("src", src);
      if (cpic.getAttribute("src") !== src) cpic.setAttribute("src", src);
      /* v8.3.0 形变途中的切歌热跟随：飞行中的封面 clone 同步换图
         （克隆体不接 state 广播，不补这行 = 落地瞬间旧图闪一帧） */
      if (trans && trans.cloneImg && trans.cloneImg.getAttribute("src") !== src) {
        trans.cloneImg.setAttribute("src", src);
      }
    }
    applyVis();
  }

  function effPlaying() {
    if (optAt && Date.now() - optAt < 2500) return optP;
    return !!(track && track.playing);
  }

  function applyVis() {
    var has = !!track;
    coverEl.classList.toggle("on", effPlaying());
    icPlay.style.display = effPlaying() ? "none" : "block";
    icPause.style.display = effPlaying() ? "block" : "none";
    ficPlay.style.display = effPlaying() ? "none" : "block";
    ficPause.style.display = effPlaying() ? "block" : "none";
    if (has && host.style.display !== "block") host.style.display = "block";
  }

  /* ---------- 位置插值：锚点轨迹 + 软重锚（sandbox.js 同族语义） ----------
     baseNowOf = 锚点真值轨迹；posNowOf = 软窗混合后的显示位置。
     v8.2.2 锯齿根治：真值到达时按偏差分带仲裁——微抖带不重锚（轨迹
     继续走），中幅软重锚平滑入轨，大幅（seek/切歌）硬跟随。 */
  var softA = null;         /* 软重锚窗 {from,at,dur} */
  function baseNowOf(t) {
    if (!t) return 0;
    var rate = t.rate > 0 ? t.rate : 1;
    var p = t.position + (t.playing ? ((Date.now() - t.fetchedAt) / 1000) * rate : 0);
    if (t.duration > 0) return Math.min(t.duration, Math.max(0, p));
    return Math.max(0, p);
  }
  function posNowOf(t) {
    var p = baseNowOf(t);
    if (softA) {
      var el = Date.now() - softA.at;
      if (el >= softA.dur) { softA = null; return p; }
      var rate = t && t.rate > 0 ? t.rate : 1;
      var fromP = softA.from + (el / 1000) * rate * (t && t.playing ? 1 : 0);
      var k = el / softA.dur;
      k = k * k * (3 - 2 * k);
      var out = fromP + (p - fromP) * k;
      if (t && t.duration > 0) return Math.min(t.duration, Math.max(0, out));
      return Math.max(0, out);
    }
    return p;
  }
  function posNow() { return posNowOf(track); }

  /* 真值进入仲裁（v8.2.2 乱跳根治核心，sandbox.js 同族管线精简移植）：
     ① 微噪声 |d|≤2.5s 一律 800ms smoothstep 软重锚——显示从当前位置平滑
        入轨（连续、可收敛）；>2.5s（seek/切歌级）硬跟随。
     ② 回退熔断：播放中单记回退拍（-0.3~-2.5s）拒收（旧锚继续走），
        连续 2 记 = 真回退源才放行——上游锚点年龄抖动的回跳到不了显示层。
     ③ seek 护航窗（4.5s）：拖动后乐观重锚到目标，护航期内远离目标的
        陈旧拍拒收、真值到目标 ±2s 即收窗——进度条回弹同根治。 */
  var backStreak = 0;
  var seekGuard = null;    /* {to, at} */
  function ingestTrack(nt) {
    var now = Date.now();
    var old = track;
    if (!nt) { track = null; softA = null; seekGuard = null; return; }
    if (!old) { track = nt; softA = null; return; }
    var sameSong = (nt.songId || 0) === (old.songId || 0) &&
      (nt.title || "") === (old.title || "") &&
      Math.abs((nt.duration || 0) - (old.duration || 0)) < 1.5;
    if (!sameSong) { track = nt; softA = null; seekGuard = null; backStreak = 0; return; }
    if (nt.playing !== old.playing) { track = nt; softA = null; seekGuard = null; backStreak = 0; return; }
    var disp = posNowOf(old);
    var rate = nt.rate > 0 ? nt.rate : 1;
    var age = nt.playing ? Math.min(6, Math.max(0, (now - nt.fetchedAt) / 1000)) : 0;
    var implied = nt.position + age * rate;
    /* seek 护航窗：拖动已乐观重锚——远离目标的拍是拖动前旧轨/中间态 */
    if (seekGuard) {
      if (now - seekGuard.at > 4500) { seekGuard = null; }
      else if (Math.abs(implied - seekGuard.to) <= 2) { seekGuard = null; }
      else return; /* 陈旧拍：忽略，目标轨迹继续走 */
    }
    var d = implied - disp;
    /* 回退熔断（仅播放稳态）：单记回退拒收，连续 2 记放行 */
    if (nt.playing && d < -0.3 && d > -2.5) {
      backStreak++;
      if (backStreak < 2) return;   /* 拒收：旧锚继续走 */
    } else {
      backStreak = 0;
    }
    if (d >= -2.5 && d <= 2.5) {
      softA = { from: disp, at: now, dur: 800 };
      track = nt;
      return;
    }
    track = nt; softA = null;       /* 大偏差：诚实硬跟随 */
  }

  function fmt(s) {
    s = Math.floor(s || 0);
    var m = Math.floor(s / 60), r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  /* ---------- 歌词：请求（SW 代理）+ 归属强校验 + 有限重试 ---------- */
  var ly = { want: "", tries: 0, done: "", busy: false, raw: null, parsed: null };
  function lyricTick() {
    if (!track) return;
    var want = track.songId ? String(track.songId) : (track.title ? "t:" + track.title : "");
    if (want !== ly.want) {
      ly.want = want; ly.tries = 0; ly.done = ""; ly.busy = false;
      ly.raw = null; ly.parsed = null;
      buildLyricDom();
    }
    if (!want || ly.busy || ly.done === want) return;
    ly.busy = true;
    try {
      port.postMessage({ type: "lyric", songId: track.songId ? String(track.songId) : "", title: track.title || "", key: want });
    } catch (e) { ly.busy = false; return; }
    /* 4s 无回包：释放 BUSY 位 + 走统一重试律（2.5s 间隔，防打爆） */
    setTimeout(function () { if (ly.busy) { ly.busy = false; lyRetry(); } }, 4000);
  }
  function onLyricMsg(m) {
    ly.busy = false;
    var want = ly.want;
    if (!want || m.key !== want) return; /* 曲目已切走（latest-wins） */
    if (m.ok && m.lyric && typeof m.lyric === "object" &&
        (String(m.lyric.yrc || "").trim() || String(m.lyric.lrc || "").trim())) {
      /* 归属强校验：hub /api/lyric 是单槽缓存，切歌窗口内返回的必然是
         上一首歌词——songId 不符一律视为未就绪（smtc.ts 同款最终防线） */
      var wantId = /^(\d+)$/.test(want) ? Number(want) : 0;
      var gotId = Number(m.lyric.songId) || 0;
      if (wantId && gotId && gotId !== wantId) { lyRetry(); return; }
      ly.done = want;
      ly.tries = 0;
      ly.raw = m.lyric;
      ly.parsed = ChuShiLyric.parse(m.lyric);
      buildLyricDom();
    } else {
      lyRetry();
    }
  }
  function lyRetry() {
    ly.tries++;
    if (ly.tries <= 5) {
      setTimeout(function () { if (ly.want && ly.done !== ly.want) lyricTick(); }, 2500);
    } else {
      ly.done = ly.want; /* 有限重试耗尽：本轮放弃（切歌重来） */
      buildLyricDom();
    }
  }

  /* ---------- 歌词 DOM 构建（歌词键 + 解析对象双判定才重建） ---------- */
  var lineEls = [];      /* [{el, words:[{ov,p}], sung, clean}] */
  var activeLine = -2;
  var lastLyrTy = null;  /* v8.2.8 歌词滚动写值防抖（间奏分支每帧进） */
  var lyMode = 0;        /* 1=逐字扫光（真 yrc）；0=逐行高亮 */
  var prevLyrPlaying = null;
  function buildLyricDom() {
    var p = ly.parsed;
    lineEls = []; activeLine = -2; prevLyrPlaying = null; lastLyrTy = null;
    flyrIn.innerHTML = "";
    flyrIn.style.transform = "translateY(0px)";
    if (!p || !p.lines || !p.lines.length) {
      fempty.style.display = "flex";
      lyMode = 0;
      return;
    }
    fempty.style.display = "none";
    /* 浮窗判定律（v8.2.8）：真逐字（yrc）恒逐字；lrc 在「初始」面板开了
       强行逐字时走伪逐字（cardForceWord 镜像 + onChanged 热跟随），
       关时逐行——开关切换经 rebuildForForce 重建 DOM 重判。 */
    lyMode = (p.src === "yrc" || (p.src === "lrc" && forceWord)) ? 1 : 0;
    for (var i = 0; i < p.lines.length; i++) {
      var ln = p.lines[i];
      var row = document.createElement("div");
      row.className = "fln";
      var words = [];
      if (lyMode === 1 && ln.w && ln.w.length) {
        for (var w = 0; w < ln.w.length; w++) {
          var sp = document.createElement("span");
          sp.className = "fw";
          sp.appendChild(document.createTextNode(ln.w[w].t));
          var ov = document.createElement("span");
          ov.className = "ov";
          ov.appendChild(document.createTextNode(ln.w[w].t));
          sp.appendChild(ov);
          row.appendChild(sp);
          words.push({ ov: ov, p: -1 });
        }
      } else {
        row.textContent = ln.t || "·";
      }
      if (!ln.t) row.classList.add("gap");
      if (ln.tr) {
        var sub = document.createElement("div");
        sub.className = "fsub";
        sub.textContent = ln.tr;
        row.appendChild(sub);
      }
      flyrIn.appendChild(row);
      lineEls.push({ el: row, words: words, sung: false, clean: true });
    }
  }

  /* ---------- 逐帧歌词渲染：行切换 + 当前词扫色 + 高光保持 + 暂停淡出 ----------
     v8.2.2 高光保持律（用户实机反馈：唱完的行在下一句开始前高光不得提前
     消失，浮窗与「初始」面板同律）：
     · 当前行扫到 100% 后高光挂住（250ms 自动渐隐废弃）——只有行切换离开
       时才进 done 渐隐（.ov opacity .6s + 行色渐灰）；
     · 间奏（lineIndex=-1）自然流入（上一活动行 === lastLine）：DOM 不动，
       高光挂到下一句开始；seek 跨间奏落入（activeLine ≠ lastLine）：按
       已唱界对账；
     · 行切换/回退：未来行无条件还原未唱态——含曾 done 行（done 移除后
       --p 定格残留必须归零，v8.1.4 clean 标记漏洞修复）；
     · 词扫光写值防抖：进度量化 0.25%，不变不写（暂停帧零样式写入）。 */
  function reconcileLines(active, ref) {
    for (var i = 0; i < lineEls.length; i++) {
      var on = i === active;
      var was = lineEls[i].el.classList.contains("done");
      var done = ref >= 0 && i <= ref && !on;
      lineEls[i].el.classList.toggle("on", on);
      lineEls[i].el.classList.toggle("done", done);
      if (on) {
        lineEls[i].sung = true;
        lineEls[i].clean = false; /* 重新扫光：清定格标记 */
        continue;
      }
      if (done) {
        if (!was) {
          /* 唱过的行定格全亮渐隐；seek 跳中段的未唱行直接灰 */
          if (lineEls[i].sung) { finalizeLine(i); lineEls[i].clean = true; }
          else { restoreLine(i); lineEls[i].clean = true; }
        }
      } else {
        /* 未来行无条件还原未唱态：曾 on 行的扫光残留与曾 done 行的
           定格残留（clean 标记为 true 也不能跳过——类已移除但 --p 还在） */
        if (was || !lineEls[i].clean) restoreLine(i);
        lineEls[i].clean = true;
        lineEls[i].sung = false;
      }
    }
  }
  function lyricFrame() {
    if (!lineEls.length || !ly.parsed) return;
    var ms = posNow() * 1000;
    /* v8.2.9 行级时钟分离：逐行渲染（lyMode=0）用原始时基（行界快一拍，
       用户反馈「逐行慢了一点」）；逐字扫光保持 -100ms 唱声补偿。 */
    var n = ChuShiLyric.align(ly.parsed, ms, lyMode === 0);
    if (n.lineIndex !== activeLine) {
      if (n.lineIndex < 0) {
        /* 间奏：自然流入（activeLine === lastLine）高光保持不动；
           跨间奏跳入按已唱界对账。activeLine 保持行号（非 -1），
           下一句开始时走正常行切换路径渐灰。 */
        var ref = typeof n.lastLine === "number" && n.lastLine >= 0 ? n.lastLine : -1;
        if (ref !== activeLine) {
          reconcileLines(-1, ref);
          /* v8.2.8 间奏滚动跟进：seek 跨间奏落入时歌词区立即滚到已唱界
             行——旧版停在旧滚动位直到下一句开始 = 长间奏歌词区完全错位
             （跳转后歌词对不上、逐行尤严重的根因）。自然流入不滚。 */
          if (ref >= 0 && ref < lineEls.length) {
            var elr = lineEls[ref].el;
            var tgr = (flyrIn.parentNode.clientHeight - elr.offsetHeight) / 2 - elr.offsetTop;
            if (tgr !== lastLyrTy) { lastLyrTy = tgr; flyrIn.style.transform = "translateY(" + tgr + "px)"; }
          }
        }
        /* ref === activeLine：什么都不动——高光挂住等下一句 */
      } else {
        activeLine = n.lineIndex;
        reconcileLines(activeLine, activeLine);
        var elc = lineEls[activeLine].el;
        var target = (flyrIn.parentNode.clientHeight - elc.offsetHeight) / 2 - elc.offsetTop;
        if (target !== lastLyrTy) { lastLyrTy = target; flyrIn.style.transform = "translateY(" + target + "px)"; }
      }
    }
    /* v8.2.4 高光保持补门（面板同律）：n.lineIndex === activeLine 才写词——
       真 yrc 行尾+200ms 进间奏（wordIndex=-1），旧版把全词 p 重算 0 =
       扫光塌零「播放完动画就结束高亮」；间奏自然流入期不写词，挂 100%
       到下一行开始才随 done 渐隐。 */
    if (lyMode === 1 && activeLine >= 0 && activeLine < lineEls.length && n.lineIndex === activeLine) {
      var ws = lineEls[activeLine].words;
      for (var j = 0; j < ws.length; j++) {
        var pp = j < n.wordIndex ? 1 : j > n.wordIndex ? 0 : (n.wordIndex >= 0 ? n.wordProgress : 0);
        var q = Math.round(pp * 400) / 400; /* 0.25% 量化：不变不写 */
        if (ws[j].p !== q) {
          ws[j].p = q;
          ws[j].ov.style.setProperty("--p", (q * 100).toFixed(2) + "%");
        }
      }
    }
    var playing = effPlaying();
    if (prevLyrPlaying !== playing) {
      prevLyrPlaying = playing;
      flyrIn.style.opacity = playing ? "1" : "0.38";
    }
  }
  function finalizeLine(idx) {
    var ws = lineEls[idx].words;
    for (var j = 0; j < ws.length; j++) {
      ws[j].p = 1;
      ws[j].ov.style.setProperty("--p", "100%");
    }
  }
  function restoreLine(idx) {
    var ws = lineEls[idx].words;
    for (var j = 0; j < ws.length; j++) {
      ws[j].p = 0;
      ws[j].ov.style.setProperty("--p", "0%");
    }
  }

  /* ---------- 交互绑定 ---------- */
  function bindPlay(btn) {
    el(btn).addEventListener("click", function () {
      var cur = effPlaying();
      optP = !cur; optAt = Date.now();
      applyVis();
      send("toggle", undefined);
    });
  }
  bindPlay("play"); bindPlay("fplay");
  el("prev").addEventListener("click", function () { send("prev", undefined); });
  el("next").addEventListener("click", function () { send("next", undefined); });
  el("fprev").addEventListener("click", function () { send("prev", undefined); });
  el("fnext").addEventListener("click", function () { send("next", undefined); });
  el("miniCover").addEventListener("click", function () { setMode("cover"); });
  el("miniFull").addEventListener("click", function () { setMode("full"); });
  el("fullCover").addEventListener("click", function () { setMode("cover"); });
  el("fullMini").addEventListener("click", function () { setMode("mini"); });
  coverEl.addEventListener("click", function () {
    if (Date.now() - coverClickBlock < 350) return; /* 封面拖动后的误触 click */
    setMode("mini");
  });
  /* 标准态进度条：点按 → 完全体（不跳回「初始」）；完全体进度条：点按 → seek */
  el("rail").addEventListener("click", function (e) {
    e.stopPropagation();
    setMode("full");
  });
  el("frail").addEventListener("click", function (e) {
    e.stopPropagation();
    if (!track || !(track.duration > 0)) return;
    var rect = el("frail").getBoundingClientRect();
    var r = (e.clientX - rect.left) / Math.max(1, rect.width);
    r = Math.min(1, Math.max(0, r));
    send("seek", Math.round(r * track.duration));
  });
  /* 右键隐藏已退役（v8.2.9 用户指令：取消右键隐藏浮窗的逻辑，全局开关在
     「初始」面板；此处不再拦截右键菜单，交还浏览器默认行为） */
  window.addEventListener("resize", applyPos);

  /* ---------- rAF 主循环：进度插值 + 完全体歌词帧 + 辉光律动 ----------
     v8.2.6 休眠改造（5070 卡顿根治①）：循环不再无条件永转——
     needFrame() 判定「还有活干」才续帧：
     · 页面 hidden（切后台/最小化）→ 立睡（visibilitychange 唤醒）；
     · 无曲目 → 睡（state 消息唤醒）；
     · 频谱活动（spec.on && playing）→ rAF 60fps（辉光包络要顺滑）；
     · 完全体 → rAF（逐字扫光逐帧）；
     · mini 走针 / cover 静置 → 200ms 定时节拍（1s 变一次的字符串够用）；
     · 辉光衰减尾（envBass>0.012）→ 续帧到归零再睡（辉光不冻半透明）。
     后台标签同时撤频谱订阅（②）——三件联动把「N 标签 × 60fps rAF +
     N × 20msg/s spec 扇出」的 renderer 唤醒风暴整体清零。 */
  var lastFillW = "";
  var lastTcur = "", lastTdur = "";
  var rafId = 0, tickTimer = 0;
  /* ---------- v8.2.8 律动引擎（去框化·全频段细腻律） ----------
     用户澄清：「细节」= 律动覆盖高中低音且细腻，不是加方框（v8.2.7 的
     .gring 细节环废弃——方框太丑）。三轴全部融入封面本体 filter 与辉光
     本体：低音 = 提亮 + 辉光主推 + 对比微脉冲；中频 = 亮度微调 + 辉光
     次推 + 光晕尺寸；高频 = 饱和脉冲 + 辉光点缀。pow 0.85 曲线提升小
     信号可见度；分轴攻放（中高频攻快放快 = 跟手细腻，低音慢放 = 鼓点
     余韵）。写值防抖：字符串不变不写；非当前态/静默 → 交还样式表。
     数据面：SW 30Hz 原始帧（v8.2.8），包络在卡侧。 */
  var COVS = {
    mini:  { img: pic,  glow: glow,  on: 0, lf: "", lo: "", lt: "" },
    full:  { img: fpic, glow: glow2, on: 0, lf: "", lo: "", lt: "" },
    cover: { img: cpic, glow: cglow, on: 0, lf: "", lo: "", lt: "" }
  };
  function specTgt() {
    /* v8.2.9 律动总开关：关 = 不产目标值（三轴自然衰减到 0，辉光归还样式表） */
    if (!glowEnabled || !lastSpec.on || !effPlaying()) return null;
    var bands = lastSpec.bands, m = 0, h = 0, i;
    if (bands && bands.length) {
      if (bands.length >= 100) {
        /* v8.2.9 128 段·实际映射律（低频侧线性化 段k≈bin k+2）：
           中 9..84 ≈ 250Hz~2kHz，高 85+ ≈ 2k~16kHz（对数区）；
           低音轴直接用 native bass（0..6 段分区带权 47~211Hz）。 */
        for (i = 9; i <= 84 && i < bands.length; i++) m += Number(bands[i]) || 0;
        m /= 76;
        var hn = 0;
        for (i = 85; i < bands.length; i++) { h += Number(bands[i]) || 0; hn++; }
        if (hn > 0) h /= hn;
      } else {
        /* 旧 native 16 段语义（兼容窗口） */
        for (i = 3; i <= 9; i++) m += Number(bands[i]) || 0;
        m /= 7;
        for (i = 10; i < 16; i++) h += Number(bands[i]) || 0;
        h /= 6;
      }
    }
    return { b: Number(lastSpec.bass) || 0, m: m, h: h };
  }
  function stepEnv() {
    var t = specTgt();
    var tb = t ? t.b : 0, tm = t ? t.m : 0, th = t ? t.h : 0;
    envB += (tb - envB) * (tb > envB ? 0.62 : 0.14);
    envM += (tm - envM) * (tm > envM ? 0.68 : 0.20);
    envH += (th - envH) * (th > envH ? 0.72 : 0.24);
    if (envB < 0.005) envB = 0;
    if (envM < 0.006) envM = 0;
    if (envH < 0.006) envH = 0;
    /* v8.3.1 自适应归一化（AGC）——用户实机反馈：部分歌（《不凡》等低音
       能量偏小的曲子）律动不明显。峰值跟随器分轴记天花板：快攻慢放
       （攻=瞬间、放=每帧 ×0.998+线性微降，半衰期 ~8s，地板 0.12 防静音
       段放大底噪）——整曲电平低 → 天花板随之下移 → 显示值被拉回满幅
       可见区间；响歌天花板贴真实峰值 → 动态对比保持。换歌自动重适应。 */
    pkB = Math.max(envB, pkB * 0.998 - 0.0004);
    pkM = Math.max(envM, pkM * 0.998 - 0.0004);
    pkH = Math.max(envH, pkH * 0.998 - 0.0004);
    if (pkB < 0.12) pkB = 0.12;
    if (pkM < 0.12) pkM = 0.12;
    if (pkH < 0.12) pkH = 0.12;
  }
  /* 显示值 = 包络 / 分轴天花板（0..1 夹紧）——响度归一，弱歌不再隐形 */
  function envNorm() {
    return {
      b: Math.min(1, envB / pkB),
      m: Math.min(1, envM / pkM),
      h: Math.min(1, envH / pkH)
    };
  }
  /* v8.3.1 高光渐入因子：形变落地后 ~480ms 从 0 平滑升到 1（smoothstep） */
  function glowRamp() {
    if (!glowRampAt) return 1;
    var el = Date.now() - glowRampAt;
    if (el >= 480) { glowRampAt = 0; return 1; }
    if (el <= 0) return 0;
    var k = el / 480;
    return k * k * (3 - 2 * k);
  }
  function covClear(c) {
    c.on = 0; c.lf = c.lo = c.lt = "";
    c.img.style.filter = "";
    c.glow.style.opacity = "";
    c.glow.style.transform = "";
  }
  function paintGlow() {
    var act = envB > 0.012 || envM > 0.02 || envH > 0.02;
    var n = envNorm();
    var ramp = glowRamp();
    for (var k in COVS) {
      var c = COVS[k];
      if (k !== mode || !act || ramp === 0) { if (c.on) covClear(c); continue; }
      /* v8.3.1：归一化值 + pow 0.75（0.85→0.75 再提小信号可见度）+
         增益整体上调（brightness 0.30→0.42 / glow 0.52→0.68）——弱歌
         拉满、响歌贴顶，节拍拳感肉眼可辨 */
      var pb = Math.pow(n.b, 0.75), pm = Math.pow(n.m, 0.75), ph = Math.pow(n.h, 0.75);
      var f = "brightness(" + (1 + (pb * 0.42 + pm * 0.18) * ramp).toFixed(3) + ") saturate(" +
        (1 + (ph * 0.36) * ramp).toFixed(3) + ") contrast(" + (1 + (pb * 0.06) * ramp).toFixed(3) + ")";
      var go = Math.min(1, (0.20 + pb * 0.68 + pm * 0.26 + ph * 0.12) * ramp).toFixed(3);
      var gt = "scale(" + (1 + (n.b * 0.06 + n.m * 0.03 + n.h * 0.016) * ramp).toFixed(4) + ")";
      if (f !== c.lf) { c.lf = f; c.img.style.filter = f; }
      if (go !== c.lo) { c.lo = go; c.glow.style.opacity = go; }
      if (gt !== c.lt) { c.lt = gt; c.glow.style.transform = gt; }
      c.on = 1;
    }
  }
  function loopBody() {
    if (track) {
      var dur = track.duration || 0;
      var pr = dur > 0 ? Math.min(1, posNow() / dur) : 0;
      var w = (pr * 100).toFixed(2) + "%";
      if (w !== lastFillW) {
        lastFillW = w;
        fill.style.width = w;
        ffill.style.width = w;
      }
      if (mode === "full") {
        /* 写值防抖：fmt 每秒才变一次，字符串比对代替每帧 textContent 写 */
        var tc = fmt(posNow());
        if (tc !== lastTcur) { lastTcur = tc; tcur.textContent = tc; mtm.textContent = tc; }
        var td = dur > 0 ? fmt(dur) : "--:--";
        if (td !== lastTdur) { lastTdur = td; tdur.textContent = td; }
        lyricFrame();
      } else if (mode === "mini") {
        /* v8.2.3b 顶带时间在 mini 也走针（空带填充修复的本体——不然带左
           时间永远冻结在 0:00，空带照旧） */
        var tc = fmt(posNow());
        if (tc !== lastTcur) { lastTcur = tc; mtm.textContent = tc; }
      }
    }
    stepEnv();
    paintGlow();
    /* 播放态图标真值回收（乐观窗口到期后与真值对齐） */
    if (optAt && Date.now() - optAt >= 2500) { optAt = 0; applyVis(); }
  }
  function needFrame() {
    if (document.visibilityState !== "visible") return false;
    if (lastSpec.on && effPlaying()) return true;   /* 辉光律动中 */
    if (envB > 0.012 || envM > 0.02 || envH > 0.02) return true; /* 衰减尾（三轴） */
    if (!track) return false;
    if (mode === "full") return true;               /* 歌词逐字 + 走针 */
    if (mode === "mini") return !!track.playing || !!optAt; /* 走针/乐观窗 */
    return !!optAt;                                 /* cover：仅乐观窗 */
  }
  function schedule() {
    /* 完全体逐字/辉光活动/衰减尾 → rAF（60fps 顺滑）；纯走针 → 200ms 节拍 */
    if (mode === "full" || (lastSpec.on && effPlaying()) || envB > 0.012 || envM > 0.02 || envH > 0.02) {
      rafId = requestAnimationFrame(frame);
    } else {
      tickTimer = setTimeout(tick, 200);
    }
  }
  function frame() { rafId = 0; loopBody(); if (needFrame()) schedule(); }
  function tick() { tickTimer = 0; loopBody(); if (needFrame()) schedule(); }
  function sleepNow() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (tickTimer) { clearTimeout(tickTimer); tickTimer = 0; }
  }
  function wake() {
    if (!cardEnabled) return;
    if (document.visibilityState !== "visible") return;
    if (rafId || tickTimer) return; /* 已醒：下一拍自会按 needFrame 重估 */
    if (needFrame()) schedule();
  }
  /* v8.3.0：可见性翻转 = 频谱订阅 + 渲染循环 双联开关（vis 上报退役——
     state 轮询常开，切歌真值永远可达，见文件头 ②） */
  document.addEventListener("visibilitychange", function () {
    var vis = document.visibilityState === "visible";
    try {
      if (port) port.postMessage({ type: "spec", on: specMsgOn() });
    } catch (e) { /* 断线事件接管 */ }
    if (vis) wake(); else sleepNow();
  });

  /* ---------- 启动（v8.2.9：全局开关门控，替代旧站点隐藏） ---------- */
  initCard(); /* cardEnabled 默认 true；关态下由 storage 回调后再启动 */
})();
