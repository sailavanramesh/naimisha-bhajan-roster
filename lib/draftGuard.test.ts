import { describe, it, expect } from 'vitest';
import { draftSaveDecision } from './draftGuard';

const DATE = '2026-08-16';

describe('draftSaveDecision', () => {
  it('creates when the date is free', () => {
    expect(draftSaveDecision(null, DATE)).toEqual({ action: 'create' });
  });

  it('replaces an empty draft', () => {
    expect(draftSaveDecision({ status: 'Draft', slots: [] }, DATE)).toEqual({ action: 'replace' });
  });

  it('replaces a draft whose slots carry neither singer nor pitch', () => {
    const existing = { status: 'Draft' as const, slots: [{ confirmedPitch: null, singerId: null }] };
    expect(draftSaveDecision(existing, DATE)).toEqual({ action: 'replace' });
  });

  it('REFUSES when any slot has a confirmed pitch', () => {
    const existing = {
      status: 'Draft' as const,
      slots: [
        { confirmedPitch: null, singerId: null },
        { confirmedPitch: '2 Pancham / D', singerId: null },
      ],
    };
    const d = draftSaveDecision(existing, DATE);
    expect(d.action).toBe('refuse');
    expect(d.action === 'refuse' && d.reason).toContain('confirmed pitch');
  });

  it('REFUSES when any slot has a singer assigned', () => {
    const existing = {
      status: 'Draft' as const,
      slots: [{ confirmedPitch: null, singerId: 'singer-1' }],
    };
    expect(draftSaveDecision(existing, DATE).action).toBe('refuse');
  });

  it('REFUSES to replace a published session even when empty', () => {
    const existing = { status: 'Published' as const, slots: [] };
    const d = draftSaveDecision(existing, DATE);
    expect(d.action).toBe('refuse');
    expect(d.action === 'refuse' && d.reason).toContain('published');
  });

  it('names the date in every refusal, so the message is actionable', () => {
    const cases = [
      { status: 'Published' as const, slots: [] },
      { status: 'Draft' as const, slots: [{ confirmedPitch: 'x', singerId: null }] },
    ];
    for (const c of cases) {
      const d = draftSaveDecision(c, DATE);
      expect(d.action === 'refuse' && d.reason).toContain(DATE);
    }
  });

  it('counts how many slots blocked the overwrite', () => {
    const existing = {
      status: 'Draft' as const,
      slots: [
        { confirmedPitch: 'a', singerId: null },
        { confirmedPitch: 'b', singerId: null },
        { confirmedPitch: null, singerId: null },
      ],
    };
    const d = draftSaveDecision(existing, DATE);
    expect(d.action === 'refuse' && d.reason).toContain('2 slots');
  });
});
