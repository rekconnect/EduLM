"use client";

import { Field, FormRow } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  ESTABLISHMENT_NIVEAU_SEPARATOR,
  evaluateShowIf,
  fieldsByCategory,
  type EntityFieldsConfig,
  type FieldDef,
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
}: {
  config: EntityFieldsConfig;
  answers: FieldAnswers;
  onChange: (fieldId: string, value: string) => void;
  extras?: FieldExtras;
  disabled?: boolean;
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
        if (fields.length === 0) return null;
        return (
          <section key={cat.id} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
              {cat.name}
            </h3>
            <div className="space-y-4">
              {fields.map((f) => (
                <FieldInput
                  key={f.id}
                  field={f}
                  value={answers[f.id] ?? ""}
                  onChange={(v) => onChange(f.id, v)}
                  extras={extras}
                  allAnswers={answers}
                  disabled={disabled}
                />
              ))}
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
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  extras?: FieldExtras;
  /** Full answer map — needed by cross-field-source types like lebanon_town_for_kaza. */
  allAnswers: FieldAnswers;
  disabled: boolean;
}) {
  // Fields bound to a canonical column (dossier identity, Guardian, or
  // Family) are read-only — the canonical edit happens on the dedicated
  // surface. Force disabled regardless of the section-level prop.
  const isMirrored =
    !!field.dossierBoundTo || !!field.guardianBoundTo || !!field.familyBoundTo;
  const effectiveDisabled = disabled || isMirrored;

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
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
      break;
    }
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
