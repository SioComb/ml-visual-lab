import { $, esc } from '../shared/dom.js';
import { datasets } from './data.js';

const percent = value => `${(100 * value).toFixed(1)}%`;
const signed = value => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;

export function initNLP() {
  const root = $('nlp');
  let worker = null, summary = null, initialized = false, requestId = 0;
  root.innerHTML = `<div class="workspace">
    <aside class="settings">
      <section class="setting-section">
        <div class="section-title"><span class="step">01</span><h2>文章データを選ぶ</h2></div>
        <label for="nlp-kind">分類するテーマ</label>
        <select id="nlp-kind"><option value="sentiment">感情分析 · 低評価 / 高評価</option><option value="genre">ジャンル分類 · 5クラス</option></select>
        <p id="nlp-description" class="sample-explanation"></p>
        <p class="field-help">学習用の架空データです。文章だけを入力に使い、ラベルを正解として学習します。</p>
        <a id="nlp-csv" class="text-button" download>↓ 使用するCSV</a>
        <div id="nlp-summary" class="nlp-summary">データの読み込み前です。</div>
      </section>
      <section class="setting-section">
        <div class="section-title"><span class="step">02</span><h2>単語から学習する</h2></div>
        <div class="nlp-model">Bag of Words<br><span>↓ 単語の出現回数</span><br>Logistic Regression</div>
        <p class="field-help">単語ごとにクラスへの重みを学び、「出現回数 × 重み」の合計を確率に変えます。2クラス・多クラスともロジスティック回帰を使います。</p>
        <p class="field-help">CSVのtrainだけで語彙と重みを学習します。validation・testは学習後の正解率の確認に使います。</p>
      </section>
      <div class="train-area"><button id="nlp-train" class="primary">▶ データを学習する</button><p>初回は自動で学習します。処理はブラウザ内で完結します。</p></div>
    </aside>
    <div class="results">
      <div class="result-heading"><div><h2>文章が、数値に変わる。</h2><p>言葉を数えて、分類までの流れをたどろう。</p></div><span class="nlp-badge">NLP / 自然言語処理</span></div>
      <ol class="nlp-flow" aria-label="自然言語処理の流れ"><li><small>01 INPUT</small>文章</li><li><small>02 VECTOR</small>Bag of Words</li><li><small>03 MODEL</small>ロジスティック回帰</li><li><small>04 OUTPUT</small>予測結果</li></ol>
      <p id="nlp-status" class="nlp-status" role="status" aria-live="polite"></p>
      <progress id="nlp-progress" max="180" value="0" aria-label="学習の進捗" hidden></progress>
      <div id="nlp-metrics" class="metrics" hidden></div>
      <section class="panel nlp-input-panel">
        <div class="section-title"><span class="step">03</span><h2>自分の文章で試す</h2></div>
        <form id="nlp-form">
          <label for="nlp-text">分析したい文章</label>
          <textarea id="nlp-text" rows="3" maxlength="2000" aria-describedby="nlp-input-help" placeholder="ここに日本語の文章を入力してください"></textarea>
          <div class="nlp-input-footer"><p id="nlp-input-help" class="field-help">最大2,000文字。文章を編集したら「分析」を押してください。</p><button id="nlp-analyze" class="primary" disabled>分析 →</button></div>
        </form>
        <div id="nlp-examples" class="nlp-examples" aria-label="入力例"></div>
        <div id="nlp-inline-result" class="nlp-inline-result" hidden>
          <h3>分析結果</h3>
          <p id="nlp-result" class="nlp-result" role="status"></p>
          <p id="nlp-result-note" class="field-help"></p>
          <div id="nlp-probabilities" class="nlp-probabilities" aria-label="クラスごとの予測確率"></div>
          <p class="field-help">確率はこの架空データで学んだモデルの出力で、正しさの保証ではありません。登録されたクラスの中で比較します。「その他」は学習していません。</p>
        </div>
      </section>
      <div id="nlp-output" hidden>
        <section class="panel">
          <h3>01 文章 → 単語に分ける</h3>
          <p>全角・半角などを正規化し、英字を小文字にして、日本語を単語に分割します。句読点と空白は除き、助詞も数えます。</p>
          <blockquote id="nlp-analyzed-text"></blockquote>
          <div id="nlp-tokens" class="nlp-tokens"></div>
          <p class="field-help">緑＝学習語彙にある単語、破線＝語彙にない単語（数値化では無視）。同じ単語が繰り返されたら、その分だけ数えます。</p>
          <p id="nlp-unknown" class="nlp-notice"></p>
        </section>
        <section class="panel">
          <h3>02 単語 → 数値の配列（Bag of Words）</h3>
          <p>学習時に作った語彙の順番を固定して、各単語の出現回数を並べます。出てこない単語は0。語順は保存しません。</p>
          <p id="nlp-vector-summary" class="nlp-vector-summary"></p>
          <div id="nlp-vector" class="nlp-vector" aria-label="特徴量ベクトルの先頭24次元"></div>
          <p class="field-help">先頭24次元を表示。各列の上が単語、下がモデルに渡す数値です。入力に含まれる語彙は下の表ですべて確認できます。</p>
          <div class="nlp-table-scroll"><table><caption>認識された単語と出現回数</caption><thead><tr><th scope="col">位置（0始まり）</th><th scope="col">単語</th><th scope="col">回数</th></tr></thead><tbody id="nlp-counts"></tbody></table></div>
          <details><summary>数値の配列をすべて見る</summary><pre id="nlp-full-vector"></pre></details>
        </section>
        <section class="panel">
          <h3>03 分類 → 予測に影響した単語をのぞく</h3>
          <p id="nlp-contribution-help"></p>
          <div class="nlp-table-scroll"><table><caption>予測クラスへの寄与（絶対値の大きい順・上位12語）</caption><thead><tr><th scope="col">単語</th><th scope="col">回数</th><th scope="col">重み</th><th scope="col">回数 × 重み</th></tr></thead><tbody id="nlp-contributions"></tbody></table></div>
          <p id="nlp-bias" class="field-help"></p>
        </section>
      </div>
      <section class="panel nlp-reading"><h3>Bag of Wordsで分かること・苦手なこと</h3><p>「旅行 温泉 旅行」は、語彙が［旅行, 温泉, 料理］なら［2, 1, 0］になります。モデルが受け取るのは文章そのものではなく、この数値の配列です。</p><p>単語の並び方や文脈は残りません。「良い」「良くない」の否定、皮肉、学習していない言い回しは間違うことがあります。単語を繰り返したり、文章の順序を入れ替えたりして、結果の変化を確かめましょう。</p></section>
      <section class="panel"><details><summary>学習データの例を見る</summary><div id="nlp-samples"></div></details></section>
    </div>
  </div>`;

  const kind = () => $('nlp-kind').value;
  function invalidate() {
    requestId++;
    $('nlp-output').hidden = true;
    $('nlp-inline-result').hidden = true;
    if (summary) $('nlp-status').textContent = '文章を入力して「分析」を押してください。';
  }
  function renderSummary(data) {
    $('nlp-summary').innerHTML = `<strong>全${data.total.toLocaleString()}件 / ${data.classes.length}クラス</strong><p>学習 ${data.trainCount}件<br>検証 ${data.validation.count}件 / テスト ${data.test.count}件</p><ul>${data.distribution.map(c => `<li>${esc(c.label)}：${c.count}件</li>`).join('')}</ul><small>クラス別の件数は学習用データのみ。</small>`;
    $('nlp-metrics').innerHTML = [
      ['語彙数', data.vocabulary.length.toLocaleString(), '単語＝特徴量の次元数'],
      ['検証用の正解率', data.validation.accuracy === null ? '—' : percent(data.validation.accuracy), `${data.validation.count}件・学習には未使用`],
      ['テスト用の正解率', data.test.accuracy === null ? '—' : percent(data.test.accuracy), `${data.test.count}件・学習には未使用`],
    ].map(([label, value, note], i) => `<div class="metric ${i === 0 ? 'primary-metric' : ''}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`).join('');
    $('nlp-metrics').hidden = false;
    $('nlp-samples').innerHTML = data.samples.map(row => `<div class="nlp-sample"><strong>${esc(row.label)}</strong><p>${esc(row.text)}</p></div>`).join('');
  }
  function renderPrediction(data) {
    const vocabulary = summary.vocabulary;
    const known = new Set(vocabulary);
    const counts = new Map(data.vector);
    $('nlp-analyzed-text').textContent = data.text;
    $('nlp-tokens').innerHTML = data.tokens.map(token => `<span class="nlp-token ${known.has(token) ? '' : 'unknown'}">${esc(token)}</span>`).join('') || '<span>単語が見つかりませんでした。</span>';
    $('nlp-unknown').textContent = data.unknown.length ? `語彙にない単語：${data.unknown.join('、')}` : '語彙にない単語：なし';
    $('nlp-vector-summary').textContent = `${data.tokens.length}単語 → ${vocabulary.length}次元の配列 / 0以外は${data.vector.length}次元`;
    $('nlp-vector').innerHTML = vocabulary.slice(0, 24).map((word, index) => `<div class="${counts.has(index) ? 'nonzero' : ''}"><span>${esc(word)}</span><strong>${counts.get(index) ?? 0}</strong><small>#${index}</small></div>`).join('');
    $('nlp-counts').innerHTML = data.vector.map(([index, count]) => `<tr><td>${index}</td><td>${esc(vocabulary[index])}</td><td>${count}</td></tr>`).join('') || '<tr><td colspan="3">認識された単語はありません。すべての次元が0です。</td></tr>';
    $('nlp-full-vector').textContent = `[${vocabulary.map((_, index) => counts.get(index) ?? 0).join(', ')}]`;
    const label = summary.classes[data.winner].label;
    $('nlp-result').textContent = data.vector.length ? `予測：${label}（${percent(data.probabilities[data.winner])}）` : '判定材料がありません（認識された単語が0個）';
    $('nlp-result-note').textContent = data.vector.length ? 'クラスごとの予測確率' : 'すべて0の配列になるため、以下は切片だけによる参考確率です。';
    $('nlp-probabilities').innerHTML = summary.classes.map((c, index) => `<div class="nlp-probability ${index === data.winner ? 'winner' : ''}"><div><span>${esc(c.label)}</span><strong>${percent(data.probabilities[index])}</strong></div><progress max="1" value="${data.probabilities[index]}" aria-label="${esc(c.label)}の予測確率"></progress></div>`).join('');
    $('nlp-contribution-help').textContent = `「${label}」のスコアに対する寄与です。＋はスコアを上げ、−は下げます。ほかのクラスのスコアも合わせて確率が決まるため、確率への直接の増減ではありません。`;
    $('nlp-contributions').innerHTML = data.contributions.slice(0, 12).map(c => `<tr><td>${esc(c.word)}</td><td>${c.count}</td><td>${signed(c.weight)}</td><td class="${c.contribution >= 0 ? 'nlp-positive' : 'nlp-negative'}">${signed(c.contribution)}</td></tr>`).join('') || '<tr><td colspan="4">単語による寄与はありません。</td></tr>';
    $('nlp-bias').textContent = `切片 ${signed(data.bias)} ＋ 全認識単語の寄与 ${signed(data.contributions.reduce((sum, c) => sum + c.contribution, 0))} ＝ このクラスのスコア。各クラスのスコアをsoftmaxで確率に変換します。`;
    $('nlp-output').hidden = false;
    $('nlp-inline-result').hidden = false;
    $('nlp-status').textContent = '分析が完了しました。入力ブロック内に結果を表示しています。下では単語と数値の対応を確認できます。';
  }
  function fail(message) {
    worker?.terminate(); worker = null; summary = null;
    $('nlp-progress').hidden = true;
    $('nlp-output').hidden = true;
    $('nlp-inline-result').hidden = true;
    $('nlp-metrics').hidden = true;
    $('nlp-analyze').disabled = true;
    $('nlp-train').disabled = false;
    $('nlp-summary').textContent = '学習を完了できませんでした。再試行してください。';
    $('nlp-status').textContent = `${message} 「データを学習する」で再試行できます。`;
    $('nlp-status').classList.add('error');
  }
  function train() {
    worker?.terminate(); summary = null; invalidate();
    $('nlp-metrics').hidden = true;
    $('nlp-summary').textContent = 'CSVを読み込んでいます…';
    $('nlp-samples').textContent = '学習完了後に表示します。';
    $('nlp-train').disabled = true;
    $('nlp-analyze').disabled = true;
    $('nlp-progress').value = 0;
    $('nlp-progress').hidden = false;
    $('nlp-status').classList.remove('error');
    $('nlp-status').textContent = 'CSVを読み込み、単語の語彙を作っています…';
    try {
      const currentWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker = currentWorker;
      worker.onerror = () => { if (worker === currentWorker) fail('処理を開始できませんでした。ブラウザと接続を確認してください。'); };
      worker.onmessage = ({ data }) => {
        if (worker !== currentWorker) return;
        if (data.type === 'progress') {
          $('nlp-progress').value = data.epoch;
          $('nlp-status').textContent = `重みを学習中 ${data.epoch} / ${data.epochs}回 · 損失 ${data.loss.toFixed(3)}（小さいほど学習データに適合）`;
        } else if (data.type === 'trained') {
          summary = data; renderSummary(data);
          $('nlp-progress').hidden = true;
          $('nlp-train').disabled = false;
          $('nlp-analyze').disabled = false;
          $('nlp-status').textContent = '学習が完了しました。文章を入力して「分析」を押してください。';
        } else if (data.type === 'prediction' && data.requestId === requestId) {
          renderPrediction(data);
        } else if (data.type === 'error') fail(data.message);
      };
      worker.postMessage({ type: 'train', kind: kind() });
    } catch (error) { fail(error.message); }
  }
  function changeDataset() {
    const config = datasets[kind()];
    $('nlp-description').textContent = config.description;
    $('nlp-csv').href = new URL(`./csv/${config.file}`, import.meta.url).href;
    $('nlp-text').value = config.examples[0];
    $('nlp-examples').innerHTML = config.examples.map((text, i) => `<button type="button" class="quiet small" data-example="${i}">例：${esc(text)}</button>`).join('');
    train();
  }
  $('nlp-kind').onchange = changeDataset;
  $('nlp-train').onclick = train;
  $('nlp-text').oninput = invalidate;
  $('nlp-examples').onclick = event => {
    const button = event.target.closest('[data-example]');
    if (!button) return;
    $('nlp-text').value = datasets[kind()].examples[Number(button.dataset.example)];
    invalidate(); $('nlp-text').focus();
  };
  $('nlp-form').onsubmit = event => {
    event.preventDefault();
    if (!summary || !worker) return;
    const text = $('nlp-text').value.trim();
    invalidate();
    if (!text || text.length > 2000) {
      $('nlp-status').textContent = '文章を1〜2,000文字で入力してください。';
      $('nlp-text').focus(); return;
    }
    $('nlp-status').textContent = '文章を数値化して分析しています…';
    worker.postMessage({ type: 'predict', text, requestId });
  };
  return {
    show() { root.hidden = false; if (!initialized) { initialized = true; changeDataset(); } },
    hide() { root.hidden = true; },
  };
}
