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
  siblings: Sibling[];
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

  const villageBase = LEBANON_TOWNS_BY_KAZA[addressCaza] ?? [];
  // A prefilled value (e.g. a Dars town stored as the caza, or a town not in
  // our lookup) that isn't one of the listed options would silently blank the
  // <Select>. Surface it as a selectable option so prefill stays visible.
  const cazaOptions =
    addressCaza && !LEBANON_REGIONS_FR.includes(addressCaza)
      ? [addressCaza, ...LEBANON_REGIONS_FR]
      : LEBANON_REGIONS_FR;
  const villageOptions =
    addressVillage && !villageBase.includes(addressVillage)
      ? [addressVillage, ...villageBase]
      : villageBase;

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
                    {cazaOptions.map((c) => (
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

