import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/auth";

/**
 * Shown instead of a page the role cannot use.
 *
 * The nav already hides those pages, but hiding a link is not a permission —
 * anyone can type the URL, so each page checks for itself.
 */
export function NoAccess({ what, role }: { what: string; role: Role }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Not available at your access level</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm text-on-surface-muted">
        <p>
          {what} needs <strong>Editor</strong> access. You are currently{" "}
          <strong>{ROLE_LABELS[role]}</strong>.
        </p>
        <p>
          Ask the coordinator for an editor link, or go back to the{" "}
          <Link href="/roster" className="text-brass-ink underline underline-offset-2">
            roster
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
