// The carousel, slide by slide. Every number comes from the same bring_back.json the site ships; the words around them are fixed.
const q = new URLSearchParams(location.search);
const S = +q.get('s') || 1, THEME = q.get('t') || 'aero';
const WALL = { aero: 'hills', vapor: 'eye-vapor', baroque: 'clay', ghost: 'ghost', ray: 'gold-ray', metro: 'metro' };
const START = { aero: 'start', vapor: 'START', baroque: 'Enter', ghost: 'JACK IN', ray: 'শুরু', metro: 'Uptown' };
document.documentElement.dataset.theme = THEME;
document.body.style.setProperty('--wall', `url(../../../assets/wall/${WALL[THEME]}-1000.webp)`);
document.getElementById('startlab').textContent = START[THEME];

const data = await (await fetch('../../../assets/data/bring_back.json')).json();
const picks = await (await fetch('picks.json')).json();   // the three standout cases, chosen after the result, named in the report
const r = data.result, byId = Object.fromEntries(data.cases.map((c) => [c.id, c]));
const pct = (x) => `${Math.round(x * 100)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const said = (lasts) => (lasts ? 'Bring it back' : 'Leave it');
const OUT = { PERMANENT: 'Still on sale two years on', 'RECURRING LIMITED': 'Only back for limited runs', 'GONE AGAIN': 'Gone again within two years' };
const N = 9;

function curve(w, { avgs = false } = {}) {
  const W = 320, H = 110, P = 6, n = w.length, top = Math.max(...w, 1);
  const x = (i) => P + i * (W - 2 * P) / (n - 1), y = (v) => H - P - v / top * (H - 2 * P - 12);
  const d = w.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const split = x(n - 13);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const a1 = mean(w.slice(0, 39)), a2 = mean(w.slice(-13));
  const lines = avgs ? `<line class="avg" x1="${P}" x2="${split}" y1="${y(a1)}" y2="${y(a1)}"/><line class="avg" x1="${split}" x2="${W - P}" y1="${y(a2)}" y2="${y(a2)}"/>` : '';
  const burst = avgs ? '' : `<image href="burst.png" x="${x(n - 1) - 18.3}" y="${y(w[n - 1]) - 18.3}" width="36.6" height="36.6" style="image-rendering:pixelated"/>`;
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect class="last" x="${split}" y="0" width="${W - split}" height="${H}"/><path class="ln" d="${d}"/>${lines}${burst}</svg>`;
}
const screen = (c, top, opts = {}) => `<div class="scr"><div class="lcdrow"><span>${top[0]}</span><span>${top[1]}</span></div>${curve(c.w, opts)}<div class="lcdrow sub"><span>${opts.avgs ? '- - 9-MONTH AVERAGE' : '12 MONTHS BEFORE THE NEWS'}</span><span>${opts.avgs ? '3-MONTH AVERAGE - -' : 'LAST 3'}</span></div></div>`;
const win = (file, body, status = '') => `<section class="win is-focus"><div class="win__bar"><svg class="win__ico"><use href="#i-chart"/></svg><span class="win__file">${file}</span><span class="dots">${Array.from({ length: N }, (_, i) => `<i class="${i + 1 === S ? 'on' : ''}"></i>`).join('')}</span></div><div class="win__main"><div class="win__body">${body}</div>${status ? `<div class="win__status"><span>${status}</span></div>` : ''}</div></section>`;

const hook = byId[picks.hook];
const caseSlide = (c, k) => {
  const lasted = c.outcome === 'PERMANENT', rule = c.call === 'LASTS';
  return win(`CASE_${k}.TXT`, `
    <h2 class="s">${esc(c.name)}</h2>
    ${screen(c, [esc(c.announced.slice(0, 7)), `${c.ratio.toFixed(2)}X`])}
    <p class="lede" style="margin-top:10px"><b>${OUT[c.outcome]}.</b> ${esc(c.note)}</p>
    <dl class="calls"><div><dt>Her rule said</dt><dd>${said(rule)}</dd></div><div><dt>Called it</dt><dd>${rule === lasted ? 'Right' : 'Wrong'}</dd></div></dl>
    <p class="small">${c.band === 'holdout' ? 'Held out: the line was set without this case.' : 'One of the cases that set the line.'} Source: ${esc(new URL(c.url).hostname.replace(/^www\./, ''))}</p>`,
  `Search interest vs its brand, ${c.src === 'Google Trends' ? 'Google Trends, US' : 'Wikipedia pageviews'}. Attention, not sales.`);
};

function ciChart() {
  const W = 480, H = 190, L = 130, R = 18, x = (v) => L + v * (W - L - R);
  const row = (y, lab, v, ci, base) => `<text class="lab" x="0" y="${y + 4}">${lab}</text>${ci ? `<line x1="${x(ci[0])}" x2="${x(ci[1])}" y1="${y}" y2="${y}" stroke="var(--link)" stroke-width="3" stroke-linecap="round" opacity=".45"/>` : ''}<circle cx="${x(v)}" cy="${y}" r="7" fill="${base ? 'var(--sheet)' : 'var(--link)'}" stroke="${base ? 'var(--ink-2)' : 'var(--sheet)'}" stroke-width="${base ? 3 : 2}"/><text x="${x(v)}" y="${y - 12}" text-anchor="middle">${pct(v)}</text>`;
  const ticks = [0, .25, .5, .75, 1].map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="18" y2="${H - 22}" stroke="var(--rule)"/><text x="${x(t)}" y="${H - 6}" text-anchor="middle">${pct(t)}</text>`).join('');
  return `<svg class="ci" viewBox="0 0 ${W} ${H}" width="100%">${ticks}${row(62, 'Her rule', r.rule_hits / r.holdout_n, r.rule_ci)}${row(128, 'Always guessing', r.base_hits / r.holdout_n, null, true)}</svg>`;
}
const beat = r.rule_hits > r.base_hits, tie = r.rule_hits === r.base_hits;
const verdict = beat ? `It called ${r.rule_hits} of ${r.holdout_n} held-out comebacks. Always guessing got ${r.base_hits}.`
  : tie ? `It called ${r.rule_hits} of ${r.holdout_n} held-out comebacks. So did always guessing.`
  : `It called ${r.rule_hits} of ${r.holdout_n} held-out comebacks. Always guessing got ${r.base_hits}.`;

const SLIDES = {
  1: () => win('BRING_BACK.EXE', `
    <h1 class="s">Can you see a comeback coming?</h1>
    <p class="lede">This is a year of people searching for a product, before the brand said it was coming back. Would you bring it back?</p>
    ${screen(hook, ['CASE ??', esc(hook.cat.toUpperCase())])}
    <div class="actions"><span class="gel gel--go">Bring it back</span><span class="gel">Leave it</span></div>
    <p class="small">Answer on the last slide.</p>`),
  2: () => win('QUESTION.TXT', `
    <h1 class="s">Brands bring things back all the time</h1>
    <p class="lede">Fans ask for a discontinued snack, a lip gloss, a sneaker. Sometimes the brand listens. Some comebacks stay for good. Most don't.</p>
    <p class="lede"><b>My question:</b> if fans are already searching for it before the brand says a word, does that comeback last?</p>
    <p class="lede">I sourced ${r.sourced} real US comebacks from 2014 to 2025 in food and drink, beauty and sportswear, flops included, and measured the ${data.cases.length} with enough search data.</p>`),
  3: () => win('METHOD.TXT', `
    <h2 class="s">One number per comeback</h2>
    ${screen(byId[picks.method], ['SEARCHES', 'BEFORE THE NEWS'], { avgs: true })}
    <ol class="steps">
      <li><span>Average searches in the last 3 months before the announcement, divided by the 9 months before that.</span></li>
      <li><span>Divide by the same number for the brand, so a brand that's growing anyway doesn't count.</span></li>
      <li><span>Set the cut-off on 2014 to 2020. Test it once on 2021 to 2023.</span></li>
    </ol>
    <p class="small">Rules written and dated before any data was pulled. "Lasted" means still on sale two years later.</p>`),
  4: () => caseSlide(byId[picks.cases[0]], 1),
  5: () => caseSlide(byId[picks.cases[1]], 2),
  6: () => caseSlide(byId[picks.cases[2]], 3),
  7: () => win('RESULT.TXT', `
    <h2 class="s">${beat ? 'The signal helped, a little' : tie ? 'The signal did no better than guessing' : 'The signal did worse than guessing'}</h2>
    <p class="lede">${verdict}</p>
    ${ciChart()}
    <p class="small">Held-out hit rate with its 95% bootstrap range, n = ${r.holdout_n}. One case moves it ${Math.round(100 / r.holdout_n)} points, so this is directional.</p>`),
  8: () => win('SO_WHAT.TXT', picks.sowhat.replace('RISE', `${data.rising.lasted[0] + data.rising.faded[0]} of ${data.rising.lasted[1] + data.rising.faded[1]}`).replace('FADED', `${data.rising.faded[0]} of ${data.rising.faded[1]}`)),
  9: () => win('BRING_BACK.EXE', `
    <h1 class="s">Your turn</h1>
    <p class="lede">Call three comebacks blind against my rule, then read the whole study: every case, every source, and the ${r.forward_n} I've called for 2027.</p>
    <p class="lede"><b>Slide 1 was ${esc(hook.name)}.</b> ${OUT[hook.outcome]}.</p>
    <p class="url">TAHSINANAN15.GITHUB.IO</p>
    <p class="small">Start menu, then Comeback study. Study by Tahsin Anan, with research and build support.</p>`),
};
document.getElementById('root').innerHTML = `<div class="slide${[2, 7, 8, 9].includes(S) ? ' roomy' : ''}">${SLIDES[S]()}</div>`;
document.getElementById('page').textContent = `${S}/${N}`;
// the window icon symbol lives in the site's index.html; borrow it
const sprite = await (await fetch('../../../index.html')).text();
const sym = sprite.match(/<symbol id="i-chart"[\s\S]*?<\/symbol>/)?.[0], grads = sprite.match(/<linearGradient id="g-(page|sky|green|pink)"[\s\S]*?<\/linearGradient>/g) || [];
document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute"><defs>${grads.join('')}</defs>${sym || ''}</svg>`);
await document.fonts.ready;
document.body.dataset.ready = '1';
