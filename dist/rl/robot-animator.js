import { project } from './diorama.js';
import { idlePose, tilePosition, headingForAction, shortestTurn, sampleMotion, celebratePose, electrocutePose, bumpPose } from './robot-motion.js';
import { robotMarkup, electrocuteFx } from './robot-view.js';

// Presentation-only render/animation controller for the Q-learning maze agent.
// It never advances the environment, selects actions, touches the Q-table or the
// step timers. ui.js calls sync() after every render with the agent's *logical*
// tile and the last transition; this module owns the *visual* position, turning
// the discrete state change into: turn -> walk cycle -> arrive -> idle.
//
//   Q-learning state transition (ui.js / worker.js, unchanged)
//     -> sync({ state, action, cells, ... })   Trap arrival is detected here
//       -> turn towards the new heading, then walk one tile (sampleMotion)
//       -> Goal: hop (celebratePose) / Trap: shock (electrocutePose + FX) / wall: bump
//       -> settle to idlePose (neutral); the episode-end/reset flow is untouched

const SVG_NS = 'http://www.w3.org/2000/svg';
const nextFrame = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : cb => setTimeout(() => cb(now()), 16);
const dropFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
const now = () => (typeof performance === 'object' && performance.now ? performance.now() : Date.now());

export function createRobotAnimator() {
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = Boolean(media && media.matches);
  media?.addEventListener?.('change', event => { reduced = event.matches; });

  let stage = null;   // <g class="rl-robot-stage"> inside the live scene <svg>
  let tile = null;    // logical state index the robot currently occupies
  let pose = null;    // last rendered pose; also the "from" of the next move
  let queue = [];      // pending animation segments
  let handle = 0;      // active rAF handle (0 when idle)
  let segStart = 0;    // timestamp the head segment started
  let token;           // identity of the last transition object already handled

  const paint = (frame, fx) => {
    if (!stage || !frame) return;
    stage.innerHTML = (fx && fx.back || '') + robotMarkup(frame, project) + (fx && fx.front || '');
  };
  const halt = () => { if (handle) dropFrame(handle); handle = 0; queue = []; };

  function settled(seg) {
    if (seg.type === 'walk') return idlePose({ x: seg.to.x, y: seg.to.y }, seg.to.yaw);
    if (seg.type === 'bump') return idlePose(seg.pos, seg.toYaw);
    return idlePose(seg.pos, seg.yaw);
  }

  function tick(stamp) {
    const seg = queue[0];
    if (!seg) { handle = 0; return; }
    const p = seg.dur > 0 ? Math.min(1, (stamp - segStart) / seg.dur) : 1;
    let frame, fx = null;
    if (seg.type === 'walk') frame = sampleMotion(seg.from, seg.to, p);
    else if (seg.type === 'celebrate') frame = celebratePose(seg.pos, seg.yaw, p);
    else if (seg.type === 'electrocute') { frame = electrocutePose(seg.pos, seg.yaw, p, seg.calm); fx = electrocuteFx(seg, p, project); }
    else frame = bumpPose(seg.pos, seg.fromYaw, seg.toYaw, p);
    paint(frame, fx);
    pose = frame;
    if (p < 1) { handle = nextFrame(tick); return; }
    pose = settled(seg);
    queue.shift();
    if (queue.length) { segStart = stamp; handle = nextFrame(tick); return; }
    paint(pose);
    handle = 0;
  }

  const run = () => { if (handle) dropFrame(handle); segStart = now(); handle = nextFrame(tick); };

  // opts: { scene, state, cells, action, animate, token }
  function sync(opts) {
    const scene = opts.scene;
    if (!scene) { halt(); stage = null; return; }
    stage = scene.querySelector('.rl-robot-stage');
    if (!stage) {
      stage = document.createElementNS(SVG_NS, 'g');
      stage.setAttribute('class', 'rl-robot-stage');
      scene.appendChild(stage);
    }
    const state = opts.state, action = opts.action;
    const stepped = opts.token !== token;
    token = opts.token;
    const spot = tilePosition(state);

    // First paint after mount or reset(): drop straight into a neutral stance.
    if (tile === null) {
      halt();
      tile = state;
      pose = idlePose(spot, action != null ? headingForAction(action) : 0);
      paint(pose);
      return;
    }

    // No logical move. Repaint into the (possibly rebuilt) stage. If a real step
    // just bounced off a wall, play a short turn-and-recoil towards it.
    if (state === tile) {
      if (stepped && opts.animate && !reduced && action != null && !queue.length) {
        queue = [{ type: 'bump', pos: spot, fromYaw: pose ? pose.yaw : 0, toYaw: headingForAction(action), dur: 260 }];
        run();
      } else if (!handle) {
        paint(pose || idlePose(spot, 0));
      }
      return;
    }

    const dx = state % 5 - tile % 5, dy = Math.floor(state / 5) - Math.floor(tile / 5);
    const adjacent = Math.abs(dx) + Math.abs(dy) === 1;
    tile = state;
    const arrival = opts.cells ? opts.cells[state] : '';
    const heading = adjacent ? Math.atan2(dx, dy) : (pose ? pose.yaw : 0);

    // Snap (no walk cycle) when animation is off, the change is not a fresh
    // transition (reset / regenerate / lesson switch), or the jump spans more
    // than one tile.
    if (!opts.animate || !stepped || !adjacent) {
      halt();
      pose = idlePose(spot, heading);
      paint(pose);
      return;
    }

    // Reduced motion: skip the walk cycle. Still play a short, low-motion cue
    // for the Trap shock (flash + "-10" label) so the outcome stays legible.
    if (reduced) {
      halt();
      pose = idlePose(spot, heading);
      if (arrival === 'T') { queue = [{ type: 'electrocute', pos: spot, yaw: heading, tile: state, dur: 320, calm: true }]; run(); }
      else paint(pose);
      return;
    }

    // Turn towards the heading, then walk one tile. sampleMotion keeps the turn
    // ahead of the travel, so a 90 degree change reads as "turn, then step".
    const from = { x: pose.x, y: pose.y, yaw: pose.yaw };
    const swing = shortestTurn(from.yaw, heading);
    const to = { x: spot.x, y: spot.y, yaw: from.yaw + swing };
    queue = [{ type: 'walk', from, to, dur: Math.abs(swing) > 0.35 ? 380 : 300 }];
    if (arrival === 'G') queue.push({ type: 'celebrate', pos: spot, yaw: to.yaw, dur: 480 });
    else if (arrival === 'T') queue.push({ type: 'electrocute', pos: spot, yaw: to.yaw, tile: state, dur: 520 });
    run();
  }

  return {
    sync,
    reset() { halt(); tile = null; pose = null; token = undefined; },
  };
}
