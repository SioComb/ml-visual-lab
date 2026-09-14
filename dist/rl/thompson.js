import { random } from './random.js';

export const AD_LABELS = ['A', 'B', 'C', 'D', 'E'];

export const THOMPSON_SCENARIOS = {
  wide: {
    name: '差が大きい',
    probabilities: [0.05, 0.1, 0.25, 0.15, 0.08],
  },
  close: {
    name: '僅差',
    probabilities: [0.1, 0.11, 0.12, 0.11, 0.1],
  },
  equal: {
    name: '全広告が同じ',
    probabilities: [0.1, 0.1, 0.1, 0.1, 0.1],
  },
};

function assertInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new RangeError(`${label}は${min}〜${max}の整数で指定してください。`);
}

export function validateThompsonConfig({
  arms,
  probabilities,
  seed = 42,
  limit = 1000,
}) {
  assertInteger(arms, 3, 5, '広告数');
  assertInteger(seed, 0, 4294967295, 'Random Seed');
  assertInteger(limit, 1, 10000, '試行上限');
  if (!Array.isArray(probabilities) || probabilities.length !== arms)
    throw new RangeError('真のCTRは広告数と同じ個数を指定してください。');
  for (const probability of probabilities)
    if (!Number.isFinite(probability) || probability < 0 || probability > 1)
      throw new RangeError('真のCTRは0〜100%で指定してください。');
  return { arms, probabilities: [...probabilities], seed, limit };
}

// Convert the seeded generator's [0, 1) output to an open interval before
// taking logarithms. This also makes the finite-number guarantee explicit.
function openUnit(rng) {
  const value = rng();
  if (!Number.isFinite(value)) throw new Error('乱数が有限数ではありません。');
  return Math.min(1 - Number.EPSILON, Math.max(Number.MIN_VALUE, value));
}

function standardNormal(rng) {
  const radius = Math.sqrt(-2 * Math.log(openUnit(rng)));
  return radius * Math.cos(2 * Math.PI * openUnit(rng));
}

// Marsaglia & Tsang (2000), "A Simple Method for Generating Gamma Variables".
// Thompson Sampling only needs alpha/beta >= 1, so the shape < 1 extension is
// intentionally omitted.
export function sampleGamma(shape, rng) {
  if (!Number.isFinite(shape) || shape < 1)
    throw new RangeError('Gamma分布のshapeは1以上で指定してください。');
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let attempt = 0; attempt < 10000; attempt++) {
    const x = standardNormal(rng);
    let v = 1 + c * x;
    if (v <= 0) continue;
    v *= v * v;
    const u = openUnit(rng);
    if (
      u < 1 - 0.0331 * x ** 4 ||
      Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))
    ) {
      const result = d * v;
      if (Number.isFinite(result) && result >= 0) return result;
    }
  }
  throw new Error('Gamma乱数の生成が収束しませんでした。');
}

export function sampleBeta(alpha, beta, rng) {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  const total = x + y;
  const value = x / total;
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error('Beta乱数の生成に失敗しました。');
  return value;
}

// Lanczos approximation. Density evaluation is kept separate from sampling so
// drawing never consumes the learner's random stream.
export function logGamma(value) {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError('logGammaの引数は正の有限数で指定してください。');
  const coefficients = [
    0.9999999999998099, 676.5203681218851, -1259.1392167224028,
    771.3234287776531, -176.6150291621406, 12.5073432786869,
    -0.1385710952657201, 9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (value < 0.5)
    return (
      Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * value)) -
      logGamma(1 - value)
    );
  const z = value - 1;
  let sum = coefficients[0];
  for (let i = 1; i < coefficients.length; i++)
    sum += coefficients[i] / (z + i);
  const t = z + coefficients.length - 1.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum)
  );
}

export function betaDensity(x, alpha, beta) {
  if (!Number.isFinite(x) || x < 0 || x > 1)
    throw new RangeError('Beta密度のxは0〜1で指定してください。');
  if (alpha < 1 || beta < 1 || !Number.isFinite(alpha + beta))
    throw new RangeError('Beta密度のαとβは1以上で指定してください。');
  const logNormalizer =
    logGamma(alpha + beta) - logGamma(alpha) - logGamma(beta);
  if (x === 0) return alpha === 1 ? Math.exp(logNormalizer) : 0;
  if (x === 1) return beta === 1 ? Math.exp(logNormalizer) : 0;
  const value = Math.exp(
    logNormalizer + (alpha - 1) * Math.log(x) + (beta - 1) * Math.log1p(-x),
  );
  return Number.isFinite(value) ? value : 0;
}

export function betaCurve(alpha, beta) {
  const points = new Set(Array.from({ length: 101 }, (_, i) => i / 100));
  const total = alpha + beta;
  const mean = alpha / total;
  const mode = alpha > 1 && beta > 1 ? (alpha - 1) / (total - 2) : mean;
  const deviation = Math.sqrt((alpha * beta) / (total * total * (total + 1)));
  points.add(mean);
  points.add(mode);
  for (let step = -16; step <= 16; step++) {
    const x = mode + (step / 4) * deviation;
    if (x > 0 && x < 1) points.add(x);
  }
  return [...points]
    .sort((a, b) => a - b)
    .map((x) => ({ x, y: betaDensity(x, alpha, beta) }));
}

export class ThompsonExperiment {
  constructor(options = {}) {
    const arms = options.arms ?? 4;
    const config = validateThompsonConfig({
      arms,
      probabilities:
        options.probabilities ??
        THOMPSON_SCENARIOS.wide.probabilities.slice(0, arms),
      seed: options.seed ?? 42,
      limit: options.limit ?? 1000,
    });
    Object.assign(this, config);
    this.actionRng = random(this.seed + 3000);
    this.rewardRngs = Array.from({ length: this.arms }, (_, index) =>
      random(this.seed + 4000 + index),
    );
    this.alpha = Array(this.arms).fill(1);
    this.beta = Array(this.arms).fill(1);
    this.counts = Array(this.arms).fill(0);
    this.clicks = Array(this.arms).fill(0);
    this.trials = 0;
    this.totalClicks = 0;
    this.regret = 0;
    this.optimalSelections = 0;
    this.history = [];
    this.lastTrial = null;
  }

  step() {
    if (this.trials >= this.limit) return null;
    const beforeAlpha = [...this.alpha];
    const beforeBeta = [...this.beta];
    const samples = this.alpha.map((alpha, index) =>
      sampleBeta(alpha, this.beta[index], this.actionRng),
    );
    const highest = Math.max(...samples);
    const tied = samples.flatMap((sample, index) =>
      sample === highest ? [index] : [],
    );
    const selectedIndex =
      tied.length === 1
        ? tied[0]
        : tied[Math.floor(this.actionRng() * tied.length)];
    const reward = Number(
      this.rewardRngs[selectedIndex]() < this.probabilities[selectedIndex],
    );
    this.counts[selectedIndex]++;
    this.clicks[selectedIndex] += reward;
    this.alpha[selectedIndex] += reward;
    this.beta[selectedIndex] += 1 - reward;
    this.trials++;
    this.totalClicks += reward;
    const bestProbability = Math.max(...this.probabilities);
    this.regret += bestProbability - this.probabilities[selectedIndex];
    if (this.probabilities[selectedIndex] === bestProbability)
      this.optimalSelections++;
    this.lastTrial = {
      trial: this.trials,
      beforeAlpha,
      beforeBeta,
      samples,
      selectedIndex,
      reward,
      selectedPosteriorAfter: {
        alpha: this.alpha[selectedIndex],
        beta: this.beta[selectedIndex],
      },
    };
    this.history.push({
      trial: this.trials,
      selectedIndex,
      clicks: this.totalClicks,
      regret: this.regret,
      ctr: this.totalClicks / this.trials,
      optimalRate: this.optimalSelections / this.trials,
    });
    this.assertInvariants();
    return this.lastTrial;
  }

  run(count) {
    assertInteger(count, 0, 10000, '実行回数');
    const target = Math.min(this.limit, this.trials + count);
    while (this.trials < target) this.step();
    return target;
  }

  assertInvariants() {
    const countTotal = this.counts.reduce((sum, value) => sum + value, 0);
    const clickTotal = this.clicks.reduce((sum, value) => sum + value, 0);
    if (countTotal !== this.trials || clickTotal !== this.totalClicks)
      throw new Error('Thompson Samplingの集計値が一致しません。');
    for (let i = 0; i < this.arms; i++)
      if (
        this.alpha[i] !== 1 + this.clicks[i] ||
        this.beta[i] !== 1 + this.counts[i] - this.clicks[i]
      )
        throw new Error('Beta分布の更新値が一致しません。');
    if (this.totalClicks < 0 || this.totalClicks > this.trials)
      throw new Error('クリック数が試行数の範囲外です。');
    return true;
  }
}
