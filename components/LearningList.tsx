import Link from "next/link";
import { prisma } from "@/lib/db";
import { RepertoireKind } from "@prisma/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Textarea,
  Badge,
  SectionTitle,
} from "@/components/ui";
import { DeitySymbols } from "@/components/DeitySymbol";
import { upsertLearning, removeLearning } from "@/app/my-list/actions";

/**
 * components/LearningList.tsx — one person's bhajans: wanted, learning, known.
 *
 * This used to be a page of its own at /my-list, sitting beside /singers,
 * which meant two places answered "what does this person sing" and neither
 * answered it completely. Sailavan, 2026-08-12: "combine singers and my list
 * in a nice logical way." The logical way is that a singer's list is part of
 * the singer, so it lives on their page — under their pitch profile and their
 * history, which is the rest of the same story. /my-list is now a door to your
 * own page rather than a separate room.
 *
 * `canEdit` is what separates reading somebody's list from keeping your own.
 * The forms are simply absent without it — a member looking at another
 * singer's page sees what they sing and cannot touch it.
 *
 * Graduating something to "know it" writes a `known` repertoire row, which is
 * the row the session builder already scores against, so becoming confident in
 * a bhajan makes it start appearing in suggestions with no separate wiring.
 */

export const STAGES: Array<{ kind: RepertoireKind; title: string; blurb: string }> = [
  {
    kind: RepertoireKind.wantToLearn,
    title: "Want to learn",
    blurb: "Caught your ear. Nothing started yet.",
  },
  {
    kind: RepertoireKind.learning,
    title: "Learning",
    blurb: "Working on it. Notes and a shruti help here.",
  },
  {
    kind: RepertoireKind.known,
    title: "Know it",
    blurb: "Confident enough to sing. These count in the session builder.",
  },
];

export async function LearningList({
  singerId,
  singerName,
  canEdit,
}: {
  singerId: string;
  singerName: string;
  canEdit: boolean;
}) {
  const [entries, labels] = await Promise.all([
    prisma.singerRepertoire.findMany({
      where: {
        singerId,
        kind: {
          in: [RepertoireKind.wantToLearn, RepertoireKind.learning, RepertoireKind.known],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      include: { bhajan: { include: { deities: { include: { deity: true } } } } },
    }),
    prisma.pitchLabel.findMany({
      orderBy: [{ step: "asc" }, { series: "asc" }],
      select: { label: true },
    }),
  ]);

  const byStage = new Map(STAGES.map((s) => [s.kind, entries.filter((e) => e.kind === s.kind)]));

  return (
    <div id="list" className="grid gap-4">
      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>{singerName}&rsquo;s list</CardTitle>
            <p className="mt-1 max-w-2xl text-sm text-on-surface-muted">
              Bhajans wanted, being learnt, or known. Move one to <strong>Know it</strong> and
              it starts counting in the session builder, so it will be suggested.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3">
            <SectionTitle>Add a bhajan</SectionTitle>
            <form
              action={upsertLearning}
              className="grid gap-2 rounded-[12px] border border-rule-surface bg-panel p-3 sm:grid-cols-[1fr_auto_auto]"
            >
              <input type="hidden" name="singerId" value={singerId} />
              <Input name="title" required placeholder="Bhajan title" aria-label="Bhajan title" />
              <select
                name="kind"
                defaultValue={RepertoireKind.wantToLearn}
                className="h-11 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
                aria-label="Status"
              >
                {STAGES.map((s) => (
                  <option key={s.kind} value={s.kind}>
                    {s.title}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="primary">
                Add
              </Button>
              <p className="text-xs text-on-surface-muted sm:col-span-3">
                A title that does not match the masterlist is still saved — it just will not
                link through to a bhajan page. Find things to add on{" "}
                <Link href="/explore" className="text-brass-ink underline underline-offset-2">
                  Explore
                </Link>
                .
              </p>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {STAGES.map((stage) => {
        const rows = byStage.get(stage.kind) ?? [];
        // Somebody else's empty stages are noise; your own are a prompt.
        if (rows.length === 0 && !canEdit) return null;
        return (
          <Card key={stage.kind}>
            <CardHeader className="pb-3">
              <div className="flex items-baseline justify-between gap-3">
                <CardTitle>{stage.title}</CardTitle>
                <span className="text-xs text-on-surface-muted">{rows.length}</span>
              </div>
              <p className="mt-1 text-xs text-on-surface-muted">{stage.blurb}</p>
            </CardHeader>
            <CardContent className="grid gap-2">
              {rows.length === 0 ? (
                <p className="text-sm text-on-surface-muted">Nothing here yet.</p>
              ) : (
                rows.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-[12px] border border-rule-surface bg-panel p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {e.bhajanId ? (
                          <Link
                            href={`/bhajans/${e.bhajanId}`}
                            className="flex items-center gap-2 font-medium underline-offset-2 hover:underline"
                          >
                            <DeitySymbols
                              deities={e.bhajan?.deities.map((d) => d.deity.name) ?? []}
                              size={16}
                            />
                            {e.title}
                          </Link>
                        ) : (
                          <span className="font-medium">
                            {e.title} <Badge tone="warn">not in the masterlist</Badge>
                          </span>
                        )}
                        {e.preferredPitch ? (
                          <div className="mt-1 font-mono text-xs tabular text-on-surface-muted">
                            shruti {e.preferredPitch}
                          </div>
                        ) : null}
                        {e.note ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm">{e.note}</p>
                        ) : null}
                      </div>

                      {canEdit ? (
                        <form action={removeLearning}>
                          <input type="hidden" name="id" value={e.id} />
                          <Button type="submit" variant="danger" className="h-9 text-xs">
                            Remove
                          </Button>
                        </form>
                      ) : null}
                    </div>

                    {canEdit ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-on-surface-muted hover:text-on-surface">
                          Notes, shruti and status
                        </summary>
                        <form action={upsertLearning} className="mt-2 grid gap-2">
                          <input type="hidden" name="singerId" value={singerId} />
                          <input type="hidden" name="title" value={e.title} />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="grid gap-1">
                              <span className="text-[11px] text-on-surface-muted">Status</span>
                              <select
                                name="kind"
                                defaultValue={e.kind}
                                className="h-11 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
                              >
                                {STAGES.map((s) => (
                                  <option key={s.kind} value={s.kind}>
                                    {s.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1">
                              <span className="text-[11px] text-on-surface-muted">
                                Shruti you want
                              </span>
                              <select
                                name="preferredPitch"
                                defaultValue={e.preferredPitch ?? ""}
                                className="h-11 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
                              >
                                <option value="">—</option>
                                {labels.map((l) => (
                                  <option key={l.label} value={l.label}>
                                    {l.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="grid gap-1">
                            <span className="text-[11px] text-on-surface-muted">Note</span>
                            <Textarea
                              name="note"
                              rows={3}
                              defaultValue={e.note ?? ""}
                              placeholder="What is tricky, where you heard it, who taught it…"
                            />
                          </label>
                          <div>
                            <Button type="submit" variant="primary" className="h-9 text-xs">
                              Save
                            </Button>
                          </div>
                        </form>
                      </details>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
