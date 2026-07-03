"use client";

import { GenericConfigTab } from "./_generic-config-tab";
import type { FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveFinanceTab } from "../../_actions";

/** Finance tab — config-driven; answers persist to dossierAnswers.finance. */
export function DossierTabFinance({
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
      title="Finance"
      config={config}
      initial={initial}
      disabled={disabled}
      renewal={renewal}
      save={(answers) => saveFinanceTab(applicationId, answers)}
    />
  );
}
