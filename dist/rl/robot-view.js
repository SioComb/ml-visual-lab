import { idlePose } from './robot-motion.js';

// Articulated rig in local 3D coordinates (right, forward, up). Yaw rotates
// the entire skeleton before the maze camera projects it to SVG.
export function robotMarkup(pose, project) {
  const { x, y, yaw, sway, rise, lean } = pose;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const world = ([side, forward, z]) => {
    const s = side + sway * Math.min(1, z / .4), f = forward + lean * z;
    return [x + s * cos + f * sin, y - s * sin + f * cos, z];
  };
  const p = point => project(...world(point));
  const points = vertices => vertices.map(v => p(v).join(',')).join(' ');
  const shape = (vertices, fill, extra = '') => `<polygon points="${points(vertices)}" fill="${fill}" stroke="#aabeb760" stroke-width=".8" stroke-linejoin="round" ${extra}/>`;
  const scale = Math.abs(project(x + .1, y, 0)[0] - project(x, y, 0)[0]) / .1;
  const parts = [];
  const add = (center, markup) => { const w = world(center); parts.push({ depth: w[1] * .572 + w[2] * .82, markup }); };
  function ball(center, radius, fill) {
    const [cx, cy] = p(center);
    return `<circle cx="${cx}" cy="${cy}" r="${radius * scale}" fill="${fill}"/>`;
  }
  function limb(start, end, radius, name) {
    const a = p(start), b = p(end);
    add(start.map((v, i) => (v + end[i]) / 2), `<g data-joint="${name}"><path d="M${a}L${b}" stroke="#a0b9af" stroke-width="${radius * scale * 2 + 2}" stroke-linecap="round"/><path d="M${a}L${b}" stroke="url(#maze-ceramic)" stroke-width="${radius * scale * 2}" stroke-linecap="round"/></g>`);
  }
  function box(center, width, depth, height, name, screen = false) {
    const [sx, f, z] = center, l = sx - width / 2, r = sx + width / 2, back = f - depth / 2, front = f + depth / 2, bottom = z - height / 2, top = z + height / 2;
    let s = '<g data-part="' + name + '">';
    if (sin > .001) s += shape([[l, back, top], [l, front, top], [l, front, bottom], [l, back, bottom]], '#a4c1b7');
    if (sin < -.001) s += shape([[r, front, top], [r, back, top], [r, back, bottom], [r, front, bottom]], '#abc6bf');
    if (cos < 0) s += shape([[r, back, top], [l, back, top], [l, back, bottom], [r, back, bottom]], 'url(#maze-ceramic)');
    if (cos >= 0) s += shape([[l, front, top], [r, front, top], [r, front, bottom], [l, front, bottom]], 'url(#maze-ceramic)');
    s += shape([[l, back, top], [r, back, top], [r, front, top], [l, front, top]], '#fafff7');
    if (screen && cos > .025) {
      s += shape([[l + .035, front + .004, top - .055], [r - .035, front + .004, top - .055], [r - .035, front + .004, bottom + .045], [l + .035, front + .004, bottom + .045]], 'url(#maze-screen)', 'class="rl-robot-face"');
      s += ball([-.085, front + .01, z + .01], .024, '#83eeff') + ball([.085, front + .01, z + .01], .024, '#83eeff');
    }
    if (screen && cos < -.025) s += shape([[l + .1, back - .004, z + .025], [r - .1, back - .004, z + .025], [r - .1, back - .004, z - .025], [l + .1, back - .004, z - .025]], '#91aea3');
    add(center, s + '</g>');
  }
  for (const [side, name, step] of [[-1, 'left', pose.left], [1, 'right', pose.right]]) {
    const hip = [side * .105, 0, .39 + rise], ankle = [side * .13, step.forward, .065 + step.lift];
    const dy = ankle[1] - hip[1], dz = ankle[2] - hip[2], length = Math.max(.001, Math.hypot(dy, dz));
    const bend = Math.sqrt(Math.max(0, .24 ** 2 - (length / 2) ** 2));
    const knee = [side * .12, dy / 2 - dz / length * bend, hip[2] + dz / 2 + dy / length * bend];
    limb(hip, knee, .053, name + '-thigh'); limb(knee, ankle, .046, name + '-shin');
    box([side * .13, step.forward + .035, .055 + step.lift], .155, .22, .105, name + '-foot');
    // Same-side arm counter-swings against its leg; elbow flexion increases on
    // the forward stroke. Hands, elbows and knees are independent rig joints.
    // `cheer` (0..1) raises both arms overhead for the Goal celebration.
    const cheer = pose.cheer ?? 0;
    const armSwing = -step.forward * .8, shoulder = [side * .2, 0, .62 + rise];
    const elbow = [side * (.24 + cheer * .05), armSwing * .5 - cheer * .04, .46 + rise + Math.abs(armSwing) * .15 + cheer * .32];
    const hand = [side * (.26 + cheer * .12), armSwing - cheer * .03, .31 + rise + Math.max(0, armSwing) * .35 + cheer * .64];
    limb(shoulder, elbow, .049, name + '-upper-arm'); limb(elbow, hand, .043, name + '-forearm');
    add(hand, ball(hand, .062, 'url(#maze-ceramic)'));
  }
  box([0, 0, .51 + rise], .32, .24, .31, 'torso');
  box([0, pose.turn * .018, .85 + rise], .44, .31, .34, 'head', true);
  limb([0, 0, 1.02 + rise], [0, -.012 - pose.lean * .25, 1.12 + rise], .012, 'antenna');
  add([0, 0, 1.13 + rise], ball([0, -.012 - pose.lean * .25, 1.13 + rise], .026, 'url(#maze-blue)'));
  const [shadowX, shadowY] = project(x, y, .045);
  parts.sort((a, b) => a.depth - b.depth);
  return `<g class="rl-robot-rig" data-heading="${yaw}" data-phase="${pose.phase}" data-moving="${pose.moving}" data-x="${x}" data-y="${y}"><ellipse cx="${shadowX}" cy="${shadowY}" rx="${scale * .29}" ry="${scale * .1}" fill="#27463b" opacity=".2" filter="url(#maze-soft)"/>${parts.map(part => part.markup).join('')}</g>`;
}

export function standingRobot(x, y, project) {
  return `<g class="rl-diorama-robot">${robotMarkup(idlePose({ x, y }), project)}</g>`;
}
