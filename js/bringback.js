// BRING_BACK.EXE: share of search against share of revenue for Nike, adidas and Puma, 2010 to 2026.
// Every number comes from assets/data/share_of_search.json, which _dev/share_of_search/analysis.py writes.
import { track } from './analytics.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NAME = { nike: 'Nike', adidas: 'adidas', puma: 'Puma' };
const p1 = (v) => (v / 10).toFixed(1);   // per mille to a percent with one decimal
let d, brand = 'adidas', cc = true, hover = null, ready = false;

const L = 34, R = 10, T = 12, B = 22;
let W = 640, H = 250;
function chart() {
  const phone = document.documentElement.classList.contains('phone');
  W = phone ? 360 : 640; H = phone ? 220 : 250;
  const m = d.months, n = m.length, sos = d.sos[brand], retro = d.retro[brand], som = (cc ? d.som_cc : d.som_usd)[brand];
  const y0 = +m[0].slice(0, 4), x = (i) => L + i * (W - L - R) / (n - 1), xy = (yr) => x((yr - y0) * 12);
  const vals = [...sos, ...som].filter((v) => v != null);
  const lo = Math.floor((Math.min(...vals) - 20) / 50) * 50, hi = Math.ceil((Math.max(...vals) + 20) / 50) * 50;
  const y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  const line = sos.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  // The retro shoes' slice: the band from the line down by the share of the brand's searches that were for them.
  const top = sos.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
  const bot = sos.map((v, i) => `${x(i).toFixed(1)} ${y(v * (1 - (retro[i] ?? 0) / 1000)).toFixed(1)}`).reverse();
  const band = `M${top.join('L')}L${bot.join('L')}Z`;
  const steps = som.map((v, i) => `${i ? 'L' : 'M'}${xy(d.years[i]).toFixed(1)} ${y(v).toFixed(1)}H${xy(d.years[i] + 1).toFixed(1)}`).join('');
  const grid = [];
  for (let v = lo; v <= hi; v += 50) grid.push(`<line class="bb__grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="bb__ax" x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end">${v / 10}%</text>`);
  for (let yr = 2010; yr <= 2026; yr += phone ? 8 : 4) grid.push(`<text class="bb__ax" x="${xy(yr) + 2}" y="${H - 6}">${yr}</text>`);
  let pending = '';
  if (brand === d.pending.brand) {   // the open call: Puma's 2026 revenue share against its 2025 level, not yet reported
    const base = cc ? d.pending.som_2025_cc : d.pending.som_2025_usd, x1 = xy(2026), x2 = Math.min(xy(2027), W - R);
    pending = `<path class="bb__pend" d="M${x1} ${y(base)}H${x2}"/><text class="bb__ax" x="${x2}" y="${y(base) + 14}" text-anchor="end">2026 CALL: UP</text>`;
  }
  const h = hover ?? n - 1, hx = x(h);
  return `<svg class="bb__chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(NAME[brand])} share of search by month and share of revenue by year, 2010 to 2026. The yearly numbers are in the table below.">
    ${grid.join('')}<path class="bb__band" d="${band}"/><path class="bb__steps" d="${steps}"/>${pending}<path class="bb__line" d="${line}"/>
    <line class="bb__cross" x1="${hx}" x2="${hx}" y1="${T}" y2="${H - B}"/><circle class="bb__dot" cx="${hx}" cy="${y(sos[h])}" r="3.5"/>
  </svg>`;
}

function readout() {
  const i = hover ?? d.months.length - 1, mo = d.months[i], yi = d.years.indexOf(+mo.slice(0, 4));
  const som = yi < 0 ? null : (cc ? d.som_cc : d.som_usd)[brand][yi], r = d.retro[brand][i];
  return `<span>${mo}</span><span>SEARCH ${p1(d.sos[brand][i])}%</span><span>RETRO ${r == null ? '-' : Math.round(r / 10)}%</span><span>REVENUE ${som == null ? 'NOT YET' : `${p1(som)}%`}</span>`;
}

function drawChart() {
  $('bb-readout').innerHTML = readout();
  $('bb-plot').innerHTML = chart();
}
function draw() {
  drawChart();
  for (const b of document.querySelectorAll('#bringback [data-brand]')) b.setAttribute('aria-pressed', String(b.dataset.brand === brand));
  for (const b of document.querySelectorAll('#bringback [data-cc]')) b.setAttribute('aria-pressed', String((b.dataset.cc === '1') === cc));
  $('bb-table').innerHTML = `<thead><tr><th>Year</th><th>Search share</th><th>Revenue share, constant currency</th><th>Revenue share, US dollars</th></tr></thead><tbody>${d.years.map((yr, i) => {
    return `<tr><td>${yr}</td><td>${p1(d.sos_year[brand][i])}%</td><td>${p1(d.som_cc[brand][i])}%</td><td>${p1(d.som_usd[brand][i])}%</td></tr>`;
  }).join('')}</tbody>`;
  $('bb-table-cap').textContent = `${NAME[brand]}, as a share of the three brands. Search share ${d.years.at(-1) + 1} to date: ${p1(d.sos_year[brand].at(-1))}%.`;
}

function hoverAt(e) {
  const svg = $('bb-plot').querySelector('svg'), r = svg.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width * W;
  hover = Math.max(0, Math.min(d.months.length - 1, Math.round((fx - L) / (W - L - R) * (d.months.length - 1))));
  drawChart();
}

export async function init() {
  if (ready) return;
  ready = true;
  try {
    const res = await fetch($('bringback').dataset.src);
    if (!res.ok) throw new Error(res.status);
    d = await res.json();
  } catch {
    ready = false;
    $('bb-root').querySelector('.insight').textContent = "The study data didn't load. Close this window and try again.";
    return;
  }
  const b = d.binet, pend = d.pending, ad = d.som_cc.adidas, yi = (yr) => d.years.indexOf(yr);
  const up24 = p1(ad[yi(2024)] - ad[yi(2023)]), up25 = p1(ad[yi(2025)] - ad[yi(2024)]), sy = (k, yr) => d.sos_year[k][yi(yr)];
  const retroYear = (k, yr) => { const v = d.months.map((m, j) => [m, j]).filter(([m]) => +m.slice(0, 4) === yr).map(([, j]) => d.retro[k][j] ?? 0); return Math.round(v.reduce((a, c) => a + c, 0) / v.length / 10); };
  $('bb-root').innerHTML = `
    <h2 id="bb-h">Share of search vs share of revenue</h2>
    <p class="insight">adidas's terrace shoes went from about ${retroYear('adidas', 2022)}% to ${retroYear('adidas', 2024)}% of adidas searches. Its share of search jumped ${p1(sy('adidas', 2024) - sy('adidas', 2022))} points, and its revenue share rose ${up24} points in 2024 and ${up25} more in 2025.</p>
    <div class="bb__tools">
      <div class="bb__seg" role="group" aria-label="Brand">${Object.keys(NAME).map((k) => `<button type="button" class="pill" data-brand="${k}">${NAME[k]}</button>`).join('')}</div>
      <div class="bb__seg" role="group" aria-label="Currency"><button type="button" class="pill" data-cc="1">Constant currency</button><button type="button" class="pill" data-cc="0">US dollars</button></div>
    </div>
    <div class="bb__screen" id="bb-screen" tabindex="0" role="group" aria-label="Chart. Left and right arrows move through the months."><div class="bb__lcd" id="bb-readout" aria-live="polite"></div><div id="bb-plot"></div></div>
    <ul class="bb__key">
      <li><svg viewBox="0 0 24 10" aria-hidden="true"><path class="bb__line" d="M1 6 L8 3 L15 7 L23 2"/></svg>Share of search, monthly</li>
      <li><svg viewBox="0 0 24 10" aria-hidden="true"><path class="bb__steps" d="M1 7H12V3H23"/></svg>Share of revenue, yearly</li>
      <li><svg viewBox="0 0 24 10" aria-hidden="true"><rect class="bb__band" x="1" y="2" width="22" height="7"/></svg>Retro shoes' slice of the brand's searches</li>
    </ul>
    <p class="note">Shares of the three brands. Retro shoes: ${Object.keys(NAME).map((k) => `${NAME[k]} ${d.franchises[k].join(', ')}`).join('; ')}. Searches from Google Trends, worldwide; revenue from annual reports and 10-Ks.</p>
    <h3>What I found</h3>
    <ul class="bb__finds">
      <li><b>Search share pointed the right way, but it isn't a forecast.</b> In constant currency, search share running ahead of revenue share came before revenue share rising the next year only weakly (r = ${b.cc.r.toFixed(2)}, ${b.cc.n} brand-years, p = ${b.cc.p.toFixed(2)}). Its error was ${b.cc.loyo.toFixed(2)} points against ${b.cc.naive.toFixed(2)} for guessing "no change", and at the euro's average rate it only tied. <span class="bb__tag">Confirmatory</span></li>
      <li><b>One retro wave came before a brand's rise.</b> adidas's terrace shoes reached a fifth of adidas searches in 2024, and adidas's search share and revenue share both rose. One case, and it doesn't show cause. <span class="bb__tag">Exploratory</span></li>
      <li><b>Nike's classics are fading with its search share.</b> Dunk, Air Force 1 and Jordan 1 fell from ${retroYear('nike', 2021)}% of Nike searches in 2021 to ${retroYear('nike', 2025)}% in 2025, as Nike's share of search fell from ${p1(sy('nike', 2021))}% to ${p1(sy('nike', 2025))}%. <span class="bb__tag">Exploratory</span></li>
    </ul>
    <h3>The currency trap I caught</h3>
    <p>In US dollars the test looked strong: r = ${b.usd.r.toFixed(2)}, with ${b.usd.loyo.toFixed(2)} points of error against ${b.usd.naive.toFixed(2)} for guessing "no change". But adidas and Puma report in euros. When the euro rises, their share of dollar revenue rises without one extra sale, and search doesn't follow exchange rates. With the euro held at one rate, 1.15 dollars, the edge all but went away (p = ${b.cc.p.toFixed(2)}, against ${b.usd.p.toFixed(2)} in dollars), so I report the weaker version.</p>
    <h3>My open call</h3>
    <p>Puma's share of search in 2026 so far is ${p1(pend.sos_2026)}%, against a 2025 revenue share of ${p1(pend.som_2025_cc)}%. If search leads, its 2026 revenue share should rise above that. Called ${esc(pend.made)}, scored ${esc(pend.scored)}. It's a weak call: Puma is where the signal is weakest, and "puma" also catches the animal.</p>
    <details class="bb__data"><summary>The yearly numbers</summary><p class="note" id="bb-table-cap"></p><div class="tbl-wrap"><table id="bb-table"></table></div></details>
    <p class="note">Method, every source and the script that rebuilds these numbers: <a href="https://github.com/tahsinanan15/tahsinanan15.github.io/tree/main/_dev/share_of_search" target="_blank" rel="noopener">the study files</a>.</p>`;
  $('bb-root').addEventListener('click', (e) => {
    const t = e.target.closest('[data-brand], [data-cc]');
    if (!t) return;
    if (t.dataset.brand) brand = t.dataset.brand; else cc = t.dataset.cc === '1';
    hover = null; draw();
    track('bb_view', { brand, currency: cc ? 'constant' : 'usd' });
  });
  const scr = $('bb-screen');
  scr.addEventListener('pointermove', hoverAt);
  scr.addEventListener('pointerleave', () => { hover = null; drawChart(); });
  scr.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, PageUp: -12, PageDown: 12 }[e.key];
    if (!step) return;
    e.preventDefault(); hover = Math.max(0, Math.min(d.months.length - 1, (hover ?? d.months.length - 1) + step)); drawChart();
  });
  draw();
}
