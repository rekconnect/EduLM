"use client";

import { GenericConfigTab } from "./_generic-config-tab";
import type { FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveFoyerTab } from "../../_actions";

/**
 * Foyer tab — config-driven. saveFoyerTab adapts the answers back to the
 * Family columns + dossierAnswers.foyer + ApplicationSibling rows.
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
  renewal?: boolean;
}) {
  return (
    <GenericConfigTab
      title="Foyer"
      config={config}
      initial={initial}
      disabled={disabled}
      renewal={renewal}
      save={(answers) => saveFoyerTab(applicationId, answers)}
    />
  );
}
