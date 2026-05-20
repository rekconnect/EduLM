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

// ─── Custom questions (Round 3) ───────────────────────────────

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "yes_no",
  "select",
  "date",
  "number",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type CustomQuestion = {
  /** Stable client-generated id (cuid-like). Used as the answer key. */
  id: string;
  type: QuestionType;
  label: string;
  hint?: string;
  required: boolean;
  /** Only meaningful for `select`. Each entry is one dropdown option. */
  options?: string[];
};

// ─── Required documents (Round 4) ─────────────────────────────

export type RequiredDocument = {
  /** Stable client-generated id. Used to match uploads to a requirement. */
  id: string;
  label: string;
  hint?: string;
  required: boolean;
  /** Optional MIME-type filter for the file picker (e.g., "application/pdf,image/*") */
  acceptedTypes?: string;
};

/**
 * Shape of `AdmissionCycle.fieldConfig`. Designed to be extended without
 * another migration as we add label overrides, reorder, etc.
 */
export type CycleFieldConfig = {
  fields?: Record<string, FieldVisibility>;
  customQuestions?: CustomQuestion[];
  requiredDocuments?: RequiredDocument[];
  /** Round 5-D: admin-supplied label override per built-in field key. */
  customLabels?: Record<string, string>;
  /** Round 5-D: admin-supplied intro paragraph shown above each wizard step. */
  stepIntros?: Partial<Record<WizardStep, string>>;
  /** Round 5-E: ordered list of built-in field keys per step. */
  fieldOrder?: Partial<Record<WizardStep, string[]>>;
};

export function parseFieldConfig(raw: unknown): CycleFieldConfig {
  if (!raw || typeof raw !== "object") return {};
  const cfg = raw as Partial<CycleFieldConfig>;
  return {
    fields: cfg.fields ?? {},
    customQuestions: Array.isArray(cfg.customQuestions)
      ? cfg.customQuestions.filter(isCustomQuestion)
      : [],
    requiredDocuments: Array.isArray(cfg.requiredDocuments)
      ? cfg.requiredDocuments.filter(isRequiredDocument)
      : [],
    customLabels: parseCustomLabels(cfg.customLabels),
    stepIntros: parseStepIntros(cfg.stepIntros),
    fieldOrder: parseFieldOrder(cfg.fieldOrder),
  };
}

function parseCustomLabels(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  const allowed = new Set(ADMISSION_FIELDS.map((f) => f.key));
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(k)) continue;
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length > 0 && trimmed.length <= 120) out[k] = trimmed;
  }
  return out;
}

function parseStepIntros(raw: unknown): Partial<Record<WizardStep, string>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<WizardStep, string>> = {};
  for (const step of WIZARD_STEPS) {
    const v = (raw as Record<string, unknown>)[step];
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length > 0 && trimmed.length <= 1000) out[step] = trimmed;
  }
  return out;
}

function parseFieldOrder(raw: unknown): Partial<Record<WizardStep, string[]>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<WizardStep, string[]>> = {};
  for (const step of WIZARD_STEPS) {
    const list = (raw as Record<string, unknown>)[step];
    if (!Array.isArray(list)) continue;
    const allowed = new Set(fieldsForStep(step).map((f) => f.key));
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const item of list) {
      if (typeof item !== "string") continue;
      if (!allowed.has(item)) continue;
      if (seen.has(item)) continue;
      seen.add(item);
      cleaned.push(item);
    }
    if (cleaned.length > 0) out[step] = cleaned;
  }
  return out;
}

/** Returns the admin's label override if any, falling back to the default t() value. */
export function getFieldLabel(
  config: CycleFieldConfig | undefined,
  fieldKey: string,
  fallback: string,
): string {
  return config?.customLabels?.[fieldKey] ?? fallback;
}

/**
 * Returns the canonical field list for a wizard step in the order configured
 * by the admin (Round 5-E). Fields without an override fall back to the
 * registry order, and any newly-added registry fields are appended.
 */
export function orderedFieldsForStep(
  step: WizardStep,
  config: CycleFieldConfig | undefined,
): FieldDef[] {
  const defaults = fieldsForStep(step);
  const order = config?.fieldOrder?.[step];
  if (!order || order.length === 0) return defaults;
  const byKey = new Map(defaults.map((f) => [f.key, f] as const));
  const result: FieldDef[] = [];
  for (const key of order) {
    const def = byKey.get(key);
    if (def) {
      result.push(def);
      byKey.delete(key);
    }
  }
  for (const remaining of byKey.values()) result.push(remaining);
  return result;
}

function isRequiredDocument(raw: unknown): raw is RequiredDocument {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as Partial<RequiredDocument>;
  return (
    typeof d.id === "string" &&
    typeof d.label === "string" &&
    typeof d.required === "boolean"
  );
}

function isCustomQuestion(raw: unknown): raw is CustomQuestion {
  if (!raw || typeof raw !== "object") return false;
  const q = raw as Partial<CustomQuestion>;
  return (
    typeof q.id === "string" &&
    typeof q.label === "string" &&
    typeof q.required === "boolean" &&
    (QUESTION_TYPES as readonly string[]).includes(q.type as string)
  );
}

/**
 * Server-side answer validation. UI does the same checks for live feedback.
 * Returns null on success, an error key string on failure.
 */
export function validateAnswer(
  question: CustomQuestion,
  value: string,
): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") {
    return question.required ? "required" : null;
  }
  switch (question.type) {
    case "yes_no":
      return ["yes", "no"].includes(trimmed) ? null : "invalid";
    case "select":
      return question.options?.includes(trimmed) ? null : "invalid";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? null : "invalid";
    case "number":
      return Number.isNaN(Number(trimmed)) ? "invalid" : null;
    case "short_text":
      return trimmed.length <= 200 ? null : "too_long";
    case "long_text":
      return trimmed.length <= 2000 ? null : "too_long";
  }
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
