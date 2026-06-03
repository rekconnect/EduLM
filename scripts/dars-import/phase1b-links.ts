/**
 * Phase 1b — finish the StudentGuardian links.
 *
 * The Phase 1 run created families/parents/students but hit a connection-
 * pool timeout (limit=1) on the links stage at chunk size 50. This script
 * rebuilds the parent/student id maps from the DB and re-creates the links
 * with safe, low concurrency. Idempotent.
 *
 *   npx tsx scripts/dars-import/phase1b-links.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/phase1b-links.ts --tenant-name="Lycée Montaigne" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

type DStudent = { ID_Student: number; ID_Father: number | null; ID_Mother: number | null; ID_Gardian: number | null };

async function main() {
  const { tenantName, confirm } = parseFlags();
  const sinceArg = process.argv.find((a) => a.startsWith("--since-year="));
  const sinceYear = sinceArg ? Number(sinceArg.split("=")[1]) : 2021;
  const tenant = await resolveTenant(prisma, tenantName);

  const students = await darsQuery<DStudent>(
    `SELECT ID_Student, ID_Father, ID_Mother, ID_Gardian FROM Isc_Student
     WHERE Id_College = ${C} AND ID_Student IN (
       SELECT DISTINCT ID_Student FROM Isc_StudentClass WHERE Id_College = ${C} AND SYear >= ${sinceYear}
     )`,
  );

  const eduStudents = await prisma.student.findMany({
    where: { tenantId: tenant.id, darsStudentId: { not: null } },
    select: { id: true, darsStudentId: true },
  });
  const studentByDars = new Map(eduStudents.map((s) => [Number(s.darsStudentId), s.id]));

  const guardians = await prisma.guardian.findMany({
    where: { tenantId: tenant.id, user: { darsParentId: { not: null } } },
    select: { id: true, user: { select: { darsParentId: true } } },
  });
  const guardianByParent = new Map(guardians.map((g) => [Number(g.user.darsParentId), g.id]));

  type Link = { studentId: string; guardianId: string; isPrimary: boolean };
  const links: Link[] = [];
  for (const s of students) {
    const studentId = studentByDars.get(Number(s.ID_Student));
    if (!studentId) continue;
    const seen = new Set<number>();
    for (const slot of [s.ID_Father, s.ID_Mother, s.ID_Gardian]) {
      if (slot == null || Number(slot) <= 0) continue;
      const pid = Number(slot);
      if (seen.has(pid)) continue;
      seen.add(pid);
      const guardianId = guardianByParent.get(pid);
      if (!guardianId) continue;
      links.push({ studentId, guardianId, isPrimary: Number(s.ID_Gardian) === pid });
    }
  }

  console.log(`Students in scope: ${students.length}`);
  console.log(`Guardian map: ${guardianByParent.size}, Student map: ${studentByDars.size}`);
  console.log(`Links to upsert: ${links.length}`);

  if (!confirm) {
    console.log("🟡 DRY RUN — re-run with --confirm.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  const size = 10; // safe for connection_limit=1
  for (let i = 0; i < links.length; i += size) {
    const slice = links.slice(i, i + size);
    await Promise.all(
      slice.map((l) =>
        prisma.studentGuardian.upsert({
          where: { studentId_guardianId: { studentId: l.studentId, guardianId: l.guardianId } },
          update: { isPrimary: l.isPrimary },
          create: l,
        }),
      ),
    );
    done += slice.length;
    process.stdout.write(`\r  links: ${done}/${links.length}`);
  }
  process.stdout.write("\n✓ Links complete.\n");
  await closeDars();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nERROR:", e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});
