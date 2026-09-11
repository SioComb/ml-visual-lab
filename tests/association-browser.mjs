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
  await page.addInitScript(() => {
    window.miningWorkers = { started: 0, terminated: 0, live: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.tracked = String(url).includes('/association/worker.js');
        if (this.tracked) { window.miningWorkers.started++; window.miningWorkers.live++; }
      }
      terminate() {
        if (this.tracked) { window.miningWorkers.terminated++; window.miningWorkers.live--; this.tracked = false; }
        return super.terminate();
      }
    };
  });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const done = () => page.locator('#mining-status').filter({ hasText: '探索完了' }).waitFor();
  const run = async () => { await page.locator('#run-mining').click(); await done(); };
  await mkdir('.cache/qa/screenshots', { recursive: true });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await page.locator('#association > *').count(), 0);
  assert.equal(await page.evaluate(() => window.miningWorkers.started), 0);
  await page.locator('#mainPlot circle').first().waitFor();
  await page.evaluate(() => { window.originalWorkspace = document.getElementById('supervisedWorkspace'); });
  await page.locator('#assocTask').click(); await done();
  assert.equal(page.url(), `${origin}/#association`);
  assert.equal(await page.evaluate(() => window.originalWorkspace === document.getElementById('supervisedWorkspace')), true);
  assert.equal(await page.locator('#supervisedWorkspace').isVisible(), false);
  assert.equal(await page.locator('.task-switch [aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('#assocTask').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.evaluate(() => window.miningWorkers), { started: 1, terminated: 1, live: 0 });
  const initialHistory = await page.evaluate(() => history.length);
  await page.locator('#assocTask').click();
  assert.equal(await page.evaluate(() => history.length), initialHistory);
  assert.equal(await page.evaluate(() => window.miningWorkers.started), 1);
  assert.equal(await page.locator('.method-card').count(), 3);
  assert.match(await page.locator('#agreement').innerText(), /一致/);
  assert.ok(await page.locator('#pattern-table tbody tr').count() > 0);
  await page.locator('.pattern-bar').first().click();
  assert.ok(await page.locator('.basket-receipt.match').count() > 0);
  await page.locator('[data-method="eclat"]').click();
  assert.match(await page.locator('#method-trace').innerText(), /取引ID/);
  await page.locator('[data-method="fpgrowth"]').click(); assert.ok(await page.locator('.fp-node').count() > 0);
  const completedPatterns = await page.locator('#pattern-table').innerText();
  const selectedBasket = await page.locator('#basket-match').innerText();
  await page.goBack();
  await page.locator('#supervisedWorkspace').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#regTask').getAttribute('aria-pressed'), 'true');
  await page.goForward(); await done();
  assert.equal(await page.locator('#pattern-table').innerText(), completedPatterns);
  assert.equal(await page.locator('#basket-match').innerText(), selectedBasket);
  assert.equal(await page.evaluate(() => window.miningWorkers.started), 1);
  for (const id of ['rlTask', 'clsTask', 'clusterTask', 'regTask']) {
    await page.locator('#' + id).click();
    assert.equal(await page.locator('#association').isVisible(), false);
    assert.equal(await page.locator('#' + id).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.task-switch [aria-pressed="true"]').count(), 1);
    await page.locator('#assocTask').click(); await done();
    assert.equal(await page.locator('#pattern-table').innerText(), completedPatterns);
  }
  assert.equal(await page.evaluate(() => window.originalWorkspace === document.getElementById('supervisedWorkspace')), true);
  assert.equal(await page.locator('#run-mining').count(), 1);
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
  for (const target of ['regTask', 'rlTask', 'clsTask', 'clusterTask']) {
    // Synchronous click sequence leaves before the first worker message.
    await page.evaluate(id => { document.getElementById('run-mining').click(); document.getElementById(id).click(); }, target);
    assert.equal(await page.locator('#association').isVisible(), false);
    assert.equal(await page.evaluate(() => window.miningWorkers.live), 0);
    await page.locator('#assocTask').click();
    assert.equal(await page.locator('#mining-status').innerText(), '中止');
    assert.equal(await page.locator('#run-mining').isEnabled(), true);
    assert.equal(await page.locator('#cancel-mining').isVisible(), false);
    assert.equal(await page.locator('#download-patterns').isDisabled(), true);
    assert.equal(await page.locator('#pattern-table tbody tr').count(), 0);
    assert.equal(await page.locator('#basket-size').inputValue(), '5000');
    assert.equal(await page.locator('#run-mining').count(), 1);
  }
  await page.locator('#basket-size').selectOption('300'); await page.locator('#min-support').fill('30'); await run();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '.cache/qa/screenshots/association-mobile.png', fullPage: true });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '.cache/qa/screenshots/association-mobile-top.png' });
  await page.locator('.comparison-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.cache/qa/screenshots/association-mobile-results.png' });
  await page.locator('#regTask').click();
  if (await page.locator('#resultStatus').innerText() !== '学習完了') await page.locator('#train').click();
  await page.locator('#mainPlot circle').first().waitFor();
  assert.ok(await page.locator('#mainPlot circle').count() > 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Feature styles must not alter another lab even after association is mounted.
  const commonLayout = () => page.evaluate(() => [...document.querySelectorAll('#supervisedWorkspace .panel, #supervisedWorkspace .data-heading, #supervisedWorkspace .metric')].map(node => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return [rect.x, rect.y, rect.width, rect.height, style.margin, style.padding, style.flexWrap, style.gap];
  }));
  const withAssociation = await commonLayout();
  await page.evaluate(() => { [...document.styleSheets].find(sheet => sheet.href?.endsWith('/association/style.css')).disabled = true; });
  assert.deepEqual(await commonLayout(), withAssociation);
  await page.evaluate(() => { [...document.styleSheets].find(sheet => sheet.href?.endsWith('/association/style.css')).disabled = false; });
  await page.goto(`${origin}/association.html`); await done();
  assert.equal(page.url(), `${origin}/#association`);
  assert.equal(await page.locator('#assocTask').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#association').isVisible(), true);
  await page.locator('#rlTask').click();
  await page.goBack(); await done();
  await page.goForward(); await page.locator('#reinforcement').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#rlTask').getAttribute('aria-pressed'), 'true');
  await page.goto(`${origin}/index.html#association`); await done();
  assert.equal(await page.locator('#assocTask').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#supervisedWorkspace').isVisible(), false);
  assert.equal(await page.evaluate(() => window.miningWorkers.live), 0);
  assert.deepEqual(errors, []);
  console.log('PASS five SPA tabs, lazy mount, worker termination, preserved state, URL redirects, browser history, mining, CSV and responsive layout');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
