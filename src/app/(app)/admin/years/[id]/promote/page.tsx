import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { nextLevel } from "@/lib/levels";
import { PromoteClient } from "./_client";

export default async function PromotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const target = await db.academicYear.findUnique({
      where: { id },
      select: { id: true, label: true, startDate: true },
    });
    if (!target) notFound();

    const source = await db.academicYear.findFirst({
      where: { startDate: { lt: target.startDate }, enrollments: { some: {} } },
      orderBy: { startDate: "desc" },
      select: { id: true, label: true },
    });

    if (!source) {
      return (
        <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
          <PageHeader
            title={`Promouvoir vers ${target.label}`}
            description="Fait monter tous les élèves d'un niveau depuis l'année précédente."
          />
          <p className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-4 py-6 text-sm text-[color:var(--color-foreground-muted)]">
            Aucune année précédente avec des inscriptions n'a été trouvée — il
            n'y a personne à promouvoir.
          </p>
        </main>
      );
    }

    const [srcEnroll, alreadyRows] = await Promise.all([
      db.enrollment.findMany({
        where: { academicYearId: source.id },
        select: {
          student: { select: { id: true, firstName: true, lastName: true } },
          class: { select: { level: true } },
        },
      }),
      db.enrollment.findMany({
        where: { academicYearId: target.id },
        select: { studentId: true },
      }),
    ]);
    const already = new Set(alreadyRows.map((r) => r.studentId));

    const promotable: {
      id: string;
      name: string;
      from: string;
      to: string;
    }[] = [];
    let graduating = 0;
    let alreadyCount = 0;
    for (const e of srcEnroll) {
      const nl = nextLevel(e.class.level);
      if (nl === null) {
        graduating++;
        continue;
      }
      if (already.has(e.student.id)) {
        alreadyCount++;
        continue;
      }
      promotable.push({
        id: e.student.id,
        name: `${e.student.lastName} ${e.student.firstName}`.trim(),
        from: e.class.level,
        to: nl,
      });
    }
    promotable.sort((a, b) => a.name.localeCompare(b.name));

    return (
      <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
        <PageHeader
          title={`Promouvoir vers ${target.label}`}
          description={`Fait monter les élèves de ${source.label} d'un niveau. Décochez ceux qui redoublent ou ne montent pas.`}
        />
        <PromoteClient
          targetYearId={target.id}
          targetLabel={target.label}
          sourceLabel={source.label}
          promotable={promotable}
          graduating={graduating}
          alreadyCount={alreadyCount}
        />
      </main>
    );
  });
}
