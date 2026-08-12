"use server";

import { prisma } from "@/lib/db";
import { contradiction } from "@/lib/repertoireGuard";
import { requireCapability, normaliseEmail } from "@/lib/auth";
import { RepertoireKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Admin edits to allocation data.
 *
 * These deliberately DO write and delete — that is the point of an admin
 * screen. But the blast radius is confined to allocation tables
 * (`InstrumentPerson`, `SingerRepertoire`). Nothing here can reach
 * `SessionSlot`, so no edit made on this screen can destroy a confirmed pitch
 * or a session's history.
 */

const EligibilityUpdate = z.object({
  instrument: z.string().min(1),
  pairs: z.array(z.string()),
});

/**
 * Replace the eligibility list for ONE instrument.
 *
 * Scoped to a single instrument on purpose: a whole-matrix save would let an
 * unrelated rendering bug silently wipe every list at once.
 */
export async function setEligibilityForInstrument(formData: FormData): Promise<void> {
  await requireCapability("manageAllocations");
  const parsed = EligibilityUpdate.safeParse({
    instrument: String(formData.get("instrument") ?? ""),
    pairs: formData.getAll("person").map(String),
  });
  if (!parsed.success) throw new Error("Could not update eligibility.");
  const { instrument, pairs } = parsed.data;

  const wanted = new Set(pairs.map((p) => p.trim()).filter(Boolean));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.instrumentPerson.findMany({ where: { instrument } });
    const have = new Set(existing.map((e) => e.person));

    const toAdd = [...wanted].filter((p) => !have.has(p));
    const toRemove = existing.filter((e) => !wanted.has(e.person));

    if (toAdd.length) {
      await tx.instrumentPerson.createMany({
        data: toAdd.map((person) => ({ instrument, person })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length) {
      await tx.instrumentPerson.deleteMany({
        where: { id: { in: toRemove.map((r) => r.id) } },
      });
    }
  });

  revalidatePath("/admin");
}

const RepertoireAdd = z.object({
  singerId: z.string().min(1),
  title: z.string().min(1),
  kind: z.nativeEnum(RepertoireKind),
});

export type RepertoireAddResult =
  | { ok: true; title: string }
  | { ok: false; message: string };

/**
 * Add a bhajan to somebody's list, as a coordinator.
 *
 * Guarded by the same rule as every other way in — lib/repertoireGuard.ts.
 * This one is a coordinator's tool rather than a member's, but a duplicate
 * created here is exactly as wrong as one created anywhere else, and the
 * unique key is on (singer, KIND, title), so adding at a second stage would
 * happily produce two rows for the same bhajan.
 *
 * `force` in the form adds it regardless, because a coordinator correcting the
 * record needs to be able to say "yes, I mean it".
 */
export async function addRepertoireEntry(formData: FormData): Promise<RepertoireAddResult> {
  await requireCapability("manageAllocations");
  const parsed = RepertoireAdd.safeParse({
    singerId: String(formData.get("singerId") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    kind: String(formData.get("kind") ?? "known"),
  });
  if (!parsed.success) {
    return { ok: false, message: "A singer and a bhajan title are required." };
  }
  const { singerId, title, kind } = parsed.data;

  if (String(formData.get("force") ?? "") !== "1") {
    const objection = await contradiction(singerId, title, kind);
    if (objection) {
      if ("already" in objection) {
        return {
          ok: false,
          message:
            `Not added — ${objection.already.title} is already on their list under ` +
            `${objection.already.label}` +
            (objection.already.preferredPitch ? ` at ${objection.already.preferredPitch}` : "") +
            ".",
        };
      }
      return {
        ok: false,
        message:
          `Not added — ${objection.sung.title} has been sung ${objection.sung.times}\u00d7` +
          (objection.sung.lastOn ? `, last on ${objection.sung.lastOn}` : "") +
          (objection.sung.pitch ? ` at ${objection.sung.pitch}` : "") +
          ". Add it as Knows it, or tick to add anyway.",
      };
    }
  }

  // Resolve to a masterlist bhajan where possible, but keep the entry either
  // way — 10 roster titles do not resolve, and losing them would be worse.
  const bhajan = await prisma.bhajan.findFirst({
    where: { title: { equals: title, mode: "insensitive" } },
    select: { id: true, title: true },
  });

  await prisma.singerRepertoire.upsert({
    where: { singerId_kind_title: { singerId, kind, title: bhajan?.title ?? title } },
    create: { singerId, kind, title: bhajan?.title ?? title, bhajanId: bhajan?.id ?? null },
    update: { bhajanId: bhajan?.id ?? null },
  });

  revalidatePath("/admin");
  return { ok: true, title: bhajan?.title ?? title };
}

export async function removeRepertoireEntry(formData: FormData): Promise<void> {
  await requireCapability("manageAllocations");
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Could not remove: no entry given.");
  await prisma.singerRepertoire.delete({ where: { id } });
  revalidatePath("/admin");
}


const SingerAccess = z.object({
  singerId: z.string().min(1),
  email: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase())
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "That is not an email address"),
  role: z.enum(["owner", "coordinator", "singer"]),
});

/**
 * Put a Google address against a singer, and set what they may do.
 *
 * THIS IS THE ALLOWLIST. Signing in never creates a singer, so an address that
 * is not set here gets viewer access no matter who it belongs to. Clearing the
 * field revokes access immediately.
 */
export async function setSingerAccess(formData: FormData): Promise<void> {
  await requireCapability("manageAllocations");

  const parsed = SingerAccess.safeParse({
    singerId: String(formData.get("singerId") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "singer"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Could not save access.");
  const { singerId, role } = parsed.data;
  const email = normaliseEmail(parsed.data.email);

  if (email) {
    const taken = await prisma.singer.findFirst({
      where: { email, id: { not: singerId } },
      select: { name: true },
    });
    if (taken) {
      throw new Error(`${email} is already set against ${taken.name}. One address, one singer.`);
    }
  }

  await prisma.singer.update({
    where: { id: singerId },
    data: { email, role: role as "coordinator" | "singer" },
  });

  revalidatePath("/admin");
}

const NewSinger = z.object({
  name: z.string().trim().min(1, "a name is needed").max(80),
  email: z.string().trim().email("that is not an email address").or(z.literal("")),
  gender: z.enum(["Gents", "Ladies", ""]),
  role: z.enum(["owner", "coordinator", "singer"]),
});

/**
 * Add a person to the allowlist.
 *
 * Access in this app hangs off `Singer`, so somebody who only ever needs to
 * READ the roster still needs a row here — there is no separate user table.
 * That is deliberate (SPEC §9.5): signing in never creates anybody, so being
 * on this list is an act a coordinator has to take.
 *
 * Name and email are both unique in the schema, and both collisions are things
 * a coordinator will actually hit — a second Ashwin, or pasting an address
 * already used by somebody else. Each gets its own message naming the clash,
 * rather than a Prisma constraint error.
 */
export type AddSingerState = { error?: string; added?: string };

/*
 * Returns its outcome instead of throwing. A throw from a Server Action
 * surfaces in production as "An error occurred in the Server Components
 * render", with the actual message stripped — so "Ashwin is already on the
 * list" became an opaque error page, which is worse than useless for the one
 * mistake a coordinator will actually make.
 */
export async function addSinger(
  _prev: AddSingerState,
  formData: FormData,
): Promise<AddSingerState> {
  await requireCapability("manageAllocations");

  const parsed = NewSinger.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    role: String(formData.get("role") ?? "singer"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Could not add that person." };
  }
  const { name, gender, role } = parsed.data;
  const email = normaliseEmail(parsed.data.email);

  const clash = await prisma.singer.findFirst({
    where: { OR: [{ name }, ...(email ? [{ email }] : [])] },
    select: { name: true, email: true },
  });
  if (clash) {
    return {
      error:
        clash.name === name
          ? `${name} is already on the list. Edit their row instead of adding a second one.`
          : `${email} is already set against ${clash.name}. One address, one person.`,
    };
  }

  await prisma.singer.create({
    data: {
      name,
      email,
      gender: gender ? (gender as "Gents" | "Ladies") : null,
      role,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/singers");

  return { added: name };
}

export type RemoveSingerState = { error?: string; removed?: string };

/**
 * Remove a person from the list entirely.
 *
 * REFUSES anybody who has ever been on a session. `SessionSlot.singerId` is
 * `onDelete: SetNull`, so deleting them would not delete their history — it
 * would ORPHAN it, silently detaching every bhajan they ever sang from the
 * person who sang it. That would corrupt the offset profiles, and the singer
 * table in CLAUDE.md would stop reproducing, which is the one thing the Phase 0
 * gate exists to catch.
 *
 * So this is for the case it is actually needed: a tester or a mis-typed name
 * added by mistake, with nothing behind them. For anybody real, revoking access
 * means clearing their address, which leaves the person and their history
 * intact — and the message says so rather than just refusing.
 */
export async function removeSinger(singerId: string): Promise<RemoveSingerState> {
  await requireCapability("manageAllocations");

  if (!singerId) return { error: "No such person." };

  const singer = await prisma.singer.findUnique({
    where: { id: singerId },
    select: { name: true },
  });
  if (!singer) return { error: "That person is no longer on the list." };

  const [slots, repertoire] = await Promise.all([
    prisma.sessionSlot.count({ where: { singerId } }),
    prisma.singerRepertoire.count({ where: { singerId } }),
  ]);

  if (slots > 0) {
    return {
      error:
        `${singer.name} has sung ${slots} time${slots === 1 ? "" : "s"}, so removing them would ` +
        `detach that history from the person who sang it. Clear their Google address instead — ` +
        `that revokes access and keeps the record.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    if (repertoire > 0) await tx.singerRepertoire.deleteMany({ where: { singerId } });
    await tx.singerAvailability.deleteMany({ where: { singerId } });
    await tx.micCushion.deleteMany({ where: { singerId } });
    await tx.singer.delete({ where: { id: singerId } });
  });

  revalidatePath("/admin");
  revalidatePath("/singers");
  return { removed: singer.name };
}
