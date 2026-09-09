import test from 'node:test';
import assert from 'node:assert/strict';
import { Bandit } from '../dist/rl/bandit.js';
import { QLearner } from '../dist/rl/qlearning.js';
import { Maze, MAZES, generateMaze } from '../dist/rl/maze.js';
import { Snake } from '../dist/rl/snake.js';
import { TrainingSession, environment } from '../dist/rl/session.js';
import { random, choose } from '../dist/rl/random.js';

const config = { seed: 42, alpha: 0.3, gamma: 0.95, epsilon: 0.2, maxSteps: 200, preset: 'basic' };
function train(session, episodes) { while (session.history.length < episodes) session.step(); return session; }

for (const algorithm of ['greedy', 'epsilon', 'ucb']) test(`Bandit ${algorithm}: rewards, values and seeded repeatability`, () => {
  const a = new Bandit({ algorithm }), b = new Bandit({ algorithm });
  for (let i = 0; i < 500; i++) { a.step(); b.step(); }
  assert.deepEqual(a.history, b.history);
  assert.equal(a.counts.reduce((x, y) => x + y), 500);
  assert.equal(a.totals.reduce((x, y) => x + y), a.total);
  a.q.forEach((q, i) => assert.ok(Math.abs(q - (a.counts[i] ? a.totals[i] / a.counts[i] : 0)) < 1e-12));
  if (algorithm === 'ucb') assert.ok(a.counts.every(n => n > 0));
});
test('Exploration rate 0 versus 1 changes action selection', () => {
  const rng = random(1);
  for (let i = 0; i < 100; i++) assert.deepEqual(choose([0, 10, 0, 0], 0, rng), { action: 1, exploring: false });
  const choices = Array.from({ length: 100 }, () => choose([0, 10, 0, 0], 1, rng));
  assert.ok(choices.every(c => c.exploring));
  assert.equal(new Set(choices.map(c => c.action)).size, 4);
});
test('Q-learning update and terminal reward do not bootstrap', () => {
  const learner = new QLearner(0.5, 0.9);
  learner.table.next = [10, 0, 0, 0];
  learner.update({ state: 'start', action: 0, reward: 1, nextState: 'next', done: false });
  assert.equal(learner.values('start')[0], 5);
  learner.update({ state: 'start', action: 1, reward: -10, nextState: 'next', done: true });
  assert.equal(learner.values('start')[1], -5);
});
for (const preset of Object.keys(MAZES)) test(`Maze ${preset}: learned greedy policy reaches Goal and preserves Q-table`, () => {
  const session = train(new TrainingSession('maze', { ...config, preset }), 500);
  assert.ok(Object.values(session.learner.table).some(row => row.some(v => v !== 0)));
  const before = JSON.stringify(session.learner.table), env = new Maze(preset), rng = random(2042);
  let result;
  for (let i = 0; i < 100; i++) {
    result = env.step(session.learner.select(env.state(), 0, rng).action);
    if (result.done) break;
  }
  assert.equal(result.outcome, 'Goal到達');
  assert.equal(JSON.stringify(session.learner.table), before);
});
test('Maze boundaries, walls, trap terminal and reset', () => {
  const env = new Maze();
  env.step(0); assert.equal(env.state(), 0);
  env.step(3); env.step(1); assert.equal(env.state(), 1);
  env.position = 11;
  assert.deepEqual(env.step(3), { reward: -10, done: true, outcome: 'Trapに到達' });
  env.reset(); assert.equal(env.state(), 0); assert.equal(env.done, false);
});
test('Random mazes preserve endpoints and have a safe route across 500 seeds', () => {
  const layouts = new Set();
  for (let seed = 0; seed < 500; seed++) {
    const env = new Maze('random', seed), cells = env.cells;
    assert.equal(cells.length, 25);
    assert.equal(cells[0], 'S'); assert.equal(cells[24], 'G');
    assert.equal([...cells].filter(c => c === 'S').length, 1);
    assert.equal([...cells].filter(c => c === 'G').length, 1);
    assert.match(cells, /^[S.G#T]+$/);
    assert.ok(cells.includes('#'));
    assert.equal(cells, generateMaze(seed));
    layouts.add(cells);
    // Traverse through the actual environment transition function, excluding
    // terminal traps. This checks both generation and playable movement.
    const reached = new Set([0]), pending = [0];
    while (pending.length) {
      const state = pending.shift();
      for (let action = 0; action < 4; action++) {
        env.position = state; env.done = false;
        const result = env.step(action), next = env.state();
        if (result.reward === -10 || reached.has(next)) continue;
        reached.add(next);
        if (!result.done) pending.push(next);
      }
    }
    assert.ok(reached.has(24), `Seed ${seed} should reach Goal without traps`);
  }
  assert.ok(layouts.size > 450);
});
test('Random maze persists across episodes, parameter changes, reset and evaluation', () => {
  const cfg = { ...config, preset: 'random', seed: 43 };
  const session = train(new TrainingSession('maze', cfg), 25), cells = session.env.cells;
  session.env.reset(); assert.equal(session.env.cells, cells);
  const reset = new TrainingSession('maze', { ...cfg, alpha: .5 });
  assert.equal(reset.env.cells, cells); assert.deepEqual(reset.learner.table, {});
  assert.equal(environment('maze', cfg, random(999)).cells, cells);
  assert.notEqual(new Maze('random', 44).cells, cells);
});
test('Random maze learned policy reaches Goal for representative seeds', () => {
  for (const seed of [0, 42, 43, 44, 100, 4294967295]) {
    const cfg = { ...config, preset: 'random', seed };
    const session = train(new TrainingSession('maze', cfg), 500);
    const env = environment('maze', cfg, random(seed + 1000)), rng = random(seed + 2000);
    let result;
    for (let step = 0; step < cfg.maxSteps; step++) {
      result = env.step(session.learner.select(env.state(), 0, rng).action);
      if (result.done) break;
    }
    assert.equal(result.outcome, 'Goal到達', `Seed ${seed}`);
  }
});
test('Training reset clears Q-table, metrics and random streams', () => {
  const first = train(new TrainingSession('maze', config), 20);
  const reset = new TrainingSession('maze', config);
  assert.deepEqual(reset.learner.table, {}); assert.equal(reset.history.length, 0);
  train(reset, 20); assert.deepEqual(reset.snapshot(), first.snapshot());
});
test('Snake food grows body and places new food in free space', () => {
  const env = new Snake(random(42));
  env.food = env.body[0] + 1;
  const result = env.step(3);
  assert.equal(result.reward, 10); assert.equal(env.score, 1); assert.equal(env.body.length, 4);
  assert.ok(!env.body.includes(env.food));
});
test('Snake wall and body collisions terminate, reset starts a new game', () => {
  const env = new Snake(random(42));
  assert.equal(env.step(2).done, true);
  env.reset(); assert.equal(env.body.length, 3); assert.equal(env.score, 0); assert.equal(env.done, false);
  env.body = [0, 1, 2];
  assert.equal(env.step(0).reward, -10); assert.equal(env.done, true);
});
test('Snake vacating tail is legal, full board terminates without food loop', () => {
  const env = new Snake(random(42), 4);
  env.body = [5, 6, 10, 9]; env.food = 15;
  assert.equal(env.step(1).done, false); assert.deepEqual(env.body, [9, 5, 6, 10]);
  env.body = [0, 4, 8, 12, 13, 9, 5, 6, 10, 14, 15, 11, 7, 3, 2]; env.food = 1;
  assert.equal(env.step(3).outcome, '盤面クリア'); assert.equal(env.food, null);
});
test('Snake training updates finite values, ends bounded episodes and is reproducible', () => {
  const cfg = { ...config, maxSteps: 300 };
  const a = train(new TrainingSession('snake', cfg), 2000);
  const b = train(new TrainingSession('snake', cfg), 2000);
  assert.deepEqual(a.history, b.history);
  assert.ok(a.history.some(h => h.score > 0));
  assert.ok(a.history.every(h => h.steps <= 300));
  assert.ok(Object.keys(a.learner.table).length <= 576);
  assert.ok(Object.values(a.learner.table).flat().every(Number.isFinite));
});
