// v8.0.4 渲染台架：继承 v8.0.3 悬停/进度条/控制反馈断言，新增——
//   ①已唱行渐隐律：done 行 .ov opacity 渐隐（display 不再 none），--p 定格 100%
//   ②伪逐字全曲覆盖：纯 lrc 歌（无 yrc）也走逐字渲染（mode=1 + 行内词遮罩）
//   ③首行预备定位：播放位置早于首行起点 → 第一行立即 .on（不再等到唱到）
//   ④控制归因三态：cmdLast 回执区分「桥未执行命令」/「网易云未响应（ok=false）」/「插件过旧」
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const WIDGET_HTML = readFileSync('/home/z/my-project/preset-src/smtc/music-widget.html', 'utf8');

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
/* v8.0.4 伪逐字场景：纯 lrc（yrc 空）——yrc 不覆盖的歌 */
const LRC_ONLY = '[00:06.00]你好世界 Hello\n[00:12.00]第二行歌词文字';

writeFileSync('/tmp/harness804.html', HARNESS);

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

function stateAt(posSec, lyricOverride) {
  const s = {
    connected: true, version: '8.0.4',
    track: { app: 'NetEase Music', songId: 186016, title: 'L.I.F.E.', artist: 'Remady / Manu-L', album: 'L.I.F.E.', playing: true, position: posSec, duration: 179, rate: 1, coverRev: '', fetchedAt: Date.now() },
    cover: null, coverUrl: null,
    lyric: lyricOverride || { songId: 186016, title: 'L.I.F.E.', artist: 'Remady', yrc: YRC, ytlrc: YTLRC, lrc: '', tlyric: '', source: 'eapi-yrc' },
    lyricRev: '186016-8.0.4',
    pluginVer: '8.0.4', smtcVer: '3.2.11', seekNote: '',
    cmdLast: { id: 1, type: 'toggle', ok: true, path: 'link', at: Date.now() - 900 },
    needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
  };
  return s;
}

const assert = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);

async function readRows() {
  for (const fr of page.frames()) {
    try {
      const n = await fr.locator('.cs-ln').count();
      if (n > 0) {
        return await fr.locator('.cs-ln').evaluateAll((rows) =>
          rows.map((r) => {
            const ov = r.querySelector('.cs-w .ov');
            const ovCss = ov ? getComputedStyle(ov) : null;
            return {
              cls: r.className,
              text: (r.textContent || '').slice(0, 22),
              color: getComputedStyle(r).color,
              ovDisplay: ovCss ? ovCss.display : null,
              ovOpacity: ovCss ? ovCss.opacity : null,
              ovClip: ov ? ov.style.getPropertyValue('--p') : null,
            };
          })
        );
      }
    } catch (e) { /* 跨源帧跳过 */ }
  }
  return [];
}

/* ---- 场景 A（渐隐律）：先 82s（行0 active → sung），再 84.2s（行1 active，行0 done） ---- */
await page.evaluate((s) => {
  document.getElementById('host').contentWindow.postMessage({ type: 'widgetSmtc', widgetKey: 'p:music', state: s }, '*');
}, stateAt(82.0));
await page.waitForTimeout(900);
await page.evaluate((s) => {
  document.getElementById('host').contentWindow.postMessage({ type: 'widgetSmtcTick', widgetKey: 'p:music', tick: { position: 84.2, duration: 179, playing: true, rate: 1, fetchedAt: Date.now() } }, '*');
}, 0);
await page.waitForTimeout(1100);
let rows = await readRows();
if (rows.length) {
  const onCount = rows.filter((r) => r.cls.match(/\bon\b/)).length;
  const done0 = rows[0];
  assert('[沙箱] 仅 1 行 .on', onCount === 1);
  assert('[沙箱] row0 done', !!done0.cls.match(/\bdone\b/));
  assert('[沙箱] done 行 .ov 不再 display:none（渐隐律）', done0.ovDisplay !== 'none');
  assert('[沙箱] done 行 .ov 渐隐至 opacity 0', done0.ovOpacity === '0', done0.ovOpacity);
  assert('[沙箱] done 行遮罩定格 100%（全亮渐隐）', done0.ovClip === '100%', done0.ovClip);
} else {
  assert('[沙箱] 歌词行渲染', false);
}
await page.screenshot({ path: '/tmp/v804_fade.png' });

/* ---- 场景 B（伪逐字 + 首行预备）：纯 lrc state ---- */
await page.evaluate((s) => {
  document.getElementById('host').contentWindow.postMessage({ type: 'widgetSmtc', widgetKey: 'p:music', state: s }, '*');
}, stateAt(3.0, { songId: 186016, title: 'L.I.F.E.', artist: 'Remady', yrc: '', ytlrc: '', lrc: LRC_ONLY, tlyric: '', source: 'eapi-lrc' }));
await page.waitForTimeout(900);
rows = await readRows();
if (rows.length) {
  assert('[沙箱] 伪逐字: 行数 = lrc 行数', rows.length === 2, String(rows.length));
  const hasOv = await (async () => {
    for (const fr of page.frames()) {
      try {
        const n = await fr.locator('.cs-w .ov').count();
        if (n > 0) return n;
      } catch (e) { }
    }
    return 0;
  })();
  assert('[沙箱] 伪逐字: 纯 lrc 歌也生成词遮罩（mode=1 逐字路径）', hasOv >= 2, String(hasOv));
  const firstOn = rows[0].cls.match(/\bon\b/);
  assert('[沙箱] 首行预备: 前奏期（3s < 首行 6s）第一行已 .on', !!firstOn, rows[0].cls);
} else {
  assert('[沙箱] 伪逐字场景行渲染', false);
}
/* 推进到 8s：行 0 active 且词遮罩推进中 */
await page.evaluate((s) => {
  document.getElementById('host').contentWindow.postMessage({ type: 'widgetSmtcTick', widgetKey: 'p:music', tick: { position: 8.0, duration: 179, playing: true, rate: 1, fetchedAt: Date.now() } }, '*');
}, 0);
await page.waitForTimeout(700);
rows = await readRows();
if (rows.length) {
  assert('[沙箱] 伪逐字: 8s 时行0 active', !!rows[0].cls.match(/\bon\b/), rows[0].cls);
  const ovP = await (async () => {
    for (const fr of page.frames()) {
      try {
        const el = fr.locator('.cs-ln').first().locator('.cs-w .ov').first();
        if (await el.count()) return await el.evaluate((n) => n.style.getPropertyValue('--p'));
      } catch (e) { }
    }
    return '';
  })();
  assert('[沙箱] 伪逐字: 行内词遮罩在推进（--p 非 0%）', !!ovP && ovP !== '0%' && ovP !== '', ovP);
} else {
  assert('[沙箱] 伪逐字推进行渲染', false);
}

/* ---- 直渲染断言阶段：顶层页面 + stub 宿主 API ---- */
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
  window.__pluginVer = '8.0.4';
  window.__cmdLast = null; // v8.0.4 归因：null=无回执 / {ok:false,...}=四路全败
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
        window.__setSnap(window.__pos);
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
      connected: true, version: '8.0.4',
      app: 'NetEase Music', songId: 186016, title: 'L.I.F.E.', artist: 'Remady / Manu-L', album: 'L.I.F.E.',
      cover: '', coverUrl: '', playing: window.__playing, duration: 179,
      lyricRev: '186016', lyricMode: 1,
      lyric: {
        mode: 1, songId: 186016,
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
      cmdLast: window.__cmdLast,
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

/* ---- 继承 v8.0.3 断言①：主键悬停律 ---- */
await page2.hover('#csPlay');
await page2.waitForTimeout(420);
const hoverCss = await page2.evaluate(() => {
  const b = document.getElementById('csPlay');
  const c = getComputedStyle(b);
  return { bg: c.backgroundColor, color: c.color, transform: c.transform };
});
assert('悬停: 背景恒 accent（不变黑）', hoverCss.bg === 'rgb(139, 92, 246)');
assert('悬停: 前景恒白', hoverCss.color === 'rgb(255, 255, 255)');
assert('悬停: 无位移变换（transform none）', hoverCss.transform === 'none');

/* ---- 继承 v8.0.3 断言②：进度条被动化 ---- */
const railInfo = await page2.evaluate(() => ({
  thumbs: document.querySelectorAll('.cs-rail u').length,
  fills: document.querySelectorAll('.cs-rail i').length,
  fillW: document.getElementById('csFill').style.width,
  cursor: getComputedStyle(document.getElementById('csSeek')).cursor,
}));
assert('进度条: 无滑块元素', railInfo.thumbs === 0 && railInfo.fills === 1);
assert('进度条: 只读填充在走（84.2/179≈47%）', railInfo.fillW.startsWith('47.'));
assert('进度条: 非手型光标', railInfo.cursor !== 'pointer');

/* ---- 继承 v8.0.3 断言③：控制成功路径 ---- */
await page2.click('#csPlay');
await page2.waitForTimeout(3600);
let chip = await chipState();
assert('控制成功: 无未生效芯片', !chip.on);
const playingAfter = await page2.evaluate(() => window.__playing);
assert('控制成功: 真值已翻转', playingAfter === false);

/* ---- v8.0.4 断言④：归因三态 ---- */
// ④a 插件过旧（8.0.1，无回执概念）→「控制能力不足」
await page2.evaluate(() => { window.__ctlMode = 'stuck'; window.__pluginVer = '8.0.1'; window.__cmdLast = null; window.__setSnap(window.__pos); });
await page2.waitForTimeout(200);
await page2.click('#csPlay');
await page2.waitForTimeout(3700);
chip = await chipState();
assert('归因④a: 插件过旧 → 亮芯片且归因版本', chip.on && chip.text.includes('8.0.1') && chip.text.includes('控制能力不足'), chip.text);
await page2.screenshot({ path: '/tmp/v804_ctlfail_old.png' });

// ④b 桥已执行但四路全败（cmdLast.ok=false，at 在点击后——桥 1Hz 拉取+执行延迟）→「网易云未响应控制」
await page2.evaluate(() => {
  window.__pluginVer = '8.0.4';
  window.__cmdLast = { id: 9, type: 'toggle', ok: false, path: 'button', at: Date.now() + 700 };
  window.__setSnap(window.__pos);
});
await page2.waitForTimeout(200);
await page2.click('#csPlay');
await page2.waitForTimeout(3700);
chip = await chipState();
assert('归因④b: 桥四路全败 →「网易云未响应控制」', chip.on && chip.text.includes('网易云未响应控制') && chip.text.includes('button'), chip.text);

// ④c 桥侧从未执行（无 cmdLast / at 过旧）→「音乐桥未执行命令」
await page2.evaluate(() => {
  window.__cmdLast = { id: 3, type: 'toggle', ok: true, path: 'link', at: Date.now() - 60000 };
  window.__setSnap(window.__pos);
});
await page2.waitForTimeout(200);
await page2.click('#csNext');
await page2.waitForTimeout(3700);
chip = await chipState();
assert('归因④c: 桥未执行命令 →「音乐桥未执行命令」', chip.on && chip.text.includes('音乐桥未执行命令'), chip.text);

// 拒绝路径：POST 失败 → 立即亮「未送达」
await page2.evaluate(() => { window.__ctlMode = 'reject'; window.__cmdLast = null; window.__setSnap(window.__pos); });
await page2.click('#csPrev');
await page2.waitForTimeout(400);
chip = await chipState();
assert('控制拒绝: 亮未送达芯片', chip.on && chip.text.includes('未送达'));

/* ---- 歌词回归断言（直渲染）：回声行单高亮 + done 渐隐 ----
   注意：只改 __pos（rAF 循环读它驱动行切换），不走 __setSnap——
   setSnap 会新建 lyric 对象触发歌词 DOM 重建（sung 标记丢失，那是
   切歌场景的正常行为，不是本断言目标） */
await page2.evaluate(() => { window.__ctlMode = 'ok'; window.__cmdLast = null; window.__pos = 82.0; });
await page2.waitForTimeout(500);
await page2.evaluate(() => { window.__pos = 84.2; });
await page2.waitForTimeout(1000);
const rowsA = await page2.evaluate(() =>
  [...document.querySelectorAll('.cs-ln')].map((r) => {
    const ov = r.querySelector('.cs-w .ov');
    const oc = ov ? getComputedStyle(ov) : null;
    return {
      cls: r.className,
      color: getComputedStyle(r).color,
      ovDisplay: oc ? oc.display : null,
      ovOpacity: oc ? oc.opacity : null,
      ovClip: ov ? ov.style.getPropertyValue('--p') : null,
    };
  })
);
assert('A: 仅 1 行 .on（row1）', rowsA.filter((r) => r.cls.match(/\bon\b/)).length === 1 && rowsA[1].cls.match(/\bon\b/));
assert('A: row0 done 且 .ov 渐隐（opacity 0 非 display none）',
  rowsA[0].cls.match(/\bdone\b/) && rowsA[0].ovDisplay !== 'none' && rowsA[0].ovOpacity === '0',
  JSON.stringify(rowsA[0]));
assert('A: row0 遮罩定格 100%', rowsA[0].ovClip === '100%', rowsA[0].ovClip);
await page2.screenshot({ path: '/tmp/v804_directA.png' });

await page2.close();
server.close();
await browser.close();
console.log('DONE probe-widget-v804');
