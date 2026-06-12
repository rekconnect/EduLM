import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { buildWorkbook } from "@/lib/reports/xlsx";
import {
  loadBusRows,
  toExportRows,
  filterBusRows,
  busFilterSummary,
  BUS_EXPORT_COLUMNS,
} from "../_data";

export const dynamic = "force-dynamic";

/** Styled .xlsx of the full bus-assignment table (sorted bus matin → quartier). */
export async function GET(request: Request) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return new NextResponse("No tenant", { status: 400 });

  const sp = new URL(request.url).searchParams;
  const { rows: allRows, yearLabel, trim } = await runWithTenant({ tenantId, slug: null }, () =>
    loadBusRows({
      yearId: sp.get("yearId") ?? undefined,
      trim: sp.get("trim") ?? undefined,
    }),
  );
  const filters = {
    q: sp.get("q") ?? undefined,
    bus: sp.get("bus") ?? undefined,
    zoneno: sp.get("zoneno") ?? undefined,
    zone: sp.get("zone") ?? undefined,
    niveau: sp.get("niveau") ?? undefined,
    trajet: sp.get("trajet") ?? undefined,
    circuit: sp.get("circuit") ?? undefined,
  };
  const rows = filterBusRows(allRows, filters);
  const filterText = busFilterSummary(filters);

  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}/${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}/${now.getFullYear()}`;

  const buf = await buildWorkbook({
    title: "Transport — affectation des bus",
    subtitle:
      `${rows.length} élève(s) · ${yearLabel} · Trimestre ${trim.slice(1)}` +
      (filterText ? ` · Filtres: ${filterText}` : ""),
    generatedOn: stamp,
    report: {
      columns: [...BUS_EXPORT_COLUMNS],
      rows: toExportRows(rows),
      filterSummary: `${yearLabel} · ${trim}${filterText ? ` · ${filterText}` : ""}`,
    },
  });

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="transport-${yearLabel || "export"}-${trim}.xlsx"`,
    },
  });
}
