import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { db } from "@/lib/db";
import { ReportHeader, StatTiles, BarList, toRows } from "../_ui";
import { ExportCsvButton } from "../_export";

const GENDER_LABELS: Record<string, string> = {
  MALE: "Garçons",
  FEMALE: "Filles",
  OTHER: "Autre",
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export default async function DemographieReport() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, label: true, isActive: true },
    });
    const activeYear = years.find((y) => y.isActive) ?? years[0] ?? null;

    const cohort = activeYear
      ? await db.student.findMany({
          where: { enrollments: { some: { academicYearId: activeYear.id } } },
          select: {
            gender: true,
            dob: true,
            nationality: true,
            customAnswers: true,
          },
        })
      : [];
    const total = cohort.length;

    const gender = new Map<string, number>();
    const nationality = new Map<string, number>();
    const communaute = new Map<string, number>();
    const birthYear = new Map<string, number>();

    for (const s of cohort) {
      const ca = (s.customAnswers ?? {}) as Record<string, unknown>;

      const g = s.gender ? GENDER_LABELS[s.gender] ?? "Autre" : "Non renseigné";
      gender.set(g, (gender.get(g) ?? 0) + 1);

      const nat = str(ca.nationalite) || str(s.nationality) || "Non renseignée";
      nationality.set(nat, (nationality.get(nat) ?? 0) + 1);

      const com = str(ca.communaute_eleve) || "Non renseignée";
      communaute.set(com, (communaute.get(com) ?? 0) + 1);

      if (s.dob) {
        const yr = String(s.dob.getUTCFullYear());
        birthYear.set(yr, (birthYear.get(yr) ?? 0) + 1);
      }
    }

    const natRows = toRows(nationality);
    const birthRows = [...birthYear.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <ReportHeader
          title="Démographie"
          description={
            activeYear
              ? `Année active · ${activeYear.label}`
              : "Aucune année active configurée"
          }
        />

        <StatTiles
          items={[
            { label: "Élèves (année active)", value: total },
            { label: "Garçons", value: gender.get("Garçons") ?? 0 },
            { label: "Filles", value: gender.get("Filles") ?? 0 },
            {
              label: "Nationalités distinctes",
              value: [...nationality.keys()].filter(
                (k) => k !== "Non renseignée",
              ).length,
            },
          ]}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <BarList title="Répartition par genre" rows={toRows(gender)} />
          <BarList title="Communauté" rows={toRows(communaute)} />
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
              Nationalités
            </h2>
            <ExportCsvButton
              filename={`demographie-nationalites-${activeYear?.label ?? "na"}`}
              headers={["Nationalité", "Élèves"]}
              rows={natRows.map((r) => [r.label, r.value])}
            />
          </div>
          <BarList title="Répartition par nationalité (top 12)" rows={natRows.slice(0, 12)} />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
              Année de naissance
            </h2>
            <ExportCsvButton
              filename={`demographie-naissance-${activeYear?.label ?? "na"}`}
              headers={["Année de naissance", "Élèves"]}
              rows={birthRows.map((r) => [r.label, r.value])}
            />
          </div>
          <BarList title="Répartition par année de naissance" rows={birthRows} />
        </section>
      </main>
    );
  });
}
