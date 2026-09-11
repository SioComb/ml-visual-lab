import { random } from './random.js';

export const DIRECTIONS = ['↑', '↓', '←', '→'];
export const DELTAS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
export const MAZES = {
  basic: {
    name: 'はじめの迷路',
    cells: ['S..#.', '.#...', '..T..', '.#.#.', '....G'],
  },
  detour: {
    name: '遠回りの道',
    cells: ['S#...', '.#.#.', '...#.', '.TT#.', '....G'],
  },
  traps: {
    name: '罠のある近道',
    cells: ['S....', '.TTT.', '...T.', '.T...', '...#G'],
  },
};

function canReachGoal(cells) {
  const pending = [0],
    visited = new Set(pending);
  for (let head = 0; head < pending.length; head++) {
    const state = pending[head];
    if (state === 24) return true;
    for (const [dx, dy] of DELTAS) {
      const x = (state % 5) + dx,
        y = Math.floor(state / 5) + dy,
        next = y * 5 + x;
      if (
        x < 0 ||
        x >= 5 ||
        y < 0 ||
        y >= 5 ||
        visited.has(next) ||
        '#T'.includes(cells[next])
      )
        continue;
      visited.add(next);
      pending.push(next);
    }
  }
  return false;
}

// Generate independently of action/reward RNG so training and evaluation
// always reconstruct the same maze. Reject unreachable layouts with a bound.
export function generateMaze(seed = 42) {
  const rng = random(seed);
  let cells;
  for (let attempt = 0; attempt < 32; attempt++) {
    cells = Array(25).fill('.');
    cells[0] = 'S';
    cells[24] = 'G';
    const candidates = Array.from({ length: 23 }, (_, i) => i + 1);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const walls = 4 + Math.floor(rng() * 4);
    candidates.slice(0, walls).forEach((i) => {
      cells[i] = '#';
    });
    candidates.slice(walls, walls + 2).forEach((i) => {
      cells[i] = 'T';
    });
    if (canReachGoal(cells)) return cells.join('');
  }
  // A bounded fallback carves a safe path instead of retrying indefinitely.
  let x = 0,
    y = 0;
  while (x < 4 || y < 4) {
    if (x < 4 && (y === 4 || rng() < 0.5)) x++;
    else y++;
    if (x !== 4 || y !== 4) cells[y * 5 + x] = '.';
  }
  return cells.join('');
}
export class Maze {
  constructor(preset = 'basic', seed = 42) {
    this.cells =
      preset === 'random' ? generateMaze(seed) : MAZES[preset].cells.join('');
    this.size = 5;
    this.reset();
  }
  reset() {
    this.position = this.cells.indexOf('S');
    this.done = false;
    return this.state();
  }
  state() {
    return this.position;
  }
  step(action) {
    if (this.done) throw new Error('終了済みのEpisodeです');
    const [dx, dy] = DELTAS[action];
    const x = (this.position % 5) + dx,
      y = Math.floor(this.position / 5) + dy;
    const next = y * 5 + x;
    if (x >= 0 && x < 5 && y >= 0 && y < 5 && this.cells[next] !== '#')
      this.position = next;
    const cell = this.cells[this.position];
    this.done = cell === 'G' || cell === 'T';
    return {
      reward: cell === 'G' ? 10 : cell === 'T' ? -10 : -0.1,
      done: this.done,
      outcome: cell === 'G' ? 'Goal到達' : cell === 'T' ? 'Trapに到達' : '',
    };
  }
  snapshot() {
    return { position: this.position, cells: this.cells, size: this.size };
  }
}
