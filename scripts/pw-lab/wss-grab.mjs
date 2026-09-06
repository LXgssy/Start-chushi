import { chromium } from 'playwright-core';
import fs from 'fs';

const code = process.argv[2] || 'kt5ozvh62s3';
const out = process.argv[3] || `/home/z/my-project/upload/vid82/${code}.mp4`;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  viewport: { width: 1400, height: 900 },
  acceptDownloads: true,
});
const page = await ctx.newPage();

const dlUrls = [];
page.on('response', async (res) => {
  const u = res.url();
  if (u.includes('/ap/dtask') || u.includes('/ap/ufile') || u.includes('/ap/tpl') || u.includes('download')) {
    let body = '';
    try { body = (await res.text()).slice(0, 800); } catch {}
    if (body && res.status() === 200) console.log(`[RES ${res.status()}] ${u.split('wenshushu.cn')[1]?.split('?')[0] || u.slice(0, 80)} :: ${body.slice(0, 400)}`);
  }
});

page.on('download', async (d) => {
  console.log('[DOWNLOAD EVENT]', d.url(), d.suggestedFilename());
  dlUrls.push(d.url());
  await d.saveAs(out);
  console.log('[SAVED via download event]', out);
});

await page.goto(`https://c.wss.ink/f/${code}`, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.log('goto err', e.message));
await page.waitForTimeout(3000);

// 列出所有 button 文本
const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b, i) => `${i}:${(b.textContent || '').trim().slice(0, 20)}`));
console.log('BUTTONS:', JSON.stringify(btns));

// 精确点击「下载」按钮（排除下载转存外的）
const btn = page.getByRole('button', { name: /下载/ }).first();
console.log('clicking:', await btn.textContent().catch(() => 'n/a'));
await btn.click({ timeout: 10000 }).catch(async (e) => {
  console.log('role click err', e.message.split('\n')[0]);
  await page.locator('text="下载"').last().click({ timeout: 5000 }).catch((e2) => console.log('text click err', e2.message.split('\n')[0]));
});

// 等待下载开始
await page.waitForTimeout(12000);
const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
const got = await dl;
if (got && !dlUrls.length) {
  await got.saveAs(out);
  console.log('[SAVED late]', out);
}

if (dlUrls.length === 0 && !fs.existsSync(out)) {
  // 兜底：找页面里的直链
  console.log('no download event; checking for direct URLs...');
  const html = await page.content();
  const m = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/);
  console.log('mp4 in html:', m ? m[0].slice(0, 120) : 'none');
}
await browser.close();
