"use client";

import { GenericConfigTab } from "./_generic-config-tab";
import type { FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveContactsTab } from "../../_actions";

/**
 * Autres contacts tab — config-driven (two repeaters: urgence + pickup).
 * saveContactsTab bulk-replaces ApplicationContact rows (→ authorized_persons).
 */
export function DossierTabContacts({
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
      title="Autres contacts"
      config={config}
      initial={initial}
      disabled={disabled}
      renewal={renewal}
      save={(answers) => saveContactsTab(applicationId, answers)}
    />
  );
}
