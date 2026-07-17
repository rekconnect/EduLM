import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { FinanceDecision, UndoButton, ForwardStrandedButton } from "./_decision";
import { StatusPill, statusKey, kindLabelKey, formatRequestRange } from "../../staff/_request-shared";

export default async function StaffRequestsAdminPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const [t, locale] = await Promise.all([getTranslations("staff"), getLocale()]);
    const [pending, stranded, history] = await Promise.all([
      db.attendanceRequest.findMany({
        where: { status: "PENDING_FINANCE" },
        orderBy: { createdAt: "asc" },
        include: {
          employee: { select: { displayName: true } },
          supervisor: { select: { displayName: true } },
        },
      }),
      // Stuck at the supervisor stage because the snapshotted supervisor was
      // deleted or lost its portal account — no supervisor can act on these.
      db.attendanceRequest.findMany({
        where: {
          status: "PENDING_SUPERVISOR",
          OR: [{ supervisorId: null }, { supervisor: { userId: null } }],
        },
        orderBy: { createdAt: "asc" },
        include: { employee: { select: { displayName: true } } },
      }),
      db.attendanceRequest.findMany({
        where: { status: { in: ["APPROVED", "REJECTED", "CANCELLED"] } },
        orderBy: { updatedAt: "desc" },
        take: 40,
        include: { employee: { select: { displayName: true } } },
      }),
    ]);

    return (
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <PageHeader
          title={t("financeQueueTitle")}
          description={t("financeQueueSubtitle")}
          action={
            <Link href="/payroll" className="text-sm text-[color:var(--color-brand-600)] hover:underline">
              ← {t("personnel")}
            </Link>
          }
        />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
            {t("pendingFinance")} {pending.length > 0 ? `(${pending.length})` : ""}
          </h2>
          {pending.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[color:var(--color-border-strong)] px-6 py-10 text-center text-sm text-[color:var(--color-foreground-muted)]">
              {t("noPendingFinance")}
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
                      {r.supervisor ? (
                        <p className="text-xs text-[color:var(--color-foreground-subtle)]">
                          {t("approvedBySupervisor", { name: r.supervisor.displayName })}
                        </p>
                      ) : (
                        <p className="text-xs text-[color:var(--color-foreground-subtle)]">{t("noSupervisorRoute")}</p>
                      )}
                    </div>
                    <div className="shrink-0">
                      <FinanceDecision id={r.id} />
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </section>

        {stranded.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
              {t("strandedTitle")} ({stranded.length})
            </h2>
            <p className="text-xs text-[color:var(--color-foreground-muted)]">{t("strandedHint")}</p>
            <div className="space-y-3">
              {stranded.map((r) => (
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
                      <ForwardStrandedButton id={r.id} />
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">{t("history")}</h2>
          <Table>
            <THead>
              <tr>
                <TH>{t("employee")}</TH>
                <TH>{t("colKind")}</TH>
                <TH>{t("colDates")}</TH>
                <TH>{t("colStatus")}</TH>
                <TH className="text-end" />
              </tr>
            </THead>
            <tbody>
              {history.length === 0 ? (
                <EmptyRow colSpan={5}>{t("noHistory")}</EmptyRow>
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
                    <TD className="text-end">
                      {(r.status === "APPROVED" || r.status === "REJECTED") && r.financeDecisionByUserId ? (
                        <UndoButton id={r.id} />
                      ) : null}
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
