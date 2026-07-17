import { getLocale, getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withStaffSession } from "@/lib/session";
import { SupervisorDecision } from "./_decision";
import { StatusPill, statusKey, kindLabelKey, formatRequestRange } from "../_request-shared";

export default async function StaffApprovalsPage() {
  return withStaffSession(async (user, employee) => {
    const [t, locale] = await Promise.all([getTranslations("staff"), getLocale()]);

    // Gate on the SNAPSHOT (pending requests + past decisions), not just the
    // live report count — a supervisor unassigned from their last report must
    // still be able to clear requests that were routed to them.
    const [reports, pending, history] = await Promise.all([
      db.payrollEmployee.count({ where: { supervisor: { userId: user.id } } }),
      db.attendanceRequest.findMany({
        where: { status: "PENDING_SUPERVISOR", supervisor: { userId: user.id } },
        orderBy: { createdAt: "asc" },
        include: { employee: { select: { displayName: true } } },
      }),
      db.attendanceRequest.findMany({
        where: { supervisorDecisionByUserId: user.id },
        orderBy: { supervisorDecisionAt: "desc" },
        take: 20,
        include: { employee: { select: { displayName: true } } },
      }),
    ]);

    if (reports === 0 && pending.length === 0 && history.length === 0) {
      return (
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <PageHeader title={t("approvalsTitle")} description={employee?.displayName ?? t("portalTitle")} />
          <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-[color:var(--color-foreground-muted)]" aria-hidden />
            <p className="text-sm text-[color:var(--color-foreground-muted)]">{t("notSupervisor")}</p>
          </div>
        </main>
      );
    }

    return (
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <PageHeader title={t("approvalsTitle")} description={t("approvalsSubtitle")} />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
            {t("pendingApprovals")} {pending.length > 0 ? `(${pending.length})` : ""}
          </h2>
          {pending.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[color:var(--color-border-strong)] px-6 py-10 text-center text-sm text-[color:var(--color-foreground-muted)]">
              {t("noApprovals")}
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((r) => (
                <Card key={r.id}>
                  <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[color:var(--color-foreground)]">{r.employee.displayName}</span>
                        <span className="rounded-full bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-xs text-[color:var(--color-foreground-muted)]">
                          {t(kindLabelKey(r.kind))}
                        </span>
                        <span className="text-sm tabular-nums text-[color:var(--color-foreground-muted)]">
                          {formatRequestRange(locale, r)}{r.workingDays != null ? " · " + t("daysCount", { n: r.workingDays }) : ""}
                        </span>
                      </div>
                      <p className="text-sm text-[color:var(--color-foreground-muted)]">{r.reason}</p>
                    </div>
                    <div className="shrink-0">
                      <SupervisorDecision id={r.id} />
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">{t("history")}</h2>
          <Table>
            <THead>
              <tr>
                <TH>{t("employee")}</TH>
                <TH>{t("colKind")}</TH>
                <TH>{t("colDates")}</TH>
                <TH>{t("colStatus")}</TH>
              </tr>
            </THead>
            <tbody>
              {history.length === 0 ? (
                <EmptyRow colSpan={4}>{t("noHistory")}</EmptyRow>
              ) : (
                history.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.employee.displayName}</TD>
                    <TD className="text-[color:var(--color-foreground-muted)]">
                      {t(kindLabelKey(r.kind))}
                    </TD>
                    <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                      {formatRequestRange(locale, r)}{r.workingDays != null ? " · " + t("daysCount", { n: r.workingDays }) : ""}
                    </TD>
                    <TD>
                      <StatusPill status={r.status} label={t(statusKey(r.status))} />
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </section>
      </main>
    );
  });
}
