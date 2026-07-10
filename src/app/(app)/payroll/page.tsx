import Link from "next/link";
import { Search, Users, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const MONTHS_FR = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; scope?: string }>;
}) {
  const { view, q, scope } = await searchParams;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const query = (q ?? "").trim();
    const activeOnly = scope !== "all";
    const isMonths = view === "months";

    const employees = await db.payrollEmployee.findMany({
      orderBy: [{ active: "desc" }, { displayName: "asc" }],
    });
    const payslips = await db.payslip.findMany({
      select: { employeeId: true, year: true, month: true, netLbpCents: true, netUsdCents: true },
    });

    const totalCount = employees.length;
    const activeCount = employees.filter((e) => e.active).length;

    // Per-employee latest net (max year, month).
    const latestByEmp = new Map<string, { year: number; month: number; net: bigint }>();
    for (const s of payslips) {
      const cur = latestByEmp.get(s.employeeId);
      if (!cur || s.year > cur.year || (s.year === cur.year && s.month > cur.month))
        latestByEmp.set(s.employeeId, { year: s.year, month: s.month, net: s.netLbpCents });
    }

    // Monthly totals.
    const byMonth = new Map<string, { year: number; month: number; n: number; lbp: number; usd: number }>();
    for (const s of payslips) {
      const k = `${s.year}-${String(s.month).padStart(2, "0")}`;
      const m = byMonth.get(k) ?? { year: s.year, month: s.month, n: 0, lbp: 0, usd: 0 };
      m.n++;
      m.lbp += Number(s.netLbpCents);
      m.usd += Number(s.netUsdCents);
      byMonth.set(k, m);
    }
    const months = [...byMonth.values()].sort((a, b) => b.year - a.year || b.month - a.month);
    const latest = months[0];
    const years = [...new Set(payslips.map((s) => s.year))].sort();
    const periodLabel = years.length ? `${years[0]}–${years[years.length - 1]}` : "—";

    const filteredEmployees = employees.filter(
      (e) =>
        (!activeOnly || e.active) &&
        (!query || e.displayName.toLowerCase().includes(query.toLowerCase())),
    );

    return (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <PageHeader title="Paie" description="Personnel & masse salariale (données Dars, lecture seule)" />

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Employés actifs" value={`${activeCount}`} sub={`sur ${totalCount} au total`} icon={<Users className="size-4" />} />
          <Stat label="Bulletins de paie" value={payslips.length.toLocaleString("fr-FR")} sub={`période ${periodLabel}`} icon={<CalendarClock className="size-4" />} />
          <Stat
            label={latest ? `Masse salariale ${MONTHS_FR[latest.month]} ${latest.year}` : "Masse salariale"}
            value={latest ? formatMoney(BigInt(Math.round(latest.lbp)), "LBP") : "—"}
            sub={latest ? `${latest.n} bulletins` : ""}
            icon={<CalendarClock className="size-4" />}
          />
        </div>

        <div className="inline-flex rounded-md border border-[color:var(--color-border-subtle)] p-0.5">
          <Tab active={!isMonths} href={hrefWith({ view: "employees", q: query, scope })} label="Employés" />
          <Tab active={isMonths} href={hrefWith({ view: "months" })} label="Masse salariale" />
        </div>

        {isMonths ? (
          <Table>
            <THead>
              <tr>
                <TH>Période</TH>
                <TH className="text-end">Bulletins</TH>
                <TH className="text-end">Net LBP</TH>
                <TH className="text-end">Net USD</TH>
              </tr>
            </THead>
            <tbody>
              {months.length === 0 ? (
                <EmptyRow colSpan={4}>Aucune donnée de paie.</EmptyRow>
              ) : (
                months.map((m) => (
                  <TR key={`${m.year}-${m.month}`}>
                    <TD className="font-medium">{MONTHS_FR[m.month]} {m.year}</TD>
                    <TD className="text-end tabular-nums text-[color:var(--color-foreground-muted)]">{m.n}</TD>
                    <TD className="text-end tabular-nums">{formatMoney(BigInt(Math.round(m.lbp)), "LBP")}</TD>
                    <TD className="text-end tabular-nums text-[color:var(--color-foreground-muted)]">
                      {m.usd > 0 ? formatMoney(BigInt(Math.round(m.usd)), "USD") : "—"}
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <form className="relative min-w-0 flex-1" action="/payroll">
                <input type="hidden" name="view" value="employees" />
                {scope ? <input type="hidden" name="scope" value={scope} /> : null}
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-foreground-subtle)]" aria-hidden />
                <Input type="search" name="q" defaultValue={query} placeholder="Rechercher un employé…" className="ps-9" />
              </form>
              <div className="inline-flex rounded-md border border-[color:var(--color-border-subtle)] p-0.5">
                <Tab active={activeOnly} href={hrefWith({ view: "employees", q: query })} label="Actifs" />
                <Tab active={!activeOnly} href={hrefWith({ view: "employees", q: query, scope: "all" })} label="Tous" />
              </div>
            </div>
            <p className="text-xs text-[color:var(--color-foreground-muted)]">
              <span className="font-medium text-[color:var(--color-foreground)]">{filteredEmployees.length}</span> employés
            </p>
            <Table>
              <THead>
                <tr>
                  <TH>Nom</TH>
                  <TH>Poste</TH>
                  <TH>Type</TH>
                  <TH>Recruté</TH>
                  <TH className="text-end">Dernier net</TH>
                  <TH>Statut</TH>
                </tr>
              </THead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <EmptyRow colSpan={6}>Aucun employé.</EmptyRow>
                ) : (
                  filteredEmployees.map((e) => {
                    const last = latestByEmp.get(e.id);
                    return (
                      <TR key={e.id}>
                        <TD className="font-medium">{e.displayName}</TD>
                        <TD className="text-[color:var(--color-foreground-muted)]">{e.jobTitle || "—"}</TD>
                        <TD className="text-[color:var(--color-foreground-muted)]">{e.employmentType || "—"}</TD>
                        <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                          {e.recruitedAt ? e.recruitedAt.toISOString().slice(0, 7) : "—"}
                        </TD>
                        <TD className="text-end tabular-nums">
                          {last ? formatMoney(last.net, "LBP") : "—"}
                        </TD>
                        <TD>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                              e.active
                                ? "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]"
                                : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-subtle)]",
                            )}
                          >
                            {e.active ? "Actif" : "Parti"}
                          </span>
                        </TD>
                      </TR>
                    );
                  })
                )}
              </tbody>
            </Table>
          </>
        )}

        <p className="text-xs text-[color:var(--color-foreground-subtle)]">
          Source : paie Dars (Prs_Employee, Pay_Salary), 2018–2024, en livres libanaises (le montant USD n'est pas
          renseigné). Lecture seule. La LBP ayant fortement varié, les montants mensuels ne sont pas comparables d'une
          année à l'autre.
        </p>
      </main>
    );
  });
}

function hrefWith(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `/payroll?${qs}` : "/payroll";
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">{label}</span>
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]" aria-hidden>
            {icon}
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-[color:var(--color-foreground)]">{value}</p>
        {sub ? <p className="text-xs text-[color:var(--color-foreground-muted)]">{sub}</p> : null}
      </CardBody>
    </Card>
  );
}

function Tab({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded px-3 py-1 text-sm font-medium transition-colors duration-150 ease-out",
        active
          ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)]"
          : "text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
      )}
    >
      {label}
    </Link>
  );
}
