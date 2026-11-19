// KITTY_RUN.EXE: the desktop kitty runs down the play-along's road, away from the OBSERVE eye, for as long as she can.
// js/beats.js keeps the stage and the world (sky, land, road, waves, the bars along the sides, the lens), and the song plays
// whole. This file puts her on that road with what's on it: this OS's obstacles, bubbles to pop (10 points each),
// power-ups, and behind her the eye, out of sight until she stumbles. When the song ends or is changed, the next song's
// OS takes over the run; a song played to its end adds 1 to the multiplier.
// Three lanes. r is how far off something is, as in the play-along: 0 where she runs, more the farther off. Everything comes
// toward her at the run's speed, which climbs the longer she lasts. A hit is a stumble and the eye closes in; a second one
// within 8 seconds and it has her, and the site's eyelids shut over the screen, the way they do at shutdown.
// Heights are in lanes of the play-along's road (f.lane): she is about 1.3 tall and a jump clears 1.5.
// Loaded by js/beats.js on the first click of the kitty glyph. It runs on beats' frame: draw() after the road, hud() last.
import { track } from './analytics.js';
import { deck, beat, play } from './audio.js';
import { THEMES } from './themes.js';
import { WORLDS, bomb, paint } from './beatworlds.js';
import { soap } from './bubbles.js';
import { spritesFor } from './fx.js';
import { kittyMeta, kittySheet } from './kitty.js';

const { TAU, lin, rad, round, poly, blob, gel, column, chandelier, rose, ogive } = paint;
const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const U = (lane) => (lane + .5) * 4 / 3;            // a lane's middle on the road, which runs 0 to 4
const V0 = 1.2, VMAX = 2.4, RAMP = 100;                // r a second at the start, at most, and seconds to get most of the way there
const SPAWN = 2.6, METRES = 12, INTRO = 1.5;          // where things appear (r), metres to an r, seconds before she bolts
const AGAIN = 8000, SAFE = 1200;                      // ms: a second hit inside AGAIN is caught; after a hit nothing hurts for SAFE
const HOP = 220;                                      // ms from one lane to the next
const TALL = 1.3, SLIDE = .7, RIDE = 2.25;            // her height, how long a slide lasts (s), how high a window carries her: over every wall
const JUMP = { dur: .62, peak: 1.5 }, POUNCE = { dur: .92, peak: 2.7 };
const LOW = .62, BAR = 1.6, WALL = 2.1;               // a low thing blocks below LOW, a bar unless she slides (or flies over BAR), a wall below WALL
const SHAPE = { low: .5, bomb: .5, high: 1.12, wall: 1.7, mover: 1.6 };   // each kind's height over its width (1.23 lanes)
const DEPTH = { low: .07, bomb: .07, high: .05, wall: .12, mover: .3 };   // and how much road it covers, in r
const LAST = { shield: 20, magnet: 10, ride: 8, pounce: 10, star: 15, zoom: 5 };   // seconds; the shield goes sooner if something hits her
const NAMES = { shield: 'BUBBLE SHIELD', magnet: 'BUBBLE WAND', ride: 'WINDOW RIDE', pounce: 'POUNCE', star: 'BUBBLES X2', zoom: 'ZOOMIES' };
const GLYPH = {   // 11 by 11 pixels, like the LCD's glyphs
  shield: 'M3 0h5v1h-5zM2 1h1v1h-1zM8 1h1v1h-1zM1 2h1v1h-1zM4 2h2v1h-2zM9 2h1v1h-1zM0 3h1v1h-1zM3 3h1v1h-1zM10 3h1v1h-1zM0 4h1v1h-1zM10 4h1v1h-1zM0 5h1v1h-1zM10 5h1v1h-1zM0 6h1v1h-1zM10 6h1v1h-1zM0 7h1v1h-1zM10 7h1v1h-1zM1 8h1v1h-1zM9 8h1v1h-1zM2 9h1v1h-1zM8 9h1v1h-1zM3 10h5v1h-5z',
  magnet: 'M6 0h3v1h-3zM5 1h1v1h-1zM9 1h1v1h-1zM4 2h1v1h-1zM10 2h1v1h-1zM4 3h1v1h-1zM10 3h1v1h-1zM4 4h1v1h-1zM10 4h1v1h-1zM5 5h1v1h-1zM9 5h1v1h-1zM4 6h1v1h-1zM6 6h3v1h-3zM3 7h1v1h-1zM2 8h1v1h-1zM1 9h1v1h-1zM0 10h1v1h-1z',
  ride: 'M0 1h11v1h-11zM0 2h7v1h-7zM8 2h1v1h-1zM10 2h1v1h-1zM0 3h11v1h-11zM0 4h1v1h-1zM10 4h1v1h-1zM0 5h1v1h-1zM10 5h1v1h-1zM0 6h1v1h-1zM10 6h1v1h-1zM0 7h1v1h-1zM10 7h1v1h-1zM0 8h1v1h-1zM10 8h1v1h-1zM0 9h11v1h-11z',
  pounce: 'M2 0h2v1h-2zM7 0h2v1h-2zM2 1h2v1h-2zM7 1h2v1h-2zM0 3h2v1h-2zM9 3h2v1h-2zM0 4h2v1h-2zM4 4h3v1h-3zM9 4h2v1h-2zM3 5h5v1h-5zM2 6h7v1h-7zM2 7h7v1h-7zM2 8h7v1h-7zM3 9h2v1h-2zM6 9h2v1h-2z',
  star: 'M0 3h1v1h-1zM4 3h1v1h-1zM6 3h3v1h-3zM1 4h1v1h-1zM3 4h1v1h-1zM9 4h1v1h-1zM2 5h1v1h-1zM7 5h2v1h-2zM1 6h1v1h-1zM3 6h1v1h-1zM6 6h1v1h-1zM0 7h1v1h-1zM4 7h1v1h-1zM6 7h4v1h-4z',   // x2
  zoom: 'M7 2h1v1h-1zM0 3h3v1h-3zM7 3h2v1h-2zM7 4h3v1h-3zM1 5h4v1h-4zM7 5h4v1h-4zM7 6h3v1h-3zM0 7h3v1h-3zM7 7h2v1h-2zM7 8h1v1h-1z',   // speed lines
};
const glyphs = {};
const glyph = (k) => (glyphs[k] ||= new Path2D(GLYPH[k]));
const WINDOWS = ['ABOUT_ME.EXE', 'NCL_CASE.DOC', 'OBSERVE.EXE', 'DESIGN_WORK', 'MY_ART', 'RESUME.PDF', 'CONTACT.TXT', 'BRING_BACK.EXE'];

/* ---------- What she has done: the best run, and goals three at a time ---------- */
// Every goal is for one run. Finishing a set of three raises the multiplier every run starts with, from the next run on.
const GOALS = {
  pop: [(s) => 40 + 30 * s, (n) => `Pop ${n} bubbles`],
  run: [(s) => 400 + 300 * s, (n) => `Run ${n.toLocaleString('en-US')} m`],
  jump: [(s) => 10 + 5 * s, (n) => `Jump over ${n} things`],
  slide: [(s) => 6 + 4 * s, (n) => `Slide under ${n} bars`],
  power: [(s) => 2 + s, (n) => `Pick up ${n} power-ups`],
  clean: [(s) => 30 + 10 * s, (n) => `Run ${n} s clean`],
  ride: [(s) => 1 + Math.floor(s / 3), (n) => (n > 1 ? `Ride ${n} windows` : 'Ride a window')],
  score: [(s) => 4000 + 4000 * s, (n) => `Score ${n.toLocaleString('en-US')}`],
};
const ORDER = Object.keys(GOALS);
const goalsOf = (s) => [0, 1, 2].map((i) => { const k = ORDER[(s * 3 + i) % ORDER.length], n = GOALS[k][0](s); return { k, n, text: GOALS[k][1](n) }; });
const KEY = 'tahsin.run';
let save;
try { save = JSON.parse(localStorage.getItem(KEY)); } catch { /* private mode */ }
save = { best: 0, base: 1, set: 0, done: [0, 0, 0], ...save };
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };

/* ---------- The run ---------- */
let host = null, on = false, last = 0, sec = 0, speed = 0, dt = 0, nowAt = 0, calm = false;
export let dist = 0;   // r run so far: js/beats.js moves the road's rows with it
let wantJump = -1e9, landAt = -1e9, lane = 1, x = 1, fromX = 1, laneAt = -1e9, y = 0, air = null, slideTo = 0, swipe = null;
let things = [], pops = [], gifts = [], fx = [], toasts = [], next = 0, open = 1, giftAt = 8, bag = [];
let hitAt = -1e9, safeTo = 0, cleanFrom = 0, near = 1, eyeX = 0, caughtAt = 0, shownAt = 0, lid = null, meta = null;
let powers = {}, bubbles = 0, score = 0, worlds = 0, world = '', tally = {}, notes = null, rideName = '', endedAt = -1e9;
deck.audio.addEventListener('ended', () => { endedAt = performance.now(); });   // a song played out: only that earns the next OS its +1
const card = $('run-result'), coarse = matchMedia('(pointer: coarse)');
let runBase = 1, runSet = 0;   // fixed for a run: a finished set raises the multiplier from the next run
const mult = () => runBase + worlds;
const active = (k) => (powers[k] || 0) > nowAt;

export function start(h) {
  host = h; on = true; calm = host.still.matches;
  dist = sec = speed = 0; last = 0; next = 2.6; open = 1; giftAt = 8; bag = [];
  lane = 1; x = fromX = 1; laneAt = -1e9; y = 0; air = null; slideTo = 0; swipe = null;
  things = []; pops = []; gifts = []; fx = []; toasts = []; sparks.length = 0;
  hitAt = -1e9; safeTo = 0; cleanFrom = 0; near = 0; eyeX = 0; eyeFrom = null; eyeY = 0; caughtAt = 0; shownAt = 0;
  powers = {}; bubbles = score = worlds = 0; world = '';
  tally = { pop: 0, run: 0, jump: 0, slide: 0, power: 0, clean: 0, ride: 0, score: 0 };
  runBase = save.base; runSet = save.set; wantJump = -1e9;
  card.hidden = true;
  deck.audio.currentTime = 0; play().catch(() => {});   // every run starts its song from the top, so none starts near a song's end
  if (lid) lid = { open: true, at: performance.now() };   // after a catch, the eye opens on the new run
  notes = null;
  host.chart().then((data) => { notes = data?.notes?.map(([t, , , , midi = 60]) => [t, 440 * 2 ** ((midi - 69) / 12)]) || null; });
  kittyMeta().then((m) => { meta = m; });
  track('game_start', { game: 'kitty_run' });
}
export function stop() {
  if (on && !caughtAt && sec > 1) { report(); if (score > save.best) { save.best = Math.round(score); keep(); } }   // a run left part-way still counts
  on = false; card.hidden = true; lid = null;
  things = pops = gifts = fx = toasts = [];
}

function report() {
  const metres = Math.round(dist * METRES);
  track('game_score', { game: 'kitty_run', score: Math.round(score), bubbles, metres, worlds, seconds: Math.round(sec) });
}

/* ---------- Moving ---------- */
function move(dir) {
  const to = lane + dir;
  if (to < 0 || to > 2) return;
  const wall = things.find((t) => t.lane === to && !t.gone && blocks(t) && t.r < .06 && t.r + t.dep > -.05);
  if (wall) return hurt(wall);   // into the side of something: she bounces off it
  fromX = x; lane = to; laneAt = nowAt;
  sfx('lane', (U(to) - 2) / 3);
}
function jump() {
  if (active('ride')) return;
  if (air) { wantJump = nowAt; return; }   // pressed just before landing: she jumps as she lands
  slideTo = 0;
  air = { at: nowAt, ...(active('pounce') ? POUNCE : JUMP), big: active('pounce') };
  sfx('jump', undefined, air.big ? 1.15 : 1);
}
function duck() {
  if (active('ride')) return;
  if (air) air = { at: nowAt, dur: .12, peak: y, big: false, drop: true };   // down in the air: straight back down, then the slide
  if (slideTo < nowAt) sfx('duck');
  slideTo = nowAt + SLIDE * 1000;
}
export function key(e) {
  if (!on || caughtAt) return false;
  const k = e.key?.toLowerCase(), act = { arrowleft: () => move(-1), a: () => move(-1), arrowright: () => move(1), d: () => move(1),
    arrowup: jump, w: jump, ' ': jump, arrowdown: duck, s: duck }[k];
  if (!act) return false;
  if (e.type !== 'keydown' || e.repeat || !nowAt) return true;
  if (sec < INTRO && !calm) sec = INTRO;   // a key in the intro and she bolts
  act();
  return true;
}
// A swipe on a touch screen, or a drag with the mouse: whichever way it goes furthest, once it has gone 24 px.
export function pointer(e) {
  if (!on || caughtAt) return;
  if (e.type === 'pointerdown') { e.preventDefault(); swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false }; try { host.canvas.setPointerCapture(e.pointerId); } catch { /* fine */ } return; }
  if (!swipe || swipe.id !== e.pointerId) return;
  if (e.type !== 'pointermove') { swipe = null; return; }
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (swipe.used || Math.hypot(dx, dy) < 24) return;
  swipe.used = true;
  if (Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx)); else if (dy < 0) jump(); else duck();
}

/* ---------- What comes down the road ---------- */
// A row at a time, each in a lane next to the one left open by the row before, so there is always a way through.
// It gets harder: rows come closer, more lanes are shut, then bars and low things together, then things that come at her.
function row(z) {
  const tier = Math.min(4, Math.floor(sec / 18)), lanes = [0, 1, 2];
  open = clamp(open + pick(tier ? [-1, 0, 1] : [-1, 1]), 0, 2);
  const shut = lanes.filter((l) => l !== open), put = (l, kind, at = z) => things.push({ lane: l, kind, z: at, dep: DEPTH[kind], v: kind === 'mover' ? .9 + Math.random() * .5 : 0, r: SPAWN });
  const kinds = tier < 2 ? ['low', 'high', 'wall', 'bomb'] : ['low', 'high', 'wall', 'wall', 'bomb'];
  const roll = Math.random();
  if (tier >= 3 && roll < .22) {   // something coming at her, in a lane she isn't left with
    put(pick(shut), 'mover', z + 1.2);
    line(z, open, 6, 0);
  } else if (tier >= 2 && roll < .5) {   // all three: low ones to jump and bars to slide, never two walls and nothing else
    for (const l of lanes) put(l, l === open ? pick(['low', 'high', 'bomb']) : pick(kinds));
    const k = things[things.length - 3 + open].kind;
    if (k !== 'high') arc(z, open); else line(z - .35, open, 4, 0);
  } else if (tier >= 1 && roll < .8) {   // two lanes shut
    for (const l of shut) put(l, pick(kinds));
    line(z - .3, open, 6, 0);
  } else {   // one
    put(pick(shut), pick(kinds));
    line(z - .2, open, 5, 0);
  }
  const aloft = (powers.ride || 0) - nowAt > (z - dist) / Math.max(.5, speed) * 1000 + 300;   // still riding when this row reaches her
  if (aloft) for (const l of lanes) line(z - .2, l, 5, RIDE + .6);   // up there, the sky has bubbles too
  if (sec >= giftAt) {   // a power-up, in rotation, so one is always coming
    if (!bag.length) bag = ['shield', 'magnet', 'ride', 'pounce', 'star', 'zoom'].sort(() => Math.random() - .5);
    gifts.push({ lane: open, z: z - .6, kind: bag.pop(), h: aloft ? RIDE + .7 : .7, r: SPAWN });
    giftAt = sec + 11 + Math.random() * 6;
  }
}
const gap = () => Math.max(.55 * speed, 1.65 - .6 * clamp(sec / 240));
function line(z, l, n, h) { for (let i = 0; i < n; i++) pops.push({ u: U(l), z: z - i * .09, h: h + .5, r: SPAWN, pick: i }); }
function arc(z, l) {   // bubbles over a low thing, along the jump that clears it
  for (let i = 0; i < 7; i++) { const p = i / 6; pops.push({ u: U(l), z: z - .32 + p * .64, h: .5 + JUMP.peak * 4 * p * (1 - p) * .9, r: SPAWN, pick: i }); }
}
function blocks(t) {
  if (active('ride') || active('zoom')) return false;
  if (t.kind === 'low' || t.kind === 'bomb') return y < LOW;
  if (t.kind === 'high') return slideTo <= nowAt && y < BAR;
  return y < WALL;
}

/* ---------- Hits, the eye, and the catch ---------- */
function hurt(t) {
  if (nowAt < safeTo || caughtAt) return;
  t.gone = nowAt;
  if (active('shield')) { powers.shield = 0; safeTo = nowAt + SAFE; ring(1.6); spark('burst', U(x), dist, y + TALL / 2, .9); return; }   // the bubble takes it, and pops without a sound, like her bubbles
  if (nowAt - hitAt < AGAIN) return caught();
  hitAt = nowAt; safeTo = nowAt + SAFE; cleanFrom = sec;
  spark('hit', U(t.lane), dist + .02, .7, 1.2);
  host.shake(16); host.miss();
  sfx('stumble');
}
function caught() {
  caughtAt = nowAt; air = null; slideTo = 0;
  host.shake(10);
  sfx('caught', 0);
  report();
  const metres = Math.round(dist * METRES), was = save.best, best = Math.round(score) > was;
  if (best) save.best = Math.round(score);
  keep();
  $('run-h').textContent = 'Caught';
  $('run-p').textContent = `${metres.toLocaleString('en-US')} m and ${bubbles} bubble${bubbles === 1 ? '' : 's'}. Score ${Math.round(score).toLocaleString('en-US')}. ${best ? (was ? 'New best.' : '') : `Best ${was.toLocaleString('en-US')}.`}`.trim();
  const set = goalsOf(save.set);
  $('run-goals').innerHTML = set.map((g, i) => `<li${save.done[i] ? ' class="is-done"' : ''}><svg${save.done[i] ? '' : ' class="is-off"'} aria-hidden="true"><use href="#i-pixstar"/></svg>${g.text}<span class="vh">${save.done[i] ? ', done' : ''}</span></li>`).join('')
;
  $('run-next').textContent = `All three, and runs start at x${save.base + 1}.`;
}
let goalSet = null;
function goals() {   // checked as she goes; a finished goal says so at once
  if (save.set !== runSet) return;   // this run's set is finished: the next one starts with the next run
  const set = goalSet?.s === runSet ? goalSet.list : (goalSet = { s: runSet, list: goalsOf(runSet) }).list;
  set.forEach((g, i) => {
    if (save.done[i] || tally[g.k] < g.n) return;
    save.done[i] = 1; keep();
    toast(`GOAL ${save.done.filter(Boolean).length} OF 3`, 1800);
  });
  if (save.done.every(Boolean)) {
    save.set++; save.base++; save.done = [0, 0, 0]; keep();
    toast(`NEXT RUN: X${save.base}`, 2400);
  }
}
const toast = (text, life = 1800, her = false) => toasts.push({ text, at: nowAt, life, her });
// Her moves' sounds: one sprite per OS (assets/run/sfx-<os>.mp3, made by _dev/run_sfx.py in SoundCraft, through purpl), each
// sound's start and length in sfx.json. A world's sprite is fetched and decoded when the run first reaches it.
let lcd = null;   // this OS's LCD: its panel, its type and its glow, for the power-ups
let SFX = null;
const sprites = {};
fetch('assets/run/sfx.json').then((r) => r.json()).then((m) => { SFX = m; }).catch(() => {});
function sprite(id) {
  const s = sprites[id] ||= { buf: null };
  if (!s.p && SFX?.[id]) s.p = fetch(`assets/run/sfx-${id}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then(deck.decode).then((b) => { s.buf = b; }, () => { s.p = null; });
  return s.buf;
}
function sfx(kind, pan = (U(x) - 2) / 3, gain = 1) {
  const part = SFX?.[world]?.[kind];
  if (part) deck.clip(sprite(world), part[0], part[1], { gain, pan });
}
const ring = (size) => fx.push({ at: nowAt, life: 420, size });

// Pixel effects (pixelfx, built by _dev/run_fx in each OS's own colours): dust from her paws at every stride, a bigger puff
// when she lands, a spark when something hits her, a burst for a power-up and for the shield. Their pixels are the
// LCD's, scaled in whole pixels. Each sits on the road where it happened and fades as it falls behind. None under reduced motion.
let FX = null;
const fxSheets = {}, sparks = [];
fetch('assets/run/fx.json').then((r) => r.json()).then((m) => { FX = m; }).catch(() => {});
function fxSheet(id) {
  if (!FX) return null;
  const e = fxSheets[id] ||= { img: null };
  if (!e.p) e.p = fetch(`assets/run/${FX.file.replace('{os}', id)}`).then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => createImageBitmap(b)).then((b) => { e.img = b; }, () => { e.p = null; });
  return e.img;
}
function spark(kind, u, z, h = 0, size = 1) { if (FX?.effects[kind] && !calm && sparks.length < 40) sparks.push({ kind, u, z, h, size, at: nowAt }); }
function drawSparks(g, f, front) {
  const img = fxSheet(f.id);
  if (!img) return;
  g.save(); g.imageSmoothingEnabled = false;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i], e = FX.effects[s.kind], n = Math.floor((nowAt - s.at) / 1000 * e.fps);
    if (n >= e.frames) { sparks.splice(i, 1); continue; }
    if ((s.kind === 'hit' || s.kind === 'burst') !== front) continue;
    const r = s.z - dist, [px, py, k] = f.at(s.u, Math.max(r, f.stop)), unit = Math.max(1, Math.round(f.lane * k / 40 * s.size));   // one effect pixel: a whole number of canvas pixels
    g.globalAlpha = clamp(1 + r / .12);   // gone a third of the way back to the camera
    if (!g.globalAlpha) continue;
    g.drawImage(img, (n % e.cols) * e.w, e.y + Math.floor(n / e.cols) * e.h, e.w, e.h, px - e.pivot[0] * unit, py - s.h * f.lane * k - e.pivot[1] * unit, e.w * unit, e.h * unit);
  }
  g.restore();
}

/* ---------- Each frame ---------- */
function update(f) {
  nowAt = f.now; calm = f.calm;
  dt = last ? Math.min(.05, (nowAt - last) / 1000) : 0; last = nowAt;
  if (f.id !== world) {   // the song changed, and the OS with it
    if (world && nowAt - endedAt < 4000) { worlds++; endedAt = -1e9; toast(`X${mult()}  ${THEMES[f.id].name.toUpperCase()}`, 2400); }   // the arrows change the world, and add nothing
    world = f.id;
    eyeOf(world); kittySheet('run', world); sprite(world); fxSheet(world);
    const css = getComputedStyle(document.documentElement), v = (n) => css.getPropertyValue(n).trim();
    lcd = { bg: v('--lcd-bg'), fg: v('--lcd-fg'), glow: v('--lcd-glow') };
  }
  if (!caughtAt) sec += dt;
  const run = sec - INTRO * !calm;
  const want = run < 0 ? 0 : (V0 + (VMAX - V0) * (1 - Math.exp(-run / RAMP))) * (active('zoom') ? 1.7 : 1);
  speed += ((caughtAt ? 0 : want) - speed) * Math.min(1, dt * (caughtAt ? 6 : 3));
  dist += speed * dt;
  if (run > 0 && !caughtAt) { score += speed * dt * METRES * mult(); tally.run = Math.round(dist * METRES); tally.score = Math.round(score); tally.clean = Math.max(tally.clean, Math.floor(sec - cleanFrom)); }
  while (next < dist + SPAWN) { row(next); next += gap(); }

  // Her: across lanes in 220 ms, up and down on a jump's curve, carried by a window while one has her.
  x = fromX + (lane - fromX) * (1 - (1 - clamp((nowAt - laneAt) / HOP)) ** 3);
  if (air) {
    const p = (nowAt - air.at) / 1000 / air.dur;
    if (p >= 1) { if (!air.drop) spark('land', U(x), dist); air = null; landAt = nowAt; if (nowAt - wantJump < 140) jump(); } else y = air.drop ? air.peak * (1 - p) : air.peak * 4 * p * (1 - p);
  }
  const ride = powers.ride || 0;
  if (ride > nowAt) { const k = Math.min(clamp((nowAt - (ride - LAST.ride * 1000)) / 450), clamp((ride - nowAt) / 450)); y = RIDE * (1 - (1 - k) ** 3); if (ride - nowAt < 500) safeTo = Math.max(safeTo, nowAt + 600); }
  else if (!air) y = Math.max(0, y - dt * 8);

  // Everything moves toward her; what reaches her line is judged once.
  const cx = U(x);
  for (const t of things) {
    if (t.v) t.z -= t.v * dt * (caughtAt ? 0 : 1);
    t.r = t.z - dist;
    if (t.done || t.gone || t.r > .04) continue;
    if (Math.round(x) === t.lane && t.r + t.dep > -.04 && blocks(t)) { hurt(t); t.done = true; }
    else if (t.r + t.dep < -.04) {   // cleared
      t.done = true;
      if (Math.round(x) === t.lane && t.kind === 'high' && slideTo > nowAt - 100) tally.slide++;
      if (Math.round(x) === t.lane && (t.kind === 'low' || t.kind === 'bomb') && y >= LOW) tally.jump++;
    }
  }
  const pull = active('magnet');
  for (const b of pops) {
    b.r = b.z - dist;
    if (b.got) continue;
    if (pull && b.r < 1.2 && b.r > -.1) { const k = Math.min(1, dt * 6); b.u += (cx - b.u) * k; b.h += (y + .6 - b.h) * k; b.z -= (b.r - Math.max(0, b.r - .5)) * k * .4; }
    if (b.r < .06 && b.r > -.06 && Math.abs(b.u - cx) < .55 && Math.abs(b.h - (y + .6)) < .95 && !caughtAt) collect(b);
  }
  for (const p of gifts) {
    p.r = p.z - dist;
    if (!p.got && p.r < .06 && p.r > -.06 && Math.round(x) === p.lane && Math.abs(p.h - (y + .6)) < 1 && !caughtAt) power(p);
  }
  things = things.filter((t) => t.r > -.45); pops = pops.filter((b) => b.r > -.3 && !(b.got && nowAt - b.got > 300)); gifts = gifts.filter((p) => p.r > -.3 && !p.got);

  // The eye: out of sight while she runs clean, up at her heels after a stumble and falling back, over her when it has her.
  const chase = caughtAt ? 1 : active('zoom') ? 0 : clamp(1 - (nowAt - hitAt) / AGAIN);
  near += (chase - near) * Math.min(1, dt * (caughtAt ? 2.5 : 3));
  if (caughtAt && !lid && nowAt - caughtAt > STARE + CLOSE * .4) lid = { open: false, at: nowAt };   // it stares at you and shuts, then the screen's lids close
  if (caughtAt && !shownAt && nowAt - caughtAt > STARE + (calm ? 300 : 900)) {
    shownAt = nowAt; card.hidden = false;
    $('run-again').focus({ preventScroll: true });
  }
  if (run > 0 && !caughtAt) goals();
}
function collect(b) {
  b.got = nowAt;
  const v = active('star') ? 2 : 1;
  bubbles += v; tally.pop += v; score += 10 * v * mult();
  const t = deck.heard(), hz = notes ? near0(t) : 440 * 2 ** ([0, 2, 4, 7, 9][bubbles % 5] / 12), pan = (U(x) - 2) / 2.4;
  deck.sound((voice, burst) => WORLDS[world].sound(voice, burst, hz, 0, pan));
}
function near0(t) {   // the song's note nearest this moment, so the pops play along with it
  let lo = 0, hi = notes.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (notes[m][0] < t) lo = m + 1; else hi = m; }
  const a = notes[Math.max(0, lo - 1)], b = notes[lo];
  return (Math.abs(a[0] - t) < Math.abs(b[0] - t) ? a : b)[1];
}
function power(p) {
  p.got = nowAt; tally.power++;
  spark('burst', U(p.lane), p.z, p.h - .2, .6);   // within the chip's own size
  powers[p.kind] = nowAt + LAST[p.kind] * 1000;
  if (p.kind === 'ride') { tally.ride++; rideName = pick(WINDOWS); air = null; slideTo = 0; }
  if (p.kind === 'zoom') safeTo = Math.max(safeTo, powers.zoom + 600);
  toast(NAMES[p.kind], 1100, true);   // at her, like the play-along's PERFECT
  sfx(p.kind === 'zoom' ? 'zoom' : 'power');
}

/* ---------- Drawing ---------- */
export function draw(g, f) {
  if (!on) return;
  update(f);
  const w = WORLDS[f.id], items = [];
  for (const t of things) items.push([t.r + t.dep * .5, 0, t]);
  for (const b of pops) if (!b.got || nowAt - b.got < 300) items.push([b.r, 1, b]);
  for (const p of gifts) items.push([p.r, 2, p]);
  items.sort((a, b) => b[0] - a[0]);
  const ahead = items.filter((i) => i[0] >= 0), behind = items.filter((i) => i[0] < 0);
  const put = ([, type, o]) => (type === 0 ? thing(g, f, w, o) : type === 1 ? bubble(g, f, o) : gift(g, f, o));
  ahead.forEach(put);
  drawSparks(g, f, false);
  kitty(g, f);
  behind.forEach(put);
  drawSparks(g, f, true);
  if (active('zoom') && !calm) streaks(g, f);
  eye(g, f);
  stare(g, f);
  for (let i = fx.length - 1; i >= 0; i--) {   // a shield popping
    const e = fx[i], a = (nowAt - e.at) / e.life;
    if (a >= 1) { fx.splice(i, 1); continue; }
    const [px, py] = f.at(U(x), 0);
    g.save(); g.globalAlpha = 1 - a; g.strokeStyle = '#ffffff'; g.lineWidth = 3 * f.d * (1 - a) + 1;
    g.beginPath(); g.arc(px, py - (y + TALL / 2) * f.lane, f.lane * e.size * .5 * (1 + a * .6), 0, TAU); g.stroke(); g.restore();
  }
}

// Each thing is drawn once at a fixed size for its OS and kind, then scaled to how far off it is.
const SIZE = 256, kept = {};
function art(id, kind) {
  const key = id + kind;
  if (kept[key]) return kept[key];
  const c = document.createElement('canvas'); c.width = SIZE; c.height = Math.round(SIZE * SHAPE[kind]);
  const g = c.getContext('2d');
  if (kind === 'bomb') { const b = bomb(id); if (!b) return null; g.drawImage(b, SIZE * .22, c.height - SIZE * .58, SIZE * .56, SIZE * .56); }
  else KIT[id][kind](g, SIZE, c.height, WORLDS[id]);
  return (kept[key] = c);
}
document.fonts?.ready.then(() => { for (const key in kept) if (key.startsWith('ray')) delete kept[key]; });
function thing(g, f, w, t) {
  if (t.r > SPAWN) return;
  const [px, py, k] = f.at(U(t.lane), Math.max(t.r, f.stop)), bw = f.lane * 4 / 3 * .92 * k, img = art(f.id, t.kind);
  const fade = clamp((SPAWN - t.r) / .4) * (t.r < 0 ? clamp(1 + t.r / .35) : 1) * (t.gone ? clamp(1 - (nowAt - t.gone) / 250) : 1);
  if (!img || fade <= 0) return;
  g.globalAlpha = fade;
  if (!f.lite) { g.fillStyle = w.shade[0]; g.beginPath(); g.ellipse(px, py, bw * .5, bw * .12, 0, 0, TAU); g.fill(); }
  if (t.kind === 'bomb') {   // the play-along's bomb, over the same blinking red ring
    g.globalAlpha = fade * (calm ? 1 : .6 + .4 * Math.sin(nowAt / 70)); g.strokeStyle = '#ff3b30'; g.lineWidth = 3 * f.d * k + 1;
    g.beginPath(); g.ellipse(px, py, bw * .36, bw * .36 * f.lie, 0, 0, TAU); g.stroke();
  }
  g.globalAlpha = fade;
  const bh = bw * SHAPE[t.kind], knock = t.gone ? (nowAt - t.gone) / 250 : 0;
  if (knock) { g.save(); g.translate(px, py); g.rotate((t.lane - x || 1) * knock * .6); g.drawImage(img, -bw / 2, -bh, bw, bh); g.restore(); }
  else g.drawImage(img, px - bw / 2, py - bh, bw, bh);
  g.globalAlpha = 1;
}
let suds = null, sudsId = '';
function bubble(g, f, b) {
  if (b.r > SPAWN) return;
  if (sudsId !== f.id) { sudsId = f.id; suds = spritesFor(THEMES[f.id].fx) || [soap()]; }
  const [px, py, k] = f.at(b.u, Math.max(b.r, f.stop)), s = f.lane * .26 * k, got = b.got ? (nowAt - b.got) / 300 : 0;
  g.globalAlpha = clamp((SPAWN - b.r) / .4) * clamp(1 + b.r / .08) * (1 - got);   // gone by the time it passes her
  const r = s * (1 + got * .8) * (calm ? 1 : 1 + .05 * Math.sin(nowAt / 180 + b.pick));
  g.drawImage(suds[b.pick % suds.length], px - r, py - b.h * f.lane * k - r, r * 2, r * 2);
  g.globalAlpha = 1;
}
function gift(g, f, p) {   // a power-up: a chip of this OS's LCD with its glyph lit on it, the same glyph the HUD shows
  if (p.r > SPAWN || !lcd) return;
  const [px, py, k] = f.at(U(p.lane), Math.max(p.r, f.stop)), s = f.lane * .42 * k, cy = py - p.h * f.lane * k - (calm ? 0 : Math.sin(nowAt / 260) * s * .15);
  g.save(); g.globalAlpha = clamp((SPAWN - p.r) / .4);
  g.shadowColor = lcd.glow; g.shadowBlur = s * .6;
  round(g, px - s, cy - s, s * 2, s * 2, s * .3); g.fillStyle = lcd.bg; g.fill();
  g.shadowBlur = 0; g.lineWidth = Math.max(1, s * .07); g.strokeStyle = lcd.fg; g.stroke();
  const q = s * 1.2 / 11;
  g.translate(px - s * .6, cy - s * .6); g.scale(q, q); g.fillStyle = lcd.fg; g.shadowColor = lcd.glow; g.shadowBlur = 3 / q * f.d; g.fill(glyph(p.kind));
  g.restore();
}
function streaks(g, f) {   // zoomies: the world rushes past
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2 * f.d;
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996, p = (nowAt / 260 + i * .37) % 1, r0 = f.H * (.15 + p * .9), r1 = r0 + f.H * .18;
    g.beginPath(); g.moveTo(f.cx + Math.cos(a) * r0, f.hz + Math.sin(a) * r0 * .7); g.lineTo(f.cx + Math.cos(a) * r1, f.hz + Math.sin(a) * r1 * .7); g.stroke();
  }
  g.restore();
}

/* ---------- Her ---------- */
// From behind, from her own sheet per coat (<coat>-run.webp, described by kitty.json's run). Until it is in, the coat
// she had stays on, and before any is in she is drawn from the desktop's run, which is already loaded.
let coatOn = '', strideAt = 99;
function kitty(g, f) {
  const M = meta;
  if (!M) return;
  const B = M.run, want = B && M.coats.includes(f.id) ? f.id : M.coats[0];
  if (B && kittySheet('run', want).ok) coatOn = want;
  const back = B && coatOn && kittySheet('run', coatOn).ok;
  const S = back ? B : { cell: M.cell, cx: M.cx, floor: M.floor, cols: M.cols, tall: 150, actions: M.actions };
  const sheetOf = (a) => (back ? kittySheet('run', coatOn) : kittySheet(a.sheet, M.coats.includes(f.id) ? f.id : M.coats[0]));
  const run = sec - INTRO * !calm, ages = (nowAt - caughtAt) / 1000, A = S.actions, last = (k) => A[k].frames - 1;
  const cycle = (n, fps) => Math.floor(nowAt / 1000 * fps) % n, along = (k, p) => Math.min(last(k), Math.floor(clamp(p) * A[k].frames));
  let name = 'run', i = 0, flip = 1;
  if (caughtAt) { name = 'look_around'; i = along(name, ages / 1.1); }
  else if (!back) i = cycle(A.run.frames, 12);
  else if (run < 0) {   // she sits, looks back at the eye, and bolts
    const p = sec / INTRO;
    if (p < .3) { name = 'sit'; i = cycle(A.sit.frames, 8); } else if (p < .78) { name = 'look_around'; i = along(name, (p - .3) / .48); } else { name = 'stand_up'; i = along(name, (p - .78) / .22); }
  } else if (active('ride')) {   // up onto the window as it arrives, sitting on it as it flies, down as it goes
    const kin = clamp((nowAt - (powers.ride - LAST.ride * 1000)) / 450), kout = clamp((powers.ride - nowAt) / 450);
    if (kin < 1) { name = 'leap'; i = 3; } else if (kout < 1) { name = 'leap'; i = 6; } else { name = 'sit'; i = cycle(A.sit.frames, 8); }
  } else if (air) {   // the leap: push, stretch, tuck, head down, reach, and the front paws touch down
    name = 'leap'; i = air.drop ? 7 : 1 + Math.min(6, Math.floor(clamp((nowAt - air.at) / 1000 / air.dur) * 7));
  } else if (nowAt - landAt < 160) { name = 'leap'; i = 8 + (nowAt - landAt > 80); }   // and the hind paws land, and she runs on
  else if (nowAt - hitAt < 600) { name = 'stumble'; i = along(name, (nowAt - hitAt) / 600); }
  else if (slideTo > nowAt) { name = 'duck'; i = along(name, 1 - (slideTo - nowAt) / (SLIDE * 1000)); }
  else if (nowAt - laneAt < HOP) { name = 'hop'; i = along(name, (nowAt - laneAt) / HOP); flip = lane > fromX ? 1 : -1; }   // the clip hops right: mirrored for left
  else if (active('zoom')) { name = 'sprint'; i = cycle(A.sprint.frames, 32); }
  else i = cycle(A.run.frames, 22 * Math.sqrt(Math.max(.7, speed / V0)));   // a gallop: two to three strides a second
  if (calm && !caughtAt && (name === 'run' || name === 'sprint')) i = 0;
  if ((name === 'run' || name === 'sprint') && i < strideAt && !y) spark('puff', U(x), dist);   // a new stride: the hind paws strike
  strideAt = name === 'run' || name === 'sprint' ? i : 99;
  const a = S.actions[name], img = sheetOf(a);
  if (!img?.ok) return;
  const [px, py] = f.at(U(x), 0), sc = f.lane * TALL / S.tall, n = a.first + i, [cw, ch] = S.cell;
  if (!f.lite) { g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(px, py, f.lane * .42 / (1 + y * .4), f.lane * .1 / (1 + y * .4), 0, 0, TAU); g.fill(); }
  if (active('ride')) {
    const kin = clamp((nowAt - (powers.ride - LAST.ride * 1000)) / 450), kout = clamp((powers.ride - nowAt) / 450);
    carpet(g, f, RIDE, kin < 1 ? -.9 * (1 - kin) ** 2 : kout < 1 ? -.9 * (1 - kout) : 0, Math.min(1, kout * 2));
  }
  const hurtNow = nowAt - hitAt > 600 && nowAt - hitAt < SAFE && !calm && !caughtAt;   // after the stumble, she flickers until she can be hit again
  g.save();
  g.globalAlpha = hurtNow && Math.floor(nowAt / 80) % 2 ? .5 : 1;
  g.translate(px, py - y * f.lane);
  g.rotate((lane - x) * -.08);
  g.scale(sc * flip, sc);
  g.drawImage(img.img, (n % S.cols) * cw, Math.floor(n / S.cols) * ch, cw, ch, -S.cx, -S.floor, cw, ch);
  g.restore();
  if (active('shield')) {   // in Aero she runs inside one of the site's bubbles; elsewhere inside a ring of that world's light
    const s = f.lane * TALL * .78 * (calm ? 1 : 1 + .03 * Math.sin(nowAt / 150)), cy = py - y * f.lane - f.lane * TALL * .5, fade = Math.min(1, (powers.shield - nowAt) / 1500);
    g.save(); g.globalAlpha = .8 * fade;
    if (f.id === 'aero') g.drawImage(soapOnce(), px - s, cy - s, s * 2, s * 2);
    else if (lcd) { g.shadowColor = lcd.glow; g.shadowBlur = 12 * f.d; g.lineWidth = 3 * f.d; g.strokeStyle = lcd.fg; g.beginPath(); g.ellipse(px, cy, s * .9, s, 0, 0, TAU); g.stroke(); g.lineWidth = f.d; g.globalAlpha *= .6; g.beginPath(); g.ellipse(px, cy, s * .82, s * .92, 0, -2.4, -1.4); g.stroke(); }   // the LCD's own ink: Baroque's gold, Vaporwave's pink
    g.restore();
  }
  if (active('magnet')) {   // and the OS's own bubble wand, beside her
    const wand = wandOf(f.id), s = f.lane * .55;
    if (wand) { g.save(); g.translate(px + f.lane * .7, py - y * f.lane - f.lane * TALL * .8 + (calm ? 0 : Math.sin(nowAt / 200) * s * .1)); g.drawImage(wand, -s / 2, -s / 2, s, s); g.restore(); }
  }
}
let soapC = null;
const soapOnce = () => (soapC ||= soap());

// The window ride: one of her site's windows, in this OS's own chrome, swoops in from behind and carries her over
// everything, lying flat under her like a carpet. It is painted once as a picture, then laid along the road in slices
// at its height, so it sits in the world's own perspective, with its shadow on the road below.
let pane = null, paneKey = '';
function paneArt(id) {
  if (paneKey === id + rideName) return pane;
  paneKey = id + rideName;
  const css = getComputedStyle(document.documentElement), v = (n) => css.getPropertyValue(n).trim();
  const W = 480, H = 330, bar = 96, r = Math.min(24, (parseFloat(v('--win-top')) || 0) * 1.6), c = pane ||= document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), gloss = v('--gloss'), stops = gloss.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) || [];
  round(g, 2, 2, W - 4, H - 4, r); g.fillStyle = lin(g, 0, 0, 0, H, v('--putty-1'), v('--putty-2')); g.fill();   // the frame
  g.lineWidth = 3; g.strokeStyle = v('--putty-4'); g.stroke();
  g.save(); round(g, 2, 2, W - 4, H - 4, r); g.clip();
  g.fillStyle = lin(g, 0, 0, 0, bar, v('--glass-a'), v('--glass-b')); g.fillRect(0, 0, W, bar);   // the title bar, as .win__bar paints it
  if (/90deg/.test(gloss) && stops.length > 1) { g.fillStyle = lin(g, 0, 0, W, 0, ...stops); g.fillRect(0, 0, W, bar); }
  else if (stops.length > 2) { const p = g.createLinearGradient(0, 0, 0, bar); stops.slice(0, 3).forEach((col, i) => p.addColorStop([0, .47, .5][i], col)); g.fillStyle = p; g.fillRect(0, 0, W, bar); }
  g.fillStyle = v('--bar-edge'); g.fillRect(0, bar - 2, W, 2);
  g.fillStyle = v('--sheet'); g.fillRect(12, bar + 8, W - 24, H - bar - 20);   // the page inside: that window's own heading and words
  const win = document.querySelector(`[data-file="${rideName}"]`), head = $(win?.getAttribute('aria-labelledby'))?.textContent.trim() || '';
  const para = [...(win?.querySelectorAll('p') || [])].find((el) => !el.hidden && !el.classList.contains('meta') && el.textContent.trim());   // its first real paragraph
  const words = (para?.textContent || '').replace(/[^.]*JavaScript[^.]*\.?/g, '').trim().split(/\s+/).filter(Boolean);   // not the no-JavaScript note
  g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillStyle = v('--heading'); g.font = `700 38px ${v('--display')}`; g.fillText(head, 30, bar + 24, W - 60);
  g.fillStyle = v('--ink-2'); g.font = `22px ${v('--body')}`;
  for (let i = 0, line = '', y = bar + 76; i <= words.length && y < H - 34; i++) {
    const next = line ? `${line} ${words[i] || ''}` : words[i] || '';
    if (i === words.length || g.measureText(next).width > W - 60) { g.fillText(line, 30, y); line = words[i] || ''; y += 30; } else line = next;
  }
  g.restore();
  g.fillStyle = v('--bar-text'); g.font = `${Math.round(bar * .42)}px ${v('--pixel')}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(rideName, 22, bar * .52, W - 44);
  return c;
}
function carpet(g, f, h, slide, alpha) {   // tilted up toward the far end, as a carpet lifts, so its face reads
  const mid = clamp(U(x), .66, 3.34), img = paneArt(f.id), u0 = mid - .66, u1 = mid + .66, far = .3 + slide, near = -.05 + slide, hf = h + .7, hn = h - .4;   // kept over the road
  g.save(); g.globalAlpha = alpha;
  if (!f.lite) {   // a soft shadow on the road below
    const [sx, sy, sk] = f.at(U(x), .08 + slide), rx = f.lane * .9 * sk, sh = g.createRadialGradient(sx, sy, 0, sx, sy, rx);
    sh.addColorStop(0, 'rgba(0,0,0,.22)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(sx, sy); g.scale(1, .3); g.translate(-sx, -sy); g.fillStyle = sh; g.fillRect(sx - rx, sy - rx, rx * 2, rx * 2); g.restore();
  }
  let N = 1;
  const edge = (u, i) => { const r = far + (near - far) * i / N, p = f.at(u, r); return [p[0], p[1] - (hf + (hn - hf) * i / N) * f.lane * p[2]]; };
  N = clamp(Math.ceil((edge(u0, 1)[1] - edge(u0, 0)[1]) / (2 * f.d)), 24, 240);   // a slice every two pixels, so the words don't shear
  g.save(); g.beginPath();   // its outline, so the slices below meet in clean edges
  for (let i = 0; i <= N; i++) g.lineTo(...edge(u0, i));
  for (let i = N; i >= 0; i--) g.lineTo(...edge(u1, i));
  g.clip();
  for (let i = 0; i < N; i++) {   // far end (the title bar) first, slice by slice toward her, each as wide as its nearer edge
    const [ax, ay] = edge(u0, i), [bx, by] = edge(u0, i + 1), [cx] = edge(u1, i + 1);
    g.drawImage(img, 0, img.height * i / N, img.width, img.height / N, bx, ay, cx - bx, by - ay + 1);
  }
  g.restore();
  g.beginPath(); for (let i = 0; i <= N; i++) g.lineTo(...edge(u0, i)); for (let i = N; i >= 0; i--) g.lineTo(...edge(u1, i)); g.closePath();   // its frame, drawn once along the outline
  g.lineWidth = Math.max(1, 1.5 * f.d); g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--putty-4'); g.stroke();
  g.restore();
}

/* ---------- The eye: a 3D eyeball in each OS's skin (_dev/kitty/blender/eyeball.py), seen from behind, from assets/run ---------- */
// chase: a wobbling loop as it flies after her; look: turned toward her lane. It is out of sight until she stumbles.
// When it has her it surfaces straight up the middle of the screen, turning as it comes (turn), and stares at the visitor
// dead on, the world dimmed behind it (stare), the desktop looking back through the fourth wall; then it shuts (shut).
const SURFACE = 550, STARE = 2100, CLOSE = 250;   // ms after the catch: up and round, staring, its lids closing
let EYE = null, eyeSkin = '', eyeY = 0, eyeS = 0, eyeFrom = null;
const eyeSheets = {};
fetch('assets/run/eye.json').then((r) => r.json()).then((m) => { EYE = m; }).catch(() => {});
function eyeOf(id) {
  if (!EYE) return null;
  const skin = EYE.skins.includes(id) ? id : EYE.skins[0], e = eyeSheets[skin] ||= { img: null };
  if (!e.p) e.p = fetch(`assets/run/${EYE.file.replace('{skin}', skin)}`).then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => createImageBitmap(b)).then((b) => { e.img = b; }, () => { e.p = null; });
  if (e.img) eyeSkin = skin;
  return eyeSheets[eyeSkin]?.img || null;   // until a new OS's skin is in, the one it had
}
function eye(g, f) {
  if (!caughtAt) eyeY = 0;   // out of sight unless drawn below: then a catch brings it up from under the bottom edge
  const img = eyeOf(f.id);
  if (!img || (near < .01 && !caughtAt)) return;
  const s = Math.min(f.W * .38, f.H * .42) * (1 + .04 * beat.pulse), ball = s * .65, [kx] = f.at(U(x), 0), A = EYE.actions;   // the ball is 0.65 of its cell: room for the cord
  eyeX = eyeX ? eyeX + (kx - eyeX) * Math.min(1, dt * 2.5) : kx;   // it follows her lane, a beat behind
  const rest = f.H + ball * 1.1, cy = rest - (f.H - f.yHit + ball * .05) * near + (calm ? 0 : Math.sin(nowAt / 420) * ball * .04);   // hidden at 0, its top at her heels at 1, over her when it has her
  if (cy - ball > f.H && !caughtAt) return;
  const lean = clamp((kx - eyeX) / (f.lane * 1.2), -1, 1), [cw, ch] = EYE.cell, frame = (n, x0, y0, s0) => g.drawImage(img, (n % EYE.cols) * cw, Math.floor(n / EYE.cols) * ch, cw, ch, x0 - s0, y0 - s0, s0 * 2, s0 * 2);
  if (!caughtAt) { eyeFrom = null; eyeY = cy; eyeS = s; frame(Math.abs(lean) > .3 ? A.look.first + Math.round(2 + 2 * lean) : A.chase.first + (calm ? 0 : Math.floor(nowAt / 100) % A.chase.frames), eyeX, cy, s); }
}
// It has her: up from wherever it was (or from under the bottom edge) to the middle of the screen, big, facing the visitor.
function stare(g, f) {
  const img = eyeOf(f.id);
  if (!img || !caughtAt) return;
  const A = EYE.actions, [cw, ch] = EYE.cell, age = nowAt - caughtAt, big = Math.min(f.W * .5, f.H * .62);
  eyeFrom ||= { x: eyeX || f.cx, y: Math.min(eyeY || Infinity, f.H + big * .7), s: eyeS || big * .6 };
  const k = calm ? 1 : 1 - (1 - clamp(age / SURFACE)) ** 3, x0 = eyeFrom.x + (f.cx - eyeFrom.x) * k, y0 = eyeFrom.y + (f.H * .5 - eyeFrom.y) * k, s0 = eyeFrom.s + (big - eyeFrom.s) * k;
  g.save(); g.globalAlpha = .55 * clamp(age / SURFACE); g.fillStyle = '#040b1c'; g.fillRect(0, 0, f.W, f.H); g.restore();   // the world falls back behind it, in the lids' own dark
  const n = age < SURFACE && !calm ? A.turn.first + Math.min(A.turn.frames - 1, Math.floor(age / SURFACE * A.turn.frames))
    : age < STARE ? A.stare.first + Math.min(A.stare.frames - 1, Math.floor((age - SURFACE) / 80))
    : A.shut.first + Math.min(A.shut.frames - 1, Math.floor((age - STARE) / (CLOSE / A.shut.frames)));
  g.drawImage(img, (n % EYE.cols) * cw, Math.floor(n / EYE.cols) * ch, cw, ch, x0 - s0, y0 - s0, s0 * 2, s0 * 2);
}
const wands = {};
function wandOf(id) {
  const w = wands[id] ||= { img: null };
  if (!w.img) {
    const m = getComputedStyle(document.documentElement).getPropertyValue('--cur-wand').match(/url\("(data:[^"]+)"\)/);
    if (m) { w.img = new Image(); w.img.src = m[1]; }
  }
  return w.img?.complete && w.img.naturalWidth ? w.img : null;
}

/* ---------- On top: the score, what she has on, the help, and the lids ---------- */
export function hud(g, f, font) {
  if (!on) return;
  const { W, H, d, type, top, ink, glow } = f, run = sec - INTRO * !calm;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  font(g, `${type}px ${f.font}`); g.fillStyle = ink; g.textBaseline = 'top'; g.shadowColor = glow; g.shadowBlur = 6 * d;
  g.lineJoin = 'round'; g.lineWidth = 3 * d; g.strokeStyle = glow;   // a stroke of its glow under the type, so it reads over a white cloud
  const icon = 14 * d, col = icon + type * 1.5, say = (text, x0, y0, align) => { g.textAlign = align; g.strokeText(text, x0, y0); g.fillText(text, x0, y0); };
  if (sudsId === f.id && suds) g.drawImage(suds[0], icon, top - type * .1, type * 1.2, type * 1.2);
  say(String(bubbles), col, top, 'left');
  say(`x${mult()}  ${Math.round(score).toLocaleString('en-US')}`, W - 14 * d, top, 'right');
  let row = top + type * 1.5;
  const q = type * 1.2 / 11;
  for (const k of ['shield', 'magnet', 'ride', 'pounce', 'star', 'zoom']) {   // what she has on, and how long it lasts
    const left = clamp(((powers[k] || 0) - nowAt) / (LAST[k] * 1000));
    if (!left) continue;
    g.save(); g.translate(icon, row - type * .1); g.scale(q, q); g.fill(glyph(k)); g.restore();
    g.globalAlpha = .25; g.fillRect(col, row + type * .35, type * 4, type * .3); g.globalAlpha = 1; g.fillRect(col, row + type * .35, type * 4 * left, type * .3);
    row += type * 1.4;
  }
  // How far through this OS's song: the next OS comes when it ends.
  const a = deck.audio, part = a.duration ? clamp(a.currentTime / a.duration) : 0;
  g.shadowBlur = 0; g.globalAlpha = .25; g.fillRect(0, 0, W, 2 * d); g.globalAlpha = .9; g.fillRect(0, 0, W * part, 2 * d); g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = 6 * d;
  const mid = f.hz + (f.yHit - f.hz) * .38;
  g.fillStyle = ink; g.shadowColor = glow; const wide = W - 28 * d;
  if (run < 2.5 && !caughtAt) {   // how to play, until she is well away
    g.globalAlpha = clamp((2.5 - run) / .6);
    g.fillText(coarse.matches ? 'SWIPE TO DODGE' : 'ARROWS OR W A S D: DODGE', f.cx, mid - type * .7, wide);
    g.fillText('POP THE BUBBLES', f.cx, mid + type * .7, wide);
    g.globalAlpha = 1;
  }
  while (toasts.length && nowAt - toasts[0].at > toasts[0].life) { toasts.shift(); if (toasts[0]) toasts[0].at = nowAt; }   // one at a time
  const t = toasts[0];
  if (t) {
    const age = (nowAt - t.at) / t.life, [px, py] = f.at(U(x), 0), y0 = t.her ? py - (y + TALL + .5) * f.lane : mid - (run < 2.5 ? type * 2.4 : 0);
    g.globalAlpha = age < .8 ? 1 : (1 - age) / .2;
    g.fillText(t.text, t.her ? clamp(px, type * 5, W - type * 5) : f.cx, y0 - (calm ? 0 : age * type * .6), wide);
  }
  g.globalAlpha = 1; g.shadowBlur = 0;
  lids(g, f);
}
// The site's own eyelids (the boot screen's, in js/main.js, with its shapes and colours): they shut once the eye has her,
// over 800 ms as at shutdown, and open on the next run.
function lids(g, f) {
  if (!lid) return;
  const k = calm ? 1 : clamp((nowAt - lid.at) / (lid.open ? 600 : 800)), e = 1 - (1 - k) ** 4, h = 190 * (lid.open ? e : 1 - e);
  if (lid.open && k >= 1) { lid = null; return; }
  const { W, H } = f, sx = W / 100, sy = H / 100, open = new Path2D();
  open.moveTo(-5 * sx, 50 * sy); open.quadraticCurveTo(50 * sx, (50 - h) * sy, 105 * sx, 50 * sy); open.quadraticCurveTo(50 * sx, (50 + h) * sy, -5 * sx, 50 * sy); open.closePath();
  const shut = new Path2D(); shut.rect(-1, -1, W + 2, H + 2); shut.addPath(open);
  g.fillStyle = '#040b1c'; g.fill(shut, 'evenodd');
  if (h > 1) { g.strokeStyle = '#7fd0ff'; g.lineWidth = 1.5 * f.d; g.stroke(open); }
}

$('run-again').addEventListener('click', () => { if (!on) return; host.flash(); start(host); host.canvas.focus({ preventScroll: true }); });
$('run-along').addEventListener('click', () => host?.back());
$('run-done').addEventListener('click', () => host?.done());

/* ---------- Each OS's obstacles, drawn the way its world is ---------- */
// low: jump it. high: a bar to slide under (from 0.8 to 1.3 lanes up, the top 6 to 42% of its picture). wall: go round it.
// mover: a wall that comes at her. Each OS also has its play-along bomb as a second low thing. Drawn at SIZE wide.
const stripes = (g, x, y, w, h, a, b, n = 6) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = a; g.fillRect(x, y, w, h); g.fillStyle = b; for (let i = -2; i < n + 2; i++) { const s = w / n; poly(g, [[x + i * s, y + h], [x + i * s + s * .5, y + h], [x + i * s + s * .5 + h * .6, y], [x + i * s + h * .6, y]]); g.fill(); } g.restore(); };
const posts = (g, S, h, from, color, w = .06) => { g.fillStyle = color; for (const p of [w, 1 - w]) g.fillRect(S * p - S * w / 2, h * from, S * w, h * (1 - from)); };
const KIT = {
  aero: {   // glass and gel
    low(g, S, h, w) { posts(g, S, h, .5, lin(g, 0, 0, 0, h, 'rgba(255,255,255,.9)', 'rgba(150,215,255,.6)'), .07); gel(g, S * .03, h * .06, S * .94, h * .56, w.hands[0]); },
    high(g, S, h, w) { posts(g, S, h, .2, lin(g, 0, 0, 0, h, 'rgba(255,255,255,.85)', 'rgba(140,210,255,.5)'), .06); gel(g, S * .01, h * .06, S * .98, h * .36, w.hands[1]); },
    wall(g, S, h) {
      round(g, S * .04, h * .02, S * .92, h * .96, S * .08); g.fillStyle = lin(g, 0, 0, 0, h, 'rgba(236,250,255,.92)', 'rgba(170,225,255,.85)', 'rgba(100,190,250,.8)'); g.fill();
      g.save(); g.clip(); g.fillStyle = lin(g, 0, 0, 0, h * .5, 'rgba(255,255,255,.6)', 'rgba(255,255,255,.15)'); g.fillRect(0, 0, S, h * .5); g.restore();   // the gloss stops hard at halfway
      g.strokeStyle = '#0a5cb8'; g.lineWidth = S * .03; g.stroke();
      g.save(); g.clip(); g.fillStyle = lin(g, 0, 0, 0, h * .12, 'rgba(16,106,206,.9)', 'rgba(6,66,150,.95)'); g.fillRect(0, 0, S, h * .12); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(0, 0, S, h * .055); g.restore();   // a glass title band, as a window's
      const b = soap(); for (const [u, v, r] of [[.3, .66, .1], [.62, .78, .07], [.7, .4, .05]]) g.drawImage(b, S * u - S * r, h * v - S * r, S * r * 2, S * r * 2);
    },
    mover(g, S, h, w) {   // a glass pod gliding over the causeway, its lamps lit
      gel(g, S * .04, h * .3, S * .92, h * .62, w.hands[1]);
      round(g, S * .16, h * .36, S * .68, h * .2, h * .08); g.fillStyle = 'rgba(6,48,107,.55)'; g.fill();
      g.globalCompositeOperation = 'lighter'; for (const p of [.2, .8]) { blob(g, S * p, h * .72, S * .18, '217,251,255', .8); blob(g, S * p, h * .72, S * .05, '255,255,255', 1); }
    },
  },
  vapor: {   // marble, with neon edges
    low(g, S, h) {
      round(g, S * .03, h * .14, S * .94, h * .78, h * .3); g.fillStyle = lin(g, 0, h * .14, 0, h * .92, '#ffffff', '#f6ecff', '#cdb6ee', '#7a62a8'); g.fill();
      g.strokeStyle = 'rgba(80,50,130,.35)'; g.lineWidth = S * .012; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(S * .1, h * (.14 + i * .156)); g.lineTo(S * .9, h * (.14 + i * .156)); g.stroke(); }
      g.strokeStyle = '#ff71ce'; g.lineWidth = S * .018; round(g, S * .03, h * .14, S * .94, h * .78, h * .3); g.stroke();
    },
    high(g, S, h) {
      column(g, S * .1, h, h * .58, S * .13); column(g, S * .9, h, h * .58, S * .13);
      g.fillStyle = lin(g, 0, h * .06, 0, h * .42, '#ffffff', '#e8dcff', '#a891d6'); g.fillRect(0, h * .06, S, h * .36);
      g.fillStyle = '#ff71ce'; g.fillRect(0, h * .06, S, h * .025); g.fillStyle = '#01cdfe'; g.fillRect(0, h * .395, S, h * .025);
    },
    wall(g, S, h) {
      g.fillStyle = '#20093f'; g.fillRect(S * .14, h * .6, S * .72, h * .4);
      g.strokeStyle = 'rgba(255,113,206,.7)'; g.lineWidth = S * .01; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(S * .14, h * (.6 + i * .066)); g.lineTo(S * .86, h * (.6 + i * .066)); g.stroke(); g.beginPath(); g.moveTo(S * (.14 + i * .12), h * .6); g.lineTo(S * (.14 + i * .12), h); g.stroke(); }
      const marble = lin(g, S * .2, 0, S * .8, 0, '#8d76bd', '#f6ecff', '#ffffff', '#cdb6ee', '#7a62a8');
      g.fillStyle = marble; g.beginPath(); g.moveTo(S * .08, h * .6); g.quadraticCurveTo(S * .12, h * .4, S * .38, h * .38); g.lineTo(S * .62, h * .38); g.quadraticCurveTo(S * .88, h * .4, S * .92, h * .6); g.fill();   // shoulders
      g.fillRect(S * .4, h * .28, S * .2, h * .14);   // neck
      g.beginPath(); g.ellipse(S * .5, h * .18, S * .2, h * .16, 0, 0, TAU); g.fill();   // the head
      g.fillStyle = '#01cdfe'; g.fillRect(S * .3, h * .14, S * .4, h * .045);   // a band of light across the eyes
    },
    mover(g, S, h) {
      const c = S / 2, cy = h - S / 2;
      g.fillStyle = rad(g, c - S * .1, cy - S * .1, S * .5, '#ffffff', '#e8dcff', '#a891d6'); g.beginPath(); g.arc(c, cy, S * .47, 0, TAU); g.fill();
      g.fillStyle = 'rgba(80,50,130,.4)'; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.beginPath(); g.arc(c + Math.cos(a) * S * .44, cy + Math.sin(a) * S * .44, S * .025, 0, TAU); g.fill(); }
      g.strokeStyle = '#ff71ce'; g.lineWidth = S * .02; g.beginPath(); g.arc(c, cy, S * .47, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(80,50,130,.35)'; g.beginPath(); g.arc(c, cy, S * .2, 0, TAU); g.stroke();
    },
  },
  baroque: {   // brass, velvet, oak and candlelight
    low(g, S, h, w) {
      for (const p of [.08, .92]) {
        g.fillStyle = lin(g, S * p - S * .04, 0, S * p + S * .04, 0, ...w.hands[1].slice().reverse(), w.hands[1][0]); g.fillRect(S * p - S * .03, h * .2, S * .06, h * .74);
        g.beginPath(); g.arc(S * p, h * .2, S * .055, 0, TAU); g.fill(); g.beginPath(); g.ellipse(S * p, h * .95, S * .1, h * .05, 0, 0, TAU); g.fill();
      }
      g.strokeStyle = lin(g, 0, h * .3, 0, h * .8, w.hands[0][1], w.hands[0][2]); g.lineWidth = S * .07; g.lineCap = 'round';
      g.beginPath(); g.moveTo(S * .1, h * .32); g.quadraticCurveTo(S * .5, h * .9, S * .9, h * .32); g.stroke();
    },
    high(g, S, h) { chandelier(g, S / 2, h * .36, S * .42, 0, .25); },
    wall(g, S, h) {
      ogive(g, S / 2, h, S * .48, h * .42, 0); g.fillStyle = '#3a2f2a'; g.fill();
      ogive(g, S / 2, h, S * .38, h * .45, h * .07); g.fillStyle = lin(g, 0, 0, S, 0, '#2a160a', '#5a3218', '#2a160a'); g.fill();
      g.strokeStyle = '#120a07'; g.lineWidth = S * .03; for (const v of [.62, .82]) { g.beginPath(); g.moveTo(S * .12, h * v); g.lineTo(S * .88, h * v); g.stroke(); }
      rose(g, S / 2, h * .3, S * .15);
      g.strokeStyle = '#f0c055'; g.lineWidth = S * .02; g.beginPath(); g.arc(S * .66, h * .72, S * .04, 0, TAU); g.stroke();
    },
    mover(g, S, h) {   // a cask, rolling down the nave
      const c = S / 2, cy = h - S / 2;
      g.fillStyle = rad(g, c, cy, S * .48, '#8a5a2b', '#6b4220', '#3e240f'); g.beginPath(); g.arc(c, cy, S * .47, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(30,15,5,.6)'; g.lineWidth = S * .012; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(c + i * S * .12, cy - S * .45); g.lineTo(c + i * S * .12, cy + S * .45); g.stroke(); }
      g.strokeStyle = '#1b1512'; g.lineWidth = S * .05; for (const r of [.47, .3]) { g.beginPath(); g.arc(c, cy, S * r, 0, TAU); g.stroke(); }
      g.fillStyle = '#f0c055'; g.beginPath(); g.arc(c, cy, S * .05, 0, TAU); g.fill();
    },
  },
  ghost: {   // hazard paint and neon
    low(g, S, h) { posts(g, S, h, .6, '#16181c', .05); stripes(g, S * .02, h * .1, S * .96, h * .55, '#fcee0a', '#0b0b0e', 7); g.strokeStyle = '#19f7ff'; g.shadowColor = '#19f7ff'; g.shadowBlur = S * .04; g.lineWidth = S * .015; g.strokeRect(S * .02, h * .1, S * .96, h * .55); },
    high(g, S, h) {
      g.strokeStyle = '#2a2e33'; g.lineWidth = S * .012; for (const p of [.2, .8]) { g.beginPath(); g.moveTo(S * p, 0); g.lineTo(S * p, h * .08); g.stroke(); }
      round(g, S * .03, h * .06, S * .94, h * .36, S * .03); g.fillStyle = '#07090c'; g.fill();
      g.save(); g.strokeStyle = '#ff2bd6'; g.shadowColor = '#ff2bd6'; g.shadowBlur = S * .05; g.lineWidth = S * .018; g.stroke();
      g.strokeStyle = '#19f7ff'; g.shadowColor = '#19f7ff'; g.lineWidth = S * .022; g.lineCap = 'square';
      for (let i = 0; i < 5; i++) { const x0 = S * (.12 + i * .16); g.beginPath(); g.moveTo(x0, h * .14); g.lineTo(x0 + S * .08, h * .14); g.lineTo(x0 + S * .08, h * (.22 + (i % 2) * .08)); g.lineTo(x0, h * .34); g.stroke(); }
      g.restore();
    },
    wall(g, S, h) {
      round(g, S * .03, h * .02, S * .94, h * .96, S * .02); g.fillStyle = 'rgba(8,40,46,.72)'; g.fill();
      g.save(); g.clip(); g.strokeStyle = 'rgba(25,247,255,.35)'; g.lineWidth = S * .008;
      for (let j = 0; j < 12; j++) for (let i = 0; i < 5; i++) { const cx = S * (.1 + i * .2 + (j % 2) * .1), cy = h * (.05 + j * .085), r = S * .07; poly(g, Array.from({ length: 6 }, (_, k) => [cx + Math.cos(k * 1.047) * r, cy + Math.sin(k * 1.047) * r])); g.stroke(); }
      g.restore();
      g.save(); g.strokeStyle = '#ff003c'; g.shadowColor = '#ff003c'; g.shadowBlur = S * .06; g.lineWidth = S * .06; g.lineCap = 'square';
      g.beginPath(); g.moveTo(S * .3, h * .35); g.lineTo(S * .7, h * .62); g.moveTo(S * .7, h * .35); g.lineTo(S * .3, h * .62); g.stroke(); g.restore();
      g.strokeStyle = '#19f7ff'; g.lineWidth = S * .015; round(g, S * .03, h * .02, S * .94, h * .96, S * .02); g.stroke();
    },
    mover(g, S, h) {   // a car on no wheels, coming fast
      g.fillStyle = 'rgba(255,43,214,.55)'; g.beginPath(); g.ellipse(S / 2, h * .97, S * .48, h * .03, 0, 0, TAU); g.fill();
      poly(g, [[S * .04, h * .88], [S * .1, h * .5], [S * .26, h * .3], [S * .74, h * .3], [S * .9, h * .5], [S * .96, h * .88]]); g.fillStyle = lin(g, 0, h * .3, 0, h * .9, '#2a2f36', '#121519'); g.fill();
      poly(g, [[S * .2, h * .52], [S * .3, h * .36], [S * .7, h * .36], [S * .8, h * .52]]); g.fillStyle = 'rgba(25,247,255,.45)'; g.fill();
      g.globalCompositeOperation = 'lighter'; for (const p of [.2, .8]) { blob(g, S * p, h * .68, S * .2, '25,247,255', .7); blob(g, S * p, h * .68, S * .06, '255,255,255', 1); }
    },
  },
  ray: {   // ink on cream, a railway through the fields
    low(g, S, h) {
      g.beginPath(); g.moveTo(S * .2, h); g.lineTo(S * .2, h * .35); g.arc(S * .5, h * .35, S * .3, Math.PI, 0); g.lineTo(S * .8, h); g.closePath();
      g.fillStyle = lin(g, S * .2, 0, S * .8, 0, '#f4ecd8', '#e2d8bf', '#b9ad92'); g.fill(); g.strokeStyle = '#161513'; g.lineWidth = S * .025; g.stroke();
      g.fillStyle = '#161513'; g.font = `${Math.round(S * .3)}px "Tiro Bangla", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('১০', S * .5, h * .58);
    },
    high(g, S, h) {
      g.fillStyle = '#161513'; g.fillRect(S * .04, h * .06, S * .06, h * .94);
      stripes(g, S * .04, h * .12, S * .96, h * .16, '#f4ecd8', '#161513', 6);
      g.strokeStyle = '#161513'; g.lineWidth = S * .015; g.strokeRect(S * .04, h * .12, S * .96, h * .16);
      g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(S * .07, h * .46, S * .07, 0, TAU); g.fill(); g.stroke();
    },
    wall(g, S, h) {   // a goods wagon, standing on the line
      round(g, S * .03, h * .04, S * .94, h * .78, S * .02); g.fillStyle = lin(g, 0, 0, S, 0, '#3a3732', '#5b574e', '#2a2824'); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = S * .01; for (let i = 1; i < 9; i++) { g.beginPath(); g.moveTo(S * (.03 + i * .104), h * .06); g.lineTo(S * (.03 + i * .104), h * .8); g.stroke(); }
      g.strokeStyle = '#f4ecd8'; g.lineWidth = S * .02; g.beginPath(); g.moveTo(S * .3, h * .2); g.lineTo(S * .7, h * .66); g.moveTo(S * .7, h * .2); g.lineTo(S * .3, h * .66); g.stroke(); g.strokeRect(S * .3, h * .2, S * .4, h * .46);
      g.fillStyle = '#161513'; for (const p of [.22, .78]) { g.beginPath(); g.arc(S * p, h * .9, S * .1, 0, TAU); g.fill(); }
    },
    mover(g, S, h) {   // a steam engine, head on
      g.fillStyle = '#161513'; g.fillRect(S * .44, h * .02, S * .12, h * .16);
      g.fillStyle = lin(g, 0, 0, S, 0, '#2a2824', '#5b574e', '#1d1b18'); g.beginPath(); g.arc(S / 2, h * .46, S * .36, 0, TAU); g.fill();
      g.strokeStyle = '#b9ad92'; g.lineWidth = S * .02; g.beginPath(); g.arc(S / 2, h * .46, S * .26, 0, TAU); g.stroke();
      g.globalCompositeOperation = 'lighter'; blob(g, S / 2, h * .2, S * .22, '255,250,235', .8); blob(g, S / 2, h * .2, S * .06, '255,255,255', 1); g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#161513'; g.fillRect(S * .06, h * .74, S * .88, h * .06); for (const p of [.12, .88]) { g.beginPath(); g.arc(S * p, h * .77, S * .06, 0, TAU); g.fill(); }
      poly(g, [[S * .14, h * .82], [S * .86, h * .82], [S * .6, h], [S * .4, h]]); g.fill();
      g.strokeStyle = '#b9ad92'; g.lineWidth = S * .01; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(S * (.14 + i * .12), h * .82); g.lineTo(S * (.4 + i * .04), h); g.stroke(); }
    },
  },
  metro: {   // works on the avenue, at dusk
    low(g, S, h) {
      g.strokeStyle = '#2a2a2e'; g.lineWidth = S * .03; for (const p of [.14, .86]) { g.beginPath(); g.moveTo(S * (p - .08), h); g.lineTo(S * p, h * .2); g.lineTo(S * (p + .08), h); g.stroke(); }
      stripes(g, S * .02, h * .14, S * .96, h * .34, '#ff6a13', '#f6f6f6', 6);
      g.globalCompositeOperation = 'lighter'; blob(g, S * .86, h * .08, S * .1, '255,194,71', .9); g.globalCompositeOperation = 'source-over';
    },
    high(g, S, h) {   // a sidewalk shed
      posts(g, S, h, .2, '#1f3d27', .05);
      g.fillStyle = lin(g, 0, h * .06, 0, h * .42, '#3f7a4c', '#2f5d3a', '#1f3d27'); g.fillRect(0, h * .06, S, h * .36);
      g.fillStyle = '#f4f4f4'; g.fillRect(S * .38, h * .14, S * .24, h * .16); g.fillStyle = '#2f5d3a'; for (let i = 0; i < 3; i++) g.fillRect(S * .41, h * (.17 + i * .045), S * .18, h * .018);
      g.globalCompositeOperation = 'lighter'; for (const p of [.2, .8]) blob(g, S * p, h * .45, S * .07, '255,214,140', .9); g.globalCompositeOperation = 'source-over';
    },
    wall(g, S, h) {   // a steam stack, orange and white
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#ff6a13'; g.fillRect(S * .26, h * (.3 + i * .117), S * .48, h * .118); }
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(S * .6, h * .3, S * .14, h * .7);
      g.fillStyle = 'rgba(240,240,245,.75)'; for (const [u, v, r] of [[.5, .24, .2], [.36, .14, .16], [.62, .1, .15], [.48, .04, .12]]) { g.beginPath(); g.arc(S * u, h * v, S * r, 0, TAU); g.fill(); }
    },
    mover(g, S, h) {   // a cab, head on
      round(g, S * .03, h * .4, S * .94, h * .52, S * .08); g.fillStyle = lin(g, 0, h * .4, 0, h * .92, '#ffd24a', '#f7b500', '#c98f00'); g.fill();
      poly(g, [[S * .14, h * .42], [S * .24, h * .2], [S * .76, h * .2], [S * .86, h * .42]]); g.fillStyle = '#f7b500'; g.fill();
      poly(g, [[S * .2, h * .41], [S * .28, h * .25], [S * .72, h * .25], [S * .8, h * .41]]); g.fillStyle = '#1a2430'; g.fill();
      g.fillStyle = '#fff3cf'; g.fillRect(S * .4, h * .12, S * .2, h * .08);
      g.fillStyle = '#16171a'; g.fillRect(S * .3, h * .62, S * .4, h * .12); for (let i = 0; i < 10; i++) g.fillRect(S * (.05 + i * .09), h * .52, S * .045, h * .035);
      g.fillStyle = '#2a2a2e'; g.fillRect(S * .02, h * .86, S * .96, h * .08);
      g.globalCompositeOperation = 'lighter'; for (const p of [.16, .84]) { blob(g, S * p, h * .66, S * .2, '255,240,200', .7); blob(g, S * p, h * .66, S * .06, '255,255,255', 1); }
    },
  },
};
