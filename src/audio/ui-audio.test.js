import assert from 'node:assert/strict';
import test from 'node:test';
import { createUIAudio } from './ui-audio.js';

function environment(t) {
  const keys = ['document', 'window', 'localStorage'];
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  t.after(() => keys.forEach((key, i) => {
    if (previous[i]) Object.defineProperty(globalThis, key, previous[i]);
    else delete globalThis[key];
  }));
  const listeners = new Map();
  const instances = [];
  const storage = new Map();
  const document = { hidden: false, addEventListener: (name, listener) => listeners.set(name, listener) };
  const parameter = () => ({
    value: 0, setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
  });
  class AudioContext {
    state = 'running'; currentTime = 0; destination = {}; notes = []; resumes = 0; suspends = 0;
    constructor() { instances.push(this); }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createOscillator() {
      const oscillator = {
        frequency: parameter(), connect() {}, disconnect() {},
        start() { oscillator.started = true; },
        stop(time) { if (time === undefined) oscillator.onended?.(); },
      };
      this.notes.push(oscillator);
      return oscillator;
    }
    async resume() { this.resumes++; this.state = 'running'; }
    async suspend() { this.suspends++; this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
  }
  Object.assign(globalThis, {
    document, window: { AudioContext },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  });
  return {
    instances, document, storage,
    visibility(hidden) { document.hidden = hidden; listeners.get('visibilitychange')(); },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('audio creates no context until an unmuted user gesture', t => {
  const env = environment(t);
  const audio = createUIAudio();
  audio.handleCombatEvent({ type: 'shot', turretType: 'basic' });
  audio.unlock();
  audio.setMuted(false);
  env.visibility(false);
  assert.equal(env.instances.length, 0);
  audio.unlock();
  assert.equal(env.instances.length, 1);
  audio.handleCombatEvent({ type: 'shot', turretType: 'basic' });
  assert.equal(env.instances[0].notes.length, 1);
});

test('combat events produce distinct shot, impact, kill, leak, clear and defeat cues', t => {
  const env = environment(t);
  const audio = createUIAudio();
  audio.setMuted(false); audio.unlock();
  const context = env.instances[0];
  const signatures = [];
  for (const event of [
    { type: 'shot', turretType: 'basic' }, { type: 'shot', turretType: 'rail' },
    { type: 'hit', killed: false }, { type: 'hit', killed: true },
    { type: 'leak' }, { type: 'wave-clear' }, { type: 'defeat' },
  ]) {
    const before = context.notes.length;
    audio.handleCombatEvent(event);
    signatures.push(context.notes.slice(before).map(note => `${note.type}:${note.frequency.value}`).join(','));
    for (const note of context.notes) note.onended?.();
  }
  assert.equal(new Set(signatures).size, 7);
  assert.ok(signatures.every(Boolean));
  const before = context.notes.length;
  audio.handleCombatEvent(null); audio.handleCombatEvent({ type: 'unknown' });
  audio.handleCombatEvent({ type: 'shot', turretType: 'unknown' });
  assert.equal(context.notes.length, before);
});

test('polyphony is bounded and important cues can replace shot voices', t => {
  const env = environment(t);
  const audio = createUIAudio();
  audio.setMuted(false); audio.unlock();
  const context = env.instances[0];
  for (let i = 0; i < 100; i++) audio.handleCombatEvent({ type: 'shot', turretType: 'basic' });
  assert.equal(context.notes.length, 12);
  audio.handleCombatEvent({ type: 'defeat' });
  assert.equal(context.notes.length, 16);
  audio.setMuted(true);
  const before = context.notes.length;
  audio.handleCombatEvent({ type: 'wave-clear' });
  assert.equal(context.notes.length, before);
});

test('visibility resumes an unlocked context and drops hidden/muted cues without backlog', async t => {
  const env = environment(t);
  const audio = createUIAudio();
  audio.setMuted(false); audio.unlock();
  const context = env.instances[0];
  audio.play('build');
  env.visibility(true); await settle();
  assert.equal(context.state, 'suspended');
  const before = context.notes.length;
  for (let i = 0; i < 50; i++) audio.handleCombatEvent({ type: 'shot', turretType: 'rail' });
  env.visibility(false); await settle();
  assert.equal(context.state, 'running');
  assert.equal(context.notes.length, before);
  audio.handleCombatEvent({ type: 'hit', killed: true });
  assert.equal(context.notes.length, before + 2);
  audio.setMuted(true); await settle();
  env.visibility(true); env.visibility(false); await settle();
  assert.equal(context.state, 'suspended');
  assert.equal(env.instances.length, 1);
});

test('a visibility reversal during pending suspend still resumes', async t => {
  const env = environment(t);
  const audio = createUIAudio();
  audio.setMuted(false); audio.unlock();
  const context = env.instances[0];
  let finishSuspend;
  context.suspend = () => new Promise(resolve => {
    finishSuspend = () => { context.state = 'suspended'; resolve(); };
  });
  env.visibility(true);
  env.visibility(false);
  finishSuspend(); await settle();
  assert.equal(context.state, 'running');
  assert.equal(context.resumes, 1);
});

test('blocked audio APIs and storage never throw or reject into gameplay', async t => {
  const env = environment(t);
  localStorage.getItem = localStorage.setItem = () => { throw Error('Storage blocked'); };
  const audio = createUIAudio();
  audio.setMuted(false); audio.unlock();
  const context = env.instances[0];
  context.createOscillator = () => { throw Error('Device unavailable'); };
  assert.doesNotThrow(() => audio.play('build'));
  context.suspend = () => Promise.reject(Error('Suspend blocked'));
  assert.doesNotThrow(() => env.visibility(true)); await settle();
  context.state = 'suspended'; context.resume = () => { throw Error('Resume blocked'); };
  assert.doesNotThrow(() => env.visibility(false)); await settle();
  window.AudioContext = class { constructor() { throw Error('Audio blocked'); } };
  assert.doesNotThrow(() => { const blocked = createUIAudio(); blocked.setMuted(false); blocked.unlock(); });
});
