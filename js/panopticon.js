// PANOPTICON.EXE: you are in the tower. They can't tell when you're looking, so eventually you don't have to.
// Bentham's prison as a whack-a-mole. Linked from nothing. Stare back at the Start eye, or type its name.
import { sfx } from './audio.js';
import { track, session } from './analytics.js';

const N = 12, TAU = Math.PI * 2, BEAM = .52;
const $ = (id) => document.getElementById(id);
let canvas, g, ready = false, raf = 0, last = 0, state = 'off', cells = [], gaze = 0, caught = 0, out = 0, idle = 0, turn = 0, openWin;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const gap = (a, b) => { const d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };
const say = (t) => { $('pan-msg').textContent = t; };
const hud = () => { $('pan-caught').textContent = caught; $('pan-out').textContent = `${out} / 3`; };

function begin() {
  cells = Array.from({ length: N }, (_, i) => ({ a: i / N * TAU, up: 0, fear: 0, rate: .09 + Math.random() * .12, hit: 0 }));
  caught = 0; out = 0; idle = 0; turn = 0; state = 'play';
  $('pan-end').hidden = true;
  say(matchMedia('(hover: none)').matches ? "You're in the tower. Touch to look. Tap anyone acting up." : "You're in the tower. Point to look. Click anyone acting up.");
  hud();
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
}

function step(dt) {
  if (state === 'play') {
    const ramp = Math.min(1.5, .7 + caught * .05);
    for (const c of cells) {
      if (gap(c.a, gaze) < BEAM) c.up = Math.max(0, c.up - dt * .4);
      else c.up += dt * c.rate * ramp * (1 - c.fear);
      c.hit = Math.max(0, c.hit - dt * 3);
      if (c.up >= 1) {
        c.up = 0; c.hit = 1; out++; hud();
        if (out >= 3) { state = 'lost'; say("Three got out. They guessed right."); $('pan-end').hidden = false; $('pan-file').hidden = true; track('panopticon_lost', { caught }); }
      }
    }
    if (cells.every((c) => c.fear >= .6) || caught >= 22) {
      state = 'trained'; idle = 0;
      for (const c of cells) c.up = 0;
      say('They stopped. Now look away.');
    }
  } else if (state === 'trained') {
    idle += dt;
    if (idle > 4.2) {
      state = 'turned';
      const n = session.events.length;
      say(`You stopped looking. They kept behaving. That's the panopticon. Bentham published it in 1791. OBSERVE.EXE has logged ${n} things you did here, by the way.`);
      $('pan-end').hidden = false; $('pan-file').hidden = false;
      track('panopticon_won', { caught });
    }
  } else if (state === 'turned') turn = Math.min(1, turn + dt * .7);
}

function catchAt() {
  if (state !== 'play') return;
  const target = cells.filter((c) => gap(c.a, gaze) < BEAM && c.up > .12).sort((a, b) => b.up - a.up)[0];
  if (!target) return;
  target.up = 0; target.fear = Math.min(1, target.fear + .34); target.hit = 1; caught++; hud();
  sfx.pop();
}

function draw() {
  const S = canvas.width, C = S / 2, R = S * .47, r0 = S * .13;
  const ink = css('--ink') || '#111', accent = css('--accent') || '#1f8fe8', danger = '#e0372a';
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#0a0d14'; g.beginPath(); g.arc(C, C, R + 8, 0, TAU); g.fill();
  for (const c of cells) {   // the ring of cells, each with a window behind it
    const a0 = c.a - TAU / N / 2 + .02, a1 = c.a + TAU / N / 2 - .02, lit = state !== 'turned' && gap(c.a, gaze) < BEAM;
    g.beginPath(); g.arc(C, C, R, a0, a1); g.arc(C, C, r0 * 1.7, a1, a0, true); g.closePath();
    g.fillStyle = lit ? '#3b4052' : '#1a1e2a'; g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(C, C, R - 3, c.a - .1, c.a + .1); g.strokeStyle = '#a9c4dd'; g.lineWidth = 5; g.stroke();
    const dist = r0 * 2.3 + (R - r0 * 2.7) * (.25 + c.up * .75), x = C + Math.cos(c.a) * dist, y = C + Math.sin(c.a) * dist;
    g.fillStyle = c.hit > 0 ? '#fff' : c.up > .55 ? danger : c.up > .12 ? '#f2b632' : '#c8d2dc';
    g.beginPath(); g.arc(x, y, S * .021, 0, TAU); g.fill();
    if (c.up > .12) {   // arms up, tools out
      g.strokeStyle = g.fillStyle; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x - S * .03, y - S * .03 * Math.sin(c.up * 20)); g.lineTo(x + S * .03, y + S * .03 * Math.sin(c.up * 20)); g.stroke();
    }
  }
  if (state === 'play' || state === 'trained') {   // your gaze, fading once you're told to let go
    const a = state === 'play' ? .5 : Math.max(0, .5 - idle * .16);
    const grad = g.createRadialGradient(C, C, r0, C, C, R);
    grad.addColorStop(0, `rgba(255,245,200,${a})`); grad.addColorStop(1, 'rgba(255,245,200,0)');
    g.fillStyle = grad; g.beginPath(); g.moveTo(C, C); g.arc(C, C, R, gaze - BEAM, gaze + BEAM); g.closePath(); g.fill();
  }
  // The tower. At the end its eye opens and looks at you.
  g.fillStyle = '#05070c'; g.beginPath(); g.arc(C, C, r0 * 1.15, 0, TAU); g.fill();
  g.strokeStyle = accent; g.lineWidth = 3; g.stroke();
  const open = turn;
  g.fillStyle = '#f4f6fa'; g.beginPath(); g.ellipse(C, C, r0 * .95, r0 * (.08 + open * .62), 0, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.ellipse(C, C, r0 * .95, r0 * (.08 + open * .62), 0, 0, TAU); g.clip();
  g.fillStyle = accent; g.beginPath(); g.arc(C, C, r0 * .46, 0, TAU); g.fill();
  g.fillStyle = '#05070c'; g.beginPath(); g.arc(C, C, r0 * .22, 0, TAU); g.fill();
  g.restore();
  g.fillStyle = ink;
}

function loop(now) {
  raf = 0;
  if (canvas.offsetParent === null) return;
  step(Math.min(.05, (now - last) / 1000)); last = now;
  draw();
  raf = requestAnimationFrame(loop);
}

export function init(opener) {
  openWin = opener;
  if (ready) { if (state === 'play' || state === 'trained') { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } } return; }
  ready = true;
  canvas = $('pan-canvas'); g = canvas.getContext('2d');
  const aim = (e) => { const r = canvas.getBoundingClientRect(); gaze = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); };
  canvas.addEventListener('pointermove', aim);
  canvas.addEventListener('pointerdown', (e) => { aim(e); catchAt(); });
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { gaze -= .26; e.preventDefault(); }
    if (e.key === 'ArrowRight') { gaze += .26; e.preventDefault(); }
    if (e.key === ' ' || e.key === 'Enter') { catchAt(); e.preventDefault(); }
  });
  $('pan-again').addEventListener('click', begin);
  $('pan-file').addEventListener('click', () => openWin('observe', { tab: 'visit' }));
  $('pan-climb').addEventListener('click', () => { $('pan-plate').hidden = true; canvas.focus({ preventScroll: true }); begin(); });
}
