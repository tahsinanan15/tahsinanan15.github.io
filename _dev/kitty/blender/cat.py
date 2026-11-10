"""The desktop kitty, built in Blender from nothing: model, rig, toon shading, outline, cameras and lights.

Run it headless (it saves a .blend; add --preview DIR to also render test frames into DIR):
  nice -n 15 blender -b -t 6 --python _dev/kitty/blender/cat.py -- --blend /some/tmp/cat.blend [--preview /some/tmp/cells]
  --coats aero,ghost picks coats (all six by default); --shots rest,sit,walk_test picks poses;
  --px 512 renders bigger than the default 256 px square.

What it makes
  A chibi kitten: a big round head with full cheeks, a small muzzle with a pink nose, big round eyes and a "w" mouth,
  a short round body with a fluffy chest bib, four short legs with round paws and a thick bushy tail.
  It is two meshes, each made of overlapping simple shapes melted into one smooth skin (a voxel remesh), so there
  are no seams where parts meet:
    body  - torso, bib, legs, haunches and tail, bent by the rig with automatic weights
    head  - skull, cheeks, muzzle, nose, ears and the tufts in them; the ears bend on their own bones
  The eyes, nose, mouth and mask are painted onto the head by its material, so they follow its curve and are hidden
  by its outline like real markings, instead of being stickers.

Which way is which
  Blender units. The cat stands about 0.8 tall (to its ear tips) with its paws on z = 0. It faces +X, up is +Z,
  its left side is +Y (bones ending .L), its right side is -Y (.R). The one camera, cam_three_quarter, looks from the
  cat's front right, a little above, so the cat faces screen-right and out of the screen and its .R legs are the near
  ones. Every action is drawn from it (the site mirrors the sprite to face left); actions that travel turn the whole
  cat toward screen-right (the armature object's Z rotation), so it reads as moving across.
  "The side view" below means the cat's own side plane (x forward, z up), where bone angles are given.

The rig (armature "kitty_rig")
  root > spine > chest > neck > head > ear.L / ear.R; spine > tail.01..tail.06; chest > the front legs; spine > the hind
  legs; each leg is leg.<front|back>.<L|R>.<upper|lower|paw>. The rest pose is standing on all fours.
  spine starts at the rump, so turning it lifts the front of the cat about its rump (as when it sits up).
  Every bone but root is rolled so its local X axis points to the cat's left (+Y), so turning a bone by a positive
  angle about its X axis turns it clockwise as seen from the cat's right side: a hanging leg swings its paw backward, the head tips
  its nose down, the spine dips the chest. Local Y runs along each bone; for the head (it points up) a turn about Y
  turns the face, positive toward the cat's left; for tail bones a positive Z turn swings them to the cat's right.
  root lies on the floor pointing forward: its local y is forward, z is up, x is the cat's right, so moving root by
  (0, 0, -0.05) lowers the whole cat. Pose bones use XYZ Euler.
  pose_rest, pose_walk_test and pose_sit set ready poses; they only touch bones, so they can be keyframed.

Shading
  EEVEE. Each surface is lit with a diffuse shader, turned into a number by Shader to RGB and cut by a constant colour
  ramp into its colour and ONE shadow colour, emitted flat (view transform Standard, so colours are exact). No
  highlights on the fur. The far legs (.L) always take the shadow colour, so they sit behind the near ones.
  The eyes ignore the light, so their highlights stay on in shadow. The outline is an inverted hull: a Solidify
  modifier grows a slightly larger, inside-out copy of each mesh, coloured with the line colour and hidden where it
  faces the camera, so a line shows round the silhouette and where one part passes in front of another.
  No cast shadows: the outline hull would shadow the cat inside it.
  Colours live in RGB / Value nodes named coat_* in the materials; apply_coat(name) fills them from COATS.
  The markings are per-vertex values: "pt" for the seal points (ears, mask, legs fading up from the paws, tail),
  "inner" for the pink inside the ears and "far" for the far legs.

Other scripts can import this file inside Blender (sys.path.append this folder; import cat) and call
apply_coat, use_camera, pose_rest, pose_walk_test and pose_sit on the saved .blend. The kitty makes no sound.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

SHADOW_STEP = 0.30    # how much light a surface needs to count as lit
LINE = 0.010          # outline width in world units: about 2-3 px when the cat is 256 px tall
TRAVEL_YAW = 30        # degrees the cat turns toward screen-right when it travels (walk, run, jump, stalk ...)
HEAD_C = Vector((0.20, 0.0, 0.52))      # the middle of the skull
HEAD_R = (0.205, 0.245, 0.195)          # its half sizes: front-back, side-side, up-down

# fur, shade, points, eyes, inner ear, outline. Optional: pupil (else the line colour), lid (the line of a shut eye,
# else the line colour).
COATS = {
    'aero':    dict(fur='#fbeeda', shade='#e2c4a4', points='#8a5f47', eye='#58b8ff', inner='#f59bab', line='#3b241a'),
    'vapor':   dict(fur='#fff0fb', shade='#f3c4ec', points='#b967ff', eye='#01cdfe', inner='#ff71ce', line='#3b1466'),
    # the brief's #a8202e inside the ears read as blood on the black fur: a dusky rose instead. The fur is a soft
    # charcoal rather than black, so the shape and its one shadow tone still read on a dark wall without a light rim.
    'baroque': dict(fur='#54434a', shade='#382b31', points='#2c2126', eye='#f0c055', inner='#c0707c', line='#0a0607'),
    'ghost':   dict(fur='#1d4a4c', shade='#12363a', points='#2a6b6e', eye='#ff2bd6', inner='#ff2bd6', line='#00ffc8',
                    pupil='#021012'),
    # a shut eye sits on ray's near-black mask, where a dark line vanishes: its lid line is light
    'ray':     dict(fur='#f4ecd8', shade='#cfc7b3', points='#3d3a34', eye='#9a958a', inner='#b9b2a0', line='#161513',
                    lid='#ece4cf'),
    # the brief's #b5642a points sat too close to the fur, so the face read blank: a deeper ginger
    'metro':   dict(fur='#f6c98f', shade='#dca263', points='#8e4418', eye='#9ad13c', inner='#f59bab', line='#3a1f10'),
}


# ---------- colours ----------

def srgb(hexstr):
    return tuple(int(hexstr[i:i + 2], 16) / 255 for i in (1, 3, 5))


def lin(c):
    """An sRGB colour (0..1) to the linear RGBA Blender's RGB nodes hold."""
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


def coat_colours(name):
    """Every colour a coat needs, by node name, as linear RGBA."""
    c = {k: srgb(v) for k, v in COATS[name].items()}
    mixc = lambda a, b, t: tuple(a[i] * (1 - t) + b[i] * t for i in range(3))
    white = (1, 1, 1)
    ratio = [c['shade'][i] / max(c['fur'][i], 1e-4) for i in range(3)]    # points darken in shadow as fur does
    pupil = c.get('pupil', c['line'])
    out = {
        'coat_fur': c['fur'], 'coat_fur_shade': c['shade'],
        'coat_points': c['points'], 'coat_points_shade': tuple(min(1, c['points'][i] * ratio[i]) for i in range(3)),
        'coat_inner': c['inner'], 'coat_inner_shade': mixc(c['inner'], c['line'], 0.22),
        'coat_eye': c['eye'], 'coat_eye_dark': mixc(c['eye'], pupil, 0.45), 'coat_eye_light': mixc(c['eye'], white, 0.45),
        'coat_pupil': pupil, 'coat_line': c['line'], 'coat_lid': c.get('lid', c['line']), 'coat_white': white,
        'coat_nose': mixc(c['inner'], c['line'], 0.12),
    }
    return {k: lin(v) for k, v in out.items()}


def apply_coat(name):
    """Recolour the whole cat as one of COATS."""
    vals = coat_colours(name)
    for m in bpy.data.materials:
        if m.node_tree:
            for n in m.node_tree.nodes:
                if n.name in vals:
                    n.outputs[0].default_value = vals[n.name]


# ---------- shader building blocks ----------

def rgb(nt, name, kind='ShaderNodeRGB'):
    """The coat colour node called name (one per material, so apply_coat finds it by name)."""
    n = nt.nodes.get(name)
    if not n:
        n = nt.nodes.new(kind); n.name = n.label = name
    return n.outputs[0]


def value(nt, name):
    return rgb(nt, name, 'ShaderNodeValue')


def mix(nt, fac, a, b, blend='MIX'):
    """Colour a where fac is 0, b where it is 1."""
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
    sock = lambda col, ident: next(s for s in col if s.identifier == ident)
    if isinstance(fac, (int, float)): sock(n.inputs, 'Factor_Float').default_value = fac
    else: nt.links.new(fac, sock(n.inputs, 'Factor_Float'))
    nt.links.new(a, sock(n.inputs, 'A_Color')); nt.links.new(b, sock(n.inputs, 'B_Color'))
    return sock(n.outputs, 'Result_Color')


def m(nt, op, a, b=None):
    """A Math node: op applied to a (and b); either may be a number or a socket."""
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op
    for i, v in enumerate((a, b)):
        if v is None: continue
        if isinstance(v, (int, float)): n.inputs[i].default_value = v
        else: nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def attr(nt, name, out='Fac'):
    a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = name
    return a.outputs[out]


def dot(nt, vec, const):
    n = nt.nodes.new('ShaderNodeVectorMath'); n.operation = 'DOT_PRODUCT'
    nt.links.new(vec, n.inputs[0]); n.inputs[1].default_value = tuple(const)
    return n.outputs['Value']


def offset(nt, vec, const):
    n = nt.nodes.new('ShaderNodeVectorMath'); n.operation = 'SUBTRACT'
    nt.links.new(vec, n.inputs[0]); n.inputs[1].default_value = tuple(const)
    return n.outputs['Vector']


def new_mat(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return mat, nt, out


def emit(nt, out, colour):
    e = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(colour, e.inputs['Color'])
    nt.links.new(e.outputs[0], out.inputs['Surface'])


def lit_factor(nt):
    """1 where the scene's lights reach a white diffuse surface strongly enough, 0 in shadow: one hard step."""
    d = nt.nodes.new('ShaderNodeBsdfDiffuse')
    s = nt.nodes.new('ShaderNodeShaderToRGB'); nt.links.new(d.outputs[0], s.inputs[0])
    bw = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(s.outputs['Color'], bw.inputs[0])
    return m(nt, 'GREATER_THAN', bw.outputs[0], SHADOW_STEP)


def fur_colour(nt):
    """The coat at this point: fur, seal points and pink inner ear, lit or in the one shadow tone."""
    pt, inner, far = attr(nt, 'pt'), attr(nt, 'inner'), attr(nt, 'far')
    lit_c = mix(nt, inner, mix(nt, pt, rgb(nt, 'coat_fur'), rgb(nt, 'coat_points')), rgb(nt, 'coat_inner'))
    dark_c = mix(nt, inner, mix(nt, pt, rgb(nt, 'coat_fur_shade'), rgb(nt, 'coat_points_shade')), rgb(nt, 'coat_inner_shade'))
    lit = m(nt, 'MULTIPLY', lit_factor(nt), m(nt, 'LESS_THAN', far, 0.5))     # far legs stay in shadow
    return mix(nt, lit, dark_c, lit_c)


def toon_mat(name):
    mat, nt, out = new_mat(name)
    emit(nt, out, fur_colour(nt))
    return mat


def line_mat():
    """The outline hull: line colour on faces that look away from the camera, nothing on those that face it.
    (Not backface culling: in EEVEE it dropped the line along whole stretches of the silhouette.)"""
    mat, nt, out = new_mat('line')
    e = nt.nodes.new('ShaderNodeEmission'); nt.links.new(rgb(nt, 'coat_line'), e.inputs['Color'])
    t = nt.nodes.new('ShaderNodeBsdfTransparent')
    g = nt.nodes.new('ShaderNodeNewGeometry')
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(g.outputs['Backfacing'], mx.inputs[0])
    nt.links.new(e.outputs[0], mx.inputs[1]); nt.links.new(t.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    return mat


def face_mat(eyes, nose, mouth):
    """The head: fur, with the eyes, nose and mouth painted on it, unlit. Each feature is given as a frame on the
    head's rest-pose surface (centre, x across to the cat's left, y up, z out of the face); the 'rest' attribute holds
    each point's rest position, so the paint stays put when the head turns."""
    mat, nt, out = new_mat('head')
    c = fur_colour(nt)
    rest = attr(nt, 'rest', 'Vector')

    def frame(f):
        d = offset(nt, rest, f[0])
        return dot(nt, d, f[1]), dot(nt, d, f[2]), dot(nt, d, f[3])

    def ell(u, v, cx, cy, rx, ry):      # 1 inside the ellipse, else 0
        du = m(nt, 'DIVIDE', m(nt, 'SUBTRACT', u, cx), rx)
        dv = m(nt, 'DIVIDE', m(nt, 'SUBTRACT', v, cy), ry)
        return m(nt, 'LESS_THAN', m(nt, 'ADD', m(nt, 'MULTIPLY', du, du), m(nt, 'MULTIPLY', dv, dv)), 1.0)

    near = lambda w, d: m(nt, 'LESS_THAN', m(nt, 'ABSOLUTE', w), d)
    AND = lambda a, b: m(nt, 'MULTIPLY', a, b)
    OR = lambda a, b: m(nt, 'MAXIMUM', a, b)

    # eyes: dark rim (thicker at the top, like an upper lid), iris dark at the top and light at the bottom,
    # a big pupil and two white highlights
    for f, (rx, ry) in eyes:
        u, v, w = frame(f)
        u, v = m(nt, 'DIVIDE', u, rx), m(nt, 'DIVIDE', v, ry)
        e = rgb(nt, 'coat_eye')
        e = mix(nt, m(nt, 'GREATER_THAN', v, 0.25), e, rgb(nt, 'coat_eye_dark'))
        e = mix(nt, ell(u, v, 0.0, -0.80, 0.78, 0.48), e, rgb(nt, 'coat_eye_light'))
        e = mix(nt, ell(u, v, 0.03, 0.0, 0.50, 0.60), e, rgb(nt, 'coat_pupil'))
        e = mix(nt, m(nt, 'SUBTRACT', 1.0, ell(u, v, 0.0, -0.07, 0.86, 0.84)), e, rgb(nt, 'coat_line'))
        e = mix(nt, ell(u, v, -0.28, 0.30, 0.25, 0.25), e, rgb(nt, 'coat_white'))
        e = mix(nt, ell(u, v, 0.30, -0.34, 0.12, 0.12), e, rgb(nt, 'coat_white'))
        c = mix(nt, AND(ell(u, v, 0, 0, 1, 1), near(w, 0.04)), c, e)

    # nose: a small pink rounded triangle, point down, with a dark edge
    f, (rx, ry) = nose
    u, v, w = frame(f)
    vt = m(nt, 'DIVIDE', m(nt, 'ADD', v, ry), 2 * ry)                  # 0 at the bottom, 1 at the top
    def tri(grow):
        wide = m(nt, 'MULTIPLY', rx + grow, m(nt, 'ADD', 0.35, m(nt, 'MULTIPLY', vt, 0.65)))
        return AND(AND(m(nt, 'LESS_THAN', m(nt, 'ABSOLUTE', u), wide), ell(u, v, 0, 0, rx + grow, ry + grow)), near(w, 0.03))
    c = mix(nt, tri(0.006), c, rgb(nt, 'coat_line'))
    c = mix(nt, tri(0.0), c, rgb(nt, 'coat_nose'))

    # mouth: a "w" of two little arcs under the nose and a short line up to it
    f, (half, stroke, drop) = mouth
    u, v, w = frame(f)
    ink = near(m(nt, 'ADD', v, drop * 0.5), drop * 0.5)          # the line from the nose: 0 >= v >= -drop
    ink = AND(ink, near(u, stroke))
    for s in (1, -1):
        cu, cv = m(nt, 'SUBTRACT', u, s * half), m(nt, 'ADD', v, drop)
        r = m(nt, 'SQRT', m(nt, 'ADD', m(nt, 'MULTIPLY', cu, cu), m(nt, 'MULTIPLY', cv, cv)))
        arc = AND(near(m(nt, 'SUBTRACT', r, half), stroke), m(nt, 'LESS_THAN', cv, half * 0.15))
        ink = OR(ink, arc)
    c = mix(nt, AND(ink, near(w, 0.03)), c, rgb(nt, 'coat_line'))
    emit(nt, out, c)
    return mat


# ---------- meshes ----------

def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def add_sphere(bm, fn, seg=32, rings=16):
    """A UV sphere whose points are placed by fn(unit direction)."""
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in res['verts']:
        v.co = fn(v.co.normalized())


def ellipsoid(c, r):
    return lambda n: Vector((c[0] + n.x * r[0], c[1] + n.y * r[1], c[2] + n.z * r[2]))


def add_capsule(bm, a, b, ra, rb):
    """A rounded tube from a (radius ra) to b (radius rb)."""
    a, b = Vector(a), Vector(b)
    rot = (b - a).to_track_quat('Z', 'Y').to_matrix()
    add_sphere(bm, lambda n: (b + rot @ (n * rb)) if n.z > 0 else (a + rot @ (n * ra)), 24, 16)


def add_spike(bm, base, direction, length, width, flat=None):
    """A tuft of fur: a cone from base along direction, flattened across 'flat' if given."""
    d = Vector(direction).normalized()
    f = Vector(flat) if flat else d.orthogonal()
    f = (f - d * f.dot(d)).normalized()
    frame = Matrix((f.cross(d).normalized(), f, d)).transposed()
    thin = 0.5 if flat else 1.0
    def fn(n):
        t = (n.z + 1) / 2
        w = (1 - t) ** 1.2
        return Vector(base) + frame @ Vector((n.x * width * w, n.y * width * thin * w, t * length))
    add_sphere(bm, fn, 16, 10)
    return Vector(base), Vector(base) + d * length


def add_tube(bm, pts, radius, ring=20):
    """A closed tube through pts with radius(t, angle) at fraction t along it."""
    n = len(pts)
    rows = []
    for i, p in enumerate(pts):
        t = i / (n - 1)
        tan = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        side = Vector((0, 1, 0)); up = side.cross(tan).normalized(); side = tan.cross(up).normalized()
        rows.append([bm.verts.new(p + (up * math.cos(a) + side * math.sin(a)) * radius(t, a))
                     for a in (2 * math.pi * k / ring for k in range(ring))])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(ring):
            bm.faces.new((r0[k], r0[(k + 1) % ring], r1[(k + 1) % ring], r1[k]))
    a, b = bm.verts.new(pts[0] - (pts[1] - pts[0]).normalized() * 0.01), bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.01)
    for k in range(ring):
        bm.faces.new((a, rows[0][(k + 1) % ring], rows[0][k]))
        bm.faces.new((b, rows[-1][k], rows[-1][(k + 1) % ring]))


def melt(name, bm, voxel, mats):
    """Turn a heap of overlapping closed shapes into one smooth closed skin (a voxel remesh), as an object."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    src = bpy.data.meshes.new(name + '_parts'); bm.to_mesh(src); bm.free()
    ob = bpy.data.objects.new(name, src)
    bpy.context.scene.collection.objects.link(ob)
    r = ob.modifiers.new('melt', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = voxel; r.adaptivity = 0
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    ob.modifiers.clear(); ob.data = me; bpy.data.meshes.remove(src); me.name = name
    sm = ob.modifiers.new('soften', 'SMOOTH'); sm.factor, sm.iterations = 0.6, 10     # take off the voxel grain
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    ob.modifiers.clear(); ob.data = me2; bpy.data.meshes.remove(me); me2.name = name
    for mt in mats: me2.materials.append(mt)
    me2.shade_smooth()
    return ob


def set_attrs(ob, **fns):
    """Per-vertex float attributes from functions of the rest position."""
    me = ob.data
    for name, fn in fns.items():
        a = me.attributes.new(name, 'FLOAT', 'POINT')
        a.data.foreach_set('value', [float(fn(v.co)) for v in me.vertices])


def outline(ob):
    so = ob.modifiers.new('Outline', 'SOLIDIFY')
    so.thickness, so.offset, so.use_flip_normals, so.use_rim = LINE, 1.0, True, False
    so.material_offset = 1          # the hull uses the next material slot: line


def seg_dist(p, a, b):
    ab = b - a
    k = max(0, min(1, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - a.lerp(b, k)).length, k


# ---------- the head ----------

def face_dir(az, el):
    """A unit direction from the skull's middle: az degrees toward the cat's left, el degrees up."""
    az, el = math.radians(az), math.radians(el)
    return Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))


def skull(n):
    a, b, c = HEAD_R
    r = 1 / math.sqrt((n.x / a) ** 2 + (n.y / b) ** 2 + (n.z / c) ** 2)
    r *= 1 - 0.06 * max(0, n.z) ** 3                    # a flatter crown
    for s in (1, -1):                                   # full cheeks low on each side
        r += 0.035 * math.exp(-((n - face_dir(55 * s, -30)).length / 0.5) ** 2)
    return HEAD_C + n * r


MUZZLE_C, MUZZLE_R = HEAD_C + Vector((0.155, 0, -0.085)), (0.072, 0.092, 0.058)
NOSE_C, NOSE_R = MUZZLE_C + Vector((0.066, 0, 0.028)), (0.018, 0.026, 0.015)
EYE_AZ, EYE_EL, EYE_RX, EYE_RY = 35, -3, 0.078, 0.088
EAR_AZ, EAR_EL, EAR_H, EAR_W, EAR_D = 42, 46, 0.15, 0.095, 0.042


def ear_frame(side):
    """Where an ear sits: its base point and a frame (x across, y out of its front, z up it)."""
    s = 1 if side == 'L' else -1
    d = face_dir(EAR_AZ * s, EAR_EL)
    up = (d + Vector((0, 0, 0.35))).normalized()            # leaning a little outward
    fwd = Vector((math.cos(0.4), s * math.sin(0.4), 0))
    fwd = (fwd - up * fwd.dot(up)).normalized()
    base = skull(d) - up * 0.035
    return base, Matrix((fwd.cross(up).normalized(), fwd, up)).transposed()


def ear_shape(side):
    """The ear as a function of a unit direction, and the pink hollow test (in the ear's own frame)."""
    base, frame = ear_frame(side)

    def width(t):                                           # a round, wide base narrowing to a soft tip
        return EAR_W * math.sqrt(max(0, 1 - t * t)) * (1 - 0.55 * t)

    def hollow(x, y, t):
        return t > 0.12 and t < 0.80 and abs(x) < width(t) * 0.68 and y > -0.004

    def fn(n):
        t = (n.z + 1) / 2 * 1.25 - 0.25                     # below 0 is buried in the skull
        tt = max(t, 0)
        w = width(tt) * math.sqrt(max(0, 1 - (n.z if n.z > 0 else 0) ** 8))
        x, y = n.x * w, n.y * EAR_D * (1 - 0.6 * tt)
        if y > 0 and hollow(x, 0, tt): y *= 0.3             # the front is cupped
        return base + frame @ Vector((x, y, t * EAR_H))
    return fn, base, frame, hollow


def build_head(arm):
    bm = bmesh.new()
    add_sphere(bm, skull, 64, 32)
    add_sphere(bm, ellipsoid(MUZZLE_C, MUZZLE_R), 32, 16)
    add_sphere(bm, ellipsoid(NOSE_C, NOSE_R), 16, 8)
    tufts = []
    for s in (1, -1):                                       # fluffy tufts on the cheeks
        for az, el, ln in ((86, -22, 0.05), (74, -42, 0.055), (52, -58, 0.04)):
            d = face_dir(az * s, el)          # flaps lying along the cheek, poking out at the jaw line
            tufts.append(add_spike(bm, skull(d) - d * 0.03, d * 0.6 + Vector((-0.3, 0, -0.75)), ln + 0.03, 0.06, d))
    ears = {}
    for side in ('L', 'R'):
        fn, base, frame, hollow = ear_shape(side)
        add_sphere(bm, fn, 48, 32)
        sx = 1 if side == 'L' else -1          # +1 toward the outside of the head, in the ear's x
        fur = [(Vector((sx * EAR_W * x0, 0, EAR_H * z0)), Vector((sx * EAR_W * x1, 0, EAR_H * z1)))   # painted tufts
               for x0, z0, x1, z1 in ((0.55, 0.12, 0.10, 0.62), (0.30, 0.12, -0.12, 0.48), (0.62, 0.30, 0.30, 0.70))]
        ears[side] = (base, frame, hollow, fur)
    ob = melt('head', bm, 0.0035, [])

    hits = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    def on_face(d):
        loc = hits.ray_cast(HEAD_C + d * 0.6, -d)[0]
        return loc

    def wisp(l, hollow, fur):     # cream wisps of fur inside the ear, thinning toward their tips
        if l.y > 0.022 or not hollow(l.x, l.y, l.z / EAR_H): return False
        return any(d < 0.011 * (1 - k) for d, k in (seg_dist(Vector((l.x, 0, l.z)), a, b) for a, b in fur))

    def pt(co):
        v = 0.0
        for side, (base, frame, hollow, fur) in ears.items():    # dark ears, fading into the head at the base
            l = frame.transposed() @ (co - base)
            if abs(l.x) < EAR_W * 1.4 and abs(l.y) < 0.05 and not wisp(l, hollow, fur):
                v = max(v, smoothstep(0.0, 0.05, l.z))
        n = (co - HEAD_C).normalized()
        if n.x > -0.2:          # one mask over the eyes, nose bridge and muzzle, wrapping round the sides of the
            az, el = math.degrees(math.atan2(n.y, n.x)), math.degrees(math.asin(max(-1, min(1, n.z))))   # face, so it
            k = 1 - math.hypot(az / 58, (el + 16) / (26 if el > -16 else 32))      # still reads with the head turned
            k = max(k, 1 - math.hypot((abs(az) - EYE_AZ + 2) / 32, (el - EYE_EL + 2) / 21))
            v = max(v, smoothstep(-0.10, 0.12, k))
        for a, b in tufts:
            if seg_dist(co, a, b)[0] < 0.03: v = 0
        return v

    def inner(co):
        for side, (base, frame, hollow, fur) in ears.items():
            l = frame.transposed() @ (co - base)
            if abs(l.x) < EAR_W * 1.4 and l.y < 0.022 and hollow(l.x, l.y, l.z / EAR_H):
                return 0 if wisp(l, hollow, fur) else 1
        q = (co - NOSE_C)                                    # the nose tip itself is pink, so it shows in profile
        if q.x > -0.006 and (q.x / NOSE_R[0]) ** 2 + (q.y / NOSE_R[1]) ** 2 + (q.z / NOSE_R[2]) ** 2 < 1.6: return 1
        return 0

    set_attrs(ob, pt=pt, inner=inner, far=lambda co: 0)
    ra = ob.data.attributes.new('rest', 'FLOAT_VECTOR', 'POINT')
    ra.data.foreach_set('vector', [c for v in ob.data.vertices for c in v.co])

    # the painted features: frames on the surface
    eyes = []
    for s in (1, -1):
        z = face_dir(EYE_AZ * s, EYE_EL)
        x = Vector((0, 0, 1)).cross(z).normalized(); y = z.cross(x)
        eyes.append(((on_face(z), x, y, z), (EYE_RX, EYE_RY)))
    fwd = Vector((1, 0, 0)); side = Vector((0, 1, 0)); up = Vector((0, 0, 1))
    nose_c = hits.ray_cast(NOSE_C + Vector((0.3, 0, 0.05)), Vector((-0.3, 0, -0.05)).normalized())[0]
    nz = Vector((1, 0, 0.35)).normalized(); ny = nz.cross(side)
    nose = ((nose_c - nz * 0.004, side, ny, nz), (0.019, 0.013))
    mz = Vector((1, 0, -0.25)).normalized()
    mouth_c = hits.ray_cast(MUZZLE_C + Vector((0.3, 0, -0.04)), Vector((-1, 0, 0)))[0]
    mouth_c = Vector((mouth_c.x, 0, nose_c.z - 0.011))
    mouth = ((mouth_c, side, mz.cross(side), mz), (0.014, 0.0042, 0.010))
    ob.data.materials.append(face_mat(eyes, nose, mouth))
    ob.data.materials.append(bpy.data.materials['line'])

    # weights: everything follows the head bone, the ears their own bones from a little above the skull
    gh = ob.vertex_groups.new(name='head')
    ge = {s: ob.vertex_groups.new(name=f'ear.{s}') for s in ears}
    for v in ob.data.vertices:
        w = 0.0; who = None
        for side, (base, frame, hollow, fur) in ears.items():
            l = frame.transposed() @ (v.co - base)
            if abs(l.x) < EAR_W * 1.5 and abs(l.y) < 0.08:
                k = smoothstep(0.02, 0.06, l.z)
                if k > w: w, who = k, side
        if who: ge[who].add([v.index], w, 'REPLACE')
        if w < 1: gh.add([v.index], 1 - w, 'REPLACE')
    ob.parent = arm
    am = ob.modifiers.new('Armature', 'ARMATURE'); am.object = arm
    outline(ob)
    return ob


# ---------- the body ----------

def leg_joints(side):
    """Front and hind leg joint positions, shoulder/hip to toe."""
    s = 1 if side == 'L' else -1
    yf, yb = 0.072 * s, 0.078 * s
    front = [(0.105, yf, 0.23), (0.10, yf, 0.115), (0.105, yf, 0.040), (0.155, yf, 0.030)]
    back = [(-0.105, yb, 0.235), (-0.065, yb, 0.135), (-0.125, yb, 0.055), (-0.075, yb, 0.030)]
    return [Vector(p) for p in front], [Vector(p) for p in back]


TAIL_CTRL = [(-0.14, 0, 0.29), (-0.23, 0, 0.32), (-0.30, 0, 0.39), (-0.34, 0, 0.48), (-0.35, 0, 0.57),
             (-0.33, 0, 0.65), (-0.29, 0, 0.70)]


def tail_points(n):
    """n+1 points along the tail's middle, evenly spaced: up from the rump in a plume, the tip curling forward."""
    ctrl = [Vector(p) for p in TAIL_CTRL]
    fine = []
    for i in range(len(ctrl) - 1):          # Catmull-Rom through the control points
        p0, p1, p2, p3 = ctrl[max(i - 1, 0)], ctrl[i], ctrl[i + 1], ctrl[min(i + 2, len(ctrl) - 1)]
        for k in range(20):
            t = k / 20
            fine.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    fine.append(ctrl[-1])
    acc = [0.0]
    for a, b in zip(fine, fine[1:]): acc.append(acc[-1] + (b - a).length)
    out, j = [], 0
    for i in range(n + 1):
        s = acc[-1] * i / n
        while j < len(acc) - 2 and acc[j + 1] < s: j += 1
        t = (s - acc[j]) / max(acc[j + 1] - acc[j], 1e-9)
        out.append(fine[j].lerp(fine[j + 1], t))
    return out


def tail_radius(t, a=0.0):
    """Thin at the root, fullest past the middle, a round tip."""
    r = 0.030 + 0.058 * math.sin(min(1, t / 0.66) * math.pi / 2)
    if t > 0.82: r *= math.sqrt(max(0, 1 - ((t - 0.82) / 0.18) ** 2)) * 0.9 + 0.1
    return r


def add_tail_tufts(bm, pts):
    """Tufts of fur along the tail, swept toward the tip, so its outline is fluffy rather than a smooth tube."""
    n = len(pts) - 1
    for k, t in enumerate((0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82, 0.90, 0.99)):
        i = round(t * n)
        tan = (pts[min(i + 1, n)] - pts[max(i - 1, 0)]).normalized()
        out = Vector((-tan.z, 0, tan.x))                    # away from the curl
        for a in ((0, 140, 220) if k % 2 else (40, 180, 320)):
            a = math.radians(a)
            d = (out * math.cos(a) + Vector((0, 1, 0)) * math.sin(a)).normalized()
            r = tail_radius(t)
            add_spike(bm, pts[i] + d * r * 0.55, d + tan * 1.1, r * 0.75 + 0.02, r * 0.95)


def build_body(arm):
    bm = bmesh.new()
    add_sphere(bm, ellipsoid((0.0, 0, 0.255), (0.16, 0.128, 0.118)), 40, 20)       # torso
    add_sphere(bm, ellipsoid((0.085, 0, 0.27), (0.10, 0.122, 0.118)), 32, 16)      # chest
    add_sphere(bm, ellipsoid((-0.075, 0, 0.255), (0.10, 0.128, 0.115)), 32, 16)    # rump
    # the bib: a round mass under the chin with tufts all round its lower edge, standing out past the chest
    rc, rr = Vector((0.17, 0, 0.265)), Vector((0.085, 0.118, 0.10))
    add_sphere(bm, ellipsoid(rc, rr), 32, 16)
    for phi in (-72, -46, -22, 0, 22, 46, 72):
        a = math.radians(phi)
        n = Vector((0.55, 0.85 * math.sin(a), -0.85 * math.cos(a))).normalized()
        base = rc + Vector((n.x * rr.x, n.y * rr.y, n.z * rr.z)) * 0.6
        add_spike(bm, base, n + Vector((0.1, 0, -0.25)), 0.085 if phi % 44 else 0.075, 0.055)
    legs = {}
    for side in ('L', 'R'):
        f, b = leg_joints(side)
        add_capsule(bm, f[0], f[1], 0.05, 0.043)
        add_capsule(bm, f[1], f[2], 0.043, 0.038)
        add_sphere(bm, ellipsoid(f[2] + Vector((0.018, 0, -0.008)), (0.052, 0.044, 0.032)), 24, 12)
        add_sphere(bm, ellipsoid(b[0] + Vector((0.005, 0.008 if side == 'L' else -0.008, -0.025)), (0.10, 0.068, 0.10)), 32, 16)   # haunch
        add_capsule(bm, b[1], b[2], 0.044, 0.036)
        add_sphere(bm, ellipsoid(b[2] + Vector((0.025, 0, -0.023)), (0.052, 0.044, 0.032)), 24, 12)
        legs[side] = (f, b)
    pts = tail_points(110)
    add_tube(bm, pts, tail_radius)
    add_tail_tufts(bm, pts)
    ob = melt('body', bm, 0.004, [bpy.data.materials['fur'], bpy.data.materials['line']])

    spine = tail_points(40)
    def tail_t(co):        # how far along the tail a point is, or None if it is not on the tail
        best = (1e9, 0)
        for i, (a, b) in enumerate(zip(spine, spine[1:])):
            d, k = seg_dist(co, a, b)
            if d < best[0]: best = (d, (i + k) / 40)
        return best[1] if best[0] < 0.2 else None

    def pt(co):
        v = smoothstep(0.155, 0.065, co.z)            # legs dark at the paws, fading up to cream below the body
        t = tail_t(co)
        if t is not None and co.x < -0.12: v = max(v, smoothstep(0.02, 0.16, t))
        return v

    def far(co):            # the far (left) legs, below the body
        return smoothstep(0.015, 0.035, co.y) * smoothstep(0.17, 0.13, co.z)
    set_attrs(ob, pt=pt, inner=lambda co: 0, far=far)
    skin(ob, arm, ['spine', 'chest', 'neck'] + [b for b, *_ in leg_bone_list('L') + leg_bone_list('R')]
         + [f'tail.0{i}' for i in range(1, 7)])
    outline(ob)
    return ob


# ---------- the rig ----------

def leg_bone_list(side):
    f, b = leg_joints(side)
    out = []
    for kind, j, parent in (('front', f, 'chest'), ('back', b, 'spine')):
        names = [f'leg.{kind}.{side}.{p}' for p in ('upper', 'lower', 'paw')]
        for i, nm in enumerate(names):
            out.append((nm, j[i], j[i + 1], parent if i == 0 else names[i - 1]))
    return out


BONES = [   # name, head, tail, parent
    ('root', (0, 0, 0), (0.25, 0, 0), None),
    ('spine', (-0.14, 0, 0.26), (0.0, 0, 0.27), 'root'),
    ('chest', (0.0, 0, 0.27), (0.14, 0, 0.30), 'spine'),
    ('neck', (0.14, 0, 0.30), (0.18, 0, 0.37), 'chest'),
    ('head', (0.18, 0, 0.37), (0.19, 0, 0.72), 'neck'),
]


def build_rig():
    data = bpy.data.armatures.new('kitty_rig')
    arm = bpy.data.objects.new('kitty_rig', data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    tp = tail_points(6)
    ears = []
    for side in ('L', 'R'):
        base, frame = ear_frame(side)
        ears.append((f'ear.{side}', base, base + frame.col[2] * EAR_H, 'head'))
    bones = BONES + leg_bone_list('L') + leg_bone_list('R') + ears + \
        [(f'tail.0{i + 1}', tp[i], tp[i + 1], 'spine' if i == 0 else f'tail.0{i}') for i in range(6)]
    for name, h, t, parent in bones:
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = Vector(h), Vector(t)
        z = Vector((0, 1, 0)).cross((eb.tail - eb.head).normalized())
        eb.align_roll(Vector((0, 0, 1)) if name == 'root' else z)   # local X = the cat's left (root: y forward, z up)
        if parent:
            eb.parent = data.edit_bones[parent]
            eb.use_connect = (eb.parent.tail - eb.head).length < 1e-5
        if name.startswith('leg.') and not name.endswith('upper'):
            eb.inherit_scale = 'NONE'       # so stretching an upper leg moves the paw without fattening it
    bpy.ops.object.mode_set(mode='OBJECT')
    data.bones['root'].use_deform = False
    for pb in arm.pose.bones: pb.rotation_mode = 'XYZ'
    data.display_type = 'STICK'
    return arm


def skin(ob, arm, bones):
    """Automatic (heat) weights from the given bones only; any point heat missed goes to its nearest bone."""
    for b in arm.data.bones: b.use_deform = b.name in bones
    for o in bpy.context.view_layer.objects: o.select_set(False)
    ob.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for b in arm.data.bones: b.use_deform = b.name != 'root'
    groups = {g.index: g.name for g in ob.vertex_groups}
    missed = 0
    for v in ob.data.vertices:
        if sum(g.weight for g in v.groups if groups[g.group] in bones) > 1e-3: continue
        def dist(name):
            b = arm.data.bones[name]
            return seg_dist(v.co, b.head_local, b.tail_local)[0]
        best = min(bones, key=dist)
        g = ob.vertex_groups.get(best) or ob.vertex_groups.new(name=best)
        g.add([v.index], 1.0, 'REPLACE'); missed += 1
    if missed: print(f'  {ob.name}: {missed} points had no heat weight, gave them to their nearest bone')
    for v in ob.data.vertices:          # make each point's weights add up to one
        total = sum(g.weight for g in v.groups)
        for g in v.groups: g.weight /= total


# ---------- the cat ----------

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    toon_mat('fur'); line_mat()
    arm = build_rig()
    build_body(arm)
    build_head(arm)
    setup_scene()
    apply_coat('aero')
    return arm


# ---------- cameras, lights, render ----------

def setup_scene():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = 256
    sc.render.film_transparent = True
    sc.render.filter_size = 1.0
    sc.eevee.taa_render_samples = 16
    try: sc.view_settings.view_transform = 'Standard'
    except TypeError: pass
    sc.view_settings.look = 'None'
    w = bpy.data.worlds.new('world'); sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)

    def cam(name, direction, target, scale):
        c = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        sc.collection.objects.link(c)
        c.data.type, c.data.ortho_scale = 'ORTHO', scale
        c.data.clip_start, c.data.clip_end = 0.1, 20
        d = Vector(direction).normalized()
        c.location = Vector(target) + d * 8
        c.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        return c
    az, el = math.radians(-32), math.radians(12)
    cam('cam_three_quarter', (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)), (0.02, 0, 0.47), 1.08)

    # lights hang off one empty that use_camera turns, so the key always comes from the camera's upper left
    rig = bpy.data.objects.new('light_rig', None); sc.collection.objects.link(rig)
    def sun(name, towards, strength):
        l = bpy.data.lights.new(name, 'SUN'); l.energy, l.use_shadow = strength, False
        o = bpy.data.objects.new(name, l); sc.collection.objects.link(o)
        o.rotation_euler = Vector(towards).normalized().to_track_quat('-Z', 'Y').to_euler()
        o.parent = rig
    sun('key', (0.9, 1.0, -1.25), 3.0)        # from the camera's upper left and a little in front
    sun('fill', (-1.0, 0.4, 0.2), 0.5)        # weak, from the right and a little below
    use_camera()


def use_camera(name='cam_three_quarter'):
    """Make the camera the render camera and swing the lights round with it, so the key comes from its upper left."""
    sc = bpy.context.scene
    c = bpy.data.objects[name]
    sc.camera = c
    p = c.location
    bpy.data.objects['light_rig'].rotation_euler.z = math.atan2(p.y, p.x) + math.pi / 2


# ---------- poses ----------

def pose_rest(arm=None):
    arm = arm or bpy.data.objects['kitty_rig']
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)


def _turn(arm, values):
    for name, rot in values.items():
        arm.pose.bones[name].rotation_euler = tuple(math.radians(a) for a in rot) if isinstance(rot, tuple) else (math.radians(rot), 0, 0)


def side(deg):
    """A direction in the side view: 0 = forward, 90 = up, -90 = down."""
    return Vector((math.cos(math.radians(deg)), 0, math.sin(math.radians(deg))))


def aim(arm, targets):
    """Point bones along directions in the rig's space (a Vector, or a side-view angle in degrees), parents
    before children, by the smallest turn from where each now points. Only the bones' rotations change."""
    for name, d in targets.items():
        d = side(d) if isinstance(d, (int, float)) else Vector(d).normalized()
        bpy.context.view_layer.update()
        pb = arm.pose.bones[name]
        cur = pb.matrix.copy()
        q = cur.col[1].xyz.normalized().rotation_difference(d)
        at = cur.translation.copy()
        pb.matrix = Matrix.Translation(at) @ q.to_matrix().to_4x4() @ Matrix.Translation(-at) @ cur


def ground(arm, lift=0.0):
    """Move root up or down so the lowest point of the posed body rests on the floor (z = 0)."""
    arm.pose.bones['root'].location.z = 0
    bpy.context.view_layer.update()
    body = bpy.data.objects['body'].evaluated_get(bpy.context.evaluated_depsgraph_get())
    low = min((body.matrix_world @ v.co).z for v in body.to_mesh().vertices)
    body.to_mesh_clear()
    arm.pose.bones['root'].location.z = -low + lift


def reach_floor(arm, upper, toe_z=0.03):
    """Stretch an upper leg bone so its paw comes down to the floor."""
    pb = arm.pose.bones[upper]
    for _ in range(3):
        bpy.context.view_layer.update()
        paw = arm.pose.bones[upper.replace('upper', 'paw')]
        low = (arm.matrix_world @ paw.tail).z
        top = (arm.matrix_world @ pb.head).z
        pb.scale.y = max(0.6, pb.scale.y * (top - toe_z) / max(top - low, 1e-3))


def pose_walk_test(arm=None):
    """One step of a walk: near front paw reaching forward, far one pushing back, hind legs the other way round."""
    arm = arm or bpy.data.objects['kitty_rig']
    pose_rest(arm)
    aim(arm, {
        'leg.front.R.upper': -62, 'leg.front.R.lower': -100, 'leg.front.R.paw': -5,
        'leg.front.L.upper': -110, 'leg.front.L.lower': -112, 'leg.front.L.paw': -50,
        'leg.back.R.upper': -100, 'leg.back.R.lower': -130, 'leg.back.R.paw': -35,
        'leg.back.L.upper': -45, 'leg.back.L.lower': -95, 'leg.back.L.paw': -15,
        'head': 85, 'tail.01': 150, 'tail.02': 120, 'tail.03': 95, 'tail.04': 70, 'tail.05': 50, 'tail.06': 25,
    })
    ground(arm)


def pose_sit(arm=None):
    """Sitting up like the reference drawing: rump and round haunches on the floor, front legs straight down,
    hind paws tucked forward under them, the tail a plume behind the haunch curling round the near side toward the front."""
    arm = arm or bpy.data.objects['kitty_rig']
    pose_rest(arm)
    aim(arm, {
        'spine': 36, 'chest': 56, 'neck': 88, 'head': 92,
        'leg.back.L.upper': -8, 'leg.back.R.upper': -8, 'leg.back.L.lower': -150, 'leg.back.R.lower': -150,
        'leg.back.L.paw': -5, 'leg.back.R.paw': -5,
        'leg.front.L.upper': -88, 'leg.front.R.upper': -88, 'leg.front.L.lower': -90, 'leg.front.R.lower': -90,
        'leg.front.L.paw': -8, 'leg.front.R.paw': -8,
        'tail.01': (-0.75, -0.1, -0.65), 'tail.02': (-0.9, -0.3, 0.2), 'tail.03': (-0.45, -0.6, 0.65),
        'tail.04': (0.2, -0.75, 0.6), 'tail.05': (0.8, -0.5, 0.0), 'tail.06': (0.9, -0.1, -0.45),
    })
    ground(arm)
    for s in ('L', 'R'):
        reach_floor(arm, f'leg.front.{s}.upper')


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = lambda k: argv[argv.index(k) + 1] if k in argv else None
    arm = build()
    blend = opt('--blend')
    if blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend))
    if opt('--px'):
        bpy.context.scene.render.resolution_x = bpy.context.scene.render.resolution_y = int(opt('--px'))
    out = opt('--preview')
    if out:
        os.makedirs(out, exist_ok=True)
        coats = (opt('--coats') or ','.join(COATS)).split(',')
        shots = (opt('--shots') or 'rest,sit,walk_test').split(',')
        poses = {'rest': pose_rest, 'walk_test': pose_walk_test, 'sit': pose_sit}
        for coat in coats:
            apply_coat(coat)
            for pose in shots:
                poses[pose](arm)
                arm.rotation_euler.z = math.radians(TRAVEL_YAW if pose != 'sit' else 0)
                render(f'{out}/{coat}_{pose}.png')
        pose_rest(arm); arm.rotation_euler.z = 0; apply_coat('aero')
