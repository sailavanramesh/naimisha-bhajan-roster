import Link from "next/link";
import { prisma } from "@/lib/db";
import { RepertoireKind } from "@prisma/client";
import {
  Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea, Badge, SectionTitle,
} from "@/components/ui";
import { DeitySymbols } from "@/components/DeitySymbol";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { upsertLearning, removeLearning } from "./actions";

export const dynamic = "force-dynamic";

/**
 * A singer's personal list: what they want to learn, what they are learning,
 * and what they know.
 *
 * Graduating something to "know it" writes a `known` repertoire row, which is
 * the same row the session builder already scores against — so becoming
 * confident in a bhajan makes it start appearing in suggestions, with no
 * separate wiring.
 *
 * INTERIM: the singer is chosen from a picker. Roles come from a shared access
 * link, so the app cannot yet tell two members apart, which also means the list
 * is not actually private yet. That is the honest state of it until Google
 * sign-in lands (SPEC §9.5).
 */

const STAGES: Array<{ kind: RepertoireKind; title: string; blurb: string }> = [
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

export default async function MyListPage({
  searchParams,
}: {
  searchParams: Promise<{ singer?: string }>;
}) {
  const role = await getRole();
  if (!can(role, "manageOwnLearning")) {
    return <NoAccess what="Keeping a learning list" role={role} />;
  }

  const sp = await searchParams;
  const signedIn = await getSignedInSinger();
  const singers = await prisma.singer.findMany({ orderBy: { name: "asc" } });

  /*
   * Whose list is shown:
   *   signed-in member -> always their own, and no picker at all.
   *   editor           -> may look at anyone's, so the picker stays.
   *   shared link      -> the interim case; picker, and the page says the
   *                       lists are not private in that mode.
   */
  const isEditor = can(role, "assignSingers");
  const lockedToSelf = Boolean(signedIn) && !isEditor;
  const singerId = lockedToSelf ? signedIn!.id : (sp.singer ?? signedIn?.id ?? singers[0]?.id);
  const singer = singers.find((s) => s.id === singerId) ?? null;

  const [entries, labels] = await Promise.all([
    singerId
      ? prisma.singerRepertoire.findMany({
          where: {
            singerId,
            kind: { in: [RepertoireKind.wantToLearn, RepertoireKind.learning, RepertoireKind.known] },
          },
          orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
          include: { bhajan: { include: { deities: { include: { deity: true } } } } },
        })
      : Promise.resolve([]),
    prisma.pitchLabel.findMany({
      orderBy: [{ step: "asc" }, { series: "asc" }],
      select: { label: true },
    }),
  ]);

  const byStage = new Map(STAGES.map((s) => [s.kind, entries.filter((e) => e.kind === s.kind)]));

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>My list</CardTitle>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-muted">
            Bhajans you want to learn, are learning, or know. Move one to{" "}
            <strong>Know it</strong> and it starts counting in the session builder, so you
            will be suggested for it.
          </p>
          {lockedToSelf ? (
            <p className="mt-2 text-sm">
              Signed in as <strong>{signedIn!.name}</strong>. This list is yours — other
              members cannot see or change it.
            </p>
          ) : signedIn ? (
            <p className="mt-2 text-sm text-on-surface-muted">
              You are an editor, so you can look at anyone&rsquo;s list.
            </p>
          ) : (
            <p className="mt-2 rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-xs">
              You are using a shared access link, so the app cannot tell members apart —
              pick who you are below, and note that anyone with that link can see these
              lists.{" "}
              <Link href="/signin" className="underline underline-offset-2">
                Sign in with Google
              </Link>{" "}
              to make your list private.
            </p>
          )}

          {!lockedToSelf ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {singers.map((s) => (
                <Link key={s.id} href={`/my-list?singer=${s.id}`}>
                  <span
                    className={
                      s.id === singerId
                        ? "rounded-full border border-brass/60 bg-brass/15 px-3 py-1 text-sm"
                        : "rounded-full border border-rule-surface px-3 py-1 text-sm hover:bg-panel-hover"
                    }
                  >
                    {s.name}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </CardHeader>

        {singer ? (
          <CardContent className="grid gap-3">
            <SectionTitle>Add a bhajan</SectionTitle>
            <form
              action={upsertLearning}
              className="grid gap-2 rounded-[12px] border border-rule-surface bg-panel p-3 sm:grid-cols-[1fr_auto_auto]"
            >
              <input type="hidden" name="singerId" value={singer.id} />
              <Input name="title" required placeholder="Bhajan title" aria-label="Bhajan title" />
              <select
                name="kind"
                defaultValue={RepertoireKind.wantToLearn}
                className="h-11 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
                aria-label="Status"
              >
                {STAGES.map((s) => (
                  <option key={s.kind} value={s.kind}>{s.title}</option>
                ))}
              </select>
              <Button type="submit" variant="primary">Add</Button>
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
        ) : null}
      </Card>

      {singer
        ? STAGES.map((stage) => {
            const rows = byStage.get(stage.kind) ?? [];
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

                          <form action={removeLearning}>
                            <input type="hidden" name="id" value={e.id} />
                            <Button type="submit" variant="danger" className="h-9 text-xs">
                              Remove
                            </Button>
                          </form>
                        </div>

                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-on-surface-muted hover:text-on-surface">
                            Notes, shruti and status
                          </summary>
                          <form action={upsertLearning} className="mt-2 grid gap-2">
                            <input type="hidden" name="singerId" value={singer.id} />
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
                                    <option key={s.kind} value={s.kind}>{s.title}</option>
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
                                    <option key={l.label} value={l.label}>{l.label}</option>
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
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })
        : null}
    </div>
  );
}
