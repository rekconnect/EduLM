import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
const p = new PrismaClient();

async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  const T = t!.id;

  // ── B. type_famille for some mothers ──
  console.log("══════ type_famille (mothers) ══════");
  const moms = await p.user.findMany({
    where: { tenantId: T, role: "PARENT", guardianProfile: { relation: "mere" } },
    take: 6,
    select: { firstName: true, lastName: true, customAnswers: true },
  });
  for (const m of moms) {
    const ca = (m.customAnswers ?? {}) as Record<string, unknown>;
    console.log(`  ${m.firstName} ${m.lastName}: type_famille=${JSON.stringify(ca.type_famille)} actuel=${JSON.stringify(ca.actuel)}`);
  }

  // ── C. Ibrahim kids 2017/2018 — Dars modif vs EduLM ──
  console.log("\n══════ Ibrahim kids — Dars Isc_ModifStudents ══════");
  console.table(
    await darsQuery(
      `SELECT Id_Student, SYear, BusRegistered, Transportation_BusMorning, Transportation_BusEvening,
              HasSnack, HasHotMeal, AllowLeaveAlone, AllowPublishImages, AllowPublishToSouvenirBook,
              AllowPublishToSocialMedia, AllowPublishAudio
       FROM Isc_ModifStudents WHERE Id_College=${C} AND Id_Student IN (2017, 2018) ORDER BY Id_Student, SYear`,
    ),
  );
  console.log("EduLM customAnswers for those kids:");
  const kids = await p.student.findMany({
    where: { tenantId: T, darsStudentId: { in: [2017, 2018] } },
    select: { firstName: true, lastName: true, customAnswers: true },
  });
  for (const k of kids) {
    const ca = (k.customAnswers ?? {}) as Record<string, unknown>;
    console.log(`  ${k.firstName} ${k.lastName}: autocar=${JSON.stringify(ca.autocar)} details=${JSON.stringify(ca.autocar_details)} auth_site=${JSON.stringify(ca.auth_site)} auth_livre=${JSON.stringify(ca.auth_livre)}`);
  }

  // ── A. Actual for fathers ──
  console.log("\n══════ Actual flag — fathers vs mothers (Dars) ══════");
  console.table(
    await darsQuery(
      `SELECT
         SUM(CASE WHEN ID_Father IS NOT NULL THEN 1 ELSE 0 END) AS note
       FROM Isc_Student WHERE Id_College=${C} AND 1=0`,
    ),
  );
  console.log("(Actual is a column on every Isc_Parent — see earlier: 2677 true / 5 false)");

  await closeDars();
  await p.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await p.$disconnect(); process.exit(1); });
