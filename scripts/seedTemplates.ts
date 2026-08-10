/**
 * scripts/seedTemplates.ts — insert the shipped shape templates.
 *
 * Idempotent and non-destructive. A template that already exists is left
 * exactly as it is, including its rules: templates are editable in the UI and
 * a coordinator's changes must survive a re-run of this script.
 *
 *   npm run db:templates
 *   npm run db:templates -- --list
 */

import { PrismaClient, RuleStrength } from '@prisma/client';
import { DEFAULT_TEMPLATES } from '../lib/defaultTemplates';

const prisma = new PrismaClient();
const LIST_ONLY = process.argv.includes('--list');

async function main() {
  if (LIST_ONLY) {
    const existing = await prisma.sessionTemplate.findMany({
      include: { rules: { orderBy: { position: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    if (existing.length === 0) console.log('No templates in the database.');
    for (const t of existing) {
      console.log(
        `\n${t.name}${t.isDefault ? '  [default]' : ''}  length=${t.defaultLength}` +
          `${t.singleDeity ? `  singleDeity=${t.singleDeity}` : ''}`,
      );
      for (const r of t.rules) {
        console.log(
          `   slot ${String(r.position).padStart(2)}  ${r.strength.padEnd(4)}` +
            `  deity=${r.deity ?? '—'}  tempo=${r.tempoIn.length ? r.tempoIn.join('/') : '—'}`,
        );
      }
    }
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const spec of DEFAULT_TEMPLATES) {
    const existing = await prisma.sessionTemplate.findUnique({ where: { name: spec.name } });
    if (existing) {
      skipped++;
      console.log(`  = ${spec.name} — already present, left untouched`);
      continue;
    }

    await prisma.sessionTemplate.create({
      data: {
        name: spec.name,
        description: spec.description,
        defaultLength: spec.defaultLength,
        isDefault: spec.isDefault,
        singleDeity: spec.singleDeity ?? null,
        rules: {
          create: spec.rules.map((r) => ({
            position: r.position,
            strength: r.strength === 'hard' ? RuleStrength.hard : RuleStrength.soft,
            deity: r.deity ?? null,
            tempoIn: r.tempoIn ?? [],
            note: r.note ?? null,
          })),
        },
      },
    });
    created++;
    console.log(`  + ${spec.name} — created with ${spec.rules.length} slot rules`);
  }

  // Exactly one default. If the coordinator has picked a different one, respect it.
  const defaults = await prisma.sessionTemplate.findMany({ where: { isDefault: true } });
  if (defaults.length === 0) {
    const weekday = await prisma.sessionTemplate.findUnique({ where: { name: 'Weekday (3)' } });
    if (weekday) {
      await prisma.sessionTemplate.update({ where: { id: weekday.id }, data: { isDefault: true } });
      console.log('  ! no default template was set — Weekday (3) marked as default');
    }
  } else if (defaults.length > 1) {
    console.log(
      `  ! ${defaults.length} templates are marked default (${defaults.map((d) => d.name).join(', ')}). ` +
        `The builder uses the first by name. Left as-is; fix in the UI.`,
    );
  }

  console.log(`\nTemplates: ${created} created, ${skipped} left untouched.`);
}

main()
  .catch((e) => {
    console.error('\nTemplate seed failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
