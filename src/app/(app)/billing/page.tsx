import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Receipt, Users, Search } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { YearPicker } from "@/components/shell/year-picker";

const STATUS_KEY: Record<string, string> = {
  DRAFT: "statusDraft",
  ISSUED: "statusIssued",
  PARTIALLY_PAID: "statusPartial",
  PAID: "statusPaid",
  CANCELLED: "statusCancelled",
  OVERDUE: "statusOverdue",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  ISSUED: "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  PARTIALLY_PAID: "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  PAID: "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  CANCELLED: "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-subtle)]",
  OVERDUE: "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger-soft-fg)]",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string; q?: string; yearId?: string; student?: string }>;
}) {
  const { status, view, q, yearId, student } = await searchParams;
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("billing");
    const query = (q ?? "").trim();

    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, label: true, isActive: true },
    });
    const activeYear = years.find((y) => y.isActive) ?? years[0];
    const selectedYearId =
      yearId && years.some((y) => y.id === yearId) ? yearId : activeYear?.id;
    const selectedYear = years.find((y) => y.id === selectedYearId);

    // Invoice view when ?view=invoices or a specific student is drilled into.
    const isFamilies = view !== "invoices" && !student;

    // Match on ANY family member — invoices are attached to the eldest child, so
    // searching a younger sibling's name must still surface the family.
    const nameFilter: Prisma.InvoiceWhereInput = query
      ? {
          student: {
            family: {
              students: {
                some: {
                  OR: [
                    { firstName: { contains: query, mode: "insensitive" } },
                    { lastName: { contains: query, mode: "insensitive" } },
                  ],
                },
              },
            },
          },
        }
      : {};

    // Shared header (title + toggle + search + year).
    const header = (
      <>
        <PageHeader
          title={t("title")}
          description={t("subtitle")}
          action={
            user.role === "SCHOOL_ADMIN" ? (
              <LinkButton href="/billing/new" size="sm" className="gap-1.5">
                <Plus className="size-4" aria-hidden />
                {t("createCta")}
              </LinkButton>
            ) : undefined
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-[color:var(--color-border-subtle)] p-0.5">
            <ViewTab active={isFamilies} href={hrefWith({ view: "families", yearId: selectedYearId, q: query })} icon={<Users className="size-3.5" aria-hidden />} label="Familles" />
            <ViewTab active={!isFamilies} href={hrefWith({ view: "invoices", yearId: selectedYearId, q: query })} icon={<Receipt className="size-3.5" aria-hidden />} label="Factures" />
          </div>
          <form className="relative min-w-0 flex-1" action="/billing">
            <input type="hidden" name="view" value={isFamilies ? "families" : "invoices"} />
            {selectedYearId ? <input type="hidden" name="yearId" value={selectedYearId} /> : null}
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-foreground-subtle)]" aria-hidden />
            <Input type="search" name="q" defaultValue={query} placeholder="Rechercher un élève…" className="ps-9" />
          </form>
          <YearPicker years={years} selectedId={selectedYearId ?? ""} />
        </div>
      </>
    );

    // ─────────────────────────── FAMILIES VIEW ───────────────────────────
    if (isFamilies) {
      const invs = await db.invoice.findMany({
        where: { academicYearId: selectedYearId, ...nameFilter },
        select: {
          currency: true,
          totalCents: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          payments: { select: { amountCents: true } },
        },
      });
      type Agg = {
        student: { id: string; firstName: string; lastName: string };
        cur: Map<string, { billed: number; paid: number }>;
        count: number;
      };
      const byStudent = new Map<string, Agg>();
      for (const iv of invs) {
        let a = byStudent.get(iv.student.id);
        if (!a) {
          a = { student: iv.student, cur: new Map(), count: 0 };
          byStudent.set(iv.student.id, a);
        }
        a.count++;
        const c = a.cur.get(iv.currency) ?? { billed: 0, paid: 0 };
        c.billed += Number(iv.totalCents);
        c.paid += iv.payments.reduce((s, p) => s + Number(p.amountCents), 0);
        a.cur.set(iv.currency, c);
      }
      const families = [...byStudent.values()]
        .map((a) => {
          const currencies = [...a.cur.entries()]
            .map(([currency, v]) => ({ currency, outstanding: v.billed - v.paid }))
            .sort((x, y) => x.currency.localeCompare(y.currency));
          const owes = currencies.some((c) => c.outstanding > 50);
          return { student: a.student, currencies, count: a.count, owes };
        })
        .sort((a, b) => {
          if (a.owes !== b.owes) return a.owes ? -1 : 1;
          return `${a.student.lastName} ${a.student.firstName}`.localeCompare(
            `${b.student.lastName} ${b.student.firstName}`,
          );
        });
      const owingCount = families.filter((f) => f.owes).length;

      return (
        <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
          {header}
          <p className="text-xs text-[color:var(--color-foreground-muted)]">
            <span className="font-medium text-[color:var(--color-foreground)]">{families.length}</span>{" "}
            familles · {selectedYear?.label ?? ""}
            {owingCount > 0 ? ` · ${owingCount} avec solde dû` : " · toutes à jour"}
          </p>
          <Table>
            <THead>
              <tr>
                <TH>Famille</TH>
                <TH className="text-end">Factures</TH>
                <TH className="text-end">Solde dû</TH>
                <TH className="text-end" />
              </tr>
            </THead>
            <tbody>
              {families.length === 0 ? (
                <EmptyRow colSpan={4}>Aucune facture pour cette année.</EmptyRow>
              ) : (
                families.map((f) => (
                  <TR key={f.student.id}>
                    <TD className="font-medium">
                      <Link
                        href={hrefWith({ view: "invoices", student: f.student.id, yearId: selectedYearId })}
                        className="text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                      >
                        {f.student.lastName} {f.student.firstName}
                      </Link>
                    </TD>
                    <TD className="text-end tabular-nums text-[color:var(--color-foreground-muted)]">{f.count}</TD>
                    <TD className="text-end tabular-nums">
                      {f.owes ? (
                        <div className="flex flex-col items-end gap-0.5">
                          {f.currencies
                            .filter((c) => c.outstanding > 50)
                            .map((c) => (
                              <span key={c.currency} className="font-semibold text-[color:var(--color-foreground)]">
                                {formatMoney(c.outstanding, c.currency)}
                              </span>
                            ))}
                        </div>
                      ) : (
                        <span className="text-[color:var(--color-success)]">✓ à jour</span>
                      )}
                    </TD>
                    <TD className="text-end">
                      <Link
                        href={hrefWith({ view: "invoices", student: f.student.id, yearId: selectedYearId })}
                        className="text-xs text-[color:var(--color-brand-600)] hover:underline"
                      >
                        Voir →
                      </Link>
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </main>
      );
    }

    // ─────────────────────────── INVOICES VIEW ───────────────────────────
    const allowedStatuses: InvoiceStatus[] = [
      "DRAFT",
      "ISSUED",
      "PARTIALLY_PAID",
      "PAID",
      "CANCELLED",
      "OVERDUE",
    ];
    const statusFilter =
      status && (allowedStatuses as string[]).includes(status)
        ? { status: status as InvoiceStatus }
        : {};

    const drilled = student
      ? await db.student.findFirst({ where: { id: student }, select: { firstName: true, lastName: true } })
      : null;

    const invoices = await db.invoice.findMany({
      where: {
        academicYearId: selectedYearId,
        studentId: student || undefined,
        ...statusFilter,
        ...nameFilter,
      },
      orderBy: { issuedAt: "desc" },
      take: 300,
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        payments: { select: { amountCents: true } },
      },
    });

    return (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        {header}
        {drilled ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-[color:var(--color-brand-50)] px-2.5 py-1 font-medium text-[color:var(--color-brand-700)]">
              Famille {drilled.lastName} {drilled.firstName}
            </span>
            <Link href={hrefWith({ view: "families", yearId: selectedYearId, q: query })} className="text-xs text-[color:var(--color-brand-600)] hover:underline">
              ← toutes les familles
            </Link>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill active={!status} href={hrefWith({ view: "invoices", student, yearId: selectedYearId, q: query })} label={t("filterAll")} />
          {allowedStatuses.map((s) => (
            <StatusPill
              key={s}
              active={status === s}
              href={hrefWith({ view: "invoices", student, yearId: selectedYearId, q: query, status: s })}
              label={t(STATUS_KEY[s] ?? "statusDraft")}
              tone={STATUS_TONE[s]}
            />
          ))}
        </div>
        <Table>
          <THead>
            <tr>
              <TH>{t("colNumber")}</TH>
              <TH>{t("colStudent")}</TH>
              <TH>{t("colIssued")}</TH>
              <TH className="text-end">{t("colTotal")}</TH>
              <TH className="text-end">{t("colBalance")}</TH>
              <TH>{t("colStatus")}</TH>
            </tr>
          </THead>
          <tbody>
            {invoices.length === 0 ? (
              <EmptyRow colSpan={6}>{t("empty")}</EmptyRow>
            ) : (
              invoices.map((inv) => {
                const paid = inv.payments.reduce((a, p) => a + Number(p.amountCents), 0);
                const balance = Number(inv.totalCents) - paid;
                return (
                  <TR key={inv.id}>
                    <TD className="font-mono text-xs">
                      <Link href={`/billing/${inv.id}`} className="text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline">
                        {inv.number}
                      </Link>
                    </TD>
                    <TD>
                      <Link href={hrefWith({ view: "invoices", student: inv.student.id, yearId: selectedYearId })} className="text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline">
                        {inv.student.lastName} {inv.student.firstName}
                      </Link>
                    </TD>
                    <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                      {inv.issuedAt.toISOString().slice(0, 10)}
                    </TD>
                    <TD className="text-end tabular-nums text-[color:var(--color-foreground)]">
                      {formatMoney(inv.totalCents, inv.currency)}
                    </TD>
                    <TD className="text-end tabular-nums">
                      {balance > 50 ? (
                        <span className="font-semibold text-[color:var(--color-foreground)]">
                          {formatMoney(balance, inv.currency)}
                        </span>
                      ) : (
                        <span className="text-[color:var(--color-success)]">✓</span>
                      )}
                    </TD>
                    <TD>
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[inv.status])}>
                        {t(STATUS_KEY[inv.status] ?? "statusDraft")}
                      </span>
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </Table>
      </main>
    );
  });
}

function hrefWith(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `/billing?${qs}` : "/billing";
}

function ViewTab({ active, href, icon, label }: { active: boolean; href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors duration-150 ease-out",
        active
          ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)]"
          : "text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function StatusPill({ active, href, label, tone }: { active: boolean; href: string; label: string; tone?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
        active
          ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)] shadow-card"
          : tone ?? "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
      )}
    >
      {label}
    </Link>
  );
}
