import { random } from '../rl/random.js';

export const datasets = {
  moons: { name: 'Moons', description: '半月状に入り組んだ2クラス分類データです。単純な直線では分けづらい形を、弱学習器を重ねてどこまで分けられるか観察しましょう。' },
  circles: { name: 'Circles', description: '内側と外側の円に分布した2クラスです。1本の境界では分けられない円形の領域を、単純な分割の組み合わせで学習します。' },
  classification: { name: 'Classification', description: '2つの数値特徴量をもつ分類データです。クラスの分布には重なりがあり、ノイズも含まれます。学習データの間違いを減らすことが、テストの改善につながるか比べましょう。' },
};

export function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.shift()?.split(',').map(s => s.trim()).join(',') !== 'x1,x2,target')
    throw Error('CSVの列は x1,x2,target が必要です。');
  const records = lines.map((line, i) => {
    const fields = line.split(',').map(s => s.trim());
    if (fields.length !== 3 || fields.some(s => !s || !Number.isFinite(Number(s))))
      throw Error(`CSV ${i + 2}行目の数値を読み取れません。`);
    const [x1, x2, target] = fields.map(Number);
    if (target !== 0 && target !== 1) throw Error('クラスは0または1で指定してください。');
    return { id: i + 1, x: [x1, x2], target };
  });
  if ([0, 1].some(c => records.filter(r => r.target === c).length < 2))
    throw Error('各クラスに2件以上のデータが必要です。');
  return records;
}

export async function loadDataset(kind) {
  if (!Object.hasOwn(datasets, kind)) throw Error('データセットが不正です。');
  const response = await fetch(new URL(`./data/${kind}.csv`, import.meta.url));
  if (!response.ok) throw Error(`CSVを読み込めませんでした（HTTP ${response.status}）。再試行してください。`);
  return parseCSV(await response.text());
}

// Stratified, reproducible split. Test rows are never passed to stump fitting.
export function splitDataset(records, testSize = 0.25, seed = 42) {
  if (!(testSize > 0 && testSize < 1)) throw Error('テスト割合は0と1の間で指定してください。');
  const rng = random(seed), train = [], test = [];
  for (const target of [0, 1]) {
    const rows = records.filter(row => row.target === target);
    if (rows.length < 2) throw Error('各クラスに2件以上必要です。');
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    const count = Math.max(1, Math.min(rows.length - 1, Math.round(rows.length * testSize)));
    test.push(...rows.slice(0, count));
    train.push(...rows.slice(count));
  }
  return { train, test };
}
