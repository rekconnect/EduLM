"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import type { DisciplineFormState } from "./_actions";

export type StudentOption = { id: string; firstName: string; lastName: string };

export function DisciplineForm({
  action,
  students,
  defaultStudentId,
  submitLabel,
}: {
  action: (state: DisciplineFormState, formData: FormData) => Promise<DisciplineFormState>;
  students: StudentOption[];
  defaultStudentId?: string;
  submitLabel: string;
}) {
  const t = useTranslations("discipline");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<DisciplineFormState, FormData>(action, {});

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field
          label={t("fieldStudent")}
          htmlFor="studentId"
          required
          error={state.errors?.studentId}
        >
          <Select id="studentId" name="studentId" required defaultValue={defaultStudentId ?? ""}>
            <option value="" disabled>
              —
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.lastName} {s.firstName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("fieldSeverity")} htmlFor="severity" required error={state.errors?.severity}>
          <Select id="severity" name="severity" defaultValue="WARNING">
            <option value="NOTE">{t("severityNote")}</option>
            <option value="WARNING">{t("severityWarning")}</option>
            <option value="DETENTION">{t("severityDetention")}</option>
            <option value="SUSPENSION">{t("severitySuspension")}</option>
          </Select>
        </Field>
      </FormRow>

      <FormRow>
        <Field label={t("fieldType")} htmlFor="type" required error={state.errors?.type}>
          <Input id="type" name="type" required placeholder="ex. Bavardage" />
        </Field>
        <Field label={t("fieldDate")} htmlFor="date" error={state.errors?.date}>
          <Input id="date" name="date" type="date" defaultValue={today} />
        </Field>
      </FormRow>

      <Field
        label={t("fieldDescription")}
        htmlFor="description"
        required
        error={state.errors?.description}
      >
        <Textarea id="description" name="description" required rows={4} />
      </Field>

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/discipline"
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
