// Independent, deterministic numerical pipeline. No test rows are used by fit.
function matrixShape(rows, minimum = 2) {
  const width = rows[0]?.length;
  if (rows.length < minimum || !width || rows.some(row => row.length !== width || row.some(v => !Number.isFinite(v)))) {
    throw new Error('Expected a finite rectangular matrix');
  }
  return width;
}
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function stratifiedSplit(records, testRatio = 0.3, seed = 42) {
  if (!(testRatio > 0 && testRatio < 1)) throw new Error('Invalid test ratio');
  if (new Set(records.map(r => r.id)).size !== records.length) throw new Error('Duplicate row IDs');
  const rng = random(seed), train = [], test = [];
  for (const target of [...new Set(records.map(r => r.target))].sort((a, b) => a - b)) {
    const group = records.filter(r => r.target === target);
    if (group.length < 3) throw new Error('Class too small');
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    const count = Math.max(1, Math.min(group.length - 1, Math.round(group.length * testRatio)));
    test.push(...group.slice(0, count));
    train.push(...group.slice(count));
  }
  return { train, test };
}
export function fitStandardScaler(rows) {
  const width = matrixShape(rows);
  if (rows[0].some((value, j) => rows.every(row => row[j] === value))) throw new Error('Zero variance');
  const mean = Array.from({ length: width }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / rows.length);
  // Population standard deviation, consistently used for every split.
  const scale = mean.map((m, j) => Math.sqrt(rows.reduce((s, r) => s + (r[j] - m) ** 2, 0) / rows.length));
  if (scale.some(s => !Number.isFinite(s) || s === 0)) throw new Error('Zero or invalid variance');
  const transform = row => {
    if (row.length !== width) throw new Error('Feature count mismatch');
    const values = row.map((v, j) => (v - mean[j]) / scale[j]);
    if (values.some(v => !Number.isFinite(v))) throw new Error('Invalid scaled value');
    return values;
  };
  return { mean, scale, transform, transformAll: rows => rows.map(transform) };
}

export function fitPCA(rows, count = 2) {
  const width = matrixShape(rows);
  if (!Number.isInteger(count) || count < 1 || count > width) throw new Error('Invalid component count');
  const mean = Array.from({ length: width }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / rows.length);
  const centered = rows.map(r => r.map((v, j) => v - mean[j]));
  const a = Array.from({ length: width }, (_, j) => Array.from({ length: width }, (_, k) =>
    centered.reduce((sum, row) => sum + row[j] * row[k], 0) / (rows.length - 1)));
  const vectors = Array.from({ length: width }, (_, j) => Array.from({ length: width }, (_, k) => +(j === k)));
  let converged = false;
  for (let iteration = 0; iteration < 100 * width * width; iteration++) {
    let p = 0, q = 0, largest = 0;
    for (let j = 0; j < width; j++) for (let k = j + 1; k < width; k++) {
      if (Math.abs(a[j][k]) > largest) { largest = Math.abs(a[j][k]); p = j; q = k; }
    }
    if (largest < 1e-12) { converged = true; break; }
    const angle = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(angle), s = Math.sin(angle);
    const app = a[p][p], aqq = a[q][q], apq = a[p][q];
    for (let k = 0; k < width; k++) {
      if (k !== p && k !== q) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = a[p][k] = c * akp - s * akq;
        a[k][q] = a[q][k] = s * akp + c * akq;
      }
      const vkp = vectors[k][p], vkq = vectors[k][q];
      vectors[k][p] = c * vkp - s * vkq;
      vectors[k][q] = s * vkp + c * vkq;
    }
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;
  }
  if (!converged) throw new Error('PCA did not converge');
  const order = Array.from({ length: width }, (_, i) => i).sort((j, k) => a[k][k] - a[j][j]);
  const eigenvalues = order.map(i => Math.max(0, a[i][i]));
  const total = eigenvalues.reduce((s, v) => s + v, 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Invalid PCA variance');
  const components = order.slice(0, count).map(i => {
    const vector = vectors.map(row => row[i]);
    const pivot = vector.reduce((best, v, j) => Math.abs(v) > Math.abs(vector[best]) ? j : best, 0);
    return vector.map(v => v * (vector[pivot] < 0 ? -1 : 1));
  });
  const transform = row => {
    if (row.length !== width || row.some(v => !Number.isFinite(v))) throw new Error('Invalid PCA input');
    const centeredRow = row.map((v, j) => v - mean[j]);
    return components.map(component => dot(centeredRow, component));
  };
  return { mean, eigenvalues, components, explainedVarianceRatio: eigenvalues.map(v => v / total), transform, transformAll: rows => rows.map(transform) };
}

export function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map(v => Math.exp(v - max));
  const sum = exps.reduce((s, v) => s + v, 0);
  if (!Number.isFinite(sum) || !sum) throw new Error('Non-finite softmax');
  return exps.map(v => v / sum);
}

// Yield between small epoch batches so the browser can paint and handle input.
export function* softmaxSteps(trainX, trainY, options = {}) {
  const width = matrixShape(trainX), n = trainX.length;
  const { learningRate = 0.1, epochs = 2500, l2 = 0.001 } = options;
  if (!(learningRate > 0) || !Number.isFinite(learningRate) || !Number.isInteger(epochs) || epochs < 1 || !Number.isFinite(l2) || l2 < 0) throw new Error('Invalid model options');
  if (trainY.length !== n || trainY.some(y => ![0, 1, 2].includes(y)) || new Set(trainY).size !== 3) throw new Error('Expected three classes');
  const weights = Array.from({ length: 3 }, () => Array(width).fill(0));
  const intercepts = [0, 0, 0], history = [];
  for (let epoch = 0; epoch <= epochs; epoch++) {
    const gradient = Array.from({ length: 3 }, () => Array(width).fill(0)), bias = [0, 0, 0];
    let loss = 0;
    for (let i = 0; i < n; i++) {
      const row = trainX[i], scores = intercepts.slice();
      for (let k = 0; k < 3; k++) for (let j = 0; j < width; j++) scores[k] += weights[k][j] * row[j];
      const probabilities = softmax(scores), max = Math.max(...scores);
      loss += max - scores[trainY[i]] + Math.log(scores.reduce((s, v) => s + Math.exp(v - max), 0));
      for (let k = 0; k < 3; k++) {
        const error = probabilities[k] - +(trainY[i] === k);
        bias[k] += error;
        for (let j = 0; j < width; j++) gradient[k][j] += error * row[j];
      }
    }
    loss = loss / n + l2 / 2 * weights.reduce((s, row) => s + dot(row, row), 0);
    if (!Number.isFinite(loss)) throw new Error('Non-finite training loss');
    history.push(loss);
    if (epoch === epochs) break;
    for (let k = 0; k < 3; k++) {
      intercepts[k] -= learningRate * bias[k] / n;
      for (let j = 0; j < width; j++) weights[k][j] -= learningRate * (gradient[k][j] / n + l2 * weights[k][j]);
    }
    if (epoch % 25 === 24) yield epoch + 1;
  }
  const predictProba = row => {
    if (row.length !== width || row.some(v => !Number.isFinite(v))) throw new Error('Invalid prediction input');
    return softmax(weights.map((w, k) => dot(w, row) + intercepts[k]));
  };
  const predict = row => {
    const probabilities = predictProba(row);
    return probabilities.indexOf(Math.max(...probabilities));
  };
  return { weights, intercepts, history, predict, predictProba };
}
function finish(iterator) {
  let step;
  do { step = iterator.next(); } while (!step.done);
  return step.value;
}
export function fitSoftmaxRegression(trainX, trainY, options = {}) {
  return finish(softmaxSteps(trainX, trainY, options));
}
export function evaluateClassification(model, testX, testY, classes = [0, 1, 2]) {
  if (!testX.length || testX.length !== testY.length) throw new Error('Invalid evaluation rows');
  const confusion = classes.map(() => classes.map(() => 0));
  const predictions = testX.map(row => model.predict(row));
  let correct = 0;
  predictions.forEach((prediction, i) => {
    const actual = classes.indexOf(testY[i]), predicted = classes.indexOf(prediction);
    if (actual < 0 || predicted < 0) throw new Error('Unknown evaluation class');
    confusion[actual][predicted]++;
    correct += +(prediction === testY[i]);
  });
  return { accuracy: correct / testY.length, correct, count: testY.length, errors: testY.length - correct, confusion, predictions };
}
export function* comparisonSteps(records, split = stratifiedSplit(records)) {
  const scaler = fitStandardScaler(split.train.map(r => r.values));
  const trainX = scaler.transformAll(split.train.map(r => r.values));
  const testX = scaler.transformAll(split.test.map(r => r.values));
  const trainY = split.train.map(r => r.target), testY = split.test.map(r => r.target);
  const pca = fitPCA(trainX);
  yield;
  const full = yield* softmaxSteps(trainX, trainY);
  const reduced = yield* softmaxSteps(pca.transformAll(trainX), trainY);
  // Both models share the exact split object and test ID order.
  return { split, scaler, pca, full, reduced,
    fullEvaluation: evaluateClassification(full, testX, testY),
    reducedEvaluation: evaluateClassification(reduced, pca.transformAll(testX), testY),
    projected: pca.transformAll(scaler.transformAll(records.map(r => r.values))),
  };
}
export function compareWine(records, split) { return finish(comparisonSteps(records, split)); }
