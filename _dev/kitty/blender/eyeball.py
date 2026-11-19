"""The OBSERVE eye that chases KITTY_RUN.EXE's kitty: an eyeball in the kitty's own look (flat colour, one shadow tone, a
dark outline hull, from cat.py), with an upper and a lower lid, one skin per OS, through the same camera as her back-view
clips (behind and 30 degrees up, render_sprites.py --view back).

  blender -b --python _dev/kitty/blender/eyeball.py -- --out /some/tmp/eye [--skins aero,ray] [--px 520]
  python3 _dev/kitty/blender/pack_sprites.py /some/tmp/eye --eye        (assets/run/eye-<skin>.webp and eye.json)

It chases her, so the camera sees it from behind, as it sees her: the back of the ball, with fine lines in the OS's accent
running back to the stub where the nerve leaves it, and the lids (the boot screen's) wrapping round its front. Frames:
  chase  8   a loop: it wobbles as it flies
  look   5   turned from her far left to her far right, so the page can keep it on her lane
  turn   7   when it has her: it spins round and lifts its gaze as it surfaces, until it looks straight down the camera
  stare  4   at the visitor, dead on, its pupil tightening as it locks on: the desktop looks back, through the fourth wall
  shut   4   still facing the camera, the lids close
The iris, pupil, highlight and lines are painted on the ball by its material, as the cat's face is. The eye makes no sound.
"""
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix, Euler

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import cat

ELEVATION = 40                       # degrees, as render_sprites.BACK_ELEVATION
R, LID = 0.5, 0.535                  # the ball's radius and the lids'
IRIS, PUPIL, RING = 0.86, 0.972, 0.955   # cosines from the gaze: the iris's edge, the pupil's, the light ring round the pupil
SKINS = {   # each OS's OBSERVE icon, as an eyeball: white, its shadow, the iris (dark rim, body, light ring), pupil, lids, line
    'aero':    dict(vein='#5aa8e6', white='#ffffff', shade='#c4d8ee', rim='#07366f', iris='#1890d8', light='#7ff1ff', pupil='#061a33', lid='#0a5cb8', lid_shade='#06306b', line='#07366f'),
    'vapor':   dict(vein='#ff71ce', white='#fff5fc', shade='#f0c8e8', rim='#7b1fa2', iris='#ff71ce', light='#fffb96', pupil='#1a0640', lid='#b967ff', lid_shade='#7b1fa2', line='#2a1257'),
    'baroque': dict(vein='#b8923a', white='#f3e6c4', shade='#c9b48a', rim='#5a0a14', iris='#a8202e', light='#f0c055', pupil='#0a0607', lid='#5a0a14', lid_shade='#3d060d', line='#b8923a'),
    'ghost':   dict(vein='#19f7ff', white='#d8f6f4', shade='#8fb8b8', rim='#5a0016', iris='#ff003c', light='#fcee0a', pupil='#021012', lid='#12363a', lid_shade='#0a2224', line='#00ffc8'),
    'ray':     dict(vein='#5b574e', white='#f4ecd8', shade='#cfc7b3', rim='#1d1b18', iris='#5b574e', light='#b9ad92', pupil='#000000', lid='#3d3a34', lid_shade='#1d1b18', line='#161513'),
    'metro':   dict(vein='#c27a0a', white='#f6f2ea', shade='#cbbfae', rim='#0039a6', iris='#1f6fd8', light='#8fdcff', pupil='#0e0f12', lid='#2a2a2e', lid_shade='#16171a', line='#16171a'),
}
OPEN, SHUT = (-30, 28), (14, -12)    # (upper, lower) lid turns in degrees: open, and meeting a little below the middle
ACTIONS = [('chase', 8), ('look', 5), ('turn', 7), ('stare', 4), ('shut', 4)]
NERVE = (0.07, 0.3)                  # the cord at the back, trailing down and back: radius, length


GAZE, CAM = -10, ELEVATION            # degrees above level: where it looks while it chases her (a little down), and the camera

def frames():
    """(where it looks: turn about the up axis and elevation, in degrees; lids shut 0..1; the pupil's edge) for every frame,
    in ACTIONS order. The gaze turns half round and lifts to the camera's height to look straight at it."""
    ease = lambda i, n: (1 - math.cos(math.pi * i / n)) / 2
    out = [(7 * math.sin(i * math.tau / 8), GAZE + 4 * math.cos(i * math.tau / 8), 0.0, PUPIL) for i in range(8)]   # chase
    out += [(-30 + 15 * i, GAZE, 0.0, PUPIL) for i in range(5)]                                                     # look
    out += [(180 * ease(i, 6), GAZE + (CAM - GAZE) * ease(i, 6), 0.0, PUPIL) for i in range(7)]                    # turn
    out += [(180, CAM, 0.0, p) for p in (0.962, 0.968, 0.975, 0.98)]                                                # stare
    out += [(180, CAM, k, 0.98) for k in (0.4, 0.75, 0.95, 1.0)]                                                    # shut
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
    # the back: lines running from the nerve forward round the ball, finer and fading toward its middle
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(nrm.outputs['Vector'], sep.inputs[0])
    phi = cat.m(nt, 'ARCTAN2', sep.outputs['Z'], sep.outputs['Y'])
    wave = cat.m(nt, 'SINE', cat.m(nt, 'ADD', cat.m(nt, 'MULTIPLY', phi, 5.0), cat.m(nt, 'MULTIPLY', c, 4.0)))
    fork = cat.m(nt, 'SINE', cat.m(nt, 'ADD', cat.m(nt, 'MULTIPLY', phi, 11.0), cat.m(nt, 'MULTIPLY', c, -6.0)))   # branches toward the middle
    thin = cat.m(nt, 'MAXIMUM', cat.m(nt, 'GREATER_THAN', wave, 0.975), cat.m(nt, 'MULTIPLY', cat.m(nt, 'GREATER_THAN', fork, 0.985), cat.m(nt, 'GREATER_THAN', c, -0.6)))
    vein = cat.m(nt, 'MULTIPLY', thin, cat.m(nt, 'LESS_THAN', c, -0.15))
    col = cat.mix(nt, vein, col, cat.rgb(nt, 'eye_vein'))
    g = nt.nodes.new('ShaderNodeNewGeometry')                              # the highlight stays put as the eye turns
    shine = cat.m(nt, 'GREATER_THAN', cat.dot(nt, g.outputs['Normal'], hl), 0.985)
    cat.emit(nt, out, cat.mix(nt, shine, col, cat.rgb(nt, 'eye_glint')))
    return mat


def mesh(name, bm, mats):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for mt in mats: me.materials.append(mt)
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    cat.outline(ob)
    return ob


def cap(name, sign, mats):
    """A lid: a shell a little bigger than the ball over its front, above (sign 1) or below (-1) its middle. Only the
    front: from behind, the back of the ball shows bare, as a real eye's does."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=LID)
    for co, no in (((0, 0, 0), (0, 0, -sign)), ((0.12, 0, 0), (-1, 0, 0))):   # cut along clean planes, so its edges are smooth arcs
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True)
    return mesh(name, bm, mats)


def apply_skin(name):
    s = {k: cat.lin(cat.srgb(v)) for k, v in SKINS[name].items()}
    vals = {'eye_vein': s['vein'], 'eye_white': s['white'], 'eye_shade': s['shade'], 'eye_rim': s['rim'], 'eye_iris': s['iris'], 'eye_light': s['light'],
            'eye_pupil': s['pupil'], 'eye_glint': cat.lin((1, 1, 1)), 'lid': s['lid'], 'lid_shade': s['lid_shade'], 'coat_line': s['line']}
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
    lids = [cap('lid_up', 1, [toon('lid', 'lid', 'lid_shade'), line]), cap('lid_down', -1, [bpy.data.materials['lid'], line])]
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=NERVE[0], radius2=NERVE[0] * 0.8, depth=NERVE[1])
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -NERVE[1] / 2))
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(55), 3, 'Y'))   # down and back from the back of the ball
    bmesh.ops.translate(bm, verts=bm.verts, vec=(-R + 0.03, 0, 0))
    nerve = mesh('nerve', bm, [bpy.data.materials['lid'], line])
    rig = bpy.data.objects.new('eye', None); sc.collection.objects.link(rig)
    for ob in (ball, *lids, nerve): ob.parent = rig

    sc.render.resolution_x = sc.render.resolution_y = px
    sc.render.dither_intensity = 0
    cam.data.ortho_scale = 2 * (R + NERVE[1] + cat.LINE) * 1.02   # room for the nerve as it swings round
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
        for i, (yaw, el, k, edge) in enumerate(frames()):
            y, e = math.radians(yaw), math.radians(el)
            rig.rotation_euler = Vector((math.cos(y) * math.cos(e), math.sin(y) * math.cos(e), math.sin(e))).to_track_quat('X', 'Z').to_euler()   # the ball's +X along the gaze, its top kept up
            nerve.hide_render = abs(yaw) > 40   # turning to face the camera, the cord would only cut across the eye
            pupil.default_value = edge
            lids[0].rotation_euler = (0, math.radians(OPEN[0] + (SHUT[0] - OPEN[0]) * k), 0)
            lids[1].rotation_euler = (0, math.radians(OPEN[1] + (SHUT[1] - OPEN[1]) * k), 0)
            bpy.context.view_layer.update()
            cat.render(os.path.join(d, f'{i:02d}.png'))
        print(f'  rendered {skin}', flush=True)


main()
