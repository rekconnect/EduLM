"use client";

import { GenericConfigTab } from "./_generic-config-tab";
import type { FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveStudentDossier } from "../../_actions";

/**
 * Élève tab — config-driven ("Info générale" + "Info Arabe"). Answers persist
 * to Application.studentAnswers; saveStudentDossier mirrors the bound
 * prénom/nom/date de naissance + "sexe" to the Application columns.
 */
export function DossierTabEleve({
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
      title="Élève"
      config={config}
      initial={initial}
      establishments={establishments}
      disabled={disabled}
      renewal={renewal}
      save={(answers) => saveStudentDossier(applicationId, { answers })}
    />
  );
}
