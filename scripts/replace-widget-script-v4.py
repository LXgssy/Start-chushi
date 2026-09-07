# replace-widget-script-v4.py -- swap the <script> block of
# preset-src/smtc/music-widget.html with the v4 rewrite (DOM/CSS untouched).
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WIDGET = ROOT / "preset-src" / "smtc" / "music-widget.html"
NEW = ROOT / "scripts" / "music-widget-script-v4.js"

src = WIDGET.read_text(encoding="utf-8")
new_script = NEW.read_text(encoding="utf-8").rstrip("\n")

a = src.find("<script>")
b = src.rfind("</script>")
if a < 0 or b < 0:
    sys.exit("script block not found")

# everything before <script> must be untouched (styles + DOM contract)
head = src[:a]
assert head.count("<style>") == 1 and head.count("</style>") == 1
assert 'id="card"' in head and 'id="pB"' in head and 'id="ly"' in head

out = head + "<script>\n" + new_script + "\n" + src[b:]
WIDGET.write_text(out, encoding="utf-8")
print(f"OK: script block replaced ({len(new_script)} bytes; head {len(head)} bytes untouched)")
