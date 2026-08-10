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
 */

import { saOf, semitoneDelta, tablaPitchOf, NOTE_NAMES } from '@/lib/pitch';
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
  className,
}: {
  rungs: readonly LadderRung[];
  reference?: string | null;
  actual?: string | null;
  actualKind?: 'confirmed' | 'predicted';
  comfort?: { low: number; high: number; centre: number } | null;
  className?: string;
}) {
  const referenceSa = saOf(reference);
  const actualSa = saOf(actual);
  const delta = semitoneDelta(actual, reference);

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
                <span className="font-mono tabular-nums">tabla {tablaPitchOf(rung.label) ?? '—'}</span>
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
