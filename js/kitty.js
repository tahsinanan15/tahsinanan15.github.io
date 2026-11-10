// The desktop kitty. It lives on the taskbar's top edge and behaves like a cat: it sits, strolls, grooms, stretches, yawns,
// looks around, naps and wakes, hops onto a window now and then, plays with the bubbles (pops them, or bats one along the
// floor like a ball of yarn), stalks a cursor that skitters along the floor and pounces, and bops its head to the music for
// stretches while it plays. Rest the mouse on it and it shuts its eyes, and hearts float up; click it for help; pick it up and it hangs by the scruff; let go
// and it falls and lands. Asked to show you around, it climbs up beside the icons, points at each one, opens its window
// and says what it is. On a first visit it runs to PLAY_ME.EXE and points the way.
// It is drawn from sprite sheets rendered in Blender (_dev/kitty/blender): one set per OS coat, described by
// assets/kitty/kitty.json. Every frame is the same size of cell, and (cx, floor) in a cell is the floor under the cat,
// so any frame is placed by its feet. Every frame faces screen-right; the page mirrors it to face left. The walk and run
// cycles stay in place in the sheet; this file moves the sprite exactly one stride per cycle, so the paws don't slide.
// It is cheap to keep: nothing of it loads before the page is up, then only the sheet it needs first, the idle one when the
// page is idle, and the play one when it is first wanted. It draws only when its picture changes (8 times a second while
// it sits), on the site's one frame clock (js/clock.js), and reads no layout while it moves; holding still with nothing to
// show, it asks for no frames at all until something happens, and it holds still while the clock sleeps.
// It makes no sound. Under reduced motion it sits still, and can still be carried and asked for help.
import { track } from './analytics.js';
import { beat } from './audio.js';
import { join, wake as rouse, keep, once, awake, CALM, FULL } from './clock.js';

const root = document.documentElement, still = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const phone = () => root.classList.contains('phone');
const later = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 5000 }) : setTimeout(f, 1500));

// How far one cycle of the walk and the run carries the cat, in sheet pixels, as the picture sees it (kitty.json's stride).
const stride = (name) => M.stride[name];
const SIT = 150;   // a sitting cat's height in sheet pixels (render_sprites.py's PPU); the page draws it 100 px tall, 80 on a phone
const PAW = 1;     // which way the point's paw reaches in the sheet (1 = screen-right): the page mirrors it toward the icon
const REACH = 56;  // from the middle of its feet to the tip of that paw, outline included, in sheet pixels: how far from an icon it sits
const UP = new Set(['walk', 'run', 'jump', 'fall', 'stand_up', 'stalk', 'pounce']);   // clips that end on its feet
const CUT = new Set(['walk', 'run', 'jump', 'fall', 'held', 'pounce']);   // clips that start at once; any other change crossfades
const MOVING = new Set(['leap', 'fall', 'held', 'pounce']);   // states that move it every frame (a walk glides on its own, below)
const IDLES = ['groom', 'yawn', 'look_around'];   // what it does now and then while sitting
const FADE = 250;   // a crossfade between two clips: three frames
const HELP = [['Show me around', () => showAround()], ['Her resume', () => wins.show('resume')], ['Nap time', () => nap(performance.now())]];
// The show-around: each window, and one plain line about it. It ends at the tape.
const STOPS = [
  ['about', 'ABOUT_ME.EXE', 'Who Tahsin is: a marketing analytics graduate from Baruch who also paints.'],
  ['case', 'NCL_CASE.DOC', 'Her Norwegian Cruise Line campaign: five weeks, built on memes. Engagement rose 25%.'],
  ['observe', 'OBSERVE.EXE', 'This one reads your visit while you browse. It is how she studies an audience.'],
  ['design', 'DESIGN_WORK', 'Logos, flyers and campaign graphics she designed.'],
  ['art', 'MY_ART', 'Her paintings. The baseball one is coffee and pen.'],
  ['resume', 'RESUME.PDF', 'Her resume, with a PDF to download.'],
  ['contact', 'CONTACT.TXT', 'Her email, phone and LinkedIn. She is in New York and open to moving.'],
  [null, 'PLAY_ME.EXE', 'Or let the tape walk you through it in 30 seconds.'],
];

// The sheets. Both the desktop kitty and the one in the tour's dock draw from these. kitty.json is fetched on first need,
// and each sheet of the current coat is loaded on first need and decoded, off the main thread, into a bitmap that stays
// decoded, so drawing it never decodes it again (an <img> would be decoded again on the main thread, about 250 ms on a slow phone).
// move (walking, running, jumping, sitting down and up, and the sit) comes first; idle (its pastimes and its nap) when the
// page is idle; play (being carried, the hunt, pointing, being stroked, the nod) only when one of those is first wanted.
let M = null, metaP = null;
const meta = () => (metaP ||= fetch('assets/kitty/kitty.json').then((r) => r.json()).then((m) => (M = m)));
const sheets = {};
const coatId = () => (M.coats.includes(root.dataset.theme) ? root.dataset.theme : M.coats[0]);
function sheet(name, coat = coatId()) {
  const k = `${coat}-${name}`;
  if (!sheets[k]) {
    const s = sheets[k] = { img: null, ok: false }, url = `assets/kitty/${M.file.replace('{coat}', coat).replace('{sheet}', name)}`;
    const img = window.createImageBitmap ? fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => createImageBitmap(b))
      : new Promise((res, rej) => { const im = new Image(); im.src = url; im.decode().then(() => res(im), rej); });
    s.ready = img.then((b) => { s.img = b; s.ok = true; wake(); rouse(); }, () => { setTimeout(() => { if (sheets[k] === s) delete sheets[k]; }, 15000); });   // a failed fetch is tried again later
  }
  return sheets[k];
}
const has = (name, coat = coatId()) => !!sheets[`${coat}-${M.actions[name].sheet}`]?.ok;   // in, without asking for it
const want = (name) => sheet(M.actions[name].sheet).ok;   // in; if not, it is asked for now
// Draws frame i of an action into g as one cell at (0, 0), in sheet pixels, mirrored when face < 0. False until its sheet is in.
function blit(g, name, i, face = 1, alpha = 1, coat = coatId()) {
  const a = M.actions[name], s = sheet(a.sheet, coat), n = a.first + i, [cw, ch] = M.cell;
  if (!s.ok) return false;
  g.save();
  g.globalAlpha = alpha;
  if (face < 0) { g.translate(cw, 0); g.scale(-1, 1); }
  g.drawImage(s.img, (n % M.cols) * cw, Math.floor(n / M.cols) * ch, cw, ch, 0, 0, cw, ch);
  g.restore();
  return true;
}

let el, canvas, g, bubble, bubbles, wins, W = innerWidth, H = innerHeight;
let x = 0, y = 0, vx = 0, vy = 0, face = 1, state = 'sit', act = null, until = 0, idleAt = 0, strolls = 0;
let clip = { name: 'sit', at: 0, rate: 1, then: null }, leap = null, walk = null, pounce = null, fade = null, chained = false;
let swing = 0, swingV = 0, grab = null, pointer = null, trail = [], petting = false, hovering = false, swatAt = -1e9, swatHit = true;
let guide = null, showing = null, visible = false, dust = [], rate = 0, again = false, timer = 0, off = false, leaving = null;
let drops = [], toy = null, playAt = 0, toyCool = 0, toyLook = 0, perch = null, bopUntil = 0, bopNext = 0, kickPrev = 0, kickGap = 500;
let arcade = false, floorY = null, barY = innerHeight, deck = null, drawn = '', shown = null, placed = '', said = null, ink = '#fff', heart = '', type = 'sans-serif', coat = '', inked = '';

const scale = () => (phone() ? 80 : 100) / SIT;   // sheet pixels to CSS pixels
const tall = () => SIT * scale();
const game = () => arcade || $('player').classList.contains('is-beat');   // the play-along or its full-screen arcade
// Clip rates for the gaits: 15 and 30 frames a second, so the legs step evenly on the clock's 30 and 60 frame ticks.
const GAIT = { walk: 1.25, run: 2.5 };
// The taskbar's top edge. On a phone's home screen that would put it over the player's buttons, so it sits on the player,
// and steps down to the taskbar when a sheet covers the screen (or is about to, on the show-around). Where the player doesn't
// span the screen (a landscape phone: icons left, widgets right), it keeps to the player's width (deck), never out over the icons.
// Measured once, and again only when the layout changes (relayout), never while it moves.
function floor() {
  if (floorY != null) return floorY;
  const bar = $('taskbar').getBoundingClientRect(), player = $('player');
  barY = bar.height && bar.top > H / 2 ? bar.top : H;
  deck = null;
  if (phone() && !root.classList.contains('has-sheet') && !showing?.id && !player.hidden && !player.classList.contains('is-sheet')) {
    const r = player.getBoundingClientRect();
    if (r.width < W - 2 * tall()) deck = [r.left, r.right];
    if (r.height) return (floorY = r.top + 5);
  }
  return (floorY = bar.height && bar.top > H / 2 ? bar.top + 4 : H - 6);
}
function relayout() { floorY = null; if (guide) guide.p = null; wake(); }
// On a phone a window is a sheet over everything, so the kitty steps aside, except while it is showing them around.
const hidden = () => root.classList.contains('is-rundown') || (root.classList.contains('has-sheet') && !showing) || root.classList.contains('booting') || arcade;

// It runs on the frame clock (js/clock.js): every frame while it flies or is carried, at the clock's calm 30 a second while
// its picture changes, and not at all while nothing changes, so a cat holding still costs nothing and the clock can sleep.
// Anything that changes what it does calls wake().
function wake() {
  if (!el || off) return;
  clearTimeout(timer);
  again = true;
  if (!rate) rate = CALM;
  rouse();
}
function nextIn(ms) { clearTimeout(timer); timer = setTimeout(wake, ms); }   // only for a nap's end under reduced motion, when nothing is drawn till then

// One bubble at a time: when it speaks, the OBSERVE balloon (main.js) goes.
function say(html, ms = 0) {
  if (html) wins.hush?.();
  bubble.innerHTML = html;
  bubble.hidden = !html;
  clearTimeout(say.timer);
  measure();
  if (html && ms) say.timer = setTimeout(() => say(''), ms);
}
// The bubble's size, and what it should keep clear of, are measured once when it changes, not as the kitty moves.
function measure() {
  said = null;
  if (!bubble.hidden) {
    const avoid = [], keep = [];
    const win = showing?.id && $(showing.id), band = phone() && !!showing?.id;
    if (win && !win.hidden) {   // the window it just opened, and above all its title and heading; one of theirs it may cover a little more
      const l = win.offsetLeft, t = win.offsetTop, head = [l, t, l + win.offsetWidth, t + 170];
      avoid.push([[l, t, l + win.offsetWidth, t + win.offsetHeight], showing.opened ? 8 : 3], [head, 12]); keep.push(head);   // what it says matters more than the other icons
    }
    for (const ico of document.querySelectorAll('.icons .ico')) {   // the icons in sight, and above all the one it points at
      const r = ico.getBoundingClientRect(), it = ico === guide?.el;
      if (r.width) { avoid.push([[r.left, r.top, r.right, r.bottom], it ? 10 : 6]); if (it) keep.push([r.left, r.top, r.right, r.bottom]); }
    }
    const player = $('player');   // a phone's player widget, its buttons above all
    if (phone() && !player.hidden && !player.classList.contains('is-sheet')) { const r = player.getBoundingClientRect(); if (r.width) avoid.push([[r.left, r.top, r.right, r.bottom], 8]); }
    // Perched by the icons on a desktop, it speaks in the lane between them and the window it opened (main.js keeps one clear).
    // On a phone showing a sheet, it sits on the taskbar and speaks beside itself, in a band the sheet leaves free above the taskbar.
    const left = $('icons').getBoundingClientRect().right, lane = win && !win.hidden && !phone() && win.offsetLeft - left - 10;
    bubble.style.maxWidth = band ? `${Math.round(W - tall() * 1.05 - 14)}px` : lane >= 120 ? `${Math.min(lane, 230)}px` : '';
    said = { w: bubble.offsetWidth, h: bubble.offsetHeight, avoid, keep, lane: lane >= 120 ? left + 4 : null, band };
    if (band) root.style.setProperty('--kitty-band', `${Math.ceil(Math.max(said.h + 10, tall() + 4))}px`);
    placeBubble();
  }
}
// Where the bubble goes: above its head, beside it or below it, whichever covers least of the window it opened and the
// icons, never over the kitty itself, kept on screen and off the taskbar. Pointing at an icon, it tries the far side from the icon first, and above and
// below it leans that way too. Where a place would cover the window's title or the icon, it also tries just past them.
function placeBubble() {
  if (!said) return;
  floor();   // measures the taskbar too, once
  const { w, h: bh, avoid, keep, lane, band } = said, h = tall(), m = 8, low = barY - bh - 4, perched = !!guide?.arrived && !phone();
  const over = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])) / 100;
  const cat = [x - h * .45, y - h, x + h * .45, y], away = face * PAW < 0 ? 1 : -1;   // away: the side its paw is not on
  const tries = [['above', x - w / 2, y - h - 14 - bh], ['right', x + h * .45, y - h * .85], ['left', x - h * .45 - w, y - h * .85], ['below', x - w / 2, y + 12]];
  if (band) tries.splice(0, 4, ['right', h * 1.05 + 6, low]);   // beside it, under the sheet: nowhere else
  if (perched) tries.unshift(...tries.splice(away > 0 ? 1 : 2, 1));
  // above and below, leaning to one side of it: pointing, away from the icon; otherwise either way (on a landscape phone's
  // player, toward the player and off the icons)
  for (const [side, , t] of tries.filter(([sd]) => sd === 'above' || sd === 'below')) {
    if (!perched || away > 0) tries.push([side, x - h * .3, t]);
    if (!perched || away < 0) tries.push([side, x + h * .3 - w, t]);
  }
  if (lane != null && perched) tries.unshift(['below', lane, y + 12], ['above', lane, y - h - 14 - bh]);   // in the lane, over or under it
  for (const [side, l, t] of [...tries]) for (const k of keep) if (over([l, t, l + w, t + bh], k)) tries.push([side, l, k[3] + 8], [side, l, k[1] - bh - 8]);
  let best = null;
  tries.forEach(([side, l0, t0], k) => {
    const l = clamp(l0, m, W - w - m), t = clamp(t0, m, low), r = [l, t, l + w, t + bh];
    let cost = Math.min(k, 6) * 4 + Math.abs(l - l0) + Math.abs(t - t0) + over(r, cat) * 20 + Math.max(0, t - y - 40, y - h - bh - 60 - t) * 3;   // the last: not far off from it
    for (const [a, weight] of avoid) cost += over(r, a) * weight;
    if (!best || cost < best.cost) best = { cost, side, l, t };
  });
  const { side, l, t } = best, across = side === 'above' || side === 'below';
  bubble.dataset.side = side;
  bubble.style.transform = `translate(${Math.round(l)}px, ${Math.round(t)}px)`;
  bubble.style.setProperty('--tail', `${Math.round(across ? clamp(x - l, 16, w - 16) : clamp(y - h * .7 - t, 14, bh - 14))}px`);
}
function menu() {
  if (!bubble.hidden && bubble.querySelector('button')) return say('');
  say(`<b>Mrrp?</b>${HELP.map(([text], i) => `<button type="button" class="gel" data-help="${i}">${text}</button>`).join('')}`);
  track('kitty', { act: 'menu' });
}

// Clips. A clip plays an action from its sheet; one that doesn't loop holds its last frame and then runs what comes next.
// Changing to another clip crossfades from the last picture, unless the clip follows on from the one before or must start at once.
function play(name, then = null, rate = 1, from = 0) {
  const now = performance.now();
  if (!chained && shown && !CUT.has(name) && !still.matches && shown[0] !== name) fade = { shown, at: now };
  clip = { name, at: now - from * 1000 / (M.actions[name].fps * rate), rate, then };
  wake();
}
function frameAt(now) {
  const a = M.actions[clip.name];
  let i = Math.floor((now - clip.at) / 1000 * a.fps * clip.rate);
  if (still.matches) i = a.loop ? 0 : a.frames;   // reduced motion: no in-between frames, every move ends at once
  if (a.loop) return i % a.frames;
  if (i >= a.frames && clip.then) { const then = clip.then; clip.then = null; chained = true; then(now); chained = false; }
  return Math.min(i, a.frames - 1);
}
// On a desktop it sits for less long between things; a phone's kitty stays calmer.
function settle(now, wait = phone() ? rand(3500, 8000) : rand(1800, 4500)) { state = 'sit'; act = null; toy = null; until = now + wait; idleAt = now + (phone() ? rand(2500, 5000) : rand(1200, 3000)); play('sit'); }
function sitDown(now, rate = 1, wait) { state = 'sitdown'; play('sit_down', () => settle(performance.now(), wait), rate); }
const rise = (next) => { act = null; if (UP.has(clip.name)) next(performance.now()); else { state = 'stand'; play('stand_up', next, 1.5); } };
function nap(now) { state = 'sleep'; act = null; until = now + 45000; say(''); play('sleep'); }
// A walk or a run along the floor. Its speed is fixed, so the browser glides it there itself (an animation of its transform,
// run off the main thread); the page only works out where it is when it needs to, from the time.
function walkTo(tx, run, then) {
  walk?.glide?.cancel();
  state = 'walk'; walk = { x: tx, run, rate: run ? GAIT.run : GAIT.walk, then, x0: x, t0: performance.now(), glide: null };
  play(run ? 'run' : 'walk', null, walk.rate);
}
const speed = (run) => { const n = run ? 'run' : 'walk', a = M.actions[n]; return stride(n) * scale() * a.fps / a.frames * GAIT[n]; };   // px a second
const pace = () => speed(walk.run);
const length = (name, rate = 1) => M.actions[name].frames / M.actions[name].fps / rate * 1000;   // a clip's ms
// The glide stops where the cat is now (worked out from the time, not from its last step), placed there before the glide
// lets go, so no frame shows it back where the walk began; the page places it from here.
function unglide() {
  if (!walk || (!walk.glide && state !== 'walk')) return;
  const dx = walk.x - walk.x0, now = performance.now();
  x = walk.x0 + Math.sign(dx) * Math.min(Math.abs(dx), pace() * (now - walk.t0) / 1000);
  if (walk.glide) { placed = `${spot(x)}|`; el.style.transform = spot(x); el.style.transformOrigin = ''; walk.glide.cancel(); walk.glide = null; }
  walk.x0 = x; walk.t0 = now;
}
// One jump along an arc: crouch, take off, rise, fall, land. The site moves the sprite; the sheet gives the body.
// arc: how high it rises over the line (a leap at a bubble goes as high as the bubble); toy: it pops the bubble at the top.
function jump(now, x1, y1, then, arc = 0, toyLeap = false) {
  const d = Math.hypot(x1 - x, y1 - y), crouch = 4 * 1000 / M.actions.jump.fps;
  state = 'leap';
  if (Math.abs(x1 - x) > 2) face = x1 < x ? -1 : 1;
  leap = { at: now + crouch, ms: Math.max(360 + d * .4, arc ? 2000 * Math.sqrt(arc / 1200) : 0), x0: x, y0: y, x1, y1, arc: arc || 24 + d * .12, then, toy: toyLeap };
  play('jump');
}
function fall(nvx, nvy) { unperch(); drops = []; state = 'fall'; vx = nvx; vy = nvy; act = null; if (Math.abs(vx) > 30) face = Math.sign(vx); play('fall'); }
function land(now, then, hard) {
  state = 'land';
  play('jump', then, 1, M.actions.jump.markers.land);
  if (!still.matches) for (let i = 0; i < 7; i++) dust.push({ x: x + rand(-.3, .3) * tall(), y, vx: rand(-60, 60), vy: rand(-60, -15), life: hard ? 1 : .6 });
  if (root.classList.contains('is-asleep')) once(() => rest());   // the clock dozed off mid-air: it finishes landing and sits, not frozen in a crouch
}
// Stops a trip under way: what it meant to do next is dropped and it sits down where it is. Up on a perch, it then hops down.
function halt(now) {
  guide = null; quit();
  if (state === 'walk' || state === 'stand') { unglide(); walk = null; sitDown(now, 1.5); }   // what came next goes with the clip
  else if (state === 'stretch') clip.then = stand;   // it stretches sitting down: it just stays sat at the end
  else if (state === 'leap') { const up = Math.abs(leap.y1 - floor()) > 2; leap.then = up ? hop : null; }   // it lands, and sits, or hops down
  if (act === 'point') { act = null; play('sit'); }
  lit(null);
  wake();
}
// Asked for something while it strolls (its menu, the show-around): it stops and sits to listen. Not on its way somewhere for a reason.
function listen() {
  if (guide || leaving != null) return;
  quit();
  if (state === 'walk' || state === 'stand') { unglide(); walk = null; sitDown(performance.now(), 1.5); }
  else if (state === 'stretch') clip.then = stand;
}
// The icon it is showing lights up as if selected, so its point can't be read as the icon beside it.
function lit(icon) { document.querySelector('.ico.is-shown')?.classList.remove('is-shown'); icon?.classList.add('is-shown'); }

// Where it sits to show an icon. On a desktop: on the open desktop just right of the icon grid, at the icon's height, facing
// it, so it covers no icon, its paw at the grid's edge (the icon itself lights up, for one in the first column). On a phone
// the icons fill the screen: on a first visit it sits on top of PLAY_ME.EXE's row, in the band the grid leaves above it,
// reaching down toward it; while the sheets open, it sits at the left of the taskbar, and the sheet leaves room above it
// for the cat and its bubble (.kitty-shows), so neither covers what the sheet says; for the tape it is back on the player.
function seat(target) {
  const h = tall(), ground = floor(), reach = REACH * scale();
  if (phone()) {
    const b = target?.isConnected && guide?.hook && target.getBoundingClientRect();
    if (showing?.id) return { x: h * .6, y: ground, face: PAW };   // a sheet: down at the left of the taskbar, its bubble beside it
    if (!b?.width) {   // on a landscape phone, along the player whatever else is still closing over it
      const px = deck ? clamp(x, deck[0] + h * .45, deck[1] - h * .45) : nearest(x) ?? clamp(x, h * .6, W - h * .6);
      return { x: px, y: ground, face: (px < W / 2 ? 1 : -1) * PAW };
    }
    return { x: clamp(b.left + b.width / 2 + reach, h * .6, W - h * .6), y: b.top + 4, face: -PAW };
  }
  const b = target?.isConnected && target.getBoundingClientRect(), grid = $('icons').getBoundingClientRect();
  if (!b || !b.width) return null;
  return { x: Math.min(grid.right + reach + 2, W - h / 2), y: clamp(b.bottom - 2, h + 10, ground), face: -PAW };   // its head stays on screen beside the top row
}
// Getting there: down to the floor if it is up somewhere else, along the floor, then up in hops of four heights at most.
// It arrives sitting, turns to the icon, and points.
function travel(now, calm) {
  const p = guide.p ||= seat(guide.el), h = tall(), ground = floor();
  if (!p) { guide = null; return; }
  if (Math.hypot(p.x - x, p.y - y) < 4) {
    if (!guide.arrived) {
      guide.arrived = true; face = p.face; act = 'point'; play('point'); lit(guide.el);
      const then = guide.then; guide.then = null; then?.(now);   // once per stop, even if it is moved and comes back
      placeBubble();
    }
    return;
  }
  if (guide.arrived) { guide.arrived = false; act = null; lit(null); }
  if (calm || guide.now) { x = p.x; y = p.y; guide.now = false; return; }   // a first visit: it is already there when the page opens
  const onFloor = Math.abs(y - ground) < 3, far = Math.abs(p.x - x) > h * 2, stand = () => { state = 'sit'; };   // still on its feet: the next moment decides
  const sit = () => { state = 'sitdown'; play('sit_down', () => { state = 'sit'; }, 2); };
  const below = y > p.y + 3;   // on the taskbar under where it is going (a landscape phone's player): along the taskbar, then up
  if (!onFloor && far && !below) rise((n) => jump(n, x + Math.sign(p.x - x) * h * .6, ground, stand));
  else if (far) rise(() => walkTo(p.x, true, stand));
  else {
    const ty = Math.abs(p.y - y) > h * 4 ? y + Math.sign(p.y - y) * h * 4 : p.y;   // hops of four heights at most
    rise((n) => jump(n, p.x, ty, ty === p.y ? sit : stand));
  }
}

// Show me around: one stop at a time. Each waits a few seconds, or for a click on the kitty or its Next.
// It holds the frame clock awake till it ends (the clock would otherwise doze off mid-walk, 20 seconds after the last input).
function showAround() {
  endShow();
  guide = null; petting = false;
  listen(); unperch();
  if (state === 'sleep') settle(performance.now());
  sheet(M.actions.point.sheet);
  showing = { i: -1 };
  keep('kitty', true);
  if (phone()) { root.style.setProperty('--kitty-band', `${Math.ceil(tall() + 60)}px`); root.classList.add('kitty-shows'); }
  nextStop();
}
function nextStop() {
  const s = showing;
  if (!s) return;
  clearTimeout(s.timer);
  if (s.opened) { wins.close(s.opened); s.opened = null; }   // what it opened goes again, so the windows don't pile up
  if (++s.i >= STOPS.length) return endShow('done');
  const [id, file, line] = STOPS[s.i], end = !id;
  const icon = document.querySelector(id ? `.ico[data-open=${id}]` : '.ico[data-rundown]');
  s.id = id;
  say('');
  relayout();   // on a phone it steps down to the taskbar before a sheet opens, and back up onto the player for the tape
  const arrive = () => {
    if (showing !== s) return;
    if (id) { if (!wins.isOpen(id)) s.opened = id; wins.open(id); }   // one they had open, or minimised, stays theirs
    say(`<b>${file}</b><span>${line}</span>${end ? '<button type="button" class="gel gel--go" data-tape>Play the tape</button>' : '<button type="button" class="gel" data-next>Next</button>'}`);
    clearTimeout(s.timer);
    s.timer = setTimeout(nextStop, Math.max(5000, line.split(' ').length * 330));
  };
  guide = { el: icon, then: arrive };
  wake();
}
// Stopped by a click in the window it opened, it leaves that window to them, and from then on it counts as their own open;
// stopped any other way, it closes it, as it would have.
function endShow(why, target) {
  if (!showing) return;
  const { opened } = showing;
  clearTimeout(showing.timer);
  showing = null;
  keep('kitty', false);
  root.classList.remove('kitty-shows');
  if (opened && target?.closest?.(`#${opened}`)) track('window_open', { window: opened });
  else if (opened) wins.close(opened);
  if (guide) halt(performance.now());
  say('');
  relayout();
  if (why) track('kitty', { act: `show_${why}` });
}

function step(now, ms) {
  again = false;
  if (off) { rate = 0; return; }
  const dt = Math.min(.05, ms / 1000), calm = still.matches;
  if (showing && root.classList.contains('is-rundown')) endShow('stop');
  if (toy && (game() || root.classList.contains('is-rundown'))) quit();   // the game or the tape started: the bout ends at once
  const show = !hidden() && !document.hidden;
  if (show !== visible) {
    visible = show; el.hidden = !show; floorY = null;
    if (!show) { say(''); unperch(); }
    else if (!['held', 'fall', 'leap'].includes(state) && !guide?.arrived) y = floor();   // it comes back on its floor, never in mid-air
  }
  if (!show) { rate = 0; return; }   // out of sight: what brings it back (the page's classes, the arcade, the tab) wakes it
  const ground = floor(), h = tall(), edge = (v) => clamp(v, h / 2, W - h / 2), x0 = x, y0 = y;
  if (perch?.check && !['held', 'fall', 'leap'].includes(state)) {   // a window changed: is its perch still there, and still on top?
    perch.check = false;
    if (!perchOk()) { unglide(); walk = null; quit(); act = null; petting = false; hop(); }
  }

  if (state === 'held') {   // hanging from the cursor by the head, swinging with it
    if (clip.name !== 'held' && has('held')) play('held');   // its play sheet came in while it was carried
    const px = x;
    x = grab.x; y = grab.y + (M.floor - M.scruff[1]) * scale();
    swingV += -(x - px) * .012 - swing * 60 * dt - swingV * 5 * dt; swing = clamp(swing + swingV * dt * 6, -.6, .6);
    vx = (x - px) / Math.max(dt, .001);
  } else if (state === 'fall') {
    if (calm) { y = ground; x = edge(x); settle(now); }
    else {
      const py = y;
      vy += 2400 * dt; x += vx * dt; y += vy * dt; vx *= 1 - dt;
      if (x !== edge(x)) { x = edge(x); vx *= -.5; face = -face; }
      const on = vy > 0 && drops.find((d) => py <= d.l.r.top && y >= d.l.r.top && x > d.l.r.left + h * .2 && x < d.l.r.right - h * .2 && onTop(d.win, clamp(x, d.l.lo, d.l.hi), d.l.r.top + 3));
      if (on) {   // it lands on that window's top edge, which is its floor till it hops down
        drops = []; y = on.l.r.top; x = clamp(x, on.l.lo, on.l.hi); perchOn(on.win, on.l, rand(60000, 120000));
        land(now, (n) => sitDown(n, 1, 700), vy > 900);
      } else if (y >= ground) { y = ground; land(now, (n) => sitDown(n, 1, 700), vy > 900); }   // soon after, it sees whether it landed somewhere to stay
    }
  } else if (state === 'leap') {
    const p = calm ? 1 : (now - leap.at) / leap.ms;
    if (p >= 1) { x = leap.x1; y = leap.y1; land(now, leap.then || sitDown, false); }
    else if (p > 0) { const e = p * p * (3 - 2 * p) * .4 + p * .6; x = leap.x0 + (leap.x1 - leap.x0) * e; y = leap.y0 + (leap.y1 - leap.y0) * e - Math.sin(p * Math.PI) * leap.arc; }
    if (leap?.toy && !leap.hit && p > .3 && p < .75 && paw(.2, .85, .35)) leap.hit = true;   // at the top, up under the bubble
  } else if (state === 'walk') {   // a stride per cycle, so the paws stay planted
    const dx = walk.x - walk.x0, gone = pace() * (now - walk.t0) / 1000;
    if (dx) face = Math.sign(dx);
    if (calm || gone >= Math.abs(dx)) { unglide(); x = walk.x; const w = walk; walk = null; w.then ? w.then(now) : guide ? (state = 'sit') : sitDown(now); }
    else {
      x = walk.x0 + face * gone;
      if (!walk.glide && visible) { const ms = (Math.abs(walk.x - x) / pace()) * 1000; walk.glide = el.animate([{ transform: spot(x) }, { transform: spot(walk.x) }], { duration: ms, easing: 'linear', fill: 'forwards' }); }
    }
  } else if (state === 'stalk') {   // crouched, wiggling, then it goes
    if (pointer && Math.abs(pointer[0] - x) > h * .25) face = pointer[0] < x ? -1 : 1;   // it turns only for a cursor clearly to one side, so it doesn't flicker
    if (now > until) {
      const tx = edge(pointer ? pointer[0] : x + face * 120);
      state = 'pounce'; pounce = { x0: x, x1: clamp(tx, x - h * 3.5, x + h * 3.5) };
      play('pounce', (n) => { track('kitty', { act: 'pounce' }); sitDown(n); });
    }
  } else if (state === 'pounce') {   // the sheet arcs the body up and down; the site carries it across, in the air only
    const f = (now - clip.at) / 1000 * M.actions.pounce.fps, k = calm ? 1 : clamp((f - 3) / 5.5, 0, 1);
    x = pounce.x0 + (pounce.x1 - pounce.x0) * k * k * (3 - 2 * k);
    if (pounce.toy && !pounce.hit && f >= 5 && f <= 9 && paw(.5, .35, .3)) pounce.hit = true;   // its front paws come down on it
  } else if (state === 'toy') toyStep(now, h);
  else if (state === 'sleep') {
    if (now > until) { state = 'wake'; play('wake', settle); }
  } else if (state === 'sit') {
    if (leaving != null) { if (y < ground - 2) hop(); else rise((n) => (leaving != null ? walkTo(leaving, true, gone) : settle(n))); }   // turned off: out by the nearest edge
    else if (guide) travel(now, calm);
    else if (y > ground + 2) {   // its floor moved up (a phone's sheet closed): it hops up, on a landscape phone onto the player, along the taskbar first
      const to = deck ? clamp(x, deck[0] + h * .45, deck[1] - h * .45) : x;
      rise((n) => (Math.abs(to - x) > h ? walkTo(to, true, stand) : jump(n, to, ground, stand)));
    }
    else if (y < ground - 2 && (!perch || now > perch.until)) hop();   // up on a perch with nothing to show, or done sitting up on a window: a hop down
    else if (hovering && !act && !petting && has('happy')) pet();   // the mouse came to rest on it before its play sheet was in
    else if (!calm && !petting && bubble.hidden) idle(now, h);
    else if (calm && !petting && !act && bubble.hidden && now - swatAt > 3000 && has('swat')) {   // reduced motion: a blown bubble in reach gets one swat, from sitting
      const t = bubbles?.pick?.((b) => b.blown && Math.hypot(b.x - x, b.y - (y - h * .4)) < b.r + h * .9, x, y - h * .4);
      if (t) { swatAt = now; face = t.x < x ? -1 : 1; act = 'swat'; play('swat', () => { bubbles.burst(t.id); act = null; play('sit'); }); }
    }
  }
  const name = clip.name, i = frameAt(now);
  if (act === 'swat' && !swatHit && i >= 4) { swatHit = true; bubbles?.swat(x + face * h * .25, y - h * .9, h * .5); }   // its own doing, so not tracked
  // what shows: the clip, except for the flight of a jump (by how far along the arc it is) and a nod on the beat
  let pic = [name, i];
  if (state === 'leap' && now > leap.at) { const m = M.actions.jump.markers, p = (now - leap.at) / leap.ms; pic = ['jump', p < .12 ? m.takeoff : p < .5 ? m.air_up : m.air_down]; }
  if (state === 'toy' && toy?.phase === 'swat' && name === 'swat' && !toy.hit && i >= 3) toyHit(h);   // the paw is out
  // The head bop: while music plays it nods on the beat (frame 0 on the kick) in stretches of a few bars, about two fifths of the
  // time, and does other things between. Between the kicks the site hears, it keeps the tempo it last heard.
  if (beat.kickAt !== kickPrev) { const gap = beat.kickAt - kickPrev; if (gap > 280 && gap < 1100) kickGap += (gap - kickGap) * .35; kickPrev = beat.kickAt; }
  const free = state === 'sit' && !act && !petting && !guide && !showing && !toy && !game() && (y > floor() - 3 || !!perch);
  if (!beat.playing || calm) bopNext = 0;
  else if (free && now > bopNext) { if (!bopNext) bopNext = now + rand(800, 2500); else { bopUntil = now + rand(6000, 11000); bopNext = bopUntil + rand(9000, 15000); } }
  const nodding = free && beat.playing && !calm && now < bopUntil && want('nod');
  if (nodding) { const since = now - beat.kickAt; pic = ['nod', clamp(Math.floor((since < kickGap * 8 ? since % kickGap : since) / 1000 * M.actions.nod.fps), 0, 4)]; }
  const ds = petting ? 'happy' : nodding ? 'nod' : act || state;   // what it is doing, for the stylesheet and for tests
  if (el.dataset.state !== ds) el.dataset.state = ds;
  draw(now, dt, ...pic);
  if (x !== x0 || y !== y0) placeBubble();

  // when to look again
  const a = M.actions[clip.name], per = 1000 / (a.fps * clip.rate), done = !a.loop && (now - clip.at) / per >= a.frames - 1 && !clip.then;
  if (MOVING.has(state) || dust.length || (state === 'walk' && !phone())) rate = FULL;   // on a desktop its legs get every frame while it walks
  else if (again || (!calm && (!done || fade)) || clip.then || (guide && !guide.arrived) || (toy && !calm) || (calm && bubbles?.blown?.())) rate = CALM;   // a new picture to come, or a move under way
  else { rate = 0; if (calm && state === 'sleep') nextIn(until - now + 10); }   // nothing will change until something happens, and whatever happens wakes it
}
function stand() { state = 'sit'; }
// The open floor: the stretches between the windows (the player among them) that come down to its floor, so a walk never
// crosses their buttons, and on a landscape phone only the player's width. room(px) is the stretch around px, null when it
// sits under a window; nearest(px) the closest point of open floor, null when there is none. Read when it sets off, every
// few seconds at most, not as it moves.
function spans() {
  const ground = floor(), h = tall(), side = h * .45;
  let free = [deck ? [deck[0] + side, deck[1] - side] : [h * .6, W - h * .6]];
  for (const win of document.querySelectorAll('.win:not([hidden])')) {
    const r = win.getBoundingClientRect();
    if (!r.width || r.top > ground - 8 || r.bottom < ground - h) continue;   // what it stands on, or well clear above it
    free = free.flatMap(([lo, hi]) => [[lo, Math.min(hi, r.left - side)], [Math.max(lo, r.right + side), hi]]);
  }
  return free.filter(([lo, hi]) => hi > lo);
}
const room = (px) => spans().find(([lo, hi]) => px >= lo && px <= hi) || null;
function nearest(px) {
  let best = null;
  for (const [lo, hi] of spans()) { const v = clamp(px, lo, hi); if (best == null || Math.abs(v - px) < Math.abs(best - px)) best = v; }
  return best;
}
function gone() { walk?.glide?.cancel(); quit(); unperch(); off = true; leaving = walk = null; guide = null; el.hidden = bubble.hidden = true; visible = false; rate = 0; }   // all its work stops here
// In from the left, the icons' side, to open floor; on a landscape phone in from the right, along the player, where it
// lives. Under reduced motion, or with no open floor at the edge, it is just there.
function enter(now) {
  y = floor();
  const h = tall(), right = !!deck && deck[1] > W - h, edge = right ? W + h * .6 : -h * .6;
  const span = room(nearest(edge) ?? edge), to = span ? clamp(right ? W * .75 : W * .38, ...span) : nearest(W * .38) ?? W * .38;
  const clear = span && (right ? W - span[1] : span[0]) < h * 1.5 && (!deck || right);   // open floor all the way from the edge
  face = right ? -1 : 1;
  if (still.matches || !clear) { x = to; settle(now); } else { x = edge; walkTo(to, true); }
}
// The first-visit hook: off to sit by PLAY_ME.EXE and point, or, when the page has just opened, already there.
function point(icon, now = false) {
  if (showing || off) return;
  guide = { el: icon, hook: true, now, then: () => say('<b>psst… start here</b><span>30 seconds, then go play</span>') };
  sheet(M.actions.point.sheet);
  quit(); unperch();
  if (state === 'sleep') settle(performance.now());
  if (state === 'walk' && !walk.then) { unglide(); walk.x = x; }   // still running in: it turns that way at once
  wake();
}
// A new song (and with it a new OS and coat): it looks around, then gives a little hop in place as the new coat lands.
// Asleep, it wakes and looks around. Not in the tape, the game or the first-visit hook, while carried or in mid-air.
function newSong() {
  if (!el || off || !visible || still.matches || showing || guide || game() || root.classList.contains('hook') || root.classList.contains('is-rundown')) return;
  if (['held', 'fall', 'leap', 'land', 'pounce', 'stalk'].includes(state) || leaving != null || !has('look_around')) return;
  quit(); petting = false; bopUntil = 0;
  const look = (then) => { state = 'sit'; act = 'look_around'; play('look_around', then, 1.4); };
  const hopNow = () => { act = null; if (has('jump')) jump(performance.now(), x, y, (n) => sitDown(n, 1.5)); else settle(performance.now()); };
  if (state === 'sleep' || state === 'wake') { state = 'wake'; act = null; play('wake', () => look(() => settle(performance.now()))); }
  else if (state === 'walk' || state === 'stand') { unglide(); walk = null; state = 'sitdown'; act = null; play('sit_down', () => look(hopNow), 1.5); }
  else look(hopNow);
}
function hop() { fall(x < W / 2 ? 90 : -90, -320); }   // off a perch, toward the open middle of the screen
function pet() { petting = true; play('happy'); track('kitty', { act: 'pet' }); }
// The clock fell asleep while it was on its way somewhere (idle() starts nothing it couldn't finish, so this is rare): it
// sits down where it is, in one last picture, rather than glide on with its legs still.
function rest() {
  if (!el || off || !root.classList.contains('is-asleep') || !['walk', 'stand', 'stretch', 'sitdown', 'land', 'wake', 'toy'].includes(state)) return;
  if (state === 'walk') unglide();
  if (leaving != null) return gone();   // on its way out: it is out
  walk = null; settle(performance.now()); fade = null;
  once((now) => step(now, 0));
}

// Sitting on the floor with nothing to do: prey, a bubble, an idle, a stroll, a nap. Nothing starts that the frame clock
// would put to sleep halfway (it dozes 20 seconds after the last input): a stroll is cut short to end, sat down, before then.
function idle(now, h) {
  if (act) return;
  // a cursor skittering low along the floor, not too far away, is prey
  const prey = trail.length > 4 && pointer && Math.abs(pointer[1] - y) < h * 1.6 && Math.abs(pointer[0] - x) < 520 && Math.abs(pointer[0] - x) > h * .6
    && Math.abs(trail[trail.length - 1][0] - trail[0][0]) > 180 && now - trail[0][2] < 400;
  const back = () => { act = null; play('sit'); }, left = awake() - 1500, ground = floor(), up = y < ground - 2, lively = !phone(), ledged = up && !!perch;   // left: ms it can still use
  if (prey && !up && want('stalk')) { state = 'stalk'; until = now + rand(800, 1200); trail = []; face = pointer[0] < x ? -1 : 1; play('stalk'); }
  else if (!up && now > toyLook && toyCheck(now, h, ground, left)) return;   // a bubble to play with
  else if (beat.playing && now < bopUntil) return;   // bopping to the music: it stays sat and nods
  else if (!up && now - swatAt > 5000 && has('swat') && left > length('swat') && bubbles?.swat(x + face * h * .25, y - h * .9, h * .5, true)) { swatAt = now; act = 'swat'; swatHit = false; play('swat', back); }
  else if (now > idleAt && has('groom')) {
    const pick = IDLES[Math.floor(Math.random() * IDLES.length)];
    idleAt = now + (lively ? rand(4000, 8000) : rand(6000, 12000));
    if (left > length(pick)) { act = pick; play(act, back); }
  } else if (up && !ledged) return;   // sitting up by the icons: its pastimes only, till it hops down
  else if (now > until) {
    if (++strolls > (ledged ? 2 : lively ? 9 : 4) && has('sleep')) { strolls = 0; nap(now); return; }
    const span = ledged ? [perch.lo, perch.hi] : room(x);
    if (!span) {   // it sits under a window (it was dropped there): out to the nearest open floor, or it stays sat
      const to = nearest(x);
      if (to == null || left < 0) until = now + rand(3500, 8000);
      else if (deck) rise((n) => jump(n, to, ground, null));   // a landscape phone: a hop back onto the player
      else rise(() => walkTo(to));
      return;
    }
    // How far it can go and still sit down before the clock dozes; too little, and it waits for the next input.
    // On a desktop, now and then a hop up onto a window, or a hop along the floor, or a short run instead of a stroll.
    const roll = ledged ? 1 : Math.random();   // up on a window it only strolls along the edge
    if (lively && roll < .2 && tryPerch(now, h, ground, left)) return;
    if (lively && roll < .32 && has('jump') && left > 3000) {
      const tx = clamp(x + h * rand(1, 1.6) * (Math.random() < .5 ? -1 : 1), ...span);
      if (Math.abs(tx - x) > h * .6) { rise((n) => jump(n, tx, ground, null)); return; }
    }
    const run = lively && roll < .55, getUp = length('stand_up', 1.5) + length('sit_down'), stretch = !run && Math.random() < .3 && has('stretch') && left > length('stretch') + getUp + 3000;
    const reach = Math.min(run ? rand(220, 520) : rand(80, 360), speed(run) * (left - getUp - (stretch ? length('stretch') : 0)) / 1000);
    if (reach < 60) { until = now + rand(3500, 8000); return; }
    let dir = Math.random() < .5 ? -1 : 1;
    if ((dir > 0 ? span[1] - x : x - span[0]) < 60) dir = -dir;   // at one end of its stretch (a window's edge, say): the other way
    const tx = clamp(x + reach * dir, ...span);
    if (Math.abs(tx - x) < 40) { until = now + rand(3500, 8000); return; }
    // now and then a long stretch first: it starts and ends sitting, so it gets up after it
    if (stretch) { act = null; state = 'stretch'; play('stretch', () => (guide ? stand() : rise(() => walkTo(tx)))); }
    else rise(() => walkTo(tx, run));
  }
}

// Up on a window. On a desktop it sometimes hops onto the top edge of an open window near it (one hop, never the player,
// never past the icons), and dropped over an open window (the player too) it lands on its title bar's top edge instead of
// falling to the taskbar. Up there that edge is its floor: it sits, grooms, naps and strolls along it within the window's
// width, never over the title bar's buttons, and after a while hops down. If the window moves, closes, is minimised or
// maximised, or another window comes over its spot, it hops down at once. Never on a phone, where windows are sheets.
function iconsRight() { let r = 0; for (const ico of document.querySelectorAll('.icons .ico')) r = Math.max(r, ico.getBoundingClientRect().right); return r; }
function unperch() { perch?.obs.disconnect(); perch = null; }
// The stretch of a window's top edge it can stand on: its width less half a cat each side, short of the title bar's buttons.
function ledge(win, h, from = 0) {
  const r = win.getBoundingClientRect(), b = win.querySelector('.win__btns')?.getBoundingClientRect();
  let lo = Math.max(r.left, from) + h * .45, hi = r.right - h * .45;
  if (b?.width) { if (b.left + b.width / 2 > r.left + r.width / 2) hi = Math.min(hi, b.left - h * .3); else lo = Math.max(lo, b.right + h * .3); }
  return hi - lo >= h * .2 && r.top > h * .7 ? { r, lo, hi } : null;
}
const onTop = (win, px, py) => document.elementsFromPoint(px, py).find((e) => e.closest('.win'))?.closest('.win') === win;   // no other window over that spot
function perchOn(win, l, ms) {
  const p = { win, top: l.r.top, left: l.r.left, width: l.r.width, lo: l.lo, hi: l.hi, until: performance.now() + ms, check: false };
  p.obs = new MutationObserver(() => { p.check = true; wake(); });   // any window moving, opening, closing or coming forward
  for (const w of document.querySelectorAll('.win')) p.obs.observe(w, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  unperch(); perch = p;
  return p;
}
// Still there, and still on top where it is? Read only after a window changed.
function perchOk() {
  const { win } = perch, q = win.getBoundingClientRect();
  return !win.hidden && !win.classList.contains('is-max') && Math.abs(q.top - perch.top) < 1 && Math.abs(q.left - perch.left) < 1 && Math.abs(q.width - perch.width) < 1 && onTop(win, clamp(x, q.left + 2, q.right - 2), q.top + 3);
}
function tryPerch(now, h, ground, left) {
  if (left < 9000 || !has('jump')) return false;
  const edge = iconsRight();
  for (const win of document.querySelectorAll('.win:not([hidden])')) {
    if (win.id === 'player' || win.classList.contains('is-max')) continue;
    const l = ledge(win, h, edge);
    if (!l) continue;
    const px = clamp(x, l.lo, l.hi), r = l.r;
    if (r.top < h + 16 || r.top > ground - h * 1.2 || ground - r.top > h * 4 || Math.abs(px - x) > h * 3) continue;
    if (!onTop(win, px, r.top + 3)) continue;   // another window lies over that edge
    perchOn(win, l, rand(20000, 40000));
    rise((n) => jump(n, px, r.top, null));
    return true;
  }
  return false;
}
// Let go over the desktop: the windows it might land on, read once as it drops (their tops, under where it falls).
function ledges() {
  if (phone()) return [];
  const h = tall(), out = [];
  for (const win of document.querySelectorAll('.win:not([hidden])')) { const l = ledge(win, h); if (l && l.r.top > y - 2) out.push({ win, l }); }
  return out;
}

// Bubble play. Now and then (every 40 to 90 seconds at most on a desktop, rarer on a phone, never two bouts back to back),
// sitting on its floor, it notices a bubble low enough to reach over its own stretch of open floor (clear of the icons,
// the player and windows that come down to it). It looks at it, then pops it (a crouch and a pounce, or a leap up under
// it) or bats it along the floor like a ball of yarn (bubbles.nudge keeps it low and inside that stretch), runs after it,
// bats it two to four times, and pops it or loses interest. A bubble blown from the wand that drifts within about 400 px
// gets this at once. The pop is silent and not tracked. Under reduced motion it only swats one from sitting (step).
function toySpan() {   // its open floor, clear of the icons: read when it might play, at most every 2 seconds, never as it moves
  const now = performance.now(), c = toySpan.c;
  if (c && now - c.at < 2000 && Math.abs(c.x - x) < 4) return c.span;
  let span = room(x);
  if (span && !phone()) { span = [Math.max(span[0], iconsRight() + tall() * .5), span[1]]; if (span[1] - span[0] < tall() * 1.5) span = null; }
  toySpan.c = { at: now, x, span };
  return span;
}
function toyCheck(now, h, ground, left) {
  toyLook = now + 300;
  if (!bubbles?.pick || root.classList.contains('hook') || game() || !has('swat') || !has('look_around')) return false;
  const self = now > playAt && now > toyCool && left > 14000, ok = (b) => (b.blown ? now > toyCool - 1500 : self)
    && b.y > ground - h * 3.3 && b.y < ground - h * .15 && Math.abs(b.x - x) < (b.blown ? 400 : 480);
  const t = bubbles.pick(ok, x, ground - h);
  if (!t) return false;
  const span = toySpan();
  if (!span || t.x < span[0] || t.x > span[1]) return false;
  const yarn = !phone() && t.y > ground - h * 1.25 && Math.random() < .7;
  toy = { id: t.id, yarn, bats: 0, max: 2 + Math.floor(Math.random() * 3), finish: Math.random() < .6, span, until: now + 22000, miss: 0, phase: 'look' };
  bubbles.nudge(t.id, 0, 0, t.y, span[0], span[1], 4);   // it hangs there a moment while the cat sizes it up
  face = t.x < x ? -1 : 1; state = 'toy'; act = null;
  play('look_around', () => toyGo(performance.now()), t.blown ? 2.2 : 1.5);
  return true;
}
// Where it goes next for the bubble, from where the bubble will come to rest.
function toyGo(now) {
  if (!toy) return;
  const t = bubbles.peek(toy.id), h = tall(), ground = floor(), [lo, hi] = toy.span;
  if (!t || now > toy.until) return toyEnd(now, false);
  const to = t.x + t.kx / (bubbles.drag || 1.5);
  if (to < lo - h || to > hi + h || t.y < ground - h * 3.4) return toyEnd(now, false);   // it got away
  face = to < x ? -1 : 1;
  const low = t.y > ground - h * 1.25, s = face;
  const go = (tx, then) => {
    tx = clamp(tx, lo, hi);
    if (Math.abs(tx - x) < h * .2) return then(performance.now());
    rise(() => walkTo(tx, Math.abs(tx - x) > h * 1.2, (n) => {
      if (!toy) return sitDown(n);
      state = 'toy'; const u = bubbles.peek(toy.id); if (u && Math.abs(u.x - x) > 4) face = u.x < x ? -1 : 1;
      then(n);
    }));
  };
  if (low && toy.yarn) go(to - s * (t.r + h * .3), toyBat);
  else if (low) go(Math.abs(to - x) > h * 3 ? to - s * h * 2 : x, toyStalk);
  else go(to - s * h * .2, toyLeap);
}
function toyBat() {
  if (!toy) return;
  toy.phase = 'swat'; toy.hit = false; state = 'toy';
  const swat = () => play('swat', (n) => toyAfter(n));
  if (UP.has(clip.name)) play('sit_down', swat, 3); else swat();
}
function toyStalk(now) { if (!toy) return; toy.phase = 'stalk'; state = 'toy'; until = now + rand(450, 800); play('stalk'); }
function toyLeap(now) {
  const t = toy && bubbles.peek(toy.id), h = tall(), ground = floor();
  if (!t) return toyEnd(now, false);
  toy.phase = 'leap';
  const span = toy.span;
  rise((n) => jump(n, clamp(x + face * h * .1, ...span), ground, (m) => (toy ? toyEnd(m, toy.popped) : sitDown(m)), clamp(ground - t.y - h * .8, 8, h * 2.6), true));
}
// The paw at (dx, dy) cat heights from its feet, toward where it faces, reaching reach more: the bubble pops if it is there.
function paw(dx, dy, reach) {
  const t = toy && bubbles.peek(toy.id), h = tall();
  if (!t || Math.hypot(t.x - (x + face * h * dx), t.y - (y - h * dy)) > t.r + h * reach) return false;
  bubbles.burst(t.id); toy.popped = true;
  return true;
}
function toyHit(h) {   // a bat: along the floor, kept low, inside its stretch; or the last one pops it
  toy.hit = true;
  const t = bubbles.peek(toy.id), [lo, hi] = toy.span, ground = floor();
  if (!t || Math.hypot(t.x - (x + face * h * .3), t.y - (y - h * .35)) > t.r + h * .35) { toy.miss++; return; }
  if (++toy.bats > toy.max) { if (toy.finish) { paw(.3, .35, 9); return; } toy.done = true; }
  bubbles.nudge(t.id, face * rand(170, 250), rand(-20, 10), ground - Math.max(t.r, h * .35) - 2, lo + t.r, hi - t.r, toy.done ? 1.5 : 3.5);
}
function toyAfter(now) {
  if (!toy) return;
  if (toy.popped || toy.done || toy.miss > 1) return toyEnd(now, toy.popped);
  toy.phase = 'wait'; toy.at = now + rand(150, 400); state = 'toy';
}
function toyStep(now, h) {
  if (!toy) { settle(now); return; }
  if (toy.phase === 'stalk') {
    const t = bubbles.peek(toy.id);
    if (t && Math.abs(t.x - x) > h * .25) face = t.x < x ? -1 : 1;
    if (now < until) return;
    if (!t) { toyEnd(now, false); return; }
    const [lo, hi] = toy.span;
    state = 'pounce'; pounce = { x0: x, x1: clamp(clamp(t.x - face * h * .45, lo, hi), x - h * 3.5, x + h * 3.5), toy: true };
    play('pounce', (n) => (toy ? toyEnd(n, toy.popped) : sitDown(n)));
  } else if (toy.phase === 'wait' && now > toy.at) toyGo(now);
  else if (now > toy.until) toyEnd(now, false);
}
// The bout is over: after a pop it is pleased with itself for a moment; otherwise it sits and goes back to its own things.
function toyEnd(now, popped) {
  if (!toy) return;
  toy = null; toyCool = now + 2500; playAt = now + (phone() ? rand(90000, 180000) : rand(40000, 90000));
  const after = (n) => {
    settle(n); idleAt = n + rand(300, 1200);
    if (popped && has('happy')) { act = 'happy'; play('happy'); setTimeout(() => { if (act === 'happy') { act = null; play('sit'); wake(); } }, 1300); }
  };
  if (UP.has(clip.name)) { state = 'sitdown'; play('sit_down', () => after(performance.now()), 1.5); } else after(now);
}
function quit() {   // something else came up: the bout ends where it is
  if (!toy) return;
  toy = null; toyCool = performance.now() + 2500;
  if (state === 'toy') { state = 'sit'; play('sit'); }
}

// Where the sprite goes for the cat's feet at px on its floor line y, facing as it faces.
const spot = (px) => { const s = scale(), mid = face > 0 ? M.cx : M.cell[0] - M.cx; return `translate(${Math.round(px - mid * s)}px, ${Math.round(y - M.floor * s)}px)`; };
// Puts it where it is (a transform, written only when it changes) and draws its picture (only when that changes).
function draw(now, dt, name, i) {
  const s = scale(), d = Math.min(devicePixelRatio || 1, 2), [cw, ch] = M.cell, bw = Math.round(cw * s * d);
  if (canvas.width !== bw) { canvas.width = bw; canvas.height = Math.round(ch * s * d); canvas.style.width = `${cw * s}px`; canvas.style.height = `${ch * s}px`; drawn = ''; }
  const mid = face > 0 ? M.cx : cw - M.cx, held = state === 'held';
  let at;
  if (held) {   // the top of its head stays under the cursor, and it swings about it
    const [sx, sy] = M.scruff, px = (face > 0 ? sx : cw - sx) * s;
    at = `translate(${Math.round(grab.x - px)}px, ${Math.round(grab.y - sy * s)}px) rotate(${swing.toFixed(3)}rad)|${px}px ${sy * s}px`;
  } else at = `${spot(x)}|`;
  if (walk?.glide) placed = at;   // gliding: the animation places it
  else if (at !== placed) { placed = at; const [t, o] = at.split('|'); el.style.transform = t; el.style.transformOrigin = o; }
  if (inked !== coatId()) {   // a new OS: its colours and face read once (css/site.css, .kitty), and the sheets the last coat had loaded asked for when idle
    const was = inked, cs = getComputedStyle(el); inked = coatId(); ink = cs.color; heart = cs.getPropertyValue('--kitty-heart').trim() || ink; type = cs.fontFamily;
    if (was) later(() => M.sheets.forEach((sh) => sheets[`${was}-${sh}`] && sheet(sh)));
  }
  // Until the new coat's sheet is in, it goes on in the coat it had; with neither in, the last picture stays.
  if (!coat && !has(name) && has('sit')) { want(name); name = 'sit'; i = 0; }   // its first picture: the sit, till the clip's sheet is in
  if (!has(name)) { want(name); if (!coat || !has(name, coat)) { drawn = ''; dust = []; return; } } else coat = inked;   // nothing to draw: no dust left to hold the clock at full rate
  const k = fade && (now - fade.at) / FADE;
  if (k >= 1) fade = null;
  const fx = !still.matches && (state === 'sleep' || petting || state === 'stalk' || dust.length > 0);
  const grounded = !held && state !== 'leap' && state !== 'fall' && (Math.abs(y - floor()) < 3 || (!!perch && Math.abs(y - perch.top) < 3));   // on its floor, not perched by the icons
  const key = `${coat}|${name}|${i}|${face}|${fade ? Math.floor(k * 3) : ''}|${grounded}`;
  if (key === drawn && !fx) return;
  g.setTransform(d * s, 0, 0, d * s, 0, 0);   // from here on, sheet pixels
  g.clearRect(0, 0, cw, ch);
  blit(g, name, i, face, 1, coat);
  if (fade && has(fade.shown[0], fade.shown[3])) blit(g, fade.shown[0], fade.shown[1], fade.shown[2], 1 - k, fade.shown[3]);   // the last picture fading out over the new one
  else shown = [name, i, face, coat];
  drawn = key;
  const u = SIT / 100;   // the effects are drawn to the cat's size
  if (grounded) {   // a soft shadow on what it stands on
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(0,20,50,.22)'; g.beginPath(); g.ellipse(mid, M.floor - 1, 31 * u, 3.5 * u, 0, 0, 7); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  if (!fx) return;
  g.shadowColor = 'rgba(0,0,0,.75)'; g.shadowBlur = 3 * u;   // the z, ! and hearts in the OS's own colours and face, haloed like its icon labels
  if (state === 'sleep') {   // z z z
    g.fillStyle = ink; g.font = `700 ${15 * u}px ${type}`;
    // from its head, which lies at the far end from its tail: the cell's left as drawn facing right
    for (let k = 0; k < 2; k++) { const p = (now / 1600 + k * .5) % 1; g.globalAlpha = 1 - p; g.fillText('z', mid + (face > 0 ? -38 : 30) * u - p * 15 * u * face, M.floor - (63 + p * 30) * u); }
  }
  if (petting) {   // hearts while it's stroked, floating up beside its ears, clear of them
    g.fillStyle = heart; g.font = `${19 * u}px ${type}`; g.textAlign = 'center';
    for (let k = 0; k < 2; k++) { const p = (now / 1100 + k * .5) % 1; g.globalAlpha = 1 - p; g.fillText('♥', mid + (k ? 38 : -36) * u + (k ? 1 : -1) * p * 4 * u, M.floor - (108 + p * 22) * u); }
    g.textAlign = 'start';
  }
  if (state === 'stalk') { g.fillStyle = ink; g.globalAlpha = .9; g.font = `700 ${23 * u}px ${type}`; g.fillText('!', mid + (face * 50 - 4) * u, M.floor - 88 * u); }
  g.globalAlpha = 1; g.shadowColor = 'transparent'; g.shadowBlur = 0;
  for (const p of dust) {   // dust where it lands
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.life -= dt * 2.2;
    g.fillStyle = `rgba(255,255,255,${Math.max(0, p.life) * .6})`; g.beginPath(); g.arc(mid + (p.x - x) / s, M.floor + (p.y - y) / s, (3 + (1 - p.life) * 5) / s, 0, 7); g.fill();
  }
  dust = dust.filter((p) => p.life > 0);
}

function wire() {
  let moved = 0, start = null, quiet = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    e.preventDefault();
    want('held');   // it may be picked up
    el.setPointerCapture?.(e.pointerId);
    start = [e.clientX, e.clientY]; moved = 0;
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    moved = Math.max(moved, Math.hypot(e.clientX - start[0], e.clientY - start[1]));
    if (moved > 6 && state !== 'held') {
      endShow('stop');
      unglide(); quit(); unperch(); guide = null; clip.then = null; leap = walk = null;
      state = 'held'; act = null; swing = swingV = 0; say(''); petting = false; play(has('held') ? 'held' : 'fall');   // its play sheet not in yet: it hangs as it falls, not as a still sitting picture
      track('kitty', { act: 'pick_up' });
    }
    grab = { x: e.clientX, y: e.clientY };
    wake();
  });
  const drop = () => {
    if (!start) return;
    start = null;
    if (state === 'held') { swing = 0; quiet = performance.now() + 400; fall(clamp(vx, -900, 900), 0); drops = ledges(); }
  };
  el.addEventListener('pointerup', drop);
  el.addEventListener('pointercancel', drop);
  // A mouse resting on it strokes it: eyes shut, a little bounce, a heart or two. Its play sheet may still be on the way:
  // then the stroke starts as soon as it is in, if the mouse is still there (step).
  el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; hovering = true; if (state === 'sit' && !guide && !act && want('happy')) pet(); else wake(); });
  el.addEventListener('pointerleave', () => { hovering = false; if (petting) { petting = false; if (state === 'sit') play('sit'); } });
  el.addEventListener('click', (e) => {   // a click that wasn't a carry (a key's click, detail 0, never is)
    if (e.detail && (moved > 6 || performance.now() < quiet)) return;
    if (showing) return nextStop();
    if (state === 'sleep') { state = 'wake'; play('wake', settle); }
    want('point');   // its menu leads to the show-around
    if (petting) { petting = false; play('sit'); }
    listen();   // it stops strolling to listen
    menu();
  });
  bubble.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) return nextStop();
    if (e.target.closest('[data-tape]')) { endShow('tape'); return document.querySelector('.ico[data-rundown]').click(); }
    const b = e.target.closest('[data-help]');
    if (!b) return;
    say('');
    track('kitty', { act: HELP[b.dataset.help][0] });
    HELP[b.dataset.help][1]();
  });
  // A click anywhere else, Escape, or a phone's back gesture (main.js calls stop()) ends the show-around, even on its way to
  // the next icon: they have found something to read. Its menu closes the same way. Escape is taken here, first, so main.js
  // doesn't also close the window it opened as the visitor's own, with a sound.
  const menuUp = () => !bubble.hidden && !!bubble.querySelector('[data-help]');
  addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('.kitty, .kitty__say')) return;
    if (showing) endShow('stop', e.target); else if (menuUp()) say('');
  }, true);
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || (!showing && !menuUp())) return;
    if (showing) endShow('stop'); else say('');
    e.stopImmediatePropagation();
  }, true);
  addEventListener('pointermove', (e) => {
    pointer = [e.clientX, e.clientY];
    if (e.pointerType === 'mouse') { trail.push([e.clientX, e.clientY, performance.now()]); if (trail.length > 12) trail.shift(); }
  }, { passive: true });
  addEventListener('resize', () => {   // on its floor before (sitting, napping, walking ...), on its floor after
    const was = floor();
    unglide(); W = innerWidth; H = innerHeight; x = clamp(x, 60, W - 60); if (perch) perch.check = true; relayout();
    if (state !== 'held' && Math.abs(y - was) < 3) y = floor();
    measure();
  });
  addEventListener('scroll', () => { if (guide) relayout(); }, { capture: true, passive: true });   // a phone's icons scroll
  document.addEventListener('visibilitychange', wake);
  addEventListener('tahsin:song', newSong);
  still.addEventListener?.('change', wake);
  // What moves its floor or hides it: the page's classes (a phone, a sheet, the tape), the player, and the game's arcade.
  new MutationObserver(() => { relayout(); rest(); }).observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  new MutationObserver(() => { arcade = !!document.querySelector('.arcade'); wake(); }).observe(document.body, { childList: true });
  new MutationObserver(relayout).observe($('player'), { attributes: true, attributeFilter: ['class', 'hidden'] });
  // In the play-along game it says how to play, once, and then keeps out of the way.
  new MutationObserver(() => { if ($('player').classList.contains('is-beat') && !wire.told) { wire.told = true; say('<b>A S K L, on the line</b><span>and don\'t hit the bombs</span>', 5000); } }).observe($('player'), { attributes: true, attributeFilter: ['class'] });
}

// main.js starts it and hands over the bubbles, so it can pop one, and a way to open and close windows quietly.
// guide(icon) sends it to sit by that icon and point; calm() lets it go; stop() ends a show-around; off() and on() are the paw.
// The windows object opens and closes windows quietly (open, close, isOpen, show) and hides the OBSERVE balloon (hush).
// Nothing of it loads until the page is up; then the sheet for its first moves, its idle sheet when the page is idle, and
// its play sheet when that is first wanted.
// On a first visit (the page's .hook) it is wanted at once: it is placed by PLAY_ME.EXE straight away and says so while its
// sheets come in.
export async function initKitty(pond, windows) {
  bubbles = pond; wins = windows;
  const hook = root.classList.contains('hook');
  if (!hook && document.readyState !== 'complete') await new Promise((r) => addEventListener('load', r, { once: true }));
  await meta();
  if (!hook) await sheet(M.actions.run.sheet).ready;   // the run in, and the sit
  else sheet(M.actions.sit.sheet);
  later(() => sheet(M.actions.groom.sheet));
  el = Object.assign(document.createElement('button'), { className: 'kitty', type: 'button', hidden: true });
  el.setAttribute('aria-label', 'Kitty. Press for help. Drag to carry it.');
  canvas = el.appendChild(document.createElement('canvas'));
  g = canvas.getContext('2d');
  bubble = Object.assign(document.createElement('div'), { className: 'kitty__say', hidden: true });
  bubble.setAttribute('role', 'status');
  document.body.append(el, bubble);
  W = innerWidth; H = innerHeight; playAt = performance.now() + (phone() ? rand(90000, 180000) : rand(30000, 60000));
  if (hook) { settle(performance.now()); point(document.querySelector('.ico[data-rundown]'), true); } else enter(performance.now());
  wire();
  join({ rate: () => rate, read: () => el && !floorY && floor(), write: step });
  wake();
  return {
    guide(icon) { if (!guide?.hook) point(icon); },
    calm() {
      if (!guide?.hook) return;
      halt(performance.now()); say('');
    },
    // The paw button. Off: it walks out by the nearest edge and then does nothing at all. On again: it walks in.
    off() {
      if (off || leaving != null) return;
      endShow('stop'); guide = null; say(''); petting = false;
      if (state === 'sleep') settle(performance.now());
      if (!visible || still.matches) return gone();
      const h = tall(); leaving = x < W / 2 ? -h * .6 : W + h * .6;
      if (state === 'walk') { unglide(); walk = null; state = 'sit'; }   // turns for the edge at once
      halt(performance.now());
      wake();
    },
    stop() { endShow('stop'); },   // the phone's back gesture
    on() {
      if (!off && leaving == null) return;
      const was = off; off = false; leaving = null;
      if (was) { relayout(); enter(performance.now()); }
      else if (state === 'walk' && walk?.then === gone) { unglide(); walkTo(nearest(x) ?? clamp(x, tall(), W - tall()), true); }   // still on its way out: it turns back
      wake();
    },
  };
}

// A small kitty for PLAY_ME.EXE's narration dock (js/tour.js). It sits beside the text, facing the windows to its left,
// and cue() has it point, purr or nod. A looping cue plays for ms and then it sits again; point holds its last frame.
export function dockKitty(cvs) {
  const c = cvs.getContext('2d');
  let cue = 'sit', at = 0, stop = 0, on = false, drawn = '';
  // On the frame clock at its calm rate while the clip moves (or its sheet is still on the way). Once a held pose is up it
  // stops, until the next cue or the end of this one.
  const frame = (now) => {
    if (cvs.closest('[hidden]') || !cvs.isConnected) { on = false; return; }   // the dock is closed: rest until the next cue
    if (stop && now >= stop) { cue = 'sit'; at = now; stop = 0; }
    const a = M.actions[cue], d = Math.min(devicePixelRatio || 1, 2), w = Math.round(cvs.clientWidth * d);
    if (w && cvs.width !== w) { cvs.width = w; cvs.height = Math.round(w * M.cell[1] / M.cell[0]); cvs.style.aspectRatio = `${M.cell[0]} / ${M.cell[1]}`; }
    let i = Math.floor((now - at) / 1000 * a.fps);
    const held = still.matches || (!a.loop && i >= a.frames - 1);
    i = still.matches ? (a.loop ? 0 : a.frames - 1) : a.loop ? i % a.frames : Math.min(i, a.frames - 1);
    const key = `${coatId()}|${cue}|${i}|${cvs.width}`;
    if (key !== drawn) {
      c.setTransform(cvs.width / M.cell[0], 0, 0, cvs.width / M.cell[0], 0, 0);
      c.clearRect(0, 0, M.cell[0], M.cell[1]);
      if (!blit(c, cue, i, -1)) return;   // its sheet is on the way: try again next frame
      drawn = key;
    }
    if (held && !stop) on = false;
  };
  join({ rate: () => (on ? CALM : 0), write: frame });
  return {
    cue(name, ms = 0) {
      meta().then(() => {
        cue = name; at = performance.now(); stop = ms ? at + ms : 0;
        sheet(M.actions.sit.sheet); sheet(M.actions[name].sheet);
        on = true; rouse();
      });
    },
  };
}
