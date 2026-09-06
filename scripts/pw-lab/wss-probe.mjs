import { chromium } from 'playwright-core';

// 拦截 c.wss.ink 分享页的真实下载 API 流程
const code = process.argv[2] || 'kt5ozvh62s3';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

const calls = [];
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('/ap/')) calls.push({ phase: 'req', method: r.method(), url: u, body: r.postData()?.slice(0, 300) });
});
page.on('response', async (res) => {
  const u = res.url();
  if (u.includes('/ap/')) {
    let body = '';
    try { body = (await res.text()).slice(0, 500); } catch {}
    calls.push({ phase: 'res', status: res.status(), url: u, body });
  }
});

await page.goto(`https://c.wss.ink/f/${code}`, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.log('goto err', e.message));
await page.waitForTimeout(4000);

// 打印页面上可见按钮文本，寻找「保存到云盘/下载」
const texts = await page.evaluate(() => Array.from(document.querySelectorAll('button, a, span, div')).map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 30).slice(0, 80));
console.log('PAGE TEXTS:', JSON.stringify([...new Set(texts)], null, 0));

console.log('AP CALLS:', JSON.stringify(calls, null, 1));
await browser.close();
