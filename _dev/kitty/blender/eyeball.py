"""The OBSERVE eye that chases KITTY_RUN.EXE's kitty: a bare, lidless eyeball that flies on its own, in the kitty's own look
(flat colour, one shadow tone, a dark outline hull, from cat.py), bloodshot, with three nerve tendrils trailing behind it,
one skin per OS, through the same camera as her back-view clips (behind and 40 degrees up, render_sprites.py --view back).

  blender -b --python _dev/kitty/blender/eyeball.py -- --out /some/tmp/eye [--skins aero,ray] [--px 520]
  python3 _dev/kitty/blender/pack_sprites.py /some/tmp/eye --eye        (assets/run/eye-<skin>.webp and eye.json)

It chases her, so the camera sees it from behind, as it sees her: the back of the ball, veined in the OS's accent, and the
tendrils trailing down and back from it, swaying as it flies. Frames:
  chase  8   a loop: it wobbles as it flies
  look   5   turned from her far left to her far right, so the page can keep it on her lane
  turn   7   when it has her: it spins round and lifts its gaze as it surfaces, until it looks straight down the camera
  stare  4   at the visitor, dead on, its pupil tightening as it locks on: the desktop looks back, through the fourth wall
  dilate 4   still staring, the pupil floods the iris; then the screen's own lids close over it
The iris, pupil, highlight and lines are painted on the ball by its material, as the cat's face is. The eye makes no sound.
"""
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix, Euler

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import cat

ELEVATION = 40                       # degrees, as render_sprites.BACK_ELEVATION
R = 0.5                              # the ball's radius
IRIS, PUPIL, RING = 0.86, 0.972, 0.955   # cosines from the gaze: the iris's edge, the pupil's, the light ring round the pupil
SKINS = {   # each OS's OBSERVE icon, as an eyeball: veins, white, its shadow, the iris (dark rim, body, light ring), pupil, tendrils, line
    'aero':    dict(vein='#5aa8e6', white='#ffffff', shade='#c4d8ee', rim='#07366f', iris='#1890d8', light='#7ff1ff', pupil='#061a33', cord='#0a5cb8', cord_shade='#06306b', line='#07366f'),
    'vapor':   dict(vein='#ff71ce', white='#fff5fc', shade='#f0c8e8', rim='#7b1fa2', iris='#ff71ce', light='#fffb96', pupil='#1a0640', cord='#b967ff', cord_shade='#7b1fa2', line='#2a1257'),
    'baroque': dict(vein='#b8923a', white='#f3e6c4', shade='#c9b48a', rim='#5a0a14', iris='#a8202e', light='#f0c055', pupil='#0a0607', cord='#5a0a14', cord_shade='#3d060d', line='#b8923a'),
    'ghost':   dict(vein='#19f7ff', white='#d8f6f4', shade='#8fb8b8', rim='#5a0016', iris='#ff003c', light='#fcee0a', pupil='#021012', cord='#12363a', cord_shade='#0a2224', line='#00ffc8'),
    'ray':     dict(vein='#5b574e', white='#f4ecd8', shade='#cfc7b3', rim='#1d1b18', iris='#5b574e', light='#b9ad92', pupil='#000000', cord='#3d3a34', cord_shade='#1d1b18', line='#161513'),
    'metro':   dict(vein='#c27a0a', white='#f6f2ea', shade='#cbbfae', rim='#0039a6', iris='#1f6fd8', light='#8fdcff', pupil='#0e0f12', cord='#2a2a2e', cord_shade='#16171a', line='#16171a'),
}
ACTIONS = [('chase', 8), ('look', 5), ('turn', 7), ('stare', 4), ('dilate', 4)]
REACH = 0.3                          # how far past the ball the frame leaves room: the tendrils stay inside it
TENDRILS = [   # where each leaves the lower back of the ball (across, down), where its tip hangs (across), length, root radius, sway phase
    (-0.22, 0.42, -0.50, 0.36, 0.030, 0.0),
    (-0.10, 0.50, -0.22, 0.42, 0.036, 2.6),
    (0.00, 0.54, 0.04, 0.44, 0.040, 1.1),
    (0.11, 0.50, 0.26, 0.40, 0.035, 4.0),
    (0.22, 0.42, 0.48, 0.35, 0.029, 5.3),
]


GAZE, CAM = -10, ELEVATION            # degrees above level: where it looks while it chases her (a little down), and the camera

def frames():
    """(where it looks: turn about the up axis and elevation, in degrees; the pupil's edge, as a cosine from the gaze) for
    every frame, in ACTIONS order. The gaze turns half round and lifts to the camera's height to look straight at it."""
    ease = lambda i, n: (1 - math.cos(math.pi * i / n)) / 2
    out = [(7 * math.sin(i * math.tau / 8), GAZE + 4 * math.cos(i * math.tau / 8), PUPIL) for i in range(8)]   # chase
    out += [(-30 + 15 * i, GAZE, PUPIL) for i in range(5)]                                                     # look
    out += [(180 * ease(i, 6), GAZE + (CAM - GAZE) * ease(i, 6), PUPIL) for i in range(7)]                    # turn
    out += [(180, CAM, p) for p in (0.962, 0.968, 0.975, 0.98)]                                                # stare
    out += [(180, CAM, p) for p in (0.95, 0.92, 0.895, 0.875)]                                                 # dilate
    return out


def toon(name, light_node, dark_node):
    mat, nt, out = cat.new_mat(name)
    cat.emit(nt, out, cat.mix(nt, cat.lit_factor(nt), cat.rgb(nt, dark_node), cat.rgb(nt, light_node)))
    return mat


def ball_mat(hl):
    """White, its one shadow tone, and the iris, pupil and highlight painted by where each point is on the ball."""
    mat, nt, out = cat.new_mat('eyeball')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nrm = nt.nodes.new('ShaderNodeVectorMath'); nrm.operation = 'NORMALIZE'; nt.links.new(tc.outputs['Object'], nrm.inputs[0])
    c = cat.dot(nt, nrm.outputs['Vector'], (1, 0, 0))                      # 1 straight down the gaze (the ball's +X)
    white = cat.mix(nt, cat.lit_factor(nt), cat.rgb(nt, 'eye_shade'), cat.rgb(nt, 'eye_white'))
    iris = cat.mix(nt, cat.m(nt, 'GREATER_THAN', c, IRIS + 0.02), cat.rgb(nt, 'eye_rim'), cat.rgb(nt, 'eye_iris'))
    iris = cat.mix(nt, cat.m(nt, 'GREATER_THAN', c, RING), iris, cat.rgb(nt, 'eye_light'))
    iris = cat.mix(nt, cat.m(nt, 'GREATER_THAN', c, cat.value(nt, 'eye_pupil_at')), iris, cat.rgb(nt, 'eye_pupil'))   # its edge set per frame
    col = cat.mix(nt, cat.m(nt, 'GREATER_THAN', c, IRIS), white, iris)
    # bloodshot: veins run from where the tendrils leave the back forward round the ball to just short of the iris, thick at
    # the back and thinning as they go, branching once on the way
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(nrm.outputs['Vector'], sep.inputs[0])
    phi = cat.m(nt, 'ARCTAN2', sep.outputs['Z'], sep.outputs['Y'])
    at = cat.m(nt, 'ADD', 0.972, cat.m(nt, 'MULTIPLY', cat.m(nt, 'ADD', c, 1.0), 0.009))   # the line's threshold: lower is thicker
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 1.6; noise.inputs['Detail'].default_value = 0.0
    nt.links.new(nrm.outputs['Vector'], noise.inputs['Vector'])
    phi = cat.m(nt, 'ADD', phi, cat.m(nt, 'MULTIPLY', cat.m(nt, 'SUBTRACT', noise.outputs['Fac'], 0.5), 1.1))   # so they wander, not a rosette
    wave = cat.m(nt, 'SINE', cat.m(nt, 'ADD', cat.m(nt, 'MULTIPLY', phi, 5.0), cat.m(nt, 'MULTIPLY', c, 4.0)))
    fork = cat.m(nt, 'SINE', cat.m(nt, 'ADD', cat.m(nt, 'MULTIPLY', phi, 11.0), cat.m(nt, 'MULTIPLY', c, -6.0)))   # branches toward the middle
    thin = cat.m(nt, 'MAXIMUM', cat.m(nt, 'GREATER_THAN', wave, at), cat.m(nt, 'MULTIPLY', cat.m(nt, 'GREATER_THAN', fork, cat.m(nt, 'ADD', at, 0.012)), cat.m(nt, 'GREATER_THAN', c, -0.6)))
    vein = cat.m(nt, 'MULTIPLY', thin, cat.m(nt, 'LESS_THAN', c, IRIS - 0.05))
    col = cat.mix(nt, vein, col, cat.rgb(nt, 'eye_vein'))
    g = nt.nodes.new('ShaderNodeNewGeometry')                              # the highlight stays put as the eye turns
    shine = cat.m(nt, 'MULTIPLY', cat.m(nt, 'GREATER_THAN', cat.dot(nt, g.outputs['Normal'], hl), 0.985), cat.m(nt, 'GREATER_THAN', c, 0.6))   # only on the front: from behind it read as a pupil
    cat.emit(nt, out, cat.mix(nt, shine, col, cat.rgb(nt, 'eye_glint')))
    return mat


def mesh(name, bm, mats):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for mt in mats: me.materials.append(mt)
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    cat.outline(ob)
    return ob


def tendril(name, across, down, tip, length, r0, mats, seg=12, n=14):
    """A nerve tendril: a tube leaving the back of the ball, trailing back and down with a slight S, tapering to a point.
    Built round its root, so turning the object about its origin sways it."""
    root = Vector((-1, across, -down)).normalized() * (R - 0.02)
    path = [Vector((-0.34 * t, (tip - across) / length * t + 0.13 * math.sin(1.5 * math.pi * t), -0.94 * t)) * length for t in (k / (n - 1) for k in range(n))]
    radii = [r0 * (1 - t) ** 0.85 + 0.006 for t in (k / (n - 1) for k in range(n))]
    bm, rings = bmesh.new(), []
    for k, (p, r) in enumerate(zip(path, radii)):
        tan = (path[min(k + 1, n - 1)] - path[max(k - 1, 0)]).normalized()
        a = tan.cross(Vector((0, 0, 1)))
        a = (a if a.length > 1e-4 else tan.cross(Vector((0, 1, 0)))).normalized()
        b = tan.cross(a).normalized()
        rings.append([bm.verts.new(p + (a * math.cos(j * math.tau / seg) + b * math.sin(j * math.tau / seg)) * r) for j in range(seg)])
    for ra, rb in zip(rings, rings[1:]):
        for j in range(seg): bm.faces.new((ra[j], ra[(j + 1) % seg], rb[(j + 1) % seg], rb[j]))
    tipv = bm.verts.new(path[-1] + (path[-1] - path[-2]).normalized() * radii[-1] * 2)
    for j in range(seg): bm.faces.new((rings[-1][j], rings[-1][(j + 1) % seg], tipv))
    bm.faces.new(rings[0][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh(name, bm, mats)
    ob.location = root
    return ob


def apply_skin(name):
    s = {k: cat.lin(cat.srgb(v)) for k, v in SKINS[name].items()}
    vals = {'eye_vein': s['vein'], 'eye_white': s['white'], 'eye_shade': s['shade'], 'eye_rim': s['rim'], 'eye_iris': s['iris'], 'eye_light': s['light'],
            'eye_pupil': s['pupil'], 'eye_glint': cat.lin((1, 1, 1)), 'cord': s['vein'], 'cord_shade': cat.lin(tuple(v * 0.55 for v in cat.srgb(SKINS[name]['vein']))), 'coat_line': s['line']}
    for m in bpy.data.materials:
        for n in (m.node_tree.nodes if m.node_tree else ()):
            if n.name in vals: n.outputs[0].default_value = vals[n.name]


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = lambda k: argv[argv.index(k) + 1] if k in argv else None
    out, px = os.path.abspath(opt('--out')), int(opt('--px') or 520)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cat.setup_scene()
    sc = bpy.context.scene
    el = math.radians(ELEVATION)
    view = Vector((-math.cos(el), 0, math.sin(el)))                        # from the eye to the camera, behind and above
    cam = bpy.data.objects.new('cam_back', bpy.data.cameras.new('cam_back')); sc.collection.objects.link(cam)
    cam.data.type, cam.data.clip_start, cam.data.clip_end = 'ORTHO', 0.1, 20
    cam.location = view * 8
    cam.rotation_euler = (-view).to_track_quat('-Z', 'Y').to_euler()
    cat.use_camera('cam_back')
    up = cam.matrix_world.col[1].xyz.normalized(); left = -cam.matrix_world.col[0].xyz.normalized()
    hl = (view + left * 0.42 + up * 0.5).normalized()                       # the key light's glint, for when it turns to face the camera

    line = cat.line_mat()
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=R)
    ball = mesh('ball', bm, [ball_mat(tuple(hl)), line])
    cord = toon('cord', 'cord', 'cord_shade')
    tails = [tendril(f'tendril{k}', a, d, t, L, r0, [cord, line]) for k, (a, d, t, L, r0, _) in enumerate(TENDRILS)]
    rig = bpy.data.objects.new('eye', None); sc.collection.objects.link(rig)
    for ob in (ball, *tails): ob.parent = rig

    sc.render.resolution_x = sc.render.resolution_y = px
    sc.render.dither_intensity = 0
    cam.data.ortho_scale = 2 * (R + REACH + cat.LINE) * 1.02   # room for the tendrils as it swings round (the ball stays 0.6 of the cell)
    meta = dict(cell=[px, px], ppu=px / cam.data.ortho_scale, actions={})
    i = 0
    for name, n in ACTIONS:
        meta['actions'][name] = dict(first=i, frames=n); i += n
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'meta.json'), 'w') as fh: json.dump(meta, fh)
    for skin in (opt('--skins') or ','.join(SKINS)).split(','):
        apply_skin(skin)
        d = os.path.join(out, skin); os.makedirs(d, exist_ok=True)
        pupil = bpy.data.materials['eyeball'].node_tree.nodes['eye_pupil_at'].outputs[0]
        for i, (yaw, el, edge) in enumerate(frames()):
            y, e = math.radians(yaw), math.radians(el)
            rig.rotation_euler = Vector((math.cos(y) * math.cos(e), math.sin(y) * math.cos(e), math.sin(e))).to_track_quat('X', 'Z').to_euler()   # the ball's +X along the gaze, its top kept up
            pupil.default_value = edge
            back = min(1, max(0, (abs(yaw) - 45) / 135)) ** 0.7   # turning to face the visitor, they swing round behind the ball
            for tail, (*_, ph) in zip(tails, TENDRILS):   # each sways about its root on its own beat, a loop over chase's 8 frames
                w = i * math.tau / 8 + ph
                tail.rotation_euler = (math.radians(9) * math.sin(w), math.radians(7) * math.sin(w + 1.3) + math.radians(72) * back, math.radians(10) * math.cos(w))
            bpy.context.view_layer.update()
            cat.render(os.path.join(d, f'{i:02d}.png'))
        print(f'  rendered {skin}', flush=True)


main()
