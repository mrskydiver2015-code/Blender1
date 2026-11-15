import bpy, os
s=bpy.data.scenes['PATRIKS | No. 01 Marine Observatory'];bpy.context.window.scene=s
s.cycles.device='CPU';s.cycles.samples=48;s.render.resolution_percentage=50
s.render.filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)),'chronograph_polish_preview.png')
bpy.ops.render.render(write_still=True)
