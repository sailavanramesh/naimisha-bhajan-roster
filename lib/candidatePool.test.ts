import { describe, it, expect } from 'vitest';
import { selectCandidates, UNSPECIFIED, type PoolRow } from './candidatePool';

/**
 * "Missing is not excluded" (CLAUDE.md), which is the rule most easily broken
 * by a well-meaning tidy-up of the filters. A third of the masterlist has no
 * tempo and nearly a third no level, so a filter that quietly drops blanks
 * makes a thousand bhajans unreachable.
 *
 * `selectCandidates` is the whole of that logic, lifted out of the query so it
 * can be checked without a database.
 */
const row = (over: Partial<PoolRow> = {}): PoolRow => ({
  id: over.id ?? 'b1',
  title: over.title ?? 'Some Bhajan',
  deities: [],
  raga: null,
  language: 'Sanskrit / Hindi',
  tempo: 'Medium',
  level: 'Easy',
  beat: '8 Beat / Keherwa / Adi',
  hasLyrics: true,
  hasAudio: true,
  hasReference: true,
  timesSung: 0,
  lastSung: null,
  ...over,
});

const ASOF = new Date('2026-08-21T00:00:00.000Z');
const ids = (rows: PoolRow[], filters: Parameters<typeof selectCandidates>[1]) =>
  selectCandidates(rows, filters, ASOF).map((c) => c.id);

describe('missing is not excluded', () => {
  const blanks = [
    row({ id: 'no-tempo', tempo: null }),
    row({ id: 'blank-tempo', tempo: '   ' }),
    row({ id: 'has-tempo', tempo: 'Medium' }),
  ];

  it('keeps bhajans with no value when the facet is unset', () => {
    expect(ids(blanks, {})).toEqual(['no-tempo', 'blank-tempo', 'has-tempo']);
  });

  it('drops them only when a value IS chosen', () => {
    expect(ids(blanks, { tempos: ['Medium'] })).toEqual(['has-tempo']);
  });

  it('reaches them through `unspecified`, blank or null alike', () => {
    expect(ids(blanks, { tempos: [UNSPECIFIED] })).toEqual(['no-tempo', 'blank-tempo']);
  });

  it('matches a chosen value case-insensitively', () => {
    expect(ids(blanks, { tempos: ['medium'] })).toEqual(['has-tempo']);
  });

  /*
   * The ROW's value is trimmed before comparing; the SELECTED one is not. That
   * is fine as it stands — selections come from the facet list, which is built
   * from trimmed values — but it is asymmetric, so it is written down rather
   * than left for somebody to discover from a filter that matches nothing.
   */
  it('does not trim the selected value, only the row\'s', () => {
    expect(ids(blanks, { tempos: ['  medium  '] })).toEqual([]);
  });
});

describe('deities', () => {
  const rows = [
    row({ id: 'ganesha', deities: ['Ganesha'] }),
    row({ id: 'sai', deities: ['Sai'] }),
    row({ id: 'both', deities: ['Ganesha', 'Sai'] }),
    row({ id: 'none', deities: [] }),
  ];

  it('matches any one of a multi-deity bhajan', () => {
    expect(ids(rows, { deities: ['Sai'] })).toEqual(['sai', 'both']);
  });

  it('reaches the undeified ones through `unspecified`', () => {
    expect(ids(rows, { deities: [UNSPECIFIED] })).toEqual(['none']);
  });

  it('excludes on ANY match, which is what makes "not Ganesha" mean it', () => {
    expect(ids(rows, { excludeDeities: ['Ganesha'] })).toEqual(['sai', 'none']);
  });
});

describe('sung before', () => {
  const rows = [row({ id: 'known', timesSung: 3 }), row({ id: 'new', timesSung: 0 })];

  it('any keeps both', () => expect(ids(rows, { sungBefore: 'any' })).toEqual(['known', 'new']));
  it('known keeps the sung one', () => expect(ids(rows, { sungBefore: 'known' })).toEqual(['known']));
  it('new keeps the unsung one', () => expect(ids(rows, { sungBefore: 'new' })).toEqual(['new']));
});

describe('repertoire', () => {
  const rows = [row({ id: 'a' }), row({ id: 'b' })];

  it('does not filter at all unless singers are named (SPEC §9.3)', () => {
    expect(selectCandidates(rows, {}, ASOF, new Set(['a'])).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('filters once they are', () => {
    expect(
      selectCandidates(rows, { repertoireOf: ['Ashwin'] }, ASOF, new Set(['a'])).map((c) => c.id),
    ).toEqual(['a']);
  });
});

describe('lastSungDaysAgo is measured against the session, not against now', () => {
  it('counts back from asOf', () => {
    const [c] = selectCandidates(
      [row({ lastSung: new Date('2026-08-01T00:00:00.000Z') })],
      {},
      ASOF,
    );
    expect(c.lastSungDaysAgo).toBe(20);
  });

  it('never goes negative for a bhajan sung after the session date', () => {
    const [c] = selectCandidates(
      [row({ lastSung: new Date('2026-09-01T00:00:00.000Z') })],
      {},
      ASOF,
    );
    expect(c.lastSungDaysAgo).toBe(0);
  });

  it('is null for one never sung, which is not the same as long ago', () => {
    expect(selectCandidates([row({ lastSung: null })], {}, ASOF)[0].lastSungDaysAgo).toBeNull();
  });
});

describe('the require- flags', () => {
  const rows = [
    row({ id: 'full' }),
    row({ id: 'no-lyrics', hasLyrics: false }),
    row({ id: 'no-audio', hasAudio: false }),
    row({ id: 'no-ref', hasReference: false }),
  ];

  it('each drops only what it names', () => {
    expect(ids(rows, { requireLyrics: true })).toEqual(['full', 'no-audio', 'no-ref']);
    expect(ids(rows, { requireAudio: true })).toEqual(['full', 'no-lyrics', 'no-ref']);
    expect(ids(rows, { requireReference: true })).toEqual(['full', 'no-lyrics', 'no-audio']);
  });

  it('and off by default, so nothing is required without asking', () => {
    expect(ids(rows, {})).toHaveLength(4);
  });
});
