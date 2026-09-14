import test from 'node:test';
import assert from 'node:assert/strict';
import { random } from '../dist/rl/random.js';
import {
  ThompsonExperiment,
  betaCurve,
  betaDensity,
  sampleBeta,
  validateThompsonConfig,
} from '../dist/rl/thompson.js';

const wide = [0.05, 0.1, 0.25, 0.15, 0.08];

test('Thompson config accepts 3-5 ads and rejects invalid inputs', () => {
  for (const arms of [3, 4, 5]) {
    const config = validateThompsonConfig({
      arms,
      probabilities: wide.slice(0, arms),
      seed: 42,
      limit: 1000,
    });
    assert.equal(config.probabilities.length, arms);
  }
  for (const arms of [2, 6, 3.5, NaN])
    assert.throws(() =>
      validateThompsonConfig({ arms, probabilities: [], seed: 42, limit: 1 }),
    );
  assert.throws(() =>
    validateThompsonConfig({
      arms: 3,
      probabilities: [0, 0.5, NaN],
      seed: 42,
      limit: 1,
    }),
  );
});

test('initial state is Beta(1,1) with no impressions or clicks', () => {
  const experiment = new ThompsonExperiment();
  assert.deepEqual(experiment.alpha, [1, 1, 1, 1]);
  assert.deepEqual(experiment.beta, [1, 1, 1, 1]);
  assert.deepEqual(experiment.counts, [0, 0, 0, 0]);
  assert.deepEqual(experiment.clicks, [0, 0, 0, 0]);
  assert.equal(experiment.trials, 0);
});

test('each trial selects the maximum saved sample and updates one posterior', () => {
  const experiment = new ThompsonExperiment({ probabilities: [0, 0, 0, 0] });
  for (let trial = 0; trial < 100; trial++) {
    const beforeAlpha = [...experiment.alpha];
    const beforeBeta = [...experiment.beta];
    const result = experiment.step();
    assert.equal(
      result.samples[result.selectedIndex],
      Math.max(...result.samples),
    );
    for (let index = 0; index < experiment.arms; index++) {
      assert.equal(experiment.alpha[index], beforeAlpha[index]);
      assert.equal(
        experiment.beta[index],
        beforeBeta[index] + Number(index === result.selectedIndex),
      );
    }
    assert.ok(
      result.samples.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    );
  }
  assert.equal(experiment.totalClicks, 0);
  assert.equal(experiment.assertInvariants(), true);
});

test('0% never clicks, 100% always clicks, and equal CTR has zero regret', () => {
  const zero = new ThompsonExperiment({
    probabilities: [0, 0, 0, 0],
    limit: 200,
  });
  zero.run(200);
  assert.equal(zero.totalClicks, 0);
  assert.equal(zero.regret, 0);
  assert.equal(zero.optimalSelections, 200);

  const one = new ThompsonExperiment({
    probabilities: [1, 1, 1, 1],
    limit: 200,
  });
  one.run(200);
  assert.equal(one.totalClicks, 200);
  assert.equal(one.regret, 0);
  assert.equal(one.optimalSelections, 200);
});

test('true CTR does not affect the first Thompson action', () => {
  const low = new ThompsonExperiment({ probabilities: [0, 0, 0, 0], seed: 17 });
  const high = new ThompsonExperiment({
    probabilities: [1, 0.2, 0.7, 0.4],
    seed: 17,
  });
  assert.equal(low.step().selectedIndex, high.step().selectedIndex);
  assert.deepEqual(low.lastTrial.samples, high.lastTrial.samples);
});

test('same seed and settings are reproducible across execution batching', () => {
  const options = {
    probabilities: wide.slice(0, 4),
    seed: 4294967295,
    limit: 1000,
  };
  const single = new ThompsonExperiment(options);
  const batches = new ThompsonExperiment(options);
  for (let i = 0; i < 1000; i++) single.step();
  for (let i = 0; i < 10; i++) batches.run(100);
  assert.deepEqual(batches.history, single.history);
  assert.deepEqual(batches.alpha, single.alpha);
  assert.deepEqual(batches.beta, single.beta);
  assert.deepEqual(batches.lastTrial, single.lastTrial);
});

test('run respects the configured limit and remains finite at 10,000 trials', () => {
  const experiment = new ThompsonExperiment({
    arms: 5,
    probabilities: wide,
    limit: 10000,
  });
  experiment.run(10000);
  assert.equal(experiment.trials, 10000);
  assert.equal(experiment.step(), null);
  assert.ok([...experiment.alpha, ...experiment.beta].every(Number.isFinite));
  assert.equal(experiment.assertInvariants(), true);
});

test('Beta density matches known distributions and preserves sharp peaks', () => {
  for (const x of [0, 0.25, 0.5, 0.75, 1])
    assert.ok(Math.abs(betaDensity(x, 1, 1) - 1) < 1e-12);
  assert.ok(Math.abs(betaDensity(0.25, 2, 1) - 0.5) < 1e-12);
  assert.ok(Math.abs(betaDensity(0.25, 1, 2) - 1.5) < 1e-12);
  const sharp = betaCurve(2501, 7501);
  assert.ok(sharp.length > 101);
  assert.ok(Math.max(...sharp.map((point) => point.y)) > 50);
});

test('seeded Beta samples have plausible theoretical mean and variance', () => {
  const rng = random(1234);
  const samples = Array.from({ length: 40000 }, () => sampleBeta(2, 5, rng));
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance =
    samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    samples.length;
  assert.ok(Math.abs(mean - 2 / 7) < 0.006);
  assert.ok(Math.abs(variance - 10 / (49 * 8)) < 0.002);
});
