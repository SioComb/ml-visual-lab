import { DELTAS } from './maze.js';
import { UNIT, project, block, stageOpen, tray, trayRims } from './diorama.js';

// Snake shares the maze's camera and white stage. Its n×n board is mapped into
// the same fixed 5-unit space (u = 5 / n per cell), so the tray, contact shadow
// and framing line up with the maze exactly. The snake itself is drawn as a lit,
// rounded tube with a domed head; the food is a small shaded apple.
const SNAKE_DEFS = `
    <linearGradient id="snake-floor-a" x2=".3" y2="1"><stop stop-color="#fbfdf6"/><stop offset="1" stop-color="#e6ecdb"/></linearGradient>
    <linearGradient id="snake-floor-b" x2=".3" y2="1"><stop stop-color="#f1f6e8"/><stop offset="1" stop-color="#dde5cf"/></linearGradient>
    <linearGradient id="snake-frame" x2=".5" y2="1"><stop stop-color="#f4f8ed"/><stop offset="1" stop-color="#adc7b9"/></linearGradient>
    <linearGradient id="snake-frame-front" x2="0" y2="1"><stop stop-color="#719a90"/><stop offset="1" stop-color="#315c59"/></linearGradient>
    <radialGradient id="snake-head" cx=".36" cy=".28" r=".82"><stop stop-color="#dcf8bf"/><stop offset=".45" stop-color="#8bd56c"/><stop offset="1" stop-color="#3b9a4f"/></radialGradient>
    <radialGradient id="snake-apple" cx=".33" cy=".26" r=".85"><stop stop-color="#ffb59c"/><stop offset=".45" stop-color="#ef5a45"/><stop offset="1" stop-color="#af2733"/></radialGradient>
    <radialGradient id="snake-leaf" cx=".3" cy=".2"><stop stop-color="#c2e59d"/><stop offset="1" stop-color="#5c9e4b"/></radialGradient>`;

const pathData = poly => poly.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');

function apple(cx, cy, u) {
  const ppu = project(cx + .5, cy, 0)[0] - project(cx - .5, cy, 0)[0];
  const r = .3 * u * ppu, rise = .3 * u;
  const [gx, gy] = project(cx, cy, .015);
  const [ax, ay] = project(cx, cy, .015 + rise);
  return `<ellipse cx="${gx}" cy="${gy}" rx="${r * 1.05}" ry="${r * .42}" fill="#243a27" opacity=".2" filter="url(#snake-soft)"/>`
    + `<circle cx="${ax}" cy="${ay}" r="${r}" fill="url(#snake-apple)"/>`
    + `<ellipse cx="${ax - r * .32}" cy="${ay - r * .38}" rx="${r * .34}" ry="${r * .24}" fill="#ffe6da" opacity=".7"/>`
    + `<path d="M${ax + r * .05} ${ay - r * .9} q ${r * .52} ${-r * .5} ${r * .98} ${-r * .1} q ${-r * .34} ${r * .44} ${-r * .98} ${r * .1} z" fill="url(#snake-leaf)" stroke="#4f8f45" stroke-width="1"/>`
    + `<path d="M${ax} ${ay - r * .84} q ${-r * .04} ${-r * .3} ${r * .12} ${-r * .52}" stroke="#7c5a3a" stroke-width="${Math.max(1.4, r * .12)}" fill="none" stroke-linecap="round"/>`;
}

function snakeHead(index, n, u, direction) {
  const cx = (index % n + .5) * u, cy = (Math.floor(index / n) + .5) * u;
  const ppu = project(cx + .5, cy, 0)[0] - project(cx - .5, cy, 0)[0];
  const r = .46 * u * ppu;
  const [hx, hy] = project(cx, cy, .12 + .12 * u);
  const [gx, gy] = project(cx, cy, .01);
  const near = project(cx, cy, .12), far = project(cx + DELTAS[direction][0] * .35, cy + DELTAS[direction][1] * .35, .12);
  let fwd = [far[0] - near[0], far[1] - near[1]];
  const len = Math.hypot(fwd[0], fwd[1]) || 1;
  fwd = [fwd[0] / len, fwd[1] / len];
  const side = [-fwd[1], fwd[0]];
  let out = `<ellipse cx="${gx}" cy="${gy}" rx="${r * 1.05}" ry="${r * .42}" fill="#1f331e" opacity=".2" filter="url(#snake-soft)"/>`
    + `<circle cx="${hx}" cy="${hy}" r="${r}" fill="url(#snake-head)"/>`
    + `<ellipse cx="${hx - r * .3}" cy="${hy - r * .4}" rx="${r * .36}" ry="${r * .26}" fill="#eaffd6" opacity=".6"/>`;
  // Eyes read best as a level pair near the top of the head, leaning the pupils
  // the way the snake is heading — the same for all four headings.
  for (const s of [1, -1]) {
    const ex = hx + s * r * .4 + fwd[0] * r * .16;
    const ey = hy - r * .3 + fwd[1] * r * .16;
    out += `<circle cx="${ex}" cy="${ey}" r="${r * .22}" fill="#fdfff5"/>`
      + `<circle cx="${ex + fwd[0] * r * .08}" cy="${ey + fwd[1] * r * .08 + r * .02}" r="${r * .11}" fill="#1b2a19"/>`;
  }
  const mx = hx + fwd[0] * r * .92, my = hy + fwd[1] * r * .92;
  const fk = [mx + fwd[0] * r * .5, my + fwd[1] * r * .5];
  out += `<path d="M${mx} ${my} L${fk[0]} ${fk[1]} M${fk[0]} ${fk[1]} L${fk[0] + fwd[0] * r * .26 + side[0] * r * .2} ${fk[1] + fwd[1] * r * .26 + side[1] * r * .2} M${fk[0]} ${fk[1]} L${fk[0] + fwd[0] * r * .26 - side[0] * r * .2} ${fk[1] + fwd[1] * r * .26 - side[1] * r * .2}" stroke="#d8434b" stroke-width="${Math.max(1.6, r * .1)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return out;
}

export function snakeDiorama(env) {
  const n = env.size, u = 5 / n, body = env.body, food = env.food;
  const centre = i => [(i % n + .5) * u, (Math.floor(i / n) + .5) * u];

  let scene = stageOpen('snake', SNAKE_DEFS);
  scene += tray('url(#snake-frame)', 'url(#snake-frame-front)');

  // Faint checkerboard floor: enough to read as a play grid, never competing
  // with the snake or the apple.
  const gap = .055 * u;
  for (let i = 0; i < n * n; i++) {
    const col = i % n, row = Math.floor(i / n);
    scene += block(col * u + gap, row * u + gap, u - 2 * gap, u - 2 * gap, -.075, .028,
      (col + row) % 2 ? 'url(#snake-floor-b)' : 'url(#snake-floor-a)', '#b7baaa', '#ced0c0', '#ffffffc0');
  }

  if (food != null) scene += apple(...centre(food), u);

  // The body: one lit tube through the segment centres. Stacked strokes fake a
  // rounded cross-section with a top highlight; a blurred copy grounds it.
  const spine = body.map(i => { const [cx, cy] = centre(i); return project(cx, cy, .12); });
  const shade = body.map(i => { const [cx, cy] = centre(i); return project(cx, cy, .005); });
  const w = .6 * u * UNIT;
  const raise = (poly, k) => poly.map(p => [p[0], p[1] - w * k]);
  scene += `<path d="${pathData(shade)}" fill="none" stroke="#1f331e" stroke-width="${w * 1.02}" stroke-linecap="round" stroke-linejoin="round" opacity=".18" filter="url(#snake-soft)" clip-path="url(#snake-stage)"/>`;
  scene += `<path d="${pathData(spine)}" fill="none" stroke="#2f6d3a" stroke-width="${w * 1.1}" stroke-linecap="round" stroke-linejoin="round"/>`;
  scene += `<path d="${pathData(spine)}" fill="none" stroke="#4ea457" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  scene += `<path d="${pathData(raise(spine, .16))}" fill="none" stroke="#84d077" stroke-width="${w * .52}" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`;
  scene += `<path d="${pathData(raise(spine, .28))}" fill="none" stroke="#e0ffce" stroke-width="${w * .18}" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>`;

  scene += snakeHead(body[0], n, u, env.direction);

  scene += trayRims('url(#snake-frame)');
  const [lx, ly] = project(2.5, 5.24, -.3);
  scene += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="13" font-weight="700" letter-spacing="2" fill="#e6f2ec">SCORE ${env.score}   ·   LEN ${body.length}</text>`;
  scene += '</svg>';
  return `<div class="rl-diorama" role="img" aria-label="立体Snake盤面。Score ${env.score}、長さ ${body.length}">${scene}</div>`;
}
