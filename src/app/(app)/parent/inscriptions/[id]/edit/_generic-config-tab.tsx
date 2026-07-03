"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  FieldsRenderer,
  type FieldAnswers,
  type FieldExtras,
} from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";

/**
 * Shared skeleton for every config-driven dossier tab: local answer state, a
 * FieldsRenderer over the tab's category config, and a save button with
 * pending + toast feedback. Each tab is a thin wrapper that supplies its title
 * and a `save` closure (mapping the answers to its server action). The closure
 * lives in the wrapper because page.tsx is a Server Component and cannot pass a
 * client function across the boundary — only server actions are serializable.
 */
export function GenericConfigTab({
  title,
  config,
  initial,
  disabled,
  renewal = false,
  establishments = [],
  extras,
  save,
}: {
  title: string;
  config: EntityFieldsConfig;
  initial: FieldAnswers;
  disabled: boolean;
  /** Re-inscription: locks fields whose renewalPrefill is "locked". */
  renewal?: boolean;
  establishments?: Array<{ id: string; name: string; levels?: string[] }>;
  /** Extra FieldsRenderer extras (e.g. onUploadFile for `file` fields). */
  extras?: Partial<FieldExtras>;
  save: (
    answers: FieldAnswers,
    config: EntityFieldsConfig,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [answers, setAnswers] = useState<FieldAnswers>(initial);
  const [pending, start] = useTransition();

  function onSave() {
    start(async () => {
      const r = await save(answers, config);
      if (r.ok) toast.success("Enregistré");
      else toast.error("Échec de l'enregistrement");
    });
  }

  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        <FieldsRenderer
          config={config}
          answers={answers}
          extras={{ establishments, ...extras }}
          disabled={disabled}
          unlockBound
          renewal={renewal}
          onChange={(id, value) => setAnswers((p) => ({ ...p, [id]: value }))}
        />

        {!disabled ? (
          <div className="mt-5 flex justify-end">
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
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
