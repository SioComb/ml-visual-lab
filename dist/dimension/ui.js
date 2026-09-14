import { $, esc } from '../shared/dom.js';
import { loadWine, featureNames, classNames, wineURL } from './data.js';
import { comparisonSteps } from './math.js';

const colors = ['#0072B2', '#C45D00', '#8B429D'];
const percent = value => `${(value * 100).toFixed(1)}%`;
const signed = value => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
const clamp = value => Math.max(0, Math.min(1, value));
const svgNS = 'http://www.w3.org/2000/svg';
function svgElement(name, attrs, text) {
  const node = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initPCA() {
  const root = $('pca');
  let loading = false, result = null, records = [], selectedSample = 0;
  let progress = 0, playing = false, frame = null, lastTime = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let bars = [], paths = [], targets = [], selectedPoint = null;
  root.innerHTML = `<header class="pca-heading">
    <div><p class="pca-kicker">PCA＋ロジスティック回帰</p><h2>13次元のワインを、2次元で見分ける</h2>
    <p>PCAで情報を圧縮したあと、ロジスティック回帰で3種類のワインを分類します。</p></div>
    <span class="pca-badge">Wine Dataset · 178 samples</span>
  </header>
  <p class="pca-note">今回は分類問題のため、PCRではなく「PCA＋ロジスティック回帰」を使用します。</p>
  <ol class="pca-flow" aria-label="次元圧縮と分類の工程">
    <li><small>01 INPUT</small>13特徴量</li><li><small>02 SCALE</small>標準化</li>
    <li><small>03 PCA</small>PC1・PC2</li><li><small>04 CLASSIFY</small>ロジスティック回帰</li>
  </ol>
  <p id="pca-status" class="pca-status" role="status" aria-live="polite"></p>
  <button id="pca-retry" class="quiet" hidden>再読み込み</button>
  <div id="pca-content" hidden>
    <div class="pca-workspace">
      <section class="panel pca-compression"><div class="pca-card-heading"><div><span class="pca-kicker">01 → 03</span><h3>13本の特徴量を、2本の軸へ</h3></div><span class="pca-chip">13 → 2</span></div>
        <label for="pca-sample">代表サンプル</label>
        <select id="pca-sample">${classNames.map((name, i) => `<option value="${i}">${name}</option>`).join('')}</select>
        <p id="pca-sample-info" class="pca-help"></p>
        <p id="pca-stage" class="pca-stage"></p>
        <div class="pca-transform">
          <div id="pca-bars" class="pca-bars">${featureNames.map((name, i) => `<div class="pca-feature"><span>${esc(name)}</span><div class="pca-track"><i></i></div><output id="pca-value-${i}"></output></div>`).join('')}</div>
          <svg id="pca-merge" class="pca-merge" viewBox="0 0 100 390" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div class="pca-components">${[0, 1].map(i => `<div class="pca-component"><strong>PC${i + 1}</strong><output id="pca-pc-${i}"></output><small id="pca-ratio-${i}"></small><div class="pca-component-track"><i></i></div></div>`).join('')}</div>
        </div>
        <p class="pca-help">標準化後：中央が0。緑は正、青紫は負の値（バーの表示上限は±3.5）。接続線は両PCへの重み（太さ＝絶対値、色＝符号）を表します。</p>
        <div class="pca-controls"><button id="pca-play" class="primary">▶ 圧縮を再生</button><button id="pca-pause" class="quiet" disabled>一時停止</button><button id="pca-reset" class="quiet">リセット</button></div>
        <label class="pca-progress-label" for="pca-progress">圧縮の進捗 <output id="pca-progress-value">0%</output></label>
        <input id="pca-progress" type="range" min="0" max="100" step="1" value="0" />
        <p id="pca-motion-note" class="pca-help" hidden>動きを減らす設定が有効です。進捗スライダーで各工程を確認できます。</p>
      </section>
      <section class="panel pca-scatter-panel"><div class="pca-card-heading"><div><span class="pca-kicker">03 → 04</span><h3>2次元で、ワインを見分ける</h3></div><span class="pca-chip">PC1 × PC2</span></div>
        <p class="pca-help">背景はPCA後の分類器が予測する領域。点の色とA/B/Cは正解クラスです。</p>
        <svg id="pca-scatter" viewBox="0 0 620 480" role="img" aria-label="Wine全178件のPC1とPC2散布図。背景は予測領域、白抜きはテスト点、外周リングは誤分類。"></svg>
        <div class="pca-legend">${classNames.map((name, i) => `<span><i style="--pca-color:${colors[i]}"></i>${name}</span>`).join('')}</div>
        <p class="pca-help">● 学習　○ テスト　◎ 誤分類テスト　＋ 選択サンプル</p>
        <p id="pca-selection" class="pca-selection"></p>
        <p class="pca-help">各点にカーソルを合わせると、行ID・正解・予測を確認できます。</p>
      </section>
    </div>
    <section class="panel pca-comparison"><div class="pca-card-heading"><div><span class="pca-kicker">COMPARE</span><h3>圧縮すると、分類精度はどう変わる？</h3></div><span class="pca-chip">同じテスト行で比較</span></div>
      <p id="pca-split" class="pca-help"></p>
      <div id="pca-metrics" class="metrics pca-metrics"></div>
      <div class="pca-summary"><p id="pca-difference"></p><p id="pca-variance"></p></div>
      <p id="pca-explanation" class="pca-explanation"></p>
      <details><summary>混同行列を見る（行＝正解、列＝予測）</summary><div id="pca-confusion" class="pca-confusions"></div></details>
    </section>
    <section class="panel pca-reading"><h3>次元を減らすときに、覚えておきたいこと</h3><ol>
      <li>PCAは正解ラベルを見ず、ばらつきが大きい方向を探します。</li>
      <li>PC1・PC2は元の13特徴量の重み付き合成です。</li>
      <li>次元削減は可視化と計算量削減に役立ちます。</li>
      <li>分類に役立つ情報を落とす可能性があります。精度はデータと分割に依存します。</li>
      <li>寄与率は残したばらつきの割合で、分類精度とは別の指標です。</li>
    </ol><a id="pca-csv" class="text-button" download>↓ 使用するWine CSV</a></section>
  </div>`;
  $('pca-csv').href = wineURL.href;
  const steps = [...root.querySelectorAll('.pca-flow li')];
  const featureRows = [...root.querySelectorAll('.pca-feature')];
  const barNodes = featureRows.map(row => row.querySelector('i'));
  const valueNodes = featureRows.map(row => row.querySelector('output'));
  const pcNodes = [...root.querySelectorAll('.pca-component')];
  for (let i = 0; i < 13; i++) for (let pc = 0; pc < 2; pc++) {
    const path = svgElement('path', { d: `M0,${15 + i * 30} C45,${15 + i * 30} 55,${pc ? 270 : 120} 100,${pc ? 270 : 120}`, fill: 'none', pathLength: 1 });
    $('pca-merge').append(path); paths.push(path);
  }

  function representative() { return records.find(r => r.target === selectedSample); }
  function stop() {
    playing = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null; lastTime = null;
    $('pca-pause').textContent = '再開';
    $('pca-pause').disabled = progress === 0 || progress === 100 || reducedMotion.matches;
  }
  function updateProgress(value) {
    progress = clamp(value / 100) * 100;
    const p = progress / 100;
    const scale = clamp((p - 0.2) / 0.25), merge = clamp((p - 0.45) / 0.3);
    const stage = p < 0.2 ? 0 : p < 0.45 ? 1 : p < 0.75 ? 2 : 3;
    steps.forEach((step, i) => {
      step.classList.toggle('pca-current', i === stage);
      if (i === stage) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
    });
    $('pca-stage').textContent = [
      '01 元の13特徴量：単位や値の大きさはばらばら',
      '02 学習データの平均・標準偏差で、尺度をそろえる',
      '03 学習データの主成分軸へ、13特徴量を集約する',
      '04 PC1・PC2で分類し、散布図上の位置を確かめる',
    ][stage];
    const row = representative();
    if (row) {
      for (let i = 0; i < 13; i++) {
        const z = bars[i], visual = (1 - scale) * (row.values[i] / targets[i]) + scale * z / 3.5;
        const length = Math.min(1, Math.abs(visual)) * 50;
        barNodes[i].style.width = `${length}%`;
        barNodes[i].style.left = `${visual < 0 ? 50 - length : 50}%`;
        barNodes[i].style.background = visual < 0 ? '#6467b2' : 'var(--green)';
        barNodes[i].style.transform = `scaleX(${1 - merge * 0.65})`;
        valueNodes[i].textContent = stage === 0 ? row.values[i].toFixed(2) : signed(z);
        barNodes[i].style.opacity = 1 - merge * 0.25;
      }
      paths.forEach(path => { path.style.opacity = merge * 0.6; path.style.strokeDasharray = '1'; path.style.strokeDashoffset = 1 - merge; });
      const point = result.projected[records.indexOf(row)];
      pcNodes.forEach((node, i) => {
        node.style.opacity = 0.35 + 0.65 * merge;
        $('pca-pc-' + i).textContent = merge ? signed(point[i] * merge) : '—';
        node.querySelector('i').style.transform = `scaleX(${merge * Math.min(1, Math.abs(point[i]) / 6)})`;
      });
      if (selectedPoint) selectedPoint.setAttribute('opacity', stage === 3 ? '1' : '0');
      $('pca-selection').textContent = stage === 3
        ? `＋ 行${row.id} · ${classNames[row.target]} → 予測：${classNames[result.reduced.predict(point)]}（PC1 ${signed(point[0])} / PC2 ${signed(point[1])}）`
        : '圧縮を進めると、選択サンプルの位置を＋で表示します。';
    }
    $('pca-progress').value = String(Math.round(progress));
    $('pca-progress-value').textContent = `${Math.round(progress)}%`;
    if (!playing) $('pca-pause').disabled = progress === 0 || progress === 100 || reducedMotion.matches;
  }
  function tick(time) {
    if (!playing) return;
    const elapsed = lastTime === null ? 0 : time - lastTime;
    lastTime = time;
    updateProgress(progress + elapsed / 24);
    if (progress >= 100) stop(); else frame = requestAnimationFrame(tick);
  }
  function play() {
    if (!result || root.hidden) return;
    stop();
    if (reducedMotion.matches) { updateProgress(100); return; }
    if (progress >= 100) updateProgress(0);
    playing = true;
    $('pca-pause').disabled = false;
    $('pca-pause').textContent = '一時停止';
    frame = requestAnimationFrame(tick);
  }
  function selectSample() {
    stop();
    const row = representative();
    bars = result.scaler.transform(row.values);
    targets = result.scaler.mean.map((mean, j) => mean + 3 * result.scaler.scale[j]);
    const isTest = result.split.test.some(r => r.id === row.id);
    $('pca-sample-info').textContent = `行${row.id} · ${isTest ? 'テスト' : '学習'}データ · 同じ代表行で各工程を確認`;
    const dot = root.querySelector(`[data-pca-row="${row.id}"]`);
    selectedPoint.setAttribute('transform', `translate(${dot.getAttribute('cx')},${dot.getAttribute('cy')})`);
    updateProgress(0);
  }

  function drawScatter() {
    const svg = $('pca-scatter'), points = result.projected;
    const bounds = [0, 1].map(j => {
      const values = points.map(p => p[j]), min = Math.min(...values), max = Math.max(...values), pad = (max - min) * 0.12;
      return [min - pad, max + pad];
    });
    const [left, top, width, height] = [62, 24, 538, 384];
    const x = v => left + (v - bounds[0][0]) / (bounds[0][1] - bounds[0][0]) * width;
    const y = v => top + height - (v - bounds[1][0]) / (bounds[1][1] - bounds[1][0]) * height;
    const region = svgElement('g', { 'aria-hidden': 'true' });
    for (let row = 0; row < 30; row++) for (let col = 0; col < 40; col++) {
      const pc1 = bounds[0][0] + (col + 0.5) / 40 * (bounds[0][1] - bounds[0][0]);
      const pc2 = bounds[1][1] - (row + 0.5) / 30 * (bounds[1][1] - bounds[1][0]);
      region.append(svgElement('rect', { x: left + col * width / 40, y: top + row * height / 30, width: width / 40 + 0.2, height: height / 30 + 0.2, fill: colors[result.reduced.predict([pc1, pc2])], opacity: 0.09 }));
    }
    svg.append(region);
    for (let i = 0; i <= 4; i++) {
      const vx = bounds[0][0] + i / 4 * (bounds[0][1] - bounds[0][0]);
      const vy = bounds[1][0] + i / 4 * (bounds[1][1] - bounds[1][0]);
      svg.append(svgElement('path', { d: `M${x(vx)},${top}V${top + height} M${left},${y(vy)}H${left + width}`, stroke: 'var(--line)', fill: 'none' }));
      svg.append(svgElement('text', { x: x(vx), y: 431, 'text-anchor': 'middle', 'font-size': 16 }, vx.toFixed(1)));
      svg.append(svgElement('text', { x: 52, y: y(vy) + 5, 'text-anchor': 'end', 'font-size': 16 }, vy.toFixed(1)));
    }
    svg.append(svgElement('text', { x: 331, y: 464, 'text-anchor': 'middle', 'font-size': 18 }, `第1主成分 PC1（${percent(result.pca.explainedVarianceRatio[0])}）`));
    svg.append(svgElement('text', { transform: 'translate(4,216) rotate(-90)', 'text-anchor': 'middle', 'font-size': 18 }, `第2主成分 PC2（${percent(result.pca.explainedVarianceRatio[1])}）`));
    const testIDs = new Set(result.split.test.map(r => r.id));
    records.forEach((record, i) => {
      const point = points[i], test = testIDs.has(record.id), predicted = result.reduced.predict(point);
      const circle = svgElement('circle', { cx: x(point[0]), cy: y(point[1]), r: 5, fill: test ? 'white' : colors[record.target], stroke: colors[record.target], 'stroke-width': 2, 'data-pca-row': record.id });
      circle.append(svgElement('title', {}, `行${record.id} / ${test ? 'テスト' : '学習'} / 正解：${classNames[record.target]} / 予測：${classNames[predicted]}`));
      svg.append(circle);
      if (test && predicted !== record.target) svg.append(svgElement('circle', { cx: x(point[0]), cy: y(point[1]), r: 9, fill: 'none', stroke: colors[record.target], 'stroke-width': 1.5, 'pointer-events': 'none', 'data-pca-error': record.id }));
    });
    for (let target = 0; target < 3; target++) {
      const group = points.filter((_, i) => records[i].target === target);
      const center = [0, 1].map(j => group.reduce((sum, point) => sum + point[j], 0) / group.length);
      svg.append(svgElement('text', { x: x(center[0]), y: y(center[1]) - 15, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: colors[target], stroke: 'white', 'stroke-width': 4, 'paint-order': 'stroke', 'pointer-events': 'none' }, 'ABC'[target]));
    }
    selectedPoint = svgElement('g', { opacity: 0, 'pointer-events': 'none' });
    selectedPoint.append(svgElement('path', { d: 'M-15,0H15 M0,-15V15', stroke: 'var(--ink)', 'stroke-width': 2.5 }));
    svg.append(selectedPoint);
    // Keep chart captions readable as the SVG scales down on narrow screens.
    const labels = [...svg.querySelectorAll('text')].map(node => [node, Number(node.getAttribute('font-size'))]);
    const resize = new ResizeObserver(() => {
      const width = svg.getBoundingClientRect().width;
      if (width) labels.forEach(([node, size]) => { node.style.fontSize = `${Math.max(size, 12 * 620 / width)}px`; });
    });
    resize.observe(svg);
  }
  function renderResults() {
    const a = result.fullEvaluation, b = result.reducedEvaluation;
    $('pca-split').textContent = `学習 ${result.split.train.length}件 / テスト ${result.split.test.length}件 · クラスごと約30%をテストへ · seed 42。平均・標準偏差・PCA軸・分類器は学習データのみで学習。`;
    $('pca-metrics').innerHTML = [[a, 'A · 圧縮なし', '全13特徴量＋Softmax回帰'], [b, 'B · PCAあり', 'PCA 2次元＋Softmax回帰']].map(([evaluation, label, title]) => `<article class="metric"><span class="pca-kicker">${label}</span><h4>${title}</h4><div class="metric-label">Accuracy / テスト正解率</div><div class="metric-value">${percent(evaluation.accuracy)}</div><p>正解 ${evaluation.correct} / ${evaluation.count}件 <span class="pca-error-count">誤分類 ${evaluation.errors}件</span></p></article>`).join('');
    const difference = (a.accuracy - b.accuracy) * 100;
    $('pca-difference').textContent = `精度差（圧縮なし − PCA）：${difference >= 0 ? '+' : ''}${difference.toFixed(1)}ポイント`;
    $('pca-variance').textContent = `PC1＋PC2 累積寄与率：${percent(result.pca.explainedVarianceRatio[0] + result.pca.explainedVarianceRatio[1])}`;
    $('pca-explanation').textContent = a.correct > b.correct
      ? '圧縮前のほうが高精度です。分類に役立つ情報の一部が失われました。'
      : a.correct === b.correct ? '2次元へ圧縮しても、今回の分割では精度を維持できました。'
        : '今回の分割ではPCA後のほうが高精度です。不要な変動が減った可能性があります。';
    $('pca-confusion').innerHTML = [[a, '全13特徴量'], [b, 'PCA 2次元']].map(([evaluation, label]) => `<table><caption>${label}</caption><thead><tr><th scope="col">正解＼予測</th>${['A', 'B', 'C'].map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${evaluation.confusion.map((row, i) => `<tr><th scope="row">${'ABC'[i]}</th>${row.map((v, j) => `<td class="${i === j ? 'pca-diagonal' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
    [0, 1].forEach(i => { $('pca-ratio-' + i).textContent = `寄与率 ${percent(result.pca.explainedVarianceRatio[i])}`; });
    paths.forEach((path, i) => {
      const weight = result.pca.components[i % 2][Math.floor(i / 2)];
      path.setAttribute('stroke', weight < 0 ? '#6467b2' : 'var(--green)');
      path.setAttribute('stroke-width', 0.5 + Math.abs(weight) * 5);
    });
    drawScatter(); selectSample();
    $('pca-content').hidden = false;
  }
  async function initialize() {
    if (loading || result) return;
    loading = true;
    $('pca-retry').hidden = true;
    $('pca-status').textContent = 'Wineデータを読み込んでいます…';
    try {
      records = await loadWine();
      $('pca-status').textContent = '標準化・PCA・分類モデルを計算しています…';
      const iterator = comparisonSteps(records);
      let step;
      do {
        await new Promise(resolve => setTimeout(resolve, 0));
        step = iterator.next();
      } while (!step.done);
      result = step.value;
      renderResults();
      $('pca-status').textContent = `${records.length}件を13次元から2次元へ圧縮しました。`;
    } catch (error) {
      result = null;
      $('pca-scatter').replaceChildren();
      $('pca-content').hidden = true;
      console.error('PCA initialization failed', error);
      $('pca-status').textContent = '計算を完了できませんでした。データ形式を確認してください。';
      $('pca-retry').hidden = false;
    } finally { loading = false; }
  }
  $('pca-play').onclick = play;
  $('pca-pause').onclick = () => playing ? stop() : play();
  $('pca-reset').onclick = () => { stop(); updateProgress(0); };
  $('pca-progress').oninput = event => { stop(); updateProgress(Number(event.target.value)); };
  $('pca-sample').onchange = event => { selectedSample = Number(event.target.value); selectSample(); };
  $('pca-retry').onclick = initialize;
  function updateMotion() {
    if (reducedMotion.matches) stop();
    $('pca-motion-note').hidden = !reducedMotion.matches;
    $('pca-play').textContent = reducedMotion.matches ? '圧縮結果を表示' : '▶ 圧縮を再生';
  }
  reducedMotion.addEventListener('change', updateMotion);
  updateMotion();
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return {
    show() { root.hidden = false; initialize(); },
    hide() { stop(); root.hidden = true; },
  };
}
