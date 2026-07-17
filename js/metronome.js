class Metronome {
  constructor() {
    this.bpm = 80;
    this.beatsPerMeasure = 4;
    this.subdivisionsPerBeat = 1;
    this.accentDownbeat = true;
    this.accentQuarterBeats = true;
    this.tick = 0;
    this.running = false;
    this.nextBeatTime = 0;
    this.timerId = null;
    this.audioCtx = null;
    this.onBeat = null;
    this.onBpmChange = null;
    this.ramp = null;
    this._lastReportedBpm = null;
  }

  async init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }

  setBpm(bpm) {
    this.bpm = Math.max(40, Math.min(300, bpm));
    this._reportBpm(this.bpm);
  }

  setSubdivision(value) {
    const n = parseInt(value, 10);
    this.subdivisionsPerBeat = [1, 2, 3, 4].includes(n) ? n : 1;
  }

  setAccentDownbeat(enabled) {
    this.accentDownbeat = !!enabled;
  }

  setAccentQuarterBeats(enabled) {
    this.accentQuarterBeats = !!enabled;
  }

  setRamp(startBpm, endBpm, durationSec) {
    this.ramp = {
      startBpm: Math.max(40, Math.min(300, startBpm)),
      endBpm: Math.max(40, Math.min(300, endBpm)),
      durationSec: Math.max(1, durationSec),
      startAudioTime: null
    };
    this.bpm = this.ramp.startBpm;
    this._lastReportedBpm = null;
  }

  clearRamp() {
    this.ramp = null;
    this._lastReportedBpm = null;
  }

  _currentBpm() {
    if (!this.ramp || this.ramp.startAudioTime == null) {
      return this.bpm;
    }
    const elapsed = this.audioCtx.currentTime - this.ramp.startAudioTime;
    const t = Math.min(1, Math.max(0, elapsed / this.ramp.durationSec));
    const bpm = this.ramp.startBpm + (this.ramp.endBpm - this.ramp.startBpm) * t;
    return Math.max(40, Math.min(300, bpm));
  }

  _reportBpm(bpm) {
    const rounded = Math.round(bpm);
    if (rounded !== this._lastReportedBpm) {
      this._lastReportedBpm = rounded;
      if (this.onBpmChange) this.onBpmChange(rounded);
    }
  }

  _click(time, accent) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.frequency.value = accent ? 1000 : 800;
    gain.gain.setValueAtTime(accent ? 0.35 : 0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  _schedule() {
    const bpm = this._currentBpm();
    this._reportBpm(bpm);
    const beatInterval = 60 / bpm;
    const interval = beatInterval / this.subdivisionsPerBeat;

    while (this.nextBeatTime < this.audioCtx.currentTime + 0.1) {
      const beatInMeasure = Math.floor(this.tick / this.subdivisionsPerBeat) % this.beatsPerMeasure;
      const isBeatStart = this.tick % this.subdivisionsPerBeat === 0;
      const accentDownbeat = this.accentDownbeat && isBeatStart && beatInMeasure === 0;
      const accentQuarter = this.accentQuarterBeats && this.subdivisionsPerBeat > 1 && isBeatStart;
      const accent = accentDownbeat || accentQuarter;
      this._click(this.nextBeatTime, accent);

      if (this.onBeat) {
        const tickNum = this.tick;
        const isAccent = accent;
        const delay = Math.max(0, (this.nextBeatTime - this.audioCtx.currentTime) * 1000);
        setTimeout(() => {
          if (this.running) this.onBeat(tickNum, isAccent);
        }, delay);
      }

      this.nextBeatTime += interval;
      this.tick++;
    }
  }

  _tick() {
    if (!this.running) return;
    this._schedule();
    this.timerId = setTimeout(() => this._tick(), 25);
  }

  async start() {
    await this.init();
    if (this.running) return;
    this.running = true;
    this.tick = 0;
    this.nextBeatTime = this.audioCtx.currentTime + 0.05;
    if (this.ramp) {
      this.ramp.startAudioTime = this.audioCtx.currentTime;
      this._reportBpm(this.ramp.startBpm);
    }
    this._tick();
  }

  stop() {
    this.running = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  isRunning() {
    return this.running;
  }

  getRoundedBpm() {
    return Math.round(this._currentBpm());
  }
}
