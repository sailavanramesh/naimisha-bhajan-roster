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
        "rounded-key border border-rule-surface bg-surface text-on-surface shadow-[0_1px_0_rgb(var(--brass)/0.25),0_18px_40px_-28px_rgb(0_0_0/0.9)]",
        props.className
      )}
    >
      {props.children}
    </section>
  );
}

export function CardHeader(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-4 sm:p-5", props.className)}>{props.children}</div>;
}

export function CardTitle(props: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("font-display text-xl font-semibold tracking-tight sm:text-2xl", props.className)}>
      {props.children}
    </h2>
  );
}

export function CardContent(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-4 pt-0 sm:p-5 sm:pt-0", props.className)}>{props.children}</div>;
}

/** A section heading inside a card. */
export function SectionTitle(props: { children: React.ReactNode; className?: string }) {
  return (
    <h3
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-muted",
        props.className
      )}
    >
      {props.children}
    </h3>
  );
}

// ---------- Inputs ----------
const fieldBase =
  "h-11 w-full rounded-key border border-rule-surface bg-white/70 px-3 text-sm text-on-surface " +
  "placeholder:text-on-surface-muted disabled:cursor-not-allowed disabled:opacity-50";

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
    brass: "border-brass/50 bg-brass/12 text-on-surface",
    warn: "border-warn/60 bg-warn/12 text-on-surface",
    neutral: "border-rule-surface bg-black/[0.04] text-on-surface-muted",
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
    primary: "bg-ink text-ivory hover:bg-ink/90 border border-ink",
    secondary: "border border-rule-surface bg-white/60 text-on-surface hover:bg-white",
    quiet: "border border-transparent text-on-surface-muted hover:bg-black/[0.05]",
    // NOT kumkum. SPEC §6 reserves it for pitch deviation, explicitly
    // excluding buttons and errors. A destructive action is carried by its
    // label and a firm outline instead.
    danger: "border border-on-surface/40 text-on-surface hover:bg-black/[0.06]",
  };

  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-key px-4 text-sm font-medium transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
