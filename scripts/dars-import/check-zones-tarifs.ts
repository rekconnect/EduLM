/**
 * Read-only: does the Dars DB hold the transport ZONE numbers and TARIFF grid?
 * Scans tables named like zone/tarif/Trs_* (+ station/quartier), dumps the
 * small non-empty ones.
 */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE' AND (
       LOWER(TABLE_NAME) LIKE '%zone%' OR LOWER(TABLE_NAME) LIKE '%tarif%'
       OR TABLE_NAME LIKE 'Trs[_]%' OR LOWER(TABLE_NAME) LIKE '%station%'
       OR LOWER(TABLE_NAME) LIKE '%quartier%'
     )
     ORDER BY TABLE_NAME`,
  );
  for (const t of tbls) {
    const n = await darsQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM [${t.TABLE_NAME}]`).catch(() => [{ n: -1 }]);
    const rows = n[0]?.n ?? -1;
    console.log(`${t.TABLE_NAME}  rows=${rows}`);
    if (rows > 0 && rows <= 60) {
      const cols = await darsQuery<{ COLUMN_NAME: string }>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t.TABLE_NAME}' ORDER BY ORDINAL_POSITION`,
      );
      console.log("   cols: " + cols.map((c) => c.COLUMN_NAME).join(", "));
      const sample = await darsQuery<Record<string, unknown>>(`SELECT * FROM [${t.TABLE_NAME}]`).catch(() => []);
      for (const r of sample.slice(0, 30)) console.log("   ", JSON.stringify(r).slice(0, 170));
    } else if (rows > 60) {
      const cols = await darsQuery<{ COLUMN_NAME: string }>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t.TABLE_NAME}' ORDER BY ORDINAL_POSITION`,
      );
      console.log("   cols: " + cols.map((c) => c.COLUMN_NAME).join(", "));
      const sample = await darsQuery<Record<string, unknown>>(`SELECT TOP 6 * FROM [${t.TABLE_NAME}]`).catch(() => []);
      for (const r of sample) console.log("   ", JSON.stringify(r).slice(0, 170));
    }
  }
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
