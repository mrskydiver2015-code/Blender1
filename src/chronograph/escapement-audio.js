// A tiny deterministic pallet click, synthesized once. No downloaded audio.
export function tickSamples(sampleRate, accent = false) {
  const data = new Float32Array(Math.ceil(sampleRate * .018));
  let seed = 28800;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (1664525 * seed + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const attack = Math.min(1, t / .00035);
    data[i] = attack * (noise * .45 * Math.exp(-t * 750) +
      Math.sin(t * Math.PI * 2 * (accent ? 4700 : 3900)) * .35 * Math.exp(-t * 430));
  }
  return data;
}

export class EscapementAudio {
  constructor(profile) { this.profile = profile; this.enabled = false; this.active = false; this.sources = new Set(); this.scheduled = 0; }
  async enable() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Audio unavailable');
    if (!this.context) {
      this.context = new Audio({ latencyHint: 'interactive' });
      this.gain = this.context.createGain();
      this.gain.gain.value = this.profile.volume;
      this.gain.connect(this.context.destination);
      this.buffers = [false, true].map(accent => {
        const samples = tickSamples(this.context.sampleRate, accent);
        const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
        buffer.copyToChannel(samples, 0); return buffer;
      });
    }
    // Called only from a button gesture (including Safari).
    await this.context.resume(); this.enabled = true;
  }
  mute() { this.enabled = false; this.setActive(false); }
  setActive(wanted) {
    const active = Boolean(wanted && this.enabled && this.context?.state === 'running');
    if (active === this.active) return;
    this.active = active;
    clearInterval(this.timer);
    for (const source of this.sources) { try { source.stop(); } catch {} }
    this.sources.clear();
    if (!active) return;
    this.nextBeat = Math.ceil(Date.now() / (1000 / this.profile.beatsPerSecond));
    const schedule = () => {
      const now = Date.now() / 1000;
      const step = 1 / this.profile.beatsPerSecond;
      this.nextBeat = Math.max(this.nextBeat, Math.ceil(now / step));
      while (this.nextBeat * step < now + .075) {
        const source = this.context.createBufferSource();
        source.buffer = this.buffers[this.nextBeat % 2]; source.connect(this.gain);
        source.onended = () => { source.disconnect(); this.sources.delete(source); };
        this.sources.add(source);
        source.start(this.context.currentTime + Math.max(0, this.nextBeat * step - now));
        this.nextBeat++; this.scheduled++;
      }
    };
    schedule(); this.timer = setInterval(schedule, 25);
  }
  dispose() { this.mute(); this.context?.close(); }
  get snapshot() { return { enabled: this.enabled, active: this.active, scheduled: this.scheduled, state: this.context?.state || 'uninitialized', beatsPerSecond: this.profile.beatsPerSecond }; }
}
