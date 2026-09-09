import { bestActions } from './random.js';
import { DIRECTIONS } from './maze.js';

// A small perspective renderer, independent of the learning environment.
// x/y are grid coordinates; z is height above the floor. The camera looks
// down from the front of the board. Native buttons share this projection.
export const WIDTH = 700, HEIGHT = 570, TOP = 55;
export function project(x, y, z = 0) {
  const depth = 14 - (y - 2.5) * 0.572 - z * 0.820;
  return [350 + (x - 2.5) * 1330 / depth, 310 + ((y - 2.5) * 0.820 - z * 0.572) * 1330 / depth];
}
const points = vertices => vertices.map(p => p.map(v => v.toFixed(2)).join(',')).join(' ');
const face = (vertices, fill, extra = '') => `<polygon points="${points(vertices)}" fill="${fill}" ${extra}/>`;
function roundedFace(vertices, fill, extra = '') {
  const ends = vertices.map((p, i) => {
    const before = vertices[(i + vertices.length - 1) % vertices.length], after = vertices[(i + 1) % vertices.length];
    const toward = target => {
      const length = Math.hypot(target[0] - p[0], target[1] - p[1]);
      const ratio = Math.min(4 / length, .15);
      return [p[0] + (target[0] - p[0]) * ratio, p[1] + (target[1] - p[1]) * ratio];
    };
    return { p, from: toward(before), to: toward(after) };
  });
  return `<path d="${ends.map((e, i) => `${i ? 'L' : 'M'}${e.from.join(',')} Q${e.p.join(',')} ${e.to.join(',')}`).join(' ')}Z" fill="${fill}" ${extra}/>`;
}
function corners(x, y, width, length, z) {
  return [[x, y], [x + width, y], [x + width, y + length], [x, y + length]].map(([a, b]) => project(a, b, z));
}
function block(x, y, width, length, bottom, top, surface, front, side, bevel = '#ffffff70') {
  const b = corners(x, y, width, length, bottom), t = corners(x, y, width, length, top);
  return face([t[0], t[3], b[3], b[0]], side) + face([t[1], t[2], b[2], b[1]], side) + face([t[3], t[2], b[2], b[3]], front) + roundedFace(t, surface, `stroke="${bevel}" stroke-width="1.4" stroke-linejoin="round"`);
}
function groundText(x, y, text, extra = '') {
  const p = project(x, y, 0.13);
  return `<text x="${p[0]}" y="${p[1]}" text-anchor="middle" ${extra}>${text}</text>`;
}
function star(cx, cy, radius) {
  return Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? radius * 0.48 : radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
}
export function mazeDiorama(env, table, selected, policy) {
  let scene = `<svg class="rl-diorama-scene" viewBox="0 ${TOP} ${WIDTH} ${HEIGHT}" aria-hidden="true"><defs>
    <linearGradient id="maze-floor" x2=".3" y2="1"><stop stop-color="#fffdf4"/><stop offset="1" stop-color="#e7e3d6"/></linearGradient>
    <linearGradient id="maze-wall" x2=".8" y2="1"><stop stop-color="#7c959b"/><stop offset="1" stop-color="#4e6872"/></linearGradient>
    <linearGradient id="maze-wall-front" x2="0" y2="1"><stop stop-color="#3e5860"/><stop offset="1" stop-color="#263f46"/></linearGradient>
    <linearGradient id="maze-frame" x2=".5" y2="1"><stop stop-color="#f4f8ed"/><stop offset="1" stop-color="#adc7b9"/></linearGradient>
    <linearGradient id="maze-frame-front" x2="0" y2="1"><stop stop-color="#719a90"/><stop offset="1" stop-color="#315c59"/></linearGradient>
    <linearGradient id="maze-ceramic" x2=".85" y2="1"><stop stop-color="#ffffff"/><stop offset=".5" stop-color="#ecf4ec"/><stop offset="1" stop-color="#9fbcb6"/></linearGradient>
    <linearGradient id="maze-screen" x2=".5" y2="1"><stop stop-color="#275769"/><stop offset="1" stop-color="#082b3d"/></linearGradient>
    <radialGradient id="maze-blue" cx=".3" cy=".2"><stop stop-color="#c7fbff"/><stop offset=".4" stop-color="#6acfe8"/><stop offset="1" stop-color="#328faf"/></radialGradient>
    <linearGradient id="maze-gold" x2=".5" y2="1"><stop stop-color="#fff3a2"/><stop offset=".5" stop-color="#ffd35c"/><stop offset="1" stop-color="#e4a627"/></linearGradient>
    <linearGradient id="maze-trap" x2=".2" y2="1"><stop stop-color="#ffb6a2"/><stop offset="1" stop-color="#e06b5d"/></linearGradient>
    <filter id="maze-soft" x="-50%" y="-80%" width="200%" height="260%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="maze-cast" x="-45%" y="-70%" width="190%" height="260%"><feGaussianBlur stdDeviation="9"/></filter>
    <clipPath id="maze-stage"><rect x="0" y="${TOP}" width="${WIDTH}" height="${HEIGHT}"/></clipPath>
  </defs>
  <rect x="0" y="${TOP}" width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
  <g clip-path="url(#maze-stage)">
    <ellipse cx="352" cy="558" rx="286" ry="34" fill="#33505a" opacity=".16" filter="url(#maze-cast)"/>
    <ellipse cx="352" cy="565" rx="220" ry="16" fill="#2b424b" opacity=".13" filter="url(#maze-soft)"/>
  </g>`;
  scene += block(-.23, -.23, 5.46, 5.46, -.56, -.08, '#9daf9e', 'url(#maze-frame-front)', '#577f73');
  // Rim strips are actual raised prisms rather than a CSS shadow around a grid.
  scene += block(-.23, -.23, 5.46, .18, -.08, .19, 'url(#maze-frame)', '#81988a', '#779386');
  const buttons = [];
  for (let i = 0; i < env.cells.length; i++) {
    const cell = env.cells[i], x = i % 5, y = Math.floor(i / 5), agent = env.position === i;
    const label = { S: 'Start', G: 'Goal', T: 'Trap', '#': 'Wall', '.': '' }[cell];
    const stateClass = `${cell === '#' ? 'wall' : cell === 'G' ? 'goal' : cell === 'T' ? 'trap' : ''} ${i === selected ? 'selected' : ''}`;
    scene += `<g class="rl-diorama-tile ${stateClass}">`;
    scene += block(x + .025, y + .025, .95, .95, -.075, .035, 'url(#maze-floor)', '#b7baaa', '#ced0c0', '#ffffffc0');
    if (cell === '#') {
      scene += face(corners(x + .14, y + .20, .87, .92, .04), '#314d4650');
      scene += block(x + .09, y + .09, .82, .82, .045, .66, 'url(#maze-wall)', 'url(#maze-wall-front)', '#364f57', '#a5b6b780');
    } else {
      if (cell === 'G' || cell === 'T') {
        scene += block(x + .07, y + .07, .86, .86, .04, .18, cell === 'G' ? 'url(#maze-gold)' : 'url(#maze-trap)', cell === 'G' ? '#a0a842' : '#b44c43', cell === 'G' ? '#d7b64b' : '#d27b64');
      }
      const outline = corners(x + .055, y + .055, .89, .89, .20);
      scene += face(outline, agent ? '#b3e5fa75' : 'none', `class="rl-diorama-selection ${i === selected ? 'is-selected' : ''}" stroke="${agent ? '#75bfdf' : '#258570'}" stroke-width="${i === selected || agent ? 3 : 0}"`);
      if (policy && !['G', 'T'].includes(cell)) {
        const arrows = bestActions(table[i] ?? [0, 0, 0, 0]).map(a => DIRECTIONS[a]).join('');
        scene += roundedFace(corners(x + .18, y + .20, .64, .64, .08), '#6ca88b20');
        scene += groundText(x + .5, y + .7, arrows, `class="rl-diorama-policy" style="font-size:${arrows.length > 2 ? 15 : 24}px"`);
      }
      if (cell === 'G') {
        const [sx, sy] = project(x + .5, y + .5, .34);
        scene += face(star(sx + 1, sy + 4, 21), '#ac7c25') + face(star(sx, sy, 21), 'url(#maze-gold)', 'stroke="#fff2ae" stroke-width="1.5" stroke-linejoin="round"');
        scene += groundText(x + .5, y + .84, '◎ GOAL', 'class="rl-diorama-goal-label"');
      } else if (cell === 'T') {
        const [tx, ty] = project(x + .5, y + .55, .22);
        scene += `<path d="M${tx} ${ty - 20}l-16 28q16 6 32 0Z" fill="#c53b31" stroke="#ffdad0" stroke-width="1.8" stroke-linejoin="round"/><text x="${tx}" y="${ty + 4}" class="rl-diorama-warning">!</text>`;
      }
      scene += groundText(x + .18, y + .18, `S${i}${cell === 'S' ? ' · Start' : ''}`, 'class="rl-diorama-state"');
    }
    scene += '</g>';
    // Transparent native buttons retain click, Tab/Enter/Space and focus behavior.
    // Only the visible tile footprint is a hit target; the robot extends upward.
    let polygon = corners(x + .025, y + .025, .95, .95, .07);
    if (agent) {
      const [rx, ry] = project(x + .5, y + .51, .15), s = .9 + (y + .51) * .055;
      polygon = [polygon[0], [rx - 30 * s, ry - 92 * s], [rx + 30 * s, ry - 92 * s], polygon[1], polygon[2], polygon[3]];
    }
    const minX = Math.min(...polygon.map(p => p[0])), minY = Math.min(...polygon.map(p => p[1]));
    const w = Math.max(...polygon.map(p => p[0])) - minX, h = Math.max(...polygon.map(p => p[1])) - minY;
    const clip = polygon.map(([px, py]) => `${(px - minX) / w * 100}% ${(py - minY) / h * 100}%`).join(',');
    buttons.push(`<button type="button" class="rl-diorama-hit" data-state="${i}" aria-pressed="${i === selected}" aria-label="S${i} ${label}${agent ? ' Agent' : ''}" ${cell === '#' ? 'disabled' : ''} style="left:${minX / WIDTH * 100}%;top:${(minY - TOP) / HEIGHT * 100}%;width:${w / WIDTH * 100}%;height:${h / HEIGHT * 100}%;clip-path:polygon(${clip});z-index:${i + 1}"><span class="sr-only">S${i} ${label}</span></button>`);
  }
  // Mount point for the animated agent. robot-animator.js fills this <g> with the
  // articulated rig each frame; keeping it empty here means the learning render
  // stays a pure function of the environment, independent of animation state.
  scene += '<g class="rl-robot-stage"></g>';
  scene += block(-.23, -.05, .18, 5.28, -.08, .19, 'url(#maze-frame)', '#7c9f90', '#668b7c');
  scene += block(5.05, -.05, .18, 5.28, -.08, .19, 'url(#maze-frame)', '#7c9f90', '#668b7c');
  scene += block(-.23, 5.05, 5.46, .18, -.08, .19, 'url(#maze-frame)', '#779c89', '#668b7c');
  scene += '</svg>';
  return `<div class="rl-diorama" role="group" aria-label="立体迷路。マスを選択するとQ値を表示">${scene}${buttons.join('')}</div>`;
}
