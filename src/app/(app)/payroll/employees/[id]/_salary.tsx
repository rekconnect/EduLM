"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createComponent, updateComponent, deleteComponent } from "../../_actions";

export type ComponentView = {
  id: string;
  kind: "EARNING" | "DEDUCTION";
  label: string;
  currency: string; // USD | LBP
  amount: number; // cents
  perDay: boolean;
  taxable: boolean;
};

export function SalaryManager({
  employeeId,
  components,
}: {
  employeeId: string;
  components: ComponentView[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">
            Rémunération ({components.length})
          </h3>
          <p className="text-xs text-[color:var(--color-foreground-muted)]">
            Lignes récurrentes. « Par jour » = montant multiplié par les jours travaillés (les absences le réduisent).
          </p>
        </div>
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setAdding((v) => !v)}>
          {adding ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {adding ? "Fermer" : "Ajouter"}
        </Button>
      </div>

      {adding ? <CompForm employeeId={employeeId} onDone={() => setAdding(false)} /> : null}

      <Table>
        <THead>
          <tr>
            <TH>Type</TH>
            <TH>Libellé</TH>
            <TH className="text-end">Montant</TH>
            <TH>Base</TH>
            <TH className="text-end" />
          </tr>
        </THead>
        <tbody>
          {components.length === 0 ? (
            <EmptyRow colSpan={5}>Aucune ligne de rémunération.</EmptyRow>
          ) : (
            components.map((c) =>
              editing === c.id ? (
                <tr key={c.id}>
                  <td colSpan={5} className="px-3 py-2">
                    <CompForm employeeId={employeeId} comp={c} onDone={() => setEditing(null)} />
                  </td>
                </tr>
              ) : (
                <TR key={c.id}>
                  <TD>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        c.kind === "EARNING"
                          ? "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]"
                          : "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
                      )}
                    >
                      {c.kind === "EARNING" ? "Gain" : "Retenue"}
                    </span>
                  </TD>
                  <TD className="font-medium">{c.label}</TD>
                  <TD className="text-end tabular-nums">
                    {formatMoney(c.amount, c.currency)}
                    {c.perDay ? <span className="text-[color:var(--color-foreground-muted)]"> / j</span> : null}
                  </TD>
                  <TD className="text-[color:var(--color-foreground-muted)]">
                    {c.perDay ? "Par jour" : "Mensuel"}
                    {c.taxable ? (
                      <span className="ms-1.5 rounded bg-[color:var(--color-surface-sunken)] px-1 py-0.5 text-[10px] uppercase text-[color:var(--color-foreground-subtle)]">
                        NSF/impôt
                      </span>
                    ) : null}
                  </TD>
                  <TD className="text-end">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(c.id)}
                        aria-label="Modifier"
                        className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                      <DeleteCompButton id={c.id} employeeId={employeeId} />
                    </div>
                  </TD>
                </TR>
              ),
            )
          )}
        </tbody>
      </Table>
    </div>
  );
}

function CompForm({
  employeeId,
  comp,
  onDone,
}: {
  employeeId: string;
  comp?: ComponentView;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) =>
        start(async () => {
          if (comp) await updateComponent(comp.id, employeeId, fd);
          else await createComponent(employeeId, fd);
          onDone();
        })
      }
      className="grid grid-cols-2 gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-3 sm:grid-cols-12 sm:items-end"
    >
      <label className="sm:col-span-2">
        <span className="text-[10px] uppercase text-[color:var(--color-foreground-muted)]">Type</span>
        <Select name="kind" defaultValue={comp?.kind ?? "EARNING"}>
          <option value="EARNING">Gain</option>
          <option value="DEDUCTION">Retenue</option>
        </Select>
      </label>
      <label className="sm:col-span-4">
        <span className="text-[10px] uppercase text-[color:var(--color-foreground-muted)]">Libellé</span>
        <Input name="label" defaultValue={comp?.label ?? ""} placeholder="Base, Transport…" required />
      </label>
      <label className="sm:col-span-2">
        <span className="text-[10px] uppercase text-[color:var(--color-foreground-muted)]">Montant</span>
        <Input name="amount" inputMode="decimal" defaultValue={comp ? String(comp.amount / 100) : ""} placeholder="0" />
      </label>
      <label className="sm:col-span-2">
        <span className="text-[10px] uppercase text-[color:var(--color-foreground-muted)]">Devise</span>
        <Select name="currency" defaultValue={comp?.currency ?? "USD"}>
          <option value="USD">USD</option>
          <option value="LBP">LBP</option>
        </Select>
      </label>
      <label className="inline-flex items-center gap-1.5 text-xs sm:col-span-2">
        <input type="checkbox" name="perDay" defaultChecked={comp?.perDay ?? false} /> Par jour
      </label>
      <label className="inline-flex items-center gap-1.5 text-xs sm:col-span-3">
        <input type="checkbox" name="taxable" defaultChecked={comp?.taxable ?? false} /> Soumis NSF/impôt
      </label>
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-12">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : comp ? "Enregistrer" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}

function DeleteCompButton({ id, employeeId }: { id: string; employeeId: string }) {
  const [pending, start] = useTransition();
  return (
    <form action={() => start(async () => { await deleteComponent(id, employeeId); })}>
      <button
        type="submit"
        disabled={pending}
        aria-label="Supprimer"
        className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-danger-soft)] hover:text-[color:var(--color-danger-soft-fg)] disabled:opacity-50"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </form>
  );
}
