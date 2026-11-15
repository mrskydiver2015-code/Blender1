import bpy, os, json, collections
OUT=os.path.dirname(os.path.abspath(__file__))
hero=bpy.data.scenes['PATRIKS | No. 01 Marine Observatory']
bpy.context.window.scene=hero
dg=bpy.context.evaluated_depsgraph_get()
sources=[o for o in hero.objects if o.type in {'MESH','CURVE','FONT'} and not o.hide_render and not any(c.name.startswith(('07','08')) for c in o.users_collection)]
web=bpy.data.scenes.new('WEB | PATRIKS portable PBR')
web.render.engine='CYCLES';web.cycles.samples=12;web.cycles.device='CPU'
web.world=hero.world
copies=[];mats={}
for source in sources:
    mesh=bpy.data.meshes.new_from_object(source.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
    o=bpy.data.objects.new(source.name,mesh);web.collection.objects.link(o);o.matrix_world=source.matrix_world.copy();copies.append(o)
    for slot in o.material_slots:
        old=slot.material
        if old and old.name not in mats:
            m=old.copy();m.name='WEB | '+old.name;mats[old.name]=m
        if old:slot.material=mats[old.name]
    material=o.data.materials[0];o.data.materials.clear();o.data.materials.append(material)
    for polygon in o.data.polygons:polygon.material_index=0
bpy.context.window.scene=web
def active(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def bake_material(o):
    active(o)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.018)
    bpy.ops.object.mode_set(mode='OBJECT')
    m=o.active_material;nodes=m.node_tree.nodes;links=m.node_tree.links
    bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    emission=nodes.new('ShaderNodeEmission')
    baked={}
    for channel in ['Base Color','Roughness','Normal']:
        img=bpy.data.images.new('PATRIKS | '+o.name+' | '+channel,width=1024,height=1024,alpha=False)
        if channel!='Base Color':img.colorspace_settings.name='Non-Color'
        target=nodes.new('ShaderNodeTexImage');target.image=img;nodes.active=target
        for n in nodes:n.select=False
        target.select=True
        if channel=='Normal':
            links.new(bsdf.outputs[0],out.inputs['Surface'])
            bpy.ops.object.bake(type='NORMAL',margin=12)
        else:
            for link in list(emission.inputs['Color'].links):links.remove(link)
            inp=bsdf.inputs[channel]
            if inp.is_linked:links.new(inp.links[0].from_socket,emission.inputs['Color'])
            else:
                value=inp.default_value
                emission.inputs['Color'].default_value=(value,value,value,1) if isinstance(value,float) else value
            links.new(emission.outputs[0],out.inputs['Surface'])
            bpy.ops.object.bake(type='EMIT',margin=12)
        img.pack();baked[channel]=img
        nodes.remove(target)
    links.new(bsdf.outputs[0],out.inputs['Surface']);nodes.remove(emission)
    return baked

baked={}
for o in copies:
    if o.name.startswith(('DIAL | abyss-blue','PLINTH | honed')):
        baked[o.active_material.name]=bake_material(o)
# Replace procedural graphs with portable Principled graphs. Hero graphs remain intact.
for m in mats.values():
    nodes=m.node_tree.nodes;links=m.node_tree.links
    bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    for n in list(nodes):
        if n not in [bsdf,out]:nodes.remove(n)
    links.new(bsdf.outputs[0],out.inputs['Surface'])
    bsdf.inputs['Anisotropic'].default_value=0
    if 'Sapphire' in m.name:bsdf.inputs['Roughness'].default_value=.004
    if m.name in baked:
        for channel,img in baked[m.name].items():
            tex=nodes.new('ShaderNodeTexImage');tex.image=img
            if channel=='Normal':
                normal=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bsdf.inputs[channel])
            else:links.new(tex.outputs['Color'],bsdf.inputs[channel])

groups=collections.defaultdict(list)
for o in copies:groups[o.active_material.name].append(o)
for name,objects in groups.items():
    active(objects[0])
    for o in objects:o.select_set(True)
    if len(objects)>1:bpy.ops.object.join()
    o=bpy.context.object;o.name=name.replace('WEB | ','')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    # Non-colour meshes without UVs receive a simple layer for broad importer compatibility.
    if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')

bpy.ops.object.select_all(action='SELECT')
for o in web.objects:
    o.data.validate(verbose=False,clean_customdata=False)
    mat=o.data.materials[0];o.data.materials.clear();o.data.materials.append(mat)
    for polygon in o.data.polygons:polygon.material_index=0
kwargs=dict(filepath=os.path.join(OUT,'chronograph_web.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=18,export_draco_normal_quantization=14,export_draco_texcoord_quantization=14,export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
props=set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
result=bpy.ops.export_scene.gltf(**{k:v for k,v in kwargs.items() if k in props})
tri=0;verts=0
for o in web.objects:
    o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles);verts+=len(o.data.vertices)
receipt={'operator':'export_scene.gltf','result':str(result),'draco_enabled':True,'compression_level':6,'web_mesh_objects':len(web.objects),'triangles':tri,'vertices':verts,'baked_materials':list(baked),'web_materials':len(mats),'metres':True,'web_note':'Procedural dial and basalt baked to 1024px color, roughness and normal maps. Web metals use portable isotropic PBR; anisotropy and procedural micro-brushing remain in the hero source.'}
with open(os.path.join(OUT,'export_receipt.json'),'w') as f:json.dump(receipt,f,indent=2)
audit=json.loads(hero['toolchain_audit']);audit['operators'].append({'tool':'glTF 2.0 + Draco',**receipt});hero['toolchain_audit']=json.dumps(audit)
with open(os.path.join(OUT,'build_audit.json'),'w') as f:json.dump(audit,f,indent=2)
bpy.context.window.scene=hero
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'chronograph_scene.blend'))
print('EXPORT_COMPLETE',json.dumps(receipt))
