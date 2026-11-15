import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { bindMovement } from './movement.js';
import { houses, watches, selectWatch } from './watches-catalog.js';
import { EscapementAudio } from './escapement-audio.js';
import { bindOptics } from './optics.js';
import './viewer.css';

const watch = selectWatch(new URLSearchParams(location.search).get('watch'));
const audio = new EscapementAudio(watch.audio);
document.title = `PATRIKS Collection — ${watch.name}`;
document.querySelector('.edition').textContent = watch.edition;
document.querySelector('#title').replaceChildren(...watch.headline.flatMap((line, i) => i ? [document.createElement('br'), document.createTextNode(` ${line}`)] : [document.createTextNode(line)]));
document.querySelector('.description').textContent = watch.description;
document.querySelector('.material-note p').textContent = watch.materialNote;
document.querySelector('#watch-specs').replaceChildren(...watch.specs.map(([label, value]) => {
  const item = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd');
  dt.textContent = label; dd.textContent = value; item.append(dt, dd); return item;
}));
document.querySelector('.camera-buttons').replaceChildren(...Object.entries(watch.camera.presets).map(([id, spec]) => {
  const button = document.createElement('button'); button.type = 'button'; button.dataset.camera = id;
  button.textContent = spec.name; button.setAttribute('aria-pressed', String(id === 'overview')); return button;
}));
const collection = document.querySelector('#collection');
for (const house of houses) {
  const section = document.createElement('section'), heading = document.createElement('h3'), note = document.createElement('p');
  heading.textContent = house.name; note.textContent = house.note; section.append(heading, note);
  for (const item of watches.filter(w => w.house === house.id)) {
    const card = document.createElement('button'); card.type = 'button'; card.disabled = item.status !== 'available';
    const tier = document.createElement('span'), title = document.createElement('strong'), status = document.createElement('small');
    tier.textContent = `${item.number} / ${item.tier}`; title.textContent = item.name;
    status.textContent = item.id === watch.id ? 'Currently on display' : item.status === 'available' ? 'Explore instrument →' : 'Reserved · not yet released';
    card.append(tier, title, status);
    card.addEventListener('click', () => { if (item.id === watch.id) collection.close(); else location.href = `?watch=${encodeURIComponent(item.id)}`; });
    section.append(card);
  }
  document.querySelector('#catalog-grid').append(section);
}
document.querySelector('#collection-open').addEventListener('click', () => { collection.showModal(); cancelAnimationFrame(frame); frame = 0; syncAudio(); });
document.querySelector('#collection-close').addEventListener('click', () => collection.close());
collection.addEventListener('close', () => { lastFrame = 0; syncAudio(); invalidate(); });

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
const movementButton = document.querySelector('#movement-toggle');
const coarse = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
studioImage.src = watch.assets.hero;
studioImage.addEventListener('error', () => showError('The studio image could not load. Please check your connection and reload.'));

let renderer, scene, camera, controls, draco, environment;
let ready = false, mode = 'model', warm = false, preset = 'overview';
let frame = 0, lastFrame = 0, renderedFrames = 0, interacting = false;
let pressureStart = 0, pressureFrames = 0, pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
let lostContext = false, disposed = false;
let movement, moving = !reducedMotion, movementSeconds = 0, glassMaterial;
let optics, night = false, loupe = false;
const loupeOffset = { x: 0, y: 0 };
const dialCenter = new THREE.Vector3(...watch.rig.fallbackCenter);
const soundButton = document.querySelector('#sound-toggle');
const lumeButton = document.querySelector('#lume-toggle');
const loupeButton = document.querySelector('#loupe-toggle');

// Read-only diagnostics for reproducible QA; never drives the product UI.
window.chronograph = { get snapshot() {
  return { ready, mode, lighting: night ? 'night' : warm ? 'gallery' : 'studio', preset, renderedFrames,
    watch: watch.id, catalogSlots: watches.length, audio: audio.snapshot, optics: optics?.snapshot, night, loupe,
    cameraZoom: camera?.zoom, polarAngle: controls?.getPolarAngle(), maxPolarAngle: controls?.maxPolarAngle,
    pixelRatio, drawCalls: renderer?.info.render.calls ?? 0,
    camera: camera?.position.toArray(), target: controls?.target.toArray(),
    distance: controls?.getDistance(), minDistance: controls?.minDistance, maxDistance: controls?.maxDistance,
    dialCenter: dialCenter.toArray(), contextLost: lostContext, moving,
    movement: movement?.snapshot,
    glass: glassMaterial && { envMapIntensity: glassMaterial.envMapIntensity, specularIntensity: glassMaterial.specularIntensity,
      opacity: glassMaterial.opacity, transmission: glassMaterial.transmission } };
} };

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function invalidate() {
  if (!frame && renderer && !disposed && !lostContext && mode === 'model' && !document.hidden && !collection.open) {
    frame = requestAnimationFrame(render);
  }
}

function render(time) {
  frame = 0;
  if (mode !== 'model' || document.hidden || lostContext || disposed || collection.open) return;
  // ProMotion displays can request 120Hz; cap GPU work at 60Hz.
  if (lastFrame && time - lastFrame < 1000 / 60 - 1) { invalidate(); return; }
  const delta = lastFrame ? (time - lastFrame) / 1000 : 1 / 60;
  lastFrame = time;
  const changed = controls.update(delta);
  if (movement && moving) {
    movementSeconds += Math.min(delta, .1);
    movement.update(new Date(), movementSeconds);
  }
  optics?.update(camera);
  renderer.render(scene, camera);
  renderedFrames++;
  if (interacting || (ready && moving)) {
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
  if (changed || (ready && moving)) invalidate();
}

function updateButtons() {
  modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  cameraButtons.forEach(button => {
    button.disabled = !ready || mode !== 'model' || lostContext;
    button.setAttribute('aria-pressed', String(button.dataset.camera === preset));
  });
  lightingButton.disabled = resetButton.disabled = !ready || mode !== 'model' || lostContext;
  movementButton.disabled = !ready || mode !== 'model' || lostContext;
  movementButton.setAttribute('aria-pressed', String(moving));
  movementButton.setAttribute('aria-label', moving ? 'Pause movement' : 'Play movement');
  document.querySelector('#movement-icon').textContent = moving ? 'Ⅱ' : '▷';
  document.querySelector('#movement-label').textContent = moving ? 'Pause' : 'Play';
  for (const button of [soundButton, lumeButton, loupeButton]) button.disabled = !ready || mode !== 'model' || lostContext;
  lumeButton.disabled ||= !watch.features.includes('lume');
  loupeButton.disabled ||= !watch.features.includes('loupe');
  soundButton.setAttribute('aria-pressed', String(audio.enabled));
  soundButton.setAttribute('aria-label', audio.enabled ? 'Turn sound off' : 'Turn sound on');
  soundButton.textContent = audio.enabled ? 'Sound on' : 'Sound off';
  lumeButton.setAttribute('aria-pressed', String(night));
  loupeButton.setAttribute('aria-pressed', String(loupe));
  document.querySelector('#loupe-guide').hidden = !loupe || mode !== 'model';
  gestureHelp.classList.toggle('loupe-active', loupe);
  document.querySelector('.experience').classList.toggle('night', night);
  syncAudio();
}

function syncAudio() { audio.setActive(ready && moving && mode === 'model' && !document.hidden && !lostContext && !collection.open && !disposed); }

function setMode(next) {
  mode = next;
  studioImage.hidden = mode !== 'image';
  host.hidden = mode !== 'model';
  gestureHelp.hidden = mode !== 'model';
  loading.hidden = ready || mode !== 'model' || lostContext;
  viewLabel.textContent = mode === 'image' ? 'STUDIO — THE ORIGINAL RENDER' : presetLabel();
  if (controls) controls.enabled = mode === 'model' && !lostContext && !loupe;
  if (mode === 'image') { cancelAnimationFrame(frame); frame = 0; }
  else { lastFrame = 0; resize(false); invalidate(); }
  updateButtons();
}

function presetLabel() {
  return loupe ? '3× OPTICAL LOUPE — DRAG TO INSPECT' : watch.camera.presets[preset]?.label ?? 'EXPLORE — YOUR PERSPECTIVE';
}

function setCamera(next) {
  if (!controls) return;
  loupe = false; camera.zoom = 1; controls.enabled = mode === 'model';
  preset = next;
  const aspect = Math.max(camera.aspect, .3);
  const fit = Math.max(watch.camera.height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
    watch.camera.width / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / aspect) * (aspect > 1 ? 1.32 : 1.15);
  const settings = watch.camera.presets[next];
  // Flush remaining damping before applying an exact preset.
  const damping = controls.enableDamping; controls.enableDamping = false; controls.update();
  controls.target.copy(dialCenter);
  camera.position.copy(dialCenter).add(new THREE.Vector3(...settings.direction).normalize()
    .multiplyScalar(THREE.MathUtils.clamp(fit * settings.scale, controls.minDistance, controls.maxDistance)));
  // Optical framing moves the image without changing the physical orbit anchor.
  const desktop = !matchMedia('(max-width: 700px), (max-width: 1100px) and (pointer: coarse)').matches;
  camera.setViewOffset(host.clientWidth, host.clientHeight, desktop ? -host.clientWidth * .025 : 0,
    host.clientHeight * settings.shift, host.clientWidth, host.clientHeight);
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
  if (refit && preset && !loupe) setCamera(preset);
  if (loupe) applyLoupe();
  invalidate();
}

function setLighting() {
  if (!scene) return;
  warm = !warm;
  night = false; applyLighting();
  document.querySelector('#lighting-label').textContent = warm ? 'Gallery' : 'Studio';
  lightingButton.setAttribute('aria-pressed', String(warm));
  lightingButton.setAttribute('aria-label', warm ? 'Switch to cool studio lighting' : 'Switch to warm gallery lighting');
  invalidate();
}

function applyLighting() {
  const profile = watch.lighting[night ? 'night' : warm ? 'gallery' : 'studio'];
  scene.environmentIntensity = profile.environment;
  scene.environmentRotation.y = profile.rotation;
  renderer.toneMappingExposure = profile.exposure;
  scene.getObjectByName('key-light').intensity = profile.key;
  scene.getObjectByName('warm-fill').intensity = profile.fill;
  optics?.night(night); updateButtons(); invalidate();
}
function applyLoupe() {
  camera.zoom = 3;
  camera.setViewOffset(host.clientWidth, host.clientHeight, loupeOffset.x * host.clientWidth, loupeOffset.y * host.clientHeight, host.clientWidth, host.clientHeight);
  camera.updateProjectionMatrix(); invalidate();
}
loupeButton.addEventListener('click', () => {
  if (loupe) setCamera('dial');
  else { setCamera('dial'); loupe = true; loupeOffset.x = 0; loupeOffset.y = .20; controls.enabled = false; applyLoupe(); }
  viewLabel.textContent = presetLabel(); updateButtons();
});
lumeButton.addEventListener('click', () => { night = !night; applyLighting(); });
soundButton.addEventListener('click', async () => {
  soundButton.disabled = true;
  try { if (audio.enabled) audio.mute(); else await audio.enable(); }
  catch { showError('Sound is unavailable in this browser. The visual movement is still available.'); }
  updateButtons();
});
let loupeDrag;
host.addEventListener('pointerdown', event => { if (loupe) { loupeDrag = { x: event.clientX, y: event.clientY }; host.setPointerCapture(event.pointerId); } });
host.addEventListener('pointermove', event => {
  if (!loupe || !loupeDrag) return;
  loupeOffset.x = THREE.MathUtils.clamp(loupeOffset.x - (event.clientX - loupeDrag.x) / host.clientWidth * 2, -1, 1);
  loupeOffset.y = THREE.MathUtils.clamp(loupeOffset.y - (event.clientY - loupeDrag.y) / host.clientHeight * 2, -1, 1);
  loupeDrag = { x: event.clientX, y: event.clientY }; applyLoupe();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) host.addEventListener(event, () => { loupeDrag = null; });

modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
cameraButtons.forEach(button => button.addEventListener('click', () => setCamera(button.dataset.camera)));
resetButton.addEventListener('click', () => setCamera('overview'));
lightingButton.addEventListener('click', setLighting);
movementButton.addEventListener('click', () => {
  moving = !moving; lastFrame = 0;
  if (moving) movement?.update(new Date(), movementSeconds);
  if (moving && audio.enabled && audio.context?.state !== 'running') audio.enable().then(syncAudio).catch(() => audio.mute());
  updateButtons(); invalidate();
});
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(frame); frame = 0; lastFrame = 0; syncAudio(); invalidate();
});
updateButtons();

try {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x10171b, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.transmissionResolutionScale = coarse ? .65 : 1;
  renderer.shadowMap.enabled = false;
  renderer.localClippingEnabled = true;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Live 3D chronograph. Drag to orbit the dial, pinch or scroll to zoom. Use camera buttons for preset views.');
  renderer.domElement.style.touchAction = 'none';
  host.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(watch.camera.fov, 1, .005, 20);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = .12;
  controls.minDistance = watch.camera.minDistance;
  controls.maxDistance = watch.camera.maxDistance;
  controls.minPolarAngle = .08;
  controls.maxPolarAngle = Math.PI * .78;
  controls.enablePan = false;
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
  scene.environmentIntensity = .72;
  scene.environmentRotation.y = THREE.MathUtils.degToRad(40);
  room.dispose(); pmrem.dispose();
  const fill = new THREE.DirectionalLight(0xffbc76, 0);
  fill.name = 'warm-fill'; fill.position.fromArray(watch.lighting.fillPosition); fill.target.position.copy(dialCenter); scene.add(fill, fill.target);
  const key = new THREE.DirectionalLight(0xd6e7ff, .85);
  key.name = 'key-light'; key.position.fromArray(watch.lighting.keyPosition); key.target.position.copy(dialCenter); scene.add(key, key.target);
  applyLighting();
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
  loader.load(watch.assets.model, gltf => {
    try {
      gltf.scene.traverse(object => {
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
          if (!material) continue;
          for (const value of Object.values(material)) if (value?.isTexture) {
            value.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
          }
        }
      });
      scene.add(gltf.scene);
      gltf.scene.updateMatrixWorld(true);
      const anchor = gltf.scene.getObjectByName(watch.rig.dialAnchor);
      if (!anchor) throw new Error('Dial anchor is missing');
      anchor.getWorldPosition(dialCenter);
      optics = bindOptics(gltf.scene, watch, dialCenter); glassMaterial = optics.glass;
      movement = watch.rig.movement ? bindMovement(gltf.scene) : null;
      movement?.update(new Date(), movementSeconds);
      ready = true; loading.hidden = true; draco.dispose();
      setCamera('overview'); updateButtons(); invalidate();
    } catch (error) {
      console.error('Chronograph rig:', error);
      draco.dispose(); showError('The moving instrument could not initialize. The studio image is available.'); setMode('image');
    }
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
  audio.setActive(false);
  if (event.persisted) return;
  disposed = true; controls?.dispose(); draco?.dispose(); environment?.dispose();
  audio.dispose();
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
window.addEventListener('pageshow', event => { if (event.persisted) { syncAudio(); invalidate(); } });
