// The frame clock: the site's one requestAnimationFrame loop. Everything that moves joins it instead of asking the browser for
// frames of its own, so every frame runs in one order: the song's levels first, then every read of the page, then every write,
// then canvases that draw text. A read never follows a write, so the browser never has to work out layout in the middle of a
// frame, and text, which makes it settle the page's styles first, comes after every change to them, so that happens once.
//
// It asks for no frames when nothing needs them: while the tab is hidden, while nothing that moves is on screen (a phone's
// sheet over the desktop), and after 20 seconds with no pointer, tap, scroll or key while no music plays. It never dozes off
// while music plays, the tape runs, or something wants every frame (a play-along level, a toy being played). Before it sleeps,
// the calm motion slows to rest over about a second and <html> gets .is-asleep, which holds the CSS loops still. The next
// input wakes it at once.
//
// To move something, join it: join({ rate, levels, read, write, paint }).
//   rate()           asked every frame. 0: no frames now. CALM: 30 a second, for the ambient things (bubbles, the bars, the
//                    wallpaper), which slow to rest with the clock and get a dt that slows with them. FULL: every frame the
//                    display shows, for games, toys while they're played, windows on the move. Anything FULL keeps it awake.
//   levels(now, dt)  optional, first in every frame: what the others depend on (the song's live levels).
//   read(now, dt)    optional: measure the page here, and only here. Better still, measure once and keep it until a resize.
//   write(now, dt)   draw and change the page.
//   paint(now, dt)   instead of write, for a canvas that draws text (the play-along's): last, after every change to the page.
// now is performance time. dt is milliseconds since this one last ran, and 0 on its first frame back.
// A sleeping clock asks nobody, so something that starts wanting frames again on its own calls wake(). Input wakes it anyway.
// once(write, read) is a single FULL frame for something brief, the way requestAnimationFrame is used.
// keep(reason, on) holds it awake for a reason of its own, like music. seen(el) says whether el is on screen. awake() is how long
// until it may doze off.
// A mover that throws is reported and skipped for that frame; the others and the clock carry on.
// The desktop cat (js/kitty.js) joins the same way: CALM while it wanders, 0 while it sits still, so it sleeps for free.
export const CALM = 30, FULL = Infinity;   // FULL isn't a number of frames: it's every frame the display has, 60 or 120 or more
const IDLE = 20000, FADE = 1000, GAP = 30, EARLY = 10;   // ms: idle before sleeping, the slow-down before that, between calm frames, and how early to ask for one
const root = document.documentElement, movers = [], held = new Set();
let jobs = [], raf = 0, timer = 0, dozing = 0, lastInput = performance.now(), fadeFrom = 0, asleep = false, calmAt = 0, levelsAt = 0;
// A screen that can't keep calm frames near 30 a second for a few seconds gets less to draw, a step at a time and never back:
// first the wallpaper stops rippling, then there are fewer bubbles on a coarser canvas. The same idea as the play-along's lite.
export let lite = 0;
let lag = 33, slow = 0, rested = true, early = false;   // rested: the next calm frame follows a pause, so its gap says nothing about the screen

export function join(m) { m.at = null; movers.push(m); wake(); return m; }
export function once(write, read) { jobs.push({ write, read }); ask(true); }
export function keep(reason, on) { if (on) held.add(reason); else held.delete(reason); poke(); }   // either way the 20 seconds start now
export function wake() { ask(true); }
// How long before it may doze off, in ms (Infinity while something holds it awake), so a mover can avoid starting what it couldn't finish.
export const awake = () => (held.size ? Infinity : lastInput + IDLE - performance.now());
const safe = (f, ...a) => { try { f?.(...a); } catch (e) { reportError(e); } };
// On screen or not, from the browser's own bookkeeping, so nothing reads layout every frame to find out.
export function seen(el) {
  let yes = false;
  new IntersectionObserver((list) => { yes = list[list.length - 1].isIntersecting; if (yes) wake(); }).observe(el);
  return () => yes;
}

function ask(soon) {
  if (document.hidden || raf) return;
  if (soon) { clearTimeout(timer); timer = 0; raf = requestAnimationFrame(tick); return; }
  // Only calm things are moving: rest until just before their next frame is due, so the browser isn't asked for frames it would
  // throw away. While the screen is refreshing anyway (the CSS loops keep it so), a frame asked for waits for the next refresh,
  // so ask a little early: a timer landing just after one would wait a whole refresh more, and the gap would be 50 ms where 33
  // was meant (66 on a 30 Hz screen), enough to look like a slow screen and step down for the rest of the visit.
  // Where the early ask is answered at once instead, the frame came too soon (early), so the second try is timed exactly.
  // ponytail: there a calm frame costs one empty tick first. Cheap; time EARLY from the screen's own refresh if it ever shows up in a profile.
  if (!timer) timer = setTimeout(() => { timer = 0; ask(true); }, Math.max(0, calmAt + GAP - (early ? 1 : EARLY) - performance.now()));
}

function poke() {
  lastInput = performance.now();
  if (!dozing) dozing = setTimeout(doze, IDLE);
  if (fadeFrom || asleep) { fadeFrom = 0; asleep = false; rested = true; root.classList.remove('is-asleep'); settle(false); }
  if (!timer) ask(true);   // and a clock that stopped for any other reason starts again
}
// A blink or a title bar sweep caught halfway as the clock falls asleep finishes its movement, then holds still where it
// rests, and carries on from there on waking. MOVES is the part of each turn that moves, from their @keyframes in css/site.css.
const MOVES = { blink: [.95, 1], sweep: [0, .09] };
let parked = [];
function settle(sleeping) {
  for (const [a, t] of parked) { clearTimeout(t); if (!sleeping && a.playState === 'paused') a.play(); }
  parked = !sleeping ? [] : document.getAnimations().filter((a) => MOVES[a.animationName]).map((a) => {
    const [from, to] = MOVES[a.animationName], { currentIteration: i, progress: p, duration, delay, localTime } = a.effect.getComputedTiming();
    return [a, setTimeout(() => a.pause(), p !== null && p >= from && p < to ? (i + to) * duration + delay - localTime : 0)];
  });
}
function doze() {
  dozing = 0;
  const left = lastInput + IDLE - performance.now();
  if (left > 0 || held.size || movers.some((m) => m.rate() === FULL)) { dozing = setTimeout(doze, left > 0 ? left : IDLE); return; }
  fadeFrom = performance.now();
  ask(true);
}

function tick(now) {
  raf = 0;
  if (document.hidden) return;
  let speed = 1;
  if (fadeFrom) {
    const k = Math.min(1, (now - fadeFrom) / FADE);
    speed = 1 - k * k * (3 - 2 * k);
    if (k === 1) { fadeFrom = 0; asleep = true; root.classList.add('is-asleep'); settle(true); }
  }
  // Calm frames are timed by the clock on the wall: on a page that's holding still, the browser serves a frame asked for
  // between two screen refreshes at once, stamped with the refresh before, so the stamps alone would make every other one look early.
  const wall = performance.now(), calm = wall - calmAt >= GAP - 1, run = [], due = jobs;
  jobs = [];
  let want = !!fadeFrom, full = false, ranCalm = false;
  for (const m of movers) {
    let r = m.rate();
    if (asleep && r === CALM) r = 0;
    if (!r) { m.at = null; continue; }
    want = true;
    if (r === FULL) full = true;
    else if (calm) ranCalm = true;
    else continue;
    run.push([m, m.at === null ? 0 : (now - m.at) * (r === CALM ? speed : 1)]);
    m.at = now;
  }
  early = want && !full && !ranCalm;
  if (ranCalm) {
    const gap = Math.min(100, wall - calmAt);
    if (!rested) {
      lag += (gap - lag) * .05;
      if (lag <= 45) slow = 0;
      else if ((slow += gap) > 2500 && lite < 2) { lite++; slow = 0; lag = 33; }
    }
    calmAt = wall; rested = false;
  }
  // The next frame is asked for before anything runs, so nothing that throws can stop the clock. Something queued with once()
  // during this frame asks for its own.
  if (want) ask(full);
  else { levelsAt = 0; rested = true; }   // nothing moving: no more frames until something wakes it
  if (run.length) {
    const dt = levelsAt ? Math.min(100, now - levelsAt) : 0;
    levelsAt = now;
    for (const m of movers) safe(m.levels, now, dt);
  }
  for (const [m, dt] of run) safe(m.read, now, dt);
  for (const j of due) safe(j.read, now);
  for (const [m, dt] of run) safe(m.write, now, dt);
  for (const j of due) safe(j.write, now);
  for (const [m, dt] of run) safe(m.paint, now, dt);
}

for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'focus']) addEventListener(type, poke, { capture: true, passive: true });
document.addEventListener('scroll', poke, { capture: true, passive: true });   // scrolling inside a window counts too
addEventListener('tahsin:rundown', (e) => keep('tour', e.detail.active));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { poke(); return wake(); }
  cancelAnimationFrame(raf); clearTimeout(timer);   // a hidden tab asks for nothing
  raf = timer = 0; rested = true;
});
dozing = setTimeout(doze, IDLE);
