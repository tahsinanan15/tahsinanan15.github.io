"""The kitty's idle actions: what it does when nobody needs it. Keyed as Blender Actions on the rig from cat.py.

Use it inside Blender on the saved cat .blend:
  sys.path.append('_dev/kitty/blender'); import actions_idles
  info = actions_idles.build(bpy.data.objects['kitty_rig'])
build(arm) makes one Action per behaviour on the armature and returns a list of {name, frames, fps, loop, view, yaw}.
Each action is keyed on every frame 1..frames, played at fps (12, or slower for the long sit and sleep loops, so they
need few frames), so a sprite renderer steps through whole frames. Everything is drawn from the one three-quarter
camera; yaw (one value per frame, degrees) turns the whole armature object about Z for that frame: 0 faces out,
cat.TRAVEL_YAW is turned toward screen-right to travel. Loops join seamlessly: the frame after the last would be the
same as frame 1. The cat stays in place; the website moves it across the screen.

The actions
  sit          sitting, one slow breath, the tail plume swaying (loop, 16 frames at 8 fps)
  sit_down     standing turned to travel, to sitting facing out: rump drops, chest rises past the sitting height, settles
  stand_up     sitting facing out, to standing turned to travel: leans forward, pushes up, tail lifts last
  groom        sitting, lifts its near front paw, licks it, rubs its face across it, puts it down
  stretch      sitting, gets up turning to the side into a long front stretch (chest low, rump and tail high), sits again
  yawn         sitting, head dips, tips back with the mouth wide and eyes shut
  look_around  sitting, ears turn first, then the head looks to one side, the other, and tilts
  sleep        curled in a ball, head resting on the tail wrapped round the front, slow breathing (loop, 12 frames at 6 fps)
  wake         from sleep to sitting: ear twitch, head lifts, sleepy blinks, sits up
  sit, groom, stretch, yawn, look_around and the end of sit_down and wake are exactly the same sit pose on their
  first and last frames, so the site can cut between them; stand_up ends, and sit_down starts, on the standing pose.

Eyes and mouth
  The eyes and mouth are painted by the head material, so bones cannot close or open them. build() adds two custom
  properties on the head pose bone, "lid" (0 open, 1 shut: closed eyes are a soft downward arc, half-way is a blink)
  and "mouth" (0 the usual "w", 1 wide open with a pink tongue), and drivers that paint them in the material. Every
  action here keys both; anything rendering other actions afterwards should set them back to 0.

How it works
  A few key poses (stand, sit, curled asleep, ...) are made with cat.py's aim(), which points bones along side-view
  angles, and saved as each bone's local rotation. Each frame blends between key poses (quaternion slerp, with an
  ease per stretch, some easing past the target and back for overshoot), adds small waves on top (breathing, tail
  sway, ear flicks), then puts the cat on the floor (lowest point at z = 0) and, where paws should stay planted,
  slides the root so that paw does not move. The tail and ears lag the body by a frame or two (overlap).
  Squash and stretch is a scale on the root bone, which scales the whole cat about its feet, like a 2D sprite.
  Every pose is computed in Python per frame with no action attached, then keyed, so what is keyed is what renders.
The kitty makes no sound.
"""
import bpy, math, os, sys
from mathutils import Vector, Matrix, Quaternion, Euler

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import cat

FPS = 12
TAILS = [f'tail.0{i}' for i in range(1, 7)]
LID_CURVE, LID_DROOP = 1.0, 0.35     # how much a shut lid's edge sags in the middle; how much lower a half-shut lid's
                                     # outer corner sits (sleepy, not cross: the 3/4 view tips a level lid the cross way)


# ---------- poses as data ----------

def pb(arm, name):
    return arm.pose.bones[name]


def capture(arm):
    """The pose as {bone: (location, rotation quaternion, scale)}, all local."""
    return {p.name: (p.location.copy(), p.rotation_euler.to_quaternion(), p.scale.copy()) for p in arm.pose.bones}


def put(arm, pose):
    for p in arm.pose.bones:
        l, q, s = pose[p.name]
        p.location, p.scale = l, s
        p.rotation_euler = q.to_euler('XYZ', p.rotation_euler)     # stay close to the last frame: no flips


def lerp_q(a, b, w):
    """From a toward b by w; w may run past 0..1 for overshoot."""
    if a.dot(b) < 0: b = -b
    axis, ang = (a.inverted() @ b).to_axis_angle()
    return a @ Quaternion(axis, ang * w)


def blend_bone(a, b, w):
    return a[0].lerp(b[0], w), lerp_q(a[1], b[1], w), a[2].lerp(b[2], w)


def turn(pose, bone, x=0.0, y=0.0, z=0.0):
    """Add a turn in the bone's own axes (degrees): x nods (clockwise in the side view), y twists along the bone
    (for the head: looks toward its left), z swings sideways."""
    l, q, s = pose[bone]
    pose[bone] = (l, q @ Euler((math.radians(x), math.radians(y), math.radians(z))).to_quaternion(), s)


def squash(pose, k):
    """Scale the whole cat about its feet: k > 0 stretches up and thins, k < 0 squashes down and widens."""
    l, q, s = pose['root']
    pose['root'] = (l, q, Vector((1 - k * 0.5, 1 - k * 0.5, 1 + k)))


def copy(pose):
    return {n: (l.copy(), q.copy(), s.copy()) for n, (l, q, s) in pose.items()}


# ---------- easing and timing ----------

def smooth(t): return t * t * (3 - 2 * t)
def ease_in(t): return t * t
def ease_out(t): return 1 - (1 - t) ** 2
def back(t, s=1.4):          # ease out past the target and back
    t -= 1
    return t * t * ((s + 1) * t + s) + 1
def linear(t): return t


def pw(f, keys):
    """Piecewise linear through (frame, value) keys, held flat before the first and after the last."""
    if f <= keys[0][0]: return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f <= f1: return v0 + (v1 - v0) * (f - f0) / (f1 - f0)
    return keys[-1][1]


def timeline(keys, f, lag=lambda bone: 0):
    """The pose at frame f along keys = [(frame, pose, ease into this key)], each bone running lag(bone) frames late.
    A late bone catches up over the last frames, so the last key is reached by every bone on time: an action that
    ends sitting ends exactly on the sit pose."""
    out = {}
    end = keys[-1][0]
    for bone in keys[0][1]:
        d = lag(bone)
        g = f - (min(d, max(0.0, end - f)) if d > 0 else max(d, keys[0][0] - f))   # a leading bone waits for the start
        if g <= keys[0][0]: out[bone] = keys[0][1][bone]; continue
        for (f0, p0, _), (f1, p1, ease) in zip(keys, keys[1:]):
            if g <= f1:
                out[bone] = blend_bone(p0[bone], p1[bone], ease((g - f0) / (f1 - f0)))
                break
        else:
            out[bone] = keys[-1][1][bone]
    return out


def tail_lag(step=1.0, head=1.0, ears=2.0):
    """Overlap: each tail bone a little later than the one before it, the head and ears after the body."""
    def lag(bone):
        if bone in TAILS: return step * (TAILS.index(bone) + 1)
        if bone == 'head': return head
        if bone.startswith('ear'): return ears
        return 0
    return lag


# ---------- floor and planted paws ----------

_KEEP = {}


def _not_tail(ob):
    """Which of a mesh's points are not mostly on the tail (cached)."""
    if ob.name not in _KEEP:
        tail = {g.index for g in ob.vertex_groups if g.name.startswith('tail')}
        _KEEP[ob.name] = [i for i, v in enumerate(ob.data.vertices)
                          if sum(g.weight for g in v.groups if g.group in tail) < 0.5][::3]   # every 3rd is plenty
    return _KEEP[ob.name]


def lowest(arm):
    """Lowest z of the posed cat's outline, body and head but not the tail: a tail that lags behind the body may
    swing through the floor for a frame, and must not lift the cat off its paws."""
    dg = bpy.context.evaluated_depsgraph_get()
    low = 1e9
    for name in ('body', 'head'):
        src = bpy.data.objects[name]
        so = src.modifiers['Outline']
        so.show_viewport = False                    # the outline shell has its own points; measure the skin
        bpy.context.view_layer.update()
        ob = src.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ob.to_mesh()
        co = [0.0] * (len(me.vertices) * 3)
        me.vertices.foreach_get('co', co)
        mw = ob.matrix_world
        low = min(low, min((mw @ Vector(co[3 * i:3 * i + 3])).z for i in _not_tail(src)))
        ob.to_mesh_clear()
        so.show_viewport = True
    bpy.context.view_layer.update()
    return low - cat.LINE                           # the outline reaches one line width further out


def ground(arm, lift=0.0):
    root = pb(arm, 'root')
    bpy.context.view_layer.update()
    root.location.z += -lowest(arm) + lift


def toe(arm, paw):
    bpy.context.view_layer.update()
    return arm.matrix_world @ pb(arm, paw).tail


def plant(arm, paw, x):
    """Slide the cat forward or back so this paw's toe is at x (root's local y is forward)."""
    pb(arm, 'root').location.y += x - toe(arm, paw).x


def reach(arm, side='both'):
    for s in ('R', 'L') if side == 'both' else (side,):
        cat.reach_floor(arm, f'leg.front.{s}.upper')


# ---------- key poses ----------

def rot_world(arm, bone, axis, deg):
    """Turn a bone about a world axis through its head, like aim() does: only its rotation changes."""
    bpy.context.view_layer.update()
    p = pb(arm, bone)
    cur = p.matrix.copy()
    at = cur.translation.copy()
    p.matrix = Matrix.Translation(at) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis)) @ Matrix.Translation(-at) @ cur


def head_turn(arm, x=0.0, y=0.0, z=0.0, bone='head'):
    """Add a turn to a bone (the head unless told) in its own axes (degrees), on top of where aim() left it."""
    h = pb(arm, bone)
    h.rotation_euler = (h.rotation_euler.to_quaternion() @ Euler([math.radians(a) for a in (x, y, z)]).to_quaternion()).to_euler('XYZ')


def make(arm, fn):
    cat.pose_rest(arm)
    fn(arm)
    bpy.context.view_layer.update()
    return capture(arm)


def p_stand(arm):
    ground(arm)


def p_sit(arm):
    cat.pose_sit(arm)
    for _ in range(3):      # the floor test (the same the moving actions use) and the front paws reaching it settle
        ground(arm)         # each other; it ends on the floor test, so an action baked with it gives this pose back
        reach(arm)          # exactly where it starts or ends sitting
    ground(arm)


def p_stretch(arm):
    """The front stretch: front legs reaching far forward on the floor, chest low, rump and tail high, head up."""
    cat.aim(arm, {
        'spine': -20, 'chest': -14, 'neck': 40, 'head': 100,
        'leg.front.R.upper': -38, 'leg.front.L.upper': -32, 'leg.front.R.lower': -12, 'leg.front.L.lower': -10,
        'leg.front.R.paw': -4, 'leg.front.L.paw': -4,
        'leg.back.R.upper': -92, 'leg.back.L.upper': -88, 'leg.back.R.lower': -108, 'leg.back.L.lower': -104,
        'leg.back.R.paw': -20, 'leg.back.L.paw': -20,
        'tail.01': 120, 'tail.02': 108, 'tail.03': 96, 'tail.04': 84, 'tail.05': 70, 'tail.06': 50,
    })
    ground(arm)
    reach(arm)


MOUTH = Vector((0.41, -0.01, 0.45))       # the mouth on the rest-pose head (rig space)
TO_CAM = Vector((0.83, -0.52, 0.21))      # toward the three-quarter camera


def on_head(arm, rest_point):
    """Where a point on the rest-pose head is now."""
    bpy.context.view_layer.update()
    h = pb(arm, 'head')
    return h.matrix @ h.bone.matrix_local.inverted() @ rest_point


def two_bone(arm, upper, lower, target, pole, stretch=1.0):
    """Bend a two-bone leg so the lower bone ends at target, the elbow toward pole (a direction). stretch lengthens
    the upper bone, cartoon style, when the target is out of reach."""
    pb(arm, upper).scale.y = stretch
    bpy.context.view_layer.update()
    S = pb(arm, upper).head.copy()
    a, b = pb(arm, upper).length * stretch, pb(arm, lower).length
    d = target - S
    L = max(abs(a - b) + 1e-4, min(d.length, a + b - 1e-4))
    n = d.normalized()
    ca = (a * a + L * L - b * b) / (2 * a * L)
    perp = (pole - n * pole.dot(n)).normalized()
    elbow = S + n * a * ca + perp * a * math.sqrt(max(0, 1 - ca * ca))
    cat.aim(arm, {upper: elbow - S, lower: S + n * L - elbow})


def stretch_for(arm, target, ext=0.9, side='R', most=1.45):
    """How much to stretch the upper front leg (cartoon style) for the paw to reach target with the leg ext straight."""
    bpy.context.view_layer.update()
    up, lo = pb(arm, f'leg.front.{side}.upper'), pb(arm, f'leg.front.{side}.lower')
    d = (target - up.head).length / ext
    return max(1.0, min(most, (d - lo.length) / up.length))


def tail_along(arm, pts):
    """Lay the tail along a path (a list of rig-space points): each bone in turn points at the first path point
    one bone-length from where it starts."""
    fine = []
    for p, q in zip(pts, pts[1:]):
        fine += [p.lerp(q, k / 20) for k in range(20)]
    fine.append(pts[-1])
    for t in TAILS:
        bpy.context.view_layer.update()
        h = pb(arm, t).head.copy()
        L = pb(arm, t).length
        goal = next((p for p in fine if (p - h).length >= L and (p - fine[0]).length >= (h - fine[0]).length), fine[-1])
        cat.aim(arm, {t: goal - h})


def orient(arm, bone, face, up):
    """Turn a bone so its up (along the bone) is up and its face side (its local Z: the face, for the head) is face,
    in the rig's space; it stays where it starts."""
    bpy.context.view_layer.update()
    p = pb(arm, bone)
    up = Vector(up).normalized()
    face = (Vector(face) - up * Vector(face).dot(up)).normalized()
    left = up.cross(face)
    rot = Matrix((left, up, face)).transposed().to_4x4()
    p.matrix = Matrix.Translation(p.matrix.translation) @ rot


SLEEP = dict(chest=36, neck=50, face_az=108, face_el=-6, roll=0, yaw=-140)   # see p_sleep


def p_sleep(arm, k=SLEEP):
    """Curled up asleep in a round ball: legs folded away under the body, the body bent round to its left (chest
    k['chest'] degrees, neck k['neck'] more, about the vertical), the head at the front of the curl, chin a little
    down (its face toward k['face_az'] round from forward, k['face_el'] down), resting on the tail, which wraps
    round the cat's left side to the chin. k['yaw'] then turns the whole ball to face screen-left, its left side to
    the camera: the camera sees the round body running off to the right, the sleeping face low at the left turned
    to it, and the tail plume across the front, which also hides the chest ruff (its tufts would otherwise show
    under the chin as a row of points)."""
    cat.aim(arm, {
        'spine': 0, 'chest': -8, 'neck': -18, 'head': 80,     # neck down: the chin rests low, over the chest ruff
        'leg.front.R.upper': -150, 'leg.front.L.upper': -150, 'leg.front.R.lower': 2, 'leg.front.L.lower': 2,
        'leg.front.R.paw': -4, 'leg.front.L.paw': -4,
        'leg.back.R.upper': -2, 'leg.back.L.upper': -2, 'leg.back.R.lower': -176, 'leg.back.L.lower': -176,
        'leg.back.R.paw': 0, 'leg.back.L.paw': 0,
    })
    rot_world(arm, 'chest', (0, 0, 1), k['chest'])
    rot_world(arm, 'neck', (0, 0, 1), k['neck'])
    az, el = math.radians(k['face_az']), math.radians(k['face_el'])
    face = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    up = Vector((0, 0, 1)) - face * face.z
    up = Matrix.Rotation(math.radians(k['roll']), 3, face) @ up
    orient(arm, 'head', face, up)
    ground(arm)
    bpy.context.view_layer.update()
    h = on_head(arm, Vector((0.33, 0.0, 0.40)))          # under the chin
    rump = pb(arm, 'tail.01').head.copy()
    a0 = math.atan2(rump.y, rump.x)
    a1 = math.atan2(h.y, h.x)
    if a1 > a0: a1 -= 2 * math.pi        # round by the cat's left (+y), the side that ends up nearer the camera
    path = [rump]
    for j in range(1, 9):       # round the near side, on the floor, from the rump to under the chin
        a = a0 + (a1 - a0) * j / 8
        r = 0.21 + 0.02 * math.sin(math.pi * j / 8)
        path.append(Vector((r * math.cos(a), r * math.sin(a), 0.085)))
    tail_along(arm, path)
    ground(arm)
    pb(arm, 'root').rotation_euler.z = math.radians(k['yaw'])


# ---------- the face: eyelids and an open mouth, painted by the head material ----------

def add_face_controls(arm):
    """Add 'lid' and 'mouth' properties on the head bone and paint them in the head material through drivers."""
    h = pb(arm, 'head')
    for k in ('lid', 'mouth'):
        if k not in h: h[k] = 0.0
    nt = bpy.data.materials['head'].node_tree
    if 'idle_lid' in nt.nodes: return
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = out.inputs['Surface'].links[0].from_node
    c = em.inputs['Color'].links[0].from_socket
    m = lambda op, a, b=None: cat.m(nt, op, a, b)
    AND = lambda a, b: m('MULTIPLY', a, b)
    near = lambda x, d: m('LESS_THAN', m('ABSOLUTE', x), d)

    amount = {}
    for k in ('lid', 'mouth'):
        cat.value(nt, 'idle_' + k)
        drv = nt.nodes['idle_' + k].outputs[0].driver_add('default_value').driver
        drv.type = 'AVERAGE'
        var = drv.variables.new(); var.type = 'SINGLE_PROP'
        var.targets[0].id_type = 'OBJECT'; var.targets[0].id = arm
        var.targets[0].data_path = f'pose.bones["head"]["{k}"]'
        amount[k] = nt.nodes['idle_' + k].outputs[0]

    # the frames cat.face_mat painted with: one "rest minus centre" node per feature, dotted with its axes
    frames = []
    for n in nt.nodes:
        if n.bl_idname == 'ShaderNodeVectorMath' and n.operation == 'SUBTRACT' and n.inputs[0].is_linked:
            axes = [Vector(l.to_node.inputs[1].default_value) for l in n.outputs[0].links if l.to_node.operation == 'DOT_PRODUCT']
            if len(axes) == 3: frames.append((Vector(n.inputs[1].default_value), axes))
    eyes = [f for f in frames if abs(f[0].y) > 0.05]
    mouth = min((f for f in frames if abs(f[0].y) < 0.01), key=lambda f: f[0].z)
    rest = cat.attr(nt, 'rest', 'Vector')

    def uvw(centre, axes):
        x = max(axes, key=lambda a: abs(a.y))          # across the face
        y = max(axes, key=lambda a: a.z)               # up
        z = max(axes, key=lambda a: a.x)               # out of the face
        d = cat.offset(nt, rest, centre)
        return cat.dot(nt, d, x), cat.dot(nt, d, y), cat.dot(nt, d, z)

    # eyelids: the lid comes down from the top; its edge is a dark line that curves down in the middle when shut,
    # and at the end a lower lid comes up to meet it, so a shut eye is a soft arc on the fur
    b = amount['lid']
    furc = cat.fur_colour(nt)
    cover, ink = None, None
    for centre, axes in eyes:
        u, v, w = uvw(centre, axes)
        u, v = m('DIVIDE', u, cat.EYE_RX), m('DIVIDE', v, cat.EYE_RY)
        inside = AND(m('LESS_THAN', m('ADD', m('MULTIPLY', u, u), m('MULTIPLY', v, v)), 1.06), near(w, 0.04))
        outer = u if centre.y > 0 else m('MULTIPLY', u, -1.0)       # + toward the outside corner of this eye
        shut = m('MINIMUM', m('MAXIMUM', m('MULTIPLY', m('SUBTRACT', b, 0.8), 5.0), 0.0), 1.0)   # 0 until b = 0.8, 1 shut
        top = m('ADD', m('ADD', 1.05, m('MULTIPLY', b, -1.25)), m('MULTIPLY', m('MULTIPLY', shut, LID_CURVE), m('MULTIPLY', u, u)))
        half = m('MULTIPLY', m('MULTIPLY', b, m('SUBTRACT', 1.0, b)), 4 * LID_DROOP)     # most when half shut, none when shut
        top = m('SUBTRACT', top, m('MULTIPLY', half, outer))
        dv = m('SUBTRACT', v, top)
        line = near(dv, 0.17)
        low = m('LESS_THAN', dv, m('ADD', -0.17, m('MULTIPLY', m('SUBTRACT', 1.0, b), -4.0)))   # the lower lid
        lid = m('MAXIMUM', m('GREATER_THAN', dv, 0.0), low)
        lid = AND(AND(lid, inside), m('GREATER_THAN', b, 0.02))
        line = AND(AND(line, inside), m('GREATER_THAN', b, 0.02))
        cover = lid if cover is None else m('MAXIMUM', cover, lid)
        ink = line if ink is None else m('MAXIMUM', ink, line)
    c = cat.mix(nt, cover, c, furc)
    c = cat.mix(nt, ink, c, cat.rgb(nt, 'coat_lid'))

    # open mouth: a dark rimmed oval under the nose with a pink tongue, growing with "mouth"
    o = amount['mouth']
    centre, axes = mouth
    u, v, w = uvw(centre, axes)
    rx = m('ADD', 0.004, m('MULTIPLY', o, 0.030))
    ry = m('ADD', 0.003, m('MULTIPLY', o, 0.040))
    cy = m('SUBTRACT', -0.004, ry)

    def oval(cx, cyy, ax, ay, grow=0.0):
        du = m('DIVIDE', m('SUBTRACT', u, cx), m('ADD', ax, grow))
        dvv = m('DIVIDE', m('SUBTRACT', v, cyy), m('ADD', ay, grow))
        return m('LESS_THAN', m('ADD', m('MULTIPLY', du, du), m('MULTIPLY', dvv, dvv)), 1.0)
    on = AND(near(w, 0.06), m('GREATER_THAN', o, 0.04))
    rim = AND(oval(0.0, cy, rx, ry, 0.005), on)
    hole = AND(oval(0.0, cy, rx, ry), on)
    tongue = AND(oval(0.0, m('SUBTRACT', cy, m('MULTIPLY', ry, 0.7)), m('MULTIPLY', rx, 0.55), m('MULTIPLY', ry, 0.38)), hole)
    c = cat.mix(nt, rim, c, cat.rgb(nt, 'coat_line'))
    c = cat.mix(nt, hole, c, cat.mix(nt, 0.8, cat.rgb(nt, 'coat_inner'), cat.rgb(nt, 'coat_line')))
    c = cat.mix(nt, tongue, c, cat.rgb(nt, 'coat_inner'))
    nt.links.new(c, em.inputs['Color'])


# ---------- the actions: each returns pose(frame) -> (pose, lid, mouth) and is keyed on frames 1..n ----------

def ramp(keys, ease=smooth):
    """A value through (frame, value) keys, eased between them (for the yaw of the whole cat)."""
    def at(f):
        if f <= keys[0][0]: return keys[0][1]
        for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
            if f <= f1: return v0 + (v1 - v0) * ease((f - f0) / (f1 - f0))
        return keys[-1][1]
    return at


SIT_OPTS = dict(ground=True)     # every sitting action is baked with this, so frame 1 is exactly P['sit']


def act_sit(arm, P, n=16):
    """Loop: one slow breath and a lazy sway running down the tail plume. Every wave is zero at frame 1, so frame 1 is
    exactly the sit pose that the actions starting or ending sitting use."""
    def at(f):
        p = copy(P['sit'])
        ph = 2 * math.pi * (f - 1) / n
        br = math.sin(ph)
        turn(p, 'spine', x=-1.2 * br)
        turn(p, 'neck', x=0.8 * br)
        turn(p, 'head', y=2.5 * br, z=1.5 * br)
        for i, t in enumerate(TAILS[2:]):
            a = (2 + 1.5 * i) * 0.7
            turn(p, t, x=a * (math.sin(ph - 0.7 * i) + math.sin(0.7 * i)),
                 z=a * (math.sin(ph - 0.7 * i + 1.2) - math.sin(1.2 - 0.7 * i)))
        return p, 0.0, 0.0
    return at, n, SIT_OPTS


def act_sit_down(arm, P, n=10):
    """Standing (turned to travel) to sitting (facing out): rump drops, chest rises past the sitting height, settles."""
    stand, sit = P['stand'], P['sit']
    ant = copy(stand); turn(ant, 'spine', x=3); turn(ant, 'neck', x=-6); turn(ant, 'leg.back.R.upper', x=-6)
    turn(ant, 'leg.back.L.upper', x=-6); squash(ant, -0.03)
    over = copy(sit); turn(over, 'spine', x=-5); turn(over, 'neck', x=4); squash(over, 0.035)
    settle = copy(sit); turn(settle, 'neck', x=5); turn(settle, 'head', x=4); squash(settle, -0.03)
    keys = [(1, stand, linear), (2, ant, smooth), (6, over, ease_in), (8, settle, smooth), (10, sit, smooth)]

    def at(f):
        return timeline(keys, f, tail_lag(0.6, 0.6, 1.0)), 0.0, 0.0
    return at, n, dict(SIT_OPTS, yaw=ramp([(1, cat.TRAVEL_YAW), (8, 0)]))


def act_stand_up(arm, P, n=8):
    """Sitting (facing out) to standing, turned to travel: leans forward, pushes up, the tail lifts last."""
    stand, sit = P['stand'], P['sit']
    ant = copy(sit); turn(ant, 'spine', x=7); turn(ant, 'neck', x=6); turn(ant, 'head', x=-4); squash(ant, -0.035)
    over = copy(stand); turn(over, 'spine', x=-3); squash(over, 0.03)
    for i, t in enumerate(TAILS): turn(over, t, x=-4 * i)
    keys = [(1, sit, linear), (3, ant, smooth), (6, over, ease_out), (8, stand, smooth)]

    def at(f):
        return timeline(keys, f, tail_lag(0.6, 0.6, 1.0)), 0.0, 0.0
    return at, n, dict(SIT_OPTS, yaw=ramp([(1, 0), (7, cat.TRAVEL_YAW)]))


def act_groom(arm, P, n=20):
    """Sitting: lifts the near front paw, licks it, rubs its face across it, puts it down."""
    sit = P['sit']
    look = copy(sit); turn(look, 'neck', x=8); turn(look, 'head', x=10, y=-6)
    raised = copy(P['paw_up'])
    lick_a = copy(raised); turn(lick_a, 'head', x=-7, z=-3)      # licks stroke up the paw, so it stays in sight
    lick_b = copy(raised); turn(lick_b, 'head', x=4, z=2)
    wipe = copy(P['paw_wipe'])
    wipe2 = copy(wipe); turn(wipe2, 'head', x=-6, y=10, z=-8)
    keys = [(1, sit, linear), (3, look, smooth), (5, raised, back), (7, lick_a, smooth), (9, lick_b, smooth),
            (11, lick_a, smooth), (12, raised, smooth), (14, wipe, smooth), (16, wipe2, smooth), (18, raised, smooth),
            (20, sit, smooth)]

    def at(f):
        p = timeline(keys, f, tail_lag(1.0, 0.0, 1.0))
        ph = 2 * math.pi * (f - 1) / (n - 1)          # one whole sway, back to zero on the last frame
        for i, t in enumerate(TAILS[2:]):
            turn(p, t, z=(2 + 1.5 * i) * (math.sin(ph - 0.7 * i) + math.sin(0.7 * i)))
        lid = pw(f, [(4, 0), (5, 1), (11, 1), (12, 0.6), (13, 1), (18, 1), (19, 0.4), (20, 0)])   # no half-lid as the head tips: it looked glum
        mouth = 0.0
        for k in (7, 11):
            mouth = max(mouth, pw(f, [(k - 1, 0), (k, 0.35), (k + 1, 0)]))
        return p, lid, mouth
    return at, n, SIT_OPTS


def act_stretch(arm, P, n=20):
    """From sitting: gets up, turning to the side, walks the front paws forward into a long front stretch (chest
    low, rump and tail high, eyes shut, mouth open a little), and sits back down facing out."""
    sit, stand, st = P['sit'], P['stand'], P['stretch']
    up = copy(stand); turn(up, 'spine', x=-4); turn(up, 'neck', x=-6); squash(up, -0.02)
    more = copy(st); turn(more, 'spine', x=3); turn(more, 'neck', x=-4); turn(more, 'head', x=-6); squash(more, 0.02)
    for leg in ('leg.front.R.upper', 'leg.front.L.upper'): turn(more, leg, x=-4)
    keys = [(1, sit, linear), (4, up, smooth), (8, st, back), (12, more, smooth), (15, st, smooth), (20, sit, smooth)]

    def at(f):
        p = timeline(keys, f, tail_lag(0.6, 0.6, 1.0))
        if 9 <= f <= 12:                             # a little tremble at the peak of the stretch
            q = math.sin(f * 2.6) * 0.8
            turn(p, 'spine', x=q); turn(p, 'tail.04', z=4 * q); turn(p, 'tail.06', z=6 * q)
        lid = pw(f, [(6, 0), (7, 1), (15, 1), (16, 0.3), (17, 0)])     # shut in one frame: half-shut it looked glum
        mouth = pw(f, [(8, 0), (10, 0.45), (12, 0.5), (14, 0)])
        return p, lid, mouth
    return at, n, dict(ground=True, reach=False, yaw=ramp([(1, 0), (5, cat.TRAVEL_YAW), (15, cat.TRAVEL_YAW), (20, 0)]))


def act_yawn(arm, P, n=14):
    sit = P['sit']
    pre = copy(sit); turn(pre, 'neck', x=7); turn(pre, 'head', x=9); squash(pre, -0.02)
    yawn = copy(sit); turn(yawn, 'spine', x=-4); turn(yawn, 'neck', x=-14); turn(yawn, 'head', x=-16, z=4)
    squash(yawn, 0.05)
    for e in ('ear.L', 'ear.R'): turn(yawn, e, x=25)
    hold = copy(yawn); turn(hold, 'head', x=-4, z=2); squash(hold, 0.06)
    close = copy(sit); turn(close, 'neck', x=3); turn(close, 'head', x=4); squash(close, -0.035)
    keys = [(1, sit, linear), (3, pre, smooth), (6, yawn, back), (9, hold, smooth), (11, close, smooth),
            (14, sit, smooth)]

    def at(f):
        p = timeline(keys, f, tail_lag(1.0, 0.5, 1.0))
        if 7 <= f <= 9: turn(p, 'head', z=1.2 * math.sin(f * 2.4))      # quiver at the top of the yawn
        lid = pw(f, [(1, 0), (3, 0.5), (5, 1), (11, 1), (12, 0.5), (13, 0)])
        mouth = pw(f, [(4, 0), (6, 1), (9, 1), (11, 0)])
        return p, lid, mouth
    return at, n, SIT_OPTS


def act_look_around(arm, P, n=16):
    sit = P['sit']
    perk = copy(sit); turn(perk, 'head', x=-3)
    for e, s in (('ear.L', 1), ('ear.R', -1)): turn(perk, e, x=-14, y=8 * s)
    right = copy(sit); turn(right, 'neck', y=-12); turn(right, 'head', y=-50, z=-6)
    for e in ('ear.L', 'ear.R'): turn(right, e, y=-16)
    left = copy(sit); turn(left, 'neck', y=10); turn(left, 'head', y=34, z=5, x=-3)
    for e in ('ear.L', 'ear.R'): turn(left, e, y=16)
    tilt = copy(sit); turn(tilt, 'head', z=12, x=-2)
    for e, s in (('ear.L', 1), ('ear.R', -1)): turn(tilt, e, x=-8)
    keys = [(1, sit, linear), (2, perk, smooth), (5, right, back), (7, right, linear), (10, left, back),
            (11, left, linear), (13, tilt, back), (14, tilt, linear), (16, sit, smooth)]

    def lag(bone):          # the ears lead the head
        if bone.startswith('ear'): return -1
        if bone in TAILS: return 1 + 0.6 * TAILS.index(bone)
        return 0
    def at(f):
        p = timeline(keys, f, lag)
        lid = pw(f, [(7, 0), (8, 1), (9, 0)])
        return p, lid, 0.0
    return at, n, SIT_OPTS


def act_sleep(arm, P, n=12):
    """Loop (played at 6 fps, so one slow breath every two seconds): the whole ball swells a little, the head
    rises and falls with it, the tail tip curls."""
    def at(f):
        p = copy(P['sleep'])
        ph = 2 * math.pi * (f - 1) / n
        br = math.sin(ph)
        l, q, s = p['root']
        p['root'] = (l, q, Vector((1 + 0.010 * br, 1 + 0.010 * br, 1 + 0.025 * br)))
        turn(p, 'head', x=-1.2 * br)
        turn(p, 'tail.06', z=5 * br)
        return p, 1.0, 0.0
    return at, n


def act_wake(arm, P, n=18):
    """From the curled sleep to sitting: an ear twitch, the head lifts, sleepy blinks, it sits up. The last frame is
    exactly the first of the sit loop."""
    sleep, sit = P['sleep'], P['sit']
    twitch = copy(sleep)
    for e in ('ear.L', 'ear.R'): turn(twitch, e, x=-20)
    head_up = copy(P['sleep_head_up'])
    low = copy(sit); turn(low, 'spine', x=4); turn(low, 'neck', x=8); turn(low, 'head', x=6); squash(low, -0.06)
    over = copy(sit); squash(over, 0.03)
    settle = copy(sit); turn(settle, 'neck', x=4); squash(settle, -0.03)
    # half-way between lying curled and sitting there is no good cat, so it goes from one to a low crouched sit in
    # a single frame (it reads as a spring up) and rises from there
    keys = [(1, sleep, linear), (3, twitch, smooth), (4, sleep, smooth), (7, head_up, smooth), (10, head_up, linear),
            (11, low, linear), (13, over, smooth), (15, settle, smooth), (18, sit, smooth)]

    def at(f):
        p = timeline(keys, f, tail_lag(0.8, 0.0, 0.6))
        lid = pw(f, [(7, 1), (8, 0.55), (9, 1), (10, 0.3), (11, 0), (15, 0), (16, 0.8), (17, 0)])
        return p, lid, 0.0
    return at, n, SIT_OPTS


ACTIONS = [   # name, maker, loop, fps
    ('sit', act_sit, True, 8),
    ('sit_down', act_sit_down, False, 12),
    ('stand_up', act_stand_up, False, 12),
    ('groom', act_groom, False, 12),
    ('stretch', act_stretch, False, 12),
    ('yawn', act_yawn, False, 12),
    ('look_around', act_look_around, False, 12),
    ('sleep', act_sleep, True, 6),
    ('wake', act_wake, False, 12),
]


def key_poses(arm):
    P = {}
    P['stand'] = make(arm, p_stand)
    put(arm, P['stand'])
    P['stand_toe'] = toe(arm, 'leg.front.R.paw').x
    P['stand_back_toe'] = toe(arm, 'leg.back.R.paw').x
    P['sit'] = make(arm, p_sit)
    P['stretch'] = make(arm, p_stretch)
    P['sleep'] = make(arm, p_sleep)

    def paw_up(arm):            # sitting with the near front paw raised to the mouth, head bowed and turned to it
        p_sit(arm)
        head_turn(arm, 6, bone='neck')
        head_turn(arm, 8, -12, 4)
        m = on_head(arm, MOUTH) + TO_CAM * 0.08 + Vector((0, 0, -0.05))
        two_bone(arm, 'leg.front.R.upper', 'leg.front.R.lower', m, Vector((0.4, -0.3, -1)), stretch_for(arm, m, 0.9))
        cat.aim(arm, {'leg.front.R.paw': (0.1, 0.15, 1)})
    P['paw_up'] = make(arm, paw_up)

    # the face wash: the paw stays up where it was licked and the head rolls its near cheek across it (a chibi's
    # short legs cannot reach up over that big head, and a paw buried in the head would not show)
    P['paw_wipe'] = copy(P['paw_up'])
    turn(P['paw_wipe'], 'head', x=4, y=-26, z=14)

    def sleep_head_up(arm):     # still curled, the head lifted off the tail and turned to the camera, eyes still shut
        p_sleep(arm)
        cat.aim(arm, {'neck': (0.5, -0.2, 0.85)})
        orient(arm, 'head', (math.cos(math.radians(-32)), math.sin(math.radians(-32)), 0.1), (0, 0, 1))
        ground(arm)
    P['sleep_head_up'] = make(arm, sleep_head_up)
    return P


def bake(arm, name, at, n, opts, loop=False):
    """Pose every frame with no action attached, then key them all into a new Action called name."""
    if loop:                    # a loop must come back round: the frame after the last is frame 1 again
        (a, la, ma), (b, lb, mb) = at(1), at(n + 1)
        assert abs(la - lb) < 1e-6 and abs(ma - mb) < 1e-6 and all(
            abs(a[k][1].dot(b[k][1])) > 1 - 1e-6 and (a[k][2] - b[k][2]).length < 1e-5 for k in a), f'{name} does not loop'
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    frames = []
    for f in range(1, n + 1):
        pose, lid, mouth = at(f)
        put(arm, pose)
        if opts.get('ground'):
            ground(arm)
            r = opts.get('reach')
            if r == 'L': reach(arm, 'L')                     # only the far paw
            elif r is True or (r and f >= r): reach(arm)     # a number: only from that frame on
            if opts.get('plant'): plant(arm, *opts['plant'])
        bpy.context.view_layer.update()
        frames.append((capture(arm), lid, mouth))
    old = bpy.data.actions.get(name)
    if old: bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad.action = act
    h = pb(arm, 'head')
    for f, (pose, lid, mouth) in enumerate(frames, 1):
        put(arm, pose)
        h['lid'], h['mouth'] = float(lid), float(mouth)
        for p in arm.pose.bones:
            for path in ('location', 'rotation_euler', 'scale'):
                p.keyframe_insert(path, frame=f, group=p.name)
        h.keyframe_insert('["lid"]', frame=f, group='head')
        h.keyframe_insert('["mouth"]', frame=f, group='head')
    act.use_frame_range = True
    act.frame_start, act.frame_end = 1, n
    ad.action = None
    return act


def build(arm, only=None):
    """Make the idle actions (all, or just the names in only) on arm and return their descriptions."""
    add_face_controls(arm)
    prefs = bpy.context.preferences.edit
    old = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = 'LINEAR'
    out = []
    try:
        P = key_poses(arm)
        for name, maker, loop, fps in ACTIONS:
            if only and name not in only: continue
            at, n, *opts = maker(arm, P)
            opts = opts[0] if opts else {}
            bake(arm, name, at, n, opts, loop)
            yaw = opts.get('yaw', lambda f: 0.0)
            out.append(dict(name=name, frames=n, fps=fps, loop=loop, view='three_quarter',
                            yaw=[round(yaw(f), 3) for f in range(1, n + 1)]))
    finally:
        prefs.keyframe_new_interpolation_type = old
        cat.pose_rest(arm)
        h = pb(arm, 'head'); h['lid'] = h['mouth'] = 0.0
    return out
