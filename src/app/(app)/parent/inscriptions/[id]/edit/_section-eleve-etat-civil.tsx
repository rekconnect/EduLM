"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormRow } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { COUNTRIES_FR } from "@/lib/lookups";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { saveEleveEtatCivil } from "../../_actions";

type Initial = {
  childFirstName: string;
  childLastName: string;
  childDob: string;
  childGender: "MALE" | "FEMALE" | "OTHER" | "";
  childPlaceOfBirth: string;
  childBirthCountry: string;
  childFirstNameAr: string;
  childLastNameAr: string;
  childPlaceOfBirthAr: string;
};

/**
 * Student "État civil" card on the Élève tab. After the dossier is
 * created via the quick /parent/inscriptions/new form, the parent
 * never sees the standalone File Identity section again — instead
 * every editable identity field lives here, including last/first name,
 * date of birth, establishment + niveau.
 *
 * Nationalities live in the separate ElevePassportSection card below.
 *
 * Phase 2 of the WYSIWYG editor: every label / required / hidden flag
 * is read through `useField()` from the per-tenant inscriptionFormConfig.
 * Hardcoded i18n strings remain as fallbacks so the form behaves
 * identically when no override is set.
 *
 * Phase 3: when `editMode` is true (rendered inside the admin preview
 * route), the section becomes interactive in a different way — Save
 * is a no-op and each <Field> gets a hover-pencil that opens the
 * field-edit drawer. The pencil overlay logic lives in <EditableField>
 * which is a no-op outside the PreviewEditModeProvider, so we can
 * unconditionally wrap every field here.
 */
export function EleveEtatCivilSection({
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
  const tAdm = useTranslations("admissions");
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<Initial>(initial);

  // Per-field config — labels + required + hidden flags merged from the
  // tenant's inscriptionFormConfig over the registry defaults.
  const fLastName = useField("eleve.etatCivil.lastName");
  const fFirstName = useField("eleve.etatCivil.firstName");
  const fLastNameAr = useField("eleve.etatCivil.lastNameAr");
  const fFirstNameAr = useField("eleve.etatCivil.firstNameAr");
  const fDob = useField("eleve.etatCivil.dob");
  const fGender = useField("eleve.etatCivil.gender");
  const fPlaceOfBirth = useField("eleve.etatCivil.placeOfBirth");
  const fBirthCountry = useField("eleve.etatCivil.birthCountry");
  const fPlaceOfBirthAr = useField("eleve.etatCivil.placeOfBirthAr");

  function patch(p: Partial<Initial>) {
    setData((prev) => ({ ...prev, ...p }));
  }

  function onSave() {
    if (editMode) {
      // Preview: saves are no-ops so admin can play with the form
      // without persisting anything to a real Application row.
      toast.info("Aperçu — modifications non enregistrées");
      return;
    }
    startTransition(async () => {
      const r = await saveEleveEtatCivil(applicationId, {
        childFirstName: data.childFirstName,
        childLastName: data.childLastName,
        childDob: data.childDob,
        childGender: data.childGender || undefined,
        childPlaceOfBirth: data.childPlaceOfBirth || undefined,
        childBirthCountry: data.childBirthCountry || undefined,
        childFirstNameAr: data.childFirstNameAr || undefined,
        childLastNameAr: data.childLastNameAr || undefined,
        childPlaceOfBirthAr: data.childPlaceOfBirthAr || undefined,
      });
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("saveError"));
    });
  }

  return (
    <Card>
      <CardHeader title={t("eleve.etatCivilTitle")} />
      <CardBody className="space-y-4">
        {/* Latin names */}
        <FormRow>
          {fLastName?.hidden ? (
            <div />
          ) : (
            <EditableField fieldKey="eleve.etatCivil.lastName">
              <Field
                label={fLastName?.label ?? tAdm("dossierFieldLastName")}
                htmlFor="childLastName"
                required={fLastName?.required ?? true}
              >
                <Input
                  id="childLastName"
                  value={data.childLastName}
                  onChange={(e) => patch({ childLastName: e.target.value })}
                  maxLength={80}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          )}
          {fFirstName?.hidden ? (
            <div />
          ) : (
            <EditableField fieldKey="eleve.etatCivil.firstName">
              <Field
                label={fFirstName?.label ?? tAdm("dossierFieldFirstName")}
                htmlFor="childFirstName"
                required={fFirstName?.required ?? true}
              >
                <Input
                  id="childFirstName"
                  value={data.childFirstName}
                  onChange={(e) => patch({ childFirstName: e.target.value })}
                  maxLength={80}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          )}
        </FormRow>

        {/* Arabic names — RTL flow so الشهرة (last) sits on the right of
            الاسم (first), matching the Montaigne paper form. Row hidden
            entirely when both Arabic fields are hidden. */}
        {fLastNameAr?.hidden && fFirstNameAr?.hidden ? null : (
          <div dir="rtl">
            <FormRow>
              {fLastNameAr?.hidden ? (
                <div />
              ) : (
                <EditableField fieldKey="eleve.etatCivil.lastNameAr">
                  <Field
                    label={fLastNameAr?.label ?? tAdm("dossierFieldLastNameAr")}
                    htmlFor="childLastNameAr"
                    required={fLastNameAr?.required ?? true}
                  >
                    <Input
                      id="childLastNameAr"
                      value={data.childLastNameAr}
                      onChange={(e) =>
                        patch({ childLastNameAr: e.target.value })
                      }
                      lang="ar"
                      dir="rtl"
                      disabled={disabled}
                    />
                  </Field>
                </EditableField>
              )}
              {fFirstNameAr?.hidden ? (
                <div />
              ) : (
                <EditableField fieldKey="eleve.etatCivil.firstNameAr">
                  <Field
                    label={
                      fFirstNameAr?.label ?? tAdm("dossierFieldFirstNameAr")
                    }
                    htmlFor="childFirstNameAr"
                    required={fFirstNameAr?.required ?? true}
                  >
                    <Input
                      id="childFirstNameAr"
                      value={data.childFirstNameAr}
                      onChange={(e) =>
                        patch({ childFirstNameAr: e.target.value })
                      }
                      lang="ar"
                      dir="rtl"
                      disabled={disabled}
                    />
                  </Field>
                </EditableField>
              )}
            </FormRow>
          </div>
        )}

        {/* DOB + Sex */}
        <FormRow>
          {fDob?.hidden ? (
            <div />
          ) : (
            <EditableField fieldKey="eleve.etatCivil.dob">
              <Field
                label={fDob?.label ?? tAdm("dossierFieldDob")}
                htmlFor="childDob"
                required={fDob?.required ?? true}
              >
                <Input
                  id="childDob"
                  type="date"
                  value={data.childDob}
                  onChange={(e) => patch({ childDob: e.target.value })}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          )}
          {fGender?.hidden ? (
            <div />
          ) : (
            <EditableField fieldKey="eleve.etatCivil.gender">
              <Field
                label={fGender?.label ?? tAdm("dossierFieldGender")}
                htmlFor="childGender"
                required={fGender?.required ?? true}
              >
                <Select
                  id="childGender"
                  value={data.childGender}
                  onChange={(e) =>
                    patch({
                      childGender:
                        e.target.value === "MALE" ||
                        e.target.value === "FEMALE" ||
                        e.target.value === "OTHER"
                          ? e.target.value
                          : "",
                    })
                  }
                  disabled={disabled}
                >
                  <option value="">—</option>
                  <option value="MALE">{tAdm("genderMale")}</option>
                  <option value="FEMALE">{tAdm("genderFemale")}</option>
                  <option value="OTHER">{tAdm("genderOther")}</option>
                </Select>
              </Field>
            </EditableField>
          )}
        </FormRow>

        {/* Place + Country of birth */}
        <FormRow>
          {fPlaceOfBirth?.hidden ? (
            <div />
          ) : (
            <EditableField fieldKey="eleve.etatCivil.placeOfBirth">
              <Field
                label={fPlaceOfBirth?.label ?? t("eleve.placeOfBirth")}
                htmlFor="childPlaceOfBirth"
                required={fPlaceOfBirth?.required ?? true}
              >
                <Input
                  id="childPlaceOfBirth"
                  value={data.childPlaceOfBirth}
                  onChange={(e) =>
                    patch({ childPlaceOfBirth: e.target.value })
                  }
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          )}
          {fBirthCountry?.hidden ? (
            <div />
          ) : (
            <EditableField fieldKey="eleve.etatCivil.birthCountry">
              <Field
                label={fBirthCountry?.label ?? t("eleve.birthCountry")}
                htmlFor="childBirthCountry"
                required={fBirthCountry?.required ?? true}
              >
                <Select
                  id="childBirthCountry"
                  value={data.childBirthCountry}
                  onChange={(e) => patch({ childBirthCountry: e.target.value })}
                  disabled={disabled}
                >
                  <option value="">—</option>
                  {(data.childBirthCountry &&
                  !COUNTRIES_FR.includes(data.childBirthCountry)
                    ? [data.childBirthCountry, ...COUNTRIES_FR]
                    : COUNTRIES_FR
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </EditableField>
          )}
        </FormRow>

        {/* Arabic place of birth — RTL, optional. */}
        {fPlaceOfBirthAr?.hidden ? null : (
          <div dir="rtl">
            <EditableField fieldKey="eleve.etatCivil.placeOfBirthAr">
              <Field
                label={fPlaceOfBirthAr?.label ?? "مكان الولادة (Lieu de naissance en arabe)"}
                htmlFor="childPlaceOfBirthAr"
                required={fPlaceOfBirthAr?.required ?? false}
              >
                <Input
                  id="childPlaceOfBirthAr"
                  value={data.childPlaceOfBirthAr}
                  onChange={(e) => patch({ childPlaceOfBirthAr: e.target.value })}
                  lang="ar"
                  dir="rtl"
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          </div>
        )}

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
