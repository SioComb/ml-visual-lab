import { $, esc } from './shared/dom.js';
const colors = [
  '#248574',
  '#6486d9',
  '#d49b45',
  '#b373b6',
  '#d87066',
  '#54a4b4',
  '#8f9650',
  '#846bba',
];
const fmt = (v, digits = 3) =>
  v == null
    ? '—'
    : v.toLocaleString('en-US', { maximumFractionDigits: digits });

export function modelOverlay(result, axes) {
  if (!$('showDetails').checked) return '';
  const { x, y } = axes;
  if (result.plotAxes?.[0]?.type === 'category') {
    if (result.opts.algorithm === 'svr')
      return result.curve
        .map(
          (p) =>
            `<rect x="${x(p[0]) - 12}" y="${y(p[1] + result.extraInfo.epsilon)}" width="24" height="${y(p[1] - result.extraInfo.epsilon) - y(p[1] + result.extraInfo.epsilon)}" fill="#248574" fill-opacity=".12" stroke="#248574" stroke-dasharray="3 3"/>`,
        )
        .join('');
    if (result.opts.algorithm === 'forest')
      return result.treeCurves
        .map((curve) =>
          curve
            .map(
              (p) =>
                `<path d="M${x(p[0]) - 9},${y(p[1])}h18" stroke="#90a994" stroke-opacity=".55"/>`,
            )
            .join(''),
        )
        .join('');
  }
  if (result.opts.algorithm === 'forest' && result.treeCurves.length)
    return result.treeCurves
      .map(
        (curve) =>
          `<path d="${curve.map((p, i) => `${i ? 'L' : 'M'}${x(p[0])},${y(p[1])}`).join(' ')}" stroke="#90a994" stroke-opacity=".4" fill="none" stroke-width="1.2"/>`,
      )
      .join('');
  if (result.opts.algorithm === 'svr') {
    const epsilon = result.extraInfo.epsilon;
    const upper = result.curve.map((p) => [x(p[0]), y(p[1] + epsilon)]),
      lower = result.curve.map((p) => [x(p[0]), y(p[1] - epsilon)]);
    const path = (points) =>
      points.map((p, i) => `${i ? 'L' : 'M'}${p.join(',')}`).join(' ');
    return `<path d="${path([...upper, ...[...lower].reverse()])}Z" fill="#248574" fill-opacity=".09"/><path d="${path(upper)}" fill="none" stroke="#248574" stroke-dasharray="5 4"/><path d="${path(lower)}" fill="none" stroke="#248574" stroke-dasharray="5 4"/>`;
  }
  if (result.opts.algorithm !== 'svm' || result.classes.length !== 2) return '';
  // Marching squares on the actual decision scores: f(x) = -1, 0, +1.
  const size = 48,
    xr = result.xRange,
    yr = result.yRange;
  const position = (i, j) => [
    x(xr[0] + ((i + 0.5) / size) * (xr[1] - xr[0])),
    y(yr[0] + ((j + 0.5) / size) * (yr[1] - yr[0])),
  ];
  let svg = '';
  for (const level of [-1, 0, 1]) {
    let path = '';
    for (let j = 0; j < size - 1; j++)
      for (let i = 0; i < size - 1; i++) {
        const corners = [
            [i, j],
            [i + 1, j],
            [i + 1, j + 1],
            [i, j + 1],
          ],
          intersections = [];
        for (let edge = 0; edge < 4; edge++) {
          const a = corners[edge],
            b = corners[(edge + 1) % 4];
          const va = result.grid[a[1] * size + a[0]].score,
            vb = result.grid[b[1] * size + b[0]].score;
          if (
            !Number.isFinite(va) ||
            !Number.isFinite(vb) ||
            va < level === vb < level
          )
            continue;
          const t = (level - va) / (vb - va),
            pa = position(...a),
            pb = position(...b);
          intersections.push([
            pa[0] + t * (pb[0] - pa[0]),
            pa[1] + t * (pb[1] - pa[1]),
          ]);
        }
        for (let q = 0; q + 1 < intersections.length; q += 2)
          path += `M${intersections[q].join(',')}L${intersections[q + 1].join(',')}`;
      }
    svg += `<path d="${path}" stroke="#476052" stroke-width="${level === 0 ? 1.8 : 1.2}" ${level === 0 ? '' : 'stroke-dasharray="4 4"'} fill="none"/>`;
  }
  return svg;
}

export function renderDecisionTree(result) {
  const root = result.decisionTree;
  if (!root) {
    $('treePanel').hidden = true;
    return;
  }
  const classification = result.opts.task === 'classification',
    info = result.extraInfo;
  $('treeHelp').textContent =
    `深さ ${info.treeDepth}（上限 ${info.maxDepth}）· ${info.nodeCount}ノード · ${info.leafCount}枚の葉 · 分割には最低${info.minSamplesSplit}件`;

  function nodeHTML(node, branch = '') {
    const condition = node.left
        ? `${esc(node.featureName)} ≤ ${fmt(node.displayThreshold)}`
        : '葉ノード',
      measure = classification
        ? `Gini: ${fmt(node.gini)}`
        : `MSE: ${fmt(node.mse)}`,
      prediction = classification
        ? `Class: ${esc(node.prediction)}`
        : `Value: ${fmt(node.prediction)}`,
      counts = classification
        ? `<span class="tree-counts">Counts: ${node.classCounts
            .map((item) => `${esc(item.label)} ${item.count}`)
            .join(' · ')}</span>`
        : '',
      children = node.left
        ? `<ul>${nodeHTML(node.left, 'True')}${nodeHTML(node.right, 'False')}</ul>`
        : '';
    return `<li>${branch ? `<span class="tree-branch">${branch}</span>` : ''}<div class="tree-node ${node.left ? '' : 'leaf'}" role="treeitem" aria-label="${esc(condition)}, ${measure}, Samples: ${node.samples}, ${prediction}"><strong>${condition}</strong><span>${measure}</span><span>Samples: ${node.samples}</span>${counts}<b>${prediction}</b></div>${children}</li>`;
  }
  $('treeVisual').innerHTML =
    `<div class="tree-root" role="tree" aria-label="学習した決定木"><ul>${nodeHTML(root)}</ul></div>`;
}

export function renderClustering(result, axesFactory) {
  const kmeans = result.opts.algorithm === 'kmeans',
    count = result.points.length,
    m = result.clusterMetrics;
  $('downloadPred').textContent = '↓ クラスタ結果 CSV';
  $('resultStatus').textContent = '学習完了';
  $('resultStatus').className = 'status';
  $('resultMeta').textContent =
    `${kmeans ? 'k-means法' : '階層的クラスタリング'} · 正解ラベルなし · ${count}件すべてを使用 · ${result.sourceName}`;
  const card = (title, value, note, primary = false) =>
    `<div class="metric ${primary ? 'primary-metric' : ''}"><div class="metric-label">${title}<small>最終結果</small></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`;
  $('metrics').innerHTML =
    card(
      'クラスタ数',
      result.classes.length + '<small>個</small>',
      '指定したグループ数',
      true,
    ) +
    card(
      'シルエット係数',
      fmt(m.silhouette),
      `−1〜1 · 高いほど分離（${m.silhouetteSample}点で評価）`,
    ) +
    card(
      'クラスタ内平方和',
      fmt(m.inertia, 2),
      `${result.preprocessing.scaling === 'standard' ? '標準化後' : result.preprocessing.scaling === 'minmax' ? 'Min-Max後' : '数値は元の単位'} · 同じk・データ・前処理で比較`,
    );
  $('chartTitle').textContent = kmeans
    ? 'クラスタと重心'
    : '樹形図で切り分けたクラスタ';
  $('chartSubtitle').textContent = kmeans
    ? result.centers.length
      ? '近い重心のグループへ。×印は各クラスタの中心です。'
      : '変換後の空間で近い重心のグループへ。色が所属を表します。'
    : '似た点から順にまとめ、指定した数のグループに分けます。';
  $('residualControl').hidden = true;
  $('detailControl').hidden = true;
  $('pointFilter').hidden = true;
  $('clusterStepControl').hidden = !kmeans;
  $('hierarchyPanel').hidden = kmeans;
  $('treePanel').hidden = true;
  if (kmeans) {
    $('clusterStep').max = result.steps.length - 1;
    $('clusterStep').value = result.steps.length - 1;
    $('clusterStep').oninput = () => drawClusters(result, axesFactory);
  }
  $('diagnosticTitle').textContent = 'グループごとのデータ数';
  $('diagnosticHelp').textContent =
    '最終結果。色はグループの識別用で、正解ラベルではありません。';
  const max = Math.max(...m.counts),
    chartHeight = result.classes.length * 33 + 20;
  $('diagnostic').innerHTML =
    `<svg viewBox="0 0 390 ${chartHeight}" role="img" aria-label="クラスタごとの件数">${m.counts.map((n, i) => `<text x="4" y="${i * 33 + 22}">C${i + 1}</text><rect x="36" y="${i * 33 + 7}" width="${(n / max) * 285}" height="20" rx="3" fill="${colors[i]}" fill-opacity=".8"/><text x="${44 + (n / max) * 285}" y="${i * 33 + 22}">${n}件</text>`).join('')}</svg>`;
  $('readingTitle').textContent = kmeans
    ? '重心を動かし、まとまりを探す'
    : '似た点から、大きなグループへ';
  $('readingText').textContent = kmeans
    ? 'k個の重心を置き、各点を近い重心に割り当て、そのグループの平均へ重心を動かす。この2つを繰り返すのがk-means法です。スライダーで反復を戻して、動きを確かめてください。'
    : '最初は1点が1クラスタ。近いクラスタ同士を繰り返し結びます。樹形図の切断線を上にすると少数の大きなグループ、下にすると多数の小さなグループになります。';
  $('insight').textContent = kmeans
    ? `シルエット係数は ${fmt(m.silhouette)}。正解率ではなく、同じグループ内の近さと他グループとの離れ具合を測ります。kを増やすだけでも平方和は減りやすいので、平方和だけで最適なkは決められません。`
    : `${{ ward: 'Ward法は、まとめたときのクラスタ内の分散の増加を小さくします。', single: '最短距離法は、一番近い点同士の距離を使います。鎖状につながりやすい性質があります。', complete: '最長距離法は、一番遠い点同士の距離を使います。コンパクトなグループを作りやすい方法です。', average: '群平均法は、クラスタ間のすべての点の組の距離を平均します。' }[result.opts.linkage]} 距離は前処理後の${result.preprocessing.outputNames.length}列から計算しています。`;
  $('nextExperiment').textContent = kmeans
    ? '買い物傾向のサンプルでk=2を試そう。曲がったまとまりを、重心への距離だけでうまく分けられるでしょうか？'
    : '買い物傾向のサンプルでk=2を選び、Ward法と最短距離法を比較。クラスタの結び方を変えると何が変わるでしょうか？';
  if (!kmeans) drawDendrogram(result);
  drawClusters(result, axesFactory);
}

export function drawClusters(result, axesFactory) {
  const step = result.steps?.[+$('clusterStep').value],
    labels = step ? step.labels : result.points.map((p) => p.cluster),
    centers = step ? step.centers : result.centers;
  const final = !step || +$('clusterStep').value === result.steps.length - 1;
  if (step)
    $('clusterStepValue').textContent =
      `${step.iteration} / ${result.steps.length - 1}${final ? '（最終）' : ''}`;
  $('equation').textContent =
    step && !final
      ? `反復 ${step.iteration} · 平方和 ${fmt(step.inertia, 2)}（上の指標は最終結果）`
      : result.equation;
  $('legend').innerHTML =
    result.classes
      .map(
        (c, i) =>
          `<span><i style="background:${colors[i]}"></i>${esc(c)} · ${labels.filter((v) => v === i).length}件</span>`,
      )
      .join('') + (step && centers.length ? '<span>× 重心</span>' : '');
  const axes = axesFactory(
      result.xRange,
      result.yRange,
      800,
      440,
      undefined,
      result.headers[result.opts.x],
      result.headers[result.opts.x2],
      result.plotAxes,
    ),
    { x, y } = axes;
  let svg = axes.s;
  const stride = Math.max(1, Math.ceil(result.points.length / 1200));
  if (step && +$('clusterStep').value > 0) {
    const previous = result.steps[+$('clusterStep').value - 1];
    centers.forEach(
      (c, i) =>
        (svg += `<path d="M${x(previous.centers[i][0])},${y(previous.centers[i][1])}L${x(c[0])},${y(c[1])}" stroke="${colors[i]}" stroke-width="2" stroke-dasharray="4 3"/>`),
    );
  }
  result.points.forEach((p, i) => {
    if (i % stride === 0)
      svg += `<circle class="point" data-point="${i}" cx="${x(p.x[0])}" cy="${y(p.x[1])}" r="4" fill="${colors[labels[i]]}" fill-opacity=".75"><title>行 ${p.id + 2} · クラスタ ${labels[i] + 1}</title></circle>`;
  });
  if (step)
    centers.forEach((c, i) => {
      const cx = x(c[0]),
        cy = y(c[1]);
      svg += `<circle cx="${cx}" cy="${cy}" r="9" fill="white" fill-opacity=".85"/><path d="M${cx - 6},${cy - 6}L${cx + 6},${cy + 6}M${cx + 6},${cy - 6}L${cx - 6},${cy + 6}" stroke="${colors[i]}" stroke-width="3"><title>クラスタ ${i + 1} の重心</title></path>`;
    });
  $('mainPlot').innerHTML = svg;
  $('plotHint').textContent =
    stride > 1
      ? `表示は${stride}点おき（学習は全${result.points.length}件）`
      : '点に触れると、座標と所属クラスタがわかります';
  $('mainPlot').onpointermove = (event) => {
    const i = event.target.dataset.point;
    if (i === undefined) {
      $('tooltip').hidden = true;
      return;
    }
    const p = result.points[+i],
      tt = $('tooltip');
    tt.innerHTML = `<strong>行 ${p.id + 2} · クラスタ ${labels[+i] + 1}</strong><br>${esc(result.headers[result.opts.x])}: ${esc(p.rawX?.[0] ?? fmt(p.x[0]))}<br>${esc(result.headers[result.opts.x2])}: ${esc(p.rawX?.[1] ?? fmt(p.x[1]))}`;
    tt.hidden = false;
    const box = $('mainPlot').parentElement.getBoundingClientRect();
    tt.style.left =
      Math.max(
        5,
        Math.min(event.clientX - box.left + 12, box.width - tt.offsetWidth - 5),
      ) + 'px';
    tt.style.top =
      Math.max(0, event.clientY - box.top - tt.offsetHeight - 10) + 'px';
  };
  $('mainPlot').onpointerleave = () => ($('tooltip').hidden = true);
}

function drawDendrogram(result) {
  const h = result.hierarchy,
    n = result.points.length,
    order = [];
  function leaves(id) {
    const node = h.nodes[id];
    if (node.left === undefined) order.push(id);
    else {
      leaves(node.left);
      leaves(node.right);
    }
  }
  leaves(h.root);
  const width = Math.max(620, n * 16 + 85),
    height = 330,
    left = 60,
    right = 20,
    top = 23,
    bottom = 60;
  const max = h.nodes[h.root].height || 1,
    x = new Map(),
    y = (value) => height - bottom - (value / max) * (height - top - bottom);
  order.forEach((id, pos) =>
    x.set(id, left + ((pos + 0.5) / n) * (width - left - right)),
  );
  let svg = '';
  for (let tick = 0; tick <= 4; tick++) {
    const value = (max * tick) / 4;
    svg += `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" stroke="#e5ece7"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
  }
  const clusterOf = new Map(result.points.map((p, i) => [i, p.cluster]));
  for (let id = n; id < h.nodes.length; id++) {
    const node = h.nodes[id],
      a = h.nodes[node.left],
      b = h.nodes[node.right];
    const ax = x.get(node.left),
      bx = x.get(node.right);
    x.set(id, (ax + bx) / 2);
    const ca = clusterOf.get(node.left),
      cb = clusterOf.get(node.right),
      c = ca === cb ? ca : -1;
    clusterOf.set(id, c);
    svg += `<path d="M${ax},${y(a.height)}V${y(node.height)}H${bx}V${y(b.height)}" fill="none" stroke="${c >= 0 ? colors[c] : '#829288'}" stroke-width="1.7"><title>距離 ${fmt(node.height)} / ${node.count}点を結合</title></path>`;
  }
  const k = result.classes.length,
    cutIndex = n - k;
  const lower = cutIndex > 0 ? h.merges[cutIndex - 1].height : 0,
    upper = h.merges[cutIndex]?.height ?? max;
  const cutoff = (lower + upper) / 2;
  svg += `<line x1="${left}" x2="${width - right}" y1="${y(cutoff)}" y2="${y(cutoff)}" stroke="#bd7139" stroke-width="2" stroke-dasharray="7 5"/>`;
  order.forEach(
    (id) =>
      (svg += `<text transform="translate(${x.get(id)},${height - bottom + 12}) rotate(65)" text-anchor="start" style="fill:${colors[result.points[id].cluster]}">${result.points[id].id + 2}</text>`),
  );
  svg += `<text x="18" y="${height / 2}" transform="rotate(-90 18 ${height / 2})" text-anchor="middle">結合距離</text>`;
  $('dendrogram').innerHTML =
    `<svg style="width:${width}px;min-width:${width}px;height:${height}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${n}点の階層的クラスタリングの樹形図">${svg}</svg>`;
  $('hierarchyHelp').textContent =
    `全${n}点の結合を表示 · 横スクロールできます。破線はk=${k}の切断位置。${Math.abs(upper - lower) < 1e-10 ? '同じ距離の結合があるため、k個になる結合順で切断しています。' : ''}`;
}
