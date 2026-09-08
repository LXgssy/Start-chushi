// v8.0.3 渲染台架：继承 v8.0.2 歌词单高亮断言，新增——
//   ①主键悬停律：hover 背景恒 accent、前景恒白、transform none（变黑+图标位移根治）
//   ②进度条被动化：无滑块元素、无 pointer 拖拽、只读填充
//   ③控制诚实反馈：toggle 成功无芯片 / 真值不翻转亮「控制能力不足」/ POST 失败亮「未送达」
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const WIDGET_HTML = readFileSync('/home/z/my-project/preset-src/smtc/music-widget.html', 'utf8');
const SANDBOX_URL = 'http://localhost:4639/sandbox.html?mode=widget';

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

// 回声行场景（用户视频 L.I.F.E. 段落同构）：同句歌词连续两行 + 翻译
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

writeFileSync('/tmp/harness803.html', HARNESS);

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
    connected: true, version: '8.0.3',
    track: { app: 'NetEase Music', title: 'L.I.F.E.', artist: 'Remady / Manu-L', album: 'L.I.F.E.', playing: true, position: posSec, duration: 179, rate: 1, coverRev: '', fetchedAt: Date.now() },
    cover: null, coverUrl: null,
    lyric: { songId: 186016, title: 'L.I.F.E.', artist: 'Remady', yrc: YRC, ytlrc: YTLRC, lrc: '', tlyric: '', source: 'eapi-yrc' },
    lyricRev: '186016-8.0.3',
    pluginVer: '8.0.3', smtcVer: '3.2.11', seekNote: '',
    needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
  };
}

// 场景 A：t=84.2s → 第 2 行（回声行）激活，第 1 行应 done 回落灰
await page.evaluate((s) => {
  document.getElementById('host').contentWindow.postMessage({ type: 'widgetSmtc', widgetKey: 'p:music', state: s }, '*');
}, stateAt(84.2));
await page.waitForTimeout(1300);
await page.screenshot({ path: '/tmp/v803_echoA.png' });

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
const assert = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);

if (rowsInfo.length) {
  const onCount = rowsInfo.filter((r) => r.cls.match(/\bon\b/)).length;
  const doneRows = rowsInfo.filter((r) => r.cls.match(/\bdone\b/));
  const onRow = rowsInfo.find((r) => r.cls.match(/\bon\b/));
  assert('[沙箱链路] 仅 1 行 .on', onCount === 1);
  assert('[沙箱链路] 已唱行 done≥1', doneRows.length >= 1);
  assert('[沙箱链路] done 行遮罩 display:none', doneRows.every((r) => r.ovDisplay === 'none'));
  assert('[沙箱链路] 激活行翻译可见', onRow && onRow.subShown !== 'none');
} else {
  assert('[沙箱链路] 歌词行渲染', false);
}

// ---- 直渲染断言阶段：顶层页面 + stub 宿主 API（无 iframe，DOM 全可读） ----
const page2 = await browser.newPage({ viewport: { width: 480, height: 640 }, deviceScaleFactor: 2 });
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
  window.__playing = true;
  window.__ctlMode = 'ok'; // ok | stuck | reject
  window.__pluginVer = '8.0.3';
  window.chushi = {
    resize: () => { },
    close: () => { },
    music: {
      snapshot: () => window.__snap,
      subscribe: (cb) => {
        window.__subs = window.__subs || [];
        window.__subs.push(cb);
        setTimeout(() => cb(window.__snap), 0);
      },
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
          playing: window.__playing, fadeMs: 260,
          lineIndex: li, wordIndex: wi, wordProgress: wp,
          lineProgress: 0, lineText: '', lineTr: '', wordText: '',
        };
      },
      seek: async () => true,
      toggle: async () => {
        if (window.__ctlMode === 'reject') return false;
        if (window.__ctlMode === 'stuck') return true; /* 下发成功但真值不翻转 */
        window.__playing = !window.__playing;
        window.__setSnap(window.__pos); /* setSnap 内已向订阅者推送 */
        return true;
      },
      next: async () => (window.__ctlMode === 'reject' ? false : true),
      prev: async () => (window.__ctlMode === 'reject' ? false : true),
      play: async () => true, pause: async () => true, lyrics: () => null,
    },
  };
  window.__setSnap = (pos) => {
    window.__pos = pos;
    window.__snap = {
      connected: true, version: '8.0.3',
      app: 'NetEase Music', title: 'L.I.F.E.', artist: 'Remady / Manu-L', album: 'L.I.F.E.',
      cover: '', coverUrl: '', playing: window.__playing, duration: 179,
      lyricRev: '186016', lyricMode: 1,
      lyric: {
        mode: 1,
        lines: LINES.map((ln, i) => ({
          s: Math.round(ln.s * 1000), e: Math.round(ln.e * 1000),
          t: ['Of your L.I.F.E.', 'Of your L.I.F.E.', "It's how we learn and it's how we grow", 'I gotta be patient'][i],
          tr: TRS[i] || '',
          w: ln.words.map((w, j) => ({
            s: Math.round(w.s * 1000), d: Math.round(w.d * 1000),
            t: ['Of', 'your', 'L.I.F.', 'E.', 'It\'s', 'how', 'we', 'learn', 'and', 'grow', 'I', 'patient'][j % 12] || '·',
          })),
        })),
      },
      pluginVer: window.__pluginVer, smtcVer: '3.2.11', seekNote: '',
      needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
    };
    for (const cb of window.__subs || []) { try { cb(window.__snap); } catch { } }
  };
  window.__setSnap(window.__pos);
}, YRC);
page2.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page2.goto('http://localhost:4639/widget-direct.html');
await page2.waitForTimeout(600);

async function chipState() {
  return page2.evaluate(() => {
    const chip = document.getElementById('csUpd');
    return { on: chip.classList.contains('on'), text: (chip.textContent || '').trim() };
  });
}

/* ---- v8.0.3 断言 ①：主键悬停律 ---- */
await page2.hover('#csPlay');
await page2.waitForTimeout(420);
const hoverCss = await page2.evaluate(() => {
  const b = document.getElementById('csPlay');
  const c = getComputedStyle(b);
  return { bg: c.backgroundColor, color: c.color, transform: c.transform, filter: c.filter };
});
assert('悬停: 背景恒 accent（不变黑）', hoverCss.bg === 'rgb(139, 92, 246)');
assert('悬停: 前景恒白', hoverCss.color === 'rgb(255, 255, 255)');
assert('悬停: 无位移变换（transform none）', hoverCss.transform === 'none');

/* ---- v8.0.3 断言 ②：进度条被动化 ---- */
const railInfo = await page2.evaluate(() => ({
  thumbs: document.querySelectorAll('.cs-rail u').length,
  fills: document.querySelectorAll('.cs-rail i').length,
  fillW: document.getElementById('csFill').style.width,
  cursor: getComputedStyle(document.getElementById('csSeek')).cursor,
  dragListeners: typeof window.__drag === 'undefined',
}));
assert('进度条: 无滑块元素', railInfo.thumbs === 0 && railInfo.fills === 1);
assert('进度条: 只读填充在走（84.2/179≈47%）', railInfo.fillW.startsWith('47.'));
assert('进度条: 非手型光标', railInfo.cursor !== 'pointer');

/* ---- v8.0.3 断言 ③：控制诚实反馈 ---- */
// 成功路径：toggle 翻转真值 → 无芯片
await page2.click('#csPlay');
await page2.waitForTimeout(3600);
let chip = await chipState();
assert('控制成功: 无未生效芯片', !chip.on);
const playingAfter = await page2.evaluate(() => window.__playing);
assert('控制成功: 真值已翻转', playingAfter === false);

// 卡死路径：toggle 下发成功但真值不翻转 → 3.2s 后亮「控制能力不足」（pluginVer 8.0.1 归因）
await page2.evaluate(() => { window.__ctlMode = 'stuck'; window.__pluginVer = '8.0.1'; window.__setSnap(window.__pos); });
await page2.waitForTimeout(200);
await page2.click('#csPlay');
await page2.waitForTimeout(3700);
chip = await chipState();
assert('控制卡死: 亮未生效芯片', chip.on);
assert('控制卡死: 文案归因插件版本过旧', chip.text.includes('8.0.1') && chip.text.includes('控制能力不足'));
await page2.screenshot({ path: '/tmp/v803_ctlfail.png' });

// 拒绝路径：POST 失败 → 立即亮「未送达」
await page2.evaluate(() => { window.__ctlMode = 'reject'; window.__pluginVer = '8.0.3'; window.__setSnap(window.__pos); });
await page2.click('#csNext');
await page2.waitForTimeout(400);
chip = await chipState();
assert('控制拒绝: 亮未送达芯片', chip.on && chip.text.includes('未送达'));

// 歌词回归断言（直渲染）：回声行单高亮律仍成立
await page2.evaluate(() => { window.__ctlMode = 'ok'; window.__pluginVer = '8.0.3'; window.__setSnap(84.2); });
await page2.waitForTimeout(700);
const rowsA = await page2.evaluate(() =>
  [...document.querySelectorAll('.cs-ln')].map((r) => ({ cls: r.className, color: getComputedStyle(r).color, ovDisplay: (r.querySelector('.cs-w .ov') ? getComputedStyle(r.querySelector('.cs-w .ov')).display : null) }))
);
assert('A: 仅 1 行 .on（row1）', rowsA.filter((r) => r.cls.match(/\bon\b/)).length === 1 && rowsA[1].cls.match(/\bon\b/));
assert('A: row0 done 且遮罩隐藏', rowsA[0].cls.match(/\bdone\b/) && rowsA[0].ovDisplay === 'none');
await page2.screenshot({ path: '/tmp/v803_directA.png' });

await page2.close();
server.close();
await browser.close();
console.log('DONE probe-widget-v803');
