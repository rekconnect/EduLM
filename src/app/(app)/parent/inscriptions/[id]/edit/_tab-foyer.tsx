"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FieldsRenderer, type FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveFoyerTab } from "../../_actions";

/**
 * Foyer tab — Dars entity-fields edition. Renders the student "Foyer" category
 * (address with caza→village cascade + a `repeater` fratrie list) via the
 * shared FieldsRenderer. Answers are adapted by saveFoyerTab back to the
 * existing stores — Family address columns, dossierAnswers.foyer (building/
 * floor/details/notes), and ApplicationSibling rows — so nothing downstream
 * changes. Image rights live on the Autorisations tab (moved out of Foyer).
 */
export function DossierTabFoyer({
  applicationId,
  config,
  initial,
  disabled,
  renewal = false,
}: {
  applicationId: string;
  config: EntityFieldsConfig;
  initial: FieldAnswers;
  disabled: boolean;
  /** Re-inscription: locks fields whose renewalPrefill is "locked". */
  renewal?: boolean;
}) {
  const [answers, setAnswers] = useState<FieldAnswers>(initial);
  const [pending, start] = useTransition();

  function onSave() {
    start(async () => {
      const r = await saveFoyerTab(applicationId, answers);
      if (r.ok) toast.success("Enregistré");
      else toast.error("Échec de l'enregistrement");
    });
  }

  return (
    <Card>
      <CardHeader title="Foyer" />
      <CardBody>
        <FieldsRenderer
          config={config}
          answers={answers}
          extras={{ establishments: [] }}
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
