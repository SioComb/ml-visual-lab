import { TrainingSession } from './session.js';

let session, running = false, timer, target = 0, speed = 10;
function report() { self.postMessage({ snapshot: session.snapshot(), running }); }
function tick() {
  if (!running) return;
  try {
    const end = performance.now() + 12;
    const batch = Math.min(target, session.history.length + speed);
    do { session.step(); } while (session.history.length < batch && performance.now() < end);
    if (session.history.length >= target) running = false;
    report();
    if (running) timer = setTimeout(tick, 80);
  } catch (error) { running = false; self.postMessage({ error: error.message }); }
}
self.onmessage = ({ data }) => {
  try {
    clearTimeout(timer);
    running = false;
    if (data.type === 'init') session = new TrainingSession(data.kind, data.config);
    if (data.type === 'train') {
      target = data.episodes;
      speed = data.speed;
      running = session.history.length < target;
      if (running) { tick(); return; }
    }
    if (data.type === 'step') session.step();
    report();
  } catch (error) { self.postMessage({ error: error.message }); }
};
