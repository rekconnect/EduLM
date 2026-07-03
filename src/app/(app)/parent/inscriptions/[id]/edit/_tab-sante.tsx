"use client";

import { GenericConfigTab } from "./_generic-config-tab";
import type { FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveSanteTab } from "../../_actions";

/** Santé tab — config-driven; answers persist to dossierAnswers.sante. */
export function DossierTabSante({
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
  return (
    <GenericConfigTab
      title="Santé"
      config={config}
      initial={initial}
      disabled={disabled}
      renewal={renewal}
      save={(answers) => saveSanteTab(applicationId, answers)}
    />
  );
}
