"use client";

import { useState } from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Field, FormRow } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  ESTABLISHMENT_NIVEAU_SEPARATOR,
  evaluateShowIf,
  fieldsByCategory,
  type EntityFieldsConfig,
  type FieldDef,
  type SubFieldDef,
} from "@/lib/entity-fields";
import {
  LEBANON_REGIONS_FR,
  LEBANON_TOWNS_BY_KAZA,
  presetOptionsForType,
} from "@/lib/lookups";
import { splitLegacyName } from "@/lib/names";

export type FieldAnswers = Record<string, string>;

/**
 * Dynamic data the renderer needs for non-static field types (e.g.
 * `establishment_ref` pulls its options from the tenant's Establishments).
 * Passed in by the server-rendered page since this is a client component.
 *
 * `levels` carries each establishment's niveau list so the compound
 * `establishment_with_niveau` type can render a cascading second dropdown.
 */
export type FieldExtras = {
  establishments?: Array<{ id: string; name: string; levels?: string[] }>;
  /**
   * Upload handler for `file` fields — provided by the dossier tab (bound to the
   * application + a server upload action). Absent (e.g. in the /settings
   * preview) ⇒ file inputs render a read-only "préview" notice.
   */
  onUploadFile?: (file: File) => Promise<{ path: string; name: string } | null>;
  /**
   * Parent's User record. Used to pre-fill custom parent fields whose
   * `userBoundTo` matches a property here. The renderer only reads this —
   * it doesn't write back; saving updates the answers JSON, not the User
   * row. (Edits to the User row happen via the admin parents form.)
   */
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    email?: string | null;
  };
  /**
   * Dossier identity values from the Application row. Used to mirror these
   * values into custom student fields that have `dossierBoundTo` set —
   * read-only display, the canonical edit happens in the Identité section.
   */
  dossier?: {
    childFirstName?: string | null;
    childLastName?: string | null;
    childDob?: string | null;
    establishment?: string | null;
    niveau?: string | null;
    childPassportLebanese?: string | null;
  };
  /**
   * Guardian row values (parent-level), pre-formatted as display strings.
   * Mirrored into parent custom fields with `guardianBoundTo` set. Booleans
   * (isLebanese) should already be rendered as "Oui"/"Non" by the caller.
   */
  guardian?: Partial<
    Record<
      | "phone"
      | "nationality1"
      | "nationality2"
      | "isLebanese"
      | "passportLebanese"
      | "relation",
      string | null
    >
  >;
  /**
   * Family row values (household-level), pre-formatted as display strings.
   * Mirrored into parent custom fields with `familyBoundTo` set.
   */
  family?: Partial<
    Record<
      | "addressStreet"
      | "addressHood"
      | "addressCity"
      | "addressCountry"
      | "imageRightsSite"
      | "imageRightsBook"
      | "imageRightsSocial"
      | "imageRightsRadio",
      string | null
    >
  >;
};

/**
 * Resolve a field's effective initial value: the stored answer if any,
 * otherwise the pre-fill source (User attribute) for userBoundTo fields.
 * Exported so callers can also seed local state with the same logic.
 */
export function resolveInitialValue(
  field: FieldDef,
  storedValue: string,
  extras?: FieldExtras,
): string {
  // dossierBoundTo wins over storedValue — the field always reflects the
  // canonical dossier identity, not whatever was previously persisted in
  // the answers JSON. Otherwise admin edits in the identity section
  // wouldn't propagate to the mirrored field.
  if (field.dossierBoundTo && extras?.dossier) {
    const v = extras.dossier[field.dossierBoundTo];
    if (typeof v === "string" && v.length > 0) return v;
  }
  // Guardian / Family mirrors behave like dossier mirrors: the canonical
  // column wins over any stale stored answer so the imported value shows.
  if (field.guardianBoundTo && extras?.guardian) {
    const v = extras.guardian[field.guardianBoundTo];
    if (typeof v === "string" && v.length > 0) return v;
  }
  if (field.familyBoundTo && extras?.family) {
    const v = extras.family[field.familyBoundTo];
    if (typeof v === "string" && v.length > 0) return v;
  }
  if (storedValue && storedValue.length > 0) return storedValue;
  if (field.userBoundTo && extras?.user) {
    const u = extras.user;
    const direct = u[field.userBoundTo];
    if (typeof direct === "string" && direct.length > 0) return direct;
    // Fallback: parents created via the legacy sign-up flow only have
    // `User.name` populated, not firstName / lastName. Split on first space
    // so a "Prénom" bound field still pre-fills sensibly.
    if (field.userBoundTo === "firstName" && typeof u.name === "string") {
      return splitLegacyName(u.name).firstName;
    }
    if (field.userBoundTo === "lastName" && typeof u.name === "string") {
      return splitLegacyName(u.name).lastName;
    }
  }
  return "";
}

/**
 * Generic renderer for the tenant's parent/student field config. Reads the
 * config + current answers, dispatches each field to the right input, and
 * surfaces changes via `onChange(answerKey, value)`. Honors conditional
 * visibility (`showIf`) and skips fields whose category is marked inactive.
 *
 * Stays "dumb" on storage — the parent component owns the answers state and
 * decides when to save. Suitable for both admin edit forms and parent-side
 * wizard renderings (Round 7+).
 */
export function FieldsRenderer({
  config,
  answers,
  onChange,
  extras,
  disabled = false,
  unlockBound = false,
  renewal = false,
  editableOnlyCategoryId,
  onEditField,
  onEditCategory,
}: {
  config: EntityFieldsConfig;
  answers: FieldAnswers;
  onChange: (fieldId: string, value: string) => void;
  extras?: FieldExtras;
  disabled?: boolean;
  /**
   * Re-inscription context. When true, fields whose `renewalPrefill` is
   * "locked" render read-only (pre-filled but not editable by the parent).
   */
  renewal?: boolean;
  /**
   * When set, ONLY fields in this category stay editable; every other field is
   * read-only. Used by the dossier "services_open" state (Services editable,
   * the rest of the dossier locked).
   */
  editableOnlyCategoryId?: string;
  /**
   * When true, fields mirrored from a canonical column (guardian / family /
   * dossier) stay EDITABLE instead of being force-locked. Used by the parent
   * inscription form, where the parent IS the source of truth — unlike the
   * admin fiche, where the column is canonical and the mirror is read-only.
   */
  unlockBound?: boolean;
  /**
   * WYSIWYG editor hook. When set, each field gets a hover "edit" affordance
   * that calls this with the field id — lets an admin click a field in the
   * live-form preview to jump to its settings. Not used by the parent form.
   */
  onEditField?: (fieldId: string) => void;
  /**
   * WYSIWYG editor hook for SECTIONS. When set, each category heading gets an
   * edit affordance and empty categories still render (so they can be managed).
   */
  onEditCategory?: (categoryId: string) => void;
}) {
  const grouped = fieldsByCategory(config);
  const sortedCategories = [...config.categories]
    .filter((c) => c.active)
    .sort((a, b) => a.order - b.order);

  if (sortedCategories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {sortedCategories.map((cat) => {
        const fields = (grouped.get(cat.id) ?? []).filter((f) =>
          evaluateShowIf(f, answers),
        );
        // In editor mode (onEditCategory set) keep empty sections so they can
        // be renamed / deleted; on the real form, hide them.
        if (fields.length === 0 && !onEditCategory) return null;
        return (
          <section key={cat.id} className="space-y-3">
            <div className="group/cat flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                {cat.name}
              </h3>
              {onEditCategory ? (
                <button
                  type="button"
                  onClick={() => onEditCategory(cat.id)}
                  className="inline-flex items-center gap-1 rounded border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-foreground-muted)] opacity-0 transition-opacity duration-150 ease-out group-hover/cat:opacity-100 hover:text-[color:var(--color-brand-600)]"
                >
                  <Pencil className="size-3" aria-hidden />
                  Section
                </button>
              ) : null}
            </div>
            {fields.length === 0 && onEditCategory ? (
              <p className="text-xs italic text-[color:var(--color-foreground-subtle)]">
                Section vide
              </p>
            ) : null}
            <div className="space-y-4">
              {fields.map((f) =>
                onEditField ? (
                  <div key={f.id} className="group/edit relative">
                    <button
                      type="button"
                      onClick={() => onEditField(f.id)}
                      className="absolute -end-1 -top-1 z-10 inline-flex items-center gap-1 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-foreground-muted)] opacity-0 shadow-card transition-opacity duration-150 ease-out group-hover/edit:opacity-100 hover:text-[color:var(--color-brand-600)]"
                    >
                      <Pencil className="size-3" aria-hidden />
                      {f.label}
                    </button>
                    <div className="rounded-md ring-[color:var(--color-brand-400)] transition-shadow group-hover/edit:ring-2">
                      <FieldInput
                        field={f}
                        value={answers[f.id] ?? ""}
                        onChange={(v) => onChange(f.id, v)}
                        extras={extras}
                        allAnswers={answers}
                        disabled={disabled || (renewal && f.renewalPrefill === "locked") || (!!editableOnlyCategoryId && f.categoryId !== editableOnlyCategoryId)}
                        unlockBound={unlockBound}
                      />
                    </div>
                  </div>
                ) : (
                  <FieldInput
                    key={f.id}
                    field={f}
                    value={answers[f.id] ?? ""}
                    onChange={(v) => onChange(f.id, v)}
                    extras={extras}
                    allAnswers={answers}
                    disabled={disabled || (renewal && f.renewalPrefill === "locked") || (!!editableOnlyCategoryId && f.categoryId !== editableOnlyCategoryId)}
                    unlockBound={unlockBound}
                  />
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  extras,
  allAnswers,
  disabled,
  unlockBound = false,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  extras?: FieldExtras;
  /** Full answer map — needed by cross-field-source types like lebanon_town_for_kaza. */
  allAnswers: FieldAnswers;
  disabled: boolean;
  unlockBound?: boolean;
}) {
  // Fields bound to a canonical column (dossier identity, Guardian, or
  // Family) are read-only on the fiche — the canonical edit happens on the
  // dedicated surface. In the parent inscription form (unlockBound) they stay
  // editable, since the parent is the one entering the data.
  const isMirrored =
    !!field.dossierBoundTo || !!field.guardianBoundTo || !!field.familyBoundTo;
  const effectiveDisabled = disabled || (isMirrored && !unlockBound);

  const commonProps = {
    id: `f-${field.id}`,
    name: `f-${field.id}`,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(e.target.value),
    required: field.required,
    disabled: effectiveDisabled,
  };

  let input: React.ReactNode;
  switch (field.type) {
    case "long_text":
      input = <Textarea {...commonProps} rows={4} maxLength={2000} />;
      break;
    case "yes_no":
      input = (
        <Select {...commonProps}>
          <option value="">—</option>
          <option value="yes">Oui</option>
          <option value="no">Non</option>
        </Select>
      );
      break;
    case "select": {
      const opts = field.options ?? [];
      input = (
        <Select {...commonProps}>
          <option value="">—</option>
          {opts.map((o) => {
            // Option entries may be "value|label" so the stored value can differ
            // from the display (e.g. "3000000|3 000 000 LBP"). No pipe = both.
            const sep = o.indexOf("|");
            const val = sep >= 0 ? o.slice(0, sep) : o;
            const lbl = sep >= 0 ? o.slice(sep + 1) : o;
            return (
              <option key={o} value={val}>
                {lbl}
              </option>
            );
          })}
        </Select>
      );
      break;
    }
    case "multi_select":
      input = (
        <MultiSelectInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={effectiveDisabled}
        />
      );
      break;
    case "country":
    case "nationality":
    case "lebanon_region": {
      // Options come from the built-in lookup tables.
      const opts = presetOptionsForType(field.type) ?? [];
      input = (
        <Select {...commonProps}>
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
      break;
    }
    case "establishment_ref": {
      // Dynamic: options come from the tenant's configured Establishments.
      // We store the establishment NAME (not id) so reports stay readable
      // and the value survives if the admin renames or deletes the row.
      const opts = extras?.establishments ?? [];
      input = (
        <Select {...commonProps}>
          <option value="">—</option>
          {opts.map((est) => (
            <option key={est.id} value={est.name}>
              {est.name}
            </option>
          ))}
        </Select>
      );
      break;
    }
    case "establishment_with_niveau": {
      // Compound: TWO dropdowns (Établissement → Niveau cascading). Niveau
      // options come from the selected establishment's level list.
      // Stored as "Établissement / Niveau" combined string so reports stay
      // readable and the value works in plain CSV exports.
      return (
        <EstablishmentNiveauField
          field={field}
          value={value}
          onChange={onChange}
          establishments={extras?.establishments ?? []}
          disabled={effectiveDisabled}
        />
      );
    }
    case "lebanon_kaza_with_town": {
      // Compound: Caza → Town/Village cascading. Towns come from the
      // built-in mapping in lookups.ts. Stored as "Caza / Town".
      return (
        <KazaTownField
          field={field}
          value={value}
          onChange={onChange}
          disabled={effectiveDisabled}
        />
      );
    }
    case "lebanon_town_for_kaza": {
      // Cross-field: options come from looking up the answer of another
      // (admin-configured) field. Source can be either a plain
      // `lebanon_region` field (value IS the caza) OR a
      // `lebanon_kaza_with_town` compound (value is "Caza / Town" — take
      // the first half).
      const sourceFieldId = field.optionsSource?.fieldId;
      const rawSource = sourceFieldId
        ? (allAnswers[sourceFieldId] ?? "")
        : "";
      const sepIdx = rawSource.indexOf(ESTABLISHMENT_NIVEAU_SEPARATOR);
      const kaza = sepIdx >= 0 ? rawSource.slice(0, sepIdx) : rawSource;
      const opts = LEBANON_TOWNS_BY_KAZA[kaza] ?? [];
      input = (
        <Select {...commonProps} disabled={effectiveDisabled || !kaza}>
          <option value="">—</option>
          {opts.map((tw) => (
            <option key={tw} value={tw}>
              {tw}
            </option>
          ))}
        </Select>
      );
      break;
    }
    case "niveau_for_establishment": {
      // Cross-field: niveau dropdown driven by an admin-selected source
      // field of type establishment_ref or establishment_with_niveau.
      // For the compound source we extract the establishment half.
      const sourceFieldId = field.optionsSource?.fieldId;
      const rawSource = sourceFieldId
        ? (allAnswers[sourceFieldId] ?? "")
        : "";
      const sepIdx = rawSource.indexOf(ESTABLISHMENT_NIVEAU_SEPARATOR);
      const establishmentName =
        sepIdx >= 0 ? rawSource.slice(0, sepIdx) : rawSource;
      const matchedEst = (extras?.establishments ?? []).find(
        (e) => e.name === establishmentName,
      );
      const opts = matchedEst?.levels ?? [];
      input = (
        <Select
          {...commonProps}
          disabled={effectiveDisabled || !establishmentName || opts.length === 0}
        >
          <option value="">—</option>
          {opts.map((lv) => (
            <option key={lv} value={lv}>
              {lv}
            </option>
          ))}
        </Select>
      );
      break;
    }
    case "date":
      input = <Input {...commonProps} type="date" />;
      break;
    case "number":
      input = <Input {...commonProps} type="number" inputMode="decimal" />;
      break;
    case "phone":
      input = <Input {...commonProps} type="tel" />;
      break;
    case "email":
      input = <Input {...commonProps} type="email" />;
      break;
    case "photo":
      // Photo upload is its own beast (Supabase storage flow). Until Round 7+
      // wires the parent uploader, fall back to a URL input so admins can
      // paste a link.
      input = (
        <Input
          {...commonProps}
          type="url"
          placeholder="https://… (URL d'une image)"
        />
      );
      break;
    case "file":
      input = (
        <FileInput
          value={value}
          onChange={onChange}
          extras={extras}
          disabled={effectiveDisabled}
        />
      );
      break;
    case "repeater":
      input = (
        <RepeaterInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={effectiveDisabled}
        />
      );
      break;
    case "short_text":
    default:
      input = <Input {...commonProps} type="text" maxLength={200} />;
      break;
  }

  return (
    <Field
      label={field.label}
      htmlFor={`f-${field.id}`}
      required={field.required}
      hint={field.hint}
    >
      {input}
    </Field>
  );
}

/** Parse a repeater answer (JSON array of row objects) defensively. */
function parseRepeaterRows(value: string): Array<Record<string, string>> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => {
      const out: Record<string, string> = {};
      if (r && typeof r === "object") {
        for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
          out[k] = typeof v === "string" ? v : v == null ? "" : String(v);
        }
      }
      return out;
    });
  } catch {
    return [];
  }
}

/**
 * Repeater field — a dynamic list of rows, each row a set of sub-fields
 * (columns). The answer is stored as a JSON array of objects keyed by
 * sub-field key. Used for siblings, emergency/pickup contacts, school history,
 * etc. — the building block for migrating the hardcoded list-based tabs to
 * config.
 */
function RepeaterInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const subFields = field.subFields ?? [];
  const rows = parseRepeaterRows(value);

  function commit(next: Array<Record<string, string>>) {
    onChange(JSON.stringify(next));
  }
  function addRow() {
    commit([...rows, {}]);
  }
  function removeRow(i: number) {
    commit(rows.filter((_, idx) => idx !== i));
  }
  function setCell(i: number, key: string, v: string) {
    commit(rows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  }

  if (subFields.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-foreground-muted)]">
        Aucune colonne configurée pour cette liste.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-foreground-muted)]">
          Aucune entrée.
        </p>
      ) : (
        rows.map((row, i) => (
          <div
            key={i}
            className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {subFields.map((sf) => (
                <label key={sf.key} className="flex flex-col gap-1">
                  <span className="text-xs text-[color:var(--color-foreground-muted)]">
                    {sf.label}
                    {sf.required ? " *" : ""}
                  </span>
                  <SubFieldInput
                    sf={sf}
                    value={row[sf.key] ?? ""}
                    disabled={disabled}
                    onChange={(v) => setCell(i, sf.key, v)}
                  />
                </label>
              ))}
            </div>
            {!disabled ? (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--color-danger)] transition-colors hover:underline"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Supprimer
                </button>
              </div>
            ) : null}
          </div>
        ))
      )}
      {!disabled ? (
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[color:var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors hover:border-[color:var(--color-brand-400)] hover:bg-[color:var(--color-surface-sunken)]"
        >
          <Plus className="size-4" aria-hidden />
          Ajouter
        </button>
      ) : null}
    </div>
  );
}

/** One cell inside a repeater row. Closed, simple sub-field type set. */
function SubFieldInput({
  sf,
  value,
  onChange,
  disabled,
}: {
  sf: SubFieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const common = {
    value,
    disabled,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => onChange(e.target.value),
  };
  switch (sf.type) {
    case "select":
      return (
        <Select {...common}>
          <option value="">—</option>
          {(sf.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    case "yes_no":
      return (
        <Select {...common}>
          <option value="">—</option>
          <option value="yes">Oui</option>
          <option value="no">Non</option>
        </Select>
      );
    case "date":
      return <Input {...common} type="date" />;
    case "number":
      return <Input {...common} type="number" />;
    case "short_text":
    default:
      return <Input {...common} type="text" maxLength={200} />;
  }
}

/** Parse a `multi_select` answer (JSON array of selected values). */
function parseMultiSelect(value: string): string[] {
  if (!value) return [];
  try {
    const a = JSON.parse(value);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Multi-select field — toggle chips; the answer is a JSON array of the selected
 * option values. Options support the "value|label" convention like `select`.
 */
function MultiSelectInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const selected = new Set(parseMultiSelect(value));
  const opts = field.options ?? [];

  function toggle(val: string) {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(JSON.stringify([...next]));
  }

  if (opts.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-foreground-muted)]">
        Aucune option configurée.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => {
        const sep = o.indexOf("|");
        const val = sep >= 0 ? o.slice(0, sep) : o;
        const lbl = sep >= 0 ? o.slice(sep + 1) : o;
        const on = selected.has(val);
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => toggle(val)}
            aria-pressed={on}
            className={
              on
                ? "rounded-full border border-[color:var(--color-brand-600)] bg-[color:var(--color-brand-50)] px-3 py-1 text-sm font-medium text-[color:var(--color-brand-700)] transition-colors disabled:opacity-50"
                : "rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-3 py-1 text-sm text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-surface-sunken)] disabled:opacity-50"
            }
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

/** Parse a `file` field answer ({path,name} JSON). */
function parseFileAnswer(value: string): { path: string; name: string } | null {
  if (!value) return null;
  try {
    const o = JSON.parse(value) as Record<string, unknown>;
    if (o && typeof o === "object" && typeof o.path === "string") {
      return {
        path: o.path,
        name: typeof o.name === "string" ? o.name : o.path,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * File field — uploads to storage via `extras.onUploadFile` (provided by the
 * dossier tab) and stores a {path,name} reference in the answer. Without an
 * upload handler (e.g. the /settings preview) it shows a read-only notice.
 */
function FileInput({
  value,
  onChange,
  extras,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  extras?: FieldExtras;
  disabled: boolean;
}) {
  const file = parseFileAnswer(value);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same filename
    if (!f || !extras?.onUploadFile) return;
    setError(null);
    setUploading(true);
    try {
      const res = await extras.onUploadFile(f);
      if (res) onChange(JSON.stringify(res));
      else setError("Échec du téléversement");
    } catch {
      setError("Échec du téléversement");
    } finally {
      setUploading(false);
    }
  }

  if (file) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <FileText
            className="size-4 shrink-0 text-[color:var(--color-foreground-subtle)]"
            aria-hidden
          />
          <span className="truncate">{file.name}</span>
        </span>
        {!disabled ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 text-xs font-medium text-[color:var(--color-danger)] hover:underline"
          >
            Supprimer
          </button>
        ) : null}
      </div>
    );
  }

  if (!extras?.onUploadFile) {
    return (
      <p className="text-sm text-[color:var(--color-foreground-muted)]">
        Téléversement disponible dans le dossier.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <input
        type="file"
        onChange={handleSelect}
        disabled={disabled || uploading}
        className="block w-full text-sm text-[color:var(--color-foreground-muted)] file:me-3 file:rounded-md file:border-0 file:bg-[color:var(--color-surface-sunken)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[color:var(--color-foreground)]"
      />
      {uploading ? (
        <p className="text-xs text-[color:var(--color-foreground-muted)]">
          Téléversement…
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-[color:var(--color-danger)]">{error}</p>
      ) : null}
    </div>
  );
}

/**
 * Cascading two-dropdown picker for the `establishment_with_niveau` type.
 * Persists state via the parent's `onChange` as a single combined string
 * (`"Établissement / Niveau"`). When the establishment changes, the niveau
 * resets — the previous value almost certainly isn't valid for the new one.
 */
function EstablishmentNiveauField({
  field,
  value,
  onChange,
  establishments,
  disabled,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  establishments: Array<{ id: string; name: string; levels?: string[] }>;
  disabled: boolean;
}) {
  // Parse the stored "X / Y" back into its parts. Tolerate missing second
  // half (admin may have only picked the establishment so far).
  const sepIdx = value.indexOf(ESTABLISHMENT_NIVEAU_SEPARATOR);
  const currentEstablishment = sepIdx >= 0 ? value.slice(0, sepIdx) : value;
  const currentNiveau =
    sepIdx >= 0 ? value.slice(sepIdx + ESTABLISHMENT_NIVEAU_SEPARATOR.length) : "";

  const matchedEst = establishments.find((e) => e.name === currentEstablishment);
  const niveauOptions = matchedEst?.levels ?? [];

  function setEstablishment(next: string) {
    // Switching establishment resets niveau — old value isn't valid for the
    // new establishment's level list.
    onChange(next ? `${next}${ESTABLISHMENT_NIVEAU_SEPARATOR}` : "");
  }
  function setNiveau(next: string) {
    if (!currentEstablishment) return; // ignore — shouldn't happen, disabled
    onChange(`${currentEstablishment}${ESTABLISHMENT_NIVEAU_SEPARATOR}${next}`);
  }

  return (
    <Field
      label={field.label}
      htmlFor={`f-${field.id}-est`}
      required={field.required}
      hint={field.hint}
    >
      <FormRow>
        <Select
          id={`f-${field.id}-est`}
          name={`f-${field.id}-est`}
          value={currentEstablishment}
          onChange={(e) => setEstablishment(e.target.value)}
          required={field.required}
          disabled={disabled || establishments.length === 0}
        >
          <option value="">—</option>
          {establishments.map((est) => (
            <option key={est.id} value={est.name}>
              {est.name}
            </option>
          ))}
        </Select>
        <Select
          id={`f-${field.id}-niveau`}
          name={`f-${field.id}-niveau`}
          value={currentNiveau}
          onChange={(e) => setNiveau(e.target.value)}
          required={field.required}
          disabled={disabled || !currentEstablishment || niveauOptions.length === 0}
        >
          <option value="">—</option>
          {niveauOptions.map((lv) => (
            <option key={lv} value={lv}>
              {lv}
            </option>
          ))}
        </Select>
      </FormRow>
      {/* Hidden field so the form's serializer captures the combined value
          with the same `f-<id>` key as every other field. */}
      <input type="hidden" name={`f-${field.id}`} value={value} />
    </Field>
  );
}

/**
 * Cascading Caza → Town/Village picker. Same composition contract as the
 * establishment cascade: combined `"Caza / Town"` string, niveau resets
 * when caza changes.
 */
function KazaTownField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const sepIdx = value.indexOf(ESTABLISHMENT_NIVEAU_SEPARATOR);
  const currentKaza = sepIdx >= 0 ? value.slice(0, sepIdx) : value;
  const currentTown =
    sepIdx >= 0 ? value.slice(sepIdx + ESTABLISHMENT_NIVEAU_SEPARATOR.length) : "";

  const townOptions = LEBANON_TOWNS_BY_KAZA[currentKaza] ?? [];

  function setKaza(next: string) {
    onChange(next ? `${next}${ESTABLISHMENT_NIVEAU_SEPARATOR}` : "");
  }
  function setTown(next: string) {
    if (!currentKaza) return;
    onChange(`${currentKaza}${ESTABLISHMENT_NIVEAU_SEPARATOR}${next}`);
  }

  return (
    <Field
      label={field.label}
      htmlFor={`f-${field.id}-kaza`}
      required={field.required}
      hint={field.hint}
    >
      <FormRow>
        <Select
          id={`f-${field.id}-kaza`}
          name={`f-${field.id}-kaza`}
          value={currentKaza}
          onChange={(e) => setKaza(e.target.value)}
          required={field.required}
          disabled={disabled}
        >
          <option value="">—</option>
          {LEBANON_REGIONS_FR.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
        <Select
          id={`f-${field.id}-town`}
          name={`f-${field.id}-town`}
          value={currentTown}
          onChange={(e) => setTown(e.target.value)}
          required={field.required}
          disabled={disabled || !currentKaza || townOptions.length === 0}
        >
          <option value="">—</option>
          {townOptions.map((tw) => (
            <option key={tw} value={tw}>
              {tw}
            </option>
          ))}
        </Select>
      </FormRow>
      <input type="hidden" name={`f-${field.id}`} value={value} />
    </Field>
  );
}
