"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { saveSettings, type FormState } from "./_actions";

export type CategoryRow = { name: string; taxPct: string; nfsPct: string };
export type SettingsInitial = {
  exchangeRate: string;
  workingDaysPerMonth: string;
  fuelPrice: string;
  fuelPriceCurrency: string;
  minTransport: string;
  kmPerLitre: string;
  categories: CategoryRow[];
};

export function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettings, {});
  const [cats, setCats] = useState<CategoryRow[]>(
    initial.categories.length ? initial.categories : [{ name: "", taxPct: "", nfsPct: "" }],
  );

  return (
    <form action={action} className="space-y-8">
      {/* ── Général ─────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">Général</h2>
        <FormRow>
          <Field label="Taux de change (LBP pour 1 USD)" htmlFor="exchangeRate">
            <Input id="exchangeRate" name="exchangeRate" inputMode="decimal" defaultValue={initial.exchangeRate} placeholder="89000" />
          </Field>
          <Field label="Jours ouvrés / mois (par défaut)" htmlFor="workingDaysPerMonth">
            <Input id="workingDaysPerMonth" name="workingDaysPerMonth" type="number" min="1" max="31" defaultValue={initial.workingDaysPerMonth} />
          </Field>
        </FormRow>
      </section>

      {/* ── Transport ─────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">Transport</h2>
        <p className="text-xs text-[color:var(--color-foreground-muted)]">
          Par jour = km ≤ 20 ? minimum : max(km ÷ km/litre × prix carburant × 2, minimum). Modifier ici met à jour tout le personnel.
        </p>
        <FormRow>
          <Field label="Prix du carburant / litre" htmlFor="fuelPrice">
            <Input id="fuelPrice" name="fuelPrice" inputMode="decimal" defaultValue={initial.fuelPrice} placeholder="0" />
          </Field>
          <Field label="Devise carburant" htmlFor="fuelPriceCurrency">
            <Select id="fuelPriceCurrency" name="fuelPriceCurrency" defaultValue={initial.fuelPriceCurrency}>
              <option value="USD">USD</option>
              <option value="LBP">LBP</option>
            </Select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Transport minimum / jour (USD)" htmlFor="minTransport">
            <Input id="minTransport" name="minTransport" inputMode="decimal" defaultValue={initial.minTransport} placeholder="5" />
          </Field>
          <Field label="Km par litre" htmlFor="kmPerLitre">
            <Input id="kmPerLitre" name="kmPerLitre" inputMode="decimal" defaultValue={initial.kmPerLitre} placeholder="7.5" />
          </Field>
        </FormRow>
      </section>

      {/* ── Catégories NSF / impôt ─────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">Catégories NSF / impôt</h2>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={() => setCats((c) => [...c, { name: "", taxPct: "", nfsPct: "" }])}
          >
            <Plus className="size-4" aria-hidden /> Catégorie
          </Button>
        </div>
        <p className="text-xs text-[color:var(--color-foreground-muted)]">
          Taux en % de la base imposable. La catégorie d&apos;un employé (« Catégorie NSF/impôt » sur sa fiche) choisit la ligne appliquée.
        </p>
        <div className="space-y-2">
          <div className="hidden grid-cols-12 gap-2 px-1 text-[10px] uppercase text-[color:var(--color-foreground-muted)] sm:grid">
            <span className="col-span-6">Catégorie</span>
            <span className="col-span-2 text-end">Impôt %</span>
            <span className="col-span-2 text-end">NSF %</span>
          </div>
          {cats.map((row, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <Input
                name="catName"
                className="col-span-6"
                defaultValue={row.name}
                placeholder="Professeur, Admin…"
              />
              <Input name="catTax" className="col-span-2 text-end" inputMode="decimal" defaultValue={row.taxPct} placeholder="0" />
              <Input name="catNfs" className="col-span-2 text-end" inputMode="decimal" defaultValue={row.nfsPct} placeholder="0" />
              <button
                type="button"
                onClick={() => setCats((c) => c.filter((_, j) => j !== i))}
                aria-label="Supprimer"
                className="col-span-2 inline-flex size-8 items-center justify-center justify-self-end rounded text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-danger-soft)] hover:text-[color:var(--color-danger-soft-fg)]"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 border-t border-[color:var(--color-border-subtle)] pt-4">
        {state.ok ? (
          <span className="flex items-center gap-1.5 text-sm text-[color:var(--color-success-soft-fg)]" role="status">
            <CheckCircle2 className="size-4" aria-hidden /> Enregistré
          </span>
        ) : null}
        {state.error ? (
          <span className="text-sm text-[color:var(--color-danger)]" role="alert">
            {state.error}
          </span>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
