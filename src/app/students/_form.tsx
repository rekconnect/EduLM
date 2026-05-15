"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import type { StudentFormState } from "./_actions";

type StudentValues = {
  firstName?: string;
  lastName?: string;
  dob?: string | null;
  status?: "PROSPECT" | "ENROLLED" | "WITHDRAWN" | "GRADUATED";
};

export function StudentForm({
  action,
  initial,
  submitLabel,
}: {
  action: (state: StudentFormState, formData: FormData) => Promise<StudentFormState>;
  initial?: StudentValues;
  submitLabel: string;
}) {
  const t = useTranslations("students");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [state, formAction, pending] = useActionState<StudentFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field
          label={t("fieldFirstName")}
          htmlFor="firstName"
          required
          error={state.errors?.firstName}
        >
          <Input
            id="firstName"
            name="firstName"
            defaultValue={initial?.firstName ?? ""}
            required
            autoFocus
          />
        </Field>
        <Field
          label={t("fieldLastName")}
          htmlFor="lastName"
          required
          error={state.errors?.lastName}
        >
          <Input
            id="lastName"
            name="lastName"
            defaultValue={initial?.lastName ?? ""}
            required
          />
        </Field>
      </FormRow>

      <FormRow>
        <Field label={t("fieldDob")} htmlFor="dob" error={state.errors?.dob}>
          <Input
            id="dob"
            name="dob"
            type="date"
            defaultValue={initial?.dob ?? ""}
          />
        </Field>
        <Field label={t("fieldStatus")} htmlFor="status" error={state.errors?.status} required>
          <Select id="status" name="status" defaultValue={initial?.status ?? "PROSPECT"}>
            <option value="PROSPECT">{t("statusProspect")}</option>
            <option value="ENROLLED">{t("statusEnrolled")}</option>
            <option value="WITHDRAWN">{t("statusWithdrawn")}</option>
            <option value="GRADUATED">{t("statusGraduated")}</option>
          </Select>
        </Field>
      </FormRow>

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {tErrors("generic")}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/students"
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
