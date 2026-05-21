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

/** Three-state visibility/requirement for built-in fields. */
export type BuiltinFieldMode = "required" | "optional" | "hidden";

const BUILTIN_MODES: ReadonlyArray<BuiltinFieldMode> = [
  "required",
  "optional",
  "hidden",
];

export type ParentCreateConfig = {
  builtin: Record<ParentCreateBuiltinKey, BuiltinFieldMode>;
} & EntityFieldsConfig;

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

  return {
    builtin,
    categories: fieldsConfig.categories,
    fields: fieldsConfig.fields,
  };
}
