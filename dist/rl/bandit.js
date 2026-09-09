import { random, choose } from './random.js';

export const BANDIT_NAMES = { greedy: 'Greedy', epsilon: 'ε-Greedy', ucb: 'UCB' };
export class Bandit {
  constructor({ seed = 42, arms = 3, algorithm = 'epsilon', epsilon = 0.1 } = {}) {
    this.algorithm = algorithm;
    this.epsilon = epsilon;
    this.rng = random(seed);
    // Each arm has its own reward stream: comparisons share the same kth pull.
    this.rewards = Array.from({ length: arms }, (_, i) => random(seed + 100 + i));
    const environment = random(seed + 200);
    this.probabilities = Array.from({ length: arms }, (_, i) => 0.15 + i * 0.65 / (arms - 1));
    for (let i = arms - 1; i > 0; i--) {
      const j = Math.floor(environment() * (i + 1));
      [this.probabilities[i], this.probabilities[j]] = [this.probabilities[j], this.probabilities[i]];
    }
    this.counts = Array(arms).fill(0);
    this.q = Array(arms).fill(0);
    this.totals = Array(arms).fill(0);
    this.history = [];
    this.total = 0;
    this.last = null;
  }
  step() {
    const t = this.history.length;
    let selected;
    if (this.algorithm === 'ucb') {
      const untried = this.counts.indexOf(0);
      selected = untried >= 0 ? { action: untried, exploring: true } : choose(this.q.map((q, i) => q + Math.sqrt(2 * Math.log(t) / this.counts[i])), 0, this.rng);
      selected.reason = untried >= 0 ? '未選択アームを探索' : 'UCB · 推定価値＋不確実性ボーナス';
    } else {
      selected = choose(this.q, this.algorithm === 'greedy' ? 0 : this.epsilon, this.rng);
      selected.reason = selected.exploring ? '探索 Exploration · ランダムに選択' : '活用 Exploitation · Q値が最大のアーム';
    }
    const a = selected.action, reward = Number(this.rewards[a]() < this.probabilities[a]);
    this.counts[a]++;
    this.totals[a] += reward;
    this.q[a] += (reward - this.q[a]) / this.counts[a];
    this.total += reward;
    this.last = { ...selected, reward };
    this.history.push({ reward: this.total, average: this.total / (t + 1) });
    return this.last;
  }
}
