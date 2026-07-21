const CLICK_SOUND_PRESETS = {
  beep: { label: 'Beep' },
  wood: { label: 'Wood block' },
  hihat: { label: 'Hi-hat' },
  clave: { label: 'Clave' },
  rim: { label: 'Rim shot' }
};

const BELL_SOUND_PRESETS = {
  bell: { label: 'Bell' },
  chime: { label: 'Chime' },
  gong: { label: 'Gong' },
  ding: { label: 'Ding' }
};

class Metronome {
  constructor() {
    this.bpm = 120;
    this.beatsPerMeasure = 4;
    this.subdivisionsPerBeat = 1;
    this.accentDownbeat = true;
    this.accentQuarterBeats = true;
    this.clickSound = 'beep';
    this.countInSound = 'same';
    this.bellSound = 'bell';
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

  static getClickSoundPresets() {
    return CLICK_SOUND_PRESETS;
  }

  static getBellSoundPresets() {
    return BELL_SOUND_PRESETS;
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

  setClickSound(sound) {
    this.clickSound = CLICK_SOUND_PRESETS[sound] ? sound : 'beep';
  }

  setCountInSound(sound) {
    this.countInSound = sound === 'same' || CLICK_SOUND_PRESETS[sound] ? sound : 'same';
  }

  setBellSound(sound) {
    this.bellSound = BELL_SOUND_PRESETS[sound] ? sound : 'bell';
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

  _connectGain(time, peak, decay) {
    const gain = this.audioCtx.createGain();
    gain.connect(this.audioCtx.destination);
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    return gain;
  }

  _playOsc(time, frequency, peak, decay, type = 'sine') {
    const osc = this.audioCtx.createOscillator();
    const gain = this._connectGain(time, peak, decay);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + decay + 0.02);
  }

  _playNoiseBurst(time, peak, decay, filterFreq) {
    const duration = Math.max(decay, 0.04);
    const bufferSize = Math.ceil(this.audioCtx.sampleRate * duration);
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;

    const gain = this._connectGain(time, peak, decay);
    source.connect(filter);
    filter.connect(gain);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  _click(time, accent, soundKey = this.clickSound) {
    switch (soundKey) {
      case 'wood':
        this._playOsc(time, accent ? 280 : 220, accent ? 0.45 : 0.3, 0.06, 'triangle');
        break;
      case 'hihat':
        this._playNoiseBurst(time, accent ? 0.28 : 0.16, accent ? 0.04 : 0.03, accent ? 7800 : 6200);
        break;
      case 'clave':
        this._playOsc(time, accent ? 2200 : 1800, accent ? 0.32 : 0.22, 0.035, 'sine');
        break;
      case 'rim':
        this._playOsc(time, accent ? 560 : 430, accent ? 0.34 : 0.22, 0.04, 'triangle');
        this._playNoiseBurst(time, accent ? 0.08 : 0.05, 0.025, 2400);
        break;
      case 'beep':
      default:
        this._playOsc(time, accent ? 1000 : 800, accent ? 0.35 : 0.2, 0.05, 'sine');
        break;
    }
  }

  _countInClick(time, accent) {
    const sound = this.countInSound === 'same' ? this.clickSound : this.countInSound;
    this._click(time, accent, sound);
  }

  playBell() {
    if (!this.audioCtx) return;
    const time = this.audioCtx.currentTime + 0.02;

    switch (this.bellSound) {
      case 'chime':
        this._playOsc(time, 880, 0.22, 0.35, 'sine');
        this._playOsc(time + 0.12, 1175, 0.18, 0.45, 'sine');
        this._playOsc(time + 0.24, 1568, 0.14, 0.55, 'sine');
        break;
      case 'gong':
        this._playOsc(time, 110, 0.5, 1.4, 'sine');
        this._playOsc(time, 220, 0.18, 1.0, 'triangle');
        this._playNoiseBurst(time, 0.06, 0.35, 420);
        break;
      case 'ding':
        this._playOsc(time, 1568, 0.35, 0.75, 'sine');
        this._playOsc(time, 784, 0.12, 0.55, 'triangle');
        break;
      case 'bell':
      default:
        this._playOsc(time, 988, 0.28, 0.9, 'sine');
        this._playOsc(time, 1482, 0.16, 0.75, 'sine');
        this._playOsc(time, 1976, 0.08, 0.55, 'sine');
        break;
    }
  }

  /**
   * Play quarter-note count-in clicks, then return the audio time of the first session beat
   * so the running metronome can continue on the same grid without a gap.
   */
  async playCountIn(beats, onBeat) {
    await this.init();
    const bpm = this._currentBpm();
    const interval = 60 / bpm;
    const startTime = this.audioCtx.currentTime + 0.05;
    const nextBeatTime = startTime + beats * interval;

    for (let i = 0; i < beats; i++) {
      const time = startTime + i * interval;
      const accent = i === 0;
      this._countInClick(time, accent);

      if (onBeat) {
        const delay = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
        setTimeout(() => onBeat(i + 1, accent), delay);
      }
    }

    const handoffLeadSec = 0.01;
    const handoffMs = Math.max(0, (nextBeatTime - this.audioCtx.currentTime - handoffLeadSec) * 1000);
    await new Promise((resolve) => setTimeout(resolve, handoffMs));
    return nextBeatTime;
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
      // Subdivision accent only applies when clicking faster than quarters.
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

  async start(options = {}) {
    await this.init();
    if (this.running) return;
    this.running = true;
    this.tick = 0;
    const now = this.audioCtx.currentTime;
    const handoff = options.nextBeatTime;
    this.nextBeatTime = handoff != null && handoff > now
      ? handoff
      : now + 0.05;
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
