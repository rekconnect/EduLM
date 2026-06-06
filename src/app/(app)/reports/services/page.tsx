import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { ReportHeader, StatTiles } from "../_ui";
import { ExportCsvButton } from "../_export";

const isYes = (v: unknown) =>
  typeof v === "string" && /^(yes|oui|true|1)$/i.test(v.trim());

const pct = (n: number, total: number) =>
  total > 0 ? `${Math.round((n / total) * 100)}%` : "—";

export default async function ServicesReport() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, label: true, isActive: true },
    });
    const activeYear = years.find((y) => y.isActive) ?? years[0] ?? null;

    // Current-year cohort: students enrolled in the active year.
    const cohort = activeYear
      ? await db.student.findMany({
          where: { enrollments: { some: { academicYearId: activeYear.id } } },
          select: { customAnswers: true },
        })
      : [];
    const total = cohort.length;

    let transport = 0;
    let cantine = 0;
    let collation = 0;
    for (const s of cohort) {
      const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
      if (isYes(ca.autocar)) transport++;
      if (isYes(ca.repas_chaud)) cantine++;
      if (isYes(ca.collations)) collation++;
    }

    const summary = [
      { key: "transport", label: "Transport (autocar)", value: transport },
      { key: "cantine", label: "Cantine (repas chaud)", value: cantine },
      { key: "collation", label: "Collation", value: collation },
    ];

    // Per-year evolution from customAnswers.services_by_year on all students.
    const all = await db.student.findMany({
      select: { customAnswers: true },
    });
    const perYear = new Map<
      string,
      { transport: number; cantine: number; collation: number }
    >();
    for (const s of all) {
      const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
      const raw = ca.services_by_year;
      if (typeof raw !== "string") continue;
      let map: Record<string, string>;
      try {
        map = JSON.parse(raw) as Record<string, string>;
      } catch {
        continue;
      }
      for (const [yr, svc] of Object.entries(map)) {
        const bucket =
          perYear.get(yr) ?? { transport: 0, cantine: 0, collation: 0 };
        if (svc.includes("Transport")) bucket.transport++;
        if (svc.includes("Cantine")) bucket.cantine++;
        if (svc.includes("Collation")) bucket.collation++;
        perYear.set(yr, bucket);
      }
    }
    const evolution = [...perYear.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-5);

    return (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <ReportHeader
          title="Services"
          description={
            activeYear
              ? `Année active · ${activeYear.label} — source facturation`
              : "Aucune année active configurée"
          }
        />

        <StatTiles
          items={[
            { label: "Transport", value: transport },
            { label: "Cantine", value: cantine },
            { label: "Collation", value: collation },
            { label: "Élèves (année active)", value: total },
          ]}
        />

        {/* Récapitulatif année active */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
              Utilisation des services (année active)
            </h2>
            <ExportCsvButton
              filename={`services-${activeYear?.label ?? "na"}`}
              headers={["Service", "Élèves", "Part"]}
              rows={summary.map((s) => [s.label, s.value, pct(s.value, total)])}
            />
          </div>
          <Table>
            <THead>
              <TR>
                <TH className="text-start">Service</TH>
                <TH className="text-end">Élèves</TH>
                <TH className="text-end">Part de l&apos;effectif</TH>
              </TR>
            </THead>
            <tbody>
              {summary.map((s) => (
                <TR key={s.key}>
                  <TD className="font-medium">{s.label}</TD>
                  <TD className="text-end tabular-nums">{s.value}</TD>
                  <TD className="text-end tabular-nums text-[color:var(--color-foreground-muted)]">
                    {pct(s.value, total)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>

        {/* Évolution */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
              Évolution par année (5 dernières années)
            </h2>
            <ExportCsvButton
              filename="services-evolution"
              headers={["Année", "Transport", "Cantine", "Collation"]}
              rows={evolution.map((e) => [
                e.label,
                e.transport,
                e.cantine,
                e.collation,
              ])}
            />
          </div>
          <Table>
            <THead>
              <TR>
                <TH className="text-start">Année</TH>
                <TH className="text-end">Transport</TH>
                <TH className="text-end">Cantine</TH>
                <TH className="text-end">Collation</TH>
              </TR>
            </THead>
            <tbody>
              {evolution.length === 0 ? (
                <EmptyRow colSpan={4}>Aucun historique de services.</EmptyRow>
              ) : (
                evolution.map((e) => (
                  <TR key={e.label}>
                    <TD className="font-medium">{e.label}</TD>
                    <TD className="text-end tabular-nums">{e.transport}</TD>
                    <TD className="text-end tabular-nums">{e.cantine}</TD>
                    <TD className="text-end tabular-nums">{e.collation}</TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </section>
      </main>
    );
  });
}
