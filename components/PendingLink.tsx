"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { Button, cn } from "@/components/ui";

/**
 * A link that admits it is working.
 *
 * Sailavan, 2026-08-21: "show me another set is a bit slow".
 *
 * Measured on dev the same day, it is about 400ms — 180ms of that the plain
 * cost of reaching australiaeast at all, and the rest the page. Rendering one
 * bhajan instead of fifty makes no difference to it, so there is not much left
 * to take out on the server: for a set drawn from 3,607 bhajans against live
 * sung history, a round trip is the honest answer.
 *
 * What was missing was any sign that the tap had registered. Re-roll is a
 * navigation to the same route with a new seed, and Next holds the old screen
 * until the new payload arrives — so for those 400ms the list sat there
 * unchanged, showing the set you had just asked to be rid of. In a hall, on
 * phone data, that reads as a button that does not work, and the natural
 * response is to press it again.
 *
 * `useLinkStatus` is the pending state of the enclosing Link, so this needs no
 * state of its own and cannot get out of step with the navigation. Going
 * disabled is the point as much as the spinner is: it stops the second tap,
 * which would otherwise queue a second set nobody asked for.
 *
 * The spinner is a CSS animation, so the global `prefers-reduced-motion` rule in
 * globals.css stops it. That is why the label changes too — with motion off, the
 * word is the whole signal.
 */
export function PendingLink({
  href,
  children,
  busyLabel,
  variant = "secondary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  /**
   * What the button says while the next set is on its way. Omit on a narrow
   * control — the label then stays put and only the spinner appears, so the
   * button does not change width and shift the row it sits in.
   */
  busyLabel?: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  className?: string;
}) {
  return (
    <Link href={href} scroll={false}>
      <PendingButton busyLabel={busyLabel} variant={variant} className={className}>
        {children}
      </PendingButton>
    </Link>
  );
}

function PendingButton({
  children,
  busyLabel,
  variant,
  className,
}: {
  children: React.ReactNode;
  busyLabel?: string;
  variant: "primary" | "secondary" | "quiet" | "danger";
  className?: string;
}) {
  const { pending } = useLinkStatus();

  return (
    <Button
      type="button"
      variant={variant}
      aria-busy={pending}
      disabled={pending}
      className={cn("gap-2", pending && "cursor-wait opacity-70", className)}
    >
      {pending ? (
        <>
          <span
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {busyLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
