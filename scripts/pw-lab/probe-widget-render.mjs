// 复现宿主链路渲染 v8 音乐部件（v2：监听器先于导航注入）
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const WIDGET_HTML = readFileSync('/home/z/my-project/preset-src/smtc/music-widget.html', 'utf8');
const SANDBOX_URL = 'file:///home/z/my-project/public/sandbox.html?mode=widget';

writeFileSync('/tmp/harness.html', `<!doctype html><html><body style="margin:0;background:#3a5a40">
<div id="stage" style="position:relative;width:470px;height:560px;margin:40px auto;border-radius:18px;overflow:hidden;background:rgba(24,24,28,.88)">
  <iframe id="host" src="${SANDBOX_URL}" style="width:100%;height:100%;border:0"></iframe>
</div></body></html>`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 2 });

await page.addInitScript((html) => {
  window.__api = [];
  window.addEventListener('message', (e) => {
    const f = document.getElementById('host');
    if (!f || e.source !== f.contentWindow) return;
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    window.__api.push({ type: m.type, op: m.op, h: m.height });
    if (m.type === 'hello') {
      f.contentWindow.postMessage({
        type: 'renderWidget', key: 'p:music', html,
        theme: 'dark', accent: '#8b5cf6', panelMode: true,
      }, '*');
    }
    if (m.type === 'widgetApi' && m.op === 'resize') {
      document.getElementById('stage').style.height = Math.max(40, Math.min(460, m.height)) + 'px';
    }
  });
}, WIDGET_HTML);

await page.goto('file:///tmp/harness.html');
await page.waitForTimeout(1000);

const state = {
  connected: true, version: '8.0.0',
  track: { app: 'NetEase Music', title: '晴天', artist: '周杰伦', album: '叶惠美', playing: true, position: 10, duration: 114, rate: 1, coverRev: '', fetchedAt: Date.now() },
  cover: null, coverUrl: null, lyric: null, lyricRev: '',
  pluginVer: '8.0.0', smtcVer: '3.2.11', seekNote: '',
  needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
};
await page.evaluate((s) => {
  document.getElementById('host').contentWindow.postMessage({ type: 'widgetSmtc', widgetKey: 'p:music', state: s }, '*');
}, state);
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/render_v8_connected.png' });

await page.evaluate(() => {
  const off = { connected: false, version: '', track: null, cover: null, coverUrl: null, lyric: null, lyricRev: '', pluginVer: '', smtcVer: '', seekNote: '', needsUpdate: true, needsPlugin: false, needsBridge: true, engineOld: false };
  document.getElementById('host').contentWindow.postMessage({ type: 'widgetSmtc', widgetKey: 'p:music', state: off }, '*');
});
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/render_v8_offline.png' });

const metrics = await page.evaluate(() => {
  const f = document.getElementById('host');
  const doc = f.contentDocument;
  const inner = doc && doc.querySelector('iframe');
  if (!inner || !inner.contentDocument) return { err: 'no inner doc' };
  const d = inner.contentDocument;
  const pick = (sel) => {
    const el = d.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), pos: c.position, disp: c.display };
  };
  return {
    panel: d.documentElement.getAttribute('data-panel'),
    theme: d.documentElement.getAttribute('data-theme'),
    cardClass: (d.querySelector('.cs-card') || {}).className,
    coverPic: pick('.cs-pic'),
    coverImg: pick('#csCoverImg'),
    t1: pick('#csT1'),
    t1Text: (d.querySelector('#csT1') || {}).textContent,
    foot: pick('#csFootTxt'),
    footText: (d.querySelector('#csFootTxt') || {}).textContent,
    stageH: document.getElementById('stage').style.height,
  };
});
console.log(JSON.stringify(metrics, null, 1));
const apiLog = await page.evaluate(() => window.__api);
console.log('api:', JSON.stringify(apiLog));
await browser.close();
