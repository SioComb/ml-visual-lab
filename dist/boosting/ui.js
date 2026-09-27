import { $, esc } from '../shared/dom.js';
import { loadLearningData, splitLearningData, trainMedians, plotFeatures, dataURL } from './data.js';
import { sigmoid, predictTree, traceTree } from './model.js';

const percent = (value) => `${(value * 100).toFixed(1)}%`;
const number = (value) => Number(value).toFixed(3);
const signed = (value) => `${value >= 0 ? '+' : '−'}${number(Math.abs(value))}`;

export function initXGBoost() {
  const root = $('xgboost');
  let data = null, partition = null, medians = null, worker = null, pending = null;
  let generation = 0, loadGeneration = 0, visible = false, playing = false, finishing = false, stages = [], initial = null;
  let initialScore = 0, current = 0, selected = 0, plotted = [];
  let options = null;
  root.innerHTML = `<div class="xgboost-heading"><div><div class="eyebrow">CLASSIFICATION · BOOSTING</div><h2>XGBoost：木を足して、予測を直す</h2><p>1本ずつ追加し、分類境界と確率の変化を確かめます。</p></div><span class="xgboost-badge">教育用 · 0〜60本</span></div>
    <p id="xgb-status" class="xgboost-status" role="status" aria-live="polite">データを読み込み中…</p>
    <div id="xgb-content" hidden class="xgboost-layout">
      <aside class="settings xgboost-settings" aria-label="学習の設定"><section class="setting-section"><div class="section-title"><span class="step">01</span><h2>学習を設定する</h2></div>
        <label for="xgb-dataset">データセット</label><select id="xgb-dataset"><option value="classification">classification</option><option value="moons">moons</option><option value="circles">circles</option></select>
        <label for="xgb-mode">使う特徴量</label><select id="xgb-mode"><option value="two">2特徴量（x1・x2）</option><option value="all">全特徴量（このCSVでは2列）</option></select>
        <p id="xgb-mode-note" class="field-help"></p>
        <label for="xgb-rate" class="range-label">学習率 η <output id="xgb-rate-value"></output></label><input id="xgb-rate" type="range" min="0.05" max="0.5" step="0.05" value="0.3">
        <label for="xgb-depth" class="range-label">木の深さ <output id="xgb-depth-value"></output></label><input id="xgb-depth" type="range" min="1" max="4" step="1" value="2">
        <label for="xgb-lambda" class="range-label">L2正則化 λ <output id="xgb-lambda-value"></output></label><input id="xgb-lambda" type="range" min="0" max="10" step="0.5" value="1">
        <label for="xgb-gamma" class="range-label">分岐ペナルティ γ <output id="xgb-gamma-value"></output></label><input id="xgb-gamma" type="range" min="0" max="5" step="0.1" value="0"></section>
        <section class="setting-section"><div class="section-title"><span class="step">02</span><h2>木を追加する</h2></div>
          <div class="xgboost-actions"><button id="xgb-next" class="primary" type="button">＋ 木を1本追加</button><button id="xgb-play" class="quiet" type="button">▶ 自動再生</button><button id="xgb-finish" class="quiet" type="button">60本まで計算</button><button id="xgb-reset" class="text-button" type="button">↺ リセット</button></div>
          <label for="xgb-history" class="range-label">学習履歴 <output id="xgb-history-value">0 / 0本</output></label><input id="xgb-history" type="range" min="0" max="0" value="0"><p class="field-help">スライダーで完了済みの時点へ戻れます。次の木は学習済みの続きから追加します。</p></section>
        <section class="setting-section"><h3>データ</h3><p id="xgb-split" class="field-help"></p><p class="field-help">target 0＝クラス0、1＝クラス1。検証データは学習、分割点、中央値の計算に使いません。</p></section></aside>
      <div class="xgboost-main"><div class="metrics xgboost-metrics"><div class="metric primary-metric"><div class="metric-label">検証正解率</div><div id="xgb-accuracy" class="metric-value">—</div><div id="xgb-accuracy-note" class="metric-note"></div></div><div class="metric"><div class="metric-label">検証 Log loss</div><div id="xgb-valid-loss" class="metric-value">—</div><div class="metric-note">小さいほどよい</div></div><div class="metric"><div class="metric-label">学習 Log loss</div><div id="xgb-train-loss" class="metric-value">—</div><div class="metric-note">学習データで計算</div></div></div>
        <section class="panel xgboost-plot-card"><h3>決定境界と検証データ</h3><p id="xgb-plot-note" class="field-help"></p><div class="xgboost-plot-wrap"><canvas id="xgb-plot" width="960" height="510" aria-label="分類境界と検証データの散布図。サンプルは下の選択欄からも選べます"></canvas></div><div class="xgboost-legend"><span><i class="xgboost-key xgboost-malignant"></i>クラス0</span><span><i class="xgboost-key xgboost-benign"></i>クラス1</span><span><i class="xgboost-key xgboost-wrong"></i>外枠＝誤分類</span><span><i class="xgboost-key xgboost-selected"></i>青枠＝選択中</span></div></section>
        <div class="xgboost-lower"><section class="panel xgboost-detail"><h3>選択サンプルの予測</h3><label for="xgb-sample">検証データから選ぶ</label><select id="xgb-sample"></select><p id="xgb-sample-label" class="field-help"></p><div class="xgboost-prob"><span>クラス1の予測確率</span><strong id="xgb-probability"></strong></div><div class="xgboost-prob-track"><span id="xgb-prob-bar"></span></div><div id="xgb-correction" class="xgboost-correction"></div></section>
          <section class="panel xgboost-detail"><h3 id="xgb-tree-title">現在の木の経路</h3><div id="xgb-path" class="xgboost-path"></div></section></div>
        <div class="xgboost-lower"><section class="panel xgboost-detail"><h3>Log loss の推移</h3><div id="xgb-loss-chart" class="xgboost-chart"></div><p class="field-help">緑＝学習、橙＝検証。現在の本数を縦線で表示。</p></section><section class="panel xgboost-detail"><h3>検証の混同行列</h3><div id="xgb-matrix"></div></section></div>
        <section class="panel xgboost-detail xgboost-explain"><h3>計算の読み方</h3><p><strong>勾配</strong> g = p − y は、確率をどちらへ直すか示します。<strong>2階微分</strong> h = p(1 − p) は損失の曲がり具合です。</p><p>葉では学習データの和 G、H から修正量 −G / (H + λ) を計算します。分岐は左右の葉の改善量から γ を差し引いた <strong>Gain</strong> が正のものだけ採用します。</p><p>各木の葉の値に学習率 η を掛けて内部スコアへ足し、sigmoidで確率に戻します。これは教育用の二値ロジスティック木ブースティングで、公式XGBoostライブラリではありません。欠損値処理、列・行サンプリング、並列分散学習、早期終了などは省略しています。</p></section>
      </div></div>`;
  const el = (id) => $(id);
  const config = () => ({ mode: el('xgb-mode').value, learningRate: Number(el('xgb-rate').value), maxDepth: Number(el('xgb-depth').value), lambda: Number(el('xgb-lambda').value), gamma: Number(el('xgb-gamma').value), plotIndices: plotFeatures.map((name) => data.features.indexOf(name)) });
  function status(message) { el('xgb-status').textContent = message; }
  function stop() { playing = false; finishing = false; el('xgb-play').textContent = '▶ 自動再生'; }
  function closeWorker() {
    generation++;
    if (pending) { pending.reject(Error('中断しました')); pending = null; }
    worker?.terminate(); worker = null;
  }
  function startWorker() {
    if (worker || !partition) return;
    const token = ++generation;
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: message }) => {
      if (token !== generation) return;
      if (message.type === 'ready') {
        initialScore = message.initialScore;
        initial ??= message.initial;
        if (visible) render();
      } else if (message.type === 'stage' && pending) {
        const callback = pending; pending = null; callback.resolve(message.stage);
      } else if (message.type === 'error') {
        if (pending) { pending.reject(Error(message.message)); pending = null; }
        status(`計算エラー: ${message.message}`);
      }
    };
    worker.onerror = (event) => { status(`計算エラー: ${event.message}`); closeWorker(); };
    const latest = stages.at(-1);
    worker.postMessage({ type: 'init', train: partition.train, valid: partition.valid, options,
      previous: latest ? { trees: stages.map((stage) => stage.tree), trainScores: latest.trainScores, validScores: latest.validScores } : null });
  }
  async function step() {
    if (current < stages.length) { current++; render(); return; }
    if (stages.length >= 60 || pending) return;
    startWorker();
    const result = await new Promise((resolve, reject) => { pending = { resolve, reject }; worker.postMessage({ type: 'step' }); });
    stages.push(result); current = stages.length; render();
  }
  async function runTo(limit, auto = false) {
    if (playing || finishing) return;
    playing = auto; finishing = !auto;
    el('xgb-play').textContent = auto ? 'Ⅱ 一時停止' : '▶ 自動再生';
    render();
    try {
      while (visible && (playing || finishing) && current < limit) {
        await step();
        if (auto) await new Promise((resolve) => setTimeout(resolve, 650));
        else await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) { if (visible && error.message !== '中断しました') status(`計算エラー: ${error.message}`); }
    stop(); if (visible) render();
  }
  function reset() {
    stop(); closeWorker(); stages = []; initial = null; current = 0;
    if (!data) return;
    options = config();
    el('xgb-mode-note').textContent = options.mode === 'two'
      ? `${plotFeatures[0]} と ${plotFeatures[1]} の2特徴量で学習します。`
      : `全${data.features.length}特徴量で学習します。このCSVの特徴量はx1・x2の2列なので、2特徴量モードと同じ結果です。背景は表示2列以外がある場合に学習データの中央値へ固定し、各サンプルは実際の全特徴量で予測します。`;
    for (const id of ['rate', 'depth', 'lambda', 'gamma']) el(`xgb-${id}-value`).textContent = el(`xgb-${id}`).value;
    if (visible) startWorker();
    render();
  }
  function render() {
    if (!partition || !initial) return;
    const frame = current ? stages[current - 1] : { train: initial.train, valid: initial.valid };
    el('xgb-accuracy').textContent = percent(frame.valid.accuracy);
    el('xgb-accuracy-note').textContent = `${Math.round(frame.valid.accuracy * partition.valid.length)} / ${partition.valid.length}件正解`;
    el('xgb-valid-loss').textContent = number(frame.valid.loss);
    el('xgb-train-loss').textContent = number(frame.train.loss);
    el('xgb-history').max = String(stages.length);
    el('xgb-history').value = String(current);
    el('xgb-history-value').textContent = `${current} / ${stages.length}本`;
    el('xgb-next').disabled = stages.length >= 60 || Boolean(pending) || finishing || playing;
    el('xgb-finish').disabled = stages.length >= 60 || Boolean(pending) || finishing || playing;
    el('xgb-play').disabled = stages.length >= 60 && !playing;
    status(finishing ? '60本まで計算中…' : playing ? '自動再生中…' : current === 60 ? '60本の学習が完了しました' : current ? `${current}本の結果を表示中` : '学習前の予測を表示中');
    drawPlot(frame); drawLoss(); drawMatrix(frame); drawSample(frame);
  }
  function drawPlot(frame) {
    const canvas = el('xgb-plot'), ctx = canvas.getContext('2d');
    const [fx, fy] = options.plotIndices, rows = data.records;
    const xv = rows.map((row) => row.x[fx]), yv = rows.map((row) => row.x[fy]);
    const marginX = (Math.max(...xv) - Math.min(...xv)) * 0.05;
    const marginY = (Math.max(...yv) - Math.min(...yv)) * 0.05;
    const xmin = Math.min(...xv) - marginX, xmax = Math.max(...xv) + marginX;
    const ymin = Math.min(...yv) - marginY, ymax = Math.max(...yv) + marginY;
    const L = 78, T = 24, W = 850, H = 412;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const trees = stages.map((stage) => stage.tree);
    for (let ix = 0; ix < 42; ix++) for (let iy = 0; iy < 24; iy++) {
      const x = medians.slice();
      x[fx] = xmin + (ix + 0.5) / 42 * (xmax - xmin);
      x[fy] = ymax - (iy + 0.5) / 24 * (ymax - ymin);
      let score = initialScore;
      for (let j = 0; j < current; j++) score += options.learningRate * predictTree(trees[j], x);
      const p = sigmoid(score);
      ctx.fillStyle = `rgb(${Math.round(244 - 54 * p)},${Math.round(220 + 12 * p)},${Math.round(198 + 19 * p)})`;
      ctx.fillRect(L + ix * W / 42, T + iy * H / 24, W / 42 + 1, H / 24 + 1);
    }
    ctx.strokeStyle = '#d4dfd9'; ctx.strokeRect(L, T, W, H);
    ctx.fillStyle = '#526a62'; ctx.font = '14px Inter, sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      ctx.fillText((xmin + (xmax - xmin) * i / 4).toFixed(1), L + W * i / 4, T + H + 22);
      ctx.fillText((ymax - (ymax - ymin) * i / 4).toFixed(2), L - 32, T + H * i / 4 + 4);
    }
    ctx.fillText(plotFeatures[0], L + W / 2, 493);
    ctx.save(); ctx.translate(17, T + H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(plotFeatures[1], 0, 0); ctx.restore();
    plotted = partition.valid.map((row, index) => {
      const x = L + (row.x[fx] - xmin) / (xmax - xmin) * W;
      const y = T + (ymax - row.x[fy]) / (ymax - ymin) * H;
      const wrong = Number(frame.valid.probabilities[index] >= 0.5) !== row.target;
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = row.target ? '#167562' : '#b16a31'; ctx.fill();
      ctx.strokeStyle = wrong ? '#213632' : '#fff'; ctx.lineWidth = wrong ? 2.7 : 1.3; ctx.stroke();
      if (index === selected) { ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.strokeStyle = '#3159c9'; ctx.lineWidth = 3; ctx.stroke(); }
      return { x, y, index };
    });
    el('xgb-plot-note').textContent = options.mode === 'two'
      ? '背景＝クラス1の予測確率。点＝検証データの正解。点をクリックして経路を追えます。'
      : '背景＝x1・x2の2列による予測確率。このCSVに残りの特徴量はありません。各サンプルの予測には実際の全特徴量を使用。';
  }
  function drawLoss() {
    const frames = [initial, ...stages], width = 520, height = 200, left = 45, right = 14, top = 12, bottom = 30;
    const max = Math.max(0.1, ...frames.flatMap((frame) => [frame.train.loss, frame.valid.loss])) * 1.1;
    const x = (i) => left + i / Math.max(60, stages.length) * (width - left - right);
    const y = (loss) => top + (1 - loss / max) * (height - top - bottom);
    const line = (key, color) => `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${frames.map((frame, i) => `${x(i)},${y(frame[key].loss)}`).join(' ')}"/>`;
    el('xgb-loss-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="学習と検証のLog loss推移。現在${current}本">
      <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" stroke="#dee6e1"/>
      <line x1="${x(current)}" y1="${top}" x2="${x(current)}" y2="${height - bottom}" stroke="#6b7975" stroke-dasharray="4 4"/>
      ${line('train', '#167562')}${line('valid', '#b16a31')}
      <circle cx="${x(current)}" cy="${y(frames[current].train.loss)}" r="4" fill="#167562"/>
      <circle cx="${x(current)}" cy="${y(frames[current].valid.loss)}" r="4" fill="#b16a31"/>
      <text x="${left}" y="${height - 5}" font-size="12">0</text><text x="${x(60)}" y="${height - 5}" text-anchor="end" font-size="12">60本</text></svg>`;
  }
  function drawMatrix(frame) {
    const m = frame.valid.matrix;
    el('xgb-matrix').innerHTML = `<table class="xgboost-matrix"><caption>正解 ↓ ／ 予測 →</caption><thead><tr><th></th><th>クラス0</th><th>クラス1</th></tr></thead><tbody><tr><th>クラス0</th><td>${m[0][0]}</td><td>${m[0][1]}</td></tr><tr><th>クラス1</th><td>${m[1][0]}</td><td>${m[1][1]}</td></tr></tbody></table>`;
  }
  function drawSample(frame) {
    const row = partition.valid[selected], p = frame.valid.probabilities[selected];
    el('xgb-probability').textContent = percent(p);
    el('xgb-prob-bar').style.width = percent(p);
    el('xgb-sample-label').textContent = `CSV ${row.id}行目 · 正解 クラス${row.target} ／ 予測 クラス${Number(p >= 0.5)}${Number(p >= 0.5) === row.target ? '' : '（誤分類）'}`;
    if (!current) {
      el('xgb-correction').textContent = `初期スコア ${signed(initialScore)}。学習データのクラス1割合から開始します。`;
      el('xgb-tree-title').textContent = '現在の木の経路';
      el('xgb-path').textContent = 'まだ木はありません。1本追加してください。';
      return;
    }
    const stage = stages[current - 1], previousScore = stage.beforeValid[selected];
    const trace = traceTree(stage.tree, row.x), correction = options.learningRate * trace.leaf;
    el('xgb-correction').innerHTML = `<div>追加前スコア <strong>${signed(previousScore)}</strong></div><div>葉の値 <strong>${signed(trace.leaf)}</strong></div><div>η × 葉の値 <strong>${signed(correction)}</strong></div><div>追加後スコア <strong>${signed(previousScore + correction)}</strong></div><div>クラス1確率 <strong>${percent(sigmoid(previousScore))} → ${percent(p)}</strong></div>`;
    el('xgb-tree-title').textContent = `木 ${current} で通る分岐経路`;
    el('xgb-path').innerHTML = trace.path.map((part) => `<div class="xgboost-path-step"><strong>${esc(data.features[part.feature])} &lt; ${number(part.threshold)}</strong><span>値 ${number(row.x[part.feature])} → ${part.left ? '左' : '右'} ／ Gain ${number(part.gain)}</span></div>`).join('') +
      `<div class="xgboost-path-step xgboost-leaf"><strong>葉の値 ${signed(trace.leaf)}</strong><span>学習 ${trace.node.count}件 ／ −G / (H + λ) = −(${number(trace.node.G)}) / (${number(trace.node.H)} + ${number(options.lambda)})</span></div>`;
  }
  for (const id of ['mode', 'rate', 'depth', 'lambda', 'gamma']) el(`xgb-${id}`).addEventListener('change', reset);
  el('xgb-dataset').addEventListener('change', initialize);
  for (const id of ['rate', 'depth', 'lambda', 'gamma']) el(`xgb-${id}`).addEventListener('input', () => { el(`xgb-${id}-value`).textContent = el(`xgb-${id}`).value; });
  el('xgb-reset').onclick = reset;
  el('xgb-next').onclick = () => step().catch((error) => { if (error.message !== '中断しました') status(`計算エラー: ${error.message}`); });
  el('xgb-play').onclick = () => { if (playing) { stop(); render(); } else runTo(60, true); };
  el('xgb-finish').onclick = () => runTo(60);
  el('xgb-history').oninput = () => { stop(); current = Number(el('xgb-history').value); render(); };
  el('xgb-sample').onchange = () => { selected = Number(el('xgb-sample').value); render(); };
  el('xgb-plot').onclick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 960, y = (event.clientY - rect.top) / rect.height * 510;
    const closest = plotted.reduce((best, point) => !best || Math.hypot(point.x - x, point.y - y) < Math.hypot(best.x - x, best.y - y) ? point : best, null);
    if (closest && Math.hypot(closest.x - x, closest.y - y) < 20) { selected = closest.index; el('xgb-sample').value = String(selected); render(); }
  };
  async function initialize() {
    const token = ++loadGeneration;
    stop(); closeWorker(); data = null; partition = null; initial = null; stages = []; current = 0;
    el('xgb-content').hidden = true;
    status('データを読み込み中…');
    const name = el('xgb-dataset').value;
    try {
      const loaded = await loadLearningData(name);
      if (token !== loadGeneration) return;
      data = loaded; partition = splitLearningData(data.records); medians = trainMedians(partition.train);
      el('xgb-split').textContent = `全${data.records.length}件 ／ 学習${partition.train.length}件・検証${partition.valid.length}件（固定シード42、クラス別に8:2）。`;
      el('xgb-sample').innerHTML = partition.valid.map((row, index) => `<option value="${index}">CSV ${row.id}行目 · クラス${row.target}</option>`).join('');
      selected = 0;
      el('xgb-content').hidden = false; reset();
    } catch (error) { if (token === loadGeneration) status(`データエラー: ${error.message}。確認先: ${dataURL(name).pathname}`); }
  }
  initialize();
  return { show() { visible = true; root.hidden = false; if (partition) { startWorker(); render(); } },
    hide() { visible = false; stop(); closeWorker(); root.hidden = true; } };
}
