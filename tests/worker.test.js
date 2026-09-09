import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

// Browser worker adapter: executes the production message handler and timers.
test('RL Worker trains, pauses without losing progress, resumes, and resets', async () => {
  const url = new URL('../dist/rl/worker.js', import.meta.url).href;
  const worker = new Worker(`const {parentPort}=require('node:worker_threads');global.self={postMessage:data=>parentPort.postMessage(data)};import(${JSON.stringify(url)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({ready:true})});`, { eval: true });
  const queue = [], waiting = [];
  worker.on('message', data => waiting.length ? waiting.shift()(data) : queue.push(data));
  const next = () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiting.push(resolve));
  try {
    assert.equal((await next()).ready, true);
    const config = { seed: 42, alpha: 0.3, gamma: 0.95, epsilon: 0.2, maxSteps: 200, preset: 'basic' };
    worker.postMessage({ type: 'init', kind: 'maze', config });
    assert.equal((await next()).snapshot.history.length, 0);
    worker.postMessage({ type: 'train', episodes: 100, speed: 1 });
    assert.equal((await next()).running, true);
    worker.postMessage({ type: 'pause' });
    let paused;
    do { paused = await next(); } while (paused.running);
    const completed = paused.snapshot.history.length;
    assert.ok(completed > 0 && completed < 100);
    worker.postMessage({ type: 'train', episodes: 100, speed: 50 });
    let done;
    do { done = await next(); } while (done.running);
    assert.equal(done.snapshot.history.length, 100);
    worker.postMessage({ type: 'init', kind: 'snake', config });
    const reset = await next();
    assert.deepEqual(reset.snapshot.table, {});
    assert.equal(reset.snapshot.history.length, 0);
    worker.postMessage({ type: 'step' });
    assert.equal((await next()).snapshot.steps, 1);
  } finally { await worker.terminate(); }
});
