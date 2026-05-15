import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";

const STATUS_KEY: Record<string, string> = {
  PROSPECT: "statusProspect",
  ENROLLED: "statusEnrolled",
  WITHDRAWN: "statusWithdrawn",
  GRADUATED: "statusGraduated",
};

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  return withTenantSession(async (user) => {
    const t = await getTranslations("students");
    const query = q.trim();

    const activeYear = await db.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });

    const students = await db.student.findMany({
      where: query
        ? {
            OR: [
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 100,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dob: true,
        status: true,
        enrollments: {
          where: activeYear ? { academicYearId: activeYear.id } : { id: "__none__" },
          select: { class: { select: { name: true } } },
          take: 1,
        },
      },
    });

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <PageHeader
            title={t("title")}
            description={t("subtitle")}
            action={
              <LinkButton href="/students/new" size="sm">
                {t("createCta")}
              </LinkButton>
            }
          />

          <form className="mb-4 max-w-sm">
            <Input
              type="search"
              name="q"
              defaultValue={query}
              placeholder={t("search")}
            />
          </form>

          <Table>
            <THead>
              <tr>
                <TH>{t("colName")}</TH>
                <TH>{t("colDob")}</TH>
                <TH>{t("colStatus")}</TH>
                <TH>{t("colClass")}</TH>
                <TH className="text-right">{t("colActions")}</TH>
              </tr>
            </THead>
            <tbody>
              {students.length === 0 ? (
                <EmptyRow colSpan={5}>
                  {query ? t("emptySearch") : t("empty")}
                </EmptyRow>
              ) : (
                students.map((s) => {
                  const statusKey = STATUS_KEY[s.status] ?? "statusProspect";
                  const enrolledClassName = s.enrollments[0]?.class.name ?? "—";
                  return (
                    <TR key={s.id}>
                      <TD>
                        <Link href={`/students/${s.id}`} className="font-medium hover:underline">
                          {s.lastName} {s.firstName}
                        </Link>
                      </TD>
                      <TD className="text-[color:var(--muted-fg)] tabular-nums">
                        {s.dob ? s.dob.toISOString().slice(0, 10) : "—"}
                      </TD>
                      <TD>
                        <span className="inline-flex rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs">
                          {t(statusKey)}
                        </span>
                      </TD>
                      <TD>{enrolledClassName}</TD>
                      <TD className="text-right">
                        <Link
                          href={`/students/${s.id}`}
                          className="text-sm font-medium text-[color:var(--primary)] hover:underline"
                        >
                          {t("view")}
                        </Link>
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        </main>
      </div>
    );
  });
}
