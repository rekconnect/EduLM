import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withStaffSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const monthLabel = (locale: string, month: number) =>
  new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, Math.max(0, month - 1), 1)),
  );

export default async function StaffPayslipsPage() {
  return withStaffSession(async (_user, employee) => {
    const [t, locale] = await Promise.all([getTranslations("staff"), getLocale()]);
    // Staff see Dars history always, plus EduLM payslips only once published.
    const slips = employee
      ? await db.payslip.findMany({
          where: {
            employeeId: employee.id,
            OR: [{ darsSalaryId: { not: null } }, { publishedAt: { not: null } }],
          },
          orderBy: [{ year: "desc" }, { month: "desc" }],
        })
      : [];

    return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <PageHeader
          title={t("myPayslipsTitle")}
          description={employee ? employee.displayName : t("portalTitle")}
        />

        {!employee ? (
          <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-[color:var(--color-foreground-muted)]" aria-hidden />
            <p className="text-sm text-[color:var(--color-foreground-muted)]">{t("notLinkedShort")}</p>
          </div>
        ) : (
          <>
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
                      <TD className="font-medium">
                        <Link
                          href={`/staff/payslips/${s.id}`}
                          className="text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                        >
                          {monthLabel(locale, s.month)} {s.year}
                        </Link>
                      </TD>
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
            <p className="text-xs text-[color:var(--color-foreground-subtle)]">{t("payslipsNote")}</p>
          </>
        )}
      </main>
    );
  });
}
