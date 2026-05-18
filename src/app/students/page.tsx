import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { YearPicker, UrlSelect } from "@/components/shell/year-picker";
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
  searchParams: Promise<{ q?: string; yearId?: string; scope?: string }>;
}) {
  const { q = "", yearId: yearIdParam, scope = "year" } = await searchParams;

  return withTenantSession(async (user) => {
    const t = await getTranslations("students");
    const query = q.trim();

    // Year picker — load every year so admin can switch.
    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, label: true, isActive: true },
    });
    const activeYear = years.find((y) => y.isActive) ?? years[0];
    const selectedYearId =
      yearIdParam && years.some((y) => y.id === yearIdParam) ? yearIdParam : activeYear?.id;
    const selectedYear = years.find((y) => y.id === selectedYearId);

    // Two scopes:
    //   "year" (default) — show only students with an enrollment in the selected year
    //   "all"            — show every student, with their selected-year class in the column (or —)
    const restrictToYear = scope !== "all";

    const students = await db.student.findMany({
      where: {
        AND: [
          query
            ? {
                OR: [
                  { firstName: { contains: query, mode: "insensitive" } },
                  { lastName: { contains: query, mode: "insensitive" } },
                ],
              }
            : {},
          restrictToYear && selectedYearId
            ? { enrollments: { some: { academicYearId: selectedYearId } } }
            : {},
        ],
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 200,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dob: true,
        status: true,
        enrollments: {
          where: selectedYearId ? { academicYearId: selectedYearId } : { id: "__none__" },
          select: { class: { select: { name: true } } },
          take: 1,
        },
      },
    });

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
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

          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <form>
              {/* Preserve other filters when the user presses Enter to search. */}
              {selectedYearId ? <input type="hidden" name="yearId" value={selectedYearId} /> : null}
              <input type="hidden" name="scope" value={scope} />
              <Input
                type="search"
                name="q"
                defaultValue={query}
                placeholder={t("search")}
              />
            </form>
            <YearPicker years={years} selectedId={selectedYearId ?? ""} />
            <UrlSelect
              name="scope"
              value={scope}
              options={[
                { value: "year", label: "Inscrits cette année" },
                { value: "all", label: "Tous les élèves" },
              ]}
            />
          </div>

          {selectedYear ? (
            <p className="mb-3 text-xs text-[color:var(--muted-fg)]">
              {restrictToYear
                ? `Affichage des élèves inscrits en ${selectedYear.label}`
                : `Tous les élèves — classe affichée pour ${selectedYear.label}`}
              {!selectedYear.isActive ? " · année non active" : ""}
            </p>
          ) : null}

          <Table>
            <THead>
              <tr>
                <TH>{t("colName")}</TH>
                <TH>{t("colDob")}</TH>
                <TH>{t("colStatus")}</TH>
                <TH>Classe ({selectedYear?.label ?? "—"})</TH>
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
      </AppShell>
    );
  });
}
