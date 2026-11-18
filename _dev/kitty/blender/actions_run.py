"""KITTY_RUN.EXE's own moves, for the cat seen from behind (render_sprites.py --view back adds them): the run, a cat's
rotary gallop; the sprint, the same gallop pushed harder, for the zoomies; the leap; the duck, flat along the road under a
bar; the hop from one lane to the next (to her right: the page mirrors it for the left); and the stumble, when something
hits her. Posed with actions_locomotion's pose(), like the desktop's moves, plus a roll of the whole cat about its spine
and a sway from side to side, which the side-view moves never needed. They move the way a real cat does, as in the
reference Ayaz chose (Stray, keyed by hand from real cats): a cat runs by galloping, the spine bending and stretching like
a spring, twice a stride in the air, the hind paws kicking back to show their pads and the front paws reaching far ahead.
The kitty makes no sound.
"""
import bpy, math, os, sys
from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import cat, actions_locomotion as L

FPS = 12
lerp = lambda a, b, k: a + (b - a) * k
TRAIL = [172, 166, 160, 156, 152, 150]   # the run's tail: back and low, so her spine and hind legs show
bump = lambda t, at, w: math.exp(-((((t - at + 0.5) % 1) - 0.5) / w) ** 2)   # a smooth peak at time at in a looping cycle


def gallop(t, k=1.0):
    """A cat's rotary gallop, one stride. The hind paws land one after the other (left, then right), push, and the cat
    flies stretched out, front paws reaching far ahead and hind legs trailing back with their pads up; the front paws land
    (right, then left), pull, and it flies again gathered, the back arched and the hind paws swinging up under the belly.
    k is how hard: 1 the run, more for the zoomies."""
    D, legs = 0.5 * k, {}
    for (kind, side), (land, duty) in {('back', 'L'): (0.00, 0.22 / k), ('back', 'R'): (0.15, 0.22 / k),
                                       ('front', 'R'): (0.50, 0.18 / k), ('front', 'L'): (0.58, 0.18 / k)}.items():
        ph, rest = (t - land) % 1.0, L.TOE[kind] + Vector((0.03 if kind == 'front' else -0.02, 0, 0))
        stance = D * duty
        if ph < duty:   # planted, sliding back at ground speed, the heel lifting as it pushes
            u = ph / duty
            legs[(kind, side)] = ('ik', Vector((rest.x + stance * (0.5 - u), 0, rest.z)), L.PAW[kind] - 55 * L.smooth(0.45, 1, u))
            continue
        u, back = (ph - duty) / (1 - duty), rest.x - stance / 2
        if kind == 'back':   # kicks back and up, high, pads to the camera, then swings far forward under the belly
            x = back - 0.20 * k * math.sin(math.pi * L.smooth(0, 0.45, u)) + (stance + 0.14 * k) * L.smooth(0.3, 0.95, u)
            z = rest.z + 0.17 * k * math.sin(math.pi * L.smooth(0, 0.6, u))
            paw = L.PAW[kind] - 100 * (1 - L.smooth(0, 0.3, u)) - 70 * math.sin(math.pi * u)
        else:                # folds up under the chest, then reaches far ahead and comes down onto the road
            x = back - 0.04 * math.sin(math.pi * L.smooth(0, 0.3, u)) + (stance + 0.18 * k) * L.smooth(0.3, 0.85, u) - 0.06 * L.smooth(0.85, 1, u)
            z = rest.z + 0.16 * k * math.sin(math.pi * L.smooth(0, 0.8, u))
            paw = L.PAW[kind] - 50 * (1 - L.smooth(0, 0.25, u)) - 80 * math.sin(math.pi * L.smooth(0, 0.75, u)) + 15 * L.smooth(0.75, 1, u)
        legs[(kind, side)] = ('ik', Vector((x, 0, z)), paw)
    ext, gat, s = bump(t, 0.40, 0.15), bump(t, 0.88, 0.15), math.sin(2 * math.pi * (t - 0.05))
    return dict(z=-0.08 + 0.10 * gat * k + 0.07 * ext * k,                                   # up in both flights, highest gathered
                spine=4 - 24 * ext * k + 30 * gat * k, chest=10 + 20 * ext * k - 32 * gat * k,   # the spine: stretched, then arched
                neck=46 + 8 * gat - 6 * ext, head=80 - 4 * ext + 4 * gat, turn=0,                 # the head steadier than the body
                ears=-32, legs=legs,
                sq=(1 + 0.14 * ext * k - 0.1 * gat * k, 1 - 0.09 * ext * k + 0.08 * gat * k),
                roll=7 * s, sway=0.02 * s,
                tail=tail(-0.6, 25 * gat - 25 * ext, TRAIL))   # trailing low to her right, up as the back arches, down as it stretches


# Every move overlaps the way a real cat's does (and Stray's, the reference): the head goes first, then the spine, then
# the legs, and the tail last, swinging to balance. tail() is the plume of the trot, pushed to one side: positive to her
# left (+Y), negative to her right, and raised or lowered by lift degrees.
PLUME = [150, 128, 110, 96, 84, 74]


def tail(side=0.0, lift=0.0, angles=PLUME):
    return [Vector((math.cos(math.radians(a + lift)), side * (0.5 + 0.25 * i), math.sin(math.radians(a + lift)))) for i, a in enumerate(angles)]


def stagger(f, *rows):
    """Per-part amounts at frame f from rows of keys: each row is one part's 0..1 curve (head, spine, legs, tail...)."""
    return [r[f] for r in rows]


def flat(kh, ks, kl, kt, paddle=0.0):
    """Between the gallop's stance (0) and flat on the road (1), head (kh), spine (ks), legs (kl) and tail (kt) apart."""
    return dict(
        z=-0.03 - 0.10 * ks, spine=lerp(4, -2, ks), chest=lerp(10, -8, ks), neck=lerp(50, 22, kh), head=lerp(84, 97, kh),
        ears=lerp(2, -36, kh), turn=0, tail=tail(0.15 * kt, -50 * kt, [lerp(a, 174 - 2 * i, kt) for i, a in enumerate(PLUME)]),
        legs={('front', 'L'): ('aim', lerp(-75, -14, kl) + 15 * paddle, lerp(-85, -4, kl), lerp(-45, 2, kl)),
              ('front', 'R'): ('aim', lerp(-70, -10, kl) - 15 * paddle, lerp(-80, 0, kl), lerp(-40, 5, kl)),
              ('back', 'L'): ('aim', lerp(-110, -166, kl), lerp(-125, -174, kl), lerp(-100, -178, kl)),
              ('back', 'R'): ('aim', lerp(-105, -162, kl), lerp(-120, -170, kl), lerp(-95, -175, kl))},
        sq=(1 + 0.12 * ks, 1 - 0.2 * ks), ground=True)


def duck(f):
    """Down: the head ducks first, the spine follows, the legs stretch out, the tail flattens last. Six frames along the
    road with the paws paddling, then up the same way round."""
    kh, ks, kl, kt = stagger(f, [0.7, 1, 1, 1, 1, 1, 1, 1, 0.6, 0.2], [0.3, 0.8, 1, 1, 1, 1, 1, 1, 0.75, 0.35],
                             [0.15, 0.6, 1, 1, 1, 1, 1, 1, 0.85, 0.45], [0, 0.35, 0.75, 1, 1, 1, 1, 1, 0.95, 0.6])
    return flat(kh, ks, kl, kt, math.sin(f * 1.4) if 1 < f < 8 else 0)


def hop(f):
    """To her right: she looks into the new lane, the spine rolls after the head, the left paws push, she tucks in the air
    and reaches right to land, and the tail swings out left to balance, settling last."""
    push, land = Vector((0, 0.5, -1)), Vector((0, -0.5, -1))
    p = gallop([0.3, 0.45, 0.72, 0.8, 0.0, 0.15][f])
    if f == 1: p['legs'] = {k: ('aim', push, push, push) for k in L.LEGS}
    if f == 3: p['legs'] = {k: ('aim', land, land, land) for k in L.LEGS}
    p.update(turn=[-16, -22, -18, -10, -5, -1][f], roll=[0, 6, 12, 12, 5, 1][f], sway=0,
             ears=[0, -6, -10, -8, -2, 2][f], tail=tail([0, 0.15, 0.3, 0.3, 0.25, 0.1][f], [0, 0, 6, 10, 4, 0][f], TRAIL))
    return p


TUCK = {('back', 'L'): ('aim', -30, -150, -40), ('back', 'R'): ('aim', -26, -146, -36)}   # hind legs folded up under her in the air


def leap(f):
    """The jump: a crouch, the head lifts first, the spine stretches and the hind legs push, a stretch and a tuck in the air,
    then the head tips down first, the front paws reach, the spine arches, and the tail rises to balance as she lands."""
    push = {('back', 'L'): ('aim', -112, -118, -100), ('back', 'R'): ('aim', -108, -114, -96),
            ('front', 'L'): ('aim', 5, 15, 0), ('front', 'R'): ('aim', 12, 22, 5)}
    stretch = {('back', 'L'): ('aim', -128, -150, -125), ('back', 'R'): ('aim', -122, -145, -120),
               ('front', 'L'): ('aim', -22, -30, -40), ('front', 'R'): ('aim', -14, -22, -35)}
    reach = {('back', 'L'): ('aim', -45, -145, -60), ('back', 'R'): ('aim', -40, -140, -55),
             ('front', 'L'): ('aim', -62, -72, -30), ('front', 'R'): ('aim', -56, -66, -25)}
    frames = [
        dict(z=-0.07, spine=-4, chest=-4, neck=42, head=92, legs=L.stand(spread=0.02), ears=-6, tail=tail(0.1, -20), sq=(1.06, 0.93)),
        dict(z=-0.07, spine=-2, chest=-2, neck=58, head=102, legs=L.stand(spread=0.02), ears=-10, tail=tail(0.1, -20), sq=(1.05, 0.94)),
        dict(spine=20, chest=26, neck=62, head=100, ears=-18, legs=push, tail=tail(0.05, -30), sq=(0.96, 1.08)),
        dict(spine=14, chest=18, neck=58, head=94, ears=-20, legs=stretch, tail=tail(0.05, -40), sq=(1.03, 1.0)),
        dict(spine=8, chest=6, neck=52, head=88, ears=-14, legs={**L.run(0.86)['legs'], **TUCK}, tail=tail(0.12, -20)),
        dict(spine=6, chest=4, neck=46, head=76, ears=-8, legs={**L.run(0.86)['legs'], **TUCK}, tail=tail(0.15, 0)),
        dict(spine=-12, chest=-16, neck=48, head=80, ears=-4, legs=reach, tail=tail(0.15, 18)),
        dict(z=0.03, spine=-14, chest=-18, neck=50, head=82, ears=0, tail=tail(0.18, 26),
             legs={('front', 'L'): ('ik', L.TOE['front'] + Vector((0.035, 0, 0)), -10), ('front', 'R'): ('ik', L.TOE['front'] + Vector((0.03, 0, 0)), -8),
                   ('back', 'L'): ('aim', -55, -145, -45), ('back', 'R'): ('aim', -50, -140, -42)}),
        dict(z=-0.08, spine=-2, chest=0, neck=44, head=84, legs=L.stand(spread=0.015), ears=6, tail=tail(0.1, 14), sq=(1.07, 0.87)),
        {**gallop(0.1), 'tail': tail(0.05, 4)},
    ]
    p = frames[f]
    p.setdefault('turn', 0); p['ground'] = True
    return p


def stumble(f):
    """A trip: the head dips first, the spine buckles after it, the front paws fold, the tail flies up and out to catch
    her balance, a scramble, and she is trotting again."""
    fold = {('front', 'L'): ('aim', -100, -155, -125), ('front', 'R'): ('aim', -95, -150, -120)}
    if f == 0: p = gallop(0.3); p.update(head=70, neck=40)
    elif f in (1, 2):
        p = gallop(0.4); p.update(z=-0.06 - 0.02 * f, chest=-20 - 14 * f, neck=34, head=62 - 4 * f, ears=8, sq=(1.05, 0.9))
        if f == 2: p['legs'].update(fold)
    elif f == 3:
        p = gallop(0.55); p.update(z=-0.06, chest=-26, neck=38, head=68, ears=2)
        p['legs'].update(fold); p['legs'].update({('back', 'L'): ('aim', -60, -135, -80), ('back', 'R'): ('aim', -55, -130, -75)})
    elif f == 4: p = gallop(0.6); p.update(head=74)
    else: p = gallop([0.6, 0.75, 0.9][f - 5]); p['chest'] -= [10, 5, 2][f - 5]
    p['roll'] = [0, 6, 12, 10, -8, -4, -2, 0][f]
    p['sway'] = [0, 0.02, 0.05, 0.06, 0.03, 0.01, 0, 0][f]   # she staggers to one side
    p['tail'] = tail([0, -0.1, -0.3, -0.5, 0.4, 0.2, 0.1, 0][f], [0, 10, 30, 40, 20, 10, 4, 0][f])
    return p


def make(arm, name, n, fn, loop):
    """actions_locomotion.make_action, with the roll."""
    act = bpy.data.actions.get(name)
    if act: bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name); act.use_fake_user = True
    arm.animation_data_create(); arm.animation_data.action = act
    for f in range(n + (1 if loop else 0)):
        p = fn((f % n) / n if loop else f)
        L.pose(arm, p)
        root = arm.pose.bones['root']   # root: x is her right, y runs along the spine
        root.rotation_euler.y = -math.radians(p.get('roll', 0)); root.location.x += p.get('sway', 0)   # positive leans and sways her right
        bpy.context.view_layer.update()
        L.key_all(arm, f)
    act.frame_range = (0, n - 1)
    return dict(name=name, frames=n, fps=FPS, loop=loop, view='back', yaw=0)


def build(arm):
    cat.pose_rest(arm); cat.ground(arm)
    L.BASE_Z = arm.pose.bones['root'].location.z     # a .blend opened from disk never ran actions_locomotion.build
    out = [make(arm, 'run', 10, gallop, True), make(arm, 'sprint', 10, lambda t: gallop(t, 1.5), True), make(arm, 'leap', 10, leap, False),
           make(arm, 'duck', 10, duck, False), make(arm, 'hop', 6, hop, False), make(arm, 'stumble', 8, stumble, False)]
    arm.animation_data.action = None
    cat.pose_rest(arm)
    return out
