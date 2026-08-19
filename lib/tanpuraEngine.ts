/**
 * lib/tanpuraEngine.ts — the browser side of shruti playback.
 *
 * Separate from `lib/tanpura.ts` (pure maths) and from the React component
 * (presentation) because it owns something neither can: a single piece of
 * global audio state.
 *
 * ## One drone at a time, on purpose
 *
 * The play control appears beside every pitch on a page — a roster can show a
 * dozen. Two tanpuras at different Sa is not a chord, it is a mess, and on a
 * phone in a hall it is not obvious which row is making the noise. So starting
 * one drone stops any other, app-wide. `subscribe` lets every mounted control
 * see which one is sounding, so the others can show themselves as stopped
 * without each polling the engine.
 *
 * ## Why Web Audio rather than <audio>
 *
 * Two reasons. A gapless loop: `<audio loop>` has an audible seam on most
 * browsers, and a drone with a click every few seconds is worse than no drone.
 * And `playbackRate` on an `<audio>` element is resampled for speech in some
 * browsers, which mangles a sustained tone; `AudioBufferSourceNode` shifts
 * pitch and duration together, which is exactly what tuning a recording needs.
 *
 * The AudioContext is created on the first play — never at import — because
 * browsers start one in a suspended state unless a user gesture is in flight,
 * and a context built at page load stays suspended and silent.
 */

import { tanpuraVoice, type TanpuraVoice } from './tanpura';

/** Fade in. Long enough not to click, short enough to feel immediate. */
const FADE_IN_S = 0.35;
/** Fade out. Longer than the fade in: a drone should recede, not stop dead. */
const FADE_OUT_S = 0.6;

export type PlayingState = {
  /** The label currently sounding, or null when nothing is. */
  label: string | null;
  /** True while a recording is being fetched and decoded. */
  loading: boolean;
  /** Set when the recording could not be played. Cleared on the next attempt. */
  error: string | null;
};

let context: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let gain: GainNode | null = null;
let currentLabel: string | null = null;
let loadingLabel: string | null = null;
let lastError: string | null = null;

/** Decoded recordings, keyed by src. A tanpura loop is small and reused often. */
const buffers = new Map<string, AudioBuffer>();
/** In-flight decodes, so two controls asking for the same recording share one fetch. */
const pending = new Map<string, Promise<AudioBuffer>>();

const listeners = new Set<(state: PlayingState) => void>();

/**
 * The current snapshot, held as ONE object and replaced only when something
 * actually changes.
 *
 * It must be referentially stable: `useSyncExternalStore` compares the value it
 * gets from `getState` with the previous one to decide whether to re-render, so
 * a freshly built object every call means "changed" every call — React detects
 * the resulting loop and throws, taking down every page the control appears on.
 */
let snapshot: PlayingState = { label: null, loading: false, error: null };

/** Rebuild the snapshot, and tell everyone, only if some field really moved. */
function emit() {
  const next: PlayingState = {
    label: currentLabel,
    loading: loadingLabel !== null,
    error: lastError,
  };
  if (
    next.label === snapshot.label &&
    next.loading === snapshot.loading &&
    next.error === snapshot.error
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener(snapshot);
}

/**
 * Watch what is sounding. Returns an unsubscribe.
 *
 * Does NOT call the listener on subscribe: `useSyncExternalStore` reads the
 * current value through `getState` itself, and a synchronous call here would
 * have it render twice for one state.
 */
export function subscribe(listener: (state: PlayingState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getState(): PlayingState {
  return snapshot;
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  return context;
}

async function load(ctx: AudioContext, src: string): Promise<AudioBuffer> {
  const cached = buffers.get(src);
  if (cached) return cached;

  const inFlight = pending.get(src);
  if (inFlight) return inFlight;

  const job = (async () => {
    const res = await fetch(src);
    // A missing recording is the expected failure while the audio is being
    // added, so it gets a message a person can act on rather than a decode
    // error from an HTML 404 body.
    if (!res.ok) throw new Error(`No recording at ${src} (${res.status})`);
    const bytes = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(bytes);
    buffers.set(src, buffer);
    return buffer;
  })();

  pending.set(src, job);
  try {
    return await job;
  } finally {
    pending.delete(src);
  }
}

/**
 * Stop whatever is sounding.
 *
 * The node is released only after the fade has run, and `source` is cleared
 * immediately — so a play arriving mid-fade starts cleanly and the old node's
 * timer cannot then stop the new one.
 */
export function stop(): void {
  const ctx = context;
  const endingSource = source;
  const endingGain = gain;
  source = null;
  gain = null;
  currentLabel = null;

  if (ctx && endingSource && endingGain) {
    const now = ctx.currentTime;
    endingGain.gain.cancelScheduledValues(now);
    endingGain.gain.setValueAtTime(endingGain.gain.value, now);
    endingGain.gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
    try {
      endingSource.stop(now + FADE_OUT_S);
    } catch {
      // Already stopped. Nothing to undo.
    }
    endingSource.onended = () => endingSource.disconnect();
  }
  emit();
}

/**
 * Sound the shruti for `label`, replacing anything already playing.
 *
 * Playing the label that is already sounding stops it — the control is a
 * toggle, which is what a single button beside a pitch should be.
 */
export async function play(label: string): Promise<void> {
  if (currentLabel === label) {
    stop();
    return;
  }

  const voice: TanpuraVoice | null = tanpuraVoice(label);
  if (!voice) return;

  const ctx = audioContext();
  if (!ctx) {
    lastError = 'This browser cannot play audio.';
    emit();
    return;
  }

  // Safari suspends the context whenever it loses a gesture; resuming inside
  // the click keeps the gesture credit that a later resume would have lost.
  if (ctx.state === 'suspended') await ctx.resume();

  stop();
  lastError = null;
  loadingLabel = label;
  emit();

  let buffer: AudioBuffer;
  try {
    buffer = await load(ctx, voice.src);
  } catch (err) {
    // Another control may have started something while this was loading; only
    // the request still in flight gets to report its failure.
    if (loadingLabel === label) {
      loadingLabel = null;
      lastError = err instanceof Error ? err.message : 'Could not play that shruti.';
      emit();
    }
    return;
  }

  // Superseded while decoding — a second click elsewhere wins.
  if (loadingLabel !== label) return;
  loadingLabel = null;

  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.playbackRate.value = voice.playbackRate;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, ctx.currentTime);
  envelope.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_IN_S);

  node.connect(envelope).connect(ctx.destination);
  node.start();

  source = node;
  gain = envelope;
  currentLabel = label;
  emit();
}

/** Test seam: drop all state between cases. Not used by the app. */
export function __resetForTests(): void {
  source = null;
  gain = null;
  context = null;
  currentLabel = null;
  loadingLabel = null;
  lastError = null;
  snapshot = { label: null, loading: false, error: null };
  buffers.clear();
  pending.clear();
  listeners.clear();
}

/** Test seam: drive the store without a browser. Not used by the app. */
export function __setStateForTests(
  next: Partial<{ label: string | null; loading: string | null; error: string | null }>,
): void {
  if ('label' in next) currentLabel = next.label ?? null;
  if ('loading' in next) loadingLabel = next.loading ?? null;
  if ('error' in next) lastError = next.error ?? null;
  emit();
}
