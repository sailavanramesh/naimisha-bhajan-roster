/**
 * What a page looks like while its queries are still running.
 *
 * Sailavan, 2026-08-21: "sometimes the loading time for the app when opening it,
 * either on laptop or phone is a bit long. its unpredictable."
 *
 * Some of that is real work — the session page alone asks the database a dozen
 * questions — but a good part of it was that NOTHING was shown while it did.
 * Without a loading file, Next holds the whole response back until the page is
 * ready, so a slow query looks like a slow app: a blank screen, then everything
 * at once. With one, the shell — the menu, the header — arrives immediately and
 * this stands in for the page until it is there.
 *
 * The wording is the same shape as app/my-list/loading.tsx, which got here
 * first: say what is happening, in the group's own words, rather than draw a
 * grey imitation of the page.
 */
export function PageLoading({ what }: { what: string }) {
  return (
    <div className="grid gap-3 py-10 text-center" aria-busy="true" aria-live="polite">
      <p className="text-sm text-on-surface-muted">{what}</p>
      <div className="mx-auto h-1 w-40 overflow-hidden rounded-full bg-rule-surface">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-brass" />
      </div>
    </div>
  );
}
