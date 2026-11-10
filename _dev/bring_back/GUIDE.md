# How to defend every number in BRING_BACK

For Tahsin. Interviewers will ask you to walk through this. Everything below is in the files next to this guide, so you can open any number and show where it came from. The results themselves are in `results.md`; this guide explains how to talk about them.

The scripts below are written in the first person as a starting point. Say only what you did yourself. Where the sourcing, the code or the rubric had support, say so in your own words, for example "we", or "I designed the question; the sourcing and the code had support". An interviewer will respect that far more than a claim you can't back up.

## The 30-second version
"I wanted to know if you can see a comeback working before the brand even announces it. I took about 40 real US relaunches from 2014 to 2025 in food, beauty and sportswear. For each one I measured whether people were already searching for it more in the three months before the announcement than in the nine months before that, compared with the brand overall. I set a cut-off using the older cases, then tested it once on cases from 2021 to 2023 that it had never seen. The rules were written down and dated before any case's curve was pulled, apart from a three-week library test that's disclosed in the rubric." Then the result: "It didn't work as a predictor. On the 10 held-out comebacks the rule got 4 right, the same as always saying 'leave it', with a range of 10% to 70%. And 6 of those 10 lasted, so always saying 'bring it back' would have got 6. What I did see is that search interest was at least a little higher, compared with the brand, before 18 of the 22 comebacks I could score (12 of 22 by more than 15%): 10 of the 12 that lasted and 8 of the 10 that didn't. So a rise before the news is common, and on its own it doesn't separate the keepers from the flops. That part is exploratory, so I'd test it next."

## The files
| File | What it is | Open it when they ask |
|---|---|---|
| `RUBRIC.md` | The rules, written and committed to git before any case's curve was pulled (one three-week library test is disclosed inside) | "How do I know you didn't tune this after?" |
| `cases.csv` | Every candidate: dates, outcomes, sources, quotes, and why any were dropped | "Where does this date come from?" |
| `sourcing/` | The raw research notes behind `cases.csv`, plus every correction made before pulling data, with its reason | "Did you change anything?" |
| `raw/` | Every Google Trends and Wikipedia download (script pulls and hand exports, filed by `study.py import`) | "Can I see the data?" |
| `study.py` | One script that rebuilds every number from `cases.csv` and `raw/` | "Is it reproducible?" |
| `bring_back_study.csv` | The spreadsheet: one row per case with the ratio, the rule's call, the outcome and whether the call was right. It opens in Excel or Google Sheets | Any case-level question |
| `weekly_curves.csv` | The product's 52 weekly values behind every product ratio (`p_ratio`), so it can be rebuilt with AVERAGE in a spreadsheet. The brand's weeks, needed for the full pre-trend ratio, are in `raw/` (`<id>.own_c.csv`) | "Show me the maths on one case" |
| `results.md` | The holdout table, the interval, the base rate | "What did you find?" |

## The words to use
- **Attention, not sales.** Google search interest and Wikipedia pageviews measure how many people looked something up. No company publishes sales for a single relaunched flavour or shoe. Never say the rule predicts sales.
- **Small sample.** With 10 held-out cases, each case moves the hit rate by 10 points. That's why the range is wide, and why you always say it with the range.
- **Held out.** The 2021 to 2023 cases were never used to set the cut-off.
- **Base rate.** What you'd score with no signal at all, by always guessing whatever happened most often in the older cases. A rule is only worth anything if it beats that.

## Walking through the method, step by step

### 1. Which comebacks count
A product, flavour, menu item, shade or shoe that was stopped or left to fade, then publicly brought back, announced between 2014 and 2025, sold in the US, in food and drink, beauty or sportswear. I deliberately went looking for flops, so the list isn't just famous wins. Every case needs a sourced announcement date and a sourced outcome (or, for 2024 and 2025, a dated call to score in 2027), or it's dropped, and the reason is written down in `cases.csv`.

*If asked "why these categories?"*: they're the ones where companies bring things back most often, and where people search for products by name.

*If asked "how did you find them?"*: research through company newsrooms, trade press and archived product pages. Each row has the link and a quote.

### 2. The announcement date
The first credible public signal that it was coming back: a company post, a press release, or a named outlet quoting the company. If only the month is known, the date is the 1st of that month. That moves the window earlier, never later, so news can't leak into the "before" period.

*Example to give*: Crystal Pepsi is dated December 2015, when Pepsi ran a giveaway, not summer 2016 when it went on sale. That's the first moment the public knew.

### 3. What "lasted" means
Coded from what the company did in the 24 months after the announcement:
- **Permanent**: still a regular item two years later. This counts as **lasted**.
- **Recurring limited**: only came back for more limited runs.
- **Gone again**: not sold any more, or for shoes, the company said it was cutting supply or the relaunch disappointed.

The last two count as **did not last**. These rules were written down and dated before any case's curve was pulled. Cases from 2024 and 2025 haven't had 24 months yet, so they get a prediction now and get scored in 2027.

*If asked "isn't 'recurring limited' a success?"*: "Maybe for a stunt, but the question was whether the comeback lasts. A product the company keeps as a regular item is the clearest sign demand held up. I decided that before seeing any data."

### 4. The signal: the pre-trend ratio
For each case, take weekly Google search interest in the US for the 52 weeks that end before the announcement.
1. Average the last 13 weeks (3 months). Average the 39 weeks before them (9 months). Divide: that's the product's ratio. Above 1 means interest was rising.
2. Do the same for the parent brand (for example "taco bell" for the Mexican Pizza).
3. Divide the product's ratio by the brand's. That's the **pre-trend ratio**. It asks whether interest in this product was rising faster than interest in its brand, so a brand that's just growing anyway doesn't count as a signal.

Before averaging, 1 is added to every week, because Google reports tiny interest as 0, and you can't divide by zero. If more than half the weeks are 0, Google can't see the product well enough, so English Wikipedia pageviews are used instead, with the brand's Wikipedia page as the comparison. If neither works, the case is dropped.

*Show it in the spreadsheet*: open `weekly_curves.csv`, pick a row, average w-13 to w-1, average w-52 to w-14 (after adding 1), divide. You'll get that case's `p_ratio` in `bring_back_study.csv`.

*If asked "why 3 months and 9 months?"*: "It's simple to explain and was fixed in advance: the most recent quarter against the rest of the year. I didn't try other windows, because trying several and keeping the best one is how you fool yourself."

*If asked "Google Trends is scaled 0 to 100, isn't that a problem?"*: "Each term was pulled on its own, so each has its own 0 to 100 scale. The ratio only compares a term with its own past, so the scale cancels out. Pulling the product and the brand in the same request squashes the small term into whole numbers like 1 and 2, which makes its ratio noise. That change was written down before pulling any data. A same-request version was planned as a check, but it needs a third download per case, and the hand-exported cases didn't have one, so it wasn't run. That's logged in the rubric file."

### 5. Setting the cut-off, then testing it once
- Rule: if the pre-trend ratio is at or above the cut-off, call **lasts** ("bring it back"). Otherwise call **fades** ("leave it").
- The cut-off is the value that gets the most 2014 to 2020 cases right. That's the only place any fitting happens.
- Then it's applied, unchanged, to the 2021 to 2023 cases. That score is the result.

*If asked "why split by time?"*: "That's how it would be used: you learn from past comebacks and apply what you learned to the next one. Splitting by time also stops later trends leaking backwards."

### 6. The base rate
Always guess the outcome that was most common in 2014 to 2020. If most older comebacks lasted, the base call is "lasts". The rule has to beat that to be worth anything.

Here the 2014 to 2020 cases split 6 and 6, so the base call came from a tie rule set in advance: a tie means "did not last" ("leave it"). In the holdout 6 of 10 lasted, so always saying "bring it back" would have scored 6 of 10, better than the rule's 4. Say that before they do (see the questions below).

### 7. The interval
A bootstrap: resample the held-out cases with replacement 10,000 times and recompute the hit rate each time. The middle 95% of those results is the range. It shows how much the result could move if the sample had been slightly different. The seed is fixed (2026), so anyone who runs `study.py` gets the same range.

*If asked "why bootstrap and not a formula?"*: "With this few cases, the bootstrap makes no assumption about the shape of the distribution, and it gives a range for the difference against the base rate too."

## Limits to say before they do
- **Small n.** 10 held-out cases. Read it with its range, not as proof.
- **Many cases were too small for Google to measure.** 42 comebacks were sourced, but only 26 had enough search data under the rule set in advance (more than half the weeks above zero), so big, much-searched products are over-represented. One case (Popeyes Cajun Rice) is still unmeasured because the planned search term wasn't downloaded.
- **The rule tied with always saying "leave it", and did worse than always saying "bring it back"** (6 of 10). Say it plainly. A null result found with a fixed method is still a finding, and it's more believable than a lucky win.
- **Attention, not sales.** Search interest is a proxy for curiosity.
- **Coding outcomes takes judgement.** That's why the rubric was frozen first, every outcome has a source and quote, and borderline cases are flagged in the `confidence` and `edit_note` columns.
- **Who gets brought back is already selected.** Companies only relaunch things they think will work, so this tells you about relaunches that happened, not every product that could have come back.
- **One held-out case is measured on its whole line.** Nike Shox TL was too thin on Google, so it uses Wikipedia views of the "Nike Shox" article, which covers the whole Shox line, not just the TL. Other thin sneakers (for example Nike Air Max 1 '86) weren't given a line-level article and were dropped. It's logged in the rubric. It counted against the rule (the rule said "leave it" and the Shox TL lasted), so it didn't flatter the result.
- **Uneven coverage.** Big brands are searched more, so small brands are more likely to fall back to Wikipedia or be dropped.
- **Google Trends is sampled.** Pulling the same term twice can give slightly different numbers. The raw downloads are saved so the result can be checked exactly.

## Questions you might get, and short answers
- *"So should a brand team use this?"* "Not as a go/no-go signal. Search was already rising before most comebacks, keepers and flops alike, and on 10 held-out cases the rule did no better than always saying 'leave it' (4 of 10) and worse than always saying 'bring it back' (6 of 10). What I'd test next is whether demand holds after launch, with a limited run or a few regions."
- *"What if you'd just said 'bring it back' every time?"* "You'd have got 6 of 10, better than the rule. The older cases split 6 and 6, so the base call came from a tie rule I set in advance, and it went to 'leave it'. In the holdout more lasted than not, which is one more reason the rule isn't useful."
- *"What would you do with more time?"* "Add more held-out cases, have a second person code the outcomes independently and check agreement, and score the 2024 and 2025 predictions in 2027."
- *"What surprised you?"* "How common the pre-announcement rise is: 18 of 22, faded ones included. My guess is that brands bring things back when people are already talking about them, and leaks and teasers before the official date could also push the numbers up. Either way, buzz alone didn't separate the keepers." Say it's exploratory and a guess: only products that did come back were studied, so it can't say whether a rise means a comeback is coming.
- *"So the study failed?"* "The rule did. The study did its job: it stopped me trusting a signal that looks convincing on a chart. The next thing I'd test is whether demand holds after the first spike, measured after launch, and I'd have a second person code the outcomes."
- *"What counts as rising?"* "A ratio above 1, with no margin. With a 15% margin it's 12 of 22, and it still doesn't separate keepers from flops: 7 of the 12 that lasted and 5 of the 10 that didn't."
- *"Did you see any data before freezing the rules?"* "One thing, and it's written in the rubric: while checking the Google Trends library worked, a test printed three weeks of 'crystal pepsi' against 'pepsi'. That's why each term is pulled in its own request. No case's curve was pulled before the rules were dated. The Wikipedia articles for two thin cases were named after the Trends downloads, and that's disclosed too."
- *"Why did data collection change?"* "Google Trends blocked the script partway through, so the rest was exported by hand from the Trends website with the same terms and dates. It's logged in the rubric file."
- *"Did you change anything after seeing the results?"* "No. The rules were committed to git before the data, and every correction made before pulling the data is logged with its reason. The git history shows the order."

## The credit line
The study was designed and run with research and build support. The site says "Study by Tahsin Anan, with research and build support". Be ready to say what you did yourself, and be honest about the support.
