"""Build revenue.csv and share_of_market.csv from downloaded primary filings.

Run: nice -n 15 python3 -I scripts/build_revenue.py <raw/filings dir> <output dir>
Every value is parsed from a file in raw/filings/ (nothing typed in by hand);
source_quote is the table row the value came from.

Bases (what each series includes):
  Nike    revenue_total = NIKE, Inc. revenues (incl. Converse). Each fiscal year is taken from
          the LATEST 10-K that shows it (10-Ks show 3 years), so FY2011+ reflect the FY2013
          restatement that moved Umbro and Cole Haan to discontinued ops. FY2010 is only
          shown in the FY2012 10-K and still INCLUDES Umbro and Cole Haan.
          footwear_nike_brand = "NIKE Brand Revenues by: Footwear" (excl. Converse), latest 10-K.
  adidas  revenue_total = group net sales as published in the latest ten-year overview:
          2010-12 incl. Rockport+golf+Reebok; 2013-15 excl. Rockport; 2016-19 excl. Rockport,
          TaylorMade, Adams, Ashworth, CCM but INCL. Reebok; 2020+ continuing ops excl. Reebok.
          net_sales_adidas_brand / net_sales_reebok_brand: brand rows, 2010-2020.
          The "ex-Reebok" share series uses adidas-brand net sales 2010-2019 and continuing-ops
          net sales 2020+. Overlap 2020: brand 18,095 vs continuing 18,435 (+1.9%).
          footwear: Reebok footwear is INSIDE adidas footwear up to 2019 (no split published).
  Puma    consolidated sales; 2024-25 per AR2025 exclude PUMA United North America/Canada
          (sold 31 Oct 2025, discontinued). 2024 as first reported (incl.) kept as its own metric.
FX: ECB reference rate USD per EUR, annual average (series EXR.A.USD.EUR.SP00.A).
Calendar alignment of Nike (FY ends 31 May): CY Y = 5/12*FY(Y) + 7/12*FY(Y+1)
  (Jan-May of Y sit in FY(Y), Jun-Dec in FY(Y+1)); assumes revenue spread evenly over months.
  # ponytail: even-month assumption; use 10-Q quarters (XBRL frames) if seasonality matters.
"""
import csv, re, sys
from pathlib import Path

R, O = Path(sys.argv[1]), Path(sys.argv[2])
rows = []
def add(company, period, end, metric, value, cur, url, quote, basis):
    rows.append(dict(company=company, period=period, period_end=end, metric=metric, value=value,
                     currency=cur, source_url=url, source_quote=quote, basis=basis))

def num(s):
    s = s.strip().replace('–', '-')
    if re.fullmatch(r'-?\d{1,3}(\.\d{3})*,\d', s): s = s.replace('.', '').replace(',', '.')  # German format
    return float(s.replace(',', ''))

# ---- Nike: 10-K 3-year revenue table, latest filing wins ----
urls = {int(fy): f'https://www.sec.gov/Archives/edgar/data/320187/{a.replace("-", "")}/{p}'
        for fy, a, p in (l.split() for l in open(R / 'nike10k/urls.txt'))}
pats = {'revenue_total': r'^total nike, inc\.? revenues', 'footwear_nike_brand': r'^footwear$'}
nike = {}
for fy in sorted(urls):
    lines = open(R / f'nike10k/FY{fy}.txt').read().splitlines()
    for metric, pat in pats.items():
        for l in lines:
            c = l.split(' | ')
            if re.match(pat, c[0].strip(), re.I) and len(c) >= 8:  # first 3-year table row
                for yr, idx in ((fy, 1), (fy - 1, 2), (fy - 2, 5)):
                    nike[(yr, metric)] = (num(c[idx]) * 1e6, urls[fy], f'10-K FY{fy}, column FY{yr}: "{l}" ($ millions)')
                break
for (yr, metric), (v, u, q) in sorted(nike.items()):
    if yr < 2010: continue
    basis = 'incl. Umbro and Cole Haan (not restated)' if (yr == 2010 and metric == 'revenue_total') else 'latest 10-K showing the year'
    add('Nike', f'FY{yr}', f'{yr}-05-31', metric, v, 'USD', u, q, basis)

# ---- generic multi-year table reader (adidas, Puma) ----
def table(txt, labels, sep=False):
    """Yield (label, {year: value}, row) using the nearest year-header line above each label row."""
    hdr = None
    for l in txt.splitlines():
        cells = [c.strip() for c in (l.split(' | ') if sep else re.split(r'\s{2,}', l.strip()))]
        if cells and re.fullmatch(r'20\d{2}\d?', cells[0]): hdr = [int(c[:4]) for c in cells]
        elif hdr and cells[0] in labels and len(cells) == len(hdr) + 1:
            yield cells[0], dict(zip(hdr, map(num, cells[1:]))), re.sub(' +', ' ', l.strip())

A25 = 'https://report.adidas-group.com/2025/en/_assets/downloads/additional-information-adidas-ar25.pdf'
A19 = 'https://report.adidas-group.com/2019/en/additional-information/ten-year-overview.html'
A20 = 'https://report.adidas-group.com/2020/en/additional-information/ten-year-overview.html'
ad = {}  # latest report first, setdefault keeps it
for lab, vals, row in table(open(R / 'adidas/ar25_additional.txt').read(), {'Net sales3,4', 'Footwear3,4'}):
    for y, v in vals.items(): ad.setdefault((y, lab[:4]), (v, A25, f'adidas AR2025 Ten-year overview, column {y}: "{row}" (EUR millions)'))
for f, url, name in (('ten_2019.txt', A19, 'AR2019'), ('ten_2020.txt', A20, 'AR2020')):
    for lab, vals, row in table(open(R / 'adidas' / f).read(), {'Net sales3,4', 'Net sales4, 5', 'Footwear3,4', 'Footwear4, 5', 'adidas brand', 'Reebok brand'}, sep=True):
        for y, v in vals.items(): ad.setdefault((y, lab[:4]), (v, url, f'adidas {name} Ten-Year Overview, column {y}: "{row}" (EUR millions)'))
def adbasis(y):
    return ('incl. Rockport, golf, CCM, Reebok' if y <= 2012 else 'excl. Rockport; incl. golf, CCM, Reebok' if y <= 2015
            else 'continuing ops excl. Rockport/golf/CCM; incl. Reebok' if y <= 2019 else 'continuing ops excl. Reebok')
for y in range(2010, 2026):
    for k, m in (('Net ', 'revenue_total'), ('Foot', 'footwear')):
        v, u, q = ad[(y, k)]
        add('adidas', f'FY{y}', f'{y}-12-31', m, v * 1e6, 'EUR', u, q, adbasis(y))
    if y <= 2020:
        for k, m in (('adid', 'net_sales_adidas_brand'), ('Reeb', 'net_sales_reebok_brand')):
            v, u, q = ad[(y, k)]
            add('adidas', f'FY{y}', f'{y}-12-31', m, v * 1e6, 'EUR', u, q, 'brand-level net sales')
first2020 = next(table(open(R / 'adidas/ten_2020.txt').read(), {'Net sales4, 5'}, sep=True))
add('adidas', 'FY2020', '2020-12-31', 'revenue_total_incl_reebok', first2020[1][2020] * 1e6, 'EUR', A20,
    f'adidas AR2020 Ten-Year Overview, column 2020: "{first2020[2]}" (EUR millions)', 'incl. Reebok (as first reported)')

# ---- Puma ----
P25 = 'https://annual-report.puma.com/2025/en/additional-information/puma-group-development/index.html'
P24 = 'https://annual-report.puma.com/2024/en/additional-information/puma-group-development/index.html'
P17 = 'https://annual-report.puma.com/2017/de/wp-content/uploads/PUMAGB2017_EN_Group_Development.pdf'
pu = {}
for lab, vals, row in table(open(R / 'puma/dev_2025.txt').read(), {'Consolidated sales', '- Footwear'}, sep=True):
    for y, v in vals.items(): pu[(y, lab)] = (v, P25, f'PUMA AR2025 T.03 PUMA Group Development, column {y}: "{row}" (EUR million, German number format)')
for lab, vals, row in table(open(R / 'puma/gd2017.txt').read().replace('2009*', '2009'), {'Consolidated sales', '- Footwear'}):
    for y, v in vals.items(): pu.setdefault((y, lab), (v, P17, f'PUMA Annual Report 2017 Group Development, column {y}: "{row}" (EUR million)'))
for y in range(2010, 2026):
    b = 'continuing ops excl. PUMA United (sold 2025)' if y >= 2024 else 'as reported (incl. PUMA United)'
    for lab, m in (('Consolidated sales', 'revenue_total'), ('- Footwear', 'footwear')):
        v, u, q = pu[(y, lab)]
        add('Puma', f'FY{y}', f'{y}-12-31', m, v * 1e6, 'EUR', u, q, b)
r24 = next(table(open(R / 'puma/dev_2024.txt').read(), {'Consolidated sales'}, sep=True))
add('Puma', 'FY2024', '2024-12-31', 'revenue_total_incl_puma_united', r24[1][2024] * 1e6, 'EUR', P24,
    f'PUMA AR2024 Group Development, column 2024: "{r24[2]}" (EUR million)', 'as first reported (incl. PUMA United)')

# ---- ECB FX ----
ECB = 'https://data-api.ecb.europa.eu/service/data/EXR/A.USD.EUR.SP00.A?format=csvdata&startPeriod=2009'
fx = {}
for r in csv.DictReader(open(R / 'ecb/exr_annual.csv')):
    y = int(r['TIME_PERIOD']); fx[y] = float(r['OBS_VALUE'])
    add('ECB', str(y), f'{y}-12-31', 'usd_per_eur_annual_avg', fx[y], 'USD/EUR', ECB,
        f'{r["TITLE_COMPL"]}; {r["KEY"]} {y} = {r["OBS_VALUE"]}', 'annual average of daily reference rates')

with open(O / 'revenue.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, list(rows[0])); w.writeheader(); w.writerows(rows)

# ---- shares per calendar year, in USD ----
V = {(r['company'], r['metric'], r['period']): r['value'] for r in rows}
g = lambda c, m, y: V.get((c, m, f'FY{y}'))
out = []
for y in range(2010, 2026):
    for label, m_nike, m_pu in (('revenue', 'revenue_total', 'revenue_total'),
                                ('revenue_adidas_ex_reebok', 'revenue_total', 'revenue_total'),
                                ('footwear', 'footwear_nike_brand', 'footwear')):
        a, b = g('Nike', m_nike, y), g('Nike', m_nike, y + 1)
        if a is None or b is None or y not in fx: continue
        nk = 5 / 12 * a + 7 / 12 * b
        adv = {'revenue': g('adidas', 'revenue_total', y), 'footwear': g('adidas', 'footwear', y),
               'revenue_adidas_ex_reebok': g('adidas', 'net_sales_adidas_brand' if y <= 2019 else 'revenue_total', y)}[label]
        ad_usd, pu_usd = adv * fx[y], g('Puma', m_pu, y) * fx[y]
        t = nk + ad_usd + pu_usd
        flags = []
        if y == 2010 and label != 'footwear': flags.append('Nike FY2010 incl. Umbro/Cole Haan')
        if label == 'revenue' and y <= 2019: flags.append('adidas incl. Reebok' + (' and golf' if y <= 2015 else ''))
        if label == 'revenue_adidas_ex_reebok' and y <= 2019: flags.append('adidas = adidas-brand net sales (spliced to continuing ops at 2020)')
        if label == 'footwear' and y <= 2019: flags.append('adidas footwear incl. Reebok')
        if y >= 2024 and label != 'footwear': flags.append('Puma excl. PUMA United')
        out.append(dict(calendar_year=y, measure=label, nike_usd=round(nk), adidas_usd=round(ad_usd), puma_usd=round(pu_usd),
                        nike_share=round(nk / t, 4), adidas_share=round(ad_usd / t, 4), puma_share=round(pu_usd / t, 4),
                        usd_per_eur=round(fx[y], 6), flags='; '.join(flags)))
with open(O / 'share_of_market.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, list(out[0])); w.writeheader(); w.writerows(out)

# self-checks against values read off the filings
assert V[('Nike', 'revenue_total', 'FY2026')] == 46398e6 and V[('Nike', 'revenue_total', 'FY2012')] == 23331e6
assert V[('Nike', 'footwear_nike_brand', 'FY2010')] == 10301e6 and V[('Nike', 'footwear_nike_brand', 'FY2024')] == 33427e6
assert V[('adidas', 'revenue_total', 'FY2020')] == 18435e6 and V[('adidas', 'revenue_total_incl_reebok', 'FY2020')] == 19844e6
assert V[('adidas', 'revenue_total', 'FY2010')] == 11990e6 and V[('adidas', 'footwear', 'FY2025')] == 14232e6
assert abs(V[('Puma', 'revenue_total', 'FY2025')] - 7296.2e6) < 1 and abs(V[('Puma', 'revenue_total', 'FY2010')] - 2706.4e6) < 1
assert abs(V[('Puma', 'revenue_total_incl_puma_united', 'FY2024')] - 8817.2e6) < 1
assert all(abs(o['nike_share'] + o['adidas_share'] + o['puma_share'] - 1) < 1e-3 for o in out)
print(len(rows), 'revenue rows;', len(out), 'share rows')
