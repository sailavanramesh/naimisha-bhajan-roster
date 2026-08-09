import { describe, it, expect } from 'vitest';
import {
  INSTRUMENTS,
  eligibilityScore,
  experienceScore,
  overdueScore,
  loadBalanceScore,
  scorePlayer,
  assignInstruments,
  OVERDUE_SATURATION_DAYS,
  type PlayerContext,
} from './instrumentScoring';

function player(over: Partial<PlayerContext> = {}): PlayerContext {
  return {
    name: over.name ?? 'P',
    listedFor: new Set(),
    playedInstruments: new Set(),
    daysSinceLastPlayed: 30,
    recentCount: 5,
    ...over,
  };
}

describe('eligibilityScore', () => {
  const withLists = new Set<string>(INSTRUMENTS);

  it('rewards being on the list', () => {
    expect(eligibilityScore(player({ listedFor: new Set(['Harmonium']) }), 'Harmonium')).toBe(1);
  });

  it('keys off the instrument name the roster actually uses', () => {
    // Eligibility is edited by admins against these exact names, so the two
    // cymbal roles are independent rows rather than a hard-coded alias.
    const p = player({ listedFor: new Set(['Cymbals (Male)']) });
    expect(eligibilityScore(p, 'Cymbals (Male)', withLists)).toBe(1);
    expect(eligibilityScore(p, 'Cymbals (Female)', withLists)).toBe(0);
  });

  it('is neutral for an instrument nobody has been listed against yet', () => {
    expect(eligibilityScore(player(), 'Newly Added Drum', withLists)).toBe(0.5);
  });

  it('does NOT exclude someone absent from the list', () => {
    // The lookup names 16 people; 33 have actually played. A filter here would
    // wrongly exclude half the people who really do this.
    expect(eligibilityScore(player(), 'Harmonium')).toBe(0);
  });
});

describe('experienceScore', () => {
  it('rewards having actually played it', () => {
    expect(experienceScore(player({ playedInstruments: new Set(['Tabla']) }), 'Tabla')).toBe(1);
    expect(experienceScore(player(), 'Tabla')).toBe(0);
  });
});

describe('overdue and load', () => {
  it('treats never-played as maximally overdue', () => {
    expect(overdueScore(player({ daysSinceLastPlayed: null }))).toBe(1);
  });

  it('saturates', () => {
    expect(overdueScore(player({ daysSinceLastPlayed: OVERDUE_SATURATION_DAYS * 3 }))).toBe(1);
    expect(overdueScore(player({ daysSinceLastPlayed: 0 }))).toBe(0);
  });

  it('favours the under-used', () => {
    expect(loadBalanceScore(player({ recentCount: 0 }), 10)).toBe(1);
    expect(loadBalanceScore(player({ recentCount: 20 }), 10)).toBe(0);
  });
});

describe('scorePlayer', () => {
  it('always gives a reason', () => {
    expect(scorePlayer(player(), 'Tabla', { groupMean: 5 }).reasons.length).toBeGreaterThan(0);
  });

  it('says when someone is not listed but has played it', () => {
    const p = player({ playedInstruments: new Set(['Tabla']) });
    expect(scorePlayer(p, 'Tabla', { groupMean: 5 }).reasons).toContain('not listed, but has played it');
  });

  it('prefers a listed player over an unlisted one, all else equal', () => {
    const listed = player({ name: 'a', listedFor: new Set(['Tabla']) });
    const not = player({ name: 'b' });
    expect(scorePlayer(listed, 'Tabla', { groupMean: 5 }).score).toBeGreaterThan(
      scorePlayer(not, 'Tabla', { groupMean: 5 }).score,
    );
  });
});

describe('assignInstruments', () => {
  const roster = () => [
    player({ name: 'Rhuben', listedFor: new Set(['Tabla', 'Harmonium', 'Tambourine']), recentCount: 20, daysSinceLastPlayed: 2 }),
    player({ name: 'Gowtem', listedFor: new Set(['Harmonium']), recentCount: 1, daysSinceLastPlayed: 200 }),
    player({ name: 'Prahalad', listedFor: new Set(['Ghanjira (small)']), recentCount: 3, daysSinceLastPlayed: 90 }),
    player({ name: 'Triveni', listedFor: new Set(['Cymbals']), recentCount: 2, daysSinceLastPlayed: 150 }),
    player({ name: 'Sriram', listedFor: new Set(['Cymbals']), recentCount: 4, daysSinceLastPlayed: 40 }),
    player({ name: 'Newcomer', recentCount: 0, daysSinceLastPlayed: null }),
    player({ name: 'Sailavan', listedFor: new Set(['Tabla', 'Tambourine']), recentCount: 9, daysSinceLastPlayed: 10 }),
  ];

  it('fills every instrument', () => {
    const { picks } = assignInstruments([...INSTRUMENTS], roster());
    expect(picks).toHaveLength(INSTRUMENTS.length);
    expect(picks.every((p) => p.player !== null)).toBe(true);
  });

  it('does not put one person on two instruments when it can avoid it', () => {
    const { picks } = assignInstruments(['Harmonium', 'Tabla', 'Tambourine'], roster());
    const names = picks.map((p) => p.player!.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('doubles up rather than leaving a gap, and says so', () => {
    const two = roster().slice(0, 2);
    const { picks, warnings } = assignInstruments(['Harmonium', 'Tabla', 'Tambourine'], two);
    expect(picks.every((p) => p.player !== null)).toBe(true);
    expect(warnings.join(' ')).toContain('somebody plays twice');
  });

  it('gives the newcomer and the long-idle a look in', () => {
    const { picks } = assignInstruments([...INSTRUMENTS], roster());
    const names = picks.map((p) => p.player!.name);
    expect(names).toContain('Newcomer');
    expect(names).toContain('Gowtem');
  });

  it('NEVER moves a pin', () => {
    const pins = new Map([['Tabla', 'Newcomer']]);
    const { picks } = assignInstruments([...INSTRUMENTS], roster(), { pins });
    const tabla = picks.find((p) => p.instrument === 'Tabla')!;
    expect(tabla.player!.name).toBe('Newcomer');
    expect(tabla.pinned).toBe(true);
    expect(tabla.reasons).toContain('Pinned by you');
  });

  it('warns about a pin naming somebody unknown', () => {
    const { warnings } = assignInstruments(['Tabla'], roster(), { pins: new Map([['Tabla', 'Nobody']]) });
    expect(warnings.join(' ')).toContain('unknown player');
  });

  it('handles an empty roster without throwing', () => {
    const { picks, warnings } = assignInstruments([...INSTRUMENTS], []);
    expect(picks.every((p) => p.player === null)).toBe(true);
    expect(warnings.join(' ')).toContain('Nobody is available');
  });

  it('is deterministic', () => {
    const a = assignInstruments([...INSTRUMENTS], roster()).picks.map((p) => p.player!.name);
    const b = assignInstruments([...INSTRUMENTS], roster()).picks.map((p) => p.player!.name);
    expect(a).toEqual(b);
  });

  it('still fills an instrument nobody is listed for', () => {
    const { picks } = assignInstruments(['Newly Added Drum'], roster(), {
      instrumentsWithLists: new Set(INSTRUMENTS),
    });
    expect(picks[0].player).not.toBeNull();
  });
});
