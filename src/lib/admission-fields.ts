/**
 * Canonical registry of the built-in admission application fields plus a
 * helper layer for reading the per-cycle override stored as JSON on
 * `AdmissionCycle.fieldConfig`. The wizard, the server-action validators,
 * and the admin configurator all read from here so they can't drift.
 */

export type FieldVisibility = "required" | "optional" | "hidden";
export type WizardStep = "identity" | "family" | "academic";

export type FieldDef = {
  key: string;
  step: WizardStep;
  /** Built-in visibility when the cycle has no override set. */
  default: FieldVisibility;
  /**
   * When true the admin cannot change the visibility — the field is
   * structurally needed (e.g., we always need a child's name).
   */
  locked?: boolean;
  /** i18n key under the `admissions` namespace for the field's display label. */
  labelKey: string;
};

export const ADMISSION_FIELDS: FieldDef[] = [
  // ── Identity step ──────────────────────────────────────────
  { key: "childFirstName",     step: "identity", default: "required", locked: true, labelKey: "fieldChildFirstName" },
  { key: "childLastName",      step: "identity", default: "required", locked: true, labelKey: "fieldChildLastName" },
  { key: "childDob",           step: "identity", default: "required", labelKey: "fieldChildDob" },
  { key: "childGender",        step: "identity", default: "optional", labelKey: "fieldChildGender" },
  { key: "childNationality",   step: "identity", default: "optional", labelKey: "fieldChildNationality" },
  { key: "childPlaceOfBirth",  step: "identity", default: "optional", labelKey: "fieldChildPlaceOfBirth" },

  // ── Family step ────────────────────────────────────────────
  { key: "primaryParentName",  step: "family", default: "required", locked: true, labelKey: "fieldPrimaryParentName" },
  { key: "primaryParentPhone", step: "family", default: "required", labelKey: "fieldPrimaryParentPhone" },
  { key: "primaryParentEmail", step: "family", default: "required", labelKey: "fieldPrimaryParentEmail" },
  { key: "secondaryParentName",  step: "family", default: "optional", labelKey: "fieldSecondaryParentName" },
  { key: "secondaryParentPhone", step: "family", default: "optional", labelKey: "fieldSecondaryParentPhone" },
  { key: "secondaryParentEmail", step: "family", default: "optional", labelKey: "fieldSecondaryParentEmail" },
  { key: "address",            step: "family", default: "required", labelKey: "fieldAddress" },
  { key: "city",               step: "family", default: "required", labelKey: "fieldCity" },
  { key: "postalCode",         step: "family", default: "optional", labelKey: "fieldPostalCode" },
  { key: "country",            step: "family", default: "required", labelKey: "fieldCountry" },

  // ── Academic step ──────────────────────────────────────────
  { key: "currentSchool",      step: "academic", default: "optional", labelKey: "fieldCurrentSchool" },
  { key: "currentLevel",       step: "academic", default: "optional", labelKey: "fieldCurrentLevel" },
  { key: "requestedLevel",     step: "academic", default: "required", locked: true, labelKey: "fieldRequestedLevel" },
  { key: "motivationNote",     step: "academic", default: "optional", labelKey: "fieldMotivation" },
];

export const WIZARD_STEPS: WizardStep[] = ["identity", "family", "academic"];

/**
 * Shape of `AdmissionCycle.fieldConfig`. Designed to be extended without
 * another migration as we add custom questions, label overrides, etc.
 */
export type CycleFieldConfig = {
  fields?: Record<string, FieldVisibility>;
  // Round 3+: customQuestions, customLabels, stepIntros, fieldOrder, etc.
};

export function parseFieldConfig(raw: unknown): CycleFieldConfig {
  if (!raw || typeof raw !== "object") return {};
  const cfg = raw as Partial<CycleFieldConfig>;
  return { fields: cfg.fields ?? {} };
}

export function getFieldVisibility(
  config: CycleFieldConfig | undefined,
  fieldKey: string,
): FieldVisibility {
  const def = ADMISSION_FIELDS.find((f) => f.key === fieldKey);
  if (!def) return "optional";
  if (def.locked) return def.default;
  const override = config?.fields?.[fieldKey];
  return override ?? def.default;
}

export function fieldsForStep(step: WizardStep): FieldDef[] {
  return ADMISSION_FIELDS.filter((f) => f.step === step);
}
