import Link from "next/link";
import { TrendingUp, TrendingDown, Scale, Receipt, Info, Wallet } from "lucide-react";
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
    const glYears = new Set(rows.map((r) => r.fiscalYear));
    const glIncomeYears = new Set(rows.filter((r) => r.kind === "INCOME").map((r) => r.fiscalYear));

    // Years with invoices but no revenue in the general ledger (2022-2023: crisis-year
    // revaluation entries net every account to zero; 2021-2022: expense-only ledger) —
    // supplemented from Billing, revenue-only, clearly labeled.
    const [invoiceAgg, academicYears] = await Promise.all([
      db.invoice.groupBy({
        by: ["academicYearId", "currency"],
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      db.academicYear.findMany({ select: { id: true, label: true } }),
    ]);
    const labelById = new Map(academicYears.map((y) => [y.id, y.label]));
    const billingByYear = new Map<string, { currency: string; billedCents: number; invoices: number }[]>();
    for (const g of invoiceAgg) {
      const label = labelById.get(g.academicYearId);
      if (!label || glIncomeYears.has(label)) continue;
      const list = billingByYear.get(label) ?? [];
      list.push({
        currency: g.currency,
        billedCents: Number(g._sum.totalCents ?? 0),
        invoices: g._count._all,
      });
      billingByYear.set(label, list);
    }

    const years = [...new Set([...glYears, ...billingByYear.keys()])].sort().reverse();
    const selectedYear = (year && years.includes(year) ? year : years[0]) ?? "";
    const billingRows = billingByYear.get(selectedYear);

    const yearRows = rows.filter((r) => r.fiscalYear === selectedYear);
    // groupNo "MS" = salary PAYMENTS (comptes 4211/4515) for years where payroll never
    // reached class 6 — kept out of the GL categories and rendered in their own section.
    const msRows = yearRows.filter((r) => r.groupNo === "MS");
    const glRows = yearRows.filter((r) => r.groupNo !== "MS");
    // Currencies present in the GL, USD first.
    const currencies = [...new Set(glRows.map((r) => r.currency))].sort((a, b) =>
      a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b),
    );
    const msItems = msRows
      .map((m) => {
        const sum = (kind: string) =>
          glRows
            .filter((r) => r.currency === m.currency && r.kind === kind)
            .reduce((s, r) => s + Number(r.amountCents), 0);
        return {
          currency: m.currency,
          paymentsCents: Number(m.amountCents),
          glNetCents: currencies.includes(m.currency) ? sum("INCOME") - sum("EXPENSE") : null,
        };
      })
      .sort((a, b) =>
        a.currency === "USD" ? -1 : b.currency === "USD" ? 1 : a.currency.localeCompare(b.currency),
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
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
                    y === selectedYear
                      ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)] shadow-card"
                      : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
                  )}
                >
                  {y}
                  {billingByYear.has(y) ? <Receipt className="size-3 opacity-70" aria-label="Source : facturation" /> : null}
                </Link>
              ))}
            </div>

            {billingRows ? (
              <BillingYearSection year={selectedYear} rows={billingRows} hasGlSections={currencies.length > 0} />
            ) : null}

            {currencies.map((currency) => {
              const income = glRows
                .filter((r) => r.currency === currency && r.kind === "INCOME")
                .sort((a, b) => Number(b.amountCents) - Number(a.amountCents));
              const expense = glRows
                .filter((r) => r.currency === currency && r.kind === "EXPENSE")
                .sort((a, b) => Number(b.amountCents) - Number(a.amountCents));
              const hasMs = msRows.some((r) => r.currency === currency);
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
                      sub={hasMs ? "hors masse salariale non comptabilisée — voir plus bas" : undefined}
                    />
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Breakdown title="Revenus par catégorie" rows={income} currency={currency} total={totalIncome} />
                    <Breakdown title="Dépenses par catégorie" rows={expense} currency={currency} total={totalExpense} />
                  </div>
                </section>
              );
            })}

            {msItems.length > 0 ? <SalarySection items={msItems} /> : null}

            {currencies.length > 0 ? (
              <p className="text-xs text-[color:var(--color-foreground-subtle)]">
                Source : grand livre Dars (comptes classe 6 = charges, classe 7 = produits), exercice
                octobre–septembre. Lecture seule. La livre libanaise (LBP) ayant fortement varié, comparez
                les exercices en USD.
              </p>
            ) : null}
          </>
        )}
      </main>
    );
  });
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
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
        {sub ? <p className="text-xs text-[color:var(--color-foreground-muted)]">{sub}</p> : null}
      </CardBody>
    </Card>
  );
}

function SalarySection({
  items,
}: {
  items: { currency: string; paymentsCents: number; glNetCents: number | null }[];
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
        Masse salariale
      </h2>
      <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-[color:var(--color-foreground-muted)]" aria-hidden />
        <p className="text-sm text-[color:var(--color-foreground-muted)]">
          Depuis octobre 2024, les salaires ne sont plus comptabilisés en charges (classe 6) dans
          Dars — le résultat du grand livre ci-dessus les ignore. Les montants ci-dessous sont les
          paiements tracés sur les comptes du personnel (4211 « Rémunérations dues au Personnel »
          et 4515) ; la masse salariale réelle peut être supérieure si d&apos;autres canaux de
          paiement existent.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.currency} className="contents">
            <StatCard
              label={`Paiements salaires — ${it.currency}`}
              value={formatMoney(it.paymentsCents, it.currency)}
              sub="comptes 4211 / 4515 — hors grand livre"
              icon={<Wallet className="size-4" />}
              tone="expense"
            />
            {it.glNetCents != null ? (
              <StatCard
                label={`Résultat après masse salariale — ${it.currency}`}
                value={formatMoney(it.glNetCents - it.paymentsCents, it.currency)}
                sub="résultat du grand livre − paiements salaires"
                icon={<Scale className="size-4" />}
                tone={it.glNetCents - it.paymentsCents >= 0 ? "income" : "expense"}
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function BillingYearSection({
  year,
  rows,
  hasGlSections,
}: {
  year: string;
  rows: { currency: string; billedCents: number; invoices: number }[];
  hasGlSections: boolean;
}) {
  const sorted = [...rows].sort((a, b) =>
    a.currency === "USD" ? -1 : b.currency === "USD" ? 1 : a.currency.localeCompare(b.currency),
  );
  const billingLink = (
    <Link href="/billing" className="text-[color:var(--color-brand-600)] hover:underline">
      facturation
    </Link>
  );
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-[color:var(--color-foreground-muted)]" aria-hidden />
        {hasGlSections ? (
          <p className="text-sm text-[color:var(--color-foreground-muted)]">
            Le grand livre ne contient aucun revenu pour l&apos;exercice {year}. Les revenus facturés
            ci-dessous proviennent de la {billingLink} ; les dépenses affichées plus bas restent
            celles du grand livre.
          </p>
        ) : (
          <p className="text-sm text-[color:var(--color-foreground-muted)]">
            Le grand livre ne dégage aucun résultat pour l&apos;exercice {year} (années de crise —
            écritures de réévaluation qui s&apos;annulent). Les chiffres ci-dessous proviennent de la{" "}
            {billingLink} : revenus facturés uniquement, sans les dépenses.
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {sorted.map((r) => (
          <StatCard
            key={r.currency}
            label={`Revenus facturés — ${r.currency}`}
            value={formatMoney(r.billedCents, r.currency)}
            sub={`${r.invoices.toLocaleString("fr-FR")} factures`}
            icon={<Receipt className="size-4" />}
            tone="income"
          />
        ))}
      </div>
      <p className="text-xs text-[color:var(--color-foreground-subtle)]">
        Source : factures importées de Dars (Fct_Factures_Entete). Montants facturés par devise, non
        additionnables entre devises.
      </p>
    </section>
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
