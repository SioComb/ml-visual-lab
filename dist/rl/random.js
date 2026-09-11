// Separate seeded streams keep environment and action randomness independent.
export function random(seed = 42) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function bestActions(values) {
  const max = Math.max(...values);
  return values.flatMap((value, index) =>
    Math.abs(value - max) < 1e-9 ? [index] : [],
  );
}
export function choose(values, epsilon, rng) {
  const exploring = epsilon > 0 && rng() < epsilon;
  const choices = exploring ? values.map((_, i) => i) : bestActions(values);
  return { action: choices[Math.floor(rng() * choices.length)], exploring };
}
