import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Receipt } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type InvoiceRow = Prisma.InvoiceGetPayload<{
  include: {
    student: { select: { id: true; firstName: true; lastName: true } };
    payments: { select: { amountCents: true } };
  };
}>;

const STATUS_KEY: Record<string, string> = {
  DRAFT: "statusDraft",
  ISSUED: "statusIssued",
  PARTIALLY_PAID: "statusPartial",
  PAID: "statusPaid",
  CANCELLED: "statusCancelled",
  OVERDUE: "statusOverdue",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  ISSUED:
    "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  PARTIALLY_PAID:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  PAID:
    "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  CANCELLED:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-subtle)]",
  OVERDUE:
    "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger-soft-fg)]",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("billing");

    const allowedStatuses: InvoiceStatus[] = [
      "DRAFT",
      "ISSUED",
      "PARTIALLY_PAID",
      "PAID",
      "CANCELLED",
      "OVERDUE",
    ];
    const filter =
      status && (allowedStatuses as string[]).includes(status)
        ? { status: status as InvoiceStatus }
        : undefined;

    const invoices = (await db.invoice.findMany({
      where: filter,
      orderBy: { issuedAt: "desc" },
      take: 100,
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        payments: { select: { amountCents: true } },
      },
    })) as InvoiceRow[];

    return (
        <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
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

          {/* Status filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              active={!status}
              href="/billing"
              label={t("filterAll")}
            />
            {allowedStatuses.map((s) => (
              <StatusPill
                key={s}
                active={status === s}
                href={`/billing?status=${s}`}
                label={t(STATUS_KEY[s] ?? "statusDraft")}
                tone={STATUS_TONE[s]}
              />
            ))}
          </div>

          {invoices.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Receipt className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("empty")}
              </p>
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t("colNumber")}</TH>
                  <TH>{t("colStudent")}</TH>
                  <TH>{t("colIssued")}</TH>
                  <TH>{t("colDue")}</TH>
                  <TH className="text-end">{t("colTotal")}</TH>
                  <TH className="text-end">{t("colBalance")}</TH>
                  <TH>{t("colStatus")}</TH>
                </tr>
              </THead>
              <tbody>
                {invoices.map((inv) => {
                  const paid = inv.payments.reduce(
                    (a, p) => a + p.amountCents,
                    0,
                  );
                  const balance = inv.totalCents - paid;
                  const isOverdue = inv.status === "OVERDUE";
                  return (
                    <TR key={inv.id}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/billing/${inv.id}`}
                          className="text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                        >
                          {inv.number}
                        </Link>
                      </TD>
                      <TD>
                        <Link
                          href={`/students/${inv.student.id}`}
                          className="text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                        >
                          {inv.student.lastName} {inv.student.firstName}
                        </Link>
                      </TD>
                      <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                        {inv.issuedAt.toISOString().slice(0, 10)}
                      </TD>
                      <TD
                        className={cn(
                          "tabular-nums",
                          isOverdue
                            ? "font-medium text-[color:var(--color-danger)]"
                            : "text-[color:var(--color-foreground-muted)]",
                        )}
                      >
                        {inv.dueAt ? inv.dueAt.toISOString().slice(0, 10) : "—"}
                      </TD>
                      <TD className="text-end tabular-nums text-[color:var(--color-foreground)]">
                        {formatMoney(inv.totalCents, inv.currency)}
                      </TD>
                      <TD className="text-end tabular-nums">
                        {balance > 0 ? (
                          <span
                            className={cn(
                              "font-semibold",
                              isOverdue
                                ? "text-[color:var(--color-danger)]"
                                : "text-[color:var(--color-foreground)]",
                            )}
                          >
                            {formatMoney(balance, inv.currency)}
                          </span>
                        ) : (
                          <span className="text-[color:var(--color-success)]">
                            ✓
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_TONE[inv.status],
                          )}
                        >
                          {t(STATUS_KEY[inv.status] ?? "statusDraft")}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </main>
    );
  });
}

function StatusPill({
  active,
  href,
  label,
  tone,
}: {
  active: boolean;
  href: string;
  label: string;
  tone?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
        active
          ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)] shadow-card"
          : tone ??
              "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]",
      )}
    >
      {label}
    </Link>
  );
}
