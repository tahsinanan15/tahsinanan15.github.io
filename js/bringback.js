// BRING_BACK.EXE. Her study of 2014-2025 comebacks, and a round where the visitor calls a few of them blind.
// Every number comes from assets/data/bring_back.json, which _dev/bring_back/study.py writes. Nothing here is typed in by hand.
import { track, countOnce, readCount } from './analytics.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => `${Math.round(x * 100)}%`;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const ROUND = 3, MORE = 8;
let data, deck = [], played = [], ready = false;

const said = (lasts) => (lasts ? 'Bring it back' : 'Leave it');
const lasted = (c) => c.outcome === 'PERMANENT';
const OUT = { PERMANENT: 'Still on sale two years on', 'RECURRING LIMITED': 'Only ever back for limited runs', 'GONE AGAIN': 'Gone again within two years' };
const CAT = { 'food & drink': 'Food and drink', beauty: 'Beauty', sportswear: 'Sportswear' };

// One line on the LCD: the product's own weekly search interest, scaled to its own peak, for the 52 weeks before the news.
function curve(w, label) {
  const W = 320, H = 96, P = 6, n = w.length, top = Math.max(...w, 1);
  const x = (i) => P + i * (W - 2 * P) / (n - 1), y = (v) => H - P - v / top * (H - 2 * P - 8);
  const d = w.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const split = x(n - 13);
  return `<svg class="bb__curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <rect class="bb__last" x="${split}" y="0" width="${W - split}" height="${H}"/>
    <path class="bb__line" d="${d}" pathLength="1"/>
  </svg>`;
}

function card(c, i) {
  const recent = c.w.slice(-13).reduce((a, b) => a + b, 0) / 13, before = c.w.slice(0, 39).reduce((a, b) => a + b, 0) / 39;
  const trend = recent > before * 1.15 ? 'rising' : recent < before / 1.15 ? 'falling' : 'flat';
  return `<li class="bb__card" data-i="${i}" aria-roledescription="case" aria-label="Case ${i + 1}">
    <div class="bb__screen">
      <div class="bb__lcd"><span>CASE ${String(i + 1).padStart(2, '0')}</span><span>${esc(CAT[c.cat] || c.cat).toUpperCase()}</span></div>
      ${curve(c.w, `Search interest for an unnamed ${CAT[c.cat]?.toLowerCase() || c.cat} product over the 12 months before its comeback was announced. Its last three months are ${trend} compared with the nine before.`)}
      <div class="bb__lcd bb__lcd--axis"><span>12 MONTHS BEFORE THE NEWS</span><span>LAST 3</span></div>
    </div>
    <p class="bb__ask">A ${esc((CAT[c.cat] || c.cat).toLowerCase())} comeback, announced ${esc(c.announced.slice(0, 4))}. Will it last?</p>
    <div class="actions bb__pick">
      <button class="gel gel--go" type="button" data-pick="1">Bring it back</button>
      <button class="gel" type="button" data-pick="0">Leave it</button>
    </div>
    <div class="bb__reveal" hidden></div>
  </li>`;
}

function reveal(li, c, pick) {
  const right = pick === lasted(c), rule = c.call === 'LASTS', ruleRight = rule === lasted(c);
  played.push({ right, ruleRight, base: (data.result.majority_call === 'LASTS') === lasted(c) });
  track('bb_guess', { case: c.id, said: pick ? 'back' : 'leave', right });
  countOnce(`bb_${c.id}_${pick ? 'y' : 'n'}`);
  const box = li.querySelector('.bb__reveal');
  li.querySelector('.bb__pick').hidden = true;
  li.querySelector('.bb__ask').hidden = true;
  li.classList.add('is-shown');
  box.innerHTML = `
    <h3>${esc(c.name)} <span class="bb__yr">${esc(c.announced.slice(0, 7))}</span></h3>
    <p class="bb__out"><b>${esc(OUT[c.outcome])}.</b> ${esc(c.note)}</p>
    <dl class="cells bb__calls">
      <div><dt>You said</dt><dd>${said(pick)}</dd><dd class="bb__mark">${right ? 'Right' : 'Wrong'}</dd></div>
      <div><dt>Her rule said</dt><dd>${said(rule)}</dd><dd class="bb__mark">${ruleRight ? 'Right' : 'Wrong'}</dd></div>
    </dl>
    <p class="note">Interest in the last 3 months ran at ${c.ratio.toFixed(2)}x the 9 before, against its brand${c.wiki ? `, from Wikipedia views of the "${esc(c.wiki)}" article${c.wiki !== c.name ? ', which covers the whole line, not just this model' : ''}` : ''}. The rule says bring it back at ${data.threshold.toFixed(2)}x or more.${c.band === 'train' ? ' This case helped set that line.' : ' This case was held out: the line was set without it.'}
      <span class="bb__crowd" data-id="${esc(c.id)}"></span> <a href="${esc(c.url)}" target="_blank" rel="noopener">Source</a></p>
    <div class="actions"><button class="gel gel--go" type="button" data-next>${played.length === $('bb-deck').children.length ? 'See the score' : 'Next case'}</button></div>`;
  crowd(box.querySelector('.bb__crowd'), c.id);
  box.hidden = false;
  box.querySelector('[data-next]').focus({ preventScroll: true });
}

// The crowd line only appears once enough visitors have called this case, and it never says who.
async function crowd(el, id) {
  const [y, n] = await Promise.all([readCount(`bb_${id}_y`), readCount(`bb_${id}_n`)]);
  if (y == null || n == null || y + n < 10) return;
  el.textContent = `${pct(y / (y + n))} of ${y + n} visitors said bring it back.`;
}

function score() {
  const k = played.length, you = played.filter((p) => p.right).length, rule = played.filter((p) => p.ruleRight).length, base = played.filter((p) => p.base).length;
  const left = deck.length - k;
  $('bb-score').innerHTML = `
    <ul class="lcds">
      <li><b>${you}/${k}</b><span>You</span></li>
      <li><b>${rule}/${k}</b><span>Her rule</span></li>
      <li><b>${base}/${k}</b><span>Saying "${said(data.result.majority_call === 'LASTS').toLowerCase()}" every time</span></li>
    </ul>
    <div class="actions">${left > 0 ? `<button class="gel" type="button" id="bb-more">${Math.min(MORE, left)} more</button>` : ''}<button class="gel" type="button" id="bb-study">Read the study</button></div>`;
  $('bb-score').hidden = false;
  $('bb-more')?.addEventListener('click', () => deal(MORE));
  $('bb-study').addEventListener('click', () => { $('bb-paper').open = true; $('bb-paper').scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth', block: 'start' }); });
  track('bb_score', { you, rule, of: k });
}

function deal(n) {
  const list = $('bb-deck'), from = list.children.length;
  const next = deck.slice(from, from + n);
  if (!next.length) return;
  list.insertAdjacentHTML('beforeend', next.map((c, j) => card(c, from + j)).join(''));
  $('bb-score').hidden = true;
  go(list.children[from]);
}

const mark = (li) => { for (const c of $('bb-deck').children) c.classList.toggle('is-current', c === li); };
function go(li) {
  if (!li) return;
  const list = $('bb-deck');
  mark(li);
  list.scrollTo({ left: li.offsetLeft - list.offsetLeft, behavior: still.matches ? 'auto' : 'smooth' });
  li.querySelector('[data-pick], [data-next]')?.focus({ preventScroll: true });
}

// The base call is named, and so is the opposite guess, because an interviewer will ask about both.
const baseGuess = (r) => `always saying "${said(r.majority_call === 'LASTS').toLowerCase()}"`;
const otherGuess = (r) => `always saying "${said(r.majority_call !== 'LASTS').toLowerCase()}"`;
function finding(r) {
  const [lo, hi] = r.rule_ci.map(pct);
  const vs = r.rule_hits > r.base_hits ? 'more than' : r.rule_hits === r.base_hits ? 'the same as' : 'fewer than';
  return `The rules were dated before any data was pulled, then tested once on ${r.holdout_n} comebacks the rule had never seen. Buzz before the news didn't pick the keepers: ${r.rule_hits} of ${r.holdout_n} right, ${vs} ${baseGuess(r)} (range ${lo} to ${hi}).`;
}
const otherLine = (r) => `${r.holdout_lasted} of those ${r.holdout_n} lasted, so ${otherGuess(r)} would have got ${r.holdout_n - r.base_hits}.`;
const risingLine = (d) => {
  const [a, n1] = d.rising.lasted, [b, n2] = d.rising.faded;
  return `Interest was already rising, compared with the brand, before ${a + b} of ${n1 + n2} comebacks: ${a} of the ${n1} that lasted and ${b} of the ${n2} that didn't. A rise before the news is normal, so on its own it doesn't separate them (exploratory).`;
};

function paper() {
  const r = data.result, rows = data.cases;
  const tr = (c) => `<tr class="${c.band === 'holdout' ? 'is-hold' : ''}"><td>${esc(c.name)}</td><td>${esc(c.announced.slice(0, 7))}</td><td>${c.ratio.toFixed(2)}</td><td>${c.call === 'LASTS' ? 'Lasts' : 'Fades'}</td><td>${c.band === 'check back 2027' ? 'Check back 2027' : esc(OUT[c.outcome])}</td><td><a href="${esc(c.url)}" target="_blank" rel="noopener">Source</a></td></tr>`;
  const band = (b, h) => `<h3>${h}</h3><div class="tbl-wrap"><table><thead><tr><th>Comeback</th><th>Announced</th><th>Ratio</th><th>Rule</th><th>What happened</th><th></th></tr></thead><tbody>${rows.filter((c) => c.band === b).map(tr).join('')}</tbody></table></div>`;
  return `
    <summary><h2>The study</h2></summary>
    <p><b>Question.</b> When fans are already looking a product up before a brand says it's coming back, does the comeback last?</p>
    <p><b>Cases.</b> ${r.sourced} US comebacks from 2014 to 2025 in food and drink, beauty and sportswear, each with a sourced announcement date and a sourced outcome. I went looking for flops on purpose, so this isn't a list of winners. ${rows.length} had enough search data to measure; the rest are listed with the reason in the study files.</p>
    <p><b>Outcome</b>, from what the company did in the 24 months after announcing: still on sale (lasted), back only for limited runs, or gone again. I wrote these rules down and dated them before pulling a single curve.</p>
    <p><b>Signal.</b> Weekly Google search interest in the US for the 12 months before the news. The last 3 months divided by the 9 before, then divided by the same number for the parent brand, so a brand that's growing anyway doesn't count. Wikipedia pageviews stand in where search is too thin to read. This measures attention, not sales.</p>
    <p><b>Test.</b> I set the line (${data.threshold.toFixed(2)}x) on the ${r.train_n} comebacks from 2014 to 2020, then scored it once on the ${r.holdout_n} from 2021 to 2023 without changing it.</p>
    <ul class="lcds lcds--sm">
      <li><b>${r.rule_hits}/${r.holdout_n}</b><span>Her rule, held-out cases</span></li>
      <li><b>${r.base_hits}/${r.holdout_n}</b><span>Always "${said(r.majority_call === 'LASTS').toLowerCase()}"</span></li>
      <li><b>${r.holdout_n - r.base_hits}/${r.holdout_n}</b><span>Always "${said(r.majority_call !== 'LASTS').toLowerCase()}"</span></li>
      <li><b>${pct(r.rule_ci[0])}-${pct(r.rule_ci[1])}</b><span>95% bootstrap range</span></li>
    </ul>
    <p class="verdict">${esc(finding(r))} ${esc(otherLine(r))} With ${r.holdout_n} held-out cases, one comeback moves the hit rate by ${Math.round(100 / r.holdout_n)} points, so read it with its range.</p>
    <p>Of the ${r.train_n} older cases, ${r.train_lasted} lasted${r.train_lasted * 2 === r.train_n ? `, an even split, so the base call came from a tie rule set in advance: a tie means "${said(false).toLowerCase()}"` : ''}.</p>
    <h3>What did show up (exploratory)</h3>
    <p>${esc(risingLine(data))} Found after the test, so it's a lead to check, not a result. Only comebacks that happened were studied, so it can't say whether a rise means one is coming; leaks and teasers before the official date may add to it.</p>
    ${band('holdout', 'Held out, 2021 to 2023')}
    ${band('train', 'Used to set the line, 2014 to 2020')}
    ${band('check back 2027', 'Called now, scored in 2027')}
    <p class="note">The dated rules, every source, the weekly data and the script that rebuilds these numbers are in the study files. Made ${esc(data.made)}.</p>`;
}

export async function init() {
  if (ready) return;
  ready = true;
  try {
    const res = await fetch($('bringback').dataset.src);
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    ready = false;
    $('bb-root').querySelector('.insight').textContent = "The study data didn't load. Close this window and try again.";
    return;
  }
  // Held-out cases first: the rule never saw them, so its score on them is the honest one. Then the rest, shuffled.
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const scored = data.cases.filter((c) => c.band !== 'check back 2027');
  deck = [...shuffle(scored.filter((c) => c.band === 'holdout')), ...shuffle(scored.filter((c) => c.band === 'train'))];
  $('bb-root').innerHTML = `
    <h2 id="bb-h">Can fans call a comeback?</h2>
    <p class="insight">${esc(finding(data.result))}</p>
    <p>${esc(otherLine(data.result))} ${esc(risingLine(data))}</p>
    <p>Here's the line I read for each one: how much people searched for it in the year before the brand said anything. Your turn. No names until you call it.</p>
    <ol class="bb__deck" id="bb-deck" aria-label="Cases"></ol>
    <div class="bb__score" id="bb-score" hidden></div>
    <details class="bb__paper" id="bb-paper">${paper()}</details>`;
  const list = $('bb-deck');
  list.addEventListener('scroll', () => {   // a swipe moves the current case too
    const [a, b] = list.children, step = b ? b.offsetLeft - a.offsetLeft : 1;
    mark(list.children[Math.round(list.scrollLeft / step)]);
  }, { passive: true });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button'), li = b?.closest('.bb__card');
    if (!li) return;
    if (b.dataset.pick) reveal(li, deck[+li.dataset.i], b.dataset.pick === '1');
    else if ('next' in b.dataset) {
      b.disabled = true;
      if (played.length === list.children.length) { score(); $('bb-score').scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth', block: 'nearest' }); ($('bb-more') || $('bb-study')).focus({ preventScroll: true }); }
      else go(li.nextElementSibling);
    }
  });
  deal(ROUND);
}
