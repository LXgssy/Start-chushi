#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.7 e2e 适配：verify-v825-ext.mjs → verify-v827-ext.mjs。
改动点：①态切换动画时序（sleep 400→550，动画 ≤340ms）②F13b 重校准
（变亮律让中心像素合法波动——原「中心恒定」断言改「波动在 + 色调守恒」）
③新增 F16 一镜到底中途帧取证 ④新增 F17 封面态律动高光 ⑤封面态 56px 坐标。
"""
import pathlib, sys

SRC = pathlib.Path("/tmp/my-project/scripts/verify-v825-ext.mjs")
DST = pathlib.Path("/tmp/my-project/scripts/verify-v827-ext.mjs")
src = SRC.read_text(encoding="utf-8")

def rep(old, new, tag):
    global src
    if old not in src:
        sys.exit(f"anchor NOT FOUND: {tag}")
    src = src.replace(old, new, 1)
    print(f"  ok {tag}")

# 1) 头注释
rep(
    "// v8.2.5 扩展级 e2e（v8.2.4 全回归 + 20Hz 轮询下辉光脉冲/时间走针兼容）（辉光层叠 + 顶带时间走针 + cardAcc 主题跟随 + 三态回归）",
    "// v8.2.7 扩展级 e2e（v8.2.5 全回归 + 律动变亮律/细节环 + 封面态 56px 律动高光\n"
    "//   + 三态一镜到底过渡动画中途帧取证）（辉光层叠 + 顶带时间走针 + cardAcc 主题跟随 + 三态回归）",
    "头注释",
)
rep(
    "// F5c 封面单击展开 / F7a 封面禁拖 / F7b 把手拖动 / F4 hublog / F9 零致命",
    "// F5c 封面单击展开 / F7a 封面禁拖 / F7b 把手拖动 / F4 hublog / F9 零致命\n"
    "// F16 一镜到底（mini→full 中途帧 ≠ 两端帧）/ F17 封面态辉光脉冲 / F13b 重校准（变亮律）",
    "头注释2",
)

# 2) profile 目录名
rep(
    'const profileDir = mkdtempSync(join(tmpdir(), "ext-profile-825-"));',
    'const profileDir = mkdtempSync(join(tmpdir(), "ext-profile-827-"));',
    "profile 目录",
)

# 3) cover 态按钮坐标（56px 中心）
rep(
    '  return { center: [L + 24, T + 24] }; /* cover */',
    '  return { center: [L + 28, T + 28] }; /* cover（v8.2.7：56px） */',
    "cover 坐标",
)

# 4) F13b 重校准：中心波动 = 变亮律证据；色调守恒 = 层叠律（辉光不得糊脸）
rep(
    """    /* 中心稳定性 = 任意通道最大波动 */
    let spread = 0;
    for (const ch of [0, 1, 2]) {
      const vs = cSamples.map((c) => c[ch]);
      spread = Math.max(spread, Math.max(...vs) - Math.min(...vs));
    }
    chk("F13a 封面四周辉光晕出（环带脉冲可见，峰值 r=" + ringMax + " > 底色 28）", ringMax > 60);
    chk("F13b 不透明封面挡住辉光（中心 9 帧通道波动 " + spread + " ≤ 12；bug 态辉光画在图上必波动）", spread <= 12);""",
    """    /* v8.2.7 F13b 重校准：变亮律让封面中心合法波动（brightness 滤镜随低音
       脉冲）——层叠律改由「色调守恒」守卫：accent #ff2d78 的 r-g=210，若辉光
       糊脸则峰值帧 r-g 大幅抬升；brightness 等比缩放 r-g 基本不动 */
    let spread = 0;
    for (const ch of [0, 1, 2]) {
      const vs = cSamples.map((c) => c[ch]);
      spread = Math.max(spread, Math.max(...vs) - Math.min(...vs));
    }
    let hueDrift = 0;
    {
      const gaps = cSamples.map((c) => c[0] - c[1]); /* r-g */
      hueDrift = Math.max(...gaps) - Math.min(...gaps);
    }
    chk("F13a 封面四周辉光晕出（环带脉冲可见，峰值 r=" + ringMax + " > 底色 28）", ringMax > 60);
    chk("F13b-变亮 封面本体随拍提亮（中心 9 帧最大波动 " + spread + " ≥ 9；img 未加载时由环带幅度兜底 F13a2）", spread >= 9);
    chk("F13b-层叠 色调守恒（r-g 漂移 " + hueDrift + " ≤ 45；辉光糊脸态必 >100）", hueDrift <= 45);""",
    "F13b 重校准",
)

# 4b) F13 循环：采集环带序列 + F13a2 幅度断言（亮度脉冲真图证据由 panel e2e P2b 承担）
rep(
    """    let ringMax = 0;
    const cSamples = [];
    for (let i = 0; i < 9; i++) {
      const clip = { x: pr.left, y: pr.top + 26, width: 70, height: 44 };
      const [ring, center] = await samplePixels(p2, clip, [[9, 22], [34, 22]]);
      ringMax = Math.max(ringMax, ring[0]);
      cSamples.push(center);
      await sleep(220);
    }""",
    """    let ringMax = 0;
    const cSamples = [];
    const ringSamples = [];
    for (let i = 0; i < 9; i++) {
      const clip = { x: pr.left, y: pr.top + 26, width: 70, height: 44 };
      const [ring, center] = await samplePixels(p2, clip, [[9, 22], [34, 22]]);
      ringMax = Math.max(ringMax, ring[0]);
      ringSamples.push(ring);
      cSamples.push(center);
      await sleep(220);
    }""",
    "F13 环带序列采集",
)
rep(
    """    chk("F13a 封面四周辉光晕出（环带脉冲可见，峰值 r=" + ringMax + " > 底色 28）", ringMax > 60);
    chk("F13b-变亮""",
    """    let ringMin = 255;
    for (const [r0] of ringSamples) ringMin = Math.min(ringMin, r0);
    chk("F13a 封面四周辉光晕出（环带脉冲可见，峰值 r=" + ringMax + " > 底色 28）", ringMax > 60);
    chk("F13a2 环带呼吸幅度（max-min r = " + (ringMax - ringMin) + " ≥ 25 = 辉光真的在律动）", ringMax - ringMin >= 25);
    chk("F13b-变亮""",
    "F13a2 幅度断言",
)

# 5) F5d/F8/F5a/F5b/F5c 动画时序 450→600 / 350→550 / 400→550
rep(
    """  let B = btns(pr, "mini");
  await p2.mouse.click(B.full[0], B.full[1]);
  await sleep(450);""",
    """  let B = btns(pr, "mini");
  await p2.mouse.click(B.full[0], B.full[1]);
  await sleep(600); /* v8.2.7 一镜到底 340ms + 余量 */""",
    "F5d 时序",
)
rep(
    """  B = btns(pr, "full");
  await p2.mouse.click(B.mini[0], B.mini[1]);
  await sleep(400);
  pr = await probeCard(CY);
  chk("F5a 完全体缩回钮 → 标准态（宽度回 ≈264，实测 " + (pr.found ? pr.width : "未命中") + "）",""",
    """  B = btns(pr, "full");
  await p2.mouse.click(B.mini[0], B.mini[1]);
  await sleep(600);
  pr = await probeCard(CY);
  chk("F5a 完全体缩回钮 → 标准态（宽度回 ≈264，实测 " + (pr.found ? pr.width : "未命中") + "）",""",
    "F5a 时序",
)
rep(
    """  B = btns(pr, "mini");
  await p2.mouse.click(B.rail[0], B.rail[1]);
  await sleep(450);""",
    """  B = btns(pr, "mini");
  await p2.mouse.click(B.rail[0], B.rail[1]);
  await sleep(600);""",
    "F8 时序",
)
rep(
    """  B = btns(pr, "full");
  await p2.mouse.click(B.mini[0], B.mini[1]);
  await sleep(350);
  pr = await probeCard(CY);
  B = btns(pr, "mini");
  await p2.mouse.click(B.coverBtn[0], B.coverBtn[1]);
  await sleep(400);""",
    """  B = btns(pr, "full");
  await p2.mouse.click(B.mini[0], B.mini[1]);
  await sleep(550);
  pr = await probeCard(CY);
  B = btns(pr, "mini");
  await p2.mouse.click(B.coverBtn[0], B.coverBtn[1]);
  await sleep(550);""",
    "F5b 时序",
)
rep(
    """  await p2.mouse.click(BC.center[0], BC.center[1]);
  await sleep(400);""",
    """  await p2.mouse.click(BC.center[0], BC.center[1]);
  await sleep(550);""",
    "F5c 时序",
)

# 6) F5b 封面态注释宽度 48→56（断言带 36-62 不变，56 在带内）
rep(
    'chk("F5b 收起钮 → 封面态（宽度 ≈48，实测 " + (prCov.found ? prCov.width : "未命中") + "）",',
    'chk("F5b 收起钮 → 封面态（宽度 ≈56，实测 " + (prCov.found ? prCov.width : "未命中") + "）",',
    "F5b 文案",
)

# 7) 新增 F16/F17：插在 F7b 之后、p2.close() 之前
rep(
    """  await p2.screenshot({ path: `${SHOTS}/v823-e-dragged.png` }).catch(() => {});

  await p2.close();""",
    """  await p2.screenshot({ path: `${SHOTS}/v823-e-dragged.png` }).catch(() => {});

  /* ---------- F16 v8.2.7 一镜到底：mini→full 中途帧取证 ----------
     三帧同区域截图：T0（mini 静置）/ T1（点击后 ~130ms，clone 飞形 + 面板
     长出中）/ T2（收敛后完全体）。若切换是无动画直切，T1 必等于 T2；
     若中途白屏/换镜，T1 会丢掉两侧内容。断言：T1≠T0 且 T1≠T2。 */
  {
    await sleep(700); /* 拖动后位置已存，先回稳定态 */
    pr = await probeCard(CY);
    B = btns(pr, "mini");
    const region = { x: pr.left, y: pr.top, width: 340, height: 140 };
    const s0 = await p2.screenshot({ clip: region });
    await p2.mouse.click(B.rail[0], B.rail[1]);
    await sleep(130);
    const s1 = await p2.screenshot({ clip: region });
    await sleep(700);
    const s2 = await p2.screenshot({ clip: region });
    chk("F16a 一镜到底中途帧 ≠ 起点（面板长出中）", !s0.equals(s1));
    chk("F16b 一镜到底中途帧 ≠ 终点（非直切）", !s1.equals(s2));
    pr = await probeCard(CY);
    chk("F16c 动画收敛后几何正确（完全体 ≈324，实测 " + (pr.found ? pr.width : "未命中") + "）",
        pr.found && pr.width >= 300 && pr.width <= 345);
    await p2.screenshot({ path: `${SHOTS}/v827-f-morph.png` }).catch(() => {});
  }

  /* ---------- F17 v8.2.7 封面态律动高光（56px 封面 + glow/gring 上身） ---------- */
  {
    /* 完全体 → 封面态 */
    B = btns(pr, "full");
    await p2.mouse.click(B.coverBtn[0], B.coverBtn[1]);
    await sleep(600);
    const pcv = await probeCard(pr.top + 24); /* 动态探针行：pos.y 已被 F7b 拖动改写 */
    chk("F17a 收起进封面态（宽度 ≈56，实测 " + (pcv.found ? pcv.width : "未命中") + "）",
        pcv.found && pcv.width >= 48 && pcv.width <= 64);
    /* 辉光采样：封面右缘外 2px（glow inset -5px 晕出区），2s 内脉冲幅度 */
    let gMin = 999, gMax = 0;
    for (let i = 0; i < 8; i++) {
      const clip = { x: pcv.right, y: pcv.top + 12, width: 8, height: 32 };
      const pts = [[2, 8], [2, 16], [3, 24]]; /* glow inset -5px：right+1..+4 是晕光带 */
      const px = await samplePixels(p2, clip, pts);
      const v = Math.max(...px.map(([r, g, b]) => r + g + b));
      const w = Math.min(...px.map(([r, g, b]) => r + g + b));
      gMax = Math.max(gMax, v); gMin = Math.min(gMin, w);
      await sleep(240);
    }
    chk("F17b 封面态辉光脉冲（右缘晕光带幅度 " + (gMax - gMin) + " > 35，峰值 " + gMax + "）",
        gMax - gMin > 35);
    await p2.screenshot({ path: `${SHOTS}/v827-g-coverglow.png` }).catch(() => {});
    /* 回标准态收尾（后续无依赖，位置保留） */
    const bc = btns(pcv, "cover");
    await p2.mouse.click(bc.center[0], bc.center[1]);
    await sleep(600);
  }

  await p2.close();""",
    "F16/F17 新增",
)

# 8) 尾部版本号
rep(
    'console.log(pass ? "\\nEXT-E2E v8.2.4 PASS" : "\\nEXT-E2E v8.2.4 FAIL");',
    'console.log(pass ? "\\nEXT-E2E v8.2.7 PASS" : "\\nEXT-E2E v8.2.7 FAIL");',
    "尾部版本",
)

DST.write_text(src, encoding="utf-8")
print(f"OK -> {DST}")
