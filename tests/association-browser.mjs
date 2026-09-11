// Optional UI integration test; uses the same cached Playwright as browser-smoke.mjs.
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
  try { res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.QA_BROWSER ?? 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const done = () => page.locator('#mining-status').filter({ hasText: '探索完了' }).waitFor();
  const run = async () => { await page.locator('#run-mining').click(); await done(); };
  await mkdir('.cache/qa/screenshots', { recursive: true });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('.application-link').click(); await done();
  assert.equal(await page.locator('.method-card').count(), 3);
  assert.match(await page.locator('#agreement').innerText(), /一致/);
  assert.ok(await page.locator('#pattern-table tbody tr').count() > 0);
  await page.locator('.pattern-bar').first().click();
  assert.ok(await page.locator('.basket-receipt.match').count() > 0);
  await page.locator('[data-method="eclat"]').click();
  assert.match(await page.locator('#method-trace').innerText(), /取引ID/);
  await page.locator('[data-method="fpgrowth"]').click(); assert.ok(await page.locator('.fp-node').count() > 0);
  await page.screenshot({ path: '.cache/qa/screenshots/association-desktop.png', fullPage: true });
  const downloadEvent = page.waitForEvent('download'); await page.locator('#download-patterns').click();
  assert.equal((await downloadEvent).suggestedFilename(), 'frequent-itemsets.csv');
  await page.locator('#max-length').selectOption('1');
  assert.equal(await page.locator('#download-patterns').isDisabled(), true);
  await run(); assert.equal(await page.locator('#pattern-table tbody tr').count(), 0);
  await page.locator('#pattern-size').selectOption('all'); assert.ok(await page.locator('#pattern-table tbody tr').count() > 0);
  await page.locator('summary').click(); await page.locator('#basket-text').fill('a,b\na,b\na\nc');
  await page.locator('#apply-baskets').click(); await page.locator('#max-length').selectOption('3'); await run();
  assert.match(await page.locator('#rules-table').innerText(), /1\.33/);
  await page.locator('#min-confidence').fill('100'); assert.equal(await page.locator('#rules-table tbody tr').count(), 1);
  await page.locator('#basket-text').fill('"unterminated'); await page.locator('#apply-baskets').click();
  assert.match(await page.locator('#mining-message').innerText(), /引用符/);
  assert.match(await page.locator('#data-status').innerText(), /4件/);
  await page.locator('#basket-file').setInputFiles({ name: 'test.csv', mimeType: 'text/csv', buffer: Buffer.from('<img src=x onerror=alert(1)>,牛乳\n牛乳,パン') });
  await page.locator('#data-status').filter({ hasText: 'test.csv' }).waitFor();
  assert.equal(await page.locator('#basket-preview img').count(), 0);
  assert.match(await page.locator('#basket-preview').innerText(), /<img/);
  await page.locator('#basket-sample').selectOption('dense'); await page.locator('#basket-size').selectOption('5000');
  await page.locator('#min-support').fill('1'); await page.locator('#max-length').selectOption('5');
  // Queue run and cancel in one browser task to reliably exercise termination.
  await page.evaluate(() => { document.getElementById('run-mining').click(); document.getElementById('cancel-mining').click(); });
  assert.equal(await page.locator('#mining-status').innerText(), '中止');
  assert.equal(await page.locator('#download-patterns').isDisabled(), true);
  await page.locator('#basket-size').selectOption('300'); await page.locator('#min-support').fill('30'); await run();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '.cache/qa/screenshots/association-mobile.png', fullPage: true });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '.cache/qa/screenshots/association-mobile-top.png' });
  await page.locator('.comparison-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.cache/qa/screenshots/association-mobile-results.png' });
  await page.locator('.back-link').click();
  await page.locator('#mainPlot circle').first().waitFor();
  assert.ok(await page.locator('#mainPlot circle').count() > 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS association navigation, mining, traces, selection, rules, CSV, cancellation, escaping and responsive layout');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
