#!/usr/bin/env python3
"""KITTY_RUN.EXE's pixel effects, from pixelfx (https://github.com/patch-gg/pixelfx), in each OS's own colours.

  python3 _dev/run_fx/build.py /path/to/pixelfx-checkout

Copies paw-puff.js (ours) into the checkout, renders every effect as a sprite sheet once per OS with that OS's palette,
and packs them into assets/run/fx-<os>.png, one row per effect, with assets/run/fx.json giving each effect's row,
frame size, frame count, fps and pivot (the effect's origin: where it sits on the road).
  puff    impacts/paw-puff          dust from her paws at each stride, in the colours of that OS's road
  land    impacts/paw-puff (big)    landing from a leap
  hit     impacts/hit-spark         a stumble, in the OS's accent
  burst   pickups/collect-burst     a power-up, the shield popping, and (small) each bubble
The pixels are the LCD's language: the play-along's readout, the Silkscreen file names and the pixel glyphs.
"""
import json, os, shutil, subprocess, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'run')
MAXW = 2048
ROAD = {   # dark to bright: what each road throws up
    'aero':    ['#06306b', '#0563c4', '#19b9f6', '#7ff1ff', '#d9fbff', '#ffffff'],   # spray off the glass causeway
    'vapor':   ['#12063a', '#3b1178', '#b0329e', '#ff71ce', '#ffd1f1', '#ffffff'],   # the grid's pink
    'baroque': ['#3d060d', '#6d0a1a', '#a01828', '#d7a93f', '#f0c055', '#fff0b8'],   # the red runner, gold thread
    'ghost':   ['#02080a', '#0a3a40', '#0a7f8c', '#19f7ff', '#c9fdff', '#ffffff'],   # wet street under teal neon
    'ray':     ['#1a1917', '#3d3a34', '#6f6b62', '#8a857a', '#cfc7b3', '#f4ecd8'],   # ballast and film
    'metro':   ['#16171a', '#2a2a2e', '#56534c', '#8a857a', '#ffc247', '#fff3cf'],   # asphalt in sodium light
}
ACCENT = {   # dark to bright: each world's own light (its play-along hands)
    'aero':    ['#021a3d', '#06306b', '#0563c4', '#19b9f6', '#7ff1ff', '#d9fbff', '#f3ffc8', '#ffffff'],
    'vapor':   ['#12063a', '#3b1178', '#7b1fa2', '#b967ff', '#ff71ce', '#ffd1f1', '#fffb96', '#ffffff'],
    'baroque': ['#1a0306', '#3d060d', '#6d0a1a', '#a8202e', '#b8923a', '#f0c055', '#fff0b8', '#ffffff'],
    'ghost':   ['#02080a', '#0a2224', '#0a5a62', '#0a7f8c', '#19f7ff', '#c9fdff', '#fcee0a', '#ffffff'],
    'ray':     ['#000000', '#1d1b18', '#3d3a34', '#5b574e', '#9a958a', '#cfc7b3', '#f4ecd8', '#ffffff'],
    'metro':   ['#16171a', '#2a2a2e', '#5a3a10', '#c27a0a', '#f7b500', '#ffc247', '#fff3cf', '#ffffff'],
}
EFFECTS = [   # name, pixelfx id, options for an OS
    ('puff', 'impacts/paw-puff', lambda o: {'palette': ROAD[o]}),
    ('land', 'impacts/paw-puff', lambda o: {'palette': ROAD[o], 'big': 1, 'seed': 7}),
    ('hit', 'impacts/hit-spark', lambda o: {'palette': ACCENT[o][1:]}),
    ('burst', 'pickups/collect-burst', lambda o: {'palette': ACCENT[o]}),
]


def main():
    pfx = os.path.abspath(sys.argv[1])
    shutil.copyfile(os.path.join(os.path.dirname(__file__), 'paw-puff.js'), os.path.join(pfx, 'src', 'fx', 'impacts', 'paw-puff.js'))
    meta = {}
    for os_ in ROAD:
        rows = []
        for name, fid, opts in EFFECTS:
            subprocess.run(['node', 'tools/render.mjs', fid, '--sheet', '--opts', json.dumps(opts(os_))], cwd=pfx, check=True, capture_output=True)
            base = os.path.join(pfx, 'records', fid, fid.split('/')[1])
            sheet, info = Image.open(base + '.png').convert('RGBA'), json.load(open(base + '.json'))
            frames = [sheet.crop((f['frame']['x'], f['frame']['y'], f['frame']['x'] + f['frame']['w'], f['frame']['y'] + f['frame']['h'])) for f in info['frames']]
            rows.append((name, frames, info['meta']['pixelfx']))
        cols = {name: min(len(f), MAXW // f[0].width) for name, f, _ in rows}   # wrapped so no sheet is wider than a phone allows
        W, H = max(cols[n] * f[0].width for n, f, _ in rows), sum(-(-len(f) // cols[n]) * f[0].height for n, f, _ in rows)
        atlas, y = Image.new('RGBA', (W, H)), 0
        for name, frames, px in rows:
            c, w, h = cols[name], frames[0].width, frames[0].height
            for i, fr in enumerate(frames): atlas.paste(fr, (i % c * w, y + i // c * h))
            meta[name] = dict(y=y, w=w, h=h, cols=c, frames=len(frames), fps=px['fps'], pivot=px['pivot'])
            y += -(-len(frames) // c) * h
        p = os.path.join(OUT, f'fx-{os_}.png')
        atlas.save(p, optimize=True)
        print(f'  {os_:8s} {os.path.getsize(p):7d} bytes  {W}x{H}')
    with open(os.path.join(OUT, 'fx.json'), 'w') as fh:
        json.dump(dict(file='fx-{os}.png', effects=meta), fh, separators=(',', ':'))


main()
