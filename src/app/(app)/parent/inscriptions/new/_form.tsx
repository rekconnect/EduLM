"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { createDossier, type DossierFormState } from "../_actions";

export type CycleOption = {
  id: string;
  label: string;
  targetYearLabel: string;
};

export type EstablishmentOption = {
  id: string;
  name: string;
  levels: string[];
};

/**
 * "Créer un dossier" — Eduka-style two-card create flow.
 *
 *   Card 1: Nouvel élève à inscrire   (last + first name + DOB)
 *   Card 2: Scolarité souhaitée       (read-only École · Établissement → Niveau cascade)
 *
 * Submitting redirects the parent to /parent/applications (the
 * Mes inscriptions list) where the new draft is visible alongside
 * any existing dossiers.
 */
export function DossierForm({
  cycles,
  establishments,
  schoolName,
}: {
  cycles: CycleOption[];
  establishments: EstablishmentOption[];
  schoolName: string;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<DossierFormState, FormData>(
    createDossier,
    {},
  );

  // If more than one cycle is open at once (rare), the parent picks. Common
  // case: exactly one cycle — hidden field, no UI clutter.
  const [cycleId, setCycleId] = useState<string>(cycles[0]?.id ?? "");
  const [establishmentId, setEstablishmentId] = useState<string>("");

  // Cascading: the niveau dropdown's options come from the selected
  // establishment's levels array. Empty array → free-text input fallback.
  const selectedEstablishment = useMemo(
    () => establishments.find((e) => e.id === establishmentId),
    [establishmentId, establishments],
  );

  return (
    <form action={formAction} className="space-y-6">
      {/* ── Card 1: Nouvel élève à inscrire ── */}
      <Card>
        <CardHeader title={t("dossierStudentTitle")} />
        <CardBody className="space-y-4">
          <FormRow>
            <Field
              label={t("dossierFieldLastName")}
              htmlFor="childLastName"
              required
              error={state.errors?.childLastName}
            >
              <Input
                id="childLastName"
                name="childLastName"
                required
                autoFocus
                maxLength={80}
              />
            </Field>
            <Field
              label={t("dossierFieldFirstName")}
              htmlFor="childFirstName"
              required
              error={state.errors?.childFirstName}
            >
              <Input
                id="childFirstName"
                name="childFirstName"
                required
                maxLength={80}
              />
            </Field>
          </FormRow>
          <Field
            label={t("dossierFieldDob")}
            htmlFor="childDob"
            required
            error={state.errors?.childDob}
          >
            <Input id="childDob" name="childDob" type="date" required />
          </Field>
        </CardBody>
      </Card>

      {/* ── Card 2: Scolarité souhaitée ── */}
      <Card>
        <CardHeader title={t("dossierScolariteTitle")} />
        <CardBody className="space-y-4">
          {/* École — read-only, pulled from Tenant.name. The parent
              cannot change which school they're applying to from inside
              the dossier; that's settled by their tenant context. */}
          <Field label={t("dossierFieldSchool")} htmlFor="school">
            <Input
              id="school"
              value={schoolName || "—"}
              disabled
              readOnly
              className="cursor-not-allowed bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]"
            />
          </Field>

          {cycles.length > 1 ? (
            <Field
              label={t("dossierFieldCycle")}
              htmlFor="cycleId"
              required
              error={state.errors?.cycleId}
            >
              <Select
                id="cycleId"
                name="cycleId"
                value={cycleId}
                onChange={(e) => setCycleId(e.target.value)}
                required
              >
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {c.targetYearLabel}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="cycleId" value={cycleId} />
          )}

          <FormRow>
            <Field
              label={t("dossierFieldEstablishment")}
              htmlFor="establishmentId"
              required={establishments.length > 0}
              error={state.errors?.establishmentId}
              hint={
                establishments.length === 0
                  ? t("dossierNoEstablishments")
                  : undefined
              }
            >
              <Select
                id="establishmentId"
                name="establishmentId"
                value={establishmentId}
                onChange={(e) => setEstablishmentId(e.target.value)}
                required={establishments.length > 0}
                disabled={establishments.length === 0}
              >
                <option value="">—</option>
                {establishments.map((est) => (
                  <option key={est.id} value={est.id}>
                    {est.name}
                  </option>
                ))}
              </Select>
            </Field>
            {/* Niveau only renders once an établissement is chosen — keeps
                the form clean and signals the cascade clearly. */}
            {establishmentId ? (
              <Field
                label={t("dossierFieldNiveau")}
                htmlFor="niveau"
                required
                error={state.errors?.niveau}
              >
                {selectedEstablishment &&
                selectedEstablishment.levels.length > 0 ? (
                  <Select id="niveau" name="niveau" required>
                    <option value="">—</option>
                    {selectedEstablishment.levels.map((lv) => (
                      <option key={lv} value={lv}>
                        {lv}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id="niveau"
                    name="niveau"
                    required
                    maxLength={40}
                    placeholder="6ème, CP…"
                  />
                )}
              </Field>
            ) : (
              <Field
                label={t("dossierFieldNiveau")}
                htmlFor="niveau-placeholder"
                hint={t("dossierPickEstablishmentFirst")}
              >
                <Select id="niveau-placeholder" disabled>
                  <option>—</option>
                </Select>
              </Field>
            )}
          </FormRow>
        </CardBody>
      </Card>

      {state.formError ? (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert">
          {t(`dossierError_${state.formError}`)}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <a
          href="/parent/dashboard"
          className="inline-flex items-center rounded-md border border-[color:var(--color-border-subtle)] px-4 py-2 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-surface-hover)]"
        >
          {tCommon("cancel")}
        </a>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : t("dossierCreate")}
        </Button>
      </div>
    </form>
  );
}
