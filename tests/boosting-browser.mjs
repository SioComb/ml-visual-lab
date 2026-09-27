// Optional UI QA; uses the existing local Playwright cache (no production dependency).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { parseCSV, splitDataset } from '../dist/boosting/data.js';
import { trainBoosting } from '../dist/boosting/model.js';
const { chromium } = await import('../.cache/qa/node_modules/playwright/index.mjs');
const root = resolve('dist');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
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
  const errors = [], consoleErrors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  let csvRequests = 0;
  page.context().on('request', r => { if (/boosting\/data\/.*\.csv$/.test(r.url())) csvRequests++; });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ready = () => page.locator('#boost-output').waitFor({ state: 'visible' });
  const scrub = async n => {
    await page.locator('#boost-stage').fill(String(n));
    await page.locator('#boost-stage').dispatchEvent('input');
  };
  const metrics = () => page.locator('#boost-metrics .metric-value').allTextContents();
  const radii = () => page.locator('#boost-scatter circle').evaluateAll(nodes => nodes.map(n => n.getAttribute('r')));
  const chart = () => page.locator('#boost-scatter').innerHTML();
  await page.goto(origin);
  await page.locator('#boostTask').click(); await ready();
  assert.equal(new URL(page.url()).hash, '#boosting');
  assert.equal(await page.locator('#boostTask').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#supervisedWorkspace').isVisible(), false);
  assert.match(await page.locator('#boost-facts').innerText(), /1000件.*2特徴量.*2クラス/);
  assert.equal(await page.locator('#boost-scatter [data-boost-point]').count(), 750);
  assert.equal(await page.locator('#boost-stage').getAttribute('max'), '50');
  const records = parseCSV(await readFile('dist/boosting/data/moons.csv', 'utf8'));
  const { train, test } = splitDataset(records), expected = trainBoosting(train, test);
  assert.equal((await metrics())[0], expected.stages[0].test.accuracy.toFixed(3));
  assert.equal((await metrics())[1], `${expected.stages[0].test.wrong.length} / 250`);
  const firstChart = await chart(), firstRadii = await radii(), firstReading = await page.locator('#boost-reading').innerText();
  await page.locator('#boost-weights').selectOption('before');
  assert.equal(new Set(await radii()).size, 1);
  await page.locator('#boost-weights').selectOption('after');
  assert.deepEqual(await radii(), firstRadii);
  const requests = csvRequests;
  await scrub(18);
  assert.notEqual(await chart(), firstChart);
  assert.notDeepEqual(await radii(), firstRadii);
  assert.notEqual(await page.locator('#boost-reading').innerText(), firstReading);
  assert.equal((await metrics())[0], expected.stages[17].test.accuracy.toFixed(3));
  assert.equal((await metrics())[1], `${expected.stages[17].test.wrong.length} / 250`);
  assert.match(await page.locator('#boost-accuracy-chart').getAttribute('aria-label'), /Stage 18/);
  assert.equal(await page.locator('#boost-scatter [data-boost-wrong]').count(), expected.stages[17].train.wrong.length);
  assert.equal(await page.locator('#boost-scatter > path').first().getAttribute('d'), await page.locator('#boost-compare-chart > path').first().getAttribute('d'), 'main and comparison must display the same ensemble boundary');
  await page.locator('#boost-view').selectOption('weak');
  assert.equal(await page.locator('#boost-scatter [data-boost-wrong]').count(), expected.stages[17].train.weak.wrong.length);
  await page.locator('#boost-split').selectOption('test');
  assert.equal(await page.locator('#boost-weights').isDisabled(), true);
  assert.equal(await page.locator('#boost-scatter [data-boost-point]').count(), 250);
  assert.equal(new Set(await radii()).size, 1);
  await page.locator('#boost-view').selectOption('ensemble');
  assert.equal(await page.locator('#boost-scatter [data-boost-wrong]').count(), expected.stages[17].test.wrong.length);
  assert.equal(csvRequests, requests, 'scrubbing must not fetch or retrain');
  for (const n of [1, 2, 25, 50]) {
    await scrub(n);
    assert.equal((await metrics())[0], expected.stages[n - 1].test.accuracy.toFixed(3));
  }
  await page.locator('#boost-stage').focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#boost-stage').inputValue(), '49');
  await scrub(1); await page.locator('#boost-play').click();
  await page.waitForFunction(() => Number(document.querySelector('#boost-stage').value) > 1);
  await page.locator('#regTask').click();
  const paused = await page.locator('#boost-stage').inputValue();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#boost-stage').inputValue(), paused);
  for (const id of ['clsTask', 'clusterTask', 'pcaTask', 'rlTask', 'adsTask', 'qlearningTask', 'assocTask', 'nlpTask']) {
    await page.locator(`#${id}`).click();
    assert.equal(await page.locator('#boosting').isVisible(), false);
    assert.equal(await page.locator(`#${id}`).getAttribute('aria-pressed'), 'true');
  }
  await page.locator('#boostTask').click(); await ready();
  assert.equal(await page.locator('#boost-stage').inputValue(), paused);
  assert.equal(csvRequests, requests);
  for (const kind of ['circles', 'classification', 'moons']) {
    await page.locator('#boost-dataset').selectOption(kind); await ready();
    assert.match(await page.locator('#boost-status').innerText(), /50 Stage/);
    assert.equal(await page.locator('#boost-stage').inputValue(), '1');
  }
  await page.locator('#boost-estimators').fill('12'); await page.locator('#boost-estimators').dispatchEvent('input');
  await page.locator('#boost-rate').fill('0.5'); await page.locator('#boost-rate').dispatchEvent('input');
  await page.locator('#boost-test-size').fill('40'); await page.locator('#boost-test-size').dispatchEvent('input');
  assert.equal(await page.locator('#boost-output').isVisible(), false);
  await page.locator('#boost-train').click(); await ready();
  assert.equal(await page.locator('#boost-stage').getAttribute('max'), '12');
  assert.match(await page.locator('#boost-facts').innerText(), /Train 600件 \/ Test 400件/);
  await page.goto(`${origin}/#boosting`); await page.reload(); await ready();
  await page.locator('#boost-split').selectOption('train'); await scrub(18);
  await mkdir('.cache/qa/screenshots', { recursive: true });
  await page.screenshot({ path: '.cache/qa/screenshots/boosting-desktop.png', fullPage: true });
  await page.locator('#boost-scatter').screenshot({ path: '.cache/qa/screenshots/boosting-plot.png' });
  for (const width of [390, 720]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`);
    await page.locator('#boost-stage').scrollIntoViewIfNeeded();
    await scrub(50);
    assert.equal((await metrics())[0], expected.stages[49].test.accuracy.toFixed(3));
    await page.screenshot({ path: `.cache/qa/screenshots/boosting-${width}.png`, fullPage: true });
    if (width === 390) await page.locator('#boost-scatter').screenshot({ path: '.cache/qa/screenshots/boosting-mobile-plot.png' });
  }
  assert.deepEqual(consoleErrors, []);
  // A new browser context routes worker-originated CSV requests too.
  const retryContext = await browser.newContext();
  await retryContext.route('**/boosting/data/*.csv', route => route.fulfill({ status: 503, body: 'unavailable' }));
  const retryPage = await retryContext.newPage();
  await retryPage.goto(`${origin}/#boosting`);
  await retryPage.locator('#boost-status').filter({ hasText: 'HTTP 503' }).waitFor();
  assert.equal(await retryPage.locator('#boost-output').isVisible(), false);
  await retryContext.unroute('**/boosting/data/*.csv');
  await retryPage.locator('#boost-train').click();
  await retryPage.locator('#boost-output').waitFor();
  await retryContext.close();
  assert.deepEqual(errors, []);
  console.log('PASS Boosting: navigation, three CSVs, saved stages/weights/predictions, metrics, chart, comparison, settings, playback, mobile, retry, no browser errors');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
