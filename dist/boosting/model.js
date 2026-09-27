// Binary discrete AdaBoost. Labels 0/1 map to -1/+1 in the exponential loss.
export function predictStump(stump, x) {
  return stump.feature < 0 ? stump.left : x[stump.feature] <= stump.threshold ? stump.left : stump.right;
}

function sortedFeatures(rows) {
  return [0, 1].map(f => rows.map((_, i) => i).sort((a, b) => rows[a].x[f] - rows[b].x[f] || a - b));
}

// Exhaustive thresholds with weighted-majority leaves; minimize weighted 0/1 loss.
export function fitStump(rows, weights, sorted = sortedFeatures(rows)) {
  const total = [0, 0];
  rows.forEach((r, i) => { total[r.target] += weights[i]; });
  const majority = total[1] >= total[0] ? 1 : 0;
  let best = { feature: -1, threshold: 0, left: majority, right: majority, error: Math.min(...total) };
  for (const [feature, order] of sorted.entries()) {
    const left = [0, 0];
    for (let k = 0; k < order.length - 1; k++) {
      const i = order[k], j = order[k + 1];
      left[rows[i].target] += weights[i];
      if (rows[i].x[feature] === rows[j].x[feature]) continue;
      const right = total.map((v, c) => Math.max(0, v - left[c]));
      const error = Math.min(...left) + Math.min(...right);
      if (error < best.error - 1e-14) {
        best = { feature, threshold: rows[i].x[feature] / 2 + rows[j].x[feature] / 2,
          left: left[1] >= left[0] ? 1 : 0, right: right[1] >= right[0] ? 1 : 0, error };
      }
    }
  }
  return best;
}

export function evaluate(rows, predictions) {
  const wrong = rows.flatMap((r, i) => r.target !== predictions[i] ? [i] : []);
  return { predictions, wrong, accuracy: 1 - wrong.length / rows.length };
}

export function createGrid(rows, cols = 60, rowsCount = 40) {
  const bounds = [0, 1].map(f => {
    const values = rows.map(r => r.x[f]), min = Math.min(...values), max = Math.max(...values);
    const padding = (max - min || 1) * 0.08;
    return [min - padding, max + padding];
  });
  const points = [];
  for (let y = 0; y < rowsCount; y++) for (let x = 0; x < cols; x++)
    points.push([bounds[0][0] + (x + 0.5) / cols * (bounds[0][1] - bounds[0][0]),
      bounds[1][1] - (y + 0.5) / rowsCount * (bounds[1][1] - bounds[1][0])]);
  return { bounds, cols, rows: rowsCount, points };
}

export function trainBoosting(train, test, options = {}, onProgress = () => {}) {
  const { nEstimators = 50, learningRate = 1 } = options;
  if (!Number.isInteger(nEstimators) || nEstimators < 1 || nEstimators > 200 ||
      !Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 2)
    throw Error('弱学習器数は1〜200、Learning Rateは0より大きく2以下にしてください。');
  if (!train.length || !test.length) throw Error('Train / Testの両方にデータが必要です。');
  const sorted = sortedFeatures(train), grid = createGrid([...train, ...test]);
  let weights = train.map(() => 1 / train.length);
  const trainScores = train.map(() => 0), testScores = test.map(() => 0), gridScores = grid.points.map(() => 0);
  const baselineStump = fitStump(train, weights, sorted);
  const baseline = { stump: baselineStump,
    test: evaluate(test, test.map(r => predictStump(baselineStump, r.x))),
    grid: grid.points.map(x => predictStump(baselineStump, x)) };
  const stages = [];
  let stopReason = 'limit';
  for (let i = 0; i < nEstimators; i++) {
    const stump = fitStump(train, weights, sorted);
    const weakTrain = train.map(r => predictStump(stump, r.x));
    const error = train.reduce((sum, r, j) => sum + (r.target !== weakTrain[j] ? weights[j] : 0), 0);
    if (error >= 0.5 - 1e-12) { stopReason = 'no-edge'; break; }
    // Clip only for the log; preserve the actual error for display/early stopping.
    const safeError = Math.max(1e-15, error);
    const alpha = learningRate * 0.5 * Math.log((1 - safeError) / safeError);
    const weightsBefore = weights.slice();
    const logs = weights.map((w, j) => Math.log(w) + (train[j].target === weakTrain[j] ? -alpha : alpha));
    const maxLog = Math.max(...logs), scaled = logs.map(v => Math.exp(v - maxLog));
    const total = scaled.reduce((a, b) => a + b, 0);
    weights = scaled.map(v => v / total);
    function accumulate(rows, scores, weak) {
      rows.forEach((_, j) => { scores[j] += alpha * (2 * weak[j] - 1); });
      return { ...evaluate(rows, scores.map(s => s >= 0 ? 1 : 0)),
        weak: evaluate(rows, weak) };
    }
    const trainState = accumulate(train, trainScores, weakTrain);
    const testState = accumulate(test, testScores, test.map(r => predictStump(stump, r.x)));
    const weakGrid = grid.points.map(x => predictStump(stump, x));
    weakGrid.forEach((p, j) => { gridScores[j] += alpha * (2 * p - 1); });
    stages.push({ stump, error, alpha, weightsBefore, weightsAfter: weights.slice(),
      train: trainState, test: testState, weakGrid, grid: gridScores.map(s => s >= 0 ? 1 : 0) });
    if (i % 5 === 0) onProgress(i + 1);
    if (error <= 1e-15) { stopReason = 'perfect'; break; }
  }
  return { train, test, grid, baseline, stages, stopReason, nEstimators, learningRate };
}
