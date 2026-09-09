import { idlePose } from './robot-motion.js';

const TAU = Math.PI * 2;

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
      const zap = pose.zap ?? 0;
      s += shape([[l + .035, front + .004, top - .055], [r - .035, front + .004, top - .055], [r - .035, front + .004, bottom + .045], [l + .035, front + .004, bottom + .045]], zap ? '#ffd23c' : 'url(#maze-screen)', 'class="rl-robot-face"');
      if (zap) {
        // Alarm: torn noise bands across the display instead of the calm eyes.
        s += shape([[l + .04, front + .006, top - .07], [r - .04, front + .006, top - .085], [r - .04, front + .006, top - .12], [l + .04, front + .006, top - .105]], '#b3160a');
        s += shape([[l + .06, front + .006, z + .015], [r - .16, front + .006, z - .002], [r - .09, front + .006, z - .05], [l + .11, front + .006, z - .033]], '#7c0f06');
        s += shape([[l + .04, front + .006, bottom + .085], [r - .1, front + .006, bottom + .07], [r - .1, front + .006, bottom + .045], [l + .04, front + .006, bottom + .06]], '#e8442c');
      } else {
        s += ball([-.085, front + .01, z + .01], .024, '#83eeff') + ball([.085, front + .01, z + .01], .024, '#83eeff');
      }
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

// Shock effects layered around the rig for a Trap arrival, drawn with plain
// SVG (no images, no libraries): a red flash on the Trap tile, flickering
// lightning, a rising "Reward -10" label and a closing puff of smoke. Returns
// { back, front } so robot-animator.js can draw the rig between the two layers.
// `seg` is the animator segment { pos:{x,y}, yaw, tile, dur, calm }. When calm
// (prefers-reduced-motion) only the flash and label are kept, without flicker.
export function electrocuteFx(seg, progress, project) {
  const t = Math.max(0, Math.min(1, progress)), calm = Boolean(seg.calm);
  const ms = t * seg.dur;
  const tx = seg.tile % 5, ty = Math.floor(seg.tile / 5);
  const cx = seg.pos.x, cy = seg.pos.y;
  const scale = Math.abs(project(cx + .1, cy, 0)[0] - project(cx, cy, 0)[0]) / .1;
  const at = (x, y, zz) => project(x, y, zz).map(v => v.toFixed(1)).join(',');

  // back layer: Trap-cell red flash, up and down within ~150ms.
  let back = '';
  if (ms < 175) {
    const k = Math.sin(Math.min(1, ms / 150) * Math.PI) * (calm ? .4 : .58);
    back = `<polygon class="rl-zap-flash" points="${at(tx + .04, ty + .04, .2)} ${at(tx + .96, ty + .04, .2)} ${at(tx + .96, ty + .96, .2)} ${at(tx + .04, ty + .96, .2)}" fill="#ff2d1a" opacity="${k.toFixed(3)}"/>`;
  }

  let front = '';
  const [bx, by] = project(cx, cy, .62);

  // Flickering lightning radiating from around the torso (3 bolts; none calm).
  const bolts = calm ? 0 : 3;
  if (t > .03 && t < .82) {
    for (let i = 0; i < bolts; i++) {
      if (Math.sin(t * TAU * 17 + i * 2.3) <= (i % 2 ? -.35 : -.05)) continue;
      const ang = -Math.PI / 2 + (i - (bolts - 1) / 2) * 1.15 + Math.sin(t * 37 + i * 3) * .18;
      const r0 = .08 * scale, len = (1 + (i % 2) * .35) * .52 * scale, jag = 7 + (i % 2) * 5;
      const seed = i * 5.1 + Math.floor(t * 45);
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
      const ox = bx + dx * r0, oy = by + dy * r0;
      let d = `M${ox.toFixed(1)},${oy.toFixed(1)}`;
      for (let s = 1; s <= 4; s++) {
        const f = s / 4, off = s === 4 ? 0 : Math.sin(seed + s * 2.7) * jag * (1 - f * .3);
        d += `L${(ox + dx * len * f + nx * off).toFixed(1)},${(oy + dy * len * f + ny * off).toFixed(1)}`;
      }
      front += `<path class="rl-zap-bolt" d="${d}" fill="none" stroke="#7cc8ff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><path class="rl-zap-bolt" d="${d}" fill="none" stroke="#e9fbff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path class="rl-zap-bolt" d="${d}" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }

  // Rising "Reward -10" label just above the robot.
  if (t > .1) {
    const k = (t - .1) / .9;
    const [rx, ry0] = project(cx, cy, 1.22);
    const ry = ry0 - 4 - k * (calm ? 10 : 24);
    const fade = calm ? Math.min(1, (1 - k) * 1.5) : (k < .12 ? k / .12 : 1 - Math.max(0, (k - .5) / .5));
    if (fade > 0) front += `<text class="rl-zap-reward" x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" text-anchor="middle" font-size="19" font-weight="800" paint-order="stroke" stroke="#fff" stroke-width="4" fill="#c81f10" opacity="${fade.toFixed(3)}">Reward −10</text>`;
  }

  // Closing puff of smoke (skipped when calm).
  if (!calm && t > .6) {
    const k = (t - .6) / .4;
    const [sx, sy] = project(cx, cy, .16);
    for (let i = 0; i < 3; i++) {
      const rise = k * (14 + i * 7), rad = 3 + i * 2 + k * (9 + i * 3), ox = (i - 1) * 7 * k;
      front += `<circle class="rl-zap-smoke" cx="${(sx + ox).toFixed(1)}" cy="${(sy - rise).toFixed(1)}" r="${rad.toFixed(1)}" fill="#8b9894" opacity="${(Math.max(0, 1 - k) * .32).toFixed(3)}"/>`;
    }
  }

  return { back, front };
}
