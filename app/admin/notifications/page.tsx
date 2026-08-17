import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { melbourneTodayISO } from "@/lib/dates";
import {
  BUILT_IN_RULE,
  describeRule,
  resolveRule,
  weekdayOfISO,
  WEEKDAY_NAMES,
  type ScopedRule,
} from "@/lib/nudgeRules";
import { RuleRow, type RuleRowValue } from "./RuleRow";
import { NOT_ARCHIVED } from "@/lib/archive";

export const dynamic = "force-dynamic";

/**
 * Admin → Notifications. Owner only.
 *
 * The 3pm and 5pm reminders were constants until 2026-08-12. Sailavan: "the
 * majority of sessions are PM, but sometimes they can be AM" — and a 3pm
 * reminder for a session that finished at noon is worse than no reminder,
 * because it teaches people the app is wrong about time.
 *
 * Three levels, most specific first: this session, then its weekday, then the
 * default. So "Sundays here run in the morning" is said once, and a one-off
 * festival is an override that disturbs nothing else.
 *
 * Editors deliberately cannot reach this. Running the roster and deciding when
 * a dozen phones buzz are different kinds of power.
 */
export default async function NotificationRulesPage() {
  const role = await getRole();
  if (!can(role, "manageNotificationRules")) {
    return <NoAccess what="The notification rules" role={role} />;
  }

  const today = melbourneTodayISO();
  const [rows, sessions] = await Promise.all([
    prisma.notificationRule.findMany(),
    prisma.session.findMany({
      where: { ...NOT_ARCHIVED, date: { gte: new Date(`${today}T00:00:00.000Z`) } },
      orderBy: { date: "asc" },
      take: 8,
      select: { id: true, date: true, _count: { select: { slots: true } } },
    }),
  ]);

  const rules: ScopedRule[] = rows.map((r) => ({
    scope: r.scope,
    weekday: r.weekday,
    sessionId: r.sessionId,
    firstHour: r.firstHour,
    finalHour: r.finalHour,
    stopAfterHour: r.stopAfterHour,
    enabled: r.enabled,
  }));

  const find = (scope: ScopedRule["scope"], weekday: number | null, sessionId: string | null) => {
    const hit = rules.find(
      (r) => r.scope === scope && r.weekday === weekday && r.sessionId === sessionId,
    );
    return hit
      ? ({
          firstHour: hit.firstHour,
          finalHour: hit.finalHour,
          stopAfterHour: hit.stopAfterHour,
          enabled: hit.enabled,
        } satisfies RuleRowValue)
      : null;
  };

  const defaultRule = find("default", null, null) ?? BUILT_IN_RULE;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>When people get reminded</CardTitle>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-muted">
            On the day of a session, anybody rostered whose row still has no bhajan or no
            confirmed pitch is reminded. These are the hours that happens at, in Melbourne
            time. The most specific rule wins: a session&rsquo;s own beats its
            weekday&rsquo;s, which beats the default.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-on-surface-muted">
            Changing a rule never resends anything already delivered — it only affects
            reminders still to come.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <RuleRow
            scope="default"
            weekday={null}
            sessionId={null}
            title="Every session"
            subtitle="Used when nothing more specific is set."
            initial={find("default", null, null)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By day of the week</CardTitle>
          <p className="mt-1 text-sm text-on-surface-muted">
            For a day that reliably runs at a different time — a Sunday morning, say. Leave a
            day alone and it follows the rule above.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2">
          {WEEKDAY_NAMES.map((name, day) => (
            <RuleRow
              key={day}
              scope="weekday"
              weekday={day}
              sessionId={null}
              title={name}
              initial={find("weekday", day, null)}
              inherited={describeRule(defaultRule)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>One-offs</CardTitle>
          <p className="mt-1 text-sm text-on-surface-muted">
            The next few sessions. Use this for a festival that does not run at its usual
            time; it changes that day only.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-on-surface-muted">Nothing scheduled yet.</p>
          ) : (
            sessions.map((s) => {
              const iso = s.date.toISOString().slice(0, 10);
              const weekday = weekdayOfISO(iso);
              const label = new Date(`${iso}T12:00:00.000Z`).toLocaleDateString("en-AU", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "UTC",
              });
              return (
                <RuleRow
                  key={s.id}
                  scope="session"
                  weekday={null}
                  sessionId={s.id}
                  title={label}
                  subtitle={`${s._count.slots} row${s._count.slots === 1 ? "" : "s"}`}
                  initial={find("session", null, s.id)}
                  inherited={describeRule(resolveRule(rules, { id: s.id, weekday }))}
                />
              );
            })
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-on-surface-muted">
        <Link href="/admin" className="underline underline-offset-2">
          Back to Admin
        </Link>
      </p>
    </div>
  );
}
