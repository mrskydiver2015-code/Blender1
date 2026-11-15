import bpy, math, os, json
from mathutils import Matrix,Vector
OUT=os.path.dirname(os.path.abspath(__file__))
s=bpy.data.scenes['PATRIKS | No. 01 Marine Observatory'];bpy.context.window.scene=s
root=bpy.data.objects['MARINE No.01 | inclined instrument assembly']
# Bool Tool reparents cutters. Restore their intended assembly-local transforms.
for o in list(s.objects):
    if o.name.startswith('TOOL |'):
        local=o.location.copy();rotation=o.rotation_euler.copy()
        o.parent=root;o.matrix_parent_inverse=Matrix.Identity(4);o.location=local;o.rotation_euler=rotation
bpy.context.view_layer.update()
s.camera.data.lens=46
s.camera.data.dof.aperture_fstop=16
# Clear the bright reflected panel from the face while retaining edge gradients.
slate=bpy.data.materials['11 | Honed basalt — mineral strata']
for n in slate.node_tree.nodes:
    if n.type=='TEX_NOISE' and n.inputs['Scale'].default_value<10:
        n.inputs['Scale'].default_value=19;n.inputs['Detail'].default_value=6
    if n.type=='VALTORGB':
        n.color_ramp.elements[0].color=(.013,.017,.022,1);n.color_ramp.elements[1].color=(.029,.035,.043,1)
    if n.type=='BUMP':n.inputs['Distance'].default_value=.00045;n.inputs['Strength'].default_value=.10
# Actual 27 cm case and 41.5 cm plinth. Scale studio consistently.
if root.scale.x > .5:
    for o in list(s.objects):
        if o.parent is None:
            o.location*=.1;o.scale*=.1
            if o.type=='LIGHT':o.data.energy*=.01
s.camera.location=(.305,-.92,.48)
s.camera.rotation_euler=(Vector((0,0,.145))-s.camera.location).to_track_quat('-Z','Y').to_euler()
bpy.data.objects['KEY | cool silk overhead'].data.energy=7.8
bpy.data.objects['FILL | right blade'].data.energy=3.5
for o in s.objects:
    if o.type=='CAMERA':o.data.clip_start=.005;o.data.clip_end=100
s.render.resolution_percentage=50;s.cycles.samples=48
s.render.filepath=os.path.join(OUT,'chronograph_polish_preview.png')
s['polish_pass']='Restored cutter coordinate frames; exposed calibre; wider camera; f/16 optical focus; stronger fill; finer basalt grain; calibrated to real metres.'
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'chronograph_scene.blend'))
print('POLISH_SAVED')
