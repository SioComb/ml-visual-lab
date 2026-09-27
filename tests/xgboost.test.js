import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLearningCSV, splitLearningData, trainMedians, datasets } from '../dist/boosting/data.js';
import { createSession, fitTree, metrics, predictTree, sigmoid, splitGain, traceTree } from '../dist/boosting/model.js';

const options = { mode: 'two', plotIndices: [0, 1], learningRate: 0.3, maxDepth: 2, lambda: 1, gamma: 0 };
const rows = (name) => parseLearningCSV(readFileSync(new URL(`../dist/boosting/data/${name}.csv`, import.meta.url), 'utf8'));

test('three supplied CSVs use named features, valid targets and deterministic disjoint splits', () => {
  for (const name of datasets) {
    const data = rows(name);
    assert.deepEqual(data.features, ['x1', 'x2']);
    assert.equal(data.records.length, 1000);
    const a = splitLearningData(data.records), b = splitLearningData(data.records);
    assert.equal(a.train.length, 800);
    assert.equal(a.valid.length, 200);
    assert.deepEqual(a, b);
    assert.equal(new Set([...a.train, ...a.valid].map((row) => row.id)).size, 1000);
    const medians = trainMedians(a.train);
    const changedValid = a.valid.map((row) => ({ ...row, x: [1e9, 1e9], target: 1 - row.target }));
    assert.deepEqual(trainMedians(a.train), medians);
    assert.equal(createSession(a.train, changedValid, options).initialScore, createSession(a.train, a.valid, options).initialScore);
  }
});

test('CSV errors identify missing columns, invalid values and targets', () => {
  const text = readFileSync(new URL('../dist/boosting/data/moons.csv', import.meta.url), 'utf8');
  assert.throws(() => parseLearningCSV(text.replace('x2', 'other')), /列が不足/);
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const invalid = lines.slice(); invalid[1] = invalid[1].replace(/^[^,]+/, 'not-a-number');
  assert.throws(() => parseLearningCSV(invalid.join('\n')), /数値/);
  assert.throws(() => parseLearningCSV(text.replace(/,1\r?\n/, ',2\n')), /target/);
});

test('exact split, Newton leaf and gain match hand calculations', () => {
  const data = Array.from({ length: 8 }, (_, i) => ({ x: [i, 0], target: i >= 4 ? 1 : 0 }));
  const g = [0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5], h = Array(8).fill(0.25);
  const tree = fitTree(data, g, h, { ...options, maxDepth: 1 });
  assert.equal(tree.threshold, 3.5);
  assert.equal(tree.gain, splitGain(2, 1, -2, 1, 1, 0));
  assert.equal(tree.left.value, -1);
  assert.equal(tree.right.value, 1);
  assert.equal(traceTree(tree, [0, 0]).leaf, predictTree(tree, [0, 0]));
  assert.equal(fitTree(data, g, h, { ...options, gamma: 3 }).left, undefined);
});

test('60 trees retain exact score and metric histories without validation training', () => {
  const { train, valid } = splitLearningData(rows('classification').records);
  const session = createSession(train, valid, options);
  let stage;
  for (let i = 0; i < 60; i++) {
    stage = session.step();
    assert.equal(stage.number, i + 1);
    assert.equal(stage.valid.matrix.flat().reduce((a, b) => a + b), valid.length);
    assert.ok(Number.isFinite(stage.train.loss) && Number.isFinite(stage.valid.loss));
  }
  const index = 17;
  const score = session.initialScore + session.trees.reduce((sum, tree) => sum + options.learningRate * predictTree(tree, valid[index].x), 0);
  assert.ok(Math.abs(score - stage.validScores[index]) < 1e-9);
  assert.ok(Math.abs(sigmoid(score) - stage.valid.probabilities[index]) < 1e-9);
  assert.equal(metrics(valid, stage.validScores).accuracy, stage.valid.accuracy);
  assert.throws(() => session.step(), /最大60本/);
});
