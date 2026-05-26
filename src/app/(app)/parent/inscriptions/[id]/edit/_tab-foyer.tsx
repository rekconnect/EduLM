"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormRow } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LEBANON_REGIONS_FR, LEBANON_TOWNS_BY_KAZA } from "@/lib/lookups";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { saveFoyerTab } from "../../_actions";

type Sibling = {
  firstName: string;
  birthYear: string; // string in state, coerced on save
  className: string;
  schoolName: string;
};

type FoyerInitial = {
  addressCaza: string;
  addressVillage: string;
  addressStreet: string;
  addressBuilding: string;
  addressFloor: string;
  addressDetails: string;
  addressNotes: string;
  imageRightsSite: boolean | null;
  imageRightsBook: boolean | null;
  imageRightsSocial: boolean | null;
  imageRightsRadio: boolean | null;
  siblings: Sibling[];
};

const IMAGE_KINDS = ["Site", "Book", "Social", "Radio"] as const;
type ImageKind = (typeof IMAGE_KINDS)[number];

// Map UI kind → registry key (lowercase tail) for the per-image
// rights toggle row.
const IMAGE_FIELD_KEY: Record<ImageKind, string> = {
  Site: "foyer.imageRights.site",
  Book: "foyer.imageRights.book",
  Social: "foyer.imageRights.social",
  Radio: "foyer.imageRights.radio",
};

/**
 * Foyer tab — household-level info shared across all the family's
 * dossiers (Page 3 of the Montaigne paper form). Address + image
 * rights save to the Family row so siblings registered later inherit.
 * Siblings here are external (other schools) — kids already at this
 * school are tracked via Student/Family.
 *
 * Phase 4 wiring: every <Field> reads label/required/hidden via
 * useField() and is wrapped in <EditableField> so the WYSIWYG editor
 * can pencil-overlay any of the 16 registered Foyer fields. editMode
 * no-ops the save action.
 */
export function DossierTabFoyer({
  applicationId,
  initial,
  disabled,
  editMode = false,
}: {
  applicationId: string;
  initial: FoyerInitial;
  disabled: boolean;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();

  const [addressCaza, setAddressCaza] = useState(initial.addressCaza);
  const [addressVillage, setAddressVillage] = useState(initial.addressVillage);
  const [addressStreet, setAddressStreet] = useState(initial.addressStreet);
  const [addressBuilding, setAddressBuilding] = useState(initial.addressBuilding);
  const [addressFloor, setAddressFloor] = useState(initial.addressFloor);
  const [addressDetails, setAddressDetails] = useState(initial.addressDetails);
  const [addressNotes, setAddressNotes] = useState(initial.addressNotes);

  const [imageRights, setImageRights] = useState({
    Site: initial.imageRightsSite,
    Book: initial.imageRightsBook,
    Social: initial.imageRightsSocial,
    Radio: initial.imageRightsRadio,
  });

  const [siblings, setSiblings] = useState<Sibling[]>(initial.siblings);

  // Per-field config — Address card.
  const fCaza = useField("foyer.address.caza");
  const fVillage = useField("foyer.address.village");
  const fStreet = useField("foyer.address.street");
  const fBuilding = useField("foyer.address.building");
  const fFloor = useField("foyer.address.floor");
  const fDetails = useField("foyer.address.details");
  const fNotes = useField("foyer.address.notes");

  // Siblings card — list-level + per-column.
  const fSiblingsList = useField("foyer.siblings.list");
  const fSibFirst = useField("foyer.siblings.firstName");
  const fSibYear = useField("foyer.siblings.birthYear");
  const fSibClass = useField("foyer.siblings.className");
  const fSibSchool = useField("foyer.siblings.schoolName");

  // Image rights — one toggle per kind.
  const fImageSite = useField("foyer.imageRights.site");
  const fImageBook = useField("foyer.imageRights.book");
  const fImageSocial = useField("foyer.imageRights.social");
  const fImageRadio = useField("foyer.imageRights.radio");
  const imageFieldByKind: Record<ImageKind, ReturnType<typeof useField>> = {
    Site: fImageSite,
    Book: fImageBook,
    Social: fImageSocial,
    Radio: fImageRadio,
  };

  const villageOptions = LEBANON_TOWNS_BY_KAZA[addressCaza] ?? [];

  function setImage(kind: ImageKind, val: boolean) {
    setImageRights((p) => ({ ...p, [kind]: val }));
  }

  function addSibling() {
    setSiblings((p) => [
      ...p,
      { firstName: "", birthYear: "", className: "", schoolName: "" },
    ]);
  }
  function updateSibling(idx: number, patch: Partial<Sibling>) {
    setSiblings((p) => p.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function removeSibling(idx: number) {
    setSiblings((p) => p.filter((_, i) => i !== idx));
  }

  function onSave() {
    if (editMode) {
      toast.info("Aperçu — modifications non enregistrées");
      return;
    }
    startTransition(async () => {
      const r = await saveFoyerTab(applicationId, {
        addressCaza,
        addressVillage,
        addressStreet,
        addressBuilding,
        addressFloor,
        addressDetails,
        addressNotes,
        imageRightsSite: imageRights.Site,
        imageRightsBook: imageRights.Book,
        imageRightsSocial: imageRights.Social,
        imageRightsRadio: imageRights.Radio,
        siblings: siblings
          .filter((s) => s.firstName.trim().length > 0)
          .map((s) => {
            const n = parseInt(s.birthYear, 10);
            return {
              firstName: s.firstName,
              birthYear: Number.isFinite(n) ? n : null,
              className: s.className,
              schoolName: s.schoolName,
            };
          }),
      });
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("saveError"));
    });
  }

  // Image rights row — uses a custom wrapper instead of <Field> because
  // it's a label + yes/no row, not a label + input. We render the label
  // ourselves and respect the override's required indicator.
  function ImageRightsRow({ kind }: { kind: ImageKind }) {
    const cfg = imageFieldByKind[kind];
    if (cfg?.hidden) return null;
    const v = imageRights[kind];
    return (
      <EditableField fieldKey={IMAGE_FIELD_KEY[kind]}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] px-3 py-2">
          <span className="text-sm font-medium text-[color:var(--color-foreground)]">
            {cfg?.label ?? t(`foyer.imageRights${kind}` as never)}
            {cfg?.required ? (
              <span className="ms-0.5 text-[color:var(--color-danger)]">
                *
              </span>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            <YesNoChoice
              name={`image-${kind}`}
              value={v}
              onChange={(val) => setImage(kind, val)}
              yesLabel={tCommon("yes")}
              noLabel={tCommon("no")}
              disabled={disabled}
            />
          </div>
        </div>
      </EditableField>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Address ── */}
      <Card>
        <CardHeader title={t("foyer.addressTitle")} />
        <CardBody>
          <FormRow>
            {fCaza?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="foyer.address.caza">
                <Field
                  label={fCaza?.label ?? t("foyer.caza")}
                  htmlFor="addressCaza"
                  required={fCaza?.required ?? true}
                >
                  <Select
                    id="addressCaza"
                    value={addressCaza}
                    onChange={(e) => {
                      setAddressCaza(e.target.value);
                      setAddressVillage("");
                    }}
                    disabled={disabled}
                  >
                    <option value="">—</option>
                    {LEBANON_REGIONS_FR.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
              </EditableField>
            )}
            {fVillage?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="foyer.address.village">
                <Field
                  label={fVillage?.label ?? t("foyer.village")}
                  htmlFor="addressVillage"
                  required={fVillage?.required ?? true}
                >
                  <Select
                    id="addressVillage"
                    value={addressVillage}
                    onChange={(e) => setAddressVillage(e.target.value)}
                    disabled={disabled || !addressCaza}
                  >
                    <option value="">—</option>
                    {villageOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
              </EditableField>
            )}
          </FormRow>
          <FormRow>
            {fStreet?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="foyer.address.street">
                <Field
                  label={fStreet?.label ?? t("foyer.street")}
                  htmlFor="addressStreet"
                  required={fStreet?.required ?? true}
                >
                  <Input
                    id="addressStreet"
                    value={addressStreet}
                    onChange={(e) => setAddressStreet(e.target.value)}
                    disabled={disabled}
                  />
                </Field>
              </EditableField>
            )}
            {fBuilding?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="foyer.address.building">
                <Field
                  label={fBuilding?.label ?? t("foyer.building")}
                  htmlFor="addressBuilding"
                  required={fBuilding?.required ?? false}
                >
                  <Input
                    id="addressBuilding"
                    value={addressBuilding}
                    onChange={(e) => setAddressBuilding(e.target.value)}
                    disabled={disabled}
                  />
                </Field>
              </EditableField>
            )}
            {fFloor?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="foyer.address.floor">
                <Field
                  label={fFloor?.label ?? t("foyer.floor")}
                  htmlFor="addressFloor"
                  required={fFloor?.required ?? false}
                >
                  <Input
                    id="addressFloor"
                    value={addressFloor}
                    onChange={(e) => setAddressFloor(e.target.value)}
                    disabled={disabled}
                  />
                </Field>
              </EditableField>
            )}
          </FormRow>
          {fDetails?.hidden ? null : (
            <EditableField fieldKey="foyer.address.details">
              <Field
                label={fDetails?.label ?? t("foyer.details")}
                htmlFor="addressDetails"
                required={fDetails?.required ?? false}
              >
                <Input
                  id="addressDetails"
                  value={addressDetails}
                  onChange={(e) => setAddressDetails(e.target.value)}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          )}
          {fNotes?.hidden ? null : (
            <EditableField fieldKey="foyer.address.notes">
              <Field
                label={fNotes?.label ?? t("foyer.notes")}
                htmlFor="addressNotes"
                required={fNotes?.required ?? false}
              >
                <Textarea
                  id="addressNotes"
                  rows={2}
                  value={addressNotes}
                  onChange={(e) => setAddressNotes(e.target.value)}
                  disabled={disabled}
                />
              </Field>
            </EditableField>
          )}
        </CardBody>
      </Card>

      {/* ── Siblings ──
          List-level hide → hide the whole card. The list title itself
          is editable via foyer.siblings.list; per-column overrides hide
          specific columns inside each row. */}
      {fSiblingsList?.hidden ? null : (
        <EditableField fieldKey="foyer.siblings.list">
          <Card>
            <CardHeader
              title={fSiblingsList?.label ?? t("foyer.siblingsTitle")}
              description={t("foyer.siblingsHint")}
            />
            <CardBody className="space-y-3">
              {siblings.length === 0 ? (
                <p className="text-sm text-[color:var(--color-foreground-muted)]">
                  {t("foyer.siblingsEmpty")}
                </p>
              ) : (
                siblings.map((s, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-3 sm:grid-cols-[1.2fr_0.8fr_1fr_1.5fr_auto]"
                  >
                    {fSibFirst?.hidden ? null : (
                      <EditableField fieldKey="foyer.siblings.firstName">
                        <Field
                          label={fSibFirst?.label ?? t("foyer.siblingFirstName")}
                          htmlFor={`sib-${i}-fn`}
                          required={fSibFirst?.required ?? false}
                        >
                          <Input
                            id={`sib-${i}-fn`}
                            value={s.firstName}
                            onChange={(e) =>
                              updateSibling(i, { firstName: e.target.value })
                            }
                            disabled={disabled}
                          />
                        </Field>
                      </EditableField>
                    )}
                    {fSibYear?.hidden ? null : (
                      <EditableField fieldKey="foyer.siblings.birthYear">
                        <Field
                          label={fSibYear?.label ?? t("foyer.siblingBirthYear")}
                          htmlFor={`sib-${i}-by`}
                          required={fSibYear?.required ?? false}
                        >
                          <Input
                            id={`sib-${i}-by`}
                            type="number"
                            inputMode="numeric"
                            value={s.birthYear}
                            onChange={(e) =>
                              updateSibling(i, { birthYear: e.target.value })
                            }
                            disabled={disabled}
                          />
                        </Field>
                      </EditableField>
                    )}
                    {fSibClass?.hidden ? null : (
                      <EditableField fieldKey="foyer.siblings.className">
                        <Field
                          label={fSibClass?.label ?? t("foyer.siblingClass")}
                          htmlFor={`sib-${i}-cl`}
                          required={fSibClass?.required ?? false}
                        >
                          <Input
                            id={`sib-${i}-cl`}
                            value={s.className}
                            onChange={(e) =>
                              updateSibling(i, { className: e.target.value })
                            }
                            disabled={disabled}
                          />
                        </Field>
                      </EditableField>
                    )}
                    {fSibSchool?.hidden ? null : (
                      <EditableField fieldKey="foyer.siblings.schoolName">
                        <Field
                          label={fSibSchool?.label ?? t("foyer.siblingSchool")}
                          htmlFor={`sib-${i}-sc`}
                          required={fSibSchool?.required ?? false}
                        >
                          <Input
                            id={`sib-${i}-sc`}
                            value={s.schoolName}
                            onChange={(e) =>
                              updateSibling(i, { schoolName: e.target.value })
                            }
                            disabled={disabled}
                          />
                        </Field>
                      </EditableField>
                    )}
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeSibling(i)}
                        disabled={disabled}
                        aria-label={t("foyer.removeSibling")}
                        className="inline-flex size-9 items-center justify-center rounded-md text-[color:var(--color-danger)] transition-colors hover:bg-[color:var(--color-danger)]/10 disabled:opacity-40"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                ))
              )}
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addSibling}
                  disabled={disabled}
                  className="gap-1.5"
                >
                  <Plus className="size-4" aria-hidden />
                  {t("foyer.addSibling")}
                </Button>
              </div>
            </CardBody>
          </Card>
        </EditableField>
      )}

      {/* ── Image rights — four separate yes/no per Montaigne form ── */}
      <Card>
        <CardHeader
          title={t("foyer.imageRightsTitle")}
          description={t("foyer.imageRightsHint")}
        />
        <CardBody className="space-y-3">
          {IMAGE_KINDS.map((kind) => (
            <ImageRightsRow key={kind} kind={kind} />
          ))}
        </CardBody>
      </Card>

      {!disabled ? (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {pending ? tCommon("saving") : tCommon("save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function YesNoChoice({
  name,
  value,
  onChange,
  yesLabel,
  noLabel,
  disabled,
}: {
  name: string;
  value: boolean | null;
  onChange: (val: boolean) => void;
  yesLabel: string;
  noLabel: string;
  disabled: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-3">
      <label className="inline-flex items-center gap-1 text-sm">
        <input
          type="radio"
          name={name}
          checked={value === true}
          onChange={() => onChange(true)}
          disabled={disabled}
        />
        {yesLabel}
      </label>
      <label className="inline-flex items-center gap-1 text-sm">
        <input
          type="radio"
          name={name}
          checked={value === false}
          onChange={() => onChange(false)}
          disabled={disabled}
        />
        {noLabel}
      </label>
    </div>
  );
}
