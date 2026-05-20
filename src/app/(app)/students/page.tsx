import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Prisma, StudentStatus } from "@prisma/client";
import { ArrowRight, GraduationCap, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { SortableTH, type SortDir } from "@/components/ui/sortable-th";
import { FilterPill } from "@/components/ui/filter-pill";
import { YearPicker, UrlSelect } from "@/components/shell/year-picker";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const BASE = "/students";

const STATUS_KEY: Record<string, string> = {
  PROSPECT: "statusProspect",
  ENROLLED: "statusEnrolled",
  WITHDRAWN: "statusWithdrawn",
  GRADUATED: "statusGraduated",
};

const STATUS_TONE: Record<string, string> = {
  PROSPECT:
    "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  ENROLLED:
    "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  WITHDRAWN:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  GRADUATED:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-subtle)]",
};

const STATUSES: StudentStatus[] = [
  "PROSPECT",
  "ENROLLED",
  "WITHDRAWN",
  "GRADUATED",
];

const SORTABLE_COLUMNS = ["name", "dob", "status"] as const;
type SortKey = (typeof SORTABLE_COLUMNS)[number];

function orderByFor(
  sort: SortKey,
  dir: SortDir,
): Prisma.StudentOrderByWithRelationInput[] {
  switch (sort) {
    case "dob":
      return [{ dob: dir }];
    case "status":
      return [{ status: dir }, { lastName: "asc" }];
    case "name":
    default:
      return [{ lastName: dir }, { firstName: dir }];
  }
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    yearId?: string;
    classId?: string;
    scope?: string;
    status?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const {
    q = "",
    yearId: yearIdParam,
    classId: classIdParam,
    scope = "year",
    status,
    sort,
    dir,
  } = await searchParams;

  return withTenantSession(async (user) => {
    const t = await getTranslations("students");
    const query = q.trim();

    // Run years + speculative classes in parallel. We don't yet know which
    // year is selected (the URL param needs validation against the list),
    // but the URL-provided yearIdParam is a strong hint — query classes for
    // that year speculatively. If the param turns out invalid, we re-query
    // for the active year. Hit rate is ~100% in practice; cost on miss is
    // one extra small query.
    const yearsP = db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, label: true, isActive: true },
    });
    const speculativeClassesP = yearIdParam
      ? db.class.findMany({
          where: { academicYearId: yearIdParam },
          orderBy: [{ level: "asc" }, { section: "asc" }],
          select: { id: true, name: true },
        })
      : Promise.resolve(null);
    const [years, speculativeClasses] = await Promise.all([
      yearsP,
      speculativeClassesP,
    ]);

    const activeYear = years.find((y) => y.isActive) ?? years[0];
    const selectedYearId =
      yearIdParam && years.some((y) => y.id === yearIdParam)
        ? yearIdParam
        : activeYear?.id;
    const selectedYear = years.find((y) => y.id === selectedYearId);

    // Use the speculative result if it matched; otherwise (param missing or
    // invalid) fetch classes for the resolved year.
    const classes =
      speculativeClasses && selectedYearId === yearIdParam
        ? speculativeClasses
        : selectedYearId
          ? await db.class.findMany({
              where: { academicYearId: selectedYearId },
              orderBy: [{ level: "asc" }, { section: "asc" }],
              select: { id: true, name: true },
            })
          : [];

    // Only honor classId if it actually belongs to the selected year. A stale
    // classId from a different year is silently ignored (rather than 404).
    const classFilter =
      classIdParam && classes.some((c) => c.id === classIdParam)
        ? classIdParam
        : undefined;

    // Class filter implies a year scope; ignore the scope=all toggle when set.
    const restrictToYear = scope !== "all" || !!classFilter;

    const sortKey: SortKey = (SORTABLE_COLUMNS as readonly string[]).includes(
      sort ?? "",
    )
      ? (sort as SortKey)
      : "name";
    const sortDir: SortDir = dir === "desc" ? "desc" : "asc";

    const statusFilter: StudentStatus | undefined = (
      STATUSES as string[]
    ).includes(status ?? "")
      ? (status as StudentStatus)
      : undefined;

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
          classFilter
            ? { enrollments: { some: { classId: classFilter } } }
            : restrictToYear && selectedYearId
              ? { enrollments: { some: { academicYearId: selectedYearId } } }
              : {},
          statusFilter ? { status: statusFilter } : {},
        ],
      },
      orderBy: orderByFor(sortKey, sortDir),
      take: 200,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dob: true,
        status: true,
        enrollments: {
          where: selectedYearId
            ? { academicYearId: selectedYearId }
            : { id: "__none__" },
          select: { class: { select: { name: true } } },
          take: 1,
        },
      },
    });

    const count = students.length;
    const selectedClassName = classFilter
      ? (classes.find((c) => c.id === classFilter)?.name ?? "")
      : "";

    const preserve = {
      q: query || undefined,
      yearId: selectedYearId,
      classId: classFilter,
      scope,
      status: statusFilter,
      sort: sortKey,
      dir: sortDir,
    };
    const filterPreserve = {
      q: preserve.q,
      yearId: preserve.yearId,
      classId: preserve.classId,
      scope: preserve.scope,
      sort: preserve.sort,
      dir: preserve.dir,
    };

    return (
        <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("title")}
            description={t("subtitle")}
            action={
              <LinkButton href="/students/new" size="sm" className="gap-1.5">
                <Plus className="size-4" aria-hidden />
                {t("createCta")}
              </LinkButton>
            }
          />

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <form className="relative">
              {selectedYearId ? (
                <input type="hidden" name="yearId" value={selectedYearId} />
              ) : null}
              {classFilter ? (
                <input type="hidden" name="classId" value={classFilter} />
              ) : null}
              <input type="hidden" name="scope" value={scope} />
              {statusFilter ? (
                <input type="hidden" name="status" value={statusFilter} />
              ) : null}
              <input type="hidden" name="sort" value={sortKey} />
              <input type="hidden" name="dir" value={sortDir} />
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-foreground-subtle)]"
                aria-hidden
              />
              <Input
                type="search"
                name="q"
                defaultValue={query}
                placeholder={t("search")}
                className="ps-9"
              />
            </form>
            <YearPicker years={years} selectedId={selectedYearId ?? ""} />
            <UrlSelect
              name="classId"
              value={classFilter ?? ""}
              options={[
                { value: "", label: t("allClasses") },
                ...classes.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <UrlSelect
              name="scope"
              value={classFilter ? "year" : scope}
              options={[
                { value: "year", label: "Inscrits cette année" },
                { value: "all", label: "Tous les élèves" },
              ]}
            />
          </div>

          {/* Status filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              href={hrefWith(BASE, { ...filterPreserve, status: undefined })}
              label={t("filterAll")}
              active={!statusFilter}
            />
            {STATUSES.map((s) => (
              <FilterPill
                key={s}
                href={hrefWith(BASE, { ...filterPreserve, status: s })}
                label={t(STATUS_KEY[s] ?? "statusProspect")}
                active={statusFilter === s}
                tone={STATUS_TONE[s]}
              />
            ))}
          </div>

          {selectedYear ? (
            <p className="text-xs text-[color:var(--color-foreground-muted)]">
              <span className="font-medium text-[color:var(--color-foreground)]">
                {count}
              </span>{" "}
              {classFilter
                ? `· Élèves de ${selectedClassName} (${selectedYear.label})`
                : restrictToYear
                  ? `· Élèves inscrits en ${selectedYear.label}`
                  : `· Tous les élèves — classe affichée pour ${selectedYear.label}`}
              {!selectedYear.isActive ? " · année non active" : ""}
            </p>
          ) : null}

          {count === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <GraduationCap className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {query || statusFilter || classFilter
                  ? t("emptySearch")
                  : t("empty")}
              </p>
              {!query && !statusFilter && !classFilter ? (
                <div className="mt-5">
                  <LinkButton href="/students/new" size="sm" className="gap-1.5">
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
                    label={t("colDob")}
                    column="dob"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                  />
                  <SortableTH
                    label={t("colStatus")}
                    column="status"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                  />
                  <TH>Classe ({selectedYear?.label ?? "—"})</TH>
                  <TH className="text-end">{t("colActions")}</TH>
                </tr>
              </THead>
              <tbody>
                {students.map((s) => {
                  const statusKey = STATUS_KEY[s.status] ?? "statusProspect";
                  const enrolledClassName = s.enrollments[0]?.class.name ?? "—";
                  return (
                    <TR key={s.id}>
                      <TD>
                        <Link
                          href={`/students/${s.id}`}
                          className="group flex items-center gap-3"
                        >
                          <StudentInitials
                            firstName={s.firstName}
                            lastName={s.lastName}
                          />
                          <span className="truncate font-medium text-[color:var(--color-foreground)] transition-colors group-hover:text-[color:var(--color-brand-600)]">
                            {s.lastName} {s.firstName}
                          </span>
                        </Link>
                      </TD>
                      <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                        {s.dob ? s.dob.toISOString().slice(0, 10) : "—"}
                      </TD>
                      <TD>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_TONE[s.status],
                          )}
                        >
                          {t(statusKey)}
                        </span>
                      </TD>
                      <TD className="text-[color:var(--color-foreground)]">
                        {enrolledClassName}
                      </TD>
                      <TD className="text-end">
                        <Link
                          href={`/students/${s.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors hover:text-[color:var(--color-brand-700)] hover:underline"
                        >
                          {t("view")}
                          <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
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

function StudentInitials({
  firstName,
  lastName,
}: {
  firstName: string;
  lastName: string;
}) {
  const initials = `${firstName.charAt(0) || ""}${lastName.charAt(0) || ""}`
    .toUpperCase()
    .trim();
  return (
    <div
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-xs font-semibold text-[color:var(--color-brand-700)]"
    >
      {initials || "·"}
    </div>
  );
}
