"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function SignInSubmit({
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
      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[color:var(--lm-primary,var(--color-brand-500))] px-4 py-2.5 text-sm font-medium text-[color:var(--color-foreground-onbrand)] shadow-card transition duration-150 ease-out hover:bg-[color:var(--lm-primary-hover,var(--color-brand-600))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span>{pendingLabel}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}
