import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'artifacts/chronograph_test');
const html = `<!doctype html><html><head><style>body{margin:0;background:#101923}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script></head><body><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const renderer = new THREE.WebGLRenderer({antialias:true});renderer.setSize(1200,900);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#101923');const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;
const camera=new THREE.PerspectiveCamera(32,1200/900,.001,100);camera.position.set(.36,.44,.81);camera.lookAt(0,.17,0);
const draco=new DRACOLoader();draco.setDecoderPath('/node_modules/three/examples/jsm/libs/draco/gltf/');
const loader=new GLTFLoader();loader.setDRACOLoader(draco);
try{const gltf=await loader.loadAsync('/artifacts/chronograph_test/chronograph_web.glb');scene.add(gltf.scene);let meshes=0,triangles=0;gltf.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});renderer.render(scene,camera);window.result={ok:true,meshes,triangles,drawCalls:renderer.info.render.calls,bounds:new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).toArray()};}catch(e){window.result={ok:false,error:String(e)};}
</script></body></html>`;
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
    const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
    if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);res.end();return;}
    const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.wasm':'application/wasm','.glb':'model/gltf-binary'})[ext]||'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.result,{timeout:120000});
  const result=await page.evaluate(()=>window.result);result.errors=errors;
  await page.screenshot({path:path.join(out,'chronograph_web_verified.png')});await fs.writeFile(path.join(out,'web_validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  if(!result.ok||errors.length)process.exitCode=1;
}finally{await browser?.close();server.close();}
