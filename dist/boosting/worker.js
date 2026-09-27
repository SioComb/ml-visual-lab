import { loadDataset, splitDataset } from './data.js';
import { trainBoosting } from './model.js';

self.onmessage = async ({ data }) => {
  try {
    const records = await loadDataset(data.kind);
    const { train, test } = splitDataset(records, data.testSize, 42);
    const result = trainBoosting(train, test, data, stage => self.postMessage({ type: 'progress', stage }));
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
