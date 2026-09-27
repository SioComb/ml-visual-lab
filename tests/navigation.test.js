import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

function section(id) {
  const start = html.indexOf(`aria-labelledby="${id}"`);
  assert.notEqual(start, -1, `${id} section should exist`);
  const end = html.indexOf('</section', start);
  return html.slice(start, end);
}

test('navigation groups algorithms into basic, exploration, and advanced rows', () => {
  const basic = section('basicAlgorithmsTitle');
  const exploration = section('explorationAlgorithmsTitle');
  const advanced = section('advancedAlgorithmsTitle');

  for (const label of ['回帰', '分類', 'クラスタリング', '次元圧縮']) {
    assert.match(basic, new RegExp(label));
  }
  for (const label of ['Bandit Algorism', 'Thompson Sampling', 'Q-Learning'])
    assert.match(exploration, new RegExp(label));
  for (const label of ['Association', 'NLP', 'Boosting'])
    assert.match(advanced, new RegExp(label));
  assert.equal((basic.match(/<button/g) ?? []).length, 4);
  assert.equal((exploration.match(/<button/g) ?? []).length, 3);
  assert.equal((advanced.match(/<button/g) ?? []).length, 3);
  assert.ok(advanced.indexOf('Association') < advanced.indexOf('NLP'));
  assert.ok(advanced.indexOf('NLP') < advanced.indexOf('Boosting'));
});

test('Boosting opens XGBoost from advanced navigation and PCA remains enabled', () => {
  const xgboostButton = section('advancedAlgorithmsTitle').match(/<button[^>]*id="xgboostTask"[^>]*>[\s\S]*?<\/button/);
  assert.ok(xgboostButton);
  assert.match(xgboostButton[0], /Boosting[\s\S]*?XGBoost/);
  assert.match(xgboostButton[0], /aria-pressed="false"/);
  assert.doesNotMatch(xgboostButton[0], /disabled|準備中/);
  assert.doesNotMatch(section('basicAlgorithmsTitle'), /xgboostTask/);
  const pcaButton = section('basicAlgorithmsTitle').match(/<button[^>]*id="pcaTask"[^>]*>[\s\S]*?<\/button/);
  assert.ok(pcaButton, 'PCA should have a direct navigation target');
  assert.match(pcaButton[0], /次元圧縮[\s\S]*?PCA/);
  assert.match(pcaButton[0], /aria-pressed="false"/);
  assert.doesNotMatch(pcaButton[0], /disabled|準備中/);
});

test('implemented advertising lesson is available from top navigation', () => {
  const button = html.match(
    /<button[^>]*id="adsTask"[^>]*>[\s\S]*?Thompson Sampling[\s\S]*?広告配信[\s\S]*?<\/button/,
  );
  assert.ok(button);
  assert.doesNotMatch(button[0], /disabled|準備中/);
});

test('Bandit and Q-Learning have direct top-navigation targets', () => {
  assert.match(html, /id="rlTask"[\s\S]*?Bandit Algorism[\s\S]*?01 バンディット/);
  assert.match(html, /id="qlearningTask"[\s\S]*?Q-Learning[\s\S]*?迷路とヘビゲーム/);
});
