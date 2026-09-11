import {
  readInputRows,
  fitPreprocessor,
  preprocessingResult,
  createPlotSpace,
} from './preprocessing.js';
// Browser-native educational implementations. No data leaves the browser.
const squared = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
function random(seed = 42) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fitForest(rows, opts, classes) {
  const classification = opts.task === 'classification',
    rand = random(73),
    dimensions = rows[0].x.length;
  const nTrees = opts.trees ?? 40,
    maxDepth = opts.depth ?? 5;
  const targets = rows.map((r) =>
    classification ? classes.indexOf(r.y) : r.y,
  );
  function summary(ids) {
    if (!classification)
      return ids.reduce((s, i) => s + targets[i], 0) / ids.length;
    const counts = classes.map(() => 0);
    ids.forEach((i) => counts[targets[i]]++);
    return counts.map((v) => v / ids.length);
  }
  function build(ids, depth) {
    const value = summary(ids);
    if (
      depth >= maxDepth ||
      ids.length < 4 ||
      (classification && Math.max(...value) === 1)
    )
      return { value };
    const candidates = Array.from({ length: dimensions }, (_, i) => i);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    let best = null;
    for (const feature of candidates.slice(
      0,
      Math.max(1, Math.floor(Math.sqrt(dimensions))),
    )) {
      const sorted = [...ids].sort(
        (a, b) => rows[a].x[feature] - rows[b].x[feature],
      );
      let leftN = 0,
        leftSum = 0,
        leftSq = 0;
      let rightSum = classification
        ? 0
        : sorted.reduce((s, i) => s + targets[i], 0);
      let rightSq = classification
        ? 0
        : sorted.reduce((s, i) => s + targets[i] ** 2, 0);
      const leftCounts = classes.map(() => 0),
        rightCounts = classes.map(() => 0);
      if (classification) sorted.forEach((i) => rightCounts[targets[i]]++);
      for (let pos = 0; pos < sorted.length - 1; pos++) {
        const target = targets[sorted[pos]];
        leftN++;
        if (classification) {
          leftCounts[target]++;
          rightCounts[target]--;
        } else {
          leftSum += target;
          leftSq += target ** 2;
          rightSum -= target;
          rightSq -= target ** 2;
        }
        const rightN = sorted.length - leftN;
        const low = rows[sorted[pos]].x[feature],
          high = rows[sorted[pos + 1]].x[feature];
        if (leftN < 2 || rightN < 2 || low === high) continue;
        const loss = classification
          ? leftN -
            leftCounts.reduce((s, v) => s + v * v, 0) / leftN +
            rightN -
            rightCounts.reduce((s, v) => s + v * v, 0) / rightN
          : leftSq -
            (leftSum * leftSum) / leftN +
            rightSq -
            (rightSum * rightSum) / rightN;
        if (!best || loss < best.loss)
          best = { loss, feature, threshold: (low + high) / 2 };
      }
    }
    if (!best) return { value };
    const left = ids.filter((i) => rows[i].x[best.feature] <= best.threshold);
    const right = ids.filter((i) => rows[i].x[best.feature] > best.threshold);
    return {
      value,
      feature: best.feature,
      threshold: best.threshold,
      left: build(left, depth + 1),
      right: build(right, depth + 1),
    };
  }
  const trees = Array.from({ length: nTrees }, () =>
    build(
      Array.from({ length: rows.length }, () =>
        Math.floor(rand() * rows.length),
      ),
      0,
    ),
  );
  const one = (tree, x) => {
    while (tree.left)
      tree = x[tree.feature] <= tree.threshold ? tree.left : tree.right;
    return tree.value;
  };
  const predict = (x) => {
    if (!classification)
      return trees.reduce((s, tree) => s + one(tree, x), 0) / trees.length;
    const probabilities = classes.map(() => 0);
    for (const tree of trees)
      one(tree, x).forEach((p, i) => (probabilities[i] += p / trees.length));
    return {
      label: classes[probabilities.indexOf(Math.max(...probabilities))],
      probabilities,
    };
  };
  return {
    predict,
    treePredict: (x) => trees.slice(0, 5).map((t) => one(t, x)),
    info: { trees: nTrees, depth: maxDepth },
  };
}

function kernelMatrix(xs, kernel, gamma) {
  const n = xs.length,
    values = new Float64Array(n * n);
  const calc =
    kernel === 'linear'
      ? (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
      : (a, b) => Math.exp(-gamma * squared(a, b));
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++)
      values[i * n + j] = values[j * n + i] = calc(xs[i], xs[j]);
  return { values, calc };
}

// Pair-coordinate SMO for the soft-margin C-SVC dual with an unregularized intercept.
function binarySVM(xs, labels, matrix, kernelFn, C) {
  const n = xs.length,
    alpha = new Float64Array(n),
    errors = Float64Array.from(labels, (y) => -y),
    rand = random(129);
  let bias = 0,
    idle = 0,
    sweeps = 0;
  const maxSweeps = 600,
    tolerance = 0.001;
  function pair(i, j) {
    if (i === j) return false;
    const ai = alpha[i],
      aj = alpha[j],
      yi = labels[i],
      yj = labels[j],
      ei = errors[i],
      ej = errors[j];
    const lo = yi !== yj ? Math.max(0, aj - ai) : Math.max(0, ai + aj - C);
    const hi = yi !== yj ? Math.min(C, C + aj - ai) : Math.min(C, ai + aj);
    if (hi - lo < 1e-12) return false;
    const kii = matrix[i * n + i],
      kjj = matrix[j * n + j],
      kij = matrix[i * n + j];
    const eta = kii + kjj - 2 * kij;
    let nextJ;
    if (eta > 1e-12)
      nextJ = Math.min(hi, Math.max(lo, aj + (yj * (ei - ej)) / eta));
    else {
      const derivative = yj * (ej - ei);
      nextJ = derivative > 0 ? lo : hi;
    }
    if (Math.abs(nextJ - aj) < 1e-8) return false;
    const nextI = ai + yi * yj * (aj - nextJ),
      di = nextI - ai,
      dj = nextJ - aj;
    const b1 = bias - ei - yi * di * kii - yj * dj * kij;
    const b2 = bias - ej - yi * di * kij - yj * dj * kjj;
    const nextBias =
      nextI > 1e-7 && nextI < C - 1e-7
        ? b1
        : nextJ > 1e-7 && nextJ < C - 1e-7
          ? b2
          : (b1 + b2) / 2;
    for (let k = 0; k < n; k++)
      errors[k] +=
        yi * di * matrix[i * n + k] +
        yj * dj * matrix[j * n + k] +
        nextBias -
        bias;
    alpha[i] = nextI;
    alpha[j] = nextJ;
    bias = nextBias;
    return true;
  }
  while (idle < 6 && sweeps++ < maxSweeps) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      if (
        !(
          (labels[i] * errors[i] < -tolerance && alpha[i] < C - 1e-7) ||
          (labels[i] * errors[i] > tolerance && alpha[i] > 1e-7)
        )
      )
        continue;
      let j = -1,
        largest = -1;
      for (let k = 0; k < n; k++)
        if (k !== i && alpha[k] > 1e-7 && alpha[k] < C - 1e-7) {
          const diff = Math.abs(errors[i] - errors[k]);
          if (diff > largest) {
            largest = diff;
            j = k;
          }
        }
      if (j >= 0 && pair(i, j)) {
        changed++;
        continue;
      }
      const start = Math.floor(rand() * n);
      for (let offset = 0; offset < n; offset++)
        if (pair(i, (start + offset) % n)) {
          changed++;
          break;
        }
    }
    idle = changed ? 0 : idle + 1;
  }
  const support = Array.from(alpha, (a, i) => (a > 1e-7 ? i : -1)).filter(
    (i) => i >= 0,
  );
  let violation = 0;
  for (let i = 0; i < n; i++) {
    if (alpha[i] < C - 1e-6)
      violation = Math.max(violation, -labels[i] * errors[i]);
    if (alpha[i] > 1e-6) violation = Math.max(violation, labels[i] * errors[i]);
  }
  return {
    support,
    converged: violation < 0.01,
    score: (x) =>
      support.reduce(
        (s, i) => s + alpha[i] * labels[i] * kernelFn(xs[i], x),
        bias,
      ),
  };
}

export function fitSVM(rows, opts, classes, normalize) {
  if (rows.length > 800)
    throw Error(
      'SVMは学習データ800行以内に対応しています。CSVの行数を減らすか、別のモデルを選んでください。',
    );
  const xs = rows.map((r) => normalize(r.x)),
    C = opts.c ?? 1,
    gamma = opts.gamma ?? 1;
  const { values, calc } = kernelMatrix(xs, opts.kernel ?? 'rbf', gamma);
  const models = (classes.length === 2 ? [classes[1]] : classes).map((c) =>
    binarySVM(
      xs,
      rows.map((r) => (r.y === c ? 1 : -1)),
      values,
      calc,
      C,
    ),
  );
  const predict = (x) => {
    const scores = models.map((m) => m.score(normalize(x)));
    const index =
      classes.length === 2
        ? scores[0] >= 0
          ? 1
          : 0
        : scores.indexOf(Math.max(...scores));
    return {
      label: classes[index],
      score: classes.length === 2 ? scores[0] : null,
    };
  };
  return {
    predict,
    supportIds: [
      ...new Set(models.flatMap((m) => m.support.map((i) => rows[i].id))),
    ],
    info: {
      converged: models.every((m) => m.converged),
      kernel: opts.kernel ?? 'rbf',
      C,
      gamma,
    },
  };
}

// Epsilon-SVR dual: minimize .5 beta'K beta - y'beta + epsilon*|beta|,
// subject to sum(beta)=0 and -C <= beta <= C. Exact pair minimization.
export function fitSVR(rows, opts, normalize, progress = () => {}) {
  if (rows.length > 800)
    throw Error(
      'SVRは学習データ800行以内に対応しています。CSVの行数を減らすか、別のモデルを選んでください。',
    );
  const n = rows.length,
    xs = rows.map((r) => normalize(r.x)),
    mean = rows.reduce((s, r) => s + r.y, 0) / n;
  const scale =
    Math.sqrt(rows.reduce((s, r) => s + (r.y - mean) ** 2, 0) / n) || 1;
  const y = rows.map((r) => (r.y - mean) / scale),
    C = opts.c ?? 1,
    epsilon = opts.epsilon ?? 0.1;
  const { values, calc } = kernelMatrix(
    xs,
    opts.kernel ?? 'rbf',
    opts.gamma ?? 1,
  );
  const beta = new Float64Array(n),
    gradient = Float64Array.from(y, (v) => -v);
  let converged = false,
    sweep = 0;
  for (; sweep < 300; sweep++) {
    if (sweep % 5 === 0) progress(`SVRを学習中 · 反復 ${sweep}`);
    let improvement = 0;
    // Every coordinate chooses its best partner; preserves the equality constraint.
    for (let i = 0; i < n; i++) {
      let bestGain = -1e-9,
        bestJ = -1,
        bestStep = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const bi = beta[i],
          bj = beta[j],
          low = Math.max(-C - bi, bj - C),
          high = Math.min(C - bi, bj + C);
        if (high - low < 1e-12) continue;
        const eta = Math.max(
            0,
            values[i * n + i] + values[j * n + j] - 2 * values[i * n + j],
          ),
          g = gradient[i] - gradient[j];
        const breaks = [
          low,
          high,
          Math.max(low, Math.min(high, -bi)),
          Math.max(low, Math.min(high, bj)),
        ].sort((a, b) => a - b);
        const candidates = [...breaks];
        if (eta > 1e-12)
          for (let t = 0; t < breaks.length - 1; t++) {
            const mid = (breaks[t] + breaks[t + 1]) / 2;
            const slope = epsilon * (Math.sign(bi + mid) - Math.sign(bj - mid));
            candidates.push(
              Math.max(breaks[t], Math.min(breaks[t + 1], -(g + slope) / eta)),
            );
          }
        for (const step of candidates) {
          const gain =
            0.5 * eta * step ** 2 +
            g * step +
            epsilon *
              (Math.abs(bi + step) +
                Math.abs(bj - step) -
                Math.abs(bi) -
                Math.abs(bj));
          if (gain < bestGain) {
            bestGain = gain;
            bestJ = j;
            bestStep = step;
          }
        }
      }
      if (bestJ >= 0) {
        beta[i] += bestStep;
        beta[bestJ] -= bestStep;
        for (let k = 0; k < n; k++)
          gradient[k] += bestStep * (values[i * n + k] - values[bestJ * n + k]);
        improvement -= bestGain;
      }
    }
    if (improvement < 1e-6) {
      converged = true;
      break;
    }
  }
  const intercepts = [];
  for (let i = 0; i < n; i++)
    if (Math.abs(beta[i]) > 1e-6 && Math.abs(beta[i]) < C - 1e-6)
      intercepts.push(-gradient[i] - epsilon * Math.sign(beta[i]));
  // KKT gives an interval when there are no free support vectors.
  let lower = -Infinity,
    upper = Infinity;
  for (let i = 0; i < n; i++) {
    if (beta[i] < C - 1e-6)
      lower = Math.max(
        lower,
        -gradient[i] - epsilon * (beta[i] >= -1e-6 ? 1 : -1),
      );
    if (beta[i] > -C + 1e-6)
      upper = Math.min(
        upper,
        -gradient[i] - epsilon * (beta[i] <= 1e-6 ? -1 : 1),
      );
  }
  const intercept = intercepts.length
    ? intercepts.reduce((s, v) => s + v, 0) / intercepts.length
    : Number.isFinite(lower + upper)
      ? (lower + upper) / 2
      : 0;
  const support = Array.from(beta, (b, i) =>
    Math.abs(b) > 1e-6 ? i : -1,
  ).filter((i) => i >= 0);
  return {
    predict: (x) =>
      mean +
      scale *
        support.reduce(
          (s, i) => s + beta[i] * calc(xs[i], normalize(x)),
          intercept,
        ),
    supportIds: support.map((i) => rows[i].id),
    info: {
      converged,
      epsilon: epsilon * scale,
      epsilonScaled: epsilon,
      kernel: opts.kernel ?? 'rbf',
      C,
    },
  };
}

function kmeans(xs, k) {
  let best = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const rand = random(42 + attempt * 91),
      centers = [[...xs[Math.floor(rand() * xs.length)]]];
    while (centers.length < k) {
      const distances = xs.map((x) =>
        Math.min(...centers.map((c) => squared(x, c))),
      );
      let threshold = rand() * distances.reduce((s, d) => s + d, 0),
        selected = distances.findIndex((d) => (threshold -= d) < 0);
      if (selected < 0) selected = distances.indexOf(Math.max(...distances));
      centers.push([...xs[selected]]);
    }
    let previous = null,
      history = [],
      labels;
    for (let iteration = 0; iteration < 100; iteration++) {
      labels = xs.map((x) => {
        const ds = centers.map((c) => squared(x, c));
        return ds.indexOf(Math.min(...ds));
      });
      // Relocate an empty cluster to the point farthest from its current centroid.
      const counts = Array(k).fill(0);
      labels.forEach((c) => counts[c]++);
      for (let c = 0; c < k; c++)
        if (!counts[c]) {
          let farthest = -1,
            largest = -1;
          xs.forEach((x, i) => {
            const d = squared(x, centers[labels[i]]);
            if (counts[labels[i]] > 1 && d > largest) {
              largest = d;
              farthest = i;
            }
          });
          counts[labels[farthest]]--;
          labels[farthest] = c;
          counts[c]++;
          centers[c] = [...xs[farthest]];
        }
      const inertia = xs.reduce(
        (s, x, i) => s + squared(x, centers[labels[i]]),
        0,
      );
      history.push({
        centers: centers.map((c) => [...c]),
        labels: [...labels],
        inertia,
        iteration,
      });
      if (previous && labels.every((v, i) => v === previous[i])) break;
      previous = [...labels];
      for (let c = 0; c < k; c++)
        centers[c] = xs[0].map(
          (_, j) =>
            xs.reduce((s, x, i) => s + (labels[i] === c ? x[j] : 0), 0) /
            counts[c],
        );
    }
    const last = history.at(-1);
    if (!best || last.inertia < best.inertia)
      best = {
        labels: last.labels,
        centers: last.centers,
        inertia: last.inertia,
        history,
      };
  }
  return best;
}

function hierarchical(xs, k, linkage) {
  const n = xs.length,
    size = 2 * n - 1,
    distances = new Float64Array(size * size),
    nodes = xs.map((x, i) => ({ id: i, count: 1, height: 0, members: [i] }));
  const active = new Set(nodes.map((n) => n.id)),
    merges = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++)
      distances[i * size + j] = distances[j * size + i] = Math.sqrt(
        squared(xs[i], xs[j]),
      );
  let cut = k === n ? [...active] : null;
  while (active.size > 1) {
    let best = Infinity,
      left = -1,
      right = -1;
    const ids = [...active];
    for (let i = 0; i < ids.length; i++)
      for (let j = 0; j < i; j++) {
        const d = distances[ids[i] * size + ids[j]];
        if (d < best) {
          best = d;
          left = ids[j];
          right = ids[i];
        }
      }
    const a = nodes[left],
      b = nodes[right],
      id = nodes.length;
    const node = {
      id,
      left,
      right,
      count: a.count + b.count,
      height: best,
      members: [...a.members, ...b.members],
    };
    active.delete(left);
    active.delete(right);
    for (const other of active) {
      const da = distances[left * size + other],
        db = distances[right * size + other],
        nc = nodes[other].count;
      const distance =
        linkage === 'single'
          ? Math.min(da, db)
          : linkage === 'complete'
            ? Math.max(da, db)
            : linkage === 'average'
              ? (a.count * da + b.count * db) / node.count
              : Math.sqrt(
                  Math.max(
                    0,
                    ((a.count + nc) * da ** 2 +
                      (b.count + nc) * db ** 2 -
                      nc * best ** 2) /
                      (node.count + nc),
                  ),
                );
      distances[id * size + other] = distances[other * size + id] = distance;
    }
    nodes.push(node);
    active.add(id);
    merges.push({ left, right, height: best, count: node.count });
    if (active.size === k) cut = [...active];
  }
  cut.sort(
    (a, b) => Math.min(...nodes[a].members) - Math.min(...nodes[b].members),
  );
  const labels = Array(n);
  cut.forEach((node, c) => nodes[node].members.forEach((i) => (labels[i] = c)));
  return { labels, nodes, merges, cut, root: nodes.length - 1 };
}

export function silhouette(xs, labels) {
  const groups = [...new Set(labels)].map((c) =>
    xs.map((_, i) => i).filter((i) => labels[i] === c),
  );
  if (groups.length < 2 || groups.length >= xs.length) return null;
  const count = Math.min(300, xs.length),
    rand = random(47),
    order = xs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    let j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let sum = 0;
  for (const i of order.slice(0, count)) {
    const own = groups.find((g) => labels[g[0]] === labels[i]);
    if (own.length === 1) continue;
    const a =
      own.reduce((s, j) => s + Math.sqrt(squared(xs[i], xs[j])), 0) /
      (own.length - 1);
    const b = Math.min(
      ...groups
        .filter((g) => g !== own)
        .map(
          (g) =>
            g.reduce((s, j) => s + Math.sqrt(squared(xs[i], xs[j])), 0) /
            g.length,
        ),
    );
    sum += (b - a) / Math.max(a, b, 1e-12);
  }
  return sum / count;
}

export function fitClustering(data, opts) {
  if (opts.x === opts.x2)
    throw Error(
      '異なる2つの入力列を選んでください。教師なし学習に目的変数は不要です。',
    );
  const features = [opts.x, opts.x2],
    rows = readInputRows(data, opts, features);
  if (rows.length < 12) throw Error('有効なデータが12行以上必要です。');
  if (opts.algorithm === 'hierarchical' && rows.length > 500)
    throw Error(
      '階層的クラスタリングは500行以内に対応しています。CSVを減らすか、k-means法を選んでください。',
    );
  const processor = fitPreprocessor(rows, features, data.headers, opts),
    preprocessing = preprocessingResult(processor, rows);
  const xs = rows.map((r) => processor.transform(r.x)),
    k = opts.clusters ?? 3;
  if (new Set(xs.map((x) => JSON.stringify(x))).size < k)
    throw Error(
      '異なる変換後の座標の数以上にクラスタは作れません。クラスタ数を減らしてください。',
    );
  const plot = createPlotSpace(rows, processor.schema),
    hasCategories = plot.axes.some((axis) => axis.type === 'category');
  const fitted =
    opts.algorithm === 'kmeans'
      ? kmeans(xs, k)
      : hierarchical(xs, k, opts.linkage ?? 'ward');
  const centersEncoded = Array.from({ length: k }, (_, c) => {
    const indices = xs.map((_, i) => i).filter((i) => fitted.labels[i] === c);
    return xs[0].map(
      (_, j) => indices.reduce((s, i) => s + xs[i][j], 0) / indices.length,
    );
  });
  const toOriginal = (center) =>
    processor.schema.columns.map(
      (column, j) => center[j] * column.scale + column.offset,
    );
  // Categorical centroids are probability-like vectors in one-hot space. Do not
  // draw them between arbitrary category positions in the original-data plot.
  const centers = hasCategories ? [] : centersEncoded.map(toOriginal);
  const inertia = xs.reduce(
    (sum, x, i) => sum + squared(x, centersEncoded[fitted.labels[i]]),
    0,
  );
  return {
    opts,
    preprocessing,
    plotAxes: plot.axes,
    headers: data.headers,
    features,
    sourceName: data.name,
    excluded: data.rows.length - rows.length,
    points: rows.map((r, i) => ({
      ...r,
      rawX: r.x,
      x: plot.encode(r.x),
      cluster: fitted.labels[i],
    })),
    centers,
    centersEncoded,
    classes: Array.from({ length: k }, (_, i) => `クラスタ ${i + 1}`),
    xRange: plot.axes[0].range,
    yRange: plot.axes[1].range,
    clusterMetrics: {
      silhouette: silhouette(xs, fitted.labels),
      silhouetteSample: Math.min(300, rows.length),
      inertia,
      counts: Array.from(
        { length: k },
        (_, c) => fitted.labels.filter((v) => v === c).length,
      ),
    },
    steps: fitted.history?.map((step) => ({
      ...step,
      centersEncoded: step.centers,
      centers: hasCategories ? [] : step.centers.map(toOriginal),
    })),
    hierarchy: fitted.nodes
      ? {
          nodes: fitted.nodes.map(({ members, ...node }) => node),
          merges: fitted.merges,
          cut: fitted.cut,
          root: fitted.root,
        }
      : null,
    equation:
      opts.algorithm === 'kmeans'
        ? `${k}個の重心への距離でグループ化（変換後${xs[0].length}次元・k-means++）`
        : `${{ ward: 'Ward法', single: '最短距離法', complete: '最長距離法', average: '群平均法' }[opts.linkage ?? 'ward']}で順に結合し、${k}グループで切断`,
  };
}
