// The statistics behind the headline test. Pure functions, checked by _dev/check.mjs.
export function wilson(x, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = x / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
function erf(x) {  // Abramowitz and Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + .3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x));
}
export const twoSidedP = (z) => 1 - erf(Math.abs(z) / Math.SQRT2);
export function twoProp(x1, n1, x2, n2) {
  if (!n1 || !n2) return { z: 0, p: 1 };
  const p = (x1 + x2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return { z: 0, p: 1 };
  const z = (x1 / n1 - x2 / n2) / se;
  return { z, p: twoSidedP(z) };
}
export function sampleSize(p1, p2, za = 1.96, zb = .8416) {
  const bar = (p1 + p2) / 2;
  return Math.ceil((za * Math.sqrt(2 * bar * (1 - bar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p2 - p1) ** 2);
}
// Sample ratio check: a 50/50 split that drifts this far means the test itself is broken.
export function splitCheck(a, b) {
  const n = a + b;
  return n ? twoSidedP((a - n / 2) / Math.sqrt(n / 4)) : 1;
}
