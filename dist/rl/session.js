import { random } from './random.js';
import { Maze } from './maze.js';
import { Snake } from './snake.js';
import { QLearner } from './qlearning.js';

export function environment(kind, config, rng) {
  return kind === 'maze'
    ? new Maze(config.preset, config.seed)
    : new Snake(rng);
}
export class TrainingSession {
  constructor(kind, config) {
    this.config = config;
    this.rng = random(config.seed);
    this.env = environment(kind, config, random(config.seed + 1));
    this.learner = new QLearner(config.alpha, config.gamma);
    this.history = [];
    this.steps = 0;
    this.reward = 0;
    this.last = null;
    this.finished = false;
  }
  step() {
    if (this.finished) {
      this.env.reset();
      this.steps = 0;
      this.reward = 0;
      this.finished = false;
    }
    const state = this.env.state();
    const selected = this.learner.select(state, this.config.epsilon, this.rng);
    const transition = this.env.step(selected.action);
    this.steps++;
    this.reward += transition.reward;
    // The step cap is an episode time limit, not an absorbing terminal state.
    const update = this.learner.update({
      state,
      action: selected.action,
      ...transition,
      nextState: this.env.state(),
    });
    this.last = { ...selected, ...transition, ...update };
    if (transition.done || this.steps >= this.config.maxSteps) {
      this.finished = true;
      this.history.push({
        reward: this.reward,
        steps: this.steps,
        score: this.env.score ?? 0,
        outcome: transition.done ? transition.outcome : 'step上限',
      });
    }
  }
  snapshot() {
    return {
      table: this.learner.table,
      history: this.history,
      env: this.env.snapshot(),
      steps: this.steps,
      reward: this.reward,
      last: this.last,
      finished: this.finished,
    };
  }
}
