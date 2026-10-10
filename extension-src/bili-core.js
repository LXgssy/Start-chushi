/* ============================================================================
 * 「初始」B 站完整视频下载核心库 bili-core.js（v8.7.69）
 * ----------------------------------------------------------------------------
 * 零依赖纯 JS，无 chrome API——三处共用：ext-bg.js（SW importScripts，
 * 只用 WBI 签名部分）、offscreen-bili.html（下载合并主战场）、Node 单测
 * （scripts/v8769/test-remux.mjs 直 require）。
 *
 * 三块能力：
 *   ① md5 —— WBI 签名依赖（SubtleCrypto 无 MD5，自备实现）
 *   ② BiliWbi —— WBI 签名（mixin key 置换表 + wts + w_rid，算法与
 *      bilibili-API-collect 社区共识一致，Python 侧已对公钥向量验证）
 *   ③ BiliRemux —— fMP4 → 渐进式 MP4 合并器：B 站 playurl DASH 的
 *      video.m4s + audio.m4s 都是「ftyp+moov(mvex)+moof/mdat×N」的
 *      分片 MP4（单轨），本器抽轨采样 → 重建 stbl（stts/ctts/stsc/stsz/
 *      stco/stss）→ 输出单文件双轨渐进 MP4，免 ffmpeg 免本地程序
 *      （对齐 GD3 bili_pack 的产物形态，但全程在浏览器里完成）。
 * ==========================================================================*/

/* ---------------- ① md5（hex 输出） ---------------- */
/* 标准实现：小端字长、四轮（FF/GG/HH/II）、K/位移双表。 */
var BiliMd5 = (function () {
  var S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  var K = new Int32Array(64);
  for (var i = 0; i < 64; i++) {
    K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) | 0;
  }
  function rotl(x, c) { return (x << c) | (x >>> (32 - c)); }
  function hex(x) {
    var s = "";
    for (var i = 0; i < 4; i++)
      s += ((x >>> (i * 8 + 4)) & 15).toString(16) + ((x >>> (i * 8)) & 15).toString(16);
    return s;
  }
  /* bytes: Uint8Array → hex string */
  function md5(bytes) {
    var len = bytes.length;
    var withPad = (((len + 8) >> 6) + 1) << 6;
    var m = new Uint8Array(withPad);
    m.set(bytes);
    m[len] = 0x80;
    var bitLen = len * 8;
    var dv = new DataView(m.buffer);
    dv.setUint32(withPad - 8, bitLen >>> 0, true);
    dv.setUint32(withPad - 4, Math.floor(bitLen / 4294967296), true);
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (var chunk = 0; chunk < withPad; chunk += 64) {
      var M = new Int32Array(16);
      for (var j = 0; j < 16; j++) M[j] = dv.getInt32(chunk + j * 4, true);
      var A = a0, B = b0, C = c0, D = d0;
      for (var k = 0; k < 64; k++) {
        var F, g;
        if (k < 16) { F = (B & C) | (~B & D); g = k; }
        else if (k < 32) { F = (D & B) | (~D & C); g = (5 * k + 1) & 15; }
        else if (k < 48) { F = B ^ C ^ D; g = (3 * k + 5) & 15; }
        else { F = C ^ (B | ~D); g = (7 * k) & 15; }
        F = (F + A + K[k] + M[g]) | 0;
        A = D; D = C; C = B;
        B = (B + rotl(F, S[k])) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    return hex(a0) + hex(b0) + hex(c0) + hex(d0);
  }
  /* ASCII 字符串便捷（WBI 参数经 encodeURIComponent 后纯 ASCII） */
  function md5Str(s) {
    var u8 = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 255;
    return md5(u8);
  }
  return { md5: md5, md5Str: md5Str };
})();

/* ---------------- ② WBI 签名 ---------------- */
var BiliWbi = (function () {
  /* 64→32 置换表（社区共识固定表） */
  var TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
  ];
  function mixinKey(imgKey, subKey) {
    var raw = imgKey + subKey;
    var out = "";
    for (var i = 0; i < TAB.length; i++) out += raw.charAt(TAB[i]);
    return out;
  }
  /* 从 nav 响应 data 提取双 key */
  function keysFromNav(navData) {
    var w = navData && navData.wbi_img;
    if (!w || !w.img_url || !w.sub_url) return null;
    var img = w.img_url.split("/").pop().split(".")[0];
    var sub = w.sub_url.split("/").pop().split(".")[0];
    if (!img || !sub) return null;
    return { img: img, sub: sub, mixin: mixinKey(img, sub) };
  }
  /* params: 平面对象 → 追加 wts/w_rid 后返回 query 串
     规则：值过滤 !'()*；键排序；encodeURIComponent；md5(qs + mixinKey) */
  function sign(params, mixin) {
    var p = {};
    for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    p.wts = Math.floor(Date.now() / 1000);
    var keys = Object.keys(p).sort();
    var qs = keys
      .map(function (key) {
        var v = String(p[key]).replace(/[!'()*]/g, "");
        return encodeURIComponent(key) + "=" + encodeURIComponent(v);
      })
      .join("&");
    var wRid = BiliMd5.md5Str(qs + mixin);
    return qs + "&w_rid=" + wRid;
  }
  return { mixinKey: mixinKey, keysFromNav: keysFromNav, sign: sign };
})();

/* ---------------- ③ fMP4 → 渐进式 MP4 合并器 ---------------- */
var BiliRemux = (function () {
  "use strict";

  /* ---- 读原语 ---- */
  function u32(v, o) { return ((v[o] << 24) | (v[o + 1] << 16) | (v[o + 2] << 8) | v[o + 3]) >>> 0; }
  function i32(v, o) { return (v[o] << 24) | (v[o + 1] << 16) | (v[o + 2] << 8) | v[o + 3]; }
  function u16(v, o) { return (v[o] << 8) | v[o + 1]; }
  function type4(v, o) { return String.fromCharCode(v[o], v[o + 1], v[o + 2], v[o + 3]); }
  function u64(v, o) { return u32(v, o) * 4294967296 + u32(v, o + 4); }

  /* 盒遍历：cb(type, boxStart, hdrLen, boxSize, payloadStart) */
  function walkBoxes(v, start, end, cb) {
    var o = start;
    while (o + 8 <= end) {
      var size = u32(v, o);
      var type = type4(v, o + 4);
      var hdr = 8;
      if (size === 1) { size = u64(v, o + 8); hdr = 16; }
      else if (size === 0) { size = end - o; }
      if (size < hdr || o + size > end) return false;
      cb(type, o, hdr, size, o + hdr);
      o += size;
    }
    return o === end;
  }

  /* ---- fMP4 单轨抽取 ----
     返回 {handler, timescale, duration, codecEntry, codec, width, height,
           samples:[{off,size,duration,cts,flags}], firstDts, sampleCount} */
  function extractTrack(buf) {
    var v = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var info = {
      handler: "", timescale: 0, duration: 0,
      codecEntry: null, codec: "", codecType4: "", width: 0, height: 0,
      samples: [], firstDts: -1, sampleCount: 0,
      trex: null, trackId: 0,
    };
    var frags = info.__frags = [];
    var moovParsed = false;
    var curFrag = null;

    function parseMoov(moovPayloadStart, moovEnd) {
      walkBoxes(v, moovPayloadStart, moovEnd, function (t, s, h, z, p) {
        if (t === "mvex") {
          walkBoxes(v, p, s + z, function (t2, s2, h2, z2, p2) {
            if (t2 !== "trex") return;
            info.trackId = u32(v, p2 + 4);
            info.trex = {
              defaultSampleDuration: u32(v, p2 + 12),
              defaultSampleSize: u32(v, p2 + 16),
              defaultSampleFlags: u32(v, p2 + 20),
            };
          });
          return;
        }
        if (t !== "trak" || info.timescale) return; /* 只取第一轨 */
        var tkhdW = 0, tkhdH = 0, trackId = 0;
        var timescale = 0, duration = 0, hdlr = "", stsdEntry = null;
        walkBoxes(v, p, s + z, function (t3, s3, h3, z3, p3) {
          if (t3 === "tkhd") {
            var ver = v[p3];
            var base = ver === 0 ? 12 : 20; /* ver/flags + creation/modification(4|8×2) */
            trackId = u32(v, p3 + base);
            tkhdW = u32(v, s3 + z3 - 8) / 65536;
            tkhdH = u32(v, s3 + z3 - 4) / 65536;
          } else if (t3 === "mdia") {
            walkBoxes(v, p3, s3 + z3, function (t4, s4, h4, z4, p4) {
              if (t4 === "mdhd") {
                var ver4 = v[p4];
                var off4 = p4 + 4 + (ver4 === 0 ? 8 : 16);
                timescale = u32(v, off4);
                duration = u32(v, off4 + 4);
              } else if (t4 === "hdlr") {
                hdlr = type4(v, p4 + 8); /* pre_defined(4) + handler_type(4) */
              } else if (t4 === "minf") {
                walkBoxes(v, p4, s4 + z4, function (t5, s5, h5, z5, p5) {
                  if (t5 !== "stbl") return;
                  walkBoxes(v, p5, s5 + z5, function (t6, s6, h6, z6, p6) {
                    if (t6 !== "stsd") return;
                    if (u32(v, p6 + 4) > 0) {
                      var eStart = p6 + 8;
                      var eSize = u32(v, eStart);
                      stsdEntry = v.slice(eStart, eStart + eSize);
                    }
                  });
                });
              }
            });
          }
        });
        if (timescale && hdlr && stsdEntry) {
          info.handler = hdlr;
          info.timescale = timescale;
          info.duration = duration;
          info.codecEntry = stsdEntry;
          info.width = tkhdW; info.height = tkhdH;
          info.trackId = trackId || 1;
          info.codecType4 = type4(stsdEntry, 4);
          var ct = info.codecType4;
          info.codec = ct === "avc1" || ct === "avc3" ? "avc"
            : ct === "hev1" || ct === "hvc1" ? "hevc"
              : ct === "mp4a" ? "aac"
                : ct === "fLaC" ? "flac" : ct;
        }
      });
    }

    walkBoxes(v, 0, v.length, function (t, s, h, z, p) {
      if (t === "moov" && !moovParsed) {
        parseMoov(p, s + z);
        moovParsed = true;
      } else if (t === "moof") {
        curFrag = { moofStart: s, mdatPayloadStart: -1, mdatPayloadEnd: -1, trafs: [] };
        walkBoxes(v, p, s + z, function (t2, s2, h2, z2, p2) {
          if (t2 !== "traf") return;
          var traf = {
            trackId: 0, baseDataOffset: -1, defaultBaseIsMoof: false,
            defaultDur: 0, defaultSize: 0, defaultFlags: 0,
            baseMediaDecodeTime: 0, runs: [],
          };
          walkBoxes(v, p2, s2 + z2, function (t3, s3, h3, z3, p3) {
            if (t3 === "tfhd") {
              var fl = u32(v, p3) & 0xffffff;
              var o = p3 + 4;
              traf.trackId = u32(v, o); o += 4;
              if (fl & 0x01) { traf.baseDataOffset = u64(v, o); o += 8; }
              if (fl & 0x02) o += 4;
              if (fl & 0x08) { traf.defaultDur = u32(v, o); o += 4; }
              if (fl & 0x10) { traf.defaultSize = u32(v, o); o += 4; }
              if (fl & 0x20) { traf.defaultFlags = u32(v, o); o += 4; }
              traf.defaultBaseIsMoof = !!(fl & 0x020000);
            } else if (t3 === "tfdt") {
              traf.baseMediaDecodeTime = v[p3] === 0 ? u32(v, p3 + 4) : u64(v, p3 + 4);
            } else if (t3 === "trun") {
              var ver5 = v[p3];
              var fl5 = u32(v, p3) & 0xffffff;
              var cnt = u32(v, p3 + 4); /* ISO 14496-12 §8.8.8: sample_count u32 */
              var o5 = p3 + 8;
              var run = {
                count: cnt, dataOffset: -1, firstFlags: -1,
                hasDur: !!(fl5 & 0x100), hasSize: !!(fl5 & 0x200),
                hasFlags: !!(fl5 & 0x400), hasCts: !!(fl5 & 0x800),
                ctsSigned: ver5 === 0, durs: [], sizes: [], flags: [], cts: [],
              };
              if (fl5 & 0x01) { run.dataOffset = i32(v, o5); o5 += 4; }
              if (fl5 & 0x04) { run.firstFlags = u32(v, o5); o5 += 4; }
              for (var si = 0; si < cnt; si++) {
                if (run.hasDur) { run.durs.push(u32(v, o5)); o5 += 4; }
                if (run.hasSize) { run.sizes.push(u32(v, o5)); o5 += 4; }
                if (run.hasFlags) { run.flags.push(u32(v, o5)); o5 += 4; }
                if (run.hasCts) {
                  run.cts.push(run.ctsSigned ? i32(v, o5) : u32(v, o5));
                  o5 += 4;
                }
              }
              traf.runs.push(run);
            }
          });
          if (curFrag) curFrag.trafs.push(traf);
        });
      } else if (t === "mdat") {
        if (curFrag) {
          curFrag.mdatPayloadStart = p;
          curFrag.mdatPayloadEnd = s + z;
          frags.push(curFrag);
          curFrag = null;
        }
      }
    });
    if (!info.timescale) return null;

    /* ---- 展开采样（绝对偏移，零拷贝 subarray 待后续整块搬运） ----
       基址解析律（ISO 14496-12）：tfhd base-data-offset 显式 > default-base-is-moof
       > 当前 mdat 载荷起点（单 moof 单 mdat 的 B 站/ffmpeg 布局下等价流式基址） */
    var dts = 0, haveDts = false;
    for (var fi = 0; fi < frags.length; fi++) {
      var fr = frags[fi];
      var trafSel = null;
      for (var ti = 0; ti < fr.trafs.length; ti++)
        if (fr.trafs[ti].trackId === info.trackId) { trafSel = fr.trafs[ti]; break; }
      if (!trafSel) trafSel = fr.trafs[0];
      if (!trafSel || fr.mdatPayloadStart < 0) continue;
      var base = trafSel.baseDataOffset >= 0
        ? trafSel.baseDataOffset
        : trafSel.defaultBaseIsMoof ? fr.moofStart : fr.mdatPayloadStart;
      var trex = info.trex;
      var defDur = trafSel.defaultDur || (trex && trex.defaultSampleDuration) || 0;
      var defSize = trafSel.defaultSize || (trex && trex.defaultSampleSize) || 0;
      var defFlags = trafSel.defaultFlags || (trex && trex.defaultSampleFlags) || 0x02000000;
      var fragDts = trafSel.baseMediaDecodeTime;
      for (var ri = 0; ri < trafSel.runs.length; ri++) {
        var run = trafSel.runs[ri];
        var cursor = run.dataOffset >= 0 ? base + run.dataOffset : base;
        var fc = run.firstFlags >= 0 ? run.firstFlags : defFlags;
        for (var si2 = 0; si2 < run.count; si2++) {
          var dur2 = run.hasDur ? run.durs[si2] : defDur;
          var size2 = run.hasSize ? run.sizes[si2] : defSize;
          if (!size2) break; /* 无尺寸可依：截断（坏流保护） */
          var flags2 = (si2 === 0 && run.firstFlags >= 0 ? fc : (run.hasFlags ? run.flags[si2] : defFlags)) >>> 0;
          var cts2 = run.hasCts ? run.cts[si2] : 0;
          if (!haveDts) { info.firstDts = fragDts; haveDts = true; }
          info.samples.push({ off: cursor, size: size2, duration: dur2 || 1, cts: cts2, flags: flags2 });
          cursor += size2;
          info.sampleCount++;
        }
      }
      dts = fragDts;
    }
    if (!haveDts) info.firstDts = 0;
    delete info.__frags;
    return info;
  }

  /* ---- 写原语 ---- */
  function Writer(size) {
    this.v = new Uint8Array(Math.max(64, size));
    this.o = 0;
  }
  function ensure(w, need) {
    if (w.o + need <= w.v.length) return;
    var n = Math.max(w.v.length * 2, w.o + need);
    var nv = new Uint8Array(n);
    nv.set(w.v);
    w.v = nv;
  }
  Writer.prototype.u8 = function (x) { this.v[this.o++] = x & 255; return this; };
  Writer.prototype.u16 = function (x) { this.v[this.o++] = (x >> 8) & 255; this.v[this.o++] = x & 255; return this; };
  Writer.prototype.u32 = function (x) {
    x = x >>> 0; var v = this.v;
    v[this.o++] = (x >>> 24) & 255; v[this.o++] = (x >>> 16) & 255;
    v[this.o++] = (x >>> 8) & 255; v[this.o++] = x & 255;
    return this;
  };
  Writer.prototype.i32 = function (x) { return this.u32(x | 0); };
  Writer.prototype.str = function (s) {
    for (var i = 0; i < s.length; i++) this.v[this.o++] = s.charCodeAt(i) & 255;
    return this;
  };
  Writer.prototype.zeros = function (n) { for (var i = 0; i < n; i++) this.v[this.o++] = 0; return this; };
  Writer.prototype.bytes = function (arr) { this.v.set(arr, this.o); this.o += arr.length; return this; };
  /* 回填 size + 写 type（size 用当前 o - boxStart） */
  Writer.prototype.seal = function (boxStart, type) {
    var sz = this.o - boxStart;
    var v = this.v;
    v[boxStart] = (sz >>> 24) & 255; v[boxStart + 1] = (sz >>> 16) & 255;
    v[boxStart + 2] = (sz >>> 8) & 255; v[boxStart + 3] = sz & 255;
    for (var i = 0; i < 4; i++) v[boxStart + 4 + i] = type.charCodeAt(i) & 255;
    return this;
  };
  /* 每个 write 前自动扩容（包装原方法） */
  (function () {
    var names = ["u8", "u16", "u32", "i32", "zeros"];
    for (var i = 0; i < names.length; i++) {
      (function (nm) {
        var orig = Writer.prototype[nm];
        Writer.prototype[nm] = function (n) { ensure(this, nm === "zeros" ? n : 4); return orig.call(this, n); };
      })(names[i]);
    }
    var origBytes = Writer.prototype.bytes;
    Writer.prototype.bytes = function (a) { ensure(this, a.length); return origBytes.call(this, a); };
    var origStr = Writer.prototype.str;
    Writer.prototype.str = function (s) { ensure(this, s.length); return origStr.call(this, s); };
  })();

  function fullBox(w, type, version, flags) {
    w.u32(0); w.str(type);
    w.u8(version);
    w.u8((flags >> 16) & 255); w.u8((flags >> 8) & 255); w.u8(flags & 255);
  }

  /* ---- 统计量：DTS 序列 / 同步帧表 / ctts 需求 ---- */
  function trackStats(tr) {
    var dts = tr.firstDts || 0;
    var totalDur = 0;
    var syncs = [];
    var needCtts = false;
    for (var i = 0; i < tr.samples.length; i++) {
      var s = tr.samples[i];
      s.dts = dts;
      dts += s.duration;
      totalDur += s.duration;
      if (tr.handler === "vide" && ((s.flags >>> 16) & 1) === 0) syncs.push(i + 1);
      if (s.cts) needCtts = true;
    }
    tr.trackDuration = totalDur;
    tr.syncs = syncs;
    tr.needCtts = needCtts;
    return tr;
  }

  function sttsEntries(tr) {
    var out = [], prev = -1, cnt = 0;
    for (var i = 0; i < tr.samples.length; i++) {
      var d = tr.samples[i].duration;
      if (d === prev) cnt++;
      else { if (prev >= 0) out.push([cnt, prev]); prev = d; cnt = 1; }
    }
    if (prev >= 0) out.push([cnt, prev]);
    return out;
  }
  function cttsEntries(tr) {
    var out = [], prev = null, cnt = 0;
    for (var i = 0; i < tr.samples.length; i++) {
      var c = tr.samples[i].cts | 0;
      if (prev !== null && c === prev) cnt++;
      else { if (prev !== null) out.push([cnt, prev]); prev = c; cnt = 1; }
    }
    if (prev !== null) out.push([cnt, prev]);
    return out;
  }

  function buildTrak(w, tr, movieTimescale, chunkOffset) {
    var b = w.o;
    w.u32(0); w.str("trak");
    /* tkhd v0 flags=7（enabled+in_movie+in_preview） */
    var tk = w.o;
    w.u32(0); w.str("tkhd"); w.u8(0); w.u8(0); w.u8(0); w.u8(7); /* v0 flags=7 */
    w.u32(0); w.u32(0);                 /* creation / modification */
    w.u32(tr.trackNo);
    w.u32(0);                           /* reserved */
    w.u32(Math.round((tr.trackDuration / tr.timescale) * movieTimescale));
    w.u32(0); w.u32(0);                 /* reserved ×2 */
    w.u16(0);                           /* layer */
    w.u16(tr.handler === "soun" ? 0x0100 : 0);
    w.u16(0);                           /* alternate_group 恒 0（reserved 位） */
    w.zeros(2);                         /* reserved */
    w.u32(0x10000); w.u32(0); w.u32(0); /* matrix identity */
    w.u32(0); w.u32(0x10000); w.u32(0);
    w.u32(0); w.u32(0); w.u32(0x40000000);
    w.u32(Math.round(tr.width * 65536));
    w.u32(Math.round(tr.height * 65536));
    w.seal(tk, "tkhd");
    /* edts/elst v1：仅首 DTS>0 时把媒体时间归零 */
    if ((tr.firstDts || 0) > 0) {
      var ed = w.o; w.u32(0); w.str("edts");
      var el = w.o;
      fullBox(w, "elst", 1, 0);
      w.u32(1);
      w.u32(0); w.u32(Math.round((tr.trackDuration / tr.timescale) * movieTimescale) >>> 0); /* segment_duration u64（高 0） */
      var mt = tr.firstDts | 0;
      if (mt < 0) w.u32(0xffffffff); else w.u32(0);
      w.u32(mt >>> 0);                 /* media_time s64 */
      w.u16(1); w.u16(0);              /* media_rate 1.0 */
      w.seal(el, "elst");
      w.seal(ed, "edts");
    }
    /* mdia */
    var md = w.o; w.u32(0); w.str("mdia");
    var mh = w.o;
    w.u32(0); w.str("mdhd"); w.u8(0); w.zeros(3); /* v0 flags=0 */
    w.u32(0); w.u32(0);
    w.u32(tr.timescale);
    w.u32(tr.trackDuration);
    w.u16(0x55c4); w.u16(0);           /* language und */
    w.seal(mh, "mdhd");
    var hd = w.o;
    w.u32(0); w.str("hdlr"); w.u32(0); /* ver/flags */
    w.u32(0);                          /* pre_defined */
    w.str(tr.handler);                 /* handler_type */
    w.zeros(12);                       /* reserved */
    w.str("\0");                       /* name 空串 */
    w.seal(hd, "hdlr");
    /* minf */
    var mi = w.o; w.u32(0); w.str("minf");
    if (tr.handler === "vide") {
      var vm = w.o; fullBox(w, "vmhd", 0, 1); w.u16(0); w.u16(0); w.u16(0); w.u16(0); w.seal(vm, "vmhd");
    } else {
      var sm = w.o; fullBox(w, "smhd", 0, 0); w.u16(0); w.u16(0); w.seal(sm, "smhd");
    }
    var di = w.o; w.u32(0); w.str("dinf");
    var dr = w.o; fullBox(w, "dref", 0, 0); w.u32(1);
    var ur = w.o; w.u32(12); w.str("url "); w.u8(0); w.u32(1);
    w.seal(ur, "url ");
    w.seal(dr, "dref");
    w.seal(di, "dinf");
    /* stbl */
    var st = w.o; w.u32(0); w.str("stbl");
    /* stsd：源样本条目原样搬运（avcC/hvcC/esds/dfla 全在里头） */
    var sd = w.o;
    fullBox(w, "stsd", 0, 0);
    w.u32(1);
    w.bytes(tr.codecEntry);
    w.seal(sd, "stsd");
    /* stts */
    var se = sttsEntries(tr);
    var tt = w.o; fullBox(w, "stts", 0, 0); w.u32(se.length);
    for (var i = 0; i < se.length; i++) { w.u32(se[i][0]); w.u32(se[i][1]); }
    w.seal(tt, "stts");
    /* ctts v0（有合成偏移/B 帧时；B 站 trun v0 给符号偏移） */
    if (tr.needCtts) {
      var ce = cttsEntries(tr);
      var ct2 = w.o; fullBox(w, "ctts", 0, 0); w.u32(ce.length);
      for (var i2 = 0; i2 < ce.length; i2++) { w.u32(ce[i2][0]); w.i32(ce[i2][1]); }
      w.seal(ct2, "ctts");
    }
    /* stsc：单 chunk 全样本 */
    var sc = w.o; fullBox(w, "stsc", 0, 0);
    w.u32(1); w.u32(1); w.u32(tr.samples.length); w.u32(1);
    w.seal(sc, "stsc");
    /* stsz */
    var sz = w.o; fullBox(w, "stsz", 0, 0);
    w.u32(0); w.u32(tr.samples.length);
    for (var i3 = 0; i3 < tr.samples.length; i3++) w.u32(tr.samples[i3].size);
    w.seal(sz, "stsz");
    /* stco */
    var co = w.o; fullBox(w, "stco", 0, 0);
    w.u32(1); w.u32(chunkOffset);
    w.seal(co, "stco");
    /* stss（视频非全同步时） */
    if (tr.handler === "vide" && tr.syncs.length && tr.syncs.length < tr.samples.length) {
      var ss = w.o; fullBox(w, "stss", 0, 0);
      w.u32(tr.syncs.length);
      for (var i4 = 0; i4 < tr.syncs.length; i4++) w.u32(tr.syncs[i4]);
      w.seal(ss, "stss");
    }
    w.seal(st, "stbl");
    w.seal(mi, "minf");
    w.seal(md, "mdia");
    w.seal(b, "trak");
  }

  function buildMoov(w, tracks, movieTimescale, movieDur, chunkOffsets) {
    var b = w.o;
    w.u32(0); w.str("moov");
    var mv = w.o;
    fullBox(w, "mvhd", 0, 0);
    w.u32(0); w.u32(0);
    w.u32(movieTimescale);
    w.u32(movieDur);
    w.u32(0x00010000);
    w.u16(0x0100);
    w.u16(0); w.u32(0); w.u32(0);
    w.u32(0x10000); w.u32(0); w.u32(0);
    w.u32(0); w.u32(0x10000); w.u32(0);
    w.u32(0); w.u32(0); w.u32(0x40000000);
    w.u32(tracks.length + 1);
    w.seal(mv, "mvhd");
    for (var i = 0; i < tracks.length; i++) {
      var tr = tracks[i];
      buildTrak(w, tr, movieTimescale, chunkOffsets[tr.handler === "vide" ? "video" : "audio"]);
    }
    w.seal(b, "moov");
  }

  function sumSizes(samples) {
    var s = 0;
    for (var i = 0; i < samples.length; i++) s += samples[i].size;
    return s;
  }
  function copySamples(w, tr) {
    var src = tr._src;
    for (var i = 0; i < tr.samples.length; i++) {
      var s = tr.samples[i];
      w.v.set(src.subarray(s.off, s.off + s.size), w.o);
      w.o += s.size;
    }
  }

  /* 主入口：mux(videoTr|null, audioTr|null) → Uint8Array（渐进 MP4） */
  function mux(videoTr, audioTr) {
    var tracks = [];
    if (videoTr) tracks.push(videoTr);
    if (audioTr) tracks.push(audioTr);
    if (!tracks.length) throw new Error("no-tracks");
    for (var i = 0; i < tracks.length; i++) {
      trackStats(tracks[i]);
      tracks[i].trackNo = i + 1;
    }
    var movieTimescale = 1000;
    var movieDur = 0;
    for (var i2 = 0; i2 < tracks.length; i2++) {
      var d = Math.round((tracks[i2].trackDuration / tracks[i2].timescale) * movieTimescale);
      if (d > movieDur) movieDur = d;
    }
    var payloadVideo = videoTr ? sumSizes(videoTr.samples) : 0;
    var payloadAudio = audioTr ? sumSizes(audioTr.samples) : 0;
    var ftypSize = 28; /* size+type(8)+minor(4)+brands×4(16) */

    /* 尺寸预算：stco 内嵌 offset 与真实值同宽（4B），moov 大小与 chunkOffset 无关 */
    var probe = new Writer(1 << 20);
    buildMoov(probe, tracks, movieTimescale, movieDur, { video: 0, audio: 0 });
    var moovSize = probe.o;

    var videoOff = ftypSize + moovSize + 8;
    var audioOff = videoOff + payloadVideo;
    var total = ftypSize + moovSize + 8 + payloadVideo + payloadAudio;

    var out = new Writer(total);
    out.u32(ftypSize); out.str("ftyp"); out.u32(0x00200000);
    out.str("isom"); out.str("iso2");
    out.str(videoTr && videoTr.codec === "hevc" ? "hev1" : "avc1"); out.str("mp41");
    buildMoov(out, tracks, movieTimescale, movieDur, { video: videoOff, audio: audioOff });
    if (out.o !== ftypSize + moovSize) throw new Error("moov-size-drift:" + out.o + "/" + (ftypSize + moovSize));
    out.u32(8 + payloadVideo + payloadAudio); out.str("mdat");
    if (videoTr) copySamples(out, videoTr);
    if (audioTr) copySamples(out, audioTr);
    if (out.o !== total) throw new Error("total-size-drift");
    return out.v;
  }

  /* 高层便捷：remuxBuffers(videoBuf|null, audioBuf|null) → Uint8Array */
  function remuxBuffers(videoBuf, audioBuf) {
    var vt = videoBuf ? extractTrack(videoBuf) : null;
    var at = audioBuf ? extractTrack(audioBuf) : null;
    if (vt && vt.handler !== "vide" && at && at.handler === "vide") {
      var t = vt; vt = at; at = t;
    }
    if (!vt && !at) throw new Error("no-tracks");
    if (vt) vt._src = videoBuf instanceof Uint8Array ? videoBuf : new Uint8Array(videoBuf);
    if (at) at._src = audioBuf instanceof Uint8Array ? audioBuf : new Uint8Array(audioBuf);
    return { bytes: mux(vt, at), video: vt, audio: at };
  }

  /* ========================================================================
   * v8.7.71 渐进 MP4（stbl 表）轨道抽取——YouTube 移植（Ghost Downloader
   * 的 YouTube 下载能力对齐：自适应分流下载 + 浏览器内合并）。
   * YouTube 的 progressive/adaptive MP4 是常规 ISO 布局：moov/stbl 表驱动
   * （stts/ctts/stsc/stsz/stco 展开），无 moof/trun 分片。本抽取器产出与
   * extractTrack（fMP4）完全同形的 track，直接进 mux 合并。
   * flags 语义对齐律：trackStats 以 bit16 判同步（0=sync）——视频按 stss
   * 标注（sync 0x02000000 / 非同步 0x01010000），音频全同步。
   * ====================================================================== */
  function findBox(v, start, end, type) {
    var hit = null;
    walkBoxes(v, start, end, function (t, s, h, z, p) {
      if (t === type && !hit) hit = { start: s, size: z, payload: p };
    });
    return hit;
  }
  function extractTracksStbl(buf) {
    var v = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var moov = findBox(v, 0, v.length, "moov");
    if (!moov) return [];
    var tracks = [];
    walkBoxes(v, moov.payload, moov.start + moov.size, function (t, s, h, z, p) {
      if (t !== "trak") return;
      var tr = {
        handler: "", timescale: 0, duration: 0, codecEntry: null, codec: "",
        codecType4: "", width: 0, height: 0, samples: [], firstDts: 0,
        sampleCount: 0, trackId: 0,
      };
      /* tkhd：track id + 宽高 */
      var tkhd = findBox(v, p, s + z, "tkhd");
      if (tkhd) {
        var ver = v[tkhd.payload];
        var base = tkhd.payload + 4 + (ver === 0 ? 8 : 16);
        tr.trackId = u32(v, base);
        tr.width = u32(v, tkhd.start + tkhd.size - 8) / 65536;
        tr.height = u32(v, tkhd.start + tkhd.size - 4) / 65536;
      }
      /* edts/elst：首条目 media_time 归零位（YouTube AAC priming 裁剪） */
      var edts = findBox(v, p, s + z, "edts");
      if (edts) {
        var elst = findBox(v, edts.payload, edts.start + edts.size, "elst");
        if (elst) {
          var ev = v[elst.payload];
          var eo = elst.payload + 8; /* ver/flags(4) + entry_count(4) */
          if (ev === 0) tr.firstDts = i32(v, eo + 4);
          else if (ev === 1) {
            /* v1：segment_duration u64(eo..eo+8) + media_time i64(eo+8..eo+16)；
               取值在 2^31 内时用低 32 位，高位非零视为异常归零 */
            tr.firstDts = u32(v, eo + 8) === 0 ? i32(v, eo + 12) : 0;
          }
        }
      }
      /* mdia */
      var mdia = findBox(v, p, s + z, "mdia");
      if (!mdia) return;
      var mdhd = findBox(v, mdia.payload, mdia.start + mdia.size, "mdhd");
      if (mdhd) {
        var mv = v[mdhd.payload];
        var mo = mdhd.payload + 4 + (mv === 0 ? 8 : 16);
        tr.timescale = u32(v, mo);
        tr.duration = mv === 0 ? u32(v, mo + 4) : u64(v, mo + 4);
      }
      var hdlr = findBox(v, mdia.payload, mdia.start + mdia.size, "hdlr");
      if (hdlr) tr.handler = type4(v, hdlr.payload + 8);
      var minf = findBox(v, mdia.payload, mdia.start + mdia.size, "minf");
      var stbl = minf ? findBox(v, minf.payload, minf.start + minf.size, "stbl") : null;
      if (!stbl) return;
      var s0 = stbl.payload, s1 = stbl.start + stbl.size;
      /* stsd：样本条目原样搬运（avcC/esds 全在里头） */
      var stsd = findBox(v, s0, s1, "stsd");
      if (stsd && u32(v, stsd.payload + 4) > 0) {
        var eStart = stsd.payload + 8;
        var eSize = u32(v, eStart);
        tr.codecEntry = v.slice(eStart, eStart + eSize);
        tr.codecType4 = type4(tr.codecEntry, 4);
        var ct = tr.codecType4;
        tr.codec = ct === "avc1" || ct === "avc3" ? "avc"
          : ct === "hev1" || ct === "hvc1" ? "hevc"
            : ct === "mp4a" ? "aac" : ct;
      }
      /* stts → 每采样时长 */
      var stts = findBox(v, s0, s1, "stts");
      var durs = [];
      if (stts) {
        var n1 = u32(v, stts.payload + 4);
        for (var i = 0; i < n1; i++) {
          var c1 = u32(v, stts.payload + 8 + i * 8);
          var d1 = u32(v, stts.payload + 12 + i * 8);
          for (var j = 0; j < c1; j++) durs.push(d1);
        }
      }
      /* ctts → 每采样合成偏移（v0 无符号 / v1 有符号） */
      var cttsMap = null;
      var ctts = findBox(v, s0, s1, "ctts");
      if (ctts) {
        var cv = v[ctts.payload];
        var n2 = u32(v, ctts.payload + 4);
        cttsMap = [];
        var idx = 0;
        for (var i2 = 0; i2 < n2; i2++) {
          var c2 = u32(v, ctts.payload + 8 + i2 * 8);
          var o2 = cv === 0 ? u32(v, ctts.payload + 12 + i2 * 8) : i32(v, ctts.payload + 12 + i2 * 8);
          for (var j2 = 0; j2 < c2; j2++) cttsMap[idx++] = o2;
        }
      }
      /* stss → 同步帧（1-based 采样号） */
      var syncSet = null;
      var stss = findBox(v, s0, s1, "stss");
      if (stss) {
        syncSet = {};
        var n3 = u32(v, stss.payload + 4);
        for (var i3 = 0; i3 < n3; i3++) syncSet[u32(v, stss.payload + 8 + i3 * 4)] = true;
      }
      /* stsz → 每采样尺寸（固定/变长两态） */
      var stsz = findBox(v, s0, s1, "stsz");
      if (!stsz) return;
      var fixedSize = u32(v, stsz.payload + 4);
      var count = u32(v, stsz.payload + 8);
      var sizes = [];
      if (fixedSize) { for (var i4 = 0; i4 < count; i4++) sizes.push(fixedSize); }
      else { for (var i5 = 0; i5 < count; i5++) sizes.push(u32(v, stsz.payload + 12 + i5 * 4)); }
      /* stsc → 每 chunk 采样数 */
      var stsc = findBox(v, s0, s1, "stsc");
      if (!stsc) return;
      var n4 = u32(v, stsc.payload + 4);
      var scRuns = [];
      for (var i6 = 0; i6 < n4; i6++) {
        scRuns.push({
          first: u32(v, stsc.payload + 8 + i6 * 12),
          perChunk: u32(v, stsc.payload + 12 + i6 * 12),
        });
      }
      /* stco/co64 → chunk 绝对偏移 */
      var stco = findBox(v, s0, s1, "stco");
      var co64 = stco ? null : findBox(v, s0, s1, "co64");
      if (!stco && !co64) return;
      var nChunks = u32(v, (stco || co64).payload + 4);
      var chunkOffs = [];
      for (var i7 = 0; i7 < nChunks; i7++) {
        chunkOffs.push(stco ? u32(v, stco.payload + 8 + i7 * 4)
          : u64(v, co64.payload + 8 + i7 * 8));
      }
      /* 展开：chunk × (stsc 段内 perChunk) × stsz，绝对偏移累计 */
      var si = 0;
      var isVideo = tr.handler === "vide";
      for (var ci = 0; ci < nChunks && si < count; ci++) {
        var per = 0;
        for (var ri = scRuns.length - 1; ri >= 0; ri--) {
          if (ci + 1 >= scRuns[ri].first) { per = scRuns[ri].perChunk; break; }
        }
        var cursor = chunkOffs[ci];
        for (var k = 0; k < per && si < count; k++) {
          var sz2 = sizes[si];
          if (!sz2) break;
          var fl = 0x02000000; /* 默认同步 */
          if (isVideo && syncSet && !syncSet[si + 1]) fl = 0x01010000;
          tr.samples.push({
            off: cursor, size: sz2,
            duration: durs[si] || 1,
            cts: cttsMap ? (cttsMap[si] || 0) : 0,
            flags: fl,
          });
          cursor += sz2;
          si++;
          tr.sampleCount++;
        }
      }
      if (tr.timescale && tr.codecEntry && tr.samples.length) tracks.push(tr);
    });
    return tracks;
  }

  /* remuxYT：常规 MP4 双流合并（视频流取 vide 轨、音频流取 soun 轨）。
     接口/返回与 remuxBuffers 完全同形（offscreen 侧 muxer 开关切换）。 */
  function remuxYT(videoBuf, audioBuf) {
    var vt = null, at = null;
    if (videoBuf) {
      var vts = extractTracksStbl(videoBuf);
      for (var i = 0; i < vts.length; i++) if (vts[i].handler === "vide") { vt = vts[i]; break; }
    }
    if (audioBuf) {
      var ats = extractTracksStbl(audioBuf);
      for (var j = 0; j < ats.length; j++) if (ats[j].handler === "soun") { at = ats[j]; break; }
    }
    if (vt && vt.handler !== "vide" && at && at.handler === "vide") {
      var t = vt; vt = at; at = t;
    }
    if (!vt && !at) throw new Error("no-tracks");
    if (vt) vt._src = videoBuf instanceof Uint8Array ? videoBuf : new Uint8Array(videoBuf);
    if (at) at._src = audioBuf instanceof Uint8Array ? audioBuf : new Uint8Array(audioBuf);
    return { bytes: mux(vt, at), video: vt, audio: at };
  }

  return { extractTrack: extractTrack, extractTracksStbl: extractTracksStbl, mux: mux, remuxBuffers: remuxBuffers, remuxYT: remuxYT };
})();

/* Node 单测 / CommonJS 导出 */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { BiliMd5: BiliMd5, BiliWbi: BiliWbi, BiliRemux: BiliRemux };
}
