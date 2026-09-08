// v8.0.2 渲染台架：复刻用户实机「回声行×2 + 中英翻译」场景，
// 断言：已唱行回落灰（.done）、仅当前行亮（.on 卡拉OK）、翻译只挂当前行
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const WIDGET_HTML = readFileSync('/home/z/my-project/preset-src/smtc/music-widget.html', 'utf8');
const SANDBOX_URL = 'http://localhost:4639/sandbox.html?mode=widget';

// 本地源服务：/ → public/（同一源）+ /harness.html 内存直出
import { createServer } from 'node:http';
const PUB = '/home/z/my-project/public';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const HARNESS = `<!doctype html><html><body style="margin:0;background:#3a5a40">
<div id="stage" style="position:relative;width:470px;height:560px;margin:40px auto;border-radius:18px;overflow:hidden;background:rgba(24,24,28,.88)">
  <iframe id="host" src="/sandbox.html?mode=widget" style="width:100%;height:100%;border:0"></iframe>
</div></body></html>`;
const server = createServer((req, res) => {
  const p = req.url.split('?')[0].replace(/\.\./g, '');
  if (p === '/harness.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(HARNESS);
    return;
  }
  if (p === '/widget-direct.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(WIDGET_HTML);
    return;
  }
  const f = PUB + (p === '/' ? '/sandbox.html' : p);
  try {
    const body = readFileSync(f);
    const ext = f.slice(f.lastIndexOf('.'));
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(4639, r));

// 回声行场景（用户视频 17:47 的 L.I.F.E. 段落同构）：同句歌词连续两行 + 翻译
const YRC = [
  '[80550,2660](80550,530,0)Of(81130,500,0)your(81680,600,0)L.I.F.(82330,530,0)E.(82860,350,0)',
  '[83210,2500](83210,600,0)Of(83860,530,0)your(84440,600,0)L.I.F.(85090,500,0)E.(85640,300,0)',
  "[86100,3400](86100,700,0)It's(86850,300,0)how(87200,300,0)we(87550,350,0)learn(87950,400,0)and(88400,300,0)it's(88750,300,0)how(89100,300,0)we(89450,400,0)grow(89900,600,0)",
  '[93300,2800](93300,600,0)I(93950,400,0)gotta(94400,450,0)be(94900,450,0)patient(95400,700,0)',
].join('\n');
const YTLRC = [
  '[80550,2660]属于你的 L.I.F.E.',
  '[83210,2500]这就是所谓的人生',
  '[86100,3400]我们如此学习 如此成长',
  '[93300,2800]我必须要耐心',
].join('\n');

writeFileSync('/tmp/harness802.html', `<!doctype html><html><body style="margin:0;background:#3a5a40">
<div id="stage" style="position:relative;width:470px;height:560px;margin:40px auto;border-radius:18px;overflow:hidden;background:rgba(24,24,28,.88)">
  <iframe id="host" src="${SANDBOX_URL}" style="width:100%;height:100%;border:0"></iframe>
</div></body></html>`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 2 });

await page.addInitScript((html) => {
  window.addEventListener('message', (e) => {
    const f = document.getElementById('host');
    if (!f || e.source !== f.contentWindow) return;
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'hello') {
      f.contentWindow.postMessage({
        type: 'renderWidget', key: 'p:music', html,
        theme: 'dark', accent: '#8b5cf6', panelMode: true,
      }, '*');
    }
    if (m.type === 'widgetApi' && m.op === 'resize') {
      document.getElementById('stage').style.height = Math.max(40, Math.min(560, m.height)) + 'px';
    }
  });
}, WIDGET_HTML);

await page.goto('http://localhost:4639/harness.html');
await page.waitForTimeout(1000);

function stateAt(posSec) {
  return {
    connected: true, version: '8.0.2',
    track: { app: 'NetEase Music', title: 'L.I.F.E.', artist: 'Remady / Manu-L', album: 'L.I.F.E.', playing: true, position: posSec, duration: 179, rate: 1, coverRev: '', fetchedAt: Date.now() },
    cover: null, coverUrl: null,
    lyric: { songId: 186016, title: 'L.I.F.E.', artist: 'Remady', yrc: YRC, ytlrc: YTLRC, lrc: '', tlyric: '', source: 'eapi-yrc' },
    lyricRev: '186016-8.0.2',
    pluginVer: '8.0.2', smtcVer: '3.2.11', seekNote: '',
    needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
  };
}

// 场景 A：t=84.2s → 第 2 行（回声行）激活，第 1 行应 done 回落灰
await page.evaluate((s) => {
  document.getElementById('host').contentWindow.postMessage({ type: 'widgetSmtc', widgetKey: 'p:music', state: s }, '*');
}, stateAt(84.2));
await page.waitForTimeout(1300);
await page.screenshot({ path: '/tmp/v802_echoA.png' });

// 场景 B：t=87.4s → 第 3 行激活，行 1/2 均 done
await page.evaluate((s) => {
  document.getElementById('host').contentWindow.postMessage({ type: 'widgetSmtcTick', widgetKey: 'p:music', tick: { position: 87.4, duration: 179, playing: true, rate: 1, fetchedAt: Date.now() } }, '*');
}, null);
await page.evaluate(() => {
  const s = {
    connected: true, version: '8.0.2',
    track: { app: 'NetEase Music', title: 'L.I.F.E.', artist: 'Remady / Manu-L', album: 'L.I.F.E.', playing: true, position: 87.4, duration: 179, rate: 1, coverRev: '', fetchedAt: Date.now() },
    cover: null, coverUrl: null,
    lyric: null, lyricRev: '186016-8.0.2',
    pluginVer: '8.0.2', smtcVer: '3.2.11', seekNote: '',
    needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
  };
  document.getElementById('host').contentWindow.postMessage({ type: 'widgetSmtc', widgetKey: 'p:music', state: s }, '*');
});
await page.waitForTimeout(1300);
await page.screenshot({ path: '/tmp/v802_echoB.png' });

// 断言：经 CDP 通道枚举 frames 读不透明源内层文档
let rowsInfo = [];
for (const fr of page.frames()) {
  try {
    const n = await fr.locator('.cs-ln').count();
    if (n > 0) {
      rowsInfo = await fr.locator('.cs-ln').evaluateAll((rows) =>
        rows.map((r, i) => {
          const c = getComputedStyle(r);
          const ov = r.querySelector('.cs-w .ov');
          const ovd = ov ? getComputedStyle(ov).display : null;
          const sub = r.querySelector('.cs-sub');
          return {
            i,
            cls: r.className,
            text: (r.textContent || '').slice(0, 22),
            color: c.color,
            ovDisplay: ovd,
            subShown: sub ? getComputedStyle(sub).display : null,
          };
        })
      );
      break;
    }
  } catch (e) { /* 跨源帧跳过 */ }
}
const metrics = {
  rowCount: rowsInfo.length,
  onCount: rowsInfo.filter((r) => r.cls.match(/\bon\b/)).length,
  doneCount: rowsInfo.filter((r) => r.cls.match(/\bdone\b/)).length,
  rows: rowsInfo,
};
console.log(JSON.stringify(metrics, null, 1));

// 硬断言
const assert = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);

if (metrics.rows) {
  assert('仅 1 行 .on', metrics.onCount === 1);
  const doneRows = metrics.rows.filter((r) => r.cls.match(/\bdone\b/));
  assert('已唱行 done≥1', doneRows.length >= 1);
  assert('done 行遮罩 display:none', doneRows.every((r) => r.ovDisplay === 'none'));
  const onRow = metrics.rows.find((r) => r.cls.match(/\bon\b/));
  assert('激活行翻译可见', onRow && onRow.subShown !== 'none');
}
// ---- 直渲染断言阶段：顶层页面 + stub 宿主 API（无 iframe，DOM 全可读） ----
// （渲染代码路径与沙箱内完全一致；沙箱链路本身已由上方截图与 e2e 覆盖）
const page2 = await browser.newPage({ viewport: { width: 480, height: 620 }, deviceScaleFactor: 2 });
let stubPos = 84.2;
await page2.addInitScript((yrcRaw) => {
  const yrc = Array.isArray(yrcRaw) ? yrcRaw : String(yrcRaw).split('\n');
  const LINES = yrc.map((l) => {
    const head = /^\[(\d+),(\d+)\]/.exec(l);
    const s = +head[1] / 1000, e = (+head[1] + +head[2]) / 1000;
    const words = [];
    const re = /\((\d+),(\d+),\d+\)/g;
    let m;
    while ((m = re.exec(l))) words.push({ s: +m[1] / 1000, d: +m[2] / 1000 });
    return { s, e, words };
  });
  const TRS = ['属于你的 L.I.F.E.', '这就是所谓的人生', '我们如此学习 如此成长', '我必须要耐心'];
  window.__pos = 84.2;
  window.chushi = {
    resize: () => { },
    close: () => { },
    music: {
      snapshot: () => window.__snap,
      subscribe: (cb) => { setTimeout(() => cb(window.__snap), 0); },
      now: () => {
        const ms = window.__pos * 1000;
        let li = -1;
        for (let i = 0; i < LINES.length; i++) if (ms >= LINES[i].s * 1000) li = i;
        if (li >= 0 && ms > LINES[li].e * 1000 + 200) li = -1;
        let wi = -1, wp = 0;
        if (li >= 0) {
          const ws = LINES[li].words;
          for (let j = 0; j < ws.length; j++) if (ms >= ws[j].s * 1000) wi = j;
          if (wi >= 0) wp = Math.min(1, Math.max(0, (ms - ws[wi].s * 1000) / (ws[wi].d * 1000)));
        }
        return {
          position: window.__pos, duration: 179, progress: window.__pos / 179,
          playing: true, fadeMs: 260,
          lineIndex: li, wordIndex: wi, wordProgress: wp,
          lineProgress: 0, lineText: '', lineTr: '', wordText: '',
        };
      },
      seek: async () => true, toggle: async () => true, next: async () => true, prev: async () => true,
      play: async () => true, pause: async () => true, lyrics: () => null,
    },
  };
  window.__setSnap = (pos) => {
    window.__pos = pos;
    window.__snap = {
      connected: true, version: '8.0.2',
      app: 'NetEase Music', title: 'L.I.F.E.', artist: 'Remady / Manu-L', album: 'L.I.F.E.',
      cover: '', coverUrl: '', playing: true, duration: 179,
      lyricRev: '186016', lyricMode: 1,
      lyric: {
        mode: 1,
        lines: LINES.map((ln, i) => ({
          s: Math.round(ln.s * 1000), e: Math.round(ln.e * 1000),
          t: ['Of your L.I.F.E.', 'Of your L.I.F.E.', "It's how we learn and it's how we grow", 'I gotta be patient'][i],
          tr: TRS[i] || '',
          w: ln.words.map((w, j) => ({
            s: Math.round(w.s * 1000), d: Math.round(w.d * 1000),
            t: ['Of', 'your', 'L.I.F.', 'E.', 'It\'s', 'how', 'we', 'learn', 'and', 'grow', 'I', 'patient'][j] || '·',
          })),
        })),
      },
      pluginVer: '8.0.2', smtcVer: '3.2.11', seekNote: '',
      needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
    };
  };
  window.__setSnap(window.__pos);
}, YRC);
page2.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0,300)));
await page2.goto('http://localhost:4639/widget-direct.html');
await page2.waitForTimeout(600);

async function snapshotRows() {
  return page2.evaluate(() => {
    return [...document.querySelectorAll('.cs-ln')].map((r, i) => {
      const c = getComputedStyle(r);
      const ov = r.querySelector('.cs-w .ov');
      const sub = r.querySelector('.cs-sub');
      return {
        i, cls: r.className,
        color: c.color,
        ovDisplay: ov ? getComputedStyle(ov).display : null,
        ovP: ov ? ov.style.getPropertyValue('--p') : null,
        subShown: sub ? getComputedStyle(sub).display : null,
      };
    });
  });
}

// 场景 A：t=84.2 行1激活（行0 回声行应 done 回落灰）
const rowsA = await snapshotRows();
console.log('A rows:', JSON.stringify(rowsA));
await page2.screenshot({ path: '/tmp/v802_directA.png' });
// 场景 B：t=87.4 行2激活（行0/1 均 done）
await page2.evaluate(() => { window.__setSnap(87.4); });
await page2.waitForTimeout(700);
const rowsB = await snapshotRows();
console.log('B rows:', JSON.stringify(rowsB));
await page2.screenshot({ path: '/tmp/v802_directB.png' });


assert('A: 仅 1 行 .on（row1）', rowsA.filter((r) => r.cls.match(/\bon\b/)).length === 1 && rowsA[1] && rowsA[1].cls.match(/\bon\b/));
assert('A: row0 done', rowsA[0] && rowsA[0].cls.match(/\bdone\b/));
assert('A: row0 遮罩 display:none', rowsA[0] && rowsA[0].ovDisplay === 'none');
assert('A: row0 不再全亮（≠激活行白）', rowsA[0] && rowsA[1] && rowsA[0].color !== rowsA[1].color);
assert('A: 激活行翻译可见', rowsA[1] && rowsA[1].subShown !== 'none');
assert('B: 行0/1 均 done', rowsB[0] && rowsB[1] && rowsB[0].cls.includes('done') && rowsB[1].cls.includes('done'));
assert('B: 仅 row2 .on', rowsB.filter((r) => r.cls.match(/\bon\b/)).length === 1 && rowsB[2].cls.match(/\bon\b/));
assert('B: 全部 done 行遮罩隐藏', rowsB.filter((r) => r.cls.match(/\bdone\b/)).every((r) => r.ovDisplay === 'none'));
await page2.close();
server.close();
await browser.close();
