import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  // 1. Tariff types — is cantine / transport / collation a billed service?
  console.log("=== Fct_Type_Tarif (billed service types) ===");
  console.table(
    await darsQuery(
      `SELECT ID, Code, label, description FROM Fct_Type_Tarif WHERE Id_College=${C} ORDER BY Rank`,
    ),
  );

  // 2. Isc_StudentClass — full historical enrollment coverage
  console.log("\n=== Enrollment rows per SYear (historical) ===");
  console.table(
    await darsQuery(
      `SELECT SYear, COUNT(*) AS enrollments FROM Isc_StudentClass WHERE Id_College=${C} GROUP BY SYear ORDER BY SYear DESC`,
    ),
  );

  // 3. How many years of history does a typical student have?
  console.log("\n=== Students by number of enrolled years ===");
  console.table(
    await darsQuery(
      `SELECT years_count, COUNT(*) AS students FROM (
         SELECT ID_Student, COUNT(DISTINCT SYear) AS years_count
         FROM Isc_StudentClass WHERE Id_College=${C} GROUP BY ID_Student
       ) x GROUP BY years_count ORDER BY years_count DESC`,
    ),
  );

  await closeDars();
}
main().catch(async (e) => { console.error(e); await closeDars(); process.exit(1); });
