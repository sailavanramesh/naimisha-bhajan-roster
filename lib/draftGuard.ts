/**
 * lib/draftGuard.ts — may a generated set overwrite what is on this date?
 *
 * Pure, so the rule that protects real history is unit-tested rather than
 * buried in a server action. The 709 historical slots carry `confirmedPitch`
 * values that exist nowhere else; nothing the generator does may destroy them.
 */

export type ExistingSession = {
  status: 'Draft' | 'Published';
  slots: { confirmedPitch: string | null; singerId: string | null }[];
} | null;

export type DraftDecision =
  | { action: 'create' }
  | { action: 'replace' }
  | { action: 'refuse'; reason: string };

export function draftSaveDecision(existing: ExistingSession, date: string): DraftDecision {
  if (!existing) return { action: 'create' };

  const withHistory = existing.slots.filter((s) => s.confirmedPitch || s.singerId).length;
  if (withHistory > 0) {
    return {
      action: 'refuse',
      reason:
        `The session on ${date} already has ${withHistory} slot${withHistory === 1 ? '' : 's'} ` +
        `with a singer or a confirmed pitch. Refusing to overwrite it — open it from the roster ` +
        `and edit it there.`,
    };
  }

  if (existing.status !== 'Draft') {
    return {
      action: 'refuse',
      reason: `A published session already exists on ${date}. Refusing to replace it.`,
    };
  }

  // An empty draft: placeholder rows from an earlier generation, safe to redo.
  return { action: 'replace' };
}
