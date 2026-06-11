import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { unscopedDb } from "@/lib/db";
import { PrintControls } from "../../reports/lists/_print-controls";
import { loadCantineRows, toExportRows, CANTINE_EXPORT_COLUMNS } from "../_data";

export const dynamic = "force-dynamic";

/** Branded print view of the canteen / snack list — "PDF" via the browser
 *  print dialog, same pattern as the report print pages. */
export default async function CantinePrintPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, logoUrl: true },
  });
  const { rows, yearLabel } = await runWithTenant({ tenantId, slug: null }, () =>
    loadCantineRows(),
  );
  const exportRows = toExportRows(rows);

  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}/${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}/${now.getFullYear()}`;

  return (
    <main className="mx-auto max-w-[900px] px-6 py-8 print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
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

      <PrintControls backHref="/cantine" />

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
              Cantine / Collation
            </h1>
          </div>
        </div>
        <div className="text-end text-xs text-[color:var(--color-foreground-muted)] print:text-[#475569]">
          <p>{yearLabel}</p>
          <p>Généré le {stamp}</p>
        </div>
      </header>

      {exportRows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-foreground-muted)]">
          Aucun élève inscrit.
        </p>
      ) : (
        <table className="rpt-table">
          <thead>
            <tr>
              {CANTINE_EXPORT_COLUMNS.map((c) => (
                <th key={c.key}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exportRows.map((row, i) => (
              <tr key={i}>
                {CANTINE_EXPORT_COLUMNS.map((c) => (
                  <td key={c.key}>{row[c.key] === "" ? "—" : row[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-4 text-[10px] text-[color:var(--color-foreground-subtle)] print:text-[#94A3B8]">
        {exportRows.length} élève(s) · EduLM
      </p>
    </main>
  );
}
