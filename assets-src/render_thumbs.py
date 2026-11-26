"""Render thumbs-up.webp, the easter egg's sprite: a hand-coloured little Glenn turning once, in 36 frames.

The source is a 3D model (Meshy "Thumbs Up Guy", FBX + texture, ~32 MB, kept out of the repo). It is drawn
as ink on paper rather than shown as 3D: Freestyle outlines, and the texture's colours kept but desaturated
and posterized to four tones of brightness (hue untouched), with a touch of paper mixed in.

Two steps, from the repo root:

  1. In Blender (5.x):  blender -b -P assets-src/render_thumbs.py -- /path/to/Thumbs_Up_Guy.fbx /tmp/thumbs
     (renders s00.png … s35.png, 320x480, transparent)
  2. Pack the strip:    python3 assets-src/render_thumbs.py --pack /tmp/thumbs
     (writes thumbs-up.webp: one 11520x480 strip, quality 72, ~350 KB)
"""
import sys


def render(fbx, out, frames=36):
    import math
    import os
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bpy.ops.import_scene.fbx(filepath=fbx)
    ob = next(o for o in sc.objects if o.type == 'MESH')
    ob.location = (0, 0, ob.dimensions.z / 2)          # feet on the ground, origin at the centre

    # the texture's colours: desaturated, brightness posterized to four tones, a little paper mixed in
    src = next(n for n in ob.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image
               and not any(k in n.image.name.lower() for k in ('normal', 'rough', 'metal')))
    m = bpy.data.materials.new('InkColour')
    m.use_nodes = True
    n = m.node_tree
    n.nodes.clear()
    link = n.links.new
    tex = n.nodes.new('ShaderNodeTexImage')
    tex.image = src.image
    sep = n.nodes.new('ShaderNodeSeparateColor')
    sep.mode = 'HSV'
    com = n.nodes.new('ShaderNodeCombineColor')
    com.mode = 'HSV'
    link(tex.outputs['Color'], sep.inputs['Color'])

    def math_node(op, value=None):
        node = n.nodes.new('ShaderNodeMath')
        node.operation = op
        if value is not None:
            node.inputs[1].default_value = value
        return node
    chain = [math_node('POWER', 1 / 2.2), math_node('MULTIPLY', 3.6), math_node('CEIL'),
             math_node('DIVIDE', 3.6), math_node('MINIMUM', 1.0), math_node('POWER', 2.2)]
    link(sep.outputs['Blue'], chain[0].inputs[0])
    for a, b in zip(chain, chain[1:]):
        link(a.outputs[0], b.inputs[0])
    sat = math_node('MULTIPLY', 0.75)
    link(sep.outputs['Red'], com.inputs['Red'])
    link(sep.outputs['Green'], sat.inputs[0])
    link(sat.outputs[0], com.inputs['Green'])
    link(chain[-1].outputs[0], com.inputs['Blue'])
    mix = n.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['Factor'].default_value = 0.1
    mix.inputs['B'].default_value = (0.96, 0.93, 0.86, 1)
    link(com.outputs['Color'], mix.inputs['A'])
    em = n.nodes.new('ShaderNodeEmission')
    link(mix.outputs['Result'], em.inputs['Color'])
    link(em.outputs[0], n.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    ob.data.materials[0] = m

    # ink outlines
    r = sc.render
    r.engine = 'BLENDER_EEVEE'
    r.use_freestyle = True
    r.line_thickness_mode = 'ABSOLUTE'
    r.line_thickness = 1.15
    fs = bpy.context.view_layer.freestyle_settings
    fs.crease_angle = 2.2
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new('ink')
    for k in ('silhouette', 'border', 'crease', 'contour', 'external_contour'):
        setattr(ls, 'select_' + k, True)
    ls.linestyle.color = (0.08, 0.08, 0.08)
    ls.linestyle.thickness = 1.15
    sc.view_settings.view_transform = 'Standard'

    # a flat, front-on camera; the figure turns, the camera stays
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.2 * ob.dimensions.z / 2
    cam.location = (0, -10, 1.02 * ob.dimensions.z / 2)
    cam.rotation_euler = (math.radians(90), 0, 0)
    r.resolution_x, r.resolution_y, r.resolution_percentage = 320, 480, 100
    r.film_transparent = True
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'

    os.makedirs(out, exist_ok=True)
    for i in range(frames):
        ob.rotation_euler[2] = math.radians(360 * i / frames)
        r.filepath = f'{out}/s{i:02d}.png'
        bpy.ops.render.render(write_still=True)


def pack(folder, frames=36, dest='thumbs-up.webp'):
    from PIL import Image
    tiles = [Image.open(f'{folder}/s{i:02d}.png').convert('RGBA') for i in range(frames)]
    w, h = tiles[0].size
    strip = Image.new('RGBA', (w * frames, h))
    for i, t in enumerate(tiles):
        strip.paste(t, (i * w, 0))
    strip.save(dest, 'WEBP', quality=72, method=6, alpha_quality=80)
    print('written', dest)


if '--pack' in sys.argv:
    pack(sys.argv[sys.argv.index('--pack') + 1])
elif '--' in sys.argv:
    args = sys.argv[sys.argv.index('--') + 1:]
    render(args[0], args[1])
