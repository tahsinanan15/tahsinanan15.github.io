#!/usr/bin/env python3
"""Colours the desktop kitty's line art (_dev/kitty/line.svg) once for each OS and cuts it into a puppet, into assets/kitty.
Run from the repo root:
  vectorcraft-cli run --in _dev/kitty/line.svg --export /some/tmp/line.png --scale 2
  python3 _dev/kitty/colour.py /some/tmp/line.png
Needs numpy, scipy and Pillow.

Thin black stays line. Solid black becomes the coat's points. White inside the cat becomes its fur, with one shadow tone on
the side away from the light. The cat is then cut into parts that js/kitty.js moves on their own: tail, body, three paws,
head. Each OS gets one sheet, <os>.webp, with the parts side by side in that order and the shut eyes last, every part
drawn where it sits in the whole cat. eyes.webp is the shape of the eyes, so irises can be drawn that look around.
kitty.json says how big a part is, where the head and tail turn, and where the eyes are."""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage as nd

h = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))
#        line        fur        shade      point      point lit  pink       eye white  iris       iris dark
COATS = {
    'aero':    '#3b241a #fbeeda #e2c4a4 #8a5f47 #aa7c60 #f59bab #f6fbff #58b8ff #1558c8',      # a seal point ragdoll
    'vapor':   '#3b1466 #fff0fb #f3c4ec #b967ff #d39bff #ff71ce #f4feff #01cdfe #0a6aa8',      # lilac and cyan
    'baroque': '#0a0607 #3a2c30 #281c20 #171013 #2b2025 #a8202e #fff6d8 #f0c055 #8a6414',      # a black cat with gold eyes
    'ghost':   '#00ffc8 #1d4a4c #12363a #2a6b6e #3c8a8c #ff2bd6 #021012 #ff2bd6 #8a0f72',      # dark, drawn in neon
    'ray':     '#161513 #f4ecd8 #cfc7b3 #3d3a34 #5b574e #b9b2a0 #ffffff #9a958a #4a463f',      # black and white film
    'metro':   '#3a1f10 #f6c98f #dca263 #b5642a #d0843f #f59bab #f8fff2 #9ad13c #3f7a16',      # a ginger alley cat
}
PUPILS, SCRUFF, HEIGHT = [(402, 378), (530, 352)], (400, 240), 300      # in the drawing's own 750 x 1000 space; the height sprites are saved at
NECK, TAIL_ROOT = (400, 500), (200, 715)      # where the head and the tail turn
HEAD = [(150, 120), (660, 120), (660, 420), (606, 468), (562, 498), (500, 520), (430, 530), (360, 526), (300, 514), (256, 498), (224, 470), (188, 420)]
# the parts that are solid points: each is the solid black inside its box (x0, y0, x1, y1), with the line round it
POINTS = {'tail': (0, 500, 238, 1000), 'hind': (238, 750, 368, 1000), 'near': (368, 728, 474, 1000), 'far': (474, 620, 750, 1000)}
ORDER = ['tail', 'body', 'hind', 'far', 'near', 'head']

def main(src):
    im = np.asarray(Image.open(src).convert('RGBA'), float) / 255
    k = im.shape[1] / 750
    dark = (im[..., :3].mean(2) < .5) & (im[..., 3] > .5)
    outside = nd.label(~dark)[0]
    cat = outside != outside[0, 0]
    lab, n = nd.label(cat)      # only the cat: no specks left over from the drawing's background
    cat = lab == 1 + int(np.argmax(nd.sum(cat, lab, range(1, n + 1))))
    dark &= cat
    solid = nd.binary_dilation(nd.binary_erosion(dark, iterations=int(5 * k)), iterations=int(3 * k)) & dark      # big black shapes, less a rim that stays line
    white = cat & ~dark
    parts = nd.label(white)[0]
    far = cat & ~(nd.shift(cat.astype(float), (-30 * k, -34 * k), order=0) > .5)      # what a copy of the cat, moved toward the light, no longer covers
    lit = solid & ~nd.shift(solid.astype(float), (9 * k, 11 * k), order=0).astype(bool)
    yy, xx = np.mgrid[:im.shape[0], :im.shape[1]]
    ear = np.exp(-(((xx - 246 * k) / (30 * k)) ** 2 + ((yy - 286 * k) / (46 * k)) ** 2))[..., None] * .8
    nose = (np.hypot(xx - 484 * k, (yy - 391 * k) * 1.3) < 9 * k) & white
    eyes = np.zeros_like(cat)
    for px, py in PUPILS:
        eyes |= nd.binary_fill_holes(parts == parts[int((py + 34) * k), int(px * k)])
    eyes = nd.binary_erosion(eyes, iterations=int(k))
    shut = eyes & (np.abs(yy - nd.gaussian_filter(np.where(eyes, yy, 0).astype(float), 40 * k) / np.maximum(nd.gaussian_filter(eyes.astype(float), 40 * k), 1e-6) - 6 * k) < 2.5 * k)      # a line across the middle of each
    alpha = nd.gaussian_filter(cat.astype(float), .8 * k)
    ys, xs = np.where(cat)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    w, hgt = box[2] - box[0], box[3] - box[1]
    from PIL import ImageDraw
    poly = Image.new('L', (im.shape[1], im.shape[0]), 0)
    ImageDraw.Draw(poly).polygon([(x * k, y * k) for x, y in HEAD], fill=255)
    head = cat & (np.asarray(poly) > 0)
    part = {}
    for name, (x0, y0, x1, y1) in POINTS.items():
        box_ = (xx >= x0 * k) & (xx < x1 * k) & (yy >= y0 * k) & (yy < y1 * k) & ~head
        part[name] = dark & box_ & nd.binary_dilation(solid & box_, iterations=int(8 * k))
    loose = head | np.any(list(part.values()), axis=0)
    body = cat & ~loose
    under = (nd.binary_dilation(body, iterations=int(34 * k)) & head) | (nd.binary_dilation(body, iterations=int(24 * k)) & cat & loose)      # the body carries on a little way under whatever sits on it: further under the head, which nods
    chin = head & ~nd.binary_erosion(head, iterations=int(2 * k)) & nd.binary_erosion(cat, iterations=int(5 * k)) & ~dark      # a line where the head was cut from the chest
    part.update(body=body | under, head=head)
    shrink = lambda a: np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).crop(box).resize((round(w * HEIGHT / hgt), HEIGHT), Image.LANCZOS), float)
    def strip(layers, name):      # [(rgb, alpha)] side by side
        cells = [np.dstack([shrink(nd.gaussian_filter(rgb, (.6 * k, .6 * k, 0)) / 255), shrink(nd.gaussian_filter(a.astype(float), .8 * k))]) for rgb, a in layers]
        Image.fromarray(np.hstack(cells).astype(np.uint8), 'RGBA').save(f'assets/kitty/{name}.webp', quality=88, method=6)
    for name, row in COATS.items():
        line, fur, shade, point, point_lit, pink, eye, iris, iris_dark = map(h, row.split())
        rgb = np.zeros(im.shape[:2] + (3,))
        rgb[dark], rgb[white], rgb[white & far], rgb[solid], rgb[lit] = line, fur, shade, point, point_lit
        rgb = np.where((white & (ear[..., 0] > .28))[..., None], rgb * (1 - ear) + np.array(pink) * ear, rgb)
        rgb[nose] = pink
        rgb[eyes] = eye
        rgb[chin] = np.array(line) * .5 + np.array(fur) * .5
        hidden = rgb.copy()      # the body where something sits on it: fur under the head, dark under the paws and tail
        hidden[under & head], hidden[under & ~head] = shade, point
        lids = np.zeros_like(rgb)
        lids[eyes], lids[shut] = point, line
        strip([(hidden if n == 'body' else rgb, part[n]) for n in ORDER] + [(lids, eyes)], name)
    strip([(np.ones(im.shape[:2] + (3,)) * 255, eyes)], 'eyes')
    norm = lambda x, y: [round((x * k - box[0]) / w, 4), round((y * k - box[1]) / hgt, 4)]
    json.dump({'aspect': round(w / hgt, 4), 'parts': ORDER + ['lids'], 'neck': norm(*NECK), 'tailRoot': norm(*TAIL_ROOT), 'scruff': norm(*SCRUFF),
               'eyes': [norm(*p) + [round(27 * k / w, 4), round(33 * k / hgt, 4)] for p in PUPILS],
               'coats': {n: r.split()[7:9] + ['#00ffc8' if n == 'ghost' else '#0a0605'] for n, r in COATS.items()}}, open('assets/kitty/kitty.json', 'w'), separators=(',', ':'))

if __name__ == '__main__':
    main(sys.argv[1])
