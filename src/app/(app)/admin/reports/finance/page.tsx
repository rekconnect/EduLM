import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { requireRole } from "@/lib/session";
import { ReportView } from "../_report-view";
import {
  csv,
  financeReport,
  listCyclesForReports,
  type FinanceRow,
} from "../_actions";

export default async function FinanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ cycleId?: string }>;
}) {
  await requireRole("SCHOOL_ADMIN");
  const { cycleId } = await searchParams;
  const cycleFilter = cycleId || null;

  const [t, rows, cycles] = await Promise.all([
    getTranslations("reports"),
    financeReport(cycleFilter),
    listCyclesForReports(),
  ]);

  const columns = [
    { key: "childName" as const, header: t("col.child") },
    { key: "niveau" as const, header: t("col.niveau") },
    { key: "ackInterieur" as const, header: t("finance.colAckInterieur") },
    { key: "ackFinancier" as const, header: t("finance.colAckFinancier") },
    { key: "ackMlf" as const, header: t("finance.colAckMlf") },
    { key: "comite" as const, header: t("finance.colComite") },
    { key: "caisseLbp" as const, header: t("finance.colCaisseLbp") },
    { key: "caisseUsd" as const, header: t("finance.colCaisseUsd") },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <PageHeader
        title={t("finance.title")}
        description={t("finance.description")}
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

      <ReportView<FinanceRow>
        title={t("finance.title")}
        rows={rows}
        columns={columns}
        csvFilename={`finance_${cycleFilter ?? "all"}.csv`}
        csvContent={csv(rows, columns)}
        cycles={cycles}
        currentCycleId={cycleFilter}
        searchKeys={["childName", "niveau"]}
      />
    </main>
  );
}
