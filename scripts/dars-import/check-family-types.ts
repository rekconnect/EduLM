import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
async function main() {
  console.log("=== Isc_FamilyType lookup ===");
  console.table(await darsQuery(`SELECT ID, FamilyType, DiscountPerc FROM Isc_FamilyType WHERE Id_College=${C} ORDER BY ID`));
  console.log("=== Id_FamilyType usage in Isc_Parent ===");
  console.table(await darsQuery(`SELECT Id_FamilyType, COUNT(*) AS n FROM Isc_Parent WHERE Id_College=${C} GROUP BY Id_FamilyType ORDER BY Id_FamilyType`));
  await closeDars();
}
main().catch(async (e) => { console.error(e); await closeDars(); process.exit(1); });
