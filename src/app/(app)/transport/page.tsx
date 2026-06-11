import { PageHeader } from "@/components/shell/page-header";
import { withTenantSession } from "@/lib/session";
import { saveBusAssignments } from "../students/_actions";
import { TransportManager } from "./_manager";
import { loadBusRows } from "./_data";

/**
 * Bus admin dashboard: every student of the selected year registered for
 * transport, with per-direction assignment (AS aller / RS retour) PER
 * TRIMESTER (assignments change each trimester). Year + trimester pickers,
 * trajet filter, 50/page, Excel + PDF exports.
 */
export default async function TransportPage({
  searchParams,
}: {
  searchParams: Promise<{ yearId?: string; trim?: string }>;
}) {
  const { yearId, trim } = await searchParams;

  return withTenantSession(async (user) => {
    if (user.role !== "SCHOOL_ADMIN") {
      return (
        <main className="mx-auto max-w-3xl px-6 py-10">
          <p className="text-sm text-[color:var(--color-foreground-muted)]">
            Accès réservé aux administrateurs.
          </p>
        </main>
      );
    }

    const data = await loadBusRows({ yearId, trim });
    const saveForPeriod = saveBusAssignments.bind(null, data.period);

    return (
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-10">
        <PageHeader
          title="Transport — affectation des bus"
          description={`${data.rows.length} élève(s) inscrit(s) au bus · ${data.yearLabel} · Trimestre ${data.trim.slice(1)}`}
        />
        <TransportManager
          rows={data.rows}
          years={data.years}
          selectedYearId={data.selectedYearId}
          trim={data.trim}
          onSave={saveForPeriod}
        />
      </main>
    );
  });
}
