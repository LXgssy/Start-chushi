# word-glyph.py — 描取「词」真字形（用户 v8.7.18 反馈①：按「词」字描着画）
# 源字形：Noto Sans SC variable（默认 Regular 轮廓）U+8BCD
# 管线：glyf 轮廓 → 二次曲线展开（implied on-curve 中点律）→ 密集采样 →
#       最终 24 空间缩放居中（方框 rect 2.9..21.1 中心 12,12）→ DP 简化 →
#       相对坐标 1 位小数零漂移发射 → 单 path d 串（fill 用，nonzero 环向天然成立）
# 输出：stdout 打印 d 串 + 长度；/tmp/word-glyph-test.html 目检页（19px 实际尺寸 + 120px 放大）
import math

FONT = "/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf"
# （NotoSansSC[wght].ttf 表数据截断 AssertionError 不可用；Sarasa CJK=思源黑体同源设计）
CHAR = 0x8BCD  # 词
TARGET_H = 11.4      # 字高（方框 18.2 的 ~63%，网易云徽章字面占比同族）
CX, CY = 12.0, 12.0  # 方框正中
DP_TOL = 0.06        # 24 空间容差（19px 渲染 ≈0.05px，不可见）

from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen

font = TTFont(FONT)
glyphSet = font.getGlyphSet()
gname = font.getBestCmap()[CHAR]
upm = font["head"].unitsPerEm


class FlattenPen(BasePen):
    """轮廓 → 密集折线（TrueType 二次曲线含 implied on-curve 中点展开）"""
    def __init__(self, gs):
        super().__init__(gs)
        self.contours = []
        self.cur = None

    def _moveTo(self, p):
        self.cur = [p]
        self.contours.append(self.cur)

    def _lineTo(self, p):
        self.cur.append(p)

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        n = 12
        for i in range(1, n + 1):
            t = i / n
            mt = 1 - t
            self.cur.append((mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0],
                             mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1]))

    def _qCurveTo(self, *points):
        p0 = self.cur[-1]
        offs = points[:-1]
        end = points[-1]
        segs = []
        for i in range(len(offs)):
            c = offs[i]
            if i < len(offs) - 1:
                nxt = offs[i + 1]
                on = ((c[0] + nxt[0]) / 2.0, (c[1] + nxt[1]) / 2.0)
            else:
                on = end
            segs.append((c, on))
        for c, on in segs:
            poly = math.hypot(c[0] - p0[0], c[1] - p0[1]) + math.hypot(on[0] - c[0], on[1] - c[1])
            k = max(3, min(10, int(poly / (upm / 48.0)) + 1))
            for j in range(1, k + 1):
                t = j / k
                mt = 1 - t
                self.cur.append((mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * on[0],
                                 mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * on[1]))
            p0 = on

    def _closePath(self):
        if self.cur and self.cur[0] != self.cur[-1]:
            self.cur.append(self.cur[0])


glyph = glyphSet[gname]
pen = FlattenPen(glyphSet)
glyph.draw(pen)
contours = pen.contours
print(f"# glyph={gname} upm={upm} contours={len(contours)} rawpts={sum(len(c) for c in contours)}")

from fontTools.pens.boundsPen import BoundsPen
bp = BoundsPen(glyphSet)
glyph.draw(bp)
xmin, ymin, xmax, ymax = bp.bounds
print(f"# font bbox: {xmin},{ymin} .. {xmax},{ymax}  w={xmax-xmin} h={ymax-ymin}")

scale = TARGET_H / (ymax - ymin)
xmid = (xmin + xmax) / 2.0
ymid = (ymin + ymax) / 2.0


def to_final(pt):
    return (CX + (pt[0] - xmid) * scale, CY - (pt[1] - ymid) * scale)


finals = [[to_final(p) for p in c] for c in contours]


def r1(v):
    s = f"{v:.1f}"
    if s.endswith(".0"):
        s = s[:-2]
    return s


def dp(pts, tol):
    """Douglas-Peucker（闭合环：质心最远点切开成开环递归）"""
    if len(pts) <= 3:
        return pts
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    k = max(range(len(pts)), key=lambda i: (pts[i][0] - cx) ** 2 + (pts[i][1] - cy) ** 2)
    ring = pts[k:] + pts[:k + 1]
    keep = [False] * len(ring)
    keep[0] = keep[-1] = True

    def seg(i, j):
        keep[i] = keep[j] = True
        if j <= i + 1:
            return
        ax, ay = ring[i]
        bx, by = ring[j]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        worst, wi = -1.0, -1
        for m in range(i + 1, j):
            if L == 0:
                d = math.hypot(ring[m][0] - ax, ring[m][1] - ay)
            else:
                d = abs(dy * ring[m][0] - dx * ring[m][1] + bx * ay - by * ax) / L
            if d > worst:
                worst, wi = d, m
        if worst > tol:
            seg(i, wi)
            seg(wi, j)

    seg(0, len(ring) - 1)
    out = [ring[i] for i in range(len(ring)) if keep[i]]
    return out[:-1]


simp = [dp(c, DP_TOL) for c in finals]
print(f"# simplified pts={sum(len(c) for c in simp)} (contours {len(simp)})")

d = []
prev = None
for c in simp:
    abss = [(round(p[0], 1), round(p[1], 1)) for p in c]
    start = abss[0]
    if prev is None:
        d.append(f"m{r1(start[0])} {r1(start[1])}")  # 首命令小写 m：SVG 规范=路径首 m 按绝对处理，且后续隐式重复保持相对 lineto
    else:
        dx = round(start[0] - prev[0], 1)
        dy = round(start[1] - prev[1], 1)
        if dx == 0 and dy == 0:
            d.append(f"m{r1(start[0])} {r1(start[1])}")
        else:
            d.append(f"m{r1(dx)} {r1(dy)}")
    prevp = start
    for p in abss[1:]:
        dx = round(p[0] - prevp[0], 1)
        dy = round(p[1] - prevp[1], 1)
        if dx == 0 and dy == 0:
            continue
        d.append(f" {r1(dx)} {r1(dy)}")  # 前导空格：防 "2.6"+"0"→"2.60" 粘连误析
        prevp = p
    d.append("z")
    prev = start

dd = "".join(d)

# ---- round-trip 验证：独立解析器回读 d → 绝对点列 → 与 simp 对账（≤0.051）----
toks = []
i = 0
while i < len(dd):
    ch = dd[i]
    if ch in "Mmz":
        toks.append(ch)
        i += 1
    elif ch in " ,":
        i += 1
    else:
        j = i
        while j < len(dd) and dd[j] not in "Mmz ,":
            j += 1
        toks.append(float(dd[i:j]))
        i = j
groups = []
for t in toks:
    if isinstance(t, str):
        groups.append((t, []))
    else:
        groups[-1][1].append(t)
cur = (0.0, 0.0)
substart = (0.0, 0.0)
rebuilt = []
for cmd, nums in groups:
    if cmd == "z":
        rebuilt[-1].append(rebuilt[-1][0])
        cur = substart
        continue
    rel = cmd == "m"
    first = True
    for k in range(0, len(nums), 2):
        v, w = nums[k], nums[k + 1]
        nx = cur[0] + v if rel else v
        ny = cur[1] + w if rel else w
        cur = (nx, ny)
        if first:
            substart = cur
            rebuilt.append([cur])
            first = False
        else:
            rebuilt[-1].append(cur)
worst = 0.0
assert len(rebuilt) == len(simp), f"contour mismatch {len(rebuilt)} vs {len(simp)}"
for rc, sc in zip(rebuilt, simp):
    if len(rc) == len(sc) + 1 and rc[-1] == rc[0]:
        rc = rc[:-1]  # z 补的闭合点
    assert len(rc) == len(sc), f"pt count {len(rc)} vs {len(sc)}"
    for (rx, ry), (sx, sy) in zip(rc, sc):
        worst = max(worst, math.hypot(rx - sx, ry - sy))
assert worst <= 0.072, f"round-trip drift {worst}"  # 0.1 取整上界 √2×0.05
print(f"# round-trip OK worst drift={worst:.3f}")
print(f"# d length = {len(dd)}")
print(dd)

# ---- 目检页：旧图标 vs 新图标，19px 实际 + 120px 放大，明暗双底 ----
old_sym = '<rect x="2.9" y="2.9" width="18.2" height="18.2" rx="5.2" stroke-width="1.7"/><path d="M7.2 6.9l1.5 1.4" stroke-width="1.55"/><path d="M5.9 11.4h3.2v5.3l1.7-1.6" stroke-width="1.55"/><path d="M11.8 6.9h6.7v10.4l-1.4-.8" stroke-width="1.55"/><path d="M13.3 10.5h3.7" stroke-width="1.55"/><path d="M13.2 13h3.3v4h-3.3z" stroke-width="1.55"/>'
new_sym = f'<rect x="2.9" y="2.9" width="18.2" height="18.2" rx="5.2" stroke-width="1.7"/><path fill="currentColor" stroke="none" d="{dd}"/>'
css = ".cs-b{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;color:#8a8f98;border-radius:12px}.cs-b svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}.big svg{width:120px;height:120px}.dark{background:#17181c;padding:14px}.light{background:#fff;padding:14px}"
cells = ""
uid = 0
for bg in ("dark", "light"):
    for cls, sym, tag in (("", old_sym, "旧-笔画近似"), ("", new_sym, "新-真字形"), ("big", old_sym, "旧-放大"), ("big", new_sym, "新-放大")):
        uid += 1
        cells += f'<div class="{bg}"><span style="font:12px sans-serif;color:#888">{bg} {tag}</span><br><span class="cs-b {cls}"><svg viewBox="0 0 24 24"><symbol id="w{uid}">{sym}</symbol><use href="#w{uid}"/></svg></span></div>'
html = f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body style="margin:0;display:flex;flex-wrap:wrap">{cells}</body></html>'
open("/tmp/word-glyph-test.html", "w").write(html)
print("# test page -> /tmp/word-glyph-test.html")
