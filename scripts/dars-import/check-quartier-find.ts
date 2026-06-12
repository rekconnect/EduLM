/** Read-only: find the real quartier table (referenced by Trs_Eleve_Station.Id_Quartier). */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME LIKE '%uartier%' OR COLUMN_NAME LIKE '%uartier%'
     ORDER BY TABLE_NAME`,
  );
  console.log("Candidates:", tbls.map((t) => t.TABLE_NAME).join(", "));
  for (const t of tbls) {
    const cols = await darsQuery<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t.TABLE_NAME}' ORDER BY ORDINAL_POSITION`,
    );
    console.log(`\n${t.TABLE_NAME}: ${cols.map((c) => c.COLUMN_NAME).join(", ")}`);
    if (/uartier/i.test(t.TABLE_NAME)) {
      const sample = await darsQuery<Record<string, unknown>>(`SELECT TOP 5 * FROM [${t.TABLE_NAME}]`).catch(() => []);
      for (const r of sample) console.log("  ", JSON.stringify(r).slice(0, 200));
      // Resolve our 4 ids if this table has an ID col.
      if (cols.some((c) => c.COLUMN_NAME === "ID")) {
        const rows = await darsQuery<Record<string, unknown>>(
          `SELECT * FROM [${t.TABLE_NAME}] WHERE ID IN (1414, 611, 54, 341)`,
        ).catch(() => []);
        console.log("  → ids 1414/611/54/341:");
        for (const r of rows) console.log("    ", JSON.stringify(r).slice(0, 200));
      }
    }
  }
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
