# How I defend every number in BRING_BACK.EXE

For me, Tahsin, before an interview. Every number on the site comes from `analysis.py`, and every revenue figure in `revenue.csv` has the link and the line it came from. If someone asks, I can open the file and show them.

## My 30-second version
"I tested Les Binet's share-of-search idea on Nike, adidas and Puma from 2010 to 2025. Share of search is a brand's Google searches divided by all three brands' searches. Binet found it tends to run ahead of share of market, so I compared it with each company's share of the three companies' revenue, from their annual reports. In US dollars it looked like a strong one-year forecast. Then I caught that adidas and Puma report in euros, so their dollar share rises whenever the euro does. Holding the exchange rate fixed, the link still points the right way, but it doesn't beat guessing 'no change' and it isn't significant. The clearest single story is adidas: its retro terrace shoes went from about 1% to 20% of adidas searches, its share of search jumped about 6 points, and its revenue share rose in 2024 and 2025."

## The numbers I should know
| | Constant currency (my main measure) | US dollars |
|---|---|---|
| Correlation, search gap vs next year's revenue-share change | r = 0.38 | r = 0.63 |
| Forecast error, leave one year out | 1.32 points | 1.08 points |
| Guessing "no change" | 1.35 points | 1.46 points |
| Permutation test, shuffling search across years | p = 0.22 | p = 0.02 |
| At the ECB average rate, 1.186 | error 1.36, ties guessing | |

- 3 brands × 15 years = 45 brand-years. Because the three shares always add to 100%, it's really about 30 independent points.
- adidas terrace shoes (Samba, Gazelle, Campus, Spezial): 1.3% of adidas searches in 2022, 20.1% in 2024. adidas share of search 27.2% to 33.8%. Revenue share, constant currency: 28.7% (2023), 31.9% (2024), 34.3% (2025).
- Nike classics (Dunk, Air Force 1, Jordan 1): 21.8% of Nike searches in 2021, 11.0% in 2025. Nike share of search 62.3% to 53.6%.
- My open call: Puma's share of search in 2026 so far is 12.7%, against a 2025 revenue share of 10.1%. I said its 2026 revenue share should rise. I'll score it in constant currency when Puma reports in early 2027.

## Words I use
- **Share of search**, not "buzz". It's a published measure (Binet and Field, IPA, 2020).
- **Constant currency**: every year's euro revenue converted at one rate, 1.15 dollars. Companies report "currency-neutral" growth the same way.
- **Suggestive, not proven.** The one-year lead points the right way but weakens without currency translation.
- **Confirmatory** means I set the test up before looking (the Binet test). **Exploratory** means I noticed it afterwards (the adidas and Nike stories, the Puma call).

## How I built it, step by step
1. **Searches.** Google Trends, worldwide, monthly from 2010, the words "nike", "adidas" and "puma" in one request so they share a scale. Each brand's share of the three is its share of search.
2. **Revenue.** Nike's 10-Ks and adidas's and Puma's annual reports. adidas without Reebok, because people searching "adidas" aren't searching for Reebok. Nike's fiscal year ends in May, so I blend two fiscal years into each calendar year.
3. **The gap.** Share of search minus share of revenue. Binet's idea is that a brand with more search share than revenue share tends to gain revenue share next.
4. **The test.** Does this year's gap predict next year's change in revenue share? I fit it on all years but one, predict the left-out year, and repeat for every year. Then I compare the error with just guessing "no change".
5. **The currency check.** I re-ran everything with the euro held at one rate. That's the version I lead with.
6. **The retro shoes.** Searches for each shoe as a share of its brand's searches, so I can see how big a slice of the brand they became.

## Ready answers

**"Isn't that just the euro?"**
"Partly, and that's the thing I caught. In dollars the correlation was 0.63 and it clearly beat guessing. But adidas and Puma report in euros, so when the euro strengthens their dollar share goes up with no extra sales. When I held the exchange rate fixed, the correlation dropped to 0.38 and the forecast error was 1.32 against 1.35 for guessing no change. It also depends on the rate: at the ECB's average rate it ties guessing, and the permutation test gives p = 0.22. So I lead with the honest version: search share points the right way, but on this data it isn't a forecast."

**"Only three companies?"**
"Yes. Nike, adidas and Puma are the three big listed sportswear companies with long, comparable public revenue. New Balance is private, and On, Hoka and Asics either report differently or haven't been big long enough. So 'share' here means share of these three, not of the whole market. That's a real limit: if New Balance took share from all three, my numbers wouldn't see it."

**"Why one year?"**
"That's Binet's claim: share of search leads share of market by about a year. I also checked the same year and two years ahead: in constant currency neither showed anything. In dollars the same-year link looked good too, but that's the currency again. I only have yearly revenue, so I can't test anything shorter than a year."

**"Did Samba cause adidas's growth?"**
"I can't say that. What I can show is the order: the terrace shoes grew to a fifth of adidas searches, adidas's share of search jumped, and its revenue share rose in 2024 and 2025. That's one case, and pricing, distribution and wholesale aren't in my data. It's exploratory."

**"Why Google Trends?"**
"It's free, it goes back to 2004, and it's what Binet used. The limits: it's an index, not counts, it's sampled, and 'puma' also catches people searching for the animal. Puma is also where the signal is weakest."

**"What would you do with more time?"**
"Add the other brands, use quarterly revenue to test shorter leads, pull Trends on a second day to measure its sampling noise, and score the Puma call when the 2026 results come out."

## Limits I say before they do
- Small sample: 15 years, about 30 independent points.
- Three companies, not the whole category.
- Search words don't match revenue exactly: "nike" misses Jordan and Converse, "puma" includes the animal.
- Retro-shoe launch dates weren't sourced; I used the month searches took off.
- Correlation, not causation.

## The credit line
The site says "Study by Tahsin Anan, with research and build support". I had help with the data collection and the build, and I'm comfortable saying so if asked.
