import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const WIDGET_HTML = readFileSync('/home/z/my-project/preset-src/smtc/music-widget.html', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
page.on('console', (m) => console.log('[console]', m.text().slice(0, 200)));
await page.addInitScript((html) => {
  window.addEventListener('message', (e) => {
    const f = document.getElementById('host');
    if (!f || e.source !== f.contentWindow) return;
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'hello') f.contentWindow.postMessage({ type: 'renderWidget', key: 'p:music', html, theme: 'dark', accent: '#8b5cf6', panelMode: true }, '*');
  });
}, WIDGET_HTML);
await page.goto('http://localhost:4639/harness.html');
await page.waitForTimeout(1500);
console.log('frames:', page.frames().map((f) => ({ url: f.url().slice(0, 60), name: f.name() })));
for (const fr of page.frames()) {
  try {
    const r = await fr.evaluate(() => ({
      hasQ: !!document.querySelector('.cs-ln'),
      bodyLen: document.body ? document.body.innerHTML.length : -1,
    }));
    console.log('frame', fr.url().slice(0, 40), JSON.stringify(r));
  } catch (e) { console.log('frame', fr.url().slice(0, 40), 'ERR', String(e).slice(0, 80)); }
}
await browser.close();
