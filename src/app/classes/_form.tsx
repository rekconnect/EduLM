"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import type { ClassFormState } from "./_actions";

export function ClassForm({
  action,
  submitLabel,
}: {
  action: (state: ClassFormState, formData: FormData) => Promise<ClassFormState>;
  submitLabel: string;
}) {
  const t = useTranslations("classes");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<ClassFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field label={t("fieldLevel")} htmlFor="level" required error={state.errors?.level}>
          <Input id="level" name="level" required autoFocus />
        </Field>
        <Field label={t("fieldSection")} htmlFor="section" required error={state.errors?.section}>
          <Input id="section" name="section" required />
        </Field>
      </FormRow>
      <Field label={t("fieldName")} htmlFor="name" required error={state.errors?.name}>
        <Input id="name" name="name" required placeholder="6ème-A" />
      </Field>

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/classes"
          className="inline-flex items-center rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--muted)]"
        >
          {tCommon("cancel")}
        </a>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
