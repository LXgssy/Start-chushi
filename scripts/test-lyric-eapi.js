/* eapi 歌词参数实测：yv:0 vs yv:-1 对中文歌 yrc/klyric 返回的影响
 * 复刻 lyric-source 的纯 JS 加密链（md5 + AES-128-ECB + eapi 包裹） */
const crypto = require('crypto');

const EAPI_SECRET = 'e82ckenh8dichen8';

function eapiEncrypt(path, paramsJson) {
  const text = path + '?' + paramsJson;
  const msg = 'nobody' + path + 'use' + text + 'md5forencrypt';
  const digest = crypto.createHash('md5').update(msg).digest('hex');
  const data = path + '-36cd479b6b5-' + text + '-36cd479b6b5-' + digest;
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(EAPI_SECRET, 'utf8'), null);
  const enc = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]).toString('hex').toUpperCase();
  return enc;
}

async function eapiFetch(path, paramsObj) {
  const payload = eapiEncrypt(path, JSON.stringify(paramsObj));
  const body = 'params=' + payload;
  const hosts = ['https://interface3.music.163.com', 'https://music.163.com'];
  for (const host of hosts) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(host + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', os: 'pc', appver: '2.10.13', version: '2.10.13', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NCM/2.10.13', Cookie: 'os=pc; appver=2.10.13; osver=Microsoft-Windows-10-Home-China-build-19045; MUSIC_U=; REMEMBER_ME=1;' },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const txt = await r.text();
      try {
        const j = JSON.parse(txt);
        if (j) return j;
      } catch (e) {
        console.log('  [' + host + '] HTTP ' + r.status + ' non-JSON: ' + txt.slice(0, 120));
      }
    } catch (e) { /* try next host */ }
  }
  return null;
}

function peek(label, j) {
  if (!j) { console.log(label, ': REQUEST FAILED'); return; }
  const fields = ['yrc', 'ytlrc', 'klyric', 'lrc', 'tlyric', 'romalrc'];
  const summary = fields.map((f) => {
    const v = j[f];
    if (!v) return f + '=-';
    if (typeof v.lyric === 'string' && v.lyric.length) {
      const first = v.lyric.split('\n').find((l) => l.trim());
      return f + '=' + v.lyric.length + 'B("' + String(first).slice(0, 48) + '...")';
    }
    if (v.content) return f + '=klyric(' + v.content.length + '行)';
    return f + '=empty';
  });
  console.log(label, ':', summary.join(' | '), '| code=' + (j.code ?? '?'));
}

function yrcHead(j) {
  if (!j || !j.yrc || typeof j.yrc.lyric !== 'string') return;
  const lines = j.yrc.lyric.split('\n').filter((l) => /^\s*\[\d+,\d+\]/.test(l));
  if (lines.length) console.log('   yrc时间轴行示例:', JSON.stringify(lines[Math.min(2, lines.length - 1)].slice(0, 110)));
}

const SONGS = [
  { name: '晴天/周杰伦', id: 186016 },
  { name: '起风了/买辣椒也用券', id: 536622304 },
];

(async () => {
  for (const s of SONGS) {
    console.log('\n=== ' + s.name + ' (id=' + s.id + ') ===');
    const base = { id: s.id, cp: false };
    peek('A 全零参数(yv:0现状)      ', await eapiFetch('/eapi/song/lyric/v1', { ...base, tv: 0, lv: 0, rv: 0, kv: 0, yv: 0, ytv: 0 }));
    const jB = await eapiFetch('/eapi/song/lyric/v1', { ...base, tv: -1, lv: -1, rv: -1, kv: -1, yv: -1, ytv: -1 });
    peek('B 全负一参数(yv:-1)      ', jB);
    yrcHead(jB);
    const jC = await eapiFetch('/eapi/song/lyric/v1', { ...base, tv: 0, lv: 0, rv: 0, kv: -1, yv: -1, ytv: -1 });
    peek('C 仅kv/yv/ytv负一        ', jC);
    yrcHead(jC);
  }
})();
