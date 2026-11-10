"""The kitty's interaction actions: what it does when someone picks it up, hunts the cursor, plays, or pets it.

Use inside Blender, on the saved cat (see cat.py):
  sys.path.append('_dev/kitty/blender'); import actions_interaction
  actions = actions_interaction.build(bpy.data.objects['kitty_rig'])
build(arm) makes one Blender Action per behaviour on the armature and returns a list of
{name, frames, fps, loop, view, yaw}. Each action is keyed on every frame 1..frames at 12 fps (game sprite rate), so a
sprite renderer just steps through whole frames. All are drawn from the one three-quarter camera; yaw (degrees) turns
the whole armature object about Z: 0 faces out, cat.TRAVEL_YAW is turned toward screen-right for the hunt.
Loops join seamlessly: the frame after the last would be the same as frame 1. The cat stays in place; the website
moves it across the screen.

The actions
  held    hanging by the scruff: body straight down below it, front paws dangling, hind legs and tail hanging loose,
          a little swing (loop). The scruff stays at one point (HELD_SCRUFF, also returned as the held action's
          'scruff'), so the page can pin that point to the cursor; the hind paws hang above the floor.
  stalk   low crouch, eyes locked forward, rear end wiggling, tail tip twitching (loop, turned to travel)
  pounce  crouch, spring, a stretched leap arcing up and down in place, land with a squash, paws pinning, and up to
          standing, so sit_down follows on (turned to travel)
  swat    sitting, a quick paw swipe up and out toward screen-right and back down
  point   sitting, reaches its near paw out in front and up toward screen-right and looks along it; the last frame is
          a pose to hold (the site mirrors it to point left)
  happy   sitting, being stroked: eyes shut, head rubbing into the hand, a little bounce (loop)
  nod     a head bob on a music beat, frame 1 is the beat (loop, 6 frames = 120 bpm at 12 fps)
  swat, point, happy and nod start from the same sit pose as the idles (actions_idles.p_sit).

Shut eyes
  The eyes are painted by the head material, so they cannot close by moving bones. build() adds a custom property
  "eyes_shut" on the head pose bone (0 open, 1 shut) and a driver that paints happy "^" lids over the eyes when it
  is 1. Every action here keys it; anything that renders other actions afterwards should set it back to 0.

Every pose is computed in Python per frame (no Blender interpolation), so what is keyed is exactly what renders.
The kitty makes no sound.
"""
import bpy, math, os, sys
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
import bmesh

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import cat, actions_idles

FPS = 12
HELD_SCRUFF = Vector((0.0, 0.0, 1.0004375))   # where the scruff hangs, in the rig's space: fixed, so the cell and
                                              # the page's cursor point stay put whatever the legs do
LEGS = [f'leg.{k}.{s}' for k in ('front', 'back') for s in ('L', 'R')]
TAIL = [f'tail.0{i}' for i in range(1, 7)]


# ---------- small maths ----------

def wave(t, phase=0.0):
    """A sine of one full cycle per unit of t, shifted by phase (in cycles)."""
    return math.sin(2 * math.pi * (t - phase))


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def keys(i, table):
    """Linear-in-ease interpolation through a table of (frame, value) pairs (value may be a number or a tuple)."""
    if i <= table[0][0]: return table[0][1]
    for (f0, v0), (f1, v1) in zip(table, table[1:]):
        if i <= f1:
            t = ease((i - f0) / (f1 - f0))
            return tuple(lerp(a, b, t) for a, b in zip(v0, v1)) if isinstance(v0, tuple) else lerp(v0, v1, t)
    return table[-1][1]


# ---------- posing helpers ----------

def pb(arm, name):
    return arm.pose.bones[name]


def turn(arm, name, x=0.0, y=0.0, z=0.0):
    """Add a turn (degrees) about the bone's own axes, on top of what it already has."""
    r = pb(arm, name).rotation_euler
    r.x += math.radians(x); r.y += math.radians(y); r.z += math.radians(z)


def head_of(arm, name):
    bpy.context.view_layer.update()
    return pb(arm, name).head.copy()


def move_root(arm, m):
    """Apply a rig-space transform m to the whole cat (it moves the root, so every bone follows)."""
    bpy.context.view_layer.update()
    r = pb(arm, 'root')
    r.matrix = m @ r.matrix


def about(point, axis, deg):
    """A rotation by deg about an axis through point."""
    p = Vector(point)
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis)) @ Matrix.Translation(-p)


def squash(arm, up, pivot_z=0.0):
    """Squash (up < 1) or stretch (up > 1) the whole cat about a floor point, keeping its volume."""
    side = 1 / math.sqrt(up)
    m = Matrix.Translation((0, 0, pivot_z)) @ Matrix.Diagonal((side, side, up, 1)) @ Matrix.Translation((0, 0, -pivot_z))
    move_root(arm, m)


FLOOR = -0.008      # the lowest point of the cat standing at rest (its outline reaches a hair below the paws)


def lowest_point():
    """The lowest point of the posed cat (body and head, outline included), in the rig's space."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    low = 1e9
    for nm in ('body', 'head'):
        ob = bpy.data.objects[nm].evaluated_get(dg)
        me = ob.to_mesh()
        mw = ob.matrix_world
        low = min(low, min((mw @ v.co).z for v in me.vertices))
        ob.to_mesh_clear()
    return low


def bone_len(arm, name):
    return arm.data.bones[name].length


def leg_to(arm, leg, toe, paw_deg=None):
    """Two-bone IK in the side plane: put the leg's toe at toe=(x, z) with the paw pointing paw_deg (default: as at
    rest, so a planted paw sits flat on the floor).
    Front legs bend with the elbow behind, hind legs with the knee in front (hock behind)."""
    up, lo, pw = f'{leg}.upper', f'{leg}.lower', f'{leg}.paw'
    if paw_deg is None: paw_deg = PAW_REST[leg]
    hip = head_of(arm, up)
    wrist = Vector((toe[0], toe[1])) - bone_len(arm, pw) * Vector((math.cos(math.radians(paw_deg)), math.sin(math.radians(paw_deg))))
    a, b = bone_len(arm, up) * pb(arm, up).scale.y, bone_len(arm, lo)
    v = wrist - Vector((hip.x, hip.z))
    d = max(abs(a - b) + 1e-4, min(a + b - 1e-4, v.length))
    base = math.atan2(v.y, v.x)
    bend = math.acos(max(-1, min(1, (a * a + d * d - b * b) / (2 * a * d))))
    ua = base + (bend if '.back.' in leg else -bend)
    knee = Vector((hip.x, hip.z)) + a * Vector((math.cos(ua), math.sin(ua)))
    lv = wrist - knee
    cat.aim(arm, {up: math.degrees(ua), lo: math.degrees(math.atan2(lv.y, lv.x)), pw: paw_deg})


def rest_toes():
    """Where each toe stands in the rest pose, as (x, z)."""
    out = {}
    for s in ('L', 'R'):
        f, b = cat.leg_joints(s)
        out[f'leg.front.{s}'] = (f[3].x, f[3].z)
        out[f'leg.back.{s}'] = (b[3].x, b[3].z)
    return out


TOES = rest_toes()
PAW_REST = {}       # each paw bone's angle in the side view at rest
for _s in ('L', 'R'):
    for _k, _j in zip(('front', 'back'), cat.leg_joints(_s)):
        PAW_REST[f'leg.{_k}.{_s}'] = math.degrees(math.atan2(_j[3].z - _j[2].z, _j[3].x - _j[2].x))


def tail_wave(arm, amp_x, amp_z, t, lag=0.08, phase=0.0, grow=0.25):
    """Overlapping action down the tail: each bone turns a little later and a little more than the one before.
    Every turn is zero at t = 0, so an action that starts sitting starts on the sit pose's tail."""
    w = lambda t, ph: wave(t, ph) - wave(0, ph)
    for k, name in enumerate(TAIL):
        g = 1 + grow * k
        turn(arm, name, x=amp_x * g * w(t, phase + lag * k), z=amp_z * g * w(t, phase + 0.25 + lag * k))


def set_eyes(arm, v):
    pb(arm, 'head')['eyes_shut'] = float(v)


# ---------- shut eyes in the head material ----------

def add_eyes_shut(arm):
    """Paint happy '^' lids over the eyes when the head bone's "eyes_shut" property is 1 (a driver feeds it in)."""
    h = pb(arm, 'head')
    if 'eyes_shut' not in h: h['eyes_shut'] = 0.0
    nt = bpy.data.materials['head'].node_tree
    if 'eyes_shut' in nt.nodes: return
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = out.inputs['Surface'].links[0].from_node
    c = em.inputs['Color'].links[0].from_socket
    shut = cat.value(nt, 'eyes_shut')
    drv = nt.nodes['eyes_shut'].outputs[0].driver_add('default_value').driver
    drv.type = 'AVERAGE'
    var = drv.variables.new(); var.type = 'SINGLE_PROP'
    var.targets[0].id_type = 'OBJECT'; var.targets[0].id = arm
    var.targets[0].data_path = 'pose.bones["head"]["eyes_shut"]'

    # the same eye frames cat.build_head painted with (on the rest-pose head surface)
    head = bpy.data.objects['head']
    bm = bmesh.new(); bm.from_mesh(head.data)
    hits = BVHTree.FromBMesh(bm)
    rest = cat.attr(nt, 'rest', 'Vector')
    m = lambda op, a, b=None: cat.m(nt, op, a, b)
    lids = cat.fur_colour(nt)            # the masked fur under the lids
    region, ink = None, None
    for s in (1, -1):
        z = cat.face_dir(cat.EYE_AZ * s, cat.EYE_EL)
        x = Vector((0, 0, 1)).cross(z).normalized(); y = z.cross(x)
        centre = hits.ray_cast(cat.HEAD_C + z * 0.6, -z)[0]
        d = cat.offset(nt, rest, centre)
        u = m('DIVIDE', cat.dot(nt, d, x), cat.EYE_RX)
        v = m('DIVIDE', cat.dot(nt, d, y), cat.EYE_RY)
        w = cat.dot(nt, d, z)
        near_w = m('LESS_THAN', m('ABSOLUTE', w), 0.04)
        inside = m('MULTIPLY', m('LESS_THAN', m('ADD', m('MULTIPLY', u, u), m('MULTIPLY', v, v)), 1.15), near_w)
        cv = m('ADD', v, 0.45)                                   # a '^' arc: part of a ring centred below the eye
        r = m('SQRT', m('ADD', m('MULTIPLY', u, u), m('MULTIPLY', cv, cv)))
        arc = m('MULTIPLY', m('LESS_THAN', m('ABSOLUTE', m('SUBTRACT', r, 0.62)), 0.13), m('GREATER_THAN', cv, 0.22))
        arc = m('MULTIPLY', arc, near_w)
        region = inside if region is None else m('MAXIMUM', region, inside)
        ink = arc if ink is None else m('MAXIMUM', ink, arc)
    bm.free()
    lids = cat.mix(nt, ink, lids, cat.rgb(nt, 'coat_lid'))
    c = cat.mix(nt, m('MULTIPLY', region, shut), c, lids)
    nt.links.new(c, em.inputs['Color'])


# ---------- the poses, one function per action: pose(arm, i) for frame index i = 0..frames-1 ----------

def scruff_point(arm):
    """The loose skin at the back of the neck, just behind the skull, in the rig's space."""
    bpy.context.view_layer.update()
    h = pb(arm, 'head')
    return h.matrix @ h.bone.matrix_local.inverted() @ Vector((0.03, 0.0, 0.47))


def held(arm, i, n=12):
    """Hanging from the scruff, relaxed: the body straight down below it, the front paws dangling limp in front of
    the chest, the two hind legs hanging apart and loose (the near one a little forward, the far one a little bent),
    the tail hanging behind them and curling out to screen-left, clear of the legs. The whole cat swings a little
    about the scruff; the legs and tail swing a beat behind, each on its own beat. The scruff stays at HELD_SCRUFF."""
    t = i / n
    cat.pose_rest(arm)
    set_eyes(arm, 0)
    move_root(arm, about((0, 0, 0.27), (0, 1, 0), -88))       # tip the whole cat up: rump down, head up
    cat.aim(arm, {'spine': (0.06, 0, 1), 'chest': (0.12, 0, 1), 'neck': (0.45, 0, 1), 'head': (0.12, 0, 1)})
    turn(arm, 'head', x=8, y=-10)                    # chin tucked a little, face a little toward the camera
    for s_ in ('L', 'R'):
        turn(arm, f'ear.{s_}', x=-22)                # ears back: not thrilled
    view = bpy.data.objects['cam_three_quarter'].matrix_world.col[2].xyz
    def hang(d, lag, amount):
        return Matrix.Rotation(math.radians(12 * amount * wave(t, lag)), 3, view) @ Vector(d).normalized()
    for s_, o in (('R', 0.0), ('L', 0.05)):
        y = 1 if s_ == 'L' else -1
        cat.aim(arm, {f'leg.front.{s_}.upper': hang((0.45, 0.08 * y, -1), 0.10 + o, 0.5),
                      f'leg.front.{s_}.lower': hang((0.25, 0.03 * y, -1), 0.14 + o, 0.7),
                      f'leg.front.{s_}.paw': hang((0.55, 0, -0.8), 0.18 + o, 0.9)})
    # hind legs: apart, hanging nearly straight; the near (R) one a touch forward, the far (L) one bent at the hock
    for name, d, lag, amt in HIND:
        cat.aim(arm, {name: hang(d, lag, amt)})
    for k, (name, d) in enumerate(zip(TAIL, HELD_TAIL)):
        cat.aim(arm, {name: hang(d, 0.30 + 0.06 * k, 0.5 + 0.12 * k)})
    s = scruff_point(arm)
    move_root(arm, Matrix.Translation(HELD_SCRUFF - s))
    if i == 0: print(f'  held: lowest point {lowest_point():.3f} (floor {FLOOR})')
    move_root(arm, about(HELD_SCRUFF, view, 4 * wave(t)))     # the swing


HIND = [   # bone, direction in the rig's space (x forward, y the cat's left, z up), swing lag (cycles), swing amount
    ('leg.back.R.upper', (0.60, -0.30, -1), 0.14, 0.5), ('leg.back.R.lower', (0.30, -0.05, -1), 0.20, 0.8),
    ('leg.back.R.paw', (0.50, -0.05, -1), 0.26, 1.0),
    ('leg.back.L.upper', (0.30, 0.50, -1), 0.40, 0.5), ('leg.back.L.lower', (-0.05, 0.25, -1), 0.46, 0.8),
    ('leg.back.L.paw', (0.45, 0.05, -1), 0.52, 1.0)]
# behind the hind legs (-x is away from the camera) and out to the near side, the tip curling up: screen-left of them
HELD_TAIL = [(-0.75, -0.7, -0.45), (-0.5, -0.75, -0.75), (-0.3, -0.75, -0.8), (-0.25, -0.85, -0.3), (-0.2, -0.8, 0.2),
             (-0.1, -0.6, 0.6)]


def crouch(arm, depth=1.0, rump=0.0, tread=0.0, reach=0.0, yaw=0.0):
    """The hunting crouch: belly low, shoulders dipped, elbows up, head pushed forward and low, ears forward.
    depth 0..1 (1 = the stalk), rump lifts the back end (degrees), tread lifts the near (+) or far (-) hind paw,
    reach slides the front paws forward, yaw swings the rear end sideways about the shoulders (degrees)."""
    pb(arm, 'root').location = (0, 0, -0.10 * depth)
    if yaw: move_root(arm, about((0.12, 0, 0), (0, 0, 1), yaw))
    turn(arm, 'spine', x=8 * depth + rump)
    turn(arm, 'chest', x=4 * depth)
    cat.aim(arm, {'neck': lerp(60, 22, min(depth, 1.0)), 'head': lerp(90, 84, min(depth, 1.0))})
    for s in ('L', 'R'):
        turn(arm, f'ear.{s}', x=16 * depth)
    def legs():
        for leg, (x, z) in TOES.items():
            if '.front.' in leg:
                # tucked back under the chest: the elbow folds back and stays off the floor (sphinx-like)
                x += (-0.035 if leg.endswith('R') else -0.025) * min(depth, 1.0) + reach
            else:
                s = 1 if leg.endswith('R') else -1
                z += 0.016 * max(0.0, s * tread)
                x -= 0.01 * depth
            leg_to(arm, leg, (x, z))
    legs()
    # the chest ruff would go through the floor in a deep crouch: raise the body until it rests on it, re-plant the paws
    for _ in range(3):
        low = lowest_point()
        if low > FLOOR - 0.002: break
        pb(arm, 'root').location.z += FLOOR - low
        legs()


def low_tail(arm, t, depth=1.0, flick=1.0):
    """The tail held low behind in a long J, its tip twitching."""
    target = [178, 150, 124, 104, 90, 76]
    for name, a in zip(TAIL, target):
        cat.aim(arm, {name: a})
    for k, name in enumerate(TAIL):
        turn(arm, name, x=flick * (1.5 * k) * wave(t, 0.09 * k))


def stalk(arm, i, n=12):
    """Low crouch, eyes locked forward; the rear end wiggles side to side twice a loop, hind paws treading."""
    t = i / n
    cat.pose_rest(arm)
    set_eyes(arm, 0)
    w2 = wave(2 * t)
    crouch(arm, 1.0, rump=4 * w2, tread=w2, yaw=7 * w2)     # the wiggle: rump swings side to side and bobs
    low_tail(arm, 2 * t)


def pounce(arm, i, n=14):
    """From the stalk crouch: a deeper crouch, the spring, a stretched leap that arcs up and down in place,
    front paws landing first with a squash, then pinning the prey."""
    cat.pose_rest(arm)
    set_eyes(arm, 0)
    # frames 0-2 crouch and gather, 3 launch, 4-7 in the air, 8 front paws land, 9 squash, 10-13 pin and settle
    air = 3 <= i <= 8
    if not air:
        depth = keys(i, [(0, 1.0), (2, 1.22), (9, 1.18), (11, 0.7), (13, 0.0)])    # it ends standing, for sit_down
        crouch(arm, depth, rump=keys(i, [(0, 0.0), (1, 6.0), (2, 2.0), (9, 4.0), (11, 1.0), (13, 0.0)]),
               tread=(1.0 if i == 1 else 0.0), reach=0.02 if i >= 9 else 0.0)
        if i >= 9:      # pinning: head down over the paws
            turn(arm, 'head', x=keys(i, [(9, 10.0), (11, 6.0), (13, 3.0)]))
        # (on the ground the squash is the crouch itself: scaling the root would push paws through the floor)
        low_tail(arm, i / n, flick=keys(i, [(0, 1.0), (2, 0.0), (9, 2.0), (13, 1.0)]))
        return
    # in the air: pitch the whole body, legs set by direction (in the rig's space, so the pitch does not move them)
    pitch = {3: -28, 4: -18, 5: -6, 6: 6, 7: 18, 8: 26}[i]
    st = {3: 1.12, 4: 1.14, 5: 1.12, 6: 1.06, 7: 1.0, 8: 0.95}[i]
    lift = {3: 0.0, 4: 0.11, 5: 0.20, 6: 0.21, 7: 0.13, 8: 0.0}[i]
    r = pb(arm, 'root'); r.scale = (1 / math.sqrt(st), st, 1 / math.sqrt(st))
    move_root(arm, about((0.03, 0, 0.27), (0, 1, 0), pitch))
    cat.aim(arm, {'neck': 60 - pitch * 0.5, 'head': 88 - pitch * 0.3})
    for s in ('L', 'R'):
        turn(arm, f'ear.{s}', x=-24 if i < 7 else -10)
    fl = {  # front upper, lower, paw ; hind upper, lower, paw (degrees in the side view)
        3: (-125, 25, -20, -125, -140, -155),     # launch: front paws tucked to the chest, hind legs pushing back
        4: (-60, -5, -30, -140, -160, -170),
        5: (-15, -12, -45, -140, -158, -170),     # the leap pose: reaching forward, trailing back
        6: (-30, -40, -60, -130, -150, -165),
        7: (-60, -70, -75, -110, -135, -150),
        8: (-75, -80, -15, -80, -110, -60),       # front paws on the ground, hind legs swinging under
    }[i]
    for s in ('L', 'R'):
        o = 5 if s == 'L' else 0                    # far legs a little out of step
        cat.aim(arm, {f'leg.front.{s}.upper': fl[0] - o, f'leg.front.{s}.lower': fl[1] - o, f'leg.front.{s}.paw': fl[2],
                      f'leg.back.{s}.upper': fl[3] + o, f'leg.back.{s}.lower': fl[4] + o, f'leg.back.{s}.paw': fl[5]})
    tail = {3: [165, 145, 128, 115, 105, 96], 4: [150, 132, 120, 110, 102, 96], 5: [140, 125, 115, 108, 102, 98],
            6: [138, 126, 117, 110, 104, 100], 7: [140, 132, 124, 116, 106, 96], 8: [150, 138, 124, 110, 98, 86]}[i]
    for name, a in zip(TAIL, tail):
        cat.aim(arm, {name: a})
    cat.ground(arm, lift)


def sit_base(arm):
    """The sit pose every sitting action shares (actions_idles' P['sit']), eyes open."""
    actions_idles.p_sit(arm)
    set_eyes(arm, 0)


def swat(arm, i, n=10):
    """Sitting; draws the near paw back, then swipes it up and out toward screen-right fast, and brings it down."""
    sit_base(arm)
    a = keys(i, [(0, 0.0), (2, -0.35), (3, 0.5), (4, 1.0), (5, 0.95), (7, 0.4), (9, 0.0)])
    head = keys(i, [(0, 0.0), (2, 6.0), (4, -12.0), (6, -8.0), (9, 0.0)])     # eyes on the target, then up after it
    lean = keys(i, [(0, 0.0), (2, -3.0), (4, 5.0), (9, 0.0)])
    turn(arm, 'chest', x=lean)
    turn(arm, 'head', x=head, y=keys(i, [(0, 0.0), (3, 10.0), (9, 0.0)]))
    for s in ('L', 'R'):
        turn(arm, f'ear.{s}', x=keys(i, [(0, 0.0), (2, 10.0), (4, -12.0), (6, -6.0), (9, 0.0)]))
    if a > 0:
        down = cat.side(-88)
        pb(arm, 'leg.front.R.upper').scale.y = 1.0 + 0.3 * a
        cat.aim(arm, {'leg.front.R.upper': down.lerp(Vector((0.35, 0.6, 0.75)), a).normalized(),
                      'leg.front.R.lower': down.lerp(Vector((0.3, 0.6, 0.8)), a).normalized(),
                      'leg.front.R.paw': cat.side(-8).lerp(Vector((0.3, 0.5, 0.85)), a)})
    elif a < 0:
        cat.aim(arm, {'leg.front.R.upper': cat.side(-88 - 30 * -a), 'leg.front.R.lower': cat.side(-90 - 40 * -a)})
    tail_wave(arm, 0, 4, i / (n - 1), lag=0.1, grow=0.5)    # back to the sit pose's tail on the last frame


POINT = Vector((0.42, 0.82, 0.25))     # the way the paw points, in the rig: out in front, a little up, toward screen-right


def point(arm, i, n=10):
    """Sitting; lifts the near front paw and reaches it out in front and up toward screen-right, and turns its head
    to look along it; the last frame is a pose to hold. (The site mirrors it to point at an icon on its left.)"""
    sit_base(arm)
    a = keys(i, [(0, 0.0), (2, 0.25), (5, 1.06), (7, 0.98), (9, 1.0)])
    look = keys(i, [(0, 0.0), (2, 0.5), (5, 1.0), (9, 1.0)])
    turn(arm, 'chest', x=-5 * look)                  # sits up a little taller
    turn(arm, 'neck', y=8 * look)
    turn(arm, 'head', y=24 * look, x=-6 * look)      # toward its left: screen-right, along the paw
    for s in ('L', 'R'):
        turn(arm, f'ear.{s}', x=keys(i, [(0, 0.0), (3, -6.0), (6, 8.0), (9, 4.0)]))
    if a > 0.02:
        down = cat.side(-88)
        up = pb(arm, 'leg.front.R.upper')
        up.scale.y = 1.0 + 0.7 * min(a, 1.0)         # cartoon reach: the short leg stretches out
        cat.aim(arm, {'leg.front.R.upper': down.lerp(POINT, a).normalized(),
                      'leg.front.R.lower': down.lerp(POINT + Vector((0.05, 0, 0.08)), a).normalized(),
                      'leg.front.R.paw': cat.side(-8).lerp(POINT + Vector((0.1, 0, 0.25)), a)})
    tail_wave(arm, 0, 3, i / n, lag=0.1, grow=0.5)


def happy(arm, i, n=12):
    """Sitting, being stroked: eyes shut in happy arcs, head rubbing side to side into the hand, ears relaxed, a little
    bounce, the tail plume swaying."""
    t = i / n
    sit_base(arm)
    set_eyes(arm, 1)
    turn(arm, 'neck', x=-4, y=6 * wave(t, 0.1))
    turn(arm, 'head', x=-6, y=10 * wave(t, 0.15), z=7 * wave(t, 0.1))
    for s in ('L', 'R'):
        turn(arm, f'ear.{s}', x=-10 + 4 * wave(t, 0.2))
    tail_wave(arm, 3, 6, t, lag=0.08, grow=0.4)
    squash(arm, 1 + 0.025 * wave(2 * t))


def nod(arm, i, n=6):
    """Sitting; the head dips on the beat (frame 1) and springs back, ears flopping a moment later."""
    t = i / n
    sit_base(arm)
    d = keys(i, [(0, 1.0), (2, 0.35), (4, 0.0), (6, 1.0)])     # 1 = head down (the beat)
    turn(arm, 'neck', x=6 * d)
    turn(arm, 'head', x=16 * d)
    for s in ('L', 'R'):
        turn(arm, f'ear.{s}', x=-8 * keys(i, [(0, 0.2), (1, 1.0), (3, -0.4), (5, 0.0), (6, 0.2)]))
    tail_wave(arm, 0, 4, t, lag=0.1, grow=0.5)
    squash(arm, 1 - 0.02 * d)


ACTIONS = [   # name, pose function, frames, loop, yaw (the whole cat's turn toward screen-right, degrees)
    ('held', held, 12, True, 0),
    ('stalk', stalk, 12, True, cat.TRAVEL_YAW),
    ('pounce', pounce, 14, False, cat.TRAVEL_YAW),
    ('swat', swat, 10, False, 0),
    ('point', point, 10, False, 0),
    ('happy', happy, 12, True, 0),
    ('nod', nod, 6, True, 0),
]


# ---------- keying ----------

def snapshot(arm):
    return {p.name: (tuple(p.location), tuple(p.rotation_euler), tuple(p.scale)) for p in arm.pose.bones}, \
        pb(arm, 'head')['eyes_shut']


def bake(arm, name, fn, frames):
    """Pose every frame with no action attached (so nothing overwrites the pose), then key them all into a new Action."""
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    poses = []
    for i in range(frames):
        fn(arm, i, frames)
        poses.append(snapshot(arm))
    old = bpy.data.actions.get(name)
    if old: bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad.action = act
    for i, (bones, eyes) in enumerate(poses):
        f = i + 1
        for p in arm.pose.bones:
            loc, rot, sc = bones[p.name]
            p.location, p.rotation_euler, p.scale = loc, rot, sc
            for path in ('location', 'rotation_euler', 'scale'):
                p.keyframe_insert(path, frame=f, group=p.name)
        pb(arm, 'head')['eyes_shut'] = eyes
        pb(arm, 'head').keyframe_insert('["eyes_shut"]', frame=f, group='head')
    act.use_frame_range = True
    act.frame_start, act.frame_end = 1, frames
    act.use_cyclic = False
    ad.action = None
    return act


def build(arm, only=None):
    """Make the actions (all, or just the names in only) on arm and return their descriptions."""
    add_eyes_shut(arm)
    prefs = bpy.context.preferences.edit
    old = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = 'LINEAR'
    out = []
    try:
        for name, fn, frames, loop, yaw in ACTIONS:
            if only and name not in only: continue
            bake(arm, name, fn, frames)
            out.append(dict(name=name, frames=frames, fps=FPS, loop=loop, view='three_quarter', yaw=yaw))
            if name == 'held': out[-1]['scruff'] = list(HELD_SCRUFF)
    finally:
        prefs.keyframe_new_interpolation_type = old
        cat.pose_rest(arm); set_eyes(arm, 0)
    return out
