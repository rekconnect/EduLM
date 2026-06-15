"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bus, Car, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormRow } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LEBANON_REGIONS_FR, LEBANON_TOWNS_BY_KAZA } from "@/lib/lookups";
import {
  type TransportData,
  type TransportMode,
} from "@/lib/dossier-content";
import { isMaternelleNiveau } from "@/lib/pedagogique";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { saveTransportTab } from "../../_actions";

/**
 * Transport & restauration tab. Two trips (aller / retour) each with a
 * Bus vs Avec les parents choice; optional alternate pickup/dropoff
 * address; collation + cantine yes/no.
 *
 * Phase 4: 13 registry fields wrapped with EditableField. The
 * alternate-address sub-fields keep their runtime visibility gate
 * (only render when "hasAlternateAddress" is true) layered AND'd
 * over the tenant override's hidden flag.
 */
export function DossierTabTransport({
  applicationId,
  initial,
  disabled,
  niveau,
  editMode = false,
}: {
  applicationId: string;
  initial: TransportData;
  disabled: boolean;
  niveau: string | null;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<TransportData>(initial);

  // Maternelle (TPS/PS/MS/GS) → collation is obligatory (forced Oui, locked).
  const isMaternelle = isMaternelleNiveau(niveau);

  const fAller = useField("transport.mode.aller");
  const fRetour = useField("transport.mode.retour");
  const fAltEnabled = useField("transport.altAddress.enabled");
  const fAltCaza = useField("transport.altAddress.caza");
  const fAltVillage = useField("transport.altAddress.village");
  const fAltStreet = useField("transport.altAddress.street");
  const fAltBuilding = useField("transport.altAddress.building");
  const fAltFloor = useField("transport.altAddress.floor");
  const fAltDetails = useField("transport.altAddress.details");
  const fAltNotes = useField("transport.altAddress.notes");
  const fCollation = useField("transport.restauration.collation");
  const fCantine = useField("transport.restauration.cantine");

  function patch(p: Partial<TransportData>) {
    setData((prev) => ({ ...prev, ...p }));
  }

  const villageOptions = LEBANON_TOWNS_BY_KAZA[data.altCaza] ?? [];

  function onSave() {
    if (editMode) {
      toast.info("Aperçu — modifications non enregistrées");
      return;
    }
    startTransition(async () => {
      // Maternelle: collation is obligatory — always send Oui.
      const payload = isMaternelle ? { ...data, collation: true } : data;
      const r = await saveTransportTab(applicationId, payload);
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("saveError"));
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Transport mode ── */}
      <Card>
        <CardHeader title={t("transport.modeTitle")} />
        <CardBody className="space-y-4">
          {fAller?.hidden ? null : (
            <EditableField fieldKey="transport.mode.aller">
              <Field
                label={fAller?.label ?? t("transport.modeAller")}
                htmlFor="modeAller"
                required={fAller?.required ?? true}
              >
                <ModePicker
                  value={data.modeAller}
                  onChange={(v) => patch({ modeAller: v })}
                  name="modeAller"
                  disabled={disabled}
                  busLabel={t("transport.modeBus")}
                  parentsLabel={t("transport.modeParents")}
                />
              </Field>
            </EditableField>
          )}
          {fRetour?.hidden ? null : (
            <EditableField fieldKey="transport.mode.retour">
              <Field
                label={fRetour?.label ?? t("transport.modeRetour")}
                htmlFor="modeRetour"
                required={fRetour?.required ?? true}
              >
                <ModePicker
                  value={data.modeRetour}
                  onChange={(v) => patch({ modeRetour: v })}
                  name="modeRetour"
                  disabled={disabled}
                  busLabel={t("transport.modeBus")}
                  parentsLabel={t("transport.modeParents")}
                />
              </Field>
            </EditableField>
          )}
        </CardBody>
      </Card>

      {/* ── Alternate address ── */}
      <Card>
        <CardHeader
          title={t("transport.altAddressTitle")}
          description={t("transport.altAddressHint")}
        />
        <CardBody>
          {fAltEnabled?.hidden ? null : (
            <EditableField fieldKey="transport.altAddress.enabled">
              <label className="inline-flex items-center gap-2 px-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={data.hasAlternateAddress}
                  onChange={(e) =>
                    patch({ hasAlternateAddress: e.target.checked })
                  }
                  disabled={disabled}
                />
                {fAltEnabled?.label ?? t("transport.altAddressEnable")}
              </label>
            </EditableField>
          )}

          {data.hasAlternateAddress ? (
            <div className="mt-4 space-y-3">
              <FormRow>
                {fAltCaza?.hidden ? (
                  <div />
                ) : (
                  <EditableField fieldKey="transport.altAddress.caza">
                    <Field
                      label={fAltCaza?.label ?? t("foyer.caza")}
                      htmlFor="altCaza"
                      required={fAltCaza?.required ?? true}
                    >
                      <Select
                        id="altCaza"
                        value={data.altCaza}
                        onChange={(e) =>
                          patch({ altCaza: e.target.value, altVillage: "" })
                        }
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
                {fAltVillage?.hidden ? (
                  <div />
                ) : (
                  <EditableField fieldKey="transport.altAddress.village">
                    <Field
                      label={fAltVillage?.label ?? t("foyer.village")}
                      htmlFor="altVillage"
                      required={fAltVillage?.required ?? true}
                    >
                      <Select
                        id="altVillage"
                        value={data.altVillage}
                        onChange={(e) => patch({ altVillage: e.target.value })}
                        disabled={disabled || !data.altCaza}
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
                {fAltStreet?.hidden ? (
                  <div />
                ) : (
                  <EditableField fieldKey="transport.altAddress.street">
                    <Field
                      label={fAltStreet?.label ?? t("foyer.street")}
                      htmlFor="altStreet"
                      required={fAltStreet?.required ?? true}
                    >
                      <Input
                        id="altStreet"
                        value={data.altStreet}
                        onChange={(e) => patch({ altStreet: e.target.value })}
                        disabled={disabled}
                      />
                    </Field>
                  </EditableField>
                )}
                {fAltBuilding?.hidden ? (
                  <div />
                ) : (
                  <EditableField fieldKey="transport.altAddress.building">
                    <Field
                      label={fAltBuilding?.label ?? t("foyer.building")}
                      htmlFor="altBuilding"
                      required={fAltBuilding?.required ?? false}
                    >
                      <Input
                        id="altBuilding"
                        value={data.altBuilding}
                        onChange={(e) => patch({ altBuilding: e.target.value })}
                        disabled={disabled}
                      />
                    </Field>
                  </EditableField>
                )}
                {fAltFloor?.hidden ? (
                  <div />
                ) : (
                  <EditableField fieldKey="transport.altAddress.floor">
                    <Field
                      label={fAltFloor?.label ?? t("foyer.floor")}
                      htmlFor="altFloor"
                      required={fAltFloor?.required ?? false}
                    >
                      <Input
                        id="altFloor"
                        value={data.altFloor}
                        onChange={(e) => patch({ altFloor: e.target.value })}
                        disabled={disabled}
                      />
                    </Field>
                  </EditableField>
                )}
              </FormRow>
              {fAltDetails?.hidden ? null : (
                <EditableField fieldKey="transport.altAddress.details">
                  <Field
                    label={fAltDetails?.label ?? t("foyer.details")}
                    htmlFor="altDetails"
                    required={fAltDetails?.required ?? false}
                  >
                    <Input
                      id="altDetails"
                      value={data.altDetails}
                      onChange={(e) => patch({ altDetails: e.target.value })}
                      disabled={disabled}
                    />
                  </Field>
                </EditableField>
              )}
              {fAltNotes?.hidden ? null : (
                <EditableField fieldKey="transport.altAddress.notes">
                  <Field
                    label={fAltNotes?.label ?? t("foyer.notes")}
                    htmlFor="altNotes"
                    required={fAltNotes?.required ?? false}
                  >
                    <Textarea
                      id="altNotes"
                      rows={2}
                      value={data.altNotes}
                      onChange={(e) => patch({ altNotes: e.target.value })}
                      disabled={disabled}
                    />
                  </Field>
                </EditableField>
              )}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* ── Restauration ── */}
      <Card>
        <CardHeader title={t("transport.restoTitle")} />
        <CardBody className="space-y-4">
          {fCollation?.hidden ? null : (
            <EditableField fieldKey="transport.restauration.collation">
              <Field
                label={
                  fCollation?.label ??
                  (isMaternelle
                    ? t("transport.collationMaternelle")
                    : t("transport.collation"))
                }
                htmlFor="collation"
                required={fCollation?.required ?? true}
                hint={t("transport.collationHint")}
              >
                <YesNo
                  value={isMaternelle ? true : data.collation}
                  onChange={(v) => patch({ collation: v })}
                  name="collation"
                  disabled={disabled || isMaternelle}
                  yesLabel={tCommon("yes")}
                  noLabel={tCommon("no")}
                />
                {isMaternelle ? (
                  <p className="mt-1 text-xs text-[color:var(--color-foreground-subtle)]">
                    {t("transport.collationObligatoire")}
                  </p>
                ) : null}
              </Field>
            </EditableField>
          )}
          {fCantine?.hidden ? null : (
            <EditableField fieldKey="transport.restauration.cantine">
              <Field
                label={fCantine?.label ?? t("transport.cantine")}
                htmlFor="cantine"
                required={fCantine?.required ?? true}
                hint={t("transport.cantineHint")}
              >
                <YesNo
                  value={data.cantine}
                  onChange={(v) => patch({ cantine: v })}
                  name="cantine"
                  disabled={disabled}
                  yesLabel={tCommon("yes")}
                  noLabel={tCommon("no")}
                />
              </Field>
            </EditableField>
          )}
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

function ModePicker({
  value,
  onChange,
  disabled,
  busLabel,
  parentsLabel,
}: {
  value: TransportMode;
  onChange: (v: TransportMode) => void;
  name: string;
  disabled: boolean;
  busLabel: string;
  parentsLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(
        [
          { v: "bus" as const, label: busLabel, Icon: Bus },
          { v: "parents" as const, label: parentsLabel, Icon: Car },
        ]
      ).map(({ v, label, Icon }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            disabled={disabled}
            className={
              active
                ? "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-brand-600)] bg-[color:var(--color-brand-50)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-brand-700)] transition-colors disabled:opacity-50"
                : "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-surface-sunken)] disabled:opacity-50"
            }
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function YesNo({
  value,
  onChange,
  name,
  disabled,
  yesLabel,
  noLabel,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  name: string;
  disabled: boolean;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <div className="flex gap-4">
      <label className="inline-flex items-center gap-1.5 text-sm">
        <input
          type="radio"
          name={name}
          checked={value === true}
          onChange={() => onChange(true)}
          disabled={disabled}
        />
        {yesLabel}
      </label>
      <label className="inline-flex items-center gap-1.5 text-sm">
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
