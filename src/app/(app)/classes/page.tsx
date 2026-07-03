import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { ArrowRight, Plus, School } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { SortableTH, type SortDir } from "@/components/ui/sortable-th";
import { FilterPill } from "@/components/ui/filter-pill";
import { YearPicker } from "@/components/shell/year-picker";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { sortLevels } from "@/lib/levels";

const BASE = "/classes";

const SORTABLE_COLUMNS = ["name", "level", "section", "count"] as const;
type SortKey = (typeof SORTABLE_COLUMNS)[number];

function orderByFor(
  sort: SortKey,
  dir: SortDir,
): Prisma.ClassOrderByWithRelationInput[] {
  switch (sort) {
    case "name":
      return [{ name: dir }];
    case "section":
      return [{ section: dir }, { level: "asc" }];
    case "count":
      return [{ enrollments: { _count: dir } }];
    case "level":
    default:
      return [{ level: dir }, { section: "asc" }];
  }
}

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{
    yearId?: string;
    level?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const { yearId: yearIdParam, level, sort, dir } = await searchParams;

  return withTenantSession(async (user) => {
    const t = await getTranslations("classes");

    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, label: true, isActive: true },
    });

    if (years.length === 0) {
      return (
          <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
            <PageHeader title={t("title")} />
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <School className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("noActiveYear")}
              </p>
            </div>
          </main>
      );
    }

    const defaultYear = years.find((y) => y.isActive) ?? years[0]!;
    const selectedYear =
      (yearIdParam && years.find((y) => y.id === yearIdParam)) || defaultYear;

    const sortKey: SortKey = (SORTABLE_COLUMNS as readonly string[]).includes(
      sort ?? "",
    )
      ? (sort as SortKey)
      : "level";
    const sortDir: SortDir = dir === "desc" ? "desc" : "asc";

    // Fire both queries in parallel. We don't yet know if `level` (URL param)
    // is a real level for this year, but a wrong value simply yields zero
    // rows — fine. The level dropdown UI uses `availableLevels` from (1) so
    // the user can pick a valid one.
    const [levelRows, classes] = await Promise.all([
      db.class.findMany({
        where: { academicYearId: selectedYear.id },
        distinct: ["level"],
        select: { level: true },
      }),
      db.class.findMany({
        where: {
          academicYearId: selectedYear.id,
          ...(level ? { level } : {}),
        },
        orderBy: orderByFor(sortKey, sortDir),
        select: {
          id: true,
          level: true,
          section: true,
          name: true,
          _count: { select: { enrollments: true } },
        },
      }),
    ]);
    const availableLevels = sortLevels(levelRows.map((r) => r.level));
    const levelFilter =
      level && availableLevels.includes(level) ? level : undefined;

    const preserve = {
      yearId: selectedYear.id,
      level: levelFilter,
      sort: sortKey,
      dir: sortDir,
    };
    const filterPreserve = {
      yearId: preserve.yearId,
      sort: preserve.sort,
      dir: preserve.dir,
    };

    const count = classes.length;

    return (
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("title")}
            description={`${t("subtitle")} — ${selectedYear.label}${
              !selectedYear.isActive ? " · année non active" : ""
            }`}
            action={
              user.role === "SCHOOL_ADMIN" ? (
                <LinkButton
                  href={`/classes/new?yearId=${selectedYear.id}`}
                  size="sm"
                  className="gap-1.5"
                >
                  <Plus className="size-4" aria-hidden />
                  {t("createCta")}
                </LinkButton>
              ) : undefined
            }
          />

          <div className="max-w-xs">
            <YearPicker years={years} selectedId={selectedYear.id} />
          </div>

          {/* Level filter pills — only render when there are levels to filter */}
          {availableLevels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <FilterPill
                href={hrefWith(BASE, { ...filterPreserve, level: undefined })}
                label={t("filterAll")}
                active={!levelFilter}
              />
              {availableLevels.map((lv) => (
                <FilterPill
                  key={lv}
                  href={hrefWith(BASE, { ...filterPreserve, level: lv })}
                  label={lv}
                  active={levelFilter === lv}
                />
              ))}
            </div>
          ) : null}

          {count === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <School className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {levelFilter ? t("emptyFilter") : t("empty")}
              </p>
              {!levelFilter ? (
                <div className="mt-5">
                  <LinkButton
                    href={`/classes/new?yearId=${selectedYear.id}`}
                    size="sm"
                    className="gap-1.5"
                  >
                    <Plus className="size-4" aria-hidden />
                    {t("createCta")}
                  </LinkButton>
                </div>
              ) : null}
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <SortableTH
                    label={t("colName")}
                    column="name"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                  />
                  <SortableTH
                    label={t("colLevel")}
                    column="level"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                  />
                  <SortableTH
                    label={t("colSection")}
                    column="section"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                  />
                  <SortableTH
                    label={t("colCount")}
                    column="count"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                    align="end"
                  />
                  <TH className="text-end" />
                </tr>
              </THead>
              <tbody>
                {classes.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link
                        href={`/classes/${c.id}`}
                        className="font-medium text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TD>
                    <TD>
                      <span className="inline-flex rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-brand-700)]">
                        {c.level}
                      </span>
                    </TD>
                    <TD className="text-[color:var(--color-foreground-muted)]">
                      {c.section}
                    </TD>
                    <TD className="text-end tabular-nums">
                      {c._count.enrollments > 0 ? (
                        <span className="font-medium text-[color:var(--color-foreground)]">
                          {c._count.enrollments}
                        </span>
                      ) : (
                        <span className="text-[color:var(--color-foreground-subtle)]">
                          0
                        </span>
                      )}
                    </TD>
                    <TD className="text-end">
                      <Link
                        href={`/classes/${c.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors hover:text-[color:var(--color-brand-700)] hover:underline"
                      >
                        {t("view")}
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </main>
    );
  });
}

function hrefWith(
  base: string,
  params: Record<string, string | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}
