/**
 * Read-only: bound the damage from the draft-local Isc_TmpStudent.ID_Student
 * bug. Confirms Isc_ModifStudents uses the REAL id space (not draft-local), and
 * counts EduLM students potentially polluted by the Tmp merge / ALE import.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // Id spaces. Modif should span the full master range; Tmp is draft-local.
  const ranges = await darsQuery<Record<string, unknown>>(
    `SELECT
       (SELECT MIN(ID_Student) FROM Isc_Student WHERE Id_College=${C}) AS masterMin,
       (SELECT MAX(ID_Student) FROM Isc_Student WHERE Id_College=${C}) AS masterMax,
       (SELECT MIN(Id_Student) FROM Isc_ModifStudents WHERE Id_College=${C}) AS modifMin,
       (SELECT MAX(Id_Student) FROM Isc_ModifStudents WHERE Id_College=${C}) AS modifMax,
       (SELECT COUNT(DISTINCT Id_Student) FROM Isc_ModifStudents WHERE Id_College=${C}) AS modifStudents,
       (SELECT MIN(ID_Student) FROM Isc_TmpStudent WHERE Id_College=${C}) AS tmpMin,
       (SELECT MAX(ID_Student) FROM Isc_TmpStudent WHERE Id_College=${C}) AS tmpMax`,
  );
  console.log("Id spaces (Modif should match master range; Tmp is draft-local):");
  console.table(ranges);

  // Does Modif join to master by id give a sane per-year picture? Modif has no
  // names, so check that Modif.Id_Student values all EXIST as master ids.
  const modifValid = await darsQuery<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(DISTINCT Id_Student) FROM Isc_ModifStudents WHERE Id_College=${C}) AS modifIds,
       (SELECT COUNT(DISTINCT m.Id_Student) FROM Isc_ModifStudents m
          JOIN Isc_Student s ON m.Id_Student=s.ID_Student AND s.Id_College=${C}
          WHERE m.Id_College=${C}) AS modifIdsInMaster`,
  );
  console.log("\nModif ids that exist in master (should be ~equal → Modif is real):");
  console.table(modifValid);

  // EduLM students whose darsStudentId falls in the Tmp draft range (1..270) →
  // those are the ones the Tmp merge / ALE import could have polluted.
  const tmpMax = Number((ranges[0] as Record<string, unknown>).tmpMax ?? 0);
  const inRange = await prisma.student.count({
    where: { tenantId: tenant.id, darsStudentId: { gte: 1, lte: tmpMax } },
  });
  const total = await prisma.student.count({ where: { tenantId: tenant.id } });

  // Arabe import footprint: students with arabe_langue anywhere in reg.
  const withArabe = await prisma.student.findMany({
    where: { tenantId: tenant.id, customAnswers: { not: undefined } },
    select: { customAnswers: true },
  });
  let arabeCount = 0;
  for (const s of withArabe) {
    const ca = s.customAnswers as Record<string, unknown> | null;
    if (ca && typeof ca.registration_by_year === "string" && ca.registration_by_year.includes("arabe_langue"))
      arabeCount++;
  }

  console.log(`\nEduLM students total: ${total}`);
  console.log(`  darsStudentId within Tmp draft range (1..${tmpMax}): ${inRange}  ← potentially polluted by Tmp merge`);
  console.log(`  with arabe_langue set (my ALE import footprint): ${arabeCount}  ← to undo`);

  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});
