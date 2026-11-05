# Renders the day wallpaper: a real CC0 sky (wordpress.org/photos 492684d677) over hand-computed glossy hills.
import numpy as np, sys
from PIL import Image, ImageFilter
W,H=2560,1440
rng=np.random.default_rng(27)
def noise(shape,cells,seed):
    r=np.random.default_rng(seed)
    g=r.random((cells[0]+3,cells[1]+3)).astype(np.float32)
    im=Image.fromarray((g*255).astype(np.uint8)).resize((shape[1],shape[0]),Image.BICUBIC)
    return np.asarray(im,np.float32)/255
def fbm(shape,base,oct,seed,aspect=1.0):
    out=np.zeros(shape,np.float32);a=1;tot=0
    for i in range(oct):
        c=(max(2,int(base*2**i*aspect)),max(2,int(base*2**i)))
        out+=a*noise(shape,c,seed+i);tot+=a;a*=.55
    return out/tot
# sky from photo
sky=Image.open(sys.argv[1]).convert('RGB')
sw,sh=sky.size
sky=sky.crop((0,0,sw,int(sh*.70))).resize((W,int(H*.88)),Image.LANCZOS)
s=np.asarray(sky,np.float32)/255
canvas=np.zeros((H,W,3),np.float32)
canvas[:s.shape[0]]=s; canvas[s.shape[0]:]=s[-1]
# grade: push blues to Aero cobalt-cyan, lift whites
L=canvas.mean(2,keepdims=True)
sat=1.32
canvas=np.clip(L+(canvas-L)*sat,0,1)
blue=np.array([0.10,0.48,0.95],np.float32); mask=np.clip((canvas[...,2]-canvas[...,0])*2.2,0,1)[...,None]*.42
canvas=canvas*(1-mask)+blue*mask
canvas=np.clip(canvas**0.88,0,1)
X=np.arange(W,dtype=np.float32)/W
yy=np.arange(H,dtype=np.float32)[:,None]/H
def ridge(a,freqs,phases,base):
    y=np.full(W,base,np.float32)
    for f,ph,am in zip(freqs,phases,a): y+=am*np.sin(2*np.pi*f*X+ph)
    return y
def hill(ridge_y,c_top,c_bot,seed,detail,cloud=.0,rim=.015):
    global canvas
    t=(yy-ridge_y[None,:])                     # distance below ridge, in frame heights
    m=np.clip(t*H/2.5,0,1)[...,None]           # antialiased coverage
    depth=np.clip(t/(1.0-ridge_y.min()),0,1)
    patches=fbm((H,W),4,5,seed,1.6)            # broad light and shade
    grass=fbm((H,W),90,3,seed+11,.35)          # vertical blades
    fine=fbm((H,W),300,2,seed+23,.3)
    shade=np.clip(.62*(1-depth)+.5*(patches-.5)*2.1+.2*(grass-.5)*detail+.1*(fine-.5)*detail+.2,0,1)
    col=c_bot[None,None]*(1-shade[...,None])+c_top[None,None]*shade[...,None]
    # glossy rim where light skims the ridge
    r=np.exp(-np.clip(t,0,None)/rim)[...,None]
    col=col+(np.array([1,1,.72],np.float32)-col)*r*.46
    canvas=canvas*(1-m)+np.clip(col,0,1)*m
far=ridge([.018,.008,.004],[1.4,3.1,6.3],[.5,2.1,4.0],.615)
hill(far,np.array([.44,.80,.38],np.float32),np.array([.13,.48,.30],np.float32),5,.5,rim=.006)
mid=ridge([.040,.015,.006],[.82,2.0,5.0],[3.6,.4,1.0],.695)
hill(mid,np.array([.67,.93,.26],np.float32),np.array([.10,.52,.15],np.float32),41,.8,rim=.009)
front=ridge([.050,.018,.006],[.68,1.7,4.1],[.2,2.4,.3],.835)
hill(front,np.array([.72,.96,.20],np.float32),np.array([.03,.40,.07],np.float32),83,1.4,rim=.012)
# sun bloom upper right
yg,xg=np.mgrid[0:H,0:W].astype(np.float32); cx,cy=W*.86,H*.10
d=np.sqrt((xg-cx)**2+(yg-cy)**2)/W
glow=(np.exp(-d/.05)*.85+np.exp(-d/.22)*.28)[...,None]
canvas=1-(1-canvas)*(1-glow*np.array([1,.97,.86],np.float32))
# bottom vignette keeps the taskbar and labels readable
canvas*=1-np.clip((yy[...,None]-.86)/.14,0,1)*.16
Image.fromarray((np.clip(canvas,0,1)*255).astype(np.uint8)).save(sys.argv[2],quality=93)
