// Optional UI test: npm install --prefix .cache/qa --no-package-lock playwright
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import('../.cache/qa/node_modules/playwright/index.mjs');
const root = resolve('dist');
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + (new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: process.env.QA_BROWSER ?? 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('.cache/qa/screenshots', { recursive: true });
async function waitForText(selector, value) { await page.locator(selector).filter({ hasText: value }).waitFor(); }
async function trainExisting() { await page.locator('#train:not([disabled])').waitFor(); assert.ok(await page.locator('#mainPlot circle').count() > 0); }
async function number(id, value) { await page.locator('#rl-' + id).fill(String(value)); await page.locator('#rl-' + id).press('Tab'); }
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await trainExisting();
  for (const id of ['clsTask', 'clusterTask', 'regTask']) { await page.locator('#' + id).click(); await trainExisting(); }
  await page.locator('#sample').selectOption('category');
  await page.locator('#train').click(); await trainExisting();
  assert.equal(await page.locator('#preprocessingPanel').isVisible(), true);
  console.log('PASS existing model/category navigation and feature preprocessing');
  await page.locator('#rlTask').click();
  assert.equal(await page.locator('#supervisedWorkspace').isVisible(), false);
  assert.equal(await page.locator('#rl-algorithm').inputValue(), 'epsilon');
  assert.ok(!(await page.locator('#rl-board').innerText()).includes('真の確率 80%'));
  for (const algorithm of ['greedy', 'epsilon', 'ucb']) {
    await page.locator('#rl-algorithm').selectOption(algorithm);
    await number('limit', 20);
    await page.locator('#rl-speed').selectOption('50');
    await page.locator('#rl-step').click();
    await page.locator('#rl-run').click();
    await waitForText('#rl-status', '試行完了');
    assert.match(await page.locator('#rl-metrics').innerText(), /20/);
    await page.locator('#rl-save').click();
  }
  assert.equal(await page.locator('#rl-comparison tbody tr').count(), 3);
  await page.screenshot({ path: '.cache/qa/screenshots/bandit.png', fullPage: true });
  await page.locator('#rl-reset').click();
  await number('limit', 500);
  await page.locator('#rl-speed').selectOption('1');
  await page.locator('#rl-run').click(); await page.locator('#rl-pause').click();
  const paused = await page.locator('#rl-metrics').innerText();
  await page.waitForTimeout(600); assert.equal(await page.locator('#rl-metrics').innerText(), paused);
  await page.locator('#rl-run').click();
  await page.locator('#regTask').click();
  await page.locator('#rlTask').click();
  assert.equal(await page.locator('#rl-run').isEnabled(), true);
  const beforeSpeedChange = await page.locator('#rl-metrics').innerText();
  await page.locator('#rl-speed').selectOption('50');
  assert.equal(await page.locator('#rl-metrics').innerText(), beforeSpeedChange);
  console.log('PASS Bandit algorithms, comparison, reset and pause');
  await page.locator('[data-lesson="maze"]').click();
  await page.locator('#rl-speed').selectOption('50');
  await page.locator('#rl-run').click();
  await waitForText('#rl-status', '学習完了');
  assert.equal(await page.locator('#rl-detail tbody tr').count(), 25);
  await page.locator('[data-state="7"]').click();
  await waitForText('#rl-detail h3', '選択中：S7');
  const table = await page.locator('#rl-detail tbody').innerText();
  await page.screenshot({ path: '.cache/qa/screenshots/maze.png', fullPage: true });
  await page.locator('#rl-play').click();
  await waitForText('#rl-status', 'Evaluation');
  await page.locator('#rl-pause').click();
  await page.locator('#rl-play').click();
  await waitForText('#rl-status', 'Goal到達');
  assert.equal(await page.locator('#rl-detail tbody').innerText(), table);
  await page.locator('#rl-reset').click();
  assert.ok(!(await page.locator('#rl-detail tbody').innerText()).includes('9.90'));
  console.log('PASS Maze training, selected Q values, policy evaluation, replay pause and reset');
  await page.locator('#rl-run').click();
  await page.locator('#rl-regenerate').click();
  assert.equal(await page.locator('#rl-preset').inputValue(), 'random');
  assert.equal(await page.locator('#rl-seed').inputValue(), '43');
  await page.locator('#rl-run:not([disabled])').waitFor();
  const layout = () => page.locator('[data-state]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label').replace(' Agent', '')));
  const generated = await layout();
  assert.equal(await page.locator('#rl-detail tbody td').evaluateAll(nodes => nodes.every(node => node.textContent === '0.00')), true);
  await page.locator('#rl-reset').click();
  assert.deepEqual(await layout(), generated);
  await page.locator('#rl-regenerate').click();
  assert.notDeepEqual(await layout(), generated);
  await number('seed', 43);
  assert.deepEqual(await layout(), generated);
  await page.locator('#rl-run').click();
  await waitForText('#rl-status', '学習完了');
  await page.locator('#rl-play').click();
  await waitForText('#rl-status', 'Goal到達');
  assert.deepEqual(await layout(), generated);
  await page.locator('#rl-play').click();
  await waitForText('#rl-status', 'Evaluation');
  await page.locator('#rl-regenerate').click();
  await page.locator('#rl-run:not([disabled])').waitFor();
  assert.equal(await page.locator('#rl-play').isDisabled(), true);
  await page.locator('#rl-preset').selectOption('basic');
  assert.notDeepEqual(await layout(), generated);
  console.log('PASS random regeneration during training/replay, Seed reproducibility, reset and Goal arrival');
  await page.locator('[data-lesson="snake"]').click();
  await number('limit', 100);
  await page.locator('#rl-speed').selectOption('50');
  await page.locator('#rl-run').click(); await waitForText('#rl-status', '学習完了');
  assert.equal(await page.locator('.rl-snake > div').count(), 64);
  await page.locator('#rl-play').click(); await waitForText('#rl-status', 'Evaluation');
  await page.screenshot({ path: '.cache/qa/screenshots/snake.png', fullPage: true });
  await page.locator('#rl-pause').click();
  await page.locator('#rl-reset').click();
  assert.equal(await page.locator('.rl-snake .body').count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const kind of ['bandit', 'maze', 'snake']) {
    await page.locator(`[data-lesson="${kind}"]`).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${kind} should fit mobile width`);
  }
  await page.screenshot({ path: '.cache/qa/screenshots/mobile.png', fullPage: true });
  await page.locator('#regTask').click(); await trainExisting();
  assert.equal(await page.locator('#reinforcement').isVisible(), false);
  assert.equal(await page.locator('#regTask').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
  console.log('PASS Snake, mobile overflow, return to existing workspace; no browser errors');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
