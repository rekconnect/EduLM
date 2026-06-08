/**
 * Read-only: explore Isc_TmpStudent — the in-progress registration table that
 * also holds photo authorizations. Columns, row count, auth fill rate, and
 * whether ACTIVE EduLM students have auth there.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  console.log("=== Isc_TmpStudent columns ===");
  const cols = await darsQuery<{ name: string }>(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Isc_TmpStudent' ORDER BY ORDINAL_POSITION`,
  );
  console.log(cols.map((c) => c.name).join(", "));

  console.log("\n=== Isc_TmpStudent counts / auth fill by SYear ===");
  console.table(
    await darsQuery(
      `SELECT SYear, COUNT(*) AS rows,
              SUM(CASE WHEN AllowPublishImages IS NOT NULL THEN 1 ELSE 0 END) AS site_set,
              SUM(CASE WHEN AllowPublishImages = 1 THEN 1 ELSE 0 END) AS site_yes,
              SUM(CASE WHEN Snacks IS NOT NULL THEN 1 ELSE 0 END) AS snacks_set,
              SUM(CASE WHEN BusRegistered IS NOT NULL THEN 1 ELSE 0 END) AS bus_set
       FROM Isc_TmpStudent WHERE Id_College=${C} GROUP BY SYear ORDER BY SYear DESC`,
    ),
  );

  // Do active EduLM students have auth in Isc_TmpStudent?
  const active = await prisma.student.findMany({
    where: { tenantId: tenant.id, status: "ENROLLED", darsStudentId: { not: null } },
    select: { darsStudentId: true },
    take: 4000,
  });
  const ids = active.map((s) => Number(s.darsStudentId)).filter((n) => n > 0);
  const inList = ids.length ? ids.join(",") : "-1";
  console.log(`\nActive EduLM students: ${ids.length}`);
  console.log("Their Isc_TmpStudent auth/services — YES counts:");
  console.table(
    await darsQuery(
      `SELECT COUNT(DISTINCT Id_Student) AS active_rows,
              SUM(CASE WHEN AllowPublishImages=1 THEN 1 ELSE 0 END) AS site_yes,
              SUM(CASE WHEN AllowPublishToSouvenirBook=1 THEN 1 ELSE 0 END) AS livre_yes,
              SUM(CASE WHEN AllowPublishToSocialMedia=1 THEN 1 ELSE 0 END) AS reseaux_yes,
              SUM(CASE WHEN AllowPublishAudio=1 THEN 1 ELSE 0 END) AS radio_yes,
              SUM(CASE WHEN Snacks=1 THEN 1 ELSE 0 END) AS snacks_yes,
              SUM(CASE WHEN Cafeteria=1 THEN 1 ELSE 0 END) AS cafeteria_yes,
              SUM(CASE WHEN BusRegistered=1 THEN 1 ELSE 0 END) AS bus_yes
       FROM Isc_TmpStudent
       WHERE Id_College=${C} AND Id_Student IN (${inList}) AND SYear=2026`,
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
