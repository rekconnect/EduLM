import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { ReportHeader, StatTiles, BarList, toRows } from "../_ui";
import { ExportCsvButton } from "../_export";

export default async function EffectifsReport() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, label: true, isActive: true },
    });
    const activeYear = years.find((y) => y.isActive) ?? years[0] ?? null;

    // Active-year classes with their head-count.
    const classes = activeYear
      ? await db.class.findMany({
          where: { academicYearId: activeYear.id },
          select: {
            id: true,
            name: true,
            level: true,
            section: true,
            _count: { select: { enrollments: true } },
          },
        })
      : [];
    classes.sort(
      (a, b) =>
        a.level.localeCompare(b.level, "fr") ||
        a.section.localeCompare(b.section, "fr"),
    );

    const totalActive = classes.reduce((a, c) => a + c._count.enrollments, 0);

    // By level (active year).
    const byLevel = new Map<string, number>();
    for (const c of classes) {
      byLevel.set(c.level, (byLevel.get(c.level) ?? 0) + c._count.enrollments);
    }

    // Enrollment evolution — count per academic year, last 5 years.
    const grouped = await db.enrollment.groupBy({
      by: ["academicYearId"],
      _count: { _all: true },
    });
    const countByYearId = new Map(
      grouped.map((g) => [g.academicYearId, g._count._all]),
    );
    const evolution = years
      .map((y) => ({ label: y.label, value: countByYearId.get(y.id) ?? 0 }))
      .slice(0, 5)
      .reverse();

    return (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <ReportHeader
          title="Effectifs"
          description={
            activeYear
              ? `Année active · ${activeYear.label}`
              : "Aucune année active configurée"
          }
        />

        <StatTiles
          items={[
            { label: "Élèves inscrits (année active)", value: totalActive },
            { label: "Classes", value: classes.length },
            { label: "Niveaux", value: byLevel.size },
            { label: "Années couvertes", value: years.length },
          ]}
        />

        <BarList
          title="Effectif par niveau (année active)"
          rows={toRows(byLevel)}
        />

        {/* Effectif par classe */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
              Effectif par classe
            </h2>
            <ExportCsvButton
              filename={`effectifs-classes-${activeYear?.label ?? "na"}`}
              headers={["Niveau", "Classe", "Effectif"]}
              rows={classes.map((c) => [c.level, c.name, c._count.enrollments])}
            />
          </div>
          <Table>
            <THead>
              <TR>
                <TH className="text-start">Niveau</TH>
                <TH className="text-start">Classe</TH>
                <TH className="text-end">Effectif</TH>
              </TR>
            </THead>
            <tbody>
              {classes.length === 0 ? (
                <EmptyRow colSpan={3}>Aucune classe pour l&apos;année active.</EmptyRow>
              ) : (
                classes.map((c) => (
                  <TR key={c.id}>
                    <TD className="text-[color:var(--color-foreground-muted)]">
                      {c.level}
                    </TD>
                    <TD className="font-medium">{c.name}</TD>
                    <TD className="text-end tabular-nums">
                      {c._count.enrollments}
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </section>

        {/* Évolution */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
              Évolution des effectifs (5 dernières années)
            </h2>
            <ExportCsvButton
              filename="effectifs-evolution"
              headers={["Année", "Élèves inscrits"]}
              rows={evolution.map((e) => [e.label, e.value])}
            />
          </div>
          <BarList title="Élèves inscrits par année" rows={evolution} />
        </section>
      </main>
    );
  });
}
