import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

function panel(id) {
  const start = html.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `${id} panel should exist`);
  const end = html.indexOf('</section', start);
  return html.slice(start, end);
}

test('navigation uses category tabs with one compact submenu panel per category', () => {
  assert.match(html, /class="category-tabs" role="tablist"/);
  for (const [tab, controls, label] of [
    ['basicCategory', 'basicAlgorithms', '基本アルゴリズム'],
    ['explorationCategory', 'explorationAlgorithms', '強化学習・探索'],
    ['advancedCategory', 'advancedAlgorithms', '発展・応用'],
  ]) {
    assert.match(
      html,
      new RegExp(`id="${tab}"[\\s\\S]*?role="tab"[\\s\\S]*?aria-controls="${controls}"[\\s\\S]*?${label}`),
    );
  }
  const basic = panel('basicAlgorithms');
  const exploration = panel('explorationAlgorithms');
  const advanced = panel('advancedAlgorithms');

  for (const label of ['回帰', '分類', 'クラスタリング', '次元圧縮']) {
    assert.match(basic, new RegExp(label));
  }
  for (const label of ['Bandit Algorithm', 'Thompson Sampling', 'Q-Learning'])
    assert.match(exploration, new RegExp(label));
  for (const label of ['Association', 'NLP', 'Boosting'])
    assert.match(advanced, new RegExp(label));
  assert.equal((basic.match(/<button/g) ?? []).length, 4);
  assert.equal((exploration.match(/<button/g) ?? []).length, 3);
  assert.equal((advanced.match(/<button/g) ?? []).length, 3);
  assert.ok(advanced.indexOf('Association') < advanced.indexOf('NLP'));
  assert.ok(advanced.indexOf('NLP') < advanced.indexOf('Boosting'));
  assert.doesNotMatch(html, /algorithm-group-number|機械学習の基本的な考え方を学ぶ|行動と報酬からよりよい選択を学ぶ|基本を組み合わせて実践的な課題を解く/);
});

test('Boosting opens XGBoost from advanced navigation and PCA remains enabled', () => {
  const xgboostButton = panel('advancedAlgorithms').match(/<button[^>]*id="xgboostTask"[^>]*>[\s\S]*?<\/button/);
  assert.ok(xgboostButton);
  assert.match(xgboostButton[0], /Boosting/);
  assert.match(xgboostButton[0], /aria-pressed="false"/);
  assert.doesNotMatch(xgboostButton[0], /disabled|準備中/);
  assert.doesNotMatch(panel('basicAlgorithms'), /xgboostTask/);
  const pcaButton = panel('basicAlgorithms').match(/<button[^>]*id="pcaTask"[^>]*>[\s\S]*?<\/button/);
  assert.ok(pcaButton, 'PCA should have a direct navigation target');
  assert.match(pcaButton[0], /次元圧縮/);
  assert.match(pcaButton[0], /aria-pressed="false"/);
  assert.doesNotMatch(pcaButton[0], /disabled|準備中/);
});

test('implemented advertising lesson is available from top navigation', () => {
  const button = html.match(
    /<button[^>]*id="adsTask"[^>]*>[\s\S]*?Thompson Sampling[\s\S]*?<\/button/,
  );
  assert.ok(button);
  assert.doesNotMatch(button[0], /disabled|準備中/);
});

test('Bandit and Q-Learning have direct top-navigation targets', () => {
  assert.match(html, /id="rlTask"[\s\S]*?Bandit Algorithm[\s\S]*?<\/button/);
  assert.match(html, /id="qlearningTask"[\s\S]*?Q-Learning[\s\S]*?<\/button/);
});
