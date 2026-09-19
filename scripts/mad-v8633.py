#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.6.33 视觉验证像素判定：MAD(A,C)≈0 磨砂复原 / MAD(A,B) 显著 zen 生效"""
import cv2
import numpy as np

A = cv2.imread("/tmp/v8633-visual/A-before-zen.png").astype(float)
B = cv2.imread("/tmp/v8633-visual/B-in-zen.png").astype(float)
C = cv2.imread("/tmp/v8633-visual/C-after-zen.png").astype(float)
h = min(A.shape[0], B.shape[0], C.shape[0])
w = min(A.shape[1], B.shape[1], C.shape[1])
mad_ac = float(np.abs(A[:h, :w] - C[:h, :w]).mean())
mad_ab = float(np.abs(A[:h, :w] - B[:h, :w]).mean())
mad_bc = float(np.abs(B[:h, :w] - C[:h, :w]).mean())
print(f"MAD(A,C)={mad_ac:.3f}  MAD(A,B)={mad_ab:.3f}  MAD(B,C)={mad_bc:.3f}")
ok = mad_ac < 2.5 and mad_ab > 5
print("FROST-ALIVE PASS" if ok else "FROST CHECK FAIL")
raise SystemExit(0 if ok else 1)
