#!/usr/bin/env python3
"""生成扫描件风格测试 PDF：文字渲染成位图（无文字层），供 OCR 冒烟"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1240, 1754  # A4 @150dpi
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)
f_big = ImageFont.load_default(size=96)
f_mid = ImageFont.load_default(size=48)

d.text((100, 160), "Hello OCR 165", font=f_big, fill=(0, 0, 0))
d.text((100, 360), "Chushi PDF Toolbox", font=f_mid, fill=(20, 20, 20))
d.text((100, 520), "The quick brown fox jumps over", font=f_mid, fill=(20, 20, 20))
d.text((100, 620), "the lazy dog 0123456789", font=f_mid, fill=(20, 20, 20))

img.save("/tmp/pdftest/scan.pdf", "PDF", resolution=150)
print("scan.pdf OK", end=" ")
import os
print(os.path.getsize("/tmp/pdftest/scan.pdf"), "bytes")
