import { choose } from './random.js';

// Learner interface: values(state), select(state, epsilon, rng), update(transition).
// An approximator such as DQN can implement the same interface independently.
export class QLearner {
  constructor(alpha = 0.3, gamma = 0.95, actions = 4) {
    this.alpha = alpha;
    this.gamma = gamma;
    this.actions = actions;
    this.table = {};
  }
  values(state) {
    return this.table[state] ?? Array(this.actions).fill(0);
  }
  select(state, epsilon, rng) {
    return choose(this.values(state), epsilon, rng);
  }
  update({ state, action, reward, nextState, done }) {
    const values = (this.table[state] ??= Array(this.actions).fill(0));
    const before = values[action];
    const target =
      reward + (done ? 0 : this.gamma * Math.max(...this.values(nextState)));
    values[action] += this.alpha * (target - before);
    return { state, action, reward, before, target, after: values[action] };
  }
}
