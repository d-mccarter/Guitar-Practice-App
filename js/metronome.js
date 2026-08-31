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
    this.volume = 1;
    this.masterGain = null;
    this._countInGeneration = 0;
    this._countInTimeouts = [];
    this._countInResolve = null;
    this._countInGain = null;
    /** Scheduler paused because the tab/app was backgrounded (not a user pause). */
    this._suspendedByBackground = false;
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
      this.audioCtx.addEventListener('statechange', () => {
        // iOS often moves the context to suspended/interrupted when switching apps.
        if (
          this.running
          && !this._suspendedByBackground
          && (this.audioCtx.state === 'suspended' || this.audioCtx.state === 'interrupted')
        ) {
          this.handleBackground();
        }
      });
    }
    this._ensureMasterGain();
    await this._resumeAudioCtx();
  }

  async _resumeAudioCtx() {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended' || this.audioCtx.state === 'interrupted') {
      try {
        await this.audioCtx.resume();
      } catch {
        // May require a user gesture; visibility/pointer handlers will retry.
      }
    }
  }

  /**
   * Stop the setTimeout scheduler while backgrounded. AudioContext.currentTime freezes
   * when suspended, but timers keep firing — that advances nextBeatTime into the future
   * and leaves a long silence after returning to the app.
   */
  handleBackground() {
    if (!this.running || this._suspendedByBackground) return;
    this._suspendedByBackground = true;
    if (this.ramp && this.ramp.startAudioTime != null && this.audioCtx) {
      this.ramp.elapsedBeforePause = this._rampElapsed();
      this.ramp.startAudioTime = null;
      this.bpm = this._currentBpm();
    }
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /** Resume AudioContext and resync the beat grid after returning from background. */
  async handleForeground() {
    await this._resumeAudioCtx();
    if (!this.running || !this._suspendedByBackground) {
      // Even if we weren't mid-session, unstick a suspended context (e.g. count-in).
      return;
    }
    this._suspendedByBackground = false;
    if (!this.audioCtx) return;
    this.nextBeatTime = this.audioCtx.currentTime + 0.05;
    if (this.ramp) {
      this.ramp.startAudioTime = this.audioCtx.currentTime;
      this._reportBpm(this._currentBpm());
    }
    if (!this.timerId) this._tick();
  }

  /** 0–1 linear gain applied after each click/bell envelope. */
  setVolume(volume) {
    const n = Number(volume);
    this.volume = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  _ensureMasterGain() {
    if (!this.audioCtx) return null;
    if (!this.masterGain) {
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.audioCtx.destination);
    }
    return this.masterGain;
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
    const start = Math.max(40, Math.min(300, Math.round(startBpm)));
    const end = Math.max(40, Math.min(300, Math.round(endBpm)));
    this.ramp = {
      startBpm: start,
      endBpm: end,
      durationSec: Math.max(1, durationSec),
      startAudioTime: null,
      elapsedBeforePause: 0,
      // Hold one BPM for the whole measure; updated only on measure starts.
      measureBpm: start
    };
    this.bpm = start;
    this._lastReportedBpm = null;
  }

  clearRamp() {
    this.ramp = null;
    this._lastReportedBpm = null;
  }

  _rampElapsedAt(audioTime) {
    if (!this.ramp) return 0;
    const live = this.ramp.startAudioTime != null
      ? audioTime - this.ramp.startAudioTime
      : 0;
    return Math.max(0, (this.ramp.elapsedBeforePause || 0) + live);
  }

  _rampElapsed() {
    if (!this.ramp) return 0;
    if (this.ramp.startAudioTime != null && this.audioCtx) {
      return this._rampElapsedAt(this.audioCtx.currentTime);
    }
    return Math.max(0, this.ramp.elapsedBeforePause || 0);
  }

  /** Snapshot the ramp BPM for the measure that begins at audioTime. */
  _setRampMeasureBpmAt(audioTime) {
    if (!this.ramp) return;
    const elapsed = this._rampElapsedAt(audioTime);
    const t = Math.min(1, Math.max(0, elapsed / this.ramp.durationSec));
    const bpm = this.ramp.startBpm + (this.ramp.endBpm - this.ramp.startBpm) * t;
    this.ramp.measureBpm = Math.max(40, Math.min(300, Math.round(bpm)));
    this.bpm = this.ramp.measureBpm;
  }

  _currentBpm() {
    if (this.ramp && this.ramp.measureBpm != null) {
      return this.ramp.measureBpm;
    }
    return this.bpm;
  }

  _reportBpm(bpm) {
    const rounded = Math.round(bpm);
    if (rounded !== this._lastReportedBpm) {
      this._lastReportedBpm = rounded;
      if (this.onBpmChange) this.onBpmChange(rounded);
    }
  }

  _connectGain(time, peak, decay, destination = null) {
    const gain = this.audioCtx.createGain();
    gain.connect(destination || this._ensureMasterGain());
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    return gain;
  }

  _playOsc(time, frequency, peak, decay, type = 'sine', destination = null) {
    const osc = this.audioCtx.createOscillator();
    const gain = this._connectGain(time, peak, decay, destination);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + decay + 0.02);
  }

  _playNoiseBurst(time, peak, decay, filterFreq, destination = null) {
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

    const gain = this._connectGain(time, peak, decay, destination);
    source.connect(filter);
    filter.connect(gain);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  _click(time, accent, soundKey = this.clickSound, destination = null) {
    switch (soundKey) {
      case 'wood':
        this._playOsc(time, accent ? 280 : 220, accent ? 0.45 : 0.3, 0.06, 'triangle', destination);
        break;
      case 'hihat':
        this._playNoiseBurst(time, accent ? 0.28 : 0.16, accent ? 0.04 : 0.03, accent ? 7800 : 6200, destination);
        break;
      case 'clave':
        this._playOsc(time, accent ? 2200 : 1800, accent ? 0.32 : 0.22, 0.035, 'sine', destination);
        break;
      case 'rim':
        this._playOsc(time, accent ? 560 : 430, accent ? 0.34 : 0.22, 0.04, 'triangle', destination);
        this._playNoiseBurst(time, accent ? 0.08 : 0.05, 0.025, 2400, destination);
        break;
      case 'beep':
      default:
        this._playOsc(time, accent ? 1000 : 800, accent ? 0.35 : 0.2, 0.05, 'sine', destination);
        break;
    }
  }

  _countInClick(time, accent) {
    const sound = this.countInSound === 'same' ? this.clickSound : this.countInSound;
    this._click(time, accent, sound, this._countInGain);
  }

  /** Stop an in-progress count-in; pending playCountIn() resolves to null. */
  cancelCountIn() {
    this._countInGeneration += 1;
    if (this._countInTimeouts.length) {
      this._countInTimeouts.forEach((id) => clearTimeout(id));
      this._countInTimeouts = [];
    }
    if (this._countInGain && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this._countInGain.gain.cancelScheduledValues(now);
        this._countInGain.gain.setValueAtTime(0, now);
        this._countInGain.disconnect();
      } catch (_) {
        // Audio node may already be disconnected.
      }
      this._countInGain = null;
    }
    if (this._countInResolve) {
      const resolve = this._countInResolve;
      this._countInResolve = null;
      resolve(null);
    }
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
   * Returns null if cancelCountIn() is called before the handoff.
   */
  async playCountIn(beats, onBeat) {
    await this.init();
    this.cancelCountIn();

    const generation = this._countInGeneration;
    const countInGain = this.audioCtx.createGain();
    countInGain.gain.value = 1;
    countInGain.connect(this._ensureMasterGain());
    this._countInGain = countInGain;

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
        const timeoutId = setTimeout(() => {
          if (this._countInGeneration !== generation) return;
          onBeat(i + 1, accent);
        }, delay);
        this._countInTimeouts.push(timeoutId);
      }
    }

    const handoffLeadSec = 0.01;
    const handoffMs = Math.max(0, (nextBeatTime - this.audioCtx.currentTime - handoffLeadSec) * 1000);
    const result = await new Promise((resolve) => {
      this._countInResolve = resolve;
      const timeoutId = setTimeout(() => {
        if (this._countInGeneration !== generation) return;
        this._countInResolve = null;
        resolve(nextBeatTime);
      }, handoffMs);
      this._countInTimeouts.push(timeoutId);
    });

    if (this._countInGeneration === generation) {
      this._countInTimeouts = [];
      this._countInGain = null;
      try {
        countInGain.disconnect();
      } catch (_) {
        // Already disconnected by cancelCountIn.
      }
    }

    return result;
  }

  _schedule() {
    while (this.nextBeatTime < this.audioCtx.currentTime + 0.1) {
      const ticksPerMeasure = this.subdivisionsPerBeat * this.beatsPerMeasure;
      const isMeasureStart = this.tick % ticksPerMeasure === 0;

      // Ramp tempo only changes on measure boundaries so each bar stays steady.
      if (this.ramp && isMeasureStart) {
        this._setRampMeasureBpmAt(this.nextBeatTime);
      }

      const bpm = this._currentBpm();
      this._reportBpm(bpm);
      const interval = (60 / bpm) / this.subdivisionsPerBeat;

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
    this._suspendedByBackground = false;
    this.tick = 0;
    const now = this.audioCtx.currentTime;
    const handoff = options.nextBeatTime;
    this.nextBeatTime = handoff != null && handoff > now
      ? handoff
      : now + 0.05;
    if (this.ramp) {
      this.ramp.elapsedBeforePause = 0;
      this.ramp.startAudioTime = this.audioCtx.currentTime;
      this.ramp.measureBpm = this.ramp.startBpm;
      this.bpm = this.ramp.startBpm;
      this._reportBpm(this.ramp.startBpm);
    }
    this._tick();
  }

  /** Pause clicks without resetting ramp progress (tick is preserved until resume). */
  pause() {
    if (!this.running) return;
    this._suspendedByBackground = false;
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

  /** Snap the tick counter to the start of the current measure (beat 1). */
  snapTickToMeasureStart() {
    const ticksPerMeasure = this.subdivisionsPerBeat * this.beatsPerMeasure;
    this.tick = Math.floor(this.tick / ticksPerMeasure) * ticksPerMeasure;
  }

  /** Current bar/beat (1-based) from the tick counter. */
  getMeasureBeatInfo() {
    const beatInMeasure = Math.floor(this.tick / this.subdivisionsPerBeat) % this.beatsPerMeasure;
    const measure = Math.floor(Math.floor(this.tick / this.subdivisionsPerBeat) / this.beatsPerMeasure) + 1;
    return { measure, beat: beatInMeasure + 1 };
  }

  /**
   * Resume after pause.
   * @param {{ nextBeatTime?: number, resetToMeasureStart?: boolean }} [options]
   */
  async resume(options = {}) {
    await this.init();
    if (this.running) return;
    if (options.resetToMeasureStart) {
      this.snapTickToMeasureStart();
    }
    this.running = true;
    this._suspendedByBackground = false;
    const now = this.audioCtx.currentTime;
    const handoff = options.nextBeatTime;
    this.nextBeatTime = handoff != null && handoff > now
      ? handoff
      : now + 0.05;
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
    this._suspendedByBackground = false;
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
