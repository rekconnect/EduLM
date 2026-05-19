"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { signUpParent, type SignUpFormState } from "./_actions";

export function SignUpForm({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<SignUpFormState, FormData>(
    signUpParent,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <Field label={t("signUpName")} htmlFor="name" required error={state.errors?.name}>
        <Input id="name" name="name" required autoFocus autoComplete="name" />
      </Field>
      <Field
        label={t("signUpEmail")}
        htmlFor="email"
        required
        error={
          state.errors?.email === "exists" ? t("signUpEmailExists") : state.errors?.email
        }
      >
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field
        label={t("signUpPassword")}
        htmlFor="password"
        required
        error={state.errors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>

      {state.formError ? (
        <div
          role="alert"
          className="rounded-md border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger-soft)] px-3 py-2 text-sm text-[color:var(--color-danger-soft-fg)]"
        >
          {state.formError}
        </div>
      ) : null}

      <Button
        type="submit"
        className="w-full gap-2"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {tCommon("loading")}
          </>
        ) : (
          t("signUpSubmit")
        )}
      </Button>
    </form>
  );
}
