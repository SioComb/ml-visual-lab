import { sampleOptions } from './samples.js';
import { sample, parseCSV, numeric } from './ml.js';
import { renderPreprocessing, processedCSVRows } from './preprocessing-ui.js';
import { modelOverlay, renderClustering, drawClusters } from './visuals.js';
import { initReinforcement } from './rl/ui.js';
import { $, esc } from './shared/dom.js';
import { downloadCSV } from './shared/download.js';
const palette = [
  '#248574',
  '#6486d9',
  '#d49b45',
  '#b373b6',
  '#d87066',
  '#54a4b4',
  '#8f9650',
  '#846bba',
];
const classPalette = [
  '#0072B2',
  '#C45D00',
  '#8B429D',
  '#00845F',
  '#B53854',
  '#726214',
  '#2B879C',
  '#505A70',
];
let task = 'regression',
  dataset = sample(),
  result = null,
  busy = false,
  worker = null,
  dirty = false;
const names = {
  linear: '線形回帰',
  polynomial: '多項式回帰',
  logistic: 'ロジスティック回帰',
  knn: 'k近傍法（k-NN）',
  forest: 'ランダムフォレスト',
  svm: 'サポートベクターマシン（SVM）',
  svr: 'サポートベクター回帰（SVR）',
  kmeans: 'k-means法（非階層的）',
  hierarchical: '階層的クラスタリング',
};
const descriptions = {
  linear: '1本の直線で、数値の増え方・減り方をとらえます。',
  polynomial: '曲線で関係をとらえます。次数を上げると複雑な形に。',
  logistic: '2クラスの確率を学習し、直線の境界で分けます。',
  knn: '近くにある学習データの多数決で分類します。',
  forest: 'データと入力列をランダムに選んだ複数の決定木を組み合わせます。',
  svm: 'マージンを広く取る境界を学習します。RBFなら曲がった境界にも対応。',
  svr: 'εの範囲内の誤差を許しながら、数値を予測するSVM系のモデルです。',
  kmeans: '正解ラベルを使わず、k個の重心への近さで点をまとめます。',
  hierarchical:
    '近いクラスタから順に結合し、グループの階層を樹形図で表します。',
};
function options(el, items, value) {
  el.innerHTML = items
    .map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`)
    .join('');
  if (items.some(([v]) => String(v) === String(value))) el.value = value;
}
function makeSample(kind) {
  return sample(kind, +$('noise').value, task);
}
function populateMode() {
  const cls = task === 'classification',
    cluster = task === 'clustering';
  for (const [id, mode] of [
    ['regTask', 'regression'],
    ['clsTask', 'classification'],
    ['clusterTask', 'clustering'],
  ]) {
    $(id).classList.toggle('active', task === mode);
    $(id).setAttribute('aria-pressed', task === mode);
  }
  options($('sample'), sampleOptions(task));
  if (dataset.synthetic) {
    $('sample').value = dataset.sampleKind ?? 'linear';
  } else {
    $('sample').add(new Option('読み込んだCSV', 'custom'));
    $('sample').value = 'custom';
  }
  const models = cluster
    ? ['kmeans', 'hierarchical']
    : cls
      ? ['logistic', 'knn', 'forest', 'svm']
      : ['linear', 'polynomial', 'forest', 'svr'];
  options(
    $('algorithm'),
    models.map((v) => [v, names[v]]),
    cls ? 'logistic' : models[0],
  );
  $('x2Field').hidden = !(cls || cluster);
  $('targetField').hidden = cluster;
  $('testControls').hidden = cluster;
  $('clusterControls').hidden = !cluster;
  $('trainHint').textContent = cluster
    ? '正解ラベルなし · 全有効行でグループを探索'
    : '同じデータ・設定なら、同じ分割で再現';
  modelSettings();
  columns();
}
function inferType(col) {
  const values = dataset.rows
    .map((r) => r[col])
    .filter((v) => String(v ?? '').trim() !== '');
  return values.length && values.every(numeric) ? 'numeric' : 'category';
}
function refreshTypes() {
  $('xType').value = inferType(+$('xCol').value);
  $('x2Type').value = inferType(+$('x2Col').value);
}
function columns() {
  const all = dataset.headers.map((h, i) => [i, h]),
    nums = all.filter(([i]) => dataset.rows.some((r) => numeric(r[i])));
  options($('xCol'), all, all[0]?.[0]);
  options($('x2Col'), all, all[1]?.[0]);
  const target = task === 'classification' ? all : nums;
  options($('target'), target, target.at(-1)?.[0]);
  refreshTypes();
  $('fileInfo').textContent =
    `${dataset.name} · ${dataset.rows.length.toLocaleString()}行 × ${dataset.headers.length}列`;
  $('noiseControl').hidden =
    !dataset.synthetic || dataset.sampleKind === 'category';
  $('sampleExplanation').hidden = !dataset.synthetic;
  $('sampleDescription').textContent = dataset.description ?? '';
  $('sampleExperiment').textContent = dataset.experiment ?? '';
  renderTable();
}
function modelSettings() {
  const a = $('algorithm').value;
  $('modelHelp').textContent = descriptions[a];
  $('complexityWrap').hidden = a !== 'polynomial' && a !== 'knn';
  $('complexityLabel').textContent = a === 'knn' ? '近傍の数 k' : '曲線の次数';
  $('complexity').min = a === 'knn' ? 1 : 2;
  $('complexity').max = a === 'knn' ? 25 : 8;
  $('complexity').step = 1;
  $('complexity').value = a === 'knn' ? 7 : 3;
  $('complexityValue').textContent = $('complexity').value;
  $('forestControls').hidden = a !== 'forest';
  $('svmControls').hidden = a !== 'svm' && a !== 'svr';
  $('epsilonField').hidden = a !== 'svr';
  $('gammaField').hidden = $('kernel').value === 'linear';
  $('linkageField').hidden = a !== 'hierarchical';
}
function getOpts() {
  return {
    task,
    algorithm: $('algorithm').value,
    x: +$('xCol').value,
    x2: +$('x2Col').value,
    target: +$('target').value,
    degree: +$('complexity').value,
    k: +$('complexity').value,
    test: +$('testRatio').value,
    trees: +$('trees').value,
    depth: +$('depth').value,
    kernel: $('kernel').value,
    c: +$('svmC').value,
    gamma: +$('gamma').value,
    epsilon: +$('epsilon').value,
    clusters: +$('clusterCount').value,
    linkage: $('linkage').value,
    scaling: $('scaling').value,
    oneHot: $('oneHot').checked,
    categoryColumns: [
      ...($('xType').value === 'category' ? [+$('xCol').value] : []),
      ...(task !== 'regression' && $('x2Type').value === 'category'
        ? [+$('x2Col').value]
        : []),
    ],
  };
}
function markDirty() {
  $('downloadProcessed').disabled = true;
  $('cancelTrain').hidden = true;
  dirty = true;
  if (worker) {
    worker.terminate();
    worker = null;
    busy = false;
    $('train').disabled = false;
    $('train').innerHTML = '<span>▶</span> モデルを学習する';
  }
  $('resultStatus').textContent = result ? '設定変更 · 再学習が必要' : '学習前';
  $('resultStatus').className = 'status stale';
  $('downloadPred').disabled = true;
  hideMessage();
}
function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = false;
}
function hideMessage() {
  $('message').hidden = true;
}
function run() {
  if (busy) return;
  $('downloadProcessed').disabled = true;
  $('cancelTrain').hidden = false;
  busy = true;
  hideMessage();
  $('train').disabled = true;
  $('downloadPred').disabled = true;
  $('train').textContent = '学習しています…';
  $('resultStatus').textContent = '学習中';
  $('resultStatus').className = 'status';
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({ data }) => {
      if (data.progress) {
        $('train').textContent = data.progress;
        return;
      }
      $('cancelTrain').hidden = true;
      worker.terminate();
      worker = null;
      busy = false;
      $('train').disabled = false;
      $('train').innerHTML = '<span>▶</span> モデルを学習する';
      if (data.error) {
        showMessage(data.error);
        $('resultStatus').textContent = '設定を確認';
        $('resultStatus').className = 'status stale';
        return;
      }
      result = data.result;
      dirty = false;
      $('downloadProcessed').disabled = false;
      $('downloadPred').disabled = false;
      render();
      const notices = [];
      if (result.extraInfo?.converged === false)
        notices.push(
          '最適化が収束条件に達していないため、結果は近似です。C・γを小さくするか、データを減らして再学習してください。',
        );
      if (result.excluded)
        notices.push(
          `空欄・数値に変換できない値がある ${result.excluded} 行を除外しました。${result.opts.task === 'clustering' ? '選択した入力列だけ' : '選択した入力列と目的変数だけ'}を検査しています。`,
        );
      if (result.preprocessing?.unknownRows)
        notices.push(
          `テスト${result.preprocessing.unknownRows}行に学習時にないカテゴリがあり、該当列をすべて0に変換しました。`,
        );
      if (notices.length) showMessage(notices.join(' '));
    };
    worker.onerror = () => {
      $('cancelTrain').hidden = true;
      if (worker) worker.terminate();
      worker = null;
      busy = false;
      $('train').disabled = false;
      $('train').textContent = 'モデルを学習する';
      $('resultStatus').textContent = '学習エラー';
      showMessage(
        '学習処理を実行できませんでした。ページを再読み込みして試してください。',
      );
    };
    worker.postMessage({ dataset, opts: getOpts() });
  } catch (e) {
    $('cancelTrain').hidden = true;
    busy = false;
    $('train').disabled = false;
    $('train').textContent = 'モデルを学習する';
    showMessage(
      'このブラウザでは学習を開始できません。最新のブラウザで開いてください。',
    );
  }
}
function fmt(v, d = 3) {
  return v == null || !Number.isFinite(v)
    ? '—'
    : Math.abs(v) >= 1e5
      ? v.toExponential(2)
      : v.toLocaleString('en-US', {
          maximumFractionDigits: d,
          minimumFractionDigits: d,
        });
}
function metric(label, value, note, main = false) {
  return `<div class="metric ${main ? 'primary-metric' : ''}"><div class="metric-label">${label}<small>テストデータ</small></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`;
}
function render() {
  renderPreprocessing(result);
  if (result.opts.task === 'clustering') {
    renderClustering(result, svgAxes);
    renderTable();
    return;
  }
  const r = result,
    cls = r.opts.task === 'classification',
    m = r.testMetrics;
  $('downloadPred').textContent = '↓ 予測結果 CSV';
  $('resultStatus').textContent = '学習完了';
  $('resultStatus').className = 'status';
  $('resultMeta').textContent =
    `${names[r.opts.algorithm]} · 学習 ${r.train.length}件 / テスト ${r.test.length}件 · ${r.sourceName}`;
  $('metrics').innerHTML = cls
    ? metric(
        '正解率 Accuracy',
        fmt(m.accuracy * 100, 1) + '<small>%</small>',
        '正しく分類できたデータの割合',
        true,
      ) +
      metric('F1スコア', fmt(m.f1), '各クラスのF1を同じ重みで平均') +
      metric(
        '誤分類',
        r.test.filter((p) => p.y !== p.pred).length + '<small>件</small>',
        `テスト ${r.test.length}件のうち`,
      )
    : metric(
        '決定係数 R²',
        fmt(m.r2),
        '1に近いほど高精度 · 負の値もあり',
        true,
      ) +
      metric(
        '平均的な誤差 RMSE',
        fmt(m.rmse, 2),
        '小さいほど良い · 大きなずれを重視',
      ) +
      metric('絶対誤差 MAE', fmt(m.mae, 2), '予測と実測の差の絶対値を平均');
  $('chartTitle').textContent = cls ? 'データと決定境界' : 'データと予測線';
  $('chartSubtitle').textContent = cls
    ? '背景の色は、その場所でモデルが予測するクラス。'
    : '点と線の距離が、予測のずれ。';
  $('residualControl').hidden = cls;
  $('clusterStepControl').hidden = true;
  $('hierarchyPanel').hidden = true;
  $('pointFilter').hidden = false;
  $('detailControl').hidden = !(
    ['svm', 'svr'].includes(r.opts.algorithm) ||
    (r.opts.algorithm === 'forest' && !cls)
  );
  $('detailLabel').textContent =
    r.opts.algorithm === 'forest'
      ? '5本の木も表示'
      : r.opts.algorithm === 'svr'
        ? '許容幅と支持点'
        : '境界と支持点';
  $('legend').innerHTML = cls
    ? r.classes
        .map(
          (c, i) =>
            `<span><i style="background:${classPalette[i]}"></i>${esc(c)}</span>`,
        )
        .join('') + '<span><i class="ring"></i>テストデータ（白抜き）</span>'
    : `<span><i style="background:${palette[0]}"></i>学習データ</span><span><i style="background:${palette[1]}"></i>テストデータ</span><span><i class="line" style="background:${palette[0]}"></i>予測線</span>`;
  if (['svm', 'svr'].includes(r.opts.algorithm))
    $('legend').innerHTML +=
      '<span>◎ サポートベクトル（' + r.supportIds.length + '点）</span>';
  if (r.opts.algorithm === 'svm' && r.classes.length === 2)
    $('legend').innerHTML += '<span>破線: 判断スコア ±1</span>';
  $('equation').textContent = r.equation;
  drawMain();
  drawDiagnostic();
  renderReading();
  renderTable();
}
function svgAxes(
  xrange,
  yrange,
  W = 800,
  H = 440,
  margin = { l: 65, r: 25, t: 24, b: 55 },
  xlabel = '',
  ylabel = '',
  plotAxes = [],
) {
  let { l, r, t, b } = margin;
  if (plotAxes[1]?.type === 'category') l = Math.max(l, 100);
  const x = (v) =>
      l + ((v - xrange[0]) / (xrange[1] - xrange[0])) * (W - l - r),
    y = (v) =>
      H - b - ((v - yrange[0]) / (yrange[1] - yrange[0])) * (H - t - b);
  const ticks = (range, axis) =>
    axis?.type === 'category'
      ? axis.categories
          .map((label, value) => ({ value, label }))
          .filter((_, i) => i % Math.ceil(axis.categories.length / 8) === 0)
      : Array.from({ length: 6 }, (_, i) => {
          let value = range[0] + (i / 5) * (range[1] - range[0]);
          return { value, label: axisNum(value) };
        });
  const label = (v) => esc(v.length > 8 ? v.slice(0, 7) + '…' : v);
  let s = '';
  for (const tick of ticks(xrange, plotAxes[0]))
    s += `<line x1="${x(tick.value)}" x2="${x(tick.value)}" y1="${t}" y2="${H - b}" stroke="#e8eeea" stroke-dasharray="3 5"/><text x="${x(tick.value)}" y="${H - b + 23}" text-anchor="middle"><title>${esc(tick.label)}</title>${label(tick.label)}</text>`;
  for (const tick of ticks(yrange, plotAxes[1]))
    s += `<line x1="${l}" x2="${W - r}" y1="${y(tick.value)}" y2="${y(tick.value)}" stroke="#e8eeea" stroke-dasharray="3 5"/><text x="${l - 12}" y="${y(tick.value) + 4}" text-anchor="end"><title>${esc(tick.label)}</title>${label(tick.label)}</text>`;
  s += `<line x1="${l}" x2="${W - r}" y1="${H - b}" y2="${H - b}" stroke="#cfdad3"/><text class="axis-label" x="${(l + W - r) / 2}" y="${H - 9}" text-anchor="middle">${esc(xlabel)}</text><text class="axis-label" transform="translate(16 ${(t + H - b) / 2}) rotate(-90)" text-anchor="middle">${esc(ylabel)}</text>`;
  return { x, y, s, l, r, t, b, W, H };
}
function axisNum(v) {
  return Math.abs(v) >= 10000 || (Math.abs(v) > 0 && Math.abs(v) < 0.01)
    ? v.toExponential(1)
    : Number(v.toFixed(1)).toString();
}

// Outline only edges whose neighboring predictions differ; no extra grid lines.
function classificationBoundary(result, axes) {
  const size = 48,
    w = (axes.W - axes.l - axes.r) / size,
    h = (axes.H - axes.t - axes.b) / size;
  let path = '';
  for (const point of result.grid) {
    const x = axes.l + point.i * w,
      y = axes.H - axes.b - (point.j + 1) * h;
    if (
      point.i < size - 1 &&
      result.grid[point.j * size + point.i + 1].c !== point.c
    )
      path += `M${x + w},${y}v${h}`;
    if (
      point.j < size - 1 &&
      result.grid[(point.j + 1) * size + point.i].c !== point.c
    )
      path += `M${x},${y}h${w}`;
  }
  return `<path d="${path}" fill="none" stroke="white" stroke-opacity=".8" stroke-width="2.8" pointer-events="none"/><path d="${path}" fill="none" stroke="#34465B" stroke-opacity=".85" stroke-width="1.1" pointer-events="none"/>`;
}

function drawMain() {
  if (!result) return;
  if (result.opts.task === 'clustering') {
    drawClusters(result, svgAxes);
    return;
  }
  const r = result,
    cls = r.opts.task === 'classification',
    a = svgAxes(
      r.xRange,
      r.yRange,
      800,
      440,
      undefined,
      r.headers[r.opts.x],
      r.headers[cls ? r.opts.x2 : r.opts.target],
      cls ? r.plotAxes : [r.plotAxes?.[0]],
    ),
    { x, y } = a;
  let s = `<defs><clipPath id="plotClip"><rect x="${a.l}" y="${a.t}" width="${800 - a.l - a.r}" height="${440 - a.t - a.b}"/></clipPath></defs>`;
  if (cls) {
    let w = (800 - a.l - a.r) / 48,
      h = (440 - a.t - a.b) / 48;
    s += '<g clip-path="url(#plotClip)" opacity=".26">';
    for (let p of r.grid)
      s += `<rect x="${a.l + p.i * w}" y="${440 - a.b - (p.j + 1) * h}" width="${w + 0.3}" height="${h + 0.3}" fill="${classPalette[p.c]}"/>`;
    s += '</g>';
  }
  s += a.s;
  s += '<g clip-path="url(#plotClip)">';
  if (
    cls &&
    !(
      r.opts.algorithm === 'svm' &&
      r.classes.length === 2 &&
      $('showDetails').checked
    )
  )
    s += classificationBoundary(r, a);
  s += modelOverlay(r, a);
  if (!cls) {
    const path = r.curve
      .map(
        (p, i) =>
          `${r.plotAxes?.[0]?.type === 'category' ? 'M' : i ? 'L' : 'M'}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`,
      )
      .join(' ');
    s += `<path d="${path}" stroke="${palette[0]}" stroke-width="2.7" fill="none"/>`;
    if (r.plotAxes?.[0]?.type === 'category')
      s += r.curve
        .map(
          (p) =>
            `<path d="M${x(p[0]) - 12},${y(p[1])}h24" stroke="${palette[0]}" stroke-width="3"><title>カテゴリの予測値 ${fmt(p[1], 2)}</title></path>`,
        )
        .join('');
  }
  const filter = $('pointFilter').value;
  let points = [
    ...(filter !== 'test'
      ? r.train.map((p) => ({ ...p, subset: 'train' }))
      : []),
    ...(filter !== 'train'
      ? r.test.map((p) => ({ ...p, subset: 'test' }))
      : []),
  ];
  const totalPoints = points.length;
  if (points.length > 1200) {
    const stride = points.length / 1200;
    points = Array.from(
      { length: 1200 },
      (_, i) => points[Math.floor(i * stride)],
    );
  }
  $('plotHint').textContent =
    totalPoints > 1200
      ? `表示は均等抽出した1,200点（学習・評価は全有効行）`
      : '点に触れると、実測値と予測値がわかります';
  const support = new Set(r.supportIds ?? []);
  points.forEach((p, i) => {
    let color = cls
        ? classPalette[r.classes.indexOf(p.y)]
        : p.subset === 'test'
          ? palette[1]
          : palette[0],
      cx = x(p.x[0]),
      cy = y(cls ? p.x[1] : p.y);
    if (!cls && $('showResiduals').checked)
      s += `<line x1="${cx}" x2="${cx}" y1="${cy}" y2="${y(p.pred)}" stroke="${color}" stroke-opacity=".4" stroke-dasharray="3 3"/>`;
    s += `<circle class="point" data-point="${i}" cx="${cx}" cy="${cy}" r="${p.subset === 'test' ? 4.2 : 3.6}" fill="${cls && p.subset === 'test' ? 'white' : color}" fill-opacity="${cls ? 1 : p.subset === 'test' ? 1 : 0.65}" stroke="${color}" stroke-width="${p.subset === 'test' ? 2.1 : cls ? 0.8 : 0.5}"><title>${esc(p.subset === 'test' ? 'テスト' : '学習')} | 正解: ${esc(p.y)} | 予測: ${esc(cls ? p.pred : fmt(p.pred))}</title></circle>`;
    if ($('showDetails').checked && support.has(p.id))
      s += `<circle cx="${cx}" cy="${cy}" r="7" fill="none" stroke="#243e32" stroke-width="1.3" pointer-events="none"/>`;
  });
  s += '</g>';
  $('mainPlot').innerHTML = s;
  $('mainPlot').onpointermove = (e) => {
    const idx = e.target.dataset.point;
    if (idx === undefined) {
      $('tooltip').hidden = true;
      return;
    }
    const p = points[+idx],
      tt = $('tooltip');
    tt.innerHTML = `<strong>${p.subset === 'test' ? 'テストデータ' : '学習データ'} · 行 ${p.id + 2}</strong><br>${esc(r.headers[r.opts.x])}: ${esc(p.rawX?.[0] ?? fmt(p.x[0], 2))}${cls ? '<br>' + esc(r.headers[r.opts.x2]) + ': ' + esc(p.rawX?.[1] ?? fmt(p.x[1], 2)) : ''}<br>正解: ${esc(p.y)}<br>予測: ${esc(cls ? p.pred : fmt(p.pred, 2))}${cls ? '<br>判定: ' + (p.y === p.pred ? '正解' : '誤分類') : ''}`;
    tt.hidden = false;
    const box = $('mainPlot').parentElement.getBoundingClientRect();
    tt.style.left =
      Math.max(
        5,
        Math.min(e.clientX - box.left + 14, box.width - tt.offsetWidth - 5),
      ) + 'px';
    tt.style.top =
      Math.max(0, e.clientY - box.top - tt.offsetHeight - 10) + 'px';
  };
  $('mainPlot').onpointerleave = () => ($('tooltip').hidden = true);
}
function drawDiagnostic() {
  const r = result,
    cls = r.opts.task === 'classification';
  $('diagnosticTitle').textContent = cls
    ? 'どのクラスを間違えた？'
    : '予測はどれだけ合っている？';
  $('diagnosticHelp').textContent = cls
    ? '混同行列。対角線は正解、それ以外は誤分類の件数。'
    : 'テストデータの実測値と予測値。対角線に近いほど正確です。';
  if (cls) {
    let m = r.testMetrics.matrix,
      max = Math.max(...m.flat(), 1);
    $('diagnostic').innerHTML =
      `<div style="overflow-x:auto"><table class="matrix"><thead><tr><th class="matrix-corner">実際 ↓<br>予測 →</th>${r.classes.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${m.map((row, i) => `<tr><th>${esc(r.classes[i])}</th>${row.map((v, j) => `<td style="background:${i === j ? `rgba(36,133,116,${0.06 + (v / max) * 0.55})` : `rgba(212,112,74,${v ? 0.12 + (v / max) * 0.35 : 0})`};color:${i === j && v / max > 0.65 ? '#fff' : '#385249'}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="matrix-label">テストデータのみ · ${r.test.length}件を評価</p>`;
    return;
  }
  let vals = r.test.flatMap((p) => [p.y, p.pred]),
    lo = Math.min(...vals),
    hi = Math.max(...vals),
    pad = (hi - lo || 1) * 0.12,
    range = [lo - pad, hi + pad];
  let a = svgAxes(
    range,
    range,
    390,
    240,
    { l: 58, r: 20, t: 15, b: 44 },
    '実測値',
    '予測値',
  );
  $('diagnostic').innerHTML =
    `<svg viewBox="0 0 390 240" role="img" aria-label="テストデータの実測値と予測値の散布図">${a.s}<path d="M ${a.x(range[0])} ${a.y(range[0])} L ${a.x(range[1])} ${a.y(range[1])}" stroke="#8aaa99" stroke-dasharray="4 4" fill="none"/>${r.test.map((p) => `<circle cx="${a.x(p.y)}" cy="${a.y(p.pred)}" r="3" fill="${palette[1]}" fill-opacity=".6"><title>実測 ${fmt(p.y)} / 予測 ${fmt(p.pred)}</title></circle>`).join('')}</svg>`;
}
function renderReading() {
  const r = result,
    cls = r.opts.task === 'classification',
    a = r.opts.algorithm,
    m = r.testMetrics,
    t = r.trainMetrics;
  $('readingTitle').textContent = cls
    ? '色の境界が、モデルの判断'
    : '線が教えてくれること';
  $('readingText').textContent = cls
    ? '点の色は実際のクラス、背景の色はモデルの予測です。色が違う場所にある点は誤分類。白抜きの点は学習に使わなかったテストデータです。'
    : '横軸は入力、縦軸は予測したい数値。緑の線は学習データから見つけた関係です。線に近い点ほど予測が合っています。青い点で、初めて見るデータへの強さを確かめます。';
  let text;
  if (cls) {
    let gap = t.accuracy - m.accuracy;
    text = `学習の正解率 ${fmt(t.accuracy * 100, 1)}% → テスト ${fmt(m.accuracy * 100, 1)}%。`;
    text +=
      gap > 0.12
        ? ' 差が大きいため、学習データに合わせすぎている可能性があります。'
        : m.accuracy < 0.7
          ? ' この設定ではクラスをうまく分けられていません。モデルや特徴量を変えてみましょう。'
          : ' この分割では、学習用とテスト用の成績を比較できます。別のデータでも同じ精度とは限りません。';
  } else {
    text = `学習 RMSE ${fmt(t.rmse, 2)} → テスト ${fmt(m.rmse, 2)}。`;
    text +=
      m.rmse > Math.max(t.rmse * 1.6, 1e-8)
        ? ' テストの誤差が大きく、過学習の可能性があります。'
        : m.r2 === null
          ? ' テストの実測値が一定なので、R²は定義できません。'
          : m.r2 < 0.4
            ? ' このモデルでは関係を十分にとらえられていません。線の形や入力列を変えてみましょう。'
            : ' この分割では、予測線がどれだけ新しいデータにも合うかを確認できます。';
  }
  if (a === 'forest') {
    $('readingTitle').textContent = 'たくさんの決定木を組み合わせる';
    $('readingText').textContent = cls
      ? '各決定木が出すクラス確率を平均し、最も高いクラスを選びます。木ごとにデータを復元抽出し、分岐ごとに入力列の候補をランダムに選びます。1本の木への依存を減らすアンサンブル学習です。'
      : '複数の決定木の数値予測を平均します。「5本の木も表示」で個々の木と最終的な予測線を比較できます。現在の回帰は入力1列なので、木の違いは主にデータの復元抽出から生まれます。';
  }
  if (a === 'svm') {
    $('readingTitle').textContent = '境界を支える、サポートベクトル';
    $('readingText').textContent =
      '外側の輪が付いた学習点は、境界の決定に関わるサポートベクトルです。線形カーネルは直線、RBFカーネルは曲がった境界に対応。Cが大きいほど誤分類への罰則が強くなります。';
    text +=
      ' ' +
      (r.classes.length === 2
        ? '破線は判断スコア±1の等高線。RBFでは画面上の距離がマージンの幅そのものではありません。'
        : '多クラスは各クラス対その他（One-vs-Rest）で学習します。');
  }
  if (a === 'svr') {
    $('readingTitle').textContent = '帯の中の誤差を、許す';
    $('readingText').textContent =
      'ε-SVRは、予測線から±ε以内の誤差に罰則を与えません。帯を外れた点の誤差には罰則を与え、モデルの複雑さとのバランスを取ります。輪付きの学習点がサポートベクトルです。';
  }
  if (a === 'logistic') {
    $('readingTitle').textContent = '「回帰」という名前の分類モデル';
    $('readingText').textContent =
      'ロジスティック回帰は、2クラスのどちらになるかを確率で表す分類モデルです。予測確率50%を境にクラスを決めます。数値2列なら直線の境界になり、カテゴリ列はOne-hot変換後の空間で学習します。';
  }
  if (r.plotAxes?.[0]?.type === 'category' && !cls) {
    $('readingTitle').textContent = 'カテゴリごとの予測を比べる';
    $('readingText').textContent =
      'カテゴリをOne-hot列へ変換して学習しています。横軸のカテゴリには数値の大小や連続性がないため、予測値をカテゴリごとの短い横線で表示します。';
  }
  $('insight').textContent = text;
  $('nextExperiment').textContent = {
    linear:
      '「気温 → アイスの販売数」に変更して学習。そのあと多項式回帰に切り替えると、直線との違いが見えます。',
    polynomial:
      '次数を2から8に上げてみよう。学習の誤差が減っても、テストの誤差は減るでしょうか？',
    logistic:
      '買い物傾向のサンプルでk近傍法と比較。直線では分けにくい形を、どちらがとらえられるでしょうか？',
    knn: 'kを1から25に変えてみよう。小さいと細かな境界、大きいとより広い範囲の多数決になります。',
    forest:
      '木の深さを1から10に変えてみよう。木の本数も増やすと、予測の細かさやテストの成績はどう変わるでしょうか？',
    svm: '買い物傾向のサンプルで線形とRBFを比較。Cを大きくして誤分類を厳しく扱うと、境界はどう変わるでしょうか？',
    svr: 'εを0.05から0.5へ広げてみよう。誤差を許す帯とサポートベクトルの数はどう変わるでしょうか？',
  }[a];
}
function renderTable() {
  const uploaded = dataset;
  $('tableMeta').textContent =
    `${uploaded.name} · ${uploaded.rows.length}行 × ${uploaded.headers.length}列 · 先頭10行`;
  let h =
    '<table><thead><tr><th>行</th>' +
    uploaded.headers.map((h) => `<th>${esc(h)}</th>`).join('') +
    '</tr></thead><tbody>';
  h += uploaded.rows
    .slice(0, 10)
    .map(
      (r, i) =>
        `<tr><td>${i + 2}</td>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`,
    )
    .join('');
  $('tableWrap').innerHTML = h + '</tbody></table>';
}
function download(filename, rows) {
  const csv =
    '\uFEFF' +
    rows
      .map((r) =>
        r
          .map((v) => '"' + String(v ?? '').replaceAll('"', '""') + '"')
          .join(','),
      )
      .join('\r\n');
  downloadCSV(filename, csv);
}
async function importFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showMessage('ファイルは2MB以内にしてください。');
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder('shift_jis', { fatal: true }).decode(buf);
    }
    const parsed = parseCSV(text);
    dataset = { ...parsed, name: file.name };
    if (!$('sample').querySelector('[value="custom"]'))
      $('sample').add(new Option('読み込んだCSV', 'custom'));
    $('sample').value = 'custom';
    columns();
    markDirty();
    showMessage(
      'CSVを読み込みました。特徴量・目的変数を確認して「モデルを学習する」を押してください。',
    );
  } catch (e) {
    showMessage(
      e.message ||
        'CSVを読み込めませんでした。ファイル形式を確認してください。',
    );
  } finally {
    $('file').value = '';
  }
}
$('regTask').onclick = () => switchTask('regression');
$('clsTask').onclick = () => switchTask('classification');
$('clusterTask').onclick = () => switchTask('clustering');
function switchTask(next) {
  if (task === next) return;
  task = next;
  if (dataset.synthetic)
    dataset = makeSample(
      next === 'clustering'
        ? 'clusters'
        : next === 'classification'
          ? 'moons'
          : 'linear',
    );
  populateMode();
  markDirty();
  if (dataset.synthetic) run();
  else
    showMessage(
      '学習の種類を変更しました。入力列と目的変数を確認してください。',
    );
}
$('sample').onchange = () => {
  if ($('sample').value === 'custom') return;
  dataset = makeSample($('sample').value);
  $('sample').querySelector('[value="custom"]')?.remove();
  columns();
  markDirty();
};
$('noise').oninput = () => {
  $('noiseValue').textContent = $('noise').value;
  if (dataset.synthetic) {
    dataset = makeSample($('sample').value);
    columns();
    markDirty();
  }
};
$('algorithm').onchange = () => {
  modelSettings();
  markDirty();
};
for (let id of ['xCol', 'x2Col'])
  $(id).onchange = () => {
    $(id === 'xCol' ? 'xType' : 'x2Type').value = inferType(+$(id).value);
    markDirty();
  };
$('target').onchange = markDirty;
for (let id of ['xType', 'x2Type', 'oneHot', 'scaling'])
  $(id).onchange = markDirty;
$('complexity').oninput = () => {
  $('complexityValue').textContent = $('complexity').value;
  markDirty();
};
$('testRatio').oninput = () => {
  let v = +$('testRatio').value;
  $('testValue').textContent = v + '%';
  $('testShare').textContent = 'テスト ' + v + '%';
  $('trainShare').textContent = '学習 ' + (100 - v) + '%';
  $('trainBar').style.width = 100 - v + '%';
  markDirty();
};
$('train').onclick = run;
$('cancelTrain').onclick = () => {
  markDirty();
  $('resultStatus').textContent = '学習を中止';
  showMessage('学習を中止しました。表示中の図がある場合は、前回の結果です。');
};
$('showResiduals').onchange = drawMain;
$('showDetails').onchange = drawMain;
$('pointFilter').onchange = drawMain;
$('file').onchange = (e) => importFile(e.target.files[0]);
['dragenter', 'dragover'].forEach((type) =>
  $('dropzone').addEventListener(type, (e) => {
    e.preventDefault();
    $('dropzone').classList.add('drag');
  }),
);
['dragleave', 'drop'].forEach((type) =>
  $('dropzone').addEventListener(type, (e) => {
    e.preventDefault();
    $('dropzone').classList.remove('drag');
  }),
);
$('dropzone').addEventListener('drop', (e) =>
  importFile(e.dataTransfer.files[0]),
);
$('downloadSample').onclick = () =>
  download('ml-data.csv', [dataset.headers, ...dataset.rows]);
$('downloadPred').onclick = () => {
  if (!result || dirty) return;
  const r = result;
  if (r.opts.task === 'clustering') {
    download('ml-clusters.csv', [
      [...r.features.map((i) => r.headers[i]), 'クラスタ', '元CSV行番号'],
      ...r.points.map((p) => [...(p.rawX ?? p.x), p.cluster + 1, p.id + 2]),
    ]);
    return;
  }
  download('ml-predictions.csv', [
    [
      ...r.features.map((i) => r.headers[i]),
      '実際の値',
      '予測値',
      'データ区分',
      '元CSV行番号',
    ],
    ...[
      ...r.train.map((p) => ({ ...p, split: 'train' })),
      ...r.test.map((p) => ({ ...p, split: 'test' })),
    ]
      .sort((a, b) => a.id - b.id)
      .map((p) => [...(p.rawX ?? p.x), p.y, p.pred, p.split, p.id + 2]),
  ]);
};
$('toggleTable').onclick = () => {
  let hidden = !$('tableWrap').hidden;
  $('tableWrap').hidden = hidden;
  $('toggleTable').textContent = hidden
    ? 'データを表示 ＋'
    : 'データを閉じる −';
  $('toggleTable').setAttribute('aria-expanded', !hidden);
};
$('guideBtn').onclick = () => $('guide').showModal();
$('closeGuide').onclick = $('guideStart').onclick = () => $('guide').close();
$('guide').addEventListener('click', (e) => {
  if (e.target === $('guide')) {
    let r = $('guide').getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $('guide').close();
  }
});
for (const id of ['trees', 'depth', 'clusterCount'])
  $(id).oninput = () => {
    $(id + 'Value').textContent = $(id).value;
    markDirty();
  };
for (const id of ['svmC', 'gamma', 'epsilon', 'linkage'])
  $(id).onchange = markDirty;
$('kernel').onchange = () => {
  $('gammaField').hidden = $('kernel').value === 'linear';
  markDirty();
};
$('downloadProcessed').onclick = () => {
  if (result && !dirty && !busy)
    download('ml-preprocessed.csv', processedCSVRows(result));
};
populateMode();
run();

// RL has its own controls and worker; existing dataset/model state is preserved.
let reinforcement = null;
$('rlTask').onclick = () => {
  reinforcement ??= initReinforcement();
  $('supervisedWorkspace').hidden = true;
  reinforcement.show();
  for (const id of ['regTask', 'clsTask', 'clusterTask', 'rlTask']) {
    $(id).classList.toggle('active', id === 'rlTask');
    $(id).setAttribute('aria-pressed', id === 'rlTask');
  }
};
for (const id of ['regTask', 'clsTask', 'clusterTask']) {
  $(id).addEventListener('click', () => {
    reinforcement?.hide();
    $('supervisedWorkspace').hidden = false;
    $('rlTask').classList.remove('active');
    $('rlTask').setAttribute('aria-pressed', false);
    $(id).classList.add('active');
    $(id).setAttribute('aria-pressed', true);
  });
}
