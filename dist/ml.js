import {
  readInputRows,
  fitPreprocessor,
  preprocessingResult,
  createPlotSpace,
} from './preprocessing.js';
import {
  fitDecisionTree,
  fitForest,
  fitSVM,
  fitSVR,
  fitClustering,
} from './advanced.js';
export function rng(seed = 42) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export { sample } from './samples.js';
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  let rows = [],
    row = [],
    cell = '',
    quoted = false,
    closed = false;
  const first = text.split(/\r?\n/)[0];
  let delim = first.includes('\t') && !first.includes(',') ? '\t' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === '"') {
      if (cell.trim() || closed)
        throw Error('引用符の位置が不正です。CSVの形式を確認してください。');
      quoted = true;
    } else if (c === delim) {
      row.push(cell.trim());
      cell = '';
      closed = false;
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      cell = '';
      closed = false;
    } else {
      if (closed && c.trim()) throw Error('引用符の後に区切り文字が必要です。');
      cell += c;
    }
  }
  if (quoted) throw Error('閉じられていない引用符があります。');
  row.push(cell.trim());
  if (row.some((v) => v !== '')) rows.push(row);
  if (rows.length < 13) throw Error('見出し行と、12行以上のデータが必要です。');
  let headers = rows.shift();
  if (headers.length < 2) throw Error('2列以上のCSVを読み込んでください。');
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw Error('列名は空欄にせず、重複しない名前にしてください。');
  if (rows.some((r) => r.length !== headers.length))
    throw Error('列数が一致しない行があります。区切り文字を確認してください。');
  if (rows.length > 5000) throw Error('データは5,000行以内にしてください。');
  return { headers, rows, synthetic: false };
}
export function numeric(v) {
  return (
    v !== null &&
    v !== undefined &&
    String(v).trim() !== '' &&
    Number.isFinite(Number(v))
  );
}
function extent(arr) {
  let lo = Math.min(...arr),
    hi = Math.max(...arr),
    pad = (hi - lo || 1) * 0.08;
  return [lo - pad, hi + pad];
}
function split(rows, ratio, classification) {
  let r = rng(42),
    shuffle = (a) => {
      a = [...a];
      for (let i = a.length - 1; i > 0; i--) {
        let j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
  let train = [],
    test = [];
  let groups = classification
    ? [...new Set(rows.map((a) => a.y))].map((c) =>
        rows.filter((a) => a.y === c),
      )
    : [rows];
  for (let g of groups) {
    if (g.length < 3)
      throw Error('各クラスに3行以上の有効なデータが必要です。');
    g = shuffle(g);
    let n = Math.max(1, Math.min(g.length - 1, Math.round(g.length * ratio)));
    test.push(...g.slice(0, n));
    train.push(...g.slice(n));
  }
  return { train: shuffle(train), test: shuffle(test) };
}
function solve(A, b) {
  A = A.map((r, i) => [...r, b[i]]);
  let n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let j = i + 1; j < n; j++)
      if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
    [A[i], A[p]] = [A[p], A[i]];
    if (Math.abs(A[i][i]) < 1e-11)
      throw Error(
        'このデータでは計算できません。特徴量の種類や次数を変更してください。',
      );
    let v = A[i][i];
    for (let k = i; k <= n; k++) A[i][k] /= v;
    for (let j = 0; j < n; j++)
      if (j !== i) {
        let f = A[j][i];
        for (let k = i; k <= n; k++) A[j][k] -= f * A[i][k];
      }
  }
  return A.map((r) => r[n]);
}
export function trainModel(data, opts, progress = () => {}) {
  if (opts.task === 'clustering') return fitClustering(data, opts);
  const cls = opts.task === 'classification',
    features = cls ? [opts.x, opts.x2] : [opts.x];
  if (features.includes(opts.target))
    throw Error('予測する列と特徴量は別の列を選んでください。');
  if (cls && opts.x === opts.x2)
    throw Error('分類には異なる2つの入力列を選んでください。');
  const rows = readInputRows(data, opts, features);
  if (rows.length < 12)
    throw Error(
      '選択した列に有効なデータが12行以上必要です。空欄や列の型を確認してください。',
    );
  const classes = cls ? [...new Set(rows.map((r) => r.y))].sort() : [];
  if (cls && (classes.length < 2 || classes.length > 8))
    throw Error('分類の正解ラベルは2〜8種類にしてください。');
  if (opts.algorithm === 'logistic' && classes.length !== 2)
    throw Error(
      'ロジスティック回帰は2クラス用です。3クラス以上は別の分類モデルを選んでください。',
    );
  let { train, test } = split(rows, opts.test / 100, cls);
  const processor = fitPreprocessor(train, features, data.headers, opts),
    norm = processor.transform;
  const preprocessing = preprocessingResult(processor, train, test),
    plot = createPlotSpace(rows, processor.schema);
  const categoricalX = plot.axes[0].type === 'category',
    dimensions = processor.schema.outputNames.length;
  let predict,
    history = [],
    equation = '',
    weights = [],
    advanced = null,
    decisionTree = null;
  if (opts.algorithm === 'tree') {
    const featureInfo = processor.schema.columns.flatMap((column) =>
        column.type === 'category'
          ? column.outputs.map((category) => ({
              name: `${column.name}=${category}`,
              category,
            }))
          : [
              {
                name: column.name,
                scale: column.scale,
                offset: column.offset,
              },
            ],
      ),
      tree = fitDecisionTree(
        train.map((row) => ({ ...row, x: norm(row.x) })),
        opts,
        classes,
        featureInfo,
      );
    advanced = {
      ...tree,
      predict: (raw) => tree.predict(norm(raw)),
    };
    decisionTree = tree.root;
    predict = advanced.predict;
    equation = cls
      ? `Gini impurityを最小化 · 深さ ${tree.info.treeDepth} / 上限 ${tree.info.maxDepth}`
      : `MSEを最小化 · 葉の平均で予測 · 深さ ${tree.info.treeDepth} / 上限 ${tree.info.maxDepth}`;
  } else if (opts.algorithm === 'forest') {
    const forest = fitForest(
      train.map((r) => ({ ...r, x: norm(r.x) })),
      opts,
      classes,
    );
    advanced = {
      ...forest,
      predict: (raw) => forest.predict(norm(raw)),
      treePredict: (raw) => forest.treePredict(norm(raw)),
    };
    predict = advanced.predict;
    equation = `${opts.trees ?? 40}本の決定木を組み合わせる（深さ上限 ${opts.depth ?? 5}）`;
  } else if (opts.algorithm === 'svm') {
    advanced = fitSVM(train, opts, classes, norm);
    predict = advanced.predict;
    equation = `${opts.kernel === 'linear' ? '線形' : 'RBF'}カーネルのSVM · C = ${opts.c ?? 1}`;
  } else if (opts.algorithm === 'svr') {
    advanced = fitSVR(train, opts, norm, progress);
    predict = advanced.predict;
    equation = `ε-SVR · ${opts.kernel === 'linear' ? '線形' : 'RBF'}カーネル · 許容幅 ±${advanced.info.epsilon.toFixed(3)}`;
  } else if (!cls) {
    if (categoricalX && opts.algorithm === 'polynomial')
      throw Error(
        '多項式回帰には数値の入力を選んでください。カテゴリ入力には線形回帰・ランダムフォレスト・SVRが使えます。',
      );
    const degree = opts.algorithm === 'linear' ? 1 : opts.degree;
    const basis =
      opts.algorithm === 'linear'
        ? (x) => [1, ...norm(x)]
        : (x) => Array.from({ length: degree + 1 }, (_, i) => norm(x)[0] ** i);
    const width = opts.algorithm === 'linear' ? dimensions + 1 : degree + 1;
    const A = Array.from({ length: width }, () => Array(width).fill(0)),
      b = Array(width).fill(0);
    for (const row of train) {
      const v = basis(row.x);
      for (let i = 0; i < width; i++) {
        b[i] += v[i] * row.y;
        for (let j = 0; j < width; j++) A[i][j] += v[i] * v[j];
      }
    }
    // Equilibrate the normal equations for numeric conditioning only. This does not
    // change the selected feature scaling or the least-squares objective.
    const scales = A.map((row, i) => Math.sqrt(Math.abs(row[i])) || 1);
    weights = solve(
      A.map((row, i) => row.map((v, j) => v / scales[i] / scales[j])),
      b.map((v, i) => v / scales[i]),
    ).map((v, i) => v / scales[i]);
    predict = (x) => weights.reduce((sum, w, i) => sum + w * basis(x)[i], 0);
    if (categoricalX)
      equation =
        'カテゴリごとの予測値（線形回帰では基準カテゴリの列を1つ除外）';
    else if (degree === 1) {
      const c = processor.schema.columns[0],
        slope = weights[1] / c.scale,
        intercept = weights[0] - slope * c.offset;
      equation = `ŷ = ${slope.toFixed(3)}x ${intercept < 0 ? '−' : '+'} ${Math.abs(intercept).toFixed(3)}`;
    } else equation = `${degree}次の多項式で、点と曲線のずれの二乗和を最小化`;
  } else if (opts.algorithm === 'logistic') {
    const transformed = train.map((r) => ({
      x: [1, ...norm(r.x)],
      y: classes.indexOf(r.y),
    }));
    weights = Array(dimensions + 1).fill(0);
    const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));
    // A data-dependent stable step size allows the "none" setting without silently
    // standardizing numeric inputs behind the user's back.
    const maxNorm = Math.max(
      ...transformed.map((r) => r.x.reduce((s, v) => s + v * v, 0)),
    );
    const rate = Math.min(0.15, 2 / Math.max(1, maxNorm));
    for (let t = 0; t < 2000; t++) {
      const gradient = Array(weights.length).fill(0);
      let loss = 0;
      for (const row of transformed) {
        const p = sigmoid(weights.reduce((s, w, i) => s + w * row.x[i], 0));
        gradient.forEach((_, j) => (gradient[j] += (p - row.y) * row.x[j]));
        loss -=
          row.y * Math.log(p + 1e-12) + (1 - row.y) * Math.log(1 - p + 1e-12);
      }
      weights.forEach(
        (_, j) =>
          (weights[j] -=
            rate * (gradient[j] / train.length + (j ? 0.001 * weights[j] : 0))),
      );
      if (t % 40 === 0) history.push({ step: t, loss: loss / train.length });
    }
    predict = (raw) => {
      const v = [1, ...norm(raw)],
        p = sigmoid(weights.reduce((s, w, i) => s + w * v[i], 0));
      return { label: classes[p >= 0.5 ? 1 : 0], probabilities: [1 - p, p] };
    };
    equation = `${dimensions}個の変換後の特徴量から確率を計算し、50%を境に分類`;
  } else {
    const k = Math.min(opts.k, train.length),
      prepared = train.map((r) => ({ ...r, z: norm(r.x) }));
    predict = (x) => {
      const z = norm(x),
        nearest = [];
      for (const row of prepared) {
        const d = row.z.reduce((s, v, j) => s + (v - z[j]) ** 2, 0);
        let at = nearest.findIndex((a) => d < a.d);
        if (at < 0) at = nearest.length;
        if (at < k) {
          nearest.splice(at, 0, { d, label: row.y });
          if (nearest.length > k) nearest.pop();
        }
      }
      const votes = classes.map(
        (c) => nearest.filter((r) => r.label === c).length / k,
      );
      return {
        label: classes[votes.indexOf(Math.max(...votes))],
        probabilities: votes,
      };
    };
    equation = `近い${k}個の学習データの多数決で分類（同票はラベル順）`;
  }
  const annotate = (source) =>
    source.map((row) => {
      const prediction = predict(row.x);
      if (!cls && !Number.isFinite(prediction))
        throw Error(
          '計算結果が数値範囲を超えました。スケーリング・入力の単位・次数を変更してください。',
        );
      return {
        ...row,
        rawX: row.x,
        x: plot.encode(row.x),
        pred: cls ? prediction.label : prediction,
        probabilities: cls ? prediction.probabilities : undefined,
      };
    });
  train = annotate(train);
  test = annotate(test);
  function metrics(source) {
    if (cls) {
      const matrix = classes.map(() => classes.map(() => 0));
      source.forEach(
        (r) => matrix[classes.indexOf(r.y)][classes.indexOf(r.pred)]++,
      );
      const accuracy =
        source.filter((r) => r.y === r.pred).length / source.length;
      const f1 =
        classes.reduce((sum, _, i) => {
          const tp = matrix[i][i],
            fp = matrix.reduce((s, row) => s + row[i], 0) - tp,
            fn = matrix[i].reduce((s, v) => s + v, 0) - tp;
          return sum + ((2 * tp) / (2 * tp + fp + fn) || 0);
        }, 0) / classes.length;
      return { accuracy, f1, matrix };
    }
    const mean = source.reduce((s, r) => s + r.y, 0) / source.length,
      sse = source.reduce((s, r) => s + (r.y - r.pred) ** 2, 0),
      sst = source.reduce((s, r) => s + (r.y - mean) ** 2, 0);
    return {
      r2: sst < 1e-12 ? null : 1 - sse / sst,
      rmse: Math.sqrt(sse / source.length),
      mae:
        source.reduce((s, r) => s + Math.abs(r.y - r.pred), 0) / source.length,
    };
  }
  const xRange = plot.axes[0].range,
    yRange = cls ? plot.axes[1].range : extent(rows.map((r) => r.y));
  const curve = [],
    grid = [];
  if (cls) {
    for (let j = 0; j < 48; j++)
      for (let i = 0; i < 48; i++) {
        const x = xRange[0] + ((i + 0.5) / 48) * (xRange[1] - xRange[0]),
          y = yRange[0] + ((j + 0.5) / 48) * (yRange[1] - yRange[0]);
        const prediction = predict(plot.decode([x, y]));
        grid.push({
          i,
          j,
          c: classes.indexOf(prediction.label),
          score: prediction.score,
        });
      }
  } else if (categoricalX)
    plot.axes[0].categories.forEach((_, i) =>
      curve.push([i, predict(plot.decode([i]))]),
    );
  else
    for (let i = 0; i <= 180; i++) {
      const x = xRange[0] + (i / 180) * (xRange[1] - xRange[0]);
      curve.push([x, predict([x])]);
    }
  const treeCurves =
    advanced?.treePredict && !cls
      ? Array.from({ length: 5 }, (_, t) =>
          curve.map((p) => [
            p[0],
            advanced.treePredict(plot.decode([p[0]]))[t],
          ]),
        )
      : [];
  return {
    preprocessing,
    plotAxes: plot.axes,
    extraInfo: advanced?.info,
    decisionTree,
    supportIds: advanced?.supportIds ?? [],
    treeCurves,
    train,
    test,
    trainMetrics: metrics(train),
    testMetrics: metrics(test),
    classes,
    xRange,
    yRange,
    curve,
    grid,
    history,
    equation,
    weights,
    excluded: data.rows.length - rows.length,
    opts,
    headers: data.headers,
    features,
    sourceName: data.name,
  };
}
