"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { createCycle, type CycleFormState } from "../../_actions";

export function CycleForm() {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<CycleFormState, FormData>(createCycle, {});

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field label={t("cycleFieldLabel")} htmlFor="label" required error={state.errors?.label}>
          <Input
            id="label"
            name="label"
            required
            autoFocus
            placeholder="Inscriptions 2026-2027"
          />
        </Field>
        <Field
          label={t("cycleFieldTargetYear")}
          htmlFor="targetYearLabel"
          required
          error={state.errors?.targetYearLabel}
        >
          <Input id="targetYearLabel" name="targetYearLabel" required placeholder="2026-2027" />
        </Field>
      </FormRow>

      <FormRow>
        <Field label={t("cycleFieldOpenAt")} htmlFor="openAt" required error={state.errors?.openAt}>
          <Input id="openAt" name="openAt" type="date" defaultValue={today} required />
        </Field>
        <Field label={t("cycleFieldCloseAt")} htmlFor="closeAt" error={state.errors?.closeAt}>
          <Input id="closeAt" name="closeAt" type="date" />
        </Field>
      </FormRow>

      <FormRow>
        <Field label={t("cycleFieldFee")} htmlFor="inscriptionFee" error={state.errors?.inscriptionFee}>
          <Input id="inscriptionFee" name="inscriptionFee" inputMode="decimal" placeholder="200" />
        </Field>
        <Field label={tCommon("save")} htmlFor="currency" error={state.errors?.currency}>
          <Select id="currency" name="currency" defaultValue="USD">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="LBP">LBP</option>
          </Select>
        </Field>
      </FormRow>

      <Field label={t("cycleFieldDescription")} htmlFor="description">
        <Textarea id="description" name="description" rows={3} />
      </Field>

      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked />
        <span>{t("cycleFieldActive")}</span>
      </label>

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/admissions-admin/cycles"
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
