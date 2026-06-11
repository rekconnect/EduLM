/** Read-only: inventory the Med_* (infirmary) tables — row counts + columns. */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE 'Med[_]%'
     ORDER BY TABLE_NAME`,
  );
  console.log("=== Med_* tables ===");
  const interesting: string[] = [];
  for (const t of tbls) {
    const n = await darsQuery<{ n: number }>(
      `SELECT COUNT(*) AS n FROM [${t.TABLE_NAME}]`,
    ).catch(() => [{ n: -1 }]);
    const rows = n[0]?.n ?? -1;
    console.log(`  ${t.TABLE_NAME.padEnd(32)} rows=${rows}`);
    if (rows > 0) interesting.push(t.TABLE_NAME);
  }
  for (const t of interesting) {
    const cols = await darsQuery<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`,
    );
    console.log(`\n=== ${t} (${cols.length} cols) ===`);
    console.log("   " + cols.map((c) => c.COLUMN_NAME).join(", "));
  }
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
