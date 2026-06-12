/** Read-only: towns/villages tables — does Id_Quartier point there? */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE' AND (
       TABLE_NAME LIKE '%Town%' OR TABLE_NAME LIKE '%Village%' OR TABLE_NAME LIKE '%Qaza%'
       OR TABLE_NAME LIKE '%Ville%' OR TABLE_NAME LIKE '%Localite%' OR TABLE_NAME LIKE '%Region%')
     ORDER BY TABLE_NAME`,
  );
  console.log("Tables:", tbls.map((t) => t.TABLE_NAME).join(", ") || "(none)");
  for (const t of tbls) {
    const cols = await darsQuery<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t.TABLE_NAME}' ORDER BY ORDINAL_POSITION`,
    );
    console.log(`\n${t.TABLE_NAME}: ${cols.map((c) => c.COLUMN_NAME).join(", ")}`);
    if (cols.some((c) => c.COLUMN_NAME === "ID")) {
      const rows = await darsQuery<Record<string, unknown>>(
        `SELECT * FROM [${t.TABLE_NAME}] WHERE ID IN (54,341,611,1414)`,
      ).catch(() => []);
      for (const r of rows) console.log("  →", JSON.stringify(r).slice(0, 200));
    }
  }
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
