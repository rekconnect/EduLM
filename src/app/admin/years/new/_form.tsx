"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { createYear, type YearFormState } from "../_actions";

export function YearForm() {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<YearFormState, FormData>(createYear, {});

  return (
    <form action={formAction} className="space-y-5">
      <Field
        label={t("yearFieldLabel")}
        htmlFor="label"
        required
        error={
          state.errors?.label === "yearAlreadyExists"
            ? t("yearAlreadyExists")
            : state.errors?.label
        }
      >
        <Input id="label" name="label" required autoFocus placeholder="2026-2027" />
      </Field>
      <FormRow>
        <Field label={t("yearFieldStart")} htmlFor="startDate" required error={state.errors?.startDate}>
          <Input id="startDate" name="startDate" type="date" required defaultValue="2026-09-01" />
        </Field>
        <Field label={t("yearFieldEnd")} htmlFor="endDate" required error={state.errors?.endDate}>
          <Input id="endDate" name="endDate" type="date" required defaultValue="2027-06-30" />
        </Field>
      </FormRow>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" />
        <span>{t("yearFieldActive")}</span>
      </label>

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/admin/years"
          className="inline-flex items-center rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--muted)]"
        >
          {tCommon("cancel")}
        </a>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}
