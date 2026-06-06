import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { getReport } from "@/lib/reports/registry";
import { buildWorkbook } from "@/lib/reports/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return new Response("Aucun établissement.", { status: 400 });

  const { searchParams } = new URL(req.url);
  const def = getReport(searchParams.get("report") ?? "");
  if (!def) return new Response("Rapport inconnu.", { status: 404 });

  const yearId = searchParams.get("year") ?? undefined;
  const classId = searchParams.get("class") ?? undefined;
  const month = searchParams.get("month") ?? undefined;
  const nationality = searchParams.get("nationality") ?? undefined;

  const resolved = await runWithTenant({ tenantId, slug: null }, () =>
    def.run({ yearId, classId, month, nationality }),
  );

  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}/${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}/${now.getFullYear()}`;

  const xlsx = await buildWorkbook({
    title: def.title,
    subtitle: resolved.filterSummary,
    generatedOn: stamp,
    report: resolved,
  });

  const fileStamp = now.toISOString().slice(0, 10);
  const filename = `${def.id}-${fileStamp}.xlsx`;

  return new Response(xlsx, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
