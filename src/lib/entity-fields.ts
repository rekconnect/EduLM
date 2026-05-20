/**
 * Tenant-wide custom field configuration for Parent and Student entities.
 *
 * Each tenant gets two configs (`Tenant.parentFieldsConfig`,
 * `Tenant.studentFieldsConfig`), stored as JSON. Each config defines:
 *   - Categories — display groupings used on the parent/student detail page
 *     (Identity, Contact, Services, …)
 *   - Fields — individual data points (label, type, required, options,
 *     conditional logic). Each field belongs to one category.
 *
 * The same config drives BOTH the application form (where the parent fills
 * the values during inscription) AND the persistent profile (where admins
 * view + edit them after). Answers live on `User.customAnswers` (parents)
 * and `Student.customAnswers` (students), keyed by field id.
 */

export const ENTITY_TYPES = ["parent", "student"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "yes_no",
  "select",
  "country",
  "nationality",
  "lebanon_region",
  "lebanon_kaza_with_town",
  "lebanon_town_for_kaza",
  "establishment_ref",
  "establishment_with_niveau",
  "date",
  "number",
  "phone",
  "email",
  "photo",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * Types whose options come from somewhere other than the admin-defined
 * `options` array. The form-builder UI hides the options textarea for these.
 *
 * Two sub-flavors:
 *   - Static presets (country / nationality / lebanon_region) — see lookups.ts
 *   - Dynamic references (establishment_ref) — options pulled from the
 *     tenant's own data at render time
 */
export const PRESET_LOOKUP_TYPES: ReadonlySet<FieldType> = new Set([
  "country",
  "nationality",
  "lebanon_region",
  "lebanon_kaza_with_town",
  "lebanon_town_for_kaza",
  "establishment_ref",
  "establishment_with_niveau",
]);

/** Subset that needs a source-field reference picker in the admin UI. */
export const CROSS_FIELD_LOOKUP_TYPES: ReadonlySet<FieldType> = new Set([
  "lebanon_town_for_kaza",
]);

/**
 * Subset whose options are dynamic (come from tenant data, not a static list).
 * The renderer needs to be supplied with the relevant data via `extras`.
 */
export const DYNAMIC_LOOKUP_TYPES: ReadonlySet<FieldType> = new Set([
  "establishment_ref",
  "establishment_with_niveau",
]);

/** Separator used by establishment_with_niveau to store both parts in one string. */
export const ESTABLISHMENT_NIVEAU_SEPARATOR = " / ";

export type FieldCategory = {
  /** Stable client-generated id (used by fields to reference the category). */
  id: string;
  name: string;
  order: number;
  /** Hide from parent-facing UI without losing data. */
  active: boolean;
};

export type ConditionalRule = {
  /** Field id whose value drives visibility. */
  fieldId: string;
  /** Show this field only when the referenced field's value equals this. */
  equals: string;
};

/**
 * Properties on the User record that a custom field can be bound to. When
 * set, the parent's existing User data pre-fills the field automatically so
 * they never re-type info they entered at signup.
 *
 * Only relevant on parent fields. Student fields don't bind to User (the
 * student isn't a User).
 */
export const USER_BOUND_PROPS = [
  "firstName",
  "lastName",
  "name",
  "email",
] as const;
export type UserBoundProp = (typeof USER_BOUND_PROPS)[number];

export type FieldDef = {
  /** Stable client-generated id (used as the answer key). */
  id: string;
  /**
   * Slug-style semantic key (e.g. "profession", "blood_type") — used for
   * reporting and integrations. Admin-editable; defaults to a slug of the
   * label when first created.
   */
  key: string;
  label: string;
  hint?: string;
  type: FieldType;
  required: boolean;
  /** Only meaningful for type=select. */
  options?: string[];
  categoryId: string;
  order: number;
  /**
   * Conditional visibility. Single condition for now; AND/OR composition can
   * be added in a future round without breaking the schema (rule could
   * become `{ all: [...] }` / `{ any: [...] }`).
   */
  showIf?: ConditionalRule;
  /**
   * Cross-field options source. Used by types like `lebanon_town_for_kaza`:
   * the field's dropdown options derive from looking up `answers[fieldId]`
   * in a built-in mapping. Admin picks the source field at config time.
   */
  optionsSource?: { fieldId: string };
  /**
   * Pre-fill the field from the parent's User record. e.g. a "Prénom" field
   * with userBoundTo: "firstName" auto-fills with User.firstName the first
   * time the parent opens the dossier. Saved value lives in the answers JSON
   * as usual — User columns are NOT modified from this flow.
   */
  userBoundTo?: UserBoundProp;
};

export type EntityFieldsConfig = {
  categories: FieldCategory[];
  fields: FieldDef[];
};

// ─── Default categories (bootstrapped on first edit) ──────────────────

export const DEFAULT_PARENT_CATEGORIES: Array<Omit<FieldCategory, "id">> = [
  { name: "Identité", order: 0, active: true },
  { name: "Contact", order: 1, active: true },
  { name: "Professionnel", order: 2, active: true },
  { name: "Autorisations", order: 3, active: true },
];

export const DEFAULT_STUDENT_CATEGORIES: Array<Omit<FieldCategory, "id">> = [
  { name: "Identité", order: 0, active: true },
  { name: "Scolarité", order: 1, active: true },
  { name: "Santé", order: 2, active: true },
  { name: "Services", order: 3, active: true },
  { name: "Autorisations", order: 4, active: true },
  { name: "Documents", order: 5, active: true },
];

// ─── Parsing / validation ─────────────────────────────────────────────

export function parseEntityFieldsConfig(raw: unknown): EntityFieldsConfig {
  if (!raw || typeof raw !== "object") return { categories: [], fields: [] };
  const cfg = raw as Partial<EntityFieldsConfig>;
  return {
    categories: Array.isArray(cfg.categories)
      ? cfg.categories.filter(isCategory).map((c) => ({
          id: c.id,
          name: c.name,
          order: c.order ?? 0,
          active: c.active ?? true,
        }))
      : [],
    fields: Array.isArray(cfg.fields)
      ? cfg.fields.filter(isField).map((f) => ({
          id: f.id,
          key: f.key,
          label: f.label,
          hint: f.hint,
          type: f.type,
          required: f.required ?? false,
          options: Array.isArray(f.options) ? f.options : undefined,
          categoryId: f.categoryId,
          order: f.order ?? 0,
          showIf: isCondition(f.showIf) ? f.showIf : undefined,
          optionsSource: isOptionsSource(f.optionsSource)
            ? f.optionsSource
            : undefined,
          userBoundTo:
            typeof f.userBoundTo === "string" &&
            (USER_BOUND_PROPS as readonly string[]).includes(f.userBoundTo)
              ? (f.userBoundTo as UserBoundProp)
              : undefined,
        }))
      : [],
  };
}

function isCategory(raw: unknown): raw is FieldCategory {
  if (!raw || typeof raw !== "object") return false;
  const c = raw as Partial<FieldCategory>;
  return typeof c.id === "string" && typeof c.name === "string";
}

function isField(raw: unknown): raw is FieldDef {
  if (!raw || typeof raw !== "object") return false;
  const f = raw as Partial<FieldDef>;
  return (
    typeof f.id === "string" &&
    typeof f.label === "string" &&
    typeof f.key === "string" &&
    typeof f.categoryId === "string" &&
    (FIELD_TYPES as readonly string[]).includes(f.type as string)
  );
}

function isCondition(raw: unknown): raw is ConditionalRule {
  if (!raw || typeof raw !== "object") return false;
  const c = raw as Partial<ConditionalRule>;
  return typeof c.fieldId === "string" && typeof c.equals === "string";
}

function isOptionsSource(raw: unknown): raw is { fieldId: string } {
  if (!raw || typeof raw !== "object") return false;
  return typeof (raw as { fieldId?: unknown }).fieldId === "string";
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Slugify a label into a stable semantic key for reporting. */
export function slugifyKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Group fields by category id, preserving the configured order within each. */
export function fieldsByCategory(
  config: EntityFieldsConfig,
): Map<string, FieldDef[]> {
  const out = new Map<string, FieldDef[]>();
  const sorted = [...config.fields].sort((a, b) => a.order - b.order);
  for (const f of sorted) {
    const list = out.get(f.categoryId) ?? [];
    list.push(f);
    out.set(f.categoryId, list);
  }
  return out;
}

/**
 * Evaluate a field's conditional visibility given the current answer set.
 * Returns true when the field should render (no condition, or condition met).
 */
export function evaluateShowIf(
  field: FieldDef,
  answers: Record<string, string>,
): boolean {
  if (!field.showIf) return true;
  return (answers[field.showIf.fieldId] ?? "") === field.showIf.equals;
}
