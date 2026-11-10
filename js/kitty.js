// The desktop kitty. It lives on the taskbar's top edge and behaves like a cat: it sits, strolls, grooms, stretches, yawns,
// looks around, naps and wakes, bats at a bubble, stalks a cursor that skitters along the floor and pounces, and nods along
// when music is playing. Rest the mouse on it and it purrs; click it for help; pick it up and it hangs by the scruff; let go
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
import { join, wake as rouse, CALM, FULL } from './clock.js';

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
// and each sheet of the current coat is loaded on first need and decoded off the main thread before it is drawn.
// move (walking, running, jumping, sitting down and up, and the sit) comes first; idle (its pastimes and its nap) when the
// page is idle; play (being carried, the hunt, pointing, being stroked, the nod) only when one of those is first wanted.
let M = null, metaP = null;
const meta = () => (metaP ||= fetch('assets/kitty/kitty.json').then((r) => r.json()).then((m) => (M = m)));
const sheets = {};
const coatId = () => (M.coats.includes(root.dataset.theme) ? root.dataset.theme : M.coats[0]);
function sheet(name, coat = coatId()) {
  const k = `${coat}-${name}`;
  if (!sheets[k]) {
    const img = new Image(), s = sheets[k] = { img, ok: false };
    img.src = `assets/kitty/${M.file.replace('{coat}', coat).replace('{sheet}', name)}`;
    s.ready = img.decode().then(() => { s.ok = true; wake(); rouse(); }, () => {});
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
let swing = 0, swingV = 0, grab = null, pointer = null, trail = [], petting = false, swatAt = -1e9, swatHit = true;
let guide = null, showing = null, visible = false, dust = [], rate = 0, again = false, timer = 0, off = false, leaving = null;
let arcade = false, floorY = null, barY = innerHeight, drawn = '', shown = null, placed = '', said = null, ink = '#fff', coat = '', inked = '';

const scale = () => (phone() ? 80 : 100) / SIT;   // sheet pixels to CSS pixels
const tall = () => SIT * scale();
// The taskbar's top edge. On a phone's home screen that would put it over the player's buttons, so it sits on the player,
// and steps down to the taskbar when a sheet covers the screen (or is about to, on the show-around).
// Measured once, and again only when the layout changes (relayout), never while it moves.
function floor() {
  if (floorY != null) return floorY;
  const bar = $('taskbar').getBoundingClientRect(), player = $('player');
  barY = bar.height && bar.top > H / 2 ? bar.top : H;
  if (phone() && !root.classList.contains('has-sheet') && !showing?.id && !player.hidden && !player.classList.contains('is-sheet')) {
    const r = player.getBoundingClientRect();
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

function say(html, ms = 0) {
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
    const win = showing?.id && $(showing.id);
    if (win && !win.hidden) {   // the window it just opened, and above all its title and heading
      const l = win.offsetLeft, t = win.offsetTop, head = [l, t, l + win.offsetWidth, t + 170];
      avoid.push([[l, t, l + win.offsetWidth, t + win.offsetHeight], 8], [head, 12]); keep.push(head);   // what it says matters more than the other icons
    }
    for (const ico of document.querySelectorAll('.icons .ico')) {   // the icons in sight, and above all the one it points at
      const r = ico.getBoundingClientRect(), it = ico === guide?.el;
      if (r.width) { avoid.push([[r.left, r.top, r.right, r.bottom], it ? 10 : 4]); if (it) keep.push([r.left, r.top, r.right, r.bottom]); }
    }
    // Perched by the icons on a desktop, it speaks in the lane between them and the window it opened (main.js keeps one clear).
    const left = $('icons').getBoundingClientRect().right, lane = win && !win.hidden && !phone() && win.offsetLeft - left - 10;
    bubble.style.maxWidth = lane >= 150 ? `${Math.min(lane, 230)}px` : '';
    said = { w: bubble.offsetWidth, h: bubble.offsetHeight, avoid, keep, lane: lane >= 150 ? left + 4 : null };
    placeBubble();
  }
}
// Where the bubble goes: above its head, beside it or below it, whichever covers least of the window it opened and the
// icons, never over the kitty itself, kept on screen and off the taskbar. Pointing at an icon, it tries the far side from the icon first, and above and
// below it leans that way too. Where a place would cover the window's title or the icon, it also tries just past them.
function placeBubble() {
  if (!said) return;
  floor();   // measures the taskbar too, once
  const { w, h: bh, avoid, keep, lane } = said, h = tall(), m = 8, low = barY - bh - 4, perched = !!guide?.arrived && !phone();
  const over = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])) / 100;
  const cat = [x - h * .45, y - h, x + h * .45, y], away = face * PAW < 0 ? 1 : -1;   // away: the side its paw is not on
  const tries = [['above', x - w / 2, y - h - 14 - bh], ['right', x + h * .45, y - h * .85], ['left', x - h * .45 - w, y - h * .85], ['below', x - w / 2, y + 12]];
  if (perched) {
    tries.unshift(...tries.splice(away > 0 ? 1 : 2, 1));
    for (const [side, , t] of tries.filter(([sd]) => sd === 'above' || sd === 'below')) tries.push([side, away > 0 ? x - h * .3 : x + h * .3 - w, t]);
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
function settle(now, wait = rand(3500, 8000)) { state = 'sit'; act = null; until = now + wait; idleAt = now + rand(2500, 5000); play('sit'); }
function sitDown(now, rate = 1) { state = 'sitdown'; play('sit_down', () => settle(performance.now()), rate); }
const rise = (next) => { act = null; if (UP.has(clip.name)) next(performance.now()); else { state = 'stand'; play('stand_up', next, 1.5); } };
function nap(now) { state = 'sleep'; act = null; until = now + 45000; say(''); play('sleep'); }
// A walk or a run along the floor. Its speed is fixed, so the browser glides it there itself (an animation of its transform,
// run off the main thread); the page only works out where it is when it needs to, from the time.
function walkTo(tx, run, then) {
  state = 'walk'; walk = { x: tx, run, rate: run ? 1.8 : 1, then, x0: x, t0: performance.now(), glide: null };
  play(run ? 'run' : 'walk', null, walk.rate);
}
const pace = () => { const a = M.actions[walk.run ? 'run' : 'walk']; return stride(walk.run ? 'run' : 'walk') * scale() * a.fps / a.frames * walk.rate; };   // px a second
function unglide() {   // the glide stops where the cat is; the page places it again from here
  if (!walk?.glide) return;
  walk.glide.cancel(); walk.glide = null; placed = '';
  walk.x0 = x; walk.t0 = performance.now();
}
// One jump along an arc: crouch, take off, rise, fall, land. The site moves the sprite; the sheet gives the body.
function jump(now, x1, y1, then) {
  const d = Math.hypot(x1 - x, y1 - y), crouch = 4 * 1000 / M.actions.jump.fps;
  state = 'leap';
  if (Math.abs(x1 - x) > 2) face = x1 < x ? -1 : 1;
  leap = { at: now + crouch, ms: 360 + d * .4, x0: x, y0: y, x1, y1, arc: 24 + d * .12, then };
  play('jump');
}
function fall(nvx, nvy) { state = 'fall'; vx = nvx; vy = nvy; act = null; if (Math.abs(vx) > 30) face = Math.sign(vx); play('fall'); }
function land(now, then, hard) {
  state = 'land';
  play('jump', then, 1, M.actions.jump.markers.land);
  if (!still.matches) for (let i = 0; i < 7; i++) dust.push({ x: x + rand(-.3, .3) * tall(), y, vx: rand(-60, 60), vy: rand(-60, -15), life: hard ? 1 : .6 });
}
// Stops a trip under way: what it meant to do next is dropped and it sits down where it is. Up on a perch, it then hops down.
function halt(now) {
  guide = null;
  if (state === 'walk' || state === 'stand') { unglide(); walk = null; sitDown(now, 1.5); }   // what came next goes with the clip
  else if (state === 'stretch') clip.then = stand;   // it stretches sitting down: it just stays sat at the end
  else if (state === 'leap') { const up = Math.abs(leap.y1 - floor()) > 2; leap.then = up ? hop : null; }   // it lands, and sits, or hops down
  if (act === 'point') { act = null; play('sit'); }
  lit(null);
  wake();
}
// The icon it is showing lights up as if selected, so its point can't be read as the icon beside it.
function lit(icon) { document.querySelector('.ico.is-shown')?.classList.remove('is-shown'); icon?.classList.add('is-shown'); }

// Where it sits to show an icon. On a desktop: on the open desktop just right of the icon grid, at the icon's height, facing
// it, so it covers no icon, its paw at the grid's edge (the icon itself lights up, for one in the first column). On a phone
// the icons fill the screen: on a first visit it sits on top of PLAY_ME.EXE's row, in the band the grid leaves above it,
// reaching down toward it; while the sheets open, it stays on its floor where it is, pointing toward the middle.
function perch(target) {
  const h = tall(), ground = floor(), reach = REACH * scale();
  if (phone()) {
    const b = target?.isConnected && guide?.hook && target.getBoundingClientRect();
    if (!b?.width) { const px = clamp(x, h * .6, W - h * .6); return { x: px, y: ground, face: (px < W / 2 ? 1 : -1) * PAW }; }
    return { x: clamp(b.left + b.width / 2 + reach, h * .6, W - h * .6), y: b.top + 4, face: -PAW };
  }
  const b = target?.isConnected && target.getBoundingClientRect(), grid = $('icons').getBoundingClientRect();
  if (!b || !b.width) return null;
  return { x: Math.min(grid.right + reach + 2, W - h / 2), y: clamp(b.bottom - 2, h + 10, ground), face: -PAW };   // its head stays on screen beside the top row
}
// Getting there: down to the floor if it is up somewhere else, along the floor, then up in hops of four heights at most.
// It arrives sitting, turns to the icon, and points.
function travel(now, calm) {
  const p = guide.p ||= perch(guide.el), h = tall(), ground = floor();
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
  if (!onFloor && far) rise((n) => jump(n, x + Math.sign(p.x - x) * h * .6, ground, stand));
  else if (onFloor && far) rise(() => walkTo(p.x, true, stand));
  else {
    const ty = Math.abs(p.y - y) > h * 4 ? y + Math.sign(p.y - y) * h * 4 : p.y;   // hops of four heights at most
    rise((n) => jump(n, p.x, ty, ty === p.y ? sit : stand));
  }
}

// Show me around: one stop at a time. Each waits a few seconds, or for a click on the kitty or its Next.
function showAround() {
  endShow();
  guide = null; petting = false;
  if (state === 'sleep') settle(performance.now());
  sheet(M.actions.point.sheet);
  showing = { i: -1 };
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
  const show = !hidden() && !document.hidden;
  if (show !== visible) {
    visible = show; el.hidden = !show; floorY = null;
    if (!show) say('');
    else if (!['held', 'fall', 'leap'].includes(state) && !guide?.arrived) y = floor();   // it comes back on its floor, never in mid-air
  }
  if (!show) { rate = 0; return; }   // out of sight: what brings it back (the page's classes, the arcade, the tab) wakes it
  const ground = floor(), h = tall(), edge = (v) => clamp(v, h / 2, W - h / 2), x0 = x, y0 = y;

  if (state === 'held') {   // hanging from the cursor by the head, swinging with it
    const px = x;
    x = grab.x; y = grab.y + (M.floor - M.scruff[1]) * scale();
    swingV += -(x - px) * .012 - swing * 60 * dt - swingV * 5 * dt; swing = clamp(swing + swingV * dt * 6, -.6, .6);
    vx = (x - px) / Math.max(dt, .001);
  } else if (state === 'fall') {
    if (calm) { y = ground; x = edge(x); settle(now); }
    else {
      vy += 2400 * dt; x += vx * dt; y += vy * dt; vx *= 1 - dt;
      if (x !== edge(x)) { x = edge(x); vx *= -.5; face = -face; }
      if (y >= ground) { y = ground; land(now, sitDown, vy > 900); }
    }
  } else if (state === 'leap') {
    const p = calm ? 1 : (now - leap.at) / leap.ms;
    if (p >= 1) { x = leap.x1; y = leap.y1; land(now, leap.then || sitDown, false); }
    else if (p > 0) { const e = p * p * (3 - 2 * p) * .4 + p * .6; x = leap.x0 + (leap.x1 - leap.x0) * e; y = leap.y0 + (leap.y1 - leap.y0) * e - Math.sin(p * Math.PI) * leap.arc; }
  } else if (state === 'walk') {   // a stride per cycle, so the paws stay planted
    const dx = walk.x - walk.x0, gone = pace() * (now - walk.t0) / 1000;
    if (dx) face = Math.sign(dx);
    if (calm || gone >= Math.abs(dx)) { unglide(); x = walk.x; walk.then ? walk.then(now) : guide ? (state = 'sit') : sitDown(now); }
    else {
      x = walk.x0 + face * gone;
      if (!walk.glide && visible) { const ms = (Math.abs(walk.x - x) / pace()) * 1000; walk.glide = el.animate([{ transform: spot(x) }, { transform: spot(walk.x) }], { duration: ms, easing: 'linear', fill: 'forwards' }); }
    }
  } else if (state === 'stalk') {   // crouched, wiggling, then it goes
    face = pointer && pointer[0] < x ? -1 : 1;
    if (now > until) {
      const tx = edge(pointer ? pointer[0] : x + face * 120);
      state = 'pounce'; pounce = { x0: x, x1: clamp(tx, x - h * 3.5, x + h * 3.5) };
      play('pounce', (n) => { track('kitty', { act: 'pounce' }); sitDown(n); });
    }
  } else if (state === 'pounce') {   // the sheet arcs the body up and down; the site carries it across, in the air only
    const f = (now - clip.at) / 1000 * M.actions.pounce.fps, k = calm ? 1 : clamp((f - 3) / 5.5, 0, 1);
    x = pounce.x0 + (pounce.x1 - pounce.x0) * k * k * (3 - 2 * k);
  } else if (state === 'sleep') {
    if (now > until) { state = 'wake'; play('wake', settle); }
  } else if (state === 'sit') {
    if (leaving != null) { if (y < ground - 2) hop(); else rise(() => walkTo(leaving, true, gone)); }   // turned off: out by the nearest edge
    else if (guide) travel(now, calm);
    else if (y > ground + 2) rise((n) => jump(n, x, ground, stand));   // its floor moved up (a phone's sheet closed): it hops up
    else if (y < ground - 2) hop();   // up on a perch with nothing to show: a hop down
    else if (!calm && !petting && bubble.hidden) idle(now, h);
  }
  const name = clip.name, i = frameAt(now);
  if (act === 'swat' && !swatHit && i >= 4) { swatHit = true; bubbles?.swat(x + face * h * .25, y - h * .9, h * .5); }   // its own doing, so not tracked
  // what shows: the clip, except for the flight of a jump (by how far along the arc it is) and a nod on the beat
  let pic = [name, i];
  if (state === 'leap' && now > leap.at) { const m = M.actions.jump.markers, p = (now - leap.at) / leap.ms; pic = ['jump', p < .12 ? m.takeoff : p < .5 ? m.air_up : m.air_down]; }
  const nodding = state === 'sit' && !act && !petting && !guide && beat.playing && !calm && want('nod');
  if (nodding) pic = ['nod', clamp(Math.floor((now - beat.kickAt) / 1000 * M.actions.nod.fps), 0, 4)];
  const ds = petting ? 'happy' : nodding ? 'nod' : act || state;   // what it is doing, for the stylesheet and for tests
  if (el.dataset.state !== ds) el.dataset.state = ds;
  draw(now, dt, ...pic);
  if (x !== x0 || y !== y0) placeBubble();

  // when to look again
  const a = M.actions[clip.name], per = 1000 / (a.fps * clip.rate), done = !a.loop && (now - clip.at) / per >= a.frames - 1 && !clip.then;
  if (MOVING.has(state) || dust.length) rate = FULL;
  else if (again || (!calm && (!done || fade)) || clip.then || (guide && !guide.arrived)) rate = CALM;   // a new picture to come, or a move under way
  else { rate = 0; if (calm && state === 'sleep') nextIn(until - now + 10); }   // nothing will change until something happens, and whatever happens wakes it
}
function stand() { state = 'sit'; }
// The open floor around px: between the windows (the player among them) that come down to its floor, so a walk never
// crosses their buttons. Null when it sits under one. Read when it sets off, every few seconds at most, not as it moves.
function room(px) {
  const ground = floor(), h = tall(), side = h * .45;
  let lo = h * .6, hi = W - h * .6;
  for (const win of document.querySelectorAll('.win:not([hidden])')) {
    const r = win.getBoundingClientRect();
    if (!r.width || r.top > ground - 8 || r.bottom < ground - h) continue;   // what it stands on, or well clear above it
    if (px > r.left - side && px < r.right + side) return null;
    if (r.right <= px) lo = Math.max(lo, r.right + side); else hi = Math.min(hi, r.left - side);
  }
  return hi > lo ? [lo, hi] : null;
}
function gone() { off = true; leaving = walk = null; guide = null; el.hidden = bubble.hidden = true; visible = false; rate = 0; }   // all its work stops here
// In from the left, the icons' side, to open floor; under reduced motion it is just there.
function enter(now) {
  const h = tall(), span = room(-h);
  y = floor(); face = 1;
  if (still.matches || !span) { x = span ? clamp(W * .38, ...span) : W * .38; settle(now); }
  else { x = -h * .6; walkTo(clamp(W * .38, ...span), true); }
}
// The first-visit hook: off to sit by PLAY_ME.EXE and point, or, when the page has just opened, already there.
function point(icon, now = false) {
  if (showing || off) return;
  guide = { el: icon, hook: true, now, then: () => say('<b>psst… start here</b><span>30 seconds, then go play</span>') };
  sheet(M.actions.point.sheet);
  if (state === 'sleep') settle(performance.now());
  if (state === 'walk' && !walk.then) { unglide(); walk.x = x; }   // still running in: it turns that way at once
  wake();
}
function hop() { fall(x < W / 2 ? 90 : -90, -320); }   // off a perch, toward the open middle of the screen

// Sitting on the floor with nothing to do: prey, a bubble, an idle, a stroll, a nap.
function idle(now, h) {
  if (act) return;
  // a cursor skittering low along the floor, not too far away, is prey
  const prey = trail.length > 4 && pointer && Math.abs(pointer[1] - y) < h * 1.6 && Math.abs(pointer[0] - x) < 520 && Math.abs(pointer[0] - x) > h * .6
    && Math.abs(trail[trail.length - 1][0] - trail[0][0]) > 180 && now - trail[0][2] < 400;
  const back = () => { act = null; play('sit'); };
  if (prey && want('stalk')) { state = 'stalk'; until = now + rand(800, 1200); trail = []; face = pointer[0] < x ? -1 : 1; play('stalk'); }
  else if (now - swatAt > 5000 && has('swat') && bubbles?.swat(x + face * h * .25, y - h * .9, h * .5, true)) { swatAt = now; act = 'swat'; swatHit = false; play('swat', back); }
  else if (now > idleAt && has('groom')) { act = IDLES[Math.floor(Math.random() * IDLES.length)]; idleAt = now + rand(6000, 12000); play(act, back); }
  else if (now > until) {
    if (++strolls > 4 && has('sleep')) { strolls = 0; nap(now); return; }
    const span = room(x);
    if (!span) { until = now + rand(3500, 8000); return; }   // nowhere open to go: it stays sat
    const tx = clamp(x + rand(80, 360) * (Math.random() < .5 ? -1 : 1), ...span);
    // now and then a long stretch first: it starts and ends sitting, so it gets up after it
    if (Math.random() < .3 && has('stretch')) { act = null; state = 'stretch'; play('stretch', () => (guide ? stand() : rise(() => walkTo(tx)))); }
    else rise(() => walkTo(tx));
  }
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
  if (inked !== coatId()) {   // a new OS: its colour read once, and the sheets the last coat had loaded asked for when idle
    const was = inked; inked = coatId(); ink = getComputedStyle(el).color;
    if (was) later(() => M.sheets.forEach((sh) => sheets[`${was}-${sh}`] && sheet(sh)));
  }
  // Until the new coat's sheet is in, it goes on in the coat it had; with neither in, the last picture stays.
  if (!coat && !has(name) && has('sit')) { want(name); name = 'sit'; i = 0; }   // its first picture: the sit, till the clip's sheet is in
  if (!has(name)) { want(name); if (!coat || !has(name, coat)) { drawn = ''; return; } } else coat = inked;
  const k = fade && (now - fade.at) / FADE;
  if (k >= 1) fade = null;
  const fx = !still.matches && (state === 'sleep' || petting || state === 'stalk' || dust.length > 0);
  const key = `${coat}|${name}|${i}|${face}|${fade ? Math.floor(k * 3) : ''}|${state === 'leap' || state === 'fall' || held}`;
  if (key === drawn && !fx) return;
  g.setTransform(d * s, 0, 0, d * s, 0, 0);   // from here on, sheet pixels
  g.clearRect(0, 0, cw, ch);
  blit(g, name, i, face, 1, coat);
  if (fade && has(fade.shown[0], fade.shown[3])) blit(g, fade.shown[0], fade.shown[1], fade.shown[2], 1 - k, fade.shown[3]);   // the last picture fading out over the new one
  else shown = [name, i, face, coat];
  drawn = key;
  const u = SIT / 100;   // the effects are drawn to the cat's size
  if (!held && state !== 'leap' && state !== 'fall') {   // a soft shadow on what it stands on
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(0,20,50,.22)'; g.beginPath(); g.ellipse(mid, M.floor - 1, 31 * u, 3.5 * u, 0, 0, 7); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  if (!fx) return;
  if (state === 'sleep') {   // z z z
    g.fillStyle = ink; g.font = `700 ${15 * u}px sans-serif`;
    // from its head, which lies at the far end from its tail: the cell's left as drawn facing right
    for (let k = 0; k < 2; k++) { const p = (now / 1600 + k * .5) % 1; g.globalAlpha = 1 - p; g.fillText('z', mid + (face > 0 ? -38 : 30) * u - p * 15 * u * face, M.floor - (63 + p * 30) * u); }
  }
  if (petting) {   // hearts while it's stroked
    g.fillStyle = '#ff6b9a'; g.font = `${19 * u}px sans-serif`;
    for (let k = 0; k < 2; k++) { const p = (now / 1100 + k * .5) % 1; g.globalAlpha = 1 - p; g.fillText('♥', mid + (k * 50 - 35) * u, M.floor - (93 + p * 22) * u); }
  }
  if (state === 'stalk') { g.fillStyle = ink; g.globalAlpha = .9; g.font = `700 ${23 * u}px sans-serif`; g.fillText('!', mid + (face * 50 - 4) * u, M.floor - 88 * u); }
  g.globalAlpha = 1;
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
      unglide(); guide = null; clip.then = null; leap = walk = null;
      state = 'held'; act = null; swing = swingV = 0; say(''); petting = false; play('held');
      track('kitty', { act: 'pick_up' });
    }
    grab = { x: e.clientX, y: e.clientY };
    wake();
  });
  const drop = () => {
    if (!start) return;
    start = null;
    if (state === 'held') { swing = 0; quiet = performance.now() + 400; fall(clamp(vx, -900, 900), 0); }
  };
  el.addEventListener('pointerup', drop);
  el.addEventListener('pointercancel', drop);
  // A mouse resting on it strokes it: eyes shut, tail up, a little bounce, a heart or two.
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && state === 'sit' && !guide && !act && want('happy')) { petting = true; play('happy'); track('kitty', { act: 'pet' }); } });
  el.addEventListener('pointerleave', () => { if (petting) { petting = false; if (state === 'sit') play('sit'); } });
  el.addEventListener('click', () => {   // a click that wasn't a carry
    if (moved > 6 || performance.now() < quiet) return;
    if (showing) return nextStop();
    if (state === 'sleep') { state = 'wake'; play('wake', settle); }
    want('point');   // its menu leads to the show-around
    if (petting) { petting = false; play('sit'); }
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
  // A click anywhere else, or Escape, ends the show-around, even on its way to the next icon: they have found something to read.
  addEventListener('pointerdown', (e) => { if (showing && !e.target.closest?.('.kitty, .kitty__say')) endShow('stop', e.target); }, true);
  addEventListener('keydown', (e) => { if (showing && e.key === 'Escape') endShow('stop'); });
  addEventListener('pointermove', (e) => {
    pointer = [e.clientX, e.clientY];
    if (e.pointerType === 'mouse') { trail.push([e.clientX, e.clientY, performance.now()]); if (trail.length > 12) trail.shift(); }
  }, { passive: true });
  addEventListener('resize', () => {   // on its floor before (sitting, napping, walking ...), on its floor after
    const was = floor();
    W = innerWidth; H = innerHeight; x = clamp(x, 60, W - 60); unglide(); relayout();
    if (state !== 'held' && Math.abs(y - was) < 3) y = floor();
    measure();
  });
  addEventListener('scroll', () => { if (guide) relayout(); }, { capture: true, passive: true });   // a phone's icons scroll
  document.addEventListener('visibilitychange', wake);
  still.addEventListener?.('change', wake);
  // What moves its floor or hides it: the page's classes (a phone, a sheet, the tape), the player, and the game's arcade.
  new MutationObserver(relayout).observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  new MutationObserver(() => { arcade = !!document.querySelector('.arcade'); wake(); }).observe(document.body, { childList: true });
  new MutationObserver(relayout).observe($('player'), { attributes: true, attributeFilter: ['class', 'hidden'] });
  // In the play-along game it says how to play, once, and then keeps out of the way.
  new MutationObserver(() => { if ($('player').classList.contains('is-beat') && !wire.told) { wire.told = true; say('<b>A S K L, on the line</b><span>and don\'t hit the bombs</span>', 5000); } }).observe($('player'), { attributes: true, attributeFilter: ['class'] });
}

// main.js starts it and hands over the bubbles, so it can pop one, and a way to open and close windows quietly.
// guide(icon) sends it to sit by that icon and point; calm() lets it go.
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
  W = innerWidth; H = innerHeight;
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
    on() {
      if (!off && leaving == null) return;
      const was = off; off = false; leaving = null;
      if (was) { relayout(); enter(performance.now()); }
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
