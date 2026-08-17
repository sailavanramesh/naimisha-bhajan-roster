import Link from "next/link";
import { prisma } from "@/lib/db";
import { canWithGrantsFor } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Desks } from "../Desks";

export const dynamic = "force-dynamic";

/**
 * The desks, on a page of their own rather than a card inside /admin.
 *
 * /admin is editor-only and full of things a sound engineer has no business
 * with — roles, eligibility, notification rules. The cushion allocation is the
 * one thing on it they must be able to change, so it moved out here where the
 * `manageDesks` grant can open a small door instead of the whole building.
 *
 * The grant is per PERSON (Singer.canRunSound, ticked in /admin), so an
 * access-link visitor never has it: a grant is given to somebody, and a link is
 * not somebody. Editors and owners hold the capability by role as usual.
 */
export default async function DesksPage() {
  const canEdit = await canWithGrantsFor("manageDesks");

  const desks = (
    await prisma.desk.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        channels: { orderBy: { number: "asc" } },
        _count: { select: { sessions: true } },
      },
    })
  ).map((d) => ({
    id: d.id,
    name: d.name,
    kind: d.kind,
    isDefault: d.isDefault,
    usedBy: d._count.sessions,
    channels: d.channels.map((c) => ({
      id: c.id,
      number: c.number,
      label: c.label,
      kind: c.kind as string,
      colour: c.colour,
      mic: c.mic,
      stereo: c.stereo,
    })),
  }));

  if (!canEdit && desks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sound desks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-on-surface-muted">
            You need to be signed in as somebody who runs the sound, or as an editor, to see
            this.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Sound desks</CardTitle>
          <p className="mt-1 text-sm text-on-surface-muted">
            The desks and the strips printed on them, including which cushion is on which
            channel — channel 1 is the blue cushion, and it stays that way. A music programme
            copies all of this when it picks a desk and edits its own copy, so tidying a label
            here never rewrites what a past programme says was on a channel.
          </p>
        </CardHeader>
        <CardContent>
          <Desks desks={desks} canEdit={canEdit} />
        </CardContent>
      </Card>

      <p className="text-sm">
        <Link href="/admin" className="underline underline-offset-2">
          ← Admin
        </Link>
      </p>
    </div>
  );
}
