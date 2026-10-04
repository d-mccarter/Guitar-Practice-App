/**
 * Node test for iOS AudioContext foreground recovery (mocked Web Audio).
 * Run: node scripts/test-audio-resume.mjs
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

function createMockAudioContext({ mode = 'normal' } = {}) {
  let state = 'running';
  let currentTime = 1;
  let closed = false;
  let zombie = mode === 'zombie';
  let advanceTimer = null;

  const startAdvancing = () => {
    if (advanceTimer || zombie || closed) return;
    advanceTimer = setInterval(() => {
      currentTime += 0.05;
    }, 20);
  };

  const stopAdvancing = () => {
    if (!advanceTimer) return;
    clearInterval(advanceTimer);
    advanceTimer = null;
  };

  const ctx = {
    get state() {
      return state;
    },
    get currentTime() {
      return currentTime;
    },
    destination: {},
    addEventListener() {},
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          cancelScheduledValues() {},
          exponentialRampToValueAtTime() {}
        },
        connect() {},
        disconnect() {}
      };
    },
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime() {} },
        connect() {},
        start() {},
        stop() {}
      };
    },
    createBuffer() {
      return { getChannelData: () => new Float32Array(8) };
    },
    createBufferSource() {
      return { buffer: null, connect() {}, start() {}, stop() {} };
    },
    createBiquadFilter() {
      return { type: 'bandpass', frequency: { value: 0 }, Q: { value: 0 }, connect() {} };
    },
    async resume() {
      if (closed) throw new Error('InvalidStateError');
      if (mode === 'hang-resume') return new Promise(() => {});
      state = 'running';
      if (mode === 'zombie-fixable') zombie = false;
      startAdvancing();
    },
    async suspend() {
      if (closed) throw new Error('InvalidStateError');
      state = 'suspended';
      stopAdvancing();
      if (mode === 'zombie-fixable') zombie = false;
    },
    close() {
      closed = true;
      state = 'closed';
      stopAdvancing();
    },
    _suspendNow() {
      state = 'suspended';
      stopAdvancing();
    }
  };

  if (mode === 'suspended' || mode === 'hang-resume') {
    state = 'suspended';
  } else if (mode === 'zombie') {
    state = 'running';
    zombie = true;
  } else {
    startAdvancing();
  }

  return ctx;
}

function loadMetronomeWithAC(AudioContextFactory) {
  const code = readFileSync(new URL('../js/metronome.js', import.meta.url), 'utf8');
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance,
    window: { AudioContext: AudioContextFactory },
    Error
  };
  vm.createContext(sandbox);
  vm.runInContext(`${code}\nthis.Metronome = Metronome;`, sandbox);
  return sandbox.Metronome;
}

async function test(name, fn) {
  await fn();
  console.log('ok -', name);
}

await test('background pauses scheduler and foreground resyncs', async () => {
  const Metronome = loadMetronomeWithAC(function () {
    return createMockAudioContext({ mode: 'normal' });
  });
  const m = new Metronome();
  await m.start();
  assert.equal(m.isRunning(), true);
  assert.ok(m.timerId);

  m.handleBackground();
  assert.equal(m._suspendedByBackground, true);
  assert.equal(m.timerId, null);

  await m.handleForeground();
  assert.equal(m._suspendedByBackground, false);
  assert.ok(m.timerId);
  assert.ok(m.nextBeatTime > m.audioCtx.currentTime);

  m.stop();
  m.audioCtx.close();
});

await test('hung resume() times out instead of hanging forever', async () => {
  const Metronome = loadMetronomeWithAC(function () {
    return createMockAudioContext({ mode: 'hang-resume' });
  });
  const m = new Metronome();
  // Manually start on a hanging context without going through init recreate loops
  m._createAudioCtx();
  m.running = true;
  m._suspendedByBackground = true;

  const started = Date.now();
  await m.handleForeground();
  assert.ok(Date.now() - started < 3000, 'foreground recovery should time out');
  assert.equal(m._suspendedByBackground, true);

  m.stop();
  m.audioCtx.close();
});

await test('zombie running context is recreated on user gesture', async () => {
  let created = 0;
  const Metronome = loadMetronomeWithAC(function () {
    created += 1;
    // First context is zombie; later recreations are healthy.
    return createMockAudioContext({ mode: created === 1 ? 'zombie' : 'normal' });
  });
  const m = new Metronome();
  m._createAudioCtx();
  m.running = true;
  m._suspendedByBackground = true;
  m.nextBeatTime = 99;
  const before = m.audioCtx;

  await m.handleForeground(); // visibility-only: no recreate
  assert.equal(m.audioCtx, before);
  assert.equal(m._suspendedByBackground, true);

  await m.handleForeground({ fromUserGesture: true });
  assert.notEqual(m.audioCtx, before);
  assert.equal(m._suspendedByBackground, false);
  assert.ok(m.timerId);

  m.stop();
  m.audioCtx.close();
});

await test('gesture recovery after failed visibility recovery restarts clicks', async () => {
  let created = 0;
  const Metronome = loadMetronomeWithAC(function () {
    created += 1;
    return createMockAudioContext({ mode: created === 1 ? 'zombie' : 'normal' });
  });
  const m = new Metronome();
  m._createAudioCtx();
  m.running = true;
  m.handleBackground();
  assert.equal(m.timerId, null);

  await m.handleForeground({ fromUserGesture: true });
  assert.equal(m._suspendedByBackground, false);
  assert.ok(m.timerId);

  m.stop();
  m.audioCtx.close();
});

console.log('\nAll audio resume tests passed.');
