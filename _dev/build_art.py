#!/usr/bin/env python3
"""Rebuilds assets/art from assets/artworks and the real colour analysis behind OBSERVE.EXE. Run from the repo root."""
import json, os, numpy as np
from PIL import Image, ImageOps
ART=[("IMG_0704","sunset-landscape","Sunset Landscape"),("IMG_0705","gold-earrings","Gold Earrings"),("IMG_0707","clay-vase-and-apple","Clay Vase and Apple"),
("IMG_0708","sunflowers","Sunflowers"),("IMG_0709","the-tailor","The Tailor"),("IMG_0710","baseball-glove-and-bat","Baseball Glove and Bat"),
("IMG_0711","street-crowd","Street Crowd"),("IMG_0715","jersey-19","Jersey 19"),("IMG_0716","badminton-gear","Badminton Gear"),("IMG_0717","cattle-road","Cattle Road"),
("IMG_0718","flower-basket","Flower Basket"),("IMG_0719","sneakers","Sneakers"),("IMG_0720","eye-with-a-tear","Eye with a Tear"),("IMG_0721","hay-cart","Hay Cart"),
("IMG_0722","flowers-and-gloves","Flowers and Gloves"),("IMG_0723","flowers-by-the-window","Flowers by the Window"),("IMG_0724","night-street","Night Street"),
("IMG_0725","city-signs-in-the-rain","City Signs in the Rain"),("IMG_0726","skyscrapers-at-night","Skyscrapers at Night")]
def lab(rgb):
    c=rgb/255.; c=np.where(c>.04045,((c+.055)/1.055)**2.4,c/12.92)
    M=np.array([[.4124,.3576,.1805],[.2126,.7152,.0722],[.0193,.1192,.9505]])
    x=c@M.T/np.array([.95047,1,1.08883]); f=np.where(x>.008856,np.cbrt(x),7.787*x+16/116)
    return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],-1)
rows=[]
for src,slug,title in ART:
    im=ImageOps.exif_transpose(Image.open(f"assets/artworks/{src}.jpg")).convert("RGB")
    im.save(f"assets/art/{slug}.webp",quality=84,method=6)
    t=im.copy(); t.thumbnail((520,520),Image.LANCZOS); t.save(f"assets/art/thumb/{slug}.webp",quality=74,method=6)
    w,h=im.size; a=np.asarray(im.crop((int(w*.06),int(h*.06),int(w*.94),int(h*.94))).resize((220,220),Image.LANCZOS),float); L=lab(a)
    C=np.hypot(L[...,1],L[...,2])
    rows.append(dict(slug=slug,title=title,w=w,h=h,brightness=float(L[...,0].mean()),warmth=float((L[...,2]+.5*L[...,1]).mean()),chroma=float(C.mean()),contrast=float(L[...,0].std())))
F=["brightness","warmth","chroma","contrast"]; X=np.array([[r[f] for f in F] for r in rows]); Z=(X-X.mean(0))/X.std(0)
def km(Z,k,seed):
    r=np.random.default_rng(seed); c=Z[r.choice(len(Z),k,replace=False)]
    for _ in range(100):
        d=((Z[:,None]-c[None])**2).sum(2); l=d.argmin(1); n=np.array([Z[l==i].mean(0) if (l==i).any() else c[i] for i in range(k)])
        if np.allclose(n,c): break
        c=n
    return l,c,float(d.min(1).sum())
def sil(Z,l):
    D=np.sqrt(((Z[:,None]-Z[None])**2).sum(2)); s=[]
    for i in range(len(Z)):
        same=(l==l[i]); same[i]=False
        if not same.any(): s.append(0); continue
        a=D[i][same].mean(); b=min(D[i][l==j].mean() for j in set(l)-{l[i]}); s.append((b-a)/max(a,b))
    return float(np.mean(s))
out={}
for k in range(2,6):
    best=min((km(Z,k,s) for s in range(400)),key=lambda x:x[2]); l,c,_=best
    order=np.argsort(-X[:,0].__getitem__(np.arange(len(X)))) # stable label order: brightest segment first
    means=[X[l==i,0].mean() for i in range(k)]; rank={int(o):n for n,o in enumerate(np.argsort(means)[::-1])}
    out[k]=dict(labels=[rank[int(i)] for i in l],silhouette=round(sil(Z,l),3),centers=[[round(float(v),2) for v in c[o]] for o in np.argsort(means)[::-1]])
# Does it beat noise? Correlated random blobs for a null, resampling for what actually stays together.
rng=np.random.default_rng(19); R=np.linalg.cholesky(np.corrcoef(Z.T))
fit=lambda A,k: min((km(A,k,int(rng.integers(1<<31))) for _ in range(15)),key=lambda x:x[2])
blob={}
for k in (2,3):
    v=[]
    for _ in range(300):
        G=rng.standard_normal(Z.shape)@R.T; G=(G-G.mean(0))/G.std(0); v.append(sil(G,fit(G,k)[0]))
    blob[k]=dict(median=round(float(np.median(v)),2),atLeast=round(float(np.mean(np.array(v)>=out[k]["silhouette"])),2))
co=np.zeros((len(Z),len(Z)))
for _ in range(300):
    _,c,_i=fit(Z[rng.integers(0,len(Z),len(Z))],3); a=((Z[:,None]-c[None])**2).sum(2).argmin(1); co+=a[:,None]==a[None]
together={f"{i}-{j}":round(co[i,j]/300,2) for i in range(len(Z)) for j in range(i+1,len(Z))}
bestk=max(out,key=lambda k:out[k]["silhouette"])
l=np.array(out[bestk]["labels"]); cen=np.array(out[bestk]["centers"]); dist=np.sqrt(((Z-cen[l])**2).sum(1))
for i,r in enumerate(rows):
    for f in F: r[f]=round(r[f],1)
    r["z"]=[round(float(v),2) for v in Z[i]]; r["dist"]=round(float(dist[i]),2)
json.dump(dict(features=F,bestK=bestk,models=out,paintings=rows,blob=blob,together=together),open("assets/data/paintings.json","w"),separators=(",",":"),ensure_ascii=False)
print("bestK",bestk,{k:out[k]["silhouette"] for k in out})
for i in range(bestk): print(i,[rows[j]["title"] for j in np.where(l==i)[0]],out[bestk]["centers"][i])
for r in sorted(rows,key=lambda r:-r["dist"])[:5]: print(r["title"],r["brightness"],r["warmth"],r["chroma"],r["contrast"],r["z"],r["dist"])
print({k:[int((np.array(out[k]["labels"])==i).sum()) for i in range(k)] for k in out})
