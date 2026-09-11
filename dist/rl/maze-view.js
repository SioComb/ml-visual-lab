import { bestActions } from './random.js';
import { DIRECTIONS } from './maze.js';
import {
  WIDTH,
  HEIGHT,
  TOP,
  project,
  face,
  roundedFace,
  corners,
  block,
  groundText,
  stageOpen,
  tray,
  trayRims,
} from './diorama.js';

// Star marker for the reached Goal tile.
function star(cx, cy, radius) {
  return Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5,
      r = i % 2 ? radius * 0.48 : radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
}

const MAZE_DEFS = `
    <linearGradient id="maze-floor" x2=".3" y2="1"><stop stop-color="#fffdf4"/><stop offset="1" stop-color="#e7e3d6"/></linearGradient>
    <linearGradient id="maze-wall" x2=".8" y2="1"><stop stop-color="#7c959b"/><stop offset="1" stop-color="#4e6872"/></linearGradient>
    <linearGradient id="maze-wall-front" x2="0" y2="1"><stop stop-color="#3e5860"/><stop offset="1" stop-color="#263f46"/></linearGradient>
    <linearGradient id="maze-frame" x2=".5" y2="1"><stop stop-color="#f4f8ed"/><stop offset="1" stop-color="#adc7b9"/></linearGradient>
    <linearGradient id="maze-frame-front" x2="0" y2="1"><stop stop-color="#719a90"/><stop offset="1" stop-color="#315c59"/></linearGradient>
    <linearGradient id="maze-ceramic" x2=".85" y2="1"><stop stop-color="#ffffff"/><stop offset=".5" stop-color="#ecf4ec"/><stop offset="1" stop-color="#9fbcb6"/></linearGradient>
    <linearGradient id="maze-screen" x2=".5" y2="1"><stop stop-color="#275769"/><stop offset="1" stop-color="#082b3d"/></linearGradient>
    <radialGradient id="maze-blue" cx=".3" cy=".2"><stop stop-color="#c7fbff"/><stop offset=".4" stop-color="#6acfe8"/><stop offset="1" stop-color="#328faf"/></radialGradient>
    <linearGradient id="maze-gold" x2=".5" y2="1"><stop stop-color="#fff3a2"/><stop offset=".5" stop-color="#ffd35c"/><stop offset="1" stop-color="#e4a627"/></linearGradient>
    <linearGradient id="maze-trap" x2=".2" y2="1"><stop stop-color="#ffb6a2"/><stop offset="1" stop-color="#e06b5d"/></linearGradient>`;

export function mazeDiorama(env, table, selected, policy) {
  let scene = stageOpen('maze', MAZE_DEFS);
  // Bevelled tray the tiles stand in; rim strips are raised prisms, not a CSS shadow.
  scene += tray('url(#maze-frame)', 'url(#maze-frame-front)');
  const buttons = [];
  for (let i = 0; i < env.cells.length; i++) {
    const cell = env.cells[i],
      x = i % 5,
      y = Math.floor(i / 5),
      agent = env.position === i;
    const label = { S: 'Start', G: 'Goal', T: 'Trap', '#': 'Wall', '.': '' }[
      cell
    ];
    const stateClass = `${cell === '#' ? 'wall' : cell === 'G' ? 'goal' : cell === 'T' ? 'trap' : ''} ${i === selected ? 'selected' : ''}`;
    scene += `<g class="rl-diorama-tile ${stateClass}">`;
    scene += block(
      x + 0.025,
      y + 0.025,
      0.95,
      0.95,
      -0.075,
      0.035,
      'url(#maze-floor)',
      '#b7baaa',
      '#ced0c0',
      '#ffffffc0',
    );
    if (cell === '#') {
      scene += face(corners(x + 0.14, y + 0.2, 0.87, 0.92, 0.04), '#314d4650');
      scene += block(
        x + 0.09,
        y + 0.09,
        0.82,
        0.82,
        0.045,
        0.66,
        'url(#maze-wall)',
        'url(#maze-wall-front)',
        '#364f57',
        '#a5b6b780',
      );
    } else {
      if (cell === 'G' || cell === 'T') {
        scene += block(
          x + 0.07,
          y + 0.07,
          0.86,
          0.86,
          0.04,
          0.18,
          cell === 'G' ? 'url(#maze-gold)' : 'url(#maze-trap)',
          cell === 'G' ? '#a0a842' : '#b44c43',
          cell === 'G' ? '#d7b64b' : '#d27b64',
        );
      }
      const outline = corners(x + 0.055, y + 0.055, 0.89, 0.89, 0.2);
      scene += face(
        outline,
        agent ? '#b3e5fa75' : 'none',
        `class="rl-diorama-selection ${i === selected ? 'is-selected' : ''}" stroke="${agent ? '#75bfdf' : '#258570'}" stroke-width="${i === selected || agent ? 3 : 0}"`,
      );
      if (policy && !['G', 'T'].includes(cell)) {
        const arrows = bestActions(table[i] ?? [0, 0, 0, 0])
          .map((a) => DIRECTIONS[a])
          .join('');
        scene += roundedFace(
          corners(x + 0.18, y + 0.2, 0.64, 0.64, 0.08),
          '#6ca88b20',
        );
        scene += groundText(
          x + 0.5,
          y + 0.7,
          arrows,
          `class="rl-diorama-policy" style="font-size:${arrows.length > 2 ? 15 : 24}px"`,
        );
      }
      if (cell === 'G') {
        const [sx, sy] = project(x + 0.5, y + 0.5, 0.34);
        scene +=
          face(star(sx + 1, sy + 4, 21), '#ac7c25') +
          face(
            star(sx, sy, 21),
            'url(#maze-gold)',
            'stroke="#fff2ae" stroke-width="1.5" stroke-linejoin="round"',
          );
        scene += groundText(
          x + 0.5,
          y + 0.84,
          '◎ GOAL',
          'class="rl-diorama-goal-label"',
        );
      } else if (cell === 'T') {
        const [tx, ty] = project(x + 0.5, y + 0.55, 0.22);
        scene += `<path d="M${tx} ${ty - 20}l-16 28q16 6 32 0Z" fill="#c53b31" stroke="#ffdad0" stroke-width="1.8" stroke-linejoin="round"/><text x="${tx}" y="${ty + 4}" class="rl-diorama-warning">!</text>`;
      }
      scene += groundText(
        x + 0.18,
        y + 0.18,
        `S${i}${cell === 'S' ? ' · Start' : ''}`,
        'class="rl-diorama-state"',
      );
    }
    scene += '</g>';
    // Transparent native buttons retain click, Tab/Enter/Space and focus behavior.
    // Only the visible tile footprint is a hit target; the robot extends upward.
    let polygon = corners(x + 0.025, y + 0.025, 0.95, 0.95, 0.07);
    if (agent) {
      const [rx, ry] = project(x + 0.5, y + 0.51, 0.15),
        s = 0.9 + (y + 0.51) * 0.055;
      polygon = [
        polygon[0],
        [rx - 30 * s, ry - 92 * s],
        [rx + 30 * s, ry - 92 * s],
        polygon[1],
        polygon[2],
        polygon[3],
      ];
    }
    const minX = Math.min(...polygon.map((p) => p[0])),
      minY = Math.min(...polygon.map((p) => p[1]));
    const w = Math.max(...polygon.map((p) => p[0])) - minX,
      h = Math.max(...polygon.map((p) => p[1])) - minY;
    const clip = polygon
      .map(
        ([px, py]) => `${((px - minX) / w) * 100}% ${((py - minY) / h) * 100}%`,
      )
      .join(',');
    buttons.push(
      `<button type="button" class="rl-diorama-hit" data-state="${i}" aria-pressed="${i === selected}" aria-label="S${i} ${label}${agent ? ' Agent' : ''}" ${cell === '#' ? 'disabled' : ''} style="left:${(minX / WIDTH) * 100}%;top:${((minY - TOP) / HEIGHT) * 100}%;width:${(w / WIDTH) * 100}%;height:${(h / HEIGHT) * 100}%;clip-path:polygon(${clip});z-index:${i + 1}"><span class="sr-only">S${i} ${label}</span></button>`,
    );
  }
  // Mount point for the animated agent. robot-animator.js fills this <g> with the
  // articulated rig each frame; keeping it empty here means the learning render
  // stays a pure function of the environment, independent of animation state.
  scene += '<g class="rl-robot-stage"></g>';
  scene += trayRims('url(#maze-frame)');
  scene += '</svg>';
  return `<div class="rl-diorama" role="group" aria-label="立体迷路。マスを選択するとQ値を表示">${scene}${buttons.join('')}</div>`;
}
