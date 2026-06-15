"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormRow } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import {
  BILAN_FLAGS_LIST,
  EBEP_FLAGS_LIST,
  type BilanFlag,
  type EbepFlag,
  type ScolariteData,
} from "@/lib/dossier-content";
import {
  classifyNiveau,
  isFirstYearNiveau,
  type PedagogiqueData,
} from "@/lib/pedagogique";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { PedagogiqueSection } from "./_section-pedagogique";
import { saveScolariteTab } from "../../_actions";

export type EstablishmentForScolarite = {
  id: string;
  name: string;
  levels: string[];
};

const BILAN_KEY: Record<BilanFlag, string> = {
  orthophonique: "scolarite.bilans.orthophonique",
  psychologique: "scolarite.bilans.psychologique",
  psychomoteur: "scolarite.bilans.psychomoteur",
  psychoPediatrique: "scolarite.bilans.psychoPediatrique",
};

/**
 * Scolarité tab — antériorité + EBEP (double block: previous school
 * AND our school) + dispense des examens libanais + niveau souhaité +
 * Pédagogique (niveau-conditional) sub-section.
 *
 * Phase 4: every registered field (18 of them, plus Pédagogique's 21
 * handled inside PedagogiqueSection) reads label/required/hidden via
 * useField and is wrapped in EditableField for the WYSIWYG pencil.
 */
export function DossierTabScolarite({
  applicationId,
  initial,
  initialEstablishmentId,
  initialNiveau,
  initialPedagogique,
  establishments,
  schoolName,
  defaultEntryDate,
  disabled,
  editMode = false,
}: {
  applicationId: string;
  initial: ScolariteData;
  initialEstablishmentId: string;
  initialNiveau: string;
  initialPedagogique: PedagogiqueData;
  establishments: EstablishmentForScolarite[];
  schoolName: string;
  defaultEntryDate: string;
  disabled: boolean;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tCommon = useTranslations("common");
  const tAdm = useTranslations("admissions");
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<ScolariteData>(() =>
    initial.entryDate ? initial : { ...initial, entryDate: defaultEntryDate },
  );
  const [establishmentId, setEstablishmentId] = useState<string>(initialEstablishmentId);
  const [niveau, setNiveau] = useState<string>(initialNiveau);
  const [pedagogique, setPedagogique] = useState<PedagogiqueData>(initialPedagogique);
  const niveauGroup = classifyNiveau(niveau);
  // PS / TPS = first year: no previous school, history, or Lebanese-exam
  // dispensation. Hidden in the real form; always shown in the admin preview.
  const hideAnteriorite = !editMode && isFirstYearNiveau(niveau);

  const selectedEst = useMemo(
    () => establishments.find((e) => e.id === establishmentId),
    [establishmentId, establishments],
  );

  // ── Per-field config — Previous school
  const fPrevSchool = useField("scolarite.previous.school");
  const fPrevClass = useField("scolarite.previous.class");
  const fPrevNetwork = useField("scolarite.previous.network");
  const fAttendedMlf = useField("scolarite.previous.attendedMlfBefore");

  // ── History list
  const fHistoryList = useField("scolarite.history.list");
  const fHistYear = useField("scolarite.history.year");
  const fHistClass = useField("scolarite.history.className");
  const fHistSchool = useField("scolarite.history.school");

  // ── EBEP
  const fEbepPrev = useField("scolarite.ebep.previous");
  const fEbepCur = useField("scolarite.ebep.current");

  // ── Bilans (4 flags)
  const bilanFields: Record<BilanFlag, ReturnType<typeof useField>> = {
    orthophonique: useField("scolarite.bilans.orthophonique"),
    psychologique: useField("scolarite.bilans.psychologique"),
    psychomoteur: useField("scolarite.bilans.psychomoteur"),
    psychoPediatrique: useField("scolarite.bilans.psychoPediatrique"),
  };

  // ── Dispense
  const fDispense = useField("scolarite.dispense.libanais");

  // ── Wishlist
  const fEstablishment = useField("scolarite.wishlist.establishment");
  const fNiveau = useField("scolarite.wishlist.niveau");
  const fEntryDate = useField("scolarite.wishlist.entryDate");

  function patch(p: Partial<ScolariteData>) {
    setData((prev) => ({ ...prev, ...p }));
  }
  function toggleEbep(group: "ebepPreviousFlags" | "ebepCurrentFlags", flag: EbepFlag) {
    setData((prev) => ({
      ...prev,
      [group]: { ...prev[group], [flag]: !prev[group][flag] },
    }));
  }
  function toggleBilan(flag: BilanFlag) {
    setData((prev) => ({
      ...prev,
      bilansRealises: {
        ...prev.bilansRealises,
        [flag]: !prev.bilansRealises[flag],
      },
    }));
  }

  function addHistoryRow() {
    patch({ history: [...data.history, { year: "", className: "", school: "" }] });
  }
  function updateHistory(idx: number, p: Partial<ScolariteData["history"][number]>) {
    patch({
      history: data.history.map((row, i) => (i === idx ? { ...row, ...p } : row)),
    });
  }
  function removeHistory(idx: number) {
    patch({ history: data.history.filter((_, i) => i !== idx) });
  }

  function onSave() {
    if (editMode) {
      toast.info("Aperçu — modifications non enregistrées");
      return;
    }
    startTransition(async () => {
      const r = await saveScolariteTab(applicationId, {
        ...data,
        establishmentId: establishmentId || undefined,
        niveau: niveau || undefined,
        pedagogique,
      });
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("saveError"));
    });
  }

  return (
    <div className="space-y-6">
      {/* Renseignements pédagogiques — class-conditional sub-card.
          Owns its own useField/EditableField wiring internally. */}
      <PedagogiqueSection
        group={niveauGroup}
        data={pedagogique}
        onChange={setPedagogique}
        disabled={disabled}
      />

      {/* ── Établissement précédent ── (hidden for PS/TPS — first year) */}
      {hideAnteriorite ? null : (
      <Card>
        <CardHeader title={t("scolarite.previousTitle")} />
        <CardBody>
          <FormRow>
            {fPrevSchool?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="scolarite.previous.school">
                <Field
                  label={fPrevSchool?.label ?? t("scolarite.previousSchool")}
                  htmlFor="previousSchool"
                  required={fPrevSchool?.required ?? true}
                >
                  <Input
                    id="previousSchool"
                    value={data.previousSchool}
                    onChange={(e) => patch({ previousSchool: e.target.value })}
                    disabled={disabled}
                  />
                </Field>
              </EditableField>
            )}
            {fPrevClass?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="scolarite.previous.class">
                <Field
                  label={fPrevClass?.label ?? t("scolarite.previousClass")}
                  htmlFor="previousClass"
                  required={fPrevClass?.required ?? true}
                >
                  <Input
                    id="previousClass"
                    value={data.previousClass}
                    onChange={(e) => patch({ previousClass: e.target.value })}
                    disabled={disabled}
                  />
                </Field>
              </EditableField>
            )}
          </FormRow>
          <FormRow>
            {fPrevNetwork?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="scolarite.previous.network">
                <Field
                  label={fPrevNetwork?.label ?? t("scolarite.previousNetwork")}
                  htmlFor="previousNetwork"
                  required={fPrevNetwork?.required ?? false}
                >
                  <Select
                    id="previousNetwork"
                    value={data.previousNetwork}
                    onChange={(e) => patch({ previousNetwork: e.target.value })}
                    disabled={disabled}
                  >
                    <option value="">—</option>
                    <option value="MLF">MLF</option>
                    <option value="AEFE">AEFE</option>
                    <option value="autre">{t("scolarite.networkOther")}</option>
                  </Select>
                </Field>
              </EditableField>
            )}
            {fAttendedMlf?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="scolarite.previous.attendedMlfBefore">
                <Field
                  label={fAttendedMlf?.label ?? t("scolarite.attendedMlfBefore")}
                  htmlFor="attendedMlfBefore"
                  required={fAttendedMlf?.required ?? true}
                >
                  <YesNo
                    value={data.attendedMlfBefore}
                    onChange={(v) => patch({ attendedMlfBefore: v })}
                    name="attendedMlfBefore"
                    disabled={disabled}
                    yesLabel={tCommon("yes")}
                    noLabel={tCommon("no")}
                  />
                </Field>
              </EditableField>
            )}
          </FormRow>
        </CardBody>
      </Card>
      )}

      {/* ── Scolarité antérieure (3 dernières années) — dynamic list ── */}
      {hideAnteriorite || fHistoryList?.hidden ? null : (
        <EditableField fieldKey="scolarite.history.list">
          <Card>
            <CardHeader
              title={fHistoryList?.label ?? t("scolarite.historyTitle")}
              description={t("scolarite.historyHint")}
            />
            <CardBody className="space-y-3">
              {data.history.length === 0 ? (
                <p className="text-sm text-[color:var(--color-foreground-muted)]">
                  {t("scolarite.historyEmpty")}
                </p>
              ) : (
                data.history.map((row, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-3 sm:grid-cols-[1fr_1fr_2fr_auto]"
                  >
                    {fHistYear?.hidden ? null : (
                      <EditableField fieldKey="scolarite.history.year">
                        <Field
                          label={fHistYear?.label ?? t("scolarite.historyYear")}
                          htmlFor={`h-${i}-y`}
                          required={fHistYear?.required ?? false}
                        >
                          <Input
                            id={`h-${i}-y`}
                            value={row.year}
                            placeholder="2024-2025"
                            onChange={(e) =>
                              updateHistory(i, { year: e.target.value })
                            }
                            disabled={disabled}
                          />
                        </Field>
                      </EditableField>
                    )}
                    {fHistClass?.hidden ? null : (
                      <EditableField fieldKey="scolarite.history.className">
                        <Field
                          label={fHistClass?.label ?? t("scolarite.historyClass")}
                          htmlFor={`h-${i}-c`}
                          required={fHistClass?.required ?? false}
                        >
                          <Input
                            id={`h-${i}-c`}
                            value={row.className}
                            onChange={(e) =>
                              updateHistory(i, { className: e.target.value })
                            }
                            disabled={disabled}
                          />
                        </Field>
                      </EditableField>
                    )}
                    {fHistSchool?.hidden ? null : (
                      <EditableField fieldKey="scolarite.history.school">
                        <Field
                          label={fHistSchool?.label ?? t("scolarite.historySchool")}
                          htmlFor={`h-${i}-s`}
                          required={fHistSchool?.required ?? false}
                        >
                          <Input
                            id={`h-${i}-s`}
                            value={row.school}
                            onChange={(e) =>
                              updateHistory(i, { school: e.target.value })
                            }
                            disabled={disabled}
                          />
                        </Field>
                      </EditableField>
                    )}
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeHistory(i)}
                        disabled={disabled}
                        aria-label={t("scolarite.removeHistoryRow")}
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
                  onClick={addHistoryRow}
                  disabled={disabled}
                  className="gap-1.5"
                >
                  <Plus className="size-4" aria-hidden />
                  {t("scolarite.addHistoryRow")}
                </Button>
              </div>
            </CardBody>
          </Card>
        </EditableField>
      )}

      {/* ── EBEP — Élèves à besoins éducatifs particuliers ── */}
      <Card>
        <CardHeader
          title={t("scolarite.ebepTitle")}
          description={t("scolarite.ebepHint")}
        />
        <CardBody className="space-y-5">
          {fEbepPrev?.hidden ? null : (
            <div>
              <EditableField fieldKey="scolarite.ebep.previous">
                <Field
                  label={fEbepPrev?.label ?? t("scolarite.ebepPrevious")}
                  htmlFor="ebepPrevious"
                  required={fEbepPrev?.required ?? true}
                >
                  <YesNo
                    value={data.ebepPrevious}
                    onChange={(v) => patch({ ebepPrevious: v })}
                    name="ebepPrevious"
                    disabled={disabled}
                    yesLabel={tCommon("yes")}
                    noLabel={tCommon("no")}
                  />
                </Field>
              </EditableField>
              {data.ebepPrevious ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  {EBEP_FLAGS_LIST.map((flag) => (
                    <CheckboxPill
                      key={flag}
                      label={flag}
                      checked={data.ebepPreviousFlags[flag]}
                      onChange={() => toggleEbep("ebepPreviousFlags", flag)}
                      disabled={disabled}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {fEbepCur?.hidden ? null : (
            <div>
              <EditableField fieldKey="scolarite.ebep.current">
                <Field
                  label={fEbepCur?.label ?? t("scolarite.ebepCurrent")}
                  htmlFor="ebepCurrent"
                  required={fEbepCur?.required ?? true}
                >
                  <YesNo
                    value={data.ebepCurrent}
                    onChange={(v) => patch({ ebepCurrent: v })}
                    name="ebepCurrent"
                    disabled={disabled}
                    yesLabel={tCommon("yes")}
                    noLabel={tCommon("no")}
                  />
                </Field>
              </EditableField>
              {data.ebepCurrent ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  {EBEP_FLAGS_LIST.map((flag) => (
                    <CheckboxPill
                      key={flag}
                      label={flag}
                      checked={data.ebepCurrentFlags[flag]}
                      onChange={() => toggleEbep("ebepCurrentFlags", flag)}
                      disabled={disabled}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* Bilans — 4 individually-registered booleans, each wrapped
              with its own EditableField so each pill can be edited
              independently in the WYSIWYG drawer. */}
          <Field label={t("scolarite.bilansTitle")} htmlFor="bilans">
            <div className="flex flex-wrap gap-3">
              {BILAN_FLAGS_LIST.map((flag) => {
                const cfg = bilanFields[flag];
                if (cfg?.hidden) return null;
                return (
                  <EditableField key={flag} fieldKey={BILAN_KEY[flag]}>
                    <CheckboxPill
                      label={
                        cfg?.label ?? t(`scolarite.bilan.${flag}` as never)
                      }
                      checked={data.bilansRealises[flag]}
                      onChange={() => toggleBilan(flag)}
                      disabled={disabled}
                    />
                  </EditableField>
                );
              })}
            </div>
          </Field>
        </CardBody>
      </Card>

      {/* ── Dispense des examens libanais ── (CE2+ only → hidden for PS/TPS) */}
      {hideAnteriorite || fDispense?.hidden ? null : (
        <Card>
          <CardHeader
            title={t("scolarite.dispenseTitle")}
            description={t("scolarite.dispenseHint")}
          />
          <CardBody>
            <EditableField fieldKey="scolarite.dispense.libanais">
              <Field
                label={fDispense?.label ?? t("scolarite.dispenseLabel")}
                htmlFor="dispenseLibanais"
                required={fDispense?.required ?? true}
              >
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="dispense"
                      checked={data.dispenseLibanais === "non"}
                      onChange={() => patch({ dispenseLibanais: "non" })}
                      disabled={disabled}
                    />
                    {t("scolarite.dispenseNon")}
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="dispense"
                      checked={data.dispenseLibanais === "oui"}
                      onChange={() => patch({ dispenseLibanais: "oui" })}
                      disabled={disabled}
                    />
                    {t("scolarite.dispenseOui")}
                  </label>
                </div>
              </Field>
            </EditableField>
            {data.dispenseLibanais === "oui" ? (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-[color:var(--color-warning-soft-fg)]/30 bg-[color:var(--color-warning-soft)] px-3 py-2 text-xs text-[color:var(--color-warning-soft-fg)]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{t("scolarite.dispenseWarning")}</span>
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}

      {/* ── Scolarité souhaitée ── */}
      <Card>
        <CardHeader title={t("scolarite.wishlistTitle")} />
        <CardBody>
          <Field label={t("scolarite.school")} htmlFor="schoolName">
            <Input
              id="schoolName"
              value={schoolName}
              readOnly
              disabled
              className="font-medium"
            />
          </Field>
          <FormRow>
            {fEstablishment?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="scolarite.wishlist.establishment">
                <Field
                  label={fEstablishment?.label ?? tAdm("dossierFieldEstablishment")}
                  htmlFor="establishmentId"
                  required={fEstablishment?.required ?? establishments.length > 0}
                >
                  <Select
                    id="establishmentId"
                    value={establishmentId}
                    onChange={(e) => {
                      setEstablishmentId(e.target.value);
                      setNiveau("");
                    }}
                    disabled={disabled || establishments.length === 0}
                  >
                    <option value="">—</option>
                    {establishments.map((est) => (
                      <option key={est.id} value={est.id}>
                        {est.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </EditableField>
            )}
            {fNiveau?.hidden ? (
              <div />
            ) : (
              <EditableField fieldKey="scolarite.wishlist.niveau">
                <Field
                  label={fNiveau?.label ?? tAdm("dossierFieldNiveau")}
                  htmlFor="niveau"
                  required={fNiveau?.required ?? true}
                >
                  {selectedEst && selectedEst.levels.length > 0 ? (
                    <Select
                      id="niveau"
                      value={niveau}
                      onChange={(e) => setNiveau(e.target.value)}
                      disabled={disabled || !establishmentId}
                    >
                      <option value="">—</option>
                      {selectedEst.levels.map((lv) => (
                        <option key={lv} value={lv}>
                          {lv}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id="niveau"
                      value={niveau}
                      onChange={(e) => setNiveau(e.target.value)}
                      maxLength={40}
                      disabled={
                        disabled ||
                        (establishments.length > 0 && !establishmentId)
                      }
                    />
                  )}
                </Field>
              </EditableField>
            )}
          </FormRow>
          {fEntryDate?.hidden ? null : (
            <EditableField fieldKey="scolarite.wishlist.entryDate">
              <Field
                label={fEntryDate?.label ?? t("scolarite.entryDate")}
                htmlFor="entryDate"
                required={fEntryDate?.required ?? true}
                hint={t("scolarite.entryDateHint")}
              >
                <Input
                  id="entryDate"
                  type="date"
                  value={data.entryDate}
                  onChange={(e) => patch({ entryDate: e.target.value })}
                  disabled={disabled}
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

function CheckboxPill({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}) {
  return (
    <label
      className={
        checked
          ? "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-brand-600)] bg-[color:var(--color-brand-50)] px-2.5 py-1 text-sm font-medium text-[color:var(--color-brand-700)]"
          : "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-2.5 py-1 text-sm font-medium text-[color:var(--color-foreground)] hover:bg-[color:var(--color-surface-sunken)]"
      }
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="size-3.5"
      />
      {label}
    </label>
  );
}
