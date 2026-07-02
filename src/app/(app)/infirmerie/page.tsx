import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { InfirmerieList, type InfirmerieRow } from "./_list";

/**
 * Infirmary dashboard: every active-year student with their medical alerts
 * (allergies, chronic conditions, sport exemptions) at a glance, plus visit
 * counts. Sensitive — SCHOOL_ADMIN only. Links to each fiche's Santé tab.
 */
export default async function InfirmeriePage() {
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

    const students = await db.student.findMany({
      where: { enrollments: { some: { academicYear: { isActive: true } } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        // Only the flags the list renders — not the wide free-text columns
        // (medications, hospitalization, familyHistory, remarks, …).
        medicalRecord: {
          select: {
            asthma: true,
            diabetic: true,
            epilepsy: true,
            cardiacProblem: true,
            scoliosis: true,
            favism: true,
            hemophilia: true,
            allergies: true,
            unfitForSports: true,
          },
        },
        _count: { select: { medicalVisits: true, immunizations: true } },
        enrollments: {
          where: { academicYear: { isActive: true } },
          select: { class: { select: { name: true, level: true } } },
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const rows: InfirmerieRow[] = students.map((st) => {
      const r = st.medicalRecord;
      const conditions: string[] = [];
      if (r?.asthma) conditions.push("Asthme");
      if (r?.diabetic) conditions.push("Diabète");
      if (r?.epilepsy) conditions.push("Épilepsie");
      if (r?.cardiacProblem) conditions.push("Cardiaque");
      if (r?.scoliosis) conditions.push("Scoliose");
      if (r?.favism) conditions.push("Favisme");
      if (r?.hemophilia) conditions.push("Hémophilie");
      return {
        id: st.id,
        name: `${st.lastName} ${st.firstName}`,
        className: st.enrollments[0]?.class.name ?? "",
        level: st.enrollments[0]?.class.level ?? "",
        allergies: r?.allergies ?? "",
        conditions,
        unfitForSports: r?.unfitForSports ?? false,
        hasRecord: !!r,
        visits: st._count.medicalVisits,
        immunizations: st._count.immunizations,
      };
    });

    return (
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-10">
        <PageHeader
          title="Infirmerie"
          description="Dossiers médicaux, allergies et visites des élèves de l'année active"
        />
        <InfirmerieList rows={rows} />
      </main>
    );
  });
}
