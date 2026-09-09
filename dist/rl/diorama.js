// Shared perspective renderer for the reinforcement-learning dioramas (maze and
// Snake). x/y are board coordinates in a fixed 5-unit space; z is height above
// the floor. The camera looks down from the front of the board. A board with a
// different cell count maps its cells into this same 5-unit space (see snake-view
// / maze-view), so every diorama fills the same on-screen footprint.
export const WIDTH = 700, HEIGHT = 570, TOP = 55;

export function project(x, y, z = 0) {
  const depth = 14 - (y - 2.5) * 0.572 - z * 0.820;
  return [350 + (x - 2.5) * 1330 / depth, 310 + ((y - 2.5) * 0.820 - z * 0.572) * 1330 / depth];
}
// Screen pixels per one board unit at the board centre (used to size round pieces).
export const UNIT = project(3, 2.5)[0] - project(2, 2.5)[0];

const points = vertices => vertices.map(p => p.map(v => v.toFixed(2)).join(',')).join(' ');
export const face = (vertices, fill, extra = '') => `<polygon points="${points(vertices)}" fill="${fill}" ${extra}/>`;
export function roundedFace(vertices, fill, extra = '') {
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
export function corners(x, y, width, length, z) {
  return [[x, y], [x + width, y], [x + width, y + length], [x, y + length]].map(([a, b]) => project(a, b, z));
}
export function block(x, y, width, length, bottom, top, surface, front, side, bevel = '#ffffff70') {
  const b = corners(x, y, width, length, bottom), t = corners(x, y, width, length, top);
  return face([t[0], t[3], b[3], b[0]], side) + face([t[1], t[2], b[2], b[1]], side) + face([t[3], t[2], b[2], b[3]], front) + roundedFace(t, surface, `stroke="${bevel}" stroke-width="1.4" stroke-linejoin="round"`);
}
export function groundText(x, y, text, extra = '') {
  const p = project(x, y, 0.13);
  return `<text x="${p[0]}" y="${p[1]}" text-anchor="middle" ${extra}>${text}</text>`;
}
// White stage, top-lit, with a soft contact shadow under the board. Shared so the
// maze and Snake sit on an identical surface. Returns the opening <svg>…defs plus
// the background; callers add their board and close the tag.
export function stageOpen(ns, extraDefs = '') {
  return `<svg class="rl-diorama-scene" viewBox="0 ${TOP} ${WIDTH} ${HEIGHT}" aria-hidden="true"><defs>
    <filter id="${ns}-soft" x="-50%" y="-80%" width="200%" height="260%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="${ns}-cast" x="-45%" y="-70%" width="190%" height="260%"><feGaussianBlur stdDeviation="9"/></filter>
    <clipPath id="${ns}-stage"><rect x="0" y="${TOP}" width="${WIDTH}" height="${HEIGHT}"/></clipPath>
    ${extraDefs}
  </defs>
  <rect x="0" y="${TOP}" width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
  <g clip-path="url(#${ns}-stage)">
    <ellipse cx="352" cy="558" rx="286" ry="34" fill="#33505a" opacity=".16" filter="url(#${ns}-cast)"/>
    <ellipse cx="352" cy="565" rx="220" ry="16" fill="#2b424b" opacity=".13" filter="url(#${ns}-soft)"/>
  </g>`;
}
// The raised tray the board pieces stand in: bevelled base plus a back rim. The
// front and side rims are drawn last by the caller so nearer pieces overlap them.
export function tray(frame, frameFront) {
  return block(-.23, -.23, 5.46, 5.46, -.56, -.08, '#9daf9e', frameFront, '#577f73')
    + block(-.23, -.23, 5.46, .18, -.08, .19, frame, '#81988a', '#779386');
}
export function trayRims(frame) {
  return block(-.23, -.05, .18, 5.28, -.08, .19, frame, '#7c9f90', '#668b7c')
    + block(5.05, -.05, .18, 5.28, -.08, .19, frame, '#7c9f90', '#668b7c')
    + block(-.23, 5.05, 5.46, .18, -.08, .19, frame, '#779c89', '#668b7c');
}
