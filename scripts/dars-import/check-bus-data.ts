/**
 * Read-only: the finalized bus assignment in Dars — Isc_StudentClass
 * (Id_BusReg / Id_BusRegTown / BusDetails) + the bus & town lookup tables.
 */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  // Fill rates per SYear on Isc_StudentClass.
  const fill = await darsQuery<Record<string, unknown>>(
    `SELECT SYear, COUNT(*) AS rows,
            SUM(CASE WHEN Id_BusReg IS NOT NULL AND Id_BusReg > 0 THEN 1 ELSE 0 END) AS withBus,
            SUM(CASE WHEN Id_BusRegTown IS NOT NULL AND Id_BusRegTown > 0 THEN 1 ELSE 0 END) AS withTown,
            SUM(CASE WHEN BusDetails IS NOT NULL AND LTRIM(RTRIM(BusDetails)) <> '' THEN 1 ELSE 0 END) AS withDetails
     FROM Isc_StudentClass WHERE Id_College=${C}
     GROUP BY SYear ORDER BY SYear DESC`,
  );
  console.log("Isc_StudentClass bus fill per SYear:");
  console.table(fill);

  // Bus lookup table candidates.
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE' AND (LOWER(TABLE_NAME) LIKE '%bus%' OR LOWER(TABLE_NAME) LIKE '%trajet%')
     ORDER BY TABLE_NAME`,
  );
  console.log("\nBus-ish tables:");
  for (const t of tbls) {
    const n = await darsQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM [${t.TABLE_NAME}]`).catch(() => [{ n: -1 }]);
    console.log(`  ${t.TABLE_NAME} (rows=${n[0]?.n})`);
    if ((n[0]?.n ?? 0) > 0) {
      const cols = await darsQuery<{ COLUMN_NAME: string }>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t.TABLE_NAME}' ORDER BY ORDINAL_POSITION`,
      );
      console.log(`     cols: ${cols.map((c) => c.COLUMN_NAME).join(", ")}`);
      const sample = await darsQuery<Record<string, unknown>>(`SELECT TOP 8 * FROM [${t.TABLE_NAME}]`).catch(() => []);
      for (const r of sample) console.log("     ", JSON.stringify(r));
    }
  }

  // Sample of current-year assignments with student names + BusDetails.
  const sample = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 12 s.FirstName, s.LastName, sc.SYear, sc.Id_BusReg, sc.Id_BusRegTown, sc.BusDetails
     FROM Isc_StudentClass sc
     JOIN Isc_Student s ON sc.ID_Student=s.ID_Student AND s.Id_College=${C}
     WHERE sc.Id_College=${C} AND sc.SYear=2026
       AND (sc.Id_BusReg > 0 OR sc.BusDetails IS NOT NULL)
     ORDER BY sc.ID`,
  );
  console.log("\nSample 2025-2026 assignments:");
  for (const r of sample)
    console.log(`  ${r.FirstName} ${r.LastName}: bus=${r.Id_BusReg} town=${r.Id_BusRegTown} details="${r.BusDetails ?? ""}"`);

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
