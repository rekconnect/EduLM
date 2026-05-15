import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";

export default async function ClassesPage() {
  return withTenantSession(async (user) => {
    const t = await getTranslations("classes");

    const activeYear = await db.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true, label: true },
    });

    if (!activeYear) {
      return (
        <div className="min-h-screen">
          <AppHeader role={user.role} userLabel={user.name ?? user.email} />
          <main className="mx-auto max-w-5xl px-6 py-10">
            <PageHeader title={t("title")} />
            <Card>
              <CardBody>
                <p className="text-sm text-[color:var(--muted-fg)]">{t("noActiveYear")}</p>
              </CardBody>
            </Card>
          </main>
        </div>
      );
    }

    const classes = await db.class.findMany({
      where: { academicYearId: activeYear.id },
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
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-5xl px-6 py-10">
          <PageHeader
            title={t("title")}
            description={`${t("subtitle")} — ${activeYear.label}`}
            action={
              user.role === "SCHOOL_ADMIN" ? (
                <LinkButton href="/classes/new" size="sm">
                  {t("createCta")}
                </LinkButton>
              ) : undefined
            }
          />

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
      </div>
    );
  });
}
