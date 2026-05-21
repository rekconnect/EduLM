"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  FieldsRenderer,
  resolveInitialValue,
  type FieldAnswers,
  type FieldExtras,
} from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import {
  saveDossierParentAnswers,
  saveDossierStudentAnswers,
  submitDossier,
} from "../../_actions";

export function DossierEditClient({
  applicationId,
  status,
  parentConfig,
  studentConfig,
  parentInitial,
  studentInitial,
  establishments,
  user,
  dossier,
}: {
  applicationId: string;
  status: string;
  parentConfig: EntityFieldsConfig;
  studentConfig: EntityFieldsConfig;
  parentInitial: FieldAnswers;
  studentInitial: FieldAnswers;
  establishments: FieldExtras["establishments"];
  user: NonNullable<FieldExtras["user"]>;
  dossier: NonNullable<FieldExtras["dossier"]>;
}) {
  const t = useTranslations("admissions");
  const tCommon = useTranslations("common");

  // Seed parent answers from User columns for any field with userBoundTo set
  // and no stored value yet. resolveInitialValue does the lookup; we apply
  // it once at mount to the initial state.
  const parentSeeded: FieldAnswers = {};
  for (const f of parentConfig.fields) {
    const v = resolveInitialValue(f, parentInitial[f.id] ?? "", { user });
    if (v) parentSeeded[f.id] = v;
  }

  // Seed student answers: dossierBoundTo overrides any stored value so the
  // mirrored field always reflects the canonical dossier identity. For
  // non-bound fields, fall through to the stored value.
  const studentSeeded: FieldAnswers = {};
  for (const f of studentConfig.fields) {
    const v = resolveInitialValue(f, studentInitial[f.id] ?? "", { dossier });
    if (v) studentSeeded[f.id] = v;
  }

  const [parentAns, setParentAns] = useState<FieldAnswers>({
    ...parentSeeded,
    ...parentInitial,
  });
  const [studentAns, setStudentAns] = useState<FieldAnswers>({
    ...studentInitial,
    ...studentSeeded, // dossier-mirrored values overwrite stored
  });
  const [savingParent, startParentSave] = useTransition();
  const [savingStudent, startStudentSave] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const isReadOnly = status !== "DRAFT" && status !== "SUBMITTED";

  function buildFd(answers: FieldAnswers): FormData {
    const fd = new FormData();
    for (const [id, v] of Object.entries(answers)) {
      if (v.trim().length > 0) fd.append(`f-${id}`, v);
    }
    return fd;
  }

  function onSaveParent() {
    startParentSave(async () => {
      const r = await saveDossierParentAnswers(applicationId, buildFd(parentAns));
      if (r.ok) toast.success(t("dossierSavedToast"));
      else toast.error(t(`dossierError_${r.error ?? "save-failed"}` as never));
    });
  }
  function onSaveStudent() {
    startStudentSave(async () => {
      const r = await saveDossierStudentAnswers(applicationId, buildFd(studentAns));
      if (r.ok) toast.success(t("dossierSavedToast"));
      else toast.error(t(`dossierError_${r.error ?? "save-failed"}` as never));
    });
  }

  function onSubmit() {
    // Save both sections then submit. Save calls are sequential so a save
    // failure can be surfaced cleanly before we try to submit.
    startSubmit(async () => {
      const p = await saveDossierParentAnswers(applicationId, buildFd(parentAns));
      if (!p.ok) {
        toast.error(t(`dossierError_${p.error ?? "save-failed"}` as never));
        return;
      }
      const s = await saveDossierStudentAnswers(applicationId, buildFd(studentAns));
      if (!s.ok) {
        toast.error(t(`dossierError_${s.error ?? "save-failed"}` as never));
        return;
      }
      const result = await submitDossier(applicationId);
      if (result.ok) {
        toast.success(t("dossierSubmittedToast"));
      } else if (result.error === "missing-required" && result.missing) {
        // List the missing labels — parent sees exactly what to go fill.
        toast.error(
          `${t("dossierMissingRequired")}: ${result.missing.join(", ")}`,
        );
      } else {
        toast.error(t(`dossierError_${result.error ?? "submit-failed"}` as never));
      }
    });
  }

  const extras: FieldExtras = { establishments, user, dossier };

  return (
    <>
      {parentConfig.fields.length > 0 ? (
        <Card>
          <CardHeader title={t("dossierParentSectionTitle")} />
          <CardBody>
            <FieldsRenderer
              config={parentConfig}
              answers={parentAns}
              extras={extras}
              disabled={isReadOnly}
              onChange={(id, value) =>
                setParentAns((prev) => ({ ...prev, [id]: value }))
              }
            />
            {!isReadOnly ? (
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  onClick={onSaveParent}
                  disabled={savingParent}
                  className="gap-2"
                  variant="secondary"
                >
                  {savingParent ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {savingParent ? tCommon("loading") : t("dossierSaveSection")}
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {studentConfig.fields.length > 0 ? (
        <Card>
          <CardHeader title={t("dossierStudentSectionTitle")} />
          <CardBody>
            <FieldsRenderer
              config={studentConfig}
              answers={studentAns}
              extras={extras}
              disabled={isReadOnly}
              onChange={(id, value) =>
                setStudentAns((prev) => ({ ...prev, [id]: value }))
              }
            />
            {!isReadOnly ? (
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  onClick={onSaveStudent}
                  disabled={savingStudent}
                  className="gap-2"
                  variant="secondary"
                >
                  {savingStudent ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {savingStudent ? tCommon("loading") : t("dossierSaveSection")}
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {parentConfig.fields.length === 0 && studentConfig.fields.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-[color:var(--color-foreground-muted)]">
              {t("dossierNoFieldsConfigured")}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {!isReadOnly && (parentConfig.fields.length > 0 || studentConfig.fields.length > 0) ? (
        <div className="flex items-center justify-end gap-2 pt-2">
          {status === "DRAFT" ? (
            <Button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="gap-2"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              {submitting ? tCommon("loading") : t("dossierSubmitCta")}
            </Button>
          ) : (
            <p className="text-sm text-[color:var(--color-foreground-muted)]">
              {t("dossierAlreadySubmittedHint")}
            </p>
          )}
        </div>
      ) : null}
    </>
  );
}
