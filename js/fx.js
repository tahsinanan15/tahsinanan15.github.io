// The reactive layer: each OS draws its own world on the canvas behind the windows, driven by the song's live levels.
const BUBBLES = { vapor: .5, baroque: .6, ghost: .7, ray: .55, metro: .85 };
const rand = (a, b) => a + Math.random() * (b - a);
let kind = 'bubbles', theme = null, spots = [], fade = 1, floor = 0;
let P = {};

export function setFx(t) {
  theme = t;
  const next = t?.fx || 'bubbles';
  if (next === kind) return;
  kind = next;
  spots = t?.spots || [];
  P = {}; fade = 0;
}
export const bubbleKind = () => kind;
export const bubbleAlpha = () => BUBBLES[kind] ?? 1;

/* ---------- Bubbles change with the OS ---------- */
const sheet = (draw, n = 1) => Array.from({ length: n }, (_, i) => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  draw(c.getContext('2d'), i);
  return c;
});
const SPRITES = {
  vapor: () => sheet((x) => {   // pastel gridded globes
    const g = x.createLinearGradient(0, 0, 128, 128);
    g.addColorStop(0, '#fffb96'); g.addColorStop(.45, '#ff71ce'); g.addColorStop(1, '#01cdfe');
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fill();
    x.strokeStyle = 'rgba(42,18,87,.55)'; x.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { x.beginPath(); x.ellipse(64, 64, Math.abs(i) * 14 + 1, 58, 0, 0, 7); x.stroke(); x.beginPath(); x.moveTo(64 - Math.sqrt(58 ** 2 - (i * 20) ** 2), 64 + i * 20); x.lineTo(64 + Math.sqrt(58 ** 2 - (i * 20) ** 2), 64 + i * 20); x.stroke(); }
  }),
  baroque: () => sheet((x, i) => {   // gilded music notes, the way a score would drift
    x.fillStyle = '#d4af37'; x.strokeStyle = '#f7e7a8'; x.lineWidth = 7; x.lineCap = 'round';
    const note = (hx, hy) => { x.beginPath(); x.ellipse(hx, hy, 15, 11, -.4, 0, 7); x.fill(); x.beginPath(); x.moveTo(hx + 13, hy - 3); x.lineTo(hx + 13, hy - 62); x.stroke(); };
    if (i) { note(38, 96); note(90, 84); x.lineWidth = 12; x.beginPath(); x.moveTo(51, 34); x.lineTo(103, 22); x.stroke(); }
    else { note(52, 98); x.beginPath(); x.moveTo(65, 34); x.quadraticCurveTo(96, 44, 88, 76); x.stroke(); }
  }, 2),
  ghost: () => sheet((x) => {   // neon hex nodes
    x.strokeStyle = '#00ffc8'; x.lineWidth = 5; x.shadowColor = '#00ffc8'; x.shadowBlur = 14;
    x.beginPath(); for (let i = 0; i < 6; i++) x.lineTo(64 + 50 * Math.cos(i * 1.0472 + .5236), 64 + 50 * Math.sin(i * 1.0472 + .5236)); x.closePath(); x.stroke();
    x.fillStyle = '#fcee0a'; x.shadowColor = '#fcee0a'; x.beginPath(); x.arc(64, 64, 9, 0, 7); x.fill();
  }),
  ray: () => sheet((x, i) => {   // Bengali letters, drifting off the page
    x.fillStyle = 'rgba(244,236,216,.92)'; x.font = '92px "Tiro Bangla", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 6;
    x.fillText('অআকখগচতপমর'[i], 64, 70);
  }, 10),
  metro: () => sheet((x, i) => {   // the city out of focus: headlights, tail lights, signal amber
    const c = ['255,240,210', '255,70,60', '247,181,0', '255,255,255', '120,190,255'][i];
    const g = x.createRadialGradient(64, 64, 20, 64, 64, 60);
    g.addColorStop(0, `rgba(${c},.16)`); g.addColorStop(.8, `rgba(${c},.26)`); g.addColorStop(.96, `rgba(${c},.5)`); g.addColorStop(1, `rgba(${c},0)`);
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
  }, 5),
};
const cache = {};
export function spritesFor(name) {
  if (!SPRITES[name]) return null;
  return (cache[name] ||= SPRITES[name]());
}
document.fonts?.ready.then(() => { delete cache.ray; });

/* ---------- Each world ---------- */
function vapor(g, W, H, dt, beat) {
  // A dark floor with a grid that rolls toward you, faster on the bass.
  const horizon = H * .6, cx = W * .5;
  const fl = g.createLinearGradient(0, horizon, 0, H);
  fl.addColorStop(0, 'rgba(38,8,92,.2)'); fl.addColorStop(.25, 'rgba(38,8,92,.82)'); fl.addColorStop(1, 'rgba(20,4,60,.95)');
  g.fillStyle = fl; g.fillRect(0, horizon, W, H - horizon);
  g.globalCompositeOperation = 'lighter';
  floor = (floor + dt * (.2 + beat.pulse * .6)) % 1;
  g.strokeStyle = 'rgba(1,205,254,.6)'; g.lineWidth = 1.4; g.beginPath();
  for (let i = -18; i <= 18; i++) { g.moveTo(cx + i * 22, horizon); g.lineTo(cx + i * W * .26, H); }
  for (let i = 0; i < 12; i++) { const y = horizon + (H - horizon) * Math.pow((i + floor) / 12, 2.4); g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();
  g.strokeStyle = 'rgba(255,113,206,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, horizon); g.lineTo(W, horizon); g.stroke();
}

function ghost(g, W, H, dt) {
  // Rain on neon. The painting's own lights glow through `spots`.
  g.globalCompositeOperation = 'lighter';
  P.rain ||= Array.from({ length: 30 }, () => ({ x: rand(-.1, 1.1) * W, y: rand(0, H), v: rand(240, 420), len: rand(12, 30) }));
  g.strokeStyle = 'rgba(150,235,255,.18)'; g.lineWidth = 1.1; g.beginPath();
  for (const p of P.rain) { const sp = p.v * dt; p.y += sp; p.x -= sp * .12; if (p.y > H) { p.y = -p.len; p.x = rand(0, 1.15) * W; } g.moveTo(p.x, p.y); g.lineTo(p.x - p.len * .12, p.y + p.len); }
  g.stroke();
}

function ray(g, W, H, dt) {
  // Film stock: a couple of scratches and a little dust. The weave itself is in reactSite.
  g.globalCompositeOperation = 'lighter';
  P.scratch ||= Array.from({ length: 2 }, () => ({ x: rand(0, W), life: rand(0, 1) }));
  g.lineWidth = 1;
  for (const s of P.scratch) {
    s.life -= dt * rand(.6, 2.2); if (s.life <= 0) { s.life = rand(.3, 1.2); s.x = rand(0, W); }
    g.strokeStyle = `rgba(255,250,235,${.1 + s.life * .22})`; g.beginPath(); g.moveTo(s.x, 0); g.lineTo(s.x, H); g.stroke();
  }
  g.fillStyle = 'rgba(255,250,235,.65)';
  if (dt) for (let i = 0; i < 5; i++) g.fillRect(Math.random() * W, Math.random() * H, rand(1, 2.6), rand(1, 2.6));
}

const WORLDS = { vapor, ghost, ray };   // Baroque Keep and Concrete Jungle draw no world, only the lights in `spots`

export function drawFx(g, W, H, dt, beat, img, portrait) {
  if (kind === 'bubbles') return;
  fade = Math.min(1, fade + dt * .8);
  if (!quake.on) { dt = 0; beat = { pulse: 0 }; }   // the switch stops it all, so the world holds still
  g.save();
  g.globalAlpha = fade;
  if (!portrait && spots.length) {
    const iw = img?.naturalWidth || 16, ih = img?.naturalHeight || 9, s = Math.max(W / iw, H / ih);
    g.globalCompositeOperation = 'lighter';
    for (const [u, v, r, rgb] of spots) {
      const x = (W - iw * s) / 2 + u * iw * s, y = (H - ih * s) / 2 + v * ih * s, a = kind === 'metro' ? .25 + beat.pulse * .3 : .4, R = r * W * 1.15;
      const grad = g.createRadialGradient(x, y, 0, x, y, R);
      grad.addColorStop(0, `rgba(${rgb},${Math.min(.75, a)})`); grad.addColorStop(.45, `rgba(${rgb},${Math.min(.3, a * .4)})`); grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad; g.fillRect(x - R, y - R, R * 2, R * 2);
    }
    g.globalCompositeOperation = 'source-over';
  }
  WORLDS[kind]?.(g, W, H, dt, beat);
  g.restore();
}

/* ---------- The screen does something different in every OS, gently. One switch in the player turns it off. ----------
   aero: water ripple. vapor: the grid rolls. baroque: the wall breathes. ghost: data blocks slip. ray: film gate weave. metro: the street lamps breathe. */
const pupil = document.querySelector('.start .eye__iris circle:nth-child(2)');
const taskbar = document.getElementById('taskbar');
const wall = document.getElementById('wall');
const warp = document.getElementById('warp');
const warpG = warp.getContext('2d', { alpha: false });
const WARPED = new Set(['bubbles', 'ghost']);
let lastLvl = -1, lastWarp = 0, slips = [], px = 0, py = 0, tx = 0, ty = 0;
export const quake = { on: true };
addEventListener('pointermove', (e) => { tx = (e.clientX / innerWidth - .5) * -14; ty = (e.clientY / innerHeight - .5) * -9; }, { passive: true });

function drawWarp(now, beat) {
  const img = document.querySelector('.wall img.is-on');
  if (!img?.naturalWidth) return;
  const W = innerWidth, H = innerHeight;
  if (warp.width !== W || warp.height !== H) { warp.width = W; warp.height = H; }
  const iw = img.naturalWidth, ih = img.naturalHeight, s = Math.max(W / iw, H / ih), sw = W / s, sh = H / s, sx0 = (iw - sw) / 2, sy0 = (ih - sh) / 2;
  const t = now / 1000, strip = kind === 'ghost' ? 22 : 8, rows = Math.ceil(H / strip);
  if (kind === 'ghost' && beat.kick === 1) slips = Array.from({ length: 2 }, () => ({ row: Math.floor(rand(0, rows)), span: Math.floor(rand(1, 3)), dx: rand(-14, 14) }));
  for (let r = 0; r < rows; r++) {
    const y = r * strip;
    let dx = 0;
    if (kind === 'bubbles') dx = Math.sin(y * .012 + t * 1.1) * (2 + beat.pulse * 6);
    else for (const b of slips) if (r >= b.row && r < b.row + b.span) dx += b.dx * beat.kick;
    warpG.drawImage(img, sx0, sy0 + y / s, sw, (strip + 1) / s, dx, y, W, strip + 1);
    if (dx > 0) warpG.drawImage(img, sx0, sy0 + y / s, 1, (strip + 1) / s, 0, y, dx, strip + 1);
    else if (dx < 0) warpG.drawImage(img, sx0 + sw - 1, sy0 + y / s, 1, (strip + 1) / s, W + dx, y, -dx, strip + 1);
  }
}

export function reactSite(beat, now = 0) {
  const live = quake.on && beat.playing;
  const useWarp = live && WARPED.has(kind) && innerHeight <= innerWidth * 1.1;
  if (useWarp) {
    if (now - lastWarp > 33) { drawWarp(now, beat); lastWarp = now; }
    if (warp.hidden) warp.hidden = false;
  } else if (!warp.hidden) warp.hidden = true;

  const t = now / 1000;
  px += (tx - px) * .05; py += (ty - py) * .05;
  let scale = 1.035, rot = 0, ox = 0, oy = 0;
  if (live) {
    if (kind === 'baroque') { scale += .012 + Math.sin(t * .55) * .012 + beat.pulse * .004; rot = Math.sin(t * .31) * .18; }
    if (kind === 'ray') { const k = .5 + beat.pulse * 1.5; ox = Math.sin(t * 2.1) * k; oy = Math.sin(t * 2.9 + 1) * k * 1.4; }
  }
  if (document.documentElement.classList.contains('os')) wall.style.transform = `translate3d(${(px + ox).toFixed(2)}px, ${(py + oy).toFixed(2)}px, 0) rotate(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
  else if (wall.style.transform) wall.style.transform = '';

  const lvl = live ? beat.pulse : 0;
  if (Math.abs(lvl - lastLvl) < .01) return;
  lastLvl = lvl;
  pupil?.setAttribute('r', (5.5 + lvl * 3.2).toFixed(1));
  taskbar?.style.setProperty('--beat', lvl.toFixed(2));
}
