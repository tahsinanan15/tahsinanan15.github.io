// First-party analytics. The event log never leaves this browser. Only anonymous totals are counted,
// once per session, on the live site, and automated browsers are excluded.
const API = 'https://abacus.jasoncameron.dev';
const NS = 'tahsinanan15-portfolio';

// Storage can be blocked outright, and just reading the property then throws. So it's only ever touched inside a try.
const store = {
  get(area, key) { try { return JSON.parse(window[area].getItem(key)); } catch { return null; } },
  set(area, key, value) { try { window[area].setItem(key, JSON.stringify(value)); } catch { /* the session still works in memory */ } },
};
// Tahsin opens the site once with ?me on each device, so her own visits and test clicks stay out of the numbers.
if (new URLSearchParams(location.search).has('me')) store.set('localStorage', 'tahsin.me', 1);
const LIVE = location.hostname.endsWith('github.io') && !navigator.webdriver && !store.get('localStorage', 'tahsin.me');
const timed = (url) => fetch(url, { keepalive: true, signal: AbortSignal.timeout?.(6000) });

const fresh = () => ({ start: Date.now(), events: [], counted: {}, engagedMs: 0 });
export const session = store.get('sessionStorage', 'tahsin.session') || fresh();
const save = () => store.set('sessionStorage', 'tahsin.session', session);

// A/B test: her two headlines. Random, 50/50, and sticky per browser so a returning visitor isn't reassigned.
export const HEADLINES = { A: "Marketing analyst with a designer's eye", B: 'Creative marketer who reads the data' };
export const variant = (() => {
  let v = store.get('localStorage', 'tahsin.ab');
  if (v !== 'A' && v !== 'B') { v = Math.random() < .5 ? 'A' : 'B'; store.set('localStorage', 'tahsin.ab', v); }
  return v;
})();

export const KEYS = ['visit', 'visitor', 'case', 'resume', 'contact', 'a_seen', 'b_seen', 'a_conv', 'b_conv'];

// Funnel steps count once per session. The experiment's unit is the browser, so its counts persist.
async function hit(key, perBrowser = false) {
  const flag = `tahsin.count.${key}`;
  if (perBrowser ? store.get('localStorage', flag) : session.counted[key]) return null;
  if (perBrowser) store.set('localStorage', flag, 1);
  session.counted[key] = 1; save();
  if (!LIVE) return null;
  try {
    const res = await timed(`${API}/hit/${NS}/${key}`);
    if (!res.ok) throw new Error(res.status);
    return Number((await res.json()).value) || null;
  } catch {
    if (perBrowser) store.set('localStorage', flag, 0);   // it never reached the counter, so a later visit can count it
    return null;
  }
}

export async function readCounts() {
  if (!LIVE) return null;
  try {
    const values = await Promise.all(KEYS.map(async (key) => {
      const res = await timed(`${API}/get/${NS}/${key}`);
      if (res.status === 404) return 0;              // never counted yet
      if (!res.ok) throw new Error(res.status);
      return Math.max(0, Number((await res.json()).value) || 0);
    }));
    return Object.fromEntries(KEYS.map((k, i) => [k, values[i]]));
  } catch { return null; }
}

// One aggregate total, e.g. how many visitors called a BRING_BACK case. Null off the live site or when unreachable.
export async function readCount(key) {
  if (!LIVE) return null;
  try {
    const res = await timed(`${API}/get/${NS}/${key}`);
    if (res.status === 404) return 0;
    return res.ok ? Math.max(0, Number((await res.json()).value) || 0) : null;
  } catch { return null; }
}

export function track(name, params = {}) {
  session.events.push({ t: Date.now() - session.start, name, params });
  if (session.events.length > 200) session.events.shift();
  save();
  dispatchEvent(new CustomEvent('tahsin:track', { detail: { name, params } }));
}

export const countOnce = hit;
// Seeing both headlines ends this browser's part in the test: its conversions no longer belong to either version.
export const sawBothHeadlines = () => store.set('localStorage', 'tahsin.ab.seenboth', 1);
// A headline counts as seen once its window is on screen. Someone who never saw one can't convert for it.
export const sawHeadline = () => { if (store.get('localStorage', 'tahsin.ab.seenboth')) return; store.set('localStorage', 'tahsin.ab.seen', 1); hit(variant === 'A' ? 'a_seen' : 'b_seen', true); };

// A conversion is the same for both versions: this browser opened the resume or reached out.
export function convert(kind) {
  if (kind !== 'resume' && kind !== 'contact') return;
  const seen = session.counted[`conv_${kind}`];
  session.counted[`conv_${kind}`] = 1;
  hit(kind);
  if (store.get('localStorage', 'tahsin.ab.seen') && !store.get('localStorage', 'tahsin.ab.seenboth')) hit(variant === 'A' ? 'a_conv' : 'b_conv', true);
  if (!seen) track('conversion', { type: kind, headline: variant });
}

export async function startVisit() {
  const first = !session.counted.visit;
  if (first) track('session_start', { headline: variant });
  const value = await hit('visit');
  hit('visitor', true);   // the same visit, counted once per browser, so a browser that comes back daily is one visitor
  if (value != null) return value;
  if (!LIVE) return null;
  try { const r = await timed(`${API}/get/${NS}/visit`); return r.ok ? Number((await r.json()).value) || null : null; } catch { return null; }
}

// GA4 counts a session as engaged after 10 seconds in view, so this clock only runs while the tab is visible.
setInterval(() => { if (!document.hidden) { session.engagedMs += 1000; if (session.engagedMs % 5000 === 0) save(); } }, 1000);
