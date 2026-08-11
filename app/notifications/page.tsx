import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getSignedInSinger } from "@/lib/auth";
import { vapidPublicKey, pushConfigured } from "@/lib/push";
import { NotificationSwitch } from "./NotificationSwitch";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const me = await getSignedInSinger();

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <div className="mt-2 max-w-2xl text-sm text-on-surface-muted">
            Two kinds. If <strong>you are rostered</strong>, your phone alerts you and says which
            bhajan. If somebody else is, a quiet note appears that the roster for that day is up —
            no sound, no buzz. Only future sessions ever notify anybody.
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!pushConfigured ? (
            <p className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
              Not switched on for this deployment yet.
            </p>
          ) : (
            <NotificationSwitch vapidKey={vapidPublicKey()} signedIn={Boolean(me)} />
          )}

          <p className="text-xs text-on-surface-muted">
            Per device. Turning them on here covers this phone or laptop only, so do it on
            whichever you actually carry.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
