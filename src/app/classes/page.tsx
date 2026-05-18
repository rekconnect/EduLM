import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { YearPicker } from "@/components/shell/year-picker";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ yearId?: string }>;
}) {
  const { yearId: yearIdParam } = await searchParams;

  return withTenantSession(async (user) => {
    const t = await getTranslations("classes");

    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, label: true, isActive: true },
    });

    if (years.length === 0) {
      return (
        <AppShell role={user.role} userLabel={user.name ?? user.email}>
          <main className="mx-auto max-w-5xl px-6 py-10">
            <PageHeader title={t("title")} />
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noActiveYear")}</p>
              </CardBody>
            </Card>
          </main>
        </AppShell>
      );
    }

    const defaultYear = years.find((y) => y.isActive) ?? years[0]!;
    const selectedYear =
      (yearIdParam && years.find((y) => y.id === yearIdParam)) || defaultYear;

    const classes = await db.class.findMany({
      where: { academicYearId: selectedYear.id },
      orderBy: [{ level: "asc" }, { section: "asc" }],
      select: {
        id: true,
        level: true,
        section: true,
        name: true,
        _count: { select: { enrollments: true } },
      },
    });

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
        <main className="mx-auto max-w-5xl px-6 py-10">
          <PageHeader
            title={t("title")}
            description={`${t("subtitle")} — ${selectedYear.label}${
              !selectedYear.isActive ? " · année non active" : ""
            }`}
            action={
              user.role === "SCHOOL_ADMIN" ? (
                <LinkButton
                  href={`/classes/new${selectedYear.id ? `?yearId=${selectedYear.id}` : ""}`}
                  size="sm"
                >
                  {t("createCta")}
                </LinkButton>
              ) : undefined
            }
          />

          <div className="mb-4 max-w-xs">
            <YearPicker years={years} selectedId={selectedYear.id} />
          </div>

          <Table>
            <THead>
              <tr>
                <TH>{t("colName")}</TH>
                <TH>{t("colLevel")}</TH>
                <TH>{t("colSection")}</TH>
                <TH className="text-right">{t("colCount")}</TH>
              </tr>
            </THead>
            <tbody>
              {classes.length === 0 ? (
                <EmptyRow colSpan={4}>{t("empty")}</EmptyRow>
              ) : (
                classes.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/classes/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </TD>
                    <TD>{c.level}</TD>
                    <TD>{c.section}</TD>
                    <TD className="text-right tabular-nums">{c._count.enrollments}</TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </main>
      </AppShell>
    );
  });
}
