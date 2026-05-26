"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { saveFinanceTab } from "../../_actions";
import { type FinanceData } from "@/lib/dossier-content";

const LBP_BUCKETS = ["3000000", "6000000", "9000000", "none", "autre"] as const;
const USD_BUCKETS = ["30", "60", "90", "none", "autre"] as const;

/**
 * Finance tab — règlements + MLF entry rights + parents' committee +
 * dual-currency solidarity fund. Hidden by default for Lycée Montaigne.
 *
 * Phase 4: 8 registry fields wrapped with EditableField. caisse.lbp /
 * caisse.usd are radio_groups; lbpAutre / usdAutre fields appear only
 * when their parent radio is set to "autre" AND not overridden hidden.
 */
export function DossierTabFinance({
  applicationId,
  initial,
  disabled,
  editMode = false,
}: {
  applicationId: string;
  initial: FinanceData;
  disabled: boolean;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [d, setD] = useState<FinanceData>(initial);

  const fAckInterieur = useField("finance.reglements.ackInterieur");
  const fAckFinancier = useField("finance.reglements.ackFinancier");
  const fAckDroitsMlf = useField("finance.droitsMlf.ack");
  const fComite = useField("finance.comite.subscribe");
  const fLbp = useField("finance.caisse.lbp");
  const fLbpAutre = useField("finance.caisse.lbpAutre");
  const fUsd = useField("finance.caisse.usd");
  const fUsdAutre = useField("finance.caisse.usdAutre");

  function patch(p: Partial<FinanceData>) {
    setD((prev) => ({ ...prev, ...p }));
  }

  function onSave() {
    if (editMode) {
      toast.info("Aperçu — modifications non enregistrées");
      return;
    }
    startTransition(async () => {
      const r = await saveFinanceTab(applicationId, d);
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("saveError"));
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("finance.reglementsTitle")}
          description={t("finance.reglementsHint")}
        />
        <CardBody className="space-y-3">
          <p className="text-xs text-[color:var(--color-foreground-muted)]">
            {t("finance.downloadPrompt")}
          </p>
          {fAckInterieur?.hidden ? null : (
            <EditableField fieldKey="finance.reglements.ackInterieur">
              <label className="flex items-start gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-3 text-sm">
                <input
                  type="checkbox"
                  checked={d.acknowledgedReglementInterieur}
                  onChange={() =>
                    patch({
                      acknowledgedReglementInterieur:
                        !d.acknowledgedReglementInterieur,
                    })
                  }
                  disabled={disabled}
                  className="mt-0.5"
                />
                <span>{fAckInterieur?.label ?? t("finance.ackInterieur")}</span>
              </label>
            </EditableField>
          )}
          {fAckFinancier?.hidden ? null : (
            <EditableField fieldKey="finance.reglements.ackFinancier">
              <label className="flex items-start gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-3 text-sm">
                <input
                  type="checkbox"
                  checked={d.acknowledgedReglementFinancier}
                  onChange={() =>
                    patch({
                      acknowledgedReglementFinancier:
                        !d.acknowledgedReglementFinancier,
                    })
                  }
                  disabled={disabled}
                  className="mt-0.5"
                />
                <span>{fAckFinancier?.label ?? t("finance.ackFinancier")}</span>
              </label>
            </EditableField>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("finance.droitsMlfTitle")}
          description={t("finance.droitsMlfHint")}
        />
        <CardBody>
          <label className="flex items-start gap-2 rounded-md border border-[color:var(--color-warning-soft-fg)]/30 bg-[color:var(--color-warning-soft)] p-3 text-sm text-[color:var(--color-warning-soft-fg)]">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <span>{t("finance.droitsMlfNonRefundable")}</span>
          </label>
          {fAckDroitsMlf?.hidden ? null : (
            <EditableField fieldKey="finance.droitsMlf.ack">
              <label className="mt-3 flex items-start gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-3 text-sm">
                <input
                  type="checkbox"
                  checked={d.acknowledgedDroitsEntreeMlf}
                  onChange={() =>
                    patch({
                      acknowledgedDroitsEntreeMlf:
                        !d.acknowledgedDroitsEntreeMlf,
                    })
                  }
                  disabled={disabled}
                  className="mt-0.5"
                />
                <span>{fAckDroitsMlf?.label ?? t("finance.ackDroitsMlf")}</span>
              </label>
            </EditableField>
          )}
        </CardBody>
      </Card>

      {fComite?.hidden ? null : (
        <Card>
          <CardHeader
            title={t("finance.comiteTitle")}
            description={t("finance.comiteHint")}
          />
          <CardBody>
            <EditableField fieldKey="finance.comite.subscribe">
              <Field
                label={fComite?.label ?? t("finance.comiteLabel")}
                htmlFor="comite"
                required={fComite?.required ?? true}
              >
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="comite"
                      checked={d.comiteParents === true}
                      onChange={() => patch({ comiteParents: true })}
                      disabled={disabled}
                    />
                    {tCommon("yes")}
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="comite"
                      checked={d.comiteParents === false}
                      onChange={() => patch({ comiteParents: false })}
                      disabled={disabled}
                    />
                    {tCommon("no")}
                  </label>
                </div>
              </Field>
            </EditableField>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title={t("finance.caisseTitle")}
          description={t("finance.caisseHint")}
        />
        <CardBody className="space-y-4">
          {fLbp?.hidden ? null : (
            <EditableField fieldKey="finance.caisse.lbp">
              <CaissePicker
                label={fLbp?.label ?? t("finance.caisseLbp")}
                required={fLbp?.required ?? false}
                value={d.caisseLbp}
                onChange={(v) => patch({ caisseLbp: v })}
                buckets={LBP_BUCKETS}
                currency="LBP"
                autreAmount={d.caisseLbpAutreAmount}
                onAutreChange={(v) => patch({ caisseLbpAutreAmount: v })}
                autreFieldKey="finance.caisse.lbpAutre"
                autreHidden={!!fLbpAutre?.hidden}
                autreLabel={fLbpAutre?.label}
                disabled={disabled}
                t={t}
              />
            </EditableField>
          )}
          {fUsd?.hidden ? null : (
            <EditableField fieldKey="finance.caisse.usd">
              <CaissePicker
                label={fUsd?.label ?? t("finance.caisseUsd")}
                required={fUsd?.required ?? false}
                value={d.caisseUsd}
                onChange={(v) => patch({ caisseUsd: v })}
                buckets={USD_BUCKETS}
                currency="USD"
                autreAmount={d.caisseUsdAutreAmount}
                onAutreChange={(v) => patch({ caisseUsdAutreAmount: v })}
                autreFieldKey="finance.caisse.usdAutre"
                autreHidden={!!fUsdAutre?.hidden}
                autreLabel={fUsdAutre?.label}
                disabled={disabled}
                t={t}
              />
            </EditableField>
          )}
        </CardBody>
      </Card>

      {!disabled ? (
        <div className="flex justify-end">
          <Button type="button" onClick={onSave} disabled={pending} className="gap-2">
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

function CaissePicker({
  label,
  required,
  value,
  onChange,
  buckets,
  currency,
  autreAmount,
  onAutreChange,
  autreFieldKey,
  autreHidden,
  autreLabel,
  disabled,
  t,
}: {
  label: string;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
  buckets: readonly string[];
  currency: "LBP" | "USD";
  autreAmount: string;
  onAutreChange: (v: string) => void;
  autreFieldKey: string;
  autreHidden: boolean;
  autreLabel: string | undefined;
  disabled: boolean;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  return (
    <Field label={label} htmlFor={`caisse-${currency}`} required={required}>
      <div className="flex flex-wrap gap-2">
        {buckets.map((b) => {
          const selected = value === b;
          const display =
            b === "none"
              ? t("finance.caisseNone")
              : b === "autre"
                ? t("finance.caisseAutre")
                : `${Number(b).toLocaleString("fr-FR")} ${currency}`;
          return (
            <label
              key={b}
              className={
                selected
                  ? "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-brand-600)] bg-[color:var(--color-brand-50)] px-2.5 py-1.5 text-sm font-medium text-[color:var(--color-brand-700)]"
                  : "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-2.5 py-1.5 text-sm font-medium text-[color:var(--color-foreground)] hover:bg-[color:var(--color-surface-sunken)]"
              }
            >
              <input
                type="radio"
                name={`caisse-${currency}`}
                checked={selected}
                onChange={() => onChange(b)}
                disabled={disabled}
                className="size-3.5"
              />
              {display}
            </label>
          );
        })}
      </div>
      {value === "autre" && !autreHidden ? (
        <EditableField fieldKey={autreFieldKey}>
          <div className="mt-2 max-w-xs">
            <Input
              inputMode="decimal"
              value={autreAmount}
              placeholder={autreLabel ?? t("finance.caisseAutrePlaceholder")}
              onChange={(e) => onAutreChange(e.target.value)}
              disabled={disabled}
            />
          </div>
        </EditableField>
      ) : null}
    </Field>
  );
}
