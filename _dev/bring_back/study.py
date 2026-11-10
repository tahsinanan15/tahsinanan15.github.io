#!/usr/bin/env python3
"""BRING_BACK study, end to end. Rules are in RUBRIC.md and were committed before any curve was pulled.

  python3 study.py pull    # fetch any missing series into raw/ (Google Trends, Wikipedia fallback). Slow, polite.
  python3 study.py         # compute everything from cases.csv + raw/, write the outputs. Fast, offline.

Needs pandas and numpy; `pull` also needs pytrends. Outputs:
  bring_back_study.csv            one row per case, opens in Excel / Google Sheets
  results.md                      the holdout table, interval and base rate
  ../../assets/data/bring_back.json   what the site's window ships (pre-announcement weeks only)
"""
import csv, json, sys, time, urllib.request, urllib.parse
from datetime import date, timedelta
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / 'raw'
SITE_JSON = HERE.parent.parent / 'assets' / 'data' / 'bring_back.json'
UA = 'BringBackStudy/1.0 (portfolio analysis; contact via github.com/tahsinanan15)'
TRAIN, HOLD = (2014, 2020), (2021, 2023)
EMPTY = {'reebok_aztrek', 'nike_air_max_1_86_big_bubble'}   # Google Trends exported no rows at all for these terms (too little search)
UNMEASURED = {'cajun_rice': "the hand export came back for the wrong term ('cajun rice'), so it was not used; unmeasured (RUBRIC addendum 2026-11-10)"}


def announce_day(s):
    """'2016-06-20' or '2016-06' -> date. Month-only is the 1st (RUBRIC addendum)."""
    p = [int(x) for x in s.split('-')]
    return date(p[0], p[1], p[2] if len(p) > 2 else 1)


def window_weeks(a):
    """The 52 Sunday-start weeks whose last day (Saturday) is before the announcement."""
    last_sat = a - timedelta(days=1)
    while last_sat.weekday() != 5: last_sat -= timedelta(days=1)
    first_sun = last_sat - timedelta(days=52 * 7 - 1)
    return [first_sun + timedelta(weeks=i) for i in range(52)]


# ---------- pulling ----------
def trends(terms, start, end):
    from pytrends.request import TrendReq
    for attempt in range(6):
        try:
            p = TrendReq(hl='en-US', tz=0)
            p.build_payload(terms, timeframe=f'{start} {end}', geo='US')
            df = p.interest_over_time()
            if df.empty: return pd.DataFrame({t: [] for t in terms})
            return df.drop(columns='isPartial')
        except Exception as e:
            wait = 90 * (attempt + 1)
            print('   trends retry', attempt, type(e).__name__, f'wait {wait}s'); time.sleep(wait)
    raise RuntimeError('trends failed')


def pageviews(article, start, end):
    url = ('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
           f'{urllib.parse.quote(article, safe="")}/daily/{start:%Y%m%d}/{end:%Y%m%d}')
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
                items = json.load(r)['items']
            return pd.Series({pd.Timestamp(i['timestamp'][:8]): i['views'] for i in items}, dtype=float)
        except urllib.error.HTTPError as e:
            if e.code == 404: return pd.Series(dtype=float)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('pageviews failed ' + article)


def pull(cases):
    RAW.mkdir(exist_ok=True)
    for c in cases:
        weeks = window_weeks(announce_day(c['announced']))
        # one extra week each side, so Google's week alignment never cuts the window short
        start, end = weeks[0] - timedelta(days=7), weeks[-1] + timedelta(days=13)
        for kind, terms in (('own_p', [c['search_term']]), ('own_c', [c['control_term']]),
                            ('joint', [c['search_term'], c['control_term']])):
            f = RAW / f"{c['id']}.{kind}.csv"
            if f.exists(): continue
            print(c['id'], kind, terms)
            trends(terms, start, end).to_csv(f); time.sleep(45)
        for kind, art in (('wiki_p', c.get('wiki_article')), ('wiki_c', c.get('wiki_control'))):
            f = RAW / f"{c['id']}.{kind}.csv"
            if not art or f.exists() or weeks[0] < date(2015, 7, 1): continue
            print(c['id'], kind, art)
            pageviews(art, weeks[0], weeks[-1] + timedelta(days=6)).rename('views').to_csv(f); time.sleep(1.5)


def import_exports(folder, cases):
    """Read Google Trends 'Download CSV' files (multiTimeline*.csv, any names) and file each under its case, matched by term and dates."""
    RAW.mkdir(exist_ok=True)
    want = {}
    for c in cases:
        w0 = window_weeks(announce_day(c['announced']))[0]
        for kind, term in (('own_p', c['search_term']), ('own_c', c['control_term'])):
            want.setdefault(term.lower(), []).append((w0, RAW / f"{c['id']}.{kind}.csv"))
    done = 0
    for f in sorted(Path(folder).glob('multiTimeline*.csv')):
        lines = [l for l in f.read_text(encoding='utf-8-sig').splitlines() if l.strip()]
        head = next((i for i, l in enumerate(lines) if l.lower().startswith(('week,', 'day,', 'month,'))), None)
        if head is None: print('skip, not a Trends export:', f.name); continue
        term = lines[head].split(',', 1)[1].rsplit(':', 1)[0].strip().strip('"').lower()
        rows = [l.split(',') for l in lines[head + 1:]]
        if not rows: print('empty export (Google had too little data):', term, f.name); continue
        d0 = date.fromisoformat(rows[0][0])
        match = [(w0, out) for w0, out in want.get(term, []) if abs((d0 - (w0 - timedelta(days=7))).days) <= 3]   # the export starts one week before the window
        if not match: print('skip, no case wants', repr(term), d0, f.name); continue
        for _, out in match:   # rarely, two cases share a term and window
            pd.DataFrame({term: [0 if v.strip() == '<1' else int(v) for _, v in rows]}, index=pd.to_datetime([d for d, _ in rows])).rename_axis('date').to_csv(out)
            done += 1
    print(done, 'series filed')


# ---------- computing ----------
def weekly(f, col, weeks, daily=False):
    """52 values aligned to `weeks`, or None if the file is missing or the series doesn't cover the window."""
    if not f.exists(): return None
    s = pd.read_csv(f, index_col=0, parse_dates=True)
    if s.empty or col not in s: return None
    s = s[col].astype(float)
    if daily:
        out = [s[(s.index >= pd.Timestamp(w)) & (s.index < pd.Timestamp(w + timedelta(days=7)))] for w in weeks]
        return None if any(len(x) < 7 for x in out) else np.array([x.sum() for x in out])
    s.index = s.index.date
    return None if any(w not in s.index for w in weeks) else np.array([s[w] for w in weeks])


def ratio(v):
    v = v + 1.0                       # zero rule, RUBRIC
    return v[-13:].mean() / v[:-13].mean()


def measure(c):
    weeks = window_weeks(announce_day(c['announced']))
    p = weekly(RAW / f"{c['id']}.own_p.csv", c['search_term'], weeks)
    ctl = weekly(RAW / f"{c['id']}.own_c.csv", c['control_term'], weeks)
    jp = weekly(RAW / f"{c['id']}.joint.csv", c['search_term'], weeks)
    jc = weekly(RAW / f"{c['id']}.joint.csv", c['control_term'], weeks)
    out = {'source': None, 'curve': None, 'ratio': None, 'p_ratio': None, 'c_ratio': None, 'joint_ratio': None, 'zero_weeks': None}
    if jp is not None and jc is not None and (jp == 0).mean() <= .5:
        out['joint_ratio'] = ratio(jp) / ratio(jc)
    if p is not None and ctl is not None:
        out['zero_weeks'] = int((p == 0).sum())
        if (p == 0).mean() <= .5:
            out.update(source='Google Trends', curve=p, p_ratio=ratio(p), c_ratio=ratio(ctl))
    if out['source'] is None:
        wp = weekly(RAW / f"{c['id']}.wiki_p.csv", 'views', weeks, daily=True)
        wc = weekly(RAW / f"{c['id']}.wiki_c.csv", 'views', weeks, daily=True)
        if wp is not None and wc is not None and (wp == 0).mean() <= .5:
            out.update(source='Wikipedia pageviews', curve=wp, p_ratio=ratio(wp), c_ratio=ratio(wc))
    if out['source']: out['ratio'] = out['p_ratio'] / out['c_ratio']
    return out


def pick_threshold(r, y):
    """Most correct calls on training cases for `call LASTED if r >= T`; ties -> midpoint of the widest tied range."""
    xs = np.sort(np.unique(r))
    cands = np.concatenate([[xs[0] - 1], (xs[:-1] + xs[1:]) / 2, [xs[-1] + 1]])
    acc = np.array([((r >= t) == y).mean() for t in cands])
    best = np.flatnonzero(acc == acc.max())
    runs, run = [], [best[0]]                       # group consecutive tied candidates into ranges
    for i in best[1:]:
        if i == run[-1] + 1: run.append(i)
        else: runs.append(run); run = [i]
    runs.append(run)
    widest = max(runs, key=lambda g: (xs[min(g[-1], len(xs) - 1)] - xs[max(g[0] - 1, 0)], -g[0]))
    lo = xs[max(widest[0] - 1, 0)] if widest[0] > 0 else -np.inf
    hi = xs[widest[-1]] if widest[-1] < len(xs) else np.inf
    if np.isinf(lo) or np.isinf(hi): t = cands[widest[len(widest) // 2]]
    else: t = (lo + hi) / 2
    return float(t), float(acc.max())


def bootstrap(hit_rule, hit_base, n=10_000, seed=2026):
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(hit_rule), (n, len(hit_rule)))
    r, b = hit_rule[idx].mean(1), hit_base[idx].mean(1)
    q = lambda a: [float(np.percentile(a, 2.5)), float(np.percentile(a, 97.5))]
    return q(r), q(r - b)


def selftest():
    assert pick_threshold(np.array([.5, .8, 1.2, 1.5, 2.0]), np.array([0, 0, 1, 1, 1], bool)) == (1.0, 1.0)
    assert pick_threshold(np.array([.5, .8, .9, 1.2, 1.5, 2.0]), np.array([0, 1, 0, 0, 1, 1], bool))[0] == 1.35
    w = window_weeks(date(2022, 5, 19)); assert (w[0], w[-1]) == (date(2021, 5, 16), date(2022, 5, 8))
    assert abs(ratio(np.array([0.0] * 39 + [1.0] * 13)) - 2.0) < 1e-9
    print('selftest ok')


def main():
    if sys.argv[1:] == ['test']: return selftest()
    cases = list(csv.DictReader(open(HERE / 'cases.csv', encoding='utf-8')))
    if sys.argv[1:] == ['pull']: return pull([c for c in cases if c['status'] in ('in', 'pending')])
    if sys.argv[1:2] == ['import']: return import_exports(sys.argv[2], [c for c in cases if c['status'] in ('in', 'pending')])
    rows = []
    for c in cases:
        m = measure(c) if c['status'] == 'in' else {}
        yr = announce_day(c['announced']).year if c['announced'][:4].isdigit() else 0
        band = 'train' if TRAIN[0] <= yr <= TRAIN[1] else 'holdout' if HOLD[0] <= yr <= HOLD[1] else 'check back 2027' if yr >= 2024 else ''
        status, why = c['status'], c['drop_reason']
        if status == 'in' and not m.get('source'):
            got = (RAW / f"{c['id']}.own_p.csv").exists() or c['id'] in EMPTY
            wiki = (f"the Wikipedia article '{c['wiki_article']}' had no pageviews for the window" if c['wiki_article']
                    else 'no Wikipedia article was named for it (see RUBRIC addendum 2026-11-10, after scoring)')
            status, why = 'dropped', (f'attention series too thin: Google Trends had too little data and {wiki} (RUBRIC data rule)' if got
                                      else UNMEASURED.get(c['id'], 'the Google Trends series for the planned search term was not downloaded; not yet measured'))
        rows.append({**c, 'status': status, 'drop_reason': why, 'band': band, **{k: v for k, v in m.items() if k != 'curve'}, '_curve': m.get('curve'),
                     'lasted': None if c['outcome'] == 'CHECK BACK 2027' else int(c['outcome'] == 'PERMANENT')})
    use = [r for r in rows if r['status'] == 'in']
    tr = [r for r in use if r['band'] == 'train']; ho = [r for r in use if r['band'] == 'holdout']; fw = [r for r in use if r['band'] == 'check back 2027']
    rt, yt = np.array([r['ratio'] for r in tr]), np.array([r['lasted'] for r in tr], bool)
    T, train_acc = pick_threshold(rt, yt)
    majority = bool(yt.mean() > .5) if yt.mean() != .5 else False   # a tie calls 'did not last', the cautious default
    rh, yh = np.array([r['ratio'] for r in ho]), np.array([r['lasted'] for r in ho], bool)
    call_h = rh >= T
    hit_rule, hit_base = (call_h == yh).astype(float), (np.full(len(yh), majority) == yh).astype(float)
    ci_rule, ci_diff = bootstrap(hit_rule, hit_base)
    # sensitivity: same-request version, same procedure, never the headline
    sj = [r for r in use if r['joint_ratio'] is not None and r['band'] in ('train', 'holdout')]
    sjt = [r for r in sj if r['band'] == 'train']; sjh = [r for r in sj if r['band'] == 'holdout']
    Tj, _ = pick_threshold(np.array([r['joint_ratio'] for r in sjt]), np.array([r['lasted'] for r in sjt], bool)) if len(sjt) > 1 else (None, None)
    joint_hit = float(np.mean([(r['joint_ratio'] >= Tj) == bool(r['lasted']) for r in sjh])) if Tj is not None and sjh else None
    for r in use:
        r['call'] = 'LASTS' if r['ratio'] >= T else 'FADES'
        r['correct'] = '' if r['lasted'] is None else int((r['ratio'] >= T) == bool(r['lasted']))
    res = dict(threshold=T, train_n=len(tr), train_acc=train_acc, train_lasted=int(yt.sum()), majority_call='LASTS' if majority else 'FADES',
               holdout_n=len(ho), holdout_lasted=int(yh.sum()), rule_hits=int(hit_rule.sum()), base_hits=int(hit_base.sum()),
               rule_rate=float(hit_rule.mean()), base_rate=float(hit_base.mean()), rule_ci=ci_rule, diff_ci=ci_diff,
               forward_n=len(fw), sourced=sum(c['status'] in ('in', 'pending') for c in cases), dropped=sum(r['status'] != 'in' for r in rows),
               sensitivity_joint=dict(threshold=Tj, holdout_n=len(sjh), hit_rate=joint_hit))
    write_outputs(rows, use, res)
    print(json.dumps(res, indent=1))


def write_outputs(rows, use, res):
    cols = ['id', 'product', 'brand', 'category', 'announced', 'band', 'status', 'drop_reason', 'outcome', 'lasted', 'outcome_note',
            'search_term', 'control_term', 'source', 'zero_weeks', 'p_ratio', 'c_ratio', 'ratio', 'joint_ratio', 'call', 'correct',
            'announce_url', 'announce_quote', 'outcome_url', 'outcome_quote', 'confidence']
    with open(HERE / 'bring_back_study.csv', 'w', newline='', encoding='utf-8-sig') as f:   # BOM so Excel reads UTF-8
        w = csv.DictWriter(f, cols, extrasaction='ignore'); w.writeheader()
        for r in sorted(rows, key=lambda r: (r['status'] != 'in', r['announced'])):
            w.writerow({k: (round(r[k], 3) if isinstance(r.get(k), float) else r.get(k, '')) for k in cols})
    with open(HERE / 'weekly_curves.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f); w.writerow(['id', 'source'] + [f'w{i - 52}' for i in range(52)])
        for r in use: w.writerow([r['id'], r['source']] + [int(x) for x in r['_curve']])
    P = lambda x: f'{x * 100:.0f}%'
    sj = res['sensitivity_joint']
    lines = [f"# BRING_BACK results (computed {date.today()})", '',
             f"Threshold chosen on {res['train_n']} cases announced 2014-2020: call LASTS when the pre-trend ratio is at least {res['threshold']:.3f} "
             f"({P(res['train_acc'])} correct in training; {res['train_lasted']} of {res['train_n']} lasted, so the base call is {res['majority_call']}).", '',
             f"Holdout, {res['holdout_n']} cases announced 2021-2023 ({res['holdout_lasted']} lasted):", '',
             '| | correct | rate | 95% bootstrap interval |', '|---|---|---|---|',
             f"| Her rule | {res['rule_hits']}/{res['holdout_n']} | {P(res['rule_rate'])} | {P(res['rule_ci'][0])} to {P(res['rule_ci'][1])} |",
             f"| Base rate (always {res['majority_call']}) | {res['base_hits']}/{res['holdout_n']} | {P(res['base_rate'])} | |",
             f"| Difference | | {res['rule_rate'] * 100 - res['base_rate'] * 100:+.0f} points | {res['diff_ci'][0] * 100:+.0f} to {res['diff_ci'][1] * 100:+.0f} points |", '',
             f"Always calling the other outcome ({'FADES' if res['majority_call'] == 'LASTS' else 'LASTS'}) would have scored {res['holdout_n'] - res['base_hits']}/{res['holdout_n']} on the holdout.", '',
             (f"Sensitivity (same-request Trends version): threshold {sj['threshold']:.3f}, holdout hit rate {P(sj['hit_rate'])} on n = {sj['holdout_n']}." if sj['holdout_n']
              else 'Sensitivity (same-request Trends version): not run (see RUBRIC addendum 2026-11-10).'), '',
             f"{res['forward_n']} cases from 2024-2025 have dated calls, check back 2027. {res['dropped']} candidates dropped, reasons in the CSV.", '',
             '| case | announced | band | ratio | call | outcome | correct |', '|---|---|---|---|---|---|---|']
    lines += [f"| {r['product']} | {r['announced']} | {r['band']} | {r['ratio']:.2f} | {r['call']} | {r['outcome']} | {r['correct']} |" for r in sorted(use, key=lambda r: r['announced'])]
    # Exploratory only: looked at after the holdout was scored, never used to set or change the rule.
    sc = [r for r in use if r['lasted'] is not None]
    lines += ['', '## Exploratory (after the test; not used to set anything)', '', 'Share that lasted, all scored cases 2014-2023:', '', '| group | lasted | n |', '|---|---|---|']
    for cat in sorted({r['category'] for r in sc}):
        g = [r for r in sc if r['category'] == cat]; lines.append(f"| {cat} | {sum(r['lasted'] for r in g)} | {len(g)} |")
    for name, g in (('lasted', [r for r in sc if r['lasted']]), ('did not last', [r for r in sc if not r['lasted']])):
        lines.append(f"| {name}: interest rising before the news (ratio above 1) | {sum(r['ratio'] > 1 for r in g)} | {len(g)} |")
        lines.append(f"| {name}: rising by more than 15% (ratio above 1.15) | {sum(r['ratio'] > 1.15 for r in g)} | {len(g)} |")
    rs = sorted(sc, key=lambda r: r['ratio']); k = len(rs) // 3
    for name, g in (('lowest third of ratios', rs[:k]), ('middle third', rs[k:len(rs) - k]), ('highest third', rs[len(rs) - k:])):
        lines.append(f"| {name} ({g[0]['ratio']:.2f} to {g[-1]['ratio']:.2f}) | {sum(r['lasted'] for r in g)} | {len(g)} |")
    (HERE / 'results.md').write_text('\n'.join(lines) + '\n')
    site = dict(made=str(date.today()), threshold=round(res['threshold'], 3), result={k: res[k] for k in
                ('train_n', 'train_lasted', 'holdout_n', 'holdout_lasted', 'rule_hits', 'base_hits', 'majority_call', 'forward_n', 'sourced')} |
                {'rule_ci': [round(x, 2) for x in res['rule_ci']], 'diff_ci': [round(x, 2) for x in res['diff_ci']]},
                rising={k: [int(sum(r['ratio'] > 1 for r in g)), len(g)] for k, g in (('lasted', [r for r in use if r['lasted'] == 1]), ('faded', [r for r in use if r['lasted'] == 0]))},
                rising15={k: [int(sum(r['ratio'] > 1.15 for r in g)), len(g)] for k, g in (('lasted', [r for r in use if r['lasted'] == 1]), ('faded', [r for r in use if r['lasted'] == 0]))},   # the same 15% margin the window's card() uses for 'rising'
                cases=[dict(id=r['id'], name=r['product'], brand=r['brand'], cat=r['category'], announced=r['announced'], band=r['band'],
                            outcome=r['outcome'], note=r['outcome_note'], url=r['outcome_url'], src=r['source'], wiki=r['wiki_article'] if r['source'] == 'Wikipedia pageviews' else None, ratio=round(r['ratio'], 2), call=r['call'],
                            w=[int(round(x / max(r['_curve'].max(), 1) * 99)) for x in r['_curve']]) for r in sorted(use, key=lambda r: r['announced'])])
    SITE_JSON.write_text(json.dumps(site, separators=(',', ':'), ensure_ascii=False))


if __name__ == '__main__':
    main()
