"use client";

import { GenericConfigTab } from "./_generic-config-tab";
import type { FieldAnswers } from "@/components/fields-renderer";
import type { EntityFieldsConfig } from "@/lib/entity-fields";
import { saveJustificatifsTab, uploadDossierFile } from "../../_actions";

/** Upload a picked file to storage, returning the {path,name} answer ref. */
async function onUploadFile(file: File) {
  const fd = new FormData();
  fd.set("file", file);
  const r = await uploadDossierFile(fd);
  return r.ok && r.path ? { path: r.path, name: r.name ?? file.name } : null;
}

/**
 * Justificatifs tab — config-driven (`file` fields, one per required document).
 * Files upload to storage; the answer keeps a {path,name} reference and
 * persists under dossierAnswers.justificatifs.
 */
export function DossierTabJustificatifs({
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
      title="Justificatifs"
      config={config}
      initial={initial}
      disabled={disabled}
      renewal={renewal}
      extras={{ onUploadFile }}
      save={(answers) => saveJustificatifsTab(applicationId, answers)}
    />
  );
}
