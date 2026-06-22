/**
 * Configuration for the "Add a student" admin form (/students/new). Lives on
 * Tenant.studentCreateFieldsConfig (JSON). Mirrors parent-create-config.ts:
 *
 *  - `builtin` — visibility/required toggles for the standard student fields.
 *    firstName, lastName and status are always present (you can't create a
 *    student without a name / status), so they're not configurable here.
 *  - `categories` + `fields` — the entity-fields shape for extra answers
 *    captured at creation time, saved into Student.customAnswers.
 */

import {
  parseEntityFieldsConfig,
  type EntityFieldsConfig,
} from "./entity-fields";
import { parseBuiltinMeta, type BuiltinFieldMeta } from "./parent-create-config";

/** Standard student fields the admin can hide or relax to optional. */
export const STUDENT_CREATE_BUILTIN_KEYS = [
  "dob",
  "gender",
  "nationality",
  "placeOfBirth",
  "address",
  "city",
  "postalCode",
  "country",
  "previousSchool",
  "emergencyContact",
  "internalNotes",
] as const;

export type StudentCreateBuiltinKey =
  (typeof STUDENT_CREATE_BUILTIN_KEYS)[number];

/** Always-present fields (a student can't exist without them) — they can be
 *  renamed but never hidden, so they carry a label override only, no mode. */
export const STUDENT_REQUIRED_KEYS = ["firstName", "lastName", "status"] as const;
export type StudentRequiredKey = (typeof STUDENT_REQUIRED_KEYS)[number];

/** All standard fields in their default order: required ones first, then the
 *  configurable ones. The editor and the create form render this single list. */
export const STUDENT_ALL_CREATE_KEYS = [
  ...STUDENT_REQUIRED_KEYS,
  ...STUDENT_CREATE_BUILTIN_KEYS,
] as const;
export type StudentAllCreateKey = (typeof STUDENT_ALL_CREATE_KEYS)[number];

/** True for the always-required identity fields (locked mode, but renameable
 *  and reorderable like the rest). */
export function isStudentRequiredKey(k: string): k is StudentRequiredKey {
  return (STUDENT_REQUIRED_KEYS as readonly string[]).includes(k);
}

/**
 * Default label for a student create-field, resolved from the canonical app
 * message keys (the "students" and "admissions" namespaces — the same ones the
 * student fiche uses). Both the editor and the create form call this so their
 * defaults can never drift apart. `t` is the "students" translator, `tAdm` the
 * "admissions" one.
 */
export function studentCreateDefaultLabel(
  k: StudentAllCreateKey,
  t: (key: string) => string,
  tAdm: (key: string) => string,
): string {
  switch (k) {
    case "firstName":
      return t("fieldFirstName");
    case "lastName":
      return t("fieldLastName");
    case "status":
      return t("fieldStatus");
    case "dob":
      return t("fieldDob");
    case "gender":
      return tAdm("fieldChildGender");
    case "nationality":
      return tAdm("fieldChildNationality");
    case "placeOfBirth":
      return tAdm("fieldChildPlaceOfBirth");
    case "address":
      return tAdm("fieldAddress");
    case "city":
      return tAdm("fieldCity");
    case "postalCode":
      return tAdm("fieldPostalCode");
    case "country":
      return tAdm("fieldCountry");
    case "previousSchool":
      return t("fieldPreviousSchool");
    case "emergencyContact":
      return t("fieldEmergencyContact");
    case "internalNotes":
      return t("fieldInternalNotes");
  }
}

export type BuiltinFieldMode = "required" | "optional" | "hidden";

const BUILTIN_MODES: ReadonlyArray<BuiltinFieldMode> = [
  "required",
  "optional",
  "hidden",
];

export type StudentCreateConfig = {
  builtin: Record<StudentCreateBuiltinKey, BuiltinFieldMode>;
  builtinMeta?: Partial<
    Record<StudentCreateBuiltinKey | StudentRequiredKey, BuiltinFieldMeta>
  >;
} & EntityFieldsConfig;

/** Defaults: the common identity fields optional, the rest hidden. */
export const DEFAULT_STUDENT_CREATE_CONFIG: StudentCreateConfig = {
  builtin: {
    dob: "optional",
    gender: "optional",
    nationality: "optional",
    placeOfBirth: "optional",
    address: "hidden",
    city: "hidden",
    postalCode: "hidden",
    country: "hidden",
    previousSchool: "optional",
    emergencyContact: "optional",
    internalNotes: "optional",
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

/** Defensive parse — never throws; always returns a full `builtin` map. */
export function parseStudentCreateConfig(raw: unknown): StudentCreateConfig {
  const fieldsConfig = parseEntityFieldsConfig(raw);

  const builtin: Record<StudentCreateBuiltinKey, BuiltinFieldMode> = {
    ...DEFAULT_STUDENT_CREATE_CONFIG.builtin,
  };
  if (raw && typeof raw === "object" && "builtin" in raw) {
    const b = (raw as { builtin?: unknown }).builtin;
    if (b && typeof b === "object") {
      for (const key of STUDENT_CREATE_BUILTIN_KEYS) {
        const mode = parseBuiltinMode((b as Record<string, unknown>)[key]);
        if (mode) builtin[key] = mode;
      }
    }
  }

  const builtinMeta = parseBuiltinMeta(
    raw && typeof raw === "object"
      ? (raw as { builtinMeta?: unknown }).builtinMeta
      : undefined,
    [...STUDENT_REQUIRED_KEYS, ...STUDENT_CREATE_BUILTIN_KEYS],
  );

  return {
    builtin,
    builtinMeta,
    categories: fieldsConfig.categories,
    fields: fieldsConfig.fields,
  };
}
