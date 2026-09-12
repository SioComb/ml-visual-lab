// Optional UI integration test using the existing local Playwright cache.
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ready = () => page.locator('#nlp-status').filter({ hasText: '学習が完了' }).waitFor();
  const analyze = async text => {
    if (text !== undefined) await page.locator('#nlp-text').fill(text);
    await page.locator('#nlp-analyze').click();
    await page.locator('#nlp-output').waitFor();
    assert.equal(await page.locator('.nlp-input-panel #nlp-inline-result').isVisible(), true);
    assert.equal(await page.locator('.nlp-input-panel #nlp-result').isVisible(), true);
    assert.equal(await page.locator('.nlp-input-panel #nlp-probabilities').isVisible(), true);
  };
  await mkdir('.cache/qa/screenshots', { recursive: true });
  await page.goto(`${origin}/#nlp`); await ready();
  assert.equal(await page.locator('#supervisedWorkspace').isVisible(), false);
  assert.equal(await page.locator('#nlpTask').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#nlp-summary').innerText(), /5,000件 \/ 2クラス/);
  assert.match(await page.locator('#nlp-csv').getAttribute('href'), /bow_sentiment_reviews_5000\.csv$/);
  await analyze();
  assert.match(await page.locator('#nlp-result').innerText(), /高評価/);
  assert.equal(await page.locator('#nlp-probabilities progress').count(), 2);
  assert.ok(await page.locator('#nlp-counts tr').count() > 2);
  assert.equal(await page.locator('#nlp-vector > div').count(), 24);
  const fullVector = JSON.parse(await page.locator('#nlp-full-vector').textContent());
  assert.equal(fullVector.length, Number(await page.locator('#nlp-metrics .metric-value').first().textContent()));
  const displayedCounts = await page.locator('#nlp-counts tr').evaluateAll(rows => rows.map(row => [Number(row.cells[0].textContent), Number(row.cells[2].textContent)]));
  for (const [index, count] of displayedCounts) assert.equal(fullVector[index], count);
  assert.equal(fullVector.filter(value => value !== 0).length, displayedCounts.length);
  await page.screenshot({ path: '.cache/qa/screenshots/nlp-sentiment.png', fullPage: true });
  await page.locator('.nlp-input-panel').screenshot({ path: '.cache/qa/screenshots/nlp-inline-sentiment.png' });
  await page.screenshot({ path: '.cache/qa/screenshots/nlp-desktop-top.png' });
  await analyze('音質 音質 品質 zzzzzunknown');
  assert.match(await page.locator('#nlp-counts tr').filter({ hasText: '音質' }).innerText(), /2$/);
  assert.match(await page.locator('#nlp-unknown').innerText(), /zzzzzunknown/);
  await analyze('🛸！？');
  assert.match(await page.locator('#nlp-result').innerText(), /判定材料がありません/);
  assert.match(await page.locator('.nlp-input-panel #nlp-result-note').innerText(), /参考確率/);
  await page.locator('#nlp-text').fill('   ');
  assert.equal(await page.locator('#nlp-output').isVisible(), false);
  assert.equal(await page.locator('#nlp-inline-result').isVisible(), false);
  await page.locator('#nlp-analyze').click();
  assert.match(await page.locator('#nlp-status').innerText(), /1〜2,000文字/);
  await analyze('<img src=x onerror=alert(1)>');
  assert.equal(await page.locator('#nlp-output img').count(), 0);
  assert.match(await page.locator('#nlp-analyzed-text').innerText(), /<img/);

  await page.locator('#nlp-kind').selectOption('genre'); await ready();
  assert.match(await page.locator('#nlp-summary').innerText(), /5,000件 \/ 5クラス/);
  assert.match(await page.locator('#nlp-csv').getAttribute('href'), /bow_japanese_training_5000\.csv$/);
  assert.equal(await page.locator('#nlp-output').isVisible(), false);
  assert.equal(await page.locator('#nlp-inline-result').isVisible(), false);
  await analyze();
  assert.match(await page.locator('#nlp-result').innerText(), /旅行・観光/);
  assert.equal(await page.locator('#nlp-probabilities progress').count(), 5);
  const sum = await page.locator('#nlp-probabilities progress').evaluateAll(nodes => nodes.reduce((s, n) => s + n.value, 0));
  assert.ok(Math.abs(sum - 1) < 1e-12);
  await page.locator('#nlp-examples button').nth(1).click();
  assert.equal(await page.locator('#nlp-output').isVisible(), false);
  assert.equal(await page.locator('#nlp-inline-result').isVisible(), false);
  await analyze();
  assert.match(await page.locator('#nlp-result').innerText(), /IT・テクノロジー/);
  await page.screenshot({ path: '.cache/qa/screenshots/nlp-genre.png', fullPage: true });
  console.log('PASS both datasets, real predictions, vectors, unknown/empty input, escaping, and class probabilities');

  for (const id of ['regTask', 'clsTask', 'clusterTask', 'rlTask', 'assocTask']) {
    await page.locator(`#${id}`).click();
    assert.equal(await page.locator('#nlp').isVisible(), false);
    await page.locator('#nlpTask').click();
    assert.equal(await page.locator('#nlp-output').isVisible(), true);
    assert.equal(await page.locator('#supervisedWorkspace').isVisible(), false);
  }
  await page.goBack();
  assert.equal(await page.locator('#association').isVisible(), true);
  await page.goForward();
  assert.equal(await page.locator('#nlp').isVisible(), true);
  // Replace a worker while it is still fetching; only the final dataset may win.
  await page.route('**/csv/*.csv', async route => {
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.continue();
  });
  await page.locator('#nlp-kind').selectOption('sentiment');
  await page.locator('#nlp-kind').selectOption('genre'); await ready();
  assert.match(await page.locator('#nlp-summary').innerText(), /5クラス/);
  await page.unroute('**/csv/*.csv');
  await analyze();
  console.log('PASS navigation, history, state preservation, and switching during training');

  for (const width of [768, 320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
      console.log(await page.locator('body *').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().right > innerWidth && n.clientWidth).map(n => ({ tag: n.tagName, id: n.id, class: n.className, right: n.getBoundingClientRect().right })).slice(0, 20)));
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}px`);
  }
  await page.screenshot({ path: '.cache/qa/screenshots/nlp-mobile.png', fullPage: true });
  await page.locator('.nlp-input-panel').screenshot({ path: '.cache/qa/screenshots/nlp-inline-mobile.png' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.cache/qa/screenshots/nlp-mobile-top.png' });
  await page.route('**/csv/*.csv', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.locator('#nlp-train').click();
  await page.locator('#nlp-status.error').waitFor();
  assert.match(await page.locator('#nlp-status').innerText(), /HTTP 404/);
  assert.equal(await page.locator('#nlp-analyze').isDisabled(), true);
  assert.equal(await page.locator('#nlp-output').isVisible(), false);
  assert.equal(await page.locator('#nlp-inline-result').isVisible(), false);
  await page.unroute('**/csv/*.csv');
  await page.locator('#nlp-train').click(); await ready();
  await analyze();
  assert.deepEqual(errors, []);
  console.log('PASS mobile layout, CSV failure, retry, and no browser exceptions');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
