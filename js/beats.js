// PLAY ALONG: the star in the media player's screen turns the visualizer into a four-lane rhythm game. In the player the
// board lies flat above the bars it grew out of. Full screen tilts it back into a road, and the bars line both sides of it
// to the horizon. Notes land on the song's beat (charts: _dev/build_beats.py). Each song is a level, and its notes are that
// OS's own bubbles. One note at a time, so one finger or a mouse can clear it.
import { track } from './analytics.js';
import { deck, play, playSong, currentSong } from './audio.js';
import { SONGS, THEMES } from './themes.js';
import { spritesFor } from './fx.js';
import { soap } from './bubbles.js';

const LEVEL = 90;      // seconds of each song a level plays, as in _dev/build_beats.py
const TRAVEL = 2.6;    // seconds a note takes to reach the line: slow enough to read. On the road it takes a little longer, since it starts far away
const HIT = .32;       // how early or late still counts: generous, a note only has to be near the line
const FLOOR = 60;      // CSS pixels the bars keep under the flat board
const DEPTH = 4;       // on the road: how many times farther its far end is than the line
const KEYS = 'askl';
const EASE = 'cubic-bezier(.16, 1, .3, 1)';

const $ = (id) => document.getElementById(id);
const root = document.documentElement, win = $('player'), canvas = $('mp-viz'), panel = canvas.parentElement, star = $('mp-star'), wide = $('mp-full'), card = $('mp-result');
const still = matchMedia('(prefers-reduced-motion: reduce)'), coarse = matchMedia('(pointer: coarse)');
const charts = {}, down = [0, 0, 0, 0], fingers = new Map();
let on = false, run = 0, song = null, notes = [], first = 0, end = 0, hits = 0, judged = 0, streak = 0, best = 0, over = false, pops = [], skin = null, seen = 0, seenAt = 0, last = 0, home = 0;
let full = false, tilt = 0, tiltFrom = 0, tiltTo = 0, tiltAt = 0, stage = null, slot = null, hushed = [], hud = 9, board = { left: 0, lane: 1 };
let bests = {};
try { bests = JSON.parse(localStorage.getItem('tahsin.beat')) || {}; } catch { /* private mode */ }

/* ---------- Stars: three for a level, kept per song and shown in the playlist ---------- */
const starRow = (n) => [0, 1, 2].map((i) => `<svg${i < n ? '' : ' class="is-off"'} aria-hidden="true"><use href="#i-pixstar"/></svg>`).join('');
function showBests() {
  document.querySelectorAll('#mp-list [data-track]').forEach((b) => {
    const stars = bests[SONGS[b.dataset.track].src];
    if (!stars) return;
    const row = b.querySelector('.mp__stars') || b.appendChild(Object.assign(document.createElement('span'), { className: 'mp__stars', role: 'img' }));
    row.innerHTML = starRow(stars);
    row.setAttribute('aria-label', `Play along: ${stars} of 3 stars`);
  });
}

/* ---------- The level: notes, judging, score ---------- */
function clock(now) {   // some browsers only move currentTime every few frames, so carry it forward between readings
  const t = deck.heard();
  if (t !== seen) { seen = t; seenAt = now; }
  return deck.audio.paused ? t : seen + Math.min(.1, (now - seenAt) / 1000);
}
function judge(n, hit) {
  n.state = hit ? 2 : 3;
  n.at = performance.now();
  judged++;
  if (hit) { hits++; best = Math.max(best, ++streak); pops.push({ lane: n.lane, at: n.at }); } else streak = 0;
}
function press(lane) {
  if (down[lane]) return;
  down[lane] = 1;
  const t = clock(performance.now());
  for (let i = first; i < notes.length && notes[i].t - t <= HIT; i++) {
    const n = notes[i];
    if (n.lane !== lane || n.state || t - n.t > HIT) continue;
    if (n.hold) n.state = 1; else judge(n, true);
    return;
  }
}
function lift(lane) {
  down[lane] = 0;
  const n = notes.find((m) => m.state === 1 && m.lane === lane);
  if (n) judge(n, clock(performance.now()) > n.t + n.hold * .5);   // holding it for half its length is enough
}
function step(t) {
  while (first < notes.length && notes[first].state > 1) first++;
  for (let i = first; i < notes.length && notes[i].t < t; i++) {
    const n = notes[i];
    if (!n.state && t - n.t > HIT) judge(n, false);                // it slipped past
    else if (n.state === 1 && t >= n.t + n.hold) judge(n, true);   // held to the end
  }
  if (!over && notes.length && t >= end) finish();
}

const chart = (src) => (charts[src] ||= fetch(`assets/data/beats/${src}.json`).then((r) => r.json()));
// A level left part-way still goes in the log, with how far it got.
function quit() {
  if (!over && judged) track('game_score', { game: 'play_along', song: song.title, hit: `${Math.round(hits / judged * 100)}%`, streak: best, left: `${Math.round(last)}s` });
  judged = 0;
}
async function begin() {
  const mine = ++run;
  quit();
  song = currentSong();
  notes = []; pops = []; first = hits = judged = streak = best = 0; over = false;
  card.hidden = true;
  const data = await chart(song.src).catch(() => null);
  if (mine !== run || !on) return;
  const from = clock(performance.now()) + 1;   // a chart that loads late starts with what's still to come
  notes = (data?.notes || []).filter(([t]) => t > from && t < LEVEL).map(([t, lane, hold], k) => ({ t, lane, hold, k, state: 0, at: 0 }));
  if (!notes.length) return leave();
  const final = notes[notes.length - 1];
  end = final.t + final.hold + 1.2;
  track('game_start', { game: 'play_along', song: song.title });
}
function finish() {
  over = true;
  const pct = Math.round(hits / notes.length * 100), stars = (pct >= 40) + (pct >= 60) + (pct >= 80);
  track('game_score', { game: 'play_along', song: song.title, hit: `${pct}%`, streak: best, stars });
  if (stars > (bests[song.src] || 0)) {
    bests[song.src] = stars;
    try { localStorage.setItem('tahsin.beat', JSON.stringify(bests)); } catch { /* private mode */ }
    showBests();
  }
  $('mp-result-h').textContent = stars ? 'Level clear' : 'Level over';
  $('mp-result-stars').innerHTML = starRow(stars);
  $('mp-result-stars').setAttribute('aria-label', `${stars} of 3 stars`);
  $('mp-result-p').textContent = `${pct}% of notes hit. Longest streak ${best}.`;
  card.hidden = false;
  if (win.contains(document.activeElement) || panel.contains(document.activeElement)) $(stars ? 'mp-next-level' : 'mp-again').focus({ preventScroll: true });
}

/* ---------- Drawing: one board, two views, in the look of whichever OS is up ---------- */
const strong = (img) => {   // the city's lights are faint by design, so its notes are three of them stacked
  const c = document.createElement('canvas'), x = c.getContext('2d');
  c.width = c.height = img.width;
  for (let i = 0; i < 3; i++) x.drawImage(img, 0, 0);
  return c;
};
let bubble = null, lights = null;
const sprites = (id) => (id === 'metro' ? (lights ||= spritesFor(id).map(strong)) : spritesFor(id) || (bubble ||= [soap()]));   // the same ones that float on the desktop
function look() {
  const id = root.dataset.theme;
  if (skin?.id === id) return skin;
  const css = getComputedStyle(root), v = (name) => css.getPropertyValue(name).trim();
  return (skin = { id, fg: v('--lcd-fg'), glow: v('--lcd-glow'), font: v('--pixel'), hit: THEMES[id].viz[2] });
}
// What each OS lays on the board, under the notes. f.at(u, r) places a point and f.rail(u, r0, r1) traces along a lane edge:
// u runs 0 to 4 across the lanes, and r is how far a note still has to go (1 just entering, 0 on the line).
// f.rows(gap, draw) calls draw(r) for rows that travel with the notes.
const FLOORS = {
  aero(g, f) {   // panes of glass
    g.fillStyle = 'rgba(127, 241, 255, .07)';
    for (const i of [0, 2]) { g.beginPath(); f.rail(i, 1, f.end); f.rail(i + 1, f.end, 1); g.fill(); }
  },
  vapor(g, f) {   // its grid, rolling toward you
    g.strokeStyle = 'rgba(255, 113, 206, .32)';
    f.rows(.125, (r) => { const a = f.at(0, r), b = f.at(4, r); g.lineWidth = f.d * a[2]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
  },
  baroque(g, f) {   // five gold strings, and the two beside a note you hit ring
    g.strokeStyle = '#b8923a'; g.lineWidth = 1.5 * f.d;
    for (let i = 0; i <= 4; i++) {
      const ring = Math.max(f.glow[i - 1] || 0, f.glow[i] || 0) * 4 * f.d * Math.sin(f.now / 18);
      g.beginPath();
      for (let k = 0; k <= 8; k++) { const p = f.at(i, 1 + (f.end - 1) * k / 8); g.lineTo(Math.min(f.W - f.d, Math.max(f.d, p[0] + ring * Math.sin(Math.PI * k / 8))), p[1]); }
      g.stroke();
    }
  },
  ghost(g, f) {   // scanlines
    g.fillStyle = 'rgba(0, 255, 200, .07)';
    for (let y = 0; y < f.bottom; y += 4 * f.d) g.fillRect(0, y, f.W, f.d);
  },
  ray(g, f) {   // film running through the gate, sprocket holes down both edges
    g.fillStyle = 'rgba(244, 236, 216, .5)';
    f.rows(.09, (r) => { for (const u of [.08, 3.92]) { const p = f.at(u, r), w = 7 * f.d * p[2], h = 11 * f.d * p[2] * (1 - .5 * f.tilt); g.fillRect(p[0] - w / 2, p[1] - h / 2, w, h); } });
  },
  metro(g, f) {   // lane markings on an avenue, passing underneath
    g.strokeStyle = 'rgba(255, 255, 255, .5)';
    f.rows(.15, (r) => { for (let i = 1; i < 4; i++) { const a = f.at(i, r), b = f.at(i, Math.max(f.end, r - .066)); g.lineWidth = 2 * f.d * a[2]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } });
  },
};

// The visualizer calls this each frame in place of its own drawing, and hands over its bars to stand wherever the board wants them.
function frame(g, now, bars, strip) {
  const d = Math.min(devicePixelRatio || 1, full ? 1.5 : 2), W = Math.round(canvas.clientWidth * d), H = Math.round(canvas.clientHeight * d);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; } else g.clearRect(0, 0, W, H);
  const x = still.matches ? 1 : Math.max(0, Math.min(1, (now - tiltAt) / 500));
  tilt = tiltFrom + (tiltTo - tiltFrom) * (1 - (1 - x) ** 3);
  // In the player the board fills the screen above the bars. Full screen it's a road down the middle, and yv is where it would vanish.
  const zone = Math.min(H, FLOOR * d), cx = W / 2, lane = full ? Math.min(W * .46, H * .42) / 2 : W / 4, size = Math.min(lane * .62, (full ? 96 : 46) * d);
  const yHit = full ? H * .8 : H - zone - 30 * d, top = hud * d, type = (full && W >= 700 * d && H >= 600 * d ? 32 : 16) * d;   // LCD text stays at 16 or 32
  const yv = (Math.max(H * .2, top + type + 34 * d) * DEPTH - yHit) / (DEPTH - 1);   // the far end sits a fifth of the way down, clear of the readout
  board = { left: cx - 2 * lane, lane };
  if (tilt < 1) bars(g, strip(W, H, zone), 1 - tilt);   // in the player: the floor under the board
  if (yHit < 70 * d) return;   // mid-morph: no room for a board yet
  const travel = TRAVEL + .6 * tilt, t = clock(now), s = look(), set = sprites(s.id), ring = size * .56, far = size / 2;
  if (on) step(last = t);
  pops = pops.filter((p) => now - p.at < 300);
  const glow = [0, 1, 2, 3].map((i) => Math.max(0, ...pops.filter((p) => p.lane === i).map((p) => 1 - (now - p.at) / 300)));

  // Where things go: u runs 0 to 4 across the lanes, and r is how far a note still has to travel (1 just entering, 0 on the
  // line, below 0 past it). Flat, r is simply height. On the road, things shrink toward the far end the way distance does.
  const at = (u, r) => {
    const m = 1 / (1 + Math.max(-.25, r) * (DEPTH - 1)), k = 1 + (m - 1) * tilt;
    return [cx + (u - 2) * lane * k, (yHit - r * (yHit + far)) * (1 - tilt) + (yv + (yHit - yv) * m) * tilt, k];
  };
  const rail = (u, r0, r1) => { for (let i = 0; i <= 8; i++) { const p = at(u, r0 + (r1 - r0) * i / 8); g.lineTo(p[0], p[1]); } };
  const stop = tilt * (yHit - H) / ((H - yv) * (DEPTH - 1));   // the flat board stops at the line; the road runs on to the bottom edge
  const phase = still.matches ? 0 : t / travel;
  const rows = (gap, draw) => { for (let r = Math.ceil((stop + phase) / gap) * gap - phase; r <= 1; r += gap) draw(r); };

  // Full screen: the bars line both sides of the road like buildings on an avenue, low sounds nearest, fading with distance.
  if (tilt > 0) bars(g, (i) => {
    const [x, y, k] = at(i % 2 ? 4 : 0, -.05 + (i >> 1) * .075), w = lane * .5 * k, left = i % 2 ? x + lane * .3 * k : x - lane * .8 * k;
    const inView = (Math.min(W, left + w) - Math.max(0, left)) / w > .4;   // a sliver at the screen's edge would read as a stray line
    return [left, y, w, lane * 2.4 * k, inView ? .2 + .6 * Math.min(1, k) : 0];
  }, tilt * (over ? .35 : 1), true);   // quieter behind a result

  // The board: a faint surface and edges once it's a road, lane lines, then whatever belongs to this OS.
  g.fillStyle = g.strokeStyle = s.fg; g.lineWidth = d;
  if (tilt) { g.globalAlpha = .05 * tilt; g.beginPath(); rail(0, 1, stop); rail(4, stop, 1); g.fill(); }
  g.save(); g.translate(d / 2, 0);   // so a one-pixel line lands on one pixel
  for (let i = 0; i <= 4; i++) { g.globalAlpha = i % 4 ? .13 : .3 * tilt; g.beginPath(); rail(i, 1, stop); g.stroke(); }
  g.restore(); g.globalAlpha = 1;
  FLOORS[s.id]?.(g, { W, d, now, glow, tilt, at, rail, rows, end: stop, bottom: yHit + (H - yHit) * tilt });
  if (over || !notes.length) return;   // the result, or the way out, gets a quiet board

  // The line to hit on, and a ring in each lane that fills while its key or finger is down. On the road the rings lie flat.
  const x0 = cx - 2 * lane, lie = 1 - .5 * tilt;
  g.lineWidth = 2 * d; g.strokeStyle = g.fillStyle = s.hit;
  g.globalAlpha = .45; g.fillRect(x0, yHit - d, lane * 4, 2 * d);
  for (let i = 0; i < 4; i++) {
    g.beginPath(); g.ellipse(x0 + (i + .5) * lane, yHit, ring, ring * lie, 0, 0, 7);
    g.globalAlpha = .3 * down[i]; g.fill();
    g.globalAlpha = down[i] ? 1 : .6; g.stroke();
  }
  g.font = `${type}px ${s.font}`; g.fillStyle = s.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (!coarse.matches) { g.globalAlpha = .8; for (let i = 0; i < 4; i++) g.fillText(KEYS[i].toUpperCase(), x0 + (i + .5) * lane, yHit + d); }

  // Notes. A missed one keeps going and fades. One to hold trails a stem as long as it lasts. On the road each rides a bar across its lane.
  for (let i = Math.max(0, first - 6); i < notes.length && notes[i].t - t < travel + .2; i++) {
    const n = notes[i], gone = n.state === 3 ? (now - n.at) / 260 : 0;
    if (n.state === 2 || gone >= 1) continue;
    const u = n.lane + .5, r = n.state === 1 ? 0 : (n.t - t) / travel, [nx, ny, k] = at(u, r), show = (1 - gone) * Math.min(1, Math.max(0, (1 - r) / .2));   // it comes in under the readout
    if (n.hold) {
      const r1 = Math.min(1, (n.t + n.hold - t) / travel), w = size * .19, tip = at(u, r1);
      g.fillStyle = s.hit; g.globalAlpha = (1 - gone) * (n.state === 1 ? .85 : .5);
      g.beginPath();
      for (let j = 0; j <= 6; j++) { const p = at(u, r + (r1 - r) * j / 6); g.lineTo(p[0] - w * p[2], p[1]); }
      g.arc(tip[0], tip[1], w * tip[2], Math.PI, 0);
      for (let j = 6; j >= 0; j--) { const p = at(u, r + (r1 - r) * j / 6); g.lineTo(p[0] + w * p[2], p[1]); }
      g.fill();
    }
    if (tilt) { g.fillStyle = s.hit; g.globalAlpha = show * .42 * tilt; g.beginPath(); rail(n.lane + .08, r + .02, r - .02); rail(n.lane + .92, r - .02, r + .02); g.fill(); }
    g.globalAlpha = show;
    g.drawImage(set[n.k % set.length], nx - size * k / 2, ny - size * k * (.5 + .22 * tilt), size * k, size * k);   // on the road it stands a little above its bar
  }

  // A ring opens where a note was hit.
  g.strokeStyle = s.fg; g.lineWidth = 3 * d;
  for (const p of pops) { const a = (now - p.at) / 300, e = ring * (1 + a * .8); g.globalAlpha = 1 - a; g.beginPath(); g.ellipse(x0 + (p.lane + .5) * lane, yHit, e, e * lie, 0, 0, 7); g.stroke(); }

  // Streak, share of notes hit, and a bar across the top for how far through the level.
  g.globalAlpha = 1; g.fillStyle = s.fg; g.textBaseline = 'top'; g.shadowColor = s.glow; g.shadowBlur = 6 * d;
  if (streak > 2) { g.textAlign = 'left'; g.fillText(`STREAK ${streak}`, 14 * d, top); }
  if (judged) { g.textAlign = 'right'; g.fillText(`${Math.round(hits / judged * 100)}%`, W - 14 * d, top); }
  g.shadowBlur = 0;
  g.globalAlpha = .25; g.fillRect(0, 0, W, 2 * d);
  g.globalAlpha = .9; g.fillRect(0, 0, W * Math.min(1, t / end), 2 * d);
  g.globalAlpha = 1;
}

/* ---------- Full screen: the player's screen leaves its window, fills the display, and the board tilts back into a road ---------- */
const inset = (r) => `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 6px)`;
function turn(to) { tiltFrom = tilt; tiltTo = to; tiltAt = performance.now(); }
function measure() { hud = full ? panel.querySelector('.mp__lcd').getBoundingClientRect().bottom + 10 : 9; }   // the readout sits under the title row
function label() {
  const text = full ? 'Leave full screen' : 'Full screen';
  wide.setAttribute('aria-label', text); wide.title = text;
  $('mp-full-ico').setAttribute('href', full ? '#i-pixsmall' : '#i-pixfull');
}
function expand() {
  if (full || !on) return;
  const from = panel.getBoundingClientRect(), had = document.activeElement;
  slot = document.createElement('div');   // keeps the player's shape while its screen is away
  slot.style.height = `${panel.offsetHeight}px`;
  stage = Object.assign(document.createElement('div'), { className: 'arcade' });
  panel.replaceWith(slot); stage.append(panel); document.body.append(stage);
  for (const el of document.body.children) if (el !== stage && !el.inert) { el.inert = true; hushed.push(el); }   // nothing underneath takes keys or focus
  full = true;
  measure(); label(); turn(1);
  if (!still.matches) stage.animate([{ clipPath: inset(from) }, { clipPath: 'inset(0 round 0px)' }], { duration: 450, easing: EASE });
  (panel.contains(had) ? had : canvas).focus({ preventScroll: true });
  track('game_full', { song: song.title });
}
function collapse(quick) {
  if (!full) return;
  const done = () => {
    if (!full) return;
    const had = document.activeElement;
    slot.replaceWith(panel); stage.remove();
    for (const el of hushed) el.inert = false;
    hushed = []; stage = slot = null;
    full = false; tilt = tiltFrom = tiltTo = 0;
    measure(); label();
    if (on && panel.contains(had)) had.focus({ preventScroll: true });
  };
  if (quick || still.matches) return done();
  if (!tiltTo) return;   // already on its way back
  turn(0);
  stage.animate([{ clipPath: 'inset(0 round 0px)' }, { clipPath: inset(slot.getBoundingClientRect()) }], { duration: 380, easing: EASE }).finished.catch(() => {}).then(done);
}
wide.addEventListener('click', () => (full ? collapse() : expand()));

/* ---------- Coming and going ---------- */
// The screen grows or shrinks in one move. On a desktop the window's bottom edge stays put and its height never jumps:
// the screen first takes the room of the rows that came or went, then travels the rest.
function morph(change, quick) {
  const free = !root.classList.contains('phone');
  if (quick) {   // hidden, or about to be: nothing to watch and nothing to measure, so the window goes back where it stood
    change();
    if (free) win.style.top = `${home}px`;
    return Promise.resolve();
  }
  const h0 = canvas.offsetHeight, was = win.offsetHeight, bottom = win.offsetTop + was;
  const anchor = () => { if (free && !win.hidden) win.style.top = `${Math.max(6, bottom - win.offsetHeight)}px`; };
  const settle = () => { canvas.style.flex = ''; anchor(); requestAnimationFrame(() => dispatchEvent(new Event('tahsin:player-resize'))); };   // then the window manager checks it still fits
  change();
  const h1 = canvas.offsetHeight, from = free ? h1 - (win.offsetHeight - was) : h0;
  // Under reduced motion the site lands every style a frame late, so wait for it and jump once.
  if (still.matches || !canvas.animate) return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(settle()))));
  canvas.style.flex = 'none';
  const grow = canvas.animate([{ height: `${from}px` }, { height: `${h1}px` }], { duration: 450, easing: EASE });
  (function hold() { anchor(); if (grow.playState === 'running') requestAnimationFrame(hold); })();
  return grow.finished.catch(() => {}).then(settle);
}
function enter() {
  if (root.classList.contains('phone') && !win.classList.contains('is-sheet')) win.querySelector('.win__tap').click();   // on a phone the game takes the whole sheet
  on = true;
  home = win.offsetTop;
  deck.game = frame;
  star.setAttribute('aria-pressed', 'true');
  canvas.removeAttribute('aria-hidden');
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Play along. Press A, S, K or L, or tap a lane, when a note reaches the line. Escape leaves.');
  morph(() => win.classList.add('is-beat'));
  deck.audio.currentTime = 0;
  play().catch(() => {});
  begin();
  canvas.focus({ preventScroll: true });
}
function leave(quick) {
  if (!on) return;
  quit();
  collapse(true);
  on = false; run++;
  notes = []; down.fill(0); fingers.clear();
  card.hidden = true;
  const back = win.contains(document.activeElement);
  star.setAttribute('aria-pressed', 'false');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.removeAttribute('tabindex');
  canvas.removeAttribute('aria-label');
  if (back) star.focus({ preventScroll: true });
  morph(() => win.classList.remove('is-beat'), quick === true).then(() => { if (!on) { deck.game = null; canvas.width = 600; canvas.height = 120; } });
}
export function toggle() { if (on) leave(); else if (!win.hidden) enter(); }

/* ---------- Keys, fingers, and everything that ends a level early ---------- */
function key(e) {
  if (!on) return;
  if (e.key === 'Escape') { if (e.type === 'keydown') { e.stopImmediatePropagation(); if (full) collapse(); else leave(); } return; }   // Escape steps back one view, and never closes the window
  const lane = KEYS.indexOf(e.key?.toLowerCase());
  if (lane < 0 || over || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.type === 'keydown') press(lane); else lift(lane);
}
addEventListener('keydown', key, true);
addEventListener('keyup', key, true);
canvas.addEventListener('pointerdown', (e) => {
  if (!on || over) return;
  e.preventDefault();
  const r = canvas.getBoundingClientRect(), lane = Math.max(0, Math.min(3, Math.floor(((e.clientX - r.left) * canvas.width / r.width - board.left) / board.lane)));
  fingers.set(e.pointerId, lane);
  try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ }
  press(lane);
});
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, (e) => {
  const lane = fingers.get(e.pointerId);
  if (lane == null) return;
  fingers.delete(e.pointerId);
  lift(lane);
});
$('mp-again').addEventListener('click', () => {
  if (currentSong() === song) { deck.audio.currentTime = 0; play().catch(() => {}); } else playSong(SONGS.indexOf(song));   // the music may have moved on while the result was up
  begin();
  canvas.focus({ preventScroll: true });
});
$('mp-next-level').addEventListener('click', () => { playSong((SONGS.indexOf(song) + 1) % SONGS.length); begin(); canvas.focus({ preventScroll: true }); });
$('mp-done').addEventListener('click', () => leave());
addEventListener('tahsin:song', () => { if (on && !over) begin(); });   // changing the song mid-level starts that song's level. A result stays up until they choose.
// The tape takes the screen, and it remembers where every window stood, so the player is back in place before it starts.
document.addEventListener('click', (e) => { if (e.target.closest?.('[data-rundown]')) leave(true); }, true);
addEventListener('tahsin:rundown', (e) => { if (e.detail.active) leave(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
// Closing or minimizing the player ends the level, and so does a phone's sheet going back to a widget.
const away = () => win.hidden || (root.classList.contains('phone') && !win.classList.contains('is-sheet'));
new MutationObserver(() => { if (away()) leave(true); }).observe(win, { attributes: true, attributeFilter: ['class', 'hidden'] });
addEventListener('resize', () => { measure(); if (away()) leave(true); });
showBests();
