#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.155 自绘注册表拆分：selfdraw-icons.json（15.4MB 全册）→ selfdraw/i/<key>.json ×188。

多开新标签页掉帧根修（用户实测「新建多个新标签页严重掉帧」）：
旧律 = 每个新标签页命中任一 host 即惰性 fetch 全册 15.4MB + JSON.parse 全量
（探针实测：扩展包内 fetch+text 201ms + parse 26ms/页，弱机翻倍；N 页连开 =
N×(15MB 磁盘读 + 全量 parse) 风暴 + N×(15MB 串 + 解析对象) 内存）。
新律 = 每图标一文件（[vb, body, dom] 三元组裸 JSON），加载器按磁贴 host 逐 key
按需拉取 + force-cache 长缓存；默认 6 磁贴页每页仅 ~0.4MB（≈30× 削减）。

口径：
  · 拆分是纯字节级重排，vb/body/dom 三元组内容逐字节不动（v8.7.154 锐度
    审计基线不回退）；
  · selfdraw-icons.json 从 public/ 删除（扩展包与云端快照同步瘦身；
    verify 门改查拆分文件集）；
  · 运行时版本钉 SELFDRAW_REG_VER（selfdraw-icons.ts 常量），注册表内容
    变更（加图标/改笔迹）必须同步 +1 —— force-cache 长缓存的失效通道。
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "selfdraw-icons.json"
DST_DIR = ROOT / "public" / "selfdraw" / "i"

def main() -> int:
    raw = SRC.read_bytes()
    data = json.loads(raw)
    if not isinstance(data, dict) or not data:
        print("FATAL: registry shape unexpected", file=sys.stderr)
        return 1
    DST_DIR.mkdir(parents=True, exist_ok=True)
    # 清旧文件（防上次运行的残缺 key 混入文件集）
    for old in DST_DIR.glob("*.json"):
        old.unlink()
    total = 0
    sizes = []
    for key, val in sorted(data.items()):
        if not (isinstance(val, list) and len(val) == 3):
            print(f"FATAL: {key} not a 3-tuple", file=sys.stderr)
            return 1
        vb, body, dom = val
        if not (isinstance(vb, str) and isinstance(body, str) and isinstance(dom, str)):
            print(f"FATAL: {key} tuple field type", file=sys.stderr)
            return 1
        payload = json.dumps([vb, body, dom], ensure_ascii=False, separators=(",", ":"))
        p = DST_DIR / f"{key}.json"
        p.write_text(payload, encoding="utf-8")
        n = len(payload.encode("utf-8"))
        total += n
        sizes.append((key, n))
    sizes.sort(key=lambda x: -x[1])
    print(f"split ok: {len(data)} keys -> public/selfdraw/i/")
    print(f"total body bytes: {total:,} (src {len(raw):,})")
    print("top5:", sizes[:5])
    # 删除全册（包体与云快照同步瘦身；verify 门改查文件集）
    SRC.unlink()
    print("removed public/selfdraw-icons.json")
    return 0

if __name__ == "__main__":
    sys.exit(main())
