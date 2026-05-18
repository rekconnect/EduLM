"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
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
        <p className="text-sm text-red-600" role="alert">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? tCommon("loading") : t("signUpSubmit")}
      </Button>
    </form>
  );
}
