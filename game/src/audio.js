// A tiny WebAudio synth for SANDLINE: every sound is an oscillator or a
// burst of filtered noise, so the game ships no audio files and loads
// nothing over the network. The mixer is created lazily on the first user
// gesture, which is also when the browser allows audio to start.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    } catch {
      this.enabled = false;
    }
  }

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, filterFreq, vol, type = 'lowpass') {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  shot(weaponId) {
    if (weaponId === 'rifle') this._noise(0.09, 900, 0.9);
    else if (weaponId === 'smg') this._noise(0.06, 1400, 0.6);
    else this._noise(0.08, 700, 0.8);
    this._tone(weaponId === 'pistol' ? 140 : 180, 0.07, 'square', 0.25, 60);
  }

  dryFire() {
    this._tone(900, 0.03, 'square', 0.15);
  }

  reload() {
    this._tone(500, 0.05, 'square', 0.2);
    setTimeout(() => this._tone(700, 0.05, 'square', 0.2), 180);
  }

  hit(head) {
    this._tone(head ? 1250 : 950, 0.06, 'sine', 0.4);
  }

  hurt() {
    this._tone(160, 0.18, 'sawtooth', 0.35, 70);
  }

  grenadeThrow() {
    this._noise(0.15, 500, 0.3);
  }

  explosion() {
    this._noise(0.9, 220, 1.0);
    this._tone(70, 0.8, 'sine', 0.7, 30);
  }

  plantBeep() {
    this._tone(880, 0.08, 'sine', 0.35);
  }

  defuseBeep() {
    this._tone(660, 0.08, 'sine', 0.35);
  }

  roundWin() {
    this._tone(523, 0.16, 'sine', 0.35);
    setTimeout(() => this._tone(659, 0.16, 'sine', 0.35), 140);
    setTimeout(() => this._tone(784, 0.3, 'sine', 0.4), 280);
  }

  roundLose() {
    this._tone(392, 0.2, 'sine', 0.35);
    setTimeout(() => this._tone(311, 0.35, 'sine', 0.4), 180);
  }

  buy() {
    this._tone(1040, 0.06, 'sine', 0.3);
    setTimeout(() => this._tone(1318, 0.08, 'sine', 0.3), 70);
  }

  click() {
    this._tone(800, 0.04, 'sine', 0.25);
  }
}
