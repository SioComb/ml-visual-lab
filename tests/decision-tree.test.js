import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { fitDecisionTree, fitForest } from '../dist/advanced.js';
import { sample, trainModel } from '../dist/ml.js';

const classificationRows = [
  { x: [0], y: 'A' },
  { x: [1], y: 'A' },
  { x: [2], y: 'B' },
  { x: [3], y: 'B' },
  { x: [4], y: 'A' },
  { x: [5], y: 'A' },
];

test('Decision Tree Classifier separates simple classes with Gini metadata', () => {
  const rows = [
      { x: [0], y: 'A' },
      { x: [1], y: 'A' },
      { x: [2], y: 'B' },
      { x: [3], y: 'B' },
    ],
    model = fitDecisionTree(
      rows,
      { task: 'classification', depth: 3 },
      ['A', 'B'],
      [{ name: 'X1' }],
    );
  assert.deepEqual(rows.map((row) => model.predict(row.x).label), [
    'A',
    'A',
    'B',
    'B',
  ]);
  assert.equal(model.root.featureName, 'X1');
  assert.equal(model.root.samples, 4);
  assert.equal(model.root.gini, 0.5);
  assert.deepEqual(model.root.classCounts, [
    { label: 'A', count: 2 },
    { label: 'B', count: 2 },
  ]);
});

test('max_depth=1 limits depth, and a larger depth can add nodes', () => {
  const shallow = fitDecisionTree(
      classificationRows,
      { task: 'classification', depth: 1 },
      ['A', 'B'],
    ),
    deep = fitDecisionTree(
      classificationRows,
      { task: 'classification', depth: 3 },
      ['A', 'B'],
    );
  assert.equal(shallow.info.treeDepth, 1);
  assert.ok(deep.info.treeDepth <= 3);
  assert.ok(deep.info.nodeCount > shallow.info.nodeCount);
});

test('Decision Tree training is reproducible for identical data and settings', () => {
  const options = { task: 'classification', depth: 3, minSamplesSplit: 2 },
    first = fitDecisionTree(classificationRows, options, ['A', 'B']),
    second = fitDecisionTree(classificationRows, options, ['A', 'B']);
  assert.deepEqual(first.root, second.root);
  assert.deepEqual(
    classificationRows.map((row) => first.predict(row.x)),
    classificationRows.map((row) => second.predict(row.x)),
  );
});

test('Decision Tree Regressor leaves predict their training-target mean', () => {
  const rows = [
      { x: [0], y: 0 },
      { x: [1], y: 2 },
      { x: [2], y: 10 },
      { x: [3], y: 14 },
    ],
    model = fitDecisionTree(rows, { task: 'regression', depth: 1 });
  assert.equal(model.info.treeDepth, 1);
  assert.equal(model.root.left.prediction, 1);
  assert.equal(model.root.right.prediction, 12);
  assert.equal(model.predict([0.5]), 1);
  assert.equal(model.predict([2.5]), 12);
  assert.ok(Number.isFinite(model.root.mse));
});

test('Decision Tree Regressor produces a step function and applies max_depth', () => {
  const rows = Array.from({ length: 12 }, (_, x) => ({
      x: [x],
      y: x < 4 ? 2 : x < 8 ? 7 : 15,
    })),
    model = fitDecisionTree(rows, { task: 'regression', depth: 2 }),
    predictions = Array.from({ length: 23 }, (_, index) =>
      model.predict([index / 2]),
    );
  assert.ok(model.info.treeDepth <= 2);
  assert.ok(new Set(predictions).size >= 3);
  assert.ok(
    predictions.some(
      (value, index) => index > 0 && value === predictions[index - 1],
    ),
  );
});

test('Decision Tree rejects invalid inputs without crashing', () => {
  assert.throws(() => fitDecisionTree([], { task: 'regression' }), /1件以上/);
  assert.throws(
    () =>
      fitDecisionTree(
        [{ x: [NaN], y: 1 }],
        { task: 'regression', depth: 3 },
      ),
    /有限/,
  );
  assert.throws(
    () =>
      fitDecisionTree(
        [{ x: [1], y: 'A' }],
        { task: 'classification', depth: 0 },
        ['A'],
      ),
    /1〜10/,
  );
});

test('Decision Tree integrates with preprocessing, metrics, boundaries, and curves', () => {
  const base = {
      algorithm: 'tree',
      x: 0,
      x2: 1,
      target: 2,
      test: 25,
      depth: 3,
      minSamplesSplit: 2,
      scaling: 'none',
      oneHot: true,
      categoryColumns: [],
    },
    classificationData = sample('moons', 12, 'classification'),
    regressionData = sample('linear', 12, 'regression'),
    classification = trainModel(classificationData, {
      ...base,
      task: 'classification',
      target: classificationData.headers.length - 1,
    }),
    regression = trainModel(regressionData, {
      ...base,
      task: 'regression',
      target: regressionData.headers.length - 1,
    });
  assert.equal(classification.extraInfo.criterion, 'gini');
  assert.equal(classification.grid.length, 48 * 48);
  assert.ok(classification.decisionTree);
  assert.ok(Number.isFinite(classification.testMetrics.accuracy));
  assert.equal(regression.extraInfo.criterion, 'mse');
  assert.equal(regression.curve.length, 181);
  assert.ok(new Set(regression.curve.map((point) => point[1])).size > 1);
  assert.ok(regression.decisionTree);
  assert.ok(Number.isFinite(regression.testMetrics.rmse));
});

test('Decision Tree supports one-hot categorical features and every scaling mode', () => {
  for (const scaling of ['none', 'standard', 'minmax']) {
    const classificationData = sample('category', 18, 'classification'),
      classification = trainModel(classificationData, {
        task: 'classification',
        algorithm: 'tree',
        x: 0,
        x2: 1,
        target: 2,
        test: 25,
        depth: 3,
        minSamplesSplit: 2,
        scaling,
        oneHot: true,
        categoryColumns: [0],
      }),
      regressionData = sample('category', 18, 'regression'),
      regression = trainModel(regressionData, {
        task: 'regression',
        algorithm: 'tree',
        x: 0,
        x2: 0,
        target: 1,
        test: 25,
        depth: 3,
        minSamplesSplit: 2,
        scaling,
        oneHot: true,
        categoryColumns: [0],
      });
    assert.ok(
      classification.preprocessing.outputNames.some((name) =>
        name.startsWith('契約プラン='),
      ),
    );
    assert.ok(classification.test.every((row) => row.pred !== undefined));
    assert.ok(regression.test.every((row) => Number.isFinite(row.pred)));
  }
});

test('Existing Random Forest remains deterministic and trainable', () => {
  const rows = classificationRows.map((row, id) => ({ ...row, id })),
    options = { task: 'classification', trees: 8, depth: 3 },
    first = fitForest(rows, options, ['A', 'B']),
    second = fitForest(rows, options, ['A', 'B']);
  assert.deepEqual(
    rows.map((row) => first.predict(row.x)),
    rows.map((row) => second.predict(row.x)),
  );
});

test('Supervised Web Worker trains a Decision Tree in-browser path', async () => {
  const url = new URL('../dist/worker.js', import.meta.url).href,
    worker = new Worker(
      `const {parentPort}=require('node:worker_threads');global.self={postMessage:data=>parentPort.postMessage(data)};import(${JSON.stringify(url)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({ready:true})});`,
      { eval: true },
    ),
    queue = [],
    waiting = [];
  worker.on('message', (data) =>
    waiting.length ? waiting.shift()(data) : queue.push(data),
  );
  const next = () =>
    queue.length
      ? Promise.resolve(queue.shift())
      : new Promise((resolve) => waiting.push(resolve));
  try {
    assert.equal((await next()).ready, true);
    const dataset = sample('linear', 10, 'regression');
    worker.postMessage({
      dataset,
      opts: {
        task: 'regression',
        algorithm: 'tree',
        x: 0,
        x2: 1,
        target: dataset.headers.length - 1,
        test: 25,
        depth: 3,
        minSamplesSplit: 2,
        scaling: 'none',
        oneHot: true,
        categoryColumns: [],
      },
    });
    const message = await next();
    assert.equal(message.error, undefined);
    assert.equal(message.result.extraInfo.criterion, 'mse');
    assert.ok(message.result.decisionTree);
  } finally {
    await worker.terminate();
  }
});
