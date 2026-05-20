import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const SEVERITY_LABEL: Record<string, string> = {
  NOTE: "severityNote",
  WARNING: "severityWarning",
  DETENTION: "severityDetention",
  SUSPENSION: "severitySuspension",
};

const SEVERITY_TONE: Record<string, string> = {
  NOTE: "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  WARNING:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  DETENTION:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  SUSPENSION:
    "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger-soft-fg)]",
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
    const tAtt = await getTranslations("attendance");
    const tDisc = await getTranslations("discipline");
    const tBill = await getTranslations("billing");

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    since.setUTCHours(0, 0, 0, 0);

    const [child, attendance, discipline, invoices] = await Promise.all([
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
      db.attendanceRecord.findMany({
        where: { studentId: id, date: { gte: since } },
        orderBy: { date: "desc" },
        select: { date: true, status: true, lateMinutes: true, note: true },
      }),
      db.disciplineEvent.findMany({
        where: { studentId: id },
        orderBy: { date: "desc" },
        take: 20,
        select: { id: true, type: true, severity: true, description: true, date: true },
      }),
      db.invoice.findMany({
        where: { studentId: id },
        orderBy: { issuedAt: "desc" },
        include: { payments: { select: { amountCents: true } } },
      }),
    ]);

    if (!child) notFound();

    const counts: Record<string, number> = {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      EXCUSED: 0,
    };
    for (const r of attendance) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }

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
                pour {enrollment!.academicYear.label} — les présences,
                disciplines et factures apparaîtront ici dès la rentrée.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={tAtt("presentCount")} value={counts.PRESENT!} />
            <Stat label={tAtt("absentCount")} value={counts.ABSENT!} />
            <Stat label={tAtt("lateCount")} value={counts.LATE!} />
          </div>

          <Card>
            <CardHeader title={tParent("tabAttendance")} />
            <Table>
              <THead>
                <tr>
                  <TH>{tAtt("colNote")}</TH>
                  <TH>{tAtt("colStatus")}</TH>
                </tr>
              </THead>
              <tbody>
                {attendance.length === 0 ? (
                  <EmptyRow colSpan={2}>{tAtt("noRecords")}</EmptyRow>
                ) : (
                  attendance.slice(0, 15).map((r, i) => (
                    <TR key={i}>
                      <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                        {r.date.toISOString().slice(0, 10)}
                      </TD>
                      <TD>
                        <span className="text-sm text-[color:var(--color-foreground)]">
                          {r.status}
                        </span>
                        {r.lateMinutes ? (
                          <span className="ms-2 text-xs text-[color:var(--color-foreground-muted)]">
                            ({r.lateMinutes} min)
                          </span>
                        ) : null}
                        {r.note ? (
                          <span className="ms-2 text-xs text-[color:var(--color-foreground-muted)]">
                            — {r.note}
                          </span>
                        ) : null}
                      </TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title={tParent("tabDiscipline")} />
            <CardBody>
              {discipline.length === 0 ? (
                <p className="text-sm text-[color:var(--color-foreground-muted)]">
                  {tDisc("empty")}
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {discipline.map((d) => (
                    <li
                      key={d.id}
                      className="border-b border-[color:var(--color-border-subtle)] pb-2 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[color:var(--color-foreground)]">
                          {d.type}
                        </span>
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              SEVERITY_TONE[d.severity],
                            )}
                          >
                            {tDisc(SEVERITY_LABEL[d.severity] ?? "severityNote")}
                          </span>
                          <span className="text-xs tabular-nums text-[color:var(--color-foreground-muted)]">
                            {d.date.toISOString().slice(0, 10)}
                          </span>
                        </span>
                      </div>
                      <p className="mt-1 text-[color:var(--color-foreground-muted)]">
                        {d.description}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

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
                      (a, p) => a + p.amountCents,
                      0,
                    );
                    const balance = inv.totalCents - paid;
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
