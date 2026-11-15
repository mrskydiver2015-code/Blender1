import bpy, os
s=bpy.data.scenes['PATRIKS | No. 01 Marine Observatory'];bpy.context.window.scene=s
s.cycles.device='CPU'
s.render.resolution_percentage=100
s.cycles.samples=192;s.cycles.use_denoising=True;s.cycles.adaptive_threshold=.008
s.render.resolution_x=1920;s.render.resolution_y=1080
s.render.filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)),'chronograph_hero.png')
bpy.ops.render.render(write_still=True)
