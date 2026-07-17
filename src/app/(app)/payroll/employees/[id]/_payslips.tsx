"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createPayslip, updatePayslip, deletePayslip } from "../../_actions";

const MONTHS = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

export type SlipView = {
  id: string;
  year: number;
  month: number;
  netLbp: number; // cents
  netUsd: number; // cents
  paid: boolean;
  salaryDate: string | null; // yyyy-mm-dd
  imported: boolean;
};

export function PayslipsManager({
  employeeId,
  payslips,
  currentYear,
}: {
  employeeId: string;
  payslips: SlipView[];
  currentYear: number;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">
          Bulletins de paie ({payslips.length})
        </h3>
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setAdding((v) => !v)}>
          {adding ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {adding ? "Fermer" : "Ajouter"}
        </Button>
      </div>

      {adding ? (
        <SlipForm
          employeeId={employeeId}
          currentYear={currentYear}
          onDone={() => setAdding(false)}
        />
      ) : null}

      <Table>
        <THead>
          <tr>
            <TH>Période</TH>
            <TH className="text-end">Net LBP</TH>
            <TH className="text-end">Net USD</TH>
            <TH>Payé</TH>
            <TH className="text-end" />
          </tr>
        </THead>
        <tbody>
          {payslips.length === 0 ? (
            <EmptyRow colSpan={5}>Aucun bulletin.</EmptyRow>
          ) : (
            payslips.map((s) =>
              editing === s.id ? (
                <tr key={s.id}>
                  <td colSpan={5} className="px-3 py-2">
                    <SlipForm
                      employeeId={employeeId}
                      currentYear={currentYear}
                      slip={s}
                      onDone={() => setEditing(null)}
                    />
                  </td>
                </tr>
              ) : (
                <TR key={s.id}>
                  <TD className="font-medium">
                    <Link
                      href={`/payroll/payslips/${s.id}`}
                      className="text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                    >
                      {MONTHS[s.month]} {s.year}
                    </Link>
                    {s.imported ? (
                      <span className="ms-2 text-[10px] text-[color:var(--color-foreground-subtle)]">Dars</span>
                    ) : null}
                  </TD>
                  <TD className="text-end tabular-nums">{formatMoney(s.netLbp, "LBP")}</TD>
                  <TD className="text-end tabular-nums text-[color:var(--color-foreground-muted)]">
                    {s.netUsd > 0 ? formatMoney(s.netUsd, "USD") : "—"}
                  </TD>
                  <TD>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        s.paid
                          ? "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]"
                          : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
                      )}
                    >
                      {s.paid ? "Payé" : "En attente"}
                    </span>
                  </TD>
                  <TD className="text-end">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(s.id)}
                        aria-label="Modifier"
                        className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                      <DeleteSlipButton id={s.id} employeeId={employeeId} />
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

function SlipForm({
  employeeId,
  slip,
  currentYear,
  onDone,
}: {
  employeeId: string;
  slip?: SlipView;
  currentYear: number;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) =>
        start(async () => {
          if (slip) await updatePayslip(slip.id, employeeId, fd);
          else await createPayslip(employeeId, fd);
          onDone();
        })
      }
      className="grid grid-cols-2 gap-2 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] p-3 sm:grid-cols-12 sm:items-end"
    >
      <label className="sm:col-span-3">
        <span className="text-[10px] uppercase text-[color:var(--color-foreground-muted)]">Mois</span>
        <Select name="month" defaultValue={slip?.month ?? new Date().getMonth() + 1}>
          {MONTHS.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
      </label>
      <label className="sm:col-span-2">
        <span className="text-[10px] uppercase text-[color:var(--color-foreground-muted)]">Année</span>
        <Input name="year" type="number" min="2000" max="2100" defaultValue={slip?.year ?? currentYear} required />
      </label>
      <label className="sm:col-span-3">
        <span className="text-[10px] uppercase text-[color:var(--color-foreground-muted)]">Net LBP</span>
        <Input name="netLbp" inputMode="decimal" defaultValue={slip ? String(slip.netLbp / 100) : ""} placeholder="0" />
      </label>
      <label className="sm:col-span-2">
        <span className="text-[10px] uppercase text-[color:var(--color-foreground-muted)]">Net USD</span>
        <Input name="netUsd" inputMode="decimal" defaultValue={slip && slip.netUsd ? String(slip.netUsd / 100) : ""} placeholder="0" />
      </label>
      <input type="hidden" name="salaryDate" value={slip?.salaryDate ?? ""} />
      <label className="inline-flex items-center gap-1.5 text-xs sm:col-span-2">
        <input type="checkbox" name="paid" defaultChecked={slip?.paid ?? false} /> Payé
      </label>
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-12">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : slip ? "Enregistrer" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}

function DeleteSlipButton({ id, employeeId }: { id: string; employeeId: string }) {
  const [pending, start] = useTransition();
  return (
    <form action={() => start(async () => { await deletePayslip(id, employeeId); })}>
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
