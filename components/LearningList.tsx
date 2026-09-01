import Link from "next/link";
import { learningListFor } from "@/lib/learningList";
import { LearningListView } from "@/components/LearningListView";
import { AddToListForm } from "@/components/AddToListForm";

/**
 * components/LearningList.tsx — one person's bhajans: wanted, learning, known.
 *
 * A thin server component now: it fetches (lib/learningList.ts) and hands over
 * to a client view (components/LearningListView.tsx) that does the searching and
 * filtering in the browser. It used to be the whole thing — fetch, three
 * accordions, and every card's forms — and that shape is what made the list hard
 * to get around once it held ninety entries. See the view for the reasoning.
 *
 * TWO SURFACES, ONE COMPONENT. /my-list renders it as a page of its own with
 * `mine`; a singer's page renders it underneath their profile and history. That
 * is the whole reason it is a component rather than a page: Sailavan, 2026-08-12,
 * "combine singers and my list in a nice logical way" — a singer's list is part
 * of the singer. What changed on 2026-09-01 is only that your OWN list stopped
 * being reachable exclusively through your own singer page, which put it below a
 * pitch profile and fifty rows of history every time you wanted it.
 *
 * `canEdit` is what separates reading somebody's list from keeping your own. The
 * forms are simply absent without it — a member looking at another singer's page
 * sees what they sing and cannot touch it. app/my-list/actions.ts decides again
 * on the way in, because hiding a button is not a permission.
 *
 * Graduating something to "know it" writes a `known` repertoire row, which is
 * the row the session builder already scores against, so becoming confident in a
 * bhajan makes it start appearing in suggestions with no separate wiring.
 */
export async function LearningList({
  singerId,
  singerName,
  canEdit,
  /** Your own list, rendered as its own page — no name, no heading. */
  mine = false,
}: {
  singerId: string;
  singerName: string;
  canEdit: boolean;
  mine?: boolean;
}) {
  const { rows, shrutiLabels } = await learningListFor(singerId, singerName);

  return (
    <div className="grid gap-3">
      {mine ? null : (
        <h2 className="mt-2 font-display text-lg font-semibold">{singerName}&rsquo;s list</h2>
      )}

      {canEdit ? (
        <details className="rounded-[12px] border border-rule-surface bg-panel">
          <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-semibold">
            <span>Add a bhajan</span>
            <span className="text-xs font-normal text-on-surface-muted">
              wanted, learning, or known
            </span>
          </summary>
          <div className="grid gap-3 px-4 pb-4">
            <p className="max-w-2xl text-sm text-on-surface-muted">
              Move one to <strong>Know it</strong> and it starts counting in the session
              builder, so it will be suggested. Find things to add on{" "}
              <Link href="/explore" className="text-brass-ink underline underline-offset-2">
                Explore
              </Link>
              .
            </p>
            <AddToListForm singerId={singerId} />
          </div>
        </details>
      ) : null}

      <LearningListView
        singerId={singerId}
        singerName={singerName}
        rows={rows}
        shrutiLabels={shrutiLabels}
        canEdit={canEdit}
        mine={mine}
      />
    </div>
  );
}
