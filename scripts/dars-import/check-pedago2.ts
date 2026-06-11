/**
 * Read-only: full structure + data of Isc_TmpClasse_Choices — the pedagogical
 * choices (langues / options / spécialités) per student per year.
 */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  const cols = await darsQuery<{ COLUMN_NAME: string; DATA_TYPE: string }>(
    `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME='Isc_TmpClasse_Choices' ORDER BY ORDINAL_POSITION`,
  );
  console.log(`=== Isc_TmpClasse_Choices — ${cols.length} columns ===`);
  for (const c of cols) console.log(`   ${c.COLUMN_NAME} (${c.DATA_TYPE})`);

  const n = await darsQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM Isc_TmpClasse_Choices`).catch(() => [{ n: -1 }]);
  console.log(`\nRows: ${n[0]?.n}`);

  // Per-SYear count (if SYear exists).
  const hasSYear = cols.some((c) => c.COLUMN_NAME.toLowerCase() === "syear");
  if (hasSYear) {
    const per = await darsQuery<Record<string, unknown>>(
      `SELECT SYear, COUNT(*) AS n FROM Isc_TmpClasse_Choices GROUP BY SYear ORDER BY SYear DESC`,
    ).catch(() => []);
    console.log("\nPer SYear:");
    console.table(per);
  }

  console.log("\n=== Sample rows (only set/true bit columns shown) ===");
  const sample = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 8 * FROM Isc_TmpClasse_Choices ${hasSYear ? "ORDER BY SYear DESC" : ""}`,
  ).catch(() => []);
  for (const row of sample) {
    const set = Object.entries(row)
      .filter(([, v]) => v === true || v === 1)
      .map(([k]) => k);
    const idCols = Object.entries(row)
      .filter(([k]) => /id|student|syear|class/i.test(k))
      .map(([k, v]) => `${k}=${v}`);
    console.log(`   ${idCols.join(" ")}  →  [${set.join(", ")}]`);
  }

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
