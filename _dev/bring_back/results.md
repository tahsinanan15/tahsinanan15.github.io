# BRING_BACK results (computed 2026-11-10)

Threshold chosen on 12 cases announced 2014-2020: call LASTS when the pre-trend ratio is at least 0.907 (67% correct in training; 6 of 12 lasted, so the base call is FADES).

Holdout, 10 cases announced 2021-2023 (6 lasted):

| | correct | rate | 95% bootstrap interval |
|---|---|---|---|
| Her rule | 4/10 | 40% | 10% to 70% |
| Base rate (always FADES) | 4/10 | 40% | |
| Difference | | +0 points | -50 to +50 points |

Sensitivity (same-request Trends version): threshold None, holdout hit rate None on n = 0.

4 cases from 2024-2025 have dated calls, check back 2027. 65 candidates dropped, reasons in the CSV.

| case | announced | band | ratio | call | outcome | correct |
|---|---|---|---|---|---|---|
| Double Down | 2014-04-16 | train | 0.79 | FADES | GONE AGAIN | 1 |
| Chicken Fries | 2014-08-11 | train | 1.08 | LASTS | PERMANENT | 1 |
| French Toast Crunch | 2014-12-05 | train | 1.02 | LASTS | PERMANENT | 1 |
| Cucumber Melon (Flashback Fragrance) | 2015-06-05 | train | 1.86 | LASTS | RECURRING LIMITED | 0 |
| Crystal Pepsi | 2015-12-08 | train | 0.69 | FADES | RECURRING LIMITED | 1 |
| Hi-C Ecto Cooler | 2016-04-25 | train | 1.30 | LASTS | GONE AGAIN | 0 |
| Oreo O's cereal | 2017-05-31 | train | 1.16 | LASTS | PERMANENT | 1 |
| Zima | 2017-06-19 | train | 1.73 | LASTS | RECURRING LIMITED | 0 |
| Szechuan sauce | 2017-10-01 | train | 1.19 | LASTS | RECURRING LIMITED | 0 |
| Spicy Chicken Nuggets | 2019-05-04 | train | 1.36 | LASTS | PERMANENT | 1 |
| adidas Ozweego | 2019-06-12 | train | 2.82 | LASTS | PERMANENT | 1 |
| Dunkaroos | 2020-02-04 | train | 1.47 | LASTS | PERMANENT | 1 |
| Waffle Crisp cereal | 2021-01 | holdout | 1.56 | LASTS | PERMANENT | 1 |
| Cheesy Fiesta Potatoes / Spicy Potato Soft Taco (potato items) | 2021-01-14 | holdout | 0.65 | FADES | PERMANENT | 0 |
| Pepsi Blue | 2021-04-22 | holdout | 1.06 | LASTS | GONE AGAIN | 0 |
| Oreo Cakesters | 2021-09-30 | holdout | 2.01 | LASTS | PERMANENT | 1 |
| Mexican Pizza | 2022-04-18 | holdout | 1.68 | LASTS | PERMANENT | 1 |
| Enchirito | 2022-09-27 | holdout | 1.12 | LASTS | RECURRING LIMITED | 0 |
| Mtn Dew Pitch Black | 2022-11-15 | holdout | 1.13 | LASTS | RECURRING LIMITED | 0 |
| Nike Shox TL | 2022-12-28 | holdout | 0.69 | FADES | PERMANENT | 0 |
| King of Skin body butter | 2023-01-04 | holdout | 1.13 | LASTS | PERMANENT | 1 |
| Volcano Menu (Volcano Taco / Burrito) | 2023-03-16 | holdout | 1.35 | LASTS | GONE AGAIN | 0 |
| Puma Speedcat OG | 2024-06-11 | check back 2027 | 2.11 | LASTS | CHECK BACK 2027 |  |
| Nike Total 90 (T90 III) | 2024-06-21 | check back 2027 | 1.20 | LASTS | CHECK BACK 2027 |  |
| Original Naked eyeshadow palette | 2024-07-24 | check back 2027 | 0.79 | FADES | CHECK BACK 2027 |  |
| Snack Wrap | 2024-12-05 | check back 2027 | 0.95 | LASTS | CHECK BACK 2027 |  |

## Exploratory (after the test; not used to set anything)

Share that lasted, all scored cases 2014-2023:

| group | lasted | n |
|---|---|---|
| beauty | 1 | 2 |
| food & drink | 9 | 18 |
| sportswear | 2 | 2 |
| lasted: interest rising before the news (ratio above 1) | 10 | 12 |
| did not last: interest rising before the news (ratio above 1) | 8 | 10 |
| lowest third of ratios (0.65 to 1.08) | 4 | 7 |
| middle third (1.12 to 1.36) | 3 | 8 |
| highest third (1.47 to 2.82) | 5 | 7 |
