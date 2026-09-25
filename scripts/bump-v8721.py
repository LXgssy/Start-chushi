#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.21 版本 bump 三位置 + changelog 条目"""
import io

def rep(path, old, new, tag, count=1):
    src = io.open(path, encoding="utf-8").read()
    assert src.count(old) == count, f"[{tag}] expect {count} got {src.count(old)}"
    src = src.replace(old, new)
    io.open(path, "w", encoding="utf-8").write(src)
    print(f"  ok {tag}")

# 1) build-extension.py VERSION
rep("/tmp/beta-wt/scripts/build-extension.py",
    'VERSION = "8.7.20"', 'VERSION = "8.7.21"', "VERSION")

# 2) changelog.ts 头插条目
rep("/tmp/beta-wt/src/lib/startpage/changelog.ts",
    """export const CHANGELOG: ChangelogEntry[] = [
  {""",
    """export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "8.7.21",
    date: "2026-09-25",
    title: "音乐桥抗休眠终局 + 全局歌词玻璃拉伸/切行模糊",
    channel: "shell",
    highlights: [
      "网易云最小化后控制失灵根治：音乐桥 8.4.0 音频线程心跳（页面隐藏不节流）+ 回前台即刻对拍，最小化任意时长控制/歌词零延迟",
      "全局歌词：磨砂玻璃随歌词长度平滑拉伸/收缩（视觉中心恒定），药丸与歌词态切换同动画；修复无歌词药丸态首用不居中",
      "全局歌词切行新增模糊聚拢过渡，逐句切换更柔和",
      "更新日志：滚动到顶/底不再带动背后面板，关闭重开回到上次阅读位置",
      "链接抽屉（磁贴墙）打开时墙面双击不再误触禅模式",
    ],
  },
  {""", "changelog entry")

# 3) probe-beta.mjs ZIP 路径 + 摘要串
rep("/tmp/beta-wt/scripts/probe-beta.mjs",
    'const ZIP = "/tmp/beta-wt/download/v8.7.20/ChuShi-NewTab-v8.7.20.zip";',
    'const ZIP = "/tmp/beta-wt/download/v8.7.21/ChuShi-NewTab-v8.7.21.zip";', "probe ZIP")
rep("/tmp/beta-wt/scripts/probe-beta.mjs",
    '===== v8.7.20 probe:', '===== v8.7.21 probe:', "probe summary", count=1)
print("bump-v8721 done")
