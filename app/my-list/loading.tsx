/**
 * "My list" is a door: it works out whose list you mean and sends you to that
 * singer's page. Deciding takes a query, and the page it lands on takes two
 * more, so there is a real gap with nothing to show.
 *
 * This fills it with a line that says what is happening, rather than the bare
 * layout shell — which, on a page with no content of its own, looked like the
 * app had loaded nothing but its footer.
 */
export default function Loading() {
  return (
    <div className="grid gap-3 py-10 text-center" aria-busy="true" aria-live="polite">
      <p className="text-sm text-on-surface-muted">Finding your list…</p>
      <div className="mx-auto h-1 w-40 overflow-hidden rounded-full bg-rule-surface">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-brass" />
      </div>
    </div>
  );
}
