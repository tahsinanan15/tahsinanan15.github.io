// Slow bubbles behind the windows. Click the open desktop to pop them. Until the tour is played, they fall into its icon.
import { sfx, beat } from './audio.js';
import { drawFx, bubbleAlpha, reactSite, spritesFor, bubbleKind } from './fx.js';
import { track } from './analytics.js';

const R = 128, SWARM = 24;   // extra bubbles while they're falling into the icon
function sprite() {
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
  const img = sprite();
  let W = 0, H = 0, dpr = 1, list = [], sparks = [], raf = 0, last = 0, dtNow = 0, well = null, joinIn = 0;

  const spawn = (fresh) => {
    const r = 14 + Math.random() * Math.random() * 46, left = W < 980 ? 0 : 250;   // clear of the desktop icons
    return { slot: null, pull: 0, pick: Math.floor(Math.random() * 60), r, x: left + Math.random() * (W - left), y: fresh ? H + r + Math.random() * H * .5 : Math.random() * H, v: 7 + Math.random() * 11 + (60 - r) * .08, sway: 10 + Math.random() * 22, ph: Math.random() * 7, f: .2 + Math.random() * .35 };
  };
  const count = () => (W < 700 ? 7 : Math.round(Math.min(18, W * H / 90000))) + (well ? SWARM : 0);
  const recycle = (b) => { if (list.length > count()) list.splice(list.indexOf(b), 1); else Object.assign(b, spawn(true)); };
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    list = Array.from({ length: count() }, () => spawn(false));
    if (still.matches) paint(0);
  };
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
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (document.hidden) { last = now; return; }
    reactSite(beat, now);
    if (now - last < 30) return;   // about 30 fps for the canvas: slow bubbles need no more, and laptops stay cool
    const dt = Math.min(.08, (now - last) / 1000 || 0); last = now; dtNow = dt;
    const box = well?.getBoundingClientRect();
    if (box?.width) {   // everything falls toward the icon on a slow spiral. The first few stay in orbit, the rest are absorbed and start over.
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
        if (held < cap) { b.slot = { a: .6 + (held * 1.3) % 3.9, d: 44 + 13 * Math.sqrt(held + 1), r: 15 + (held * 7 % 5) * 3.5 }; held++; }
        else { sparks.push({ ring: 1, x: b.cx ?? b.x, y: b.y, r: b.r, life: .7 }); recycle(b); const side = Math.random() < .5; b.x = side ? W + b.r + Math.random() * 60 : Math.random() * W; b.y = side ? Math.random() * H : H + b.r + Math.random() * 60; }
      }
    } else for (const b of list) {
      b.y -= b.v * dt;
      if (b.y < -b.r * 2) recycle(b);
    }
    for (const s of sparks) { s.life -= dt * 2.6; if (!s.ring) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 240 * dt; } }
    paint(now / 1000);
  };

  const pop = (b) => {
    sparks.push({ ring: 1, x: b.cx, y: b.y, r: b.r, life: 1 });
    for (let i = 0; i < 9; i++) { const a = Math.random() * 7, sp = 50 + Math.random() * 120; sparks.push({ x: b.cx + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, r: 1 + Math.random() * 2.2, life: 1 }); }
    recycle(b);
    sfx.pop();
  };
  // Windows and icons sit above this layer, so a hit test only runs on the open desktop.
  const hitAt = (x, y) => list.find((b) => Math.hypot((b.cx ?? b.x) - x, b.y - y) < b.r + 5);
  addEventListener('pointerdown', (e) => {
    if (e.target.closest('.win, .taskbar, .startmenu, .ico, .balloon, .boot, dialog, .off, .prints, .tour')) return;
    const b = hitAt(e.clientX, e.clientY);
    if (!b) return;
    pop(b);
    track('bubble_pop');
    if (still.matches) { sparks = []; paint(0); }
  });
  addEventListener('resize', resize);
  resize();
  if (still.matches) paint(0); else raf = requestAnimationFrame(tick);
  return {
    gather(el) {
      if (still.matches) return;
      well = el;
      while (list.length < count()) list.push(spawn(false));
    },
    release(burst) {
      well = null;
      list.filter((b) => b.slot).forEach((b, i) => { b.slot = null; if (burst) setTimeout(() => pop(b), i * 30); });
      list.splice(count()).forEach((b) => sparks.push({ ring: 1, x: b.cx ?? b.x, y: b.y, r: b.r, life: .7 }));   // the swarm's extras go now, not a minute later
    },
  };
}
