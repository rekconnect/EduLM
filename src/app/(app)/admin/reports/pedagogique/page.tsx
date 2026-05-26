import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { requireRole } from "@/lib/session";
import { ReportView } from "../_report-view";
import {
  csv,
  listCyclesForReports,
  pedagogiqueReport,
  type PedagogiqueRow,
} from "../_actions";

export default async function PedagogiqueReportPage({
  searchParams,
}: {
  searchParams: Promise<{ cycleId?: string }>;
}) {
  await requireRole("SCHOOL_ADMIN");
  const { cycleId } = await searchParams;
  const cycleFilter = cycleId || null;

  const [t, rows, cycles] = await Promise.all([
    getTranslations("reports"),
    pedagogiqueReport(cycleFilter),
    listCyclesForReports(),
  ]);

  const columns = [
    { key: "childName" as const, header: t("col.child") },
    { key: "niveau" as const, header: t("col.niveau") },
    { key: "arabe" as const, header: t("pedagogique.colArabe") },
    { key: "lva" as const, header: "LVA" },
    { key: "lvb" as const, header: "LVB" },
    { key: "lvc" as const, header: "LVC" },
    { key: "specialites" as const, header: t("pedagogique.colSpecialites") },
    { key: "bfi" as const, header: t("pedagogique.colBfi") },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <PageHeader
        title={t("pedagogique.title")}
        description={t("pedagogique.description")}
        action={
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
            {t("backToReports")}
          </Link>
        }
      />

      <ReportView<PedagogiqueRow>
        title={t("pedagogique.title")}
        rows={rows}
        columns={columns}
        csvFilename={`pedagogique_${cycleFilter ?? "all"}.csv`}
        csvContent={csv(rows, columns)}
        cycles={cycles}
        currentCycleId={cycleFilter}
        searchKeys={["childName", "niveau", "specialites"]}
      />
    </main>
  );
}
