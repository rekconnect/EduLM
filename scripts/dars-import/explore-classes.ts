import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  for (const sy of [2027, 2026]) {
    console.log(`\n===== Dars classes SYear ${sy} =====`);
    const rows = await darsQuery(
      `SELECT ID_Class, ClassName, ClassNameFR, Section, Id_Division,
              (SELECT COUNT(*) FROM Isc_StudentClass sc WHERE sc.ID_Class = c.ID_Class AND sc.Registered = 1) AS registered
       FROM Isc_Classes c
       WHERE c.Id_College = ${C} AND c.SYear = ${sy}
       ORDER BY c.ClassName, c.Section`,
    );
    console.table(rows);
  }
  await closeDars();
}
main().catch(async (e) => { console.error(e); await closeDars(); process.exit(1); });
