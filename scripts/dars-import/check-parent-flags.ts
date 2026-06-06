import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  console.log("=== Isc_Parent boolean flags (College 108) ===");
  console.table(
    await darsQuery(
      `SELECT
         SUM(CASE WHEN IsDead = 1 THEN 1 ELSE 0 END)        AS deceased,
         SUM(CASE WHEN SecondMarriage = 1 THEN 1 ELSE 0 END) AS second_marriage,
         SUM(CASE WHEN Divorced = 1 THEN 1 ELSE 0 END)       AS divorced,
         SUM(CASE WHEN Actual = 1 THEN 1 ELSE 0 END)         AS actual_true,
         SUM(CASE WHEN Actual = 0 THEN 1 ELSE 0 END)         AS actual_false,
         COUNT(*) AS total
       FROM Isc_Parent WHERE Id_College = ${C}`,
    ),
  );

  console.log("\n=== Sample deceased / second-marriage parents ===");
  console.table(
    await darsQuery(
      `SELECT TOP 8 ID_Parent, FirstName, LastName, IsDead, SecondMarriage, Divorced, Actual
       FROM Isc_Parent WHERE Id_College = ${C} AND (IsDead = 1 OR SecondMarriage = 1)
       ORDER BY ID_Parent`,
    ),
  );

  await closeDars();
}
main().catch(async (e) => { console.error(e); await closeDars(); process.exit(1); });
