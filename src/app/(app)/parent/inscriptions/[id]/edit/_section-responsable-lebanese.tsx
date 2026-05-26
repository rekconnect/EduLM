"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormRow } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { saveResponsableIdentity } from "../../_actions";

/**
 * Options for "Relation avec l'enfant" — stable English-ish keys so
 * admin queries don't break when locale labels change. Labels come
 * from i18n.
 */
export const RESPONSABLE_RELATIONS = [
  "pere",
  "mere",
  "beau_pere",
  "belle_mere",
  "grand_pere",
  "grand_mere",
  "frere",
  "soeur",
  "oncle",
  "tante",
  "cousin",
  "tuteur",
  "non_defini",
] as const;
export type ResponsableRelation = (typeof RESPONSABLE_RELATIONS)[number];

/**
 * "Identité du responsable" card on the Responsables tab.
 *
 * Phase 4: every label / required / hidden read through useField();
 * every <Field> wrapped in <EditableField> so the WYSIWYG editor can
 * pencil-overlay it. Same pattern as the Élève sections from Phase 2/3.
 */
export function ResponsableLebaneseSection({
  applicationId,
  initial,
  disabled,
  editMode = false,
}: {
  applicationId: string;
  initial: {
    submitterRelation: string | null;
    submitterIsLebanese: boolean | null;
    submitterPassportLebanese: string;
  };
  disabled: boolean;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [relation, setRelation] = useState<string>(initial.submitterRelation ?? "");
  const [isLebanese, setIsLebanese] = useState<boolean | null>(
    initial.submitterIsLebanese,
  );
  const [passportLebanese, setPassportLebanese] = useState<string>(
    initial.submitterPassportLebanese,
  );

  const fRelation = useField("responsables.identity.relation");
  const fIsLebanese = useField("responsables.identity.isLebanese");
  const fPassportLebanese = useField("responsables.identity.passportLebanese");

  function onSave() {
    if (editMode) {
      toast.info("Aperçu — modifications non enregistrées");
      return;
    }
    startTransition(async () => {
      const r = await saveResponsableIdentity(applicationId, {
        relation: relation || undefined,
        isLebanese,
        passportLebanese:
          isLebanese === true ? passportLebanese || undefined : undefined,
      });
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("saveError"));
    });
  }

  // Conditional visibility: passport input only renders when the
  // override hasn't hidden it AND the radio is set to "Oui".
  const passportLebaneseVisible =
    !fPassportLebanese?.hidden && isLebanese === true;

  return (
    <Card>
      <CardHeader title={t("responsable.identityTitle")} />
      <CardBody className="space-y-4">
        {/* 1. Relation avec l'enfant */}
        {fRelation?.hidden ? null : (
          <EditableField fieldKey="responsables.identity.relation">
            <Field
              label={fRelation?.label ?? t("responsable.relation")}
              htmlFor="submitterRelation"
              required={fRelation?.required ?? true}
            >
              <Select
                id="submitterRelation"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                disabled={disabled}
                className="max-w-xs"
              >
                <option value="">—</option>
                {RESPONSABLE_RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`responsable.relations.${r}` as never)}
                  </option>
                ))}
              </Select>
            </Field>
          </EditableField>
        )}

        {/* 2. Nationalité libanaise + Passeport libanais (when Oui) */}
        <FormRow>
          {fIsLebanese?.hidden ? (
            <div />
          ) : (
            <EditableField fieldKey="responsables.identity.isLebanese">
              <Field
                label={fIsLebanese?.label ?? t("responsable.isLebanese")}
                htmlFor="submitterIsLebanese"
                required={fIsLebanese?.required ?? true}
              >
                <div className="flex h-9 items-center gap-4">
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="submitterIsLebanese"
                      checked={isLebanese === true}
                      onChange={() => setIsLebanese(true)}
                      disabled={disabled}
                    />
                    {tCommon("yes")}
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="submitterIsLebanese"
                      checked={isLebanese === false}
                      onChange={() => {
                        setIsLebanese(false);
                        setPassportLebanese("");
                      }}
                      disabled={disabled}
                    />
                    {tCommon("no")}
                  </label>
                </div>
              </Field>
            </EditableField>
          )}
          {passportLebaneseVisible ? (
            <EditableField fieldKey="responsables.identity.passportLebanese">
              <Field
                label={
                  fPassportLebanese?.label ?? t("responsable.passportLebanese")
                }
                htmlFor="submitterPassportLebanese"
                required={fPassportLebanese?.required ?? true}
              >
                <Input
                  id="submitterPassportLebanese"
                  value={passportLebanese}
                  onChange={(e) => setPassportLebanese(e.target.value)}
                  maxLength={40}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          ) : (
            <div />
          )}
        </FormRow>

        {!disabled ? (
          <div className="flex justify-end">
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
