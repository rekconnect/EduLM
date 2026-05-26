"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormRow } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import {
  type NiveauGroup,
  type PedagogiqueData,
  LVA_OPTIONS,
  LVB_OPTIONS_2NDE,
  LVB_OPTIONS_LYCEE,
  LVC_OPTIONS,
  SPECIALITES,
} from "@/lib/pedagogique";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";

/**
 * Conditional pedagogical card on the Scolarité tab. Re-renders based
 * on the niveau group (CE2-3ème / 2nde / 1ère / Tle). If the niveau
 * doesn't trigger a pedagogical section (e.g. maternelle, CP, CE1),
 * nothing is rendered.
 *
 * Phase 4: every registered field across all 4 sub-blocks (21 total)
 * is wrapped in EditableField and reads label/required/hidden via
 * useField. The shared LycéeLanguesRow accepts a groupKey prop to
 * construct the right registry key per niveau group.
 */
export function PedagogiqueSection({
  group,
  data,
  onChange,
  disabled,
}: {
  group: NiveauGroup;
  data: PedagogiqueData;
  onChange: (next: PedagogiqueData) => void;
  disabled: boolean;
}) {
  const t = useTranslations("dossierForms");

  if (group === null) return null;

  return (
    <Card>
      <CardHeader
        title={t("pedagogique.title")}
        description={t(`pedagogique.${group}.hint` as never)}
      />
      <CardBody className="space-y-5">
        {group === "ce2_3eme" ? (
          <Ce23emeBlock data={data} onChange={onChange} disabled={disabled} />
        ) : null}
        {group === "seconde" ? (
          <SecondeBlock data={data} onChange={onChange} disabled={disabled} />
        ) : null}
        {group === "premiere" ? (
          <PremiereBlock data={data} onChange={onChange} disabled={disabled} />
        ) : null}
        {group === "terminale" ? (
          <TerminaleBlock data={data} onChange={onChange} disabled={disabled} />
        ) : null}
      </CardBody>
    </Card>
  );
}

// ── CE2 → 3ème ──────────────────────────────────────────────

function Ce23emeBlock({
  data,
  onChange,
  disabled,
}: {
  data: PedagogiqueData;
  onChange: (next: PedagogiqueData) => void;
  disabled: boolean;
}) {
  const t = useTranslations("dossierForms");
  const fArabe = useField("scolarite.pedagogique.ce2_3eme.arabe");

  function setArabe(v: "ALE" | "ALM") {
    onChange({ ...data, ce2_3eme: { arabe: v } });
  }

  if (fArabe?.hidden) return null;
  return (
    <EditableField fieldKey="scolarite.pedagogique.ce2_3eme.arabe">
      <Field
        label={fArabe?.label ?? t("pedagogique.ce2_3eme.arabeLabel")}
        htmlFor="ce2-arabe"
        required={fArabe?.required ?? true}
        hint={t("pedagogique.ce2_3eme.arabeHint")}
      >
        <div className="flex gap-4">
          <RadioPill
            label={t("pedagogique.ce2_3eme.ale")}
            sub={t("pedagogique.ce2_3eme.aleSub")}
            checked={data.ce2_3eme.arabe === "ALE"}
            onChange={() => setArabe("ALE")}
            disabled={disabled}
            name="ce2-arabe"
          />
          <RadioPill
            label={t("pedagogique.ce2_3eme.alm")}
            sub={t("pedagogique.ce2_3eme.almSub")}
            checked={data.ce2_3eme.arabe === "ALM"}
            onChange={() => setArabe("ALM")}
            disabled={disabled}
            name="ce2-arabe"
          />
        </div>
      </Field>
    </EditableField>
  );
}

// ── 2nde ────────────────────────────────────────────────────

function SecondeBlock({
  data,
  onChange,
  disabled,
}: {
  data: PedagogiqueData;
  onChange: (next: PedagogiqueData) => void;
  disabled: boolean;
}) {
  const t = useTranslations("dossierForms");

  const fLva = useField("scolarite.pedagogique.seconde.lva");
  const fLvb = useField("scolarite.pedagogique.seconde.lvb");
  const fLvc = useField("scolarite.pedagogique.seconde.lvc");
  const fArts = useField("scolarite.pedagogique.seconde.artsPlastiques");
  const fSiCit = useField("scolarite.pedagogique.seconde.siCit");
  const fBfi = useField("scolarite.pedagogique.seconde.bfi");

  function patch(p: Partial<typeof data.seconde>) {
    onChange({ ...data, seconde: { ...data.seconde, ...p } });
  }
  function toggleLvc(v: string) {
    const has = data.seconde.lvc.includes(v);
    patch({
      lvc: has ? data.seconde.lvc.filter((x) => x !== v) : [...data.seconde.lvc, v],
    });
  }

  return (
    <>
      <FormRow>
        {fLva?.hidden ? (
          <div />
        ) : (
          <EditableField fieldKey="scolarite.pedagogique.seconde.lva">
            <Field
              label={fLva?.label ?? t("pedagogique.lva")}
              htmlFor="seconde-lva"
              required={fLva?.required ?? true}
            >
              <Select
                id="seconde-lva"
                value={data.seconde.lva}
                onChange={(e) => patch({ lva: e.target.value })}
                disabled={disabled}
              >
                <option value="">—</option>
                {LVA_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {t(`pedagogique.lang.${v}` as never)}
                  </option>
                ))}
              </Select>
            </Field>
          </EditableField>
        )}
        {fLvb?.hidden ? (
          <div />
        ) : (
          <EditableField fieldKey="scolarite.pedagogique.seconde.lvb">
            <Field
              label={fLvb?.label ?? t("pedagogique.lvb")}
              htmlFor="seconde-lvb"
              required={fLvb?.required ?? true}
            >
              <Select
                id="seconde-lvb"
                value={data.seconde.lvb}
                onChange={(e) => patch({ lvb: e.target.value })}
                disabled={disabled}
              >
                <option value="">—</option>
                {LVB_OPTIONS_2NDE.map((v) => (
                  <option key={v} value={v}>
                    {t(`pedagogique.lang.${v}` as never)}
                  </option>
                ))}
              </Select>
            </Field>
          </EditableField>
        )}
      </FormRow>

      {fLvc?.hidden ? null : (
        <EditableField fieldKey="scolarite.pedagogique.seconde.lvc">
          <Field
            label={fLvc?.label ?? t("pedagogique.lvcLabel")}
            htmlFor="seconde-lvc"
            required={fLvc?.required ?? false}
            hint={t("pedagogique.lvcHint")}
          >
            <div className="flex flex-wrap gap-2">
              {LVC_OPTIONS.map((v) => (
                <CheckboxPill
                  key={v}
                  label={`LVC ${t(`pedagogique.lang.${v}` as never)}`}
                  checked={data.seconde.lvc.includes(v)}
                  onChange={() => toggleLvc(v)}
                  disabled={disabled}
                />
              ))}
            </div>
          </Field>
        </EditableField>
      )}

      <Field label={t("pedagogique.optionsLabel")} htmlFor="seconde-options">
        <div className="flex flex-wrap gap-2">
          {fArts?.hidden ? null : (
            <EditableField fieldKey="scolarite.pedagogique.seconde.artsPlastiques">
              <CheckboxPill
                label={fArts?.label ?? t("pedagogique.artsPlastiques")}
                checked={data.seconde.artsPlastiques}
                onChange={() =>
                  patch({ artsPlastiques: !data.seconde.artsPlastiques })
                }
                disabled={disabled}
              />
            </EditableField>
          )}
          {fSiCit?.hidden ? null : (
            <EditableField fieldKey="scolarite.pedagogique.seconde.siCit">
              <CheckboxPill
                label={fSiCit?.label ?? t("pedagogique.seconde.siCit")}
                checked={data.seconde.siCit}
                onChange={() => patch({ siCit: !data.seconde.siCit })}
                disabled={disabled}
              />
            </EditableField>
          )}
        </div>
      </Field>

      {fBfi?.hidden ? null : (
        <EditableField fieldKey="scolarite.pedagogique.seconde.bfi">
          <div className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-3 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={data.seconde.sectionInternationale}
                onChange={() =>
                  patch({
                    sectionInternationale: !data.seconde.sectionInternationale,
                  })
                }
                disabled={disabled}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">
                  {fBfi?.label ?? t("pedagogique.seconde.bfiLabel")}
                </span>
                <span className="ms-1 text-[color:var(--color-foreground-muted)]">
                  {t("pedagogique.seconde.bfiHint")}
                </span>
                <a
                  href="https://eduscol.education.fr/687/les-sections-internationales"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ms-1 inline-flex items-center gap-0.5 text-[color:var(--color-brand-600)] underline-offset-2 hover:underline"
                >
                  {t("pedagogique.learnMore")}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </span>
            </label>
          </div>
        </EditableField>
      )}
    </>
  );
}

// ── 1ère ────────────────────────────────────────────────────

function PremiereBlock({
  data,
  onChange,
  disabled,
}: {
  data: PedagogiqueData;
  onChange: (next: PedagogiqueData) => void;
  disabled: boolean;
}) {
  const t = useTranslations("dossierForms");
  const d = data.premiere;

  const fSpecs = useField("scolarite.pedagogique.premiere.specialites");
  const fBfi = useField("scolarite.pedagogique.premiere.bfi");
  const fComplement = useField(
    "scolarite.pedagogique.premiere.complementLibanaisPhysique",
  );

  function patch(p: Partial<typeof d>) {
    onChange({ ...data, premiere: { ...d, ...p } });
  }
  function toggleSpec(v: string) {
    const has = d.specialites.includes(v);
    if (has) patch({ specialites: d.specialites.filter((x) => x !== v) });
    else if (d.specialites.length < 3) patch({ specialites: [...d.specialites, v] });
  }
  function toggleLvc(v: string) {
    const has = d.lvc.includes(v);
    patch({ lvc: has ? d.lvc.filter((x) => x !== v) : [...d.lvc, v] });
  }

  return (
    <>
      {fSpecs?.hidden ? null : (
        <EditableField fieldKey="scolarite.pedagogique.premiere.specialites">
          <Field
            label={fSpecs?.label ?? t("pedagogique.premiere.specialitesLabel")}
            htmlFor="premiere-specs"
            required={fSpecs?.required ?? true}
            hint={t("pedagogique.premiere.specialitesHint", {
              picked: d.specialites.length,
            })}
          >
            <div className="flex flex-wrap gap-2">
              {SPECIALITES.map((v) => (
                <CheckboxPill
                  key={v}
                  label={v}
                  checked={d.specialites.includes(v)}
                  onChange={() => toggleSpec(v)}
                  disabled={
                    disabled ||
                    (!d.specialites.includes(v) && d.specialites.length >= 3)
                  }
                />
              ))}
            </div>
          </Field>
        </EditableField>
      )}

      <LycéeLanguesRow
        groupKey="premiere"
        lva={d.lva}
        lvb={d.lvb}
        lvc={d.lvc}
        artsPlastiques={d.artsPlastiques}
        onChange={(p) => patch(p)}
        onToggleLvc={toggleLvc}
        disabled={disabled}
      />

      <div className="space-y-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-3 text-sm">
        {fBfi?.hidden ? null : (
          <EditableField fieldKey="scolarite.pedagogique.premiere.bfi">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={d.bfi}
                onChange={() => patch({ bfi: !d.bfi })}
                disabled={disabled}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">
                  {fBfi?.label ?? t("pedagogique.premiere.bfiLabel")}
                </span>
                <span className="ms-1 text-[color:var(--color-foreground-muted)]">
                  {t("pedagogique.premiere.bfiHint")}
                </span>
              </span>
            </label>
          </EditableField>
        )}
        {fComplement?.hidden ? null : (
          <EditableField fieldKey="scolarite.pedagogique.premiere.complementLibanaisPhysique">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={d.complementLibanaisPhysique}
                onChange={() =>
                  patch({
                    complementLibanaisPhysique: !d.complementLibanaisPhysique,
                  })
                }
                disabled={disabled}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">
                  {fComplement?.label ??
                    t("pedagogique.premiere.complementLibanaisPhysique")}
                </span>
                <span className="ms-1 text-[color:var(--color-foreground-muted)]">
                  {t("pedagogique.complementLibanaisHint")}
                </span>
              </span>
            </label>
          </EditableField>
        )}
      </div>
    </>
  );
}

// ── Terminale ───────────────────────────────────────────────

function TerminaleBlock({
  data,
  onChange,
  disabled,
}: {
  data: PedagogiqueData;
  onChange: (next: PedagogiqueData) => void;
  disabled: boolean;
}) {
  const t = useTranslations("dossierForms");
  const d = data.terminale;

  const fSpecs = useField("scolarite.pedagogique.terminale.specialites");
  const fMaths = useField("scolarite.pedagogique.terminale.maths");
  const fComplement = useField(
    "scolarite.pedagogique.terminale.complementLibanaisPhysiqueSvt",
  );

  function patch(p: Partial<typeof d>) {
    onChange({ ...data, terminale: { ...d, ...p } });
  }
  function toggleSpec(v: string) {
    const has = d.specialites.includes(v);
    if (has) patch({ specialites: d.specialites.filter((x) => x !== v) });
    else if (d.specialites.length < 2) patch({ specialites: [...d.specialites, v] });
  }
  function toggleLvc(v: string) {
    const has = d.lvc.includes(v);
    patch({ lvc: has ? d.lvc.filter((x) => x !== v) : [...d.lvc, v] });
  }
  type MathState = "none" | "comp" | "expertes";
  const mathState: MathState = d.mathsExpertes
    ? "expertes"
    : d.mathsComplementaire
      ? "comp"
      : "none";
  function setMath(next: MathState) {
    patch({
      mathsComplementaire: next === "comp",
      mathsExpertes: next === "expertes",
    });
  }

  return (
    <>
      {fSpecs?.hidden ? null : (
        <EditableField fieldKey="scolarite.pedagogique.terminale.specialites">
          <Field
            label={fSpecs?.label ?? t("pedagogique.terminale.specialitesLabel")}
            htmlFor="terminale-specs"
            required={fSpecs?.required ?? true}
            hint={t("pedagogique.terminale.specialitesHint", {
              picked: d.specialites.length,
            })}
          >
            <div className="flex flex-wrap gap-2">
              {SPECIALITES.map((v) => (
                <CheckboxPill
                  key={v}
                  label={v}
                  checked={d.specialites.includes(v)}
                  onChange={() => toggleSpec(v)}
                  disabled={
                    disabled ||
                    (!d.specialites.includes(v) && d.specialites.length >= 2)
                  }
                />
              ))}
            </div>
          </Field>
        </EditableField>
      )}

      <LycéeLanguesRow
        groupKey="terminale"
        lva={d.lva}
        lvb={d.lvb}
        lvc={d.lvc}
        artsPlastiques={d.artsPlastiques}
        onChange={(p) => patch(p)}
        onToggleLvc={toggleLvc}
        disabled={disabled}
      />

      {fMaths?.hidden ? null : (
        <EditableField fieldKey="scolarite.pedagogique.terminale.maths">
          <Field
            label={fMaths?.label ?? t("pedagogique.terminale.mathsLabel")}
            htmlFor="terminale-maths"
            required={fMaths?.required ?? false}
            hint={t("pedagogique.terminale.mathsHint")}
          >
            <div className="flex flex-wrap gap-2">
              {(["none", "comp", "expertes"] as const).map((v) => (
                <RadioPill
                  key={v}
                  label={t(`pedagogique.terminale.maths_${v}` as never)}
                  sub={
                    v === "comp"
                      ? t("pedagogique.terminale.mathsCompSub")
                      : v === "expertes"
                        ? t("pedagogique.terminale.mathsExpertesSub")
                        : ""
                  }
                  checked={mathState === v}
                  onChange={() => setMath(v)}
                  disabled={disabled}
                  name="terminale-maths"
                />
              ))}
            </div>
          </Field>
        </EditableField>
      )}

      {fComplement?.hidden ? null : (
        <EditableField fieldKey="scolarite.pedagogique.terminale.complementLibanaisPhysiqueSvt">
          <label className="flex items-start gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-3 text-sm">
            <input
              type="checkbox"
              checked={d.complementLibanaisPhysiqueSvt}
              onChange={() =>
                patch({
                  complementLibanaisPhysiqueSvt:
                    !d.complementLibanaisPhysiqueSvt,
                })
              }
              disabled={disabled}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">
                {fComplement?.label ??
                  t("pedagogique.terminale.complementLibanaisPhysiqueSvt")}
              </span>
              <span className="ms-1 text-[color:var(--color-foreground-muted)]">
                {t("pedagogique.complementLibanaisHint")}
              </span>
            </span>
          </label>
        </EditableField>
      )}
    </>
  );
}

// ── Shared Lycée langues row (used by 1ère + Tle) ────────────

function LycéeLanguesRow({
  groupKey,
  lva,
  lvb,
  lvc,
  artsPlastiques,
  onChange,
  onToggleLvc,
  disabled,
}: {
  /** Drives the registry keys used by EditableField + useField. */
  groupKey: "premiere" | "terminale";
  lva: string;
  lvb: string;
  lvc: string[];
  artsPlastiques: boolean;
  onChange: (p: { lva?: string; lvb?: string; artsPlastiques?: boolean }) => void;
  onToggleLvc: (v: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations("dossierForms");

  // Note: hooks are called unconditionally per React's rules. The
  // groupKey is stable for the lifetime of this component instance
  // (1ère vs Tle blocks are different React components, so hook
  // order is stable per call site).
  const fLva = useField(`scolarite.pedagogique.${groupKey}.lva`);
  const fLvb = useField(`scolarite.pedagogique.${groupKey}.lvb`);
  const fLvc = useField(`scolarite.pedagogique.${groupKey}.lvc`);
  const fArts = useField(`scolarite.pedagogique.${groupKey}.artsPlastiques`);

  return (
    <>
      <FormRow>
        {fLva?.hidden ? (
          <div />
        ) : (
          <EditableField fieldKey={`scolarite.pedagogique.${groupKey}.lva`}>
            <Field
              label={fLva?.label ?? t("pedagogique.lva")}
              htmlFor="lycee-lva"
              required={fLva?.required ?? true}
            >
              <Select
                id="lycee-lva"
                value={lva}
                onChange={(e) => onChange({ lva: e.target.value })}
                disabled={disabled}
              >
                <option value="">—</option>
                {LVA_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {t(`pedagogique.lang.${v}` as never)}
                  </option>
                ))}
              </Select>
            </Field>
          </EditableField>
        )}
        {fLvb?.hidden ? (
          <div />
        ) : (
          <EditableField fieldKey={`scolarite.pedagogique.${groupKey}.lvb`}>
            <Field
              label={fLvb?.label ?? t("pedagogique.lvb")}
              htmlFor="lycee-lvb"
              required={fLvb?.required ?? true}
            >
              <Select
                id="lycee-lvb"
                value={lvb}
                onChange={(e) => onChange({ lvb: e.target.value })}
                disabled={disabled}
              >
                <option value="">—</option>
                {LVB_OPTIONS_LYCEE.map((v) => (
                  <option key={v} value={v}>
                    {t(`pedagogique.lang.${v}` as never)}
                  </option>
                ))}
              </Select>
            </Field>
          </EditableField>
        )}
      </FormRow>
      {fLvc?.hidden ? null : (
        <EditableField fieldKey={`scolarite.pedagogique.${groupKey}.lvc`}>
          <Field
            label={fLvc?.label ?? t("pedagogique.lvcLabel")}
            htmlFor="lycee-lvc"
            required={fLvc?.required ?? false}
            hint={t("pedagogique.lvcHint")}
          >
            <div className="flex flex-wrap gap-2">
              {LVC_OPTIONS.map((v) => (
                <CheckboxPill
                  key={v}
                  label={`LVC ${t(`pedagogique.lang.${v}` as never)}`}
                  checked={lvc.includes(v)}
                  onChange={() => onToggleLvc(v)}
                  disabled={disabled}
                />
              ))}
            </div>
          </Field>
        </EditableField>
      )}
      <Field label={t("pedagogique.optionsLabel")} htmlFor="lycee-options">
        <div className="flex flex-wrap gap-2">
          {fArts?.hidden ? null : (
            <EditableField
              fieldKey={`scolarite.pedagogique.${groupKey}.artsPlastiques`}
            >
              <CheckboxPill
                label={fArts?.label ?? t("pedagogique.artsPlastiques")}
                checked={artsPlastiques}
                onChange={() => onChange({ artsPlastiques: !artsPlastiques })}
                disabled={disabled}
              />
            </EditableField>
          )}
        </div>
      </Field>
    </>
  );
}

// ── Small UI primitives ──────────────────────────────────────

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

function RadioPill({
  label,
  sub,
  checked,
  onChange,
  disabled,
  name,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
  name: string;
}) {
  return (
    <label
      className={
        checked
          ? "inline-flex items-start gap-2 rounded-md border border-[color:var(--color-brand-600)] bg-[color:var(--color-brand-50)] px-3 py-2 text-sm font-medium text-[color:var(--color-brand-700)]"
          : "inline-flex items-start gap-2 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-3 py-2 text-sm font-medium text-[color:var(--color-foreground)] hover:bg-[color:var(--color-surface-sunken)]"
      }
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <span>
        {label}
        {sub ? (
          <span className="ms-1 text-xs font-normal text-[color:var(--color-foreground-muted)]">
            {sub}
          </span>
        ) : null}
      </span>
    </label>
  );
}
