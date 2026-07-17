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
  email: string | null;
  supervisorId: string | null;
  taxCategory: string | null;
  defaultDaysPerMonth: number | null;
  kmDistance: number | null;
};

export function EmployeeForm({
  action,
  initial,
  submitLabel,
  supervisors = [],
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial?: EmployeeInitial;
  submitLabel: string;
  supervisors?: { id: string; displayName: string }[];
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

      <Field label="Responsable (validation des demandes)" htmlFor="supervisorId">
        <Select id="supervisorId" name="supervisorId" defaultValue={initial?.supervisorId ?? ""}>
          <option value="">— Aucun —</option>
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </Select>
      </Field>

      <FormRow>
        <Field label="Catégorie NSF/impôt" htmlFor="taxCategory">
          <Input
            id="taxCategory"
            name="taxCategory"
            defaultValue={initial?.taxCategory ?? ""}
            placeholder="Ex. Professeur, Admin"
          />
        </Field>
        <Field label="Jours/mois (fixe, facultatif)" htmlFor="defaultDaysPerMonth" error={state.errors?.defaultDaysPerMonth}>
          <Input
            id="defaultDaysPerMonth"
            name="defaultDaysPerMonth"
            type="number"
            min="0"
            max="31"
            defaultValue={initial?.defaultDaysPerMonth ?? ""}
            placeholder="jours ouvrés du mois"
          />
        </Field>
      </FormRow>

      <Field label="Distance domicile → école (km, aller simple)" htmlFor="kmDistance">
        <Input
          id="kmDistance"
          name="kmDistance"
          inputMode="decimal"
          defaultValue={initial?.kmDistance ?? ""}
          placeholder="0"
        />
      </Field>

      <div>
        <Field label="E-mail professionnel (accès portail)" htmlFor="email" error={state.errors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            placeholder="prenom.nom@lycee-montaigne.edu.lb"
            autoComplete="off"
          />
        </Field>
        <p className="mt-1.5 text-xs text-[color:var(--color-foreground-muted)]">
          Donne accès au portail du personnel via la connexion Microsoft — aucun mot de passe à
          créer. Laisser vide pour ne pas ouvrir d&apos;accès.
        </p>
      </div>

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
