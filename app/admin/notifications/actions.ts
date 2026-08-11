"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability, getSignedInSinger } from "@/lib/auth";
import { ruleProblem } from "@/lib/nudgeRules";

const Input = z.object({
  scope: z.enum(["default", "weekday", "session"]),
  weekday: z.number().int().min(0).max(6).nullable(),
  sessionId: z.string().min(1).nullable(),
  firstHour: z.number().int().min(0).max(23),
  /** Empty means "no second reminder", which is a real choice. */
  finalHour: z.number().int().min(0).max(23).nullable(),
  stopAfterHour: z.number().int().min(0).max(23),
  enabled: z.boolean(),
});

/**
 * Save one notification rule.
 *
 * Owner only. Editors run the roster; deciding when the app buzzes a dozen
 * people is a different kind of power and has its own capability.
 *
 * Nothing here resends anything. Sailavan chose that a rule change applies to
 * reminders still due, never to ones already delivered — which falls out of
 * SessionNotice being consulted on every run rather than needing any code
 * here: an owner cannot re-buzz somebody by fiddling with a form.
 */
export async function saveNotificationRule(input: {
  scope: "default" | "weekday" | "session";
  weekday: number | null;
  sessionId: string | null;
  firstHour: number;
  finalHour: number | null;
  stopAfterHour: number;
  enabled: boolean;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireCapability("manageNotificationRules");

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those hours are not valid." };
  const v = parsed.data;

  if (v.scope === "weekday" && v.weekday === null) {
    return { ok: false, error: "A weekday rule needs a day." };
  }
  if (v.scope === "session" && !v.sessionId) {
    return { ok: false, error: "A one-off needs a session." };
  }

  // Checked here as well as in the form: a rule that can never fire goes quiet
  // rather than failing, and an owner would have no way to tell that from a bug.
  const problem = ruleProblem({
    firstHour: v.firstHour,
    finalHour: v.finalHour,
    stopAfterHour: v.stopAfterHour,
    enabled: v.enabled,
  });
  if (problem) return { ok: false, error: problem };

  const me = await getSignedInSinger();
  const data = {
    firstHour: v.firstHour,
    finalHour: v.finalHour,
    stopAfterHour: v.stopAfterHour,
    enabled: v.enabled,
    updatedBy: me?.name ?? null,
  };

  /*
   * Find-then-write rather than upsert.
   *
   * The unique key is (scope, weekday, sessionId), and Postgres treats NULLs
   * as distinct — so the default rule, whose weekday and sessionId are both
   * null, would happily insert twice and resolution would start depending on
   * row order. A partial unique index would fix it in the database, but Prisma
   * does not know about indexes it did not create and would report the drift
   * on every future migrate. So the singleton is enforced here.
   */
  const existing = await prisma.notificationRule.findFirst({
    where: { scope: v.scope, weekday: v.weekday, sessionId: v.sessionId },
    select: { id: true },
  });

  if (existing) {
    await prisma.notificationRule.update({ where: { id: existing.id }, data });
  } else {
    await prisma.notificationRule.create({
      data: { scope: v.scope, weekday: v.weekday, sessionId: v.sessionId, ...data },
    });
  }

  revalidatePath("/admin/notifications");
  return { ok: true, message: "Saved." };
}

/**
 * Drop a rule so its scope falls through to the next one out.
 *
 * Different from disabling it: removing the Sunday rule means Sundays go back
 * to the default, where disabling it means Sundays send nothing.
 */
export async function clearNotificationRule(input: {
  scope: "weekday" | "session";
  weekday: number | null;
  sessionId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCapability("manageNotificationRules");

  if (input.scope === "weekday" && input.weekday === null) {
    return { ok: false, error: "Nothing to clear." };
  }
  await prisma.notificationRule.deleteMany({
    where: { scope: input.scope, weekday: input.weekday, sessionId: input.sessionId },
  });

  revalidatePath("/admin/notifications");
  return { ok: true };
}
