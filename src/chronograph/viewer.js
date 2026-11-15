import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import modelUrl from '../../artifacts/chronograph_test/chronograph_web.glb?url';
import imageUrl from '../../artifacts/chronograph_test/chronograph_hero.png?url';
import './viewer.css';

const host = document.querySelector('#canvas-host');
const studioImage = document.querySelector('#studio-image');
const loading = document.querySelector('#loading');
const loadingLabel = document.querySelector('#loading-label');
const errorMessage = document.querySelector('#viewer-error');
const viewLabel = document.querySelector('#view-label');
const gestureHelp = document.querySelector('#gesture-help');
const cameraButtons = [...document.querySelectorAll('[data-camera]')];
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const lightingButton = document.querySelector('#lighting');
const resetButton = document.querySelector('#reset');
const coarse = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
studioImage.src = imageUrl;
studioImage.addEventListener('error', () => showError('The studio image could not load. Please check your connection and reload.'));

let renderer, scene, camera, controls, draco, environment;
let ready = false, mode = 'model', warm = false, preset = 'overview';
let frame = 0, lastFrame = 0, renderedFrames = 0, interacting = false;
let pressureStart = 0, pressureFrames = 0, pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
let lostContext = false, disposed = false;

// Read-only diagnostics for reproducible QA; never drives the product UI.
window.chronograph = { get snapshot() {
  return { ready, mode, lighting: warm ? 'gallery' : 'studio', preset, renderedFrames,
    pixelRatio, drawCalls: renderer?.info.render.calls ?? 0,
    camera: camera?.position.toArray(), target: controls?.target.toArray(),
    distance: controls?.getDistance(), contextLost: lostContext };
} };

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function invalidate() {
  if (!frame && renderer && !disposed && !lostContext && mode === 'model' && !document.hidden) {
    frame = requestAnimationFrame(render);
  }
}

function render(time) {
  frame = 0;
  if (mode !== 'model' || document.hidden || lostContext || disposed) return;
  // ProMotion displays can request 120Hz; cap GPU work at 60Hz.
  if (lastFrame && time - lastFrame < 1000 / 60 - 1) { invalidate(); return; }
  const delta = lastFrame ? (time - lastFrame) / 1000 : 1 / 60;
  lastFrame = time;
  const changed = controls.update(delta);
  renderer.render(scene, camera);
  renderedFrames++;
  if (interacting) {
    pressureFrames++;
    if (!pressureStart) pressureStart = time;
    const elapsed = time - pressureStart;
    if (elapsed > 1400 && pressureFrames > 8) {
      const fps = pressureFrames * 1000 / elapsed;
      if (fps < 48 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - .25);
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(host.clientWidth, host.clientHeight, false);
      }
      pressureStart = time; pressureFrames = 0;
    }
  }
  if (changed) invalidate();
}

function updateButtons() {
  modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  cameraButtons.forEach(button => {
    button.disabled = !ready || mode !== 'model' || lostContext;
    button.setAttribute('aria-pressed', String(button.dataset.camera === preset));
  });
  lightingButton.disabled = resetButton.disabled = !ready || mode !== 'model' || lostContext;
}

function setMode(next) {
  mode = next;
  studioImage.hidden = mode !== 'image';
  host.hidden = mode !== 'model';
  gestureHelp.hidden = mode !== 'model';
  loading.hidden = ready || mode !== 'model' || lostContext;
  viewLabel.textContent = mode === 'image' ? 'STUDIO — THE ORIGINAL RENDER' : presetLabel();
  if (controls) controls.enabled = mode === 'model' && !lostContext;
  if (mode === 'image') { cancelAnimationFrame(frame); frame = 0; }
  else { lastFrame = 0; resize(false); invalidate(); }
  updateButtons();
}

function presetLabel() {
  return { overview: '01 — THREE-QUARTER', dial: '02 — THE DIAL', movement: '03 — THE MOVEMENT' }[preset] ?? 'EXPLORE — YOUR PERSPECTIVE';
}

function setCamera(next) {
  if (!controls) return;
  preset = next;
  const aspect = Math.max(camera.aspect, .3);
  const fit = Math.max(.334 / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
    .46 / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / aspect) * (aspect > 1 ? 1.32 : 1.15);
  const settings = {
    overview: { target: [0, .17, 0], direction: [.36, .24, .88], distance: fit },
    dial: { target: [0, .204, .026], direction: [.04, .23, 1], distance: fit * .76 },
    movement: { target: [0, .153, .032], direction: [.08, .22, 1], distance: fit * .38 },
  }[next];
  // Flush remaining damping before applying an exact preset.
  const damping = controls.enableDamping; controls.enableDamping = false; controls.update();
  controls.target.fromArray(settings.target);
  camera.position.copy(controls.target).add(new THREE.Vector3(...settings.direction).normalize().multiplyScalar(settings.distance));
  controls.update(); controls.enableDamping = damping;
  viewLabel.textContent = presetLabel(); updateButtons(); invalidate();
}

function resize(refit = true) {
  if (!renderer || !host.clientWidth || !host.clientHeight) return;
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  pixelRatio = Math.min(pixelRatio, window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  if (refit && preset) setCamera(preset);
  invalidate();
}

function setLighting() {
  if (!scene) return;
  warm = !warm;
  scene.environmentIntensity = warm ? .65 : .85;
  scene.environmentRotation.set(0, warm ? 1.9 : .35, 0);
  renderer.toneMappingExposure = warm ? .94 : 1.08;
  scene.getObjectByName('warm-fill').intensity = warm ? 2 : 0;
  document.querySelector('#lighting-label').textContent = warm ? 'Gallery' : 'Studio';
  lightingButton.setAttribute('aria-pressed', String(warm));
  lightingButton.setAttribute('aria-label', warm ? 'Switch to cool studio lighting' : 'Switch to warm gallery lighting');
  invalidate();
}

modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
cameraButtons.forEach(button => button.addEventListener('click', () => setCamera(button.dataset.camera)));
resetButton.addEventListener('click', () => setCamera('overview'));
lightingButton.addEventListener('click', setLighting);
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(frame); frame = 0; lastFrame = 0; invalidate();
});
updateButtons();

try {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !coarse, powerPreference: 'low-power' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x10171b, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.transmissionResolutionScale = coarse ? .65 : 1;
  renderer.shadowMap.enabled = false;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '3D chronograph. Drag to rotate, pinch or scroll to zoom. Arrow keys pan. Use camera buttons for preset views.');
  renderer.domElement.style.touchAction = 'none';
  host.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, .005, 20);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = .12;
  controls.minDistance = .12;
  controls.maxDistance = 2.6;
  controls.maxPolarAngle = Math.PI * .87;
  controls.screenSpacePanning = true;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .7;
  controls.panSpeed = .7;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.listenToKeyEvents(renderer.domElement);
  controls.addEventListener('change', invalidate);
  controls.addEventListener('start', () => {
    interacting = true; pressureStart = 0; pressureFrames = 0;
    preset = null; viewLabel.textContent = presetLabel(); updateButtons();
  });
  controls.addEventListener('end', () => { interacting = false; });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .85;
  scene.environmentRotation.y = .35;
  room.dispose(); pmrem.dispose();
  const fill = new THREE.DirectionalLight(0xffbc76, 0);
  fill.name = 'warm-fill'; fill.position.set(-.5, .6, 1); scene.add(fill);
  new ResizeObserver(() => resize()).observe(host);
  resize(); setCamera('overview');
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lostContext = true; cancelAnimationFrame(frame); frame = 0;
    showError('The 3D view was paused by your device. The studio image remains available.');
    setMode('image');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    lostContext = false; errorMessage.hidden = true; updateButtons(); invalidate();
  });
  draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`).setDecoderConfig({ type: 'wasm' });
  draco.setWorkerLimit(coarse ? 1 : 2);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  loader.load(modelUrl, gltf => {
    // Touch devices use a thin transparent optical layer instead of a second
    // full-scene transmission pass. Geometry and the source GLB stay intact.
    if (coarse) gltf.scene.traverse(object => {
      if (object.material?.transmission > 0) {
        object.material.transmission = 0;
        object.material.transparent = true;
        object.material.opacity = .10;
        object.material.depthWrite = false;
        object.material.needsUpdate = true;
      }
    });
    scene.add(gltf.scene); ready = true; loading.hidden = true; draco.dispose();
    updateButtons(); invalidate();
  }, progress => {
    loadingLabel.textContent = progress.total
      ? `Loading instrument · ${Math.round(progress.loaded / progress.total * 100)}%`
      : 'Loading your instrument…';
  }, () => {
    loading.hidden = true; draco.dispose();
    showError('The 3D instrument could not load. Enjoy the studio image, or reload to try again.');
    setMode('image');
  });
} catch (error) {
  console.warn('Chronograph 3D unavailable:', error.message);
  showError('Interactive 3D is unavailable on this device. You can still explore the studio image.');
  setMode('image');
}

window.addEventListener('pagehide', event => {
  cancelAnimationFrame(frame); frame = 0;
  if (event.persisted) return;
  disposed = true; controls?.dispose(); draco?.dispose(); environment?.dispose();
  scene?.traverse(object => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
  renderer?.dispose();
});
window.addEventListener('pageshow', event => { if (event.persisted) invalidate(); });
