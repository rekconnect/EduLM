import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  // 1. BUS / TRANSPORT — per enrollment in Isc_StudentClass
  console.log("=== Bus registration in current year (SYear 2026) ===");
  console.table(
    await darsQuery(
      `SELECT
         COUNT(*) AS enrollments,
         SUM(CASE WHEN Id_BusReg IS NOT NULL AND Id_BusReg <> 0 THEN 1 ELSE 0 END) AS with_bus_reg,
         SUM(CASE WHEN BusDetails IS NOT NULL AND LTRIM(RTRIM(BusDetails)) <> '' THEN 1 ELSE 0 END) AS with_bus_details
       FROM Isc_StudentClass WHERE Id_College = ${C} AND SYear = 2026 AND Registered = 1`,
    ),
  );

  // 2. Isc_ModifStudents — the rich parent-submitted table
  console.log("\n=== Isc_ModifStudents: columns present ===");
  const cols = await darsQuery<{ name: string }>(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Isc_ModifStudents' ORDER BY ORDINAL_POSITION`,
  );
  console.log(cols.map((c) => c.name).join(", "));

  console.log("\n=== Isc_ModifStudents: row counts by SYear (if present) ===");
  try {
    console.table(
      await darsQuery(
        `SELECT SYear, COUNT(*) AS n FROM Isc_ModifStudents WHERE Id_College = ${C} GROUP BY SYear ORDER BY SYear DESC`,
      ),
    );
  } catch {
    console.log("(no SYear column)");
    console.table(await darsQuery(`SELECT COUNT(*) AS total FROM Isc_ModifStudents WHERE Id_College = ${C}`));
  }

  console.log("\n=== Isc_ModifStudents: transport/snack/meal/photo distribution ===");
  try {
    console.table(
      await darsQuery(
        `SELECT
           SUM(CASE WHEN BusRegistered = 1 THEN 1 ELSE 0 END) AS busRegistered,
           SUM(CASE WHEN HasSnack = 1 THEN 1 ELSE 0 END) AS hasSnack,
           SUM(CASE WHEN HasHotMeal = 1 THEN 1 ELSE 0 END) AS hasHotMeal,
           SUM(CASE WHEN AllowPublishImages = 1 THEN 1 ELSE 0 END) AS allowImages,
           SUM(CASE WHEN AllowPublishToSocialMedia = 1 THEN 1 ELSE 0 END) AS allowSocial,
           COUNT(*) AS total
         FROM Isc_ModifStudents WHERE Id_College = ${C}`,
      ),
    );
  } catch (e) {
    console.log("dist query failed:", (e as Error).message.split("\n")[0]);
  }

  console.log("\n=== Isc_ModifStudents: 2 sample rows ===");
  console.table(
    await darsQuery(
      `SELECT TOP 2 * FROM Isc_ModifStudents WHERE Id_College = ${C} ORDER BY ID DESC`,
    ),
  );

  await closeDars();
}
main().catch(async (e) => { console.error(e); await closeDars(); process.exit(1); });
