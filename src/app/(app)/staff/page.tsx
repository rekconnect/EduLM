import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, BadgeCheck, CalendarClock, Info, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withStaffSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const monthLabel = (locale: string, month: number) =>
  new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, Math.max(0, month - 1), 1)),
  );

export default async function StaffHomePage() {
  return withStaffSession(async (user, employee) => {
    const [t, locale] = await Promise.all([getTranslations("staff"), getLocale()]);
    // Dars history always visible; EduLM payslips only once published.
    const visibleWhere = {
      employeeId: employee?.id ?? "",
      OR: [{ darsSalaryId: { not: null } }, { publishedAt: { not: null } }],
    };
    const slips = employee
      ? await db.payslip.findMany({
          where: visibleWhere,
          orderBy: [{ year: "desc" }, { month: "desc" }],
          take: 5,
        })
      : [];
    const slipCount = employee ? await db.payslip.count({ where: visibleWhere }) : 0;
    const latest = slips[0];
    const firstName = (user.name ?? "").split(" ")[0] || null;
    const period = (m: { month: number; year: number }) => `${monthLabel(locale, m.month)} ${m.year}`;

    return (
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <PageHeader
          title={firstName ? t("greeting", { name: firstName }) : t("greetingNoName")}
          description={t("portalTitle")}
        />

        {!employee ? (
          <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-[color:var(--color-foreground-muted)]" aria-hidden />
            <p className="text-sm text-[color:var(--color-foreground-muted)]">{t("notLinked")}</p>
          </div>
        ) : (
          <>
            <Card>
              <CardBody className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-[color:var(--color-foreground)]">
                      {employee.displayName}
                    </h2>
                    <p className="text-sm text-[color:var(--color-foreground-muted)]">
                      {[employee.jobTitle, employee.department].filter(Boolean).join(" · ") || employee.employmentType || t("personnel")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                      employee.active
                        ? "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]"
                        : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-subtle)]",
                    )}
                  >
                    <BadgeCheck className="size-3.5" aria-hidden />
                    {employee.active ? t("active") : t("inactive")}
                  </span>
                </div>
                <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-muted)]">{t("employmentType")}</dt>
                    <dd className="mt-0.5 text-[color:var(--color-foreground)]">{employee.employmentType || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-muted)]">{t("recruited")}</dt>
                    <dd className="mt-0.5 tabular-nums text-[color:var(--color-foreground)]">
                      {employee.recruitedAt ? employee.recruitedAt.toISOString().slice(0, 10) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-muted)]">{t("payslipsCount")}</dt>
                    <dd className="mt-0.5 tabular-nums text-[color:var(--color-foreground)]">{slipCount.toLocaleString(locale)}</dd>
                  </div>
                </dl>
              </CardBody>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardBody className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
                      {latest ? t("latestPayslip", { period: period(latest) }) : t("latestPayslipEmpty")}
                    </span>
                    <span className="inline-flex size-7 items-center justify-center rounded-md bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]" aria-hidden>
                      <Wallet className="size-4" />
                    </span>
                  </div>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums text-[color:var(--color-foreground)]">
                    {latest ? formatMoney(latest.netLbpCents, "LBP") : "—"}
                  </p>
                  {latest && Number(latest.netUsdCents) > 0 ? (
                    <p className="text-xs text-[color:var(--color-foreground-muted)]">
                      + {formatMoney(latest.netUsdCents, "USD")}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
              <Card>
                <CardBody className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
                      {t("absenceRequests")}
                    </span>
                    <span className="inline-flex size-7 items-center justify-center rounded-md bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]" aria-hidden>
                      <CalendarClock className="size-4" />
                    </span>
                  </div>
                  <p className="text-sm text-[color:var(--color-foreground-muted)]">{t("absenceSoon")}</p>
                </CardBody>
              </Card>
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">{t("recentPayslips")}</h3>
                <Link
                  href="/staff/payslips"
                  className="inline-flex items-center gap-1 text-sm text-[color:var(--color-brand-600)] transition-colors hover:underline"
                >
                  {t("allPayslips")}
                  <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
                </Link>
              </div>
              <Table>
                <THead>
                  <tr>
                    <TH>{t("colPeriod")}</TH>
                    <TH className="text-end">{t("colNetLbp")}</TH>
                    <TH className="text-end">{t("colNetUsd")}</TH>
                    <TH>{t("colStatus")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {slips.length === 0 ? (
                    <EmptyRow colSpan={4}>{t("noPayslips")}</EmptyRow>
                  ) : (
                    slips.map((s) => (
                      <TR key={s.id}>
                        <TD className="font-medium">{period(s)}</TD>
                        <TD className="text-end tabular-nums">{formatMoney(s.netLbpCents, "LBP")}</TD>
                        <TD className="text-end tabular-nums text-[color:var(--color-foreground-muted)]">
                          {Number(s.netUsdCents) > 0 ? formatMoney(s.netUsdCents, "USD") : "—"}
                        </TD>
                        <TD>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                              s.paid
                                ? "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]"
                                : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
                            )}
                          >
                            {s.paid ? t("paid") : t("pending")}
                          </span>
                        </TD>
                      </TR>
                    ))
                  )}
                </tbody>
              </Table>
            </section>
          </>
        )}
      </main>
    );
  });
}
