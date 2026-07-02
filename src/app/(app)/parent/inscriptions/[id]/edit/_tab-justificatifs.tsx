"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FieldsRenderer, type FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveJustificatifsTab, uploadDossierFile } from "../../_actions";

/**
 * Justificatifs tab — Dars entity-fields edition. Renders the student
 * "Justificatifs" category (config-defined `file` fields — one per required
 * document) via FieldsRenderer, with an upload handler bound to the dossier.
 * Files upload to storage and the answer keeps a {path,name} reference;
 * answers persist under dossierAnswers.justificatifs.
 */
export function DossierTabJustificatifs({
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
  renewal?: boolean;
}) {
  const [answers, setAnswers] = useState<FieldAnswers>(initial);
  const [pending, start] = useTransition();

  async function onUploadFile(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const r = await uploadDossierFile(fd);
    return r.ok && r.path ? { path: r.path, name: r.name ?? file.name } : null;
  }

  function onSave() {
    start(async () => {
      const r = await saveJustificatifsTab(applicationId, answers);
      if (r.ok) toast.success("Enregistré");
      else toast.error("Échec de l'enregistrement");
    });
  }

  return (
    <Card>
      <CardHeader title="Justificatifs" />
      <CardBody>
        <FieldsRenderer
          config={config}
          answers={answers}
          extras={{ establishments: [], onUploadFile }}
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
