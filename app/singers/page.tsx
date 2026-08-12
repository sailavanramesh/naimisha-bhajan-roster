import Link from "next/link";
import { prisma } from "@/lib/db";
import { RepertoireKind } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getSignedInSinger } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The people who sing, and what each of them has on their list.
 *
 * Singers only. Somebody with no recorded voice is a user, not a singer — a
 * mic operator, or an instrumentalist who does not sing — and listing them
 * here made a page called Singers answer a different question. They are
 * managed in Admin, which is where people live.
 *
 * Since a singer's list now lives on their page rather than at /my-list, this
 * index is also the way in to your own: you are pinned to the top, so it is
 * one tap rather than a hunt through eleven names for yourself.
 */
export default async function SingersPage() {
  const [singers, counts, me] = await Promise.all([
    prisma.singer.findMany({
      where: { gender: { not: null } },
      orderBy: { name: "asc" },
    }),
    prisma.singerRepertoire.groupBy({
      by: ["singerId", "kind"],
      _count: { _all: true },
    }),
    getSignedInSinger(),
  ]);

  const known = new Map<string, number>();
  const learning = new Map<string, number>();
  for (const c of counts) {
    if (c.kind === RepertoireKind.known) {
      known.set(c.singerId, (known.get(c.singerId) ?? 0) + c._count._all);
    } else {
      learning.set(c.singerId, (learning.get(c.singerId) ?? 0) + c._count._all);
    }
  }

  const ordered = me
    ? [...singers].sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0))
    : singers;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Singers</CardTitle>
          <p className="mt-1 text-sm text-on-surface-muted">
            Each page holds their pitch profile, what they have sung, and their list.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {ordered.map((s) => {
              const isMe = me?.id === s.id;
              const k = known.get(s.id) ?? 0;
              const l = learning.get(s.id) ?? 0;
              return (
                <Link
                  key={s.id}
                  href={isMe ? `/singers/${s.id}#list` : `/singers/${s.id}`}
                  className={[
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-[12px] border p-3 hover:bg-panel-hover",
                    isMe ? "border-brass/45 bg-brass/[0.06]" : "border-rule-surface bg-panel",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {s.name}
                      {isMe ? (
                        <span className="ms-2 rounded-full border border-brass/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-on-surface-muted">
                          you
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-on-surface-muted">{s.gender}</div>
                  </div>
                  {/* One right edge for every row, whatever the name length. */}
                  <div className="whitespace-nowrap text-right text-xs text-on-surface-muted">
                    {k > 0 ? `${k} known` : "no list yet"}
                    {l > 0 ? ` · ${l} learning` : ""}
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
