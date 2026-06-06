import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { unscopedDb } from "@/lib/db";
import { getReport } from "@/lib/reports/registry";
import { PrintControls } from "../../lists/_print-controls";

export const dynamic = "force-dynamic";

export default async function ReportPrintPage({
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
    year: yearId,
    class: classId,
    month,
    nationality,
  } = await searchParams;

  const def = getReport(reportId);
  if (!def) notFound();

  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, logoUrl: true },
  });

  const resolved = await runWithTenant({ tenantId, slug: null }, () =>
    def.run({
      yearId,
      classId: classId || undefined,
      month: month || undefined,
      nationality: nationality || undefined,
    }),
  );

  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}/${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}/${now.getFullYear()}`;

  const backQs = new URLSearchParams({
    ...(yearId ? { year: yearId } : {}),
    ...(classId ? { class: classId } : {}),
    ...(month ? { month } : {}),
    ...(nationality ? { nationality } : {}),
  }).toString();
  const backHref = `/reports/lists/${def.id}${backQs ? `?${backQs}` : ""}`;

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-8 print:px-0 print:py-0">
      {/* Print-only styling for the report table + page setup. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
        }
        .rpt-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .rpt-table thead { display: table-header-group; }
        .rpt-table th {
          background: #EAF3FA; color: #0F1E33; text-align: start;
          padding: 4px 6px; border: 1px solid #CBD5E1; font-weight: 600;
          white-space: nowrap;
        }
        .rpt-table td {
          padding: 3px 6px; border: 1px solid #E2E8F0; color: #0F1E33;
          vertical-align: top;
        }
        .rpt-table tr { break-inside: avoid; }
        .rpt-table tbody tr:nth-child(even) { background: #F6F9FC; }
      `}</style>

      <PrintControls backHref={backHref} />

      {/* Branded header */}
      <header className="mb-5 flex items-center justify-between gap-4 border-b border-[color:var(--color-border-subtle)] pb-4 print:border-b print:border-[#CBD5E1]">
        <div className="flex items-center gap-3">
          {tenant?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logoUrl}
              alt=""
              className="size-12 shrink-0 rounded-md object-contain"
            />
          ) : null}
          <div>
            <p className="text-base font-semibold text-[color:var(--color-foreground)] print:text-black">
              {tenant?.name ?? "EduLM"}
            </p>
            <h1 className="text-lg font-bold text-[color:var(--color-foreground)] print:text-black">
              {def.title}
            </h1>
          </div>
        </div>
        <div className="text-end text-xs text-[color:var(--color-foreground-muted)] print:text-[#475569]">
          <p>{resolved.filterSummary}</p>
          <p>Généré le {stamp}</p>
        </div>
      </header>

      {resolved.rows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-foreground-muted)]">
          Aucune ligne pour ces filtres.
        </p>
      ) : (
        <table className="rpt-table">
          <thead>
            <tr>
              {resolved.columns.map((c) => (
                <th key={c.key}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resolved.rows.map((row, i) => (
              <tr key={i}>
                {resolved.columns.map((c) => (
                  <td key={c.key}>{row[c.key] === "" ? "—" : row[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-4 text-[10px] text-[color:var(--color-foreground-subtle)] print:text-[#94A3B8]">
        {resolved.rows.length} ligne(s) · EduLM
      </p>
    </main>
  );
}
