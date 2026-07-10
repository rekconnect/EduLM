import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

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

const STATUS_KEY: Record<string, string> = {
  DRAFT: "statusDraft",
  ISSUED: "statusIssued",
  PARTIALLY_PAID: "statusPartial",
  PAID: "statusPaid",
  CANCELLED: "statusCancelled",
  OVERDUE: "statusOverdue",
};

export default async function ParentChildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return withParentSession(async (user, childIds) => {
    if (!childIds.includes(id)) notFound();

    const tParent = await getTranslations("parent");
    const tBill = await getTranslations("billing");

    const [child, invoices] = await Promise.all([
      db.student.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          // Pull both the active-year enrollment AND the upcoming one so a
          // newly-accepted student (enrolled in next year but no current year)
          // still shows their class on the dashboard.
          enrollments: {
            orderBy: { academicYear: { startDate: "desc" } },
            select: {
              class: { select: { name: true } },
              academicYear: {
                select: { label: true, isActive: true, startDate: true },
              },
            },
            take: 3,
          },
        },
      }),
      db.invoice.findMany({
        where: { studentId: id },
        orderBy: { issuedAt: "desc" },
        include: { payments: { select: { amountCents: true } } },
      }),
    ]);

    if (!child) notFound();

    // Prefer the active year, fall back to the most recent upcoming year.
    const activeEnrollment = child.enrollments.find(
      (e) => e.academicYear.isActive,
    );
    const upcomingEnrollment = child.enrollments.find(
      (e) => !e.academicYear.isActive && e.academicYear.startDate > new Date(),
    );
    const enrollment = activeEnrollment ?? upcomingEnrollment;
    const isUpcoming = !activeEnrollment && !!upcomingEnrollment;

    const description = enrollment
      ? `${enrollment.class.name} · ${enrollment.academicYear.label}`
      : "—";

    return (
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={`${child.firstName} ${child.lastName}`}
            description={description}
            action={
              <Link
                href="/parent/dashboard"
                className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                {tParent("dashboardTitle")}
              </Link>
            }
          />

          {isUpcoming ? (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)] px-4 py-3 text-sm text-[color:var(--color-brand-700)]">
              <CalendarClock
                className="mt-0.5 size-4 shrink-0"
                aria-hidden
              />
              <p>
                <span className="font-medium">
                  {child.firstName} {child.lastName}
                </span>{" "}
                est inscrit·e en{" "}
                <span className="font-semibold">
                  {enrollment!.class.name}
                </span>{" "}
                pour {enrollment!.academicYear.label} — les informations
                et factures apparaîtront ici dès la rentrée.
              </p>
            </div>
          ) : null}

          <Card>
            <CardHeader title={tParent("tabInvoices")} />
            <Table>
              <THead>
                <tr>
                  <TH>{tBill("colNumber")}</TH>
                  <TH>{tBill("colIssued")}</TH>
                  <TH className="text-end">{tBill("colTotal")}</TH>
                  <TH className="text-end">{tBill("colBalance")}</TH>
                  <TH>{tBill("colStatus")}</TH>
                </tr>
              </THead>
              <tbody>
                {invoices.length === 0 ? (
                  <EmptyRow colSpan={5}>{tBill("empty")}</EmptyRow>
                ) : (
                  invoices.map((inv) => {
                    const paid = inv.payments.reduce(
                      (a, p) => a + Number(p.amountCents),
                      0,
                    );
                    const balance = Number(inv.totalCents) - paid;
                    return (
                      <TR key={inv.id}>
                        <TD className="font-mono text-xs text-[color:var(--color-foreground)]">
                          {inv.number}
                        </TD>
                        <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                          {inv.issuedAt.toISOString().slice(0, 10)}
                        </TD>
                        <TD className="text-end tabular-nums text-[color:var(--color-foreground)]">
                          {formatMoney(inv.totalCents, inv.currency)}
                        </TD>
                        <TD className="text-end tabular-nums">
                          {balance > 0 ? (
                            <span className="font-medium text-[color:var(--color-foreground)]">
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
                            {tBill(STATUS_KEY[inv.status] ?? "statusDraft")}
                          </span>
                        </TD>
                      </TR>
                    );
                  })
                )}
              </tbody>
            </Table>
          </Card>
        </main>
    );
  });
}
