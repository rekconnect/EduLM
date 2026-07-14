"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import type { FormState } from "../_actions";

const TYPES = ["Employée", "Professeur", "Vacataire", "Honoraire", "Autre"];

export type EmployeeInitial = {
  displayName: string;
  jobTitle: string | null;
  department: string | null;
  employmentType: string | null;
  active: boolean;
  recruitedAt: string | null;
};

export function EmployeeForm({
  action,
  initial,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial?: EmployeeInitial;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field label="Nom complet" htmlFor="displayName" required error={state.errors?.displayName}>
          <Input id="displayName" name="displayName" defaultValue={initial?.displayName ?? ""} required />
        </Field>
        <Field label="Type d'emploi" htmlFor="employmentType">
          <Select id="employmentType" name="employmentType" defaultValue={initial?.employmentType ?? ""}>
            <option value="">—</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Poste" htmlFor="jobTitle">
          <Input id="jobTitle" name="jobTitle" defaultValue={initial?.jobTitle ?? ""} />
        </Field>
        <Field label="Département" htmlFor="department">
          <Input id="department" name="department" defaultValue={initial?.department ?? ""} />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Date de recrutement" htmlFor="recruitedAt" error={state.errors?.recruitedAt}>
          <Input id="recruitedAt" name="recruitedAt" type="date" defaultValue={initial?.recruitedAt ?? ""} />
        </Field>
        <Field label="Statut" htmlFor="active">
          <label className="inline-flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
            Actif
          </label>
        </Field>
      </FormRow>

      {state.formError ? (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/payroll"
          className="inline-flex items-center rounded-md border border-[color:var(--color-border-subtle)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[color:var(--color-surface-hover)]"
        >
          Annuler
        </a>
        <Button type="submit" disabled={pending}>
          {pending ? "…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
