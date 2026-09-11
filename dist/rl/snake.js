import { DELTAS } from './maze.js';

export class Snake {
  constructor(rng, size = 8) {
    this.rng = rng;
    this.size = size;
    this.reset();
  }
  reset() {
    const center =
      Math.floor(this.size / 2) * this.size + Math.floor(this.size / 2);
    this.body = [center, center - 1, center - 2];
    this.direction = 3;
    this.score = 0;
    this.done = false;
    this.placeFood();
    return this.state();
  }
  placeFood() {
    const free = Array.from({ length: this.size ** 2 }, (_, i) => i).filter(
      (i) => !this.body.includes(i),
    );
    this.food = free.length ? free[Math.floor(this.rng() * free.length)] : null;
  }
  destination(action) {
    const [dx, dy] = DELTAS[action],
      head = this.body[0];
    const x = (head % this.size) + dx,
      y = Math.floor(head / this.size) + dy;
    return x < 0 || y < 0 || x >= this.size || y >= this.size
      ? -1
      : y * this.size + x;
  }
  danger(action) {
    const next = this.destination(action);
    // Moving into the vacating tail is legal unless this move grows the snake.
    return (
      next < 0 ||
      this.body.slice(0, next === this.food ? undefined : -1).includes(next)
    );
  }
  state() {
    const head = this.body[0],
      food = this.food ?? head;
    const hazards = DELTAS.reduce(
      (mask, _, a) => mask | (Number(this.danger(a)) << a),
      0,
    );
    const dx = Math.sign((food % this.size) - (head % this.size)) + 1;
    const dy =
      Math.sign(Math.floor(food / this.size) - Math.floor(head / this.size)) +
      1;
    // 16 danger masks × 9 food directions × 4 headings = at most 576 states.
    return (hazards * 9 + dy * 3 + dx) * 4 + this.direction;
  }
  step(action) {
    if (this.done) throw new Error('終了済みのEpisodeです');
    if (this.danger(action)) {
      this.done = true;
      return { reward: -10, done: true, outcome: '衝突 · Game Over' };
    }
    const next = this.destination(action),
      ate = next === this.food;
    this.direction = action;
    this.body.unshift(next);
    if (ate) {
      this.score++;
      this.placeFood();
    } else this.body.pop();
    this.done = this.food === null;
    return {
      reward: ate ? 10 : -0.1,
      done: this.done,
      outcome: this.done ? '盤面クリア' : ate ? 'Food取得 +10' : '',
    };
  }
  snapshot() {
    return {
      body: [...this.body],
      food: this.food,
      direction: this.direction,
      score: this.score,
      size: this.size,
    };
  }
}
