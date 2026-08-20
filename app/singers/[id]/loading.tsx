/**
 * What fills the page while a singer is being fetched.
 *
 * Without this the App Router streams the layout shell on its own, so a slow
 * page shows a header, an empty main and the footer sitting right underneath —
 * which reads as a broken site rather than a loading one. It is the state
 * /my-list lands in, because that route redirects here and the wait is this
 * page's queries, not the redirect.
 *
 * Shaped like the real page — a heading, the profile panels, then the list —
 * so the content settles into place rather than shoving it down.
 */
export default function Loading() {
  return (
    <div className="grid gap-4 py-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading this singer…</span>

      <div className="animate-pulse grid gap-2">
        <Bar className="h-7 w-52" />
        <Bar className="h-4 w-72" />
      </div>

      <div className="animate-pulse grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Panel key={i} className="h-28" />
        ))}
      </div>

      <div className="animate-pulse grid gap-3 lg:grid-cols-2">
        <Panel className="h-72" />
        <Panel className="h-72" />
      </div>
    </div>
  );
}

function Panel({ className }: { className?: string }) {
  return <div className={`rounded-[12px] border border-rule-surface bg-panel ${className ?? ""}`} />;
}

function Bar({ className }: { className?: string }) {
  return <div className={`rounded-[8px] bg-rule-surface ${className ?? ""}`} />;
}
