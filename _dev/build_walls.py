#!/usr/bin/env python3
"""Rebuilds every painting wallpaper the same way. Run from the repo root: python3 _dev/build_walls.py <masters> [name ...]

<masters> holds Real-ESRGAN x4 sharpened copies of assets/artworks, named <IMG>-x4.jpg. Sharpening needs a GPU, so rent one.
Rules: never zoom past the painting's full width. Portrait cityscapes show the whole painting, repeated along the street.
Everything else is a full-width 16:9 band. Each OS then gets its grade, and a phone copy with the same grade.
Green Hills is a render, see render_day_wallpaper.py."""
import colorsys
import sys

import numpy as np
from PIL import Image

W, H = 1920, 1080
hexrgb = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float) / 255


def ramp(a, stops):
    """Maps the painting's tones onto a palette."""
    g = a @ np.array([.2126, .7152, .0722])
    pos = [p for p, _ in stops]
    cols = np.stack([hexrgb(c) for _, c in stops])
    return np.stack([np.interp(g, pos, cols[:, i]) for i in range(3)], -1)


def natural(a):
    return a


def vapor(a):
    return ramp(a, [(0, '#22084f'), (.3, '#5f1496'), (.52, '#c23bb4'), (.7, '#ff71ce'), (.86, '#3fd9f5'), (1, '#eafcff')])


def ink(a):
    g = a @ np.array([.2126, .7152, .0722])
    return ramp(np.repeat(np.clip((g - .2) * 1.7, 0, 1)[..., None], 3, -1), [(0, '#0d0a08'), (.5, '#7a7366'), (1, '#f4ecd8')])


def candle(a):
    x = np.clip(a, 0, 1) ** 1.25 * np.array([1.16, .92, .68])
    h, w = x.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    v = np.clip(1.28 - np.hypot((xx / w - .56) / .72, (yy / h - .58) / .8), 0, 1)[..., None]
    return x * (v * .9 + .1) + np.array([.05, .004, .012]) * (1 - v)


NEON_HUE = np.interp(np.arange(256) * 360 / 256, [0, 20, 60, 170, 190, 260, 300, 360], [335, 345, 170, 168, 168, 186, 318, 335]) * 256 / 360


def neon(a):
    """Her blue night turns teal, her reds turn hot pink, and white signs pick up a pink glow."""
    img = Image.fromarray(np.uint8(np.clip(a, 0, 1) * 255)).convert('HSV')
    h, s, v = [np.asarray(c, float) for c in img.split()]
    h = NEON_HUE[h.astype(int)]
    s = np.clip(s * 1.28, 0, 255)
    v = np.clip(v / 255, 0, 1) ** 1.5 * 255
    out = np.asarray(Image.merge('HSV', [Image.fromarray(np.uint8(c)) for c in (h, s, v)]).convert('RGB'), float) / 255
    pale = np.clip((v / 255 - .6) / .3, 0, 1) * np.clip(1 - s / 110, 0, 1)
    out = out * (1 - pale[..., None] * .6) + hexrgb('#ff9ad6') * pale[..., None] * .6
    # The street falls into the dark on both sides, so the eye stays on the middle block.
    w = out.shape[1]
    return out * (1 - np.abs(np.linspace(-1, 1, w))[None, :, None] ** 1.6 * .62)


def band(master, cy):
    """A full-width 16:9 slice, centered at cy of the painting's height."""
    w, h = master.size
    bh = round(w * H / W)
    y = min(h - bh, max(0, round(cy * h - bh / 2)))
    return np.asarray(master.crop((0, y, w, y + bh)).resize((W, H), Image.LANCZOS), float) / 255


def repeated(master, fade=170, trim=24):
    """The whole painting at screen height, one copy centered, more on each side, crossfaded where they meet."""
    w, h = master.size
    p = np.asarray(master.crop((trim, trim, w - trim, h - trim)).resize((round((w - 2 * trim) * H / (h - 2 * trim)), H), Image.LANCZOS), float) / 255
    pw = p.shape[1]
    weight = np.ones(pw)
    weight[:fade], weight[-fade:] = np.linspace(0, 1, fade), np.linspace(1, 0, fade)
    canvas, total = np.zeros((H, W, 3)), np.zeros((H, W, 1))
    x0 = (W - pw) // 2
    for k in range(-3, 4):
        x = x0 + k * (pw - fade)
        a, b = max(0, x), min(W, x + pw)
        if a < b:
            canvas[:, a:b] += p[:, a - x:b - x] * weight[a - x:b - x, None]
            total[:, a:b, 0] += weight[a - x:b - x]
    return canvas / np.maximum(total, 1e-3)


def phone(master, cy):
    """A 3:4 slice for portrait screens: the whole painting when it's already tall, otherwise its center."""
    w, h = master.size
    cw = min(w, round(h * .75))
    ch = round(cw / .75)
    x, y = (w - cw) // 2, min(h - ch, max(0, round(cy * h - ch / 2)))
    return np.asarray(master.crop((x, y, x + cw, y + ch)).resize((900, 1200), Image.LANCZOS), float) / 255


# wallpaper: (painting, layout, center of the band, grade, has a phone copy)
WALLS = {
    'eye-vapor': ('IMG_0720', 'band', .46, vapor, True),
    'clay': ('IMG_0707', 'band', .62, candle, True),
    'ghost': ('IMG_0725', 'repeat', .5, neon, True),
    'gold-ray': ('IMG_0705', 'band', .46, ink, True),
    'metro': ('IMG_0726', 'repeat', .5, natural, True),
    'sunset': ('IMG_0704', 'band', .5, natural, True),
    'night-street': ('IMG_0724', 'band', .62, natural, False),
    'sunflowers': ('IMG_0708', 'band', .5, natural, False),
    'hay-cart': ('IMG_0721', 'band', .5, natural, False),
}


def save(a, name, size, quality, icc):
    im = Image.fromarray(np.uint8(np.clip(a, 0, 1) * 255 + .5))
    if size != im.size:
        im = im.resize(size, Image.LANCZOS)
    im.save(f'assets/wall/{name}.webp', quality=quality, method=6, **({'icc_profile': icc} if icc else {}))


def main():
    masters, names = sys.argv[1], sys.argv[2:] or list(WALLS)
    for name in names:
        src, layout, cy, grade, has_phone = WALLS[name]
        m = Image.open(f'{masters}/{src}-x4.jpg')
        icc = m.info.get('icc_profile')
        m = m.convert('RGB')
        wide = grade(repeated(m) if layout == 'repeat' else band(m, cy))
        save(wide, f'{name}-1920', (W, H), 82, icc)
        save(wide, f'{name}-1000', (1000, 563), 80, icc)
        if has_phone:
            save(grade(phone(m, cy)), f'{name}-phone', (900, 1200), 80, icc)
        print('built', name)


if __name__ == '__main__':
    main()
