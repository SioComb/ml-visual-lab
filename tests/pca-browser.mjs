// Optional browser regression check; uses the repo's existing QA-only cache.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import('../.cache/qa/node_modules/playwright/index.mjs');
const root = resolve('dist');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.csv': 'text/csv; charset=utf-8' }[extname(path)] ?? 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.QA_BROWSER ?? 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let requests = 0;
  page.on('request', req => { if (req.url().endsWith('/wine.csv')) requests++; });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ready = () => page.locator('#pca-status').filter({ hasText: '178件を13次元から2次元へ圧縮しました' }).waitFor();
  const progress = () => page.locator('#pca-progress').inputValue().then(Number);
  const scrub = async value => {
    await page.locator('#pca-progress').fill(String(value));
    await page.locator('#pca-progress').dispatchEvent('input');
  };
  await page.goto(`${origin}/#pca`); await ready();
  assert.equal(await page.locator('#pcaTask').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.algorithm-group').count(), 3);
  assert.equal(await page.locator('.algorithm-group').first().locator('#pcaTask').count(), 1);
  assert.equal(await page.locator('#supervisedWorkspace').isVisible(), false);
  assert.equal(await page.locator('[data-pca-row]').count(), 178);
  assert.equal(await page.locator('#pca-scatter rect').count(), 1200);
  assert.equal(await page.locator('#pca-merge path').count(), 26);
  assert.equal(await page.locator('#pca-metrics .metric-value').count(), 2);
  assert.equal(await page.locator('[data-pca-error]').count(), 2);
  await page.locator('#pca-play').click();
  await page.waitForFunction(() => Number(document.querySelector('#pca-progress').value) >= 10);
  await page.locator('#pca-pause').click();
  const paused = await progress(); await page.waitForTimeout(150);
  assert.equal(await progress(), paused);
  await page.locator('#pca-pause').click();
  await page.waitForFunction(p => Number(document.querySelector('#pca-progress').value) > p, paused);
  await page.locator('#pca-reset').click(); assert.equal(await progress(), 0);
  await scrub(60); assert.equal(await progress(), 60);
  await page.locator('#pca-sample').selectOption('1'); assert.equal(await progress(), 0);
  await page.locator('#pca-progress').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await progress(), 1);
  await scrub(100);
  assert.match(await page.locator('#pca-selection').innerText(), /ワインB.*予測/);
  await page.locator('.pca-comparison summary').click();
  assert.equal(await page.locator('#pca-confusion table').count(), 2);
  await mkdir('.cache/qa/screenshots', { recursive: true });
  await page.screenshot({ path: '.cache/qa/screenshots/pca-desktop.png', fullPage: true });

  await page.locator('#pca-play').click();
  await page.waitForFunction(() => Number(document.querySelector('#pca-progress').value) > 3);
  await page.locator('#regTask').click(); const hiddenProgress = await progress();
  await page.waitForTimeout(150); assert.equal(await progress(), hiddenProgress);
  for (const id of ['clsTask', 'clusterTask', 'rlTask', 'adsTask', 'qlearningTask', 'assocTask', 'nlpTask']) {
    await page.locator(`#${id}`).click();
    assert.equal(await page.locator('#pca').isVisible(), false);
    assert.equal(await page.locator(`#${id}`).getAttribute('aria-pressed'), 'true');
  }
  await page.locator('#pcaTask').click(); await ready();
  assert.equal(await progress(), hiddenProgress); assert.equal(requests, 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await scrub(100);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile horizontal overflow');
  await page.waitForFunction(() => [...document.querySelectorAll('#pca-scatter text')].every(node => parseFloat(getComputedStyle(node).fontSize) * node.ownerSVGElement.getBoundingClientRect().width / 620 >= 11.99));
  for (const id of ['pca-play', 'pca-pause', 'pca-reset', 'pca-sample', 'pca-progress']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), true);
    const box = await page.locator(`#${id}`).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, `${id} clipped`);
  }
  await page.screenshot({ path: '.cache/qa/screenshots/pca-mobile.png', fullPage: true });
  await page.locator('.pca-scatter-panel').screenshot({ path: '.cache/qa/screenshots/pca-mobile-scatter.png' });
  await page.locator('.pca-comparison').screenshot({ path: '.cache/qa/screenshots/pca-mobile-comparison.png' });
  // 200% desktop zoom reflows to approximately half the CSS viewport width.
  await page.setViewportSize({ width: 720, height: 550 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'zoom reflow overflow');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload(); await ready(); assert.equal(await progress(), 0);
  await page.locator('#pca-play').click(); assert.equal(await progress(), 100);
  await scrub(50); assert.equal(await progress(), 50);
  assert.equal(await page.locator('#pca-motion-note').isVisible(), true);

  await page.route('**/wine.csv', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.reload();
  await page.locator('#pca-retry').waitFor();
  assert.equal(await page.locator('#pca-content').isVisible(), false);
  await page.unroute('**/wine.csv');
  await page.locator('#pca-retry').click(); await ready();
  await page.goto(`${origin}/pca.html`); await ready();
  assert.equal(new URL(page.url()).hash, '#pca');
  await page.goto(`${origin}/dimension/index.html`); await ready();
  assert.equal(new URL(page.url()).hash, '#pca');
  assert.deepEqual(errors, []);
  console.log('PASS PCA deep links, computed metrics, animation, pause/resume/reset, samples, keyboard, navigation cache, responsive reflow, reduced motion, retry, and no page errors');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
