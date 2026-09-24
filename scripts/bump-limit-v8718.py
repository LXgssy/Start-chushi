# bump-limit-v8718.py — widgetHtmlLen 五处联动 27600→28800（v8.7.18 词钮+真字形）
# Task 100 两道数字门律：preset.ts / build-smtc-preset.py / PresetDocs / PRESET_DEV.md / 探针 TL37b
import pathlib

R = pathlib.Path("/tmp/beta-wt")


def patch(p, old, new, must=True):
    f = R / p
    s = f.read_text(encoding="utf-8")
    if old not in s:
        if must:
            raise SystemExit(f"NOT FOUND in {p}: {old[:60]}")
        return
    assert s.count(old) == 1, f"AMBIGUOUS in {p}: {old[:60]}"
    f.write_text(s.replace(old, new), encoding="utf-8")
    print("patched", p)


# ① 宿主上限常量 + 历史注释补一行
patch("src/lib/startpage/preset.ts",
      "五处联动：preset.ts/build-smtc-preset.py/PresetDocs/PRESET_DEV.md/探针 TL37b */\n  widgetHtmlLen: 27600,",
      "五处联动：preset.ts/build-smtc-preset.py/PresetDocs/PRESET_DEV.md/探针 TL37b\n     v8.7.18：27600 → 28800 —— 词钮迁时长行右下（绝对定位+hover 律）+「词」真字形\n     描取（思源黑体轮廓 DP 简化 45 点）+净增 ~180 字符（minified 实测 27780）；+1000 余量 */\n  widgetHtmlLen: 28800,")

# ② 构建脚本数字门
patch("scripts/build-smtc-preset.py",
      'assert len(html) <= 27600, f"widget html 超限: {len(html)} > 27600"  # v8.7.16：27200→27600（全局歌词开关+图标+接线余量）与宿主同步放宽（Task 100 两道数字门律）',
      'assert len(html) <= 28800, f"widget html 超限: {len(html)} > 28800"  # v8.7.18：27600→28800（词钮迁时长行右下+真字形描取）与宿主同步放宽（Task 100 两道数字门律）')

# ③ 应用内文档组件
patch("src/components/startpage/PresetDocs.tsx",
      "单块 html ≤27600 字符（见 §12）",
      "单块 html ≤28800 字符（见 §12）")

# ④ 仓内开发文档（历史链补一行）
patch("docs/PRESET_DEV.md",
      "v8.7.12 起 26400→27600 逐步放宽）",
      "v8.7.12 起 26400→27600，v8.7.18 起 27600→28800 逐步放宽）")

# ⑤ 探针 TL37b：当前值 + 旧值退役清单 + 门名
patch("scripts/probe-beta.mjs",
      '/* v8.7.16：27600（全局歌词开关+图标+接线余量，五处联动同步） */\n      htmlCap: docsSrc.includes("27600"),',
      '/* v8.7.18：28800（词钮迁时长行右下+真字形描取，五处联动同步） */\n      htmlCap: docsSrc.includes("28800"),')
patch("scripts/probe-beta.mjs",
      'md: devMd.includes("27600"),',
      'md: devMd.includes("28800"),')
patch("scripts/probe-beta.mjs",
      'legacyGone: !docsSrc.includes("≤18000") && !docsSrc.includes("≤26400") && !docsSrc.includes("40–320"),',
      'legacyGone: !docsSrc.includes("≤18000") && !docsSrc.includes("≤26400") && !docsSrc.includes("≤27600") && !docsSrc.includes("40–320"),')
patch("scripts/probe-beta.mjs",
      'gate("TL37b 文档内容同步源码门（v8.7.16 升 27600）：27600/40–460/≤7/十三字段 + 应用内与仓内 md 对账 + 旧值（18000/26400）退役"',
      'gate("TL37b 文档内容同步源码门（v8.7.18 升 28800）：28800/40–460/≤7/十三字段 + 应用内与仓内 md 对账 + 旧值（18000/26400/27600）退役"')

print("all 5 places done")
