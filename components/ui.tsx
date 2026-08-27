import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Array<string | undefined | null | false>) {
  return twMerge(clsx(inputs));
}

/**
 * Primitives on the harmonium palette (docs/SPEC.md §6).
 *
 * The ground is lacquer-dark; cards are ivory, like keys laid on the case.
 * Brass carries structure. `kumkum` appears in exactly one place in the whole
 * app — pitch deviation — and never here.
 *
 * Every interactive element is at least 40px tall: this is read and tapped on
 * a phone, standing up, in a hall.
 */

// ---------- Card ----------
export function Card(props: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        // A warm panel lifted off the lacquer, edged with a brass hairline —
        // not a cream slab. The top highlight is the light catching the edge.
        "rounded-[14px] border border-card-edge bg-surface text-on-surface",
        // Cards are laid out in grids, and a grid item defaults to
        // `min-width: auto` — it will not shrink below its own content. One
        // wide thing inside a card therefore pushed the card past the screen
        // and the whole page slid sideways at 375px. Anything genuinely wide
        // scrolls in its own overflow-x-auto box instead.
        "min-w-0",
        "shadow-[0_1px_2px_rgb(var(--ink)/0.04),0_12px_28px_-20px_rgb(var(--ink)/0.18)]",
        props.className
      )}
    >
      {props.children}
    </section>
  );
}

export function CardHeader(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-5 sm:p-6", props.className)}>{props.children}</div>;
}

export function CardTitle(props: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("font-display text-[22px] font-semibold leading-tight tracking-[-0.01em] sm:text-[26px]", props.className)}>
      {props.children}
    </h2>
  );
}

/**
 * The body of a card.
 *
 * `pt-0` because it normally hangs under a CardHeader, whose own padding has
 * already stood the content off the top edge.
 *
 * A CARD WITH NO HEADER MUST SAY ITS TOP PADDING AT BOTH WIDTHS — `py-3
 * sm:py-3`, and the repetition is the point. An unprefixed `py-3` does not
 * override `sm:pt-0`: they are different modifiers, so tailwind-merge keeps
 * both and the media query wins from 640px up. The content then sits flat
 * against the top edge of the card on every screen bigger than a phone.
 *
 * Which is what happened to the running order — 12px above and below on a
 * phone, nothing above and 24px below on a laptop. Sailavan: "the text of the
 * card is too close to the upper margin of the card".
 */
export function CardContent(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-5 pt-0 sm:p-6 sm:pt-0", props.className)}>{props.children}</div>;
}

/** A section heading inside a card. */
export function SectionTitle(props: { children: React.ReactNode; className?: string }) {
  return (
    <h3
      className={cn(
        // Letterspaced small caps in brass: the quiet structural label that
        // makes a page read as composed rather than assembled.
        "text-[11px] font-semibold uppercase tracking-[0.18em] text-brass-ink",
        props.className
      )}
    >
      {props.children}
    </h3>
  );
}

// ---------- Inputs ----------
const fieldBase =
  "h-11 w-full rounded-[10px] border border-rule-surface bg-field px-3 text-sm text-on-surface " +
  "placeholder:text-on-surface-muted/70 transition-colors hover:border-brass/50 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, className)} {...props} />;
  }
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(fieldBase, className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldBase, "min-h-[96px] py-2.5 leading-6", className)}
      {...props}
    />
  );
});

export function FieldLabel(props: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-1 text-xs font-semibold text-on-surface-muted", props.className)}>
      {props.children}
    </div>
  );
}

// ---------- Badge ----------
export function Badge(props: {
  children: React.ReactNode;
  tone?: "brass" | "warn" | "neutral";
  className?: string;
}) {
  const tone = props.tone ?? "neutral";
  const tones: Record<string, string> = {
    brass: "border-brass/40 bg-brass/[0.14] text-brass-ink",
    warn: "border-warn/45 bg-warn/[0.10] text-warn",
    neutral: "border-rule-surface bg-panel text-on-surface-muted",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5",
        tones[tone],
        props.className
      )}
    >
      {props.children}
    </span>
  );
}

/**
 * A number that must not shift width while re-rolling: pitch labels, counts,
 * semitone deltas. `deviation` is the ONE place kumkum is allowed.
 */
export function Figure(props: {
  children: React.ReactNode;
  deviation?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono tabular",
        props.deviation ? "font-semibold text-kumkum" : undefined,
        props.className
      )}
    >
      {props.children}
    </span>
  );
}

// ---------- Buttons ----------
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
};

export function Button({ className, variant = "secondary", ...props }: ButtonProps) {
  const variants: Record<string, string> = {
    primary: "border border-brass-ink/80 bg-brass-ink text-ivory hover:bg-brass-ink/90 font-semibold",
    secondary: "border border-rule-surface bg-surface text-on-surface hover:border-brass/50 hover:bg-panel",
    quiet: "border border-transparent text-on-surface-muted hover:bg-panel-hover hover:text-on-surface",
    // NOT kumkum. SPEC §6 reserves it for pitch deviation, explicitly
    // excluding buttons and errors. A destructive action is carried by its
    // label and a firm outline instead.
    danger: "border border-on-surface/30 text-on-surface-muted hover:border-on-surface/60 hover:text-on-surface",
  };

  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-sm font-medium transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
