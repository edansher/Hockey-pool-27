import { TRANSACTION_SOUND_DURATION_MS } from './transaction-notifications';

/** A finite chime. Suspended browser audio waits for a real user gesture. */
export function startTransactionChime(options: {
  pendingWindowMs: number;
  onStart: () => void;
  onBlocked: () => void;
  onStop: () => void;
}): () => void {
  let cancelled = false;
  let started = false;
  let context: AudioContext | null = null;
  let timer: number | undefined;
  const gesture = () => {
    if (cancelled) return;
    void context?.resume().then(begin).catch(() => { if (!cancelled) options.onBlocked(); });
  };
  const removeGestures = () => {
    document.removeEventListener('pointerdown', gesture, true);
    document.removeEventListener('keydown', gesture, true);
  };
  const stop = () => {
    cancelled = true;
    window.clearTimeout(timer);
    removeGestures();
    const current = context; context = null;
    if (current) { current.onstatechange = null; void current.close().catch(() => {}); }
    options.onStop();
  };
  const begin = () => {
    const current = context;
    if (cancelled || started || !current || current.state !== 'running') return;
    started = true;
    window.clearTimeout(timer);
    removeGestures();
    const now = current.currentTime;
    for (let second = 0; second < TRANSACTION_SOUND_DURATION_MS / 1000; second++) {
      [880, 1175].forEach((frequency, note) => {
        const at = now + second + note * 0.18;
        const oscillator = current.createOscillator();
        const gain = current.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.07, at + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
        oscillator.connect(gain); gain.connect(current.destination);
        oscillator.start(at); oscillator.stop(at + 0.45);
      });
    }
    options.onStart();
    timer = window.setTimeout(stop, TRANSACTION_SOUND_DURATION_MS);
  };
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) { options.onStop(); return stop; }
    context = new AC();
    if (context.state === 'running') begin();
    else {
      options.onBlocked();
      document.addEventListener('pointerdown', gesture, true);
      document.addEventListener('keydown', gesture, true);
      context.onstatechange = begin;
      timer = window.setTimeout(stop, options.pendingWindowMs);
      gesture();
    }
  } catch { stop(); }
  return stop;
}