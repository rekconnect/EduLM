/**
 * Inscription dossier — field resolver.
 *
 * Merges the immutable registry defaults from
 * `inscription-fields-registry.ts` with the sparse tenant overrides
 * stored in `Tenant.inscriptionFormConfig`, returning the
 * label / required / hidden values a component should use right now.
 *
 * This file is SERVER-SAFE. It has no React imports — feel free to call
 * `resolveField()` inside a server component, a server action, or a
 * Prisma-extension hook. The client-side `useField(key)` hook lives in
 * `src/components/dossier/tenant-config-context.tsx` (mounted high in
 * the dossier tree) and reads the same shape via context.
 *
 * Design notes:
 * - Overrides are SPARSE. We never write defaults — reset = remove the
 *   key entirely. Empty-string labels in an override are ignored and
 *   fall back to the registry default.
 * - Hidden=true defensively forces required=false in the resolved
 *   object. Otherwise a tenant who hides a field and forgets to flip
 *   `required` would still block dossier submission on something the
 *   parent can't see.
 * - Unknown keys never throw. In dev we log a warning; in prod we
 *   return null and let the caller decide whether to render fallback
 *   text. Throwing during a parent's inscription render would be
 *   catastrophically wrong.
 */

import {
  INSCRIPTION_FIELDS_REGISTRY,
  type DossierFieldEntry,
  type DossierFieldLabel,
  type DossierTab,
  type InscriptionFieldKey,
} from "./inscription-fields-registry";

export type DossierLocale = "fr" | "en" | "ar";

/**
 * Shape of `Tenant.inscriptionFormConfig`. Sparse: only diverging keys
 * are stored. Bump `version` if the shape ever changes.
 */
export type TenantInscriptionFormConfig = {
  version: 1;
  fields: Record<string, FieldOverride>;
};

export type FieldOverride = {
  label?: Partial<DossierFieldLabel>;
  required?: boolean;
  hidden?: boolean;
};

export type ResolvedField = {
  key: string;
  tab: DossierTab;
  section: string;
  subSection?: string;
  type: DossierFieldEntry["type"];
  /** Resolved label in the requested locale; never empty. */
  label: string;
  /** True iff the parent must fill this field before submission. */
  required: boolean;
  /** True iff this field should be skipped entirely in the parent UI. */
  hidden: boolean;
  /** True iff this field has any tenant override set. */
  hasOverride: boolean;
};

// ──────────────────────────────────────────────────────────────────────
// Parsing
// ──────────────────────────────────────────────────────────────────────

/**
 * Coerce the raw `Tenant.inscriptionFormConfig` JSON column into the
 * typed shape. Bad / missing / older data → empty config. Never throws.
 *
 * Call this once per request in the server component that fetches the
 * tenant, then hand the result down via `TenantConfigProvider`. The
 * resolver itself is cheap, so we don't bother memoising — the
 * server-side fetch already happens at most once per render.
 */
export function parseTenantInscriptionFormConfig(
  raw: unknown,
): TenantInscriptionFormConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_CONFIG;
  }
  const obj = raw as Record<string, unknown>;
  const fieldsRaw = obj.fields;
  if (!fieldsRaw || typeof fieldsRaw !== "object" || Array.isArray(fieldsRaw)) {
    return EMPTY_CONFIG;
  }
  const out: Record<string, FieldOverride> = {};
  for (const [key, ovRaw] of Object.entries(
    fieldsRaw as Record<string, unknown>,
  )) {
    const ov = sanitiseOverride(ovRaw);
    if (ov) out[key] = ov;
  }
  return { version: 1, fields: out };
}

const EMPTY_CONFIG: TenantInscriptionFormConfig = { version: 1, fields: {} };

function sanitiseOverride(raw: unknown): FieldOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const out: FieldOverride = {};
  if (obj.label && typeof obj.label === "object") {
    const lbl = obj.label as Record<string, unknown>;
    const labelOut: Partial<DossierFieldLabel> = {};
    if (typeof lbl.fr === "string" && lbl.fr.trim()) labelOut.fr = lbl.fr;
    if (typeof lbl.en === "string" && lbl.en.trim()) labelOut.en = lbl.en;
    if (typeof lbl.ar === "string" && lbl.ar.trim()) labelOut.ar = lbl.ar;
    if (Object.keys(labelOut).length) out.label = labelOut;
  }
  if (typeof obj.required === "boolean") out.required = obj.required;
  if (typeof obj.hidden === "boolean") out.hidden = obj.hidden;
  if (Object.keys(out).length === 0) return null;
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Resolution
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolve one field's label / required / hidden state, applying the
 * tenant override (if any) on top of the registry default.
 *
 * Returns `null` for unregistered keys — caller decides what to do.
 * In dev a warning is logged so typos surface during development.
 */
export function resolveField(
  key: string,
  tenantConfig: TenantInscriptionFormConfig | null | undefined,
  locale: DossierLocale,
): ResolvedField | null {
  const entry = (
    INSCRIPTION_FIELDS_REGISTRY as Record<string, DossierFieldEntry>
  )[key];
  if (!entry) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        `[inscription-fields] Unknown registry key: ${JSON.stringify(key)}. ` +
          `If this is a new field, add it to inscription-fields-registry.ts.`,
      );
    }
    return null;
  }

  const override = tenantConfig?.fields?.[key];
  const overrideLabel = override?.label?.[locale];
  const defaultLabel = entry.defaultLabel[locale] ?? entry.defaultLabel.fr;

  const hidden = override?.hidden === true;
  const required = hidden
    ? false
    : typeof override?.required === "boolean"
      ? override.required
      : entry.defaultRequired;

  return {
    key,
    tab: entry.tab,
    section: entry.section,
    subSection: entry.subSection,
    type: entry.type,
    label:
      typeof overrideLabel === "string" && overrideLabel.trim()
        ? overrideLabel
        : defaultLabel,
    required,
    hidden,
    hasOverride: Boolean(override),
  };
}

/**
 * Resolve multiple fields at once. Unknown keys are dropped from the
 * result silently (the per-key `resolveField` already warns in dev).
 */
export function resolveFields(
  keys: readonly string[],
  tenantConfig: TenantInscriptionFormConfig | null | undefined,
  locale: DossierLocale,
): ResolvedField[] {
  const out: ResolvedField[] = [];
  for (const k of keys) {
    const f = resolveField(k, tenantConfig, locale);
    if (f) out.push(f);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Write-side helpers (used by the editor's server actions in Phase 3)
// ──────────────────────────────────────────────────────────────────────

/**
 * Strip an override down to its diverging values vs. the registry
 * default. If nothing diverges, returns null so the caller knows to
 * DELETE the key from `fields` rather than write an empty object.
 *
 * Examples:
 *   - { required: true } against a field that defaults to required=true → null
 *   - { label: { fr: "Nom" } } against default fr "Nom" → null (label dropped)
 *   - { hidden: true } against default hidden=false → kept
 */
export function stripOverrideToDiverging(
  key: string,
  override: FieldOverride,
): FieldOverride | null {
  const entry = (
    INSCRIPTION_FIELDS_REGISTRY as Record<string, DossierFieldEntry>
  )[key];
  if (!entry) return null;

  const out: FieldOverride = {};

  if (override.label) {
    const labelOut: Partial<DossierFieldLabel> = {};
    for (const locale of ["fr", "en", "ar"] as const) {
      const v = override.label[locale];
      if (typeof v === "string" && v.trim() && v !== entry.defaultLabel[locale]) {
        labelOut[locale] = v;
      }
    }
    if (Object.keys(labelOut).length) out.label = labelOut;
  }

  if (
    typeof override.required === "boolean" &&
    override.required !== entry.defaultRequired
  ) {
    out.required = override.required;
  }

  // Hidden defaults to false everywhere in v1 — any explicit `true` is a diff.
  if (override.hidden === true) {
    out.hidden = true;
  }

  return Object.keys(out).length === 0 ? null : out;
}

/**
 * Merge a new override into an existing config, applying the
 * strip-to-diverging rule. Setting a field to its default values
 * removes the key from `fields`. Use this in the editor's
 * saveFieldOverride server action.
 */
export function applyFieldOverride(
  current: TenantInscriptionFormConfig | null | undefined,
  key: string,
  override: FieldOverride,
): TenantInscriptionFormConfig {
  const base: TenantInscriptionFormConfig = current
    ? { version: 1, fields: { ...current.fields } }
    : { version: 1, fields: {} };
  const stripped = stripOverrideToDiverging(key, override);
  if (stripped) {
    base.fields[key] = stripped;
  } else {
    delete base.fields[key];
  }
  return base;
}

/**
 * Equivalent of the editor's "Réinitialiser ce champ" — drops the key
 * from `fields`. No-op if nothing was stored for it.
 */
export function resetFieldOverride(
  current: TenantInscriptionFormConfig | null | undefined,
  key: string,
): TenantInscriptionFormConfig {
  if (!current?.fields?.[key]) {
    return current ?? EMPTY_CONFIG;
  }
  const next: TenantInscriptionFormConfig = {
    version: 1,
    fields: { ...current.fields },
  };
  delete next.fields[key];
  return next;
}

// Re-export the registry key type so consumers don't need a second
// import when they want a strictly-typed key parameter.
export type { InscriptionFieldKey };
