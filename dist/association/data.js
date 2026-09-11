import { normalizeTransactions } from './mining.js';

export function sampleBaskets(kind = 'small', size = 300, seed = 42) {
  if (kind === 'small')
    return [
      ['パン', '牛乳'],
      ['パン', 'おむつ', 'ビール', '卵'],
      ['牛乳', 'おむつ', 'ビール', 'コーラ'],
      ['パン', '牛乳', 'おむつ', 'ビール'],
      ['パン', '牛乳', 'おむつ', 'コーラ'],
      ['パン', '牛乳', '卵'],
      ['パン', 'バター'],
      ['牛乳', 'おむつ', 'ビール'],
      ['パン', '牛乳', 'バター'],
      ['パン', '牛乳', 'おむつ', 'ビール', '卵'],
    ];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const catalog = [
    'パン',
    '牛乳',
    '卵',
    'バター',
    'コーヒー',
    'ヨーグルト',
    'バナナ',
    'りんご',
    'おむつ',
    'ビール',
    'コーラ',
    'ポテトチップス',
    'パスタ',
    'トマトソース',
    'チーズ',
    'サラダ',
  ];
  return Array.from({ length: size }, () => {
    const basket = new Set(
      catalog.filter(() => random() < (kind === 'dense' ? 0.42 : 0.08)),
    );
    if (random() < 0.45) {
      basket.add('パン');
      if (random() < 0.8) basket.add('牛乳');
      if (random() < 0.6) basket.add('バター');
    }
    if (random() < 0.3) {
      basket.add('パスタ');
      if (random() < 0.85) basket.add('トマトソース');
    }
    if (random() < 0.25) {
      basket.add('ビール');
      if (random() < 0.75) basket.add('ポテトチップス');
    }
    if (!basket.size)
      basket.add(catalog[Math.floor(random() * catalog.length)]);
    return [...basket];
  });
}

// Headerless CSV: each record is a basket, each field is an item.
export function parseBaskets(text) {
  if (new TextEncoder().encode(text).length > 2097152)
    throw new Error('CSVは2MB以内で指定してください。');
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [],
    field = '',
    quoted = false,
    closed = false;
  const pushField = () => {
    row.push(field);
    field = '';
    closed = false;
  };
  const pushRow = () => {
    pushField();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else if (char === '\n')
        throw new Error('商品名に改行は使用できません。');
      else field += char;
    } else if (char === ',') pushField();
    else if (char === '\n') pushRow();
    else if (char === '"' && !field && !closed) quoted = true;
    else if (char === '"' || (closed && char.trim()))
      throw new Error('CSVの引用符を確認してください。');
    else if (!closed) field += char;
  }
  if (quoted) throw new Error('CSVの引用符が閉じていません。');
  pushRow();
  return normalizeTransactions(rows);
}

export function toCSV(rows) {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            // Neutralize spreadsheet formulas in imported item names.
            let text = String(value);
            if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(','),
      )
      .join('\r\n')
  );
}
