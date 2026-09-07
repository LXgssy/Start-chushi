# replace-music-core-v4.py -- swap the __chushiMusicCore body in
# public/sandbox.js with the v4 rewrite (scripts/music-core-v4.js).
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SANDBOX = ROOT / "public" / "sandbox.js"
NEWCORE = ROOT / "scripts" / "music-core-v4.js"

src = SANDBOX.read_text(encoding="utf-8")
new_core = NEWCORE.read_text(encoding="utf-8").rstrip("\n")

lines = src.split("\n")
# locate boundaries
start = None
for i, ln in enumerate(lines):
    if ln.strip() == "function __chushiMusicCore(hooks) {":
        start = i
        break
if start is None:
    sys.exit("start marker not found")
end = None
for j in range(start + 1, len(lines)):
    if lines[j].strip() == "}" and lines[j].startswith("  }"):
        end = j
        break
if end is None:
    sys.exit("end marker not found")

# sanity: the tail after the closing brace should be blank + makeChushi block
tail = "\n".join(lines[end + 1 : end + 4])
assert "makeChushi" in tail, f"unexpected tail: {tail!r}"

new_lines = lines[:start] + new_core.split("\n") + lines[end + 1 :]
out = "\n".join(new_lines)

# invariants: single occurrence of the core, other content untouched count
assert out.count("function __chushiMusicCore(hooks) {") == 1
SANDBOX.write_text(out, encoding="utf-8")
print(f"OK: replaced lines {start + 1}-{end + 1} with v4 core ({len(new_core)} bytes)")
