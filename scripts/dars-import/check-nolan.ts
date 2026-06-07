/**
 * Diagnostic: compare the services / authorizations for a student across the
 * THREE sources — EduLM customAnswers, Dars registration form
 * (Isc_ModifStudents), and Dars billing tariffs — to pin down a mismatch.
 *
 * Read-only. Defaults to family code R0011 / firstName "Nolan".
 *   npx tsx scripts/dars-import/check-nolan.ts --tenant-name="Lycée Montaigne"
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      firstName: { contains: "Nolan", mode: "insensitive" },
      family: { code: "R0011" },
    },
    select: {
      firstName: true,
      lastName: true,
      darsStudentId: true,
      customAnswers: true,
      family: { select: { code: true } },
    },
  });
  if (students.length === 0) {
    console.log("No EduLM student matched Nolan / R0011.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    const did = Number(s.darsStudentId);
    console.log(`\n=== ${s.firstName} ${s.lastName}  (family ${s.family?.code}, dars ${did}) ===`);
    console.log("EduLM customAnswers:");
    console.log(
      `  collations=${JSON.stringify(ca.collations)} repas_chaud=${JSON.stringify(ca.repas_chaud)} autocar=${JSON.stringify(ca.autocar)}`,
    );
    console.log(
      `  auth_site=${JSON.stringify(ca.auth_site)} auth_livre=${JSON.stringify(ca.auth_livre)} auth_reseaux=${JSON.stringify(ca.auth_reseaux)} auth_radio=${JSON.stringify(ca.auth_radio)}`,
    );

    const mod = await darsQuery(
      `SELECT TOP 3 SYear, HasSnack, HasHotMeal, BusRegistered,
              AllowPublishImages, AllowPublishToSouvenirBook, AllowPublishToSocialMedia, AllowPublishAudio
       FROM Isc_ModifStudents WHERE Id_College=${C} AND Id_Student=${did} ORDER BY SYear DESC`,
    );
    console.log("Dars Isc_ModifStudents (latest years):");
    console.table(mod);

    const bill = await darsQuery(
      `SELECT fe.Annee, tt.Code, COUNT(*) AS n
       FROM Fct_Eleve_Tarif et
       JOIN Fct_Tarif_Classe tc ON tc.ID = et.Id_Tarif_Classe
       JOIN Fct_Type_Tarif tt ON tt.ID = tc.Id_Tarif
       JOIN Fct_Factures_Entete fe ON fe.ID = et.ID_Entete
       WHERE et.Id_College=${C} AND et.Id_Eleve=${did} AND tt.Code IN ('COL','CAN','TRANS')
       GROUP BY fe.Annee, tt.Code ORDER BY fe.Annee DESC, tt.Code`,
    );
    console.log("Dars billing tariffs (COL/CAN/TRANS by year):");
    console.table(bill);
  }

  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});
