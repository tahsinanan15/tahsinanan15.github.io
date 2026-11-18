// KITTY_RUN.EXE's paw puff, a pixelfx effect (https://github.com/patch-gg/pixelfx: copy to src/fx/impacts/paw-puff.js).
// Dust kicked up and out from a pair of paws as they push off the road, a pinch of grit, and gone. big: the landing.
import { Particles, P, Rng, fit } from "../../core/index.js";

export const meta = {
  name: "Paw puff",
  desc: "Two small puffs of dust kicked up and out from a pair of paws pushing off the road, a few grains of grit, gone in half a second. big is a landing.",
  tags: ["dust", "step", "run", "landing", "one-shot"],
  size: [96, 44],
  origin: [48, 38],
  duration: 0.6,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#2b2630", "#4a4258", "#6b6280", "#9088a4", "#bdb6cc", "#e6e1ee"], seed: 3, big: 0 },
};

export function create(o) {
  const C = fit(o.palette, 6), R = new Rng(o.seed), floor = () => 0, ps = new Particles({ rng: R, ground: floor }), k = o.big ? 1.7 : 1;
  for (const side of [-1, 1]) {
    for (let i = 0; i < Math.round(8 * k); i++)   // small puffs fanned out low along the road, the outer ones faster and fainter
      ps.spawn(P.DUST, side * R.range(2, 8) * k, -R.range(0, 1.5), side * R.range(14, 44) * k, -R.range(5, 22) * k, R.range(0.22, 0.45), R.chance(0.6) ? C[4] : C[3], R.range(1.1, 2.3) * k, R.range(0, 0.06));
    for (let i = 0; i < Math.round(3 * k); i++)
      ps.spawn(P.GRIT, side * R.range(2, 6), -1, side * R.range(20, 60) * k, -R.range(40, 90) * k, R.range(0.25, 0.45), R.pick([C[2], C[3], C[5]]), 1);
  }
  let t = 0;
  return { update(dt) { t += dt; ps.update(dt); }, draw(p) { ps.draw(p); } };
}
