// Adapted from the supplied engine.mjs. Exact greedy, second-order logistic trees.
const EPSILON = 1e-12;
export const sigmoid = (score) => 1 / (1 + Math.exp(-score));
export function predictTree(tree, x) {
  let node = tree;
  while (node.left) node = x[node.feature] < node.threshold ? node.left : node.right;
  return node.value;
}
export function traceTree(tree, x) {
  const path = [];
  let node = tree;
  while (node.left) {
    const left = x[node.feature] < node.threshold;
    path.push({ feature: node.feature, threshold: node.threshold, left, gain: node.gain });
    node = left ? node.left : node.right;
  }
  return { path, leaf: node.value, node };
}
export function metrics(rows, scores) {
  let loss = 0, correct = 0;
  const matrix = [[0, 0], [0, 0]];
  const probabilities = rows.map((row, i) => {
    const p = Math.max(EPSILON, Math.min(1 - EPSILON, sigmoid(scores[i])));
    loss -= row.target ? Math.log(p) : Math.log1p(-p);
    const prediction = Number(p >= 0.5);
    correct += Number(prediction === row.target);
    matrix[row.target][prediction]++;
    return p;
  });
  return { loss: loss / rows.length, accuracy: correct / rows.length, matrix, probabilities };
}
export function splitGain(GL, HL, GR, HR, lambda, gamma) {
  return 0.5 * (GL * GL / (HL + lambda) + GR * GR / (HR + lambda) -
    (GL + GR) ** 2 / (HL + HR + lambda)) - gamma;
}
export function fitTree(rows, gradients, hessians, options) {
  let serial = 0;
  const features = options.mode === 'two' ? options.plotIndices : rows[0].x.map((_, i) => i);
  function build(indices, depth) {
    let G = 0, H = 0;
    for (const i of indices) { G += gradients[i]; H += hessians[i]; }
    const node = { id: serial++, depth, count: indices.length, G, H,
      value: -G / Math.max(EPSILON, H + options.lambda) };
    if (depth >= options.maxDepth || indices.length < 2 || H < 2) return node;
    let best = null, bestGain = 1e-10;
    for (const feature of features) {
      const sorted = indices.slice().sort((a, b) => rows[a].x[feature] - rows[b].x[feature]);
      let GL = 0, HL = 0;
      for (let j = 0; j < sorted.length - 1; j++) {
        const index = sorted[j];
        GL += gradients[index]; HL += hessians[index];
        const HR = H - HL;
        if (HL < 1 || HR < 1 || rows[index].x[feature] === rows[sorted[j + 1]].x[feature]) continue;
        const gain = splitGain(GL, HL, G - GL, HR, options.lambda, options.gamma);
        if (gain > bestGain) {
          bestGain = gain;
          best = { feature, threshold: (rows[index].x[feature] + rows[sorted[j + 1]].x[feature]) / 2, gain };
        }
      }
    }
    if (best) {
      Object.assign(node, best);
      node.left = build(indices.filter((i) => rows[i].x[best.feature] < best.threshold), depth + 1);
      node.right = build(indices.filter((i) => rows[i].x[best.feature] >= best.threshold), depth + 1);
    }
    return node;
  }
  return build(rows.map((_, i) => i), 0);
}
export function createSession(train, valid, options, previous = null) {
  if (!train.length || !valid.length || train.some((row) => row.x.length !== valid[0].x.length)) throw Error('学習・検証データが不正です。');
  const prior = train.reduce((sum, row) => sum + row.target, 0) / train.length;
  const initialScore = Math.log(prior / (1 - prior));
  const trainScores = previous ? Float64Array.from(previous.trainScores) : new Float64Array(train.length).fill(initialScore);
  const validScores = previous ? Float64Array.from(previous.validScores) : new Float64Array(valid.length).fill(initialScore);
  const trees = previous ? previous.trees.slice() : [];
  return {
    initialScore, trees, trainScores, validScores,
    initial: { train: metrics(train, new Float64Array(train.length).fill(initialScore)), valid: metrics(valid, new Float64Array(valid.length).fill(initialScore)) },
    step() {
      if (trees.length >= 60) throw Error('木は最大60本です。');
      const probabilities = trainScores.map(sigmoid);
      const gradients = probabilities.map((p, i) => p - train[i].target);
      const hessians = probabilities.map((p) => p * (1 - p));
      const tree = fitTree(train, gradients, hessians, options);
      const beforeTrain = Array.from(trainScores), beforeValid = Array.from(validScores);
      train.forEach((row, i) => { trainScores[i] += options.learningRate * predictTree(tree, row.x); });
      valid.forEach((row, i) => { validScores[i] += options.learningRate * predictTree(tree, row.x); });
      trees.push(tree);
      return { tree, number: trees.length, train: metrics(train, trainScores), valid: metrics(valid, validScores),
        beforeTrain, beforeValid, trainScores: Array.from(trainScores), validScores: Array.from(validScores) };
    },
  };
}
export function scoresFor(rows, trees, initialScore, learningRate, count) {
  return rows.map((row) => {
    let score = initialScore;
    for (let i = 0; i < count; i++) score += learningRate * predictTree(trees[i], row.x);
    return score;
  });
}
