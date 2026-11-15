import bpy, math, os, json, bmesh
from mathutils import Vector, Matrix
from math import sin, cos, pi

OUT = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
# A separate scene preserves the previously open project.
scene = bpy.data.scenes.new('PATRIKS | No. 01 Marine Observatory')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
cols = {}
for name in ['01 • Case & milled bezel', '02 • Dial & typography', '03 • Calibre & tourbillon', '04 • Hands & sapphire', '05 • Crown & fasteners', '06 • Gimbal & plinth', '07 • Studio', '08 • Boolean tooling']:
    c=bpy.data.collections.new(name); scene.collection.children.link(c); cols[name[:2]]=c
audit={'Blender':bpy.app.version_string,'operators':[], 'gear_train':[]}
root=bpy.data.objects.new('MARINE No.01 | inclined instrument assembly',None)
cols['01'].objects.link(root)
root.rotation_euler[0]=math.radians(77)
root.location=(0,0,1.94)

def active(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
def place(o,name,col,mat=None,parent=True):
    o.name=name
    for c in list(o.users_collection): c.objects.unlink(o)
    cols[col].objects.link(o)
    if parent: o.parent=root
    if mat: o.data.materials.append(mat)
    return o
def bevel(o,w=.01,segments=3):
    m=o.modifiers.new('Machined edge radius','BEVEL'); m.width=w; m.segments=segments
    m.harden_normals=True
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
        n=o.modifiers.new('Area weighted precision normals','WEIGHTED_NORMAL'); n.keep_sharp=True; n.weight=40
    return o
def cyl(name,r,d,loc,mat,col='01',verts=128,parent=True,bev=.008):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d,location=loc)
    o=place(bpy.context.object,name,col,mat,parent)
    if bev: bevel(o,bev)
    return o
def box(name,dim,loc,mat,col='01',parent=True,bev=.01):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=place(bpy.context.object,name,col,mat,parent); o.dimensions=dim
    active(o);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bev:bevel(o,bev)
    return o
def ring(name,ro,ri,z,d,mat,col='01',xy=(0,0),n=192,bev=.005,refine=False):
    vs=[]; fs=[]
    for zz,rr in [(z-d/2,ro),(z+d/2,ro),(z+d/2,ri),(z-d/2,ri)]:
        vs.extend([(xy[0]+rr*cos(2*pi*i/n),xy[1]+rr*sin(2*pi*i/n),zz) for i in range(n)])
    for j in range(4):
        for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i))
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update()
    o=bpy.data.objects.new(name,me);cols[col].objects.link(o);o.parent=root;o.data.materials.append(mat)
    if refine:
        active(o)
        for v in me.vertices:v.select=n<=v.index<2*n
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='VERT')
        bpy.ops.mesh.looptools_circle(custom_radius=True,radius=ro,regular=True)
        bpy.ops.mesh.looptools_relax(iterations='3',regular=True)
        bpy.ops.mesh.looptools_circle(custom_radius=True,radius=ro,regular=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        audit['operators'].append({'tool':'LoopTools','object':name,'ops':['mesh.looptools_circle','mesh.looptools_relax']})
    if bev:bevel(o,bev)
    return o
def wire(name,points,r,mat,col='03',parent=True):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=2;cu.bevel_depth=r;cu.bevel_resolution=3
    sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
    for p,co in zip(sp.points,points):p.co=(*co,1)
    o=bpy.data.objects.new(name,cu);cols[col].objects.link(o);o.data.materials.append(mat)
    if parent:o.parent=root
    return o
def material(name,color,metal=0,rough=.3,noise=0,aniso=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    nd=m.node_tree.nodes;lk=m.node_tree.links;p=next(n for n in nd if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    p.inputs['Anisotropic'].default_value=aniso
    p.location=(350,60)
    if noise:
        tc=nd.new('ShaderNodeTexCoord');tc.location=(-850,50)
        mp=nd.new('ShaderNodeMapping');mp.location=(-650,50);mp.inputs['Scale'].default_value=(2,2,160) if metal else (1,1,1)
        lk.new(tc.outputs['Generated'],mp.inputs['Vector'])
        no=nd.new('ShaderNodeTexNoise');no.location=(-420,50);no.inputs['Scale'].default_value=145 if metal else 210;no.inputs['Detail'].default_value=2.5
        lk.new(mp.outputs[0],no.inputs['Vector'])
        ramp=nd.new('ShaderNodeMapRange');ramp.location=(-160,100);ramp.inputs['To Min'].default_value=rough*.78;ramp.inputs['To Max'].default_value=rough*1.18
        lk.new(no.outputs['Fac'],ramp.inputs[0]);lk.new(ramp.outputs[0],p.inputs['Roughness'])
        bump=nd.new('ShaderNodeBump');bump.location=(100,-100);bump.inputs['Strength'].default_value=.14;bump.inputs['Distance'].default_value=noise
        lk.new(no.outputs['Fac'],bump.inputs['Height']);lk.new(bump.outputs[0],p.inputs['Normal'])
    return m

steel=material('01 | Rhodium — longitudinal satin',(.49,.56,.61),1,.24,.00065,.48)
gold=material('02 | Champagne gold — fine circular brushing',(.65,.40,.155),1,.23,.00055,.42)
polish=material('03 | Mirror polished chamfer',(.68,.74,.78),1,.115)
dark=material('04 | Black ruthenium — movement recess',(.018,.026,.034),.8,.31,.0006)
navy=material('05 | Abyss blue — micrograin enamel',(.009,.033,.047),.48,.29,.00085)
ink=material('06 | Warm ivory print',(.81,.81,.69),.15,.34)
blue=material('07 | Thermally blued steel hands',(.015,.07,.16),.92,.19)
ruby=material('08 | Synthetic ruby bearings',(.29,.004,.023),.35,.18)
lume=material('09 | Ceramic lume inserts',(.58,.79,.70),.1,.26)
lp=next(n for n in lume.node_tree.nodes if n.type=='BSDF_PRINCIPLED');lp.inputs['Emission Color'].default_value=(.22,.48,.34,1);lp.inputs['Emission Strength'].default_value=.18
glass=material('10 | Sapphire — optical IOR 1.76',(.96,.985,1),0,.025)
gp=next(n for n in glass.node_tree.nodes if n.type=='BSDF_PRINCIPLED');gp.inputs['Transmission Weight'].default_value=1;gp.inputs['IOR'].default_value=1.76
slate=material('11 | Honed basalt — mineral strata',(.028,.033,.039),.08,.4,.0022)
sn=slate.node_tree.nodes;sl=slate.node_tree.links;sp=next(n for n in sn if n.type=='BSDF_PRINCIPLED')
tex=sn.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=4;tex.inputs['Detail'].default_value=5
cr=sn.new('ShaderNodeValToRGB');cr.color_ramp.elements[0].position=.2;cr.color_ramp.elements[0].color=(.008,.012,.016,1);cr.color_ramp.elements[1].position=.83;cr.color_ramp.elements[1].color=(.05,.057,.065,1)
sl.new(tex.outputs['Fac'],cr.inputs[0]);sl.new(cr.outputs[0],sp.inputs['Base Color'])
floor=material('12 | Studio charcoal',(.016,.022,.029),.15,.46,.001)

def subtract(o,c):
    local=c.location.copy(); rotation=c.rotation_euler.copy()
    active(o);c.select_set(True)
    result=bpy.ops.object.boolean_brush_difference()
    c.parent=root;c.matrix_parent_inverse=Matrix.Identity(4);c.location=local;c.rotation_euler=rotation
    bpy.context.view_layer.update()
    for m in list(o.modifiers):
        if m.type=='BOOLEAN':
            m.solver='EXACT'
            while o.modifiers.find(m.name)>0:
                bpy.ops.object.modifier_move_up(modifier=m.name)
    c.hide_render=True;c.hide_set(True)
    audit['operators'].append({'tool':'Bool Tool','operator':'object.boolean_brush_difference','object':o.name,'cutter':c.name,'result':str(result)})

# Case: substantial milled barrel with retained non-destructive bore.
body=cyl('CASE | bored satin steel barrel',1.35,.47,(0,0,0),steel,verts=192,bev=.025)
cutter=cyl('TOOL | through-bore Ø2.39',1.195,.8,(0,0,.12),None,col='08',verts=192,bev=0)
subtract(body,cutter)
cyl('CASE | sealed black caseback',1.275,.065,(0,0,-.245),dark,verts=192)
ring('CASE | rear gold seam',1.345,1.30,-.18,.028,gold)
ring('BEZEL | loop-refined outer shoulder',1.37,1.19,.255,.135,steel,refine=True,bev=.014)
ring('BEZEL | mirror outer lip',1.375,1.345,.322,.026,polish,bev=.006)
ring('BEZEL | gold crystal seat',1.245,1.205,.333,.027,gold,bev=.004)
ring('BEZEL | black gasket',1.208,1.19,.331,.016,dark,bev=.002)
ring('CASE | decorative barrel flute band',1.357,1.335,-.032,.1,dark)
for i in range(100):
    a=i*2*pi/100
    o=box('CASE | fluted band %03d'%i,(.012,.020,.105),(1.355*cos(a),1.355*sin(a),-.032),steel,bev=.003)
    o.rotation_euler[2]=a

# Recessed face and open movement aperture.
dial=cyl('DIAL | abyss-blue enamel with open heart',1.188,.046,(0,0,.257),navy,'02',192,bev=.008)
cut=cyl('TOOL | tourbillon well',.438,.30,(0,-.48,.25),None,'08',128,bev=0)
subtract(dial,cut)
ring('DIAL | outer railroad gold hairline',1.155,1.15,.285,.006,gold,'02',bev=.001)
ring('DIAL | inner railroad gold hairline',1.055,1.051,.286,.006,gold,'02',bev=.001)
ring('TOURBILLON | polished aperture lip',.456,.434,.289,.024,gold,'03',xy=(0,-.48),bev=.004)
cyl('TOURBILLON | shadow well',.435,.025,(0,-.48,.11),dark,'03',128,bev=.005)

font=bpy.data.fonts.load(r'C:\Windows\Fonts\bahnschrift.ttf')
serif=bpy.data.fonts.load(r'C:\Windows\Fonts\times.ttf')
def text_obj(name,s,size,loc,mat=ink,font_used=None,col='02',parent=True):
    cu=bpy.data.curves.new(name,'FONT');cu.body=s;cu.size=size;cu.align_x='CENTER';cu.align_y='CENTER';cu.extrude=.00035;cu.bevel_depth=.00015;cu.bevel_resolution=1;cu.resolution_u=8;cu.font=font_used or font
    o=bpy.data.objects.new(name,cu);cols[col].objects.link(o);o.location=loc;o.data.materials.append(mat)
    if parent:o.parent=root
    return o
for i in range(60):
    a=2*pi*i/60;major=i%5==0
    o=box('CHAPTER | minute %02d'%i,(.013 if major else .006,.062 if major else .031,.006),(1.108*sin(a),1.108*cos(a),.294),ink,'02',bev=.001)
    o.rotation_euler[2]=-a
for i in range(1,13):
    a=2*pi*i/12
    if i in [4,5,6,7,8]: continue
    text_obj('HOUR | %02d'%i,str(i),.135,(.945*sin(a),.945*cos(a),.296),ink,serif)
for i in range(12):
    a=2*pi*i/12
    o=box('INDEX | applied gold baton %02d'%i,(.037,.085,.017),(1.009*sin(a),1.009*cos(a),.303),gold,'02',bev=.004);o.rotation_euler[2]=-a
    o=box('INDEX | lume inset %02d'%i,(.015,.057,.006),(1.009*sin(a),1.009*cos(a),.315),lume,'02',bev=.002);o.rotation_euler[2]=-a
text_obj('SIGNATURE | PATRIKS','P A T R I K S',.130,(0,.65,.298),gold)
text_obj('SIGNATURE | Marine Chronometre','MARINE CHRONOMETRE',.043,(0,.524,.298))
text_obj('SIGNATURE | Calibre','CAL. 01   /   21 JEWELS',.036,(0,-.987,.3),gold)
text_obj('SIGNATURE | Edition','OBSERVATORY   •   No. 001',.033,(0,.425,.298),ink)
# Compass emblem above the marque.
wire('DIAL | north star',[(0,.785,.299),(.024,.825,.299),(0,.865,.299),(-.024,.825,.299),(0,.785,.299)],.003,gold,'02')

for sx,label in [(-.652,'SECONDS'),(.652,'30 MIN')]:
    cy=.045
    cyl('REGISTER | '+label,.285,.015,(sx,cy,.289),dark,'02',128,bev=.004)
    ring('REGISTER | gold flange '+label,.288,.279,.299,.012,gold,'02',xy=(sx,cy),n=128,bev=.002)
    for j in range(9):ring('REGISTER | azurage '+label+' '+str(j),.075+j*.021,.0735+j*.021,.299,.002,steel,'02',xy=(sx,cy),n=96,bev=0)
    for i in range(30):
        a=2*pi*i/30;rr=.253
        o=box('REGISTER | graduation '+label+str(i),(.006,.025 if i%5==0 else .012,.003),(sx+rr*sin(a),cy+rr*cos(a),.304),ink,'02',bev=.0007);o.rotation_euler[2]=-a
    text_obj('REGISTER | 60 or 30 '+label,'60' if sx<0 else '30',.048,(sx,cy+.191,.306))
    text_obj('REGISTER | 20 or 10 '+label,'20' if sx<0 else '10',.048,(sx+.165,cy-.095,.306))
    text_obj('REGISTER | 40 or 20 '+label,'40' if sx<0 else '20',.048,(sx-.165,cy-.095,.306))
    text_obj('REGISTER | label '+label,label,.028,(sx,cy-.115,.308),gold)
    h=box('REGISTER | blued hand '+label,(.013,.204,.009),(sx,cy+.074,.322),blue,'04',bev=.004)
    cyl('REGISTER | pin '+label,.022,.018,(sx,cy,.328),gold,'04',48,bev=.003)

def gear(name,r,n,loc,mat=gold,phase=0,base=None,width=.012):
    mod=2*r/n
    bpy.ops.mesh.primitive_gear(number_of_teeth=n,radius=r,addendum=mod,dedendum=1.25*mod,base=base or r*.33,width=width,angle=math.radians(20))
    o=place(bpy.context.object,name,'03',mat);o.location=loc;o.rotation_euler[2]=phase
    bevel(o,.0015,2)
    o['pitch_radius']=r;o['teeth']=n;o['module']=mod
    audit['operators'].append({'tool':'Extra Mesh Objects','operator':'mesh.primitive_gear','object':name,'teeth':n})
    return o
# Pitch circles share a 0.012 metre module; centres are exactly the sum of pitch radii.
gear('CALIBRE | 36T great wheel',.216,36,(-.075,-.48,.185),gold)
gear('CALIBRE | 12T interlocking pinion',.072,12,(.213,-.48,.185),steel,pi/12)
gear('CALIBRE | 20T intermediate wheel',.12,20,(.213,-.288,.185),gold,0)
audit['gear_train']=[{'pair':['36T','12T'],'module':.012,'pitch_center_distance':.288},{'pair':['12T','20T'],'module':.012,'pitch_center_distance':.192}]
for x,y,r in [(-.075,-.48,.216),(.213,-.48,.072),(.213,-.288,.12)]:
    for j in range(5):
        a=2*pi*j/5
        wire('CALIBRE | wheel spoke',[(x,y,.188),(x+r*.77*cos(a),y+r*.77*sin(a),.188)],.009,gold)
    cyl('CALIBRE | axle jewel',.024,.024,(x,y,.216),ruby,'03',48,bev=.005)
    cyl('CALIBRE | pivot',.008,.032,(x,y,.227),polish,'03',32,bev=.002)
# Flying tourbillon cage and hairspring, lifted above the gear train.
ring('TOURBILLON | balance rim',.268,.246,.234,.018,gold,'03',xy=(-.065,-.51),n=128,bev=.003)
ring('TOURBILLON | cage rim',.302,.289,.259,.012,polish,'03',xy=(-.065,-.51),n=128,bev=.003)
pts=[]
for j in range(550):
    a=j/549*2*pi*5.4;rr=.025+.17*j/549;pts.append((-.065+rr*cos(a),-.51+rr*sin(a),.255))
wire('TOURBILLON | blued five-turn hairspring',pts,.0028,blue)
for j in range(3):
    a=2*pi*j/3+.2
    wire('TOURBILLON | three-arm bridge', [(-.065,-.51,.281),(-.065+.28*cos(a),-.51+.28*sin(a),.281)],.013,steel)
    cyl('TOURBILLON | cage jewel',.016,.016,(-.065+.28*cos(a),-.51+.28*sin(a),.292),ruby,'03',32,bev=.003)
for j in range(12):
    a=2*pi*j/12
    cyl('TOURBILLON | poising screw',.011,.014,(-.065+.259*cos(a),-.51+.259*sin(a),.249),steel,'03',24,bev=.002)
cyl('TOURBILLON | centre jewel chaton',.039,.020,(-.065,-.51,.293),gold,'03',64,bev=.003)
cyl('TOURBILLON | centre ruby',.020,.021,(-.065,-.51,.302),ruby,'03',64,bev=.004)

# Sculpted dauphine hands in a classic 10:08 display.
def hand(name,length,width,angle,z,mat):
    coords=[(-width*.3,-.13),(-width*.52,.11),(-width*.4,length*.6),(0,length),(width*.4,length*.6),(width*.52,.11),(width*.3,-.13)]
    vs=[(x,y,zz) for zz in [z,z+.014] for x,y in coords];N=len(coords)
    fs=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);cols['04'].objects.link(o);o.parent=root;o.data.materials.append(mat);o.rotation_euler[2]=angle;bevel(o,.004)
    return o
hand('HANDS | hour dauphine',.64,.072,math.radians(58),.350,gold)
hand('HANDS | minute dauphine',.91,.052,math.radians(-49),.376,polish)
h=hand('HANDS | hour blue facet',.60,.026,math.radians(58),.367,blue)
h=hand('HANDS | minute blue facet',.875,.018,math.radians(-49),.393,blue)
hand('HANDS | chronograph sweep',.985,.012,math.radians(-166),.415,gold)
cyl('HANDS | central collet',.072,.030,(0,0,.418),blue,'04',96,bev=.007)
cyl('HANDS | polished axle',.038,.018,(0,0,.438),gold,'04',64,bev=.004)

# Sapphire slightly above the main hands. Real closed optical volume.
cyl('OPTICS | sapphire crystal',1.197,.025,(0,0,.470),glass,'04',192,bev=.008)
ring('OPTICS | elevated crystal retaining lip',1.235,1.195,.447,.105,polish,'01',bev=.007)
ring('OPTICS | fine gold outer reveal',1.245,1.23,.491,.014,gold,'01',bev=.003)

# Extra Mesh Objects splined precision fasteners with machined screw slots.
for j in range(8):
    a=2*pi*(j+.5)/8;x,y=1.298*sin(a),1.298*cos(a)
    o=gear('FASTENER | spline screw %02d'%j,.033,12,(x,y,.340),steel,base=.027,width=.013)
    # Keep the spline-generated head; a blue slot reads crisply at macro scale.
    cap=cyl('FASTENER | polished crown %02d'%j,.030,.010,(x,y,.356),polish,'05',48,bev=.002)
    slot=box('TOOL | screw slot %02d'%j,(.043,.007,.025),(x,y,.360),None,'08',bev=0)
    slot.rotation_euler[2]=a+.3;subtract(cap,slot)
    cyl('FASTENER | slot shadow %02d'%j,.022,.003,(x,y,.346),dark,'05',32,bev=0)

# Crown spindle and coin-edge hand-winding grip, oriented along the X axis.
o=cyl('CROWN | winding stem',.10,.24,(1.40,0,-.02),gold,'05',96);o.rotation_euler[1]=pi/2
o=gear('CROWN | 48-flute winding wheel',.175,48,(1.58,0,-.02),steel,base=.14,width=.088);o.rotation_euler[1]=pi/2
o=cyl('CROWN | end cap',.146,.027,(1.68,0,-.02),gold,'05',96);o.rotation_euler[1]=pi/2
for sy in [-.60,.60]:
    o=cyl('CROWN | chronograph pusher',.075,.22,(1.28,sy,-.01),steel,'05',64);o.rotation_euler[1]=pi/2
    o=cyl('CROWN | pusher cap',.089,.06,(1.40,sy,-.01),gold,'05',64);o.rotation_euler[1]=pi/2

# Architectural stone display and functional supporting saddle.
box('PLINTH | honed basalt monolith',(4.15,2.45,.38),(0,.13,.22),slate,'06',False,.045)
box('PLINTH | recessed shadow foot',(3.80,2.16,.065),(0,.13,.045),dark,'06',False,.016)
box('PLINTH | champagne metal reveal',(4.08,2.38,.018),(0,.13,.105),gold,'06',False,.006)
for x in [-.83,.83]:
    cyl('MOUNT | foot',.22,.05,(x,.13,.44),steel,'06',96,False,.01)
    box('MOUNT | sculpted saddle upright',(.13,.32,.48),(x,.14,.685),gold,'06',False,.05)
    o=cyl('MOUNT | pivot shoe',.17,.16,(x,0,.90),steel,'06',96,False,.012);o.rotation_euler[0]=pi/2
box('PLAQUE | inset metal maker plate',(1.42,.016,.16),(0,-1.105,.245),dark,'06',False,.007)
t=text_obj('PLAQUE | maker','P A T R I K S   /   0 0 1',.073,(0,-1.119,.245),gold,col='06',parent=False);t.rotation_euler[0]=pi/2

# Studio: broad diffuse key, controlled strip reflections and warm rear separation.
box('STUDIO | seamless floor',(200,200,.08),(0,0,-.05),floor,'07',False,.01)
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,target,energy,color,size,size_y=None):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='RECTANGLE';d.size=size;d.size_y=size_y or size
    o=bpy.data.objects.new(name,d);cols['07'].objects.link(o);o.location=loc;aim(o,target);return o
area('KEY | cool silk overhead',(-3.2,-4.4,6.5),(0,0,1.5),650,(.82,.91,1),4,3)
area('STRIP | left vertical softbox',(-4,-1.5,2.7),(0,0,1.8),420,(.70,.84,1),1.25,4)
area('RIM | warm champagne edge',(2.5,2.4,5),(0,0,1.6),850,(1,.77,.48),3,2.5)
area('FILL | right blade',(4,-2,3.5),(0,0,1.6),260,(.86,.93,1),.8,3.5)
world=bpy.data.worlds.new('STUDIO | midnight environment');world.use_nodes=True;scene.world=world
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.12,.16,.22,1);bg.inputs['Strength'].default_value=.18
cd=bpy.data.cameras.new('85mm | product portrait');cam=bpy.data.objects.new('CAMERA | hero three-quarter',cd);cols['07'].objects.link(cam);scene.camera=cam
cam.location=(3.55,-8.6,4.75);aim(cam,(0,0,1.63));cd.type='PERSP';cd.lens=54
focus=bpy.data.objects.new('FOCUS | hand arbor',None);cols['07'].objects.link(focus);focus.location=root.matrix_world @ Vector((0,0,.32))
cd.dof.use_dof=True;cd.dof.focus_object=focus;cd.dof.aperture_fstop=10;cd.dof.aperture_blades=9
scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=True
scene.cycles.max_bounces=10;scene.cycles.transmission_bounces=8;scene.cycles.transparent_max_bounces=8
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=50
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8'
scene.render.filepath=os.path.join(OUT,'chronograph_preview.png')
scene.view_settings.view_transform='AgX'
scene.render.film_transparent=False
scene['creative_direction']='PATRIKS Marine Observatory No.001 — naval precision, champagne brass, abyss enamel, sapphire and basalt'
scene['toolchain_audit']=json.dumps(audit)

# Node Wrangler performs the final material graph layout, not merely enablement.
active(body)
area_ui=next((a for a in bpy.context.screen.areas if a.type=='VIEW_3D'),bpy.context.screen.areas[0]);old_type=area_ui.type
area_ui.type='NODE_EDITOR';area_ui.ui_type='ShaderNodeTree'
with bpy.context.temp_override(area=area_ui):
    area_ui.spaces.active.shader_type='OBJECT'
    for n in steel.node_tree.nodes:n.select=True
    result=bpy.ops.node.nw_align_nodes(margin=80)
audit['operators'].append({'tool':'Node Wrangler','operator':'node.nw_align_nodes','material':steel.name,'result':str(result)})
area_ui.type=old_type
scene['toolchain_audit']=json.dumps(audit)
with open(os.path.join(OUT,'build_audit.json'),'w') as f:json.dump(audit,f,indent=2)
# Fonts packed for independent delivery.
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'chronograph_scene.blend'))
print('BUILD_COMPLETE',len(scene.objects),'objects')
