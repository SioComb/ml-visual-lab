import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, splitDataset, datasets } from '../dist/boosting/data.js';
import { trainBoosting, fitStump, predictStump } from '../dist/boosting/model.js';
import { pointRadius } from '../dist/boosting/charts.js';

const read = kind => parseCSV(readFileSync(new URL(`../dist/boosting/data/${kind}.csv`, import.meta.url), 'utf8'));
const sum = values => values.reduce((a, b) => a + b, 0);
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('CSV parsing rejects missing/nonfinite fields, wrong classes, and wrong headers', () => {
  for (const text of ['a,b,c\n1,2,0', 'x1,x2,target\n,2,0', 'x1,x2,target\nInfinity,2,0', 'x1,x2,target\n1,2,2'])
    assert.throws(() => parseCSV(text));
});

for (const kind of Object.keys(datasets)) {
  test(`${kind}: supplied CSV, deterministic disjoint split, genuine saved stage predictions`, () => {
    const records = read(kind);
    assert.equal(records.length, 1000);
    const { train, test: heldout } = splitDataset(records);
    assert.equal(train.length, 750); assert.equal(heldout.length, 250);
    assert.deepEqual(splitDataset(records), { train, test: heldout });
    assert.equal(new Set([...train, ...heldout].map(r => r.id)).size, 1000);
    const result = trainBoosting(train, heldout);
    assert.equal(result.stages.length, 50);
    const scores = heldout.map(() => 0);
    result.stages.forEach((stage, i) => {
      close(sum(stage.weightsBefore), 1); close(sum(stage.weightsAfter), 1);
      assert.ok(stage.alpha > 0 && Number.isFinite(stage.alpha));
      assert.ok(stage.weightsAfter.every(w => Number.isFinite(w) && w >= 0));
      if (i) assert.deepEqual(stage.weightsBefore, result.stages[i - 1].weightsAfter);
      close(stage.error, sum(stage.train.weak.wrong.map(j => stage.weightsBefore[j])));
      close(stage.alpha, 0.5 * Math.log((1 - stage.error) / stage.error));
      heldout.forEach((r, j) => { scores[j] += stage.alpha * (2 * predictStump(stage.stump, r.x) - 1); });
      assert.deepEqual(stage.test.predictions, scores.map(s => s >= 0 ? 1 : 0));
      close(stage.test.accuracy, 1 - stage.test.wrong.length / heldout.length);
      for (const j of [0, 105, 2399]) {
        const score = result.stages.slice(0, i + 1).reduce((s, st) => s + st.alpha * (2 * predictStump(st.stump, result.grid.points[j]) - 1), 0);
        assert.equal(stage.grid[j], score >= 0 ? 1 : 0);
      }
    });
    assert.deepEqual(result.baseline.test, {
      predictions: result.stages[0].test.predictions,
      wrong: result.stages[0].test.wrong,
      accuracy: result.stages[0].test.accuracy,
    });
    const first = result.stages[0], wrong = first.train.weak.wrong[0];
    assert.ok(first.weightsAfter[wrong] > first.weightsBefore[wrong]);
    assert.ok(result.stages.some((stage, i) => i && stage.test.accuracy < result.stages[i - 1].test.accuracy), 'raw accuracy includes declines');
  });
}

test('fitting minimizes weighted error across thresholds and both leaf labels', () => {
  const rows = [{x:[0,2],target:0},{x:[0,1],target:1},{x:[2,1],target:0},{x:[3,3],target:1}];
  const weights = [0.1, 0.4, 0.2, 0.3];
  let best = 1;
  for (const feature of [0, 1]) for (const threshold of [-1, 0.5, 1.5, 2.5, 4])
    for (const left of [0, 1]) for (const right of [0, 1]) {
      const stump = { feature, threshold, left, right };
      best = Math.min(best, sum(rows.map((r, i) => predictStump(stump, r.x) === r.target ? 0 : weights[i])));
    }
  close(fitStump(rows, weights).error, best);
});

test('zero-error and no-edge stumps stop safely; constant features cannot make a fake split', () => {
  const separable = [{ x: [0,0], target: 0 }, { x: [1,1], target: 1 }];
  const perfect = trainBoosting(separable, separable);
  assert.equal(perfect.stopReason, 'perfect'); assert.equal(perfect.stages.length, 1);
  assert.equal(perfect.stages[0].test.accuracy, 1);
  assert.ok(Number.isFinite(perfect.stages[0].alpha));
  const identical = separable.map(r => ({ ...r, x: [0,0] }));
  const chance = trainBoosting(identical, identical);
  assert.equal(chance.stopReason, 'no-edge'); assert.equal(chance.stages.length, 0);
  assert.equal(chance.baseline.stump.feature, -1);
});

test('test labels never affect fitted models or sample weights; learning rate scales alpha', () => {
  const { train, test: heldout } = splitDataset(read('moons'));
  const a = trainBoosting(train, heldout, { nEstimators: 3, learningRate: 0.3 });
  const b = trainBoosting(train, heldout.map(r => ({ ...r, target: 1 - r.target })), { nEstimators: 3, learningRate: 0.3 });
  a.stages.forEach((s, i) => {
    assert.deepEqual(s.stump, b.stages[i].stump);
    assert.deepEqual(s.weightsAfter, b.stages[i].weightsAfter);
    close(s.alpha, 0.3 * 0.5 * Math.log((1 - s.error) / s.error));
  });
  const c = trainBoosting(train, heldout, { nEstimators: 200, learningRate: 2 });
  assert.ok(c.stages.every(s => s.weightsAfter.every(Number.isFinite)));
  assert.throws(() => trainBoosting(train, heldout, { learningRate: 0 }));
});

test('point area tracks weights on the same scale until the documented cap', () => {
  close(pointRadius(4 / 750, 750) ** 2 / pointRadius(1 / 750, 750) ** 2, 4);
  assert.equal(pointRadius(1, 750), 12);
});
