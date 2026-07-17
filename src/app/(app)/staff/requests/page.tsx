import { getLocale, getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withStaffSession } from "@/lib/session";
import { RequestForm } from "./_request-form";
import { CancelRequestButton } from "./_cancel-button";
import { StatusPill, statusKey, kindLabelKey, formatRequestRange } from "../_request-shared";

export default async function StaffRequestsPage() {
  return withStaffSession(async (_user, employee) => {
    const [t, locale] = await Promise.all([getTranslations("staff"), getLocale()]);

    if (!employee) {
      return (
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <PageHeader title={t("myRequestsTitle")} description={t("portalTitle")} />
          <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-[color:var(--color-foreground-muted)]" aria-hidden />
            <p className="text-sm text-[color:var(--color-foreground-muted)]">{t("notLinkedShort")}</p>
          </div>
        </main>
      );
    }

    const [supervisor, requests] = await Promise.all([
      employee.supervisorId
        ? db.payrollEmployee.findFirst({
            where: { id: employee.supervisorId },
            select: { displayName: true, user: { select: { id: true } } },
          })
        : Promise.resolve(null),
      db.attendanceRequest.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    // A supervisor only takes part if they can act in the portal.
    const supervisorName = supervisor?.user ? supervisor.displayName : null;

    return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <PageHeader title={t("myRequestsTitle")} description={employee.displayName} />

        <Card>
          <CardBody>
            <h2 className="mb-4 text-sm font-semibold text-[color:var(--color-foreground)]">{t("newRequest")}</h2>
            <RequestForm supervisorName={supervisorName} />
          </CardBody>
        </Card>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">{t("myRequestsTitle")}</h3>
          <Table>
            <THead>
              <tr>
                <TH>{t("colKind")}</TH>
                <TH>{t("colDates")}</TH>
                <TH>{t("colReason")}</TH>
                <TH>{t("colStatus")}</TH>
                <TH className="text-end" />
              </tr>
            </THead>
            <tbody>
              {requests.length === 0 ? (
                <EmptyRow colSpan={5}>{t("noRequests")}</EmptyRow>
              ) : (
                requests.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{t(kindLabelKey(r.kind))}</TD>
                    <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                      {formatRequestRange(locale, r)}{r.workingDays != null ? " · " + t("daysCount", { n: r.workingDays }) : ""}
                    </TD>
                    <TD className="text-[color:var(--color-foreground-muted)]">
                      <span className="block max-w-[16rem] truncate" title={r.reason}>
                        {r.reason}
                      </span>
                    </TD>
                    <TD>
                      <StatusPill status={r.status} label={t(statusKey(r.status))} />
                      {r.status === "REJECTED" && r.decisionNote ? (
                        <span className="mt-0.5 block text-xs text-[color:var(--color-foreground-subtle)]">
                          {r.decisionNote}
                        </span>
                      ) : null}
                    </TD>
                    <TD className="text-end">
                      {r.status === "PENDING_SUPERVISOR" ? <CancelRequestButton id={r.id} /> : null}
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
