/**
 * The shipped shape templates (docs/SPEC.md §4.B).
 *
 * Templates are DATA, not code. These are only the starting set — they are
 * inserted once by `npm run db:templates` and are editable afterwards. The
 * seeder never overwrites an existing template, so a coordinator's edits are
 * safe from a re-run.
 *
 * Every slot rule here is `soft`, per SPEC §9.1: the Ganesha opener and the Sai
 * closer are strong habits, not rules. The one hard constraint in the set is
 * Festival's single deity, which is the entire point of festival mode.
 */

import type { TemplateSpec } from './sessionBuilder';

export type DefaultTemplate = TemplateSpec & {
  description: string;
  isDefault: boolean;
};

const SLOW_TO_MEDIUM = ['Slow', 'Medium Slow', 'Medium'];

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Weekday (3)',
    description:
      'The everyday session. Three bhajans, opening with Ganesha by habit and closing on Sai.',
    defaultLength: 3,
    isDefault: true,
    rules: [
      { position: 1, strength: 'soft', deity: 'Ganesha', tempoIn: SLOW_TO_MEDIUM, note: 'Ganesha opener — 140 of 188 sessions' },
      { position: 2, strength: 'soft', tempoIn: ['Slow', 'Medium Slow'], note: 'The set builds; it does not start fast' },
      { position: -1, strength: 'soft', deity: 'Sai', note: 'Closing slots skew Sai' },
    ],
  },
  {
    name: 'Standard',
    description:
      'The longer Sunday shape. Opens on Ganesha, builds through the middle, closes on Sai.',
    defaultLength: 10,
    isDefault: false,
    rules: [
      { position: 1, strength: 'soft', deity: 'Ganesha', tempoIn: SLOW_TO_MEDIUM, note: 'Ganesha opener' },
      { position: 2, strength: 'soft', tempoIn: ['Slow', 'Medium Slow'], note: 'Slow second' },
      { position: -2, strength: 'soft', tempoIn: ['Medium Fast', 'Fast'], note: 'Lift before the close' },
      { position: -1, strength: 'soft', deity: 'Sai', note: 'Sai closer' },
    ],
  },
  {
    name: 'Festival (Shiva)',
    description:
      'Every slot constrained to one deity. Copy it and change the deity for another festival.',
    defaultLength: 5,
    isDefault: false,
    singleDeity: 'Shiva',
    rules: [
      { position: 2, strength: 'soft', tempoIn: ['Slow', 'Medium Slow'], note: 'Settle early' },
      { position: -2, strength: 'soft', tempoIn: ['Medium Fast', 'Fast'], note: 'Lift before the close' },
    ],
  },
];
