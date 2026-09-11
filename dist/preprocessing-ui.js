import { $, esc } from './shared/dom.js';
const number = (value) =>
  Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : '—';
export function renderPreprocessing(result) {
  const p = result.preprocessing;
  if (!p) return;
  $('preprocessingPanel').hidden = false;
  $('preprocessMeta').textContent =
    `${result.features.length}列 → ${p.outputNames.length}列 · ${p.fittedOn === 'train' ? '学習データ' : '全有効データ'} ${p.fittedRows}行から変換ルールを作成`;
  $('preprocessRules').innerHTML = p.columns
    .map((c) => {
      let rule;
      if (c.type === 'category')
        rule = `One-hot · ${c.categories.length}種類${c.baseline !== null ? ` · 基準「${esc(c.baseline)}」は列を除外` : ''}`;
      else
        rule =
          p.scaling === 'standard'
            ? `(x − ${number(c.mean)}) / ${number(c.std || 1)}${!c.std ? ' · 定数列は0' : ''}`
            : p.scaling === 'minmax'
              ? `(x − ${number(c.min)}) / ${number(c.max - c.min || 1)}${c.min === c.max ? ' · 定数列は0' : ''}`
              : '数値をそのまま使用';
      return `<div class="preprocess-rule"><strong>${esc(c.name)}</strong><span>${rule}</span></div>`;
    })
    .join('');
  $('preprocessNote').textContent =
    (p.fittedOn === 'train'
      ? 'テストデータには同じルールを適用。テスト値が学習時の範囲外なら、Min-Maxでも0〜1を超えます。'
      : '教師なし学習は全有効データで変換ルールを作成。') +
    ' One-hot列は0/1のままです。' +
    (p.unknownRows
      ? ` テストの${p.unknownRows}行に未知のカテゴリがあり、該当するOne-hot列をすべて0にしました。`
      : '');
  const heading = [
    '元CSV行',
    '区分',
    ...p.columns.map((c) => '元: ' + c.name),
    ...p.outputNames.map((n) => '変換後: ' + n),
  ];
  // Include held-out rows in the preview even when the first ten source rows are training rows.
  let preview = p.rows.slice(0, 10);
  if (p.fittedOn === 'train' && !preview.some((r) => r.subset === 'test')) {
    const firstTest = p.rows.find((r) => r.subset === 'test');
    if (firstTest) preview = [...preview.slice(0, 9), firstTest];
  }
  $('preprocessTable').innerHTML =
    `<table><thead><tr>${heading.map((h, i) => `<th class="${i >= 2 + p.columns.length ? 'transformed' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${preview.map((r) => `<tr><td>${r.id + 2}</td><td>${{ train: '学習', test: 'テスト', all: '全体' }[r.subset]}</td>${r.raw.map((v) => `<td>${esc(v)}</td>`).join('')}${r.values.map((v) => `<td class="transformed">${number(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('preprocessPreviewNote').textContent =
    '最大10行の比較。CSVには変換後の全有効行を出力します。';
  const category = result.plotAxes?.some((a) => a.type === 'category');
  $('plotSpaceNote').hidden = !category;
  $('plotSpaceNote').textContent = category
    ? 'カテゴリ軸の位置は表示用です。学習にはOne-hotの各列を使い、この並び順を数値の大小として扱いません。' +
      (result.opts.task === 'clustering'
        ? '重心はOne-hot空間で計算するため、この図への重心表示は省略します。'
        : '')
    : '';
}
export function processedCSVRows(result) {
  const p = result.preprocessing,
    hasTarget = result.opts.task !== 'clustering';
  return [
    [
      ...p.outputNames,
      ...(hasTarget ? ['目的変数: ' + result.headers[result.opts.target]] : []),
      'データ区分',
      '元CSV行番号',
    ],
    ...p.rows.map((r) => [
      ...r.values,
      ...(hasTarget ? [r.target] : []),
      r.subset,
      r.id + 2,
    ]),
  ];
}
