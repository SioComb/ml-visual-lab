import { associationRules } from './mining.js';
import { sampleBaskets, parseBaskets, toCSV } from './data.js';

const $ = id => document.getElementById(id);
const names = { apriori: 'Apriori', eclat: 'Eclat', fpgrowth: 'FP-Growth' };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const percent = value => `${(100 * value).toFixed(1).replace(/\.0$/, '')}%`;
const label = items => items.join(' ＋ ');
const empty = text => `<p class="empty-state">${escape(text)}</p>`;
const table = (headers, rows) => `<table><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
let transactions = [], dataLabel = '', results = [], worker = null, selected = [], method = 'apriori', rules = [], fileVersion = 0;

function message(text, error = false) { $('mining-message').textContent = text; $('mining-message').classList.toggle('error', error); }
function stop() {
  worker?.terminate(); worker = null;
  $('cancel-mining').hidden = true; $('run-mining').disabled = false;
}
function updateConditions() {
  $('support-value').textContent = `${$('min-support').value}%`;
  $('support-help').textContent = `${transactions.length}件中${Math.ceil(transactions.length * Number($('min-support').value) / 100 - 1e-10)}件以上に含まれる組合せを探します。`;
}
function invalidate() {
  stop(); results = []; selected = []; rules = [];
  $('mining-status').textContent = '未実行'; $('agreement').textContent = '未実行';
  $('result-meta').textContent = `${dataLabel} · ${transactions.length.toLocaleString()}件の購買`;
  $('download-patterns').disabled = true; $('download-rules').disabled = true;
  updateConditions(); renderMetrics(); renderComparison(); renderPatterns(); renderBaskets(); renderMethod(); renderRules();
  message('条件を設定して「3つの手法で比較する」を押してください。');
}
function setData(rows, name) {
  transactions = rows; dataLabel = name;
  $('data-status').textContent = `${name} · ${rows.length.toLocaleString()}件を使用中`;
  invalidate();
}
function loadSample() {
  fileVersion++;
  const kind = $('basket-sample').value, seed = Number($('basket-seed').value);
  if (kind !== 'small' && (!$('basket-seed').value || !Number.isInteger(seed) || seed < 0 || seed > 4294967295)) {
    $('basket-seed').reportValidity(); message('Random Seedは0〜4,294,967,295の整数で指定してください。', true); return;
  }
  $('generated-controls').hidden = kind === 'small';
  $('sample-note').textContent = { small: 'パン・牛乳・おむつなど7商品の10件。レシートと照合しながら支持度を手で確かめられます。', standard: '朝食・パスタ・おつまみの組合せを埋め込んだ16商品のデータ。同じSeed・件数で同じデータを再現します。', dense: '16商品を高い確率で含むまとめ買いデータ。商品が重なると、探索量がどう変わるかを試せます。' }[kind];
  setData(sampleBaskets(kind, Number($('basket-size').value), seed), $('basket-sample').selectedOptions[0].textContent);
}
function renderMetrics() {
  const unique = new Set(transactions.flat()).size;
  const metrics = [['購買件数', transactions.length.toLocaleString(), `${unique}種類の商品`], ['1回あたりの商品', transactions.length ? (transactions.reduce((sum, row) => sum + row.length, 0) / transactions.length).toFixed(1) : '0', '同じ商品の重複は1つ'], ['頻出組合せ', results[0]?.patterns.length.toLocaleString() ?? '—', `1〜${$('max-length').value}商品の組合せ`]];
  $('basket-metrics').innerHTML = metrics.map(([title, value, note]) => `<div class="metric"><div class="metric-label">${title}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`).join('');
}
function renderComparison(comparisons = results) {
  $('comparison').innerHTML = Object.entries(names).map(([id, name]) => {
    const result = comparisons.find(result => result.algorithm === id);
    const concept = { apriori: '小さい組合せから候補を絞る', eclat: '取引IDの共通集合で数える', fpgrowth: '購買を木に圧縮して探索する' }[id];
    const detail = !result ? '実行後に探索量を表示' : id === 'apriori' ? `候補 ${result.stats.candidates.toLocaleString()}件` : id === 'eclat' ? `共通集合の計算 ${result.stats.intersections.toLocaleString()}回` : `木のノード ${result.stats.nodes.toLocaleString()}個 / ${result.stats.trees.toLocaleString()}本`;
    return `<article class="method-card"><h4>${name}</h4><div class="duration">${result ? result.elapsed < 0.01 ? '&lt;0.01' : result.elapsed.toFixed(2) : '—'} <small>ms</small></div><p>${concept}</p><p>${result ? `頻出 ${result.patterns.length.toLocaleString()}件 · 全購買走査 ${result.stats.scans}回` : '同じ条件で比較'}</p><p>${detail}</p></article>`;
  }).join('');
}
function renderPatterns() {
  const patterns = results[0]?.patterns || [], filter = $('pattern-size').value;
  const visible = patterns.map((pattern, index) => ({ ...pattern, index })).filter(pattern => filter === 'all' || (filter === 'multi' ? pattern.items.length >= 2 : pattern.items.length === Number(filter)));
  $('patterns-note').textContent = results.length ? `${visible.length.toLocaleString()}件が表示条件に一致。支持度の高い順にグラフは上位10件、表は上位100件。CSVは1商品を含む全結果です。` : '比較を実行すると結果が表示されます。';
  $('pattern-chart').innerHTML = visible.slice(0, 10).map(pattern => `<button class="pattern-bar${JSON.stringify(pattern.items) === JSON.stringify(selected) ? ' selected' : ''}" data-pattern="${pattern.index}" aria-label="${escape(label(pattern.items))}、支持度${percent(pattern.support)}、該当する購買を表示"><span>${escape(label(pattern.items))}</span><span class="bar-track"><span class="bar-fill" style="width:${pattern.support * 100}%"></span></span><strong>${percent(pattern.support)}</strong></button>`).join('');
  $('pattern-table').innerHTML = visible.length ? table(['組合せ', '出現件数', '支持度'], visible.slice(0, 100).map(pattern => `<tr${JSON.stringify(pattern.items) === JSON.stringify(selected) ? ' class="selected"' : ''}><td><button class="pattern-select" data-pattern="${pattern.index}">${escape(label(pattern.items))}</button></td><td>${pattern.count} / ${transactions.length}</td><td>${percent(pattern.support)}</td></tr>`)) : empty(results.length ? 'この条件の組合せはありません。支持度を下げるか、表示サイズを変えてみましょう。' : 'ここに頻出組合せが表示されます。');
}
function renderBaskets() {
  const matches = transactions.filter(row => selected.every(item => row.includes(item))).length;
  $('basket-match').textContent = selected.length ? `${label(selected)} → ${matches} / ${transactions.length}件（支持度 ${percent(matches / transactions.length)}）` : '組合せをクリックすると、それを含む購買を強調します。';
  $('clear-pattern').hidden = !selected.length;
  $('basket-preview').innerHTML = transactions.slice(0, 12).map((row, index) => `<div class="basket-receipt${selected.length && selected.every(item => row.includes(item)) ? ' match' : ''}"><strong>RECEIPT ${String(index + 1).padStart(3, '0')}${selected.length && selected.every(item => row.includes(item)) ? ' · 一致' : ''}</strong>${row.map(item => `<span class="item-chip${selected.includes(item) ? ' highlight' : ''}">${escape(item)}</span>`).join('')}</div>`).join('');
  $('basket-preview-note').textContent = `先頭${Math.min(12, transactions.length)} / ${transactions.length}件を表示。支持度と一致件数は全購買から計算しています。`;
}
function renderMethod() {
  const result = results.find(result => result.algorithm === method);
  document.querySelectorAll('[data-method]').forEach(button => { button.classList.toggle('active', button.dataset.method === method); button.setAttribute('aria-pressed', String(button.dataset.method === method)); });
  $('method-description').textContent = {
    apriori: '1商品 → 2商品 → 3商品と、サイズごとに探索します。頻出でない部分集合を含む候補は、数える前に除外できます。例えば「パン＋牛乳」が頻出でなければ「パン＋牛乳＋卵」も頻出になりません。',
    eclat: '商品ごとに「どの取引IDに出現したか」を持ちます。2商品のIDの共通集合を取ると、一緒に買われた購買がわかります。この共通集合を使って、組合せを深さ優先で伸ばします。下は頻出1商品の取引IDです。',
    fpgrowth: '頻出商品を出現回数順に並べ、共通する購買の先頭部分をFP-treeにまとめます。各商品の条件付きパターンベースから小さな木を作り、組合せを伸ばします。下は最初のFP-tree（最大60ノード）。数値はその経路を通る購買件数で、商品の総支持度とは異なります。',
  }[method];
  if (!result) { $('method-trace').innerHTML = empty('比較を実行すると、このデータでの探索の様子が表示されます。'); return; }
  if (method === 'apriori') $('method-trace').innerHTML = table(['サイズ', '数えた候補', '事前に除外', '頻出'], result.trace.map(row => `<tr><td>${row.size}商品</td><td>${row.candidates}</td><td>${row.pruned}</td><td>${row.frequent}</td></tr>`));
  else if (method === 'eclat') $('method-trace').innerHTML = table(['商品', '出現件数', '取引ID（先頭16件）'], result.trace.map(row => `<tr><td>${escape(row.item)}</td><td>${row.count}</td><td>${row.tids.map(id => id + 1).join(', ')}${row.count > 16 ? ' …' : ''}</td></tr>`));
  else $('method-trace').innerHTML = `<div class="fp-tree"><div>ROOT</div>${result.trace.map(node => `<div class="fp-node" style="margin-left:${node.depth * 18}px">↳ ${escape(node.item)} : ${node.count}</div>`).join('')}</div><p class="trace-note">比較カードのノード数・木の本数は、条件付きの木を含む生成数の合計です。</p>`;
}
function renderRules() {
  $('confidence-value').textContent = `${$('min-confidence').value}%`;
  rules = associationRules(results[0]?.patterns || [], Number($('min-confidence').value) / 100);
  $('rules-table').innerHTML = rules.length ? table(['関連ルール', '支持度', '確信度', 'リフト'], rules.slice(0, 100).map(rule => `<tr><td>${escape(label(rule.antecedent))} → <b>${escape(rule.consequent)}</b></td><td>${percent(rule.support)}</td><td>${percent(rule.confidence)}</td><td>${rule.lift.toFixed(2)}</td></tr>`)) : empty(results.length ? '条件を満たすルールはありません。確信度を下げるか、探索条件を変えてください。' : '探索後に関連ルールを表示します。');
  $('rules-note').textContent = `右側が1商品のルール${rules.length.toLocaleString()}件。リフトの高い順に上位100件を表示。CSVには現在の最小確信度を満たす全ルールを含みます。`;
  $('download-rules').disabled = !results.length || worker !== null;
}
function run() {
  invalidate(); $('run-mining').disabled = true; $('cancel-mining').hidden = false; $('mining-status').textContent = '探索中';
  try {
    const completed = [];
    const active = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); worker = active;
    active.onmessage = ({ data }) => {
      if (worker !== active) return;
      if (data.type === 'progress') message(`${names[data.algorithm]}で探索中…`);
      else if (data.type === 'result') { completed.push(data.result); renderComparison(completed); }
      else if (data.type === 'error') fail(data.message);
      else if (data.type === 'done') {
        stop();
        results = completed;
        const signature = result => JSON.stringify(result.patterns.map(pattern => [pattern.items, pattern.count]));
        if (results.length !== 3 || results.some(result => signature(result) !== signature(results[0]))) { fail('手法間で結果が一致しませんでした。条件を変えて再実行してください。'); return; }
        $('mining-status').textContent = '探索完了'; $('agreement').textContent = '✓ 3手法の結果が一致';
        $('download-patterns').disabled = false;
        $('result-meta').textContent = `${dataLabel} · ${transactions.length.toLocaleString()}件 · 最小支持度 ${$('min-support').value}%（${results[0].minimum}件以上）· 最大${$('max-length').value}商品`;
        message(`${results[0].patterns.length.toLocaleString()}件の頻出組合せを発見しました。組合せを選んでレシートで確かめられます。`);
        renderMetrics(); renderPatterns(); renderMethod(); renderRules();
      }
    };
    active.onerror = event => { event.preventDefault(); if (worker === active) fail('探索を開始できませんでした。HTTPサーバー経由でページを開いて再実行してください。'); };
    active.postMessage({ transactions, options: { support: Number($('min-support').value) / 100, maxLength: Number($('max-length').value) } });
  } catch (error) { fail(error.message); }
}
function fail(text) { invalidate(); $('mining-status').textContent = '探索できませんでした'; message(text, true); }
function download(filename, rows) {
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('run-mining').addEventListener('click', run);
$('cancel-mining').addEventListener('click', () => { invalidate(); $('mining-status').textContent = '中止'; message('探索を中止しました。条件を変えて再実行できます。'); });
for (const id of ['basket-sample', 'basket-size', 'basket-seed']) $(id).addEventListener('change', loadSample);
for (const id of ['min-support', 'max-length']) $(id).addEventListener('input', invalidate);
$('min-confidence').addEventListener('input', renderRules);
$('pattern-size').addEventListener('change', renderPatterns);
$('clear-pattern').addEventListener('click', () => { selected = []; renderPatterns(); renderBaskets(); });
for (const id of ['pattern-chart', 'pattern-table']) $(id).addEventListener('click', event => {
  const button = event.target.closest('[data-pattern]'); if (!button || !results.length) return;
  selected = results[0].patterns[Number(button.dataset.pattern)].items; renderPatterns(); renderBaskets();
});
$('method-switch').addEventListener('click', event => { const button = event.target.closest('[data-method]'); if (button) { method = button.dataset.method; renderMethod(); } });
$('apply-baskets').addEventListener('click', () => { fileVersion++; try { setData(parseBaskets($('basket-text').value), '入力した購買データ'); } catch (error) { message(error.message, true); } });
$('basket-file').addEventListener('change', async () => {
  const file = $('basket-file').files[0], version = ++fileVersion; if (!file) return;
  try {
    if (file.size > 2097152) throw new Error('CSVは2MB以内で指定してください。');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    if (version !== fileVersion) return;
    setData(parseBaskets(text), file.name);
  } catch (error) { if (version === fileVersion) message(error instanceof TypeError ? 'CSVをUTF-8で保存してから読み込んでください。' : error.message, true); }
  finally { $('basket-file').value = ''; }
});
$('download-baskets').addEventListener('click', () => download('basket-data.csv', transactions));
$('download-patterns').addEventListener('click', () => { if (results.length) download('frequent-itemsets.csv', [['組合せ（JSON）', 'サイズ', '出現件数', '支持度'], ...results[0].patterns.map(pattern => [JSON.stringify(pattern.items), pattern.items.length, pattern.count, pattern.support])]); });
$('download-rules').addEventListener('click', () => download('association-rules.csv', [['条件（JSON）', '結論', '出現件数', '支持度', '確信度', 'リフト'], ...rules.map(rule => [JSON.stringify(rule.antecedent), rule.consequent, rule.count, rule.support, rule.confidence, rule.lift])]));
window.addEventListener('pagehide', stop);
loadSample(); run();
