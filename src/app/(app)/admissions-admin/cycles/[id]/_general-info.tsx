"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import type { CycleFormState } from "../../_actions";

export function CycleGeneralInfoForm({
  cycleId,
  action,
  initial,
}: {
  cycleId: string;
  action: (state: CycleFormState, formData: FormData) => Promise<CycleFormState>;
  initial: {
    label: string;
    targetYearLabel: string;
    openAt: string;
    closeAt: string;
    schoolStartDate: string;
    inscriptionFee: string;
    currency: string;
    description: string;
    isActive: boolean;
  };
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<CycleFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field
          label={t("cycleFieldLabel")}
          htmlFor={`label-${cycleId}`}
          required
          error={state.errors?.label}
        >
          <Input
            id={`label-${cycleId}`}
            name="label"
            defaultValue={initial.label}
            required
          />
        </Field>
        <Field
          label={t("cycleFieldTargetYear")}
          htmlFor={`tyl-${cycleId}`}
          required
          error={state.errors?.targetYearLabel}
        >
          <Input
            id={`tyl-${cycleId}`}
            name="targetYearLabel"
            defaultValue={initial.targetYearLabel}
            required
          />
        </Field>
      </FormRow>

      <FormRow>
        <Field
          label={t("cycleFieldOpenAt")}
          htmlFor={`open-${cycleId}`}
          required
          error={state.errors?.openAt}
        >
          <Input
            id={`open-${cycleId}`}
            name="openAt"
            type="date"
            defaultValue={initial.openAt}
            required
          />
        </Field>
        <Field
          label={t("cycleFieldCloseAt")}
          htmlFor={`close-${cycleId}`}
          error={state.errors?.closeAt}
          hint={t("cycleFieldCloseAtHint")}
        >
          <Input
            id={`close-${cycleId}`}
            name="closeAt"
            type="date"
            defaultValue={initial.closeAt}
          />
        </Field>
        <Field
          label={t("cycleFieldSchoolStartDate")}
          htmlFor={`start-${cycleId}`}
          error={state.errors?.schoolStartDate}
          hint={t("cycleFieldSchoolStartDateHint")}
        >
          <Input
            id={`start-${cycleId}`}
            name="schoolStartDate"
            type="date"
            defaultValue={initial.schoolStartDate}
          />
        </Field>
      </FormRow>

      <FormRow>
        <Field
          label={t("cycleFieldFee")}
          htmlFor={`fee-${cycleId}`}
          error={state.errors?.inscriptionFee}
        >
          <Input
            id={`fee-${cycleId}`}
            name="inscriptionFee"
            inputMode="decimal"
            defaultValue={initial.inscriptionFee}
            placeholder="200"
          />
        </Field>
        <Field
          label={tCommon("currency")}
          htmlFor={`cur-${cycleId}`}
          error={state.errors?.currency}
        >
          <Select
            id={`cur-${cycleId}`}
            name="currency"
            defaultValue={initial.currency}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="LBP">LBP</option>
          </Select>
        </Field>
      </FormRow>

      <Field
        label={t("cycleFieldDescription")}
        htmlFor={`desc-${cycleId}`}
      >
        <Textarea
          id={`desc-${cycleId}`}
          name="description"
          rows={3}
          defaultValue={initial.description}
        />
      </Field>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial.isActive}
        />
        <span>{t("cycleFieldActive")}</span>
      </label>

      {state.formError ? (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
