"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FieldsRenderer, type FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveTransportTab } from "../../_actions";

/**
 * Transport & restauration tab — Dars entity-fields edition. Renders the
 * student "Services" category (transport_aller/retour, collations, repas_chaud,
 * alternate address) from studentFieldsConfig via the shared FieldsRenderer, so
 * labels / required / order / show-if conditions are all configured in
 * Réglages → Champs. Answers persist into dossierAnswers.transport under the
 * exact Dars keys, so the acceptance bridge and a Dars restore round-trip
 * unchanged. The maternelle collation lock is enforced server-side in
 * saveTransportTab.
 */
export function DossierTabTransport({
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
      // Translate FieldsRenderer's id-keyed answers → the Dars-key Services
      // object that parseTransport + the bridge read.
      const out: Record<string, string> = {};
      for (const f of config.fields) {
        const v = answers[f.id];
        if (typeof v === "string" && v !== "") out[f.key] = v;
      }
      const r = await saveTransportTab(applicationId, out);
      if (r.ok) toast.success("Enregistré");
      else toast.error("Échec de l'enregistrement");
    });
  }

  return (
    <Card>
      <CardHeader title="Transport & restauration" />
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
