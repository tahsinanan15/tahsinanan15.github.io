// OBSERVE.EXE. Three real analyses, no invented numbers: this visit, the live headline test, and her paintings.
import { session, variant, HEADLINES, readCounts, sawBothHeadlines } from './analytics.js';
import { wilson, twoProp, sampleSize, splitCheck } from './stats.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
let ready = false, counts, countsAt = 0, pending = null;

async function getCounts() {
  if (Date.now() - countsAt > 15000) {
    pending ||= readCounts().then((c) => { counts = c; countsAt = Date.now(); pending = null; return c; });
    return pending;
  }
  return counts;
}

const REQUIRED = sampleSize(.10, .20);   // chosen before any data came in: 10% baseline, detect a lift to 20%, 80% power
const FINAL = null;   // paste { a_seen, a_conv, b_seen, b_conv } the day both versions pass 199, and the result freezes

/* ---------- Tab 1: this visit ---------- */
const RULES = [
  ['Hiring', (e) => e.name === 'case_read', 3, 'engaged with the case study'],
  ['Hiring', (e) => e.name === 'conversion' && e.params.type === 'resume', 5, 'opened the resume'],
  ['Hiring', (e) => e.name === 'contact_click' && !/commission/i.test(e.params.via), 6, 'reached for my contact details'],
  ['Hiring', (e) => e.name === 'rundown_finish', 3, 'watched the whole rundown'],
  ['Hiring', (e) => e.name === 'window_open' && e.params.window === 'design', 2, 'opened the design work'],
  ['Art lover', (e) => e.name === 'window_open' && e.params.window === 'art', 3, 'opened my art'],
  ['Art lover', (e) => e.name === 'view_art', 1, 'looked closely at a piece'],
  ['Art lover', (e) => e.name === 'contact_click' && /commission/i.test(e.params.via), 6, 'asked about commissions'],
  ['Art lover', (e) => e.name === 'wallpaper_set', 1, 'changed the wallpaper'],
  ['Player', (e) => e.name === 'window_open' && (e.params.window === 'bubblepop' || e.params.window === 'paint'), 3, 'opened a game'],
  ['Player', (e) => e.name === 'bubble_pop', .5, 'popped a bubble'],
  ['Player', (e) => e.name === 'game_score', 1, 'scored in Bubble Pop'],
  ['Listener', (e) => e.name === 'track_play' && !e.params.auto, 2, 'picked a song'],
  ['Listener', (e) => e.name === 'window_open' && e.params.window === 'player', 1, 'went back to the player'],
];
const SEGMENTS = ['Hiring', 'Art lover', 'Player', 'Listener'];
const READ = {
  none: ["You just got here. I'm taking notes.", null, null],
  Hiring: ["You've been checking the work. You're probably hiring.", 'Email me', 'mailto:tahsinanan6@gmail.com'],
  'Art lover': ['You keep coming back to my art.', 'Ask me about commissions', 'mailto:tahsinanan6@gmail.com?subject=Commission%20inquiry'],
  Player: ['You came to a portfolio and played a game.', 'My resume is one click away', '#resume'],
  Listener: ["You're here for the music.", 'See what else I love', '#things'],
};
function score() {
  const totals = Object.fromEntries(SEGMENTS.map((s) => [s, 0])), why = Object.fromEntries(SEGMENTS.map((s) => [s, new Map()]));
  for (const e of session.events) for (const [seg, test, pts, label] of RULES) if (test(e)) { totals[seg] += pts; why[seg].set(label, (why[seg].get(label) || 0) + 1); }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  const top = sum >= 3 ? SEGMENTS.reduce((a, b) => (totals[b] > totals[a] ? b : a)) : null;
  return { totals, sum, top, why: top ? [...why[top]].map(([l, n]) => (n > 1 ? `${l} (${n}x)` : l)) : [] };
}
const FUNNEL = [['visit', 'Arrived'], ['case', 'Engaged with the case'], ['resume', 'Opened resume'], ['contact', 'Clicked to contact']];

function renderVisit() {
  const { totals, sum, top, why } = score();
  const secs = Math.round(session.engagedMs / 1000);
  const opened = session.events.filter((e) => e.name === 'window_open').length;
  const converted = session.events.some((e) => e.name === 'conversion');
  const engaged = secs >= 10 || converted || opened >= 2;
  const [line, cta, href] = READ[top || 'none'];
  const log = session.events.slice(-14).reverse().map((e) => {
    const t = Math.round(e.t / 1000), p = Object.entries(e.params).map(([k, v]) => `${k}=${v}`).join(' ');
    return `<div><time>${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}</time> ${esc(e.name)} ${esc(p)}</div>`;
  }).join('');
  const panel = $('obs-visit');
  const scroll = panel.querySelector('.log')?.scrollTop || 0;
  panel.innerHTML = `
    <h2 id="obs-h">What I've noticed about you</h2>
    <p class="insight">${esc(line)}</p>
    ${cta ? `<div class="actions nba"><a class="gel gel--go" href="${href}" ${href.startsWith('#') ? `data-open="${href.slice(1)}"` : href.includes('Commission') ? 'data-conv="commission"' : 'data-conv="contact"'}>${esc(cta)}</a></div>` : ''}
    <dl class="cells">
      <div><dt>Engaged time</dt><dd>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</dd></div>
      <div><dt>Windows you opened</dt><dd>${opened}</dd></div>
      <div><dt>Events logged</dt><dd>${session.events.length}</dd></div>
      <div><dt>Engaged session</dt><dd>${engaged ? 'Yes' : 'Not yet'}</dd></div>
    </dl>
    <div class="split split--2">
      <div>
        <h3>My guess at your segment</h3>
        <ul class="barlist">${SEGMENTS.map((s) => `<li class="${s === top ? 'is-you' : ''}"><span>${s}</span><span class="track"><span class="fill" style="width:${sum ? totals[s] / sum * 100 : 0}%"></span></span><span class="val">${totals[s]} pts</span></li>`).join('')}</ul>
        <p class="why">${top ? `Because you ${esc(new Intl.ListFormat('en-GB').format(why))}. ` : 'Open something and watch it change. '}Rule-based: points I set by hand, not a model.</p>
      </div>
      <div>
        <h3>Your event log</h3>
        <div class="log" tabindex="0" role="group" aria-label="Your session events, newest first">${log || '<div>Waiting for your first move.</div>'}</div>
      </div>
    </div>
    <h3>Site totals</h3>
    <div id="funnel">${$('funnel')?.innerHTML || '<p class="note">Loading the totals.</p>'}</div>
    <p class="note">An engaged session adapts the GA4 rule: over 10 seconds in view, a conversion, or two or more windows opened.</p>`;
  panel.querySelector('.log').scrollTop = scroll;
  renderFunnel();
}
async function renderFunnel() {
  const c = await getCounts(), box = $('funnel');
  if (!box) return;
  const you = { visit: true, case: !!session.counted.case, resume: !!session.counted.resume, contact: !!session.counted.contact };
  if (!c) {
    box.innerHTML = `<p class="note">The site-wide totals aren't reachable right now, so here's only you: ${FUNNEL.filter(([k]) => you[k]).map(([, l]) => l.toLowerCase()).join(', ')}.</p>`;
    return;
  }
  const n = Math.max(c.visit, 1);
  box.innerHTML = `<ul class="barlist">${FUNNEL.map(([k, l]) => `<li><span>${l}${you[k] ? ' <b>(you)</b>' : ''}</span><span class="track"><span class="fill" style="width:${c[k] / n * 100}%"></span></span><span class="val">${c[k].toLocaleString()} ${k === 'visit' ? '' : `(${pct(c[k] / n)})`}</span></li>`).join('')}</ul>
    <p class="note">${c.visit < 100 ? `Small sample, n = ${c.visit}. Read this as direction, not a result. ` : ''}Each step is counted on its own, so people can skip steps. Counts are per session, and automated browsers are excluded.</p>`;
}

/* ---------- Tab 2: the live headline test ---------- */
async function renderAB() {
  sawBothHeadlines();
  const panel = $('obs-ab');
  panel.innerHTML = `<h2>I couldn't pick a headline, so I'm testing both</h2><p class="note">Loading live results.</p>`;
  const c = FINAL || await getCounts();
  const a = { x: c?.a_conv || 0, n: c?.a_seen || 0 }, b = { x: c?.b_conv || 0, n: c?.b_seen || 0 };
  const test = twoProp(a.x, a.n, b.x, b.n), row = (k, g) => {
    const [lo, hi] = wilson(g.x, g.n);
    return `<tr class="${variant === k ? 'is-yours' : ''}"><td><b>${k}</b>${variant === k ? ' (you saw this)' : ''}</td><td>${g.n.toLocaleString()}</td><td>${g.x.toLocaleString()}</td><td>${g.n ? pct(g.x / g.n, 1) : 'n/a'}</td><td>${g.n ? `${pct(lo, 1)} to ${pct(hi, 1)}` : 'n/a'}</td></tr>`;
  };
  const enough = Math.min(a.n, b.n) >= REQUIRED;
  const winner = a.x / (a.n || 1) > b.x / (b.n || 1) ? 'A' : 'B';
  const verdict = !c ? "The live counter isn't reachable right now. The test keeps running when it's back."
    : a.n + b.n === 0 ? 'No browsers counted yet. Everyone who arrives from here on is in the test.'
    : !enough ? `Too early to call: ${Math.min(a.n, b.n).toLocaleString()} of ${REQUIRED} browsers per version. I won't pick a winner before that, because checking early inflates false positives.`
    : !FINAL ? 'Reached the planned sample. I read it once, then freeze these numbers.'
    : test.p < .05 ? `Version ${winner} wins: p = ${test.p.toFixed(3)}. That's the headline I'll keep.`
    : `No clear winner at the planned sample: p = ${test.p.toFixed(2)}. This test only sees big lifts, so a smaller one could still be real. I'd keep either and test something bolder.`;
  panel.innerHTML = `
    <h2>I couldn't pick a headline, so I'm testing both</h2>
    <dl class="vs">
      <div><dt><b>A</b></dt><dd>${esc(HEADLINES.A)}</dd></div>
      <div><dt><b>B</b></dt><dd>${esc(HEADLINES.B)}</dd></div>
    </dl>
    <p class="verdict">${esc(verdict)}</p>
    ${chartCI(a, b)}
    <div class="tbl-wrap"><table><thead><tr><th>Version</th><th>Browsers</th><th>Conversions</th><th>Rate</th><th>95% interval</th></tr></thead><tbody>${row('A', a)}${row('B', b)}</tbody></table></div>
    <h3>The plan, set before the data</h3>
    <ul>
      <li><b>Hypothesis:</b> the headline changes whether a visitor takes the next step.</li>
      <li><b>Unit:</b> one browser, so a returning visitor keeps their version. A new device counts as new.</li>
      <li><b>Conversion:</b> that browser opened the resume or clicked a contact link. I can't see whether an email got sent. Anyone who opens this tab has seen both headlines, so their conversions stop counting.</li>
      <li><b>Assignment:</b> random 50/50.${a.n + b.n >= 20 ? ` Split check: ${pct(a.n / (a.n + b.n))} to ${pct(b.n / (a.n + b.n))}, ${splitCheck(a.n, b.n) < .01 ? 'which is off, so I would check the setup before trusting this' : 'as expected'}.` : ''}</li>
      <li><b>Sample size:</b> ${REQUIRED} per version, enough to see a big lift: 10% (my assumption) to 20%, at 95% confidence and 80% power.</li>
      <li><b>Stopping:</b> I read it once, at ${REQUIRED} per version.</li>
      <li><b>Test:</b> two-proportion z-test${FINAL ? `. Result: z = ${test.z.toFixed(2)}, p = ${test.p.toFixed(3)}` : ''}. Intervals are Wilson, because they hold up at small samples.</li>
    </ul>`;
}
function chartCI(a, b) {
  if (!a.n && !b.n) return '';
  const hiMax = Math.max(wilson(a.x, a.n)[1], wilson(b.x, b.n)[1], .1), top = Math.min(1, Math.ceil(hiMax * 10) / 10);
  const W = 620, L = 44, R = 24, sx = (v) => L + v / top * (W - L - R);
  const ticks = Array.from({ length: Math.round(top * 10) + 1 }, (_, i) => i / 10).filter((t, i, arr) => arr.length < 7 || i % 2 === 0);
  const rowFor = (g, label, y, col) => {
    if (!g.n) return `<text x="${L}" y="${y + 4}">${label}: no browsers yet</text>`;
    const [lo, hi] = wilson(g.x, g.n), p = g.x / g.n;
    return `<text x="0" y="${y + 4}" style="font-weight:600">${label}</text><line x1="${sx(lo)}" x2="${sx(hi)}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="2" stroke-linecap="round"/><line x1="${sx(lo)}" x2="${sx(lo)}" y1="${y - 5}" y2="${y + 5}" stroke="${col}" stroke-width="2"/><line x1="${sx(hi)}" x2="${sx(hi)}" y1="${y - 5}" y2="${y + 5}" stroke="${col}" stroke-width="2"/><circle cx="${sx(p)}" cy="${y}" r="6" fill="${col}" stroke="#fff" stroke-width="2"><title>${label}: ${pct(p, 1)}, 95% interval ${pct(lo, 1)} to ${pct(hi, 1)}</title></circle>`;
  };
  return `<svg class="chart" viewBox="0 0 ${W} 112" role="img" aria-label="Conversion rate for each headline, with 95% intervals. The table below has the same numbers.">
    ${ticks.map((t) => `<line class="grid" x1="${sx(t)}" x2="${sx(t)}" y1="6" y2="86"/><text x="${sx(t)}" y="104" text-anchor="middle">${pct(t)}</text>`).join('')}
    ${rowFor(a, 'A', 28, '#0b6fd0')}${rowFor(b, 'B', 62, '#c96a00')}
  </svg>`;
}

/* ---------- Tab 3: paintings as a customer base ---------- */
const SEG_COLORS = ['#0b6fd0', '#c96a00', '#6a3fc9', '#2c8f24', '#d6189a'];
const WORDS = [['brighter', 'darker'], ['warmer', 'cooler'], ['more colorful', 'more muted'], ['higher-contrast', 'softer']];
const FEATURE_NAMES = ['Brightness', 'Warmth', 'Chroma', 'Contrast'];
function describe(center) {
  const ranked = center.map((v, i) => [Math.abs(v), i, v]).sort((a, b) => b[0] - a[0]).filter((r) => r[0] >= .4).slice(0, 2);
  return ranked.length ? ranked.map(([, i, v]) => WORDS[i][v > 0 ? 0 : 1]).join(', ') : 'balanced';
}
let art = null, artK = 3;
async function renderArt() {
  const panel = $('obs-art');
  if (!art) {
    panel.innerHTML = '<h2>My art, segmented like customers</h2><p class="note">Measuring.</p>';
    art = await (await fetch('assets/data/paintings.json')).json();
  }
  const m = art.models[artK], P = art.paintings;
  const sil = Object.entries(art.models).map(([k, v]) => [+k, v.silhouette]);
  const sizes = m.centers.map((_, i) => m.labels.filter((l) => l === i).length);
  const outliers = P.map((p) => ({ p, flags: p.z.map((z, i) => [z, i]).filter(([z]) => Math.abs(z) >= 2) })).filter((o) => o.flags.length).sort((a, b) => b.flags.length - a.flags.length);
  const xs = P.map((p) => p.warmth), ys = P.map((p) => p.brightness);
  const W = 640, H = 400, L = 46, B = 40, T = 12, Rr = 18, S = 40;
  const xmin = Math.floor(Math.min(...xs) / 5) * 5, xmax = Math.ceil(Math.max(...xs) / 5) * 5, ymin = Math.floor(Math.min(...ys) / 10) * 10, ymax = Math.ceil(Math.max(...ys) / 10) * 10;
  const sx = (v) => L + S / 2 + (v - xmin) / (xmax - xmin) * (W - L - Rr - S), sy = (v) => H - B - S / 2 - (v - ymin) / (ymax - ymin) * (H - B - T - S);
  const xt = []; for (let v = xmin; v <= xmax; v += 10) xt.push(v);
  const yt = []; for (let v = ymin; v <= ymax; v += 10) yt.push(v);
  const order = P.map((p, i) => i).sort((a, b) => P[a].dist - P[b].dist);
  panel.innerHTML = `
    <h2>My art, segmented like customers</h2>
    <p class="insight">Observation is the job, so I measured my own work.</p>
    <p>Each piece is a row of real pixel data: brightness, warmth, chroma and contrast. Standardize, cluster with k-means, then ask the question I'd ask of any segmentation: would you act differently on these groups?</p>
    <div class="ktool"><label for="art-k"><b>Segments: k = ${artK}</b></label><input type="range" id="art-k" min="2" max="5" step="1" value="${artK}"><span>Silhouette ${m.silhouette.toFixed(2)}</span></div>
    <ul class="legend">${m.centers.map((c, i) => `<li><i style="background:${SEG_COLORS[i]}"></i>${describe(c)} (${sizes[i]})</li>`).join('')}</ul>
    <div style="position:relative" id="art-chart">
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Scatter plot of 19 pieces by warmth and brightness, colored by segment. The table below has the same data.">
        <defs><clipPath id="thumb-clip"><rect width="${S}" height="${S}" rx="5"/></clipPath></defs>
        ${xt.map((v) => `<line class="grid" x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - B}"/><text x="${sx(v)}" y="${H - B + 16}" text-anchor="middle">${v}</text>`).join('')}
        ${yt.map((v) => `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${L - 7}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`).join('')}
        <text x="${(W + L) / 2}" y="${H - 4}" text-anchor="middle">Warmer: mean b* + ½a*</text>
        <text transform="translate(12 ${(H - B) / 2}) rotate(-90)" text-anchor="middle">Brighter: mean L*</text>
        ${order.map((i) => { const p = P[i], c = SEG_COLORS[m.labels[i]], x = sx(p.warmth) - S / 2, y = sy(p.brightness) - S / 2; return `<g class="dot" tabindex="0" role="button" data-slug="${p.slug}" data-i="${i}" aria-label="${esc(p.title)}, ${describe(m.centers[m.labels[i]])} segment. Warmth ${p.warmth}, brightness ${p.brightness}. Open the piece." transform="translate(${x} ${y})"><rect x="-3" y="-3" width="${S + 6}" height="${S + 6}" rx="7" fill="#fff"/><image href="assets/art/thumb/${p.slug}.webp" width="${S}" height="${S}" preserveAspectRatio="xMidYMid slice" clip-path="url(#thumb-clip)"/><rect x="-1.500" y="-1.500" width="${S + 3}" height="${S + 3}" rx="6" fill="none" stroke="${c}" stroke-width="3"/></g>`; }).join('')}
      </svg>
      <div class="chart-tip" id="art-tip" hidden></div>
    </div>
    <div class="split split--2">
      <div>
        <h3>How many segments?</h3>
        <ul class="barlist">${sil.map(([k, s]) => `<li class="${k === artK ? 'is-you' : ''}"><span>k = ${k}</span><span class="track"><span class="fill" style="width:${s / .4 * 100}%"></span></span><span class="val">${s.toFixed(2)}</span></li>`).join('')}</ul>
        <p class="why">k = 2 scores highest, but 0.30 is weak structure, so these don't fall into tidy groups. k = 3 scores a little lower and splits off the three darkest pieces. I show it because it's easier to talk about.</p>
      </div>
      <div>
        <h3>What stands out</h3>
        <ul>${outliers.map(({ p, flags }) => `<li><b>${esc(p.title)}:</b> ${flags.map(([z, i]) => `${FEATURE_NAMES[i].toLowerCase()} ${z > 0 ? '+' : ''}${z.toFixed(1)}σ`).join(', ')}.</li>`).join('')}</ul>
        <p class="why">An outlier is either an error or the interesting part, so you check. Sunflowers is far out on warmth and chroma, but those two move together (r = 0.87), so that's one signal, not two. At 2σ, 76 checks flag about 3 by chance, and I got 3. These are leads.</p>
      </div>
    </div>
    <h3>Does it beat noise?</h3>
    <p>A typical random blob with the same correlations scores ${art.blob[2].median} at k = 2. Mine scores ${art.models[2].silhouette.toFixed(2)}. ${art.blob[2].atLeast >= .05 ? "So the score alone can't tell my art from a blob." : "That's more than a blob gives by chance."} What holds up is smaller: in 300 resamples, Sunflowers and Jersey 19 stayed together ${pct(art.together['3-7'])} of the time. Sunflowers and Flower Basket, ${pct(art.together['3-10'])}.</p>
    ${artK === 3 ? `<h3>So what</h3><p>If these were customers, I'd test the warm, colorful group (4 of 19) as one campaign before funding it, because only two pairs in it hold up: Sunflowers with Jersey 19, and Flower Basket with Flowers and Gloves.</p>` : ''}
    <details><summary>The data behind the chart</summary>
      <div class="tbl-wrap"><table><thead><tr><th>Piece</th><th>Brightness</th><th>Warmth</th><th>Chroma</th><th>Contrast</th><th>Segment</th></tr></thead><tbody>${P.map((p, i) => `<tr><td>${esc(p.title)}</td><td>${p.brightness}</td><td>${p.warmth}</td><td>${p.chroma}</td><td>${p.contrast}</td><td>${m.labels[i] + 1}</td></tr>`).join('')}</tbody></table></div>
      <p><a href="assets/data/tahsin-analysis.xlsx">Download the workbook</a>: the same data with live formulas, plus a calculator for the headline test.</p>
      <p class="note">CIELAB means over each piece, photo edges cropped by 6%. Features are z-scored. k-means with 400 random restarts per k, keeping the lowest inertia.</p>
    </details>`;
  $('art-k').addEventListener('change', (e) => { artK = +e.target.value; renderArt().then(() => $('art-k').focus()); });
  const chart = $('art-chart'), tip = $('art-tip');
  const show = (g) => {
    const p = P[+g.dataset.i], r = g.getBoundingClientRect(), c = chart.getBoundingClientRect();
    tip.innerHTML = `<b>${esc(p.title)}</b><br>Warmth ${p.warmth}, brightness ${p.brightness}<br>Chroma ${p.chroma}, contrast ${p.contrast}`;
    tip.hidden = false;
    tip.style.left = `${Math.min(r.right - c.left + 6, c.width - 210)}px`;
    tip.style.top = `${Math.max(0, r.top - c.top - 6)}px`;
  };
  chart.querySelectorAll('.dot').forEach((g) => {
    g.addEventListener('pointerenter', () => show(g));
    g.addEventListener('focus', () => show(g));
    g.addEventListener('pointerleave', () => { tip.hidden = true; });
    g.addEventListener('blur', () => { tip.hidden = true; });
    const go = () => { document.getElementById(`art-${g.dataset.slug}`)?.closest('a')?.click(); };
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

/* ---------- Tabs ---------- */
const TABS = { visit: renderVisit, ab: renderAB, art: renderArt };
let current = 'visit';
function select(name) {
  current = name;
  for (const k of Object.keys(TABS)) {
    const on = k === name, tab = $(`tab-${k}`);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`obs-${k}`).hidden = !on;
  }
  TABS[name]();
  $('obs-root').scrollTop = 0;
}
export function init(tab) {
  if (!ready) {
    ready = true;
    const names = Object.keys(TABS);
    names.forEach((k, i) => {
      const b = $(`tab-${k}`);
      b.addEventListener('click', () => select(k));
      b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { const n = names[(i + d + names.length) % names.length]; select(n); $(`tab-${n}`).focus(); }
      });
    });
    let queued = false;
    addEventListener('tahsin:track', () => {
      const r = $('observe').getBoundingClientRect();
      if (current !== 'visit' || queued || r.bottom <= 0 || r.top >= innerHeight || !r.width || $('obs-visit').contains(document.activeElement)) return;
      queued = true;
      setTimeout(() => { queued = false; renderVisit(); }, 250);
    });
    setInterval(() => { if (current === 'visit' && !$('obs-visit').hidden && $('observe').offsetParent !== null && !document.hidden) { const c = document.querySelector('#obs-visit .cells dd'); const s = Math.round(session.engagedMs / 1000); if (c) c.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } }, 1000);
  }
  select(tab || current);
}
