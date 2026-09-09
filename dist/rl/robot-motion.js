// Presentation-only motion math. No environment, reward, action selection,
// RNG, or Q-table dependencies. Phase is tied to travel, not frame rate.
const TAU = Math.PI * 2;
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
export const headingForAction = action => [Math.PI, 0, -Math.PI / 2, Math.PI / 2][action] ?? 0;
export const shortestTurn = (from, to) => ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
export const tilePosition = state => ({ x: state % 5 + .5, y: Math.floor(state / 5) + .51 });

export function idlePose(position, yaw = 0) {
  return { ...position, yaw, phase: 0, stride: 0, lean: 0, sway: 0, rise: 0, turn: 0, moving: false,
    left: { forward: 0, lift: 0, roll: 0, planted: true }, right: { forward: 0, lift: 0, roll: 0, planted: true } };
}

function foot(phase, envelope) {
  const cycle = ((phase / TAU) % 1 + 1) % 1;
  if (cycle < .5) {
    // During stance the foot moves backwards relative to the pelvis, keeping
    // its world position approximately fixed as the character advances.
    return { forward: (.23 - .92 * cycle) * envelope, lift: 0, roll: (cycle - .25) * .3 * envelope, planted: true };
  }
  const swing = (cycle - .5) * 2;
  return { forward: (-.23 + .46 * smooth(swing)) * envelope, lift: .15 * Math.sin(Math.PI * swing) * envelope, roll: -.22 * Math.sin(TAU * swing) * envelope, planted: false };
}

export function sampleMotion(from, target, progress) {
  const t = clamp(progress), distance = Math.hypot(target.x - from.x, target.y - from.y);
  const angle = shortestTurn(from.yaw, target.yaw), turning = Math.abs(angle) > .02;
  // Rotate before committing weight to the next tile. The pelvis follows the
  // head/shoulders over the first portion of the stride.
  const turnEnd = turning ? .32 : 0, travelStart = turning ? .18 : 0;
  const travel = smooth((t - travelStart) / (1 - travelStart));
  const envelope = smooth(travel / .12) * smooth((1 - travel) / .12);
  const phase = travel * TAU;
  const yaw = from.yaw + angle * (turning ? smooth(t / turnEnd) : 1);
  const pose = idlePose({ x: from.x + (target.x - from.x) * travel, y: from.y + (target.y - from.y) * travel }, yaw);
  const turn = Math.sin(Math.PI * clamp(t / Math.max(.01, turnEnd))) * Math.sign(angle);
  if (distance < .001) return { ...pose, turn: turn * .5 };
  return { ...pose, phase, stride: envelope, turn, moving: t < 1,
    left: foot(phase, envelope), right: foot(phase + Math.PI, envelope),
    // Shift towards the planted leg. The small rise comes from leg extension,
    // while the forward lean anticipates travel and settles on the final foot.
    sway: -.032 * Math.sin(phase) * envelope,
    rise: .018 * (1 - Math.cos(phase * 2)) * envelope,
    lean: .07 * Math.sin(Math.PI * travel),
  };
}

// Success flourish played after arriving on the Goal tile: a light hop with both
// feet leaving the floor and the arms lifting (cheer), returning to a stand.
export function celebratePose(position, yaw, progress) {
  const t = clamp(progress), hop = Math.sin(Math.PI * smooth(t)), airborne = hop > .1;
  const leg = { forward: -.05 * hop, lift: .22 * hop, roll: 0, planted: !airborne };
  return { ...idlePose(position, yaw),
    rise: .14 * hop, lean: .04 * Math.sin(TAU * t) * (1 - t),
    turn: .3 * hop, cheer: hop, moving: t < 1,
    left: { ...leg }, right: { ...leg } };
}

// Failure recoil played after stepping onto a Trap: rock back, one foot slips,
// a side-to-side wobble that decays into the neutral stance.
export function stumblePose(position, yaw, progress) {
  const t = clamp(progress), arc = Math.sin(Math.PI * t), wobble = Math.sin(t * Math.PI * 3) * (1 - t);
  return { ...idlePose(position, yaw),
    lean: -.13 * arc, sway: .05 * wobble, turn: .7 * wobble, rise: -.03 * arc, moving: t < 1,
    left: { forward: .05 * arc, lift: 0, roll: 0, planted: true },
    right: { forward: -.2 * arc, lift: .06 * arc * smooth(1 - t), roll: 0, planted: t > .55 } };
}

// Blocked move: turn to face the attempted direction, lean in and rebound. The
// robot keeps the new facing so the next step reads as a fresh decision.
export function bumpPose(position, fromYaw, toYaw, progress) {
  const t = clamp(progress), turn = smooth(Math.min(1, t / .45)), arc = Math.sin(Math.PI * t);
  const delta = shortestTurn(fromYaw, toYaw);
  return { ...idlePose(position, fromYaw + delta * turn),
    lean: .07 * arc, rise: -.015 * arc, turn: Math.sign(delta) * (1 - turn) * .6, moving: t < 1 };
}
