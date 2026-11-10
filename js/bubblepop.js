// BUBBLE_POP.EXE: pop groups of matching bubbles. Calm, no timer, like a console's home menu.
import { sfx } from './audio.js';
import { track } from './analytics.js';
import { once } from './clock.js';

const COLS = 9, ROWS = 10, CELL = 40;
const HUES = [['#d4f6ff', '#27a4ec', '#07458f'], ['#e4ffc4', '#55c236', '#14691f'], ['#fff3b0', '#f7b91f', '#a45f06'], ['#ffd2ef', '#e54db2', '#8c0f66'], ['#e6dcff', '#8a66e8', '#3e1f9c']];
const $ = (id) => document.getElementById(id);
let g, canvas, board, score, best, cursor, hover = [], anim = [], queued = false, ready = false;

const NAMES = ['blue', 'green', 'gold', 'pink', 'purple'];
const say = (pre = '') => {
  const b = cell(...cursor), n = hover.length;
  $('bp-msg').textContent = `${pre}Column ${cursor[0] + 1}, row ${cursor[1] + 1}: ${b ? NAMES[b.hue] + (n ? `, group of ${n}, worth ${n * (n - 1)}` : ', no group') : 'empty'}.`;
};
function sprites() {
  return HUES.map(([a, b, c], i) => {
    const s = document.createElement('canvas'); s.width = s.height = CELL * 2;
    const x = s.getContext('2d'), r = CELL * .92;
    const body = x.createRadialGradient(CELL * .8, CELL * .66, 2, CELL, CELL, r);
    body.addColorStop(0, a); body.addColorStop(.55, b); body.addColorStop(1, c);
    x.fillStyle = body; x.beginPath(); x.arc(CELL, CELL, r, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.ellipse(CELL * .72, CELL * .56, r * .3, r * .17, -.6, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.ellipse(CELL * 1.2, CELL * 1.4, r * .25, r * .12, -.6, 0, 7); x.fill();
    x.fillStyle = 'rgba(0,0,0,.38)'; x.font = '700 28px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';   // shape as well as color
    x.fillText('●▲■◆★'[i], CELL, CELL * 1.08);
    return s;
  });
}
let imgs;

const cell = (c, r) => board[c]?.[r];
function group(c, r) {
  const start = cell(c, r);
  if (!start) return [];
  const seen = new Set(), stack = [[c, r]], out = [];
  while (stack.length) {
    const [x, y] = stack.pop(), k = `${x},${y}`;
    if (seen.has(k) || cell(x, y)?.hue !== start.hue) continue;
    seen.add(k); out.push([x, y]);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return out;
}
const hasMoves = () => board.some((col, c) => col.some((b, r) => b && group(c, r).length > 1));

function newGame() {
  board = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => ({ hue: Math.floor(Math.random() * HUES.length), y: 0, x: 0, s: 1 })));
  score = 0; cursor = [4, 5]; hover = []; anim = [];
  $('bp-msg').textContent = 'Pop groups of two or more. Bigger groups score more.';
  hud(0); kick();
}
function hud(move) {
  $('bp-score').textContent = score; $('bp-move').textContent = move; $('bp-best').textContent = best;
}

function pop(c, r) {
  const grp = group(c, r);
  if (grp.length < 2) return;
  const gain = grp.length * (grp.length - 1);
  score += gain;
  for (const [x, y] of grp) { anim.push({ x, y, hue: board[x][y].hue, t: 0 }); board[x][y] = null; }
  // Gravity pulls down each column, and empty columns close up toward the left.
  board = board.map((col, x) => {
    const left = col.filter(Boolean);
    const out = Array(ROWS).fill(null);
    let row = ROWS - 1;
    for (let i = left.length - 1; i >= 0; i--, row--) {
      const b = left[i], from = col.indexOf(b);
      b.y = (from - row) * CELL + b.y;
      out[row] = b;
    }
    return out;
  });
  const filled = board.filter((col) => col.some(Boolean));
  filled.forEach((col, i) => { const from = board.indexOf(col); col.forEach((b) => { if (b) b.x += (from - i) * CELL; }); });
  while (filled.length < COLS) filled.push(Array(ROWS).fill(null));
  board = filled;
  sfx.popBig(grp.length);
  hover = [];
  hud(gain);
  if (!hasMoves()) finish();
  kick();
}
function finish() {
  const left = board.flat().filter(Boolean).length;
  if (!left) score += 500;
  if (score > best) { best = score; try { localStorage.setItem('tahsin.bubblepop', best); } catch { /* fine */ } }
  $('bp-msg').textContent = left ? `No more pops. Final score ${score}.` : `Board cleared, ${score} points.`;
  hud(0);
  track('game_score', { game: 'bubble_pop', score });
}

function draw() {
  g.clearRect(0, 0, COLS * CELL, ROWS * CELL);
  const lit = new Set(hover.map(([c, r]) => `${c},${r}`));
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const b = board[c][r];
    if (!b) continue;
    const x = c * CELL + b.x, y = r * CELL + b.y, grow = lit.has(`${c},${r}`) ? 4 : 0;
    g.drawImage(imgs[b.hue], x - grow / 2, y - grow / 2, CELL + grow, CELL + grow);
  }
  for (const a of anim) {
    const k = 1 + a.t * .7;
    g.globalAlpha = 1 - a.t;
    g.drawImage(imgs[a.hue], a.x * CELL + CELL / 2 - CELL * k / 2, a.y * CELL + CELL / 2 - CELL * k / 2, CELL * k, CELL * k);
    g.globalAlpha = 1;
  }
  if (document.activeElement === canvas) {
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([5, 4]);
    g.strokeRect(cursor[0] * CELL + 2, cursor[1] * CELL + 2, CELL - 4, CELL - 4);
    g.setLineDash([]);
  }
}
function step() {
  queued = false;
  let busy = false;
  for (const col of board) for (const b of col) if (b) {
    if (Math.abs(b.y) > .5) { b.y *= .78; busy = true; } else b.y = 0;
    if (Math.abs(b.x) > .5) { b.x *= .8; busy = true; } else b.x = 0;
  }
  anim = anim.filter((a) => (a.t += .09) < 1);
  if (anim.length) busy = true;
  draw();
  if (busy) kick();
}
function kick() { if (!queued) { queued = true; once(step); } }   // a frame from the clock, at full rate, for as long as something is still moving

function at(e) {
  const r = canvas.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / r.width * COLS), Math.floor((e.clientY - r.top) / r.height * ROWS)];
}
function preview(c, r) {
  const grp = group(c, r);
  hover = grp.length > 1 ? grp : [];
  $('bp-move').textContent = hover.length ? hover.length * (hover.length - 1) : 0;
  kick();
}

export function init() {
  if (ready) return;
  ready = true;
  canvas = $('bp-canvas');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = COLS * CELL * dpr; canvas.height = ROWS * CELL * dpr;
  g = canvas.getContext('2d'); g.scale(dpr, dpr);
  imgs = sprites();
  try { best = +localStorage.getItem('tahsin.bubblepop') || 0; } catch { best = 0; }
  canvas.addEventListener('pointermove', (e) => { const [c, r] = at(e); preview(c, r); });
  canvas.addEventListener('pointerleave', () => { hover = []; kick(); });
  canvas.addEventListener('click', (e) => { const [c, r] = at(e); cursor = [c, r]; pop(c, r); });
  canvas.addEventListener('focus', kick);
  canvas.addEventListener('blur', kick);
  canvas.addEventListener('keydown', (e) => {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      cursor = [Math.max(0, Math.min(COLS - 1, cursor[0] + moves[e.key][0])), Math.max(0, Math.min(ROWS - 1, cursor[1] + moves[e.key][1]))];
      preview(...cursor);
      if (hasMoves()) say();
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pop(...cursor); if (hasMoves()) { preview(...cursor); say(`Score ${score}. `); } }
  });
  $('bp-new').addEventListener('click', newGame);
  newGame();
  track('game_start', { game: 'bubble_pop' });
}
