import { parseCSV } from '../ml.js';

export const datasets = {
  sentiment: {
    title: '感情分析', file: 'bow_sentiment_reviews_5000.csv',
    description: '商品・アプリ・ホテルなどの架空レビューを、0＝低評価・1＝高評価に分類します。',
    examples: ['このイヤホンは音質が良くてとても気に入りました', '品質が悪くて使いにくい。もう買いたくない。'],
  },
  genre: {
    title: 'ジャンル分類', file: 'bow_japanese_training_5000.csv',
    description: '架空の文章を、IT・テクノロジー、食事・料理、旅行・観光、スポーツ、金融・経済の5ジャンルに分類します。',
    examples: ['北海道へ旅行して温泉に入りたい', 'アプリのセキュリティ対策を強化したい'],
  },
};

export function readDataset(csv, kind) {
  if (!Object.hasOwn(datasets, kind)) throw Error('学習データの種類が不正です。');
  const { headers, rows } = parseCSV(csv);
  const required = kind === 'sentiment' ? ['text', 'label', 'split'] : ['text', 'label', 'label_id', 'split'];
  if (required.some(key => !headers.includes(key))) throw Error('学習CSVに必要な列がありません。');
  const records = rows.map(row => {
    const get = key => row[headers.indexOf(key)];
    const code = kind === 'sentiment' ? get('label') : get('label_id');
    const label = kind === 'sentiment' ? ({ 0: '低評価', 1: '高評価' })[code] : get('label');
    if (!get('text') || !label || !/^\d+$/.test(code) || !['train', 'validation', 'test'].includes(get('split')))
      throw Error('学習CSVの文章・ラベル・splitを確認してください。');
    return { text: get('text'), code: Number(code), label, split: get('split') };
  });
  const train = records.filter(row => row.split === 'train');
  const classes = [...new Map(train.map(row => [row.code, row.label])).entries()]
    .sort((a, b) => a[0] - b[0]).map(([code, label]) => ({ code, label }));
  if (classes.length < 2 || records.some(row => !classes.some(c => c.code === row.code && c.label === row.label)))
    throw Error('学習用データのクラスが不足、またはラベルが不一致です。');
  return { records, train, classes };
}
