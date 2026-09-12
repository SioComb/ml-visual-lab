import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { datasets, readDataset } from '../dist/nlp/data.js';
import { tokenize, buildVocabulary, vectorize, trainModel, predict, evaluate } from '../dist/nlp/model.js';

test('Japanese tokenization normalizes width/case and removes punctuation', () => {
  assert.deepEqual(tokenize('ＡＰＰ app、温泉！ 123'), ['app', 'app', '温泉', '123']);
  assert.deepEqual(tokenize(' ！？🎉 '), []);
  assert.deepEqual(tokenize('北海道へ旅行して温泉に入りたい').filter(t => ['北海道', '旅行', '温泉'].includes(t)), ['北海道', '旅行', '温泉']);
});

test('BoW counts repeated words, fixes feature positions, and discards order and unknown words', () => {
  const vocabulary = buildVocabulary(['旅行 温泉 料理']);
  const vector = vectorize(tokenize('旅行 温泉 旅行 未知語'), vocabulary);
  assert.equal(vector.find(([i]) => vocabulary[i] === '旅行')[1], 2);
  assert.equal(vector.find(([i]) => vocabulary[i] === '温泉')[1], 1);
  assert.equal(vector.length, 2);
  assert.deepEqual(vector, vectorize(tokenize('旅行 旅行 温泉'), vocabulary));
  assert.deepEqual(vectorize(tokenize('未知語'), vocabulary), []);
});

for (const kind of Object.keys(datasets)) {
  test(`${kind}: actual CSV splits, learned predictions, probabilities and contributions`, () => {
    const csv = readFileSync(new URL(`../dist/nlp/csv/${datasets[kind].file}`, import.meta.url), 'utf8');
    const dataset = readDataset(csv, kind);
    assert.equal(dataset.records.length, 5000);
    assert.equal(dataset.train.length, 4000);
    assert.equal(dataset.classes.length, kind === 'sentiment' ? 2 : 5);
    const progress = [];
    const model = trainModel(dataset.train, dataset.classes, p => progress.push(p));
    assert.ok(progress.at(-1).loss < progress[0].loss);
    assert.equal(progress.at(-1).epoch, 180);
    assert.deepEqual(model.vocabulary, buildVocabulary(dataset.train.map(row => row.text)));
    for (const split of ['validation', 'test']) {
      const result = evaluate(model, dataset.records.filter(row => row.split === split));
      assert.equal(result.count, 500);
      // The larger corpora include more varied language. Require a clear gain
      // over always predicting the most frequent training class.
      const majorityRate = Math.max(...dataset.classes.map(c => dataset.train.filter(row => row.code === c.code).length)) / dataset.train.length;
      assert.ok(result.accuracy > majorityRate + 0.4, `${split} accuracy: ${result.accuracy}`);
    }
    const output = predict(model, datasets[kind].examples[0]);
    assert.equal(model.classes[output.winner].label, kind === 'sentiment' ? '高評価' : '旅行・観光');
    assert.ok(Math.abs(output.probabilities.reduce((sum, p) => sum + p, 0) - 1) < 1e-12);
    assert.ok(output.probabilities.every(p => Number.isFinite(p) && p >= 0 && p <= 1));
    assert.equal(output.contributions.length, output.vector.length);
    for (const c of output.contributions) assert.equal(c.contribution, c.count * c.weight);
    const reconstructedScore = output.bias + output.contributions.reduce((sum, c) => sum + c.contribution, 0);
    const score = output.vector.reduce((sum, [i, count]) => sum + count * model.weights[output.winner][i], model.bias[output.winner]);
    assert.ok(Math.abs(reconstructedScore - score) < 1e-12);
    const empty = predict(model, '🛸！？');
    assert.equal(empty.vector.length, 0);
    assert.equal(empty.contributions.length, 0);
    assert.ok(empty.probabilities.every(Number.isFinite));
    const repeated = predict(model, '旅行 '.repeat(500));
    assert.ok(repeated.probabilities.every(Number.isFinite));
    assert.deepEqual(evaluate(model, []), { count: 0, accuracy: null });
  });
}

test('held-out text and metadata never become training vocabulary', () => {
  const header = 'text,label,split';
  const csv = [header, ...Array.from({ length: 12 }, (_, i) => `旅行 温泉,${i % 2},train`), '秘密語,0,test'].join('\n');
  const dataset = readDataset(csv, 'sentiment');
  const model = trainModel(dataset.train, dataset.classes);
  assert.deepEqual(model.vocabulary, buildVocabulary(['旅行 温泉']));
  assert.equal(predict(model, '秘密語').vector.length, 0);
  assert.throws(() => readDataset(csv.replace('text,label,split', 'text,wrong,split'), 'sentiment'), /必要な列/);
  assert.throws(() => readDataset(csv.replace('秘密語,0,test', '秘密語,9,test'), 'sentiment'), /ラベル/);
  assert.throws(() => readDataset(csv.replace('秘密語,0,test', '秘密語,0,invalid'), 'sentiment'), /split/);
});
