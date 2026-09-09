import json
import sys

from PIL import Image

img = Image.open(sys.argv[1]).convert("RGB")
w, h = img.size
out = {}
for spec in sys.argv[2].split(","):
    x, label = spec.split(":")
    x = int(x)
    px = [img.getpixel((x, y)) for y in range(10, h - 10, 15)]
    out[label] = tuple(sum(c[i] for c in px) // len(px) for i in range(3))
print(json.dumps(out))
