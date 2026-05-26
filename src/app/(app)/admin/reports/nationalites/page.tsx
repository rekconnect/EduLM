import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { requireRole } from "@/lib/session";
import { ReportView } from "../_report-view";
import {
  csv,
  listCyclesForReports,
  nationalitesReport,
  type NationaliteRow,
} from "../_actions";

export default async function NationalitesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ cycleId?: string }>;
}) {
  await requireRole("SCHOOL_ADMIN");
  const { cycleId } = await searchParams;
  const cycleFilter = cycleId || null;

  const [t, rows, cycles] = await Promise.all([
    getTranslations("reports"),
    nationalitesReport(cycleFilter),
    listCyclesForReports(),
  ]);

  const columns = [
    { key: "childName" as const, header: t("col.child") },
    { key: "niveau" as const, header: t("col.niveau") },
    {
      key: "childIsLebanese" as const,
      header: t("nationalites.colIsLebanese"),
    },
    {
      key: "childPassportLebanese" as const,
      header: t("nationalites.colPassportLebanese"),
    },
    {
      key: "childNationality1" as const,
      header: t("nationalites.colNationality1"),
    },
    {
      key: "childNationality2" as const,
      header: t("nationalites.colNationality2"),
    },
    {
      key: "countryOfBirth" as const,
      header: t("nationalites.colBirthCountry"),
    },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <PageHeader
        title={t("nationalites.title")}
        description={t("nationalites.description")}
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

      <ReportView<NationaliteRow>
        title={t("nationalites.title")}
        rows={rows}
        columns={columns}
        csvFilename={`nationalites_${cycleFilter ?? "all"}.csv`}
        csvContent={csv(rows, columns)}
        cycles={cycles}
        currentCycleId={cycleFilter}
        searchKeys={["childName", "niveau", "childNationality1", "childNationality2"]}
      />
    </main>
  );
}
