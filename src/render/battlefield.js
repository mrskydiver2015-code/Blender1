import {
  Color, DirectionalLight, DynamicDrawUsage, HemisphereLight, InstancedMesh, Matrix4,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, OrthographicCamera, Plane, Raycaster, RingGeometry, Scene, Vector2, Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import { depth, entry, exit, inBounds, tileAt, width } from '../engine/board.js';
import { capacity } from '../engine/game.js';
import { watchModels } from './models.js';
import { createPrimitives } from './primitives.js';

export async function createBattlefield(container, requestedBackend) {
  const renderer = new WebGPURenderer({
    antialias: false,
    forceWebGL: requestedBackend === 'webgl',
    powerPreference: 'low-power',
    alpha: false,
  });
  await renderer.init();
  const backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl';
  if (requestedBackend === 'webgpu' && backend !== 'webgpu') {
    renderer.dispose();
    throw new Error('No WebGPU adapter is available.');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  container.append(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#142337');
  const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 75);
  const center = new Vector3((width - 1) / 2, 0, (depth - 1) / 2);
  camera.position.copy(center).add(new Vector3(12, 12, 12));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  scene.add(new HemisphereLight('#E8F7FF', '#60708B', 1.55));
  const sun = new DirectionalLight('#FFEACF', 2);
  sun.position.set(-4, 10, 6);
  scene.add(sun);

  const material = new MeshLambertMaterial({ vertexColors: true });
  const geometry = createPrimitives();
  const tiles = { ground: [], pad: [], tile_path: [] };
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const tile = tileAt(x, z);
      tiles[tile === 'path' ? 'tile_path' : tile].push({ x, z });
    }
  }
  const batches = new Map();
  const matrix = new Matrix4();

  function fill(batch, items, height, type) {
    const { mesh } = batch;
    let count = 0;
    for (let i = 0; i < items.length; i++) {
      if (type && (items[i].type ?? (type === 'basic' || type === 'rail' ? 'basic' : 'grunt')) !== type) continue;
      if (count >= batch.size) break;
      const { x, z, y = height, angle = 0 } = items[i];
      matrix.makeRotationY(angle).setPosition(x, y, z);
      mesh.setMatrixAt(count++, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function setBatch(id, size, dynamic, nextGeometry = geometry[id]) {
    const previous = batches.get(id)?.mesh;
    if (previous) {
      scene.remove(previous);
      previous.dispose();
      if (previous.geometry !== geometry[id]) previous.geometry.dispose();
    }
    const mesh = new InstancedMesh(nextGeometry, material, size);
    mesh.count = 0;
    if (dynamic) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
    }
    scene.add(mesh);
    const batch = { mesh, size, dynamic };
    batches.set(id, batch);
    return batch;
  }

  for (const [id, items] of Object.entries(tiles)) {
    fill(setBatch(id, items.length, false), items, 0);
  }
  fill(setBatch('entry', 1, false), [entry], 0.14);
  fill(setBatch('exit', 1, false), [exit], 0.14);
  setBatch('turret_basic', capacity.turrets, true);
  setBatch('turret_rail', capacity.turrets, true);
  setBatch('enemy_grunt', capacity.enemies, true);
  setBatch('enemy_runner', capacity.enemies, true);
  setBatch('shot', capacity.projectiles, true);
  const rangeRing = new Mesh(
    new RingGeometry(0.992, 1.008, 96).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: '#B9EFFF', depthWrite: false }),
  );
  rangeRing.visible = false;
  scene.add(rangeRing);
  function setRangePreview(preview) {
    rangeRing.visible = Boolean(preview && inBounds(preview.x, preview.z)
      && tileAt(preview.x, preview.z) === 'pad' && Number.isFinite(preview.range) && preview.range > 0);
    if (!rangeRing.visible) return;
    rangeRing.position.set(preview.x, 0.17, preview.z);
    rangeRing.scale.set(preview.range, 1, preview.range);
  }
  const models = watchModels((id, replacement) => {
    const previous = batches.get(id);
    if (!previous || (!replacement && previous.mesh.geometry === geometry[id])) {
      replacement?.dispose();
      return;
    }
    const batch = setBatch(id, previous.size, previous.dynamic, replacement ?? geometry[id]);
    if (tiles[id]) fill(batch, tiles[id], 0);
  });

  const canvasBounds = { left: 0, top: 0, width: 1, height: 1 };
  function measureCanvas() {
    const rect = renderer.domElement.getBoundingClientRect();
    canvasBounds.left = rect.left;
    canvasBounds.top = rect.top;
    canvasBounds.width = rect.width;
    canvasBounds.height = rect.height;
  }
  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    const aspect = w / h;
    const halfHeight = Math.max(5.1, 8.45 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    measureCanvas();
  }
  new ResizeObserver(resize).observe(container);
  resize();
  renderer.domElement.addEventListener('pointerenter', measureCanvas);
  window.addEventListener('scroll', measureCanvas, { capture: true, passive: true });
  window.addEventListener('resize', measureCanvas, { passive: true });

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const plane = new Plane(new Vector3(0, 1, 0), -0.15);
  const hit = new Vector3();
  // The returned tile is reused; callers must consume it before the next pick.
  const pickedTile = { x: 0, z: 0 };
  function pickTile(event) {
    const rect = canvasBounds;
    pointer.set(2 * (event.clientX - rect.left) / rect.width - 1,
      1 - 2 * (event.clientY - rect.top) / rect.height);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    const x = Math.round(hit.x);
    const z = Math.round(hit.z);
    if (!inBounds(x, z)) return null;
    pickedTile.x = x;
    pickedTile.z = z;
    return pickedTile;
  }

  function render(state) {
    fill(batches.get('turret_basic'), state.turrets, 0.14, 'basic');
    fill(batches.get('turret_rail'), state.turrets, 0.14, 'rail');
    fill(batches.get('enemy_grunt'), state.enemies, 0.14, 'grunt');
    fill(batches.get('enemy_runner'), state.enemies, 0.14, 'runner');
    fill(batches.get('shot'), state.projectiles, 0);
    renderer.render(scene, camera);
    return renderer.info.render.drawCalls;
  }

  return { renderer, backend, models, pickTile, setRangePreview, render };
}
