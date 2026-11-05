// PAINT.EXE: doodle with her colors and the tools from her proudest piece, coffee wash and a pen.
import { track } from './analytics.js';

// Sampled from her paintings, not chosen from a palette.
const COLORS = [["#1c1c18", "Eye ink"], ["#e0c669", "Sunset gold"], ["#d09573", "Sunset coral"], ["#3c6db7", "Sunset sky"], ["#dbc148", "Sunflower"], ["#97a960", "Sunflower leaf"], ["#c44641", "Jersey red"], ["#345b8f", "Sneaker blue"], ["#cc6784", "Lily pink"], ["#c97347", "Cloth orange"], ["#323757", "Night indigo"], ["#816c8e", "Rain violet"], ["#d0aa78", "City fire"], ["#d1b578", "Field straw"], ["#734e86", "Basket purple"], ["#8f463e", "Apple red"]];
const PAPER = '#fbf8f1';
const W = 1280, H = 800;
const $ = (id) => document.getElementById(id);
let canvas, g, tool = 'pen', color = '#17151a', drawing = false, last = null, mid = null, undo = [], ready = false, layer, layerG, grain, wash = [], started = false;

// Coffee behaves like a wash: flat and even inside one stroke, with grain and a darker dried edge.
function makeCoffee() {
  const n = document.createElement('canvas'); n.width = n.height = 256;
  const x = n.getContext('2d'), img = x.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 26;
    img.data[i] = 138 + v; img.data[i + 1] = 92 + v * .8; img.data[i + 2] = 46 + v * .55; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  layer = document.createElement('canvas'); layer.width = W; layer.height = H;
  layerG = layer.getContext('2d');
  grain = layerG.createPattern(n, 'repeat');
}
function trace(x) {
  x.beginPath();
  x.moveTo(wash[0][0], wash[0][1]);
  for (let i = 1; i < wash.length - 1; i++) x.quadraticCurveTo(wash[i][0], wash[i][1], (wash[i][0] + wash[i + 1][0]) / 2, (wash[i][1] + wash[i + 1][1]) / 2);
  const end = wash[wash.length - 1];
  x.lineTo(end[0], end[1]);
  x.stroke();
}
function renderWash() {
  const x = layerG;
  x.lineCap = x.lineJoin = 'round';
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, W, H);
  x.strokeStyle = grain; x.lineWidth = 96; trace(x);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.drawImage(undo[undo.length - 1], 0, 0);
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = .44;
  g.drawImage(layer, 0, 0);
  x.clearRect(0, 0, W, H);
  x.strokeStyle = '#6b4018'; trace(x);
  x.globalCompositeOperation = 'destination-out'; x.lineWidth = 89; trace(x);
  g.globalAlpha = .34;
  g.drawImage(layer, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
function remember() {
  const snap = document.createElement('canvas'); snap.width = W; snap.height = H;
  snap.getContext('2d').drawImage(canvas, 0, 0);
  undo.push(snap); if (undo.length > 12) undo.shift();
}
function line(a, c, b, width, style) {
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = style; g.lineWidth = width; g.lineCap = g.lineJoin = 'round';
  g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1], b[0], b[1]); g.stroke();
}
function draw(p, speed) {
  const m = [(last[0] + p[0]) / 2, (last[1] + p[1]) / 2];
  if (tool === 'pen') line(mid, last, m, Math.max(2.2, 4.4 - speed * .05), color);
  else if (tool === 'brush') line(mid, last, m, 20, color);
  else if (tool === 'erase') line(mid, last, m, 34, PAPER);
  else { wash.push(p); renderWash(); }
  mid = m; last = p;
}
function clear() { g.globalCompositeOperation = 'source-over'; g.fillStyle = PAPER; g.fillRect(0, 0, W, H); }

export function init() {
  if (ready) return;
  ready = true;
  canvas = $('pt-canvas'); canvas.width = W; canvas.height = H;
  g = canvas.getContext('2d', { willReadFrequently: false });
  makeCoffee();
  clear();

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    remember();
    canvas.setPointerCapture(e.pointerId);
    drawing = true; last = mid = pos(e); wash = [last];
    draw([last[0] + .1, last[1] + .1], 0);
    if (!started) { started = true; track('paint_start'); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const coalesced = e.getCoalescedEvents?.();
    for (const ev of coalesced?.length ? coalesced : [e]) { const p = pos(ev); draw(p, Math.hypot(p[0] - last[0], p[1] - last[1])); }
  });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  document.querySelectorAll('.tool[data-tool]').forEach((b) => b.addEventListener('click', () => {
    tool = b.dataset.tool;
    document.querySelectorAll('.tool[data-tool]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  }));
  $('pt-undo').addEventListener('click', () => { const s = undo.pop(); if (s) { g.globalCompositeOperation = 'source-over'; g.drawImage(s, 0, 0); } });
  $('pt-clear').addEventListener('click', () => { remember(); clear(); });
  $('pt-save').addEventListener('click', () => {
    canvas.toBlob((blob) => {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'my-doodle-on-tahsin-os.png' });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      track('paint_save');
    });
  });

  const box = $('pt-colors');
  COLORS.forEach(([hex, name], i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.style.background = hex; b.title = name;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name); b.setAttribute('aria-checked', String(i === 0)); b.tabIndex = i ? -1 : 0;
    b.addEventListener('click', () => {
      color = hex;
      if (tool === 'erase' || tool === 'coffee') $('pt-root').querySelector('[data-tool=pen]').click();
      box.querySelectorAll('.swatch').forEach((o) => { o.setAttribute('aria-checked', String(o === b)); o.tabIndex = o === b ? 0 : -1; });
    });
    box.append(b);
  });
  box.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const s = [...box.children], n = s[(s.indexOf(e.target) + d + s.length) % s.length];
    n.click(); n.focus();
  });
  if (COLORS[0]) color = COLORS[0][0];
}
