"""Render every kitty action, in every coat, as single frames for the website's sprite sheets.

Run it with Blender (it renders PNG frames and a meta.json into OUT; pack_sprites.py then makes the sheets):
  nice -n 15 blender -b -t 6 --python _dev/kitty/blender/render_sprites.py -- --out /some/tmp/frames
      [--blend /some/tmp/cat.blend]   start from a saved cat.py .blend (else the cat is built from scratch)
      [--save /some/tmp/acts.blend]   save the cat with every action made; passing that file as --blend next time
                                      skips making them again (they take a few minutes)
      [--coats aero,baroque]          only these coats (all six by default)
      [--actions walk,sit]            only these actions (all by default)
      [--measure]                     only work out the cell and write meta.json, render nothing
      [--remake held]                 with --blend: make these actions_interaction actions again (the rest are kept)

What it does
  1. Makes every action from actions_locomotion, actions_idles and actions_interaction on the rig.
  2. Measures: poses every frame of every action (with the whole cat turned by the action's yaw) and projects the
     posed meshes (outline included) through the one three-quarter camera. Each frame's lowest point is then put on
     the floor row by sliding the camera up or down for that frame (FLOOR says how, per action), so every grounded
     frame of every action stands on the same row however the paws sit in depth. Every frame gets the same cell: the
     same size, the same scale (PPU pixels per Blender unit) and the same anchor (cx, floor): the floor row, and the
     column under the cat's middle (world point 0, 0, 0).
  3. Renders each frame with a transparent background into OUT/<coat>/<action>/<i>.png (i counts from 0).
  meta.json holds the cell size, the anchor (column cx, floor row), the held pose's scruff pixel, the walk and run
  strides in sheet pixels, and the actions.
The kitty makes no sound.
"""
import bpy, json, math, os, sys
import numpy as np
from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import cat, actions_locomotion, actions_idles, actions_interaction

PPU = 180           # pixels per Blender unit: a sitting cat is then about 150 px tall, 1.5 times its 100 px on the desktop
PAD = 3             # empty pixels kept round the furthest any pose reaches
FACE_PROPS = ('lid', 'mouth', 'eyes_shut')     # painted-face controls the action modules key on the head bone
# How each action's frames meet the floor row. each: every frame's lowest point on it (moves that change what
# touches the floor). first: the whole action placed as its first frame (the sit and the idles that keep all four
# paws down); a frame that would dip below the floor is lifted. lowest: the whole cycle placed by its lowest point
# (the run and the hunt, whose paws all leave the floor). none: as built (held, hanging above the floor).
# A sitting action that lifts a paw (groom, swat, point) is each: the paw that touched the floor row on its first frame
# is up, and placed as its first frame the cat would hover on its hind paws; the walk is each too, so a paw is always
# on the floor row (the body dips a pixel or two as the near paws lift, which reads as weight).
FLOOR = dict(sit='first', groom='each', yawn='first', look_around='first', swat='each', point='each',
             happy='first', nod='first', sleep='first', walk='each', run='lowest', stalk='lowest', pounce='lowest',
             held='none')


def frames_of(name):
    """The keyed frame numbers of an action (the modules start at 0 or 1)."""
    a, b = bpy.data.actions[name].frame_range
    return list(range(int(round(a)), int(round(b)) + 1))


def show(arm, a, i):
    """Pose the rig at frame i (from 0) of action a, turned by its yaw, with the face back to normal unless the
    action keys it."""
    head = arm.pose.bones['head']
    for k in FACE_PROPS:
        if k in head: head[k] = 0.0
    yaw = a['yaw'][i] if isinstance(a['yaw'], list) else a['yaw']
    arm.rotation_euler = (0, 0, math.radians(yaw))
    arm.animation_data.action = bpy.data.actions[a['name']]
    bpy.context.scene.frame_set(frames_of(a['name'])[i])


def cam_xy(cam, p):
    """A world point in the camera's picture plane, in Blender units (x right, y up)."""
    q = cam.matrix_world.inverted() @ p
    return q.x, q.y


def extents(cam):
    """Left, right, bottom, top of the posed cat (both meshes, outline shell included) in cam's picture plane."""
    dg = bpy.context.evaluated_depsgraph_get()
    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for name in ('body', 'head'):
        ob = bpy.data.objects[name].evaluated_get(dg)
        me = ob.to_mesh()
        co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co)
        m = np.array(inv @ ob.matrix_world)
        q = co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]
        xs += [q[:, 0].min(), q[:, 0].max()]; ys += [q[:, 1].min(), q[:, 1].max()]
        ob.to_mesh_clear()
    return min(xs), max(xs), min(ys), max(ys)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = lambda k: argv[argv.index(k) + 1] if k in argv else None
    out = os.path.abspath(opt('--out'))
    if opt('--blend'):
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(opt('--blend')))
        arm = bpy.data.objects['kitty_rig']
    else:
        arm = cat.build()
    sc = bpy.context.scene
    if 'kitty_actions' in sc:           # a .blend saved by --save already has every action made
        acts = json.loads(sc['kitty_actions'])
        actions_idles.add_face_controls(arm); actions_interaction.add_eyes_shut(arm)
        if opt('--remake'):
            new = {a['name']: a for a in actions_interaction.build(arm, only=opt('--remake').split(','))}
            acts = [new.get(a['name'], a) for a in acts]
            sc['kitty_actions'] = json.dumps(acts)
    else:
        acts = actions_locomotion.build(arm) + actions_idles.build(arm) + actions_interaction.build(arm)
        sc['kitty_actions'] = json.dumps(acts)
    if opt('--save'):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(opt('--save')))
    arm.animation_data_create()
    cam = bpy.data.objects['cam_three_quarter']
    cat.use_camera()

    # 1. where every frame reaches, in pixels from the world origin's picture point (x right, y up), and how far each
    # frame is raised (dy, pixels) to stand on the floor row
    ax, ay = cam_xy(cam, Vector((0, 0, 0)))
    for a in acts:
        box = []
        for i in range(a['frames']):
            show(arm, a, i)
            x0, x1, y0, y1 = extents(cam)
            box.append([(x0 - ax) * PPU, (x1 - ax) * PPU, (y0 - ay) * PPU, (y1 - ay) * PPU])
        mode = FLOOR.get(a['name'], 'each')
        low = [b[2] for b in box]
        if mode == 'each': dy = [-v for v in low]
        elif mode == 'first': dy = [max(-low[0], -v) for v in low]
        elif mode == 'lowest': dy = [-min(low)] * len(low)
        else: dy = [0.0] * len(low)
        a['dy'] = [round(d, 2) for d in dy]
        a['box'] = [[round(b[0], 1), round(b[1], 1), round(b[2] + d, 1), round(b[3] + d, 1)] for b, d in zip(box, dy)]
        print(f"  {a['name']:12s} {mode:6s} raised {min(dy):6.1f} .. {max(dy):6.1f}"
              f"   feet {min(b[2] for b in a['box']):6.1f} .. {max(b[2] for b in a['box']):6.1f}"
              f"   top {max(b[3] for b in a['box']):6.1f}   x {min(b[0] for b in a['box']):6.1f} .. {max(b[1] for b in a['box']):6.1f}")
    L = min(b[0] for a in acts for b in a['box']); R = max(b[1] for a in acts for b in a['box'])
    B = min(b[2] for a in acts for b in a['box']); T = max(b[3] for a in acts for b in a['box'])
    W = int(math.ceil(R - L)) + 2 * PAD; W += W % 2
    H = int(math.ceil(T - B)) + 2 * PAD; H += H % 2
    cx, floor = PAD + int(math.ceil(-L)), PAD + int(math.ceil(T))
    print(f'  cell {W} x {H}, anchor column {cx}, floor row {floor}')

    # 2. the camera slid so the world origin lands on pixel (cx, floor); each frame slides it again by its dy
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
    sc.render.dither_intensity = 0      # no noise on the flat colours: it would only cost bytes in the sheets
    cam.data.ortho_scale = max(W, H) / PPU
    cam.data.shift_x = cam.data.shift_y = 0
    right, up = cam.matrix_world.col[0].xyz.normalized(), cam.matrix_world.col[1].xyz.normalized()
    cam.location += right * (ax + (W / 2 - cx) / PPU) + up * (ay + (floor - H / 2) / PPU)
    base = cam.location.copy()
    bpy.context.view_layer.update()
    held = next(a for a in acts if a['name'] == 'held')
    sx, sy = cam_xy(cam, Vector(held['scruff']))
    scruff = [round(W / 2 + sx * PPU, 1), round(H / 2 - sy * PPU, 1)]
    # one stride of the walk and the run, as the picture sees it (the cat walks turned by its yaw)
    stride = {}
    for name, length in (('walk', actions_locomotion.WALK_STRIDE), ('run', actions_locomotion.RUN_STRIDE)):
        a = next(a for a in acts if a['name'] == name)
        y = math.radians(a['yaw'] if not isinstance(a['yaw'], list) else a['yaw'][0])
        stride[name] = round(Vector((math.cos(y), math.sin(y), 0)).dot(right) * length * PPU, 1)
    print(f'  scruff {scruff}, strides {stride}')

    os.makedirs(out, exist_ok=True)
    meta = dict(cell=[W, H], cx=cx, floor=floor, ppu=PPU, scruff=scruff, stride=stride, actions=acts)
    with open(os.path.join(out, 'meta.json'), 'w') as fh:
        json.dump(meta, fh)
    if '--measure' in argv: return

    # 3. render
    coats = (opt('--coats') or ','.join(cat.COATS)).split(',')
    if opt('--actions'):
        acts = [a for a in acts if a['name'] in opt('--actions').split(',')]
    for coat in coats:
        cat.apply_coat(coat)
        for a in acts:
            d = os.path.join(out, coat, a['name']); os.makedirs(d, exist_ok=True)
            for i in range(a['frames']):
                show(arm, a, i)
                cam.location = base - up * (a['dy'][i] / PPU)
                cat.render(os.path.join(d, f'{i:02d}.png'))
        cam.location = base
        print(f'  rendered {coat}')


main()
