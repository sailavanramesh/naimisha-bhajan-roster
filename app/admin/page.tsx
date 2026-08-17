import Link from "next/link";
import { prisma } from "@/lib/db";
import { RepertoireKind } from "@prisma/client";
import {
  Card, CardContent, CardHeader, CardTitle, Button, Badge, SectionTitle, Input,
} from "@/components/ui";
import { EnableEditForm } from "@/components/EnableEditForm";
import { INSTRUMENTS } from "@/lib/instrumentScoring";
import {
  setEligibilityForInstrument,
  removeRepertoireEntry,
  setSingerAccess,
} from "./actions";
import { googleSignInConfigured } from "@/lib/authConfig";
import { SessionCategories } from "./SessionCategories";
import { Instruments } from "./Instruments";
import { AddRepertoireForm } from "./AddRepertoireForm";

import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { AddPersonForm } from "./AddPersonForm";
import { TablaDecisions } from "./TablaDecisions";
import { RemovePersonButton } from "./RemovePersonButton";

export const dynamic = "force-dynamic";

/** The three stages, as they are written on screen. */
const STAGE_LABEL: Record<RepertoireKind, string> = {
  known: "knows it",
  learning: "learning",
  wantToLearn: "wants to learn",
  festival: "knows it", // dead value — see SingerRepertoire.isFestival
};

/**
 * Admin — the allocation data behind the roster.
 *
 * Everything the scoring reads that a human should be able to correct lives
 * here: who may play which instrument, and who knows which bhajans. Both are
 * data, not code, so the group can tinker without a deploy.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ singer?: string }>;
}) {
  const role = await getRole();
  if (!can(role, "manageAllocations")) return <NoAccess what="The admin section" role={role} />;

  const sp = await searchParams;
  // Reaching here already required manageAllocations; the sub-forms follow it
  // rather than re-deriving permission from the legacy cookie.
  const canEdit = can(role, "manageAllocations");

  const allCategories = (
    await prisma.sessionCategory.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        image: true,
        scope: true,
        _count: { select: { sessions: true } },
      },
    })
  ).map((c) => ({
    id: c.id,
    name: c.name,
    image: c.image,
    scope: c.scope,
    sessions: c._count.sessions,
  }));
  const sessionCategories = allCategories.filter((c) => c.scope === "bhajans");
  const programCategories = allCategories.filter((c) => c.scope === "program");

  /*
   * Instruments, with the two counts that decide whether retiring one is safe:
   * how many program items name it, and how many people are listed as eligible.
   * Eligibility is keyed by NAME in InstrumentPerson, which is why it is
   * counted here by name rather than through a relation.
   */
  const [instrumentRows, eligibilityCounts] = await Promise.all([
    prisma.instrument.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        scope: true,
        active: true,
        channels: true,
        _count: { select: { programItems: true } },
      },
    }),
    prisma.instrumentPerson.groupBy({ by: ["instrument"], _count: { _all: true } }),
  ]);
  const eligibleByName = new Map(eligibilityCounts.map((e) => [e.instrument, e._count._all]));

  const instruments = instrumentRows.map((i) => ({
    id: i.id,
    name: i.name,
    scope: i.scope,
    active: i.active,
    channels: i.channels,
    used: i._count.programItems,
    eligible: eligibleByName.get(i.name) ?? 0,
  }));

  const [singers, eligibility, instrumentPeople] = await Promise.all([
    prisma.singer.findMany({ orderBy: { name: "asc" } }),
    prisma.instrumentPerson.findMany({ orderBy: [{ instrument: "asc" }, { person: "asc" }] }),
    prisma.sessionInstrument.findMany({ select: { person: true }, distinct: ["person"] }),
  ]);

  // Everyone who could plausibly appear: singers, anyone already listed, and
  // anyone with real history. History values are comma-separated for the
  // shared roles, so they are split here too.
  const people = new Set<string>(singers.map((s) => s.name));
  for (const e of eligibility) people.add(e.person);
  for (const p of instrumentPeople) {
    for (const name of (p.person ?? "").split(",")) {
      const n = name.trim();
      if (n) people.add(n);
    }
  }
  const roster = [...people].sort((a, b) => a.localeCompare(b));

  const listedBy = new Map<string, Set<string>>();
  for (const e of eligibility) {
    if (!listedBy.has(e.instrument)) listedBy.set(e.instrument, new Set());
    listedBy.get(e.instrument)!.add(e.person);
  }

  const selectedSingerId = sp.singer ?? singers[0]?.id;
  const repertoire = selectedSingerId
    ? await prisma.singerRepertoire.findMany({
        where: { singerId: selectedSingerId },
        orderBy: [{ kind: "asc" }, { order: "asc" }, { title: "asc" }],
      })
    : [];
  const selectedSinger = singers.find((s) => s.id === selectedSingerId) ?? null;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Admin</CardTitle>
          <div className="mt-1 text-sm text-on-surface-muted">
            The allocation data the roster scores against. Editing here changes suggestions
            immediately — it never touches a session&rsquo;s history or anybody&rsquo;s
            confirmed pitch.
          </div>
          {!canEdit ? (
            <div className="mt-3">
              <p className="mb-2 text-sm">You are in read-only mode.</p>
              <EnableEditForm returnTo="/admin" compact />
            </div>
          ) : null}
        </CardHeader>
      </Card>

      {/* ---- Tabla decisions, collected over time ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Tabla decisions</CardTitle>
          <div className="mt-1 max-w-2xl text-sm text-on-surface-muted">
            Every tabla chosen by hand, beside what the rule computed. Rather than encoding
            every raga up front, the cases it cannot resolve get decided as they come up and
            collected here — the disagreements are what will refine the rule.
          </div>
        </CardHeader>
        <CardContent>
          <TablaDecisions />
        </CardContent>
      </Card>

      {/* ---- Who can sign in ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Access</CardTitle>
          <div className="mt-1 max-w-2xl text-sm text-on-surface-muted">
            The Google address each singer signs in with. <strong>This is the
            allowlist</strong> — signing in never creates a singer, so an address that is
            not here gets read-only access whoever it belongs to. Clearing a field revokes
            access immediately.
            {!googleSignInConfigured ? (
              <span className="mt-2 block rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-xs">
                Google sign-in is not configured yet, so these have no effect. They are
                safe to fill in now — they take effect the moment it is switched on.
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {/*
            Adding somebody was the missing half of this panel: it could edit
            who was already here but not put a new person on, so a new tester
            needed a database change. Access hangs off Singer, so a person who
            only ever reads the roster still needs a row — there is no separate
            user table, by design.
          */}
          {canEdit ? <AddPersonForm /> : null}

          {singers.map((s) => (
            <form
              key={s.id}
              action={setSingerAccess}
              /*
                The last track is a FIXED width, not auto. Each row is its own
                grid, so an auto track sized itself to that row's status text —
                "saved: Editor" is wider than "no access" — which changed how
                much space the 1fr email column got and shifted every control
                left or right by a few pixels per row. Nothing lined up down
                the page.
              */
              className="grid items-center gap-2 rounded-[12px] border border-rule-surface bg-panel p-2 sm:grid-cols-[8rem_1fr_9rem_15.5rem]"
            >
              <input type="hidden" name="singerId" value={s.id} />
              <span className="text-sm font-medium">{s.name}</span>
              <Input
                // `key` forces a remount when the saved value changes.
                // defaultValue on an uncontrolled input is only applied at
                // mount, so after a save React reused the existing DOM element
                // and the field showed a stale value — the page contradicted
                // the database it had just written.
                key={`email-${s.email ?? ""}`}
                name="email"
                type="email"
                defaultValue={s.email ?? ""}
                placeholder="name@gmail.com"
                aria-label={`Google address for ${s.name}`}
                disabled={!canEdit}
              />
              <select
                key={`role-${s.role}`}
                name="role"
                defaultValue={
                  s.role === "owner" ? "owner" : s.role === "coordinator" ? "coordinator" : "singer"
                }
                disabled={!canEdit}
                className="h-11 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
                aria-label={`Access level for ${s.name}`}
              >
                <option value="singer">Member</option>
                <option value="coordinator">Editor</option>
                {/* An owner is an editor who also sets when the app buzzes
                    people. Listed last because it is the rarest. */}
                <option value="owner">Owner</option>
              </select>
              {/*
                The one thing a person can be given without a role change.
                Sailavan wanted named people keeping the lyrics and meanings up
                to date; making them an editor to do it would hand them the
                whole roster.
              */}
              <label
                className="flex items-center gap-1.5 text-[11px] text-on-surface-muted"
                title="May edit song lyrics and meanings, and nothing else"
              >
                <input
                  key={`words-${s.canEditWords}`}
                  type="checkbox"
                  name="canEditWords"
                  defaultChecked={s.canEditWords}
                  disabled={!canEdit}
                  className="h-4 w-4"
                />
                edits words
              </label>
              {/*
                The second grant, and the same argument. The sound engineer and
                the mic coordinator have to keep the desk and its cushion
                allocation right; making them an editor to do it would hand them
                the whole roster.
              */}
              <label
                className="flex items-center gap-1.5 text-[11px] text-on-surface-muted"
                title="May edit the desks, their strips and which cushion is on which channel"
              >
                <input
                  key={`sound-${s.canRunSound}`}
                  type="checkbox"
                  name="canRunSound"
                  defaultChecked={s.canRunSound}
                  disabled={!canEdit}
                  className="h-4 w-4"
                />
                runs sound
              </label>
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <Button type="submit" className="h-10 w-[4.5rem] shrink-0 text-xs">Save</Button>
                ) : null}
                {canEdit ? <RemovePersonButton singerId={s.id} name={s.name} /> : null}
                {/* States what is actually stored, so a stale form control can
                    never misrepresent the database again. Fixed width so the
                    longer "saved: Editor" cannot push the buttons around. */}
                <span className="ml-auto w-[5.5rem] shrink-0 text-right text-[11px] leading-tight text-on-surface-muted">
                  {s.email
                    ? `saved: ${
                        s.role === "owner"
                          ? "Owner"
                          : s.role === "coordinator"
                            ? "Editor"
                            : "Member"
                      }`
                    : "no access"}
                </span>
              </div>
            </form>
          ))}
        </CardContent>
      </Card>

      {/* Owner only: when the day-of reminders go out. */}

      {can(role, "manageNotificationRules") ? (

        <Card>

          <CardHeader>

            <CardTitle>Notifications</CardTitle>

          </CardHeader>

          <CardContent>

            <p className="text-sm text-on-surface-muted">

              The hours people are reminded on the day of a session, by day of the week or

              for a single date.{" "}

              <Link href="/admin/notifications" className="underline underline-offset-2">

                Open

              </Link>

            </p>

          </CardContent>

        </Card>

      ) : null}


      <Card>


        <CardHeader>


          <CardTitle>Session categories</CardTitle>


          <p className="mt-1 text-sm text-on-surface-muted">


            What kinds of session the centre runs. Set one on a session from its own page;


            removing a category here leaves its sessions alone, merely uncategorised.


          </p>


        </CardHeader>


        <CardContent>


          <SessionCategories categories={sessionCategories} canEdit={canEdit} />


        </CardContent>


      </Card>


      {/* ---- Program kinds ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Music program kinds</CardTitle>
          <p className="mt-1 text-sm text-on-surface-muted">
            The same idea for music programs, kept as its own list — a musical offering is not
            a kind of bhajan session, and mixing the two would put both in every picker.
          </p>
        </CardHeader>
        <CardContent>
          <SessionCategories
            categories={programCategories}
            canEdit={canEdit}
            scope="program"
            placeholder="New program kind, e.g. Musical offering"
          />
        </CardContent>
      </Card>


      {/* ---- Instruments ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Instruments</CardTitle>
          <p className="mt-1 text-sm text-on-surface-muted">
            What can be played, and where it is offered. Retiring one takes it out of the
            pickers and leaves every past program still saying what was played on it.
          </p>
        </CardHeader>
        <CardContent>
          <Instruments instruments={instruments} canEdit={canEdit} />
        </CardContent>
      </Card>


      {/* ---- Sound desks ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Sound desks</CardTitle>
          <p className="mt-1 text-sm text-on-surface-muted">
            The desks, their strips, and which cushion is on which channel. On a page of their
            own because the people who keep them right are the sound engineer and the mic
            coordinator, and they are not editors — tick &ldquo;runs sound&rdquo; against
            somebody above to let them in.
          </p>
        </CardHeader>
        <CardContent>
          <Link href="/admin/desks" className="text-sm underline underline-offset-2">
            Sound desks →
          </Link>
        </CardContent>
      </Card>



      {/* ---- Instrument eligibility ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Instrument eligibility</CardTitle>
          <div className="mt-1 text-sm text-on-surface-muted">
            Who may play what. Being listed makes somebody <em>preferred</em>, never
            required — anyone can still be assigned, because the imported list named 16
            people while 33 have actually played. Each instrument saves on its own.
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {INSTRUMENTS.map((instrument) => {
            const listed = listedBy.get(instrument) ?? new Set<string>();
            return (
              <form
                key={instrument}
                action={setEligibilityForInstrument}
                className="rounded-[12px] border border-rule-surface bg-panel p-3"
              >
                <input type="hidden" name="instrument" value={instrument} />
                {/*
                  Fixed widths for the count and the button. The button used to
                  read "Save Cymbals (Female)" or "Save Tabla", so its width
                  changed per card and pushed the count chip to a different x on
                  every row. The card is already headed with the instrument, so
                  the button does not need to name it again — and once it is
                  just "Save", both columns line up down the page.
                */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionTitle>{instrument}</SectionTitle>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="w-[6.5rem] text-right">
                      <Badge tone={listed.size ? "brass" : "warn"}>
                        {listed.size ? `${listed.size} listed` : "none"}
                      </Badge>
                    </span>
                    {canEdit ? (
                      <Button type="submit" className="h-9 w-[4.5rem] text-xs">
                        Save
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {roster.map((person) => (
                    <label key={person} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="person"
                        value={person}
                        defaultChecked={listed.has(person)}
                        disabled={!canEdit}
                        className="h-4 w-4"
                      />
                      {person}
                    </label>
                  ))}
                </div>
              </form>
            );
          })}
        </CardContent>
      </Card>

      {/* ---- Singer repertoire ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Singer repertoire</CardTitle>
          <div className="mt-1 text-sm text-on-surface-muted">
            What each singer knows, and their festival list. Like eligibility this scores
            rather than filters: a singer may still be given a bhajan they have never sung
            (§9.3), which is exactly where predicted pitch earns its keep.
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {singers.map((s) => (
              <Link key={s.id} href={`/admin?singer=${s.id}`}>
                <span
                  className={
                    s.id === selectedSingerId
                      ? "rounded-full border border-brass/60 bg-brass/15 px-3 py-1 text-sm"
                      : "rounded-full border border-rule-surface px-3 py-1 text-sm hover:bg-panel-hover"
                  }
                >
                  {s.name}
                </span>
              </Link>
            ))}
          </div>
        </CardHeader>

        <CardContent className="grid gap-3">
          {!selectedSinger ? (
            <p className="text-sm text-on-surface-muted">No singers yet.</p>
          ) : (
            <>
              {canEdit ? (
                <AddRepertoireForm singerId={selectedSinger.id} />
              ) : null}

              {repertoire.length === 0 ? (
                <p className="text-sm text-on-surface-muted">
                  Nothing recorded for {selectedSinger.name} yet.
                </p>
              ) : (
                <ul className="grid gap-1">
                  {repertoire.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 border-b border-rule-surface py-1 last:border-b-0"
                    >
                      <span className="min-w-0 text-sm">
                        {r.bhajanId ? (
                          <Link
                            href={`/bhajans/${r.bhajanId}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {r.title}
                          </Link>
                        ) : (
                          <span title="Not matched to the masterlist">{r.title}</span>
                        )}
                        {!r.bhajanId ? (
                          <Badge tone="warn" className="ml-2">
                            unmatched
                          </Badge>
                        ) : null}
                      </span>

                      <span className="flex shrink-0 items-center gap-2">
                        <Badge>{STAGE_LABEL[r.kind]}</Badge>
                        {r.isFestival ? <Badge tone="warn">festival</Badge> : null}
                        {canEdit ? (
                          <form action={removeRepertoireEntry}>
                            <input type="hidden" name="id" value={r.id} />
                            <Button type="submit" variant="danger" className="h-9 text-xs">
                              Remove
                            </Button>
                          </form>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

