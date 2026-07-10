import Link from "next/link";
import { TrendingUp, TrendingDown, Scale } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const rows = await db.financeSummary.findMany({ orderBy: { fiscalYear: "desc" } });
    const years = [...new Set(rows.map((r) => r.fiscalYear))].sort().reverse();
    const selectedYear = year && years.includes(year) ? year : years[0];

    const yearRows = rows.filter((r) => r.fiscalYear === selectedYear);
    // Currencies present, USD first.
    const currencies = [...new Set(yearRows.map((r) => r.currency))].sort((a, b) =>
      a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b),
    );

    return (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <PageHeader title="Finances" description="Résultat de l'exercice — revenus vs dépenses (grand livre)" />

        {years.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-6 py-12 text-center text-sm text-[color:var(--color-foreground-muted)]">
            Aucune donnée comptable importée.
          </div>
        ) : (
          <>
            {/* Fiscal-year pills */}
            <div className="flex flex-wrap items-center gap-2">
              {years.map((y) => (
                <Link
                  key={y}
                  href={`/finance?year=${y}`}
                  aria-current={y === selectedYear ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
                    y === selectedYear
                      ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)] shadow-card"
                      : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
                  )}
                >
                  {y}
                </Link>
              ))}
            </div>

            {currencies.map((currency) => {
              const income = yearRows
                .filter((r) => r.currency === currency && r.kind === "INCOME")
                .sort((a, b) => Number(b.amountCents) - Number(a.amountCents));
              const expense = yearRows
                .filter((r) => r.currency === currency && r.kind === "EXPENSE")
                .sort((a, b) => Number(b.amountCents) - Number(a.amountCents));
              const totalIncome = income.reduce((s, r) => s + Number(r.amountCents), 0);
              const totalExpense = expense.reduce((s, r) => s + Number(r.amountCents), 0);
              const net = totalIncome - totalExpense;

              return (
                <section key={currency} className="space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                    {currency}
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                      label="Revenus"
                      value={formatMoney(totalIncome, currency)}
                      icon={<TrendingUp className="size-4" />}
                      tone="income"
                    />
                    <StatCard
                      label="Dépenses"
                      value={formatMoney(totalExpense, currency)}
                      icon={<TrendingDown className="size-4" />}
                      tone="expense"
                    />
                    <StatCard
                      label="Résultat"
                      value={formatMoney(net, currency)}
                      icon={<Scale className="size-4" />}
                      tone={net >= 0 ? "income" : "expense"}
                    />
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Breakdown title="Revenus par catégorie" rows={income} currency={currency} total={totalIncome} />
                    <Breakdown title="Dépenses par catégorie" rows={expense} currency={currency} total={totalExpense} />
                  </div>
                </section>
              );
            })}

            <p className="text-xs text-[color:var(--color-foreground-subtle)]">
              Source : grand livre Dars (comptes classe 6 = charges, classe 7 = produits), exercice
              octobre–septembre. Lecture seule. La livre libanaise (LBP) ayant fortement varié, comparez
              les exercices en USD.
            </p>
          </>
        )}
      </main>
    );
  });
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "income" | "expense";
}) {
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
            {label}
          </span>
          <span
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md",
              tone === "income"
                ? "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]"
                : "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
            )}
            aria-hidden
          >
            {icon}
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-[color:var(--color-foreground)]">
          {value}
        </p>
      </CardBody>
    </Card>
  );
}

function Breakdown({
  title,
  rows,
  currency,
  total,
}: {
  title: string;
  rows: { groupNo: string; label: string; amountCents: bigint }[];
  currency: string;
  total: number;
}) {
  return (
    <Card>
      <CardBody>
        <h3 className="mb-3 text-sm font-semibold text-[color:var(--color-foreground)]">{title}</h3>
        <Table>
          <THead>
            <tr>
              <TH>Catégorie</TH>
              <TH className="text-end">Montant</TH>
              <TH className="text-end">%</TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={3}>—</EmptyRow>
            ) : (
              rows.map((r) => {
                const amt = Number(r.amountCents);
                const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
                return (
                  <TR key={r.groupNo}>
                    <TD className="font-medium">
                      <span className="text-[color:var(--color-foreground-subtle)]">{r.groupNo}</span> {r.label}
                    </TD>
                    <TD className="text-end tabular-nums">{formatMoney(r.amountCents, currency)}</TD>
                    <TD className="text-end tabular-nums text-[color:var(--color-foreground-muted)]">{pct}%</TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </Table>
      </CardBody>
    </Card>
  );
}
