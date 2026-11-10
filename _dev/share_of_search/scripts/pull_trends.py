"""Pull Google Trends (worldwide, monthly, 2010-01..2026-10). Usage: pull_trends.py <pull_tag>"""
import sys, time, random, pathlib
from pytrends.request import TrendReq

TF = "2010-01-01 2026-10-31"
OUT = pathlib.Path(__file__).resolve().parent.parent / "raw" / "trends"
# (request_id, [(label, keyword-or-mid)])  topics are /m/ or /g/ mids
REQ = [
 ("brands_topic", [("Nike", "/m/0lwkh"), ("adidas", "/m/01jtml"), ("Puma", "/m/03r_n_")]),
 ("brands_term",  [("nike", "nike"), ("adidas", "adidas"), ("puma", "puma")]),
 ("adidas_topic", [("adidas", "/m/01jtml"), ("Samba", "/m/027ztyj"), ("Gazelle", "/g/11vjy825cm"),
                   ("Campus", "/g/11vhhhk63p"), ("Spezial", "/g/11y5l2zfld")]),
 ("adidas_term",  [("adidas", "/m/01jtml"), ("adidas samba", "adidas samba"), ("adidas gazelle", "adidas gazelle"),
                   ("adidas campus", "adidas campus"), ("adidas spezial", "adidas spezial")]),
 ("nike_topic",   [("Nike", "/m/0lwkh"), ("Nike Dunk", "/m/09j4j2"), ("Air Force 1", "/g/11bc5b23dx"),
                   ("Air Jordan (line)", "/m/04z421")]),
 ("nike_term",    [("Nike", "/m/0lwkh"), ("nike dunk", "nike dunk"), ("air force 1", "air force 1"),
                   ("jordan 1", "jordan 1")]),
 ("puma_topic",   [("Puma", "/m/03r_n_"), ("Speedcat", "/g/11yd73d5zs"), ("Palermo", "/g/11nr6r6tzw"),
                   ("Suede", "/g/11vq9mmngf")]),
 ("puma_term",    [("Puma", "/m/03r_n_"), ("puma speedcat", "puma speedcat"), ("puma palermo", "puma palermo"),
                   ("puma suede", "puma suede")]),
 # franchise-only pulls (no parent): full 0-100 resolution for timing; rescale via the *_term anchor pulls
 ("adidas_fr_term", [(k, k) for k in ["adidas samba", "adidas gazelle", "adidas campus", "adidas spezial"]]),
 ("nike_fr_term",   [(k, k) for k in ["nike dunk", "air force 1", "jordan 1"]]),
 ("puma_fr_term",   [(k, k) for k in ["puma speedcat", "puma palermo", "puma suede"]]),
]

tag = sys.argv[1]
p = TrendReq(hl="en-US", tz=0, timeout=(10, 30))
for rid, kws in REQ:
    f = OUT / f"{rid}__{tag}.csv"
    if f.exists():
        continue
    for attempt in range(4):
        try:
            p.build_payload([k for _, k in kws], timeframe=TF, geo="")
            df = p.interest_over_time()
            break
        except Exception as e:
            wait = 60 * (attempt + 1)
            print(rid, "attempt", attempt, repr(e)[:150], "sleep", wait, flush=True)
            time.sleep(wait)
    else:
        sys.exit(f"rate-limited at {rid}; stopping")
    df = df.rename(columns={k: lab for lab, k in kws})
    df.to_csv(f)
    print(rid, df.shape, "partial last:", bool(df["isPartial"].iloc[-1]), flush=True)
    time.sleep(20 + random.random() * 10)
