import { describe, it, expect, beforeEach } from 'vitest';
import {
  subscribe,
  getState,
  __resetForTests,
  __setStateForTests,
} from './tanpuraEngine';

/**
 * These cover the STORE half of the engine — the half React talks to. The
 * playback half needs Web Audio and a real fetch, so it is not exercised here.
 *
 * The first test is the one that matters. `useSyncExternalStore` re-renders
 * whenever `getState` returns a value that is not reference-equal to the last
 * one; a snapshot rebuilt on every call therefore loops forever, and React
 * responds by throwing — which took down every page carrying a ShrutiPlayer on
 * dev, 2026-08-20. A cheap assertion for an outage.
 */
describe('the playing-state store', () => {
  beforeEach(() => __resetForTests());

  it('returns the SAME snapshot object while nothing changes', () => {
    const a = getState();
    const b = getState();
    expect(a).toBe(b);

    __setStateForTests({ label: '2 Pancham / D' });
    const c = getState();
    expect(c).not.toBe(a);
    expect(getState()).toBe(c);
  });

  it('does not emit when a write changes nothing', () => {
    let calls = 0;
    subscribe(() => calls++);

    __setStateForTests({ label: '2 Pancham / D' });
    expect(calls).toBe(1);

    __setStateForTests({ label: '2 Pancham / D' });
    expect(calls).toBe(1);

    __setStateForTests({ label: '1 Madhyam / F' });
    expect(calls).toBe(2);
  });

  it('starts empty and reports what is sounding', () => {
    expect(getState()).toEqual({ label: null, loading: false, error: null });

    __setStateForTests({ loading: '2 Pancham / D' });
    expect(getState()).toEqual({ label: null, loading: true, error: null });

    __setStateForTests({ loading: null, label: '2 Pancham / D' });
    expect(getState()).toEqual({ label: '2 Pancham / D', loading: false, error: null });
  });

  it('does not call a new subscriber synchronously', () => {
    // useSyncExternalStore reads through getState itself; calling the listener
    // here would render twice for one state.
    let called = false;
    subscribe(() => {
      called = true;
    });
    expect(called).toBe(false);
  });

  it('stops notifying after unsubscribe', () => {
    let calls = 0;
    const off = subscribe(() => calls++);
    __setStateForTests({ label: 'A' });
    expect(calls).toBe(1);
    off();
    __setStateForTests({ label: 'B' });
    expect(calls).toBe(1);
  });

  it('carries an error and clears it', () => {
    __setStateForTests({ error: 'No recording at /audio/tanpura/madhyam-c.wav (404)' });
    expect(getState().error).toContain('404');
    __setStateForTests({ error: null });
    expect(getState().error).toBeNull();
  });
});
