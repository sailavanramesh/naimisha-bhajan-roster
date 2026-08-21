import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea, SectionTitle,
} from "@/components/ui";
import { EnableEditForm } from "@/components/EnableEditForm";
import { createBhajan } from "./actions";
import { ChoiceFormField } from "@/components/ChoiceInput";
import { getBhajanChoices } from "@/lib/bhajanChoices";

import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";

export const dynamic = "force-dynamic";

/**
 * Add a bhajan the Sai Rhythms masterlist does not have.
 *
 * Only the title is required. Everything else is optional on purpose: the
 * imported masterlist is itself incomplete — a third has no tempo, nearly a
 * third no level — and demanding more than the group knows would either block
 * the entry or invite invented data.
 */
export default async function NewBhajanPage() {
  const role = await getRole();
  if (!can(role, "addBhajan")) return <NoAccess what="Adding a bhajan" role={role} />;

  const canEdit = can(role, "addBhajan");

  /*
   * One wave, and the vocabularies come from the same cached place the edit
   * panel reads — four groupBy calls here were a second, slightly different
   * answer to a question already answered elsewhere.
   */
  const [deities, labels, choices] = await Promise.all([
    prisma.deity.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.pitchLabel.findMany({ orderBy: [{ step: "asc" }, { series: "asc" }], select: { label: true } }),
    getBhajanChoices(),
  ]);

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Add a bhajan</CardTitle>
          <p className="mt-2 text-sm text-on-surface-muted">
            You are in read-only mode. Open the app with the edit link first.
          </p>
        </CardHeader>
        <CardContent>
          <EnableEditForm returnTo="/bhajans/new" compact />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add a bhajan</CardTitle>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-muted">
            For bhajans the Sai Rhythms masterlist does not have. Only the title is
            required — the masterlist itself is incomplete, and it is better to record
            what you know than to invent the rest. Anything added here is marked as the
            group&rsquo;s own, quietly, on the bhajan&rsquo;s page.
          </p>
          <div className="mt-3">
            <Link href="/bhajans" className="text-sm underline underline-offset-2">
              Back to the masterlist
            </Link>
          </div>
        </CardHeader>

        <CardContent>
          <form action={createBhajan} className="grid gap-6">
            <section className="grid gap-3">
              <SectionTitle>The bhajan</SectionTitle>
              <Field label="Title" hint="Required. Checked against the masterlist for duplicates.">
                <Input name="title" required autoFocus placeholder="e.g. Gananatha Sai Gajanana" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Deity" hint="Comma-separated if more than one.">
                  <Input name="deity" list="deities" placeholder="e.g. Ganesha" />
                  <datalist id="deities">
                    {deities.map((d) => <option key={d.name} value={d.name} />)}
                  </datalist>
                </Field>
                {/*
                  The same dropdowns as "Correct this bhajan", from the same
                  values, with the same "Something else…" escape hatch.
                  Sailavan, 2026-08-21: "the dropdowns should exist in Add a
                  bhajan too, its the same concept with the same escape hatch for
                  new values."

                  These were a mixture before — a datalist for language and beat,
                  a hardcoded TEMPO_ORDER for tempo, a groupBy for level, and
                  plain text for raga. Four ways to ask the same kind of
                  question, and only some of them told you what the answers were.
                */}
                <Field label="Language" hint="A bhajan in several is one value, comma-joined.">
                  <ChoiceFormField name="language" options={choices.language} />
                </Field>
                <Field label="Raga">
                  <ChoiceFormField name="raga" options={choices.raga} />
                </Field>
                <Field label="Composer">
                  <Input name="composer" placeholder="if it is known" />
                </Field>
                <Field label="Beat / taal">
                  <ChoiceFormField name="beat" options={choices.beat} />
                </Field>
                <Field label="Tempo">
                  <ChoiceFormField name="tempo" options={choices.tempo} />
                </Field>
                <Field label="Level">
                  <ChoiceFormField name="level" options={choices.level} />
                </Field>
              </div>
            </section>

            <section className="grid gap-3">
              <SectionTitle>Reference pitch</SectionTitle>
              <p className="-mt-1 text-xs text-on-surface-muted">
                The pitch each voice normally starts on. Leave blank if unknown — the app
                shows a singer&rsquo;s own offset only when there is a reference to apply it to.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Gents">
                  <PitchSelect name="referenceGentsPitch" labels={labels.map((l) => l.label)} />
                </Field>
                <Field label="Ladies">
                  <PitchSelect name="referenceLadiesPitch" labels={labels.map((l) => l.label)} />
                </Field>
              </div>
            </section>

            <section className="grid gap-3">
              <SectionTitle>Links</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Sai Rhythms page"><Input name="url" type="url" placeholder="https://…" /></Field>
                <Field label="Video"><Input name="video" type="url" placeholder="https://youtu.be/…" /></Field>
                <Field label="Audio"><Input name="audio" type="url" placeholder="https://…" /></Field>
              </div>
            </section>

            <section className="grid gap-3">
              <SectionTitle>Words</SectionTitle>
              <Field label="Lyrics"><Textarea name="lyrics" rows={6} /></Field>
              <Field label="Meaning"><Textarea name="meaning" rows={4} /></Field>
            </section>

            <section className="grid gap-3">
              <SectionTitle>Where it came from</SectionTitle>
              <Field label="Note" hint="Optional. Who brought it, which centre, which book — useful later.">
                <Input name="originNote" placeholder="e.g. Learnt at Shivaratri 2026, from Prashanti recording" />
              </Field>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary">Add to the masterlist</Button>
              <span className="text-xs text-on-surface-muted">
                It becomes available to the session builder straight away.
              </span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The 24 real labels, with the same escape hatch as everything else.
 *
 * It was a bare <select>, which is right about the 24 being the whole set — but
 * inconsistent with every other field here, and it left no way to record a
 * label the table has not got.
 */
function PitchSelect({ name, labels }: { name: string; labels: string[] }) {
  return <ChoiceFormField name={name} options={labels} />;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-on-surface-muted">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-on-surface-muted">{hint}</span> : null}
    </label>
  );
}

