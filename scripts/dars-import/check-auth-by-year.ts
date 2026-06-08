/**
 * Read-only: do the photo-authorization columns carry data in Isc_ModifStudents,
 * and for which SYear? "set" = column is NOT null (the parent answered);
 * "yes" = answered Oui. If a year shows 0 set, those fields were excluded from
 * that year's (re-)registration.
 *   npx tsx scripts/dars-import/check-auth-by-year.ts
 */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  console.log("Isc_ModifStudents — authorization fill rate by SYear:\n");
  console.table(
    await darsQuery(
      `SELECT SYear,
              COUNT(*) AS rows,
              SUM(CASE WHEN AllowPublishImages       IS NOT NULL THEN 1 ELSE 0 END) AS site_set,
              SUM(CASE WHEN AllowPublishToSouvenirBook IS NOT NULL THEN 1 ELSE 0 END) AS livre_set,
              SUM(CASE WHEN AllowPublishToSocialMedia IS NOT NULL THEN 1 ELSE 0 END) AS reseaux_set,
              SUM(CASE WHEN AllowPublishAudio          IS NOT NULL THEN 1 ELSE 0 END) AS radio_set,
              SUM(CASE WHEN AllowPublishToSouvenirBook = 1 THEN 1 ELSE 0 END)         AS livre_yes
       FROM Isc_ModifStudents WHERE Id_College = ${C}
       GROUP BY SYear ORDER BY SYear DESC`,
    ),
  );

  // Also: snack/meal/bus fill rate by year, for comparison.
  console.log("\nFor comparison — services fill rate by SYear:");
  console.table(
    await darsQuery(
      `SELECT SYear,
              COUNT(*) AS rows,
              SUM(CASE WHEN HasSnack      IS NOT NULL THEN 1 ELSE 0 END) AS snack_set,
              SUM(CASE WHEN HasHotMeal    IS NOT NULL THEN 1 ELSE 0 END) AS meal_set,
              SUM(CASE WHEN BusRegistered IS NOT NULL THEN 1 ELSE 0 END) AS bus_set
       FROM Isc_ModifStudents WHERE Id_College = ${C}
       GROUP BY SYear ORDER BY SYear DESC`,
    ),
  );

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
