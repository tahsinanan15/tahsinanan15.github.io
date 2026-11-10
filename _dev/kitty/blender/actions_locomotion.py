"""The kitty's locomotion: walk, run, jump and fall, keyed as Blender Actions on the rig from cat.py.

Use it inside Blender on the saved cat .blend:
  sys.path.append('_dev/kitty/blender'); import actions_locomotion
  info = actions_locomotion.build(bpy.data.objects['kitty_rig'])
build(arm) makes one Action per move on the armature (named walk, run, jump, fall), keyed on every frame at 12 fps,
and returns a list of {name, frames, fps, loop, view, yaw}. Render frames 0 .. frames-1 of each, with the armature
object turned yaw degrees about Z (cat.TRAVEL_YAW: toward screen-right, so the cat reads as moving across while the
three-quarter camera still sees its face).
Loops are keyed one extra frame past the end with the same pose as frame 0, so they wrap without a hitch.

The cat never travels: the website slides the sprite across the screen. For the paws not to skate, the site should move
it one stride per cycle: WALK_STRIDE or RUN_STRIDE times cos(the angle between the cat's heading and the screen), in
Blender units (render_sprites.py prints it in sheet pixels).
The jump and fall also stay put; the site moves the sprite along the arc. Every jump and fall frame has its lowest
point on the floor line, so the sprite's bottom edge is the paws (or the lowest paw in the air).

The jump has markers (Action pose markers) for the site:
  crouch 0-3 (anticipation), takeoff 4, air_up 5 (hold while rising), air_down 6 (hold while falling),
  land 7-11 (front paws touch, squash, recover to standing). After the fall loop, play land 7-11.

How it works
  Each frame is a pose built from numbers (body height, spine bend, head, tail wave, ears, squash and stretch) and,
  for the legs, where each toe should be. A small two-bone solver bends each leg in the side view so its paw reaches
  its toe target: front elbows bend backward, hind knees forward, like a real cat. In a walk or run a paw on the floor
  slides back at exactly the ground speed, so it reads as planted while the site moves the sprite forward.
  Squash and stretch is a scale on the root bone, which scales the whole cat about its feet, like a 2D sprite.
The kitty makes no sound.
"""
import bpy, math, os, sys
from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import cat

FPS = 12
CAT_H = 0.8                 # the cat's height to its ear tips, in Blender units
WALK_N, WALK_STRIDE = 12, 0.24       # stride: how far the cat goes in one cycle
RUN_N, RUN_STRIDE = 8, 0.46
WALK_SPEED = WALK_STRIDE / (WALK_N / FPS) / CAT_H     # cat heights per second (0.3)
RUN_SPEED = RUN_STRIDE / (RUN_N / FPS) / CAT_H        # about 0.86

TOE = {'front': Vector((0.155, 0, 0.03)), 'back': Vector((-0.075, 0, 0.03))}   # where each toe rests, side view
PAW = {'front': -11.3, 'back': -26.6}                                          # the paw bones' rest angles
TAIL_UP = [150, 120, 95, 70, 50, 25]          # the walk's tail: up from the rump in a plume, the tip curling forward
LEGS = [(k, s) for k in ('front', 'back') for s in ('L', 'R')]


def d2(a):
    return Vector((math.cos(math.radians(a)), 0, math.sin(math.radians(a))))


def wave(t, shift=0.0):
    return math.sin(2 * math.pi * (t - shift))


def smooth(e0, e1, x):
    x = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return x * x * (3 - 2 * x)


# ---------- posing one frame ----------

def leg_ik(arm, kind, side, toe, paw):
    """Bend one leg so its toe lands on toe (a point in the side view) with the paw bone at angle paw (degrees)."""
    up, lo, pw = (f'leg.{kind}.{side}.{p}' for p in ('upper', 'lower', 'paw'))
    l1, l2, l3 = (arm.data.bones[n].length for n in (up, lo, pw))
    bpy.context.view_layer.update()
    hip = arm.pose.bones[up].head
    ankle = Vector(toe) - d2(paw) * l3
    dx, dz = ankle.x - hip.x, ankle.z - hip.z
    d = min(max(math.hypot(dx, dz), abs(l1 - l2) + 1e-4), (l1 + l2) * 0.999)
    bend = math.degrees(math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
    a_up = math.degrees(math.atan2(dz, dx)) + (-bend if kind == 'front' else bend)
    knee = Vector((hip.x, 0, hip.z)) + d2(a_up) * l1
    a_lo = math.degrees(math.atan2(ankle.z - knee.z, ankle.x - knee.x))
    cat.aim(arm, {up: a_up, lo: a_lo, pw: paw})


def pose(arm, p):
    """Pose the rig from a frame description p (a dict; anything missing stays at rest):
    z: body height change, spine/chest/neck/head: side-view angles, tail: six angles or directions,
    legs: {(kind, side): ('ik', toe, paw_angle) or ('aim', upper, lower, paw)}, ears: degrees (tips forward +),
    sq: (stretch along the floor, stretch up) on the whole cat, ground: put the lowest point on the floor."""
    cat.pose_rest(arm)
    root = arm.pose.bones['root']
    root.location = (0, 0, BASE_Z + p.get('z', 0.0))
    cat.aim(arm, {k: p[k] for k in ('spine', 'chest', 'neck', 'head') if k in p})
    if 'turn' in p:      # head turn, on top of its aim: negative toward the camera (the cat's right), positive away
        arm.pose.bones['head'].rotation_euler.y += math.radians(p['turn'])
    cat.aim(arm, {f'tail.0{i + 1}': a for i, a in enumerate(p.get('tail', TAIL_UP))})
    for (kind, side), leg in p.get('legs', {}).items():
        if leg[0] == 'ik':
            leg_ik(arm, kind, side, leg[1], leg[2])
        else:
            cat.aim(arm, {f'leg.{kind}.{side}.{n}': a for n, a in zip(('upper', 'lower', 'paw'), leg[1:])})
    for s, e in zip('LR', p.get('ears', (0, 0)) if isinstance(p.get('ears'), tuple) else (p.get('ears', 0),) * 2):
        arm.pose.bones[f'ear.{s}'].rotation_euler.x = math.radians(e)
    sx, sz = p.get('sq', (1.0, 1.0))
    root.scale = (1.0, sx, sz)            # root: x right, y forward, z up
    if p.get('ground'):
        cat.ground(arm)
    bpy.context.view_layer.update()


def key_all(arm, f):
    for pb in arm.pose.bones:
        pb.keyframe_insert('location', frame=f, group=pb.name)
        pb.keyframe_insert('rotation_euler', frame=f, group=pb.name)
        pb.keyframe_insert('scale', frame=f, group=pb.name)


def make_action(arm, name, n, frame_fn, loop, view, markers=()):
    act = bpy.data.actions.get(name)
    if act: bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    for f in range(n + (1 if loop else 0)):          # a loop also keys frame n, the same pose as frame 0
        pose(arm, frame_fn((f % n) / n if loop else f))
        key_all(arm, f)
    for m, f in markers:
        act.pose_markers.new(m).frame = f
    act.frame_range = (0, n - 1)
    return dict(name=name, frames=n, fps=FPS, loop=loop, view=view, yaw=cat.TRAVEL_YAW)


# ---------- walk ----------

def step(t, offset, duty, stride, lift, kind, ease=(0.0, 1.0), heel=40, curl=60):
    """Where one toe is at time t of a cycle: on the floor sliding back by stride for the first duty of its phase,
    then lifted and swung forward. Returns ('ik', toe, paw angle)."""
    ph = (t - offset) % 1.0
    rest = TOE[kind]
    if ph < duty:                                    # planted: slide back at ground speed, heel rising at the end
        u = ph / duty
        x = rest.x + stride * (0.5 - u)
        paw = PAW[kind] - heel * smooth(0.6, 1.0, u)
        return ('ik', Vector((x, 0, rest.z)), paw)
    u = (ph - duty) / (1 - duty)                     # swinging: up, forward, down
    e = smooth(*ease, u)
    x = rest.x + stride * (e - 0.5)
    z = rest.z + lift * math.sin(math.pi * u) ** 0.8
    paw = PAW[kind] - heel * (1 - smooth(0.0, 0.35, u)) - curl * math.sin(math.pi * min(1, u * 1.15)) + 8 * smooth(0.7, 1, u)
    return ('ik', Vector((x, 0, z)), paw)


def walk(t):
    # a lateral walk: left hind, left front, right hind, right front, a quarter cycle apart
    off = {('back', 'L'): 0.0, ('front', 'L'): 0.25, ('back', 'R'): 0.5, ('front', 'R'): 0.75}
    # the front paws lift only a little: lifted higher, the short front legs fold up against the chest
    # the hind paws too: lifted higher, the near thigh folds over the leg and draws a loop of outline inside it
    legs = {k: step(t, off[k], 0.62, WALK_STRIDE * 0.62, 0.035, k[0], ease=(0.05, 0.95),
                    heel=35 if k[0] == 'front' else 30, curl=22 if k[0] == 'front' else 12) for k in LEGS}
    bob = math.cos(4 * math.pi * (t - 0.06))           # two dips a cycle, as each front paw takes weight
    return dict(
        z=-0.010 + 0.005 * bob, turn=-8,               # the head turned a little toward the camera
        spine=4 + 1.5 * wave(t * 2, 0.1), chest=12 - 1.5 * wave(t * 2, 0.1),
        neck=58, head=86 + 2.0 * math.cos(4 * math.pi * (t - 0.16)),          # the head nods a beat after the body
        tail=[a + (3 + 2.2 * i) * wave(t, 0.07 * i) for i, a in enumerate(TAIL_UP)],
        ears=-4 * math.cos(4 * math.pi * (t - 0.2)),
        legs=legs)


# ---------- run ----------

def run(t):
    """A bounding gallop: hind paws land together and push (stretch), front paws land and pull, then everything gathers
    under the body in the air."""
    s = RUN_STRIDE
    legs = {}
    for (kind, side), (land, duty) in {('back', 'L'): (0.00, 0.33), ('back', 'R'): (0.05, 0.33),
                                       ('front', 'L'): (0.40, 0.25), ('front', 'R'): (0.46, 0.25)}.items():
        stance = s * duty
        ph = (t - land) % 1.0
        rest = TOE[kind] + Vector((0.03 if kind == 'front' else -0.01, 0, 0))
        if ph < duty:
            u = ph / duty
            x = rest.x + stance * (0.5 - u)
            paw = PAW[kind] - 45 * smooth(0.5, 1.0, u)
            legs[(kind, side)] = ('ik', Vector((x, 0, rest.z)), paw)
            continue
        u = (ph - duty) / (1 - duty)
        back = rest.x - stance / 2
        if kind == 'back':           # trails back while the body stretches, then tucks forward under the belly
            x = back - 0.06 * math.sin(math.pi * smooth(0, 0.35, u)) + (stance + 0.06) * smooth(0.25, 0.95, u)
            x = min(x, rest.x + stance / 2 + 0.04 * math.sin(math.pi * u))
            z = rest.z + 0.07 * math.sin(math.pi * u)
            paw = PAW[kind] - 45 * (1 - smooth(0, 0.3, u)) - 45 * math.sin(math.pi * u)
        else:                        # folds up under the chest, then reaches far forward to land
            x = back + (stance + 0.10) * smooth(0.35, 0.85, u) - 0.10 * smooth(0.85, 1.0, u)
            z = rest.z + 0.09 * math.sin(math.pi * smooth(0, 0.8, u)) + 0.02 * math.sin(math.pi * u)
            paw = PAW[kind] - 45 * (1 - smooth(0, 0.25, u)) - 70 * math.sin(math.pi * smooth(0, 0.75, u)) + 15 * smooth(0.75, 1, u)
        legs[(kind, side)] = ('ik', Vector((x, 0, z)), paw)
    # stretch peaks as the hind paws push off and the front reach (t ~ 0.38); gather peaks in the air (t ~ 0.85)
    ext = math.exp(-((((t - 0.36 + 0.5) % 1) - 0.5) / 0.13) ** 2)
    gat = math.exp(-((((t - 0.86 + 0.5) % 1) - 0.5) / 0.12) ** 2)
    hop = 0.04 * math.exp(-((((t - 0.86 + 0.5) % 1) - 0.5) / 0.16) ** 2) + 0.012 * ext
    return dict(
        z=-0.03 + hop - 0.012 * math.exp(-((((t - 0.55 + 0.5) % 1) - 0.5) / 0.1) ** 2),
        spine=4 - 7 * ext + 10 * gat, chest=12 + 8 * ext - 14 * gat,       # saddle back when stretched, arched when gathered
        neck=48 + 6 * gat, head=80 + 4 * gat - 3 * ext, turn=-6,
        tail=[a + (2 + 3 * i) * wave(t, 0.09 * i + 0.1) for i, a in enumerate([160, 140, 118, 96, 76, 56])],
        ears=-14 - 6 * wave(t, 0.3),
        sq=(1 + 0.06 * ext - 0.05 * gat, 1 - 0.04 * ext + 0.05 * gat),
        legs=legs)


# ---------- jump ----------

def stand(dz=0.0, spread=0.0, back_paw=0.0, front_paw=0.0):
    """All four paws on the floor; spread pushes them apart (front forward, hind back)."""
    legs = {}
    for kind, s in LEGS:
        x = TOE[kind].x + (spread if kind == 'front' else -spread) + (0.004 if s == 'L' else 0)
        legs[(kind, s)] = ('ik', Vector((x, 0, TOE[kind].z)), PAW[kind] + (front_paw if kind == 'front' else back_paw))
    return legs


def jump(f):
    T = TAIL_UP
    low_tail = [168, 142, 116, 95, 78, 60]
    frames = [
        # 0 ready: eyes on the target, tail up
        dict(head=90, legs=stand(), tail=[a + 6 for a in T]),
        # 1 sinking into the crouch
        dict(z=-0.04, spine=0, chest=4, neck=50, head=90, legs=stand(spread=0.01), ears=-8,
             tail=[(a + b) / 2 for a, b in zip(T, low_tail)], sq=(1.03, 0.97)),
        # 2 deep crouch: chest low, chin level, ears back, tail low
        dict(z=-0.085, spine=-5, chest=-4, neck=40, head=92, legs=stand(spread=0.02), ears=-18, tail=low_tail,
             sq=(1.06, 0.93)),
        # 3 the wiggle: rump shifts, tail tip twitches
        dict(z=-0.08, spine=-2, chest=-6, neck=40, head=93, legs=stand(spread=0.02), ears=-18,
             tail=low_tail[:4] + [62, 38], sq=(1.07, 0.92)),
        # 4 takeoff: body tips up and stretches, hind legs straighten to the toes, front paws reach up and forward
        dict(spine=22, chest=28, neck=62, head=98, ears=-22,
             legs={('back', 'L'): ('aim', -112, -118, -100), ('back', 'R'): ('aim', -108, -114, -96),
                   ('front', 'L'): ('aim', 5, 15, 0), ('front', 'R'): ('aim', 12, 22, 5)},
             tail=[172, 150, 128, 108, 90, 72], sq=(0.97, 1.07)),
        # 5 rising (held): stretched out like a flying squirrel, front paws reaching ahead, hind legs trailing
        dict(spine=14, chest=18, neck=60, head=96, ears=-20,
             legs={('back', 'L'): ('aim', -128, -150, -125), ('back', 'R'): ('aim', -122, -145, -120),
                   ('front', 'L'): ('aim', -22, -30, -40), ('front', 'R'): ('aim', -14, -22, -35)},
             tail=[166, 146, 126, 106, 88, 70], sq=(1.03, 1.0)),
        # 6 coming down (held): nose down, front legs reaching for the floor, hind paws swinging under
        dict(spine=-12, chest=-16, neck=50, head=82, ears=-6,
             legs={('back', 'L'): ('aim', -45, -145, -60), ('back', 'R'): ('aim', -40, -140, -55),
                   ('front', 'L'): ('aim', -62, -72, -30), ('front', 'R'): ('aim', -56, -66, -25)},
             tail=[140, 115, 95, 75, 60, 45], sq=(1.0, 1.04)),
        # 7 touchdown on the front paws, hind still coming in
        dict(z=0.03, spine=-14, chest=-18, neck=50, head=82, ears=2,
             legs={('front', 'L'): ('ik', TOE['front'] + Vector((0.035, 0, 0)), -10),
                   ('front', 'R'): ('ik', TOE['front'] + Vector((0.03, 0, 0)), -8),
                   ('back', 'L'): ('aim', -55, -145, -45), ('back', 'R'): ('aim', -50, -140, -42)},
             tail=[130, 105, 85, 65, 50, 35]),
        # 8 squash: everything down, body flattened, head ducks, ears flick forward, tail lags high
        dict(z=-0.08, spine=-2, chest=0, neck=42, head=84, legs=stand(spread=0.015), ears=10,
             tail=[140, 110, 85, 62, 42, 20], sq=(1.07, 0.87)),
        # 9 rebound
        dict(head=90, legs=stand(), ears=-6, tail=[155, 125, 100, 78, 58, 35], sq=(0.97, 1.04)),
        # 10 settle, tail still swinging
        dict(z=-0.012, head=87, legs=stand(), ears=2, tail=[148, 116, 90, 64, 42, 16], sq=(1.01, 0.99)),
        # 11 standing
        dict(head=86, legs=stand(), tail=T),
    ]
    p = frames[f]
    p['ground'] = True
    return p


# ---------- fall ----------

def fall(t):
    """Dropped: legs flung out wide front and back, paddling, tail whipping, ears blown up, a little tumble."""
    legs = {}
    for i, (kind, s) in enumerate(LEGS):
        ph = t + (0.0, 0.5, 0.25, 0.75)[i]
        sy = 0.45 if s == 'L' else -0.45                 # splayed out to the sides too
        if kind == 'front':
            up = Vector((math.cos(math.radians(-25 + 18 * wave(ph))), sy, math.sin(math.radians(-25 + 18 * wave(ph)))))
            legs[(kind, s)] = ('aim', up, -35 + 40 * wave(ph, 0.2), -30 + 45 * wave(ph, 0.35))
        else:
            up = Vector((math.cos(math.radians(-155 - 18 * wave(ph))), sy, math.sin(math.radians(-155 - 18 * wave(ph)))))
            legs[(kind, s)] = ('aim', up, -150 + 35 * wave(ph, 0.2), -120 + 40 * wave(ph, 0.35))
    return dict(
        spine=-4 + 4 * wave(t), chest=10 + 3 * wave(t, 0.1), neck=62, head=96 + 3 * wave(t, 0.2), turn=-25,
        tail=[Vector((math.cos(math.radians(a)), 0.35 * wave(t, 0.12 * i), math.sin(math.radians(a))))
              for i, a in enumerate(b + (6 + 4 * i) * wave(t, 0.12 * i) for i, b in enumerate([130, 110, 95, 80, 70, 60]))],
        ears=(-28 + 10 * wave(t * 2, 0.0), -28 + 10 * wave(t * 2, 0.25)),
        sq=(1.0 + 0.02 * wave(t * 2), 1.0 - 0.02 * wave(t * 2)),
        legs=legs, ground=True)


# ---------- build ----------

BASE_Z = 0.0


def build(arm):
    """Make the walk, run, jump and fall Actions on arm and return what they are."""
    global BASE_Z
    cat.pose_rest(arm)
    cat.ground(arm)                                  # how far root must move so the rest pose stands on the floor
    BASE_Z = arm.pose.bones['root'].location.z
    out = [
        make_action(arm, 'walk', WALK_N, walk, True, 'three_quarter'),
        make_action(arm, 'run', RUN_N, run, True, 'three_quarter'),
        make_action(arm, 'jump', 12, jump, False, 'three_quarter',
                    markers=[('crouch', 0), ('takeoff', 4), ('air_up', 5), ('air_down', 6), ('land', 7), ('stand', 11)]),
        make_action(arm, 'fall', 6, fall, True, 'three_quarter'),
    ]
    arm.animation_data.action = None
    cat.pose_rest(arm)
    return out
