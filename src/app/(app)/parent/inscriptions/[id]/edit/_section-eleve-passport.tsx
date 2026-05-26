"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormRow } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { NATIONALITIES_FR } from "@/lib/lookups";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { saveElevePassport } from "../../_actions";

type Initial = {
  childIsLebanese: boolean | null;
  childPassportLebanese: string;
  childNationality: string;
  childNationality2: string;
};

/**
 * "Passeport / Carte d'identité" card on the Élève tab.
 *
 * Phase 2: every label / required / hidden flag read through useField().
 * Phase 3: `editMode` no-ops the save action; each Field wrapped in
 * <EditableField> for the WYSIWYG pencil overlay.
 */
export function ElevePassportSection({
  applicationId,
  initial,
  disabled,
  editMode = false,
}: {
  applicationId: string;
  initial: Initial;
  disabled: boolean;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<Initial>(initial);

  const fIsLebanese = useField("eleve.passport.isLebanese");
  const fPassportLebanese = useField("eleve.passport.passportLebanese");
  const fNationality1 = useField("eleve.passport.nationality1");
  const fNationality2 = useField("eleve.passport.nationality2");

  function patch(p: Partial<Initial>) {
    setData((prev) => ({ ...prev, ...p }));
  }

  function onSave() {
    if (editMode) {
      toast.info("Aperçu — modifications non enregistrées");
      return;
    }
    startTransition(async () => {
      const r = await saveElevePassport(applicationId, {
        childIsLebanese: data.childIsLebanese,
        childPassportLebanese:
          data.childIsLebanese === true
            ? data.childPassportLebanese || undefined
            : undefined,
        childNationality: data.childNationality || undefined,
        childNationality2: data.childNationality2 || undefined,
      });
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("saveError"));
    });
  }

  const passportLebaneseVisible =
    !fPassportLebanese?.hidden && data.childIsLebanese === true;

  return (
    <Card>
      <CardHeader
        title={t("eleve.passportTitle")}
        description={t("eleve.passportHint")}
      />
      <CardBody className="space-y-4">
        {/* Lebanese Yes/No + passport-ID input shown only when Oui. */}
        <FormRow>
          {fIsLebanese?.hidden ? (
            <div />
          ) : (
            <EditableField fieldKey="eleve.passport.isLebanese">
              <Field
                label={fIsLebanese?.label ?? t("eleve.isLebanese")}
                htmlFor="childIsLebanese"
                required={fIsLebanese?.required ?? true}
              >
                <div className="flex h-9 items-center gap-4">
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="childIsLebanese"
                      checked={data.childIsLebanese === true}
                      onChange={() => patch({ childIsLebanese: true })}
                      disabled={disabled}
                    />
                    {tCommon("yes")}
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="childIsLebanese"
                      checked={data.childIsLebanese === false}
                      onChange={() =>
                        patch({
                          childIsLebanese: false,
                          childPassportLebanese: "",
                        })
                      }
                      disabled={disabled}
                    />
                    {tCommon("no")}
                  </label>
                </div>
              </Field>
            </EditableField>
          )}
          {passportLebaneseVisible ? (
            <EditableField fieldKey="eleve.passport.passportLebanese">
              <Field
                label={
                  fPassportLebanese?.label ?? t("eleve.passportLebanese")
                }
                htmlFor="childPassportLebanese"
                required={fPassportLebanese?.required ?? true}
              >
                <Input
                  id="childPassportLebanese"
                  value={data.childPassportLebanese}
                  onChange={(e) =>
                    patch({ childPassportLebanese: e.target.value })
                  }
                  maxLength={40}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          ) : (
            <div />
          )}
        </FormRow>

        {/* Other nationalities — up to 2. */}
        <FormRow>
          {fNationality1?.hidden ? (
            <div />
          ) : (
            <EditableField fieldKey="eleve.passport.nationality1">
              <Field
                label={fNationality1?.label ?? t("eleve.nationality1")}
                htmlFor="childNationality"
                required={
                  fNationality1?.hasOverride
                    ? fNationality1.required
                    : data.childIsLebanese === false
                }
              >
                <Select
                  id="childNationality"
                  value={data.childNationality}
                  onChange={(e) => patch({ childNationality: e.target.value })}
                  disabled={disabled}
                >
                  <option value="">—</option>
                  {NATIONALITIES_FR.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            </EditableField>
          )}
          {fNationality2?.hidden ? (
            <div />
          ) : (
            <EditableField fieldKey="eleve.passport.nationality2">
              <Field
                label={fNationality2?.label ?? t("eleve.nationality2")}
                htmlFor="childNationality2"
                required={fNationality2?.required ?? false}
              >
                <Select
                  id="childNationality2"
                  value={data.childNationality2}
                  onChange={(e) => patch({ childNationality2: e.target.value })}
                  disabled={disabled}
                >
                  <option value="">—</option>
                  {NATIONALITIES_FR.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            </EditableField>
          )}
        </FormRow>

        {!disabled ? (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={onSave}
              disabled={pending}
              variant="secondary"
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
      </CardBody>
    </Card>
  );
}
