import Link from "next/link";
import { prisma } from "@/lib/db";
import { can, getRole } from "@/lib/auth";
import { DEFAULT_GUIDE, defaultGuideSection } from "@/lib/defaultGuide";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { GuideBody } from "./GuideBody";
import { GuideEditor, type EditableSection } from "./GuideEditor";

export const dynamic = "force-dynamic";

/**
 * How to use this app — the page to send somebody who has just been given the
 * link.
 *
 * Sailavan asked for "a quick readme doc or something to run through the basic
 * features … for all the users to easily know how to use the app". Written as a
 * page rather than a document because a document is a second thing to keep, and
 * it goes out of date on somebody's laptop while the app moves on. This sits in
 * the nav, on the phone, next to the thing it describes.
 *
 * ITS WORDS LIVE IN THE DATABASE. It was 300 lines of JSX until Sailavan asked
 * to be able to make "manual changes … and updated for everyone without it
 * having to go via Claude Code and this process" — so this file is now the
 * shell, GuideSection holds the text, and an owner edits it in place. When the
 * table is empty it falls back to lib/defaultGuide.ts, so the page can never be
 * blank on a fresh clone or a restored database.
 *
 * ONE PAGE FOR EVERYBODY, with the coordinator-only parts marked rather than
 * hidden. Two versions would be two things to keep true, and a member who can
 * see that a Build screen exists is better placed to ask for it than one who
 * cannot. What is actually permitted is decided by lib/capabilities.ts, not here.
 */
export default async function GuidePage() {
  const role = await getRole();
  const coordinator = can(role, "viewAllPages");
  const mayEdit = can(role, "editGuide");

  const rows = await prisma.guideSection.findMany({ orderBy: { position: "asc" } });

  /*
   * The fallback. Given ids that cannot collide with a real row so the editor,
   * which only an owner sees, never offers to save something that is not there
   * — it offers to seed instead.
   */
  const seeded = rows.length > 0;
  const sections = seeded
    ? rows
    : DEFAULT_GUIDE.map((s) => ({ ...s, id: `default:${s.key}`, hidden: false }));

  const visible = sections.filter(
    (s) => !s.hidden && (coordinator || !s.coordinatorOnly),
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">How to use this app</h1>
        <p className="max-w-2xl text-sm text-on-surface-muted">
          Everything the Naimisha bhajan group used to keep in the spreadsheet — who is singing,
          at what shruti, what we sang last time — plus the words to the songs and the sound
          desk. Here is what each part is for.
        </p>
      </div>

      {mayEdit && seeded ? (
        <GuideEditor
          sections={sections.map(
            (s): EditableSection => ({
              id: s.id,
              key: s.key,
              title: s.title,
              href: s.href,
              blurb: s.blurb,
              body: s.body,
              coordinatorOnly: s.coordinatorOnly,
              hidden: s.hidden,
              hasOriginal: defaultGuideSection(s.key) !== null,
            }),
          )}
        />
      ) : null}

      {mayEdit && !seeded ? <SeedNotice /> : null}

      {visible.map((section) => (
        <Card key={section.key}>
          <CardHeader>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <CardTitle>
                {section.href ? (
                  <Link href={section.href} className="underline-offset-4 hover:underline">
                    {section.title}
                  </Link>
                ) : (
                  section.title
                )}
              </CardTitle>
              {section.coordinatorOnly ? <Badge tone="warn">coordinator</Badge> : null}
            </div>
            {section.blurb ? (
              <p className="text-sm text-on-surface-muted">{section.blurb}</p>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <GuideBody body={section.body} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Shown to the owner only, and only while the guide has never been seeded.
 *
 * Everybody else is already reading the fallback text and has no idea anything
 * is unusual, which is the point of having a fallback at all. This is the one
 * press that turns those words into rows so they can be edited.
 */
function SeedNotice() {
  return (
    <form
      action={async () => {
        "use server";
        const { seedGuideFromCode } = await import("./actions");
        await seedGuideFromCode();
      }}
      className="no-print flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-rule-surface bg-panel p-3"
    >
      <p className="text-sm text-on-surface-muted">
        This page is still the text written into the app. Take a copy you can edit —
        everybody keeps reading the same words either way.
      </p>
      <button
        type="submit"
        className="h-8 rounded-key border border-rule-surface px-3 text-xs font-semibold hover:border-brass/50"
      >
        Make it editable
      </button>
    </form>
  );
}
