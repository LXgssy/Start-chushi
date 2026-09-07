/* ============================================================================
 * ChuShi Lyric Source 7.0.0 — 歌词源（第七代全新实现，纯 JS 零 Node）
 *
 * 职责：按需提供完整歌词（逐字 yrc + 逐字翻译 ytlrc + 行级 lrc + 行级翻译）。
 *
 * 取词阶梯（三层回退）：
 *   1. eapi /api/song/lyric/v1（自实现 MD5 + AES-128-ECB，纯 JS，协议常量级实现）
 *   2. 网易云内部 channel 桥（track.lyric.getinfo，宿主环境自带则用）
 *   3. 直连旧公开接口 /api/song/lyric（lrc/tlyric）
 *
 * 协作协议（与音乐桥）：
 *   收 cc:lyric-req {songId, reqId} → 应答 cc:lyric-res {songId, reqId, payload}
 *
 * 本文件零 require/零 Node——BetterNCM v2 渲染环境为 CEF。
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__chushiLyricSource) return;

  var VER = '7.0.0';
  window.__chushiLyricSource = { ver: VER };

  /* ------------------------------------------------------------------ */
  /* 纯 JS MD5（RFC 1321，自实现）                                        */
  /* ------------------------------------------------------------------ */
  function md5(strBytes) {
    /* strBytes: number[]（字节）→ 32 位小写 hex */
    function rotl(x, c) { return (x << c) | (x >>> (32 - c)); }
    function add(a, b) { return (a + b) | 0; }

    var s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];

    var K = new Array(64);
    for (var i = 0; i < 64; i++) {
      K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) | 0;
    }

    var len = strBytes.length;
    var bitLen = len * 8;
    /* 填充：0x80 + 0x00… + 64bit 小端长度 */
    var withPad = ((len + 8) >> 6) + 1; /* 完整 512bit 块数 */
    var total = withPad * 64;
    var buf = new Array(total).fill(0);
    for (var j = 0; j < len; j++) buf[j] = strBytes[j] & 255;
    buf[len] = 0x80;
    /* 64 位小端位长（JS 安全整数内：低 32 位足够；高位补 0） */
    var lo = bitLen % 4294967296;
    buf[total - 8] = lo & 255;
    buf[total - 7] = (lo >>> 8) & 255;
    buf[total - 6] = (lo >>> 16) & 255;
    buf[total - 5] = (lo >>> 24) & 255;

    var a0 = 1732584193, b0 = -271733879, c0 = -1732584194, d0 = 271733878;

    for (var blk = 0; blk < total; blk += 64) {
      var M = new Array(16);
      for (var w = 0; w < 16; w++) {
        var o = blk + w * 4;
        M[w] = (buf[o]) | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24);
      }
      var A = a0, B = b0, C = c0, D = d0;
      for (var n = 0; n < 64; n++) {
        var F, g;
        if (n < 16) { F = (B & C) | (~B & D); g = n; }
        else if (n < 32) { F = (D & B) | (~D & C); g = (5 * n + 1) % 16; }
        else if (n < 48) { F = B ^ C ^ D; g = (3 * n + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * n) % 16; }
        F = add(add(add(F, A), K[n]), M[g]);
        A = D; D = C; C = B;
        B = add(B, rotl(F, s[n]));
      }
      a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D);
    }

    function hex(x) {
      var out = '';
      for (var k = 0; k < 4; k++) {
        var b = (x >>> (k * 8)) & 255;
        out += (b < 16 ? '0' : '') + b.toString(16);
      }
      return out;
    }
    return hex(a0) + hex(b0) + hex(c0) + hex(d0);
  }

  function utf8Bytes(str) {
    var out = [];
    try {
      var enc = encodeURIComponent(str);
      for (var i = 0; i < enc.length; i++) {
        if (enc[i] === '%') {
          out.push(parseInt(enc.substr(i + 1, 2), 16)); i += 2;
        } else if (enc[i] === '+') { out.push(32); }
        else { var c = enc.charCodeAt(i); out.push(c); }
      }
    } catch (e) { /* 输入异常按空处理 */ }
    return out;
  }

  function bytesToHex(arr) {
    var out = '';
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i] & 255;
      out += (b < 16 ? '0' : '') + b.toString(16);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 纯 JS AES-128-ECB（FIPS-197，仅加密，PKCS7 填充）                     */
  /* ------------------------------------------------------------------ */
  function aesExpandKey(keyBytes) {
    /* 128 位密钥：11 组轮密钥（44 个 32 位字） */
    var nk = 4, nr = 10;
    var w = new Array(4 * (nr + 1));
    for (var i = 0; i < nk; i++) {
      w[i] = [(keyBytes[i * 4]) & 255, (keyBytes[i * 4 + 1]) & 255, (keyBytes[i * 4 + 2]) & 255, (keyBytes[i * 4 + 3]) & 255];
    }
    var rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
    var sbox = AES_SBOX;
    for (var k = nk; k < 4 * (nr + 1); k++) {
      var t = w[k - 1].slice();
      if (k % nk === 0) {
        t = [t[1], t[2], t[3], t[0]];
        for (var q = 0; q < 4; q++) t[q] = sbox[t[q]];
        t[0] ^= rcon[k / nk - 1];
      }
      var nw = [];
      for (var q2 = 0; q2 < 4; q2++) nw.push(w[k - nk][q2] ^ t[q2]);
      w[k] = nw;
    }
    return w;
  }

  var AES_SBOX = [
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
  ];

  function aesEncryptBlock(block, w) {
    /* state：列主序 4x4 */
    var s = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) s[r][c] = block[r + c * 4] & 255;

    function addRoundKey(round) {
      for (var c = 0; c < 4; c++) {
        for (var r = 0; r < 4; r++) s[r][c] ^= w[round * 4 + c][r];
      }
    }
    function subBytes() {
      for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) s[r][c] = AES_SBOX[s[r][c]];
    }
    function shiftRows() {
      for (var r = 1; r < 4; r++) {
        var row = [s[r][0], s[r][1], s[r][2], s[r][3]];
        for (var c = 0; c < 4; c++) s[r][c] = row[(c + r) % 4];
      }
    }
    function xtime(x) {
      x = x << 1; if (x & 0x100) x ^= 0x11b; return x & 255;
    }
    function mixColumns() {
      for (var c = 0; c < 4; c++) {
        var a0 = s[0][c], a1 = s[1][c], a2 = s[2][c], a3 = s[3][c];
        s[0][c] = xtime(a0) ^ (xtime(a1) ^ a1) ^ a2 ^ a3;
        s[1][c] = a0 ^ xtime(a1) ^ (xtime(a2) ^ a2) ^ a3;
        s[2][c] = a0 ^ a1 ^ xtime(a2) ^ (xtime(a3) ^ a3);
        s[3][c] = (xtime(a0) ^ a0) ^ a1 ^ a2 ^ xtime(a3);
      }
    }

    var nr = 10;
    addRoundKey(0);
    for (var round = 1; round < nr; round++) {
      subBytes(); shiftRows(); mixColumns(); addRoundKey(round);
    }
    subBytes(); shiftRows(); addRoundKey(nr);

    var out = new Array(16);
    for (var c2 = 0; c2 < 4; c2++) for (var r2 = 0; r2 < 4; r2++) out[c2 * 4 + r2] = s[r2][c2];
    return out;
  }

  function aesEcbEncryptBytes(dataBytes, keyBytes) {
    var w = aesExpandKey(keyBytes);
    /* PKCS7 填充 */
    var pad = 16 - (dataBytes.length % 16);
    var buf = dataBytes.slice();
    for (var p = 0; p < pad; p++) buf.push(pad);
    var out = [];
    for (var off = 0; off < buf.length; off += 16) {
      var blk = aesEncryptBlock(buf.slice(off, off + 16), w);
      out = out.concat(blk);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* eapi 协议（常量级实现）                                              */
  /* ------------------------------------------------------------------ */
  var EAPI_SECRET = 'e82ckenh8dichen8'; /* eapi 公开密钥常量 */

  function eapiEncrypt(path, paramsJson) {
    var text = path + '?' + paramsJson;
    var msg = 'nobody' + path + 'use' + text + 'md5forencrypt';
    var digest = md5(utf8Bytes(msg));
    var data = path + '-36cd479b6b5-' + text + '-36cd479b6b5-' + digest;
    var keyBytes = [];
    for (var i = 0; i < EAPI_SECRET.length; i++) keyBytes.push(EAPI_SECRET.charCodeAt(i) & 255);
    var enc = aesEcbEncryptBytes(utf8Bytes(data), keyBytes);
    return bytesToHex(enc).toUpperCase();
  }

  function eapiFetch(path, paramsObj) {
    var paramsJson = JSON.stringify(paramsObj);
    var payload = eapiEncrypt(path, paramsJson);
    var body = 'params=' + payload;
    var hosts = ['https://interface3.music.163.com', 'https://music.163.com'];
    function tryHost(i) {
      if (i >= hosts.length) return Promise.resolve(null);
      var ctl = null;
      try { ctl = new AbortController(); } catch (e) { }
      var timer = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) { } }, 6000);
      return fetch(hosts[i] + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'os': 'pc', 'appver': '2.10.13', 'version': '2.10.13'
        },
        body: body,
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) { clearTimeout(timer); return r.json(); })
        .catch(function () { clearTimeout(timer); return tryHost(i + 1); });
    }
    return tryHost(0);
  }

  /* ------------------------------------------------------------------ */
  /* 取词阶梯                                                              */
  /* ------------------------------------------------------------------ */
  var cache = loadCache();

  function loadCache() {
    try {
      var raw = localStorage.getItem('__chushi_lyric_cache_v7__');
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveCache() {
    try {
      var keys = Object.keys(cache);
      if (keys.length > 8) {
        keys.sort(function (a, b) { return (cache[a].at || 0) - (cache[b].at || 0); });
        while (keys.length > 8) { delete cache[keys.shift()]; }
      }
      localStorage.setItem('__chushi_lyric_cache_v7__', JSON.stringify(cache));
    } catch (e) { /* 存储满则放弃 */ }
  }

  function klyricToYrc(klyricJson) {
    /* klyric {version, content:[{time:{...ms 累积键}, line:[{time:{ms}, word}]}]} → 逐字行 */
    try {
      var lines = klyricJson.content || [];
      var out = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var lineStart = null;
        var words = line.line || [];
        var parts = [];
        for (var w = 0; w < words.length; w++) {
          var wd = words[w];
          var t = wd.time || {};
          var ms = t.totalMT || (t.mt || 0) * 60 * 1000 + (t.st || 0) * 1000 + (t.et || 0);
          if (lineStart === null) lineStart = ms;
          parts.push('[' + fmt(ms) + ']' + (wd.word || ''));
        }
        if (lineStart === null) lineStart = 0;
        out.push('[' + fmt(lineStart) + ']' + parts.join(''));
      }
      return out.join('\n');
      function fmt(ms) {
        var m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), f = Math.floor(ms % 1000 / 10);
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + (f < 10 ? '0' : '') + f;
      }
    } catch (e) { return ''; }
  }

  function extractLyric(j, id, source) {
    if (!j) return null;
    var lrc = j.lrc && typeof j.lrc.lyric === 'string' ? j.lrc.lyric : '';
    var tlyric = j.tlyric && typeof j.tlyric.lyric === 'string' ? j.tlyric.lyric : '';
    var yrc = j.yrc && typeof j.yrc.lyric === 'string' ? j.yrc.lyric : '';
    var ytlrc = j.ytlrc && typeof j.ytlrc.lyric === 'string' ? j.ytlrc.lyric : '';
    if (!yrc && j.klyric && j.klyric.lyric && typeof j.klyric.lyric === 'object') {
      yrc = klyricToYrc(j.klyric.lyric);
      if (yrc) source = 'eapi-klyric';
    }
    if (!lrc && !yrc) return null;
    return {
      songId: id,
      title: '',
      artist: '',
      yrc: yrc.slice(0, 200000),
      ytlrc: ytlrc.slice(0, 200000),
      lrc: lrc.slice(0, 200000),
      tlyric: tlyric.slice(0, 200000),
      source: source || 'eapi-yrc',
      rev: id + '-' + VER
    };
  }

  function fetchViaChannel(id) {
    return new Promise(function (resolve) {
      try {
        var ch = window.channel;
        if (!ch || typeof ch.call !== 'function') { resolve(null); return; }
        var done = false;
        var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 6000);
        ch.call('track.lyric.getinfo', function (data) {
          if (done) return; done = true; clearTimeout(timer);
          try {
            if (!data || !data.lyric) { resolve(null); return; }
            var yrc = data.lyric.yrc && data.lyric.yrc.lyric ? data.lyric.yrc.lyric : '';
            var lrc = data.lyric.lrc && data.lyric.lrc.lyric ? data.lyric.lrc.lyric : '';
            var tly = data.lyric.tlyric && data.lyric.tlyric.lyric ? data.lyric.tlyric.lyric : '';
            var ytl = data.lyric.ytlrc && data.lyric.ytlrc.lyric ? data.lyric.ytlrc.lyric : '';
            if (!yrc && !lrc) { resolve(null); return; }
            resolve({
              songId: id, title: '', artist: '',
              yrc: String(yrc).slice(0, 200000),
              ytlrc: String(ytl).slice(0, 200000),
              lrc: String(lrc).slice(0, 200000),
              tlyric: String(tly).slice(0, 200000),
              source: 'channel-lrc', rev: id + '-' + VER
            });
          } catch (e) { resolve(null); }
        }, { id: id, cp: false, tv: 0, lv: 0, rv: 0, kv: 0, yv: 0, ytv: 0 });
      } catch (e) { resolve(null); }
    });
  }

  function fetchViaDirect(id) {
    var url = 'https://music.163.com/api/song/lyric?os=pc&id=' + id + '&lv=-1&kv=-1&tv=-1&yv=-1';
    var ctl = null;
    try { ctl = new AbortController(); } catch (e) { }
    var timer = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) { } }, 6000);
    return fetch(url).then(function (r) { clearTimeout(timer); return r.json(); })
      .then(function (j) {
        return extractLyric(j, id, 'direct-lrc');
      })
      .catch(function () { clearTimeout(timer); return null; });
  }

  function getLyric(songId) {
    var id = Number(songId) || 0;
    if (!id) return Promise.resolve(null);
    var hit = cache[id];
    if (hit && hit.payload) {
      hit.at = Date.now();
      saveCache();
      return Promise.resolve(hit.payload);
    }
    var params = { id: id, cp: false, lv: 0, tv: 0, rv: 0, kv: 0, yv: 0, ytv: 0 };
    return eapiFetch('/eapi/song/lyric/v1', params)
      .then(function (j) {
        var p = extractLyric(j, id, 'eapi-yrc');
        if (p) return p;
        return fetchViaChannel(id).then(function (p2) {
          if (p2) return p2;
          return fetchViaDirect(id);
        });
      })
      .catch(function () { return null; })
      .then(function (payload) {
        if (payload) {
          cache[id] = { at: Date.now(), payload: payload };
          saveCache();
        }
        return payload;
      });
  }

  /* ------------------------------------------------------------------ */
  /* 事件协议                                                              */
  /* ------------------------------------------------------------------ */
  window.addEventListener('cc:lyric-req', function (ev) {
    try {
      var d = ev.detail || {};
      var songId = Number(d.songId) || 0;
      var reqId = d.reqId || 0;
      if (!songId) return;
      getLyric(songId).then(function (payload) {
        try {
          window.dispatchEvent(new CustomEvent('cc:lyric-res', {
            detail: { songId: songId, reqId: reqId, payload: payload }
          }));
        } catch (e) { /* 应答失败 */ }
      });
    } catch (e) { /* 请求异常 */ }
  }, false);
})();
