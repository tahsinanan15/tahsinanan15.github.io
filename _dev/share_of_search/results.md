# Share of search vs share of revenue: Nike, adidas, Puma

Les Binet (IPA, 2020) argues that a brand's share of category searches tends to lead its share of market. This study tests that on Nike, adidas and Puma for 2010 to 2025, then asks whether the brands' retro shoes moved their search share.

Every number below is printed by `analysis.py`, which also writes the site's `assets/data/share_of_search.json`:

```
nice -n 15 .venv/bin/python -I analysis.py search_monthly.csv share_of_market.csv
```

Revenue comes from `revenue.csv`; each row carries its source URL (a Nike 10-K on sec.gov, or an adidas or Puma annual report) and the line it was read from. `review/check.py` is the independent recheck that found the currency effect.

## Definitions

- **Share of search (SOS).** Google Trends, worldwide, monthly, the plain words *nike*, *adidas* and *puma* in one request. A brand's SOS is its searches over the three brands' total. 2026 is partial (January to October).
- **Share of revenue (SOM).** Each company's share of the three-company revenue, by calendar year (Nike's May fiscal years are blended into calendar years). adidas is counted without Reebok, because searches for "adidas" don't include Reebok.
- **Primary measure: constant currency.** adidas and Puma report in euros and Nike in dollars, so in US dollars their shares move whenever the euro does. Constant currency converts every year's euro revenue at one fixed rate, 1.15 USD per EUR (the ECB annual average over 2010 to 2025 is 1.186), so only real sales move the shares. The as-published US-dollar version is shown beside it.
- **Excess share of search (ESOS).** SOS minus SOM.

## Share of search and share of revenue (%, constant currency)

| Year | Nike SOS | Nike SOM | adidas SOS | adidas SOM | Puma SOS | Puma SOM |
|---|---|---|---|---|---|---|
| 2010 | 56.8 | 59.9 | 30.6 | 30.6 | 12.6 | 9.5 |
| 2014 | 64.4 | 63.4 | 27.6 | 29.2 | 8.0 | 7.4 |
| 2017 | 52.0 | 57.2 | 39.2 | 35.1 | 8.8 | 7.7 |
| 2021 | 62.3 | 58.7 | 27.7 | 31.3 | 10.0 | 10.0 |
| 2022 | 62.7 | 58.1 | 27.2 | 30.5 | 10.1 | 11.5 |
| 2023 | 61.1 | 59.8 | 28.4 | 28.7 | 10.5 | 11.5 |
| 2024 | 55.4 | 56.8 | 33.8 | 31.9 | 10.8 | 11.3 |
| 2025 | 53.6 | 55.7 | 34.6 | 34.3 | 11.8 | 10.1 |
| 2026 (Jan–Oct) | 50.3 | – | 36.9 | – | 12.7 | – |

## Binet's test

Does ESOS in year t predict the change in SOM over the next year? Pooled over three brands × 15 years = 45 brand-years. The three shares always sum to 100%, so this is closer to 30 independent points. The baseline is "no change in share".

| One-year lead, adidas ex-Reebok | Slope | r | Leave-one-year-out error (points) | Guessing no change | Direction right | Train to 2017, test 2018+ |
|---|---|---|---|---|---|---|
| **Constant currency (primary)** | **+0.30** | **+0.38** | **1.32** | **1.35** | **64%** | **1.60 vs 1.73** |
| As-published USD | +0.43 | +0.63 | 1.08 | 1.46 | 80% | 1.43 vs 1.79 |

- **In constant currency the one-year lead is suggestive and weak.** The slope stays positive and the relationship points the way Binet says, but the forecast error is barely below guessing "no change" (1.32 against 1.35), and the year-shuffled permutation test gives p = 0.056 (`review/check.py`).
- **Much of the US-dollar result is currency translation.** When the euro rises, euro-reporting adidas and Puma gain dollar share without selling more, and search doesn't move with the exchange rate. That is why the dollar fit looks stronger.
- Same-year and two-year leads show nothing in either currency (constant currency: r = +0.22 and −0.24).
- Robustness, constant currency, one-year lead: total revenue r = +0.37 (error 1.46 vs 1.38 naive); footwear r = +0.46 (1.66 vs 1.69). None clearly beats guessing.
- By brand (constant currency): Nike r = +0.36, adidas r = +0.46, Puma r = +0.04. Puma shows no signal.
- Mean reversion check (constant currency): change in SOS alone gives error 1.31, ESOS 1.37, naive 1.43 on the 42 brand-years with a prior year. The search term adds a little; neither is decisive.

**Verdict.** Search share and revenue share move together in the direction Binet describes, but once currency is held fixed, 15 years of three brands can't show that search share forecasts revenue share better than assuming no change. Directional, not proven.

## The retro shoes (exploratory)

Franchise searches are expressed as a share of the brand's own searches, corrected for the 2022–23 Trends topic collapse (method in the `analysis.py` docstring). Launch dates were not sourced; "takeoff" is the first month a franchise reaches 10 in its own Trends request, a search-based date.

**adidas terrace shoes (Samba, Gazelle, Campus, Spezial).** *Exploratory, one case.*
- Share of adidas searches: 1.3% in 2022, 9.1% in 2023, 20.1% in 2024, 16.4% in 2025. Samba alone: 0.8% to 7.7%. Samba took off in 2022-08.
- adidas SOS rose from 27.2 (2022) to 33.8 (2024), about 6.6 points; monthly it jumped to 34.6 in 2024-04.
- adidas revenue share (constant currency) rose 3.2 points in 2024 and 2.4 in 2025 (28.7 to 31.9 to 34.3).
- Year-on-year changes in terrace share and adidas SOS correlate at +0.70 (9 changes). In levels it is +0.06: adidas had a higher SOS in 2016–17 with almost no terrace searches.

**Nike classics (Dunk, Air Force 1, Jordan 1).** *Exploratory.*
- Share of Nike searches: 2.8% (2016), 21.8% (2021), 18.9% (2023), 11.0% (2025), 9.2% (2026 to October).
- Nike SOS fell from 62.3 (2021) to 53.6 (2025). Classics share and Nike SOS move together: r = +0.87 on year-on-year changes (9 changes).
- Nike's revenue share (constant currency) fell from 59.8 (2023) to 56.8 (2024) and 55.7 (2025).
- This shows the classics fading alongside the brand's search share. It does not show what caused what.

**Puma (Speedcat, Palermo, Suede).** *Exploratory.*
- Share of Puma searches: 1.5% (2023), 8.0% (2025), 9.1% (2026 to October). Palermo took off 2024-03, Speedcat 2024-09.
- Puma SOS: 10.5 (2023), 11.8 (2025), 12.7 (2026 to October). Puma's revenue share (constant currency) fell from 11.3 (2024) to 10.1 (2025): revenue has not followed.

## The open call (dated 2026-11-10)

Puma's share of search in 2026 so far is 12.7%, against a 2025 revenue share of 10.1% in constant currency (10.0% in US dollars). If share of search leads, Puma's 2026 revenue share should rise above its 2025 level. It gets scored in constant currency when Puma reports its 2026 results in early 2027. It's a weak call: Puma is the brand where the signal is weakest (r = +0.04), and "puma" also catches searches for the animal.

## Findings for a brand marketer

1. **Share of search moves with revenue share, but don't sell it as a forecast.** *Confirmatory (the pre-specified Binet test).* In constant currency the one-year lead is r = +0.38 and barely beats "no change" (1.32 vs 1.35 points). Suggestive; it weakens without currency translation.
2. **Check currency before you trust a share chart.** *Confirmatory (the recheck).* In US dollars the same test looks strong (r = +0.63, error 1.08 vs 1.46), because a stronger euro lifts euro-reporting brands' dollar share with no change in sales.
3. **A retro shoe moved the brand only when it became a large slice of its searches.** *Exploratory, one case.* adidas terrace shoes reached 20% of adidas searches in 2024, adidas SOS rose about 6.6 points, and its revenue share rose in 2024 and 2025.
4. **Retro demand that peaks needs a successor.** *Exploratory.* Nike's classics fell from 21.8% to 11.0% of its searches, alongside Nike's share of search.

## Limits

- **Small sample.** 15 years, three shares that sum to 100%, about 30 independent points. Annual revenue only, so monthly leads can't be tested.
- **Three companies, not the category.** New Balance, Asics, On, Hoka, Skechers and others are missing.
- **Constant currency is one fixed rate.** 1.15 USD per EUR for every year. Another fixed rate changes the shares' levels slightly but not the year-to-year swings, which is what the test uses.
- **Brand words don't match revenue scope.** "nike" misses Jordan and Converse, which are in Nike's revenue; "puma" includes the animal. adidas without Reebok before 2020 is adidas-brand sales spliced onto continuing operations (bases differ about 1.9% at the 2020 overlap).
- **Nike calendar years** blend fiscal years 5/12 + 7/12, assuming even monthly sales.
- **Google Trends** values are whole-number indices from one sampling day; sampling noise is unmeasured. Franchise values on the brand scale sit at 0–10, so rounding is coarse.
- **Franchise-share correction** assumes the topic-to-word ratio held at its 2019–21 level.
- **Launch dates weren't sourced.** Takeoff months are search-based, so "the shoe moved search" partly measures search against itself.
- **Correlation, not causation.** Pricing, distribution and wholesale changes aren't in the data.
