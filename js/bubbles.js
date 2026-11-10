// Slow bubbles behind the windows. Click the open desktop to pop them. Until the tour is played, they fall into its icon.
// With the bubble wand on (the tray's wand button), a press and drag on the open desktop blows a short stream of them the way
// the pointer went, and a click blows one or two; they slow down and drift like the rest. The kitty plays with them (js/kitty.js).
import { sfx, beat } from './audio.js';
import { drawFx, bubbleAlpha, reactSite, spritesFor, bubbleKind } from './fx.js';
import { track } from './analytics.js';
import { join, keep, wake, lite, CALM } from './clock.js';

const R = 128, DRAG = 1.5, BLOWN = 12;   // a push slows by DRAG a second; at most BLOWN blown bubbles at once, the oldest pops first
export function soap() {
  const c = document.createElement('canvas'); c.width = c.height = R * 2;
  const g = c.getContext('2d');
  const body = g.createRadialGradient(R, R, R * .55, R, R, R);
  body.addColorStop(0, 'rgba(190,240,255,.03)'); body.addColorStop(.78, 'rgba(170,230,255,.12)');
  body.addColorStop(.95, 'rgba(255,255,255,.55)'); body.addColorStop(1, 'rgba(255,255,255,.12)');
  g.fillStyle = body; g.beginPath(); g.arc(R, R, R - 1, 0, 7); g.fill();
  if (g.createConicGradient) {   // the thin film's rainbow rim
    const film = g.createConicGradient(.6, R, R);
    ['#ff7ad9', '#ffe36e', '#7dffa0', '#6fd8ff', '#b79bff', '#ff7ad9'].forEach((col, i) => film.addColorStop(i / 5, col));
    g.save(); g.globalAlpha = .34; g.lineWidth = R * .09; g.strokeStyle = film;
    g.beginPath(); g.arc(R, R, R * .93, 0, 7); g.stroke(); g.restore();
  }
  const shine = g.createRadialGradient(R * .62, R * .52, 0, R * .62, R * .52, R * .36);
  shine.addColorStop(0, 'rgba(255,255,255,.95)'); shine.addColorStop(.5, 'rgba(255,255,255,.28)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
  g.save(); g.translate(R * .62, R * .52); g.rotate(-.65); g.scale(1, .62); g.translate(-R * .62, -R * .52);
  g.fillStyle = shine; g.beginPath(); g.arc(R * .62, R * .52, R * .36, 0, 7); g.fill(); g.restore();
  const low = g.createRadialGradient(R * 1.42, R * 1.46, 0, R * 1.42, R * 1.46, R * .18);
  low.addColorStop(0, 'rgba(255,255,255,.6)'); low.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = low; g.beginPath(); g.arc(R * 1.42, R * 1.46, R * .18, 0, 7); g.fill();
  return c;
}

export function initBubbles() {
  const canvas = document.getElementById('bubbles'), g = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const img = soap();
  let W = 0, H = 0, dpr = 1, list = [], sparks = [], age = 0, dtNow = 0, well = null, box = null, drawnAt = 0, seq = 0, wandOn = false, blowing = null;

  const small = () => document.documentElement.classList.contains('phone');   // fewer, smaller, and a tighter orbit
  const spawn = (fresh) => {
    const r = (14 + Math.random() * Math.random() * 46) * (small() ? .7 : 1), left = W < 980 ? 0 : 250;   // clear of the desktop icons
    return { id: ++seq, slot: null, pull: 0, pick: Math.floor(Math.random() * 60), r, x: left + Math.random() * (W - left), y: fresh ? H + r + Math.random() * H * .5 : Math.random() * H, v: 7 + Math.random() * 11 + (60 - r) * .08, sway: 10 + Math.random() * 22, ph: Math.random() * 7, f: .2 + Math.random() * .35 };
  };
  const count = () => { const n = (small() ? 7 : Math.round(Math.min(18, W * H / 90000))) + (well ? (small() ? 12 : 24) : 0); return lite > 1 ? Math.ceil(n / 2) : n; };   // extra bubbles while they're falling into the icon, and half as many on a screen that can't keep up
  const ambient = () => list.reduce((n, b) => n + !b.blown, 0);   // the site's own bubbles, not the ones blown from the wand
  const recycle = (b) => { if (b.blown || ambient() > count()) list.splice(list.indexOf(b), 1); else Object.assign(b, spawn(true), { kx: 0, ky: 0, hold: 0, lo: null }); };
  const size = () => {
    drawnAt = lite;
    dpr = Math.min(devicePixelRatio || 1, 1.5) * (lite > 1 ? .75 : 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
  };
  const resize = () => {
    W = innerWidth; H = innerHeight; box = null;
    size();
    list = Array.from({ length: count() }, () => spawn(false));
    if (still.matches) paint(0);
  };
  // Something pushed (a blown bubble, one the kitty bats) moves under reduced motion too, gently; nothing else does there.
  const stirred = () => sparks.length > 0 || list.some((b) => b.blown || b.hold > 0 || b.kx || b.ky);
  const paint = (t) => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!still.matches) drawFx(g, W, H, dtNow, beat, document.querySelector('.wall img.is-on'), H > W * 1.1);
    g.globalAlpha = bubbleAlpha();
    const grown = well ? 1.19 : 1, themed = spritesFor(bubbleKind());   // nothing pumps on the beat; the hook keeps the size it had with the music on
    for (const b of list) {
      const x = b.x + Math.sin(t * b.f + b.ph) * b.sway, y = b.y + (b.slot ? Math.cos(t * b.f * 1.5 + b.ph) * 3 : 0), r = b.r * grown;
      b.cx = x;
      g.drawImage(themed ? themed[b.pick % themed.length] : img, x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    sparks = sparks.filter((s) => s.life > 0);
    for (const s of sparks) {
      g.globalAlpha = Math.max(0, s.life);
      if (s.ring) { g.strokeStyle = '#fff'; g.lineWidth = 2 * s.life; g.beginPath(); g.arc(s.x, s.y, s.r * (1.35 - s.life * .35), 0, 7); g.stroke(); }
      else { g.fillStyle = '#e8fbff'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
  };
  // On the frame clock, at its calm 30 frames a second: slow bubbles need no more, and laptops stay cool.
  const tick = (now, ms) => {
    if (!still.matches) reactSite(beat, now, ms);
    if (drawnAt !== lite) size();   // the clock found this screen slow: the bubbles that leave now aren't replaced, and the canvas gets coarser
    const dt = Math.min(.08, ms / 1000); dtNow = dt; if (!still.matches) age += dt;
    if (well && box?.width) {   // everything falls toward the icon on a slow spiral. The first few stay in orbit, the rest are absorbed and start over.
      const cx = box.left + box.width / 2, cy = box.top + box.height * .36, cap = Math.min(12, list.length - 8);
      let held = list.filter((b) => b.slot).length;
      for (const b of list) {
        if (b.slot) {
          const s = b.slot, k = Math.min(1, dt * 1.6);
          b.x += (Math.max(s.r + 2, cx + Math.cos(s.a) * s.d) - b.x) * k;
          b.y += (Math.max(s.r + 2, cy + Math.sin(s.a) * s.d) - b.y) * k;
          b.r += (s.r - b.r) * k;
          b.sway += (4 - b.sway) * k;
          continue;
        }
        const dx = cx - b.x, dy = cy - b.y, d = Math.hypot(dx, dy) || 1, speed = (70 + 210 * (b.pull = Math.min(1, b.pull + dt * .6)) ** 2) * (.5 + b.v / 30);
        b.x += (dx * .92 - dy * .38) / d * speed * dt;
        b.y += (dy * .92 + dx * .38) / d * speed * dt;
        if (d < 420) b.r += (18 - b.r) * Math.min(1, dt * 1.5);
        if (d >= 64) continue;
        if (held < cap) { const k = small() ? .72 : 1; b.slot = { a: .6 + (held * 1.3) % 3.9, d: (44 + 13 * Math.sqrt(held + 1)) * k, r: (15 + (held * 7 % 5) * 3.5) * k }; held++; }
        else { sparks.push({ ring: 1, x: b.cx ?? b.x, y: b.y, r: b.r, life: .7 }); recycle(b); const side = Math.random() < .5; b.x = side ? W + b.r + Math.random() * 60 : Math.random() * W; b.y = side ? Math.random() * H : H + b.r + Math.random() * 60; }
      }
    } else for (const b of [...list]) {
      if (b.kx || b.ky) {   // a push, slowing back to the usual drift; one batted along the floor stays between lo and hi
        const k = Math.exp(-dt * DRAG);
        b.x += b.kx * dt; b.y += b.ky * dt; b.kx *= k; b.ky *= k;
        if (Math.abs(b.kx) + Math.abs(b.ky) < 4) b.kx = b.ky = 0;
      }
      if (b.lo != null && b.hold > 0) { if (b.x < b.lo) { b.x = b.lo; b.kx = Math.abs(b.kx) * .5; } else if (b.x > b.hi) { b.x = b.hi; b.kx = -Math.abs(b.kx) * .5; } }
      if (b.hold > 0) { b.hold -= dt; b.y += (b.ty - b.y) * Math.min(1, dt * 3); }   // kept low for a while, where a paw can reach it
      else b.y -= b.v * dt * (still.matches ? .5 : 1);
      if (b.y < -b.r * 2 || b.x < -b.r * 3 || b.x > W + b.r * 3) recycle(b);
    }
    for (const s of sparks) { s.life -= dt * 2.6; if (!s.ring) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 240 * dt; } }
    paint(age);
  };
  // A blown bubble: from the wand at (x, y), moving at (vx, vy) px a second, slowing to the usual drift.
  const blow = (x, y, vx, vy) => {
    const mine = list.filter((b) => b.blown);
    if (mine.length >= BLOWN) pop(mine[0], true);
    const sp = Math.hypot(vx, vy), cap = sp > 1400 ? 1400 / sp : 1, k = (still.matches ? .35 : 1) * cap, b = spawn(false);
    Object.assign(b, { blown: true, x, y, cx: x, r: (10 + Math.random() * 14) * (small() ? .8 : 1), kx: vx * k, ky: vy * k, v: 6 + Math.random() * 8, sway: still.matches ? 0 : 5 + Math.random() * 9 });
    b.ph = -age * b.f;   // it leaves the wand exactly where the wand is
    list.push(b); wake();
  };
  const puff = (x, y, vx, vy) => blow(x + (Math.random() - .5) * 6, y + (Math.random() - .5) * 6, vx * (.75 + Math.random() * .3) + (Math.random() - .5) * 40, vy * (.75 + Math.random() * .3) + (Math.random() - .5) * 40);

  const pop = (b, quiet) => {
    sparks.push({ ring: 1, x: b.cx, y: b.y, r: b.r, life: 1 });
    for (let i = 0; i < 9; i++) { const a = Math.random() * 7, sp = 50 + Math.random() * 120; sparks.push({ x: b.cx + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, r: 1 + Math.random() * 2.2, life: 1 }); }
    recycle(b);
    if (!quiet) sfx.pop();
  };
  // Windows and icons sit above this layer, so a hit test only runs on the open desktop.
  const hitAt = (x, y) => list.find((b) => Math.hypot((b.cx ?? b.x) - x, b.y - y) < b.r + 5);
  addEventListener('pointerdown', (e) => {
    if (e.target.closest('.win, .taskbar, .startmenu, .ico, .balloon, .boot, dialog, .off, .tour, .kitty, .kitty__say')) return;
    const b = hitAt(e.clientX, e.clientY);
    if (!b) {   // the wand: open desktop, nothing to pop there
      if (wandOn && !e.button && e.isPrimary && !e.target.closest('.arcade')) blowing = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), vx: 0, vy: 0, n: 0, at: 0, lx: e.clientX, ly: e.clientY, touch: e.pointerType !== 'mouse' };
      return;
    }
    pop(b);
    track('bubble_pop');
    if (still.matches) { sparks = []; paint(0); }
  });
  // A drag blows a short stream the way it goes, as fast as it goes; a flick sends the last one furthest. A click blows one
  // or two; a tap on a phone is just a tap.
  addEventListener('pointermove', (e) => {
    const s = blowing;
    if (!s || e.pointerId !== s.id) return;
    const now = performance.now(), dt = Math.max(8, now - s.t);
    s.vx += ((e.clientX - s.x) / dt * 1000 - s.vx) * .5; s.vy += ((e.clientY - s.y) / dt * 1000 - s.vy) * .5;
    s.x = e.clientX; s.y = e.clientY; s.t = now;
    if (s.n < 7 && now - s.at > 55 && Math.hypot(s.x - s.lx, s.y - s.ly) > 16) { puff(s.x, s.y, s.vx, s.vy); s.n++; s.at = now; s.lx = s.x; s.ly = s.y; }
  }, { passive: true });
  const blown = (e) => {
    const s = blowing;
    if (!s || e.pointerId !== s.id) return;
    blowing = null;
    if (e.type === 'pointercancel') return;
    if (!s.n) { if (!s.touch) { puff(s.x, s.y, 0, -60); if (Math.random() < .5) puff(s.x + 8, s.y - 4, 30, -90); } }
    else if (Math.hypot(s.vx, s.vy) > 500 && performance.now() - s.t < 80) puff(s.x, s.y, s.vx, s.vy);
  };
  addEventListener('pointerup', blown);
  addEventListener('pointercancel', blown);
  addEventListener('resize', resize);
  // Where the tape's icon is, measured once and kept until a resize or the layout changes with a new look or the phone line.
  new MutationObserver(() => { box = null; }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  resize();
  if (still.matches) paint(0);
  join({
    rate: () => (document.documentElement.classList.contains('has-sheet') || (still.matches && !stirred()) ? 0 : CALM),   // a sheet covers all of this; under reduced motion only what was pushed moves
    read() { if (well && !box) box = well.getBoundingClientRect(); },
    write: tick,
  });
  const view = (b) => ({ id: b.id, x: b.cx ?? b.x, y: b.y, r: b.r, kx: b.kx || 0, blown: !!b.blown });
  const byId = (id) => list.find((b) => b.id === id && !b.slot);
  return {
    drag: DRAG,
    wand(on) { wandOn = on; if (!on) blowing = null; },
    blown: () => list.some((b) => b.blown),
    // For the kitty's play: the bubble nearest (x, y) that ok() takes, where one is now, a push (kept low at ty, between lo
    // and hi, for hold seconds), and a silent pop. A bubble is known by its id, which changes when it is popped or starts over.
    pick(ok, x, y) { let best = null, d = Infinity; for (const b of list) { if (b.slot) continue; const v = view(b), e = Math.hypot(v.x - x, v.y - y); if (e < d && ok(v)) { best = v; d = e; } } return best; },
    peek(id) { const b = byId(id); return b ? view(b) : null; },
    nudge(id, vx, vy, ty, lo, hi, hold) { const b = byId(id); if (!b) return; Object.assign(b, { kx: vx, ky: vy, ty, lo, hi, hold, sway: Math.min(b.sway, 5) }); wake(); },
    burst(id) { const b = byId(id); if (b) { pop(b, true); if (still.matches) paint(0); } return !!b; },
    swat(x, y, r, look) { const b = list.find((o) => !o.slot && Math.hypot((o.cx ?? o.x) - x, o.y - y) < r + o.r); if (b && !look) pop(b, true); return !!b; },   // the kitty's paw: look only checks for one in reach; a pop by the paw is silent
    gather(el) {
      if (still.matches) return;
      well = el; box = null;
      while (ambient() < count()) list.push(spawn(false));
      keep('hook', true);   // a stream of bubbles stopped halfway to the tape would look like the page had hung, so the clock stays up until they're let go
    },
    release(burst) {
      well = null;
      keep('hook', false);
      list.filter((b) => b.slot).forEach((b, i) => { b.slot = null; if (burst) setTimeout(() => pop(b), i * 30); });
      list.splice(count()).forEach((b) => sparks.push({ ring: 1, x: b.cx ?? b.x, y: b.y, r: b.r, life: .7 }));   // the swarm's extras go now, not a minute later
    },
  };
}
