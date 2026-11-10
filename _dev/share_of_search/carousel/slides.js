// The share-of-search carousel, one slide per load: slides.html?s=1. Every number comes from the site's
// share_of_search.json (written by analysis.py); the words around them are fixed.
const q = new URLSearchParams(location.search);
const S = +q.get('s') || 1, N = 7;
document.body.style.setProperty('--wall', 'url(../../../assets/wall/hills-1000.webp)');
const d = await (await fetch('../../../assets/data/share_of_search.json')).json();
const p1 = (v) => (v / 10).toFixed(1), yi = (yr) => d.years.indexOf(yr);
const annual = (b, key, yr) => d[key][b][yi(yr)];
const yearSearch = (b, yr) => d.sos_year[b][yr === 2026 ? d.years.length : yi(yr)];   // the study's annual share (summed months)
const yearRetro = (b, yr) => { const v = d.months.map((m, i) => [m, i]).filter(([m]) => +m.slice(0, 4) === yr).map(([, i]) => d.retro[b][i] ?? 0); return v.reduce((a, c) => a + c, 0) / v.length; };

// The window's chart, cropped to a span of years: monthly search line, the retro slice under it, yearly revenue steps.
function chart(b, from = 2010, { pending = false, cc = true } = {}) {
  const W = 320, H = 150, L = 22, R = 6, T = 8, B = 14;
  const idx = d.months.map((m, i) => [m, i]).filter(([m]) => +m.slice(0, 4) >= from).map(([, i]) => i);
  const n = idx.length, sos = idx.map((i) => d.sos[b][i]), retro = idx.map((i) => d.retro[b][i] ?? 0);
  const yrs = d.years.filter((yr) => yr >= from), som = yrs.map((yr) => (cc ? d.som_cc : d.som_usd)[b][yi(yr)]);
  const x = (k) => L + k * (W - L - R) / (n - 1), xy = (yr) => x((yr - from) * 12);
  const vals = [...sos, ...som];
  const lo = Math.floor((Math.min(...vals) - 20) / 50) * 50, hi = Math.ceil((Math.max(...vals) + 20) / 50) * 50, y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  const line = sos.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const band = `M${sos.map((v, k) => `${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join('L')}L${sos.map((v, k) => `${x(k).toFixed(1)} ${y(v * (1 - retro[k] / 1000)).toFixed(1)}`).reverse().join('L')}Z`;
  const steps = som.map((v, k) => `${k ? 'L' : 'M'}${xy(yrs[k]).toFixed(1)} ${y(v).toFixed(1)}H${xy(yrs[k] + 1).toFixed(1)}`).join('');
  const grid = [];
  for (let v = lo; v <= hi; v += 50) grid.push(`<line class="bb__grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="bb__ax" x="${L - 3}" y="${y(v) + 3}" text-anchor="end">${v / 10}%</text>`);
  const every = from >= 2018 ? 2 : 4;
  for (let yr = from; yr <= 2026; yr += every) grid.push(`<text class="bb__ax" x="${xy(yr) + 1.5}" y="${H - 3}">${yr}</text>`);
  let pend = '';
  if (pending) {
    const base = d.pending.som_2025_cc, x1 = xy(2026), x2 = W - R;
    pend = `<path class="bb__pend" d="M${x1} ${y(base)}H${x2}"/><image href="burst.png" x="${x2 - 22}" y="${y(base) - 30}" width="24.4" height="24.4" style="image-rendering:pixelated"/>`;
  }
  return `<svg class="bb__chart" viewBox="0 0 ${W} ${H}" aria-hidden="true">${grid.join('')}<path class="bb__band" d="${band}"/><path class="bb__steps" d="${steps}"/>${pend}<path class="bb__line" d="${line}"/></svg>`;
}
const key = `<ul class="bb__key"><li><svg viewBox="0 0 24 10"><path class="bb__line" d="M1 6 L8 3 L15 7 L23 2"/></svg>Share of search</li><li><svg viewBox="0 0 24 10"><path class="bb__steps" d="M1 7H12V3H23"/></svg>Share of revenue</li><li><svg viewBox="0 0 24 10"><rect class="bb__band" x="1" y="2" width="22" height="7"/></svg>Retro shoes</li></ul>`;
const screen = (top, svg) => `<div class="bb__screen"><div class="bb__lcd"><span>${top[0]}</span><span>${top[1]}</span></div>${svg}</div>`;
const win = (file, body, status = '') => `<section class="win is-focus"><div class="win__bar"><svg class="win__ico"><use href="#i-sos"/></svg><span class="win__file">${file}</span><span class="dots">${Array.from({ length: N }, (_, i) => `<i class="${i + 1 === S ? 'on' : ''}"></i>`).join('')}</span></div><div class="win__main"><div class="win__body">${body}</div>${status ? `<div class="win__status"><span>${status}</span></div>` : ''}</div></section>`;
const SRC = 'Google Trends, worldwide. Revenue from annual reports and 10-Ks, constant currency.';
const b = d.binet;

const SLIDES = {
  1: () => win('BRING_BACK.EXE', `
    <h1 class="s">adidas's retro shoes took a fifth of its searches</h1>
    <ul class="lcds"><li><b>${Math.round(yearRetro('adidas', 2022) / 10)}%</b><span>of adidas searches were Samba, Gazelle, Campus or Spezial in 2022</span></li><li><b>${Math.round(yearRetro('adidas', 2024) / 10)}%</b><span>in 2024</span></li></ul>
    <p class="lede">So did adidas sell more? I checked its share of searches against its share of revenue, next to Nike and Puma.</p>`, SRC),
  2: () => win('METHOD.TXT', `
    <h2 class="s">Share of search, in one line</h2>
    <p class="lede"><b>A brand's searches divided by all three brands' searches.</b> The marketing effectiveness researcher Les Binet found it tends to run ahead of a brand's share of market.</p>
    ${screen(['2025', 'SEARCH VS REVENUE'], (() => {
      const rows = [['SEARCH', (k) => yearSearch(k, 2025)], ['REVENUE', (k) => annual(k, 'som_cc', 2025)]], C = { nike: 'var(--lcd-fg)', adidas: 'var(--lcd-sub)', puma: 'color-mix(in srgb, var(--lcd-fg) 40%, transparent)' }, INK = { nike: 'var(--lcd-bg)', adidas: 'var(--lcd-bg)', puma: 'var(--lcd-fg)' };
      return `<svg class="bb__chart" viewBox="0 0 320 96" aria-hidden="true">${rows.map(([lab, f], r) => { let x0 = 0; return `<text class="bb__ax" x="0" y="${r * 48 + 10}">${lab}</text>` + ['nike', 'adidas', 'puma'].map((k) => { const w = f(k) / 1000 * 320, s = `<rect x="${x0}" y="${r * 48 + 16}" width="${w - 2}" height="24" fill="${C[k]}"/><text class="bb__ax" x="${x0 + 3}" y="${r * 48 + 31}" style="fill:${INK[k]}">${k === 'puma' ? '' : k.toUpperCase() + ' '}${p1(f(k))}%</text>`; x0 += w; return s; }).join(''); }).join('')}</svg>`;
    })())}
    <p class="small">I tested it on Nike, adidas and Puma from 2010 to 2025: does search share running ahead of revenue share come before revenue share rising?</p>`, SRC),
  3: () => win('ADIDAS.TXT', `
    <h2 class="s">Search jumped, then revenue share rose</h2>
    ${screen(['ADIDAS', 'SHARE OF 3 BRANDS'], chart('adidas', 2018))}${key}
    <p class="lede">adidas's share of search rose from ${p1(yearSearch('adidas', 2022))}% in 2022 to ${p1(yearSearch('adidas', 2024))}% in 2024. Its revenue share rose ${p1(annual('adidas', 'som_cc', 2024) - annual('adidas', 'som_cc', 2023))} points in 2024 and ${p1(annual('adidas', 'som_cc', 2025) - annual('adidas', 'som_cc', 2024))} more in 2025.</p>
    <p class="small">One case, so it's exploratory.</p>`, SRC),
  4: () => win('CURRENCY.TXT', `
    <h2 class="s">The trap I caught: the euro</h2>
    <ul class="lcds"><li><b>r ${b.usd.r.toFixed(2)}</b><span>in US dollars</span></li><li><b>r ${b.cc.r.toFixed(2)}</b><span>in constant currency</span></li></ul>
    <p class="lede">In dollars, search share looked like a strong one-year forecast. But adidas and Puma report in euros: when the euro rises, their dollar share rises with no extra sales. Held at one exchange rate, it no longer beat guessing "no change" in any way that counts (${b.cc.loyo.toFixed(2)} vs ${b.cc.naive.toFixed(2)} points of error, p = ${b.cc.p.toFixed(2)}).</p>
    <p class="small">Correlation between search share running ahead of revenue share and the next year's change, ${b.cc.n} brand-years.</p>`, SRC),
  5: () => win('NIKE.TXT', `
    <h2 class="s">Nike's classics are fading</h2>
    ${screen(['NIKE', 'SHARE OF 3 BRANDS'], chart('nike', 2016))}${key}
    <p class="lede">Dunk, Air Force 1 and Jordan 1 went from ${Math.round(yearRetro('nike', 2021) / 10)}% of Nike searches in 2021 to ${Math.round(yearRetro('nike', 2025) / 10)}% in 2025, and Nike's share of search fell from ${p1(yearSearch('nike', 2021))}% to ${p1(yearSearch('nike', 2025))}%.</p>
    <p class="small">Exploratory: they moved together; this doesn't show which drove which.</p>`, SRC),
  6: () => win('PUMA_CALL.TXT', `
    <h2 class="s">My open call: Puma</h2>
    ${screen(['PUMA', 'CALLED ' + d.pending.made], chart('puma', 2018, { pending: true }))}${key}
    <p class="lede">Puma's share of search reached ${p1(d.pending.sos_2026)}% in 2026 so far, as Speedcat and Palermo took off, against a 2025 revenue share of ${p1(d.pending.som_2025_cc)}%. If search leads, its 2026 revenue share should rise.</p>
    <p class="small">Scored ${d.pending.scored}. A weak call: Puma is where the signal is weakest, and "puma" also catches the animal.</p>`, SRC),
  7: () => win('SO_WHAT.TXT', `
    <h2 class="s">What I'd tell a brand team</h2>
    <ul class="steps">
      <li><span><b>Track share of search monthly, and read it as direction, not a forecast.</b> It's free, and it pointed the right way here.</span></li>
      <li><span><b>Check currency before trusting any share chart.</b> Most of the forecasting edge here was the euro.</span></li>
      <li><span><b>Line up the next franchise before the retro wave peaks.</b> Nike's classics faded with its search share.</span></li>
    </ul>
    <p class="url">TAHSINANAN15.GITHUB.IO</p>
    <p class="small">Open BRING_BACK.EXE for the live chart. Study by Tahsin Anan, with research and build support.</p>`),
};
document.getElementById('root').innerHTML = `<div class="slide${[1, 2, 4, 7].includes(S) ? ' roomy' : ''}">${SLIDES[S]()}</div>`;
document.getElementById('page').textContent = `${S}/${N}`;
const html = await (await fetch('../../../index.html')).text();
const sym = html.match(/<symbol id="i-sos"[\s\S]*?<\/symbol>/)?.[0], grads = html.match(/<(linear|radial)Gradient id="g-[a-z]+"[\s\S]*?<\/(linear|radial)Gradient>/g) || [];
document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute"><defs>${grads.join('')}</defs>${sym || ''}</svg>`);
await document.fonts.ready;
document.body.dataset.ready = '1';
