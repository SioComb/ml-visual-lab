import { $ } from '../shared/dom.js';
import { datasets } from './data.js';
import { scatter, accuracyChart } from './charts.js';

const fmt = v => v.toFixed(3);

export function initBoosting() {
  const root = $('boosting');
  let result = null, selected = 0, worker = null, timer = null, started = false;
  root.innerHTML = `<div class="workspace">
    <aside class="settings">
      <section class="setting-section">
        <div class="section-title"><span class="step">01</span><h2>データを選ぶ</h2></div>
        <label for="boost-dataset">サンプルデータ</label>
        <select id="boost-dataset">${Object.entries(datasets).map(([key, d]) => `<option value="${key}">${d.name}</option>`).join('')}</select>
        <p id="boost-description" class="sample-explanation"></p>
        <p class="field-help">用意されたCSVをブラウザ内で読み込みます。</p>
        <div id="boost-facts" class="boost-facts">データを読み込んでいます。</div>
      </section>
      <section class="setting-section">
        <div class="section-title"><span class="step">02</span><h2>学習を設定する</h2></div>
        <div class="boost-model"><strong>AdaBoost</strong><br>弱学習器：Decision Stump<br>Decision Tree / max_depth = 1</div>
        <p class="field-help">1本では単純な分類しかできない弱い決定木です。前の弱学習器が間違えたデータを、次の木が重点的に学習します。</p>
        <div class="boost-control"><label class="boost-range-label" for="boost-estimators">弱学習器の数 <output id="boost-estimators-value">50</output></label>
        <input id="boost-estimators" type="range" min="1" max="200" step="1" value="50"></div>
        <div class="boost-control"><label class="boost-range-label" for="boost-rate">Learning Rate <output id="boost-rate-value">1.0</output></label>
        <input id="boost-rate" type="range" min="0.1" max="2" step="0.1" value="1"></div>
        <p class="field-help">各弱学習器の投票の強さと、重みの更新幅を調整します。</p>
        <div class="boost-control"><label class="boost-range-label" for="boost-test-size">テストデータの割合 <output id="boost-test-size-value">25%</output></label>
        <input id="boost-test-size" type="range" min="10" max="40" step="5" value="25"></div>
        <p class="field-help">クラス比率を保って分割。乱数は42で固定しています。テストデータは学習にも重み更新にも使いません。</p>
      </section>
      <div class="train-area"><button id="boost-train" class="primary">▶ 学習する</button><p>初回とデータ切り替え時は自動学習。設定を変えたら再学習してください。</p></div>
    </aside>
    <div class="results">
      <div class="result-heading"><div><h2>間違いを見つけて、次の一歩へ。</h2><p>単純なモデルを順番に重ね、分類の変化をたどろう。</p></div><span class="status">Boosting</span></div>
      <p id="boost-status" class="boost-status" role="status" aria-live="polite"></p>
      <div id="boost-output" hidden>
        <div id="boost-metrics" class="metrics"></div>
        <section class="panel">
          <h3>Boostingはどう修正していく？</h3>
          <p>まず「今回の弱学習器」で間違いを探し、重みの更新前後を比べてみましょう。</p>
          <div class="boost-toolbar">
            <div><label for="boost-view">表示する予測</label><select id="boost-view"><option value="ensemble">ここまでのAdaBoost</option><option value="weak">今回の弱学習器</option></select></div>
            <div><label for="boost-split">表示するデータ</label><select id="boost-split"><option value="train">学習データ · 重みを見る</option><option value="test">テストデータ · 評価を見る</option></select></div>
            <div><label for="boost-weights">sample weight</label><select id="boost-weights"><option value="after">今回の学習後 → 次へ</option><option value="before">今回の学習前</option></select></div>
          </div>
          <div class="boost-legend"><span><i class="boost-dot"></i>Class 0</span><span><i class="boost-dot blue"></i>Class 1</span><span><b class="boost-cross">×</b>表示モデルの誤分類</span><span>背景＝予測領域 / 線＝決定境界</span></div>
          <svg id="boost-scatter" role="img" aria-label="Boostingの決定境界とデータの重み"></svg>
          <p id="boost-plot-note" class="field-help"></p>
          <p class="field-help">点の面積＝sample weight（初期は同じ大きさ）。見やすさのため初期の16倍以上は同じ最大サイズです。点にカーソルを合わせると重みの数値を確認できます。境界は60 × 40のグリッドによる近似です。</p>
          <div class="boost-stage-controls">
            <label class="boost-range-label" for="boost-stage">Stage <output id="boost-stage-value">1 / 50</output></label>
            <input id="boost-stage" type="range" min="1" max="50" step="1" value="1">
            <div class="boost-actions"><button id="boost-prev" class="quiet">← 前へ</button><button id="boost-play" class="quiet">▶ 順に見る</button><button id="boost-next" class="quiet">次へ →</button></div>
          </div>
          <div id="boost-stage-info" class="boost-stage-info"></div>
        </section>
        <section class="panel reading">
          <div class="eyebrow">READ THE MODEL</div><h3>間違いから学ぶ</h3>
          <p id="boost-reading"></p><div id="boost-difference" class="insight boost-difference"></div>
          <div class="experiment"><span>次の実験</span><p>弱学習器単体の境界と合成した境界を切り替えてみましょう。合成モデルが正しく分類していても、今回の弱学習器が間違えると、その点の重みは増えます。</p></div>
        </section>
        <section class="panel">
          <h3>学習を重ねるとどうなる？</h3><p>テストAccuracy · 縦軸 0〜1 / ● 選択中のStage</p>
          <svg id="boost-accuracy-chart" role="img" aria-label="StageごとのテストAccuracy"></svg>
          <p>弱学習器を追加しても、テストデータのAccuracyが毎回上昇するとは限りません。</p>
          <p id="boost-accuracy-note" class="field-help"></p>
        </section>
        <section class="panel">
          <h3>単体モデルと比べてみる</h3><p>同じTrain / Testで比較。深さ1の単純な木を、αに応じた重み付き多数決で組み合わせます。</p>
          <div class="boost-comparison">
            <article><h3>Decision Tree</h3><p>Decision Stump · 深さ1 / 最初の木</p><div id="boost-baseline-metrics"></div><svg id="boost-baseline-chart" role="img" aria-label="単体Decision Stumpのテスト予測"></svg></article>
            <article><h3>AdaBoost</h3><p>選択中Stageまでの組み合わせ</p><div id="boost-compare-metrics"></div><svg id="boost-compare-chart" role="img" aria-label="AdaBoostのテスト予測"></svg></article>
          </div>
          <details><summary>計算の仕組みを見る</summary><p>各木は重み付き誤分類率を最小化する特徴量・しきい値を探します。最初の重みは1 / 学習件数です。</p>
          <p><code>α = learning_rate × 0.5 × ln((1 − error) / error)</code></p>
          <p>誤分類した点は exp(α)、正解した点は exp(−α) を掛け、合計1になるよう重みを正規化します。各木の予測を−1 / +1とし、αを掛けた合計の符号で分類します（合計0ならClass 1）。error = 0なら安全な有限値で計算して終了、error ≥ 0.5ならその木を追加せず終了します。</p>
          <p>Random Forestは木を比較的独立に作ります。Boostingは前の木の結果を使い、順番に作ります。</p></details>
        </section>
      </div>
    </div>
  </div>`;

  function stop() {
    clearInterval(timer); timer = null;
    $('boost-play').textContent = '▶ 順に見る';
  }
  function drawMain() {
    const stage = result.stages[selected], split = $('boost-split').value;
    const weak = $('boost-view').value === 'weak', before = $('boost-weights').value === 'before';
    const state = weak ? stage[split].weak : stage[split];
    $('boost-weights').disabled = split === 'test';
    scatter($('boost-scatter'), result.grid, weak ? stage.weakGrid : stage.grid, result[split],
      state.predictions, split === 'train' ? before ? stage.weightsBefore : stage.weightsAfter : null, result.train.length);
    $('boost-plot-note').textContent = `${split === 'train' ? '学習' : 'テスト'} ${result[split].length}件 / ${weak ? '今回の弱学習器' : 'ここまでのAdaBoost'}の誤分類 ${state.wrong.length}件。${split === 'train' ? `点の重みは今回の学習${before ? '前（今回の木が使った重み）' : '後（次の木へ渡す重み）'}。` : 'テスト点のサイズは一定。学習の重みは付きません。'} 上のカードは常にAdaBoostのテスト評価です。`;
    $('boost-scatter').setAttribute('aria-label', $('boost-plot-note').textContent);
  }
  function render() {
    const stage = result.stages[selected], previous = result.stages[selected - 1], n = selected + 1;
    $('boost-stage').value = n;
    $('boost-stage-value').textContent = `${n} / ${result.stages.length}`;
    $('boost-prev').disabled = selected === 0;
    $('boost-next').disabled = n === result.stages.length;
    $('boost-play').disabled = result.stages.length < 2;
    $('boost-metrics').innerHTML = [
      ['Accuracy', fmt(stage.test.accuracy), 'AdaBoost · テストデータ'],
      ['誤分類', `${stage.test.wrong.length} / ${result.test.length}`, 'AdaBoost · テストデータ'],
      ['弱学習器', `Stage ${n} / ${result.stages.length}`, `設定上限 ${result.nEstimators}本 · 深さ1`],
    ].map(([label, value, note], i) => `<div class="metric ${i === 0 ? 'primary-metric' : ''}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`).join('');
    const stump = stage.stump;
    const rule = stump.feature < 0 ? `すべて Class ${stump.left}` : `x${stump.feature + 1} ≤ ${fmt(stump.threshold)} → Class ${stump.left} / それ以外 → Class ${stump.right}`;
    $('boost-stage-info').innerHTML = `<span>今回の木：<strong>${rule}</strong></span><span>重み付きerror：<strong>${fmt(stage.error)}</strong></span><span>投票の重み α：<strong>${fmt(stage.alpha)}</strong></span>`;
    const corrected = previous ? previous.test.wrong.filter(i => stage.test.predictions[i] === result.test[i].target).length : 0;
    const regressed = previous ? stage.test.wrong.filter(i => previous.test.predictions[i] === result.test[i].target).length : 0;
    const fixedWeak = previous ? previous.train.weak.wrong.filter(i => stage.train.weak.predictions[i] === result.train[i].target).length : 0;
    $('boost-reading').textContent = previous
      ? `前の弱学習器が間違えた学習データ${previous.train.weak.wrong.length}件の重みを相対的に高くして、今回の木を学習しました。そのうち${fixedWeak}件を今回の木は正しく分類しています。合成モデルのテストでは、前Stageの誤分類${previous.test.wrong.length}件のうち${corrected}件が正解になり、新たに${regressed}件を間違えました。`
      : `最初の弱学習器は、学習データ${result.train.length}件をすべて同じ重みで学習しました。学習データのうち${stage.train.weak.wrong.length}件、テストデータのうち${stage.test.wrong.length}件を誤分類しています。「今回の学習前／後」を切り替えると、間違えた学習点の重みがどう変わるか確認できます。`;
    $('boost-difference').innerHTML = previous
      ? `<span>今回の変化 · テスト</span><span>Accuracy ${fmt(previous.test.accuracy)} → ${fmt(stage.test.accuracy)}</span><span>誤分類 ${previous.test.wrong.length}件 → ${stage.test.wrong.length}件</span>`
      : `<span>Stage 1 · 比較の出発点</span><span>Accuracy ${fmt(stage.test.accuracy)}</span><span>誤分類 ${stage.test.wrong.length}件</span>`;
    $('boost-accuracy-note').textContent = `Stage ${n}：テスト ${fmt(stage.test.accuracy)} / 学習 ${fmt(stage.train.accuracy)}。すべて実測値です。`;
    const comparison = (state, models) => `<p>テストAccuracy <strong>${fmt(state.accuracy)}</strong></p><p>誤分類 ${state.wrong.length} / ${result.test.length}件 · 使用モデル数 ${models}</p>`;
    $('boost-compare-metrics').innerHTML = comparison(stage.test, n);
    $('boost-baseline-metrics').innerHTML = comparison(result.baseline.test, 1);
    drawMain();
    accuracyChart($('boost-accuracy-chart'), result.stages, selected);
    scatter($('boost-compare-chart'), result.grid, stage.grid, result.test, stage.test.predictions);
  }
  function train() {
    stop(); worker?.terminate(); result = null; started = true;
    $('boost-output').hidden = true;
    $('boost-status').classList.remove('boost-error');
    $('boost-status').textContent = 'CSVを読み込んで学習しています…';
    $('boost-facts').textContent = 'データを読み込んでいます。';
    $('boost-description').textContent = datasets[$('boost-dataset').value].description;
    $('boost-train').textContent = '↻ 学習をやり直す';
    function fail(message) {
      worker?.terminate(); worker = null;
      $('boost-status').classList.add('boost-error');
      $('boost-status').textContent = `${message} 「学習する」で再試行できます。`;
      $('boost-facts').textContent = 'データ読み込み・学習を完了できませんでした。';
      $('boost-train').textContent = '▶ 学習する';
    }
    try {
      const activeWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker = activeWorker;
      activeWorker.onmessage = ({ data }) => {
        if (worker !== activeWorker) return;
        if (data.type === 'error') { fail(data.message); return; }
        if (data.type === 'progress') {
          $('boost-status').textContent = `Stage ${data.stage}を学習中…`; return;
        }
        result = data.result; selected = 0;
        activeWorker.terminate(); worker = null;
        $('boost-train').textContent = '▶ 学習する';
        $('boost-facts').innerHTML = `<strong>${result.train.length + result.test.length}件 · 2特徴量 · 2クラス</strong><br>Train ${result.train.length}件 / Test ${result.test.length}件`;
        const reasons = { limit: '指定した弱学習器数まで学習しました。', perfect: '学習データの重み付き誤分類率が0になったため早期終了しました。', 'no-edge': '重み付き誤分類率が0.5未満の木を作れないため終了しました。' };
        $('boost-status').textContent = `${datasets[$('boost-dataset').value].name} · ${result.stages.length} Stage。${reasons[result.stopReason]}`;
        if (!result.stages.length) return;
        $('boost-stage').max = result.stages.length;
        scatter($('boost-baseline-chart'), result.grid, result.baseline.grid, result.test, result.baseline.test.predictions);
        $('boost-output').hidden = false;
        render();
      };
      activeWorker.onerror = () => { if (worker === activeWorker) fail('学習処理を開始できませんでした。'); };
      activeWorker.postMessage({ kind: $('boost-dataset').value, nEstimators: Number($('boost-estimators').value),
        learningRate: Number($('boost-rate').value), testSize: Number($('boost-test-size').value) / 100 });
    } catch (error) { fail(error.message); }
  }
  $('boost-dataset').onchange = train;
  $('boost-train').onclick = train;
  for (const [name, format] of [['estimators', v => v], ['rate', v => Number(v).toFixed(1)], ['test-size', v => `${v}%`]]) {
    $(`boost-${name}`).oninput = () => {
      $(`boost-${name}-value`).textContent = format($(`boost-${name}`).value);
      stop(); worker?.terminate(); worker = null; result = null;
      $('boost-output').hidden = true;
      $('boost-status').textContent = '設定が変わりました。「学習する」を押してください。';
      $('boost-train').textContent = '▶ 学習する';
    };
  }
  $('boost-stage').oninput = () => { stop(); selected = Number($('boost-stage').value) - 1; render(); };
  $('boost-prev').onclick = () => { stop(); selected = Math.max(0, selected - 1); render(); };
  $('boost-next').onclick = () => { stop(); selected = Math.min(result.stages.length - 1, selected + 1); render(); };
  for (const id of ['view', 'split', 'weights']) $(`boost-${id}`).onchange = drawMain;
  $('boost-play').onclick = () => {
    if (timer) { stop(); return; }
    if (selected === result.stages.length - 1) { selected = 0; render(); }
    $('boost-play').textContent = 'Ⅱ 一時停止';
    timer = setInterval(() => {
      selected++; render();
      if (selected === result.stages.length - 1) stop();
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 1800 : 850);
  };
  return {
    show() { root.hidden = false; if (!started) train(); },
    hide() { root.hidden = true; stop(); },
  };
}
