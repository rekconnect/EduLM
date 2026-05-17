import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";

const SEVERITY_LABEL: Record<string, string> = {
  NOTE: "severityNote",
  WARNING: "severityWarning",
  DETENTION: "severityDetention",
  SUSPENSION: "severitySuspension",
};

const SEVERITY_TONE: Record<string, string> = {
  NOTE: "bg-slate-100 text-slate-700",
  WARNING: "bg-amber-100 text-amber-800",
  DETENTION: "bg-orange-100 text-orange-800",
  SUSPENSION: "bg-red-100 text-red-800",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ISSUED: "bg-blue-100 text-blue-800",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-zinc-200 text-zinc-700",
  OVERDUE: "bg-red-100 text-red-800",
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
          enrollments: {
            where: { academicYear: { isActive: true } },
            select: { class: { select: { name: true } }, academicYear: { select: { label: true } } },
            take: 1,
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

    const counts: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    for (const r of attendance) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    const klass = child.enrollments[0]?.class.name ?? "—";
    const year = child.enrollments[0]?.academicYear.label ?? "";

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={`${child.firstName} ${child.lastName}`}
            description={`${klass} · ${year}`}
            action={
              <Link
                href="/parent/dashboard"
                className="text-sm text-[color:var(--muted-fg)] hover:underline"
              >
                ← {tParent("dashboardTitle")}
              </Link>
            }
          />

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
                      <TD className="tabular-nums text-[color:var(--muted-fg)]">
                        {r.date.toISOString().slice(0, 10)}
                      </TD>
                      <TD>
                        <span className="text-sm">{r.status}</span>
                        {r.lateMinutes ? (
                          <span className="ms-2 text-xs text-[color:var(--muted-fg)]">
                            ({r.lateMinutes} min)
                          </span>
                        ) : null}
                        {r.note ? (
                          <span className="ms-2 text-xs text-[color:var(--muted-fg)]">
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
                <p className="text-sm text-[color:var(--muted-fg)]">{tDisc("empty")}</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {discipline.map((d) => (
                    <li
                      key={d.id}
                      className="border-b border-[color:var(--border)] pb-2 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{d.type}</span>
                        <span className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              SEVERITY_TONE[d.severity]
                            }`}
                          >
                            {tDisc(SEVERITY_LABEL[d.severity] ?? "severityNote")}
                          </span>
                          <span className="text-xs text-[color:var(--muted-fg)] tabular-nums">
                            {d.date.toISOString().slice(0, 10)}
                          </span>
                        </span>
                      </div>
                      <p className="mt-1 text-[color:var(--muted-fg)]">{d.description}</p>
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
                  <TH className="text-right">{tBill("colTotal")}</TH>
                  <TH className="text-right">{tBill("colBalance")}</TH>
                  <TH>{tBill("colStatus")}</TH>
                </tr>
              </THead>
              <tbody>
                {invoices.length === 0 ? (
                  <EmptyRow colSpan={5}>{tBill("empty")}</EmptyRow>
                ) : (
                  invoices.map((inv) => {
                    const paid = inv.payments.reduce((a, p) => a + p.amountCents, 0);
                    const balance = inv.totalCents - paid;
                    return (
                      <TR key={inv.id}>
                        <TD className="font-mono text-xs">{inv.number}</TD>
                        <TD className="text-[color:var(--muted-fg)] tabular-nums">
                          {inv.issuedAt.toISOString().slice(0, 10)}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {formatMoney(inv.totalCents, inv.currency)}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {balance > 0 ? (
                            <span className="font-medium">
                              {formatMoney(balance, inv.currency)}
                            </span>
                          ) : (
                            <span className="text-emerald-600">—</span>
                          )}
                        </TD>
                        <TD>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              STATUS_TONE[inv.status]
                            }`}
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
      </div>
    );
  });
}
