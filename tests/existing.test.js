import test from 'node:test';
import assert from 'node:assert/strict';
import { trainModel, sample } from '../dist/ml.js';

const base = { x: 0, x2: 1, target: 2, test: 25, degree: 3, k: 7, trees: 10, depth: 4, kernel: 'rbf', c: 1, gamma: 1, epsilon: 0.1, clusters: 3, linkage: 'ward', scaling: 'standard', oneHot: true, categoryColumns: [] };
for (const [task, algorithms, kind] of [
  ['regression', ['linear', 'polynomial', 'forest', 'svr'], 'linear'],
  ['classification', ['logistic', 'knn', 'forest', 'svm'], 'moons'],
  ['clustering', ['kmeans', 'hierarchical'], 'clusters'],
]) for (const algorithm of algorithms) test(`Existing ${task} / ${algorithm} trains on sample data`, () => {
  const data = sample(kind, 18, task);
  const result = trainModel(data, { ...base, task, algorithm, target: data.headers.length - 1 });
  if (task === 'clustering') {
    assert.equal(result.points.length, data.rows.length);
    assert.equal(new Set(result.points.map(p => p.cluster)).size, 3);
  } else {
    assert.ok(result.test.length > 0);
    assert.ok(result.test.every(p => p.pred !== undefined));
    if (task === 'regression') assert.ok(result.test.every(p => Number.isFinite(p.pred)));
  }
});
for (const scaling of ['none', 'standard', 'minmax']) test(`Existing One-hot and ${scaling} feature preprocessing`, () => {
  const data = sample('category', 18, 'classification');
  const result = trainModel(data, { ...base, task: 'classification', algorithm: 'knn', target: data.headers.length - 1, scaling, categoryColumns: [0] });
  assert.ok(result.preprocessing.outputNames.length > 2);
  assert.ok(result.preprocessing.rows.every(row => row.values.every(Number.isFinite)));
  assert.ok(result.test.length > 0);
});
