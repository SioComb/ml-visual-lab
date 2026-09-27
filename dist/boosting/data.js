import { parseCSV, rng } from '../ml.js';

export const datasets = ['classification', 'moons', 'circles'];
export const plotFeatures = ['x1', 'x2'];
export function dataURL(name) {
  if (!datasets.includes(name)) throw Error(`未対応のデータセットです: ${name}`);
  return new URL(`./data/${name}.csv`, import.meta.url);
}

export function parseLearningCSV(text) {
  const { headers, rows } = parseCSV(text);
  const targetIndex = headers.indexOf('target');
  const features = headers.filter((name) => name !== 'target' && name !== 'id' && !/^unnamed:/i.test(name));
  if (targetIndex < 0 || plotFeatures.some((name) => !features.includes(name))) {
    throw Error('CSVの列が不足しています。target、x1、x2が必要です。');
  }
  const indices = features.map((name) => headers.indexOf(name));
  const records = rows.map((fields, index) => {
    const x = indices.map((column) => {
      const raw = fields[column];
      if (raw === '' || !Number.isFinite(Number(raw))) throw Error(`${index + 2}行目の「${headers[column]}」が数値ではありません。`);
      return Number(raw);
    });
    const rawTarget = fields[targetIndex];
    if (rawTarget !== '0' && rawTarget !== '1') throw Error(`${index + 2}行目のtargetは0か1にしてください。`);
    return { id: index + 1, x, target: Number(rawTarget) };
  });
  if (records.length !== 1000) throw Error(`CSVは1000件必要です（現在${records.length}件）。`);
  if ([0, 1].some((label) => records.filter((row) => row.target === label).length < 3)) throw Error('各クラスは3件以上必要です。');
  return { features, records };
}

export async function loadLearningData(name) {
  const url = dataURL(name);
  let response;
  try { response = await fetch(url); }
  catch { throw Error(`データを取得できません: ${url.pathname}`); }
  if (!response.ok) throw Error(`データを取得できません: ${url.pathname}（HTTP ${response.status}）`);
  return parseLearningCSV(await response.text());
}

export function splitLearningData(records, seed = 42) {
  const random = rng(seed);
  const train = [], valid = [];
  for (const label of [0, 1]) {
    const rows = records.filter((row) => row.target === label);
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    const heldOut = Math.round(rows.length * 0.2);
    valid.push(...rows.slice(0, heldOut));
    train.push(...rows.slice(heldOut));
  }
  return { train, valid };
}

export function trainMedians(train) {
  return train[0].x.map((_, feature) => {
    const sorted = train.map((row) => row.x[feature]).sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  });
}
