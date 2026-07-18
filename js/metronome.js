class Metronome {
  constructor() {
    this.bpm = 120;
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
    this._nudgeSchedule();
  }

  setSubdivision(value) {
    const n = parseInt(value, 10);
    const next = [1, 2, 3, 4].includes(n) ? n : 1;
    if (next === this.subdivisionsPerBeat) return;
    const prev = this.subdivisionsPerBeat;

    // Keep the quarter-note grid locked in absolute time. Remap the upcoming
    // tick onto the new subdivision lattice without pulling the next click
    // toward "now" (that phase-shifted the beat when switching densities).
    if (this.running && this.audioCtx && prev > 0) {
      const beatInterval = 60 / this._currentBpm();
      const phaseZero = this.nextBeatTime - (this.tick / prev) * beatInterval;
      this.subdivisionsPerBeat = next;

      const now = this.audioCtx.currentTime;
      const elapsedQuarters = Math.max(0, (now - phaseZero) / beatInterval);
      let nextTick = Math.ceil(elapsedQuarters * next - 1e-9);
      let nextTime = phaseZero + (nextTick / next) * beatInterval;
      if (nextTime <= now + 0.002) {
        nextTick += 1;
        nextTime = phaseZero + (nextTick / next) * beatInterval;
      }

      this.tick = nextTick;
      this.nextBeatTime = nextTime;
      return;
    }

    this.subdivisionsPerBeat = next;
  }

  setAccentDownbeat(enabled) {
    this.accentDownbeat = !!enabled;
  }

  setAccentQuarterBeats(enabled) {
    this.accentQuarterBeats = !!enabled;
  }

  /** Pull the next click sooner when live settings shrink the interval. */
  _nudgeSchedule() {
    if (!this.running || !this.audioCtx || this.ramp) return;
    const interval = (60 / this._currentBpm()) / this.subdivisionsPerBeat;
    const now = this.audioCtx.currentTime;
    if (this.nextBeatTime - now > interval) {
      this.nextBeatTime = now + Math.min(0.05, interval);
    }
  }

  setRamp(startBpm, endBpm, durationSec) {
    this.ramp = {
      startBpm: Math.max(40, Math.min(300, startBpm)),
      endBpm: Math.max(40, Math.min(300, endBpm)),
      durationSec: Math.max(1, durationSec),
      startAudioTime: null,
      elapsedBeforePause: 0
    };
    this.bpm = this.ramp.startBpm;
    this._lastReportedBpm = null;
  }

  clearRamp() {
    this.ramp = null;
    this._lastReportedBpm = null;
  }

  _rampElapsed() {
    if (!this.ramp) return 0;
    const live = this.ramp.startAudioTime != null && this.audioCtx
      ? this.audioCtx.currentTime - this.ramp.startAudioTime
      : 0;
    return Math.max(0, (this.ramp.elapsedBeforePause || 0) + live);
  }

  _currentBpm() {
    if (!this.ramp || (this.ramp.startAudioTime == null && !this.ramp.elapsedBeforePause)) {
      return this.bpm;
    }
    const elapsed = this._rampElapsed();
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
        const beatInfo = {
          isBeatStart,
          beatInMeasure,
          beat: beatInMeasure + 1,
          measure: Math.floor(Math.floor(tickNum / this.subdivisionsPerBeat) / this.beatsPerMeasure) + 1
        };
        const delay = Math.max(0, (this.nextBeatTime - this.audioCtx.currentTime) * 1000);
        setTimeout(() => {
          if (this.running) this.onBeat(tickNum, isAccent, beatInfo);
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
      this.ramp.elapsedBeforePause = 0;
      this.ramp.startAudioTime = this.audioCtx.currentTime;
      this._reportBpm(this.ramp.startBpm);
    }
    this._tick();
  }

  /** Pause clicks without resetting beat position or ramp progress. */
  pause() {
    if (!this.running) return;
    if (this.ramp && this.ramp.startAudioTime != null && this.audioCtx) {
      this.ramp.elapsedBeforePause = this._rampElapsed();
      this.ramp.startAudioTime = null;
      this.bpm = this._currentBpm();
    }
    this.running = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /** Resume after pause; keeps tick count and ramp progress. */
  async resume() {
    await this.init();
    if (this.running) return;
    this.running = true;
    this.nextBeatTime = this.audioCtx.currentTime + 0.05;
    if (this.ramp) {
      this.ramp.startAudioTime = this.audioCtx.currentTime;
      this._reportBpm(this._currentBpm());
    }
    this._tick();
  }

  stop() {
    // Freeze ramp progress so getRoundedBpm() remains accurate until clearRamp().
    if (this.ramp && this.ramp.startAudioTime != null && this.audioCtx) {
      this.ramp.elapsedBeforePause = this._rampElapsed();
      this.ramp.startAudioTime = null;
      this.bpm = this._currentBpm();
    }
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
