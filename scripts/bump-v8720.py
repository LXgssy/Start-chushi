# bump-v8720.py — 版本双位 bump（8.7.20）+ 探针 ZIP 路径/横幅 + TL46 新门
import pathlib

R = pathlib.Path("/tmp/beta-wt")

# ① build-extension.py VERSION
f = R / "scripts/build-extension.py"
s = f.read_text(encoding="utf-8")
assert 'VERSION = "8.7.19"' in s
s = s.replace('VERSION = "8.7.19"', 'VERSION = "8.7.20"')
f.write_text(s, encoding="utf-8")
print("build-extension.py VERSION -> 8.7.20")

# ② changelog.ts 头插条目
f = R / "src/lib/startpage/changelog.ts"
s = f.read_text(encoding="utf-8")
ANCHOR = 'export const CHANGELOG: ChangelogEntry[] = [\n'
ENTRY = '''  {
    version: "8.7.20",
    date: "2026-09-25",
    title: "「词」角标与手感轻量化 + 全局歌词白描边根修",
    channel: "shell",
    highlights: [
      "「词」按钮回弹放轻：按下与弹跳幅度收敛，确认感保留、不再夸张",
      "开启状态新增 ✓ 角标：钉在「词」字右下角，一眼看清开与关",
      "全局歌词逐字模式白描边根治：已唱字直接落在深底上，边缘不再泛白晕",
    ],
  },
'''
assert ANCHOR in s and '"8.7.20"' not in s
s = s.replace(ANCHOR, ANCHOR + ENTRY, 1)
f.write_text(s, encoding="utf-8")
print("changelog.ts entry inserted")

# ③ 探针：ZIP 路径 + 横幅版本
f = R / "scripts/probe-beta.mjs"
s = f.read_text(encoding="utf-8")
OLD = 'const ZIP = "/tmp/beta-wt/download/v8.7.19/ChuShi-NewTab-v8.7.19.zip";'
NEW = 'const ZIP = "/tmp/beta-wt/download/v8.7.20/ChuShi-NewTab-v8.7.20.zip";'
assert s.count(OLD) == 1
s = s.replace(OLD, NEW, 1)
OLD_B = "===== v8.7.19 probe:"
if OLD_B not in s:
    OLD_B = "===== v8.7.18 probe:"
assert s.count(OLD_B) == 1, "probe banner not found"
s = s.replace(OLD_B, "===== v8.7.20 probe:", 1)

# ④ TL46 新门（插在 TL45 块结束与 T10 之间）
ANCHOR46 = """      JSON.stringify(t45));
  }

  /* ---------- T10 pageerror ---------- */"""
TL46 = """      JSON.stringify(t45));
  }

  /* ---------- TL46 反馈轻量化+on 角标+dl 白描边根修静态门（v8.7.20） ----------
     ①词钮回弹轻量化（用户：回弹感没必要这么强）：:active .82→.88 +
     脉冲峰 1.22→1.1 + .32s→.28s（旧键帧/旧时长退役，注释提及不计数）
     ②on 态 ✓ 角标（用户：加开启状态图标）：on-badge svg（accent 圆 r6+
     白勾 m3.5 6.3…）在按钮内 use 之后 + off 隐/on 显/白勾/accent 圆 CSS 对
     ③dl 逐字白描边根修（用户：播放过的高亮字有白色描边）：层角色对调——
     .dw 底层恒 accent（已唱色）+ .ov 面层白字裁未唱区（clip 左缘=--p），
     已唱字形直接坐在深色药丸上零白晕；旧 accent 面层/右缘裁剪在 dl 块内
     退役（悬浮卡 .fw .ov 旧律保留零波及——其底色灰阶无白晕病灶）。 */
  {
    const cardSrc46 = readFileSync(new URL("../extension-src/ext-card.js", import.meta.url), "utf8");
    const wSrc46 = readFileSync(new URL("../preset-src/smtc/music-widget.html", import.meta.url), "utf8");
    /* dl 样式块抽取：innerHTML 拼接串去连接噪声（' +\\n'）后为连续 CSS 文本 */
    const dlRaw46 = ( /dlShadow\\.innerHTML =([\\s\\S]*?)\\(document\\.body/.exec(cardSrc46) || [null, ""] )[1] || "";
    const dlCss46 = dlRaw46.replace(/'\\s*\\+\\s*\\n\\s*'/g, "");
    const t46 = {
      softPress: /#csWordBtn:active\\{transform:scale\\(\\.88\\);color:var\\(--acc\\)\\}/.test(wSrc46),
      softPulse: /@keyframes cs-wpulse-kf\\{0%\\{transform:scale\\(\\.88\\)\\}45%\\{transform:scale\\(1\\.1\\)\\}100%\\{transform:scale\\(1\\)\\}\\}/.test(wSrc46) && /animation:cs-wpulse-kf \\.28s var\\(--ez\\)/.test(wSrc46) && !/scale\\(1\\.22\\)/.test(wSrc46) && !/\\.32s var\\(--ez\\)/.test(wSrc46),
      badgeEl: /<svg class="on-badge" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6"\\/><path d="m3\\.5 6\\.3 1\\.7 1\\.7 3\\.3-3\\.7"\\/><\\/svg><\\/button>/.test(wSrc46),
      badgeCss: /#csWordBtn \\.on-badge\\{position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;display:none;fill:var\\(--acc\\);stroke:none\\}/.test(wSrc46) && /#csWordBtn \\.on-badge path\\{fill:none;stroke:#fff;stroke-width:1\\.9/.test(wSrc46) && /#csWordBtn\\.on \\.on-badge\\{display:block\\}/.test(wSrc46),
      dlDwAcc: /\\.dl1 \\.dw\\{position:relative;display:inline-block;color:var\\(--acc,#8b5cf6\\)\\}/.test(dlCss46),
      dlOvWhite: /\\.dl1 \\.dw \\.ov\\{position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;color:#fff;clip-path:inset\\(-8% -8% -8% var\\(--p,0%\\)\\)\\}/.test(dlCss46),
      dlOldGone: dlCss46.length > 400 && !/inset\\(-8% calc\\(100% - var\\(--p,0%\\)\\)/.test(dlCss46) && !/nowrap;color:var\\(--acc,#8b5cf6\\)/.test(dlCss46),
      cardUntouched: /\\.fw \\.ov\\{[\\s\\S]{0,150}?calc\\(100% - var\\(--p,0%\\)\\) -8% 0\\)\\}/.test(cardSrc46),
    };
    gate("TL46 反馈轻量化+on 角标+dl 白描边根修静态门（v8.7.20）：按压 .88/脉冲 1.1/.28s（旧值退役）+ on-badge 元素/CSS 三件 + dl 层对调（.dw accent 底+.ov 白面层 clip 左缘 --p+dl 块内旧律退役）+ 悬浮卡旧律零波及",
      t46.softPress && t46.softPulse && t46.badgeEl && t46.badgeCss && t46.dlDwAcc && t46.dlOvWhite && t46.dlOldGone && t46.cardUntouched,
      JSON.stringify(t46));
  }

  /* ---------- T10 pageerror ---------- */"""
assert s.count(ANCHOR46) == 1, "TL46 anchor not unique"
s = s.replace(ANCHOR46, TL46, 1)
f.write_text(s, encoding="utf-8")
print("probe-beta.mjs: ZIP path + banner + TL46 gate inserted")
