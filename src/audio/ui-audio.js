// All sound stays in the browser layer; no audio work occurs inside engine steps.
const cues = {
  build: { notes: [440, 660] },
  reject: { notes: [180, 140] },
  start: { notes: [330, 440, 660] },
  enable: { notes: [520] },
  basic: { notes: [720], end: 260, duration: 0.065, type: 'triangle' },
  rail: { notes: [160], end: 1600, duration: 0.22, type: 'sawtooth' },
  hit: { notes: [240], end: 80, duration: 0.045, type: 'square' },
  kill: { notes: [880, 1100], duration: 0.08, priority: 1 },
  leak: { notes: [260, 130], duration: 0.18, priority: 2 },
  clear: { notes: [440, 554, 659, 880], duration: 0.2, priority: 3 },
  defeat: { notes: [330, 247, 165, 82], duration: 0.25, priority: 4 },
};
const maxVoices = 12;

export function createUIAudio() {
  let context;
  let master;
  let syncing = false;
  let muted = true;
  const voices = new Set();
  try { muted = localStorage.getItem('aegis-grid-muted') !== 'false'; } catch { /* Optional storage. */ }

  function release(voice) {
    voices.delete(voice);
    try { voice.oscillator.disconnect(); } catch { /* Already disconnected or unavailable. */ }
    try { voice.envelope.disconnect(); } catch { /* Already disconnected or unavailable. */ }
  }

  function stop(voice) {
    try { voice.oscillator.stop(); } catch { /* Already stopped or unavailable. */ }
    release(voice);
  }

  function silence() {
    for (const voice of voices) stop(voice);
  }

  // Serialize transitions: visibility can change before suspend resolves.
  // Re-read the desired state after each transition, without queuing cues.
  async function syncContext() {
    if (!context || syncing) return;
    syncing = true;
    try {
      while (context.state !== 'closed') {
        const audible = !muted && !document.hidden;
        if (audible && context.state !== 'running') await context.resume();
        else if (!audible && context.state === 'running') await context.suspend();
        else break;
        if ((!muted && !document.hidden) === audible) break;
      }
    } catch { /* Rejected resume/suspend must never interrupt gameplay. */ }
    finally { syncing = false; }
  }

  function setMuted(value) {
    muted = Boolean(value);
    try {
      if (master) master.gain.value = muted || document.hidden ? 0 : 0.08;
      if (muted) silence();
    } catch { /* Audio is optional. */ }
    try { localStorage.setItem('aegis-grid-muted', String(muted)); } catch { /* Optional storage. */ }
    void syncContext();
  }

  // Only user input calls unlock; visibility changes never create audio.
  function unlock() {
    if (muted || document.hidden) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!context) {
        const candidate = new AudioContext();
        try {
          const gain = candidate.createGain();
          gain.gain.value = 0.08;
          gain.connect(candidate.destination);
          context = candidate;
          master = gain;
        } catch {
          try { Promise.resolve(candidate.close()).catch(() => {}); } catch { /* Optional audio. */ }
          return;
        }
      }
      void syncContext();
    } catch { /* Missing or blocked AudioContext must never prevent gameplay. */ }
  }

  function play(cue) {
    try {
      // Muted, hidden and suspended cues are discarded, never replayed.
      if (muted || document.hidden || !context || context.state !== 'running') return;
      const spec = Object.hasOwn(cues, cue) ? cues[cue] : null;
      if (!spec) return;
      const duration = spec.duration ?? 0.12;
      const priority = spec.priority ?? 0;
      for (let i = 0; i < spec.notes.length; i++) {
        if (voices.size >= maxVoices) {
          let victim;
          for (const voice of voices) {
            if (voice.priority < priority && (!victim || voice.priority < victim.priority)) victim = voice;
          }
          if (!victim) break;
          stop(victim);
        }
        let oscillator;
        let envelope;
        try {
          const time = context.currentTime + i * 0.085;
          oscillator = context.createOscillator();
          envelope = context.createGain();
          oscillator.type = spec.type ?? 'sine';
          oscillator.frequency.setValueAtTime(spec.notes[i], time);
          if (spec.end) oscillator.frequency.exponentialRampToValueAtTime(spec.end, time + duration);
          envelope.gain.setValueAtTime(0, time);
          envelope.gain.linearRampToValueAtTime(0.3, time + 0.006);
          envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
          oscillator.connect(envelope);
          envelope.connect(master);
          const voice = { oscillator, envelope, priority };
          oscillator.onended = () => release(voice);
          voices.add(voice);
          oscillator.start(time);
          oscillator.stop(time + duration + 0.01);
        } catch {
          for (const voice of voices) if (voice.oscillator === oscillator) stop(voice);
          try { oscillator?.disconnect(); } catch { /* Partially constructed voice. */ }
          try { envelope?.disconnect(); } catch { /* Partially constructed voice. */ }
        }
      }
    } catch { /* An unavailable audio device must never escape into the game loop. */ }
  }

  // Engine contract: fresh step arrays in simulation order; hit.killed marks kills.
  function handleCombatEvent(event) {
    try {
      switch (event?.type) {
        case 'shot':
          if (event.turretType === 'basic' || event.turretType === 'rail') play(event.turretType);
          break;
        case 'hit': play(event.killed ? 'kill' : 'hit'); break;
        case 'leak': play('leak'); break;
        case 'wave-clear': play('clear'); break;
        case 'defeat': play('defeat'); break;
      }
    } catch { /* Ignore malformed events without affecting simulation. */ }
  }

  document.addEventListener('visibilitychange', () => {
    try {
      if (document.hidden) silence();
      if (master) master.gain.value = muted || document.hidden ? 0 : 0.08;
    } catch { /* Optional audio. */ }
    void syncContext();
  });

  return { get muted() { return muted; }, setMuted, unlock, play, handleCombatEvent };
}
