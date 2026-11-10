// PLAY_ME.EXE: a 30-second guided tour for recruiters. It answers three things: who is she, what can she do, why hire her.
// A spotlight moves from window to window, and on a phone the document sits above the dock. Written, never spoken: there is no synthesized voice.
import { track } from './analytics.js';
import { vhs } from './audio.js';
import { dockKitty } from './kitty.js';

const STEPS = [
 {
  "win": "about",
  "heading": "Who is Tahsin Anan?",
  "caption": "I'm a marketing analytics graduate from Baruch, and I paint. Both take the same skill: noticing what stands out."
 },
 {
  "win": "case",
  "heading": "What can she do? Run a campaign.",
  "caption": "People weren't buying cruise tickets. I led a 5-week campaign built on memes. Online engagement rose 25% and followers 20%."
 },
 {
  "win": "observe",
  "tab": "visit",
  "heading": "What can she do? Read an audience.",
  "caption": "This window is reading your visit right now: what you opened, and what kind of visitor that makes you. That's how I study any audience."
 },
 {
  "win": "observe",
  "tab": "ab",
  "heading": "What can she do? Test instead of guess.",
  "caption": "I wrote two headlines and couldn't pick, so half of visitors see each. I count which gets more people to open my resume or email me."
 },
 {
  "win": "design",
  "heading": "What can she do? Design.",
  "caption": "I make the work too: logos, flyers and campaign graphics. All of these are mine."
 },
 {
  "win": "art",
  "heading": "And she paints.",
  "caption": "These are my paintings. The baseball sketch is coffee and pen."
 },
 {
  "win": "end",
  "heading": "Why hire her?",
  "caption": "I come up with the idea, I make it, and I check whether it worked. I'm looking for roles in marketing analytics, brand and insights. My resume and email are right here. Then go play: change the song and the whole desktop changes."
 }
];

const $ = (id) => document.getElementById(id);
const still = matchMedia('(prefers-reduced-motion: reduce)');
let api, opener = null, active = false, index = 0, timer = 0, running = false, hovering = false, typing = 0, stepEnd = 0, remaining = 0, paused = false, saved = [], opened = new Set();

const dock = $('tour'), spot = $('tourspot');
const kitty = dockKitty(dock.querySelector('.tour__kitty'));   // the kitty narrates from the dock: it says hello, points at each window, and nods at the end

function snapshot() {
  saved = [...api.wins].map(([id, w]) => ({ id, open: w.open, min: w.min, placed: w.placed, left: w.el.style.left, top: w.el.style.top, cw: w.el.style.getPropertyValue('--w'), ch: w.el.style.getPropertyValue('--h'), z: w.el.style.zIndex, max: w.el.classList.contains('is-max'), sheet: w.el.classList.contains('is-sheet') }));
  saved.focus = api.focused();
}
function restore() {
  for (const s of saved) {
    const w = api.wins.get(s.id);
    w.el.classList.remove('is-touring');
    w.el.classList.toggle('is-max', s.max);
    w.el.classList.toggle('is-sheet', s.sheet);
    w.el.style.left = s.left; w.el.style.top = s.top; w.el.style.zIndex = s.z;
    w.el.style.setProperty('--w', s.cw); w.el.style.setProperty('--h', s.ch);
    w.open = s.open; w.min = s.min; w.placed = s.placed;
    w.el.hidden = !s.open || s.min;
  }
  api.refresh();
  if (saved.focus) api.focus(saved.focus);
}

// Every episode gets the same frame: the open space between the icons and the narration column, centered if there's extra room.
function frame(id) {
  const w = api.wins.get(id);
  w.el.classList.remove('is-max');
  w.el.classList.add('is-touring');
  api.focus(id);
  spot.hidden = false;
  if (!api.desktop()) return;   // the CSS stacks the document above the dock
  const left = api.leftEdge(), top = 14, room = dock.offsetLeft - left - 14;
  const width = Math.min(1000, room), height = innerHeight - 48 - top * 2, x = left + (room - width) / 2;
  w.el.style.left = `${x}px`; w.el.style.top = `${top}px`;
  w.el.style.setProperty('--w', `${width}px`); w.el.style.setProperty('--h', `${height}px`);
  spot.style.cssText = `left:${x - 6}px;top:${top - 6}px;width:${width + 12}px;height:${height + 12}px`;
}

function say(text) {
  const p = $('tour-p');
  $('tour-live').textContent = text;
  clearInterval(typing);
  p.textContent = text;
  p.style.minHeight = '';
  if (!api.desktop()) p.style.minHeight = `${p.offsetHeight}px`;   // the dock takes its full height now, so typing never moves the document above it
  if (still.matches) return;
  const words = text.split(' ');
  let n = 0;
  dock.classList.add('is-talking');
  p.textContent = '';
  typing = setInterval(() => {
    n++;
    p.textContent = words.slice(0, n).join(' ');
    if (n >= words.length) { clearInterval(typing); dock.classList.remove('is-talking'); }
  }, 105);
}

// The one place that decides whether the step timer runs. Pause and a mouse over the dock hold it, and with reduced motion the tape moves only when asked.
function hold() {
  const held = paused || hovering, run = active && !held && !still.matches && index < STEPS.length - 1;
  dock.classList.toggle('is-paused', held);
  const stopped = paused && !api.desktop() && index < STEPS.length - 1;   // on a phone a scroll pauses the tape, so the VCR text and clock say so
  crt.classList.toggle('is-paused', stopped);
  crt.querySelector('.crt__play').textContent = stopped ? 'PAUSE' : 'PLAY';
  if (run === running) return;
  running = run;
  if (run) { stepEnd = performance.now() + remaining; timer = setTimeout(next, remaining); }
  else { clearTimeout(timer); remaining = Math.max(800, stepEnd - performance.now()); }
}
function arm(ms) {
  clearTimeout(timer);
  running = false; remaining = ms;
  dock.style.setProperty('--step-ms', `${ms}ms`);
  hold();
}
function setPaused(on) {
  paused = on;
  if (!on) hovering = false;   // Play means play, even with the mouse still on the button
  $('tour-pause').textContent = on ? 'Play' : 'Pause';
  hold();
}

const crt = $('crt');
let clockTimer = 0, tapeStart = 0, offTimer = 0;
function powerOn() {
  clearTimeout(offTimer);   // a quick replay must not lose the CRT to the last power-off
  crt.classList.remove('is-off', 'is-skip');
  crt.hidden = false;
  crt.classList.add('is-on');
  vhs.start();
  tapeStart = performance.now();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => { if (crt.classList.contains('is-paused')) { tapeStart += 500; return; } const s = Math.floor((performance.now() - tapeStart) / 1000); $('crt-time').textContent = `SP 0:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 500);
}
function powerOff() {
  clearInterval(clockTimer);
  vhs.stop();
  crt.classList.remove('is-on', 'is-skip');
  if (still.matches) { crt.hidden = true; return; }
  crt.classList.add('is-off');
  offTimer = setTimeout(() => { crt.hidden = true; crt.classList.remove('is-off'); }, 430);
}
function tapeSkip() {
  crt.classList.remove('is-skip');
  void crt.offsetWidth;   // restart the animation
  crt.classList.add('is-skip');
  vhs.skip();
}

function show(i) {
  const moved = active && i !== index && dock.dataset.started === '1', from = document.activeElement;
  if (moved) tapeSkip();
  dock.dataset.started = '1';
  index = Math.max(0, Math.min(STEPS.length - 1, i));
  const s = STEPS[index], last = index === STEPS.length - 1;
  $('tour-h').textContent = s.heading;
  $('tour-count').textContent = `Episode ${index + 1} of ${STEPS.length}`;
  dock.querySelectorAll('.tour__seg i').forEach((seg, n) => {
    seg.className = n < index ? 'is-done' : n === index ? 'is-now' : '';
  });
  $('tour-back').disabled = index === 0;
  $('tour-next').hidden = last;
  $('tour-pause').hidden = last;
  $('tour-end').hidden = !last;
  $('tour-stop').hidden = last;
  kitty.cue(index === 0 ? 'happy' : last ? 'nod' : 'point', index === 0 || last ? 2500 : 0);
  say(s.caption);   // after those, so a phone measures it in the dock's final shape
  if (dock.contains(from) && (from.disabled || from.closest('[hidden]'))) (last ? $('tour-play') : $('tour-next')).focus({ preventScroll: true });   // the keyboard stays in the dock when its button goes away
  track('rundown_step', { step: index + 1, window: s.win || 'end' });
  if (last) {
    hold();
    spot.hidden = true;
    restore();
    track('rundown_finish');
    return;
  }
  if (!api.wins.get(s.win).open || api.wins.get(s.win).min) opened.add(s.win);
  api.open(s.win, { user: false, quiet: true, tab: s.tab });
  frame(s.win);
  const words = s.caption.split(' ').length;
  arm(Math.max(3800, 900 + words * 215));
}
function next() { show(index + 1); }

export function stop(reason = 'stop') {
  if (!active) return;
  active = false;
  clearTimeout(timer); clearInterval(typing); running = false;
  dock.hidden = true; spot.hidden = true;
  dock.dataset.started = '0';
  powerOff();
  removeEventListener('keydown', onKey, true);
  if (index < STEPS.length - 1) restore();
  document.documentElement.classList.remove('is-rundown');
  dispatchEvent(new CustomEvent('tahsin:rundown', { detail: { active: false } }));
  if (reason !== 'link') opener?.focus?.({ preventScroll: true });
  if (reason === 'stop' && index < STEPS.length - 1) track('rundown_stop', { step: index + 1 });
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); }
  else if (e.key === 'ArrowRight' && index < STEPS.length - 1 && !e.target.closest?.('input, textarea')) { e.preventDefault(); next(); }
  else if (e.key === 'ArrowLeft' && index > 0 && !e.target.closest?.('input, textarea')) { e.preventDefault(); show(index - 1); }
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`)).observe(dock);
  const segs = dock.querySelector('.tour__seg');
  segs.innerHTML = STEPS.map(() => '<i></i>').join('');
  $('tour-next').addEventListener('click', next);
  $('tour-back').addEventListener('click', () => show(index - 1));
  $('tour-pause').addEventListener('click', () => setPaused(!paused));
  $('tour-stop').addEventListener('click', () => stop());
  $('tour-play').addEventListener('click', () => stop('done'));
  dock.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hovering = true; hold(); } });
  dock.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hovering = false; hold(); } });
  addEventListener('click', (e) => { if (active && e.target.closest?.('[data-open], [data-conv], [data-view]')) stop('link'); }, true);
  // Reaching into a window means they want to read, so the tour waits for them.
  $('desk').addEventListener('pointerdown', () => { if (active && !paused && index < STEPS.length - 1) setPaused(true); });
}

export function start(a, from) {
  api = a; opener = from;
  if (active) return;
  active = true;
  wire();
  snapshot();
  opened = new Set();
  paused = hovering = false;
  $('tour-pause').textContent = 'Pause';
  dock.hidden = false;
  document.documentElement.classList.add('is-rundown');
  dispatchEvent(new CustomEvent('tahsin:rundown', { detail: { active: true } }));
  addEventListener('keydown', onKey, true);
  track('rundown_start');
  powerOn();
  index = 0;
  show(0);
  $('tour-next').focus({ preventScroll: true });
}
