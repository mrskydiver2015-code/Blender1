import { copyFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'public/draco');
await mkdir(destination, { recursive: true });
for (const name of ['draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
  await copyFile(path.join(root, 'node_modules/three/examples/jsm/libs/draco/gltf', name), path.join(destination, name));
}
for (const name of ['chronograph_web.glb', 'chronograph_hero.png']) {
  await access(path.join(root, 'artifacts/chronograph_test', name));
}
console.log('Chronograph assets verified; local Draco WASM decoder prepared.');
