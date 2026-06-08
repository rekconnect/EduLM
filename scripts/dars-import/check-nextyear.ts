/**
 * Read-only: how much of the NEXT-year (2026-2027) registration is in EduLM
 * (imported from Isc_ModifStudents SYear=2027) vs still only in the in-progress
 * Isc_TmpStudent SYear=2027.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // EduLM: how many students have a "2026-2027" entry in registration_by_year,
  // and which fields are present.
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { customAnswers: true },
  });
  let has2027 = 0;
  let auth2027 = 0;
  let transport2027 = 0;
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    if (typeof ca.registration_by_year !== "string") continue;
    let m: Record<string, Record<string, string>>;
    try {
      m = JSON.parse(ca.registration_by_year);
    } catch {
      continue;
    }
    const y = m["2026-2027"];
    if (!y) continue;
    has2027++;
    if (y.auth_site || y.auth_livre || y.auth_reseaux || y.auth_radio) auth2027++;
    if (y.autocar || y.transport_aller || y.transport_retour) transport2027++;
  }
  console.log("EduLM — students with a 2026-2027 registration entry:");
  console.log(`  total: ${has2027}`);
  console.log(`  with any transport field: ${transport2027}`);
  console.log(`  with any authorization: ${auth2027}`);

  // Dars source split for SYear 2027.
  console.log("\nDars SYear=2027 source split:");
  console.table(
    await darsQuery(
      `SELECT 'Isc_ModifStudents (submitted)' AS source, COUNT(*) AS rows,
              SUM(CASE WHEN AllowPublishImages IS NOT NULL THEN 1 ELSE 0 END) AS auth_set
       FROM Isc_ModifStudents WHERE Id_College=${C} AND SYear=2027
       UNION ALL
       SELECT 'Isc_TmpStudent (in-progress)', COUNT(*),
              SUM(CASE WHEN AllowPublishImages IS NOT NULL THEN 1 ELSE 0 END)
       FROM Isc_TmpStudent WHERE Id_College=${C} AND SYear=2027`,
    ),
  );

  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});
