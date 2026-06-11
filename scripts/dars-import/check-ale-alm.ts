/**
 * Read-only: what are ALE / ALM on Isc_TmpStudent? Show types, value
 * distribution, how they relate to IsExclArabic, and whether they're per-SYear.
 */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  console.log("=== Column types (any Isc table with ALE/ALM/Arabic/Sport) ===");
  const cols = await darsQuery<Record<string, unknown>>(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME LIKE 'Isc[_]%'
       AND (COLUMN_NAME IN ('ALE','ALM') OR LOWER(COLUMN_NAME) LIKE '%arab%' OR LOWER(COLUMN_NAME) LIKE '%excl%' OR LOWER(COLUMN_NAME) LIKE '%langue%' OR LOWER(COLUMN_NAME) LIKE '%lang%')
     ORDER BY TABLE_NAME, COLUMN_NAME`,
  );
  for (const c of cols)
    console.log(`  ${String(c.TABLE_NAME).padEnd(22)} ${String(c.COLUMN_NAME).padEnd(22)} ${c.DATA_TYPE}`);

  console.log("\n=== Isc_TmpStudent ALE/ALM distribution (current year) ===");
  const dist = await darsQuery<Record<string, unknown>>(
    `SELECT SYear,
            COUNT(*) AS total,
            SUM(CASE WHEN ALE=1 THEN 1 ELSE 0 END) AS ale_yes,
            SUM(CASE WHEN ALM=1 THEN 1 ELSE 0 END) AS alm_yes,
            SUM(CASE WHEN ALE IS NULL THEN 1 ELSE 0 END) AS ale_null,
            SUM(CASE WHEN ALM IS NULL THEN 1 ELSE 0 END) AS alm_null
     FROM Isc_TmpStudent WHERE Id_College=${C}
     GROUP BY SYear ORDER BY SYear DESC`,
  ).catch((e) => {
    console.log("  (ALE/ALM not bit? " + (e as Error).message + ")");
    return [];
  });
  console.table(dist);

  console.log("\n=== Sample students with ALE or ALM set ===");
  const sample = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 10 ID_Student, FirstName, LastName, SYear, ALE, ALM
     FROM Isc_TmpStudent WHERE Id_College=${C} AND (ALE=1 OR ALM=1)
     ORDER BY ID_Student`,
  ).catch(() => []);
  for (const r of sample)
    console.log(`   ${r.FirstName} ${r.LastName} (SYear ${r.SYear}): ALE=${r.ALE} ALM=${r.ALM}`);

  console.log("\n=== Isc_Student IsExclArabic / IsExclSport distribution ===");
  const excl = await darsQuery<Record<string, unknown>>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN IsExclArabic=1 THEN 1 ELSE 0 END) AS exclArabic,
            SUM(CASE WHEN IsExclSport=1 THEN 1 ELSE 0 END) AS exclSport
     FROM Isc_Student WHERE Id_College=${C}`,
  ).catch(() => []);
  console.table(excl);

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
