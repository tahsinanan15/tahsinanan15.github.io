# BRING_BACK study: rules written before any curve was computed

Written 2026-11-09 and committed to git before any search-interest series for these cases was pulled or looked at. The commit time is the proof. Nothing in this file changes after the holdout is scored; if a rule turns out wrong, the fix goes in a new dated section below, and the original result is still the one reported.

## Question
Does fan interest rising BEFORE a comeback is announced predict that the comeback lasts?

## Which cases count
- A product, flavour, menu item, shade or shoe model that a company had stopped selling, or had left to fade, and then publicly brought back, 2014-01-01 to 2025-12-31.
- Category is food and drink, beauty, or sportswear.
- Sold in the US, because the attention measure is US Google search.
- There is a sourced announcement date: the first credible public signal that it was coming back (a company statement, an official post, or a report in a named outlet quoting the company or a retailer). A rumour that the company did not confirm is not the signal.
- Misses are searched for on purpose: relaunches that were pulled again, panned or discounted, not only the famous wins.
- A case is dropped, with the reason written down, if no announcement date can be sourced to the month, or no outcome can be sourced, or the attention series fails the data rules below. Drops are listed in the dataset, never silently removed.

## Outcome, coded from what the company did next, 24 months after the announcement
- PERMANENT: still sold nationally as a regular item 24 months after the announcement (menu, core range, general release), and the company has not publicly cut it back.
- RECURRING LIMITED: not a regular item, but the company sold it again in at least one more limited run within 24 months of the first comeback.
- GONE AGAIN: not available from the company 24 months after the announcement, with no further run. For shoes and other ranges that are rarely withdrawn outright, a company statement within 24 months that it is cutting supply, that the relaunch disappointed, or a documented clearance of the model also counts as GONE AGAIN.
- Evidence is a source a reader can open. If the evidence is mixed, the case is coded on the most recent company action inside the 24 months, and a note says so.
- Cases announced in 2024 or 2025 do not have 24 months yet. They get a dated call from the rule and are marked "check back 2027". They are never scored.

The question is whether a comeback lasts, so the scored outcome is binary: LASTED = PERMANENT; DID NOT LAST = RECURRING LIMITED or GONE AGAIN. The three-way codes are shown as they are.

## Predictor: the pre-trend ratio
- Series: weekly US Google Trends for the product's search term, pulled in the same request as a control term (the parent brand, or the category when the brand is too broad), so both are on the same 0-100 scale.
- Window: the 52 full weeks that end before the week of the announcement. Nothing from the announcement week or after is used.
- Ratio for one series = mean of the last 13 weeks / mean of the 39 weeks before them.
- Pre-trend ratio = product ratio / control ratio. Above 1 means interest in the product was rising faster than interest in its brand, before anyone announced anything.
- Zero rule, fixed now: add 1 to every weekly value of both series before taking means (Trends reports "<1" as 0, so a term at the floor gives a ratio near 1 rather than a divide by zero).
- Too thin to read, fixed now: if more than half of the product's 52 weeks are 0, Google Trends is not used for that case. Then English Wikipedia daily pageviews (all-access, user agent) are used instead, with the parent brand's article as the control, the same window and the same rule, if both articles have full data for the window (pageviews begin July 2015). If neither source is readable, the case is dropped with that reason.
- Search terms are chosen from the product's common name before the series is pulled, and written in the dataset.

## Rule, threshold and test
- Direction fixed in advance: a higher pre-trend ratio predicts LASTED.
- Rule: call LASTED when pre-trend ratio >= T.
- T is chosen on cases announced 2014 to 2020 only, as the value that gives the most correct calls on those cases. Ties are broken by taking the midpoint of the widest tied range of ratios.
- The holdout is cases announced 2021 to 2023. T is not touched after the holdout is seen.
- Base rate: the hit rate of always calling the outcome that was more common in 2014 to 2020. Also reported: the share of holdout cases that lasted.
- Reported: holdout hit rate, base rate, the difference, n, and a 95% interval from 10,000 bootstrap resamples of the holdout cases (percentile method, seed 2026).
- Whatever the holdout says is published. If the rule does not beat the base rate, that is the finding, and anything else that seems to separate the outcomes is shown only as exploratory, labelled so.
- Words: the measure is attention (search interest), never sales. At this n the result is called directional, always with its range.

## Added 2026-11-09, still before any case's curve was pulled
- One honest disclosure first: while checking that the Google Trends library works, a test request printed three weeks of "crystal pepsi" against "pepsi" from January 2014. The product sat at 1 against the brand at 36 to 47. Nothing else about any case's curve was seen.
- That test is the reason for one change. In a shared request the small term is rounded to whole numbers on the big term's scale, so a product at 1 or 2 out of 100 moves in 50% steps, and the ratio is noise. The ratio only compares a series with its own past, so it does not need the two terms on one scale. So each term is pulled in its own request, on its own 0-100 scale, over the same dates, and the product's ratio is divided by the control's as before. The same-request version is also computed and reported as a sensitivity check, never as the result.
- An announcement known only to the month is dated to the 1st of that month, so the window can only end early, never late.
- Weeks are Google's Sunday-start weeks. The window is the 52 weeks whose last day falls before the announcement date. Wikipedia daily pageviews are summed into the same weeks.

## Added 2026-11-10, during data collection (no rule changed)
- Google Trends rate-limited the script after 25 files. The remaining series were exported by hand from the Google Trends website, from links that set the same term, the same US region and the same dates; `study.py import` filed each export by the term and dates written inside it. Same source, same rules.
- One export came back for "cajun rice" instead of the planned "popeyes cajun rice". It was not used, so Popeyes Cajun Rice is unmeasured, not dropped on its data. It can be added by exporting the planned term and rerunning; the threshold would not change, because it was set on 2014-2020 cases only.
- The same-request sensitivity check needs a third download per case and was not run for the hand-exported cases, so it is not reported.
- The base-rate tie rule (a 50/50 training split calls "did not last") was in `study.py` when it was committed with the case list, before any ratio was computed. The 2014-2020 split came out 6 and 6, so it applied.
