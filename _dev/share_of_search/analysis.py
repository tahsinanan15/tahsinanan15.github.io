"""Share of search vs share of revenue: Nike, adidas, Puma (Binet & Field, IPA 2020).

Re-runnable: reads two CSVs, prints every number results.md quotes, and writes the site's
assets/data/share_of_search.json (what BRING_BACK.EXE draws).
  nice -n 15 <venv>/bin/python -I analysis.py <search_monthly.csv> <share_of_market.csv>

Choices (all fixed before looking at results):
- Share of search (SOS) uses the plain-word request `brands_term`, pull A (pull B is ~identical).
  Topic series are not used for brand shares: they collapse 2022-06..2023-06.
- Annual SOS = brand's summed monthly index / sum over the three brands, calendar year.
  2026 is partial (to Oct) and has no revenue, so it is shown but not tested.
- Share of revenue (SOM) = three-company share, calendar-aligned, from share_of_market.csv.
  PRIMARY: constant currency. adidas and Puma report in euros, Nike in dollars, so in USD a share moves
  whenever EUR/USD does. Constant currency converts every year's euro revenue at one fixed rate,
  1.15 USD per EUR, so only real sales changes move the shares. As-published USD is shown beside it.
  Primary measure `revenue_adidas_ex_reebok` (the word "adidas" does not cover Reebok searches).
  `revenue` and `footwear` are re-run as robustness checks.
- Binet test: ESOS_t = SOS_t - SOM_t; outcome dSOM over the year ending t+k.
  k=0 means SOM_t - SOM_{t-1} (concurrent), k=1 SOM_{t+1} - SOM_t (Binet's one-year lead), k=2 next.
  Pooled OLS over the three brands, raw ESOS and brand-demeaned ESOS (Puma's search share sits far
  above its sales share every year, partly the animal; Nike's revenue includes Jordan and Converse
  that "nike" searches miss, so a raw gap is partly a fixed offset, not a signal).
  Out-of-sample: leave-one-year-out (all brands of a year held out; brand means from training years
  only) and a split, train t<=2017, test t>=2018. Baseline: no change in share (dSOM = 0).
- Franchise share of brand: franchise plain word / brand topic within the *_term request, corrected
  for the topic collapse with the monthly ratio topic/term (brands_topic vs brands_term), normalised
  to its 2019-2021 mean. Relaunch dates were NOT sourced; the "takeoff" month (first month >= 10 in
  the franchise-only request) is used, and it is a search-based date, not a company date.
"""
import sys
import numpy as np
import pandas as pd

SEARCH = sys.argv[1] if len(sys.argv) > 1 else "search_monthly.csv"
SOM_CSV = sys.argv[2] if len(sys.argv) > 2 else "share_of_market.csv"
BRANDS = ["nike", "adidas", "puma"]
FR = {
    "adidas": ["adidas samba", "adidas gazelle", "adidas campus", "adidas spezial"],
    "nike": ["nike dunk", "air force 1", "jordan 1"],
    "puma": ["puma speedcat", "puma palermo", "puma suede"],
}
TOPIC_LABEL = {"nike": "Nike", "adidas": "adidas", "puma": "Puma"}

s = pd.read_csv(SEARCH)
s = s[s.pull == "A"].copy()


def req(rid):
    return s[s.request_id == rid].pivot(index="month", columns="term", values="value")


def yr(df):
    return df.index.str[:4].astype(int)


# 1. share of search ---------------------------------------------------------
bt = req("brands_term")[BRANDS]
sos_m = bt.div(bt.sum(axis=1), axis=0)
bt_y = bt.groupby(yr(bt)).sum()
sos_y = bt_y.div(bt_y.sum(axis=1), axis=0)
nmonths = bt.groupby(yr(bt)).size()

# 2. share of revenue --------------------------------------------------------
som_all = pd.read_csv(SOM_CSV)


FX_FIXED = 1.15   # USD per EUR, held constant for every year (the sceptical review's choice; see review/check.py)


def som(measure, cc=True):
    """Three-company revenue share. cc=True: euro revenues at a fixed 1.15 USD/EUR (primary); False: as-published USD."""
    d = som_all[som_all.measure == measure].set_index("calendar_year")
    if not cc:
        return d[[f"{b}_share" for b in BRANDS]].set_axis(BRANDS, axis=1)
    u = d[[f"{b}_usd" for b in BRANDS]].set_axis(BRANDS, axis=1).copy()
    for b in ("adidas", "puma"):
        u[b] = u[b] / d.usd_per_eur * FX_FIXED
    return u.div(u.sum(axis=1), axis=0)


# 3. Binet test --------------------------------------------------------------
def panel(som_y, k):
    rows = []
    for b in BRANDS:
        for t in som_y.index:
            if t not in sos_y.index or nmonths.get(t, 0) < 12:
                continue
            a, z = t + k - 1, t + k
            if a in som_y.index and z in som_y.index:
                rows.append((b, t, sos_y.at[t, b] - som_y.at[t, b], som_y.at[z, b] - som_y.at[a, b]))
    return pd.DataFrame(rows, columns=["brand", "t", "esos", "dsom"])


def ols(x, y):
    b1, b0 = np.polyfit(x, y, 1)
    return b0, b1


def demean(df, train):
    return df.esos - df.brand.map(train.groupby("brand").esos.mean())


def evaluate(p, demeaned):
    x = demean(p, p) if demeaned else p.esos
    _, b1 = ols(x, p.dsom)
    r = np.corrcoef(x, p.dsom)[0, 1]
    err, err0, hits = [], [], []
    for t in sorted(p.t.unique()):  # leave one year out
        tr, te = p[p.t != t], p[p.t == t]
        c0, c1 = ols(demean(tr, tr) if demeaned else tr.esos, tr.dsom)
        pred = c0 + c1 * (demean(te, tr) if demeaned else te.esos)
        err += list(abs(te.dsom - pred)); err0 += list(abs(te.dsom))
        hits += list(np.sign(pred) == np.sign(te.dsom))
    tr, te = p[p.t <= 2017], p[p.t >= 2018]  # time split
    c0, c1 = ols(demean(tr, tr) if demeaned else tr.esos, tr.dsom)
    pred = c0 + c1 * (demean(te, tr) if demeaned else te.esos)
    return dict(n=len(p), years=p.t.nunique(), slope=b1, r=r, loyo=np.mean(err) * 100,
                naive=np.mean(err0) * 100, sign=np.mean(hits),
                split=np.mean(abs(te.dsom - pred)) * 100, split0=np.mean(abs(te.dsom)) * 100,
                split_n=len(te))


def fmt(d):
    return (f"n={d['n']:2d} ({d['years']} yrs) slope={d['slope']:+.3f} r={d['r']:+.2f} | "
            f"LOYO MAE {d['loyo']:.2f}pt vs naive {d['naive']:.2f}pt, sign hit {d['sign']:.0%} | "
            f"split test n={d['split_n']} MAE {d['split']:.2f} vs naive {d['split0']:.2f}")


def pct(x):
    return f"{100 * x:5.1f}"


def franchise_share(b):
    """Annual franchise searches / brand searches, topic anchor corrected to plain-word brand."""
    r = req(f"{b}_term")
    ratio = req("brands_topic")[TOPIC_LABEL[b]] / bt[b]
    corr = ratio / ratio[(ratio.index >= "2019-01") & (ratio.index <= "2021-12")].mean()
    brand = r[TOPIC_LABEL[b]] / corr
    ann = r[FR[b]].groupby(yr(r)).sum().div(brand.groupby(yr(r)).sum(), axis=0)
    ann["all"] = ann.sum(axis=1)
    return ann


if __name__ == "__main__":
    fx = som_all[som_all.measure == "revenue"].set_index("calendar_year").usd_per_eur
    print(f"fixed rate {FX_FIXED} USD/EUR; ECB annual average 2010-2025 = {fx.loc[2010:2025].mean():.3f}, range {fx.min():.3f}-{fx.max():.3f}")
    print("== 1-2. Annual share of search (plain words) vs share of revenue (ex-Reebok, constant currency), %")
    som_p = som("revenue_adidas_ex_reebok")
    print("year  " + "  ".join(f"{b[:6]:>6} SOS   SOM" for b in BRANDS) + "  months")
    for y in sos_y.index:
        cells = [f"{pct(sos_y.at[y, b])} {pct(som_p.at[y, b]) if y in som_p.index else '    -'}" for b in BRANDS]
        print(f"{y}        " + "        ".join(cells) + f"  {nmonths[y]}")

    print("\n== monthly SOS, selected months (%)")
    for mth in ["2019-12", "2021-12", "2022-08", "2023-04", "2023-12", "2024-04", "2024-12", "2025-06",
                "2025-12", "2026-04", "2026-10"]:
        if mth in sos_m.index:
            print(mth, "  ".join(f"{b} {pct(sos_m.at[mth, b])}" for b in BRANDS))

    print("\n== 3. Binet test: ESOS_t vs change in SOM over the year ending t+k")
    for cc in (True, False):
        print("-- constant currency (primary)" if cc else "-- as-published USD")
        for measure in ["revenue_adidas_ex_reebok", "revenue", "footwear"]:
            for dm in [False, True]:
                for k in [0, 1, 2]:
                    print(f"{measure:24s} {'demeaned' if dm else 'raw     '} k={k}  "
                          f"{fmt(evaluate(panel(som(measure, cc), k), dm))}")
    print("\n== 3b. Is it search, or just revenue share reverting to its mean? (k=1, LOYO MAE, pt)")
    print("   ESOS_t contains -SOM_t, and so does SOM_{t+1}-SOM_t: noise alone gives a positive slope.")
    for measure, cc in [(m, c) for c in (True, False) for m in ["revenue_adidas_ex_reebok", "revenue", "footwear"]]:
        sm = som(measure, cc)
        measure = f"{measure}{'' if cc else ' (USD)'}"
        p = panel(sm, 1)
        p["som"] = [sm.at[t, b] for b, t in zip(p.brand, p.t)]
        p["dsos"] = [sos_y.at[t, b] - sos_y.at[t - 1, b] if t - 1 in sos_y.index else np.nan
                     for b, t in zip(p.brand, p.t)]
        res = {}
        for name, cols in [("naive", []), ("revert", ["som"]), ("esos", ["esos"]),
                           ("revert+sos", ["som", "sos"]), ("dSOS only", ["dsos"])]:
            q = p.copy(); q["sos"] = q.esos + q.som
            q = q.dropna()
            err = []
            for t in sorted(q.t.unique()):
                tr, te = q[q.t != t], q[q.t == t]
                if not cols:
                    err += list(abs(te.dsom)); continue
                def X(d):  # brand-demeaned regressors, means from training years only
                    m = tr.groupby("brand")[cols].mean()
                    return np.column_stack([np.ones(len(d))] + [d[c].values - d.brand.map(m[c]).values for c in cols])
                beta = np.linalg.lstsq(X(tr), tr.dsom.values, rcond=None)[0]
                err += list(abs(te.dsom.values - X(te) @ beta))
            res[name] = (np.mean(err) * 100, len(q))
        full = q.copy()
        Xf = np.column_stack([np.ones(len(full))] + [full[c] - full.brand.map(full.groupby("brand")[c].mean())
                                                    for c in ["som", "sos"]])
        beta = np.linalg.lstsq(Xf, full.dsom.values, rcond=None)[0]
        print(f"   {measure:24s} " + "  ".join(f"{k} {v[0]:.2f}" for k, v in res.items())
              + f"   | joint fit: coef on SOM {beta[1]:+.2f}, on SOS {beta[2]:+.2f} (n={len(full)})")

    p1 = panel(som("revenue_adidas_ex_reebok"), 1)
    print("\nper brand, primary measure (constant currency), raw ESOS, k=1:")
    for b in BRANDS:
        q = p1[p1.brand == b]
        print(f"  {b:6s} n={len(q)} slope={ols(q.esos, q.dsom)[1]:+.3f} "
              f"r={np.corrcoef(q.esos, q.dsom)[0, 1]:+.2f} mean ESOS={100 * q.esos.mean():+.1f}pt")
    print("\nESOS_t and dSOM(t -> t+1), pt, primary measure:")
    for t in sorted(p1.t.unique()):
        q = p1[p1.t == t].set_index("brand")
        print(f"  {t}: " + "   ".join(f"{b} {100 * q.at[b, 'esos']:+5.1f} -> {100 * q.at[b, 'dsom']:+5.1f}"
                                      for b in BRANDS))

    print("\n== 4. Franchise searches as % of brand searches (annual, collapse-corrected)")
    shares = {}
    for b in BRANDS:
        ann = shares[b] = franchise_share(b)
        fo = req(f"{b}_fr_term")
        print(f"-- {b}")
        for f in FR[b]:
            print(f"   {f:15s} takeoff(first >=10) {fo[f][fo[f] >= 10].index.min()}  peak {fo[f].idxmax()}")
        print("   year " + "".join(f"{f.split()[-1][:7]:>9}" for f in FR[b]) + "      all  brandSOS")
        for y in range(2015, 2027):
            print(f"   {y} " + "".join(f"{pct(ann.at[y, f]):>9}" for f in FR[b])
                  + f"{pct(ann.at[y, 'all']):>9} {pct(sos_y.at[y, b]):>9}")
    yrs = list(range(2016, 2026))
    for b in BRANDS:
        x = shares[b].loc[yrs, "all"].values
        y = sos_y.loc[yrs, b].values
        print(f"{b}: franchise share vs brand SOS 2016-2025 levels r={np.corrcoef(x, y)[0, 1]:+.2f}, "
              f"yoy changes r={np.corrcoef(np.diff(x), np.diff(y))[0, 1]:+.2f} (n={len(yrs)}/{len(yrs) - 1})")

    # ---- the site's data: BRING_BACK.EXE draws exactly this --------------------------------------
    import json, pathlib
    out = pathlib.Path(__file__).resolve().parents[2] / "assets" / "data" / "share_of_search.json"
    months = list(sos_m.index)
    def monthly_franchise(b):
        r = req(f"{b}_term")
        ratio = req("brands_topic")[TOPIC_LABEL[b]] / bt[b]
        corr = ratio / ratio[(ratio.index >= "2019-01") & (ratio.index <= "2021-12")].mean()
        f = r[FR[b]].sum(axis=1) / (r[TOPIC_LABEL[b]] / corr)
        return f.reindex(months)
    pm = lambda x: None if pd.isna(x) else int(round(float(x) * 1000))   # per mille
    sc, su = som("revenue_adidas_ex_reebok"), som("revenue_adidas_ex_reebok", False)
    years = [int(y) for y in sc.index]
    res = {k: evaluate(panel(som("revenue_adidas_ex_reebok", c), 1), False) for k, c in (("cc", True), ("usd", False))}
    data = dict(
        note="Shares in per mille. sos: monthly share of search among nike/adidas/puma (Google Trends, worldwide). "
             "som_cc: revenue share with euro revenue at a fixed 1.15 USD/EUR (primary); som_usd: as published in USD. "
             "retro: the retro-franchise slice of each brand's monthly searches (share of the brand's own searches). "
             "Built by _dev/share_of_search/analysis.py.",
        months=months,
        sos={b: [pm(v) for v in sos_m[b]] for b in BRANDS},
        retro={b: [pm(v) for v in monthly_franchise(b)] for b in BRANDS},
        franchises={b: [f.replace("adidas ", "").replace("puma ", "").replace("nike ", "").title() for f in FR[b]] for b in BRANDS},
        years=years,
        som_cc={b: [pm(sc.at[y, b]) for y in years] for b in BRANDS},
        som_usd={b: [pm(su.at[y, b]) for y in years] for b in BRANDS},
        binet={k: dict(n=v["n"], slope=round(v["slope"], 2), r=round(v["r"], 2), loyo=round(v["loyo"], 2), naive=round(v["naive"], 2))
               for k, v in res.items()},
        pending=dict(made="2026-11-10", brand="puma",
                     sos_2026=pm(sos_y.at[2026, "puma"]), som_2025_cc=pm(sc.at[2025, "puma"]), som_2025_usd=pm(su.at[2025, "puma"]),
                     call="Puma's 2026 revenue share rises above its 2025 share",
                     scored="in constant currency, when Puma reports its 2026 results in early 2027"),
    )
    out.write_text(json.dumps(data, separators=(",", ":")))
    print(f"\nwrote {out} ({out.stat().st_size} bytes)")
