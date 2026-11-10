"""raw/trends/*.csv -> search_monthly.csv (month, term, value, request_id, pull) + A-vs-B noise summary."""
import pathlib, pandas as pd
D = pathlib.Path(__file__).resolve().parent.parent
rows = []
for f in sorted((D / "raw" / "trends").glob("*__*.csv")):
    rid, pull = f.stem.split("__")
    df = pd.read_csv(f).drop(columns="isPartial")
    df["month"] = df.pop("date").str[:7]
    m = df.melt("month", var_name="term", value_name="value")
    m["request_id"], m["pull"] = rid, pull
    rows.append(m)
t = pd.concat(rows)
t.to_csv(D / "search_monthly.csv", index=False)
print(t.groupby(["request_id", "pull"]).size().to_string())
w = t.pivot_table(index=["request_id", "term", "month"], columns="pull", values="value")
if {"A", "B"} <= set(w.columns):
    w = w.dropna()
    w["d"] = (w.B - w.A).abs()
    big = w[w[["A", "B"]].max(axis=1) >= 10]
    print("\nA vs B, months where value>=10:")
    print(big.groupby("request_id").agg(n=("d", "size"), mean_abs=("d", "mean"), max_abs=("d", "max"),
          share_changed=("d", lambda s: (s > 0).mean())).round(2).to_string())
    print("\nall cells: identical share", round((w.d == 0).mean(), 3))
