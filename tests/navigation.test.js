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

test('navigation groups all nine algorithms into basic and applied rows', () => {
  const basic = section('basicAlgorithmsTitle');
  const applied = section('appliedAlgorithmsTitle');

  for (const label of ['回帰', '分類', 'クラスタリング', '次元圧縮']) {
    assert.match(basic, new RegExp(label));
  }
  for (const label of [
    '強化学習',
    'Association',
    '自然言語処理',
    'Researcher',
    'ブースティング',
  ]) {
    assert.match(applied, new RegExp(label));
  }
  assert.equal((basic.match(/<button/g) ?? []).length, 4);
  assert.equal((applied.match(/<button/g) ?? []).length, 5);
  assert.ok(
    applied.indexOf('自然言語処理') > applied.indexOf('ブースティング'),
    '自然言語処理 should be the final applied algorithm',
  );
});

test('planned algorithms are visible but disabled until implemented', () => {
  for (const label of ['次元圧縮', 'Researcher', 'ブースティング']) {
    const button = html.match(new RegExp(`<button[^>]*disabled[^>]*>[\\s\\S]*?${label}[\\s\\S]*?</button`));
    assert.ok(button, `${label} should be a disabled navigation item`);
    assert.match(button[0], /準備中/);
  }
});
