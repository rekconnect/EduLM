import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button, LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { setActiveYear } from "./_actions";

export default async function YearsPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");

    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      include: { _count: { select: { classes: true, enrollments: true } } },
    });

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-5xl space-y-4 px-6 py-10">
          <PageHeader
            title={t("yearsTitle")}
            description={t("yearsLead")}
            action={
              <LinkButton href="/admin/years/new" size="sm">
                + {t("yearsNewCta")}
              </LinkButton>
            }
          />

          <Table>
            <THead>
              <tr>
                <TH>{t("yearFieldLabel")}</TH>
                <TH>{t("yearFieldStart")}</TH>
                <TH>{t("yearFieldEnd")}</TH>
                <TH className="text-right">Classes</TH>
                <TH className="text-right">Inscriptions</TH>
                <TH>{t("yearFieldActive")}</TH>
              </tr>
            </THead>
            <tbody>
              {years.length === 0 ? (
                <EmptyRow colSpan={6}>{t("yearEmpty")}</EmptyRow>
              ) : (
                years.map((y) => {
                  const boundSetActive = setActiveYear.bind(null, y.id);
                  return (
                    <TR key={y.id}>
                      <TD className="font-medium">{y.label}</TD>
                      <TD className="text-[color:var(--muted-fg)] tabular-nums">
                        {y.startDate.toISOString().slice(0, 10)}
                      </TD>
                      <TD className="text-[color:var(--muted-fg)] tabular-nums">
                        {y.endDate.toISOString().slice(0, 10)}
                      </TD>
                      <TD className="text-right tabular-nums">{y._count.classes}</TD>
                      <TD className="text-right tabular-nums">{y._count.enrollments}</TD>
                      <TD className="text-right">
                        {y.isActive ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            {t("yearActiveBadge")}
                          </span>
                        ) : (
                          <form action={boundSetActive}>
                            <Button type="submit" variant="ghost" size="sm">
                              {t("yearSetActive")}
                            </Button>
                          </form>
                        )}
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        </main>
      </AppShell>
    );
  });
}
