import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Gender } from "@prisma/client";
import { melbourneTodayISO, addDaysISO } from "@/lib/dates";
import { ownAvailability } from "@/lib/availabilityQueries";
import { PREDICT_HORIZON_DAYS } from "@/lib/availability";
import { AvailabilityEditor } from "./AvailabilityEditor";

export const dynamic = "force-dynamic";

/**
 * "When can I not sing?" — the singer's own page, and the only place any of
 * this is readable with its reasons attached.
 *
 * There is no version of this page for somebody else's dates, deliberately.
 * A rosterer sees that a person is unavailable, on the roster, without a
 * reason; `ownAvailability` is called with the signed-in singer's own id and
 * nothing else can call it.
 */
export default async function AvailabilityPage() {
  const [role, signedIn] = await Promise.all([getRole(), getSignedInSinger()]);

  if (!signedIn || !can(role, "manageOwnAvailability")) {
    return (
      <div className="py-6">
        <Card>
          <CardHeader>
            <CardTitle>Your availability</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-on-surface-muted">
              This is about your own dates, so it needs to know who you are.{" "}
              <Link href="/signin" className="underline">
                Sign in
              </Link>{" "}
              and come back.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /*
   * Who the cycle section is for.
   *
   * Singers recorded as Ladies, which is whose it is. Plus an owner, because
   * Sailavan asked to be able to try it — shown to them with a line saying
   * that is why, so an owner does not think the app has guessed wrong about
   * them.
   */
  const me = await prisma.singer.findUnique({
    where: { id: signedIn.id },
    select: { gender: true },
  });
  const isLadies = me?.gender === Gender.Ladies;
  const showCycle = isLadies || role === "owner";
  const cycleIsPreview = showCycle && !isLadies;

  const today = melbourneTodayISO();
  const horizon = addDaysISO(today, PREDICT_HORIZON_DAYS) ?? today;
  const { blocks, cycle } = await ownAvailability(signedIn.id, today, horizon);

  return (
    <div className="grid gap-4 py-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Your availability</h1>
        <p className="mt-1 text-sm text-on-surface-muted">
          Mark the dates you cannot sing and you will not be put down for them. Whoever builds the
          roster sees the dates, and never a reason.
        </p>
      </div>

      {can(role, "assignSingers") ? (
        <p className="text-sm text-on-surface-muted">
          Planning a roster?{" "}
          <Link href="/availability/team" className="underline">
            See who is around over the next few months
          </Link>
          .
        </p>
      ) : null}

      <AvailabilityEditor
        blocks={blocks}
        cycle={cycle}
        today={today}
        showCycle={showCycle}
        cycleIsPreview={cycleIsPreview}
      />
    </div>
  );
}
