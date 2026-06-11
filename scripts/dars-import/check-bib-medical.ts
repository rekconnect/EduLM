/**
 * Read-only: inventory the Dars LIBRARY (Bib_*) and MEDICAL/infirmary modules —
 * which tables exist, how much real data they hold, and the key columns — to
 * scope what an EduLM equivalent would need.
 */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  // ── All candidate tables ──
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE' AND (
       TABLE_NAME LIKE 'Bib[_]%'
       OR LOWER(TABLE_NAME) LIKE '%medic%' OR LOWER(TABLE_NAME) LIKE '%sante%'
       OR LOWER(TABLE_NAME) LIKE '%infirm%' OR LOWER(TABLE_NAME) LIKE '%vaccin%'
       OR LOWER(TABLE_NAME) LIKE '%nurse%' OR LOWER(TABLE_NAME) LIKE '%health%'
       OR LOWER(TABLE_NAME) LIKE '%clinic%'
     )
     ORDER BY TABLE_NAME`,
  );

  console.log("=== Library (Bib_*) + medical tables, with row counts ===");
  const interesting: string[] = [];
  for (const t of tbls) {
    const n = await darsQuery<{ n: number }>(
      `SELECT COUNT(*) AS n FROM [${t.TABLE_NAME}]`,
    ).catch(() => [{ n: -1 }]);
    const rows = n[0]?.n ?? -1;
    console.log(`  ${t.TABLE_NAME.padEnd(36)} rows=${rows}`);
    if (rows > 0) interesting.push(t.TABLE_NAME);
  }

  // ── Columns of the non-empty tables ──
  for (const t of interesting) {
    const cols = await darsQuery<{ COLUMN_NAME: string; DATA_TYPE: string }>(
      `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`,
    );
    console.log(`\n=== ${t} (${cols.length} cols) ===`);
    console.log("   " + cols.map((c) => c.COLUMN_NAME).join(", "));
  }

  // ── Medical columns that might live on student tables instead ──
  console.log("\n=== Medical-ish columns on any table ===");
  const medCols = await darsQuery<{ TABLE_NAME: string; COLUMN_NAME: string }>(
    `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE LOWER(COLUMN_NAME) LIKE '%medic%' OR LOWER(COLUMN_NAME) LIKE '%vaccin%'
        OR LOWER(COLUMN_NAME) LIKE '%allerg%' OR LOWER(COLUMN_NAME) LIKE '%sante%'
        OR LOWER(COLUMN_NAME) LIKE '%blood%' OR LOWER(COLUMN_NAME) LIKE '%sang%'
        OR LOWER(COLUMN_NAME) LIKE '%maladie%' OR LOWER(COLUMN_NAME) LIKE '%disease%'
     ORDER BY TABLE_NAME, COLUMN_NAME`,
  );
  let last = "";
  for (const c of medCols) {
    if (c.TABLE_NAME !== last) {
      console.log(`  [${c.TABLE_NAME}]`);
      last = c.TABLE_NAME;
    }
    console.log(`     ${c.COLUMN_NAME}`);
  }

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});
