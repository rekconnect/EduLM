"use client";

import { FieldsRenderer, type FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";

/**
 * Read-only, config-driven view of the child's fiche for the parent portal.
 * Same renderer as the inscription form, permanently disabled — editing goes
 * through the réinscription dossier when a campaign is open.
 */
export function ChildInfoView({
  config,
  answers,
}: {
  config: EntityFieldsConfig;
  answers: FieldAnswers;
}) {
  return (
    <FieldsRenderer
      config={config}
      answers={answers}
      onChange={() => {}}
      disabled
    />
  );
}
