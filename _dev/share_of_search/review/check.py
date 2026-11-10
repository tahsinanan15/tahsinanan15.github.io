import sys, numpy as np, pandas as pd
s=pd.read_csv(sys.argv[1]); s=s[(s.pull=="A")&(s.request_id=="brands_term")]
m=s.pivot(index="month",columns="term",values="value")[["nike","adidas","puma"]]
y=m.groupby(m.index.str[:4].astype(int)).sum(); y=y[y.index<=2025]; sos=y.div(y.sum(1),axis=0)
som=pd.read_csv(sys.argv[2]); som=som[som.measure=="revenue_adidas_ex_reebok"].set_index("calendar_year")
def run(sh,label):
    X,Y,T=[],[],[]
    for b in ["nike","adidas","puma"]:
        for t in range(2010,2025):
            X.append(sos.at[t,b]-sh.at[t,b]); Y.append(sh.at[t+1,b]-sh.at[t,b]); T.append(t)
    X,Y,T=map(np.array,(X,Y,T))
    sl=np.polyfit(X,Y,1)[0]; r=np.corrcoef(X,Y)[0,1]
    e=[]; 
    for t in set(T):
        k=T!=t; c=np.polyfit(X[k],Y[k],1); e+=list(abs(Y[~k]-np.polyval(c,X[~k])))
    # year-clustered permutation: shuffle which year's outcomes go with which year's ESOS
    rng=np.random.default_rng(0); yrs=np.arange(2010,2025); cnt=0
    for _ in range(5000):
        p=rng.permutation(yrs); Yp=np.concatenate([[Y[(T==p[i])&(np.arange(len(T))//15==j)][0] for i in range(15)] for j in range(3)])
        cnt+= np.corrcoef(X,Yp)[0,1]>=r
    print(f"{label}: n={len(X)} slope={sl:+.3f} r={r:+.2f} LOYO MAE={100*np.mean(e):.2f} naive={100*np.mean(abs(Y)):.2f} perm p={cnt/5000:.4f}")
sh=som[["nike_share","adidas_share","puma_share"]].set_axis(["nike","adidas","puma"],axis=1)
run(sh,"as published USD")
# constant currency: convert EUR revenues at a fixed 1.15 USD/EUR
u=som[["nike_usd","adidas_usd","puma_usd"]].copy()
for c in ["adidas_usd","puma_usd"]: u[c]=u[c]/som.usd_per_eur*1.15
cc=u.div(u.sum(1),axis=0).set_axis(["nike","adidas","puma"],axis=1)
run(cc,"constant FX 1.15")
print("adidas share USD 2023-25:",sh.adidas.loc[2023:2025].round(4).tolist()," const FX:",cc.adidas.loc[2023:2025].round(4).tolist())
print("drop 2016-17 rows (largest ESOS)")
