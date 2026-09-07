#!/usr/bin/env python3
"""v5 sandbox.js music surgery: replace six music sections with fresh v5 code.
Bottom-up replacement with per-boundary anchor assertions + old-symbol ban gate.
End anchors are unique content lines plus a trailing-line count."""
import re
import sys
from pathlib import Path

ROOT = Path("/home/z/my-project")
SB = ROOT / "public" / "sandbox.js"
V5 = ROOT / "scripts" / "v5"

# (name, start_needle, end_needle, extra_lines_after_end_needle, exact_end, section_file)
SECTIONS = [
    ("F",
     '    if (m.type === "smtcPush" && typeof m.scriptKey === "string") {',
     "        pc.f(m.ok === true);", 3, False, "sectionF.js"),
    ("E",
     "/* ---------- 沙箱小部件模式（?mode=widget，v1.0.7 角落磁贴 / v1.8.2 dock 弹出面板）----------",
     "}", 0, True, "sectionE.js"),
    ("D",
     "      /* ---------- SMTC 媒体作用面（v1.8.0）----------",
     "        prev: musicApi.prev,", 1, False, "sectionD.js"),
    ("C",
     "    var smtcCbs = [];",
     "    musicTargets.set(scriptKey, musicApi);", 0, False, "sectionC.js"),
    ("B",
     "  /* ============================================================",
     "  }", 0, True, "sectionB.js"),
    ("A",
     "  /** SMTC 媒体作用面（v1.8.0）：get/control 共用 pending 表（reqId 全局递增）",
     "  }", 0, True, "sectionA.js"),
]

def find_needle(lines, needle, start=0, exact=False):
    for i in range(start, len(lines)):
        if exact:
            if lines[i] == needle:
                return i
        elif needle in lines[i]:
            return i
    return -1

def main():
    lines = SB.read_text(encoding="utf-8").split("\n")

    ops = []
    for name, start_n, end_n, extra, exact_end, fname in SECTIONS:
        si = find_needle(lines, start_n)
        if si < 0:
            sys.exit(f"FAIL: section {name} start anchor not found: {start_n!r}")
        ei = find_needle(lines, end_n, start=si + 1, exact=exact_end)
        if ei < 0:
            sys.exit(f"FAIL: section {name} end anchor not found after line {si+1}: {end_n!r}")
        ei += extra
        ops.append((name, si, ei, (V5 / fname).read_text(encoding="utf-8").rstrip("\n")))

    # range sanity guards
    rng = {name: (si, ei) for name, si, ei, _ in ops}
    def slice_of(name):
        si, ei = rng[name]
        return "\n".join(lines[si:ei + 1])
    if "__chushiMusicCore(" not in slice_of("B"):
        sys.exit("FAIL: section B range does not contain old __chushiMusicCore function")
    if "function widgetShim(" not in slice_of("E"):
        sys.exit("FAIL: section E range does not contain widgetShim")
    if "smtcControlReq" not in slice_of("A"):
        sys.exit("FAIL: section A range does not contain smtcControlReq")
    if "musicApi.prev" not in slice_of("D"):
        sys.exit("FAIL: section D range does not contain chushi.music api")
    if "pc.f(m.ok === true);" not in slice_of("F"):
        sys.exit("FAIL: section F range does not contain smtcControlResult branch")
    # ordering: A < B < C < D < E < F
    order = ["A", "B", "C", "D", "E", "F"]
    starts = [rng[n][0] for n in order]
    if starts != sorted(starts):
        sys.exit(f"FAIL: section ranges not ordered: {rng}")

    for name, si, ei, newtext in sorted(ops, key=lambda x: -x[1]):
        lines[si:ei + 1] = newtext.split("\n")
        print(f"section {name}: lines {si+1}..{ei+1} replaced ({ei+1-si} -> {len(newtext.splitlines())})")

    out = "\n".join(lines)
    SB.write_text(out, encoding="utf-8")

    banned = [
        r"__chushiMusicCore\b", r"\bsmtcControlReq\b", r"\bpendingSmtc\b",
        r"\bsmtcTargets\b", r"\bsmtcLast\b", r"\bsmtcSeq\b", r"\bmusicTargets\b",
    ]
    for b in banned:
        if re.search(b, out):
            sys.exit(f"FAIL: old symbol still present after patch: {b}")
    required = ["__chushiMusicCoreV5", "mediaControlRequest", "musicCores", "pendingMedia",
                "mediaSnapCbs", "mediaLastSnap", "mediaReqSeq"]
    for r in required:
        if r not in out:
            sys.exit(f"FAIL: new symbol missing after patch: {r}")
    print("PATCH OK + symbol gates passed")

if __name__ == "__main__":
    main()
