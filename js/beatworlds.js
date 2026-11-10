// The six worlds PLAY ALONG is played in, one for each OS. A world paints its sky once, keeps a few things moving in it,
// lays its road, and gives the blocks their shape, their sparks and their voice. js/beats.js runs the game and calls in here.
// Everything a world is handed sits on f: W and H are the canvas in pixels, d is pixels to a CSS pixel, hz the horizon,
// cx the middle, time in seconds (it stands still under reduced motion), energy 0 to 1 as a streak builds, pulse the bass,
// lite when the screen is struggling and the costly touches should be left out.
// For the road: f.at(u, r) places a point, f.quad(u0, u1) and f.line(u) trace along it, f.rows(gap, draw) calls draw(r) for
// rows that travel with the notes. u runs 0 to 4 across the lanes, r is how far off something is (0 on the line, 1 a note's start).
import { soap } from './bubbles.js';

const TAU = Math.PI * 2;
const lin = (g, x0, y0, x1, y1, ...stops) => { const p = g.createLinearGradient(x0, y0, x1, y1); stops.forEach((c, i) => p.addColorStop(i / (stops.length - 1), c)); return p; };
const rad = (g, x, y, r, ...stops) => { const p = g.createRadialGradient(x, y, 0, x, y, r); stops.forEach((c, i) => p.addColorStop(i / (stops.length - 1), c)); return p; };
const rnd = (a) => () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };   // the same scene every time
const round = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const poly = (g, pts) => { g.beginPath(); for (const [x, y] of pts) g.lineTo(x, y); g.closePath(); };
const blob = (g, x, y, r, rgb, a) => { g.fillStyle = rad(g, x, y, r, `rgba(${rgb},${a})`, `rgba(${rgb},0)`); g.fillRect(x - r, y - r, r * 2, r * 2); };
const dot = (g, s) => { g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill(); };

/* ---------- Pieces more than one world uses ---------- */
function arrows(g, x, y, h, color) {   // three chevrons pointing right: which way to sweep
  g.strokeStyle = color; g.lineWidth = h * .24; g.lineCap = g.lineJoin = 'round';
  for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * h * .62 - h * .22, y - h * .5); g.lineTo(x + i * h * .62 + h * .22, y); g.lineTo(x + i * h * .62 - h * .22, y + h * .5); g.stroke(); }
}
function gel(g, x, y, w, h, [light, mid, dark]) {   // a glossy pill, round when it's as wide as it's tall
  g.save();
  g.shadowColor = 'rgba(0,40,110,.45)'; g.shadowBlur = h * .1; g.shadowOffsetY = h * .06;
  round(g, x, y, w, h, h / 2); g.fillStyle = lin(g, 0, y, 0, y + h, light, mid, mid, dark); g.fill();
  g.shadowColor = 'transparent'; g.clip();
  g.fillStyle = rad(g, x + w / 2, y + h * 1.05, h * .75, 'rgba(255,255,255,.8)', 'rgba(255,255,255,0)'); g.fillRect(x, y, w, h);   // light pools at the bottom of gel
  round(g, x + h * .12, y + h * .06, w - h * .24, h * .46, h * .23); g.fillStyle = lin(g, 0, y, 0, y + h * .52, 'rgba(255,255,255,.95)', 'rgba(255,255,255,.08)'); g.fill();
  g.restore();
  round(g, x, y, w, h, h / 2); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = h * .035; g.stroke();
}
function palm(g, x, base, h, lean, color) {
  const tx = x + lean * h, ty = base - h;
  g.strokeStyle = color; g.lineCap = 'round'; g.lineWidth = h * .045;
  g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + lean * h * .2, base - h * .6, tx, ty); g.stroke();
  g.lineWidth = h * .03;
  for (let i = 0; i < 9; i++) { const a = -Math.PI * (.08 + i * .105), l = h * (.42 - Math.abs(i - 4) * .02); g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * l * .7, ty + Math.sin(a) * l * .9, tx + Math.cos(a) * l, ty + Math.sin(a) * l * .35 + l * .3); g.stroke(); }
}
function rain(g, f, n, color, slant, speed) {
  const { W, H, time: T, d } = f;
  g.strokeStyle = color; g.lineWidth = d; g.beginPath();
  for (let i = 0; i < n; i++) { const p = (i * .618034 + T * speed * (.7 + (i % 7) * .08)) % 1, x = ((i * .754878) % 1) * W * 1.25 - p * H * slant, y = p * (H + 60) - 40, l = (14 + i % 5 * 5) * d; g.moveTo(x, y); g.lineTo(x - l * slant, y + l); }
  g.stroke();
}
let noise = null;
function grain(g, f, a) {   // film grain: one tile of noise, laid somewhere new every frame
  if (f.lite) return;
  if (!noise) {
    noise = document.createElement('canvas'); noise.width = noise.height = 128;
    const x = noise.getContext('2d'), im = x.createImageData(128, 128);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.random(); im.data[i] = im.data[i + 1] = im.data[i + 2] = v < .5 ? 0 : 255; im.data[i + 3] = Math.abs(v - .5) * 510; }   // dark specks and light ones, so the picture keeps its brightness
    x.putImageData(im, 0, 0);
  }
  const o = f.calm ? 0 : Math.random() * 128;
  g.save(); g.globalAlpha = a; g.translate(-o, -o);
  g.fillStyle = g.createPattern(noise, 'repeat'); g.fillRect(0, 0, f.W + 128, f.H + 128); g.restore();
}
function scan(g, f, a) { g.fillStyle = `rgba(0,0,0,${a})`; const h = Math.max(2, Math.round(3 * f.d)); for (let y = 0; y < f.H; y += h) g.fillRect(0, y, f.W, 1); }
function shade(g, f, rgb, a) {   // the corners fall away
  const r = Math.hypot(f.W, f.H) / 2, p = g.createRadialGradient(f.W / 2, f.H / 2, r * .5, f.W / 2, f.H / 2, r);
  p.addColorStop(0, `rgba(${rgb},0)`); p.addColorStop(1, `rgba(${rgb},${a})`);
  g.fillStyle = p; g.fillRect(0, 0, f.W, f.H);
}
function slip(g, f, n, reach, amount = f.miss) {   // the picture tears sideways in a few bands: on a missed note, or a hard kick
  for (let i = 0; i < n; i++) { const y = (Math.sin(i * 91.7 + Math.floor(f.time * 30)) * .5 + .5) * f.H, h = f.H * .04; g.drawImage(g.canvas, 0, y, f.W, h, Math.sin(i * 7.1 + f.time * 90) * reach * f.d * amount, y, f.W, h); }
}
const edges = (g, f, inner, outer, glow) => {   // lane lines and the road's two edges
  for (let i = 0; i <= 4; i++) {
    f.line(i);
    g.strokeStyle = i % 4 ? inner : outer; g.lineWidth = (i % 4 ? 1 : 3) * f.d;
    g.shadowColor = glow || 'transparent'; g.shadowBlur = glow && !(i % 4) ? 10 * f.d : 0;
    g.stroke();
  }
  g.shadowBlur = 0;
};

/* ---------- Frutiger Aero: a glass causeway over bright water ---------- */
let bubble = null;
function dolphin(g, L) {
  g.beginPath(); g.moveTo(-L * .5, 0); g.quadraticCurveTo(-L * .2, -L * .24, L * .22, -L * .13); g.quadraticCurveTo(L * .42, -L * .08, L * .52, -L * .01);
  g.quadraticCurveTo(L * .3, L * .09, 0, L * .1); g.quadraticCurveTo(-L * .3, L * .08, -L * .5, 0); g.fill();
  g.beginPath(); g.moveTo(-L * .02, -L * .18); g.quadraticCurveTo(-L * .12, -L * .34, -L * .22, -L * .3); g.quadraticCurveTo(-L * .14, -L * .22, -L * .16, -L * .15); g.fill();
  g.beginPath(); g.moveTo(-L * .46, 0); g.quadraticCurveTo(-L * .6, -L * .15, -L * .68, -L * .16); g.quadraticCurveTo(-L * .6, -L * .01, -L * .68, L * .13); g.quadraticCurveTo(-L * .56, L * .08, -L * .46, 0); g.fill();
}
const aero = {
  hands: [['#d9fbff', '#19b9f6', '#0563c4'], ['#f3ffc8', '#84e02b', '#2c961c']],
  ink: '#ffffff', glow: 'rgba(0,50,130,.9)', shade: 'rgba(0,50,120,.4)', fall: .9, ride: [.5, 1.7, .5],
  sky(g, f) {
    const { W, H, hz, cx } = f, R = rnd(7), u = H / 100, sx = W * .74, sy = hz * .42;
    g.fillStyle = lin(g, 0, 0, 0, hz, '#04329a', '#0a6fd8', '#38b6ff', '#c9f3ff'); g.fillRect(0, 0, W, hz);
    for (const [y, c] of [[.2, '170,255,130'], [.36, '120,240,255']]) for (let k = 0; k < 5; k++) {   // aurora ribbons
      g.strokeStyle = `rgba(${c},.06)`; g.lineWidth = u * (13 - k * 2.4);
      g.beginPath(); for (let x = -20; x <= W + 20; x += 20) g.lineTo(x, hz * y + Math.sin(x / W * 7 + y * 9) * u * 3.5 + Math.sin(x / W * 17) * u * 1.3); g.stroke();
    }
    g.fillStyle = rad(g, sx, sy, H * .5, 'rgba(255,255,255,.95)', 'rgba(255,255,240,.45)', 'rgba(255,255,255,.1)', 'rgba(255,255,255,0)'); g.fillRect(0, 0, W, H);   // the sun
    g.fillStyle = lin(g, sx - W * .4, 0, sx + W * .4, 0, 'rgba(255,255,255,0)', 'rgba(255,255,255,.6)', 'rgba(255,255,255,0)'); g.fillRect(sx - W * .4, sy - u * .3, W * .8, u * .6);
    for (const [p, r, c] of [[.3, 3, '120,255,200'], [.55, 5, '255,255,255'], [.8, 2, '140,220,255'], [1.2, 7, '190,255,120']]) {   // and its flare, toward the middle of the lens
      g.fillStyle = `rgba(${c},.15)`; g.strokeStyle = `rgba(${c},.28)`; g.lineWidth = u * .15;
      g.beginPath(); g.arc(sx + (cx - sx) * p * 2, sy + (hz * .9 - sy) * p, r * u, 0, TAU); g.fill(); g.stroke();
    }
    for (let i = 0; i < 7; i++) { const x = R() * W, y = hz * (.2 + R() * .62), s = u * (2.5 + R() * 4); for (let k = 0; k < 8; k++) blob(g, x + (R() - .5) * s * 3.4, y + (R() - .5) * s * .7, s * (.6 + R() * .7), '255,255,255', .45 + R() * .4); }   // clouds
    for (let i = 0; i < 11; i++) {   // the glass towers of a city across the water
      const x = cx + (R() - .5) * W * .34, w = u * (1.1 + R() * 1.5), h = u * (4 + R() * 11);
      g.fillStyle = lin(g, x, 0, x + w, 0, 'rgba(255,255,255,.85)', 'rgba(150,225,255,.5)', 'rgba(255,255,255,.65)'); round(g, x, hz - h, w, h + w, w / 2); g.fill();
    }
    for (const [amp, base, c0, c1, ph] of [[5, 3, '#9be86a', '#3fae4c', 1], [3.4, 1.5, '#c8f78e', '#57c44f', 4]]) {   // green hills either side, low where the causeway meets them
      g.fillStyle = lin(g, 0, hz - u * (amp + base), 0, hz, c0, c1);
      g.beginPath(); g.moveTo(0, hz + 1);
      for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, hz - u * (base + amp * (.5 + .5 * Math.sin(x / W * 5.5 + ph))) * (.3 + .7 * Math.abs(x / W - .5) * 2));
      g.lineTo(W, hz + 1); g.fill();
    }
    g.fillStyle = lin(g, 0, hz, 0, H, '#c4f4ff', '#35b8f2', '#0a78d6', '#06479e'); g.fillRect(0, hz, W, H - hz);   // water
    for (let i = 0; i < 110; i++) { const p = R() ** 2, y = hz + p * (H - hz); g.fillStyle = `rgba(255,255,255,${.1 + R() * .3})`; g.fillRect(R() * W, y, u * (1 + p * 9) * (1 + R() * 2), Math.max(1, u * .13 * (1 + p * 2))); }
  },
  live(g, f) {
    const { W, H, hz, cx, time: T } = f, u = H / 100;
    bubble ||= soap();
    for (let i = 0; i < 14; i++) {   // the desktop's own bubbles, rising
      const p = (i * .618 + T * (.02 + (i % 5) * .006)) % 1, r = u * (1.5 + (i % 4) * 1.3) * (1 + f.pulse * .15);
      g.globalAlpha = .8 * Math.sin(p * Math.PI);
      g.drawImage(bubble, W * ((i * .381) % 1) + Math.sin(T * .7 + i) * u * 3 - r, H * (1.05 - p * 1.15) - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    const leap = (T / 5.5) % 1 / .32;   // a dolphin clears the water while a streak is running
    if (f.energy > .3 && leap < 1) {
      const side = Math.floor(T / 5.5) % 2 ? 1 : -1, x = cx + side * (f.lane * 3.2 + u * 6) - side * leap * u * 16, y = hz + (H - hz) * .3 - Math.sin(leap * Math.PI) * u * 15;
      g.save(); g.translate(x, y); g.scale(-side, 1); g.rotate(-Math.cos(leap * Math.PI) * .9);
      g.fillStyle = lin(g, 0, -u * 3, 0, u * 2, '#2a79c4', '#0d4d96'); dolphin(g, u * 13); g.restore();
      for (let i = 0; i < 6; i++) blob(g, cx + side * (f.lane * 3.2 + u * 6) + Math.sin(i * 5) * u * 3, hz + (H - hz) * .3 - Math.abs(Math.sin(leap * Math.PI * 2 + i)) * u * 3, u * 1.2, '255,255,255', .5 * (1 - leap));
    }
  },
  road(g, f) {
    f.quad(0, 4); g.globalAlpha = .4 + .6 * f.tilt; g.fillStyle = lin(g, 0, f.hz, 0, f.H, 'rgba(255,255,255,.55)', 'rgba(205,245,255,.3)', 'rgba(120,215,255,.24)'); g.fill(); g.globalAlpha = 1;   // thinner in the player, where the glass is the whole screen
    f.rows(.22, (r) => {   // light through the water, moving under the glass
      const a = f.at(0, r), b = f.at(4, r);
      g.strokeStyle = `rgba(255,255,255,${.24 * Math.min(1, a[2] * 2)})`; g.lineWidth = 5 * f.d * a[2];
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2, a[1] - 7 * f.d * a[2] * Math.sin(r * 9 + f.time), b[0], b[1]); g.stroke();
    });
    edges(g, f, 'rgba(255,255,255,.45)', '#ffffff', 'rgba(120,230,255,.9)');
  },
  block(g, S, tone, wide) {
    if (wide) { gel(g, S * .1, S * .2, S * 1.8, S * .6, tone); arrows(g, S, S * .5, S * .26, '#ffffff'); return; }
    gel(g, S * .1, S * .1, S * .8, S * .8, tone);
  },
  spark: dot,
  snap(g, f) { g.globalCompositeOperation = 'lighter'; blob(g, f.W * .74, f.hz * .42, f.H * .5, '255,255,255', .16 * f.snap); },   // the sun blooms on the beat
  sound(tone, burst, hz, kind, pan) { tone(hz * 2, 0, .34, { gain: .16, pan }); tone(hz * 4.01, 0, .12, { gain: .05, pan, type: 'triangle' }); if (kind === 1) tone(hz, 0, .22, { to: hz * 2, gain: .1, pan }); },
};

/* ---------- Vaporwave OS: a grid running out to a striped sun ---------- */
const DUSK = ['#12063a', '#3b1178', '#b0329e', '#ff7fb0', '#ffc58a'];
function column(g, x, base, h, w, broken) {
  g.fillStyle = lin(g, x - w / 2, 0, x + w / 2, 0, '#8d76bd', '#f6ecff', '#ffffff', '#cdb6ee', '#7a62a8');
  if (broken) poly(g, [[x - w / 2, base], [x - w / 2, base - h * .62], [x - w * .1, base - h * .7], [x + w * .2, base - h * .6], [x + w / 2, base - h * .66], [x + w / 2, base]]), g.fill();
  else { g.fillRect(x - w / 2, base - h, w, h); g.fillRect(x - w * .8, base - h, w * 1.6, h * .035); g.fillRect(x - w * .65, base - h * .955, w * 1.3, h * .02); }
  g.fillRect(x - w * .8, base - h * .03, w * 1.6, h * .03);
  g.fillStyle = 'rgba(80,50,130,.35)'; for (let i = 1; i < 4; i++) g.fillRect(x - w / 2 + i * w / 4 - w * .03, base - h * (broken ? .58 : .94), w * .06, h * (broken ? .55 : .9));
}
const vapor = {
  hands: [['#ffd1f1', '#ff71ce', '#b0218f'], ['#d6fbff', '#01cdfe', '#0a6aa8']],
  shade: 'rgba(255,113,206,.45)', fall: .3, ride: [.7, 1.3, .7],
  sky(g, f) {
    const { W, H, hz, cx } = f, R = rnd(11), u = H / 100, r = u * 15, sy = hz - r * .25;
    g.fillStyle = lin(g, 0, 0, 0, hz, ...DUSK); g.fillRect(0, 0, W, hz);
    for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(255,255,255,${R() * .8})`; g.fillRect(R() * W, R() * hz * .6, u * .25, u * .25); }
    g.fillStyle = rad(g, cx, sy, r * 2.6, 'rgba(255,120,200,.55)', 'rgba(255,120,200,.14)', 'rgba(255,120,200,0)'); g.fillRect(cx - r * 3, sy - r * 3, r * 6, r * 6);
    g.save(); g.beginPath(); g.arc(cx, sy, r, 0, TAU); g.clip();
    g.fillStyle = lin(g, 0, sy - r, 0, sy + r, '#fff59a', '#ffb347', '#ff5fa8', '#c738c9'); g.fillRect(cx - r, sy - r, r * 2, r * 2); g.restore();
  },
  far(g, f) {   // the slits in the sun slide down it, behind the mountains
    const { hz, cx, time: T } = f, r = f.H * .15, sy = hz - r * .25;
    g.save(); g.beginPath(); g.arc(cx, sy, r + 1, 0, TAU); g.clip();
    g.fillStyle = lin(g, 0, 0, 0, hz, ...DUSK);
    for (let i = 0; i < 7; i++) { const p = ((i + T * .22) % 7) / 7; g.fillRect(cx - r, sy - r * .5 + p * r * .8, r * 2, r * (.012 + p * .1)); }
    g.restore();
    blob(g, cx, sy, r * (2.2 + f.pulse * .5 + f.energy * .6), '255,150,210', .12 + .12 * f.pulse);
  },
  land(g, f) {
    const { W, H, hz, cx } = f, R = rnd(12), u = H / 100;
    for (const [h, c, e] of [[9, '#2a0f5e', 'rgba(1,205,254,.6)'], [5.5, '#1a0842', 'rgba(255,113,206,.65)']]) {   // low-poly mountains, their facets drawn in
      const pts = []; for (let x = 0; x <= W + 1; x += W / 14) pts.push([x, hz - u * h * (.25 + R() * .75) * (.25 + Math.abs(x / W - .5) * 1.5)]);
      poly(g, [[0, hz + 1], ...pts, [W, hz + 1]]); g.fillStyle = c; g.fill(); g.strokeStyle = e; g.lineWidth = Math.max(1, u * .14); g.stroke();
      for (const [x, y] of pts) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + u * 2, hz); g.stroke(); }
    }
    g.fillStyle = lin(g, 0, hz, 0, H, '#3a0f6e', '#1a0842', '#0d0426'); g.fillRect(0, hz, W, H - hz);
    for (const s of [-1, 1]) {   // marble columns and palms, either side
      column(g, cx + s * W * .3, hz + u * 7, u * 26, u * 3.2); palm(g, cx + s * W * .37, hz + u * 11, u * 30, s * .18, '#0b0320');
      column(g, cx + s * W * .44, hz + u * 14, u * 36, u * 4.4, s > 0); palm(g, cx + s * W * .49, hz + u * 24, u * 46, -s * .12, '#070214');
    }
    g.font = `${u * 3.2}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';   // rhythm, music
    for (const [x, word] of [[.135, 'リズム'], [.865, '音楽']]) [...word].forEach((ch, i) => {
      g.fillStyle = 'rgba(255,113,206,.85)'; g.fillText(ch, W * x + u * .3, hz * .3 + i * u * 4 + u * .25);
      g.fillStyle = 'rgba(200,250,255,.95)'; g.fillText(ch, W * x, hz * .3 + i * u * 4);
    });
  },
  live(g, f) {   // the grid floor: lines to the vanishing point, and rows rolling in
    const { W, H, hz, cx, time: T } = f, u = H / 100;
    g.strokeStyle = `rgba(255,113,206,${.3 + .2 * f.pulse})`; g.lineWidth = f.d; g.beginPath();
    for (let i = -16; i <= 16; i++) { g.moveTo(cx + i * u * 1.1, hz); g.lineTo(cx + i * W * .22, H); }
    for (let k = 0; k < 14; k++) { const y = hz + ((k + (T * .6) % 1) / 14) ** 2.2 * (H - hz); g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
  },
  road(g, f) {
    f.quad(0, 4); g.fillStyle = 'rgba(20,6,60,.74)'; g.fill();
    g.strokeStyle = 'rgba(255,113,206,.5)';
    f.rows(.125, (r) => { const a = f.at(0, r), b = f.at(4, r); g.lineWidth = Math.max(1, 2 * f.d * a[2]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
    edges(g, f, 'rgba(255,113,206,.6)', '#01cdfe', '#01cdfe');
  },
  block(g, S, [light, mid, dark], wide) {   // a cut gem
    const w = wide ? S * 2 : S, cx = w / 2, cy = S / 2, a = S * .4, b = wide ? S * .88 : a, c = a * .55;
    const out = [[cx - b, cy], [cx - b + c, cy - a], [cx + b - c, cy - a], [cx + b, cy], [cx + b - c, cy + a], [cx - b + c, cy + a]];
    const inn = out.map(([x, y]) => [cx + (x - cx) * (wide ? .8 : .56), cy + (y - cy) * .56]);
    g.shadowColor = mid; g.shadowBlur = S * .12;
    poly(g, out); g.fillStyle = lin(g, cx - b, cy - a, cx + b, cy + a, light, mid, dark); g.fill(); g.shadowBlur = 0;
    out.forEach((p, i) => { const q = out[(i + 1) % 6]; poly(g, [p, q, inn[(i + 1) % 6], inn[i]]); g.fillStyle = `rgba(255,255,255,${[.42, .22, .06, .0, .1, .3][i]})`; g.fill(); });
    poly(g, inn); g.fillStyle = lin(g, 0, cy - a * .56, 0, cy + a * .56, '#ffffff', light, mid); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = S * .018; g.lineJoin = 'round';
    poly(g, out); g.stroke(); poly(g, inn); g.stroke(); out.forEach((p, i) => { g.beginPath(); g.moveTo(...p); g.lineTo(...inn[i]); g.stroke(); });
    if (wide) arrows(g, cx, cy, S * .2, dark);
  },
  spark(g, s) { poly(g, [[0, -s * 1.6], [s * 1.4, s], [-s * 1.4, s]]); g.fill(); },
  post(g, f) {
    scan(g, f, .16);
    const y = ((f.time * .11) % 1.3 - .15) * f.H;   // the tape's tracking drifts down the picture
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, y, f.W, f.H * .035); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, y, f.W, f.d); g.fillRect(0, y + f.H * .035, f.W, f.d);
    if (f.miss) slip(g, f, 3, 40);
    shade(g, f, '20,0,50', .6);
  },
  sound(tone, burst, hz, kind, pan) { tone(hz, 0, .38, { type: 'triangle', gain: .2, to: hz * .96, pan }); tone(hz * 2.005, 0, .3, { gain: .07, pan }); burst(0, kind === 1 ? .16 : .07, 2400, .1, 'highpass'); },
};

/* ---------- Baroque Keep: a red runner down a candlelit nave, to a rose window ---------- */
function rose(g, x, y, r) {
  const glass = ['#c2182f', '#1f4fb0', '#e8b23f', '#1c8a55', '#7a2aa8'], at = (a, q) => [Math.cos(a) * q, Math.sin(a) * q];
  g.save(); g.translate(x, y);
  g.fillStyle = '#0a0506'; g.beginPath(); g.arc(0, 0, r * 1.1, 0, TAU); g.fill();
  g.lineWidth = r * .028; g.strokeStyle = '#0a0506';
  [[8, .14, .44], [16, .44, .73], [24, .73, 1]].forEach(([n, r0, r1], ring) => {
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2;
      g.beginPath(); g.moveTo(...at(a0, r * r0)); g.quadraticCurveTo(...at(a0, r * r1), ...at(am, r * r1)); g.quadraticCurveTo(...at(a1, r * r1), ...at(a1, r * r0)); g.closePath();
      g.fillStyle = glass[(i * (ring + 2) + ring) % 5]; g.fill(); g.stroke();
    }
  });
  g.fillStyle = '#f0c055'; g.beginPath(); g.arc(0, 0, r * .14, 0, TAU); g.fill(); g.stroke();
  g.globalCompositeOperation = 'lighter'; g.fillStyle = rad(g, 0, 0, r, 'rgba(255,225,170,.5)', 'rgba(255,150,80,.12)', 'rgba(255,120,60,0)'); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.restore();
  g.strokeStyle = '#3a2622'; g.lineWidth = r * .09; g.beginPath(); g.arc(x, y, r * 1.06, 0, TAU); g.stroke();
}
const ogive = (g, x, base, hw, spring, apex) => { g.beginPath(); g.moveTo(x - hw, base); g.lineTo(x - hw, spring); g.quadraticCurveTo(x - hw, apex + (spring - apex) * .25, x, apex); g.quadraticCurveTo(x + hw, apex + (spring - apex) * .25, x + hw, spring); g.lineTo(x + hw, base); };   // a pointed arch
function chandelier(g, x, y, s, T, heat) {
  g.strokeStyle = '#0e0908'; g.lineWidth = s * .09; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y - s * .55);
  for (const a of [-1, 1]) { g.moveTo(x, y - s * .55); g.lineTo(x + a * s, y); }
  g.stroke(); g.lineWidth = s * .13; g.beginPath(); g.ellipse(x, y, s, s * .22, 0, 0, TAU); g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + .3, px = x + Math.cos(a) * s, py = y + Math.sin(a) * s * .22, fl = s * (.2 + .05 * Math.sin(T * 11 + i * 2.1) + heat * .14);
    g.fillStyle = '#e8dcc0'; g.fillRect(px - s * .035, py - s * .22, s * .07, s * .22);
    g.globalCompositeOperation = 'lighter'; blob(g, px, py - s * .3, fl * 3.2, '255,170,70', .5); blob(g, px, py - s * .3, fl, '255,240,190', 1); g.globalCompositeOperation = 'source-over';
  }
}
function bat(g, s, flap) {
  g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(-s * .5, -s * flap, 0, -s * .1); g.quadraticCurveTo(s * .5, -s * flap, s, 0);
  g.quadraticCurveTo(s * .55, s * .25, s * .3, s * .1); g.quadraticCurveTo(0, s * .45, -s * .3, s * .1); g.quadraticCurveTo(-s * .55, s * .25, -s, 0); g.fill();
}
const baroque = {
  hands: [['#ffb3bd', '#d81e3a', '#6d0a1a'], ['#fff0b8', '#f0c055', '#8a6414']],
  shade: 'rgba(0,0,0,.6)', fall: -.35, ride: [1.3, .7, 1.6],
  sky(g, f) {
    const { W, H, hz, cx } = f, u = H / 100, ry = hz - u * 13, rr = u * 10, span = Math.max(W * .5, u * 55);
    g.fillStyle = lin(g, 0, 0, 0, H, '#050203', '#150809', '#1d0c0c', '#0a0405'); g.fillRect(0, 0, W, H);
    g.fillStyle = rad(g, cx, ry, rr * 3.4, 'rgba(255,170,90,.55)', 'rgba(200,60,40,.18)', 'rgba(120,20,20,0)'); g.fillRect(0, 0, W, H);
    rose(g, cx, ry, rr);
    for (const s of [-1, 1]) {   // a lancet window either side of it
      const x = cx + s * rr * 1.72, hw = rr * .36, base = ry + rr * .95, top = ry - rr * .75;
      g.save(); ogive(g, x, base, hw, top + rr * .5, top); g.closePath(); g.fillStyle = '#0a0506'; g.fill(); g.clip();
      for (let k = 0; k < 9; k++) { g.fillStyle = ['#1f4fb0', '#c2182f', '#e8b23f', '#1c8a55'][k % 4]; g.globalAlpha = .85; g.fillRect(x - hw + rr * .06, top + k * rr * .2, hw * 2 - rr * .12, rr * .17); }
      g.globalAlpha = 1; g.strokeStyle = '#0a0506'; g.lineWidth = rr * .03; g.beginPath(); g.moveTo(x, top); g.lineTo(x, base); g.stroke(); g.restore();
    }
    for (let i = 5; i >= 0; i--) {   // the nave: pointed arches stepping back, the far ones lit by the glass
      const k = 1 / (1 + i * .6), hw = span * k * 1.02, lit = i / 5;
      ogive(g, cx, hz + (H - hz) * k * 1.05, hw, hz - u * 30 * k, hz - u * 100 * k);
      g.strokeStyle = `rgb(${46 + lit * 52},${28 + lit * 26},${24 + lit * 16})`; g.lineWidth = u * 6.5 * k; g.stroke();
      g.strokeStyle = `rgba(255,${160 + lit * 50},120,${.22 + lit * .3})`; g.lineWidth = u * 1.3 * k; g.stroke();
    }
    g.fillStyle = lin(g, 0, hz, 0, H, 'rgba(60,24,18,.9)', 'rgba(14,6,6,.95)'); g.fillRect(0, hz, W, H - hz);   // the stone floor, and the window's light lying on it
    g.fillStyle = rad(g, cx, hz, u * 34, 'rgba(255,150,80,.35)', 'rgba(255,120,60,0)'); g.fillRect(0, hz, W, H - hz);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = Math.max(1, u * .08);   // cobwebs in the corners
    for (const s of [0, 1]) { const ox = s * W, dir = s ? -1 : 1; for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(ox, 0); g.lineTo(ox + dir * Math.cos(k * .26) * u * 22, Math.sin(k * .26) * u * 22); g.stroke(); } for (let q = 1; q < 5; q++) { g.beginPath(); g.arc(ox, 0, u * q * 5, s ? Math.PI / 2 : 0, s ? Math.PI : Math.PI / 2); g.stroke(); } }
  },
  live(g, f) {
    const { W, H, hz, cx, time: T } = f, u = H / 100;
    g.globalCompositeOperation = 'lighter';
    for (let i = -2; i <= 2; i++) {   // light from the rose window falls down the nave
      g.fillStyle = lin(g, 0, hz - u * 13, 0, H, `rgba(255,${150 + i * 22},90,${.07 + .06 * f.pulse + .05 * f.energy})`, 'rgba(255,120,60,0)');
      poly(g, [[cx + i * u * 2.2, hz - u * 13], [cx + i * u * 22 - u * 7, H], [cx + i * u * 22 + u * 7, H]]); g.fill();
    }
    for (let i = 0; i < 44; i++) {   // and dust turns in it
      g.fillStyle = `rgba(255,214,140,${.22 + .22 * Math.sin(T * 2 + i * 1.7)})`;
      g.fillRect(cx + Math.sin(i * 12.9898) * W * .3 + Math.sin(T * .2 + i) * u * 2, hz - u * 10 + ((i * .137 + T * .012 * (1 + i % 3)) % 1) * (H - hz + u * 10), u * .24, u * .24);
    }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 3; i++) blob(g, cx + Math.sin(T * .1 + i * 2) * W * .3, hz + u * (5 + i * 9), u * 26, '190,170,160', .05);   // mist on the floor
    const far = Math.max(W * .5, u * 55);
    for (const [x, y, s, ph] of [[-.2, .56, 3.2, 0], [.2, .56, 3.2, 2], [-.42, .78, 6.5, 4], [.42, .78, 6.5, 1]]) chandelier(g, cx + x * far + Math.sin(T * .8 + ph) * u * s * .12, hz * y, u * s, T, f.energy + f.pulse * .5);
    if (f.missAge < 1.6 && !f.calm) {   // a missed note startles the bats
      g.fillStyle = '#050203';
      for (let i = 0; i < 4; i++) { g.save(); g.translate(W * (1.1 - f.missAge / 1.6 * 1.3) + i * u * 9, hz * (.25 + i * .13) + Math.sin(T * 6 + i) * u * 2); bat(g, u * (2 + i % 2), Math.sin(T * 22 + i) * .9); g.restore(); }
    }
  },
  road(g, f) {
    f.quad(0, 4); g.fillStyle = lin(g, 0, f.hz, 0, f.H, '#3d060d', '#7c0f1c', '#a01828'); g.fill();   // the runner
    for (const u of [.12, 3.88]) { f.line(u); g.strokeStyle = '#d7a93f'; g.lineWidth = 2 * f.d; g.stroke(); }
    for (const u of [0, 4]) { f.line(u); g.strokeStyle = '#8a6414'; g.lineWidth = 4 * f.d; g.stroke(); }
    g.fillStyle = '#f0c055';   // gold lozenges woven down both borders
    f.rows(.14, (r) => { for (const u of [.06, 3.94]) { const [x, y, k] = f.at(u, r), s = 5 * f.d * k; poly(g, [[x, y - s * 1.5 * f.lie], [x + s, y], [x, y + s * 1.5 * f.lie], [x - s, y]]); g.fill(); } });
    g.strokeStyle = '#d9b45a'; g.lineWidth = 1.5 * f.d;   // three gold strings, and the ones beside a struck note ring
    for (let i = 1; i < 4; i++) {
      const ring = Math.max(f.lit[i - 1], f.lit[i]) * 4 * f.d * Math.sin(f.now / 18);
      g.beginPath(); for (let k = 0; k <= 10; k++) { const p = f.at(i, f.mid(k / 10)); g.lineTo(p[0] + ring * Math.sin(Math.PI * k / 10), p[1]); } g.stroke();
    }
  },
  block(g, S, [light, mid, dark], wide) {
    if (wide) {   // a sword, pointing the way to sweep
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = S * .06;
      poly(g, [[S * .5, S * .42], [S * 1.72, S * .44], [S * 1.92, S * .5], [S * 1.72, S * .56], [S * .5, S * .58]]); g.fillStyle = lin(g, 0, S * .42, 0, S * .58, '#ffffff', '#b9c0c9', '#6b7480'); g.fill();
      g.fillStyle = lin(g, 0, S * .2, 0, S * .8, '#fff0b8', '#f0c055', '#8a6414'); round(g, S * .42, S * .2, S * .1, S * .6, S * .04); g.fill();
      g.fillStyle = mid; g.fillRect(S * .18, S * .44, S * .25, S * .12); g.fillStyle = '#f0c055'; g.beginPath(); g.arc(S * .14, S * .5, S * .09, 0, TAU); g.fill();
      g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = S * .012; g.beginPath(); g.moveTo(S * .52, S * .5); g.lineTo(S * 1.86, S * .5); g.stroke();
      return;
    }
    const cx = S / 2, cy = S / 2, hx = S * .34, hy = S * .44;   // a pane of stained glass, leaded and framed in gold
    const pane = (k) => { g.beginPath(); g.moveTo(cx, cy - hy * k); g.quadraticCurveTo(cx + hx * k, cy - hy * k * .45, cx + hx * k, cy); g.quadraticCurveTo(cx + hx * k, cy + hy * k * .45, cx, cy + hy * k); g.quadraticCurveTo(cx - hx * k, cy + hy * k * .45, cx - hx * k, cy); g.quadraticCurveTo(cx - hx * k, cy - hy * k * .45, cx, cy - hy * k); };
    g.shadowColor = mid; g.shadowBlur = S * .14;
    pane(1); g.fillStyle = rad(g, cx - hx * .3, cy - hy * .35, hy * 1.3, light, mid, dark); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = 'rgba(10,5,6,.85)'; g.lineWidth = S * .025;
    g.beginPath(); g.moveTo(cx, cy - hy); g.lineTo(cx, cy + hy); g.moveTo(cx - hx, cy); g.lineTo(cx + hx, cy); g.stroke(); pane(.52); g.stroke();
    pane(.52); g.fillStyle = 'rgba(255,255,255,.28)'; g.fill();
    pane(1); g.strokeStyle = '#3d2a08'; g.lineWidth = S * .085; g.stroke(); g.strokeStyle = lin(g, 0, cy - hy, 0, cy + hy, '#fff0b8', '#f0c055', '#a87a1c'); g.lineWidth = S * .055; g.stroke();
  },
  spark(g, s) { poly(g, [[0, -s * 2.4], [s * .5, -s * .5], [s * 2.4, 0], [s * .5, s * .5], [0, s * 2.4], [-s * .5, s * .5], [-s * 2.4, 0], [-s * .5, -s * .5]]); g.fill(); },
  post(g, f) { shade(g, f, '0,0,0', .85); },
  snap(g, f) { shade(g, f, '150,8,26', .3 * f.snap); },   // the dark closes in red
  sound(tone, burst, hz, kind, pan) { tone(hz, 0, .32, { type: 'sawtooth', gain: .11, pan }); tone(hz * 2, 0, .12, { type: 'square', gain: .045, pan }); burst(0, .02, 5000, .08, 'highpass'); if (kind === 1) tone(hz * 1.5, .05, .3, { type: 'sawtooth', gain: .07, pan }); },
};

/* ---------- Ghost Net: a wet street under signs, in amber haze ---------- */
function sign(g, x, y, s, R) {   // a neon sign in writing nobody reads
  const c = ['#19f7ff', '#ff2bd6', '#fcee0a'][Math.floor(R() * 3)];
  g.save(); g.strokeStyle = c; g.shadowColor = c; g.shadowBlur = s * 1.2; g.lineWidth = Math.max(1, s * .14); g.lineCap = 'square';
  g.strokeRect(x, y, s * 1.6, s * 4.7);
  for (let k = 0; k < 3; k++) { g.beginPath(); for (let j = 0; j < 5; j++) { g.moveTo(x + s * .3 + Math.floor(R() * 3) * s * .5, y + s * (.4 + k * 1.45) + Math.floor(R() * 3) * s * .5); g.lineTo(x + s * .3 + Math.floor(R() * 3) * s * .5, y + s * (.4 + k * 1.45) + Math.floor(R() * 3) * s * .5); } g.stroke(); }
  g.restore();
}
const ghost = {
  hands: [['#c9fdff', '#19f7ff', '#0a7f8c'], ['#ffd0f6', '#ff2bd6', '#8a0f72']],
  shade: 'rgba(25,247,255,.35)', fall: 0, ride: [.9, .85, 1.2],
  sky(g, f) {
    const { W, H, hz, cx } = f, R = rnd(23), u = H / 100;
    g.fillStyle = lin(g, 0, 0, 0, hz, '#020405', '#07100f', '#2a2208', '#7a5a12'); g.fillRect(0, 0, W, hz);   // toxic amber, thickest at the horizon
    g.fillStyle = rad(g, cx, hz, Math.max(W * .5, u * 60), 'rgba(255,190,60,.4)', 'rgba(255,190,60,0)'); g.fillRect(0, 0, W, hz);
    poly(g, [[cx - u * 3.2, hz], [cx - u * 1.1, hz - u * 24], [cx + u * 1.1, hz - u * 24], [cx + u * 3.2, hz]]); g.fillStyle = '#0b0e0c'; g.fill();   // the tower everything answers to
    for (let k = 1; k < 9; k++) { g.fillStyle = k % 3 ? 'rgba(255,190,90,.35)' : 'rgba(255,60,60,.9)'; g.fillRect(cx - u * (1 + k * .22), hz - u * (25 - k * 2.8), u * (2 + k * .44), Math.max(1, u * .15)); }
    for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {   // brutalist blocks closing in, signs hung on them
      const w = u * (7 + i * 2.4), h = u * (15 + i * 9 + R() * 14), x0 = cx + s * (u * 7 + i * Math.max(W * .06, u * 5.5) + R() * u * 2), x = s > 0 ? x0 : x0 - w;
      g.fillStyle = `rgb(${44 - i * 5},${34 - i * 3},${14 + i})`; g.fillRect(x, hz - h, w, h + 2);   // the far ones are lost in the haze
      for (let j = 0; j < 30; j++) if (R() < .5) { g.fillStyle = R() < .7 ? 'rgba(255,190,90,.5)' : 'rgba(25,247,255,.6)'; g.fillRect(x + R() * (w - u), hz - h + R() * h * .92, u * .55, u * .3); }
      if (i > 1) sign(g, x + w * (s > 0 ? .1 : .45), hz * (.3 + R() * .3), u * (1.1 + i * .34), R);
    }
    g.globalCompositeOperation = 'lighter'; g.fillStyle = rad(g, cx, hz, Math.max(W * .42, u * 55), 'rgba(255,180,50,.3)', 'rgba(255,180,50,0)'); g.fillRect(0, 0, W, hz); g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#000'; g.lineWidth = Math.max(1, u * .22);   // cables slung across the street
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, hz * (.08 + k * .11)); g.quadraticCurveTo(cx, hz * (.34 + k * .13), W, hz * (.03 + k * .14)); g.stroke(); }
    g.fillStyle = lin(g, 0, hz, 0, H, '#1a1405', '#050707', '#020303'); g.fillRect(0, hz, W, H - hz);   // wet street, the signs running down it
    for (let i = 0; i < 18; i++) { const c = R() < .5 ? '25,247,255' : '255,43,214', x = R() * W; g.fillStyle = lin(g, 0, hz, 0, hz + (H - hz) * (.3 + R() * .6), `rgba(${c},.24)`, `rgba(${c},0)`); g.fillRect(x, hz, u * (1 + R() * 3), H - hz); }
  },
  live(g, f) {
    const { W, H, hz, cx, time: T, d } = f, u = H / 100, r = u * (6 + f.energy * 2.5), y = hz - u * 10, sp = T * (.6 + f.energy);
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(25,247,255,${.45 + .35 * f.pulse})`; g.lineWidth = d * 1.5;   // a hologram turning over the far end of the road
    const ring = [0, 1, 2, 3].map((i) => [cx + Math.cos(sp + i * Math.PI / 2) * r, y + Math.sin(sp + i * Math.PI / 2) * r * .32]);
    g.beginPath(); ring.forEach(([x1, y1], i) => { const [x2, y2] = ring[(i + 1) % 4]; g.moveTo(x1, y1); g.lineTo(x2, y2); g.moveTo(cx, y - r * 1.25); g.lineTo(x1, y1); g.lineTo(cx, y + r * 1.25); }); g.stroke();
    g.fillStyle = 'rgba(25,247,255,.5)'; g.fillRect(cx - r, y - r * 1.25 + ((T * .5) % 1) * r * 2.5, r * 2, d);
    for (let i = 0; i < 6; i++) blob(g, cx + (i % 2 ? 1 : -1) * (f.lane * 2.8 + u * 4), H * .95 - ((i * .31 + T * .07) % 1) * u * 40, u * (5 + i * 2), '210,230,220', .05);   // steam from the vents
    g.restore();
    rain(g, f, 100, 'rgba(160,255,250,.3)', .18, 1.6);
  },
  road(g, f) {
    f.quad(0, 4); g.fillStyle = 'rgba(2,8,9,.84)'; g.fill();
    edges(g, f, 'rgba(255,43,214,.55)', '#19f7ff', '#19f7ff');
    g.strokeStyle = '#eaffff'; g.lineCap = 'round';   // data running in along the lane lines
    f.rows(.31, (r) => { for (let i = 0; i <= 4; i++) { const p = f.at(i, r), q = f.at(i, r + .035); g.lineWidth = 2.5 * f.d * p[2]; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); } });
  },
  block(g, S, [light, mid, dark], wide) {   // a chip: a neon hexagon with its traces showing
    const w = wide ? S * 2 : S, cx = w / 2, cy = S / 2, a = S * .4, b = wide ? S * .88 : S * .36;
    const hex = (k) => poly(g, [[cx - b * k, cy], [cx - (b - a * .5) * k, cy - a * k], [cx + (b - a * .5) * k, cy - a * k], [cx + b * k, cy], [cx + (b - a * .5) * k, cy + a * k], [cx - (b - a * .5) * k, cy + a * k]]);
    hex(1); g.fillStyle = 'rgba(3,10,13,.86)'; g.fill();
    g.shadowColor = mid; g.shadowBlur = S * .16; g.strokeStyle = mid; g.lineWidth = S * .05; g.lineJoin = 'round'; hex(1); g.stroke();
    g.shadowBlur = S * .05; g.strokeStyle = light; g.lineWidth = S * .018; hex(.72); g.stroke();
    g.beginPath(); for (const s of [-1, 1]) { g.moveTo(cx + s * b * .72, cy); g.lineTo(cx + s * b * .3, cy); g.lineTo(cx + s * b * .18, cy - a * .28); } g.stroke();
    g.fillStyle = light; if (wide) arrows(g, cx, cy, S * .2, light); else { g.beginPath(); g.arc(cx, cy, S * .075, 0, TAU); g.fill(); }
    g.shadowBlur = 0; g.fillStyle = `${mid}33`; for (let k = 0; k < 4; k++) g.fillRect(cx - b * .8, cy - a * .8 + k * a * .42, b * 1.6, a * .08);
  },
  spark(g, s) { g.fillRect(-s, -s, s * 2, s * 2); },
  post(g, f) {
    const { W, H, d } = f, m = Math.min(W, H) * .03, l = m * 1.6;
    scan(g, f, .13); grain(g, f, .1);
    if (f.miss) { slip(g, f, 5, 60); g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .3 * f.miss; g.drawImage(g.canvas, 7 * d, 0); g.restore(); }   // the picture splits and tears
    g.strokeStyle = 'rgba(25,247,255,.55)'; g.lineWidth = d * 1.5; g.beginPath();   // the corners of a display
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { g.moveTo(x + sx * l, y); g.lineTo(x, y); g.lineTo(x, y + sy * l); }
    g.stroke();
    shade(g, f, '0,0,0', .7);
  },
  sound(tone, burst, hz, kind, pan) { tone(hz * 2, 0, .1, { type: 'square', gain: .08, to: hz, pan }); tone(hz / 2, 0, .13, { gain: .17, pan }); burst(0, kind === 1 ? .12 : .04, 6000, .07, 'highpass'); },
};

/* ---------- Ray OS: a railway through the fields, on black and white film ---------- */
let plume = null;
const ray = {
  hands: [['#fffaf0', '#f4ecd8', '#b9ad92'], ['#5b574e', '#1d1b18', '#000000']],
  shade: 'rgba(0,0,0,.45)', fall: .7, mono: true, letters: true, ride: [.5, 1.5, .45],
  sky(g, f) {
    const { W, H, hz, cx } = f, R = rnd(41), u = H / 100;
    g.fillStyle = lin(g, 0, 0, 0, hz, '#2b2a27', '#5e5b54', '#a39e90', '#d9d3c2'); g.fillRect(0, 0, W, hz);
    for (let i = 0; i < 50; i++) { const r = u * (5 + R() * 12), v = R() < .55 ? 30 + R() * 40 : 170 + R() * 60; blob(g, R() * W, R() ** 1.6 * hz * .8, r, `${v},${v},${Math.round(v * .96)}`, .35); }   // monsoon cloud
    g.globalCompositeOperation = 'lighter';   // the sun gets through in one place
    for (let i = 0; i < 4; i++) { g.fillStyle = lin(g, 0, 0, 0, hz, 'rgba(255,250,235,.16)', 'rgba(255,250,235,0)'); poly(g, [[W * .68 + i * u * 2, 0], [W * .68 + i * u * 2 + u * 3, 0], [W * .5 + i * u * 9 + u * 6, hz], [W * .5 + i * u * 9 - u * 3, hz]]); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#3d3b36';   // the far bank: trees, a thatched roof, date palms
    for (let x = -u; x < W + u; x += u * 2.2) { const h = u * (1.2 + R() * 2.6) * (.6 + Math.abs(x / W - .5)); g.beginPath(); g.ellipse(x, hz - h * .5, u * (1.4 + R()), h, 0, 0, TAU); g.fill(); }
    poly(g, [[W * .2, hz], [W * .2 + u * 1, hz - u * 3], [W * .2 + u * 5, hz - u * 3], [W * .2 + u * 6, hz]]); g.fill();
    for (const [x, h, lean] of [[.12, 11, .1], [.16, 8, -.14], [.83, 12, -.1], [.9, 9, .16], [.66, 7, .1]]) palm(g, W * x, hz, u * h, lean, '#33312d');
    g.fillStyle = lin(g, 0, hz, 0, H, '#b8b2a0', '#8f8a7b', '#5d5a51', '#3a3833'); g.fillRect(0, hz, W, H - hz);   // paddy, and the bunds between the fields
    for (let k = 1; k < 18; k++) { g.fillStyle = `rgba(20,20,18,${.12 + .06 * (k % 2)})`; g.fillRect(0, hz + (k / 18) ** 2 * (H - hz), W, Math.max(1, u * .04 * k)); }
    g.strokeStyle = '#1a1917'; g.lineCap = 'butt';   // telegraph poles follow the line out
    let px = 0, py = 0;
    for (let i = 0; i < 7; i++) {
      const k = 1 / (1 + i * .8), x = cx + f.lane * 3.7 * k + u, base = hz + (H - hz) * .72 * k, h = u * 40 * k;
      g.lineWidth = Math.max(1, u * .7 * k); g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - h); g.moveTo(x - u * 3 * k, base - h * .93); g.lineTo(x + u * 3 * k, base - h * .93); g.stroke();
      if (i) { g.lineWidth = Math.max(1, u * .12); for (const o of [-1, 1]) { g.beginPath(); g.moveTo(px + o * u * 3 / k * k, py); g.quadraticCurveTo((px + x) / 2, (py + base - h * .93) / 2 + u * 3 * k, x + o * u * 3 * k, base - h * .93); g.stroke(); } }
      px = x; py = base - h * .93;
    }
  },
  live(g, f) {
    const { W, H, hz, cx, time: T } = f, u = H / 100, s = u * .9, x = W * (-.3 + 1.6 * f.progress), y = hz + u * .3;
    g.fillStyle = '#1b1a17';   // a steam train crosses the fields while the level plays
    g.fillRect(x, y - s * 3, s * 7, s * 2.4); g.fillRect(x, y - s * 4.4, s * 2.4, s * 1.6); g.fillRect(x + s * 5.4, y - s * 4.3, s * .8, s * 1.4);
    for (let i = 1; i <= 4; i++) g.fillRect(x - i * s * 6.6, y - s * 2.9, s * 6, s * 2.3);
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + s * (1 + i * 1.7), y - s * .6, s * .75, 0, TAU); g.fill(); }
    for (let i = 0; i < 9; i++) { const q = ((i + T * .8) % 9) / 9; blob(g, x + s * 5.8 - q * u * 17, y - s * 4.8 - q * u * 6 - Math.sin(q * 3) * u, u * (1 + q * 4.5), '40,40,38', .55 * (1 - q)); }
    if (!plume) { plume = document.createElement('canvas'); plume.width = 32; plume.height = 96; const p = plume.getContext('2d'); p.scale(.32, 1); p.fillStyle = rad(p, 50, 48, 46, 'rgba(250,246,235,.95)', 'rgba(240,235,222,.55)', 'rgba(240,235,222,0)'); p.fillRect(0, 0, 100, 96); }
    for (let i = 0; i < 46; i++) {   // kash grass at both edges, leaning with the wind
      const side = i % 2 ? 1 : -1, bx = cx + side * (Math.max(W * .5, f.lane * 2.4) - ((i * .618) % 1) * W * .2), base = H * (1.03 - (i % 5) * .012), h = u * (22 + (i * 7) % 13);
      const tx = bx - side * u * 3 + Math.sin(T * 1.4 + i) * u * (1.2 + f.energy * 2) + f.pulse * u * side, ty = base - h;
      g.strokeStyle = '#141412'; g.lineWidth = u * .22; g.beginPath(); g.moveTo(bx, base); g.quadraticCurveTo(bx - side * u, base - h * .6, tx, ty); g.stroke();
      g.save(); g.translate(tx, ty); g.rotate((tx - bx) / h * 1.2); g.drawImage(plume, -u * 1.1, -u * 6.4, u * 2.2, u * 7); g.restore();
    }
    rain(g, f, 70, 'rgba(235,232,220,.26)', .1, 1.3);
  },
  road(g, f) {
    f.quad(-.35, 4.35); g.fillStyle = lin(g, 0, f.hz, 0, f.H, '#8a857a', '#6f6b62', '#56534c'); g.fill();   // ballast
    g.strokeStyle = '#211f1c'; g.lineCap = 'butt';   // sleepers
    f.rows(.085, (r) => { const a = f.at(-.22, r), b = f.at(4.22, r); g.lineWidth = Math.max(1, 9 * f.d * a[2] * f.lie * (.4 + .6 * f.tilt)); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
    for (const u of [0, 4]) { f.line(u); g.strokeStyle = '#1a1917'; g.lineWidth = 5 * f.d; g.stroke(); g.strokeStyle = '#f1ece0'; g.lineWidth = 1.5 * f.d; g.stroke(); }   // rails, and the light along their tops
    for (let i = 1; i < 4; i++) { f.line(i); g.strokeStyle = 'rgba(244,236,216,.3)'; g.lineWidth = f.d; g.stroke(); }
  },
  block(g, S, [light, mid, dark], wide, v) {
    const ink = dark === '#000000' ? '#f4ecd8' : '#161513';
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = S * .06; g.shadowOffsetY = S * .03;
    if (wide) {   // one stroke of a brush, ending in an arrowhead
      g.beginPath(); g.moveTo(S * .12, S * .5); g.bezierCurveTo(S * .4, S * .3, S * 1.1, S * .34, S * 1.45, S * .36); g.lineTo(S * 1.42, S * .2); g.lineTo(S * 1.9, S * .5); g.lineTo(S * 1.42, S * .8); g.lineTo(S * 1.45, S * .64); g.bezierCurveTo(S * 1.1, S * .66, S * .4, S * .7, S * .12, S * .5);
      g.fillStyle = mid; g.fill(); g.shadowColor = 'transparent'; g.strokeStyle = ink; g.lineWidth = S * .03; g.lineJoin = 'round'; g.stroke();
      return;
    }
    g.fillStyle = rad(g, S * .44, S * .4, S * .52, light, mid, mid, dark); g.beginPath(); g.arc(S / 2, S / 2, S * .42, 0, TAU); g.fill();   // a paper disc with one note of the scale brushed on it: sa re ga ma pa dha ni
    g.shadowColor = 'transparent'; g.strokeStyle = ink; g.lineWidth = S * .03; g.beginPath(); g.arc(S / 2, S / 2, S * .35, 0, TAU); g.stroke();
    g.fillStyle = ink; g.font = `${S * .46}px "Tiro Bangla", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('সরগমপধন'[v], S / 2, S * .53);
  },
  spark: dot,
  post(g, f) {
    const { W, H, time: T, d } = f;
    if (f.miss) g.drawImage(g.canvas, 0, 14 * d * f.miss);   // the film slips in the gate
    grain(g, f, .34);
    g.fillStyle = 'rgba(244,236,216,.4)';   // scratches
    for (let i = 0; i < 2; i++) if (Math.sin(Math.floor(T * 3) * 13.1 + i * 2) > .1) g.fillRect((Math.sin(Math.floor(T * 3 + i * 7) * 91.7) * .5 + .5) * W, 0, d, H);
    g.fillStyle = `rgba(0,0,0,${.05 + .04 * Math.sin(T * 23)})`; g.fillRect(0, 0, W, H);   // the lamp flickers
    shade(g, f, '0,0,0', .85);
  },
  sound(tone, burst, hz, kind, pan) { tone(hz, 0, .26, { gain: .22, to: hz * .82, pan }); tone(hz * 2.4, 0, .06, { gain: .05, pan, type: 'triangle' }); burst(0, kind === 1 ? .12 : .05, 900, .16); },
};

/* ---------- Concrete Jungle: an avenue at dusk, the sun going down the end of it ---------- */
const metro = {
  hands: [['#fff3cf', '#ffc247', '#c27a0a'], ['#eafaff', '#8fdcff', '#2a7fb8']],
  shade: 'rgba(255,190,90,.3)', fall: 0, ride: [1, 1, 1.1],
  sky(g, f) {
    const { W, H, hz, cx } = f, R = rnd(57), u = H / 100, step = Math.max(W * .058, u * 5);
    g.fillStyle = lin(g, 0, 0, 0, hz, '#141c27', '#2b3a4d', '#7a6a66', '#f0a35a', '#ffd9a0'); g.fillRect(0, 0, W, hz);
    g.fillStyle = rad(g, cx, hz - u * 2, u * 46, 'rgba(255,244,214,1)', 'rgba(255,196,110,.7)', 'rgba(255,150,70,.22)', 'rgba(255,150,70,0)'); g.fillRect(0, 0, W, H);
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {   // towers either side, the face toward the sun catching it
      const w = step + u * (1 + R() * 2), h = u * (5 + i * 2.5 + R() * 9), x0 = cx + s * (u * 3 + i * step), x = s > 0 ? x0 : x0 - w, top = hz - h, v = 14 + i * 3;
      const sun = `rgb(${v + 80},${v + 48},${v + 26})`, dark = `rgb(${v + 6},${v + 10},${v + 22})`;
      g.fillStyle = lin(g, x, 0, x + w, 0, s > 0 ? sun : dark, s > 0 ? dark : sun); g.fillRect(x, top, w, h + 2);
      const cw = u * .9, ch = u * 1.25;
      for (let yy = top + u; yy < hz - u; yy += ch) for (let xx = x + cw * .5; xx < x + w - cw; xx += cw) if (R() < .42) { g.fillStyle = R() < .8 ? `rgba(255,214,140,${.35 + R() * .5})` : 'rgba(190,230,255,.6)'; g.fillRect(xx, yy, cw * .55, ch * .5); }
      g.fillStyle = dark; g.strokeStyle = dark; g.lineWidth = Math.max(1, u * .25);
      if (i === 3) { for (let k = 0; k < 3; k++) g.fillRect(x + w * (.2 + k * .1), top - u * (2 + k * 2.2), w * (.6 - k * .2), u * 2.4 * (k + 1)); g.beginPath(); g.moveTo(x + w / 2, top - u * 6); g.lineTo(x + w / 2, top - u * 15); g.stroke(); }   // a stepped spire
      if (i === 1 || i === 5) {   // a water tower on the roof
        const tx = x + w * .5, ty = top;
        g.beginPath(); for (const o of [-1, 0, 1]) { g.moveTo(tx + o * u * 1.1, ty); g.lineTo(tx + o * u * .9, ty - u * 2); } g.stroke();
        g.fillRect(tx - u * 1.4, ty - u * 4.6, u * 2.8, u * 2.8); poly(g, [[tx - u * 1.7, ty - u * 4.5], [tx, ty - u * 6.2], [tx + u * 1.7, ty - u * 4.5]]); g.fill();
      }
    }
    g.fillStyle = lin(g, 0, hz, 0, H, '#5a4636', '#23262b', '#121417'); g.fillRect(0, hz, W, H - hz);   // wet asphalt, the sun laid down the middle of it
    g.fillStyle = lin(g, 0, hz, 0, H, 'rgba(255,214,150,.8)', 'rgba(255,180,100,.2)', 'rgba(255,180,100,0)'); poly(g, [[cx - u * 3, hz], [cx + u * 3, hz], [cx + u * 18, H], [cx - u * 18, H]]); g.fill();
  },
  live(g, f) {
    const { W, H, hz, cx, time: T } = f, u = H / 100;
    g.globalCompositeOperation = 'lighter';
    blob(g, cx, hz - u * 2, u * (30 + 10 * f.pulse + 10 * f.energy), '255,200,120', .16 + .2 * f.pulse);   // glare down the canyon, breathing with the bass
    for (let i = 0; i < 10; i++) { const dir = i % 2 ? 1 : -1; blob(g, (((i * .173 + T * .03 * dir * (1 + i % 3)) % 1) + 1) % 1 * W, hz + u * (.7 + (i % 3) * .6), u * (1 + (i % 2) * .5), dir > 0 ? '255,240,200' : '255,60,40', .8); }   // cross-town traffic
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 10; i++) { const q = (i * .37 + T * .09) % 1; blob(g, cx + (i % 2 ? 1 : -1) * f.lane * 2.7 + Math.sin(T + i) * u * 2 * q, H * .94 - q * u * 36, u * (4 + q * 13), '235,235,240', .11 * (1 - q)); }   // steam from the manholes
  },
  road(g, f) {
    f.quad(0, 4); g.fillStyle = 'rgba(16,18,22,.8)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineCap = 'butt';   // lane markings passing underneath
    f.rows(.15, (r) => { for (let i = 1; i < 4; i++) { const a = f.at(i, r), b = f.at(i, Math.max(f.stop, r - .066)); g.lineWidth = 2.5 * f.d * a[2]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } });
    for (const u of [0, 4]) { f.line(u); g.strokeStyle = '#f7b500'; g.lineWidth = 3 * f.d; g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 12; i++) { f.quad(i / 3 + .06, i / 3 + .27, -.035, -.085); g.fill(); }   // a crosswalk at the line
  },
  block(g, S, [light, mid, dark], wide) {
    if (wide) {   // a taxi's checker band
      g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = S * .06; round(g, S * .1, S * .22, S * 1.8, S * .56, S * .12); g.fillStyle = lin(g, 0, S * .22, 0, S * .78, light, mid, dark); g.fill(); g.shadowBlur = 0;
      g.fillStyle = '#16171a'; for (let i = 0; i < 18; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) g.fillRect(S * .19 + i * S * .09, S * .6 + j * S * .07, S * .09, S * .07);
      arrows(g, S, S * .41, S * .17, '#16171a'); return;
    }
    const c = S / 2;   // a light coming down the avenue: a hot core, a halo, a flare across the lens
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rad(g, c, c, S * .5, '#ffffff', mid, `${mid}66`, `${mid}22`, `${mid}00`); g.fillRect(0, 0, S, S);
    g.fillStyle = `${light}cc`; poly(g, [[0, c], [c, c - S * .028], [S, c], [c, c + S * .028]]); g.fill(); poly(g, [[c, S * .1], [c + S * .022, c], [c, S * .9], [c - S * .022, c]]); g.fill();
    g.strokeStyle = `${mid}77`; g.lineWidth = S * .02; poly(g, Array.from({ length: 6 }, (_, i) => [c + Math.cos(i * 1.0472) * S * .34, c + Math.sin(i * 1.0472) * S * .34])); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(c, c, S * .13, 0, TAU); g.fill();
  },
  spark(g, s) { g.globalAlpha *= .6; g.beginPath(); g.arc(0, 0, s * 2.2, 0, TAU); g.fill(); g.lineWidth = s * .3; g.stroke(); },
  post(g, f) { grain(g, f, .14); shade(g, f, '4,6,12', .75); },
  snap(g, f) { const u = f.H / 100; g.globalCompositeOperation = 'lighter'; g.fillStyle = lin(g, 0, 0, f.W, 0, 'rgba(255,220,160,0)', `rgba(255,220,160,${.55 * f.snap})`, 'rgba(255,220,160,0)'); g.fillRect(0, f.hz - u * 3.2, f.W, u * 2.4); },   // the sun flares across the lens
  sound(tone, burst, hz, kind, pan) { burst(0, kind === 1 ? .1 : .03, 5200, .14, 'highpass'); tone(hz / 2, 0, .2, { type: 'triangle', gain: .22, pan }); tone(hz, 0, .08, { gain: .06, pan }); },
};

export const WORLDS = { aero, vapor, baroque, ghost, ray, metro };

// A block's picture, drawn once and kept: by OS, by hand (left or right), by kind (a block, or a sweep twice as wide).
const SIZE = 160, kept = {};
export function sprite(id, hand, kind, v = 0) {
  const w = WORLDS[id], wide = kind > 0, key = `${id}${hand}${+wide}${w.letters && !wide ? v % 7 : 0}`;
  if (kept[key]) return kept[key];
  const c = document.createElement('canvas');
  c.height = SIZE; c.width = wide ? SIZE * 2 : SIZE;
  w.block(c.getContext('2d'), SIZE, w.hands[hand], wide, v % 7);
  return (kept[key] = c);
}
document.fonts?.ready.then(() => { for (const key in kept) if (key.startsWith('ray')) delete kept[key]; });
// Each world has its own bomb, drawn in VectorCraft (sources in _dev/bombs, exported to assets/beats/bombs). In every drawing
// the fuse or beacon ends at the same spot, top right, which is where the game burns its spark. A picture is kept once it loads.
const balls = {};
export function bomb(id) {
  const b = balls[id] ||= { img: Object.assign(new Image(), { src: `assets/beats/bombs/${id}.svg` }), c: null };
  if (!b.c && b.img.complete && b.img.naturalWidth) {
    b.c = document.createElement('canvas'); b.c.width = b.c.height = 320;
    b.c.getContext('2d').drawImage(b.img, 0, 0, 320, 320);
  }
  return b.c;
}
