import { createSession } from './model.js';

let session = null;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      session = createSession(data.train, data.valid, data.options, data.previous);
      self.postMessage({ type: 'ready', initialScore: session.initialScore, initial: session.initial });
    } else if (data.type === 'step') {
      if (!session) throw Error('学習セッションがありません。');
      self.postMessage({ type: 'stage', stage: session.step() });
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
