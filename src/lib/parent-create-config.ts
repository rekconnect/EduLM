/**
 * Configuration for the "Add a parent" admin form. Lives on
 * Tenant.parentCreateFieldsConfig (JSON).
 *
 * Two pieces:
 *  - `builtin` — visibility/required toggles for the four standard
 *    optional fields (firstName, lastName, relation, locale). email +
 *    password are always required and never appear here, because the
 *    parent has to be able to log in.
 *  - `categories` + `fields` — the standard EntityFieldsConfig shape,
 *    used to capture extra information at parent-creation time. These
 *    answers are saved into User.customAnswers and visible from the
 *    parent profile alongside any answers gathered later.
 */

import {
  parseEntityFieldsConfig,
  type EntityFieldsConfig,
} from "./entity-fields";

/** Standard non-auth fields the admin can hide or relax to optional. */
export const PARENT_CREATE_BUILTIN_KEYS = [
  "firstName",
  "lastName",
  "relation",
  "locale",
] as const;

export type ParentCreateBuiltinKey =
  (typeof PARENT_CREATE_BUILTIN_KEYS)[number];

/**
 * Default label for a parent create-field, from the canonical "parents"
 * namespace keys (the same ones the parent profile uses). Shared by the editor
 * and the create form so their defaults can't drift. `t` is the "parents"
 * translator.
 */
export function parentCreateDefaultLabel(
  k: ParentCreateBuiltinKey,
  t: (key: string) => string,
): string {
  switch (k) {
    case "firstName":
      return t("fieldFirstName");
    case "lastName":
      return t("fieldLastName");
    case "relation":
      return t("fieldRelation");
    case "locale":
      return t("fieldLocale");
  }
}

/** Three-state visibility/requirement for built-in fields. */
export type BuiltinFieldMode = "required" | "optional" | "hidden";

const BUILTIN_MODES: ReadonlyArray<BuiltinFieldMode> = [
  "required",
  "optional",
  "hidden",
];

/** Per-built-in overrides: a custom label and/or a display order. */
export type BuiltinFieldMeta = { label?: string; order?: number };

export type ParentCreateConfig = {
  builtin: Record<ParentCreateBuiltinKey, BuiltinFieldMode>;
  builtinMeta?: Partial<Record<ParentCreateBuiltinKey, BuiltinFieldMeta>>;
} & EntityFieldsConfig;

/** Parse the optional builtinMeta map defensively (label string, order int). */
export function parseBuiltinMeta<K extends string>(
  raw: unknown,
  keys: readonly K[],
): Partial<Record<K, BuiltinFieldMeta>> {
  const out: Partial<Record<K, BuiltinFieldMeta>> = {};
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const k of keys) {
    const m = obj[k];
    if (!m || typeof m !== "object") continue;
    const mm = m as Record<string, unknown>;
    const meta: BuiltinFieldMeta = {};
    if (typeof mm.label === "string" && mm.label.trim()) meta.label = mm.label.trim();
    if (typeof mm.order === "number" && Number.isFinite(mm.order))
      meta.order = Math.trunc(mm.order);
    if (meta.label !== undefined || meta.order !== undefined) out[k] = meta;
  }
  return out;
}

/** Default behaviour: all built-ins required, no custom fields. */
export const DEFAULT_PARENT_CREATE_CONFIG: ParentCreateConfig = {
  builtin: {
    firstName: "required",
    lastName: "required",
    relation: "optional",
    locale: "optional",
  },
  categories: [],
  fields: [],
};

function parseBuiltinMode(raw: unknown): BuiltinFieldMode | null {
  return typeof raw === "string" &&
    (BUILTIN_MODES as readonly string[]).includes(raw)
    ? (raw as BuiltinFieldMode)
    : null;
}

/**
 * Defensive parse: tolerates missing keys and unknown shapes, never
 * throws. Always returns a fully-populated `builtin` object so the
 * form component doesn't need null-checks.
 */
export function parseParentCreateConfig(raw: unknown): ParentCreateConfig {
  const fieldsConfig = parseEntityFieldsConfig(raw);

  const builtin: Record<ParentCreateBuiltinKey, BuiltinFieldMode> = {
    ...DEFAULT_PARENT_CREATE_CONFIG.builtin,
  };
  if (raw && typeof raw === "object" && "builtin" in raw) {
    const b = (raw as { builtin?: unknown }).builtin;
    if (b && typeof b === "object") {
      for (const key of PARENT_CREATE_BUILTIN_KEYS) {
        const mode = parseBuiltinMode((b as Record<string, unknown>)[key]);
        if (mode) builtin[key] = mode;
      }
    }
  }

  const builtinMeta = parseBuiltinMeta(
    raw && typeof raw === "object"
      ? (raw as { builtinMeta?: unknown }).builtinMeta
      : undefined,
    PARENT_CREATE_BUILTIN_KEYS,
  );

  return {
    builtin,
    builtinMeta,
    categories: fieldsConfig.categories,
    fields: fieldsConfig.fields,
  };
}
