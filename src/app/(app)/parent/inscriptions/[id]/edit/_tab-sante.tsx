"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormRow } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { saveSanteTab } from "../../_actions";
import { type SanteData } from "@/lib/dossier-content";

/**
 * Santé tab — informational only for Lycée Montaigne (the form
 * doesn't capture this on paper). Built for other MLF schools that
 * flip the tab visibility on.
 *
 * Phase 4: 9 registry fields wrapped with EditableField. paiDetails
 * stays runtime-gated on hasPai=Yes AND not-hidden-by-override.
 */
export function DossierTabSante({
  applicationId,
  initial,
  disabled,
  editMode = false,
}: {
  applicationId: string;
  initial: SanteData;
  disabled: boolean;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<SanteData>(initial);

  const fAllergies = useField("sante.info.allergies");
  const fTraitement = useField("sante.info.traitement");
  const fDoctorName = useField("sante.info.doctorName");
  const fDoctorPhone = useField("sante.info.doctorPhone");
  const fVaccinations = useField("sante.info.vaccinationsUpToDate");
  const fHasPai = useField("sante.info.hasPai");
  const fPaiDetails = useField("sante.info.paiDetails");
  const fDiet = useField("sante.info.diet");
  const fNotes = useField("sante.info.notes");

  function patch(p: Partial<SanteData>) {
    setData((prev) => ({ ...prev, ...p }));
  }

  function onSave() {
    if (editMode) {
      toast.info("Aperçu — modifications non enregistrées");
      return;
    }
    startTransition(async () => {
      const r = await saveSanteTab(applicationId, data);
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("saveError"));
    });
  }

  const paiDetailsVisible = !fPaiDetails?.hidden && data.hasPai === true;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t("sante.title")} description={t("sante.hint")} />
        <CardBody className="space-y-4">
          {fAllergies?.hidden ? null : (
            <EditableField fieldKey="sante.info.allergies">
              <Field
                label={fAllergies?.label ?? t("sante.allergies")}
                htmlFor="allergies"
                required={fAllergies?.required ?? false}
              >
                <Textarea
                  id="allergies"
                  rows={2}
                  value={data.allergies}
                  onChange={(e) => patch({ allergies: e.target.value })}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          )}
          {fTraitement?.hidden ? null : (
            <EditableField fieldKey="sante.info.traitement">
              <Field
                label={fTraitement?.label ?? t("sante.traitement")}
                htmlFor="traitement"
                required={fTraitement?.required ?? false}
              >
                <Textarea
                  id="traitement"
                  rows={2}
                  value={data.traitement}
                  onChange={(e) => patch({ traitement: e.target.value })}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          )}
          <FormRow>
            {fDoctorName?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="sante.info.doctorName">
                <Field
                  label={fDoctorName?.label ?? t("sante.doctorName")}
                  htmlFor="doctorName"
                  required={fDoctorName?.required ?? false}
                >
                  <Input
                    id="doctorName"
                    value={data.doctorName}
                    onChange={(e) => patch({ doctorName: e.target.value })}
                    disabled={disabled}
                  />
                </Field>
              </EditableField>
            )}
            {fDoctorPhone?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="sante.info.doctorPhone">
                <Field
                  label={fDoctorPhone?.label ?? t("sante.doctorPhone")}
                  htmlFor="doctorPhone"
                  required={fDoctorPhone?.required ?? false}
                >
                  <Input
                    id="doctorPhone"
                    type="tel"
                    value={data.doctorPhone}
                    onChange={(e) => patch({ doctorPhone: e.target.value })}
                    disabled={disabled}
                  />
                </Field>
              </EditableField>
            )}
          </FormRow>
          <FormRow>
            {fVaccinations?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="sante.info.vaccinationsUpToDate">
                <Field
                  label={fVaccinations?.label ?? t("sante.vaccinationsUpToDate")}
                  htmlFor="vacc"
                  required={fVaccinations?.required ?? true}
                >
                  <YesNo
                    name="vacc"
                    value={data.vaccinationsUpToDate}
                    onChange={(v) => patch({ vaccinationsUpToDate: v })}
                    disabled={disabled}
                    yesLabel={tCommon("yes")}
                    noLabel={tCommon("no")}
                  />
                </Field>
              </EditableField>
            )}
            {fHasPai?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="sante.info.hasPai">
                <Field
                  label={fHasPai?.label ?? t("sante.hasPai")}
                  htmlFor="pai"
                  required={fHasPai?.required ?? true}
                >
                  <YesNo
                    name="pai"
                    value={data.hasPai}
                    onChange={(v) => patch({ hasPai: v })}
                    disabled={disabled}
                    yesLabel={tCommon("yes")}
                    noLabel={tCommon("no")}
                  />
                </Field>
              </EditableField>
            )}
          </FormRow>
          {paiDetailsVisible ? (
            <EditableField fieldKey="sante.info.paiDetails">
              <Field
                label={fPaiDetails?.label ?? t("sante.paiDetails")}
                htmlFor="paiDetails"
                required={fPaiDetails?.required ?? false}
                hint={t("sante.paiDetailsHint")}
              >
                <Textarea
                  id="paiDetails"
                  rows={3}
                  value={data.paiDetails}
                  onChange={(e) => patch({ paiDetails: e.target.value })}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          ) : null}
          {fDiet?.hidden ? null : (
            <EditableField fieldKey="sante.info.diet">
              <Field
                label={fDiet?.label ?? t("sante.diet")}
                htmlFor="diet"
                required={fDiet?.required ?? false}
                hint={t("sante.dietHint")}
              >
                <Textarea
                  id="diet"
                  rows={2}
                  value={data.diet}
                  onChange={(e) => patch({ diet: e.target.value })}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          )}
          {fNotes?.hidden ? null : (
            <EditableField fieldKey="sante.info.notes">
              <Field
                label={fNotes?.label ?? t("sante.notes")}
                htmlFor="notes"
                required={fNotes?.required ?? false}
              >
                <Textarea
                  id="notes"
                  rows={2}
                  value={data.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          )}
        </CardBody>
      </Card>

      {!disabled ? (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {pending ? tCommon("saving") : tCommon("save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function YesNo({
  value,
  onChange,
  name,
  disabled,
  yesLabel,
  noLabel,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  name: string;
  disabled: boolean;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <div className="flex gap-4">
      <label className="inline-flex items-center gap-1.5 text-sm">
        <input
          type="radio"
          name={name}
          checked={value === true}
          onChange={() => onChange(true)}
          disabled={disabled}
        />
        {yesLabel}
      </label>
      <label className="inline-flex items-center gap-1.5 text-sm">
        <input
          type="radio"
          name={name}
          checked={value === false}
          onChange={() => onChange(false)}
          disabled={disabled}
        />
        {noLabel}
      </label>
    </div>
  );
}
