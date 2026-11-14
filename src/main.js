import './style.css';
import { createGame, createGameLoop, turretTypes } from './engine/game.js';
import { createBattlefield } from './render/battlefield.js';
import { depth, tileAt, width } from './engine/board.js';
import { createUIAudio } from './audio/ui-audio.js';

const viewport = document.querySelector('#viewport');
const start = document.querySelector('#start');
const status = document.querySelector('#status');
const credits = document.querySelector('#credits');
const integrity = document.querySelector('#integrity');
const wave = document.querySelector('#wave');
const phase = document.querySelector('#phase');
const padSelect = document.querySelector('#build-pad');
const turretSelect = document.querySelector('#turret-type');
const build = document.querySelector('#build');
const restart = document.querySelector('#restart');
const mute = document.querySelector('#mute');
const audio = createUIAudio();
function updateMute() {
  mute.textContent = audio.muted ? 'Sound off' : 'Sound on';
  mute.setAttribute('aria-pressed', String(audio.muted));
}
updateMute();
mute.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  audio.unlock();
  audio.play('enable');
  updateMute();
});
restart.addEventListener('click', () => location.reload());
const { state, placeTurret, startWave, step } = createGame();
const combatEvents = [];
const advance = createGameLoop(dt => {
  // Preserve every fixed step's events, including several steps in one frame.
  for (const event of step(dt)) combatEvents.push(event);
});
const requestedBackend = new URLSearchParams(location.search).get('backend');

try {
  const field = await createBattlefield(viewport, requestedBackend);
  const diagnostics = {
    backend: field.backend, drawCalls: 0, peakDrawCalls: 0, frames: 0,
    fps: 0, models: field.models, game: {},
  };
  window.aegisGrid = diagnostics;
  let framesAtSample = 0;
  let lastSample = performance.now();
  let wasRunning = false;
  let previousIntegrity = state.integrity;
  let controlsKey;
  turretSelect.replaceChildren();
  for (const [type, spec] of Object.entries(turretTypes)) {
    const label = type === 'rail' ? 'Rail' : 'Basic';
    turretSelect.add(new Option(`${label} · ${spec.cost} credits · range ${spec.range}`, type));
  }
  const pads = [];
  padSelect.replaceChildren();
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      if (tileAt(x, z) !== 'pad') continue;
      const option = new Option(`Column ${x + 1}, row ${z + 1}`, String(pads.length));
      padSelect.add(option);
      pads.push({ x, z, option });
    }
  }
  const announce = (message, tone = 'info') => {
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const hoveredPad = { x: 0, z: 0 };
  const rangePreview = { x: 0, z: 0, range: 0 };
  let previewSource = null;
  function refreshRangePreview() {
    const tile = previewSource === 'pointer' ? hoveredPad :
      previewSource === 'keyboard' ? pads[Number(padSelect.value)] : null;
    if (!tile || !state.integrity || tileAt(tile.x, tile.z) !== 'pad') {
      field.setRangePreview(null);
      return;
    }
    for (const turret of state.turrets) {
      if (turret.x === tile.x && turret.z === tile.z) {
        field.setRangePreview(null);
        return;
      }
    }
    rangePreview.x = tile.x;
    rangePreview.z = tile.z;
    rangePreview.range = turretTypes[turretSelect.value].range;
    field.setRangePreview(rangePreview);
  }
  function previewKeyboardPad() {
    previewSource = 'keyboard';
    refreshRangePreview();
  }
  for (const control of [turretSelect, padSelect, build]) {
    control.addEventListener('focus', previewKeyboardPad);
    control.addEventListener('blur', event => {
      if ([turretSelect, padSelect, build].includes(event.relatedTarget)) return;
      previewSource = null;
      refreshRangePreview();
    });
  }
  padSelect.addEventListener('change', previewKeyboardPad);
  turretSelect.addEventListener('change', () => {
    updateControls();
    refreshRangePreview();
  });
  function updateControls() {
    const type = turretSelect.value;
    const cost = turretTypes[type].cost;
    const key = `${state.credits}:${state.integrity}:${state.turrets.length}:${type}`;
    if (key === controlsKey) return;
    controlsKey = key;
    for (const pad of pads) {
      const occupied = state.turrets.some(turret => turret.x === pad.x && turret.z === pad.z);
      pad.option.disabled = occupied;
      pad.option.textContent = `Column ${pad.x + 1}, row ${pad.z + 1}${occupied ? ' — occupied' : ''}`;
    }
    if (padSelect.selectedOptions[0]?.disabled) {
      padSelect.value = String(pads.findIndex(pad => !pad.option.disabled));
    }
    const available = pads.some(pad => !pad.option.disabled);
    padSelect.disabled = !state.integrity || !available;
    turretSelect.disabled = !state.integrity;
    build.disabled = !state.integrity || !available;
    build.textContent = state.credits < cost ? `Need ${cost} credits` : `Deploy turret · ${cost}`;
    refreshRangePreview();
  }
  function deploy(tile) {
    audio.unlock();
    if (!state.integrity) return;
    const count = state.turrets.length;
    const message = placeTurret(tile.x, tile.z, turretSelect.value);
    const placed = state.turrets.length > count;
    announce(placed ? `${message} ${state.credits} credits remaining.` : message, placed ? 'success' : 'warning');
    audio.play(placed ? 'build' : 'reject');
    updateControls();
  }
  build.addEventListener('click', () => {
    const pad = pads[Number(padSelect.value)];
    if (pad) deploy(pad);
  });
  updateControls();
  phase.textContent = 'Ready to defend';
  status.textContent = 'Choose a turret type, then click a blue build pad or deploy using the pad selector.';
  start.disabled = false;
  start.addEventListener('click', () => {
    audio.unlock();
    if (startWave()) {
      announce(`Wave ${state.wave} incoming. Defend the grid; building remains available.`);
      phase.textContent = `Wave ${state.wave} in progress`;
      start.disabled = true;
      wasRunning = true;
      audio.play('start');
    }
  });
  field.renderer.domElement.addEventListener('click', event => {
    const tile = field.pickTile(event);
    if (tile) deploy(tile);
  });
  field.renderer.domElement.addEventListener('pointermove', event => {
    const tile = field.pickTile(event);
    previewSource = tile ? 'pointer' : null;
    if (tile) {
      hoveredPad.x = tile.x;
      hoveredPad.z = tile.z;
    }
    refreshRangePreview();
  });
  field.renderer.domElement.addEventListener('pointerleave', () => {
    previewSource = [turretSelect, padSelect, build].includes(document.activeElement) ? 'keyboard' : null;
    refreshRangePreview();
  });

  await field.renderer.setAnimationLoop(time => {
    advance(time);
    for (const event of combatEvents) audio.handleCombatEvent(event);
    combatEvents.length = 0;
    diagnostics.drawCalls = field.render(state);
    diagnostics.peakDrawCalls = Math.max(diagnostics.peakDrawCalls, diagnostics.drawCalls);
    diagnostics.frames++;
    if (time - lastSample >= 1000) {
      diagnostics.fps = (diagnostics.frames - framesAtSample) * 1000 / (time - lastSample);
      lastSample = time;
      framesAtSample = diagnostics.frames;
    }
    diagnostics.game = {
      credits: state.credits, integrity: state.integrity, wave: state.wave, running: state.running,
      turrets: state.turrets.length, enemies: state.enemies.length, projectiles: state.projectiles.length,
    };
    if (credits.textContent !== String(state.credits)) credits.textContent = state.credits;
    if (integrity.textContent !== String(state.integrity)) integrity.textContent = state.integrity;
    if (wave.textContent !== String(state.wave)) wave.textContent = state.wave;
    start.disabled = state.running || state.integrity === 0;
    updateControls();
    if (!state.integrity && previousIntegrity > 0) {
      phase.textContent = 'Grid lost';
      announce(`Defeat on wave ${state.wave}. Integrity depleted. Choose Try again to rebuild.`, 'danger');
      restart.hidden = false;
    } else if (wasRunning && !state.running) {
      phase.textContent = 'Ready for next wave';
      announce(`Wave ${state.wave} cleared. 20 bonus credits awarded. Build defenses or start the next wave.`, 'success');
    } else if (state.integrity < previousIntegrity) {
      announce(`Grid breached. ${state.integrity} integrity remaining.`, 'warning');
    }
    previousIntegrity = state.integrity;
    wasRunning = state.running;
  });
} catch (error) {
  phase.textContent = 'Renderer unavailable';
  status.textContent = `Renderer could not start. ${error.message}`;
  restart.hidden = false;
  console.error(error);
}
