"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
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

export async function addRepertoireEntry(formData: FormData): Promise<void> {
  await requireCapability("manageAllocations");
  const parsed = RepertoireAdd.safeParse({
    singerId: String(formData.get("singerId") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    kind: String(formData.get("kind") ?? "known"),
  });
  if (!parsed.success) throw new Error("Could not add: a singer and a bhajan title are required.");
  const { singerId, title, kind } = parsed.data;

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
  role: z.enum(["coordinator", "singer"]),
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
  const { singerId, email, role } = parsed.data;

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
    data: { email: email || null, role: role as "coordinator" | "singer" },
  });

  revalidatePath("/admin");
}

const NewSinger = z.object({
  name: z.string().trim().min(1, "a name is needed").max(80),
  email: z.string().trim().email("that is not an email address").or(z.literal("")),
  gender: z.enum(["Gents", "Ladies", ""]),
  role: z.enum(["coordinator", "singer"]),
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
  const { name, email, gender, role } = parsed.data;

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
      email: email || null,
      gender: gender ? (gender as "Gents" | "Ladies") : null,
      role,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/singers");

  return { added: name };
}
