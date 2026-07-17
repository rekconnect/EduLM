import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { HolidayForm } from "./_holiday-form";
import { DeleteHolidayButton } from "./_delete-holiday";

export default async function HolidaysPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const [t, locale] = await Promise.all([getTranslations("holidays"), getLocale()]);
    const holidays = await db.tenantHoliday.findMany({ orderBy: { date: "desc" } });
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(d);

    return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <PageHeader title={t("title")} description={t("subtitle")} />

        <Card>
          <CardBody>
            <h2 className="mb-4 text-sm font-semibold text-[color:var(--color-foreground)]">{t("addTitle")}</h2>
            <HolidayForm />
          </CardBody>
        </Card>

        <Table>
          <THead>
            <tr>
              <TH>{t("colDate")}</TH>
              <TH>{t("colLabel")}</TH>
              <TH className="text-end" />
            </tr>
          </THead>
          <tbody>
            {holidays.length === 0 ? (
              <EmptyRow colSpan={3}>{t("empty")}</EmptyRow>
            ) : (
              holidays.map((h) => (
                <TR key={h.id}>
                  <TD className="font-medium tabular-nums">{fmt(h.date)}</TD>
                  <TD className="text-[color:var(--color-foreground-muted)]">{h.label}</TD>
                  <TD className="text-end">
                    <DeleteHolidayButton id={h.id} />
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </main>
    );
  });
}
