// PLAY ALONG: the star in the media player's screen turns the visualizer into a four-lane rhythm game, and the player has
// to earn the song. Its drums and bass carry on underneath, and the rest of it only sounds while they keep hitting (the way
// Guitar Hero mutes your guitar). Every hit sounds the song's own note at that moment (the way Piano Tiles plays the tune),
// and blocks are cut in two (the way Beat Saber's are). In the player the board lies flat above the bars. Full screen tilts
// it back into a road through that OS's own world (js/beatworlds.js), with the bars lining both sides of it.
// Notes sit on the song's beat (_dev/build_beats.py), and the rhythm section is cut out by _dev/build_backing.py.
import { track } from './analytics.js';
import { deck, beat, play, playSong, currentSong } from './audio.js';
import { SONGS } from './themes.js';
import { WORLDS, sprite } from './beatworlds.js';

const LEVEL = 90;      // seconds of each song a level plays, as in _dev/build_beats.py
const TRAVEL = 2.6;    // seconds a note takes to reach the line: slow enough to read. On the road it takes a little longer, since it starts far away
const HIT = .32;       // how early or late still counts: generous, a note only has to be near the line
const SHARP = .1;      // and this close to the beat is a perfect
const QUIET = .12;     // how much of the song is left once a note is missed
const FLOOR = 60;      // CSS pixels the bars keep under the flat board
const DEPTH = 4;       // on the road: how many times farther a note starts than the line
const KEYS = 'askl';
const EASE = 'cubic-bezier(.16, 1, .3, 1)';

const $ = (id) => document.getElementById(id);
const clamp = (v) => Math.max(0, Math.min(1, v));
const root = document.documentElement, win = $('player'), canvas = $('mp-viz'), panel = canvas.parentElement, star = $('mp-star'), wide = $('mp-full'), card = $('mp-result');
const still = matchMedia('(prefers-reduced-motion: reduce)'), coarse = matchMedia('(pointer: coarse)');
const charts = {}, layers = {}, down = [0, 0, 0, 0], litAt = [0, 0, 0, 0], reach = [0, 3], turn = [1, -1], fingers = new Map(), fx = [], trail = [];
let on = false, run = 0, song = null, notes = [], first = 0, end = 0, hits = 0, judged = 0, streak = 0, best = 0, score = 0, sharp = 0, over = false, open = false, stem = null;
let lag = 16, slow = 0, lite = false, before = 0;
let skin = null, view = null, seen = 0, seenAt = 0, last = 0, home = 0, energy = 0, missAt = -1e9, flashAt = -1e9, shakeAt = -1e9, shakeAmp = 0, sizedAt = 0;
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

/* ---------- The level: notes, judging, score, and how much of the song is sounding ---------- */
function clock(now) {   // some browsers only move currentTime every few frames, so carry it forward between readings
  const t = deck.heard();
  if (t !== seen) { seen = t; seenAt = now; }
  return deck.audio.paused ? t : seen + Math.min(.1, (now - seenAt) / 1000);
}
const mult = () => (streak >= 14 ? 8 : streak >= 6 ? 4 : streak >= 2 ? 2 : 1);
function lead(yes) {   // the song over its rhythm section: in after a hit, dropped after a miss
  if (open === yes) return;
  open = yes;
  deck.lead(yes ? 1 : QUIET, yes ? .012 : .07);
}
const add = (life, draw, keep) => { if (keep || !still.matches) fx.push({ at: performance.now(), life, draw }); };   // something to draw for a moment: draw(age 0 to 1, g, f)
function shake(amp) {
  const now = performance.now();
  if (still.matches) return;
  shakeAmp = Math.max(amp, shakeAmp * Math.max(0, 1 - (now - shakeAt) / 260) ** 2);
  shakeAt = now;
}
function say(text, u, color, lift = 1) {
  add(540, (a, g, f) => {
    const [x, y] = f.at(u, 0);
    g.globalAlpha = a < .7 ? 1 : (1 - a) / .3; g.font = `${f.type}px ${f.font}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = color; g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 5 * f.d;
    g.fillText(text, Math.max(f.type * 2.4, Math.min(f.W - f.type * 2.4, x)), y - f.size * (.9 + .5 * a) * lift);
  }, true);
}
// A note struck: its own pitch sounds in this OS's voice, the song comes in over the drums, and the block is cut where it stood.
function strike(n, late, clean = true) {
  if (!view) return;
  const w = WORLDS[view.id], hand = +(n.lane > 1), broad = n.kind ? 1 : 0, u = n.lane + .5 + broad * .5, tone = w.hands[hand], r0 = n.hold ? 0 : -late / view.travel;
  n.fine = clean && Math.abs(late) <= SHARP;
  lead(true);
  deck.sound((voice, burst) => w.sound(voice, burst, n.hz, broad ? 1 : n.hold ? 2 : 0, (u - 2) / 2.4));
  litAt[n.lane] = litAt[n.lane + broad] = performance.now();
  if (n.fine || broad) shake(broad ? 5 : 2.5);
  add(260, (a, g, f) => {   // its lane lights up
    const p = f.at(u, 0), q = f.at(u, .6), fill = g.createLinearGradient(p[0], p[1], q[0], q[1]);
    fill.addColorStop(0, tone[1]); fill.addColorStop(1, `${tone[1]}00`);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = (1 - a) * .6; g.fillStyle = fill;
    f.quad(n.lane, n.lane + 1 + broad, .6, 0); g.fill();
  });
  add(320, (a, g, f) => {   // a ring opens on the line
    const [x, y] = f.at(u, 0), e = f.size * (.5 + broad * .5) * (1 + a * 1.1);
    g.globalAlpha = 1 - a; g.strokeStyle = tone[0]; g.lineWidth = 4 * f.d * (1 - a) + 1;
    g.beginPath(); g.ellipse(x, y, e, e * f.lie, 0, 0, 7); g.stroke();
  });
  const bits = Array.from({ length: n.fine ? 16 : 9 }, (_, i) => [Math.random() * 6.283, .35 + Math.random() * .65, Math.random() * 6.283, i % 2]);
  add(520, (a, g, f) => {   // sparks, in whatever this world throws off
    const [x, y] = f.at(u, r0), out = f.size * 1.5 * (1 - (1 - a) ** 2);
    g.globalCompositeOperation = w.mono ? 'source-over' : 'lighter';
    for (const [ang, speed, rot, alt] of bits) {
      g.save(); g.globalAlpha = 1 - a * a;
      g.translate(x + Math.cos(ang) * out * speed * (1 + broad), y - f.size * .3 * f.tilt + Math.sin(ang) * out * speed * .8 + w.fall * a * a * f.size); g.rotate(rot + a * 4);
      g.fillStyle = g.strokeStyle = tone[alt ? 0 : 1]; w.spark(g, f.size * (.05 + speed * .05) * (1 - a * .5));
      g.restore();
    }
  });
  say(n.fine ? 'PERFECT' : 'GOOD', u, tone[0]);
  if (n.hold) return;
  const img = sprite(view.id, hand, n.kind, n.v), ang = broad ? 0 : (hand ? -.7 : .7), dir = n.dir || (hand ? -1 : 1), flip = n.kind === 2 ? -1 : 1;
  add(440, (a, g, f) => {   // the block, in two halves along the cut
    const [x, y, k] = f.at(u, r0), s = f.size * k, iw = s * (1 + broad), cy = y - s * .3 * f.tilt, nx = -Math.sin(ang), ny = Math.cos(ang), cs = Math.cos(ang), sn = Math.sin(ang);
    if (a < .3) { g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#fff'; g.lineWidth = 3 * f.d * (1 - a / .3); g.beginPath(); g.moveTo(x - cs * iw * .6, cy - sn * iw * .6); g.lineTo(x + cs * iw * .6, cy + sn * iw * .6); g.stroke(); g.globalCompositeOperation = 'source-over'; }
    for (const side of [-1, 1]) {
      const push = side * (.12 + .6 * a), drift = dir * .35 * a;
      g.save(); g.globalAlpha = 1 - a * a;
      g.translate(x + (nx * push + cs * drift) * s, cy + (ny * push + sn * drift) * s + s * .5 * a * a); g.rotate(side * a * .8);
      g.rotate(ang); g.beginPath(); g.rect(-iw, side > 0 ? 0 : -s * 2, iw * 2, s * 2); g.rotate(-ang); g.clip();
      g.scale(flip, 1); g.drawImage(img, -iw / 2, -s / 2, iw, s);
      g.restore();
    }
  });
}
function swing(lane, dir) {   // every press is a blade through its lane, hit or not
  add(150, (a, g, f) => {
    const [x, y] = f.at(lane + .5, 0), l = f.size * .7, k = Math.min(1, a * 3);
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.strokeStyle = WORLDS[f.id].hands[+(lane > 1)][0];
    for (const [width, alpha] of [[9, .25], [3, .9]]) { g.globalAlpha = alpha * (1 - a); g.lineWidth = width * f.d; g.beginPath(); g.moveTo(x - dir * l, y - l * .5 * f.lie - f.size * .2 * f.tilt); g.lineTo(x - dir * l + dir * l * 2 * k, y - l * .5 * f.lie + l * f.lie * k - f.size * .2 * f.tilt); g.stroke(); }
  });
}
function cheer() {   // every tenth hit in a row
  say(`${streak} COMBO`, 2, '#ffffff', 1.9);
  if (!still.matches) flashAt = performance.now();
  const hz = (notes[first] || notes[notes.length - 1]).hz;
  deck.sound((voice) => [1, 1.5, 2, 3].forEach((m, i) => voice(hz * 2 * m, i * .06, .3, { gain: .08 })));
}
function judge(n, hit) {
  n.state = hit ? 2 : 3;
  n.at = performance.now();
  judged++;
  if (hit) {
    hits++; best = Math.max(best, ++streak); sharp += n.fine; score += (n.fine ? 100 : 60) * mult();
    if (streak % 10 === 0) cheer();
    return;
  }
  streak = 0; missAt = n.at;
  lead(false); shake(4);
  deck.sound((voice) => voice(92, 0, .16, { to: 58, gain: .14, type: 'triangle' }));
  say('MISS', n.lane + .5 + (n.kind ? .5 : 0), '#ff6b6b');
}
// Note states: 0 on its way, 1 being held, 2 hit, 3 missed. A sweep (kind 1 right, 2 left) lies across two lanes and wants both.
function press(lane) {
  if (down[lane]) return;
  down[lane] = 1;
  const t = clock(performance.now()), hand = +(lane > 1), dir = Math.sign(lane - reach[hand]) || -turn[hand];
  reach[hand] = lane; turn[hand] = dir;
  swing(lane, dir);
  for (let i = first; i < notes.length && notes[i].t - t <= HIT; i++) {
    const n = notes[i];
    if (n.state || t - n.t > HIT || lane < n.lane || lane > n.lane + (n.kind ? 1 : 0)) continue;
    if (n.kind) {
      if (!n.got) { n.dir = lane === n.lane ? 1 : -1; n.gotAt = t; }
      n.got |= 1 << (lane - n.lane);
      if (n.got === 3) { strike(n, t - n.t, n.dir === (n.kind === 1 ? 1 : -1) || t - n.gotAt < .05); judge(n, true); }   // the right way round, or both at once
    } else if (n.hold) { n.state = 1; strike(n, t - n.t); } else { strike(n, t - n.t); judge(n, true); }
    return;
  }
  deck.sound((voice) => voice(190, 0, .05, { gain: .045, type: 'triangle' }));   // nothing there: the blade still swishes
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
// One song's rhythm section at a time: decoded, each is about 30 MB.
const backing = (src) => (stem?.src === src ? stem : (stem = { src, ready: fetch(`assets/audio/backing/${src}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then(deck.decode).catch(() => null) })).ready;
// A level left part-way still goes in the log, with how far it got.
function quit() {
  if (!over && judged) track('game_score', { game: 'play_along', song: song.title, hit: `${Math.round(hits / judged * 100)}%`, streak: best, left: `${Math.round(last)}s` });
  judged = 0;
}
async function begin() {
  const mine = ++run;
  quit();
  song = currentSong();
  notes = []; fx.length = 0; first = hits = judged = streak = best = score = sharp = 0; over = false; open = false;
  deck.band(null);
  card.hidden = true;
  backing(song.src).then((buffer) => { if (buffer && mine === run && on && !over) { deck.band(buffer); deck.lead(open ? 1 : QUIET, .25); } });   // until it loads, the song just plays
  const data = await chart(song.src).catch(() => null);
  if (mine !== run || !on) return;
  const from = clock(performance.now()) + 1;   // a chart that loads late starts with what's still to come
  notes = (data?.notes || []).filter(([t]) => t > from && t < LEVEL)
    .map(([t, lane, hold, kind = 0, midi = 60], k) => ({ t, lane, hold, kind, hz: 440 * 2 ** ((midi - 69) / 12), v: midi % 7, k, state: 0, at: 0, got: 0, gotAt: 0, dir: 0, fine: false }));
  if (!notes.length) return leave();
  const final = notes[notes.length - 1];
  end = final.t + final.hold + 1.2;
  track('game_start', { game: 'play_along', song: song.title });
}
function finish() {
  over = true; open = true;
  deck.band(null);   // the song plays on, whole
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
  $('mp-result-p').textContent = `${pct}% of notes hit, ${sharp} of them perfect. Longest streak ${best}. Score ${score.toLocaleString('en-US')}.`;
  card.hidden = false;
  if (win.contains(document.activeElement) || panel.contains(document.activeElement)) $(stars ? 'mp-next-level' : 'mp-again').focus({ preventScroll: true });
}

/* ---------- Drawing: one board, two views, in the world of whichever OS is up ---------- */
function look() {
  const id = root.dataset.theme;
  if (skin?.id === id) return skin;
  const css = getComputedStyle(root), v = (name) => css.getPropertyValue(name).trim();
  return (skin = { id, fg: v('--lcd-fg'), glow: v('--lcd-glow'), font: v('--pixel') });
}
// A world's still scenery is painted once for a size and kept. While the screen is changing size the old painting is stretched.
function scenery(name, w, f) {
  if (!w[name]) return null;
  let l = layers[name];
  if (!l || l.id !== f.id || l.full !== f.full || ((l.c.width !== f.W || l.c.height !== f.H) && f.now - sizedAt > 160)) {
    l = layers[name] = { id: f.id, full: f.full, c: l?.c || document.createElement('canvas') };
    l.c.width = f.W; l.c.height = f.H;
    w[name](l.c.getContext('2d'), f);
    canvas.style.filter = w.mono ? 'grayscale(1)' : '';   // Ray OS is black and white film, bars and all
  }
  return l.c;
}

// The visualizer calls this each frame in place of its own drawing, and hands over its bars to stand wherever the board wants them.
function frame(g, now, bars, strip) {
  lag += (Math.min(100, now - before) - lag) * .05; before = now;
  if (lag <= 24) slow = 0; else if (++slow > 90) lite = true;   // a screen that can't keep up for three seconds gets a plainer picture from then on: no film grain, fewer pixels
  const d = Math.min(devicePixelRatio || 1, lite ? 1 : full ? 1.5 : 2), W = Math.round(canvas.clientWidth * d), H = Math.round(canvas.clientHeight * d), calm = still.matches;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; sizedAt = now; } else g.clearRect(0, 0, W, H);
  const x = calm ? 1 : clamp((now - tiltAt) / 500);
  tilt = tiltFrom + (tiltTo - tiltFrom) * (1 - (1 - x) ** 3);
  // In the player the board fills the screen above the bars. Full screen it's a road down the middle that runs out to the horizon.
  const zone = Math.min(H, FLOOR * d), cx = W / 2, lane = full ? Math.min(W * .46, H * .42) / 2 : W / 4, size = Math.min(lane * .74, (full ? 124 : 50) * d);
  const yHit = full ? H * .8 : H - zone - 30 * d, top = hud * d, type = (full && W >= 700 * d && H >= 600 * d ? 32 : 16) * d;   // LCD text stays at 16 or 32
  if (yHit < 70 * d) return bars(g, strip(W, H, zone));   // mid-morph: no room for a board yet
  const hz = full ? Math.max(H * .26, top + type + 46 * d) : H * .4, s = look(), w = WORLDS[s.id], t = clock(now);
  const travel = TRAVEL + .6 * tilt, far = 1 + 2.2 * tilt, lie = 1 - .5 * tilt, ring = size * .56, away = size / 2, ink = w.ink || s.fg;
  board = { left: cx - 2 * lane, lane };
  if (on) step(last = t);
  energy += ((over ? 0 : Math.min(1, streak / 20)) - energy) * .04;

  // Where things go: u runs 0 to 4 across the lanes, and r is how far a note still has to travel (1 where it starts, 0 on the
  // line, below 0 past it). Flat, r is simply height. On the road, things shrink toward the horizon the way distance does.
  const at = (u, r) => {
    const m = 1 / (1 + Math.max(-.25, r) * (DEPTH - 1)), k = 1 + (m - 1) * tilt;
    return [cx + (u - 2) * lane * k, (yHit - r * (yHit + away)) * (1 - tilt) + (hz + (yHit - hz) * m) * tilt, k];
  };
  const rail = (u, r0, r1) => { for (let i = 0; i <= 8; i++) { const p = at(u, r0 + (r1 - r0) * i / 8); g.lineTo(p[0], p[1]); } };
  const stop = tilt * (yHit - H) / ((H - hz) * (DEPTH - 1));   // the flat board stops at the line; the road runs on to the bottom edge
  const phase = calm ? 0 : t / travel;
  const f = view = {
    id: s.id, W, H, d, cx, lane, size, yHit, hz, tilt, lie, full, calm, lite, now, travel, far, stop, type, font: s.font, at,
    time: calm ? 0 : now / 1000, energy, pulse: beat.pulse, progress: clamp(t / (end || LEVEL)),
    miss: calm ? 0 : Math.max(0, 1 - (now - missAt) / 350), missAge: (now - missAt) / 1000, lit: litAt.map((v) => Math.max(0, 1 - (now - v) / 300)),
    quad: (u0, u1, r0 = far, r1 = stop) => { g.beginPath(); rail(u0, r0, r1); rail(u1, r1, r0); g.closePath(); },
    line: (u, r0 = far, r1 = stop) => { g.beginPath(); rail(u, r0, r1); },
    rows: (gap, draw) => { for (let r = Math.ceil((stop + phase) / gap) * gap - phase; r <= far; r += gap) draw(r); },   // rows that travel with the notes
  };

  // The world: its sky, whatever moves in it, and the land in front of that. A hard hit knocks the whole picture.
  const knock = shakeAmp * Math.max(0, 1 - (now - shakeAt) / 260) ** 2 * d, sx = knock * Math.sin(now / 13), sy = knock * Math.cos(now / 17), o = Math.ceil(knock);
  const settle = () => { g.setTransform(1, 0, 0, 1, sx, sy); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.shadowBlur = 0; };
  settle();
  g.drawImage(scenery('sky', w, f), -o, -o, W + o * 2, H + o * 2);
  w.far?.(g, f);
  const land = scenery('land', w, f);
  if (land) g.drawImage(land, -o, -o, W + o * 2, H + o * 2);
  w.live?.(g, f);
  settle();
  if (tilt < 1) {   // in the player the screen stays dark, with the bars as the floor under the board
    g.fillStyle = `rgba(0,0,0,${.42 * (1 - tilt)})`; g.fillRect(-o, -o, W + o * 2, H + o * 2);
    bars(g, strip(W, H, zone), 1 - tilt);
  }
  // Full screen: the bars line both sides of the road like buildings on an avenue, low sounds nearest, fading with distance.
  if (tilt > 0) bars(g, (i) => {
    const [x, y, k] = at(i % 2 ? 4 : 0, -.05 + (i >> 1) * .075), bw = lane * .5 * k, left = i % 2 ? x + lane * .3 * k : x - lane * .8 * k;
    const inView = (Math.min(W, left + bw) - Math.max(0, left)) / bw > .4;   // a sliver at the screen's edge would read as a stray line
    return [left, y, bw, lane * 2.4 * k, inView ? .2 + .6 * Math.min(1, k) : 0];
  }, tilt * (over ? .35 : 1), true);   // quieter behind a result
  settle();
  w.road(g, f);
  settle();

  if (!over && notes.length) {
    // The line to hit on, and a pad in each lane: it fills while its key or finger is down, and brightens when a note is in reach.
    const x0 = cx - 2 * lane, hot = [0, 0, 0, 0];
    for (let i = first; i < notes.length && notes[i].t - t <= HIT; i++) { const n = notes[i]; if (!n.state) hot[n.lane] = hot[n.lane + (n.kind ? 1 : 0)] = 1; }
    g.globalAlpha = .55; g.fillStyle = ink; g.fillRect(x0, yHit - d, lane * 4, 2 * d);
    g.font = `${type}px ${s.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      const tone = w.hands[+(i > 1)], lit = Math.max(down[i], f.lit[i]), px = x0 + (i + .5) * lane;
      const pool = g.createRadialGradient(px, yHit, 0, px, yHit, ring * 1.7);   // light pooled under the pad
      pool.addColorStop(0, `${tone[1]}66`); pool.addColorStop(1, `${tone[1]}00`);
      g.save(); g.translate(0, yHit * (1 - lie)); g.scale(1, lie); g.globalAlpha = .5 + .5 * Math.max(lit, hot[i]); g.fillStyle = pool; g.fillRect(px - ring * 1.7, yHit - ring * 1.7, ring * 3.4, ring * 3.4); g.restore();
      g.beginPath(); g.ellipse(px, yHit, ring, ring * lie, 0, 0, 7);
      g.globalAlpha = .2 + .5 * lit + .2 * hot[i]; g.fillStyle = tone[1]; g.fill();
      g.globalAlpha = 1; g.strokeStyle = tone[hot[i] || lit ? 0 : 1]; g.lineWidth = (hot[i] ? 3.5 : 2.5) * d; g.stroke();
      g.beginPath(); g.ellipse(px, yHit, ring * .62, ring * .62 * lie, 0, 0, 7); g.globalAlpha = .5; g.lineWidth = d; g.stroke();
      if (!coarse.matches) { g.globalAlpha = .95; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.75)'; g.shadowBlur = 4 * d; g.fillText(KEYS[i].toUpperCase(), px, yHit + d); g.shadowBlur = 0; }
    }

    // Notes, farthest first. A missed one keeps going and fades. One to hold trails a ribbon as long as it lasts. On the road each floats over its shadow.
    const see = 1 + .5 * tilt;
    let stopAt = first;
    while (stopAt < notes.length && (notes[stopAt].t - t) / travel < see) stopAt++;
    for (let i = stopAt - 1; i >= Math.max(0, first - 6); i--) {
      const n = notes[i], gone = n.state === 3 ? (now - n.at) / 320 : 0;
      if (n.state === 2 || gone >= 1) continue;
      const broad = n.kind ? 1 : 0, hand = +(n.lane > 1), tone = w.hands[hand], u = n.lane + .5 + broad * .5, r = n.state === 1 ? 0 : (n.t - t) / travel, [nx, ny, k] = at(u, r);
      const show = (1 - gone) * clamp((see - r) / .2) * (n.state === 3 ? .55 : 1), sz = size * k, iw = sz * (1 + broad), topY = ny - sz * (.5 + .3 * tilt);
      if (n.hold) {
        const r1 = Math.min(see, (n.t + n.hold - t) / travel), hw = size * .2, tip = at(u, r1);
        g.fillStyle = tone[n.state === 1 ? 0 : 1]; g.globalAlpha = (1 - gone) * (n.state === 1 ? .9 : .6);
        g.beginPath();
        for (let j = 0; j <= 6; j++) { const p = at(u, r + (r1 - r) * j / 6); g.lineTo(p[0] - hw * p[2], p[1]); }
        g.arc(tip[0], tip[1], hw * tip[2], Math.PI, 0);
        for (let j = 6; j >= 0; j--) { const p = at(u, r + (r1 - r) * j / 6); g.lineTo(p[0] + hw * p[2], p[1]); }
        g.fill();
      }
      w.wake?.(g, f, u, r, tone, show);
      if (tilt) { g.globalAlpha = show * tilt; g.fillStyle = w.shade; g.beginPath(); g.ellipse(nx, ny, sz * (.4 + broad * .5), sz * .13, 0, 0, 7); g.fill(); }
      g.globalAlpha = show;
      const img = sprite(s.id, hand, n.kind, n.v);
      if (n.kind === 2) { g.save(); g.translate(nx, 0); g.scale(-1, 1); g.drawImage(img, -iw / 2, topY, iw, sz); g.restore(); } else g.drawImage(img, nx - iw / 2, topY, iw, sz);
    }
    g.globalAlpha = 1;

    // A finger or the mouse leaves a blade of light behind it.
    while (trail.length && now - trail[0].at > 220) trail.shift();
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], k = 1 - (now - b.at) / 220;
      if (a.id !== b.id) continue;
      g.strokeStyle = w.hands[+(b.x > cx)][0]; g.globalAlpha = k; g.lineWidth = (2 + 9 * k) * d;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    settle();
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i], a = (now - e.at) / e.life;
      if (a >= 1) { fx.splice(i, 1); continue; }
      g.save(); e.draw(a, g, f); g.restore();
    }
  }

  // Over everything: what this world's lens does to the picture, a red edge on a miss, a flash on a streak.
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  w.post?.(g, f);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (f.miss && !w.mono) {
    const edge = g.createRadialGradient(cx, H / 2, Math.min(W, H) * .3, cx, H / 2, Math.hypot(W, H) / 2);
    edge.addColorStop(0, 'rgba(255,40,40,0)'); edge.addColorStop(1, `rgba(255,40,40,${.4 * f.miss})`);
    g.fillStyle = edge; g.fillRect(0, 0, W, H);
  }
  if (now - flashAt < 300) { g.fillStyle = `rgba(255,255,255,${.16 * (1 - (now - flashAt) / 300)})`; g.fillRect(0, 0, W, H); }
  if (full) { const dusk = g.createLinearGradient(0, 0, 0, H * .17); dusk.addColorStop(0, 'rgba(0,0,0,.62)'); dusk.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = dusk; g.fillRect(0, 0, W, H * .17); }   // so the title row reads over any sky
  if (over) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, H); return; }
  if (!notes.length) return;

  // Streak and multiplier, score, a bar across the top for how far through the level, and how to play until the first note comes.
  g.font = `${type}px ${s.font}`; g.fillStyle = ink; g.textBaseline = 'top'; g.shadowColor = w.glow || s.glow; g.shadowBlur = 6 * d;
  if (streak > 1) { g.textAlign = 'left'; g.fillText(`${streak} COMBO  x${mult()}`, 14 * d, top); }
  if (judged) { g.textAlign = 'right'; g.fillText(score.toLocaleString('en-US'), W - 14 * d, top); }
  const wait = notes[0].t - .4 - t;
  if (!judged && wait > 0) {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = clamp(wait / .6); g.shadowColor = 'rgba(0,0,0,.85)';
    const y = full ? hz + (yHit - hz) * .5 : yHit * .45;
    g.fillText(coarse.matches ? 'TAP OR SWIPE THE BLOCKS' : 'A S K L: HIT THE BLOCKS', cx, y - type * .7);
    g.fillText('YOUR HITS PLAY THE SONG', cx, y + type * .7);
    g.globalAlpha = 1;
  }
  g.shadowBlur = 0;
  g.globalAlpha = .25; g.fillRect(0, 0, W, 2 * d);
  g.globalAlpha = .9; g.fillRect(0, 0, W * Math.min(1, t / end), 2 * d);
  g.globalAlpha = 1;
}

/* ---------- Full screen: the player's screen leaves its window, fills the display, and the board tilts back into a road ---------- */
const inset = (r) => `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 6px)`;
function turnTo(to) { tiltFrom = tilt; tiltTo = to; tiltAt = performance.now(); }
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
  measure(); label(); turnTo(1);
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
  turnTo(0);
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
  canvas.setAttribute('aria-label', 'Play along. Press A, S, K or L, or tap or swipe a lane, when a block reaches the line. The song only plays while you keep hitting. Escape leaves.');
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
  notes = []; down.fill(0); fingers.clear(); fx.length = trail.length = 0;
  deck.band(null);
  canvas.style.filter = ''; layers.sky = layers.land = null;
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
function point(e) {   // which lane a finger or the mouse is over, and where on the canvas
  const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * canvas.width / r.width;
  trail.push({ id: e.pointerId, x, y: (e.clientY - r.top) * canvas.height / r.height, at: performance.now() });
  return Math.max(0, Math.min(3, Math.floor((x - board.left) / board.lane)));
}
canvas.addEventListener('pointerdown', (e) => {
  if (!on || over) return;
  e.preventDefault();
  const lane = point(e);
  fingers.set(e.pointerId, lane);
  try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ }
  press(lane);
});
canvas.addEventListener('pointermove', (e) => {   // held down and drawn across the lanes, it cuts each one it enters
  const was = fingers.get(e.pointerId);
  if (was == null || over) return;
  const lane = point(e);
  if (lane === was) return;
  fingers.set(e.pointerId, lane);
  lift(was); press(lane);
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
