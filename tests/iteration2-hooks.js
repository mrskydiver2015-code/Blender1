import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

// Instrument responses only. Production sources and GLBs stay read-only.
async function transform(page, path, needle, replacement) {
  await page.route(`**/src/${path}`, async route => {
    const response = await route.fetch();
    const source = await response.text();
    expect(source.split(needle)).toHaveLength(2);
    await route.fulfill({ response, body: source.replace(needle, replacement) });
  });
}

export async function inspectGame(page) {
  await transform(page, 'engine/game.js', 'return { state, placeTurret, startWave, step };', `
    const seen = new WeakSet();
    const probe = { state, placeTurret, startWave, spawned: [], speeds: [], step(dt) {
      const before = new Map(state.enemies.map(e => [e, e.progress]));
      const events = step(dt);
      for (const e of state.enemies) {
        if (!seen.has(e)) { seen.add(e); probe.spawned.push({ wave: state.wave, type: e.type }); }
        if (state.wave === 2 && before.has(e) && e.hp > 0 && probe.speeds.length < 1000)
          probe.speeds.push({ type: e.type, speed: (e.progress - before.get(e)) / dt });
      }
      return events;
    } };
    window.__qaGame = probe;
    return probe;`);
  await transform(page, 'render/battlefield.js',
    'return { renderer, backend, models, pickTile, setRangePreview, render };',
    'window.__qaRing = rangeRing; return { renderer, backend, models, pickTile, setRangePreview, render };');
}

export async function serveProductionModels(page) {
  const manifest = JSON.parse(await readFile(new URL('../public/models/manifest.json', import.meta.url)));
  const files = new Map(await Promise.all(Object.values(manifest.models).map(async spec => [
    spec.file, await readFile(new URL(`../public/models/${spec.file}`, import.meta.url)),
  ])));
  await page.route('**/models/*.glb', route => {
    const bytes = files.get(new URL(route.request().url()).pathname.split('/').at(-1));
    return bytes ? route.fulfill({ body: bytes, contentType: 'model/gltf-binary' }) : route.continue();
  });
  return Object.fromEntries(Object.keys(manifest.models).map(id => [id, 'loaded']));
}

export async function inspectAudio(page, failure) {
  await page.addInitScript(failure => {
    const probe = window.__qaAudio = { contexts: [], starts: 0, active: 0, peak: 0, hidden: false };
    Object.defineProperty(document, 'hidden', { get: () => probe.hidden });
    Object.defineProperty(document, 'visibilityState', { get: () => probe.hidden ? 'hidden' : 'visible' });
    probe.visibility = hidden => { probe.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    class Context {
      state = 'suspended'; resumes = 0; suspends = 0; destination = {}; notes = [];
      get currentTime() { return performance.now() / 1000; }
      constructor() { if (failure === 'constructor') throw Error('QA unavailable device'); probe.contexts.push(this); }
      async resume() { this.resumes++; if (failure === 'resume') throw Error('QA blocked resume'); this.state = 'running'; }
      async suspend() { this.suspends++; this.state = 'suspended'; }
      async close() { this.state = 'closed'; }
      createGain() { if (failure === 'gain') throw Error('QA gain failure'); return { gain: param(), connect() {}, disconnect() {} }; }
      createOscillator() {
        if (failure === 'oscillator') throw Error('QA oscillator failure');
        let active = false;
        const note = { frequency: param(), connect() {}, disconnect() {},
          start(time) { note.time = time; active = true; probe.starts++; probe.active++; probe.peak = Math.max(probe.peak, probe.active); },
          stop(time) { if (time === undefined) note.finish(); },
          finish() { if (active) { active = false; probe.active--; note.onended?.(); } },
        };
        this.notes.push(note); return note;
      }
    }
    probe.finish = () => probe.contexts.forEach(c => c.notes.forEach(n => n.finish()));
    window.AudioContext = Context;
    window.webkitAudioContext = undefined;
  }, failure);
  await transform(page, 'audio/ui-audio.js',
    'return { get muted() { return muted; }, setMuted, unlock, play, handleCombatEvent };',
    'return window.__qaAudioController = { get muted() { return muted; }, setMuted, unlock, play, handleCombatEvent };');
}
