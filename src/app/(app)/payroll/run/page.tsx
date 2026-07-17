import Link from "next/link";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { formatMoney } from "@/lib/money";
import { computeMonthlyPayslips } from "@/lib/payroll-run";
import { GenerateButton, PublishToggle } from "./_controls";

const MONTHS_FR = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default async function PayrollRunPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  const now = new Date();
  const year = Number(sp.year) || now.getUTCFullYear();
  const month = Number(sp.month) || now.getUTCMonth() + 1;
  const years = Array.from({ length: 9 }, (_, i) => now.getUTCFullYear() + 1 - i);

  return runWithTenant({ tenantId, slug: null }, async () => {
    const [rows, saved] = await Promise.all([
      computeMonthlyPayslips(year, month),
      db.payslip.findMany({
        where: { year, month, generatedAt: { not: null } },
        select: { employeeId: true, publishedAt: true },
      }),
    ]);
    const savedIds = new Set(saved.map((s) => s.employeeId));
    const published = saved.length > 0 && saved.every((s) => s.publishedAt != null);
    const totalUsd = rows.reduce((s, r) => s + r.netUsdCents, 0);
    const totalLbp = rows.reduce((s, r) => s + r.netLbpCents, 0);

    return (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <PageHeader
          title="Générer la paie"
          description="Calcul mensuel — jours travaillés, NSF/impôt, transport"
          action={
            <Link href="/payroll" className="text-sm text-[color:var(--color-brand-600)] hover:underline">
              ← Personnel
            </Link>
          }
        />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <form action="/payroll/run" method="get" className="flex items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-[10px] uppercase text-[color:var(--color-foreground-muted)]">Mois</span>
              <select name="month" defaultValue={month} className="h-9 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-2 text-sm">
                {MONTHS_FR.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[10px] uppercase text-[color:var(--color-foreground-muted)]">Année</span>
              <select name="year" defaultValue={year} className="h-9 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-2 text-sm">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <button type="submit" className="h-9 rounded-md border border-[color:var(--color-border-subtle)] px-3 text-sm font-medium transition-colors hover:bg-[color:var(--color-surface-hover)]">
              Voir
            </button>
          </form>
          <div className="flex items-center gap-2">
            {savedIds.size > 0 ? <PublishToggle year={year} month={month} published={published} /> : null}
            <GenerateButton year={year} month={month} hasData={savedIds.size > 0} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Employés" value={String(rows.length)} />
          <Stat label={`Masse nette USD — ${MONTHS_FR[month]}`} value={formatMoney(totalUsd, "USD")} />
          <Stat label="Masse nette LBP" value={formatMoney(totalLbp, "LBP")} />
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-[color:var(--color-foreground-muted)]" aria-hidden />
          <p className="text-sm text-[color:var(--color-foreground-muted)]">
            Aperçu calculé en direct avec les règles actuelles. « Générer » enregistre les bulletins du mois ;
            « Publier » les rend visibles au personnel. {savedIds.size > 0 ? `${savedIds.size} bulletin(s) enregistré(s)${published ? " · publiés" : " · non publiés"}.` : "Aucun bulletin encore enregistré pour ce mois."}
          </p>
        </div>

        <Table>
          <THead>
            <tr>
              <TH>Employé</TH>
              <TH>Catégorie</TH>
              <TH className="text-end">Jours</TH>
              <TH className="text-end">Net USD</TH>
              <TH className="text-end">Net LBP</TH>
              <TH>État</TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>Aucun employé actif.</EmptyRow>
            ) : (
              rows.map((r) => (
                <TR key={r.employeeId}>
                  <TD className="font-medium">
                    <Link href={`/payroll/employees/${r.employeeId}`} className="hover:text-[color:var(--color-brand-600)] hover:underline">
                      {r.displayName}
                    </Link>
                  </TD>
                  <TD className="text-[color:var(--color-foreground-muted)]">{r.taxCategory || "—"}</TD>
                  <TD className="text-end tabular-nums">
                    <span title={`${r.breakdown.workingDaysInMonth} ouvrés − ${r.breakdown.absenceDays} abs. + ${r.breakdown.permanenceDays} perm.`}>
                      {r.daysWorked}
                      {r.breakdown.daysSource === "override" ? <span className="text-[color:var(--color-foreground-subtle)]"> *</span> : null}
                    </span>
                  </TD>
                  <TD className="text-end tabular-nums">{r.netUsdCents ? formatMoney(r.netUsdCents, "USD") : "—"}</TD>
                  <TD className="text-end tabular-nums text-[color:var(--color-foreground-muted)]">{r.netLbpCents ? formatMoney(r.netLbpCents, "LBP") : "—"}</TD>
                  <TD>
                    {savedIds.has(r.employeeId) ? (
                      <span className="text-xs text-[color:var(--color-success-soft-fg)]">{published ? "Publié" : "Enregistré"}</span>
                    ) : (
                      <span className="text-xs text-[color:var(--color-foreground-subtle)]">Aperçu</span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
        <p className="text-xs text-[color:var(--color-foreground-subtle)]">* jours fixés manuellement sur la fiche employé.</p>
      </main>
    );
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">{label}</span>
        <p className="text-xl font-semibold tabular-nums text-[color:var(--color-foreground)]">{value}</p>
      </CardBody>
    </Card>
  );
}
