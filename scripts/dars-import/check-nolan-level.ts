/**
 * Read-only: Nolan's level + the actual COL tariff lines he's billed under,
 * to understand why collation = "yes" for a non-maternelle pupil.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const st = await prisma.student.findFirst({
    where: { tenantId: tenant.id, firstName: { contains: "Nolan", mode: "insensitive" }, family: { code: "R0011" } },
    select: {
      firstName: true, lastName: true, darsStudentId: true,
      enrollments: {
        orderBy: { academicYear: { startDate: "desc" } },
        take: 3,
        select: { academicYear: { select: { label: true } }, class: { select: { name: true, level: true } } },
      },
    },
  });
  console.log("EduLM enrollments:");
  for (const e of st?.enrollments ?? []) {
    console.log(`  ${e.academicYear.label}: ${e.class.name} (level=${e.class.level})`);
  }
  const did = Number(st?.darsStudentId);

  // The actual tariff lines billed under COL for this student (with names + amounts).
  const lines = await darsQuery(
    `SELECT fe.Annee, tt.Code, tc.TarifName, tt.TypeName, et.Amount
     FROM Fct_Eleve_Tarif et
     JOIN Fct_Tarif_Classe tc ON tc.ID = et.Id_Tarif_Classe
     JOIN Fct_Type_Tarif tt ON tt.ID = tc.Id_Tarif
     JOIN Fct_Factures_Entete fe ON fe.ID = et.ID_Entete
     WHERE et.Id_College=${C} AND et.Id_Eleve=${did} AND fe.Annee=2026
     ORDER BY tt.Code`,
  );
  console.log("\nDars 2025-2026 billed tariff lines (all):");
  console.table(lines);

  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await prisma.$disconnect(); process.exit(1); });
