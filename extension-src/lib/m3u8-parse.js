/*! 初始 · m3u8 精简解析器（Stage 1，2026-10）
 *  只解析下载所需字段：master 变体 / media 分片 / EXT-X-KEY / EXT-X-MAP。
 *  与本目录 mux.min.js（mux.js 7.1.0, Apache-2.0）配合：本文件只做文本解析，
 *  不做解密与合并。用法：ChushiM3U8.parse(text, playlistUrl)。
 *  · master：{ kind:"master", variants:[{bandwidth,url}] }（按带宽降序）
 *  · media ：{ kind:"media", segments:[{index,url,duration,key,map}], endlist }
 *  · key   ：{ method, uri, iv }（METHOD=NONE 时为 null）
 *  · map   ：{ uri, iv }（fMP4 的 EXT-X-MAP，只在首片挂一次） */
(function (root) {
  "use strict";
  var LF = String.fromCharCode(10), CR = String.fromCharCode(13);
  function abs(u, base) { try { return new URL(u, base).href; } catch (e) { return u; } }
  function attrs(line) {
    var out = {}, re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g, m;
    while ((m = re.exec(line))) out[m[1]] = String(m[2]).replace(/^"|"$/g, "");
    return out;
  }
  function splitLines(text) {
    var parts = String(text || "").split(LF), out = [], i, s;
    for (i = 0; i < parts.length; i++) {
      s = parts[i];
      if (s.charAt(s.length - 1) === CR) s = s.slice(0, -1);
      out.push(s);
    }
    return out;
  }
  function parse(text, base) {
    var lines = splitLines(text);
    var variants = [], segments = [], key = null, map = null, dur = 0, idx = 0;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l) continue;
      if (l.indexOf("#EXT-X-STREAM-INF:") === 0) {
        var a = attrs(l.slice(18)), next = (lines[i + 1] || "").trim();
        if (next && next.charAt(0) !== "#") {
          variants.push({ bandwidth: Number(a.BANDWIDTH) || 0, url: abs(next, base) });
          i++;
        }
        continue;
      }
      if (l.indexOf("#EXTINF:") === 0) { dur = parseFloat(l.slice(8)) || 0; continue; }
      if (l.indexOf("#EXT-X-KEY:") === 0) {
        var k = attrs(l.slice(11));
        key = (k.METHOD && k.METHOD.toUpperCase() !== "NONE")
          ? { method: k.METHOD.toUpperCase(), uri: k.URI ? abs(k.URI, base) : "", iv: k.IV || "" }
          : null;
        continue;
      }
      if (l.indexOf("#EXT-X-MAP:") === 0) {
        var mp = attrs(l.slice(11));
        map = mp.URI ? { uri: abs(mp.URI, base), iv: mp.IV || "" } : null;
        continue;
      }
      if (l.charAt(0) === "#") continue;
      segments.push({ index: idx, url: abs(l, base), duration: dur, key: key, map: idx === 0 ? map : null });
      idx++; dur = 0;
    }
    if (variants.length) {
      variants.sort(function (a, b) { return b.bandwidth - a.bandwidth; });
      return { kind: "master", variants: variants };
    }
    return { kind: "media", segments: segments, endlist: text.indexOf("#EXT-X-ENDLIST") >= 0 };
  }
  var api = { parse: parse };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (root || {}).ChushiM3U8 = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
