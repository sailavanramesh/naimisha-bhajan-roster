/**
 * The Shruti Ladder — the app's signature view (docs/SPEC.md §4.D).
 *
 * A vertical chromatic ladder of the 24 pitch labels. The reference pitch is
 * marked in ivory, the singer's actual or predicted pitch in kumkum. The gap
 * between them is the whole product, made visible in one glance.
 *
 * Server component: no interactivity, so no client bundle.
 *
 * `--kumkum` means "pitch deviation" and nothing else. Do not reuse it here for
 * warnings or emphasis.
 *
 * The tabla column is the drum to TUNE, from `recommendTabla` — Sa, then Ma,
 * then whatever the raga contains, against the four drums the ashram owns. It
 * used `tablaPitchOf` (Sa + 7) until 2026-08-21, which is the old rule: the
 * bare fifth, taking no account of the raga and no account of whether the
 * ashram owns that drum. It therefore named drums that do not exist and
 * disagreed with the roster grid, the live view and the printed sheet, all of
 * which moved to the prescriptive rule earlier. See CLAUDE.md rule 3.
 */

import { saOf, semitoneDelta, NOTE_NAMES } from '@/lib/pitch';
import { ragaScale } from '@/lib/ragaScales';
import { recommendTablaForLabel, ASHRAM_TABLA_PC } from '@/lib/tabla';
import { cn } from '@/components/ui';

export type LadderRung = {
  label: string;
  step: number;
  series: string;
  note: string;
  semitone: number;
};

export function ShrutiLadder({
  rungs,
  reference,
  actual,
  actualKind = 'confirmed',
  comfort,
  raga,
  className,
}: {
  rungs: readonly LadderRung[];
  reference?: string | null;
  actual?: string | null;
  actualKind?: 'confirmed' | 'predicted';
  comfort?: { low: number; high: number; centre: number } | null;
  /**
   * The raga of the bhajan this ladder is about. The tabla depends on it — a
   * raga without a Pa cannot have its tabla tuned to one — so leaving it out
   * downgrades every row to a guess rather than producing a wrong answer.
   */
  raga?: string | null;
  className?: string;
}) {
  const referenceSa = saOf(reference);
  const actualSa = saOf(actual);
  const delta = semitoneDelta(actual, reference);
  // One lookup for the whole ladder: the raga is fixed, only Sa moves per row.
  const ragaSemitones = ragaScale(raga);

  // The ladder shows one row per label. Both series are listed because
  // "1 Madhyam / F" and "4 Pancham / F" are the same Sa written two ways, and
  // the group uses whichever the source did — so BOTH are marked as the
  // reference when Sa is shared. That is correct, not a duplicate.

  const summary = buildSummary(reference, actual, delta, actualKind);

  return (
    <figure className={cn('grid gap-2', className)}>
      <figcaption className="sr-only">{summary}</figcaption>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Legend swatch="rgb(var(--ivory))" ring="rgb(var(--brass))" label="Reference" />
        <Legend swatch="rgb(var(--kumkum))" label={actualKind === 'predicted' ? 'Predicted' : 'Sung at'} />
        {delta !== null ? (
          <span
            className="font-mono tabular-nums font-semibold"
            style={{ color: delta === 0 ? 'rgb(var(--muted))' : 'rgb(var(--kumkum))' }}
          >
            {delta > 0 ? `+${delta}` : delta} {Math.abs(delta) === 1 ? 'semitone' : 'semitones'}
          </span>
        ) : null}
      </div>

      <ol className="overflow-hidden rounded-[12px] border border-rule-surface" role="list">
        {rungs.map((rung) => {
          const isReference = referenceSa !== null && rung.semitone === referenceSa;
          const isActual = actualSa !== null && rung.semitone === actualSa;
          const tabla = recommendTablaForLabel(rung.label, ragaSemitones, ASHRAM_TABLA_PC);

          return (
            <li
              key={rung.label}
              aria-current={isActual ? 'true' : undefined}
              className={cn(
                'flex items-center gap-2 border-b px-2 py-1 last:border-b-0 text-xs',
                // Deliberately NOT shading the comfort band. Measured over the
                // real history it spans 5-10 semitones for every singer, so
                // shading "inside" covered nearly every row and left the few
                // outside rows looking highlighted — emphasis on exactly the
                // wrong thing. The two rows that matter carry marks instead.
                isActual || isReference ? 'bg-panel' : 'bg-transparent',
              )}
            >
              {/* Marker gutter. Fixed width so labels stay aligned. */}
              <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                {isReference ? (
                  <span
                    aria-hidden
                    className="h-3 w-3 rounded-full border-2"
                    style={{ background: 'rgb(var(--ivory))', borderColor: 'rgb(var(--brass))' }}
                  />
                ) : null}
                {isActual ? (
                  <span
                    aria-hidden
                    className={cn('rounded-full', isReference ? 'absolute h-1.5 w-1.5' : 'h-3 w-3')}
                    style={{ background: 'rgb(var(--kumkum))' }}
                  />
                ) : null}
              </span>

              <span
                className={cn(
                  'font-mono tabular-nums',
                  isActual || isReference ? 'font-semibold' : 'text-on-surface-muted',
                )}
              >
                {rung.label}
              </span>

              <span className="ml-auto flex items-center gap-2 text-[11px] text-on-surface-muted">
                {/* "none" is an answer, not a gap: it means no drum they own
                    can be tuned to this Sa, which is a reason to sing at a
                    different one. `—` would read as missing data. */}
                <span className="font-mono tabular-nums" title={tabla.why}>
                  tabla{' '}
                  {tabla.note ?? (
                    <span className="font-sans not-italic">none</span>
                  )}
                </span>
                {isReference ? <Tag>reference</Tag> : null}
                {isActual ? (
                  <Tag style={{ background: 'rgb(var(--kumkum))', color: 'white', borderColor: 'transparent' }}>
                    {actualKind === 'predicted' ? 'predicted' : 'sung'}
                  </Tag>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      {/*
        Said once, quietly, rather than marking every row. `ragaScale` knows a
        subset of the masterlist's 236 raga names, and a good part of the
        masterlist has no raga at all, so "assumed" is the common case — a
        per-row marker would be noise on most ladders.
      */}
      <p className="text-xs text-on-surface-muted">
        {ragaSemitones
          ? 'Tabla is the drum to tune — Sa, then Ma, then whatever this raga contains, against the C, C♯, D and E the centre owns.'
          : "Tabla is the drum to tune, of the C, C♯, D and E the centre owns. This raga's notes are not recorded, so Sa, Ma and Pa were taken as present — check it against the raga before tuning to anything else."}
      </p>

      {comfort ? (
        <p className="text-xs text-on-surface-muted">
          Comfort band, p10–p90 of their historical Sa:{' '}
          <span className="font-mono tabular">
            {NOTE_NAMES[comfort.low]}–{NOTE_NAMES[comfort.high]}
          </span>
          . Not shaded on the ladder — it spans most of the octave for every
          singer, so it cannot pick anything out.
        </p>
      ) : null}
    </figure>
  );
}

function Tag({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span className="rounded-full border px-1.5 py-0.5 text-[10px] leading-none" style={style}>
      {children}
    </span>
  );
}

function Legend({ swatch, ring, label }: { swatch: string; ring?: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-on-surface-muted">
      <span
        aria-hidden
        className="h-3 w-3 rounded-full border-2"
        style={{ background: swatch, borderColor: ring ?? 'transparent' }}
      />
      {label}
    </span>
  );
}

function buildSummary(
  reference: string | null | undefined,
  actual: string | null | undefined,
  delta: number | null,
  actualKind: 'confirmed' | 'predicted',
): string {
  if (!reference && !actual) return 'Shruti ladder. No pitch information available.';
  if (!actual) return `Shruti ladder. Reference pitch ${reference}. No pitch recorded.`;
  if (!reference) return `Shruti ladder. ${actualKind === 'predicted' ? 'Predicted' : 'Sung'} at ${actual}. No reference pitch.`;
  if (delta === null) return `Shruti ladder. Reference ${reference}, ${actualKind === 'predicted' ? 'predicted' : 'sung'} ${actual}.`;
  if (delta === 0) return `Shruti ladder. Reference ${reference}, ${actualKind === 'predicted' ? 'predicted' : 'sung'} at the same pitch.`;
  const direction = delta > 0 ? 'above' : 'below';
  const n = Math.abs(delta);
  return `Shruti ladder. Reference ${reference}. ${actualKind === 'predicted' ? 'Predicted' : 'Sung'} ${actual}, ${n} ${n === 1 ? 'semitone' : 'semitones'} ${direction} the reference.`;
}
