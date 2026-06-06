import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
async function main() {
  console.log("=== ModifStudents (2027): how many have ANY service/photo filled? ===");
  console.table(
    await darsQuery(
      `SELECT
         COUNT(*) AS rows_2027,
         SUM(CASE WHEN BusRegistered=1 THEN 1 ELSE 0 END) AS bus,
         SUM(CASE WHEN AllowPublishImages=1 THEN 1 ELSE 0 END) AS photo_site,
         SUM(CASE WHEN HasSnack=1 THEN 1 ELSE 0 END) AS snack
       FROM Isc_ModifStudents WHERE Id_College=${C} AND SYear=2027`,
    ),
  );

  console.log("\n=== Backup recency — latest activity dates ===");
  console.table(
    await darsQuery(
      `SELECT 'Isc_Parent.EditDate' AS src, MAX(EditDate) AS latest FROM Isc_Parent WHERE Id_College=${C}
       UNION ALL SELECT 'Isc_Student.EditDate', MAX(EditDate) FROM Isc_Student WHERE Id_College=${C}
       UNION ALL SELECT 'Fct_Factures.Quand', MAX(Quand) FROM Fct_Factures_Entete WHERE Id_College=${C}`,
    ),
  );
  await closeDars();
}
main().catch(async (e) => { console.error(e); await closeDars(); process.exit(1); });
