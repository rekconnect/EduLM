"use client";

import { GenericConfigTab } from "./_generic-config-tab";
import type { FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveAutorisationsTab } from "../../_actions";

/** "yes"/"no"/"" → boolean | null for the column-backed image rights. */
const ynBool = (v: string | undefined): boolean | null =>
  v === "yes" ? true : v === "no" ? false : null;

/**
 * Autorisations tab — config-driven ("Autorisations" category). Image-rights
 * answers persist to the Family row (so siblings inherit) and quitter_seul to
 * dossierAnswers, via saveAutorisationsTab.
 */
export function DossierTabAutorisations({
  applicationId,
  config,
  initial,
  disabled,
}: {
  applicationId: string;
  config: EntityFieldsConfig;
  initial: FieldAnswers;
  disabled: boolean;
}) {
  return (
    <GenericConfigTab
      title="Autorisations"
      config={config}
      initial={initial}
      disabled={disabled}
      save={(answers) =>
        saveAutorisationsTab(applicationId, {
          imageRightsSite: ynBool(answers.auth_site),
          imageRightsBook: ynBool(answers.auth_livre),
          imageRightsSocial: ynBool(answers.auth_reseaux),
          imageRightsRadio: ynBool(answers.auth_radio),
          quitterSeul: ynBool(answers.quitter_seul),
        })
      }
    />
  );
}
