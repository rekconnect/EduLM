import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { buildWorkbook } from "@/lib/reports/xlsx";
import { loadCantineRows, toExportRows, CANTINE_EXPORT_COLUMNS } from "../_data";

export const dynamic = "force-dynamic";

/** Styled .xlsx of the canteen / snack list (sorted level → name). */
export async function GET() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return new NextResponse("No tenant", { status: 400 });

  const { rows, yearLabel } = await runWithTenant({ tenantId, slug: null }, () =>
    loadCantineRows(),
  );

  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}/${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}/${now.getFullYear()}`;

  const buf = await buildWorkbook({
    title: "Cantine / Collation",
    subtitle: `${rows.length} élève(s) inscrit(s) · ${yearLabel}`,
    generatedOn: stamp,
    report: {
      columns: [...CANTINE_EXPORT_COLUMNS],
      rows: toExportRows(rows),
      filterSummary: yearLabel,
    },
  });

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cantine-collation-${yearLabel || "export"}.xlsx"`,
    },
  });
}
