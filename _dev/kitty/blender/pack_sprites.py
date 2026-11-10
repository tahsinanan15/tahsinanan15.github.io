"""Pack the frames render_sprites.py rendered into the website's kitty sprite sheets, and draw previews.

Run it with plain Python 3 (Pillow and numpy), after render_sprites.py:
  python3 _dev/kitty/blender/pack_sprites.py FRAMES_DIR [--preview /some/tmp/preview_dir] [--out DIR]
  (--out writes the sheets somewhere else than assets/kitty, for a trial)

What it writes, into assets/kitty/
  <coat>-<sheet>.webp   per coat, three sheets so the page can load the rarer ones later:
                          move (getting about, and the sit: what it needs first), idle (its pastimes and its nap,
                          loaded when the page is idle), play (held ... nod, loaded when one is first wanted)
  kitty.json            how to cut them up:
    cell [w, h]         every frame is one cell of this size, in sheet pixels (1.5 times the size to draw it at)
    cols                cells per sheet row; cell i of a sheet is at column i % cols, row i // cols
    cx, floor           the pixel in a cell under the cat's middle on the floor: place a frame by this point
    stride              how far one cycle of the walk and of the run carries the cat, in sheet pixels
    scruff [x, y]       in the held frames, where the cursor holds it: the top of the head, straight above the
                        scruff, which hangs at one point in every held frame
    coats               the coat ids (one per OS theme); sheets: the sheet names; file: the file name pattern
    actions             per action: sheet, first (its first cell), frames, fps, loop, view (always 'three_quarter':
                        one camera, the cat facing screen-right and out) and, for the jump, markers (frame numbers)
It checks every frame's lowest drawn pixel against the floor row and prints any frame that misses it.
Coats in RIM get a gilt rim here, at pack time, over Blender's outline (see RIM).
With --preview it draws contact sheets of every action in aero and baroque on their wallpapers, at the size the
desktop shows them (a sitting cat about 100 px tall) and at twice that. The kitty makes no sound.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'kitty')
SHEETS = {'move': ('walk', 'run', 'jump', 'fall', 'sit', 'sit_down', 'stand_up'),
          'idle': ('groom', 'stretch', 'yawn', 'look_around', 'sleep', 'wake'),
          'play': ('held', 'stalk', 'pounce', 'swat', 'point', 'happy', 'nod')}
COLS = 16
QUALITY, ALPHA_QUALITY = 70, 40      # flat colours and one outline: lossy WebP holds them well at this
COAT_QUALITY = {'ghost': 66}         # ghost's neon outline costs more bytes: a little lower keeps it under 900 KB a coat
MARKERS = {'jump': {'crouch': 0, 'takeoff': 4, 'air_up': 5, 'air_down': 6, 'land': 7, 'stand': 11}}  # from actions_locomotion
SHOW = 2 / 3                          # sheet pixels to desktop CSS pixels
WALL = os.path.join(ROOT, 'assets', 'wall', '{}-1000.webp')
PREVIEW = {'aero': 'hills', 'baroque': 'clay'}       # each coat on its theme's wallpaper
# A gilt rim: the outline round the silhouette (the line within RIM_PX of the transparent outside) in gold instead of the
# coat's line colour. Baroque's black cat on its dark wall needs it: its dark outline read at 1.4:1 against the wallpaper,
# the gold (#e6c565, the theme's own heading gold) at well over 3:1. Lines inside the cat, the pupils and a shut eye stay dark.
RIM = {'baroque': ('#0a0607', '#e6c565')}            # coat: (its line colour in cat.py, the rim's colour)
RIM_PX, RIM_NEAR = 3, 45                              # how far in from the outside; how close to the line colour counts as line


def frames(d, coat, a):
    return [np.array(Image.open(os.path.join(d, coat, a['name'], f'{i:02d}.png')).convert('RGBA')) for i in range(a['frames'])]


def rim(c, line, gold):
    """c with its outer outline recoloured: each pixel near the edge moves toward gold by how close it is to the line colour,
    so the antialiased edge keeps its blend."""
    from scipy import ndimage as nd
    hexc = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    line, gold = hexc(line), hexc(gold)
    rgb = c[..., :3].astype(np.float32)
    edge = nd.binary_dilation(c[..., 3] < 128, iterations=RIM_PX) & (c[..., 3] > 0)
    w = np.clip(1 - np.linalg.norm(rgb - line, axis=-1) / RIM_NEAR, 0, 1) * edge
    out = c.copy()
    out[..., :3] = np.clip(np.rint(rgb + (gold - line) * w[..., None]), 0, 255).astype(np.uint8)
    return out


def lowest(c):
    """The lowest row with a solid pixel, or None."""
    rows = np.nonzero((c[..., 3] >= 128).any(axis=1))[0]
    return int(rows[-1]) if len(rows) else None


def main():
    d = os.path.abspath(sys.argv[1])
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    global OUT
    if '--out' in sys.argv: OUT = os.path.abspath(sys.argv[sys.argv.index('--out') + 1]); os.makedirs(OUT, exist_ok=True)
    meta = json.load(open(os.path.join(d, 'meta.json')))
    W, H = meta['cell']
    acts = {a['name']: a for a in meta['actions']}
    coats = [c for c in ('aero', 'vapor', 'baroque', 'ghost', 'ray', 'metro') if os.path.isdir(os.path.join(d, c))]

    for f in os.listdir(OUT):           # the old puppet files and any earlier sheets
        if f.endswith('.webp') or f == 'kitty.json': os.remove(os.path.join(OUT, f))

    info, sizes, misses = {}, {}, set()
    for coat in coats:
        sizes[coat] = {}
        for sheet, names in SHEETS.items():
            cells = []
            for n in names:
                a = acts[n]
                info[n] = dict(sheet=sheet, first=len(cells), frames=a['frames'], fps=a['fps'], loop=a['loop'],
                               view=a['view'], **({'markers': MARKERS[n]} if n in MARKERS else {}))
                fr = frames(d, coat, a)
                for i, c in enumerate(fr):          # a grounded frame stands on the floor row (held hangs above it)
                    low = lowest(c)
                    lifted = n in ('run', 'stalk', 'pounce')   # all paws may be up
                    if n != 'held' and low is not None and (low > meta['floor'] + 1 or (low < meta['floor'] - 1 and not lifted)):
                        misses.add(f'{n} {i}: lowest row {low}')
                cells += [rim(c, *RIM[coat]) for c in fr] if coat in RIM else fr
            rows = -(-len(cells) // COLS)
            img = np.zeros((rows * H, min(COLS, len(cells)) * W, 4), np.uint8)
            for i, c in enumerate(cells):
                img[i // COLS * H:(i // COLS + 1) * H, i % COLS * W:(i % COLS + 1) * W] = c
            p = os.path.join(OUT, f'{coat}-{sheet}.webp')
            Image.fromarray(img).save(p, 'WEBP', quality=COAT_QUALITY.get(coat, QUALITY), alpha_quality=ALPHA_QUALITY, method=6)
            sizes[coat][sheet] = os.path.getsize(p)
    print(f'cell {W}x{H}, floor row {meta["floor"]}, {sum(a["frames"] for a in acts.values())} frames a coat')
    for coat, sz in sizes.items():
        print(f'  {coat:8s} {sum(sz.values()):8d} bytes   ' + '   '.join(f'{k} {v}' for k, v in sz.items()))
    print('  frames off the floor row:', ', '.join(sorted(misses)) if misses else 'none')

    # the scruff itself is behind the head from this camera: the cursor holds the top of the head straight above it
    held0 = frames(d, coats[0], acts['held'])[0]
    sx = int(round(meta['scruff'][0]))
    top = int(np.nonzero(held0[:, sx, 3] >= 128)[0][0])
    scruff = [sx, top + 3]
    meta_out = dict(cell=[W, H], cols=COLS, cx=meta['cx'], floor=meta['floor'], scruff=scruff, stride=meta['stride'],
                    coats=coats, sheets=list(SHEETS), file='{coat}-{sheet}.webp', actions=info)
    with open(os.path.join(OUT, 'kitty.json'), 'w') as fh:
        json.dump(meta_out, fh, separators=(',', ':'))
    print(f'  walk and run strides (sheet px): {meta["stride"]}; scruff (top of the head) {scruff}')

    if preview:
        os.makedirs(preview, exist_ok=True)
        for coat, wall in PREVIEW.items():
            if coat not in coats: continue
            sheets = {s: Image.open(os.path.join(OUT, f'{coat}-{s}.webp')).convert('RGBA') for s in SHEETS}
            cut = lambda a, i: sheets[a['sheet']].crop(((a['first'] + i) % COLS * W, (a['first'] + i) // COLS * H,
                                                        ((a['first'] + i) % COLS + 1) * W, ((a['first'] + i) // COLS + 1) * H))
            for tag, k, per in (('1x', SHOW, 24), ('2x', 2 * SHOW, 12)):
                w, h = round(W * k), round(H * k)
                rows = []
                for n, a in info.items():
                    idx = list(range(a['frames']))
                    rows += [(n, idx[j:j + per]) for j in range(0, len(idx), per)]
                bg = Image.open(WALL.format(wall)).convert('RGBA')
                page = 0
                for start in range(0, len(rows), 12 if tag == '2x' else 40):
                    chunk = rows[start:start + (12 if tag == '2x' else 40)]
                    im = Image.new('RGBA', (90 + per * w, len(chunk) * h))
                    tile = bg.resize((im.width, round(bg.height * im.width / bg.width)))
                    for y in range(0, im.height, tile.height): im.alpha_composite(tile, (0, y))
                    dr = ImageDraw.Draw(im)
                    for r, (n, idx) in enumerate(chunk):
                        fy = r * h + round(meta['floor'] * k)
                        dr.rectangle((0, r * h, 88, r * h + 14), fill=(0, 0, 0, 160)); dr.text((3, r * h + 2), n, fill='white')
                        for x in range(90, im.width, 6): dr.line((x, fy, x + 2, fy), fill=(255, 40, 40, 255))
                        for c, i in enumerate(idx):
                            im.alpha_composite(cut(info[n], i).resize((w, h), Image.LANCZOS), (90 + c * w, r * h))
                    im.convert('RGB').save(os.path.join(preview, f'{coat}_{tag}_{page}.png')); page += 1
        print('previews in', preview)


main()
