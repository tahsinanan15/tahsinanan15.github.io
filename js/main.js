// Tahsin OS: windows, taskbar, start menu, boot, wallpaper. One window manager: on a phone the windows are sheets on a stack. No-JS gets the plain scrolling page.
import { track, convert, countOnce, startVisit, sawHeadline, variant, HEADLINES, session } from './analytics.js';
import { initAudio, sfx, startSoundNow, tryAutoplay, declineSound, osChime, playSong } from './audio.js';
import { initBubbles } from './bubbles.js';
import { THEMES, SONGS } from './themes.js';
import { setFx, quake } from './fx.js';

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const all = (sel, el = document) => [...el.querySelectorAll(sel)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const still = matchMedia('(prefers-reduced-motion: reduce)');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

const TASKBAR = 48;
// In Concrete Jungle the citizens walk along the bottom of the wall, so new windows open above them.
const deskH = () => innerHeight - TASKBAR - (root.dataset.theme === 'metro' ? 72 : 0);
const FIXED_SIZE = ['player', 'bubblepop', 'paint', 'panopticon'];   // their contents are a fixed shape, so they don't resize
const START_OPEN = ['portrait', 'player'];   // the desktop stays clear so PLAY_ME.EXE is the first thing a new visitor notices
const wins = new Map();
const isPhone = () => innerWidth < 980 || innerHeight < 540;
const desktop = () => !root.classList.contains('phone');   // free-floating windows, as opposed to a phone's sheets
const sheets = [];   // phones: what's open, bottom to top, plus 'tour' while the tape plays. Each one owns a history entry.
let z = 10, focused = null;

/* ---------- Windows ---------- */
all('.win').forEach((el) => {
  const file = el.dataset.file;
  const task = document.createElement('button');
  task.className = 'task'; task.type = 'button'; task.hidden = true;
  task.innerHTML = `<svg aria-hidden="true"><use href="#${el.dataset.icon}"/></svg><span>${file}</span>`;
  $('tasks').append(task);
  task.addEventListener('click', () => {
    const w = wins.get(el.id);
    if (w.min) restore(el.id); else if (focused === el.id) minimize(el.id); else { focus(el.id); el.focus({ preventScroll: true }); }
  });
  const btns = document.createElement('div');
  btns.className = 'win__btns';
  const maxBtn = ['portrait', 'player', 'bubblepop'].includes(el.id) ? '' : `<button class="win__btn" data-act="max" aria-label="Maximize ${file}"><svg aria-hidden="true"><use href="#u-max"/></svg></button>`;
  btns.innerHTML = `<button class="win__btn" data-act="min" aria-label="Minimize ${file}"><svg aria-hidden="true"><use href="#u-min"/></svg></button>${maxBtn}<button class="win__btn win__btn--close" data-act="close" aria-label="Close ${file}"><svg aria-hidden="true"><use href="#u-close"/></svg></button>`;
  const bar = el.querySelector('.win__bar');
  bar.append(btns);
  wins.set(el.id, { el, task, open: false, min: false, placed: false });
  el.tabIndex = -1;
  btns.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close(el.id);
    if (act === 'min') minimize(el.id);
    if (act === 'max') toggleMax(el.id);
  });
  bar.addEventListener('dblclick', (e) => { if (desktop() && !e.target.closest('button') && el.querySelector('[data-act=max]')) toggleMax(el.id); });
  bar.addEventListener('pointerdown', (e) => startDrag(e, el));
  el.addEventListener('pointerdown', () => { if (desktop()) focus(el.id); }, true);
  el.addEventListener('focusin', () => { if (desktop() && focused !== el.id) focus(el.id); });
  if (FIXED_SIZE.includes(el.id)) return;
  for (const edge of ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']) {
    const grip = document.createElement('i');
    grip.className = `grip grip--${edge}`;
    grip.addEventListener('pointerdown', (e) => startResize(e, el, edge));
    el.append(grip);
  }
});

function startDrag(e, el) {
  if (!desktop() || e.button || e.target.closest('button') || el.classList.contains('is-max')) return;
  const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, bar = e.currentTarget;
  bar.setPointerCapture(e.pointerId);
  const move = (ev) => {
    el.style.left = `${clamp(ev.clientX - dx, 70 - r.width, innerWidth - 70)}px`;
    el.style.top = `${clamp(ev.clientY - dy, 0, innerHeight - TASKBAR - 34)}px`;
  };
  const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); track('window_drag', { window: el.id }); };
  bar.addEventListener('pointermove', move);
  bar.addEventListener('pointerup', up);
  bar.addEventListener('pointercancel', up);
}

// Drag any edge or corner, like a real OS. Windows stay on screen and big enough to read.
function startResize(e, el, edge) {
  if (!desktop() || e.button || el.classList.contains('is-max')) return;
  e.preventDefault();
  const x0 = el.offsetLeft, y0 = el.offsetTop, w0 = el.offsetWidth, h0 = el.offsetHeight, sx = e.clientX, sy = e.clientY;
  const H = innerHeight - TASKBAR, minW = Math.min(w0, 200), minH = Math.min(h0, 180);
  const move = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (edge.includes('e')) el.style.setProperty('--w', `${clamp(w0 + dx, minW, innerWidth - x0 - 4)}px`);
    if (edge.includes('s')) el.style.setProperty('--h', `${clamp(h0 + dy, minH, H - y0 - 2)}px`);
    if (edge.includes('w')) { const w = clamp(w0 - dx, minW, x0 + w0 - 4); el.style.setProperty('--w', `${w}px`); el.style.left = `${x0 + w0 - w}px`; }
    if (edge.includes('n')) { const h = clamp(h0 - dy, minH, y0 + h0); el.style.setProperty('--h', `${h}px`); el.style.top = `${y0 + h0 - h}px`; }
  };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); root.classList.remove('is-resizing'); track('window_resize', { window: el.id }); };
  root.classList.add('is-resizing');
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

function animate(el, frames, ms) {
  return still.matches ? Promise.resolve() : el.animate(frames, { duration: ms, easing: 'cubic-bezier(.16,1,.3,1)' }).finished.catch(() => {});
}
const POP_IN = [{ opacity: 0, transform: 'translateY(16px) scale(.93)' }, { opacity: 1, transform: 'none' }];

function sizeFor(el) {
  const W = innerWidth, H = deskH(), left = $('icons').getBoundingClientRect().right + 12;
  const room = W - left - 16;
  switch (el.dataset.size) {
    case 'wide': return [Math.min(940, room), Math.min(H - 28, 700)];
    case 'doc': return [Math.min(700, room), Math.min(H - 24, 760)];
    case 'paint': return [Math.min(720, room), Math.min(H - 24, 660)];
    case 'viewer': return [Math.min(1000, room), H - 24];
    case 'panopticon': return [Math.min(Math.max(380, H - 190), room), null];
    default: {
      const widths = { bubblepop: 400, wallpaper: 560, things: 480, contact: 480, bin: 430, player: 350, portrait: 210 };
      return [Math.min(widths[el.id] || 520, room), null];
    }
  }
}

// New windows open centered in the open desktop, like a real OS: clear of the icons and of her photo and the player when they fit
// beside them. Each one already open nudges the next down and right so every title bar stays reachable.
function place(el) {
  const [w, h] = sizeFor(el), H = deskH();
  el.style.setProperty('--w', `${w}px`);
  el.style.setProperty('--h', h ? `${h}px` : 'auto');
  const left = $('icons').getBoundingClientRect().right + 12, realH = h || el.offsetHeight || 420;
  const beside = ['portrait', 'player'].map((id) => wins.get(id)).filter((o) => o.open && !o.min && o.el !== el).map((o) => o.el.offsetLeft - 12);
  const clear = Math.min(innerWidth - 12, ...beside), right = clear - left >= w ? clear : innerWidth - 12;
  const others = [...wins.values()].filter((o) => o.open && !o.min && o.el !== el && !['portrait', 'player'].includes(o.el.id)).length, step = others % 6 * 26;
  el.style.left = `${clamp(left + (right - left - w) / 2 + step, left, Math.max(left, innerWidth - w - 8))}px`;
  el.style.top = `${clamp((H - realH) / 2 + step, 8, Math.max(8, H - realH - 8))}px`;
}

// The opening layout: a clear desktop, with her photo top right and the player below it.
function placeStart() {
  const W = innerWidth, H = innerHeight - TASKBAR, M = 14, spare = Math.max(0, W - 1440) * .12;
  const set = (id, x, y, w) => {
    const el = wins.get(id).el;
    el.style.setProperty('--w', `${w}px`); el.style.setProperty('--h', 'auto');
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    wins.get(id).placed = true;
    return el;
  };
  const mw = clamp(W * .25, 352, 380), mp = set('player', W - M - mw - spare, 0, mw);
  let mh = 0;
  wasHidden(mp, () => { mh = mp.offsetHeight; mp.style.top = `${H - M - mh}px`; });
  const pw = clamp((H - M * 3 - mh - 44) / 1.165, 118, 250);   // 118 still fits its title bar buttons
  set('portrait', W - M - pw - spare, M, pw);
}
function wasHidden(el, fn) { const h = el.hidden; el.hidden = false; fn(); el.hidden = h; }

function refreshTasks() {
  wins.forEach((w, id) => {
    w.task.hidden = !w.open;
    w.task.setAttribute('aria-pressed', String(focused === id && !w.min));
    w.task.setAttribute('aria-label', `${w.el.dataset.file}${w.min ? ', minimized' : ''}`);
  });
}

function focus(id) {
  const w = wins.get(id);
  if (!w) return;
  wins.forEach((o) => o.el.classList.toggle('is-focus', o === w || !desktop()));   // a phone has no inactive windows
  w.el.style.zIndex = ++z;
  focused = id;
  refreshTasks();
}

function open(id, { user = true, tab, quiet = false, delay = 0 } = {}) {
  const w = wins.get(id);
  if (!w) return;
  if (id === 'about' && !touring) sawHeadline();   // the tape shows both headlines, so tape watchers stay out of the test
  lazy(id, tab);
  // On a phone her photo and the player first open as widgets on the home screen. Everything else, and opening those again, is a sheet.
  const rising = !desktop() && !w.el.classList.contains('is-sheet') && (w.open || !START_OPEN.includes(id));
  if (user && (!w.open || rising)) { track('window_open', { window: id }); calmHook(); }
  if (user && id === 'resume') convert('resume');
  if (w.min) return restore(id);
  if (rising) { w.el.classList.add('is-sheet'); balloon.hidden = true; }
  if (!touring && w.el.classList.contains('is-sheet')) {   // the tape puts back what it opens, so its windows stay off the stack
    if (sheets.includes(id)) sheets.splice(sheets.indexOf(id), 1);
    sheets.push(id);
    syncHistory();
  }
  if (!w.open || rising) {
    w.el.hidden = false;
    if (desktop() && !w.placed) { place(w.el); w.placed = true; }
    w.open = true;
    if (!quiet) sfx.open();
    if (!still.matches) w.el.animate(POP_IN, { duration: 420, delay, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    if (id === 'player' || id === 'bubblepop') fit(w.el);
  }
  focus(id);
  if (user) w.el.focus({ preventScroll: true });
}

// When the focused window goes away, keyboard focus moves somewhere sensible instead of falling to the page.
function handOffFocus(had) {
  if (!had) return;
  if (focused) wins.get(focused).el.focus({ preventScroll: true }); else startBtn.focus();
}

async function close(id) {
  const w = wins.get(id);
  if (!desktop()) {
    if (!sheets.includes(id)) return;   // a second tap on the way out
    sheets.splice(sheets.indexOf(id), 1);
    syncHistory();
  }
  const had = w.el.contains(document.activeElement);
  if (id === 'viewer') $('vw-stage').replaceChildren();
  sfx.close();
  track('window_close', { window: id });
  await animate(w.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.95)' }], 170);
  if (sheets.includes(id)) return;   // reopened while it was closing
  if (desktop() || !START_OPEN.includes(id)) { w.el.hidden = true; w.open = false; w.min = false; w.placed = START_OPEN.includes(id); }   // her photo and the player come back where they were
  if (!desktop()) { w.el.classList.remove('is-sheet'); w.el.style.zIndex = ''; }
  focusTop();
  if (id === 'viewer' && viewerOpener?.offsetParent) viewerOpener.focus({ preventScroll: true }); else handOffFocus(had);
}

function focusTop() {
  let best = null, bestZ = -1;
  wins.forEach((o, i) => { const v = +o.el.style.zIndex || 0; if (o.open && !o.min && v > bestZ) { best = i; bestZ = v; } });
  focused = null;
  wins.forEach((o) => o.el.classList.toggle('is-focus', !desktop()));
  if (best) focus(best); else refreshTasks();
}

async function minimize(id) {
  const w = wins.get(id), had = w.el.contains(document.activeElement);
  const r = w.el.getBoundingClientRect(), t = w.task.getBoundingClientRect();
  sfx.close();
  await animate(w.el, [{ transform: 'none', opacity: 1 }, { transform: `translate(${t.left - r.left}px, ${t.top - r.top}px) scale(.16)`, opacity: .1, transformOrigin: '0 0' }], 240);
  w.el.hidden = true; w.min = true;
  focusTop();
  handOffFocus(had);
}

function restore(id) {
  const w = wins.get(id);
  if (id === 'panopticon') lazy(id);   // its game loop stops while hidden
  w.el.hidden = false; w.min = false;
  sfx.open();
  animate(w.el, POP_IN, 300);
  focus(id);
  w.el.focus({ preventScroll: true });
}

function toggleMax(id) {
  const el = wins.get(id).el, on = el.classList.toggle('is-max');
  el.querySelector('[data-act=max]').setAttribute('aria-label', `${on ? 'Restore' : 'Maximize'} ${el.dataset.file}`);
}

function fit(el) {
  if (!desktop()) return;
  const H = innerHeight - TASKBAR;   // offset sizes, so a running pop-in animation can't skew the measure
  if (el.offsetTop + el.offsetHeight > H - 6) el.style.top = `${Math.max(6, H - el.offsetHeight - 6)}px`;
  if (el.offsetLeft + el.offsetWidth > innerWidth - 6) el.style.left = `${Math.max(6, innerWidth - el.offsetWidth - 6)}px`;
}
addEventListener('tahsin:player-resize', () => fit(wins.get('player').el));

// One history entry per sheet, so the phone's back gesture closes the top one and never leaves the site while one is open.
// It runs a beat later so that a close and an open in the same tap share an entry instead of racing, and a stale entry (a reload, or going forward) just steps back.
let historyTimer = 0, historyBusy = false;
function syncHistory() {
  root.classList.toggle('has-sheet', sheets.some((s) => s !== 'tour'));
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    if (historyBusy) return;
    const want = sheets.length, have = history.state?.sheets || 0;
    for (let n = have + 1; n <= want; n++) history.pushState({ sheets: n }, '');
    if (want < have) { historyBusy = true; history.go(want - have); setTimeout(() => { historyBusy = false; }, 600); }   // the timer, in case there was no entry to go to
  });
}
addEventListener('popstate', () => {
  const ours = historyBusy;   // a step the site took itself only needs re-syncing: a sheet opened meanwhile must stay
  historyBusy = false;
  if (!ours) {
    const dialog = document.querySelector('dialog[open]'), have = history.state?.sheets || 0;
    if (!startMenu.hidden || dialog) { closeStart(); dialog?.close(); }   // back acts on what's on top, and the sync below puts the sheet's entry back
    else while (sheets.length > have) { const top = sheets[sheets.length - 1]; if (top === 'tour') tourMod.stop(); else close(top); }
  }
  syncHistory();
});

/* ---------- Lazy modules: nothing heavy loads until someone wants it ---------- */
const loaded = {};
function lazy(id, tab) {
  if (id === 'observe') (loaded.observe ||= import('./observe.js')).then((m) => m.init(tab, open));
  if (id === 'bubblepop') (loaded.bp ||= import('./bubblepop.js')).then((m) => m.init());
  if (id === 'paint') (loaded.pt ||= import('./paint.js')).then((m) => m.init());
  if (id === 'panopticon') (loaded.pan ||= import('./panopticon.js')).then((m) => m.init(open));
}

/* ---------- Play along: the star in the player's screen turns the bars into a game ---------- */
const beats = () => (loaded.beats ||= import('./beats.js'));
$('mp-star').addEventListener('click', () => { calmHook(); beats().then((m) => m.toggle()); });
if (store.get('tahsin.beat')) beats();   // someone who has cleared a level gets their stars back in the playlist

/* ---------- Viewer ---------- */
let viewerList = [], viewerIndex = 0, viewerOpener = null;
function showPiece(i) {
  viewerIndex = (i + viewerList.length) % viewerList.length;
  const a = viewerList[viewerIndex], d = a.dataset, stage = $('vw-stage');
  let node;
  if (d.kind === 'video') {
    node = Object.assign(document.createElement('video'), { src: d.video, poster: d.src, controls: true, muted: true, loop: true, autoplay: true, playsInline: true });
    node.setAttribute('aria-label', d.title);
  } else {
    node = Object.assign(new Image(), { src: d.src, alt: a.querySelector('img')?.alt || d.title });
  }
  stage.replaceChildren(node);
  $('vw-title').textContent = d.title;
  $('vw-desc').textContent = d.desc || d.type;
  $('vw-file').textContent = `${d.title.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/_$/, '')}.${d.kind === 'video' ? 'MP4' : d.kind === 'pdf' ? 'PDF' : 'JPG'}`;
  $('vw-open').href = a.href;
  $('vw-open').textContent = d.kind === 'pdf' ? 'Open the PDF' : d.kind === 'video' ? 'Open the video' : 'Open full size';
  track(a.closest('#art') ? 'view_art' : 'view_design', { piece: d.title });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-view]');
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  viewerOpener = a;
  viewerList = all('[data-view]', a.closest('.win'));
  open('viewer');
  showPiece(viewerList.indexOf(a));
});
$('vw-prev').addEventListener('click', () => showPiece(viewerIndex - 1));
$('vw-next').addEventListener('click', () => showPiece(viewerIndex + 1));
$('viewer').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') showPiece(viewerIndex - 1);
  if (e.key === 'ArrowRight') showPiece(viewerIndex + 1);
});

/* ---------- Links that open windows, and conversions ---------- */
document.addEventListener('click', (e) => {
  const conv = e.target.closest('[data-conv]');
  if (conv) {
    convert(conv.dataset.conv);
    if (conv.dataset.conv === 'contact') track('contact_click', { via: conv.textContent.trim().slice(0, 30) });
    if (conv.dataset.conv === 'commission') track('contact_click', { via: 'Commission' });
  }
  const link = e.target.closest('[data-open]');
  if (link) {
    e.preventDefault();
    closeStart();
    open(link.dataset.open, { tab: link.dataset.tab });
  }
});

/* ---------- Start menu ---------- */
const startBtn = $('start'), startMenu = $('startmenu');
function closeStart() { startMenu.hidden = true; startBtn.setAttribute('aria-expanded', 'false'); }
let stared = false;   // the finger that unlocked the hidden one is still on the button
startBtn.addEventListener('click', () => {
  if (stared) { stared = false; return; }
  startMenu.hidden = !startMenu.hidden;
  startBtn.setAttribute('aria-expanded', String(!startMenu.hidden));
  if (!startMenu.hidden) { startMenu.style.zIndex = 9001; startMenu.querySelector('a').focus({ preventScroll: true }); track('start_menu'); }
});
addEventListener('pointerdown', (e) => { if (!startMenu.hidden && !e.target.closest('#startmenu, #start')) closeStart(); });
startMenu.addEventListener('click', (e) => { if (!desktop() && e.target.closest('a')) closeStart(); });
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!startMenu.hidden) { closeStart(); startBtn.focus(); return; }
  const dialog = document.querySelector('dialog[open]');
  if (!desktop()) { if (sheets.length && !dialog) close(sheets[sheets.length - 1]); }
  else if (wins.get('viewer').open) close('viewer');
  else if (focused && document.activeElement?.closest('.win') && !dialog) close(focused);
});

$('icons').addEventListener('contextmenu', (e) => { if (!desktop()) e.preventDefault(); });   // a long press on an app icon is not a link menu

/* ---------- Clock ---------- */
function tickClock() {
  const now = new Date(), c = $('clock');
  c.dateTime = now.toISOString();
  const digits = (s) => (root.dataset.theme === 'ray' ? s.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]) : s);   // Ray OS tells time in Bengali numerals
  c.innerHTML = `${digits(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}<span>${digits(now.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' }))}</span>`;
}
tickClock(); setInterval(tickClock, 15000);

/* ---------- The song is the OS: wallpaper, skin, icons and world all follow it. A picked painting stays until the next song. ---------- */
const SCENES = { hills: 'day', sunset: 'sunset', 'night-street': 'night', sunflowers: 'day', 'hay-cart': 'day' };
// Each OS draws its own objects (assets/icons/<os>.svg), fetched the first time that OS appears. If a set can't load, the Aero set stays up.
const ICON_NAMES = { 'i-person': 'person', 'i-rundown': 'rundown', 'i-chart': 'chart', 'i-eye': 'eye', 'i-pdf': 'pdf', 'i-folder-design': 'design', 'i-folder-art': 'art', 'i-cd': 'cd', 'i-bubbles': 'bubbles', 'i-paint': 'paint', 'i-wall': 'wall', 'i-folder-love': 'love', 'i-mail': 'mail', 'i-bin': 'bin', 'i-txt': 'txt', 'i-bowl': 'bowl' };
const iconSets = { aero: Promise.resolve(false) };
const loadIcons = (id) => iconSets[id] ||= fetch(`assets/icons/${id}.svg`).then((r) => (r.ok ? r.text() : Promise.reject())).then((svg) => {
  const box = document.createElement('div');
  box.className = 'sprite';
  box.innerHTML = svg;
  document.body.append(box);
  return true;
}).catch(() => false);
const iconUses = () => all('svg use').filter((u) => ICON_NAMES[(u.dataset.icon ||= u.getAttribute('href').slice(1))]);
function swapIcons(id) {
  loadIcons(id).then((drawn) => {
    if (root.dataset.theme !== id) return;
    for (const u of iconUses()) u.setAttribute('href', `#${drawn ? `${id}-${ICON_NAMES[u.dataset.icon]}` : u.dataset.icon}`);
  });
}
// Her photo follows the song too: the same picture, toned to each OS.
const photoSrc = (id) => `assets/profile/${id === 'aero' ? 'tahsin-portrait' : id}.webp`;
const loadPhoto = (id) => { const im = new Image(); im.src = photoSrc(id); return im.decode().catch(() => {}); };
const PHONE_WALLS = new Set(['sunset', 'metro', 'eye-vapor', 'gold-ray', 'ghost', 'clay']);
let wallPick = null, songTheme = 'aero', wallShown = null, lookShown = null, lookBusy = false, wallTop = $('wall-a'), wallBack = $('wall-b');
function wallSrc(name) {
  if (innerHeight > innerWidth * 1.1 && PHONE_WALLS.has(name)) return `assets/wall/${name}-phone.webp`;
  return `assets/wall/${name}-${innerWidth * (devicePixelRatio || 1) > 1100 ? 1920 : 1000}.webp`;
}
function revealFrom(apply) {
  // The new look spreads out from the player, like the song is repainting the desktop.
  if (!document.startViewTransition || still.matches || !quake.on) return apply();
  const button = $('mp-play').offsetParent ? $('mp-play') : $('tray-play');
  const r = button.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  $('wall').classList.add('is-cut');
  const vt = document.startViewTransition(apply);
  vt.ready.then(() => root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] }, { duration: 950, easing: 'cubic-bezier(.3,.7,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
  return vt.finished.catch(() => {}).finally(() => $('wall').classList.remove('is-cut'));
}
function showLook(id, pick, next) {
  const apply = () => {
    root.dataset.theme = id;
    root.dataset.scene = id === 'aero' ? SCENES[pick || THEMES.aero.wall] : id;
    swapIcons(id);
    const photo = $('portrait').querySelector('img');
    photo.src = photoSrc(id);
    photo.alt = 'Portrait of Tahsin Anan in front of a dark floral wall, toned to match this song.';
    $('about').querySelector('.about__face').style.backgroundImage = `url(${photoSrc(id)})`;
    root.toggleAttribute('data-pick', !!pick);
    $('start-label').textContent = THEMES[id].start;
    tickClock();
    setFx(THEMES[id]);
    next.classList.add('is-on');
    wallTop.classList.remove('is-on');
    [wallTop, wallBack] = [next, wallTop];
    $('mp-showing').textContent = `${THEMES[id].name}. ${pick ? 'Your pick' : THEMES[id].art}.`;
    fit(wins.get('player').el);   // a taller OS must not push it under the taskbar
  };
  if (id === lookShown || lookShown === null) return apply();
  osChime(id);
  if (!still.matches && quake.on) { const v = $('sting'); v.hidden = false; v.src = `assets/sting/${id}.mp4`; v.onended = v.onerror = () => { v.hidden = true; }; v.play().catch(() => { v.hidden = true; }); }
  return revealFrom(apply);
}
// The one place that changes the look: it keeps going until the screen shows what's wanted now, so rapid changes collapse into the newest.
async function syncLook() {
  if (lookBusy) return;
  lookBusy = true;
  try {
    for (;;) {
      const id = songTheme, pick = wallPick, src = wallSrc(pick || THEMES[id].wall);
      document.querySelector(`input[name=wall][value="${pick || `look:${id}`}"]`).checked = true;   // here, so a rapid change that collapses back to what's already up still resets it
      if (src === wallShown && id === lookShown) break;
      const next = wallBack;
      next.src = src;
      await Promise.race([next.decode().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);   // it still shows once loaded
      if (id !== lookShown) await Promise.race([Promise.all([document.fonts?.load(`700 20px "${THEMES[id].font}"`), loadIcons(id), loadPhoto(id)]), new Promise((r) => setTimeout(r, 500))]).catch(() => {});
      if (id !== songTheme || pick !== wallPick) continue;
      await showLook(id, pick, next);
      wallShown = src; lookShown = id;
    }
  } finally { lookBusy = false; }
}
addEventListener('tahsin:song', (e) => {
  wallPick = null;
  if (e.detail.theme !== 'aero') calmHook();
  if (songTheme !== e.detail.theme) track('look_change', { look: e.detail.theme, song: e.detail.title });
  songTheme = e.detail.theme;
  syncLook();
});
all('input[name=wall]').forEach((r) => r.addEventListener('change', () => {
  track('wallpaper_set', { wallpaper: r.value });
  const os = r.value.startsWith('look:') ? r.value.slice(5) : null;
  wallPick = os ? null : r.value;
  if (os && os !== songTheme) playSong(SONGS.findIndex((song) => song.theme === os));   // picking an OS plays its song, so the two never disagree
  else syncLook();
}));

/* ---------- Quake switch ---------- */
quake.on = store.get('tahsin.quake') !== '0';
$('mp-quake').checked = quake.on;
$('mp-quake').addEventListener('change', (e) => { quake.on = e.target.checked; store.set('tahsin.quake', quake.on ? '1' : '0'); track('screen_effects', { on: quake.on }); });

/* ---------- The eye that watches the pointer ---------- */
const irises = all('.eye__iris');
let eyeQueued = false, pointer = [0, 0];
addEventListener('pointermove', (e) => {
  pointer = [e.clientX, e.clientY];
  if (eyeQueued) return;
  eyeQueued = true;
  requestAnimationFrame(() => {
    eyeQueued = false;
    irises.forEach((iris) => {
      const r = iris.ownerSVGElement.getBoundingClientRect();
      if (!r.width) return;
      const dx = pointer[0] - (r.left + r.width / 2), dy = pointer[1] - (r.top + r.height / 2), a = Math.atan2(dy, dx), reach = Math.min(1, Math.hypot(dx, dy) / 240);
      iris.setAttribute('transform', `translate(${(Math.cos(a) * 9 * reach).toFixed(1)} ${(Math.sin(a) * 6 * reach).toFixed(1)})`);
    });
  });
}, { passive: true });

/* ---------- Small things ---------- */
$('copy-mail').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } catch { b.textContent = 'Select it'; }
  convert('contact');
  track('contact_click', { via: 'copy email' });
  setTimeout(() => { b.textContent = 'Copy'; }, 1800);
});
$('bin-restore').addEventListener('click', () => { $('bin-msg').textContent = "Can't restore it. It's still overrated."; track('bin_restore'); });
$('shutdown').addEventListener('close', () => { if ($('off').hidden) startBtn.focus(); });

/* ---------- One balloon, later on: it invites them into OBSERVE.EXE ---------- */
const balloon = $('balloon');
let balloonTimer = 0, touring = false, bubbles = null, tourMod = null;
const hideBalloon = () => { const had = balloon.contains(document.activeElement); balloon.hidden = true; if (had) startBtn.focus(); };
balloon.addEventListener('focusin', () => clearTimeout(balloonTimer));
$('balloon-x').addEventListener('click', hideBalloon);
$('balloon-go').addEventListener('click', () => { balloon.hidden = true; open('observe'); });
function inviteObserve() {
  if (session.counted.balloon || wins.get('observe').open || touring || hooked()) return;
  if (sheets.length || $('player').classList.contains('is-beat')) { setTimeout(inviteObserve, 15000); return; }   // a sheet fills a phone's screen, and a game wants its corner, so it waits
  session.counted.balloon = 1;
  const n = session.events.length;
  $('balloon-text').textContent = `I've logged ${n} ${n === 1 ? 'thing' : 'things'} you did here. The log stays in your browser. Want to see what I noticed?`;
  balloon.hidden = false;
  balloonTimer = setTimeout(hideBalloon, 18000);
  track('balloon_shown');
}

/* ---------- PLAY_ME.EXE: the 30-second tour. Until someone plays it, the tape bounces and glows, the bubbles fall into it, and a note points at it. ---------- */
const hooked = () => root.classList.contains('hook');
function calmHook() {   // they went their own way, so stop asking until the next visit
  if (!hooked()) return;
  root.classList.remove('hook');
  bubbles.release();
  setTimeout(inviteObserve, 15000);
}
function startHook() {
  if (!hooked() || touring) return;
  bubbles.gather(document.querySelector('.ico[data-rundown]'));
  setTimeout(() => $('pss').classList.add('is-on'), still.matches ? 0 : 900);
  setTimeout(calmHook, 60000);
}
// Replay the intro: the site forgets this browser has seen the tour, and greets it the way it greets a first visit.
$('replay-intro').addEventListener('click', () => {
  closeStart();
  store.del('tahsin.played');
  root.classList.add('hook');
  startHook();
  track('replay_intro');
});
function startRundown(from) {
  if (touring && !desktop()) tourMod.stop('link');   // a phone's end card shows the home screen, so a tap on the tape replays it
  balloon.hidden = true;
  closeStart();
  const burst = hooked();
  store.set('tahsin.played', '1');
  if (burst) { root.classList.remove('hook'); bubbles.release(true); }
  const font = desktop() ? null : Promise.race([document.fonts?.load('20px VT323'), new Promise((r) => setTimeout(r, 500))]).catch(() => {});   // a phone's dock measures its text, so the tape's font comes first
  setTimeout(() => Promise.all([import('./tour.js'), font]).then(([m]) => (tourMod = m).start({
    wins, open, focus, desktop, refresh: refreshTasks, focused: () => focused,
    leftEdge: () => $('icons').getBoundingClientRect().right + 10,
  }, from)), burst && !still.matches ? 420 : 0);   // let them see the bubbles pop first
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-rundown]'); if (b) startRundown(b); });
addEventListener('tahsin:rundown', (e) => {
  touring = e.detail.active;
  if (touring && !desktop()) sheets.push('tour');   // the back gesture stops the tape
  else if (sheets.includes('tour')) sheets.splice(sheets.indexOf('tour'), 1);
  syncHistory();
  if (!touring) setTimeout(inviteObserve, 20000);
});

/* ---------- Reading the case study counts only when someone actually engages with it ---------- */
function caseRead() { if (!session.counted.case) { countOnce('case'); track('case_read'); } }
const caseWin = $('case');
caseWin.querySelector('.win__body').addEventListener('scroll', caseRead, { passive: true, once: true });
caseWin.querySelector('.win__body').addEventListener('pointerdown', caseRead, { once: true });

/* ---------- The hidden one. Stare back at the eye and hold still, or type its name. ---------- */
function unlockPanopticon() {
  if (wins.get('panopticon').open) return;
  tourMod?.stop('link');
  track('panopticon_found');
  closeStart();
  open('panopticon', { user: true });
}
{
  const orb = document.querySelector('.start .orb');
  let stare = 0, sx = 0, sy = 0;
  const touch = (e) => e.pointerType === 'touch';
  const begin = (e) => { clearTimeout(stare); stared = false; sx = e.clientX; sy = e.clientY; stare = setTimeout(() => { stared = touch(e); unlockPanopticon(); }, touch(e) ? 3000 : 6000); };
  orb.addEventListener('pointerenter', begin);
  orb.addEventListener('pointerdown', begin);
  orb.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > (touch(e) ? 14 : 3)) begin(e); });
  orb.addEventListener('pointerleave', () => clearTimeout(stare));
  orb.addEventListener('pointerup', (e) => { if (touch(e)) clearTimeout(stare); });
  orb.addEventListener('contextmenu', (e) => e.preventDefault());   // a long press is the whole point here
  let typed = '';
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea') || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-10);
    if (typed === 'panopticon') unlockPanopticon();
  });
  setTimeout(() => track('note', { to_self: 'stare_back_at_the_eye' }), 75000);   // the only clue, left in the event log
}

/* ---------- Crossing the phone line: only .phone changes, and what's open comes along ---------- */
function applyMode() {
  const phone = isPhone(), stacked = [...wins.keys()].filter((id) => wins.get(id).open && !wins.get(id).min && !START_OPEN.includes(id)).sort((a, b) => wins.get(a).el.style.zIndex - wins.get(b).el.style.zIndex);
  root.classList.toggle('phone', phone);
  wins.forEach((w, id) => {
    if (START_OPEN.includes(id)) { w.open = true; w.min = false; }
    else if (w.min) w.open = w.min = false;   // no task buttons to bring it back with
    w.el.classList.remove('is-max', 'is-sheet');
    w.el.querySelector('[data-act=max]')?.setAttribute('aria-label', `Maximize ${w.el.dataset.file}`);
    w.el.classList.toggle('is-sheet', phone && w.open && !START_OPEN.includes(id));
    w.el.hidden = !w.open;
    if (phone) { w.el.style.left = w.el.style.top = ''; w.placed = false; }
  });
  sheets.length = 0;
  if (phone) sheets.push(...stacked);
  syncHistory();
  if (!phone) {
    placeStart();
    wins.forEach((w) => { if (w.open && !w.placed) { place(w.el); w.placed = true; } });
  }
  focusTop();
}
let wasPhone = isPhone();
addEventListener('resize', () => {
  const phone = isPhone();
  syncLook();
  if (phone !== wasPhone) {
    tourMod?.stop('link');
    wasPhone = phone;
    applyMode();
    return;
  }
  if (!phone) wins.forEach((w) => { if (w.open && !w.min) fit(w.el); });
});

function showDesktop(pop) {
  root.classList.add('up');
  wins.forEach((w) => { w.el.hidden = true; });
  if (desktop()) placeStart();
  START_OPEN.forEach((id, i) => open(id, { user: false, quiet: true, delay: pop ? 180 + i * 90 : 0 }));
  focus('player');
  tryAutoplay();
  const target = location.hash.slice(1);
  if (wins.has(target) && target !== 'viewer') open(target, { user: false });   // a link to the viewer has no piece to show
  // A shared link opens its window once. Reloading goes back to the clean desktop, like restarting an OS.
  if (target) history.replaceState(history.state, '', location.pathname + location.search);
}

/* ---------- Boot and shutdown: the eye opens and closes ---------- */
const lids = () => [$('boot-lids'), $('boot-rim')];
function setLids(h) {
  const open = `M-5 50Q50 ${50 - h} 105 50Q50 ${50 + h} -5 50Z`;
  const [a, b] = lids();
  a.setAttribute('d', `M-5-5H105V105H-5Z${open}`);
  b.setAttribute('d', open);
}
function runLids(from, to, ms) {
  return new Promise((done) => {
    if (still.matches) { setLids(to); return done(); }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 4);
      setLids(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
}
function boot() {
  if (!root.classList.contains('booting')) { showDesktop(false); return; }
  const el = $('boot');
  setLids(0);
  let finished = false;
  const finish = async (withSound) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    store.set('tahsin.booted', '1');
    if (withSound) startSoundNow();
    el.classList.add('is-opening');
    showDesktop(true);
    await runLids(0, 190, 1100);
    root.classList.remove('booting');
    el.classList.remove('is-opening');
    track('boot_done', { sound: withSound });
  };
  const timer = setTimeout(() => finish(false), 2000);
  $('boot-skip').addEventListener('click', (e) => { e.stopPropagation(); declineSound(); finish(false); });
  el.addEventListener('click', () => { if (finished) startSoundNow(); else finish(true); }, { once: true });
  addEventListener('keydown', function onKey(e) {
    if (finished) return removeEventListener('keydown', onKey);
    if (e.key === 'Escape') { declineSound(); finish(false); }
    if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('#boot-skip')) { e.preventDefault(); finish(true); }
  });
}
const dlg = $('shutdown');
$('shutdown-btn').addEventListener('click', () => { closeStart(); dlg.showModal(); track('shutdown_dialog'); });
$('shutdown-no').addEventListener('click', () => dlg.close());
$('shutdown-yes').addEventListener('click', async () => {
  tourMod?.stop('link');
  dlg.close();
  track('shutdown');
  document.querySelector('audio')?.pause();
  dispatchEvent(new Event('tahsin:stop-audio'));
  const el = $('boot');
  el.classList.add('is-opening');
  root.classList.add('booting');
  setLids(190);
  await runLids(190, 0, 800);
  $('off').hidden = false;
  root.classList.remove('booting');
  ['desk', 'icons', 'taskbar', 'bubbles'].forEach((id) => { $(id).inert = true; });
  $('off-restart').focus();
});
$('off-restart').addEventListener('click', () => { store.del('tahsin.booted'); location.reload(); });

/* ---------- Go ---------- */
window.tahsinUp = true;
$('headline').textContent = HEADLINES[variant];
$('abnote').hidden = false;
document.querySelector('#story summary').tabIndex = -1;
syncLook();
initAudio();
bubbles = initBubbles();
boot();
syncHistory();   // a reload leaves no sheets open, so it drops back to the entry they came in on
// Text metrics change once the fonts arrive. Re-measure the opening layout unless someone already moved things.
document.fonts?.ready.then(() => { if (desktop() && !session.events.some((e) => e.name === 'window_drag' || e.name === 'window_resize')) { placeStart(); } });
startVisit().then((n) => {
  if (n == null) return;
  $('counter-n').textContent = String(n).padStart(6, '0');
  $('counter').hidden = false;
});
setTimeout(startHook, root.classList.contains('booting') ? 2600 : 900);
setTimeout(inviteObserve, 42000);
