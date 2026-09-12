import { readDataset, datasets } from './data.js';
import { trainModel, predict, evaluate } from './model.js';

let model = null;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'train') {
      model = null;
      if (!Object.hasOwn(datasets, data.kind)) throw Error('学習データの種類が不正です。');
      const response = await fetch(new URL(`./csv/${datasets[data.kind].file}`, import.meta.url));
      if (!response.ok) throw Error(`学習CSVを読み込めませんでした（HTTP ${response.status}）。`);
      const dataset = readDataset(await response.text(), data.kind);
      model = trainModel(dataset.train, dataset.classes, progress => self.postMessage({ type: 'progress', ...progress }));
      self.postMessage({
        type: 'trained', vocabulary: model.vocabulary, classes: model.classes,
        total: dataset.records.length, trainCount: dataset.train.length,
        distribution: dataset.classes.map(c => ({ ...c, count: dataset.train.filter(row => row.code === c.code).length })),
        samples: dataset.classes.map(c => dataset.train.find(row => row.code === c.code)),
        validation: evaluate(model, dataset.records.filter(row => row.split === 'validation')),
        test: evaluate(model, dataset.records.filter(row => row.split === 'test')),
      });
    } else if (data.type === 'predict') {
      if (!model) throw Error('先にモデルを学習してください。');
      if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 2000)
        throw Error('文章を1〜2,000文字で入力してください。');
      self.postMessage({ type: 'prediction', requestId: data.requestId, text: data.text, ...predict(model, data.text) });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
