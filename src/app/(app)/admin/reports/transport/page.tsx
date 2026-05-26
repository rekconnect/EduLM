import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { requireRole } from "@/lib/session";
import { ReportView } from "../_report-view";
import {
  csv,
  listCyclesForReports,
  transportReport,
  type TransportRow,
} from "../_actions";

export default async function TransportReportPage({
  searchParams,
}: {
  searchParams: Promise<{ cycleId?: string }>;
}) {
  await requireRole("SCHOOL_ADMIN");
  const { cycleId } = await searchParams;
  const cycleFilter = cycleId || null;

  const [t, rows, cycles] = await Promise.all([
    getTranslations("reports"),
    transportReport(cycleFilter),
    listCyclesForReports(),
  ]);

  const columns = [
    { key: "childName" as const, header: t("col.child") },
    { key: "establishment" as const, header: t("col.establishment") },
    { key: "niveau" as const, header: t("col.niveau") },
    { key: "modeAller" as const, header: t("transport.colAller") },
    { key: "modeRetour" as const, header: t("transport.colRetour") },
    { key: "collation" as const, header: t("transport.colCollation") },
    { key: "cantine" as const, header: t("transport.colCantine") },
    { key: "altAddress" as const, header: t("transport.colAlt") },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <PageHeader
        title={t("transport.title")}
        description={t("transport.description")}
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

      <ReportView<TransportRow>
        title={t("transport.title")}
        rows={rows}
        columns={columns}
        csvFilename={`transport_${cycleFilter ?? "all"}.csv`}
        csvContent={csv(rows, columns)}
        cycles={cycles}
        currentCycleId={cycleFilter}
        searchKeys={["childName", "niveau", "establishment"]}
      />
    </main>
  );
}
