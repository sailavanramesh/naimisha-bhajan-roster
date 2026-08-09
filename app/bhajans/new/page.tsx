import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea, SectionTitle,
} from "@/components/ui";
import { EnableEditForm } from "@/components/EnableEditForm";
import { TEMPO_ORDER } from "@/lib/sessionBuilder";
import { createBhajan } from "./actions";

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
  const cookieStore = await cookies();
  const canEdit = cookieStore.get("edit")?.value === "1";

  const [deities, languages, levels, beats, labels] = await Promise.all([
    prisma.deity.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.bhajan.groupBy({ by: ["language"], _count: { _all: true } }),
    prisma.bhajan.groupBy({ by: ["level"] }),
    prisma.bhajan.groupBy({ by: ["beat"] }),
    prisma.pitchLabel.findMany({ orderBy: [{ step: "asc" }, { series: "asc" }], select: { label: true } }),
  ]);

  const clean = (rows: { [k: string]: unknown }[], key: string) =>
    rows
      .map((r) => r[key])
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .sort((a, b) => a.localeCompare(b));

  const commonLanguages = (languages as Array<{ language: string | null; _count: { _all: number } }>)
    .filter((l) => l.language && l._count._all >= 10)
    .map((l) => l.language as string)
    .sort((a, b) => a.localeCompare(b));

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
                <Field label="Language">
                  <Input name="language" list="languages" placeholder="e.g. Sanskrit / Hindi" />
                  <datalist id="languages">
                    {commonLanguages.map((l) => <option key={l} value={l} />)}
                  </datalist>
                </Field>
                <Field label="Raga">
                  <Input name="raga" placeholder="e.g. Kalyani / Yaman" />
                </Field>
                <Field label="Beat / taal">
                  <Input name="beat" list="beats" placeholder="e.g. 8 Beat / Keherwa / Adi" />
                  <datalist id="beats">
                    {clean(beats, "beat").map((b) => <option key={b} value={b} />)}
                  </datalist>
                </Field>
                <Field label="Tempo">
                  <select name="tempo" className="h-11 w-full rounded-[10px] border border-rule-surface bg-field px-3 text-sm">
                    <option value="">—</option>
                    {TEMPO_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Level">
                  <select name="level" className="h-11 w-full rounded-[10px] border border-rule-surface bg-field px-3 text-sm">
                    <option value="">—</option>
                    {clean(levels, "level").map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
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

function PitchSelect({ name, labels }: { name: string; labels: string[] }) {
  return (
    <select name={name} className="h-11 w-full rounded-[10px] border border-rule-surface bg-field px-3 text-sm">
      <option value="">—</option>
      {labels.map((l) => <option key={l} value={l}>{l}</option>)}
    </select>
  );
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
