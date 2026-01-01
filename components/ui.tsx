import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Array<string | undefined | null | false>) {
  return twMerge(clsx(inputs));
}

// ---------- Card ----------
export function Card(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border bg-white", props.className)}>{props.children}</div>;
}

export function CardHeader(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-4 sm:p-5", props.className)}>{props.children}</div>;
}

export function CardTitle(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-lg font-semibold", props.className)}>{props.children}</div>;
}

export function CardContent(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-4 pt-0 sm:p-5 sm:pt-0", props.className)}>{props.children}</div>;
}

// ---------- Inputs ----------
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none",
          "focus:ring-2 focus:ring-black/10",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none",
          "focus:ring-2 focus:ring-black/10",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[90px] w-full rounded-xl border bg-white p-3 text-sm outline-none",
          "focus:ring-2 focus:ring-black/10",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);

export function FieldLabel(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-1 text-xs font-semibold text-gray-600", props.className)}>{props.children}</div>;
}

// ---------- Badge ----------
export function Badge(props: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "neutral";
  className?: string;
}) {
  const tone = props.tone ?? "neutral";
  const tones: Record<string, string> = {
    success: "bg-green-50 text-green-800 border-green-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
    neutral: "bg-gray-50 text-gray-800 border-gray-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        tones[tone],
        props.className
      )}
    >
      {props.children}
    </span>
  );
}

// ---------- Buttons ----------
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export function Button({ className, variant = "secondary", ...props }: ButtonProps) {
  const variants: Record<string, string> = {
    primary: "bg-black text-white hover:bg-black/90",
    secondary: "border bg-white hover:bg-gray-50",
    danger: "border border-red-300 text-red-700 hover:bg-red-50",
  };

  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium transition",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
