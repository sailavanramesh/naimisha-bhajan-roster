import { describe, it, expect } from 'vitest';
import { canBeRostered, rosterable, rosterBlockReason } from './rosterEligibility';

describe('canBeRostered', () => {
  it('accepts a singer with a voice', () => {
    expect(canBeRostered({ gender: 'Gents' })).toBe(true);
    expect(canBeRostered({ gender: 'Ladies' })).toBe(true);
  });

  it('refuses somebody with no voice recorded', () => {
    expect(canBeRostered({ gender: null })).toBe(false);
    expect(canBeRostered({ gender: undefined })).toBe(false);
    expect(canBeRostered({})).toBe(false);
  });

  it('refuses an empty string, not just null', () => {
    // A form posting "" must not read as a recorded voice.
    expect(canBeRostered({ gender: '' })).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(canBeRostered(null)).toBe(false);
    expect(canBeRostered(undefined)).toBe(false);
  });
});

describe('rosterable', () => {
  it('keeps only those with a voice, in order', () => {
    const people = [
      { name: 'Ashwin', gender: 'Gents' },
      { name: 'Gokulan', gender: null },
      { name: 'Anvita', gender: 'Ladies' },
    ];
    expect(rosterable(people).map((p) => p.name)).toEqual(['Ashwin', 'Anvita']);
  });

  it('returns an empty list rather than throwing when nobody qualifies', () => {
    expect(rosterable([{ gender: null }])).toEqual([]);
    expect(rosterable([])).toEqual([]);
  });
});

describe('rosterBlockReason', () => {
  it('names the person and says what to do', () => {
    const reason = rosterBlockReason({ name: 'Gokulan', gender: null })!;
    expect(reason).toContain('Gokulan');
    expect(reason).toContain('no voice recorded');
    expect(reason).toContain('Admin');
  });

  it('is null for somebody who can be rostered', () => {
    expect(rosterBlockReason({ name: 'Ashwin', gender: 'Gents' })).toBeNull();
  });

  it('handles a missing person without crashing', () => {
    expect(rosterBlockReason(null)).toContain('not on the list');
  });
});
