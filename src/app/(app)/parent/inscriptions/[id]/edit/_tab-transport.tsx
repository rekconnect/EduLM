"use client";

import { GenericConfigTab } from "./_generic-config-tab";
import type { FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveTransportTab } from "../../_actions";

/**
 * Transport & restauration tab — config-driven ("Services" category). Answers
 * persist to dossierAnswers.transport under the exact Dars keys, so the
 * acceptance bridge and a Dars restore round-trip unchanged. The maternelle
 * collation lock is enforced server-side in saveTransportTab.
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
  renewal?: boolean;
}) {
  return (
    <GenericConfigTab
      title="Transport & restauration"
      config={config}
      initial={initial}
      establishments={establishments}
      disabled={disabled}
      renewal={renewal}
      // Translate FieldsRenderer's id-keyed answers → the Dars-key Services
      // object that parseTransport + the acceptance bridge read.
      save={(answers, cfg) => {
        const out: Record<string, string> = {};
        for (const f of cfg.fields) {
          const v = answers[f.id];
          if (typeof v === "string" && v !== "") out[f.key] = v;
        }
        return saveTransportTab(applicationId, out);
      }}
    />
  );
}
