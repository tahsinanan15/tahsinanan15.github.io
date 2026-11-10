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
const CAT = { 'food & drink': 'Food and drink', beauty: 'Beauty', sportswear: 'Sportswear' };   // as the site writes them: Silkscreen's & reads as $
const N = 9;

function curve(w, { avgs = false } = {}) {
  const W = 320, H = 110, P = 6, n = w.length, top = Math.max(...w, 1);
  const x = (i) => P + i * (W - 2 * P) / (n - 1), y = (v) => H - P - v / top * (H - 2 * P - 12);
  const d = w.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const split = x(n - 13);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const a1 = mean(w.slice(0, 39)), a2 = mean(w.slice(-13));
  const lines = avgs ? `<line class="avg" x1="${P}" x2="${split}" y1="${y(a1)}" y2="${y(a1)}"/><line class="avg" x1="${split}" x2="${W - P}" y1="${y(a2)}" y2="${y(a2)}"/>` : '';
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect class="last" x="${split}" y="0" width="${W - split}" height="${H}"/><path class="ln" d="${d}"/>${lines}</svg>`;
}
const screen = (c, top, opts = {}) => `<div class="scr"><div class="lcdrow"><span>${top[0]}</span><span>${top[1]}</span></div>${curve(c.w, opts)}<div class="lcdrow sub"><span>${opts.avgs ? '9 MONTHS' : '12 MONTHS BEFORE THE NEWS'}</span><span>LAST 3</span></div></div>`;
const win = (file, body, status = '') => `<section class="win is-focus"><div class="win__bar"><svg class="win__ico"><use href="#i-chart"/></svg><span class="win__file">${file}</span><span class="dots">${Array.from({ length: N }, (_, i) => `<i class="${i + 1 === S ? 'on' : ''}"></i>`).join('')}</span></div><div class="win__main"><div class="win__body">${body}</div>${status ? `<div class="win__status"><span>${status}</span></div>` : ''}</div></section>`;

const hook = byId[picks.hook];
const caseSlide = (c, k) => {
  const lasted = c.outcome === 'PERMANENT', rule = c.call === 'LASTS';
  return win(`CASE_${k}.TXT`, `
    <h2 class="s">${esc(c.name)}</h2>
    ${screen(c, [esc(c.announced.slice(0, 7)), `${c.ratio.toFixed(2)}X`])}
    <p class="lede" style="margin-top:10px"><b>${OUT[c.outcome]}.</b> ${esc(c.note)}</p>
    <dl class="calls"><div><dt>The rule said</dt><dd>${said(rule)}</dd></div><div><dt>Called it</dt><dd>${rule === lasted ? 'Right' : 'Wrong'}</dd></div></dl>
    <p class="small">${c.band === 'holdout' ? 'Held out: the line was set without this case.' : 'One of the cases that set the line.'} Source: ${esc(new URL(c.url).hostname.replace(/^www\./, ''))}</p>`,
  `Line: ${c.wiki ? `Wikipedia views of the "${esc(c.wiki)}" page${c.wiki !== c.name ? ' (the whole line)' : ''}` : 'US Google searches for the product'}. Number: its rise vs its brand. Attention, not sales.`);
};

function ciChart() {
  const W = 480, H = 250, L = 150, R = 18, x = (v) => L + v * (W - L - R);
  const row = (y, lab, v, ci, base) => `<text class="lab" x="0" y="${y + 4}">${lab}</text>${ci ? `<line x1="${x(ci[0])}" x2="${x(ci[1])}" y1="${y}" y2="${y}" stroke="var(--link)" stroke-width="3" stroke-linecap="round" opacity=".45"/>` : ''}<circle cx="${x(v)}" cy="${y}" r="7" fill="${base ? 'var(--sheet)' : 'var(--link)'}" stroke="${base ? 'var(--ink-2)' : 'var(--sheet)'}" stroke-width="${base ? 3 : 2}"/><text x="${x(v)}" y="${y - 12}" text-anchor="middle">${pct(v)}</text>`;
  const ticks = [0, .25, .5, .75, 1].map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="18" y2="${H - 22}" stroke="var(--rule)"/><text x="${x(t)}" y="${H - 6}" text-anchor="middle">${pct(t)}</text>`).join('');
  return `<svg class="ci" viewBox="0 0 ${W} ${H}" width="100%">${ticks}${row(62, 'The rule', r.rule_hits / r.holdout_n, r.rule_ci)}${row(128, `Always "${said(r.majority_call === 'LASTS').toLowerCase()}"`, r.base_hits / r.holdout_n, null, true)}${row(194, `Always "${said(r.majority_call !== 'LASTS').toLowerCase()}"`, (r.holdout_n - r.base_hits) / r.holdout_n, null, true)}</svg>`;
}
const beat = r.rule_hits > r.base_hits, tie = r.rule_hits === r.base_hits;
const baseSaid = `always saying "${said(r.majority_call === 'LASTS').toLowerCase()}"`, otherSaid = `always saying "${said(r.majority_call !== 'LASTS').toLowerCase()}"`;
const verdict = `The rule called ${r.rule_hits} of ${r.holdout_n} held-out comebacks right. ${tie ? `So did ${baseSaid}` : `${baseSaid[0].toUpperCase()}${baseSaid.slice(1)} got ${r.base_hits}`}. ${r.holdout_lasted} of the ${r.holdout_n} lasted, so ${otherSaid} would have got ${r.holdout_n - r.base_hits}.`;
const scored = data.cases.filter((c) => c.band !== 'check back 2027'), later = data.cases.filter((c) => c.band === 'check back 2027');

const SLIDES = {
  1: () => win('BRING_BACK.EXE', `
    <h1 class="s">Can you see a comeback coming?</h1>
    <p class="lede">This is a year of people searching for a product, before the brand said it was coming back. Would you bring it back?</p>
    ${screen(hook, ['CASE ??', esc((CAT[hook.cat] || hook.cat).toUpperCase())])}
    <div class="actions"><span class="gel gel--go">Bring it back</span><span class="gel">Leave it</span></div>
    <p class="small">Answer on the last slide.</p>`),
  2: () => win('QUESTION.TXT', `
    <h1 class="s">Brands bring things back all the time</h1>
    <p class="lede">Fans ask for a discontinued snack, a lip gloss, a sneaker. Sometimes the brand listens. Some stay for good. Some vanish again.</p>
    <p class="lede"><b>My question:</b> if fans are already searching for it before the brand says a word, does that comeback last?</p>
    <p class="lede">${r.sourced} real US comebacks from 2014 to 2025 were sourced in food and drink, beauty and sportswear, flops included. The ${data.cases.length} with enough search data were measured.</p>`),
  3: () => win('METHOD.TXT', `
    <h2 class="s">One number per comeback</h2>
    ${screen(byId[picks.method], ['SEARCHES', 'BEFORE THE NEWS'], { avgs: true })}
    <ol class="steps">
      <li><span>Average searches in the last 3 months before the announcement (the right dashed line), divided by the 9 months before that (the left one).</span></li>
      <li><span>Divide by the same number for the brand, so a brand that's growing anyway doesn't count.</span></li>
      <li><span>Set the cut-off on 2014 to 2020. Test it once on 2021 to 2023.</span></li>
    </ol>
    <p class="small">Rules written and dated before any case's curve was pulled. "Lasted" means still sold as a regular item two years later; repeat limited runs don't count.</p>`),
  4: () => caseSlide(byId[picks.cases[0]], 1),
  5: () => caseSlide(byId[picks.cases[1]], 2),
  6: () => caseSlide(byId[picks.cases[2]], 3),
  7: () => win('RESULT.TXT', `
    <h2 class="s">${beat ? 'Buzz helped, a little' : "Buzz didn't pick the keepers"}</h2>
    <p class="lede">${verdict}</p>
    ${ciChart()}
    <p class="small">Held-out hit rate with its 95% bootstrap range, n = ${r.holdout_n}. One case moves it ${Math.round(100 / r.holdout_n)} points, so ${tie ? 'treat it as a tie, not a verdict' : 'read it with its range'}.</p>`),
  8: () => win('SO_WHAT.TXT', picks.sowhat.replace('STRONG', `${data.rising15.lasted[0] + data.rising15.faded[0]}`).replace('RISE', `${data.rising.lasted[0] + data.rising.faded[0]} of ${data.rising.lasted[1] + data.rising.faded[1]}`).replace('FADED', `${data.rising.faded[0]} of ${data.rising.faded[1]}`)),
  9: () => win('BRING_BACK.EXE', `
    <h1 class="s">Your turn</h1>
    <p class="lede">Call three comebacks blind against the rule, then read the whole study: every case, every source, and the rule's ${r.forward_n} dated calls on 2024 and 2025 comebacks.</p>
    <p class="lede"><b>The rule's sportswear calls:</b> ${later.filter((c) => c.cat === 'sportswear').map((c) => `${esc(c.name)}, ${said(c.call === 'LASTS').toLowerCase()}`).join('. ')}. Not scored: the rules left 2024 and 2025 out before any data, and ${later.filter((c) => `${+c.announced.slice(0, 4) + 2}${c.announced.slice(4)}` <= data.made).length} of the ${r.forward_n} have now passed 24 months. Trade press said in February 2026 that the Speedcat relaunch fell short.</p>
    <p class="lede"><b>Slide 1 was ${esc(hook.name)}.</b> ${OUT[hook.outcome]}.</p>
    <p class="url">TAHSINANAN15.GITHUB.IO</p>
    <p class="small">Sportswear is only ${scored.filter((c) => c.cat === 'sportswear').length} of the ${scored.length} scored comebacks: several sneaker returns were too thin in search data to measure, and others couldn't be dated. Start menu, then Comeback study. Study by Tahsin Anan, with research and build support.</p>`),
};
document.getElementById('root').innerHTML = `<div class="slide${[2, 7, 8, 9].includes(S) ? ' roomy' : ''}">${SLIDES[S]()}</div>`;
document.getElementById('page').textContent = `${S}/${N}`;
// the window icon symbol lives in the site's index.html; borrow it
const sprite = await (await fetch('../../../index.html')).text();
const sym = sprite.match(/<symbol id="i-chart"[\s\S]*?<\/symbol>/)?.[0], grads = sprite.match(/<linearGradient id="g-(page|sky|green|pink)"[\s\S]*?<\/linearGradient>/g) || [];
document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute"><defs>${grads.join('')}</defs>${sym || ''}</svg>`);
await document.fonts.ready;
// The pixelfx burst, on the hook only: 56 CSS px is 112 px in the 2x capture, exactly 2 per sheet pixel.
// It sits low in the shaded LAST 3 band, in empty LCD space under the line, so it points at the weeks to judge without covering any of them.
const band = S === 1 && document.querySelector('.curve .last');
if (band) {
  const b = band.getBoundingClientRect(), img = Object.assign(new Image(56, 56), { src: 'burst.png', className: 'pix', alt: '' });
  img.style.left = `${Math.round(b.left + (b.width - 56) / 2)}px`; img.style.top = `${Math.round(b.bottom - 56 - 6)}px`;
  document.body.append(img); await img.decode();
}
document.body.dataset.ready = '1';
