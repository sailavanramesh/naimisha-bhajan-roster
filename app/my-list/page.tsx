import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSignedInSinger } from "@/lib/auth";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import { LearningList } from "@/components/LearningList";

export const dynamic = "force-dynamic";

/**
 * "My list" is a room again.
 *
 * It was a door from 2026-08-12 — a redirect to `/singers/[id]#list` — on the
 * sound reasoning that a singer's list is part of the singer and should not live
 * in two places. That reasoning still holds, and the list is still ONE component
 * shared with the singer page; nothing is duplicated and no data moved.
 *
 * What the redirect cost was access. Your own list is the thing you open most,
 * and getting to it meant landing at the bottom of your own singer page, below a
 * pitch profile, a shruti ladder, a raga table and fifty rows of history, at an
 * anchor. Sailavan, 2026-09-01: "the layout and the way to use it/access it is
 * limited." Somebody ELSE's list belongs under their profile, because you are
 * there to read about them. Your own is a working page, and it gets one.
 *
 * The route was always going to stay whatever happened to it — it is in the nav,
 * in bookmarks and in the WhatsApp message that went to the group.
 */
export default async function MyListPage() {
  const me = await getSignedInSinger();

  if (!me) {
    // Not signed in — a shared link cannot tell members apart, so the honest
    // answer is the list of people rather than a guess at which one you are.
    const anySinger = await prisma.singer.count();
    redirect(anySinger > 0 ? "/singers" : "/");
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>My list</CardTitle>
          <div className="mt-2 text-sm text-on-surface-muted">
            What you want to learn, what you are learning, and what you know.{" "}
            <Link
              href={`/singers/${me.id}`}
              className="text-brass-ink underline underline-offset-2"
            >
              Your pitch profile and history
            </Link>{" "}
            are on your singer page.
          </div>
        </CardHeader>
      </Card>

      {/*
        The list sits OUTSIDE the card, not in its CardContent.

        A card inside a card costs 40px of padding on each side, and on a 375px
        phone that is the difference between a bhajan title fitting on one line
        and wrapping onto three. The singer page renders it the same way, below
        its own cards rather than inside one, so the two surfaces also end up
        looking like the same thing — which they are.

        `mine` drops the "X's list" heading; the card above already says it.
      */}
      <LearningList singerId={me.id} singerName={me.name} canEdit mine />
    </div>
  );
}
