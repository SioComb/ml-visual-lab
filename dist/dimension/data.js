export const features = [
  'alcohol', 'malic_acid', 'ash', 'alcalinity_of_ash', 'magnesium',
  'total_phenols', 'flavanoids', 'nonflavanoid_phenols', 'proanthocyanins',
  'color_intensity', 'hue', 'od280/od315_of_diluted_wines', 'proline',
];
export const featureNames = [
  'アルコール', 'リンゴ酸', '灰分', '灰分アルカリ度', 'マグネシウム',
  '総フェノール', 'フラボノイド', '非フラボノイドフェノール',
  'プロアントシアニン', '色の濃さ', '色相', 'OD280/OD315', 'プロリン',
];
export const classNames = ['ワインA', 'ワインB', 'ワインC'];
export const wineURL = new URL('./data/wine.csv', import.meta.url);

export function parseWineCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = [...features, 'target'];
  if (lines.shift()?.split(',').map(v => v.trim()).join(',') !== header.join(',')) {
    throw new Error('Wine CSV header mismatch');
  }
  if (lines.length !== 178) throw new Error('Wine CSV must contain 178 rows');
  const records = lines.map((line, index) => {
    const fields = line.split(',').map(v => v.trim());
    if (fields.length !== 14 || fields.some(v => !v || !Number.isFinite(Number(v)))) {
      throw new Error(`Invalid Wine row ${index + 1}`);
    }
    const values = fields.map(Number), target = values.pop();
    if (![0, 1, 2].includes(target)) throw new Error('Invalid Wine target');
    return { id: index + 1, values, target };
  });
  for (const target of [0, 1, 2]) {
    if (records.filter(r => r.target === target).length < 3) throw new Error('Wine class too small');
  }
  return records;
}

export async function loadWine() {
  const response = await fetch(wineURL);
  if (!response.ok) throw new Error(`Wine fetch failed: ${response.status}`);
  return parseWineCSV(await response.text());
}
