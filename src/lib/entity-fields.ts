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
  "multi_select",
  "country",
  "nationality",
  "lebanon_region",
  "lebanon_kaza_with_town",
  "lebanon_town_for_kaza",
  "establishment_ref",
  "establishment_with_niveau",
  "niveau_for_establishment",
  "date",
  "number",
  "phone",
  "email",
  "photo",
  "file",
  "repeater",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * Sub-field types allowed inside a `repeater` row. A closed, simple set —
 * repeaters hold flat rows (siblings, contacts, school history), not nested
 * repeaters or cross-field lookups.
 */
export const SUB_FIELD_TYPES = [
  "short_text",
  "select",
  "yes_no",
  "date",
  "number",
] as const;
export type SubFieldType = (typeof SUB_FIELD_TYPES)[number];

/** One column of a repeater row. */
export type SubFieldDef = {
  key: string;
  label: string;
  type: SubFieldType;
  /** Only meaningful for type=select. */
  options?: string[];
  required?: boolean;
};

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
  "niveau_for_establishment",
]);

/** Subset that needs a source-field reference picker in the admin UI. */
export const CROSS_FIELD_LOOKUP_TYPES: ReadonlySet<FieldType> = new Set([
  "lebanon_town_for_kaza",
  "niveau_for_establishment",
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
  /**
   * Show this field only when the referenced field's value equals this.
   * Single-value form. Ignored when `anyValue` or `equalsAny` is set.
   * Kept for backwards compatibility with rules saved before multi-value
   * matching landed — new admin saves write `equalsAny` instead.
   */
  equals?: string;
  /**
   * Show this field when the referenced field's value equals ANY of these.
   * OR-match across the list (e.g. show when level is "6ème" OR "5ème" OR
   * "4ème"). Takes precedence over `equals`.
   */
  equalsAny?: string[];
  /**
   * When true, show this field whenever the referenced field has ANY
   * non-empty value. Useful for "show optional follow-up if the parent
   * picked anything in the previous dropdown" patterns.
   */
  anyValue?: boolean;
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

/**
 * Application identity fields that a student custom field can mirror. When
 * a custom field has `dossierBoundTo` set, its value comes from the dossier
 * itself (entered in the Identité section / dossier creation form). The
 * custom field is rendered read-only so the canonical source stays the
 * single editable surface.
 *
 * Only relevant on student fields — the dossier identity is about the child.
 */
export const DOSSIER_BOUND_PROPS = [
  "childFirstName",
  "childLastName",
  "childDob",
  "establishment",
  "niveau",
  "childPassportLebanese",
] as const;
export type DossierBoundProp = (typeof DOSSIER_BOUND_PROPS)[number];

/**
 * Guardian columns a PARENT custom field can mirror. Like dossierBoundTo,
 * these render read-only — the value comes from the canonical Guardian
 * row (populated by the Dars import or the dossier's Responsable identity
 * section). Lets an admin keep a nicely-labelled "Mobile Number" /
 * "Nationalité" field in their form that auto-fills from the imported data
 * instead of going stale. Only relevant on parent fields.
 */
export const GUARDIAN_BOUND_PROPS = [
  "phone",
  "nationality1",
  "nationality2",
  "isLebanese",
  "passportLebanese",
  "relation",
] as const;
export type GuardianBoundProp = (typeof GUARDIAN_BOUND_PROPS)[number];

/**
 * Family columns a PARENT custom field can mirror (shared household data:
 * address + photo authorizations). Read-only mirror, same contract as
 * guardianBoundTo. Only relevant on parent fields.
 */
export const FAMILY_BOUND_PROPS = [
  "addressStreet",
  "addressHood",
  "addressCity",
  "addressCountry",
  "imageRightsSite",
  "imageRightsBook",
  "imageRightsSocial",
  "imageRightsRadio",
] as const;
export type FamilyBoundProp = (typeof FAMILY_BOUND_PROPS)[number];

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
  /**
   * Only meaningful for type=repeater — the columns of each dynamic row.
   * The answer value is a JSON array of objects keyed by sub-field key.
   */
  subFields?: SubFieldDef[];
  categoryId: string;
  order: number;
  /**
   * Conditional visibility. Single condition for now; AND/OR composition can
   * be added in a future round without breaking the schema (rule could
   * become `{ all: [...] }` / `{ any: [...] }`).
   */
  showIf?: ConditionalRule;
  /**
   * Conditional HIDE. When this rule matches, the field is hidden even if
   * showIf matches. Use for mutual-exclusion patterns (e.g. hide Passport
   * when ID number has any value, and vice versa).
   */
  hideIf?: ConditionalRule;
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
  /**
   * Master on/off switch. When false, the field is hidden everywhere
   * (renderer skips it, submit validation skips its required check, admin
   * profile forms skip it). Lets admin keep a field definition around
   * without exposing it to parents — useful while building or seasonally.
   * Defaults to true (treated as active when absent in legacy data).
   */
  active?: boolean;
  /**
   * Hide this field from the parent INSCRIPTION FORM while keeping it on the
   * fiche + admin views. For import-/admin-only fields a parent should never
   * fill at registration — the Dars student code, register number, an
   * inherited community, internal emails, etc. Independent of `active` (which
   * hides it everywhere). Defaults to false (shown on the form).
   */
  formHidden?: boolean;
  /**
   * Re-inscription (renewal) visibility overrides. A renewal reuses the same
   * inscription dossier, pre-filled from the existing student — these let the
   * field set differ between a fresh inscription and a re-inscription without
   * maintaining two configs:
   *   - renewalHidden:      hide on re-inscription (still shown on new).
   *   - inscriptionHidden:  hide on new inscription (→ re-inscription-only).
   *   - renewalRequired:    override `required` on re-inscription only.
   * `formHidden` still wins (hidden from both forms).
   */
  renewalHidden?: boolean;
  inscriptionHidden?: boolean;
  renewalRequired?: boolean;
  /**
   * Pre-fill behaviour on a re-inscription. Absent ⇒ pre-filled from last
   * year's value and editable (default). "blank" ⇒ not pre-filled, the parent
   * must fill it again. "locked" ⇒ pre-filled but read-only (parent can't
   * change it).
   */
  renewalPrefill?: "blank" | "locked";
  /**
   * Seed this (student) field from the FATHER's answer for the given PARENT
   * field key, on acceptance, when the student has no value of its own. The
   * configurable, generic version of "child inherits the father's communauté /
   * registre". Set to a parent field key (e.g. "communaute"); empty = no
   * inheritance. Student fields only. Applied by the acceptance bridge.
   */
  inheritParentKey?: string;
  /**
   * Mirror a value from the dossier identity (Application columns set
   * during creation). When set, the field shows the canonical value
   * read-only — edits must happen via the "Identité du dossier" section.
   * Use for layout/grouping flexibility without forcing the parent to
   * re-enter info already captured at creation.
   */
  dossierBoundTo?: DossierBoundProp;
  /**
   * Mirror a value from the parent's Guardian row (phone, nationality,
   * Lebanese status, …). Read-only display — the canonical edit happens on
   * the admin Identité tab / dossier Responsable section. Populated by the
   * Dars import. Parent fields only.
   */
  guardianBoundTo?: GuardianBoundProp;
  /**
   * Mirror a value from the family's shared Family row (address, photo
   * authorizations). Read-only display. Parent fields only.
   */
  familyBoundTo?: FamilyBoundProp;
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
          subFields: Array.isArray(f.subFields)
            ? (f.subFields as unknown[]).filter(isSubField).map((sf) => ({
                key: sf.key,
                label: sf.label,
                type: sf.type,
                options: Array.isArray(sf.options) ? sf.options : undefined,
                required: sf.required === true ? true : undefined,
              }))
            : undefined,
          categoryId: f.categoryId,
          order: f.order ?? 0,
          showIf: isCondition(f.showIf)
            ? cloneRule(f.showIf)
            : undefined,
          hideIf: isCondition(f.hideIf)
            ? cloneRule(f.hideIf)
            : undefined,
          optionsSource: isOptionsSource(f.optionsSource)
            ? f.optionsSource
            : undefined,
          userBoundTo:
            typeof f.userBoundTo === "string" &&
            (USER_BOUND_PROPS as readonly string[]).includes(f.userBoundTo)
              ? (f.userBoundTo as UserBoundProp)
              : undefined,
          // Default to active when missing (handles legacy data + fields
          // created before this toggle existed).
          active: f.active === false ? false : true,
          // Hidden from the inscription form (fiche/admin still show it).
          formHidden: f.formHidden === true ? true : undefined,
          // Re-inscription (renewal) visibility overrides.
          renewalHidden: f.renewalHidden === true ? true : undefined,
          inscriptionHidden: f.inscriptionHidden === true ? true : undefined,
          renewalRequired: f.renewalRequired === true ? true : undefined,
          renewalPrefill:
            f.renewalPrefill === "blank" || f.renewalPrefill === "locked"
              ? f.renewalPrefill
              : undefined,
          inheritParentKey:
            typeof f.inheritParentKey === "string" && f.inheritParentKey.trim()
              ? f.inheritParentKey.trim()
              : undefined,
          dossierBoundTo:
            typeof f.dossierBoundTo === "string" &&
            (DOSSIER_BOUND_PROPS as readonly string[]).includes(f.dossierBoundTo)
              ? (f.dossierBoundTo as DossierBoundProp)
              : undefined,
          guardianBoundTo:
            typeof f.guardianBoundTo === "string" &&
            (GUARDIAN_BOUND_PROPS as readonly string[]).includes(f.guardianBoundTo)
              ? (f.guardianBoundTo as GuardianBoundProp)
              : undefined,
          familyBoundTo:
            typeof f.familyBoundTo === "string" &&
            (FAMILY_BOUND_PROPS as readonly string[]).includes(f.familyBoundTo)
              ? (f.familyBoundTo as FamilyBoundProp)
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

function isSubField(raw: unknown): raw is SubFieldDef {
  if (!raw || typeof raw !== "object") return false;
  const sf = raw as Partial<SubFieldDef>;
  return (
    typeof sf.key === "string" &&
    typeof sf.label === "string" &&
    (SUB_FIELD_TYPES as readonly string[]).includes(sf.type as string)
  );
}

function isCondition(raw: unknown): raw is ConditionalRule {
  if (!raw || typeof raw !== "object") return false;
  const c = raw as Partial<ConditionalRule>;
  if (typeof c.fieldId !== "string") return false;
  // Need at least one of the match modes set.
  return (
    typeof c.equals === "string" ||
    (Array.isArray(c.equalsAny) && c.equalsAny.length > 0) ||
    c.anyValue === true
  );
}

/** Strip a parsed ConditionalRule to its canonical shape. */
function cloneRule(r: ConditionalRule): ConditionalRule {
  return {
    fieldId: r.fieldId,
    ...(typeof r.equals === "string" ? { equals: r.equals } : {}),
    ...(Array.isArray(r.equalsAny)
      ? {
          equalsAny: r.equalsAny.filter(
            (s): s is string => typeof s === "string",
          ),
        }
      : {}),
    ...(r.anyValue === true ? { anyValue: true } : {}),
  };
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

/**
 * Whether a field should appear on the parent dossier form, given whether this
 * is a re-inscription (renewal). `formHidden` always hides it; otherwise the
 * renewal/inscription-specific flag decides.
 */
export function fieldVisibleOnForm(
  f: FieldDef,
  opts: { renewal: boolean },
): boolean {
  if (f.formHidden) return false;
  return opts.renewal ? !f.renewalHidden : !f.inscriptionHidden;
}

/** Effective `required` for a field on the form (renewal can override it). */
export function fieldRequiredOnForm(
  f: FieldDef,
  opts: { renewal: boolean },
): boolean {
  return opts.renewal ? (f.renewalRequired ?? f.required) : f.required;
}

/** On a re-inscription, is this field read-only (pre-filled but locked)? */
export function fieldLockedOnForm(
  f: FieldDef,
  opts: { renewal: boolean },
): boolean {
  return opts.renewal && f.renewalPrefill === "locked";
}

/** On a re-inscription, should this field start blank (no pre-fill)? */
export function fieldPrefillBlank(
  f: FieldDef,
  opts: { renewal: boolean },
): boolean {
  return opts.renewal && f.renewalPrefill === "blank";
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
 *
 * Modes:
 *   - `anyValue: true` → match if the source field has any non-empty answer
 *   - `equals: "..."` → match if the source field's value equals exactly
 */
/**
 * Match a single condition against the current answer set.
 * Modes: `anyValue` > `equalsAny` > `equals` (single).
 */
function matchesRule(
  rule: ConditionalRule,
  answers: Record<string, string>,
): boolean {
  const sourceValue = (answers[rule.fieldId] ?? "").trim();
  if (rule.anyValue) return sourceValue.length > 0;
  if (Array.isArray(rule.equalsAny) && rule.equalsAny.length > 0) {
    return rule.equalsAny.some((v) => v.trim() === sourceValue);
  }
  return sourceValue === (rule.equals ?? "");
}

/**
 * Evaluate a field's conditional visibility given the current answer set.
 * Returns true when the field should render.
 *
 * Precedence (top wins):
 *   1. `hideIf` matches → hide
 *   2. `showIf` exists → must match
 *   3. No conditions → show
 */
export function evaluateShowIf(
  field: FieldDef,
  answers: Record<string, string>,
): boolean {
  // active === false is a permanent kill switch — overrides every other rule.
  if (field.active === false) return false;
  if (field.hideIf && matchesRule(field.hideIf, answers)) return false;
  if (field.showIf) return matchesRule(field.showIf, answers);
  return true;
}
