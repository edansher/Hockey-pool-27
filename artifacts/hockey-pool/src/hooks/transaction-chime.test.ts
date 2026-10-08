import assert from 'node:assert/strict';
import test from 'node:test';
import { startTransactionChime } from './transaction-chime';

function audioHarness(suspended = false) {
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const listeners = new Map<string, () => void>();
  let nextTimer = 0, notes = 0, closed = 0;
  let allowed = !suspended;
  class Audio {
    state = suspended ? 'suspended' : 'running';
    currentTime = 10;
    destination = {};
    onstatechange: (() => void) | null = null;
    createOscillator() {
      notes++;
      return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
    resume() {
      if (!allowed) return new Promise<void>(() => {});
      this.state = 'running'; return Promise.resolve();
    }
    close() { closed++; this.state = 'closed'; return Promise.resolve(); }
  }
  const originals = ['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    AudioContext: Audio,
    setTimeout(callback: () => void, delay: number) {
      const id = ++nextTimer; timers.set(id, { callback, delay }); return id;
    },
    clearTimeout(id: number) { timers.delete(id); },
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    addEventListener(name: string, callback: () => void) { listeners.set(name, callback); },
    removeEventListener(name: string) { listeners.delete(name); },
  } });
  return { timers, listeners, allow: () => { allowed = true; },
    notes: () => notes, closed: () => closed,
    restore: () => originals.forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }) };
}

test('entry chime schedules 25 seconds and closes audio at its deadline', () => {
  const audio = audioHarness();
  let playing = false;
  try {
    startTransactionChime({ pendingWindowMs: 60_000,
      onStart: () => { playing = true; }, onStop: () => { playing = false; }, onBlocked() {} });
    assert.equal(audio.notes(), 50);
    assert.equal(playing, true);
    const timer = [...audio.timers.values()][0]!;
    assert.equal(timer.delay, 25_000);
    timer.callback();
    assert.equal(playing, false);
    assert.equal(audio.closed(), 1);
  } finally { audio.restore(); }
});

test('blocked autoplay waits for a tap, then plays the full 25 seconds; cancelling removes retries', async () => {
  const audio = audioHarness(true);
  let playing = false, blocked = false;
  try {
    const stop = startTransactionChime({ pendingWindowMs: 60_000,
      onStart: () => { playing = true; blocked = false; },
      onBlocked: () => { blocked = true; }, onStop: () => { playing = false; } });
    assert.equal(blocked, true);
    assert.equal(audio.notes(), 0);
    audio.allow(); audio.listeners.get('pointerdown')!();
    await Promise.resolve();
    assert.equal(playing, true);
    assert.equal(audio.notes(), 50);
    assert.equal([...audio.timers.values()][0]!.delay, 25_000);
    stop();
    assert.equal(audio.listeners.size, 0);
    assert.equal(audio.timers.size, 0);
    assert.equal(playing, false);
  } finally { audio.restore(); }
});