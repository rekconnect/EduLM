"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FieldsRenderer, type FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveStudentDossier } from "../../_actions";

/**
 * Élève tab — Dars entity-fields edition. Renders the student "Info générale"
 * + "Info Arabe" fields from the tenant's studentFieldsConfig via the shared
 * FieldsRenderer (so labels / required / order / show-if conditions are all
 * configured in Settings → Champs élève). Answers persist to
 * Application.studentAnswers; the bound prénom/nom/date de naissance — and the
 * "sexe" select — are mirrored to the Application columns by the save action.
 */
export function DossierTabEleve({
  applicationId,
  config,
  initial,
  establishments,
  disabled,
  renewal = false,
}: {
  applicationId: string;
  config: EntityFieldsConfig;
  initial: FieldAnswers;
  establishments: Array<{ id: string; name: string; levels?: string[] }>;
  disabled: boolean;
  /** Re-inscription: locks fields whose renewalPrefill is "locked". */
  renewal?: boolean;
}) {
  const [answers, setAnswers] = useState<FieldAnswers>(initial);
  const [pending, start] = useTransition();

  function onSave() {
    start(async () => {
      const r = await saveStudentDossier(applicationId, { answers });
      if (r.ok) toast.success("Enregistré");
      else toast.error("Échec de l'enregistrement");
    });
  }

  return (
    <Card>
      <CardHeader title="Élève" />
      <CardBody>
        <FieldsRenderer
          config={config}
          answers={answers}
          extras={{ establishments }}
          disabled={disabled}
          unlockBound
          renewal={renewal}
          onChange={(id, value) => setAnswers((p) => ({ ...p, [id]: value }))}
        />

        {!disabled ? (
          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={onSave} disabled={pending} className="gap-2">
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
