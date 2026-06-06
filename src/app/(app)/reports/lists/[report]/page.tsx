import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, FileText } from "lucide-react";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import {
  getReport,
  loadYears,
  loadClassesForYear,
  loadNationalities,
} from "@/lib/reports/registry";
import { PageHeader } from "@/components/shell/page-header";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { ReportFilters } from "../_filters";

const PREVIEW_LIMIT = 300;

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<{
    year?: string;
    class?: string;
    month?: string;
    nationality?: string;
  }>;
}) {
  const { report: reportId } = await params;
  const {
    year: spYear,
    class: spClass,
    month: spMonth,
    nationality: spNat,
  } = await searchParams;

  const def = getReport(reportId);
  if (!def) notFound();

  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const hasYear = def.filters.includes("year");
    const hasClass = def.filters.includes("class");
    const hasMonth = def.filters.includes("month");
    const hasNationality = def.filters.includes("nationality");

    const years = hasYear ? await loadYears() : [];
    const activeId = years.find((y) => y.isActive)?.id ?? years[0]?.id;
    const selYear =
      (spYear && years.find((y) => y.id === spYear)?.id) || activeId || undefined;

    const classes =
      hasClass && selYear ? await loadClassesForYear(selYear) : [];
    const selClass =
      spClass && classes.some((c) => c.id === spClass) ? spClass : "";

    const nationalities =
      hasNationality && selYear ? await loadNationalities(selYear) : [];
    const selNat = spNat && nationalities.includes(spNat) ? spNat : "";

    const nMonth = Number(spMonth);
    const selMonth = hasMonth
      ? Number.isInteger(nMonth) && nMonth >= 1 && nMonth <= 12
        ? String(nMonth)
        : String(new Date().getMonth() + 1)
      : "";

    const resolved = await def.run({
      yearId: selYear,
      classId: selClass || undefined,
      month: selMonth || undefined,
      nationality: selNat || undefined,
    });

    // Export hrefs carry the resolved filters.
    const xq = new URLSearchParams({ report: def.id });
    if (selYear) xq.set("year", selYear);
    if (selClass) xq.set("class", selClass);
    if (selMonth) xq.set("month", selMonth);
    if (selNat) xq.set("nationality", selNat);
    const excelHref = `/reports/export?${xq.toString()}`;

    const pq = new URLSearchParams();
    if (selYear) pq.set("year", selYear);
    if (selClass) pq.set("class", selClass);
    if (selMonth) pq.set("month", selMonth);
    if (selNat) pq.set("nationality", selNat);
    const pdfHref = `/reports/print/${def.id}${pq.toString() ? `?${pq.toString()}` : ""}`;

    const preview = resolved.rows.slice(0, PREVIEW_LIMIT);
    const truncated = resolved.rows.length > PREVIEW_LIMIT;

    return (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <PageHeader
          title={def.title}
          description={resolved.filterSummary}
          action={
            <Link
              href="/reports/lists"
              className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Listes détaillées
            </Link>
          }
        />

        <div className="flex flex-wrap items-end justify-between gap-4">
          {hasYear || hasClass || hasMonth || hasNationality ? (
            <ReportFilters
              years={years}
              classes={classes}
              nationalities={nationalities}
              showClass={hasClass}
              showMonth={hasMonth}
              showNationality={hasNationality}
              currentYear={selYear ?? ""}
              currentClass={selClass}
              currentMonth={selMonth}
              currentNationality={selNat}
            />
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <a
              href={excelHref}
              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground-muted)] transition-all duration-150 ease-out hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-foreground)] active:scale-[0.98]"
            >
              <FileSpreadsheet className="size-3.5" aria-hidden />
              Excel
            </a>
            <Link
              href={pdfHref}
              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground-muted)] transition-all duration-150 ease-out hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-foreground)] active:scale-[0.98]"
            >
              <FileText className="size-3.5" aria-hidden />
              PDF
            </Link>
          </div>
        </div>

        <Table>
          <THead>
            <TR>
              {resolved.columns.map((c) => (
                <TH key={c.key} className="whitespace-nowrap text-start">
                  {c.header}
                </TH>
              ))}
            </TR>
          </THead>
          <tbody>
            {preview.length === 0 ? (
              <EmptyRow colSpan={resolved.columns.length}>
                Aucune ligne pour ces filtres.
              </EmptyRow>
            ) : (
              preview.map((row, i) => (
                <TR key={i}>
                  {resolved.columns.map((c) => (
                    <TD
                      key={c.key}
                      className="whitespace-nowrap text-[color:var(--color-foreground)]"
                    >
                      {row[c.key] === "" || row[c.key] == null ? (
                        <span className="text-[color:var(--color-foreground-subtle)]">
                          —
                        </span>
                      ) : (
                        row[c.key]
                      )}
                    </TD>
                  ))}
                </TR>
              ))
            )}
          </tbody>
        </Table>

        {truncated ? (
          <p className="text-xs text-[color:var(--color-foreground-subtle)]">
            Aperçu des {PREVIEW_LIMIT} premières lignes sur {resolved.rows.length}.
            L&apos;export Excel / PDF contient toutes les lignes.
          </p>
        ) : null}
      </main>
    );
  });
}
