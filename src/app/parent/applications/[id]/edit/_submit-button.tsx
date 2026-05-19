"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Check } from "lucide-react";

export function ReviewSubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-brand-500)] px-4 py-2 text-sm font-medium text-[color:var(--color-foreground-onbrand)] shadow-card transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-600)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        <>
          <Check className="size-4" aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}
