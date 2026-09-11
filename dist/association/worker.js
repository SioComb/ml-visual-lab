import { mine } from './mining.js';
self.onmessage = ({ data }) => {
  try {
    for (const algorithm of ['apriori', 'eclat', 'fpgrowth']) {
      self.postMessage({ type: 'progress', algorithm });
      const result = mine(data.transactions, { ...data.options, algorithm });
      self.postMessage({ type: 'result', result });
    }
    self.postMessage({ type: 'done' });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
