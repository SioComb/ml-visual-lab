import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWineCSV } from '../dist/dimension/data.js';
import { stratifiedSplit, fitStandardScaler, fitPCA, softmax, fitSoftmaxRegression, compareWine } from '../dist/dimension/math.js';

const csv = readFileSync(new URL('../dist/dimension/data/wine.csv', import.meta.url), 'utf8');
const records = parseWineCSV(csv);
const result = compareWine(records);
const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≉ ${b}`);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

test('Wine CSV validates all 178 rows, 13 features, and three classes', () => {
  assert.equal(records.length, 178);
  assert.ok(records.every(r => r.values.length === 13 && r.values.every(Number.isFinite)));
  assert.deepEqual([0, 1, 2].map(c => records.filter(r => r.target === c).length), [59, 71, 48]);
  for (const replacement of ['', 'NaN', 'Infinity', 'abc', '1,2']) assert.throws(() => parseWineCSV(csv.replace('14.23', replacement)));
  assert.throws(() => parseWineCSV(csv.replace('alcohol', 'unknown')));
  assert.throws(() => parseWineCSV(csv.replace(/,0\r?\n/, ',3\n')));
  assert.throws(() => parseWineCSV(csv.trim().split(/\r?\n/).slice(0, -1).join('\n')));
  assert.throws(() => parseWineCSV(csv.replace(/,2(\r?\n|$)/g, ',1$1')));
  assert.deepEqual(parseWineCSV('\uFEFF' + csv), records);
});

test('stratification is deterministic, exhaustive, disjoint, and leaves input untouched', () => {
  const original = structuredClone(records), split = stratifiedSplit(records);
  assert.deepEqual(split, stratifiedSplit(records, 0.3, 42));
  assert.notDeepEqual(split, stratifiedSplit(records, 0.3, 43));
  assert.deepEqual(records, original);
  const trainIDs = new Set(split.train.map(r => r.id));
  assert.ok(split.test.every(r => !trainIDs.has(r.id)));
  assert.equal(split.train.length + split.test.length, 178);
  for (const c of [0, 1, 2]) {
    assert.ok(split.train.some(r => r.target === c));
    assert.ok(split.test.some(r => r.target === c));
  }
  assert.throws(() => stratifiedSplit(records, 0));
});

test('scaler fits only train statistics and rejects invalid or constant columns', () => {
  const scaler = result.scaler;
  const scaled = scaler.transformAll(result.split.train.map(r => r.values));
  for (let j = 0; j < 13; j++) {
    close(scaled.reduce((s, r) => s + r[j], 0) / scaled.length, 0);
    close(scaled.reduce((s, r) => s + r[j] ** 2, 0) / scaled.length, 1);
  }
  const row = result.split.test[0].values;
  scaler.transform(row).forEach((v, j) => close(v, (row[j] - scaler.mean[j]) / scaler.scale[j]));
  assert.throws(() => fitStandardScaler([[1, 1], [1, 2]]));
  assert.throws(() => fitStandardScaler([[0.1], [0.1], [0.1]]));
  assert.throws(() => fitStandardScaler([[1], [Infinity]]));
  assert.throws(() => fitStandardScaler([[1, 2], [3]]));
});

test('Jacobi PCA recovers known eigenpairs and centers transformations', () => {
  const pca = fitPCA([[3, 3], [1, 1], [2, 2]], 2);
  close(pca.eigenvalues[0], 2);
  close(pca.eigenvalues[1], 0);
  close(Math.abs(pca.components[0][0]), Math.SQRT1_2);
  close(pca.explainedVarianceRatio[0], 1);
  pca.transform([2, 2]).forEach(v => close(v, 0));
  assert.throws(() => fitPCA([[1], [2]], 2));
});

test('Wine PCA has sorted eigenvalues, orthonormal signed axes, and plausible variance', () => {
  const pca = result.pca;
  assert.ok(pca.eigenvalues.every((v, i, a) => Number.isFinite(v) && v >= 0 && (!i || a[i - 1] >= v)));
  for (const vector of pca.components) {
    close(dot(vector, vector), 1);
    const pivot = vector.reduce((best, v, j) => Math.abs(v) > Math.abs(vector[best]) ? j : best, 0);
    assert.ok(vector[pivot] > 0);
  }
  close(dot(...pca.components), 0);
  assert.ok(result.projected.every(r => r.length === 2 && r.every(Number.isFinite)));
  assert.ok(pca.explainedVarianceRatio.every(v => v >= 0 && v <= 1));
  close(pca.explainedVarianceRatio.reduce((s, v) => s + v, 0), 1);
  const cumulative = pca.explainedVarianceRatio[0] + pca.explainedVarianceRatio[1];
  assert.ok(cumulative > 0.50 && cumulative < 0.60);
  // Check the eigen-equation C v = lambda v, not only vector normalization.
  const train = result.scaler.transformAll(result.split.train.map(r => r.values));
  pca.components.forEach((v, k) => {
    v.forEach((value, j) => {
      const cv = train.reduce((sum, row) => sum + row[j] * dot(row, v), 0) / (train.length - 1);
      close(cv, pca.eigenvalues[k] * value);
    });
  });
});

test('softmax is stable and both trained models yield normalized finite probabilities', () => {
  const extreme = softmax([10000, 9999, -10000]);
  close(extreme.reduce((s, v) => s + v, 0), 1);
  assert.ok(extreme.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  assert.throws(() => softmax([Infinity, 1, 2]));
  for (const model of [result.full, result.reduced]) {
    assert.ok(model.history.every(Number.isFinite));
    assert.ok(model.history.at(-1) < model.history[0]);
    assert.ok(model.weights.flat().concat(model.intercepts).every(Number.isFinite));
    for (const record of result.split.test) {
      let row = result.scaler.transform(record.values);
      if (model === result.reduced) row = result.pca.transform(row);
      const probabilities = model.predictProba(row);
      close(probabilities.reduce((s, v) => s + v, 0), 1);
      assert.ok(probabilities.every(v => v >= 0 && v <= 1));
      assert.equal(model.predict(row), probabilities.indexOf(Math.max(...probabilities)));
    }
  }
  assert.throws(() => fitSoftmaxRegression([[1], [2], [3]], [0, 1, 2], { learningRate: Infinity }));
});

test('comparison evaluates identical held-out rows with accurate confusion matrices', () => {
  assert.ok(result.fullEvaluation.accuracy >= 0.9);
  assert.ok(result.reducedEvaluation.accuracy >= 0.85);
  assert.ok(result.fullEvaluation.accuracy >= result.reducedEvaluation.accuracy);
  for (const [model, evaluation] of [[result.full, result.fullEvaluation], [result.reduced, result.reducedEvaluation]]) {
    assert.equal(evaluation.count, result.split.test.length);
    assert.ok(evaluation.accuracy >= 0 && evaluation.accuracy <= 1);
    assert.equal(evaluation.confusion.flat().reduce((s, v) => s + v, 0), evaluation.count);
    assert.equal(evaluation.confusion.reduce((sum, row, i) => sum + row.reduce((s, v, j) => s + (i === j ? 0 : v), 0), 0), evaluation.errors);
    result.split.test.forEach((record, i) => {
      const row = result.scaler.transform(record.values);
      assert.equal(evaluation.predictions[i], model.predict(model === result.full ? row : result.pca.transform(row)));
    });
  }
});

test('altering held-out values and labels leaves scaler, PCA, and both fitted models unchanged', () => {
  const testIDs = new Set(result.split.test.map(r => r.id));
  const changed = records.map(r => testIDs.has(r.id)
    ? { ...r, target: (r.target + 1) % 3, values: r.values.map(v => v * 100 + 999) } : r);
  const byID = new Map(changed.map(r => [r.id, r]));
  const split = { train: result.split.train, test: result.split.test.map(r => byID.get(r.id)) };
  const other = compareWine(changed, split);
  assert.deepEqual(other.scaler.mean, result.scaler.mean);
  assert.deepEqual(other.scaler.scale, result.scaler.scale);
  assert.deepEqual(other.pca.components, result.pca.components);
  assert.deepEqual(other.pca.eigenvalues, result.pca.eigenvalues);
  for (const name of ['full', 'reduced']) {
    assert.deepEqual(other[name].weights, result[name].weights);
    assert.deepEqual(other[name].intercepts, result[name].intercepts);
  }
});
